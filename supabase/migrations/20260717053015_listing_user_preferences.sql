create table public.listing_user_preferences (
  visitor_id uuid not null,
  listing_key text not null,
  listing_source text not null,
  status text not null,
  candidate_no integer,
  listing_no bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_user_preferences_pkey primary key (visitor_id, listing_key),
  constraint listing_user_preferences_listing_key_check
    check (char_length(listing_key) between 1 and 64 and listing_key ~ '^[A-Za-z0-9-]+$'),
  constraint listing_user_preferences_listing_source_check
    check (listing_source in ('official', 'candidate')),
  constraint listing_user_preferences_status_check
    check (status in ('favorite', 'contact_later', 'rented', 'disliked')),
  constraint listing_user_preferences_candidate_no_check
    check (candidate_no is null or candidate_no between 1 and 99999999),
  constraint listing_user_preferences_listing_no_check
    check (listing_no is null or listing_no > 0),
  constraint listing_user_preferences_source_fields_check
    check (
      (listing_source = 'candidate' and listing_no is null)
      or
      (listing_source = 'official' and candidate_no is null)
    )
);

create index listing_user_preferences_listing_status_idx
  on public.listing_user_preferences (listing_key, status);

alter table public.listing_user_preferences enable row level security;

revoke all on table public.listing_user_preferences from anon, authenticated;
grant select, insert, update, delete on table public.listing_user_preferences to service_role;

create function public.record_listing_user_preference(
  p_visitor_id uuid,
  p_anonymous_visitor_id uuid,
  p_listing_key text,
  p_listing_source text,
  p_status text,
  p_candidate_no integer,
  p_listing_no bigint,
  p_updated_at timestamptz
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

  if p_status is null then
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
    updated_at
  )
  values (
    p_visitor_id,
    p_listing_key,
    p_listing_source,
    p_status,
    p_candidate_no,
    p_listing_no,
    p_updated_at
  )
  on conflict on constraint listing_user_preferences_pkey
  do update set
    listing_source = excluded.listing_source,
    status = excluded.status,
    candidate_no = excluded.candidate_no,
    listing_no = excluded.listing_no,
    updated_at = excluded.updated_at
  where public.listing_user_preferences.updated_at <= excluded.updated_at;
end;
$$;

revoke all on function public.record_listing_user_preference(uuid, uuid, text, text, text, integer, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_listing_user_preference(uuid, uuid, text, text, text, integer, bigint, timestamptz)
  to service_role;

create view public.listing_preference_stats
with (security_invoker = true)
as
select
  listing_key,
  status,
  count(*)::bigint as user_count
from public.listing_user_preferences
group by listing_key, status;

revoke all on table public.listing_preference_stats from anon, authenticated;
grant select on table public.listing_preference_stats to service_role;
