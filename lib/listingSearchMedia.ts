const LISTING_SEARCH_FIELDS = 'id, card_id, set_id, product_name, product_type, pricing_mode, grade_company, grade, asking_price, trade_only, listing_status, condition, listing_images, created_at';
const LISTING_SEARCH_MEDIA_FIELDS = ', official_image_url, listing_media, seller_front_image_url, seller_back_image_url';

function isMissingListingSearchMedia(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const fields = error as Record<string, unknown>;
  const code = typeof fields.code === 'string' ? fields.code : '';
  const message = [fields.message, fields.details, fields.hint]
    .filter((value): value is string => typeof value === 'string').join(' ');
  return /^(42703|PGRST204)$/.test(code)
    && /\b(listing_media|official_image_url|seller_front_image_url|seller_back_image_url)\b/i.test(message);
}

export async function fetchListingSearchWithMedia<T extends { error?: unknown }>(
  load: (select: string) => PromiseLike<T>,
  canRetry: () => boolean = () => true,
): Promise<T> {
  const result = await load(LISTING_SEARCH_FIELDS + LISTING_SEARCH_MEDIA_FIELDS);
  if (isMissingListingSearchMedia(result.error) && canRetry()) {
    return load(LISTING_SEARCH_FIELDS);
  }
  return result;
}
