import { insertCrawlLog, CrawlLogLevel } from "../db/crawlJobRepository";
import { config } from "./config";

type LogLevel = "INFO" | "ERROR" | "RETRY" | "SKIP";

let activeJobId: number | null = null;
const pendingLogWrites = new Set<Promise<void>>();

export function setLoggerJobId(jobId: number | null): void {
  activeJobId = jobId;
}

export async function flushLogger(): Promise<void> {
  await Promise.allSettled([...pendingLogWrites]);
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${level}] ${message}${suffix}`);

  if (activeJobId) {
    const writePromise = insertCrawlLog({
      jobId: activeJobId,
      level: level as CrawlLogLevel,
      event: message,
      source: config.source,
      sourceId: typeof meta?.source_id === "string" ? meta.source_id : null,
      message,
      meta
    });

    pendingLogWrites.add(writePromise);
    void writePromise
      .catch((error: unknown) => {
        console.error("[ERROR] failed to write crawl log", error);
      })
      .finally(() => {
        pendingLogWrites.delete(writePromise);
      });
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("INFO", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("ERROR", message, meta),
  retry: (message: string, meta?: Record<string, unknown>) => write("RETRY", message, meta),
  skip: (message: string, meta?: Record<string, unknown>) => write("SKIP", message, meta)
};
