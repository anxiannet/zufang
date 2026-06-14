import { maintainStaleListings } from "../src/crawler/staleListingMaintenance";
import { validateConfig } from "../src/utils/config";

async function main(): Promise<void> {
  validateConfig();
  const summary = await maintainStaleListings({ allCandidates: true });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
