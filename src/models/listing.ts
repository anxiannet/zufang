export interface ListListing {
  source: string;
  sourceId: string;
  detailUrl: string;
  listTitle: string | null;
  listPostedText: string | null;
  listPrice: number | null;
  listContact: string | null;
  listRawHtml: string;
  listRawText: string;
  listPhone: string | null;
  listWechat: string | null;
  listPostedAt: Date | null;
  listTags: string[];
  listMrtArea: string | null;
  isTop: boolean;
}

export interface DetailListing {
  source: string;
  sourceId: string;
  detailUrl: string;
  title: string | null;
  postedText: string | null;
  postedAt: Date | null;
  category: string | null;
  mrtArea: string | null;
  price: number | null;
  contactText: string | null;
  phone: string | null;
  wechat: string | null;
  whatsappUrl: string | null;
  tags: string[];
  bodyText: string | null;
  ceaRegNo: string | null;
  rawDetailHtml: string;
  rawDetailText: string;
  scrapedAt: Date;
}

export interface Listing extends DetailListing {
  title: string;
  category: string;
  detailUrl: string;
  listingUrl: string;
  listTitle: string | null;
  listPostedText: string | null;
  listPrice: number | null;
  listContact: string | null;
  listRawHtml: string;
  listRawText: string;
  latestSourceSnapshot: Record<string, unknown>;
  isTop: boolean;
}

export interface CrawlStats {
  pagesVisited: number;
  listingsParsed: number;
  detailsFetched: number;
  listingsSaved: number;
  listingsSkipped: number;
  listingsChanged: number;
  listingsInserted: number;
  listingsUpdated: number;
  errors: number;
  stopReason: string | null;
}

export type CrawlMode = "manual" | "vercel-cron";

export type CrawlSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
  detailsFetched: number;
  stoppedReason?: string;
};
