update public.ingestion_listings
set
  raw_text = coalesce(raw_text, raw_detail_text, list_raw_text),
  raw_html = coalesce(raw_html, raw_detail_html, list_raw_html)
where raw_text is null
   or raw_html is null;
