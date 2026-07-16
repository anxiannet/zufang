begin;

create or replace function public.refresh_ntu_postal_distance(target_postal_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  geocoding record;
  cached record;
  latitude_delta double precision;
  longitude_delta double precision;
  haversine_a double precision;
  distance_km numeric;
  coordinates_changed boolean;
begin
  if target_postal_code is null or target_postal_code !~ '^[0-9]{6}$' then
    return;
  end if;

  select latitude, longitude
  into geocoding
  from public.geocoding_cache
  where postal_code = target_postal_code
    and status = 'success'
    and latitude is not null
    and longitude is not null
  limit 1;

  if not found then
    insert into public.listing_commute_cache (postal_code)
    values (target_postal_code)
    on conflict (postal_code) do nothing;
    return;
  end if;

  latitude_delta := radians(1.3483 - geocoding.latitude);
  longitude_delta := radians(103.6831 - geocoding.longitude);
  haversine_a :=
    sin(latitude_delta / 2) ^ 2 +
    cos(radians(geocoding.latitude)) *
    cos(radians(1.3483)) *
    sin(longitude_delta / 2) ^ 2;
  distance_km := round((
    6371.0088 * 2 * atan2(
      sqrt(greatest(0::double precision, least(1::double precision, haversine_a))),
      sqrt(greatest(0::double precision, 1 - least(1::double precision, haversine_a)))
    )
  )::numeric, 3);

  select origin_latitude, origin_longitude, status
  into cached
  from public.listing_commute_cache
  where postal_code = target_postal_code;

  if not found then
    insert into public.listing_commute_cache (
      postal_code,
      origin_latitude,
      origin_longitude,
      ntu_straight_distance_km,
      status,
      skip_reason,
      updated_at
    ) values (
      target_postal_code,
      geocoding.latitude,
      geocoding.longitude,
      distance_km,
      case when distance_km > 12 then 'skipped_far' else 'pending' end,
      case when distance_km > 12 then 'distance_over_12km' else null end,
      now()
    );
    return;
  end if;

  coordinates_changed :=
    cached.origin_latitude is null or
    cached.origin_longitude is null or
    abs(cached.origin_latitude - geocoding.latitude) > 0.000001 or
    abs(cached.origin_longitude - geocoding.longitude) > 0.000001;

  update public.listing_commute_cache
  set
    origin_latitude = geocoding.latitude,
    origin_longitude = geocoding.longitude,
    ntu_straight_distance_km = distance_km,
    status = case
      when not coordinates_changed then listing_commute_cache.status
      when distance_km > 12 then 'skipped_far'
      else 'pending'
    end,
    skip_reason = case
      when not coordinates_changed then listing_commute_cache.skip_reason
      when distance_km > 12 then 'distance_over_12km'
      else null
    end,
    ntu_bus_minutes = case when coordinates_changed then null else ntu_bus_minutes end,
    ntu_drive_minutes = case when coordinates_changed then null else ntu_drive_minutes end,
    bus_distance_meters = case when coordinates_changed then null else bus_distance_meters end,
    drive_distance_meters = case when coordinates_changed then null else drive_distance_meters end,
    bus_raw_response = case when coordinates_changed then null else bus_raw_response end,
    drive_raw_response = case when coordinates_changed then null else drive_raw_response end,
    error_message = case when coordinates_changed then null else error_message end,
    computed_at = case when coordinates_changed then null else computed_at end,
    updated_at = now()
  where postal_code = target_postal_code;
end;
$$;

revoke all on function public.refresh_ntu_postal_distance(text) from public;

create or replace function public.enqueue_listing_postal_commute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_ntu_postal_distance(new.postal_code);
  return new;
end;
$$;

revoke all on function public.enqueue_listing_postal_commute() from public;

create or replace function public.enqueue_candidate_postal_commute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.import_status in ('parsed', 'needs_review', 'approved') then
    perform public.refresh_ntu_postal_distance(new.parsed_postal_code);
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_candidate_postal_commute() from public;

drop trigger if exists trg_enqueue_candidate_postal_commute on public.listing_import_candidates;
create trigger trg_enqueue_candidate_postal_commute
after insert or update of parsed_postal_code, import_status
on public.listing_import_candidates
for each row execute function public.enqueue_candidate_postal_commute();

create or replace function public.refresh_commute_after_geocoding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'success' and new.latitude is not null and new.longitude is not null then
    perform public.refresh_ntu_postal_distance(new.postal_code);
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_commute_after_geocoding() from public;

drop trigger if exists trg_refresh_commute_after_geocoding on public.geocoding_cache;
create trigger trg_refresh_commute_after_geocoding
after insert or update of status, latitude, longitude
on public.geocoding_cache
for each row execute function public.refresh_commute_after_geocoding();

do $$
declare
  postal record;
begin
  for postal in
    select distinct postal_code
    from (
      select postal_code
      from public.listings
      where postal_code ~ '^[0-9]{6}$'
      union
      select parsed_postal_code as postal_code
      from public.listing_import_candidates
      where parsed_postal_code ~ '^[0-9]{6}$'
        and import_status in ('parsed', 'needs_review', 'approved')
    ) eligible_postal_codes
  loop
    perform public.refresh_ntu_postal_distance(postal.postal_code);
  end loop;
end;
$$;

commit;
