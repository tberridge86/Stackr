// @ts-nocheck
import assert from 'node:assert/strict';
import { buildCanonicalIdentity } from '../backend/lib/pricingV2/identity.js';
import { generatePricingQueries } from '../backend/lib/pricingV2/queryGenerator.js';
import { scoreObservationMatch } from '../backend/lib/pricingV2/matcher.js';
import { normaliseObservation } from '../backend/lib/pricingV2/normalise.js';
import { calculatePricingEstimate } from '../backend/lib/pricingV2/statistics.js';
import { calculateConfidence } from '../backend/lib/pricingV2/confidence.js';
import { createPokeTraceSoldAdapter, normalizePokeTraceListing, resolveExactPokeTraceCard } from '../backend/lib/pricingV2/adapters/pokeTraceSold.js';

function makeIdentity(overrides = {}) {
  return buildCanonicalIdentity({
    id: overrides.id ?? 'sv12a-225',
    name: overrides.name ?? 'Zacian',
    language: overrides.language ?? 'ja',
    number: overrides.number ?? '225',
    rarity: overrides.rarity ?? 'SAR',
    set_id: overrides.setId ?? 'sv12a',
    raw_data: {
      language: overrides.language ?? 'ja',
      english_display_name: overrides.englishName ?? 'Zacian',
      local_name: overrides.localName ?? 'ザシアン',
      set: {
        id: overrides.setId ?? 'sv12a',
        name: overrides.setName ?? 'VSTAR Universe',
        english_display_name: overrides.setName ?? 'VSTAR Universe',
        printedTotal: overrides.setTotal ?? '172',
        set_code: overrides.setCode ?? 'S12a',
      },
    },
  }, overrides);
}

function obs(title: string, price: number, identity: any, extra = {}) {
  const match = scoreObservationMatch({
    title,
    itemPrice: price,
    currency: 'GBP',
    sourceId: extra.sourceId ?? 'manual_verified_comp',
    sourceType: extra.sourceType ?? 'sold_transaction',
    language: extra.language ?? identity.language,
  }, identity, { minimumMatchScore: 0.85 });
  return normaliseObservation({
    title,
    itemPrice: price,
    currency: 'GBP',
    shippingPrice: 0,
    sourceId: extra.sourceId ?? 'manual_verified_comp',
    sourceType: extra.sourceType ?? 'sold_transaction',
    externalReference: extra.externalReference ?? `${title}-${price}`,
    soldAt: extra.soldAt ?? new Date().toISOString(),
    sourceUrl: extra.sourceUrl ?? `https://www.ebay.co.uk/itm/${encodeURIComponent(extra.externalReference ?? `${price}00`)}`,
    saleStatus: extra.saleStatus ?? 'completed',
    language: extra.language ?? identity.language,
    rawPayload: extra.rawPayload ?? { evidence: 'fixture', title, price },
  }, identity, match);
}

const english = makeIdentity({ language: 'en', setId: 'swsh12pt5', number: 'GG48', setName: 'Crown Zenith' });
const japanese = makeIdentity({ language: 'ja', setId: 'sv12a', number: '225', setName: 'VSTAR Universe' });
const chinese = makeIdentity({ language: 'zh-tw', setId: 'csv5', number: '0101', setName: 'Gem Pack Vol. 5' });
assert.notEqual(english.identityKey, japanese.identityKey, 'English and Japanese identities must not share a key');
assert.notEqual(japanese.identityKey, chinese.identityKey, 'Japanese and Chinese identities must not share a key');

const masterBall = makeIdentity({ finish: 'masterball_reverse' });
const reverse = makeIdentity({ finish: 'reverse_holo' });
assert.notEqual(masterBall.identityKey, reverse.identityKey, 'Master Ball reverse and standard reverse must not share a key');

const firstEdition = makeIdentity({ variant: 'first_edition', finish: 'first_edition' });
const unlimited = makeIdentity({ variant: 'unlimited', finish: 'unlimited' });
assert.equal(firstEdition.edition, 'first_edition', 'An explicit canonical first-edition variant must reach the full identity key');
assert.equal(unlimited.edition, 'unlimited', 'An explicit canonical unlimited variant must reach the full identity key');
assert.notEqual(firstEdition.identityKey, unlimited.identityKey, 'Edition variants must never share a pricing identity');
const canonicalNormalOverLegacyEdition = buildCanonicalIdentity({
  id: 'legacy-conflict',
  name: 'Pikachu',
  language: 'en',
  number: '1',
  set_id: 'base1',
  raw_data: { variant: 'first_edition' },
}, { variant: 'normal', finish: 'normal', condition: 'raw_near_mint' });
assert.equal(canonicalNormalOverLegacyEdition.edition, 'modern', 'Canonical variant metadata must override a conflicting legacy edition hint');

const graded = makeIdentity({ productType: 'graded_card', gradingCompany: 'PSA', grade: '10' });
const raw = makeIdentity({ productType: 'raw_card' });
assert.notEqual(graded.identityKey, raw.identityKey, 'Raw and graded identities must not share a key');

const wrongLanguage = scoreObservationMatch({
  title: 'Zacian GG48 Crown Zenith English Pokemon Card',
  language: 'en',
}, japanese);
assert.equal(wrongLanguage.accepted, false, 'Wrong-language listing must be rejected');

const rawVsGraded = scoreObservationMatch({
  title: 'PSA 10 Zacian 225/172 VSTAR Universe Japanese Pokemon Card',
  language: 'ja',
}, raw);
assert.equal(rawVsGraded.accepted, false, 'Graded listing must not price a raw card');

const queries = generatePricingQueries(japanese);
assert.ok(queries.some((query) => query.includes('225/172') || query.includes('225')), 'Queries should include collector number');
assert.ok(queries.some((query) => /Japanese|JPN|Japan/.test(query)), 'Queries should include language hints');

const soldRows = [
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'a' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 11, japanese, { externalReference: 'b' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 12, japanese, { externalReference: 'c' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 999, japanese, { externalReference: 'outlier' }),
];
const estimate = calculatePricingEstimate(soldRows);
assert.equal(estimate.priceType, 'recent_sold_value');
assert.ok(estimate.marketEstimate >= 10 && estimate.marketEstimate <= 12, 'Outlier must not dominate weighted median');

const duplicateEstimate = calculatePricingEstimate([
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'dup' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'dup' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 12, japanese, { externalReference: 'new' }),
]);
assert.equal(duplicateEstimate.compCount, 2, 'Duplicate observations must be removed');

const activeOnly = calculatePricingEstimate([
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 30, japanese, { sourceId: 'ebay_active', sourceType: 'active_listing', externalReference: 'active-a' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 35, japanese, { sourceId: 'ebay_active', sourceType: 'active_listing', externalReference: 'active-b' }),
]);
const activeConfidence = calculateConfidence(activeOnly, activeOnly.observationsUsed, japanese);
assert.equal(activeOnly.priceType, 'asking_price_indication', 'Active listings must be labelled as asking indication');
assert.equal(activeOnly.soldCompCount, 0, 'Active listings must not appear as sold comps');
assert.equal(activeConfidence.label, 'low', 'Active-only confidence must stay low');

const missingProvenance = obs(
  'Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR',
  13,
  japanese,
  { externalReference: 'no-provenance', sourceUrl: '' },
);
assert.equal(missingProvenance.sourceType, 'market_estimate', 'Incomplete sold evidence must be downgraded to a market estimate');
assert.match(missingProvenance.exclusionReason, /MISSING_CANONICAL_HTTPS_LISTING_URL/);
assert.equal(calculatePricingEstimate([missingProvenance]).priceType, 'market_estimate');

const poketraceCard = {
  id: 'ptr-zacian-225',
  name: 'Zacian',
  cardNumber: '225/172',
  set: { id: 'sv12a', name: 'VSTAR Universe' },
  variant: 'Holofoil',
  game: 'pokemon-japanese',
  market: 'US',
  productType: 'single',
  productFamily: 'card',
};
assert.equal(resolveExactPokeTraceCard([poketraceCard], japanese)?.id, poketraceCard.id, 'PokeTrace must resolve one exact provider card');
assert.equal(resolveExactPokeTraceCard([poketraceCard, { ...poketraceCard, id: 'duplicate' }], japanese), null, 'Ambiguous PokeTrace cards must be rejected');

const poketraceListing = {
  sourceItemId: '123456789012',
  title: 'Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR',
  price: 12.5,
  currency: 'GBP',
  listingUrl: 'https://www.ebay.co.uk/itm/123456789012?campid=1',
  soldAt: '2026-01-02T03:04:05.000Z',
  condition: 'NEAR_MINT',
  listingType: 'auction',
  anomalyFlag: false,
};
const normalisedPokeTrace = normalizePokeTraceListing(poketraceListing, poketraceCard, japanese);
assert.equal(normalisedPokeTrace?.sourceType, 'sold_transaction', 'Complete PokeTrace sale must remain a sold transaction');
assert.equal(normalisedPokeTrace?.saleVerificationState, 'completed');
assert.equal(normalisedPokeTrace?.metadata.providerObservationState, 'provider_observed');
assert.equal(normalisedPokeTrace?.metadata.listingType, 'auction', 'PokeTrace listingType is a sale mechanism, not the completion state');
assert.deepEqual(normalisedPokeTrace?.rawPayload, { card: poketraceCard, listing: poketraceListing }, 'Provider card and listing raw evidence must be retained');
const normalisedUnknownShipping = normaliseObservation(
  normalisedPokeTrace,
  japanese,
  scoreObservationMatch(normalisedPokeTrace, japanese, { minimumMatchScore: 0.85 }),
);
assert.equal(normalisedUnknownShipping.originalShippingPrice, null, 'Undocumented PokeTrace shipping must remain unknown');
assert.equal(normalisedUnknownShipping.normalisedDeliveredPriceGbp, null, 'Unknown shipping must not be treated as free in delivered-price estimates');
assert.equal(normalisedUnknownShipping.includedInEstimate, false);
assert.ok(normalizePokeTraceListing(poketraceListing, poketraceCard, { ...japanese, rawCondition: 'raw_near_mint' }), 'Canonical raw condition codes must match provider condition tokens');
assert.ok(normalizePokeTraceListing({ ...poketraceListing, listingType: undefined }, poketraceCard, japanese), 'The documented sold-listings response may omit listingType');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, listingType: 'active' }, poketraceCard, japanese), null, 'A contradictory active classification must fail closed');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, anomalyFlag: true }, poketraceCard, japanese), null, 'Anomalous PokeTrace listings must be rejected');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, listingUrl: 'http://www.ebay.co.uk/itm/123456789012' }, poketraceCard, japanese), null, 'Non-HTTPS eBay URLs must be rejected');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, listingUrl: 'https://www.ebay.co.uk.evil.example/itm/123456789012' }, poketraceCard, japanese), null, 'Look-alike eBay hostnames must be rejected');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, sourceItemId: '999999999999' }, poketraceCard, japanese), null, 'The retained eBay URL must identify the same source item');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, grader: 'PSA', grade: '10' }, poketraceCard, japanese), null, 'A graded comp must never price a raw card identity');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, condition: null }, poketraceCard, japanese), null, 'A raw comp without condition evidence must be rejected');
assert.equal(normalizePokeTraceListing({ ...poketraceListing, title: 'Zacian VSTAR Universe Japanese Pokemon Card' }, poketraceCard, japanese), null, 'Weak identity matches must be rejected');

async function runPokeTraceAdapterTests() {
const originalFetch = globalThis.fetch;
const requestedUrls: string[] = [];
const requestedHeaders: Headers[] = [];
const authorisedRuntime = {
  checkActivationReadiness: () => ({ active: true, ready: true }),
  isProviderUseAuthorised: async () => true,
};
globalThis.fetch = async (url: string | URL, init?: RequestInit) => {
  requestedUrls.push(String(url));
  requestedHeaders.push(new Headers(init?.headers));
  if (String(url).includes('/cards?')) return new Response(JSON.stringify({ data: [poketraceCard] }), { status: 200 });
  return new Response(JSON.stringify({ data: [poketraceListing, { ...poketraceListing, sourceItemId: 'anomaly', anomalyFlag: true }] }), { status: 200 });
};
try {
  const pokeTraceAdapter = createPokeTraceSoldAdapter({
    enabled: true,
    authorisedSoldData: true,
    apiBaseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    listingsLimit: 40,
    timeoutMs: 500,
  }, authorisedRuntime);
  const rows = await pokeTraceAdapter.searchPrices(japanese, { market: 'EU' });
  assert.equal(rows.length, 1, 'PokeTrace adapter must retain only evidenced, non-anomalous sales');
  assert.match(requestedUrls[0], /\/v1\/cards\?/);
  assert.match(requestedUrls[0], /card_number=225%2F172/);
  assert.match(requestedUrls[0], /game=pokemon-japanese/);
  assert.match(requestedUrls[0], /variant=Holofoil/);
  assert.match(requestedUrls[0], /market=US/, 'PokeTrace eBay listings must use its documented US/eBay card surface');
  assert.match(requestedUrls[0], /product_type=single/);
  assert.equal(requestedHeaders[0].get('X-API-Key'), 'test-key');
  assert.equal(requestedHeaders[0].get('Authorization'), null);
  assert.match(requestedUrls[1], /\/cards\/ptr-zacian-225\/listings\?sort=sold_at_desc/);
  assert.match(requestedUrls[1], /limit=20/);
} finally {
  globalThis.fetch = originalFetch;
}

let deniedFetchCount = 0;
globalThis.fetch = async () => {
  deniedFetchCount += 1;
  return new Response('{}', { status: 200 });
};
try {
  const deniedAdapter = createPokeTraceSoldAdapter({
    enabled: true,
    authorisedSoldData: true,
    apiBaseUrl: 'https://example.test',
    apiKey: 'test-key',
  }, {
    checkActivationReadiness: () => { throw new Error('reviewed benchmark missing'); },
    isProviderUseAuthorised: async () => true,
  });
  assert.equal((await deniedAdapter.healthCheck()).status, 'unavailable');
  await assert.rejects(() => deniedAdapter.searchPrices(japanese), /reviewed benchmark missing/);
  assert.equal(deniedFetchCount, 0, 'No PokeTrace network call may occur before the runtime activation gate passes');

  const inactiveAdapter = createPokeTraceSoldAdapter({
    enabled: true,
    authorisedSoldData: true,
    apiBaseUrl: 'https://example.test',
    apiKey: 'test-key',
  }, {
    checkActivationReadiness: () => ({ active: false, ready: true }),
    isProviderUseAuthorised: async () => true,
  });
  assert.equal((await inactiveAdapter.healthCheck()).status, 'unavailable');
  await assert.rejects(() => inactiveAdapter.searchPrices(japanese), /activation artifacts are not approved and active/);
  assert.equal(deniedFetchCount, 0, 'A disabled artifact gate must prevent every PokeTrace network call');

  const rightsDeniedAdapter = createPokeTraceSoldAdapter({
    enabled: true,
    authorisedSoldData: true,
    apiBaseUrl: 'https://example.test',
    apiKey: 'test-key',
  }, {
    checkActivationReadiness: authorisedRuntime.checkActivationReadiness,
    isProviderUseAuthorised: async () => false,
  });
  assert.equal((await rightsDeniedAdapter.healthCheck()).status, 'unavailable');
  await assert.rejects(() => rightsDeniedAdapter.searchPrices(japanese), /no active recorded amber rights review/);
  assert.equal(deniedFetchCount, 0, 'No PokeTrace network call may occur before the database amber review passes');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async () => new Response('', { status: 403 });
try {
  const unavailableScale = createPokeTraceSoldAdapter(
    { enabled: true, authorisedSoldData: true, apiBaseUrl: 'https://example.test', apiKey: 'test-key' },
    authorisedRuntime,
  );
  assert.deepEqual(await unavailableScale.searchPrices(japanese), [], 'A Scale 403 must fail closed without observations');
  assert.equal((await unavailableScale.healthCheck()).status, 'unavailable', 'A Scale 403 must report access unavailable');
} finally {
  globalThis.fetch = originalFetch;
}

}

runPokeTraceAdapterTests()
  .then(() => console.log('Pricing V2 tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
