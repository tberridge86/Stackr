import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import createV1Router from '../backend/routes/v1.js';
import { createEbayBrowsePriceSource } from '../backend/lib/marketPricing/ebayBrowseSource.js';
import {
  validateObservationSeparation,
  validatePriceSourceAdapter,
} from '../backend/lib/marketPricing/priceSourceAdapter.js';
import { createMarketPricingService } from '../backend/lib/marketPricing/service.js';
import { buildCanonicalIdentity } from '../backend/lib/pricingV2/identity.js';
import { scoreObservationMatch } from '../backend/lib/pricingV2/matcher.js';
import { normaliseObservation } from '../backend/lib/pricingV2/normalise.js';
import { calculatePricingEstimate } from '../backend/lib/pricingV2/statistics.js';

const migration = readFileSync('supabase/migrations/20260728171416_stackr_market_pricing_service.sql', 'utf8');
const rollback = readFileSync('supabase/manual/rollback_20260728171416_stackr_market_pricing_service.sql', 'utf8');
const openApi = readFileSync('docs/stackr-api/openapi.v1.yaml', 'utf8');

function expectSql(pattern, message) {
  assert.match(migration, pattern, message);
}

function rejectSql(pattern, message) {
  assert.doesNotMatch(migration, pattern, message);
}

function assertMigrationShape() {
  for (const table of [
    'market.source_providers',
    'market.currencies',
    'market.exchange_rate_snapshots',
    'market.conditions',
    'market.graders',
    'market.grades',
    'market.active_listings',
    'market.sold_observations',
    'market.price_estimate_versions',
    'market.price_estimates',
    'market.outlier_decisions',
    'market.refresh_jobs',
  ]) {
    expectSql(new RegExp(`create table if not exists ${table.replace('.', '\\.')}`), `missing ${table}`);
  }

  expectSql(/source_item_id text not null/, 'observations must keep source item IDs');
  expectSql(/parsed_match_confidence numeric not null default 0/, 'observations must keep parsed match confidence');
  expectSql(/duplicate_group_id uuid references market\.duplicate_groups/, 'observations must support duplicate grouping');
  expectSql(/ingestion_run_id uuid references ingest\.import_runs/, 'observations must link ingestion runs');
  expectSql(/accepted_offer/, 'accepted offers must be modelled separately');
  expectSql(/auction_result/, 'auction results must be modelled separately');
  expectSql(/confirmed_sold_transaction/, 'confirmed sold transactions must be modelled separately');
  expectSql(/asking_price_indication/, 'active asking prices must be labelled separately');
  expectSql(/median_absolute_deviation/, 'outlier handling must document MAD');
  expectSql(/create or replace view api\.market_price_estimates\s+with \(security_invoker = true\)/, 'price estimate API view must be security invoker');
  expectSql(/revoke all on all tables in schema market from anon, authenticated;/, 'private market tables must not be directly public');
  expectSql(/revoke all on table api\.market_price_estimates from anon, authenticated;/, 'market API projections are backend-only');
  expectSql(/grant select on table api\.market_price_history to service_role;/, 'backend must be able to read market history projection');
  expectSql(/ebay_browse_active/, 'eBay active source seed missing');
  expectSql(/ebay_sold_authorised/, 'authorised eBay sold source seed missing');
  rejectSql(/auth\.role\(/, 'migration must not use deprecated auth.role checks');
  rejectSql(/\bvector\s*\(/i, 'pricing stage must not add vector columns');

  assert.match(rollback, /drop view if exists api\.market_price_estimates/, 'rollback must drop API projection');
  assert.match(rollback, /drop table if exists market\.price_estimates/, 'rollback must drop price estimates');
}

function assertOpenApiAndClientContract() {
  for (const path of [
    '/cards/{variantId}/price',
    '/cards/{variantId}/price-history',
    '/market/movers',
    '/market/opportunities',
  ]) {
    assert.match(openApi, new RegExp(`^  ${path.replace(/[{}]/g, '\\$&')}:`, 'm'), `OpenAPI missing ${path}`);
  }
  assert.match(openApi, /MarketEvidenceStatus/, 'OpenAPI must name pricing evidence states');
}

function makeIdentity(overrides = {}) {
  return buildCanonicalIdentity({
    id: overrides.id ?? '33333333-3333-4333-8333-333333333333',
    name: overrides.name ?? 'Charizard ex',
    language: overrides.language ?? 'ja',
    number: overrides.number ?? '157',
    rarity: overrides.rarity ?? 'SR',
    set_id: overrides.setId ?? '11111111-1111-4111-8111-111111111111',
    raw_data: {
      language: overrides.language ?? 'ja',
      english_display_name: overrides.englishName ?? 'Charizard ex',
      local_name: overrides.localName ?? 'Lizardon ex',
      set: {
        id: overrides.setId ?? '11111111-1111-4111-8111-111111111111',
        name: overrides.setName ?? 'Pokemon Card 151',
        english_display_name: overrides.setName ?? 'Pokemon Card 151',
        printedTotal: overrides.setTotal ?? '165',
        set_code: overrides.setCode ?? 'SV2a',
      },
    },
  }, overrides);
}

function observation(title, price, identity, extra = {}) {
  const raw = {
    title,
    itemPrice: price,
    shippingPrice: extra.shippingPrice ?? 0,
    currency: 'GBP',
    sourceId: extra.sourceId ?? 'manual_verified_comp',
    sourceType: extra.sourceType ?? 'sold_transaction',
    externalReference: extra.externalReference ?? `${title}-${price}`,
    soldAt: Object.prototype.hasOwnProperty.call(extra, 'soldAt') ? extra.soldAt : '2026-07-01T12:00:00.000Z',
    listedAt: Object.prototype.hasOwnProperty.call(extra, 'listedAt') ? extra.listedAt : null,
    language: extra.language ?? identity.language,
    gradingCompany: extra.gradingCompany,
    grade: extra.grade,
  };
  const match = scoreObservationMatch(raw, identity, { minimumMatchScore: 0.85 });
  return normaliseObservation(raw, identity, match);
}

function assertPricingMathAndTitleValidation() {
  const rawIdentity = makeIdentity({ productType: 'raw_card' });
  const gradedIdentity = makeIdentity({ productType: 'graded_card', gradingCompany: 'PSA', grade: '10' });
  const sealedIdentity = makeIdentity({ productType: 'sealed_product', sealedProductType: 'booster_box', number: '' });

  assert.notEqual(rawIdentity.identityKey, gradedIdentity.identityKey, 'raw and graded identities must not share prices');
  assert.notEqual(rawIdentity.identityKey, sealedIdentity.identityKey, 'raw and sealed identities must not share prices');

  const misleadingLot = scoreObservationMatch({
    title: 'Charizard ex SV2a 157/165 Pokemon 10 card bundle lot',
    language: 'ja',
  }, rawIdentity);
  assert.equal(misleadingLot.accepted, false, 'lot listings must be rejected');
  assert.ok(misleadingLot.reasons.includes('LOT'), 'lot rejection should be explained');

  const gradedListingForRaw = scoreObservationMatch({
    title: 'PSA 10 Charizard ex SV2a 157/165 Japanese Pokemon Card',
    language: 'ja',
  }, rawIdentity);
  assert.equal(gradedListingForRaw.accepted, false, 'graded listing must not price a raw card');

  const soldRows = [
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 100, rawIdentity, { externalReference: 'sold-a' }),
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 105, rawIdentity, { externalReference: 'sold-b' }),
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 110, rawIdentity, { externalReference: 'sold-c' }),
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 115, rawIdentity, { externalReference: 'sold-d' }),
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 999, rawIdentity, { externalReference: 'outlier' }),
  ];
  const estimate = calculatePricingEstimate(soldRows);
  assert.equal(estimate.priceType, 'recent_sold_value');
  assert.equal(estimate.outlierCount, 1, 'MAD outlier handling must reject the obvious outlier');
  assert.ok(estimate.marketEstimate >= 100 && estimate.marketEstimate <= 115, 'outlier must not dominate central estimate');

  const activeOnly = calculatePricingEstimate([
    observation('Charizard ex 157/165 Pokemon Card 151 Japanese SR', 180, rawIdentity, {
      sourceId: 'ebay_active',
      sourceType: 'active_listing',
      externalReference: 'active-a',
      soldAt: null,
      listedAt: '2026-07-20T12:00:00.000Z',
    }),
  ]);
  assert.equal(activeOnly.priceType, 'asking_price_indication', 'active prices must be labelled asking only');
  assert.equal(activeOnly.soldCompCount, 0, 'active listings must never count as sold comps');
}

function assertEbayAdapterBoundary() {
  const adapter = createEbayBrowsePriceSource({
    enabled: true,
    clientId: '',
    clientSecret: '',
    fetchImpl: async () => {
      throw new Error('fetch should not be called without credentials');
    },
  });
  validatePriceSourceAdapter(adapter);
  assert.equal(adapter.identifySource().supportsActiveListings, true);
  assert.equal(adapter.identifySource().supportsSoldObservations, false);

  const soldSeparation = validateObservationSeparation({
    sourceType: 'active_listing',
    saleOrListingType: 'confirmed_sold_transaction',
    soldAt: '2026-07-01T00:00:00.000Z',
  });
  assert.equal(soldSeparation.ok, false, 'active listing cannot masquerade as sold data');

  const normalised = adapter.normaliseObservation({
    itemId: 'v1|123|0',
    title: 'Charizard ex 157/165 Pokemon Card 151 Japanese',
    price: { value: '123.45', currency: 'GBP' },
    buyingOptions: ['FIXED_PRICE'],
    itemWebUrl: 'https://www.ebay.example/item/123',
  }, { query: 'Charizard 157/165' });
  assert.equal(normalised.sourceType, 'active_listing');
  assert.equal(normalised.soldAt, null);
  assert.equal(adapter.validateObservation(normalised).ok, true);

  return adapter.fetchSoldObservations().then((result) => {
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'sold_data_not_available_from_browse_api');
  });
}

async function assertRoutes() {
  const variantId = '33333333-3333-4333-8333-333333333333';
  const pricingService = {
    async price(id) {
      assert.equal(id, variantId);
      return {
        variantId: id,
        productType: 'raw_card',
        identityKey: 'raw_card|ja|set|157|normal',
        currency: 'GBP',
        status: 'recent_sold_value',
        priceType: 'recent_sold_value',
        estimates: { low: 100, central: 110, high: 120 },
        sample: { total: 5, sold: 5, active: 0, sources: 1, dateRange: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z' } },
        confidence: { score: 82, label: 'high' },
        freshness: 'fresh',
        sourceBreakdown: [{ source: 'manual_verified_import', observationsUsed: 5 }],
        outliers: { excluded: 1, method: 'median_absolute_deviation' },
        fallbackEstimate: null,
        unavailableReason: null,
        calculatedAt: '2026-07-28T00:00:00.000Z',
        staleAfter: '2026-07-31T00:00:00.000Z',
        estimateVersion: 'market-pricing-v1.0.0',
      };
    },
    async priceHistory(id, input) {
      assert.equal(input.observationType, 'sold_observation');
      assert.equal(input.providerCode, 'ebay_sold_authorised');
      return {
        variantId: id,
        observations: [
          {
            observationId: 'sold-1',
            observationType: 'sold_observation',
            variantId: id,
            productType: 'raw_card',
            providerCode: 'manual_verified_import',
            providerName: 'Manual verified sale import',
            sourceItemId: 'sale-1',
            observedPrice: 110,
            shippingPrice: 0,
            currency: 'GBP',
            saleOrListingType: 'manual_verified_sale',
            conditionCode: 'raw_near_mint',
            graderCode: null,
            gradeLabel: null,
            observedAt: '2026-07-20T00:00:00.000Z',
            soldAt: '2026-07-20T00:00:00.000Z',
            sourceUrl: null,
            sourceTitle: 'Charizard ex 157/165 Japanese',
            parsedMatchConfidence: 0.98,
            duplicateGroupId: null,
          },
        ],
        pagination: { limit: 50, nextCursor: null },
      };
    },
    async marketMovers() {
      return { movers: [{ variantId, productType: 'raw_card', currency: 'GBP', currentEstimate: 110, previousEstimate: 95, percentageChange: 15.79 }], pagination: { limit: 25, nextCursor: null } };
    },
    async marketOpportunities() {
      return { opportunities: [{ activeListingId: 'listing-1', variantId, productType: 'raw_card', providerCode: 'ebay_browse_active', sourceItemId: 'v1|123|0', askingPrice: 80, currency: 'GBP', centralEstimate: 110, discountPercentage: 27.27, reason: 'active_listing_below_exact_variant_estimate' }], pagination: { limit: 25, nextCursor: null } };
    },
  };

  const app = express();
  app.use('/v1', createV1Router({
    service: {},
    pricingService,
  }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  try {
    const price = await fetch(`${baseUrl}/cards/${variantId}/price`, { headers: { 'X-Request-Id': 'pricing-route-test' } });
    assert.equal(price.status, 200);
    assert.match(price.headers.get('cache-control') ?? '', /public/);
    const priceBody = await price.json();
    assert.equal(priceBody.meta.requestId, 'pricing-route-test');
    assert.equal(priceBody.data.status, 'recent_sold_value');
    assert.equal(priceBody.data.sample.sold, 5);

    const history = await fetch(`${baseUrl}/cards/${variantId}/price-history?observationType=sold_observation&providerCode=ebay_sold_authorised`);
    assert.equal(history.status, 200);
    const historyBody = await history.json();
    assert.equal(historyBody.data.observations[0].observationType, 'sold_observation');
    assert.equal(historyBody.data.observations[0].saleOrListingType, 'manual_verified_sale');

    const movers = await fetch(`${baseUrl}/market/movers`);
    assert.equal(movers.status, 200);
    assert.equal((await movers.json()).data.movers[0].percentageChange, 15.79);

    const opportunities = await fetch(`${baseUrl}/market/opportunities`);
    assert.equal(opportunities.status, 200);
    assert.equal((await opportunities.json()).data.opportunities[0].providerCode, 'ebay_browse_active');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function assertInvalidServiceInput() {
  const service = createMarketPricingService({ supabase: {} });
  await assert.rejects(
    () => service.price('not-a-uuid'),
    /variantId must be a canonical UUID/,
  );
}

assertMigrationShape();
assertOpenApiAndClientContract();
assertPricingMathAndTitleValidation();
await assertEbayAdapterBoundary();
await assertRoutes();
await assertInvalidServiceInput();

console.log('Market pricing service tests passed.');
