begin;

alter table public.nearby_places_cache
  add column if not exists postal_code text;

update public.nearby_places_cache cache
set postal_code = listing.postal_code
from public.listings listing
where cache.listing_id = listing.id
  and cache.postal_code is null;

alter table public.nearby_places_cache
  alter column listing_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nearby_places_cache_postal_code_format_check'
      and conrelid = 'public.nearby_places_cache'::regclass
  ) then
    alter table public.nearby_places_cache
      add constraint nearby_places_cache_postal_code_format_check
      check (postal_code is null or postal_code ~ '^[0-9]{6}$');
  end if;
end $$;

delete from public.nearby_places_cache cache
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by postal_code, place_type, lower(name)
        order by created_at asc, id asc
      ) as duplicate_rank
    from public.nearby_places_cache
    where postal_code is not null
  ) ranked
  where duplicate_rank > 1
) duplicates
where cache.id = duplicates.id;

drop index if exists public.nearby_places_cache_listing_type_name_uidx;

create unique index if not exists nearby_places_cache_postal_type_name_uidx
on public.nearby_places_cache(postal_code, place_type, lower(name))
where postal_code is not null;

drop policy if exists "public read nearby places for visible listings" on public.nearby_places_cache;
create policy "public read nearby places for visible listings" on public.nearby_places_cache
for select using (
  postal_code is not null
  and exists (
    select 1
    from public.listings listing
    where listing.postal_code = nearby_places_cache.postal_code
      and (
        listing.status = 'published'
        or listing.owner_id = private.current_profile_id()
        or private.current_role() = 'admin'
      )
  )
);

drop policy if exists "owners manage nearby cache" on public.nearby_places_cache;
create policy "admins manage nearby cache" on public.nearby_places_cache
for all using (private.current_role() = 'admin')
with check (private.current_role() = 'admin');

commit;
