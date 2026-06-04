alter table public.listing_indexes
  add column if not exists semantic_tags text[] default '{}'::text[];

create index if not exists listing_indexes_semantic_tags_gin
  on public.listing_indexes using gin (semantic_tags);

create index if not exists listing_indexes_school_fit_tags_gin
  on public.listing_indexes using gin (school_fit_tags);

create index if not exists listing_indexes_amenities_gin
  on public.listing_indexes using gin (amenities);

create index if not exists listing_indexes_tags_gin
  on public.listing_indexes using gin (tags);
