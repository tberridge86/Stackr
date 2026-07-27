import { pricingV2Config } from '../config.js';
import { normalizeLanguageForDb } from '../identity.js';

function snapshotObservations(row, identity) {
  const fetchedAt = row.snapshot_at ?? row.calculated_at ?? new Date().toISOString();
  const base = {
    externalReference: row.id ?? null,
    title: `${identity.canonicalCardName ?? identity.cardId} ${identity.printedCardNumber ?? ''}`.trim(),
    currency: 'GBP',
    listedAt: fetchedAt,
    soldAt: null,
    language: identity.language,
    rawPayload: row,
  };

  const observations = [];
  if (row.tcgdex_price != null) {
    observations.push({
      ...base,
      sourceId: 'tcgdex_market',
      sourceType: 'market_estimate',
      itemPrice: row.tcgdex_price,
      metadata: { provider: 'tcgdex', sourceColumn: 'tcgdex_price' },
    });
  }
  if (row.tcg_mid != null) {
    observations.push({
      ...base,
      sourceId: 'tcgplayer_market',
      sourceType: 'market_estimate',
      itemPrice: row.tcg_mid,
      metadata: { provider: 'tcgplayer_or_tcgcsv', sourceColumn: 'tcg_mid' },
    });
  }
  if (row.cardmarket_trend != null) {
    observations.push({
      ...base,
      sourceId: 'cardmarket_market',
      sourceType: 'market_estimate',
      itemPrice: row.cardmarket_trend,
      metadata: { provider: 'cardmarket', sourceColumn: 'cardmarket_trend' },
    });
  }
  if (row.ebay_average != null) {
    observations.push({
      ...base,
      sourceId: 'legacy_ebay_summary',
      sourceType: 'market_estimate',
      itemPrice: row.ebay_average,
      metadata: {
        provider: 'legacy_ebay_summary',
        sourceColumn: 'ebay_average',
        warning: 'Legacy eBay summary may include third-party sold search or active fallback; V2 does not treat it as verified sold evidence.',
      },
    });
  }
  return observations;
}

function marketPriceObservations(row, identity) {
  const fetchedAt = row.retrieved_at ?? row.provider_updated_at ?? new Date().toISOString();
  const displayPrice = row.display_price ?? row.market ?? row.average ?? row.low ?? row.last_sold;
  if (displayPrice == null) return [];
  return [{
    sourceId: row.source_provider ? `market_price_${row.source_provider}` : 'market_price_table',
    sourceType: 'market_estimate',
    externalReference: row.id ?? null,
    title: `${identity.canonicalCardName ?? identity.cardId} ${identity.printedCardNumber ?? ''}`.trim(),
    itemPrice: displayPrice,
    shippingPrice: 0,
    currency: row.display_currency ?? row.currency ?? 'GBP',
    listedAt: fetchedAt,
    soldAt: null,
    language: row.language ?? identity.language,
    metadata: {
      provider: row.source_provider ?? null,
      priceType: row.price_type ?? null,
      confidence: row.confidence ?? null,
    },
    rawPayload: row,
  }];
}

function legacyObservationRows(rows, identity) {
  return rows
    .map((row) => {
      const isVerifiedSold = (row.verified_sale === true)
        && ['sold_listing', 'sold_transaction'].includes(String(row.source_type ?? '').toLowerCase());
      return {
        sourceId: row.source === 'manual_verified_comp' ? 'manual_verified_comp' : `existing_${row.source ?? 'price_observation'}`,
        sourceType: isVerifiedSold
          ? 'sold_transaction'
          : String(row.source_type ?? '').toLowerCase() === 'active_listing'
            ? 'active_listing'
            : 'market_estimate',
        externalReference: row.external_reference ?? row.id ?? null,
        title: row.title ?? `${identity.canonicalCardName ?? identity.cardId} ${identity.printedCardNumber ?? ''}`.trim(),
        itemPrice: row.normalised_delivered_price_gbp ?? row.converted_price_gbp ?? row.original_item_price ?? row.original_price,
        shippingPrice: 0,
        currency: 'GBP',
        listedAt: row.listed_at ?? row.observed_at ?? row.created_at ?? null,
        soldAt: row.sold_at ?? null,
        language: row.language ?? identity.language,
        condition: row.raw_condition ?? row.condition ?? null,
        gradingCompany: row.grading_company ?? row.grader ?? null,
        grade: row.grade ?? null,
        metadata: {
          provider: row.source ?? null,
          existingObservationId: row.id ?? null,
          verifiedSale: row.verified_sale ?? false,
        },
        rawPayload: row,
      };
    });
}

export function createExistingStackrAdapter({ supabase }, config = pricingV2Config.sources.existing_stackr_source) {
  return {
    id: 'existing_stackr_source',
    displayName: 'Existing Stackr cached prices',
    capabilities: {
      soldTransactions: true,
      activeListings: true,
      marketEstimate: true,
      rawCards: true,
      gradedCards: true,
      sealedProducts: true,
      supportedLanguages: ['en', 'ja', 'zh-CN', 'zh-TW', 'ko'],
      supportedCurrencies: ['GBP'],
    },
    async healthCheck() {
      if (!config.enabled) return { status: 'disabled', message: 'Existing Stackr source disabled.' };
      if (!supabase) return { status: 'unavailable', message: 'Supabase client unavailable.' };
      return { status: 'ok', message: 'Existing Stackr cached price tables available.' };
    },
    async searchPrices(identity) {
      if (!config.enabled || !supabase) return [];
      const language = normalizeLanguageForDb(identity.language);
      const observations = [];

      const { data: snapshots } = await supabase
        .from('market_price_snapshots')
        .select('*')
        .eq('card_id', identity.cardId)
        .eq('language', language)
        .order('snapshot_at', { ascending: false })
        .limit(10);
      for (const row of snapshots ?? []) observations.push(...snapshotObservations(row, identity));

      const { data: marketPrices } = await supabase
        .from('market_prices')
        .select('*')
        .in('entity_id', [identity.cardId, identity.setId ? `${identity.setId}-${identity.cardNumber}` : identity.cardId])
        .eq('language', language)
        .order('retrieved_at', { ascending: false })
        .limit(20);
      for (const row of marketPrices ?? []) observations.push(...marketPriceObservations(row, identity));

      const { data: priceObservations } = await supabase
        .from('price_observations')
        .select('*')
        .or(`stackr_card_id.eq.${identity.cardId},card_id.eq.${identity.cardId}`)
        .eq('language', language)
        .order('observed_at', { ascending: false })
        .limit(30);
      observations.push(...legacyObservationRows(priceObservations ?? [], identity));

      return observations;
    },
  };
}
