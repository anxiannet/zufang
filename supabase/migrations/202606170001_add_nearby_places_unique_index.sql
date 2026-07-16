delete from public.nearby_places_cache cache
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by listing_id, place_type, name
        order by created_at asc, id asc
      ) as duplicate_rank
    from public.nearby_places_cache
  ) ranked
  where duplicate_rank > 1
) duplicates
where cache.id = duplicates.id;

create unique index if not exists nearby_places_cache_listing_type_name_uidx
on public.nearby_places_cache(listing_id, place_type, name);
