do $$
begin
  if to_regclass('public.ingestion_listings') is null
    and to_regclass('public.crawler_listings') is not null
  then
    alter table public.crawler_listings rename to ingestion_listings;
  end if;

  if to_regclass('public.ingestion_listings_source_source_id_uidx') is null
    and to_regclass('public.crawler_listings_source_source_id_uidx') is not null
  then
    alter index public.crawler_listings_source_source_id_uidx rename to ingestion_listings_source_source_id_uidx;
  end if;
end $$;

create table if not exists public.ingestion_listings (
  id bigserial primary key,
  source varchar(50),
  source_id varchar(255),
  title text,
  listing_url text,
  category text,
  mrt_area text,
  price integer,
  phone text,
  wechat text,
  tags text[],
  posted_at timestamp,
  scraped_at timestamp default now(),
  raw_text text,
  raw_html text,
  is_top boolean default false,
  created_at timestamp default now()
);

create unique index if not exists ingestion_listings_source_source_id_uidx
  on public.ingestion_listings (source, source_id);

alter table public.ingestion_listings add column if not exists detail_url text;
alter table public.ingestion_listings add column if not exists list_title text;
alter table public.ingestion_listings add column if not exists list_price integer;
alter table public.ingestion_listings add column if not exists list_contact text;
alter table public.ingestion_listings add column if not exists list_raw_html text;
alter table public.ingestion_listings add column if not exists list_raw_text text;
alter table public.ingestion_listings add column if not exists posted_text text;
alter table public.ingestion_listings add column if not exists contact_text text;
alter table public.ingestion_listings add column if not exists whatsapp_url text;
alter table public.ingestion_listings add column if not exists body_text text;
alter table public.ingestion_listings add column if not exists cea_reg_no text;
alter table public.ingestion_listings add column if not exists raw_detail_html text;
alter table public.ingestion_listings add column if not exists raw_detail_text text;
alter table public.ingestion_listings add column if not exists needs_review boolean not null default false;
alter table public.ingestion_listings add column if not exists removed_from_source boolean not null default false;
alter table public.ingestion_listings add column if not exists user_corrected_fields jsonb not null default '{}'::jsonb;
alter table public.ingestion_listings add column if not exists latest_source_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.listing_change_logs (
  id bigserial primary key,
  listing_id bigint references public.ingestion_listings(id) on delete cascade,
  source text not null,
  source_id text not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  scraped_at timestamp,
  created_at timestamp default now()
);

create index if not exists listing_change_logs_source_source_id_idx
  on public.listing_change_logs (source, source_id, created_at desc);

create index if not exists ingestion_listings_needs_review_idx
  on public.ingestion_listings (needs_review, scraped_at desc);

create table if not exists public.crawl_jobs (
  id bigserial primary key,
  job_name text not null,
  status text not null,
  started_at timestamp default now(),
  finished_at timestamp,
  summary jsonb,
  error text
);

create index if not exists crawl_jobs_running_idx
  on public.crawl_jobs (job_name, status, started_at desc);

create table if not exists public.crawl_logs (
  id bigserial primary key,
  job_id bigint references public.crawl_jobs(id) on delete set null,
  level text,
  event text,
  source text,
  source_id text,
  message text,
  meta jsonb,
  created_at timestamp default now()
);

create index if not exists crawl_logs_job_id_created_at_idx
  on public.crawl_logs (job_id, created_at desc);

alter table public.crawl_jobs enable row level security;
alter table public.crawl_logs enable row level security;
alter table public.listing_change_logs enable row level security;

revoke all on table public.crawl_jobs from anon, authenticated;
revoke all on table public.crawl_logs from anon, authenticated;
revoke all on table public.listing_change_logs from anon, authenticated;
revoke all on sequence public.crawl_jobs_id_seq from anon, authenticated;
revoke all on sequence public.crawl_logs_id_seq from anon, authenticated;
revoke all on sequence public.listing_change_logs_id_seq from anon, authenticated;

grant select on table public.crawl_jobs to authenticated;
grant select on table public.crawl_logs to authenticated;
grant select on table public.listing_change_logs to authenticated;

drop policy if exists "admins read crawl jobs" on public.crawl_jobs;
create policy "admins read crawl jobs" on public.crawl_jobs
for select to authenticated
using (private.current_role() = 'admin');

drop policy if exists "admins read crawl logs" on public.crawl_logs;
create policy "admins read crawl logs" on public.crawl_logs
for select to authenticated
using (private.current_role() = 'admin');

drop policy if exists "admins read listing change logs" on public.listing_change_logs;
create policy "admins read listing change logs" on public.listing_change_logs
for select to authenticated
using (private.current_role() = 'admin');
