const COMPLETED_SALE_STATES = new Set([
  'completed',
  'sold',
  'paid',
  'fulfilled',
  'complete',
  'completed_sale',
]);

const INVALID_SALE_STATES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'refund',
  'voided',
  'reversed',
  'failed',
]);

const EBAY_MARKETPLACE_DOMAINS = new Set([
  'ebay.com',
  'ebay.co.uk',
  'ebay.de',
  'ebay.fr',
  'ebay.it',
  'ebay.es',
  'ebay.ca',
  'ebay.com.au',
  'ebay.at',
  'ebay.be',
  'ebay.ch',
  'ebay.ie',
  'ebay.nl',
  'ebay.pl',
  'ebay.com.sg',
  'ebay.com.hk',
  'ebay.com.my',
  'ebay.ph',
]);

function isOfficialEbayHostname(hostname) {
  const normalized = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return [...EBAY_MARKETPLACE_DOMAINS].some((domain) => (
    normalized === domain || normalized.endsWith(`.${domain}`)
  ));
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function finitePositive(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validIsoCurrency(value) {
  return /^[A-Z]{3}$/.test(String(value ?? '').trim().toUpperCase());
}

function validTimestamp(value) {
  return Boolean(cleanText(value)) && Number.isFinite(Date.parse(value));
}

function hasRawEvidence(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'object' && Object.keys(value).length > 0;
}

/**
 * Canonicalises an eBay listing URL enough to make it safe provenance, while
 * retaining the listing path and non-tracking query parameters as evidence.
 */
export function canonicalEbayListingUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:'
      || !isOfficialEbayHostname(hostname)
      || !/^\/itm\/(?:[^/]+\/)?[^/]+\/?$/i.test(url.pathname)
      || url.username
      || url.password) {
      return null;
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:_trk|campid|customid|mkcid|mkevt|toolid|var|ssPageName)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normaliseSaleVerificationState(value) {
  const state = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (COMPLETED_SALE_STATES.has(state)) return 'completed';
  if (INVALID_SALE_STATES.has(state)) return state === 'refunded' || state === 'refund' ? 'refunded' : 'cancelled';
  return 'unknown';
}

/**
 * The boundary for calling a listing an individual sold transaction. Missing
 * evidence is intentionally a downgrade, not a best-effort acceptance.
 */
export function validateSoldProvenance(rawObservation, {
  sourceConfig = {},
  matchScore = null,
  minimumMatchScore = 0.85,
} = {}) {
  const reasons = [];
  const sourceAuthorised = sourceConfig.authorisedSoldData === true;
  const externalReference = cleanText(rawObservation?.externalReference ?? rawObservation?.sourceItemId ?? rawObservation?.id);
  const finalPrice = finitePositive(rawObservation?.finalPrice ?? rawObservation?.itemPrice ?? rawObservation?.originalItemPrice);
  const currency = String(rawObservation?.currency ?? rawObservation?.originalCurrency ?? '').trim().toUpperCase();
  const soldAt = rawObservation?.soldAt ?? rawObservation?.sold_at ?? null;
  const sourceUrl = canonicalEbayListingUrl(rawObservation?.sourceUrl ?? rawObservation?.listingUrl ?? rawObservation?.metadata?.listingUrl);
  const verificationState = normaliseSaleVerificationState(
    rawObservation?.saleVerificationState
      ?? rawObservation?.saleStatus
      ?? rawObservation?.transactionStatus
      ?? rawObservation?.status
      ?? rawObservation?.metadata?.saleStatus,
  );
  const rawEvidence = rawObservation?.rawPayload ?? rawObservation?.rawEvidence ?? rawObservation?.raw;
  const observedAt = rawObservation?.observedAt ?? rawObservation?.fetchedAt ?? new Date().toISOString();

  if (!sourceAuthorised) reasons.push('UNAUTHORISED_SOLD_PROVIDER');
  if (!externalReference) reasons.push('MISSING_STABLE_SALE_ID');
  if (!sourceUrl) reasons.push('MISSING_CANONICAL_HTTPS_LISTING_URL');
  if (finalPrice == null) reasons.push('MISSING_FINAL_SOLD_PRICE');
  if (!validIsoCurrency(currency)) reasons.push('INVALID_SOLD_CURRENCY');
  if (!validTimestamp(soldAt)) reasons.push('MISSING_OR_INVALID_SOLD_AT');
  if (validTimestamp(soldAt)
    && validTimestamp(observedAt)
    && Date.parse(soldAt) > Date.parse(observedAt) + 5 * 60_000) {
    reasons.push('SOLD_AT_AFTER_OBSERVATION');
  }
  if (verificationState !== 'completed') {
    reasons.push(verificationState === 'cancelled' ? 'SALE_CANCELLED' : verificationState === 'refunded' ? 'SALE_REFUNDED' : 'SALE_NOT_EXPLICITLY_COMPLETED');
  }
  if (!Number.isFinite(Number(matchScore)) || Number(matchScore) < minimumMatchScore) reasons.push('BELOW_EXACT_MATCH_THRESHOLD');
  if (!hasRawEvidence(rawEvidence)) reasons.push('MISSING_RAW_SALE_EVIDENCE');

  return {
    qualified: reasons.length === 0,
    reasons,
    externalReference,
    sourceUrl,
    finalPrice,
    currency,
    soldAt: validTimestamp(soldAt) ? new Date(soldAt).toISOString() : null,
    verificationState,
  };
}

export function hasQualifiedSoldProvenance(observation) {
  return observation?.sourceType === 'sold_transaction'
    && observation?.metadata?.soldProvenance?.qualified === true;
}
