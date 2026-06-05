create or replace function public.enqueue_commute_enrichment_job_for_listing_index()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  if new.postal_code is null and new.address_text is null then
    return new;
  end if;

  insert into public.commute_enrichment_jobs (
    listing_index_id,
    postal_code,
    address_text,
    status,
    retry_count,
    last_error,
    updated_at
  )
  values (
    new.id,
    new.postal_code,
    new.address_text,
    'pending',
    0,
    null,
    now()
  )
  on conflict (listing_index_id) do update
  set
    postal_code = excluded.postal_code,
    address_text = excluded.address_text,
    status = case
      when public.commute_enrichment_jobs.status = 'completed'
        and public.commute_enrichment_jobs.postal_code is not distinct from excluded.postal_code
        and public.commute_enrichment_jobs.address_text is not distinct from excluded.address_text
      then public.commute_enrichment_jobs.status
      else 'pending'
    end,
    retry_count = case
      when public.commute_enrichment_jobs.status = 'completed'
        and public.commute_enrichment_jobs.postal_code is not distinct from excluded.postal_code
        and public.commute_enrichment_jobs.address_text is not distinct from excluded.address_text
      then public.commute_enrichment_jobs.retry_count
      else 0
    end,
    last_error = case
      when public.commute_enrichment_jobs.status = 'completed'
        and public.commute_enrichment_jobs.postal_code is not distinct from excluded.postal_code
        and public.commute_enrichment_jobs.address_text is not distinct from excluded.address_text
      then public.commute_enrichment_jobs.last_error
      else null
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists listing_indexes_enqueue_commute_job on public.listing_indexes;

create trigger listing_indexes_enqueue_commute_job
after insert or update of postal_code, address_text, status
on public.listing_indexes
for each row
execute function public.enqueue_commute_enrichment_job_for_listing_index();
