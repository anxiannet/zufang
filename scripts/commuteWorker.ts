import { runCommuteEnrichment, type SchoolCode } from "./enrichCommute";

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_LIMIT = 20;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

let isRunning = false;
let stopped = false;
let runCount = 0;

async function runOnce(): Promise<void> {
  if (isRunning) {
    console.log("[commute-worker] Previous commute enrichment run is still active. Skipping this tick.");
    return;
  }

  isRunning = true;
  runCount += 1;
  const startedAt = new Date();

  try {
    console.log(`[commute-worker] Run #${runCount} started at ${startedAt.toISOString()}`);
    const summary = await runCommuteEnrichment({
      limit: readLimit(),
      dryRun: readDryRun(),
      school: readSchool()
    });
    console.log(`[commute-worker] Run #${runCount} completed`, JSON.stringify(summary));
  } catch (error) {
    console.error(`[commute-worker] Run #${runCount} failed`, error);
  } finally {
    isRunning = false;
    const finishedAt = new Date();
    console.log(`[commute-worker] Run #${runCount} finished at ${finishedAt.toISOString()} (${finishedAt.getTime() - startedAt.getTime()}ms)`);
  }
}

function scheduleNextRun(): void {
  if (stopped) return;
  const intervalMs = readIntervalMinutes() * 60 * 1000;
  setTimeout(async () => {
    await runOnce();
    scheduleNextRun();
  }, intervalMs);
}

function readIntervalMinutes(): number {
  const raw = process.env.COMMUTE_WORKER_INTERVAL_MINUTES;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(Math.max(parsed, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES);
}

function readLimit(): number {
  const raw = process.env.COMMUTE_WORKER_LIMIT;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return parsed;
}

function readDryRun(): boolean {
  return process.env.COMMUTE_WORKER_DRY_RUN === "true";
}

function readSchool(): SchoolCode | undefined {
  const school = String(process.env.COMMUTE_WORKER_SCHOOL ?? "").trim().toUpperCase();
  if (!school) return undefined;
  if (["NTU", "NUS", "SMU", "SUTD"].includes(school)) return school as SchoolCode;
  throw new Error("COMMUTE_WORKER_SCHOOL must be one of NTU, NUS, SMU, SUTD");
}

function installShutdownHooks(): void {
  const shutdown = (signal: NodeJS.Signals) => {
    stopped = true;
    console.log(`[commute-worker] Received ${signal}. Worker will stop after current run.`);
    if (!isRunning) process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  installShutdownHooks();
  console.log("[commute-worker] Started", JSON.stringify({
    interval_minutes: readIntervalMinutes(),
    limit: readLimit(),
    dry_run: readDryRun(),
    school: readSchool() ?? "ALL"
  }));

  if (process.env.COMMUTE_WORKER_RUN_ON_START !== "false") {
    await runOnce();
  }

  scheduleNextRun();
}

main().catch((error) => {
  console.error("[commute-worker] Fatal error", error);
  process.exit(1);
});
