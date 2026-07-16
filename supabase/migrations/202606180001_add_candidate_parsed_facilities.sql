alter table public.listing_import_candidates
  add column if not exists parsed_facilities jsonb not null default '[]'::jsonb;
