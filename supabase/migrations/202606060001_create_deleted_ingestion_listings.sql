create table if not exists public.deleted_ingestion_listings (
  id bigserial primary key,
  source text not null,
  source_id text not null,
  listing_url text,
  detail_url text,
  title text,
  reason text not null default 'admin_deleted',
  deleted_at timestamptz not null default now(),
  deleted_by text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists deleted_ingestion_listings_source_source_id_uidx
  on public.deleted_ingestion_listings (source, source_id);

create index if not exists deleted_ingestion_listings_deleted_at_idx
  on public.deleted_ingestion_listings (deleted_at desc);

alter table public.deleted_ingestion_listings enable row level security;

revoke all on table public.deleted_ingestion_listings from anon, authenticated;
revoke all on sequence public.deleted_ingestion_listings_id_seq from anon, authenticated;

grant select on table public.deleted_ingestion_listings to authenticated;

drop policy if exists "admins read deleted ingestion listings" on public.deleted_ingestion_listings;
create policy "admins read deleted ingestion listings" on public.deleted_ingestion_listings
for select to authenticated
using (private.current_role() = 'admin');
