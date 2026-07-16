import type { SupabaseClient } from "@supabase/supabase-js";
import { extract_candidate_images } from "../../lib/candidateImages";
import { cleanListingText } from "./cleanListingText";
import { decideImportStatus } from "./decideImportStatus";
import {
  createImportCandidate,
  detectDuplicateCandidate,
  getPendingIngestionListings,
  markCandidateDuplicate
} from "./repository";
import { parseListingByRules } from "./ruleParser";
import type { CandidateImportStatus, ParsedListingCandidate } from "./types";

export type ImportRunSummary = {
  fetched: number;
  created_candidates: number;
  needs_review: number;
  parsed: number;
  rejected: number;
  duplicate: number;
  failed: number;
};

export async function processCrawlerListings(
  supabase: SupabaseClient,
  options: { limit?: number; dryRun?: boolean; source?: string } = {}
): Promise<{ summary: ImportRunSummary; results: Array<Record<string, unknown>> }> {
  const rows = await getPendingIngestionListings(supabase, options.limit ?? 50, options.source);
  const summary: ImportRunSummary = {
    fetched: rows.length,
    created_candidates: 0,
    needs_review: 0,
    parsed: 0,
    rejected: 0,
    duplicate: 0,
    failed: 0
  };
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    try {
      const cleaned = cleanListingText(row);
      const parsed = parseListingByRules({
        ingestionId: row.id,
        source: row.source,
        sourceId: row.source_id,
        sourceUrl: row.detail_url ?? row.listing_url,
        title: cleaned.title,
        rawText: cleaned.rawText,
        cleanText: cleaned.cleanText,
        listPrice: row.list_price,
        listContact: row.list_contact
      });
      const valid_images = extract_candidate_images({
        detail_html: row.raw_detail_html,
        list_html: row.list_raw_html,
        page_url: row.detail_url ?? row.listing_url
      });
      const decision = decideImportStatus(parsed, { valid_image_count: valid_images.length });
      const final_parsed: ParsedListingCandidate = { ...parsed, parse_warnings: decision.parse_warnings };

      if (options.dryRun) {
        countStatus(summary, decision.import_status);
        results.push({ ingestion_listing_id: row.id, import_status: decision.import_status, ...final_parsed });
        continue;
      }

      const created = await createImportCandidate(supabase, row, final_parsed, decision.import_status);
      if (created.created) summary.created_candidates += 1;
      if (!created.candidate) continue;

      if (decision.import_status === "rejected") {
        countStatus(summary, decision.import_status);
        results.push({ ingestion_listing_id: row.id, import_status: decision.import_status, candidate_id: created.candidate.id });
        continue;
      }

      const duplicate = await detectDuplicateCandidate(supabase, created.candidate);
      if (duplicate.duplicate) {
        await markCandidateDuplicate(
          supabase,
          created.candidate.id,
          final_parsed.parse_warnings,
          duplicate.reason ?? "疑似重复房源"
        );
        summary.duplicate += 1;
        results.push({ ingestion_listing_id: row.id, import_status: "duplicate", reason: duplicate.reason });
        continue;
      }

      countStatus(summary, decision.import_status);
      results.push({ ingestion_listing_id: row.id, import_status: decision.import_status, candidate_id: created.candidate.id });
    } catch (error) {
      summary.failed += 1;
      results.push({
        ingestion_listing_id: row.id,
        import_status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { summary, results };
}

function countStatus(summary: ImportRunSummary, status: CandidateImportStatus): void {
  if (status === "parsed") summary.parsed += 1;
  if (status === "needs_review") summary.needs_review += 1;
  if (status === "rejected") summary.rejected += 1;
}
