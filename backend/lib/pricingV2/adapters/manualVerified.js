import { pricingV2Config } from '../config.js';
import { normalizeLanguageForDb } from '../identity.js';

export function createManualVerifiedCompAdapter({ supabase }, config = pricingV2Config.sources.manual_verified_comp) {
  return {
    id: 'manual_verified_comp',
    displayName: 'Manual verified comps',
    capabilities: {
      soldTransactions: true,
      activeListings: false,
      marketEstimate: false,
      rawCards: true,
      gradedCards: true,
      sealedProducts: true,
      supportedLanguages: ['en', 'ja', 'zh-CN', 'zh-TW', 'ko'],
      supportedCurrencies: ['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD'],
    },
    async healthCheck() {
      if (!config.enabled) return { status: 'disabled', message: 'Manual verified comps disabled.' };
      if (!supabase) return { status: 'unavailable', message: 'Supabase client unavailable.' };
      return { status: 'ok', message: 'Manual verified comp table available.' };
    },
    async searchPrices(identity) {
      if (!config.enabled || !supabase) return [];
      const { data } = await supabase
        .from('price_observations')
        .select('*')
        .or(`stackr_card_id.eq.${identity.cardId},card_id.eq.${identity.cardId}`)
        .eq('language', normalizeLanguageForDb(identity.language))
        .eq('source', 'manual_verified_comp')
        .eq('verified_sale', true)
        .order('sold_at', { ascending: false })
        .limit(40);

      return (data ?? []).map((row) => ({
        sourceId: 'manual_verified_comp',
        sourceType: 'sold_transaction',
        externalReference: row.external_reference ?? row.id ?? null,
        title: row.title ?? `${identity.canonicalCardName ?? identity.cardId} ${identity.printedCardNumber ?? ''}`.trim(),
        itemPrice: row.original_item_price ?? row.original_price ?? row.normalised_delivered_price_gbp ?? row.converted_price_gbp,
        shippingPrice: row.original_shipping_price ?? 0,
        currency: row.original_currency ?? 'GBP',
        soldAt: row.sold_at ?? row.observed_at ?? row.created_at ?? null,
        listedAt: null,
        language: row.language ?? identity.language,
        condition: row.raw_condition ?? row.condition ?? null,
        gradingCompany: row.grading_company ?? row.grader ?? null,
        grade: row.grade ?? null,
        metadata: {
          existingObservationId: row.id,
          reviewerVerified: true,
        },
        rawPayload: row,
      }));
    },
  };
}
