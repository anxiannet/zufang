do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listing_indexes'
      and column_name = 'listing_no'
  ) then
    alter table public.listing_indexes add column listing_no bigint;
  end if;
end $$;

create sequence if not exists public.listing_no_seq start with 10001;

with numbered as (
  select
    id,
    row_number() over(order by id asc) + 10000 as new_listing_no
  from public.listing_indexes
  where listing_no is null
)
update public.listing_indexes li
set listing_no = numbered.new_listing_no
from numbered
where li.id = numbered.id;

select setval(
  'public.listing_no_seq',
  greatest(10000, coalesce((select max(listing_no) from public.listing_indexes), 10000)),
  true
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listing_indexes_listing_no_unique'
  ) then
    alter table public.listing_indexes
      add constraint listing_indexes_listing_no_unique unique (listing_no);
  end if;
end $$;

alter table public.listing_indexes
  alter column listing_no set default nextval('public.listing_no_seq');
