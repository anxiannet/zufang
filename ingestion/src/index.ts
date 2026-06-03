import { crawlZufang } from "./crawler/zufangCrawler.js";
import { validateConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  validateConfig();
  await crawlZufang();
}

main()
  .catch((error: unknown) => {
    logger.error("ingestion crashed", { reason: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  });
