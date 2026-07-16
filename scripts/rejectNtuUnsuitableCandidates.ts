import { createClient } from "@supabase/supabase-js";
import { rejectNtuUnsuitableCandidates } from "../src/import/rejectNtuUnsuitableCandidates";
import { config } from "../src/utils/config";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const summary = await rejectNtuUnsuitableCandidates(supabase, options);
  for (const result of summary.results) {
    const visible_no = result.candidate_no ? `C${String(result.candidate_no).padStart(4, "0")}` : result.id;
    console.log(`${visible_no} ${result.postal_code ?? "no-postal"} ${result.reason} ${result.title ?? ""}`);
  }

  console.log(`Scanned: ${summary.scanned}`);
  console.log(`Rejected: ${summary.rejected}`);
  console.log(`Dry run: ${summary.dry_run}`);
}

function parseArgs(args: string[]): { limit: number; dryRun: boolean } {
  let limit = 200;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dry-run") dryRun = true;
    if (args[index] === "--limit") limit = normalizeLimit(args[index + 1]);
  }

  return { limit, dryRun };
}

function normalizeLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 200;
  return Math.min(parsed, 1000);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
