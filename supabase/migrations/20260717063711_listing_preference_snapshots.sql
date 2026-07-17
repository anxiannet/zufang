alter table public.listing_user_preferences
  add column if not exists listing_snapshot jsonb;

alter table public.listing_user_preferences
  alter column status drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listing_user_preferences_snapshot_check'
      and conrelid = 'public.listing_user_preferences'::regclass
  ) then
    alter table public.listing_user_preferences
      add constraint listing_user_preferences_snapshot_check
      check (
        listing_snapshot is null
        or (
          jsonb_typeof(listing_snapshot) = 'object'
          and octet_length(listing_snapshot::text) <= 65536
        )
      );
  end if;
end $$;

drop function if exists public.record_listing_user_preference(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  bigint,
  timestamptz
);

create function public.record_listing_user_preference(
  p_visitor_id uuid,
  p_anonymous_visitor_id uuid,
  p_listing_key text,
  p_listing_source text,
  p_status text,
  p_candidate_no integer,
  p_listing_no bigint,
  p_updated_at timestamptz,
  p_listing_snapshot jsonb,
  p_keep_tombstone boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_anonymous_visitor_id <> p_visitor_id then
    delete from public.listing_user_preferences
    where visitor_id = p_anonymous_visitor_id
      and listing_key = p_listing_key;
  end if;

  if p_status is null and not p_keep_tombstone then
    delete from public.listing_user_preferences
    where visitor_id = p_visitor_id
      and listing_key = p_listing_key
      and updated_at <= p_updated_at;
    return;
  end if;

  insert into public.listing_user_preferences (
    visitor_id,
    listing_key,
    listing_source,
    status,
    candidate_no,
    listing_no,
    listing_snapshot,
    updated_at
  )
  values (
    p_visitor_id,
    p_listing_key,
    p_listing_source,
    p_status,
    p_candidate_no,
    p_listing_no,
    p_listing_snapshot,
    p_updated_at
  )
  on conflict on constraint listing_user_preferences_pkey
  do update set
    listing_source = excluded.listing_source,
    status = excluded.status,
    candidate_no = excluded.candidate_no,
    listing_no = excluded.listing_no,
    listing_snapshot = coalesce(excluded.listing_snapshot, public.listing_user_preferences.listing_snapshot),
    updated_at = excluded.updated_at
  where public.listing_user_preferences.updated_at <= excluded.updated_at;
end;
$$;

revoke all on function public.record_listing_user_preference(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  bigint,
  timestamptz,
  jsonb,
  boolean
) from public, anon, authenticated;

grant execute on function public.record_listing_user_preference(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  bigint,
  timestamptz,
  jsonb,
  boolean
) to service_role;

create or replace view public.listing_preference_stats
with (security_invoker = true)
as
select
  listing_key,
  status,
  count(*)::bigint as user_count
from public.listing_user_preferences
where status is not null
group by listing_key, status;
