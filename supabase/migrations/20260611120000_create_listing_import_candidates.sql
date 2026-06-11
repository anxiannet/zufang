begin;

alter type public.room_type add value if not exists 'partition_room';
alter type public.room_type add value if not exists 'maid_room';

alter table public.listings
  alter column room_type drop not null;

create table if not exists public.listing_import_candidates (
  id uuid primary key default gen_random_uuid(),
  ingestion_listing_id bigint not null references public.ingestion_listings(id) on delete cascade,
  source text not null,
  source_id text,
  source_url text,
  parsed_title text,
  parsed_description text,
  parsed_description_clean text,
  parsed_rent_amount integer,
  parsed_deposit_amount integer,
  parsed_postal_code text,
  parsed_area text,
  parsed_mrt text,
  parsed_listing_type text,
  parsed_room_type text,
  parsed_available_from date,
  parsed_available_note text,
  parsed_min_lease_months integer,
  parsed_max_occupants integer,
  parsed_registration_allowed boolean,
  parsed_landlord_staying boolean,
  parsed_total_bedrooms integer,
  parsed_total_bathrooms integer,
  parsed_current_occupants_count integer,
  parsed_bathroom_shared_with_count integer,
  parsed_gender_preference text,
  parsed_wechat text,
  parsed_phone text,
  parsed_is_owner_direct boolean,
  parsed_is_agent boolean,
  parsed_is_sublet boolean,
  parsed_utilities_policy text,
  parsed_aircon_policy text,
  parsed_cooking_policy text,
  parsed_visitors_policy text,
  parsed_smoking_policy text,
  parsed_pets_policy text,
  parsed_tenant_type_preference text[] not null default '{}',
  parser_version text not null default 'v1',
  parse_confidence numeric(4,3),
  parse_warnings text[] not null default '{}',
  import_status text not null default 'pending',
  import_error text,
  listing_id uuid references public.listings(id) on delete set null,
  reviewed_by uuid references public.users_profile(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingestion_listing_id),
  constraint listing_import_candidates_import_status_check check (
    import_status in (
      'pending',
      'parsed',
      'needs_review',
      'approved',
      'rejected',
      'imported',
      'failed',
      'duplicate'
    )
  )
);

create index if not exists idx_listing_import_candidates_status
  on public.listing_import_candidates(import_status);

create index if not exists idx_listing_import_candidates_source
  on public.listing_import_candidates(source, source_id);

create index if not exists idx_listing_import_candidates_phone
  on public.listing_import_candidates(parsed_phone);

create index if not exists idx_listing_import_candidates_created_at
  on public.listing_import_candidates(created_at desc);

alter table public.listing_import_candidates enable row level security;

revoke all on table public.listing_import_candidates from anon, authenticated;
grant select, insert, update on table public.listing_import_candidates to authenticated;

drop policy if exists "admins read listing import candidates" on public.listing_import_candidates;
create policy "admins read listing import candidates"
  on public.listing_import_candidates
  for select
  to authenticated
  using (private.current_role() = 'admin');

drop policy if exists "admins insert listing import candidates" on public.listing_import_candidates;
create policy "admins insert listing import candidates"
  on public.listing_import_candidates
  for insert
  to authenticated
  with check (private.current_role() = 'admin');

drop policy if exists "admins update listing import candidates" on public.listing_import_candidates;
create policy "admins update listing import candidates"
  on public.listing_import_candidates
  for update
  to authenticated
  using (private.current_role() = 'admin')
  with check (private.current_role() = 'admin');

commit;
