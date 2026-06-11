begin;

create sequence if not exists public.listing_import_candidates_candidate_no_seq;

alter table public.listing_import_candidates
  add column if not exists candidate_no integer;

alter table public.listing_import_candidates
  alter column candidate_no set default nextval('public.listing_import_candidates_candidate_no_seq'::regclass);

update public.listing_import_candidates
set candidate_no = nextval('public.listing_import_candidates_candidate_no_seq'::regclass)
where candidate_no is null;

select setval(
  'public.listing_import_candidates_candidate_no_seq'::regclass,
  greatest(coalesce((select max(candidate_no) from public.listing_import_candidates), 0), 1),
  true
);

alter sequence public.listing_import_candidates_candidate_no_seq
  owned by public.listing_import_candidates.candidate_no;

alter table public.listing_import_candidates
  alter column candidate_no set not null;

alter table public.listing_import_candidates
  drop constraint if exists listing_import_candidates_candidate_no_range_check;

alter table public.listing_import_candidates
  add constraint listing_import_candidates_candidate_no_range_check
  check (candidate_no between 1 and 9999);

create unique index if not exists listing_import_candidates_candidate_no_uidx
  on public.listing_import_candidates(candidate_no);

comment on column public.listing_import_candidates.candidate_no
  is '候选房源编号，对外显示为 C0001';

commit;
