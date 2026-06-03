import { createCrawlJob, failCrawlJob, findRecentRunningJob, finishCrawlJob } from "../db/crawlJobRepository";
import { CrawlMode, CrawlSummary } from "../models/listing";
import { config, validateConfig } from "../utils/config";
import { flushLogger, setLoggerJobId } from "../utils/logger";
import { crawlZufangRecentListings } from "./zufangCrawler";

const JOB_NAME = "zufang-daily-crawl";
const RUNNING_WINDOW_MINUTES = 30;

export type CrawlJobRunResult =
  | ({
      success: true;
      startedAt: string;
      finishedAt: string;
    } & CrawlSummary)
  | {
      success: false;
      reason: "job_already_running";
      startedAt?: string;
      finishedAt?: string;
    };

export async function runZufangCrawlJob(mode: CrawlMode): Promise<CrawlJobRunResult> {
  validateConfig();

  const runningJob = await findRecentRunningJob(JOB_NAME, RUNNING_WINDOW_MINUTES);
  if (runningJob) {
    return {
      success: false,
      reason: "job_already_running",
      startedAt: runningJob.started_at
    };
  }

  const job = await createCrawlJob(JOB_NAME);
  setLoggerJobId(job.id);

  try {
    const summary = await crawlZufangRecentListings({
      days: config.crawlDays,
      maxPages: config.maxPagesPerRun,
      maxDetails: config.maxDetailsPerRun,
      mode
    });
    await flushLogger();
    await finishCrawlJob(job.id, summary);
    const finishedAt = new Date().toISOString();

    return {
      success: true,
      ...summary,
      startedAt: job.started_at,
      finishedAt
    };
  } catch (error) {
    await flushLogger();
    await failCrawlJob(job.id, error);
    throw error;
  } finally {
    setLoggerJobId(null);
  }
}
