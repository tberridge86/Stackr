import AsyncStorage from '@react-native-async-storage/async-storage';
import { CataloguePriceCache } from './cataloguePriceCacheCore';
import { stackrApiClient, type StackrApiClient, type StackrCataloguePriceRow } from './stackrApiV1';
import { sha256Text } from './cataloguePriceHash';

export const cataloguePriceCache = new CataloguePriceCache(AsyncStorage);
const unavailableServers = new WeakMap<StackrApiClient, { until: number; error: unknown }>();
export type CataloguePriceOptions = { language?: string | null; estimateMode?: 'exact' | 'general'; force?: boolean };

function toStackrApiLanguage(value?: string | null) {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!language || language === 'all') return null;
  if (language === 'en' || language === 'english') return 'en';
  if (language === 'ja' || language === 'jp' || language === 'japanese') return 'ja';
  if (language === 'ko' || language === 'kr' || language === 'korean') return 'ko';
  if (['zh-cn', 'zh-hans', 'zhcn', 'cn', 'chinese-simplified', 'simplified-chinese'].includes(language)) return 'zh-cn';
  if (['zh', 'zh-tw', 'zh-hant', 'zhtw', 'tw', 'chinese', 'traditional-chinese'].includes(language)) return 'zh-tw';
  return null;
}

export function cataloguePriceScope(accountScope: string, options: CataloguePriceOptions) {
  const mode = options.estimateMode ?? 'exact';
  const condition = mode === 'general' ? 'raw_market_unspecified' : 'raw_near_mint';
  return `${accountScope}|${toStackrApiLanguage(options.language) ?? 'all'}|${mode}|${condition}|GBP`;
}

export async function fetchCataloguePrices(references: string[], options: CataloguePriceOptions = {}, client = stackrApiClient) {
  const accountScope = await client.getPricingCacheScope();
  return cataloguePriceCache.read(cataloguePriceScope(accountScope, options), references,
    async (refs, knownRevisions) => {
      try {
        const unavailable = unavailableServers.get(client);
        if (unavailable && unavailable.until > Date.now()) throw unavailable.error;
        if (await client.getPricingCacheScope() !== accountScope) throw new Error('Pricing account changed.');
        const page = (await client.cataloguePrices({
          references: refs, language: toStackrApiLanguage(options.language) ?? undefined,
          estimateMode: options.estimateMode ?? 'exact', knownRevisions,
        })).data;
        if (await client.getPricingCacheScope() !== accountScope) throw new Error('Pricing account changed.');
        return page;
      } catch (error: any) {
        if (isUnavailableCataloguePriceRoute(error)) unavailableServers.set(client, { until: Date.now() + 5 * 60_000, error });
        throw error;
      }
    }, options.force);
}

export function isUnavailableCataloguePriceRoute(error: any) {
  return [400, 404, 405, 501].includes(error?.status)
    && ['route_not_found', 'unsupported_path', 'invalid_path', 'not_found', 'unsupported_route'].includes(error?.code ?? '');
}

export function cataloguePriceDisplay(row: StackrCataloguePriceRow) {
  const price = row.price;
  const value = price?.estimates.central ?? null;
  const general = price?.fallbackEstimate?.reason === 'general_card_estimate';
  const stale = price?.freshness === 'stale' || price?.freshness === 'expired';
  const provider = String(price?.sourceBreakdown?.[0]?.provider ?? '').trim().toLowerCase();
  const providerLabel = provider === 'cardmarket_public' ? 'Cardmarket'
    : provider === 'tcgplayer' || provider === 'tcgcsv' ? 'TCGplayer'
      : null;
  const classificationLabel = price?.classification === 'EXACT_PRICE' ? 'Exact price'
    : price?.classification === 'MARKET_GUIDE' ? 'Market guide'
      : price?.classification === 'ESTIMATED_VALUE' ? 'Estimated value'
        : price?.classification === 'PRICE_UNAVAILABLE' ? 'Price unavailable' : null;
  return {
    displayPrice: value, currency: price?.currency ?? 'GBP', priceType: 'market_estimate',
    updatedAt: price?.calculatedAt ?? null, pricingStatus: value == null ? 'unavailable' : stale ? 'stale' : 'priced',
    sourceLabel: classificationLabel
      ? `${stale ? 'Stale ' : ''}${providerLabel ? `${providerLabel} · ` : ''}${classificationLabel}`
      : `${stale ? 'Stale ' : ''}${providerLabel ? `${providerLabel} ` : ''}${general ? 'general market estimate' : 'market estimate'}`,
    confidence: price?.confidence.label ?? null, unavailableReason: row.unavailableReason,
    priceBasis: general ? 'general' as const : 'exact' as const,
  };
}

export type CataloguePriceDisplay = ReturnType<typeof cataloguePriceDisplay>;

/** Preserve the exact detail response, including sale provenance. This cache is
 * separate from general list estimates and includes the requested condition. */
export async function fetchCachedRawDetailPrice(identity: { variantId: string; cardId: string; language: string },
  query: Parameters<StackrApiClient['cardPrice']>[1], client = stackrApiClient, force = false) {
  const accountScope = await client.getPricingCacheScope();
  const scope = `${accountScope}|detail|${identity.language}|raw_card|GBP|${query?.condition ?? 'unspecified'}`;
  const refs = [identity.variantId];
  const rows = await cataloguePriceCache.read(scope, refs, async () => {
    if (await client.getPricingCacheScope() !== accountScope) throw new Error('Pricing account changed.');
    const price = (await client.cardPrice(identity.variantId, query)).data;
    if (await client.getPricingCacheScope() !== accountScope) throw new Error('Pricing account changed.');
    const value = { reference: identity.variantId, cardId: identity.cardId, variantId: identity.variantId,
      language: identity.language, price, unavailableReason: price.unavailableReason, nextRetryAt: null };
    const row = { ...value, revision: sha256Text(JSON.stringify(value)) };
    return { prices: [row], unchangedReferences: [], priceRevision: row.revision, estimateMode: 'exact' };
  }, force);
  return rows.get(identity.variantId)!.price!;
}
