update public.ingestion_listings
set raw_detail_html = coalesce(raw_detail_html, raw_html)
where raw_detail_html is null
  and raw_html is not null;

drop index if exists public.ingestion_listings_needs_review_idx;

alter table public.ingestion_listings
  drop column if exists title,
  drop column if exists category,
  drop column if exists mrt_area,
  drop column if exists price,
  drop column if exists phone,
  drop column if exists wechat,
  drop column if exists tags,
  drop column if exists posted_at,
  drop column if exists raw_text,
  drop column if exists raw_html,
  drop column if exists posted_text,
  drop column if exists contact_text,
  drop column if exists whatsapp_url,
  drop column if exists body_text,
  drop column if exists cea_reg_no,
  drop column if exists raw_detail_text,
  drop column if exists needs_review,
  drop column if exists user_corrected_fields,
  drop column if exists latest_source_snapshot;
