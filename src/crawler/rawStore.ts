import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import { DetailListing, ListListing } from "../models/listing";
import { config } from "../utils/config";

function rawDir(): string {
  const dateDir = dayjs().format("YYYY-MM-DD");
  return path.resolve(process.cwd(), "data", "raw", "zufang", dateDir);
}

export async function saveRawListPage(page: number, html: string): Promise<void> {
  if (!config.writeRawFiles) return;
  const dir = rawDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `page-${page}.html`), html, "utf8");
}

export async function saveRawListItem(listing: ListListing): Promise<void> {
  if (!config.writeRawFiles) return;
  const dir = rawDir();
  await mkdir(dir, { recursive: true });
  const safeId = listing.sourceId.replace(/[^\w.-]+/g, "_");
  await Promise.all([
    writeFile(path.join(dir, `${safeId}.list.html`), listing.listRawHtml, "utf8"),
    writeFile(path.join(dir, `${safeId}.list.txt`), listing.listRawText, "utf8")
  ]);
}

export async function saveRawDetail(detail: DetailListing): Promise<void> {
  if (!config.writeRawFiles) return;
  const dir = rawDir();
  await mkdir(dir, { recursive: true });
  const safeId = detail.sourceId.replace(/[^\w.-]+/g, "_");
  await Promise.all([
    writeFile(path.join(dir, `${safeId}.detail.html`), detail.rawDetailHtml, "utf8"),
    writeFile(path.join(dir, `${safeId}.detail.txt`), detail.rawDetailText, "utf8")
  ]);
}
