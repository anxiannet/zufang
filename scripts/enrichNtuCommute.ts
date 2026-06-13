import { createClient } from "@supabase/supabase-js";
import { enrichNtuCommuteCache } from "../src/services/ntuCommute";
import { config } from "../src/utils/config";

async function main() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }

  const args = process.argv.slice(2);
  const limit_index = args.indexOf("--limit");
  const postal_index = args.indexOf("--postal-code");
  const limit = limit_index >= 0 ? Number.parseInt(args[limit_index + 1] ?? "20", 10) : 20;
  const postalCode = postal_index >= 0 ? args[postal_index + 1] : undefined;
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const summary = await enrichNtuCommuteCache(supabase, { limit, postalCode, dryRun, force });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed_count > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
