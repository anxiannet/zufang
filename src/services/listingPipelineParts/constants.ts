import { config } from "../../utils/config";

export const INGESTION_TABLE = config.listingTableName;
export const CLEAN_TABLE = process.env.LISTING_CLEAN_TABLE_NAME ?? "listing_clean";
export const INDEX_TABLE = process.env.LISTING_INDEX_TABLE_NAME ?? "listing_indexes";
export const DEFAULT_LIMIT = 100;
export const CLEAN_VERSION = "2026-06-04-clean-v1";

export function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), 500);
}
