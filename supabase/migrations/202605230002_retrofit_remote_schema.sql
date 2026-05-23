create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.listings') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'listings' and column_name = 'rent_amount'
     )
     and to_regclass('public.legacy_listings_before_rental_mvp') is null then
    alter table public.listings rename to legacy_listings_before_rental_mvp;
  end if;
end $$;

do $$
begin
  create type public.user_role as enum ('tenant', 'landlord', 'agent', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.listing_status as enum ('draft', 'pending_review', 'published', 'rejected', 'rented');
exception when duplicate_object then
  alter type public.listing_status add value if not exists 'pending_review';
  alter type public.listing_status add value if not exists 'rejected';
  alter type public.listing_status add value if not exists 'rented';
end $$;

do $$
begin
  create type public.listing_type as enum ('room', 'whole_unit', 'bedspace');
exception when duplicate_object then
  alter type public.listing_type add value if not exists 'bedspace';
end $$;

do $$
begin
  create type public.room_type as enum ('common_room', 'master_room', 'studio', 'whole_unit');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.property_type as enum ('hdb', 'condo', 'landed', 'apartment');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.gender_preference as enum ('any', 'male', 'female');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.facility_availability as enum ('available', 'not_available', 'restricted');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.place_type as enum ('mrt', 'bus_stop', 'food_court', 'supermarket', 'mall', 'school');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.enquiry_status as enum ('new', 'contacted', 'viewing', 'rejected', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.user_role not null default 'tenant',
  display_name text not null,
  phone text,
  whatsapp text,
  wechat text,
  preferred_language text default 'zh',
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users_profile(id) on delete cascade,
  status public.listing_status not null default 'draft',
  rejection_reason text,
  title text not null,
  listing_type public.listing_type not null,
  room_type public.room_type not null,
  property_type public.property_type not null default 'hdb',
  rent_amount integer not null check (rent_amount >= 0),
  deposit_amount integer check (deposit_amount >= 0),
  currency text not null default 'SGD',
  postal_code text not null,
  block text,
  street_name text,
  unit_hidden_address text,
  latitude double precision,
  longitude double precision,
  nearest_mrt text,
  available_from date not null,
  min_lease_months integer not null check (min_lease_months > 0),
  max_occupants integer not null default 1 check (max_occupants > 0),
  gender_preference public.gender_preference not null default 'any',
  cooking_allowed boolean not null default false,
  visitors_allowed boolean not null default false,
  smoking_allowed boolean not null default false,
  pets_allowed boolean not null default false,
  registration_allowed boolean not null default false,
  landlord_staying boolean not null default false,
  total_bedrooms integer check (total_bedrooms >= 0),
  total_bathrooms integer check (total_bathrooms >= 0),
  current_occupants_count integer check (current_occupants_count >= 0),
  bathroom_shared_with_count integer check (bathroom_shared_with_count >= 0),
  description text,
  house_rules text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_facilities (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  facility_name text not null,
  availability public.facility_availability not null default 'not_available',
  note text,
  unique (listing_id, facility_name)
);

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  caption text
);

create table if not exists public.nearby_places_cache (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  place_type public.place_type not null,
  name text not null,
  distance_meters integer not null,
  walking_minutes integer not null,
  source text not null default 'mock',
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users_profile(id) on delete cascade,
  occupation text,
  school_or_company text,
  move_in_date date,
  lease_duration_months integer,
  budget_min integer,
  budget_max integer,
  preferred_locations text[],
  gender text,
  occupants_count integer,
  cooking_need boolean,
  registration_need boolean,
  notes text
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  tenant_id uuid not null references public.users_profile(id) on delete cascade,
  message text not null,
  move_in_date date,
  lease_duration_months integer,
  occupants_count integer,
  status public.enquiry_status not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists listings_search_idx on public.listings using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(street_name, '') || ' ' || coalesce(nearest_mrt, '') || ' ' || coalesce(description, '')));
create index if not exists listings_status_created_idx on public.listings (status, created_at desc);
create index if not exists listings_price_idx on public.listings (rent_amount);
create index if not exists listing_facilities_filter_idx on public.listing_facilities (facility_name, availability);
create index if not exists listing_images_listing_idx on public.listing_images (listing_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_listings_updated_at on public.listings;
create trigger set_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users_profile where auth_user_id = auth.uid()
$$;

create or replace function private.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users_profile where auth_user_id = auth.uid()
$$;

alter table public.users_profile enable row level security;
alter table public.listings enable row level security;
alter table public.listing_facilities enable row level security;
alter table public.listing_images enable row level security;
alter table public.nearby_places_cache enable row level security;
alter table public.tenant_profiles enable row level security;
alter table public.enquiries enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.users_profile to authenticated;
grant select on public.listings, public.listing_facilities, public.listing_images, public.nearby_places_cache to anon, authenticated;
grant insert, update, delete on public.listings, public.listing_facilities, public.listing_images, public.nearby_places_cache to authenticated;
grant select, insert, update, delete on public.tenant_profiles, public.enquiries to authenticated;

drop policy if exists "profiles can read own and admins read all" on public.users_profile;
create policy "profiles can read own and admins read all" on public.users_profile
for select using (auth_user_id = auth.uid() or private.current_role() = 'admin');

drop policy if exists "profiles can create own profile" on public.users_profile;
create policy "profiles can create own profile" on public.users_profile
for insert with check (auth_user_id = auth.uid());

drop policy if exists "profiles can update own and admins update all" on public.users_profile;
create policy "profiles can update own and admins update all" on public.users_profile
for update using (auth_user_id = auth.uid() or private.current_role() = 'admin')
with check (auth_user_id = auth.uid() or private.current_role() = 'admin');

drop policy if exists "published listings are public" on public.listings;
create policy "published listings are public" on public.listings
for select using (status = 'published');

drop policy if exists "owners and admins read listings" on public.listings;
create policy "owners and admins read listings" on public.listings
for select using (owner_id = private.current_profile_id() or private.current_role() = 'admin');

drop policy if exists "landlords agents create own listings" on public.listings;
create policy "landlords agents create own listings" on public.listings
for insert with check (owner_id = private.current_profile_id() and private.current_role() in ('landlord', 'agent', 'admin'));

drop policy if exists "owners manage own draft listings" on public.listings;
create policy "owners manage own draft listings" on public.listings
for update using (owner_id = private.current_profile_id() or private.current_role() = 'admin')
with check (owner_id = private.current_profile_id() or private.current_role() = 'admin');

drop policy if exists "owners delete own non-published listings" on public.listings;
create policy "owners delete own non-published listings" on public.listings
for delete using ((owner_id = private.current_profile_id() and status in ('draft', 'rejected')) or private.current_role() = 'admin');

drop policy if exists "public read facilities for visible listings" on public.listing_facilities;
create policy "public read facilities for visible listings" on public.listing_facilities
for select using (exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "owners manage facilities" on public.listing_facilities;
create policy "owners manage facilities" on public.listing_facilities
for all using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')))
with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "public read images for visible listings" on public.listing_images;
create policy "public read images for visible listings" on public.listing_images
for select using (exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "owners manage images" on public.listing_images;
create policy "owners manage images" on public.listing_images
for all using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')))
with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "public read nearby places for visible listings" on public.nearby_places_cache;
create policy "public read nearby places for visible listings" on public.nearby_places_cache
for select using (exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "owners manage nearby cache" on public.nearby_places_cache;
create policy "owners manage nearby cache" on public.nearby_places_cache
for all using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')))
with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = private.current_profile_id() or private.current_role() = 'admin')));

drop policy if exists "tenants manage own profile" on public.tenant_profiles;
create policy "tenants manage own profile" on public.tenant_profiles
for all using (user_id = private.current_profile_id() or private.current_role() = 'admin')
with check (user_id = private.current_profile_id() or private.current_role() = 'admin');

drop policy if exists "tenants create enquiries" on public.enquiries;
create policy "tenants create enquiries" on public.enquiries
for insert with check (tenant_id = private.current_profile_id() and private.current_role() in ('tenant', 'admin'));

drop policy if exists "enquiry participants read" on public.enquiries;
create policy "enquiry participants read" on public.enquiries
for select using (
  tenant_id = private.current_profile_id()
  or private.current_role() = 'admin'
  or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = private.current_profile_id())
);

drop policy if exists "admin or listing owner updates enquiries" on public.enquiries;
create policy "admin or listing owner updates enquiries" on public.enquiries
for update using (
  private.current_role() = 'admin'
  or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = private.current_profile_id())
)
with check (
  private.current_role() = 'admin'
  or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = private.current_profile_id())
);

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;
