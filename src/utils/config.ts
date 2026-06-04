import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

type CrawlSourceName = "zufang.sg" | "shichengbbs.com";

const crawlSources: Record<CrawlSourceName, {
  source: CrawlSourceName;
  baseUrl: string;
  entryUrl: string;
  category: string;
}> = {
  "zufang.sg": {
    source: "zufang.sg",
    baseUrl: "https://www.zufang.sg",
    entryUrl: "https://www.zufang.sg/c31?category2_id=15",
    category: "单间租房"
  },
  "shichengbbs.com": {
    source: "shichengbbs.com",
    baseUrl: "https://www.shichengbbs.com",
    entryUrl: "https://www.shichengbbs.com/c15",
    category: "单间租房"
  }
};

const crawlSourceName = (process.env.CRAWL_SOURCE ?? "zufang.sg") as CrawlSourceName;
const crawlSource = crawlSources[crawlSourceName] ?? crawlSources["zufang.sg"];

export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseFunctionsJwt: process.env.SUPABASE_FUNCTIONS_JWT ?? process.env.SUPABASE_SERVICE_ROLE_JWT ?? "",
  crawlSourceName: crawlSource.source,
  crawlDays: Number.parseInt(process.env.CRAWL_DAYS ?? "3", 10),
  maxPagesPerRun: Number.parseInt(process.env.MAX_PAGES_PER_RUN ?? "5", 10),
  maxDetailsPerRun: Number.parseInt(process.env.MAX_DETAILS_PER_RUN ?? "200", 10),
  maxInsertedPerRun: Number.parseInt(process.env.MAX_INSERTED_PER_RUN ?? "50", 10),
  postCrawlPipelineEnabled: process.env.POST_CRAWL_PIPELINE_ENABLED !== "false",
  postCrawlIndexLimit: Number.parseInt(process.env.POST_CRAWL_INDEX_LIMIT ?? process.env.MAX_DETAILS_PER_RUN ?? "200", 10),
  postCrawlGeocodingLimit: Number.parseInt(process.env.POST_CRAWL_GEOCODING_LIMIT ?? "50", 10),
  baseUrl: crawlSource.baseUrl,
  entryUrl: crawlSource.entryUrl,
  source: crawlSource.source,
  category: crawlSource.category,
  listingTableName: process.env.INGESTION_TABLE_NAME ?? "ingestion_listings",
  requestTimeoutMs: 15_000,
  maxRetries: 3,
  concurrency: 3,
  detailConcurrency: Number.parseInt(process.env.DETAIL_CONCURRENCY ?? "2", 10),
  minPageDelayMs: 2_000,
  maxPageDelayMs: 5_000,
  minDetailDelayMs: 2_000,
  maxDetailDelayMs: 6_000,
  writeRawFiles: process.env.CRAWLER_WRITE_RAW_FILES === "true"
};

export function validateConfig(): void {
  if (!config.supabaseUrl) {
    throw new Error("SUPABASE_URL is required. Copy .env.example to .env and fill SUPABASE_URL.");
  }

  if (!config.supabaseKey) {
    throw new Error("SUPABASE_SECRET_KEY is required. Copy .env.example to .env and fill SUPABASE_SECRET_KEY.");
  }

  if (!Number.isFinite(config.crawlDays) || config.crawlDays <= 0) {
    throw new Error("CRAWL_DAYS must be a positive number.");
  }

  if (!Number.isFinite(config.maxPagesPerRun) || config.maxPagesPerRun <= 0) {
    throw new Error("MAX_PAGES_PER_RUN must be a positive number.");
  }

  if (!Number.isFinite(config.maxDetailsPerRun) || config.maxDetailsPerRun <= 0) {
    throw new Error("MAX_DETAILS_PER_RUN must be a positive number.");
  }

  if (!Number.isFinite(config.maxInsertedPerRun) || config.maxInsertedPerRun <= 0) {
    throw new Error("MAX_INSERTED_PER_RUN must be a positive number.");
  }

  if (!Number.isFinite(config.postCrawlIndexLimit) || config.postCrawlIndexLimit <= 0) {
    throw new Error("POST_CRAWL_INDEX_LIMIT must be a positive number.");
  }

  if (!Number.isFinite(config.postCrawlGeocodingLimit) || config.postCrawlGeocodingLimit <= 0) {
    throw new Error("POST_CRAWL_GEOCODING_LIMIT must be a positive number.");
  }

  if (!Number.isFinite(config.detailConcurrency) || config.detailConcurrency <= 0) {
    throw new Error("DETAIL_CONCURRENCY must be a positive number.");
  }
}
