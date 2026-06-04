import dotenv from "dotenv";
import { validateConfig } from "../utils/config";
import { logger } from "../utils/logger";
import { indexListings } from "./listingIndexer";

dotenv.config();

async function main(): Promise<void> {
  validateConfig();
  const summary = await indexListings();
  logger.info("local listing index summary", summary);
}

main().catch((error: unknown) => {
  logger.error("listing index crashed", { reason: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
