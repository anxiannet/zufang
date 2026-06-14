begin;

drop table if exists public.listing_commute_cache;

create table public.listing_commute_cache (
  postal_code text primary key,
  origin_latitude double precision,
  origin_longitude double precision,
  ntu_bus_minutes integer,
  ntu_drive_minutes integer,
  bus_distance_meters double precision,
  drive_distance_meters double precision,
  status text not null default 'pending',
  provider text not null default 'onemap',
  error_message text,
  bus_raw_response jsonb,
  drive_raw_response jsonb,
  computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_commute_cache_postal_code_check check (postal_code ~ '^[0-9]{6}$'),
  constraint listing_commute_cache_status_check check (status in ('pending', 'processing', 'success', 'failed')),
  constraint listing_commute_cache_bus_minutes_check check (ntu_bus_minutes is null or ntu_bus_minutes > 0),
  constraint listing_commute_cache_drive_minutes_check check (ntu_drive_minutes is null or ntu_drive_minutes > 0)
);

create index listing_commute_cache_status_idx
  on public.listing_commute_cache(status, updated_at);

insert into public.listing_commute_cache (postal_code)
select distinct postal_code
from public.listings
where postal_code ~ '^[0-9]{6}$'
on conflict (postal_code) do nothing;

create or replace function public.enqueue_listing_postal_commute()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.postal_code ~ '^[0-9]{6}$' then
    insert into public.listing_commute_cache (postal_code)
    values (new.postal_code)
    on conflict (postal_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_listing_postal_commute on public.listings;
create trigger trg_enqueue_listing_postal_commute
after insert or update of postal_code on public.listings
for each row execute function public.enqueue_listing_postal_commute();

alter table public.listing_commute_cache enable row level security;
revoke all on table public.listing_commute_cache from anon, authenticated;
grant select on table public.listing_commute_cache to anon, authenticated;

drop policy if exists "public reads successful commute cache" on public.listing_commute_cache;
create policy "public reads successful commute cache"
  on public.listing_commute_cache
  for select
  to anon, authenticated
  using (status = 'success');

commit;
