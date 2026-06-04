import { runZufangCrawlJob } from "./crawler/crawlJobRunner";
import { validateConfig } from "./utils/config";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  validateConfig();
  const summary = await runZufangCrawlJob("manual");
  logger.info("local crawl summary", summary);
}

main()
  .catch((error: unknown) => {
    logger.error("ingestion crashed", { reason: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  });
