begin;

alter table public.listings
  add column if not exists listing_no integer,
  add column if not exists description_clean text,
  add column if not exists source text not null default 'owner_submit',
  add column if not exists contact_visibility text not null default 'private',
  add column if not exists wechat text,
  add column if not exists phone text,
  add column if not exists is_owner_direct boolean not null default false,
  add column if not exists is_agent boolean not null default false,
  add column if not exists is_sublet boolean not null default false,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists utilities_policy text,
  add column if not exists aircon_policy text,
  add column if not exists cooking_policy text,
  add column if not exists visitors_policy text,
  add column if not exists smoking_policy text,
  add column if not exists pets_policy text,
  add column if not exists tenant_type_preference text[] not null default '{}',
  add column if not exists available_note text,
  add column if not exists internal_note text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'cooking_allowed'
  ) then
    update public.listings
    set cooking_policy = case when cooking_allowed then 'light' else 'no' end
    where cooking_policy is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'visitors_allowed'
  ) then
    update public.listings
    set visitors_policy = case when visitors_allowed then 'allowed' else 'not_allowed' end
    where visitors_policy is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'smoking_allowed'
  ) then
    update public.listings
    set smoking_policy = case when smoking_allowed then 'allowed' else 'not_allowed' end
    where smoking_policy is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'pets_allowed'
  ) then
    update public.listings
    set pets_policy = case when pets_allowed then 'allowed' else 'not_allowed' end
    where pets_policy is null;
  end if;
end $$;

create sequence if not exists public.listings_listing_no_seq
  as integer
  minvalue 10001
  maxvalue 99999
  start with 10001;

with numbered as (
  select
    id,
    row_number() over (order by created_at asc nulls last, id asc)
      + coalesce((select max(listing_no) from public.listings), 10000) as new_listing_no
  from public.listings
  where listing_no is null
)
update public.listings as listings
set listing_no = numbered.new_listing_no
from numbered
where listings.id = numbered.id;

select setval(
  'public.listings_listing_no_seq',
  coalesce((select max(listing_no) from public.listings), 10001),
  (select max(listing_no) is not null from public.listings)
);

alter sequence public.listings_listing_no_seq owned by public.listings.listing_no;

alter table public.listings
  alter column listing_no set default nextval('public.listings_listing_no_seq'),
  alter column listing_no set not null;

drop index if exists public.listings_search_idx;

alter table public.listings
  drop column if exists property_type,
  drop column if exists block,
  drop column if exists street_name,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists nearest_mrt,
  drop column if exists house_rules,
  drop column if exists currency,
  drop column if exists cooking_allowed,
  drop column if exists visitors_allowed,
  drop column if exists smoking_allowed,
  drop column if exists pets_allowed,
  drop column if exists whatsapp;

alter table public.listings drop constraint if exists listings_listing_no_check;
alter table public.listings drop constraint if exists listings_listing_no_unique;
alter table public.listings drop constraint if exists listings_source_check;
alter table public.listings drop constraint if exists listings_contact_visibility_check;
alter table public.listings drop constraint if exists listings_verification_status_check;
alter table public.listings drop constraint if exists listings_utilities_policy_check;
alter table public.listings drop constraint if exists listings_aircon_policy_check;
alter table public.listings drop constraint if exists listings_cooking_policy_check;
alter table public.listings drop constraint if exists listings_visitors_policy_check;
alter table public.listings drop constraint if exists listings_smoking_policy_check;
alter table public.listings drop constraint if exists listings_pets_policy_check;

alter table public.listings
  add constraint listings_listing_no_check check (listing_no between 10000 and 99999),
  add constraint listings_listing_no_unique unique (listing_no),
  add constraint listings_source_check check (source in ('owner_submit', 'wechat_group', 'zufang', 'xiaohongshu', 'manual')),
  add constraint listings_contact_visibility_check check (contact_visibility in ('public', 'login_only', 'group_only', 'private')),
  add constraint listings_verification_status_check check (verification_status in ('unverified', 'owner_verified', 'agent_verified', 'suspicious', 'rejected')),
  add constraint listings_utilities_policy_check check (utilities_policy is null or utilities_policy in ('included', 'shared', 'excluded', 'capped')),
  add constraint listings_aircon_policy_check check (aircon_policy is null or aircon_policy in ('included', 'extra_charge', 'limited_hours', 'not_available')),
  add constraint listings_cooking_policy_check check (cooking_policy is null or cooking_policy in ('full', 'light', 'no')),
  add constraint listings_visitors_policy_check check (visitors_policy is null or visitors_policy in ('allowed', 'limited', 'not_allowed')),
  add constraint listings_smoking_policy_check check (smoking_policy is null or smoking_policy in ('allowed', 'not_allowed')),
  add constraint listings_pets_policy_check check (pets_policy is null or pets_policy in ('allowed', 'not_allowed'));

create index if not exists listings_search_idx
  on public.listings
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(description_clean, '')
    )
  );

commit;
