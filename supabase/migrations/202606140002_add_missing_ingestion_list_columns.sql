alter table public.ingestion_listings add column if not exists list_phone text;
alter table public.ingestion_listings add column if not exists list_wechat text;
alter table public.ingestion_listings add column if not exists list_posted_at timestamptz;
alter table public.ingestion_listings add column if not exists last_seen_at timestamptz;
