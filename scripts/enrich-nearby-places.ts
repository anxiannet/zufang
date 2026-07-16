import { createClient } from "@supabase/supabase-js";
import { enrichNearbyPlacesCache } from "../src/services/nearbyPlaces";
import { config } from "../src/utils/config";

function readValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }

  const args = process.argv.slice(2);
  const limit = Number.parseInt(readValue(args, "--limit") ?? "20", 10);
  const listingId = readValue(args, "--listing-id");
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const summary = await enrichNearbyPlacesCache(supabase, { limit, listingId, dryRun, force });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed_count > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
