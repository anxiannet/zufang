import dotenv from "dotenv";
import { validateConfig } from "../utils/config";
import { logger } from "../utils/logger";
import { runPostCrawlPipeline } from "./postCrawlPipeline";

dotenv.config();

async function main(): Promise<void> {
  validateConfig();
  const summary = await runPostCrawlPipeline();
  logger.info("local post crawl pipeline summary", summary as unknown as Record<string, unknown>);
}

main().catch((error: unknown) => {
  logger.error("post crawl pipeline crashed", { reason: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
