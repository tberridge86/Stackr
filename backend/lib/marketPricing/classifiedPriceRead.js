import { ApiError } from '../stackrApiV1.js';

const RPC = 'read_pricing_classifications';
const POLICY = 'classified-v1';
const object = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const numeric = (value) => typeof value === 'boolean' || value == null || value === '' ? NaN : Number(value);
const equalAmount = (left, right) => Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
  return Date.parse(value);
}
const past = (value) => Number.isFinite(timestamp(value)) && timestamp(value) <= Date.now();

/** One deadline bounds the whole phase, including adapters which ignore abort. */
export function priceReadBudget(timeoutMs, parentSignal) {
  const expiresAt = Date.now() + timeoutMs;
  const controller = new AbortController();
  const error = () => new ApiError(503, 'catalogue_price_read_timeout', 'Stored catalogue price read exceeded its deadline.');
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const abort = () => { controller.abort(); rejectDeadline(error()); };
  const timer = setTimeout(abort, timeoutMs);
  parentSignal?.addEventListener('abort', abort, { once: true });
  if (parentSignal?.aborted) abort();
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, expiresAt - Date.now()),
    run: (work) => Promise.race([deadline, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw error();
      return work(controller.signal);
    })]),
    close() { clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); controller.abort(); },
  };
}

/** Selected raw gaps only: one service-only stored read, no refresh/provider work. */
export async function readClassifiedPrices(supabase, selected, signal) {
  const ids = [...new Set(selected.map((row) => row.variant_id))];
  if (!ids.length) return new Map();
  if (ids.length > 100) throw new ApiError(400, 'invalid_classification_read', 'At most 100 selected identities may be read.');
  let response;
  try {
    const query = supabase.schema('api').rpc(RPC, { p_variants: ids });
    response = await (typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query);
    if (response.error) throw response.error;
  } catch (error) {
    // Only absent additive schema is optional. Permission/auth/transport errors
    // must reach the caller so its existing quote cache retains prior evidence.
    if (String(error?.code ?? '') === 'PGRST202'
      || (String(error?.code ?? '') === '42883' && String(error?.message ?? '').includes(RPC)
        && /does not exist|could not find/i.test(String(error.message)))) return null;
    throw error;
  }
  const result = new Map();
  if (!Array.isArray(response.data)) throw new Error('Invalid classification read response.');
  for (const row of response.data) {
    if (!ids.includes(row?.variant_id) || result.has(row.variant_id) || !object(row.resolution)) {
      throw new Error('Invalid classification read response: duplicate, foreign or malformed row.');
    }
    result.set(row.variant_id, row.resolution);
  }
  return result;
}

/** This store contains raw market guides, never condition prices or sale proof. */
export function classifiedPrice(resolution, selected, unavailablePrice) {
  if (resolution == null) return null;
  const unavailable = (reason) => ({
    ...unavailablePrice(selected.variant_id, { productType: 'raw_card', currency: 'GBP' }, reason),
    classification: 'PRICE_UNAVAILABLE', priceBasis: 'general', estimateVersion: POLICY,
    sourceLabel: 'Price unavailable', evidenceType: 'none',
  });
  if (!object(resolution) || resolution.variantId !== selected.variant_id || resolution.printingId !== selected.printing_id
    || resolution.setId !== selected.set_id || resolution.language !== selected.language_code
    || resolution.catalogueVersionId !== selected.catalogue_version_id || resolution.finish !== selected.finish_code) {
    return unavailable('classification_identity_mismatch');
  }
  if (resolution.policyVersion !== POLICY || resolution.currency !== 'GBP' || resolution.condition !== 'raw_market_unspecified'
    || resolution.grade !== null || resolution.exact !== false || resolution.usableForHoldingsValuation !== false
    || !past(resolution.checkedAt)) return unavailable('invalid_classified_scope');
  if (resolution.classification === 'PRICE_UNAVAILABLE') {
    if (resolution.value !== null || typeof resolution.reason !== 'string' || !resolution.reason.trim()) return unavailable('invalid_classified_price');
    return unavailable(resolution.reason);
  }
  const source = resolution.provenance;
  const exact = resolution.evidenceType === 'exact_variant_market';
  const printing = resolution.evidenceType === 'printing_market';
  if (!['MARKET_GUIDE', 'ESTIMATED_VALUE'].includes(resolution.classification) || !positive(resolution.value)
    || typeof resolution.confidence !== 'number' || !Number.isFinite(resolution.confidence)
    || resolution.confidence < 0 || resolution.confidence > 1 || resolution.provider !== 'tcgcsv'
    || !['en', 'ja'].includes(selected.language_code)
    || (!exact && !printing) || resolution.printingMatch !== true || resolution.languageMatch !== true
    || !object(source) || source.provider !== resolution.provider || source.scope !== resolution.evidenceType
    || source.currency !== 'GBP' || !positive(source.value) || source.value !== resolution.marketSignalValue
    || source.printing_id !== selected.printing_id || source.set_id !== selected.set_id
    || source.catalogue_version_id !== selected.catalogue_version_id || source.language !== selected.language_code
    || !object(source.source_record)) return unavailable('invalid_classified_evidence');
  // A printing guide deliberately lacks finish/condition equivalence. Special
  // editions need exact variant evidence; foreign-language/blended guides are
  // unavailable in this adapter rather than inferred from artwork or aliases.
  if ((exact && (resolution.finishMatch !== true || source.variant_id !== selected.variant_id
    || source.finish !== selected.finish_code || source.variant_code !== selected.variant_code))
    || (printing && (!['normal', 'standard', 'default', 'holo', 'reverse_holo'].includes(selected.variant_code)
      || !['normal', 'standard', 'default', 'non_holo', 'holo', 'reverse_holo'].includes(selected.finish_code)
      || !['', 'unlimited', 'standard', 'default'].includes(selected.edition_code ?? '')))) return unavailable('classification_finish_mismatch');
  const sourceAt = timestamp(resolution.sourceAt);
  const retrievedAt = timestamp(resolution.retrievedAt);
  const checkedAt = timestamp(resolution.checkedAt);
  const expiry = timestamp(resolution.staleAfter);
  if (!past(resolution.sourceAt) || !past(resolution.retrievedAt) || !Number.isFinite(expiry)
    || sourceAt > retrievedAt || retrievedAt > checkedAt || expiry < sourceAt
    || timestamp(source.source_at) !== sourceAt || timestamp(source.retrieved_at) !== retrievedAt
    || timestamp(source.stale_after) !== expiry) return unavailable('invalid_classified_timestamps');
  const record = source.source_record;
  const subtype = selected.variant_code === 'reverse_holo' ? 'Reverse Holofoil'
    : selected.variant_code === 'holo' ? 'Holofoil' : 'Normal';
  if (record.printing_id !== selected.printing_id || record.set_id !== selected.set_id
    || record.catalogue_version_id !== selected.catalogue_version_id || record.language_code !== selected.language_code
    || record.category_id !== (selected.language_code === 'en' ? 3 : 85)
    || !Number.isSafeInteger(record.group_id) || record.group_id <= 0
    || !Number.isSafeInteger(record.product_id) || record.product_id <= 0
    || (exact && (record.variant_id !== selected.variant_id || record.subtype !== subtype))
    || (printing && !['Normal', 'Holofoil'].includes(record.subtype))) return unavailable('invalid_classified_provider_identity');
  if (timestamp(record.dataset_at) !== sourceAt || timestamp(record.recorded_at) !== retrievedAt
    || timestamp(record.stale_after) !== expiry) return unavailable('invalid_classified_timestamps');
  const original = numeric(record.original_price);
  const rate = numeric(record.exchange_rate);
  // The retained rate is USD->GBP (multiply). Accept its unrounded product or
  // the catalogue writer's penny-rounded product, while retaining source data.
  const converted = original * rate;
  const pennyConverted = Math.round((converted + Number.EPSILON) * 100) / 100;
  if (!positive(original) || !positive(rate) || rate > 10 || record.original_currency !== 'USD'
    || typeof record.exchange_rate_source !== 'string' || !record.exchange_rate_source.trim()
    || !past(record.exchange_rate_at) || timestamp(record.exchange_rate_at) > retrievedAt
    || numeric(record.central_estimate) !== source.value
    || (!equalAmount(source.value, converted) && !equalAmount(source.value, pennyConverted))) return unavailable('invalid_classified_fx_evidence');
  const estimated = resolution.classification === 'ESTIMATED_VALUE';
  const policyValue = estimated ? Math.max(0.1, Math.round(source.value * 10) / 10) : source.value;
  if (resolution.value !== policyValue || (estimated && source.value >= 2)
    || (printing && (source.value >= 20 || estimated !== (source.value < 2)))) return unavailable('invalid_classified_policy_value');
  const base = unavailablePrice(selected.variant_id, { productType: 'raw_card', currency: 'GBP' });
  return {
    ...base, status: 'market_estimate', priceType: 'market_estimate', priceBasis: 'general',
    classification: resolution.classification, evidenceType: resolution.evidenceType,
    sourceLabel: resolution.classification === 'MARKET_GUIDE' ? 'Market guide' : 'Estimated price',
    estimates: { low: null, central: resolution.value, high: null },
    confidence: { score: resolution.confidence, label: resolution.confidence >= 0.8 ? 'high' : resolution.confidence >= 0.6 ? 'medium' : 'low' },
    calculatedAt: resolution.sourceAt, staleAfter: resolution.staleAfter, freshness: expiry <= Date.now() ? 'stale' : 'fresh',
    provenLastSold: false, lastSoldObservationId: null, lastSoldEvidence: null,
    sourceBreakdown: [{ provider: resolution.provider, evidenceType: resolution.evidenceType,
      sourceAt: resolution.sourceAt, retrievedAt: resolution.retrievedAt, checkedAt: resolution.checkedAt,
      printingMatch: true, languageMatch: true, finishMatch: resolution.finishMatch, condition: resolution.condition,
      grade: null, usableForExactVariant: false, usableForHoldingsValuation: false,
      marketSignalValue: resolution.marketSignalValue, provenance: source }],
    fallbackEstimate: { identityKey: selected.variant_id, exact: false, reason: 'general_card_estimate',
      baseVariantId: selected.variant_id, printingId: selected.printing_id, language: selected.language_code, finishCode: selected.finish_code },
    unavailableReason: null, estimateVersion: POLICY,
  };
}
