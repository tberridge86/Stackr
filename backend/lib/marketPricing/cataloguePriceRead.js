import { createHash } from 'node:crypto';
import { ApiError, SUPPORTED_LANGUAGE_CODES } from '../stackrApiV1.js';
import { provisionalCataloguePriceBaseline } from './cataloguePriceBaseline.js';

export const CATALOGUE_PRICE_PAGE_SIZE = 100;
const BASELINE_METADATA_TIMEOUT_MS = 450;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normal = (row) => ['normal', 'standard', 'default'].includes(row.variant_code)
  && ['normal', 'standard', 'default', 'non_holo'].includes(row.finish_code);
const holo = (row) => row.variant_code === 'holo' && row.finish_code === 'holo';
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));

function resolvedRawCandidate(row) {
  return row && [row.variant_id, row.printing_id, row.set_id, row.catalogue_version_id].every(uuid)
    && SUPPORTED_LANGUAGE_CODES.includes(row.language_code)
    && (row.product_kind ?? row.productType ?? row.product_type ?? 'raw_card') === 'raw_card'
    && row.grader_code == null && row.grade_value == null;
}

async function readBaselineMetadata(supabase, candidates, signal) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (!resolvedRawCandidate(candidate)) continue;
    const scope = `${candidate.catalogue_version_id}:${candidate.language_code}`;
    if (!groups.has(scope)) groups.set(scope, new Map());
    groups.get(scope).set(candidate.variant_id, candidate);
  }
  const metadata = new Map();
  await Promise.all([...groups.values()].map(async (group) => {
    const values = [...group.values()];
    for (let index = 0; index < values.length; index += CATALOGUE_PRICE_PAGE_SIZE) {
      const batch = values.slice(index, index + CATALOGUE_PRICE_PAGE_SIZE);
      const scope = batch[0];
      const ids = batch.map((row) => row.variant_id);
      const setIds = [...new Set(batch.map((row) => row.set_id))];
      // A price-less RPC identity is not enough to borrow metadata from another
      // publication, language or printing. Both views are published-only.
      const cardQuery = supabase.schema('api').from('catalogue_cards')
          .select('variant_id,printing_id,set_id,language_code,catalogue_version_id,rarity_code,rarity_label')
          .eq('catalogue_version_id', scope.catalogue_version_id).eq('language_code', scope.language_code)
          .in('variant_id', ids).limit(CATALOGUE_PRICE_PAGE_SIZE);
      const setQuery = supabase.schema('api').from('catalogue_sets')
          .select('set_id,language_code,catalogue_version_id,release_date')
          .eq('catalogue_version_id', scope.catalogue_version_id).eq('language_code', scope.language_code)
          .in('set_id', setIds).limit(CATALOGUE_PRICE_PAGE_SIZE);
      const [cards, sets] = await Promise.allSettled([
        typeof cardQuery.abortSignal === 'function' ? cardQuery.abortSignal(signal) : cardQuery,
        typeof setQuery.abortSignal === 'function' ? setQuery.abortSignal(signal) : setQuery,
      ]);
      // Optional metadata failures cannot erase saved quotes. If the published
      // card cannot be verified, retain unavailable rather than guessing.
      if (cards.status !== 'fulfilled' || cards.value.error) continue;
      const setRows = sets.status === 'fulfilled' && !sets.value.error ? sets.value.data ?? [] : [];
      for (const selected of batch) {
        const matching = (cards.value.data ?? []).filter((row) => row.variant_id === selected.variant_id
          && row.printing_id === selected.printing_id && row.set_id === selected.set_id
          && row.language_code === selected.language_code && row.catalogue_version_id === selected.catalogue_version_id);
        if (matching.length !== 1) continue;
        const matchingSets = setRows.filter((row) => row.set_id === selected.set_id
          && row.language_code === selected.language_code && row.catalogue_version_id === selected.catalogue_version_id);
        const card = matching[0];
        const releaseDate = matchingSets.length === 1 ? matchingSets[0].release_date : null;
        metadata.set(`${selected.catalogue_version_id}:${selected.variant_id}`, {
          rarity: card.rarity_label ?? card.rarity_code, releaseDate,
          metadataStatus: matchingSets.length === 1 ? 'published_card_and_set' : 'published_card_unknown_set_date',
        });
      }
    }
  }));
  return metadata;
}

function provisionalCataloguePrice(selected, metadata, unavailablePrice, reason) {
  const baseline = provisionalCataloguePriceBaseline({ variantId: selected.variant_id, ...metadata });
  return {
    ...unavailablePrice(selected.variant_id, { productType: 'raw_card', currency: 'GBP' }),
    identityKey: selected.variant_id, status: 'market_estimate', priceType: 'market_estimate',
    sourceLabel: 'Estimated price (provisional baseline)', priceBasis: 'general', unavailableReason: null,
    estimates: { low: baseline.low, central: baseline.central, high: baseline.high },
    confidence: { score: 0, label: 'low' }, freshness: 'unknown', calculatedAt: null, staleAfter: null,
    provenLastSold: false, lastSoldObservationId: null, lastSoldEvidence: null,
    sample: { total: 0, sold: 0, active: 0, sources: 0, dateRange: { from: null, to: null } },
    estimateVersion: baseline.modelVersion,
    sourceBreakdown: [{ provider: 'stackr_catalogue_baseline', evidenceType: 'provisional_category_baseline',
      modelVersion: baseline.modelVersion, rarity: baseline.rarity, eraMultiplier: baseline.eraMultiplier,
      metadataStatus: metadata.metadataStatus, marketQuoteUnavailableReason: reason,
      usableForExactVariant: false, usableForHoldingsValuation: false }],
    fallbackEstimate: { identityKey: selected.variant_id, exact: false, reason: 'provisional_catalogue_baseline',
      baseVariantId: selected.variant_id, printingId: selected.printing_id, language: selected.language_code,
      finishCode: selected.finish_code, usableForExactVariant: false, usableForHoldingsValuation: false },
  };
}

export function validateCataloguePriceRead(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['references','language','estimateMode','knownRevisions'].includes(key))) {
    throw new ApiError(400, 'invalid_price_read', 'Supply a catalogue price read object without product, grade or condition overrides.');
  }
  const refs = input.references;
  if (!Array.isArray(refs) || !refs.length || refs.length > CATALOGUE_PRICE_PAGE_SIZE
    || refs.some((ref) => typeof ref !== 'string' || !/^[A-Za-z0-9._:/+-]{1,160}$/.test(ref))) {
    throw new ApiError(400, 'invalid_price_references', 'Supply between 1 and 100 exact card references.');
  }
  if (input.language != null && !SUPPORTED_LANGUAGE_CODES.includes(input.language)) {
    throw new ApiError(400, 'invalid_language', 'language is not supported.');
  }
  const estimateMode = input.estimateMode ?? 'exact';
  if (!['exact', 'general'].includes(estimateMode)) throw new ApiError(400, 'invalid_estimate_mode', 'estimateMode must be exact or general.');
  const known = input.knownRevisions ?? {};
  if (!known || typeof known !== 'object' || Array.isArray(known)
    || Object.entries(known).some(([ref, rev]) => !refs.includes(ref) || !/^[a-f0-9]{64}$/.test(rev))) {
    throw new ApiError(400, 'invalid_price_revisions', 'knownRevisions must contain revisions for requested references only.');
  }
  return { references: [...new Set(refs)], language: input.language ?? null, estimateMode, knownRevisions: known };
}

/** A printing-level estimate never becomes finish-specific or sold evidence. */
export function catalogueGeneralBase(rows) {
  const unique = (items) => [...new Map(items.map((row) => [row.variant_id, row])).values()];
  const normals = unique(rows.filter(normal));
  const holos = unique(rows.filter(holo));
  if (normals.length > 1 || (!normals.length && holos.length > 1)) return [];
  return [...normals, ...(holos.length === 1 ? holos : [])];
}

function isMissingPrintingGuideRpc(error, name) {
  // Additive printing guides can be deployed independently of the backend.
  // Only known absent-RPC responses are optional;
  // permissions and database failures must still fail the bounded read.
  return ['42883', 'PGRST202'].includes(String(error?.code ?? ''))
    || (String(error?.message ?? '').includes(name) && /does not exist|could not find/i.test(String(error?.message ?? '')));
}

async function readPrintingGeneralQuotes(supabase, candidates, name) {
  const printingIds = [...new Set(candidates.map((candidate) => candidate?.printing_id)
    .filter((printingId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(printingId))))];
  if (!printingIds.length) return new Map();
  const quotes = new Map();
  // Candidate rows can include multiple variants for a 100-reference page.
  // Each guide RPC caps a service-only batch at 100 printings.
  for (let index = 0; index < printingIds.length; index += CATALOGUE_PRICE_PAGE_SIZE) {
    const batch = printingIds.slice(index, index + CATALOGUE_PRICE_PAGE_SIZE);
    const { data, error } = await supabase.schema('api').rpc(name, {
      p_printing_ids: batch,
    });
    if (error) {
      if (isMissingPrintingGuideRpc(error, name)) return new Map();
      throw error;
    }
    for (const row of data ?? []) {
      if (batch.includes(row?.printing_id) && row?.quote && typeof row.quote === 'object') quotes.set(row.printing_id, row.quote);
    }
  }
  return quotes;
}

function requiredFiniteNumber(value, minimum = 0) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : null;
}

function requiredPastDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= Date.now() ? { value, timestamp: parsed } : null;
}

function cardmarketBlendedGeneralPrice(quote, selected, unavailablePrice) {
  const amount = requiredFiniteNumber(quote?.centralEstimate, Number.EPSILON);
  if (amount == null || quote?.provider !== 'cardmarket_public' || quote?.currency !== 'GBP'
    || quote?.priceScope !== 'blended_general_estimate'
    || quote?.usableForExactVariant !== false || quote?.usableForHoldingsValuation !== false
    || quote?.language !== null || quote?.condition !== null || quote?.finish !== null || quote?.grade !== null
    || !['trend', 'avg30', 'avg'].includes(quote?.selectedField)) return null;
  const sourceCreatedAt = requiredPastDate(quote.sourceCreatedAt);
  const exchangeRateAt = requiredPastDate(quote.exchangeRateAt);
  const staleAfter = typeof quote.staleAfter === 'string' && Number.isFinite(Date.parse(quote.staleAfter))
    ? { value: quote.staleAfter, timestamp: Date.parse(quote.staleAfter) } : null;
  if (!sourceCreatedAt || !exchangeRateAt || !staleAfter || staleAfter.timestamp < sourceCreatedAt.timestamp) return null;
  // Stale quotes keep their original FX evidence. Fresh inserts enforce the
  // seven-day FX window in SQL; a read never discards valid older evidence.
  const originalPrice = requiredFiniteNumber(quote.originalPrice, Number.EPSILON);
  const exchangeRate = requiredFiniteNumber(quote.exchangeRate, Number.EPSILON);
  if (originalPrice == null || quote.originalCurrency !== 'EUR' || exchangeRate == null
    || typeof quote.exchangeRateSource !== 'string' || !quote.exchangeRateSource.trim()
    || Math.abs(amount - Math.round(originalPrice * exchangeRate * 100) / 100) > 0.0051) return null;
  const unavailable = unavailablePrice(selected.variant_id, { productType: 'raw_card', currency: 'GBP' });
  return {
    ...unavailable,
    status: 'market_estimate', priceType: 'market_estimate', unavailableReason: null,
    estimates: { low: null, central: amount, high: null }, calculatedAt: sourceCreatedAt.value, staleAfter: staleAfter.value,
    freshness: staleAfter.timestamp <= Date.now() ? 'stale' : 'fresh',
    sourceBreakdown: [{ provider: 'cardmarket_public', evidenceType: 'blended_general_estimate',
      selectedField: quote.selectedField, originalCurrency: 'EUR', originalPrice,
      exchangeRate, exchangeRateAt: exchangeRateAt.value, exchangeRateSource: quote.exchangeRateSource,
      providerCategoryId: quote.providerCategoryId, providerProductId: quote.providerProductId,
      timestampBasis: 'provider_dataset', language: null, condition: null, finish: null, grade: null,
      usableForExactVariant: false, usableForHoldingsValuation: false }],
    fallbackEstimate: { identityKey: selected.variant_id, exact: false, reason: 'general_card_estimate',
      baseVariantId: selected.variant_id, printingId: selected.printing_id,
      language: selected.language_code, finishCode: selected.finish_code },
  };
}

function tcgcsvPrintingGeneralPrice(quote, selected, unavailablePrice) {
  const amount = requiredFiniteNumber(quote?.centralEstimate, Number.EPSILON);
  const originalPrice = requiredFiniteNumber(quote?.originalPrice, Number.EPSILON);
  const exchangeRate = requiredFiniteNumber(quote?.exchangeRate, Number.EPSILON);
  const sourceAt = requiredPastDate(quote?.sourceCreatedAt);
  const fxAt = requiredPastDate(quote?.exchangeRateAt);
  const staleAt = Date.parse(quote?.staleAfter ?? '');
  if (amount == null || originalPrice == null || exchangeRate == null || !sourceAt || !fxAt || !Number.isFinite(staleAt)
    || staleAt < sourceAt.timestamp || quote.provider !== 'tcgcsv' || quote.currency !== 'GBP' || quote.originalCurrency !== 'USD'
    || quote.priceScope !== 'printing_general_estimate' || quote.usableForExactVariant !== false || quote.usableForHoldingsValuation !== false
    || quote.language !== selected.language_code || quote.condition !== null || quote.finish !== null || quote.grade !== null
    || !['Normal','Holofoil'].includes(quote.providerSubtype)
    || !((quote.providerCategoryId === 3 && quote.language === 'en') || (quote.providerCategoryId === 85 && quote.language === 'ja'))
    || !Number.isSafeInteger(quote.providerGroupId) || quote.providerGroupId <= 0
    || !Number.isSafeInteger(quote.providerProductId) || quote.providerProductId <= 0
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quote.anchorVariantId ?? '')
    || typeof quote.exchangeRateSource !== 'string' || !quote.exchangeRateSource.trim()
    || Math.abs(amount - Math.round(originalPrice * exchangeRate * 100) / 100) > 0.0051) return null;
  return {
    ...unavailablePrice(selected.variant_id, { productType: 'raw_card', currency: 'GBP' }),
    status: 'market_estimate', priceType: 'market_estimate', unavailableReason: null,
    provenLastSold: false, lastSoldObservationId: null, lastSoldEvidence: null,
    estimates: { low: null, central: amount, high: null }, calculatedAt: sourceAt.value, staleAfter: quote.staleAfter,
    freshness: staleAt <= Date.now() ? 'stale' : 'fresh', sample: { sold: 0, active: 0 },
    sourceBreakdown: [{ provider: 'tcgcsv', evidenceType: 'printing_general_estimate',
      categoryId: quote.providerCategoryId, groupId: quote.providerGroupId, productId: quote.providerProductId,
      subtype: quote.providerSubtype, originalCurrency: 'USD', originalPrice, exchangeRate,
      exchangeRateAt: fxAt.value, exchangeRateSource: quote.exchangeRateSource,
      timestampBasis: 'provider_dataset', language: quote.language, condition: null, finish: null, grade: null,
      usableForExactVariant: false, usableForHoldingsValuation: false }],
    fallbackEstimate: { identityKey: selected.variant_id, exact: false, reason: 'general_card_estimate',
      baseVariantId: quote.anchorVariantId, printingId: selected.printing_id, language: selected.language_code, finishCode: null },
  };
}

export function createCataloguePriceRead({ supabase, toEstimatePrice, toSnapshotPrice, unavailablePrice }) {
  const storedPrice = (row, preferFresh = false) => {
    const estimate = row.estimate;
    const snapshot = row.snapshot;
    const price = estimate ? toEstimatePrice(estimate, row.variant_id) : null;
    const legacy = snapshot ? toSnapshotPrice(snapshot, row.variant_id) : null;
    const usable = (p) => p?.status !== 'unavailable' && Number.isFinite(p?.estimates?.central) && p.estimates.central > 0;
    const candidates = [price, legacy].filter(usable);
    candidates.sort((a, b) => (preferFresh ? Number(b.freshness === 'fresh') - Number(a.freshness === 'fresh') : 0)
      || (Date.parse(b.calculatedAt ?? '') || 0) - (Date.parse(a.calculatedAt ?? '') || 0));
    return candidates[0] ?? null;
  };
  return async (rawInput) => {
    const input = validateCataloguePriceRead(rawInput);
    // One bounded RPC, no per-card identity requests and no provider work.
    const { data, error } = await supabase.schema('api').rpc('read_catalogue_prices', {
      p_references: input.references, p_language: input.language,
    });
    if (error) throw error;
    const byRef = new Map((data ?? []).map((row) => [row.reference, row.candidates ?? []]));
    const printingCandidates = (data ?? []).flatMap((row) => row.candidates ?? []);
    const [cardmarketByPrinting, tcgcsvByPrinting] = input.estimateMode === 'general'
      ? await Promise.all([
        readPrintingGeneralQuotes(supabase, printingCandidates, 'read_cardmarket_blended_general_prices'),
        readPrintingGeneralQuotes(supabase, printingCandidates, 'read_catalogue_printing_general_prices'),
      ]) : [new Map(), new Map()];
    const baselineCandidates = new Map();
    const rows = input.references.map((reference) => {
      const candidates = byRef.get(reference) ?? [];
      const groups = new Set(candidates.map((c) => `${c.printing_id}:${c.set_id}:${c.language_code}`));
      let selected = null;
      let price = null;
      let reason = groups.size > 1 ? 'ambiguous_catalogue_identity' : 'unresolved_catalogue_identity';
      if (groups.size === 1) {
        const requested = new Set(candidates.flatMap((row) => row.requested_variant_ids ?? (row.variant_id === reference ? [reference] : [])));
        const exact = candidates.filter((row) => requested.has(row.variant_id));
        const defaults = candidates.filter((row) => row.is_default === true);
        const base = catalogueGeneralBase(candidates);
        // Printing IDs use the same normal-first default policy as catalogue cards.
        selected = requested.size ? (requested.size === 1 && exact.length === 1 ? exact[0] : null)
          : base[0] ?? (defaults.length === 1 ? defaults[0] : candidates.length === 1 ? candidates[0] : null);
        if (selected) {
          price = storedPrice(selected);
          reason = selected.outcome?.reason ?? 'no_stored_market_quote';
          if (input.estimateMode === 'general') {
            // Prefer the provider's mapped price for this exact finish. A base
            // printing estimate is a fallback when that finish has no fresh quote.
            const generalCandidates = [selected, ...base.filter((row) => row.variant_id !== selected.variant_id)];
            let staleGeneralPrice = null;
            let freshGeneralPrice = null;
            for (const candidate of generalCandidates) {
              const general = candidate.general_quote;
              const amount = general?.central_estimate == null ? null : Number(general.central_estimate);
              const generalPrice = Number.isFinite(amount) && amount > 0 ? {
                ...unavailablePrice(candidate.variant_id, { productType: 'raw_card', currency: 'GBP' }),
                status: 'market_estimate', priceType: 'market_estimate', unavailableReason: null,
                estimates: { low: null, central: amount, high: null }, calculatedAt: general.dataset_at,
                staleAfter: general.stale_after,
                freshness: Date.parse(general.stale_after) <= Date.now() ? 'stale' : 'fresh',
                sourceBreakdown: [{ provider: general.provider, categoryId: general.category_id,
                  groupId: general.group_id, productId: general.product_id, subtype: general.subtype,
                  originalCurrency: general.original_currency, originalPrice: Number(general.original_price),
                  exchangeRate: Number(general.exchange_rate), exchangeRateAt: general.exchange_rate_at,
                  exchangeRateSource: general.exchange_rate_source, timestampBasis: 'provider_dataset', condition: 'unspecified' }],
              } : null;
              const stored = storedPrice(candidate, true);
              const quotes = [generalPrice, stored].filter((quote) => quote && !quote.fallbackEstimate);
              quotes.sort((a, b) => Number(b.freshness === 'fresh') - Number(a.freshness === 'fresh')
                || (Date.parse(b.calculatedAt ?? '') || 0) - (Date.parse(a.calculatedAt ?? '') || 0));
              const quote = quotes[0];
              if (!quote) continue;
              const generalEstimate = {
                ...quote, variantId: selected.variant_id, status: 'market_estimate', priceType: 'market_estimate',
                provenLastSold: false, lastSoldObservationId: null, lastSoldEvidence: null,
                sample: { ...quote.sample, sold: 0, active: 0 },
                fallbackEstimate: { identityKey: quote.identityKey ?? candidate.variant_id, exact: false,
                  reason: 'general_card_estimate', baseVariantId: candidate.variant_id,
                  printingId: candidate.printing_id, language: candidate.language_code, finishCode: candidate.finish_code },
              };
              if (quote.freshness === 'fresh') { freshGeneralPrice = generalEstimate; break; }
              staleGeneralPrice ??= generalEstimate;
            }
            // An expired finish quote must not hide a fresh, explicitly labelled
            // base-printing guide. Preserve the first saved quote when all are stale.
            price = freshGeneralPrice ?? staleGeneralPrice ?? price;
            const printingGuide = tcgcsvPrintingGeneralPrice(tcgcsvByPrinting.get(selected.printing_id), selected, unavailablePrice);
            if (printingGuide && (!price || (price.freshness !== 'fresh' && printingGuide.freshness === 'fresh'))) price = printingGuide;
            // Cardmarket is reviewed at the printing level but its public
            // guide has blended language/condition/finish scope. It is a
            // last-resort general estimate only, never exact evidence.
            if (!price) price = cardmarketBlendedGeneralPrice(
              cardmarketByPrinting.get(selected.printing_id), selected, unavailablePrice,
            );
          }
        } else reason = 'ambiguous_default_variant';
      }
      const variantId = selected?.variant_id ?? null;
      if (!price && input.estimateMode === 'general' && resolvedRawCandidate(selected)) baselineCandidates.set(reference, selected);
      if (!price && variantId) price = unavailablePrice(variantId, { productType: 'raw_card', currency: 'GBP', condition: 'near_mint' }, reason);
      const row = {
        reference, cardId: selected?.printing_id ?? null, variantId, language: selected?.language_code ?? null,
        price, unavailableReason: price?.estimates?.central != null ? null : reason,
        nextRetryAt: selected?.outcome?.next_retry_at ?? null,
      };
      // Prices have content revisions independent of catalogue versions. Deletions,
      // identity changes and availability changes produce explicit replacement rows.
      return row;
    });
    let baselineMetadata = new Map();
    if (baselineCandidates.size) {
      const controller = new AbortController();
      let timeout;
      try {
        // Transport cancellation bounds real Supabase reads; the race also
        // protects saved quotes from an adapter that does not honor abort.
        // A late result stays private to this phase and cannot mutate rows.
        const metadataRead = readBaselineMetadata(supabase, [...baselineCandidates.values()], controller.signal)
          .catch(() => new Map());
        baselineMetadata = await Promise.race([
          metadataRead,
          new Promise((resolve) => {
            timeout = setTimeout(() => { controller.abort(); resolve(new Map()); }, BASELINE_METADATA_TIMEOUT_MS);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    }
    const pricedRows = rows.map((row) => {
      const selected = baselineCandidates.get(row.reference);
      const metadata = selected && baselineMetadata.get(`${selected.catalogue_version_id}:${selected.variant_id}`);
      const result = metadata ? { ...row, price: provisionalCataloguePrice(selected, metadata, unavailablePrice, row.unavailableReason), unavailableReason: null } : row;
      return { ...result, revision: hash(result) };
    });
    return {
      prices: pricedRows.filter((row) => input.knownRevisions[row.reference] !== row.revision),
      unchangedReferences: pricedRows.filter((row) => input.knownRevisions[row.reference] === row.revision).map((row) => row.reference),
      priceRevision: hash(pricedRows.map((row) => [row.reference, row.revision])),
      estimateMode: input.estimateMode,
    };
  };
}
