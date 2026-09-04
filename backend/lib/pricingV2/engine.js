import { pricingV2Config, PRICING_METHODOLOGY_VERSION } from './config.js';
import { buildCanonicalIdentity, normalizeLanguageForDb } from './identity.js';
import { generatePricingQueries } from './queryGenerator.js';
import { scoreObservationMatch } from './matcher.js';
import { normaliseObservation } from './normalise.js';
import { calculatePricingEstimate } from './statistics.js';
import { calculateConfidence } from './confidence.js';
import { createPricingSourceAdapters } from './adapters/index.js';

function dateAfterHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function getNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicSnapshotState(row) {
  if (!row) return 'insufficient_exact_market_evidence';
  if (row.is_stale) return 'stale_verified_value';
  if (row.price_type === 'asking_price_indication' || row.primary_source === 'ebay_active') {
    return 'asking_price_indication';
  }
  if (row.market_price_gbp != null) return 'market_value';
  return 'insufficient_exact_market_evidence';
}

async function fetchCardRow(supabase, cardId, productType = 'raw_card') {
  if (!cardId) return null;

  if (productType === 'sealed_product') {
    const { data: product } = await supabase
      .from('market_products')
      .select('*')
      .eq('id', cardId)
      .maybeSingle();
    if (product) {
      return {
        id: product.id,
        name: product.name,
        language: product.language ?? 'en',
        region: product.region,
        raw_data: {
          ...product,
          product_type: product.product_type,
          set: {
            id: product.set_id,
            name: product.set_name,
            set_code: product.set_code,
          },
        },
      };
    }
  }

  const { data: pokemonCard } = await supabase
    .from('pokemon_cards')
    .select('*')
    .eq('id', cardId)
    .maybeSingle();
  if (pokemonCard) return pokemonCard;

  const { data: canonicalCard } = await supabase
    .from('tcg_cards')
    .select('*')
    .eq('id', cardId)
    .maybeSingle();
  if (canonicalCard) {
    return {
      id: canonicalCard.id,
      name: canonicalCard.local_name ?? canonicalCard.canonical_name ?? canonicalCard.english_display_name,
      language: canonicalCard.language,
      region: canonicalCard.region,
      number: canonicalCard.collector_number,
      rarity: canonicalCard.rarity,
      set_id: canonicalCard.set_id,
      raw_data: {
        ...canonicalCard.raw_payload,
        canonical_name: canonicalCard.canonical_name,
        local_name: canonicalCard.local_name,
        english_display_name: canonicalCard.english_display_name,
        number: canonicalCard.collector_number,
        set: { id: canonicalCard.set_id },
      },
    };
  }

  return null;
}

async function fetchLatestSnapshot(supabase, identity) {
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('*')
    .eq('card_id', identity.cardId)
    .eq('canonical_identity_key', identity.identityKey)
    .eq('methodology_version', PRICING_METHODOLOGY_VERSION)
    .order('calculated_at', { ascending: false })
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { snapshot: null, error };
  return { snapshot: data ?? null, error: null };
}

async function fetchLatestStaleCompatibleSnapshot(supabase, identity) {
  const cutoff = new Date(Date.now() - pricingV2Config.staleFallbackDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('*')
    .eq('card_id', identity.cardId)
    .eq('canonical_identity_key', identity.identityKey)
    .eq('methodology_version', PRICING_METHODOLOGY_VERSION)
    .not('market_price_gbp', 'is', null)
    .gte('calculated_at', cutoff)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

function snapshotToResponse(row, identity, extra = {}) {
  const sourceBreakdown = Array.isArray(row?.source_breakdown)
    ? row.source_breakdown
    : Array.isArray(row?.calculation_summary?.sourceBreakdown)
      ? row.calculation_summary.sourceBreakdown
      : [];
  const state = publicSnapshotState(row);
  const value = row?.market_price_gbp ?? (state === 'asking_price_indication' ? row?.active_listing_indication_gbp : null);

  return {
    cardId: identity.cardId,
    identityKey: identity.identityKey,
    currency: 'GBP',
    state,
    marketPrice: getNumeric(value),
    lowPrice: getNumeric(row?.low_price_gbp),
    highPrice: getNumeric(row?.high_price_gbp),
    confidence: {
      score: Math.round(getNumeric(row?.confidence_score) ?? 0),
      label: row?.confidence_label ?? 'low',
      explanation: row?.confidence_explanation
        ?? row?.calculation_summary?.confidenceExplanation
        ?? (state === 'asking_price_indication'
          ? 'Low confidence: based mainly on current asking prices.'
          : 'Insufficient exact market evidence.'),
    },
    evidence: {
      compCount: row?.comp_count ?? 0,
      soldCompCount: row?.sold_comp_count ?? 0,
      activeListingCount: row?.active_listing_count ?? 0,
      sourceCount: row?.source_count ?? 0,
      primarySource: row?.primary_source ?? 'none',
      priceType: row?.price_type ?? null,
    },
    sourceBreakdown,
    lastUpdated: row?.calculated_at ?? row?.snapshot_at ?? null,
    staleAfter: row?.stale_after ?? null,
    isStale: Boolean(row?.is_stale),
    methodologyVersion: row?.methodology_version ?? PRICING_METHODOLOGY_VERSION,
    calculationSummary: row?.calculation_summary ?? null,
    refreshQueued: Boolean(extra.refreshQueued),
    featureFlagEnabled: pricingV2Config.enabled,
    accessLimitations: extra.accessLimitations ?? [],
  };
}

function unavailableResponse(identity, extra = {}) {
  return {
    cardId: identity.cardId,
    identityKey: identity.identityKey,
    currency: 'GBP',
    state: 'insufficient_exact_market_evidence',
    marketPrice: null,
    lowPrice: null,
    highPrice: null,
    confidence: {
      score: 0,
      label: 'low',
      explanation: 'Insufficient exact market evidence. A refresh has been queued where possible.',
    },
    evidence: {
      compCount: 0,
      soldCompCount: 0,
      activeListingCount: 0,
      sourceCount: 0,
      primarySource: 'none',
      priceType: 'insufficient_exact_market_evidence',
    },
    sourceBreakdown: [],
    lastUpdated: null,
    staleAfter: null,
    isStale: false,
    methodologyVersion: PRICING_METHODOLOGY_VERSION,
    calculationSummary: null,
    refreshQueued: Boolean(extra.refreshQueued),
    featureFlagEnabled: pricingV2Config.enabled,
    accessLimitations: extra.accessLimitations ?? [],
  };
}

async function queuePricingRefresh(supabase, identity, reason = 'pricing_v2_missing') {
  const { error } = await supabase
    .from('price_refresh_queue')
    .insert({
      card_id: identity.cardId,
      set_id: identity.setId || null,
      language: normalizeLanguageForDb(identity.language),
      reason,
      priority: reason === 'pricing_v2_stale' ? 75 : 85,
      metadata: {
        pricingEngine: 'v2',
        identityKey: identity.identityKey,
        productType: identity.productType,
        methodologyVersion: PRICING_METHODOLOGY_VERSION,
      },
    });
  return !error;
}

function observationToDbRow(observation) {
  const legacySourceType = observation.sourceType === 'sold_transaction'
    ? 'sold_transaction'
    : observation.sourceType === 'market_estimate'
      ? 'market_estimate'
      : observation.sourceType;
  return {
    stackr_card_id: observation.cardId,
    card_id: observation.cardId,
    canonical_identity_key: observation.canonicalIdentityKey,
    observation_hash: observation.observationHash,
    source_id: observation.sourceId,
    source: observation.sourceId,
    source_type: legacySourceType,
    external_reference: observation.externalReference,
    product_type: observation.productType,
    title: observation.title,
    original_item_price: observation.originalItemPrice,
    original_shipping_price: observation.originalShippingPrice,
    original_currency: observation.originalCurrency,
    normalised_item_price_gbp: observation.normalisedItemPriceGbp,
    normalised_delivered_price_gbp: observation.normalisedDeliveredPriceGbp,
    original_price: observation.originalItemPrice,
    converted_price_gbp: observation.normalisedDeliveredPriceGbp,
    sold_at: observation.soldAt,
    listed_at: observation.listedAt,
    fetched_at: observation.fetchedAt,
    observed_at: observation.soldAt ?? observation.listedAt ?? observation.fetchedAt,
    language: observation.dbLanguage,
    condition: observation.rawCondition,
    raw_condition: observation.rawCondition,
    grader: observation.gradingCompany,
    grading_company: observation.gradingCompany,
    grade: observation.grade,
    variant: observation.variant,
    finish: observation.finish,
    edition: observation.edition,
    match_confidence: observation.matchScore,
    match_score: observation.matchScore,
    match_explanation: observation.matchExplanation,
    source_reliability: observation.sourceReliability,
    included_in_estimate: observation.includedInEstimate,
    excluded: !observation.includedInEstimate,
    exclusion_reason: observation.exclusionReason,
    verified_sale: observation.sourceType === 'sold_transaction',
    shipping_included: observation.originalShippingPrice === 0,
    metadata_json: observation.metadata,
    raw_payload: observation.rawPayload,
    updated_at: new Date().toISOString(),
  };
}

async function persistObservations(supabase, observations) {
  if (!observations.length) return { inserted: 0, error: null };
  const rows = observations.map(observationToDbRow);
  const { error } = await supabase
    .from('price_observations')
    .upsert(rows, { onConflict: 'observation_hash' });
  return { inserted: error ? 0 : rows.length, error };
}

async function persistSources(supabase, adapters) {
  const rows = await Promise.all(adapters.map(async (adapter) => {
    const health = await adapter.healthCheck().catch((error) => ({ status: 'failed', message: error.message }));
    return {
      id: adapter.id,
      source_name: adapter.displayName,
      enabled: pricingV2Config.sources[adapter.id]?.enabled ?? false,
      source_type: adapter.capabilities.soldTransactions
        ? 'sold_transaction'
        : adapter.capabilities.activeListings
          ? 'active_listing'
          : 'market_estimate',
      reliability_weight: pricingV2Config.sources[adapter.id]?.reliabilityWeight ?? 0.3,
      supports_sold_data: Boolean(adapter.capabilities.soldTransactions),
      supports_active_data: Boolean(adapter.capabilities.activeListings),
      refresh_interval: `${pricingV2Config.sources[adapter.id]?.refreshIntervalHours ?? 24} hours`,
      rate_limit_config: {},
      health_status: health.status,
      last_success_at: health.status === 'ok' ? new Date().toISOString() : null,
      last_failure_at: health.status === 'failed' ? new Date().toISOString() : null,
      consecutive_failures: health.status === 'failed' ? 1 : 0,
    };
  }));

  await supabase.from('pricing_sources').upsert(rows, { onConflict: 'id' });
}

async function persistSnapshot(supabase, identity, estimate, confidence) {
  const calculatedAt = new Date().toISOString();
  const row = {
    user_id: null,
    card_id: identity.cardId,
    set_id: identity.setId || null,
    language: normalizeLanguageForDb(identity.language),
    canonical_identity_key: identity.identityKey,
    market_price_gbp: estimate.marketEstimate,
    low_price_gbp: estimate.lowEstimate,
    high_price_gbp: estimate.highEstimate,
    ebay_sold_estimate_gbp: estimate.ebaySoldEstimate,
    secondary_consensus_gbp: estimate.secondaryConsensusEstimate,
    active_listing_indication_gbp: estimate.activeListingIndication,
    confidence_score: confidence.score,
    confidence_label: confidence.label,
    confidence_explanation: confidence.explanation,
    comp_count: estimate.compCount,
    sold_comp_count: estimate.soldCompCount,
    active_listing_count: estimate.activeListingCount,
    source_count: estimate.sourceCount,
    volatility: estimate.volatility,
    primary_source: estimate.primarySource,
    price_type: estimate.priceType,
    methodology_version: PRICING_METHODOLOGY_VERSION,
    calculated_at: calculatedAt,
    stale_after: dateAfterHours(pricingV2Config.staleAfterHours),
    is_stale: false,
    source_breakdown: estimate.sourceBreakdown,
    pricing_identity_json: identity,
    calculation_summary: {
      decisionCase: estimate.decisionCase,
      priceType: estimate.priceType,
      confidenceExplanation: confidence.explanation,
      rejectedObservationCount: estimate.rejectedObservationCount,
      outlierCount: estimate.outlierCount,
      disagreementPercentage: estimate.disagreementPercentage,
      disagreementReason: estimate.disagreementReason,
      methodologyVersion: PRICING_METHODOLOGY_VERSION,
    },
    price_source: estimate.primarySource,
    snapshot_at: calculatedAt,
  };

  const { data, error } = await supabase
    .from('market_price_snapshots')
    .insert(row)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? row;
}

async function enqueueReviewIfNeeded(supabase, identity, estimate) {
  if (!estimate.needsReview && estimate.marketEstimate != null) return;
  const reason = estimate.needsReview
    ? 'source_disagreement'
    : 'no_exact_market_evidence';
  await supabase
    .from('pricing_review_queue')
    .insert({
      card_id: identity.cardId,
      canonical_identity_key: identity.identityKey,
      reason,
      disagreement_percentage: estimate.disagreementPercentage,
      priority: reason === 'source_disagreement' ? 90 : 60,
      status: 'open',
      metadata: {
        methodologyVersion: PRICING_METHODOLOGY_VERSION,
        decisionCase: estimate.decisionCase,
        sourceBreakdown: estimate.sourceBreakdown,
      },
    });
}

export async function getCachedPricingResponse(supabase, cardId, query = {}) {
  const productType = query.productType ?? (query.gradingCompany || query.grade ? 'graded_card' : 'raw_card');
  const cardRow = await fetchCardRow(supabase, cardId, productType);
  if (!cardRow) {
    return { status: 404, body: { error: 'Card not found', cardId } };
  }

  const identity = buildCanonicalIdentity(cardRow, {
    ...query,
    cardId,
    productType,
  });

  const forceRefresh = isTruthy(query.forceRefresh);
  if (forceRefresh) {
    if (!pricingV2Config.enabled) {
      return {
        status: 409,
        body: {
          error: 'Pricing Engine V2 is disabled',
          detail: 'Set PRICING_ENGINE_V2_ENABLED=true on the server before forcing external refreshes.',
          featureFlagEnabled: false,
        },
      };
    }
    const body = await refreshPricingForCard(supabase, cardId, { ...query, productType });
    return { status: 200, body };
  }

  const { snapshot, error } = await fetchLatestSnapshot(supabase, identity);
  if (error) {
    return {
      status: 503,
      body: {
        ...unavailableResponse(identity),
        error: 'Pricing snapshot lookup failed',
        detail: error.message,
      },
    };
  }

  if (snapshot) {
    const stale = snapshot.stale_after && new Date(snapshot.stale_after).getTime() < Date.now();
    let refreshQueued = false;
    if (stale) refreshQueued = await queuePricingRefresh(supabase, identity, 'pricing_v2_stale');
    return {
      status: 200,
      body: snapshotToResponse({ ...snapshot, is_stale: stale || snapshot.is_stale }, identity, { refreshQueued }),
    };
  }

  const staleFallback = await fetchLatestStaleCompatibleSnapshot(supabase, identity);
  if (staleFallback) {
    const refreshQueued = await queuePricingRefresh(supabase, identity, 'pricing_v2_missing');
    return {
      status: 200,
      body: snapshotToResponse({ ...staleFallback, is_stale: true }, identity, { refreshQueued }),
    };
  }

  const refreshQueued = await queuePricingRefresh(supabase, identity, 'pricing_v2_missing');
  return { status: 200, body: unavailableResponse(identity, { refreshQueued }) };
}

export async function refreshPricingForCard(supabase, cardId, options = {}) {
  if (!pricingV2Config.enabled && !options.ignoreFeatureFlag) {
    throw new Error('PRICING_ENGINE_V2_ENABLED is not true');
  }

  const productType = options.productType ?? (options.gradingCompany || options.grade ? 'graded_card' : 'raw_card');
  const cardRow = await fetchCardRow(supabase, cardId, productType);
  if (!cardRow) throw new Error(`Card not found: ${cardId}`);

  const identity = buildCanonicalIdentity(cardRow, { ...options, cardId, productType });
  const queries = generatePricingQueries(identity);
  const adapters = createPricingSourceAdapters({ supabase });
  const accessLimitations = [];
  const rawObservations = [];

  await persistSources(supabase, adapters).catch(() => {});

  for (const adapter of adapters) {
    const health = await adapter.healthCheck().catch((error) => ({ status: 'failed', message: error.message }));
    if (health.status !== 'ok') {
      accessLimitations.push({ source: adapter.id, status: health.status, message: health.message });
      continue;
    }
    try {
      const rows = await adapter.searchPrices(identity, {
        queries,
        limit: pricingV2Config.maxObservationsPerSource,
        maxQueries: adapter.id === 'ebay_active' ? 3 : 4,
      });
      rawObservations.push(...rows.slice(0, pricingV2Config.maxObservationsPerSource));
    } catch (error) {
      accessLimitations.push({ source: adapter.id, status: 'failed', message: error.message });
    }
  }

  const observations = rawObservations.map((raw) => {
    const match = scoreObservationMatch(raw, identity, pricingV2Config);
    return normaliseObservation(raw, identity, match, pricingV2Config);
  });
  await persistObservations(supabase, observations);

  const estimate = calculatePricingEstimate(observations, pricingV2Config);
  const confidence = calculateConfidence(estimate, observations, identity);
  await enqueueReviewIfNeeded(supabase, identity, estimate).catch(() => {});
  const snapshot = await persistSnapshot(supabase, identity, estimate, confidence);

  return snapshotToResponse(snapshot, identity, { accessLimitations });
}
