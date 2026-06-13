begin;

alter table public.listing_commute_cache
  add column if not exists ntu_straight_distance_km numeric,
  add column if not exists skip_reason text;

do $$
declare
  status_constraint record;
begin
  for status_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.listing_commute_cache'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%pending%'
      and pg_get_constraintdef(oid) ilike '%processing%'
      and pg_get_constraintdef(oid) ilike '%success%'
      and pg_get_constraintdef(oid) ilike '%failed%'
  loop
    execute format(
      'alter table public.listing_commute_cache drop constraint %I',
      status_constraint.conname
    );
  end loop;
end
$$;

alter table public.listing_commute_cache
  add constraint listing_commute_cache_status_check
  check (status in ('pending', 'processing', 'success', 'failed', 'skipped_far'));

commit;
