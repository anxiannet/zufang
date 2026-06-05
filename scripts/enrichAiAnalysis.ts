import { supabaseRequest } from "../src/db/pool";

type StandardTag =
  | "QUIET"
  | "STUDY_FRIENDLY"
  | "LOW_DENSITY"
  | "PRIVATE"
  | "FLEXIBLE_ACCESS"
  | "NIGHT_SHIFT_FRIENDLY"
  | "FEMALE_FRIENDLY"
  | "SOCIAL_FRIENDLY"
  | "INTROVERT_FRIENDLY"
  | "WORKING_PROFESSIONAL_FRIENDLY";

type ListingIndexAiInput = {
  id: string;
  title: string;
  summary: string | null;
  body_text: string | null;
  search_text: string | null;
  price: number | null;
  gender_preference: string | null;
  room_type: string | null;
  normalized_room_type: string | null;
  semantic_tags: string[] | null;
  tags: string[] | null;
};

type ExistingAnalysis = {
  listing_index_id: string;
  semantic_tags_ai: string[] | null;
  summary_ai: string | null;
};

type AiAnalysis = {
  semantic_tags_ai: StandardTag[];
  quiet_score: number;
  study_friendly_score: number;
  density_score: number;
  privacy_score: number;
  night_shift_score: number;
  female_friendly_score: number;
  social_score: number;
  household_density_score: number;
  summary_ai: string;
  recommendation_reasons: string[];
  risk_notes: string[];
  analysis_payload: Record<string, unknown>;
  model_name: string;
  model_version: string;
  analysis_source: string;
};

const STANDARD_TAGS: StandardTag[] = [
  "QUIET",
  "STUDY_FRIENDLY",
  "LOW_DENSITY",
  "PRIVATE",
  "FLEXIBLE_ACCESS",
  "NIGHT_SHIFT_FRIENDLY",
  "FEMALE_FRIENDLY",
  "SOCIAL_FRIENDLY",
  "INTROVERT_FRIENDLY",
  "WORKING_PROFESSIONAL_FRIENDLY"
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const FALLBACK_MODEL = "rule-fallback";
const AI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const listings = await fetchListings(options.limit);
  const existing = await fetchExistingAnalyses(listings.map((listing) => listing.id));

  const summary = {
    selected_count: listings.length,
    success_count: 0,
    failed_count: 0,
    skipped_count: 0,
    dry_run: options.dryRun,
    force: options.force,
    model: process.env.OPENAI_API_KEY ? AI_MODEL : FALLBACK_MODEL
  };

  for (const listing of listings) {
    const current = existing.get(listing.id);
    if (!shouldUpdate(current, options.force)) {
      summary.skipped_count += 1;
      continue;
    }

    try {
      const analysis = process.env.OPENAI_API_KEY
        ? await analyzeWithOpenAi(listing)
        : buildRuleFallbackAnalysis(listing);

      if (!options.dryRun) await upsertAnalysis(listing.id, analysis);
      summary.success_count += 1;
    } catch (error) {
      try {
        const fallback = buildRuleFallbackAnalysis(listing, errorMessage(error));
        if (!options.dryRun) await upsertAnalysis(listing.id, fallback);
        summary.success_count += 1;
      } catch (fallbackError) {
        summary.failed_count += 1;
        console.error("Failed to enrich AI analysis", {
          listing_index_id: listing.id,
          reason: errorMessage(fallbackError)
        });
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed_count > 0) process.exitCode = 1;
}

async function fetchListings(limit: number): Promise<ListingIndexAiInput[]> {
  const params = new URLSearchParams({
    select: "id,title,summary,body_text,search_text,price,gender_preference,room_type,normalized_room_type,semantic_tags,tags",
    status: "eq.active",
    order: "indexed_at.desc.nullslast",
    limit: String(limit)
  });
  return supabaseRequest<ListingIndexAiInput[]>(`listing_indexes?${params.toString()}`);
}

async function fetchExistingAnalyses(ids: string[]): Promise<Map<string, ExistingAnalysis>> {
  if (ids.length === 0) return new Map();
  const rows = await supabaseRequest<ExistingAnalysis[]>(
    `listing_ai_analysis?select=listing_index_id,semantic_tags_ai,summary_ai&listing_index_id=in.(${ids.join(",")})`
  );
  return new Map(rows.map((row) => [row.listing_index_id, row]));
}

function shouldUpdate(current: ExistingAnalysis | undefined, force: boolean): boolean {
  if (force) return true;
  if (!current) return true;
  if (!current.semantic_tags_ai || current.semantic_tags_ai.length === 0) return true;
  if (!current.summary_ai || current.summary_ai.trim().length === 0) return true;
  return false;
}

async function analyzeWithOpenAi(listing: ListingIndexAiInput): Promise<AiAnalysis> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      instructions: [
        "Analyze Singapore rental listings for tenant fit.",
        "Return conservative 1-5 scores. If evidence is weak, use 2 or 3, not 4 or 5.",
        `semantic_tags_ai must only contain these tags: ${STANDARD_TAGS.join(", ")}.`,
        "Do not invent tags. Keep Chinese summaries concise."
      ].join("\n"),
      input: JSON.stringify(buildAnalysisInput(listing)),
      text: {
        format: {
          type: "json_schema",
          name: "listing_ai_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "semantic_tags_ai",
              "quiet_score",
              "study_friendly_score",
              "density_score",
              "privacy_score",
              "night_shift_score",
              "female_friendly_score",
              "social_score",
              "household_density_score",
              "summary_ai",
              "recommendation_reasons",
              "risk_notes"
            ],
            properties: {
              semantic_tags_ai: { type: "array", items: { type: "string", enum: STANDARD_TAGS } },
              quiet_score: scoreSchema(),
              study_friendly_score: scoreSchema(),
              density_score: scoreSchema(),
              privacy_score: scoreSchema(),
              night_shift_score: scoreSchema(),
              female_friendly_score: scoreSchema(),
              social_score: scoreSchema(),
              household_density_score: scoreSchema(),
              summary_ai: { type: "string" },
              recommendation_reasons: { type: "array", items: { type: "string" } },
              risk_notes: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    })
  });

  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const parsed = JSON.parse(extractOutputText(payload));
  const normalized = normalizeAnalysis(parsed);

  return {
    ...normalized,
    analysis_payload: { input: buildAnalysisInput(listing), raw_model_output: parsed },
    model_name: "openai",
    model_version: AI_MODEL,
    analysis_source: "openai_responses"
  };
}

function buildRuleFallbackAnalysis(listing: ListingIndexAiInput, aiError?: string): AiAnalysis {
  const text = [
    listing.title,
    listing.summary,
    listing.body_text,
    listing.search_text,
    listing.gender_preference,
    listing.room_type,
    listing.normalized_room_type,
    (listing.semantic_tags ?? []).join(" "),
    (listing.tags ?? []).join(" ")
  ].filter(Boolean).join("\n");

  const tags = new Set<StandardTag>();
  const reasons: string[] = [];
  const risks: string[] = [];
  const scores = {
    quiet_score: 3,
    study_friendly_score: 3,
    density_score: 3,
    privacy_score: 3,
    night_shift_score: 3,
    female_friendly_score: 3,
    social_score: 3,
    household_density_score: 3
  };

  if (/安静|不吵|清静/.test(text)) {
    tags.add("QUIET");
    scores.quiet_score = 4;
    reasons.push("文本明确提到安静或不吵。");
  }
  if (/适合学习|学生/.test(text)) {
    tags.add("STUDY_FRIENDLY");
    scores.study_friendly_score = 4;
    reasons.push("文本提到学生或适合学习。");
  }
  if (/出入自由|自由出入|晚归/.test(text)) {
    tags.add("FLEXIBLE_ACCESS");
    scores.night_shift_score = 4;
    reasons.push("文本提到出入自由或晚归。");
  }
  if (/夜班/.test(text)) {
    tags.add("NIGHT_SHIFT_FRIENDLY");
    scores.night_shift_score = 4;
    reasons.push("文本提到夜班。");
  }
  if (listing.gender_preference === "female_only" || listing.gender_preference === "female_preferred") {
    tags.add("FEMALE_FRIENDLY");
    scores.female_friendly_score = 4;
    reasons.push("性别偏好显示更适合女生。");
  }
  if (/人少|少人|低密度|不多人/.test(text)) {
    tags.add("LOW_DENSITY");
    scores.density_score = 4;
    scores.household_density_score = 4;
    reasons.push("文本暗示合住人数较少。");
  }
  if (/主人房|独立厕所|独卫|套房/.test(text)) {
    tags.add("PRIVATE");
    scores.privacy_score = 4;
    reasons.push("文本提到主人房或独立厕所。");
  }

  if (reasons.length === 0) risks.push("结构化信息不足，评分保持中性。");
  if (aiError) risks.push(`AI 分析失败，已使用规则 fallback: ${aiError.slice(0, 160)}`);

  return {
    semantic_tags_ai: [...tags],
    ...scores,
    summary_ai: buildFallbackSummary(listing),
    recommendation_reasons: reasons,
    risk_notes: risks,
    analysis_payload: { input: buildAnalysisInput(listing), ai_error: aiError ?? null, fallback_rules_version: "2026-06-05" },
    model_name: FALLBACK_MODEL,
    model_version: "2026-06-05",
    analysis_source: aiError ? "rule_fallback_after_ai_error" : "rule_fallback"
  };
}

async function upsertAnalysis(listingIndexId: string, analysis: AiAnalysis): Promise<void> {
  await supabaseRequest("listing_ai_analysis?on_conflict=listing_index_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      listing_index_id: listingIndexId,
      ...analysis,
      updated_at: new Date().toISOString()
    })
  });
}

function normalizeAnalysis(value: any): Omit<AiAnalysis, "analysis_payload" | "model_name" | "model_version" | "analysis_source"> {
  return {
    semantic_tags_ai: uniqueStandardTags(value.semantic_tags_ai),
    quiet_score: clampScore(value.quiet_score),
    study_friendly_score: clampScore(value.study_friendly_score),
    density_score: clampScore(value.density_score),
    privacy_score: clampScore(value.privacy_score),
    night_shift_score: clampScore(value.night_shift_score),
    female_friendly_score: clampScore(value.female_friendly_score),
    social_score: clampScore(value.social_score),
    household_density_score: clampScore(value.household_density_score),
    summary_ai: String(value.summary_ai ?? "").trim().slice(0, 500) || "暂无足够信息生成摘要。",
    recommendation_reasons: normalizeTextArray(value.recommendation_reasons),
    risk_notes: normalizeTextArray(value.risk_notes)
  };
}

function uniqueStandardTags(value: unknown): StandardTag[] {
  const tags = Array.isArray(value) ? value : [];
  return [...new Set(tags.filter((tag): tag is StandardTag => STANDARD_TAGS.includes(tag as StandardTag)))];
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
}

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(Math.round(parsed), 1), 5);
}

function scoreSchema() {
  return { type: "integer", minimum: 1, maximum: 5 };
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const text = payload?.output?.flatMap((item: any) => item?.content ?? [])
    .map((content: any) => content?.text)
    .filter(Boolean)
    .join("");
  if (!text) throw new Error("OpenAI response missing output text");
  return text;
}

function buildAnalysisInput(listing: ListingIndexAiInput) {
  return {
    title: listing.title,
    summary: listing.summary,
    body_text: listing.body_text,
    search_text: listing.search_text,
    price: listing.price,
    gender_preference: listing.gender_preference,
    room_type: listing.room_type,
    normalized_room_type: listing.normalized_room_type,
    semantic_tags: listing.semantic_tags ?? [],
    tags: listing.tags ?? []
  };
}

function buildFallbackSummary(listing: ListingIndexAiInput): string {
  const base = listing.summary || listing.title || listing.search_text || "";
  return String(base).replace(/\s+/g, " ").trim().slice(0, 220) || "暂无足够信息生成摘要。";
}

function parseArgs(args: string[]) {
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--force") force = true;
    if (arg === "--limit") limit = clampLimit(args[index + 1]);
    if (arg.startsWith("--limit=")) limit = clampLimit(arg.slice("--limit=".length));
  }

  return { limit, dryRun, force };
}

function clampLimit(value: string | undefined): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error("Failed to enrich AI analysis", error);
  process.exit(1);
});
