export class PriceSourceUnavailableError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PriceSourceUnavailableError';
    this.code = code;
    this.details = details;
  }
}

export const PRICE_SOURCE_METHODS = [
  'identifySource',
  'healthCheck',
  'fetchActiveListings',
  'fetchSoldObservations',
  'normaliseObservation',
  'validateObservation',
];

export function validatePriceSourceAdapter(adapter) {
  const missing = PRICE_SOURCE_METHODS.filter((method) => typeof adapter?.[method] !== 'function');
  if (missing.length) {
    throw new Error(`Invalid PriceSource adapter. Missing methods: ${missing.join(', ')}`);
  }
  return adapter;
}

export function isUnavailableResult(value) {
  return Boolean(value && value.ok === false && value.reason);
}

export function unavailablePriceSourceResult(reason, message, details = {}) {
  return {
    ok: false,
    reason,
    message,
    details,
  };
}

export function validateObservationSeparation(observation) {
  const sourceType = String(observation?.sourceType ?? observation?.source_type ?? '').trim();
  const saleOrListingType = String(observation?.saleOrListingType ?? observation?.sale_or_listing_type ?? '').trim();

  if (sourceType === 'active_listing' && observation?.soldAt) {
    return {
      ok: false,
      reason: 'active_listing_has_sold_at',
      message: 'Active listings cannot be normalised as sold observations.',
    };
  }

  if (sourceType === 'active_listing' && ['sold', 'confirmed_sold_transaction', 'accepted_offer', 'auction_result'].includes(saleOrListingType)) {
    return {
      ok: false,
      reason: 'active_listing_marked_as_sold',
      message: 'Active asking prices must remain separate from sold observations.',
    };
  }

  if (sourceType === 'sold_transaction' && !observation?.soldAt) {
    return {
      ok: false,
      reason: 'sold_observation_missing_sold_at',
      message: 'Sold observations require a genuinely known sold_at timestamp.',
    };
  }

  return { ok: true, reason: null, message: 'Observation separation is valid.' };
}
