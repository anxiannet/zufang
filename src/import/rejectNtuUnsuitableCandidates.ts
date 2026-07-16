import type { SupabaseClient } from "@supabase/supabase-js";
import { assessNtuSuitability } from "../../lib/ntuSuitability";

type CandidateRow = {
  id: string;
  candidate_no: number | null;
  parsed_title: string | null;
  parsed_description_clean: string | null;
  parsed_postal_code: string | null;
  parsed_area: string | null;
  parsed_mrt: string | null;
  parse_warnings: string[] | null;
};

export type RejectNtuUnsuitableSummary = {
  scanned: number;
  rejected: number;
  dry_run: boolean;
  results: Array<{
    id: string;
    candidate_no: number | null;
    title: string | null;
    postal_code: string | null;
    reason: string;
  }>;
};

export async function rejectNtuUnsuitableCandidates(
  supabase: SupabaseClient,
  options: { limit?: number; dryRun?: boolean } = {}
): Promise<RejectNtuUnsuitableSummary> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
  const dry_run = Boolean(options.dryRun);
  const { data, error } = await supabase
    .from("listing_import_candidates")
    .select("id,candidate_no,parsed_title,parsed_description_clean,parsed_postal_code,parsed_area,parsed_mrt,parse_warnings")
    .in("import_status", ["parsed", "needs_review"])
    .is("listing_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CandidateRow[];
  const summary: RejectNtuUnsuitableSummary = {
    scanned: rows.length,
    rejected: 0,
    dry_run,
    results: []
  };

  for (const row of rows) {
    const assessment = assessNtuSuitability({
      title: row.parsed_title,
      description: row.parsed_description_clean,
      postalCode: row.parsed_postal_code,
      area: row.parsed_area,
      mrt: row.parsed_mrt
    });
    if (assessment.suitable !== false) continue;

    summary.rejected += 1;
    summary.results.push({
      id: row.id,
      candidate_no: row.candidate_no,
      title: row.parsed_title,
      postal_code: row.parsed_postal_code,
      reason: assessment.reason
    });

    if (dry_run) continue;

    const { error: update_error } = await supabase
      .from("listing_import_candidates")
      .update({
        import_status: "rejected",
        parse_warnings: [...new Set([...(row.parse_warnings ?? []), `不适合 NTU 学生：${assessment.reason}`])],
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .in("import_status", ["parsed", "needs_review"])
      .is("listing_id", null);

    if (update_error) throw new Error(update_error.message);
  }

  return summary;
}
