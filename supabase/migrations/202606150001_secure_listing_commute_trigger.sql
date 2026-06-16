create or replace function public.enqueue_listing_postal_commute()
returns trigger
language plpgsql
security definer
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

revoke all on function public.enqueue_listing_postal_commute() from public;
