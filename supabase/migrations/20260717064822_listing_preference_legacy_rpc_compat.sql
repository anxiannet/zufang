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
language sql
security invoker
set search_path = ''
as $$
  select public.record_listing_user_preference(
    p_visitor_id,
    p_anonymous_visitor_id,
    p_listing_key,
    p_listing_source,
    p_status,
    p_candidate_no,
    p_listing_no,
    p_updated_at,
    null::jsonb,
    false
  );
$$;

revoke all on function public.record_listing_user_preference(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  bigint,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_listing_user_preference(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  bigint,
  timestamptz
) to service_role;
