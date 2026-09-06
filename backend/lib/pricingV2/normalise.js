import crypto from 'node:crypto';
import { getSourceConfig, pricingV2Config } from './config.js';
import { normalizeLanguage, normalizeLanguageForDb } from './identity.js';
import { validateSoldProvenance } from '../marketPricing/soldProvenance.js';

export function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function convertToGbp(value, currency, rates = pricingV2Config.currencyRates) {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  const normalizedCurrency = String(currency || 'GBP').trim().toUpperCase();
  const rate = rates[normalizedCurrency];
  if (!Number.isFinite(rate)) return null;
  return Math.round(parsed * rate * 100) / 100;
}

function getShippingFlag(itemPrice, shippingPrice) {
  if (shippingPrice == null || itemPrice == null) return null;
  const highFlat = shippingPrice > 20;
  const highRelative = itemPrice > 0 && shippingPrice / itemPrice > 0.35;
  return highFlat || highRelative ? 'HIGH_SHIPPING' : null;
}

export function makeObservationHash(observation) {
  const parts = [
    observation.sourceId,
    observation.sourceType,
    observation.externalReference,
    observation.title,
    observation.soldAt,
    observation.listedAt,
    observation.originalItemPrice,
    observation.originalShippingPrice,
    observation.originalCurrency,
  ];
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '').trim().toLowerCase()).join('|'))
    .digest('hex');
}

export function normaliseObservation(rawObservation, identity, match, config = pricingV2Config) {
  const sourceId = rawObservation.sourceId || rawObservation.source || 'unknown';
  const sourceConfig = getSourceConfig(sourceId);
  const currency = String(rawObservation.currency || rawObservation.originalCurrency || 'GBP').trim().toUpperCase();
  const originalItemPrice = toNumber(rawObservation.itemPrice ?? rawObservation.originalItemPrice ?? rawObservation.price);
  const rawShippingPrice = rawObservation.shippingPrice ?? rawObservation.originalShippingPrice;
  const originalShippingPrice = rawShippingPrice == null ? null : toNumber(rawShippingPrice);
  const fetchedAt = rawObservation.fetchedAt || new Date().toISOString();
  const provenance = rawObservation.sourceType === 'sold_transaction'
    ? validateSoldProvenance(rawObservation, {
      sourceConfig,
      matchScore: match.score,
      minimumMatchScore: config.minimumMatchScore,
    })
    : null;
  const effectiveItemPrice = provenance?.finalPrice ?? originalItemPrice;
  const effectiveCurrency = provenance?.currency ?? currency;
  const normalisedItemPriceGbp = convertToGbp(effectiveItemPrice, effectiveCurrency, config.currencyRates);
  const normalisedShippingGbp = originalShippingPrice == null
    ? null
    : convertToGbp(originalShippingPrice, effectiveCurrency, config.currencyRates);
  const normalisedDeliveredPriceGbp = normalisedItemPriceGbp == null || normalisedShippingGbp == null
    ? null
    : Math.round((normalisedItemPriceGbp + normalisedShippingGbp) * 100) / 100;
  const shippingFlag = getShippingFlag(normalisedItemPriceGbp, normalisedShippingGbp);
  const sourceType = provenance && !provenance.qualified
    ? 'market_estimate'
    : rawObservation.sourceType || 'market_estimate';

  const observation = {
    cardId: identity.cardId,
    canonicalIdentityKey: identity.identityKey,
    identity,
    sourceId,
    sourceType,
    externalReference: rawObservation.externalReference ?? rawObservation.id ?? null,
    productType: identity.productType,
    title: rawObservation.title ?? identity.canonicalCardName ?? '',
    originalItemPrice: effectiveItemPrice,
    originalShippingPrice,
    originalCurrency: effectiveCurrency,
    currencyConversionRate: config.currencyRates[effectiveCurrency] ?? null,
    currencyConversionTimestamp: fetchedAt,
    normalisedItemPriceGbp,
    normalisedDeliveredPriceGbp,
    soldAt: provenance?.soldAt ?? rawObservation.soldAt ?? null,
    listedAt: rawObservation.listedAt ?? rawObservation.observedAt ?? null,
    fetchedAt,
    language: normalizeLanguage(rawObservation.language ?? identity.language),
    dbLanguage: normalizeLanguageForDb(rawObservation.language ?? identity.language),
    rawCondition: rawObservation.rawCondition ?? identity.rawCondition ?? null,
    gradingCompany: rawObservation.gradingCompany ?? identity.gradingCompany ?? null,
    grade: rawObservation.grade ?? identity.grade ?? null,
    variant: rawObservation.variant ?? identity.variant ?? null,
    finish: rawObservation.finish ?? identity.finish ?? null,
    edition: rawObservation.edition ?? identity.edition ?? null,
    matchScore: match.score,
    matchExplanation: match.explanation,
    sourceReliability: rawObservation.sourceReliability ?? sourceConfig.reliabilityWeight ?? 0.3,
    includedInEstimate: Boolean(match.accepted && normalisedDeliveredPriceGbp != null && !shippingFlag),
    exclusionReason: provenance && !provenance.qualified
      ? provenance.reasons.join(', ')
      : match.accepted
        ? (originalShippingPrice == null ? 'UNKNOWN_SHIPPING_PRICE' : shippingFlag)
        : match.reasons.join(', '),
    metadata: {
      ...rawObservation.metadata,
      matchReasons: match.reasons,
      query: rawObservation.query ?? null,
      shippingFlag,
      sourceDisplayName: sourceConfig.displayName,
      sourceType,
      soldProvenance: provenance,
    },
    rawPayload: rawObservation.rawPayload ?? rawObservation.raw ?? rawObservation,
  };

  return {
    ...observation,
    observationHash: makeObservationHash(observation),
  };
}
