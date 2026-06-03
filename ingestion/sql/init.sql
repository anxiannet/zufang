DO $$
BEGIN
  IF to_regclass('public.ingestion_listings') IS NULL
    AND to_regclass('public.crawler_listings') IS NOT NULL
  THEN
    ALTER TABLE public.crawler_listings RENAME TO ingestion_listings;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ingestion_listings (
  id BIGSERIAL PRIMARY KEY,

  source VARCHAR(50),
  source_id VARCHAR(255),

  title TEXT,
  listing_url TEXT,

  category TEXT,
  mrt_area TEXT,

  price INTEGER,

  phone TEXT,
  wechat TEXT,

  tags TEXT[],

  posted_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),

  raw_text TEXT,
  raw_html TEXT,

  is_top BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.ingestion_listings_source_source_id_uidx') IS NULL
    AND to_regclass('public.crawler_listings_source_source_id_uidx') IS NOT NULL
  THEN
    ALTER INDEX public.crawler_listings_source_source_id_uidx RENAME TO ingestion_listings_source_source_id_uidx;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_listings_source_source_id_uidx
  ON public.ingestion_listings (source, source_id);

ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS detail_url TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_title TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_posted_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_price INTEGER;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_contact TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_raw_html TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS list_raw_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS posted_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS contact_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS whatsapp_url TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS cea_reg_no TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS raw_detail_html TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS raw_detail_text TEXT;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS removed_from_source BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS user_corrected_fields JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.ingestion_listings ADD COLUMN IF NOT EXISTS latest_source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE IF NOT EXISTS public.listing_change_logs (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  scraped_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_change_logs_source_source_id_idx
  ON public.listing_change_logs (source, source_id, created_at DESC);
