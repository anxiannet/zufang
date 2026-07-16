export const LISTING_VISIBILITY_WINDOW_DAYS = 30;

export function get_listing_visibility_cutoff(reference_date = new Date()): string {
  return new Date(
    reference_date.getTime() - LISTING_VISIBILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function is_listing_date_visible(value: string, reference_date = new Date()): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(get_listing_visibility_cutoff(reference_date));
}
