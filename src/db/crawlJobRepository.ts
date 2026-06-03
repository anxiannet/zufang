import { CrawlSummary } from "../models/listing";
import { supabaseRequest } from "./pool";

export type CrawlJobStatus = "running" | "success" | "failed" | "skipped";

export type CrawlJob = {
  id: number;
  job_name: string;
  status: CrawlJobStatus;
  started_at: string;
  finished_at: string | null;
  summary: CrawlSummary | Record<string, unknown> | null;
  error: string | null;
};

export type CrawlLogLevel = "INFO" | "ERROR" | "RETRY" | "SKIP";

export async function findRecentRunningJob(jobName: string, withinMinutes: number): Promise<CrawlJob | null> {
  const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const params = new URLSearchParams({
    select: "id,job_name,status,started_at,finished_at,summary,error",
    job_name: `eq.${jobName}`,
    status: "eq.running",
    started_at: `gt.${cutoff}`,
    order: "started_at.desc",
    limit: "1"
  });

  const rows = await supabaseRequest<CrawlJob[]>(`crawl_jobs?${params.toString()}`);
  return rows[0] ?? null;
}

export async function createCrawlJob(jobName: string): Promise<CrawlJob> {
  const rows = await supabaseRequest<CrawlJob[]>("crawl_jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      job_name: jobName,
      status: "running"
    })
  });

  const job = rows[0];
  if (!job) throw new Error("Failed to create crawl job.");
  return job;
}

export async function finishCrawlJob(jobId: number, summary: CrawlSummary): Promise<void> {
  await updateCrawlJob(jobId, {
    status: "success",
    finished_at: new Date().toISOString(),
    summary
  });
}

export async function failCrawlJob(jobId: number, error: unknown, summary?: Partial<CrawlSummary>): Promise<void> {
  await updateCrawlJob(jobId, {
    status: "failed",
    finished_at: new Date().toISOString(),
    summary: summary ?? null,
    error: error instanceof Error ? error.message : String(error)
  });
}

export async function insertCrawlLog(input: {
  jobId?: number | null;
  level: CrawlLogLevel;
  event: string;
  source?: string | null;
  sourceId?: string | null;
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await supabaseRequest("crawl_logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      job_id: input.jobId ?? null,
      level: input.level,
      event: input.event,
      source: input.source ?? null,
      source_id: input.sourceId ?? null,
      message: input.message,
      meta: input.meta ?? {}
    })
  });
}

async function updateCrawlJob(jobId: number, row: Record<string, unknown>): Promise<void> {
  await supabaseRequest(`crawl_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(row)
  });
}
