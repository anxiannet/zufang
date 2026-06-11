begin;

-- Crawler provenance belongs to ingestion_listings / listing_import_candidates.
-- Formal listings should contain only authorized listing content.
drop index if exists public.listings_ingestion_listing_id_uidx;
drop index if exists public.listings_source_trace_idx;

alter table public.listings
  drop column if exists ingestion_listing_id,
  drop column if exists source_site,
  drop column if exists source_listing_id,
  drop column if exists source_url,
  drop column if exists imported_at;

commit;
