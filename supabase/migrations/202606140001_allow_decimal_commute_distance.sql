begin;

alter table public.listing_commute_cache
  alter column bus_distance_meters type double precision
    using bus_distance_meters::double precision,
  alter column drive_distance_meters type double precision
    using drive_distance_meters::double precision;

commit;
