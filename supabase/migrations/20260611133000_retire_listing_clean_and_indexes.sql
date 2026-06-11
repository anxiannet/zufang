begin;

drop view if exists public.commute_enrichment_queue;
drop view if exists public.commute_jobs_pending;
drop view if exists public.geocoding_jobs_pending;
drop view if exists public.tenant_recommendations_view;
drop view if exists public.listing_ai_search_view;
drop view if exists public.listing_ai_search_view_v2;
drop view if exists public.listing_display_view;
drop view if exists public.listings_missing_coordinates;
drop view if exists public.ntu_commute_recommended_listings;
drop view if exists public.ntu_distance_recommended_listings;
drop view if exists public.ntu_real_commute_recommended_listings;
drop view if exists public.ntu_recommended_listings;
drop view if exists public.school_commute_recommended_listings;

drop trigger if exists trg_protect_ai_semantic_tags_from_empty_reindex on public.listing_indexes;

drop function if exists public.enqueue_commute_jobs();
drop function if exists public.enqueue_geocoding_jobs();
drop function if exists public.refresh_distance_commute_estimates();
drop function if exists public.sync_commute_cache_to_listing_indexes();
drop function if exists public.sync_geocoding_cache_to_listing_indexes();
drop function if exists public.protect_ai_semantic_tags_from_empty_reindex();

alter table if exists public.tenant_property_matches
  drop constraint if exists tenant_property_matches_listing_index_id_fkey;

alter table if exists public.listing_ai_analysis
  drop constraint if exists listing_ai_analysis_listing_index_id_fkey;

alter table if exists public.commute_enrichment_jobs
  drop constraint if exists commute_enrichment_jobs_listing_index_id_fkey;

alter table if exists public.listing_commute_cache
  drop constraint if exists listing_commute_cache_listing_index_id_fkey;

drop table if exists public.listing_indexes;
drop table if exists public.listing_clean;

commit;
