const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RAW_CONDITION_CODES = new Map([
  ['mint', 'raw_mint'],
  ['near_mint', 'raw_near_mint'],
  ['lightly_played', 'raw_lightly_played'],
  ['moderately_played', 'raw_moderately_played'],
  ['heavily_played', 'raw_heavily_played'],
  ['damaged', 'raw_damaged'],
]);

function clean(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function pokeTraceConditionCode(value) {
  return RAW_CONDITION_CODES.get(normalizeToken(value)) ?? null;
}

function retainedProviderCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return {
    id: card.id ?? card.cardId ?? card.card_id ?? null,
    name: card.name ?? null,
    cardNumber: card.cardNumber ?? card.number ?? card.collectorNumber ?? null,
    set: card.set ?? null,
    variant: card.variant ?? null,
    game: card.game ?? null,
    market: card.market ?? null,
    productType: card.productType ?? card.product_type ?? null,
    productFamily: card.productFamily ?? card.product_family ?? null,
  };
}

export function toPokeTraceSoldEvidenceRow(identity, observation, providerResultPosition = 0) {
  const canonicalVariantId = clean(identity?.canonicalVariantId);
  const provenance = observation?.metadata?.soldProvenance;
  const providerCard = retainedProviderCard(observation?.rawPayload?.card);
  const listing = observation?.rawPayload?.listing;
  const conditionCode = identity?.productType === 'raw_card'
    ? pokeTraceConditionCode(observation?.rawCondition)
    : null;
  const sourceItemId = clean(provenance?.externalReference ?? observation?.externalReference);
  const sourceUrl = clean(provenance?.sourceUrl);
  const observedAt = clean(observation?.fetchedAt);
  const soldAt = clean(provenance?.soldAt ?? observation?.soldAt);
  const currencyCode = clean(provenance?.currency ?? observation?.originalCurrency)?.toUpperCase() ?? null;
  const soldPrice = Number(provenance?.finalPrice ?? observation?.originalItemPrice);

  if (!UUID_PATTERN.test(canonicalVariantId ?? '')
    || !['raw_card', 'graded_card'].includes(identity?.productType)
    || observation?.sourceId !== 'poketrace_sold'
    || observation?.sourceType !== 'sold_transaction'
    || provenance?.qualified !== true
    || observation?.metadata?.providerObservationState !== 'provider_observed'
    || !providerCard?.id
    || !listing || typeof listing !== 'object' || Array.isArray(listing)
    || !sourceItemId || !sourceUrl
    || !Number.isFinite(soldPrice) || soldPrice <= 0
    || !/^[A-Z]{3}$/.test(currencyCode ?? '')
    || !soldAt || !observedAt
    || !Number.isFinite(Date.parse(soldAt)) || !Number.isFinite(Date.parse(observedAt))
    || (identity.productType === 'raw_card' && !conditionCode)
    || (identity.productType === 'graded_card' && (!clean(observation.gradingCompany) || !clean(observation.grade)))) {
    return null;
  }

  return {
    variantId: canonicalVariantId,
    productKind: identity.productType,
    conditionCode,
    graderCode: identity.productType === 'graded_card' ? clean(observation.gradingCompany)?.toUpperCase() : null,
    gradeValue: identity.productType === 'graded_card' ? clean(observation.grade) : null,
    sourceItemId,
    soldPrice,
    // PokeTrace's documented listing record does not expose shipping. Never
    // turn an absent shipping amount into a claim that shipping was free.
    shippingPrice: null,
    currencyCode,
    soldAt: new Date(soldAt).toISOString(),
    observedAt: new Date(observedAt).toISOString(),
    sourceUrl,
    rawTitle: clean(observation.title),
    matchConfidence: Number(observation.matchScore),
    providerSearchId: String(providerCard.id),
    providerResultPosition: Math.max(0, Number(providerResultPosition) || 0),
    rawPayload: {
      provider: 'poketrace',
      apiVersion: '1.7.0',
      providerCard,
      listing,
    },
  };
}

export async function persistPokeTraceSoldEvidence(supabase, identity, observations) {
  const rows = (observations ?? [])
    .map((observation, index) => toPokeTraceSoldEvidenceRow(identity, observation, index))
    .filter(Boolean)
    .slice(0, 20);
  if (!rows.length) return { rows: [], result: null };

  const { data, error } = await supabase
    .schema('api')
    .rpc('ingest_poketrace_sold_evidence_batch', { p_rows: rows });
  if (error) throw new Error(`PokeTrace sold evidence was not retained: ${error.message}`);
  if (data?.status !== 'applied'
    || Number(data?.writtenCount) !== rows.length
    || !Array.isArray(data?.observations)
    || data.observations.length !== rows.length) {
    throw new Error('PokeTrace sold evidence returned an incomplete database acknowledgement.');
  }
  return { rows, result: data ?? null };
}
