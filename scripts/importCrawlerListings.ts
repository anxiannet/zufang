import { createClient } from "@supabase/supabase-js";
import { processCrawlerListings } from "../src/import/processCrawlerListings";
import { config } from "../src/utils/config";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log("Crawler listing import started");
  const { summary, results } = await processCrawlerListings(supabase, options);

  if (options.dryRun) {
    for (const result of results) console.log(JSON.stringify(result, null, 2));
  }

  console.log(`Fetched: ${summary.fetched}`);
  console.log(`Created candidates: ${summary.created_candidates}`);
  console.log(`Needs review: ${summary.needs_review}`);
  console.log(`Parsed: ${summary.parsed}`);
  console.log(`Rejected: ${summary.rejected}`);
  console.log(`Duplicate: ${summary.duplicate}`);
  console.log(`Failed: ${summary.failed}`);
  console.log("Done");
}

function parseArgs(args: string[]): { limit: number; dryRun: boolean; source?: string } {
  let limit = 50;
  let dryRun = false;
  let source: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dry-run") dryRun = true;
    if (args[index] === "--limit") limit = normalizeLimit(args[index + 1]);
    if (args[index] === "--source") source = args[index + 1]?.trim() || undefined;
  }

  return { limit, dryRun, source };
}

function normalizeLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 500);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
