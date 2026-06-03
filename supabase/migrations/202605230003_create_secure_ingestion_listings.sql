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

alter table public.ingestion_listings enable row level security;

revoke all on table public.ingestion_listings from anon, authenticated;
revoke all on sequence public.ingestion_listings_id_seq from anon, authenticated;

grant select, delete on table public.ingestion_listings to authenticated;

drop policy if exists "admins read crawler listings" on public.ingestion_listings;
drop policy if exists "admins read ingestion listings" on public.ingestion_listings;
create policy "admins read ingestion listings" on public.ingestion_listings
for select to authenticated
using (private.current_role() = 'admin');

drop policy if exists "admins delete crawler listings" on public.ingestion_listings;
drop policy if exists "admins delete ingestion listings" on public.ingestion_listings;
create policy "admins delete ingestion listings" on public.ingestion_listings
for delete to authenticated
using (private.current_role() = 'admin');
