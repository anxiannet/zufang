ALTER TABLE listing_clean
DROP COLUMN IF EXISTS category,
DROP COLUMN IF EXISTS whatsapp_url,
DROP COLUMN IF EXISTS contact_text,
DROP COLUMN IF EXISTS posted_text,
DROP COLUMN IF EXISTS body_text,
DROP COLUMN IF EXISTS raw_html_available,
DROP COLUMN IF EXISTS parsed_from_html,
DROP COLUMN IF EXISTS raw_snapshot;