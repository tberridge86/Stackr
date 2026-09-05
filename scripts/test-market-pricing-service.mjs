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
const snapshotBucketMigration = readFileSync('supabase/migrations/20260904130000_market_price_snapshot_history_buckets.sql', 'utf8');
const snapshotQueueMigration = readFileSync('supabase/migrations/20260904131000_exact_variant_price_refresh_queue.sql', 'utf8');
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
  assert.match(snapshotBucketMigration, /canonical_identity_key[\s\S]+?canonicalVariantId[\s\S]+?__legacy_printing_scope__/i,
    'snapshot buckets must keep exact canonical identity scope separate from printing-level history');
  assert.match(snapshotBucketMigration, /source-null historical row must never displace a labelled estimate/i,
    'snapshot bucket selection must filter unlabelled rows before choosing a winner');
  assert.match(snapshotBucketMigration, /tcgdex_tcgplayer[\s\S]+tcgdex_cardmarket/i,
    'known TCGdex source labels must remain eligible for chart history');
  assert.match(snapshotBucketMigration, /jsonb_array_elements\(case[\s\S]+?else '\[\]'::jsonb/i,
    'source breakdown parsing must be safe for malformed JSON shapes');
  assert.doesNotMatch(snapshotQueueMigration, /create\s+or\s+replace\s+function\s+api\.market_price_snapshot_history/i,
    'later queue migration must not overwrite the identity-aware history RPC');
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
  assert.equal(estimate.priceType, 'market_estimate', 'unproven sold labels must not create a recent-sold value');
  assert.equal(estimate.soldCompCount, 0, 'unproven sold labels must not count as sold comps');
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
    async priceHistory(id) {
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

    const history = await fetch(`${baseUrl}/cards/${variantId}/price-history`);
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

function createSnapshotSupabase({ metadata, snapshots = [], queueRows = [], estimates = [] }) {
  const limits = [];
  const inserted = [];
  const rpcCalls = [];
  const rangeCalls = [];
  const equalities = [];
  const catalogueCards = Array.isArray(metadata) ? metadata : [metadata];
  function query(schemaName, tableName) {
    let rows = schemaName === 'api' && tableName === 'catalogue_cards'
      ? catalogueCards
      : schemaName === 'api' && tableName === 'catalogue_external_identifiers'
        ? []
        : schemaName === 'api' && tableName === 'market_price_snapshot_history'
          ? snapshots
          : schemaName === 'api' && tableName === 'market_price_estimates'
            ? estimates
        : tableName === 'market_price_snapshots'
          ? snapshots
          : tableName === 'price_refresh_queue'
            ? queueRows
          : [];
    let single = false;
    const builder = {
      select() { return builder; },
      eq(column, value) {
        equalities.push({ schemaName, tableName, column, value });
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      is(column, value) {
        rows = rows.filter((row) => (row[column] ?? null) === value);
        return builder;
      },
      in(column, values) {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      or() { return builder; },
      order(column, options = {}) {
        rows = [...rows].sort((left, right) => {
          const a = left[column] ?? '';
          const b = right[column] ?? '';
          return options.ascending === false ? String(b).localeCompare(String(a)) : String(a).localeCompare(String(b));
        });
        return builder;
      },
      limit(value) {
        limits.push({ schemaName, tableName, value });
        rows = rows.slice(0, value);
        return builder;
      },
      range(from, to) {
        rangeCalls.push({ schemaName, tableName, from, to });
        rows = rows.slice(from, to + 1);
        return builder;
      },
      insert(value) {
        inserted.push(value);
        rows = [{ requested_at: '2026-09-05T00:00:00.000Z', run_after: '2026-09-05T00:00:00.000Z' }];
        return builder;
      },
      maybeSingle() { single = true; return builder; },
      then(resolve, reject) {
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return {
    limits,
    inserted,
    rpcCalls,
    rangeCalls,
    equalities,
    schema(schemaName) {
      return {
        from: (tableName) => query(schemaName, tableName),
        rpc(name, args) {
          rpcCalls.push({ schemaName, name, args });
          return query(schemaName, name);
        },
      };
    },
    from(tableName) { return query('public', tableName); },
  };
}

async function assertLabelledLegacySnapshotFallback() {
  const variantId = '33333333-3333-4333-8333-333333333333';
  const siblingVariantId = '44444444-4444-4444-8444-444444444444';
  const printingId = '55555555-5555-4555-8555-555555555555';
  const metadata = {
    variant_id: variantId,
    printing_id: printingId,
    language_code: 'ja',
    set_id: '11111111-1111-4111-8111-111111111111',
    set_code: 'SV2a',
    set_english_display_name: 'Pokemon Card 151',
    collector_number: '157',
    card_english_display_name: 'Charizard ex',
    rarity_code: 'SR',
    variant_code: 'standard',
    finish_code: 'normal',
  };
  const snapshot = (overrides = {}) => ({
    card_id: printingId,
    language: 'ja',
    primary_source: 'tcgdex',
    tcgdex_price: 123.45,
    snapshot_at: new Date().toISOString(),
    pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
    ...overrides,
  });
  const supabase = createSnapshotSupabase({
    metadata,
    snapshots: [
      snapshot({ tcgdex_price: 120, pricing_identity_json: { canonicalVariantId: siblingVariantId, productType: 'raw_card', condition: 'raw_near_mint' } }),
      snapshot({ tcgdex_price: 121, language: 'en' }),
      snapshot({ tcgdex_price: 122, pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_lightly_played' } }),
      snapshot({ tcgdex_price: 124, primary_source: null }),
      snapshot({
        primary_source: 'poketrace_sold',
        tcgdex_price: null,
        market_price_gbp: 130,
        price_type: 'recent_sold_value',
        methodology_version: 'pricing-v2.0.0',
        source_breakdown: [{ sourceId: 'poketrace_sold', observationCount: 3 }],
        calculation_summary: { priceBasis: 'item_price_excludes_shipping' },
        snapshot_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
      snapshot({
        primary_source: 'manual_verified_import',
        tcgdex_price: null,
        market_price_gbp: 127,
        price_type: 'recent_sold_value',
        methodology_version: 'pricing-v2.0.0',
        source_breakdown: [{ sourceId: 'manual_verified_import', observationCount: 3 }],
        calculation_summary: { priceBasis: 'item_price_excludes_shipping' },
        snapshot_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      }),
      snapshot(),
    ],
  });
  const service = createMarketPricingService({ supabase });
  const price = await service.price(variantId, { productType: 'raw_card', currency: 'GBP', condition: 'near_mint' });
  assert.equal(price.status, 'legacy_cached_market_estimate');
  assert.equal(price.estimates.central, 123.45);
  assert.equal(price.quoteScope, 'exact_variant');
  assert.equal(price.primarySource, 'tcgdex');
  assert.equal(price.priceBasis, 'provider_market_estimate_shipping_unknown');
  assert.equal(price.sample.sold, 0, 'legacy estimates must never claim sold comps');
  assert.equal(price.sample.active, 0, 'legacy estimates must never claim active listings');
  assert.equal(price.sourceBreakdown[0].sourceType, 'legacy_cached_market_snapshot');
  assert.equal(price.lastSoldEvidence, undefined, 'legacy estimates must not fabricate a last-sold record');

  const history = await service.snapshotHistory([variantId], { currency: 'GBP', rangeDays: 30 });
  assert.equal(history.snapshots.length, 3, 'only exact, labelled legacy or canonical estimate rows may appear');
  const canonicalPoint = history.snapshots.find((item) => item.primarySource === 'poketrace_sold');
  assert.equal(canonicalPoint.marketCentral, 130);
  assert.equal(canonicalPoint.priceType, 'recent_sold_market_estimate');
  assert.equal(canonicalPoint.provenLastSold, false);
  assert.equal(canonicalPoint.lastSoldEvidence, null);
  assert.equal(canonicalPoint.priceBasis, 'item_price_excludes_shipping');
  const importedPoint = history.snapshots.find((item) => item.primarySource === 'manual_verified_import');
  assert.equal(importedPoint.marketCentral, 127);
  assert.equal(importedPoint.priceType, 'recent_sold_market_estimate');
  assert.equal(importedPoint.provenLastSold, false, 'a manual evidence aggregate is never an individual last sale');
  assert.equal(importedPoint.lastSoldEvidence, null);
  assert.equal(importedPoint.priceBasis, 'item_price_excludes_shipping');
  assert.deepEqual(supabase.rpcCalls[0], {
    schemaName: 'api',
    name: 'market_price_snapshot_history',
    args: { p_card_ids: [variantId, printingId], p_range_days: 30 },
  }, 'range history must use the identity-aware bucket RPC rather than a global snapshot cap');
  assert.ok(supabase.limits.some((entry) => entry.tableName === 'market_price_snapshots' && entry.value <= 128), '30-day snapshot reads must stay bounded');

  const empty = createMarketPricingService({
    supabase: createSnapshotSupabase({ metadata, snapshots: [snapshot({ tcgdex_price: null, tcg_mid: null, tcg_low: null, market_price_gbp: null })] }),
  });
  const unavailable = await empty.price(variantId, { productType: 'raw_card', currency: 'GBP', condition: 'near_mint' });
  assert.equal(unavailable.status, 'unavailable', 'a numeric null must not become a £0 legacy price');
  assert.equal(unavailable.estimates.central, null);

  const usd = await service.price(variantId, { productType: 'raw_card', currency: 'USD', condition: 'near_mint' });
  assert.equal(usd.status, 'unavailable', 'a GBP snapshot must not serve a USD request');
}

async function assertRawPriceDefaultsNearMint() {
  const variantId = '77777777-7777-4777-8777-777777777777';
  const supabase = createSnapshotSupabase({
    metadata: { variant_id: variantId },
    estimates: [],
  });
  const service = createMarketPricingService({ supabase });
  await service.price(variantId, { productType: 'raw_card', currency: 'GBP' });
  assert.ok(supabase.equalities.some((entry) => (
    entry.tableName === 'market_price_estimates'
      && entry.column === 'condition_code'
      && entry.value === 'raw_near_mint'
  )), 'an unspecified raw-card request must query near-mint, not the newest condition');
}

async function assertCanonicalSnapshotLabelsAndBasis() {
  const variantId = '66666666-6666-4666-8666-666666666666';
  const printingId = '55555555-5555-4555-8555-555555555555';
  const metadata = {
    variant_id: variantId, printing_id: printingId, language_code: 'en',
    set_id: '11111111-1111-4111-8111-111111111111', set_code: 'base-set',
    set_english_display_name: 'Base Set', collector_number: '4/102',
    card_english_display_name: 'Charizard', rarity_code: 'Holo Rare', variant_code: 'normal', finish_code: 'normal',
  };
  const snapshot = (source, priceType, calculationSummary = {}) => ({
    card_id: printingId, language: 'en', primary_source: source, market_price_gbp: 100,
    snapshot_at: new Date().toISOString(), pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
    price_type: priceType, methodology_version: 'pricing-v2.0.0',
    source_breakdown: [{ sourceId: source, observationCount: 3 }], calculation_summary: calculationSummary,
  });
  const itemFor = async (row) => {
    const service = createMarketPricingService({ supabase: createSnapshotSupabase({ metadata, snapshots: [row] }) });
    return (await service.snapshotHistory([variantId], { currency: 'GBP', rangeDays: 30 })).snapshots[0];
  };
  const secondary = await itemFor(snapshot('existing_stackr_source', 'recent_sold_market_estimate'));
  assert.equal(secondary.priceType, 'market_estimate', 'a secondary cache is not sold-market evidence without source semantics');
  assert.equal(secondary.priceBasis, 'unknown_or_mixed_normalisation', 'an undeclared basis must not imply item-only pricing');
  assert.equal(secondary.provenLastSold, false);

  const sold = await itemFor(snapshot('poketrace_sold', 'recent_sold_market_estimate', { priceBasis: 'normalised_delivered_price_gbp' }));
  assert.equal(sold.priceType, 'recent_sold_market_estimate', 'a declared sold estimate from a sold-capable source is labelled as aggregate sold-market');
  assert.equal(sold.priceBasis, 'normalised_delivered_price_gbp');
  assert.equal(sold.provenLastSold, false, 'an aggregate must never become a confirmed individual sale');

  const asking = await itemFor(snapshot('ebay_active', 'asking_price_indication'));
  assert.equal(asking.priceType, 'asking_price_indication');
  assert.equal(asking.priceBasis, 'unknown_or_mixed_normalisation', 'active-source identity alone cannot prove shipping treatment');
}

async function assertManualRefreshIdentityAndGate() {
  const variantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const printingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const metadata = {
    variant_id: variantId,
    printing_id: printingId,
    language_code: 'en',
    set_id: '11111111-1111-4111-8111-111111111111',
    set_code: 'base-set',
    set_english_display_name: 'Base Set',
    collector_number: '4/102',
    card_english_display_name: 'Charizard',
    rarity_code: 'Holo Rare',
    variant_code: 'first_edition',
    finish_code: 'reverse_holo',
  };
  const blockedDb = {
    schema() { throw new Error('disabled refresh must not read the database'); },
    from() { throw new Error('disabled refresh must not write the queue'); },
  };
  const disabled = createMarketPricingService({ supabase: blockedDb, refreshEnabled: false });
  await assert.rejects(
    () => disabled.requestSnapshotRefresh(variantId, { productType: 'raw_card', currency: 'GBP', condition: 'near_mint' }),
    (error) => error.code === 'price_refresh_not_enabled',
  );
  await assert.rejects(
    () => disabled.requestSnapshotRefreshBatch([variantId], { productType: 'raw_card', currency: 'GBP', condition: 'near_mint' }),
    (error) => error.code === 'price_refresh_not_enabled',
  );

  const supabase = createSnapshotSupabase({ metadata });
  const enabled = createMarketPricingService({ supabase, refreshEnabled: true });
  await enabled.requestSnapshotRefresh(variantId.toUpperCase(), {
    productType: 'raw_card', currency: 'GBP', condition: 'near_mint',
  });
  assert.equal(supabase.inserted.length, 1, 'an enabled refresh should create one exact queue row');
  const queued = supabase.inserted[0].metadata;
  assert.equal(queued.canonicalVariantId, variantId);
  assert.equal(queued.setCode, 'base-set');
  assert.equal(queued.rarity, 'Holo Rare');
  assert.equal(queued.variantCode, 'first_edition');
  assert.equal(queued.finishCode, 'reverse_holo');
  assert.equal(queued.condition, 'raw_near_mint');
  assert.equal(queued.rawCondition, 'raw_near_mint');
  const rehydrated = buildCanonicalIdentity({
    id: printingId,
    name: queued.canonicalCardName,
    language: 'en',
    number: queued.cardNumber,
    rarity: queued.rarity,
    set_id: metadata.set_id,
    raw_data: {
      canonical_variant_id: queued.canonicalVariantId,
      canonical_printing_id: queued.canonicalPrintingId,
      number: queued.cardNumber,
      rarity: queued.rarity,
      variant: queued.variantCode,
      finish: queued.finishCode,
      set: { id: metadata.set_id, name: queued.canonicalSetName, set_code: queued.setCode },
    },
  }, {
    cardId: printingId,
    canonicalVariantId: queued.canonicalVariantId,
    canonicalPrintingId: queued.canonicalPrintingId,
    canonicalCardName: queued.canonicalCardName,
    canonicalSetName: queued.canonicalSetName,
    setId: metadata.set_id,
    setCode: queued.setCode,
    cardNumber: queued.cardNumber,
    rarity: queued.rarity,
    variant: queued.variantCode,
    finish: queued.finishCode,
    edition: queued.edition,
    condition: queued.condition,
    rawCondition: queued.rawCondition,
    productType: queued.productType,
    language: 'en',
  });
  assert.equal(rehydrated.identityKey, queued.identityKey, 'non-default finish and edition must survive worker rehydration exactly');

  const parser = createMarketPricingService({ supabase: blockedDb, refreshEnabled: true });
  await assert.rejects(
    () => parser.snapshotHistory([variantId, variantId.toUpperCase()], { currency: 'GBP' }),
    (error) => error.code === 'duplicate_variant_ids',
  );
  await assert.rejects(
    () => parser.snapshotHistory([variantId, 'not-a-uuid'], { currency: 'GBP' }),
    (error) => error.code === 'invalid_variant_ids',
  );
  await assert.rejects(
    () => parser.requestSnapshotRefreshBatch([variantId, variantId.toUpperCase()], { productType: 'raw_card', currency: 'GBP' }),
    (error) => error.code === 'duplicate_variant_ids',
  );
}

async function assertIdentityAwareDenseRangeHistory() {
  const firstVariantId = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const secondVariantId = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const printingId = '33333333-cccc-4ccc-8ccc-cccccccccccc';
  const catalogueCards = [firstVariantId, secondVariantId].map((variantId, index) => ({
    variant_id: variantId,
    printing_id: printingId,
    language_code: 'en',
    set_id: '11111111-1111-4111-8111-111111111111',
    set_code: 'base-set',
    set_english_display_name: 'Base Set',
    collector_number: '4/102',
    card_english_display_name: 'Charizard',
    rarity_code: 'Holo Rare',
    variant_code: index ? 'reverse_holo' : 'normal',
    finish_code: index ? 'reverse_holo' : 'normal',
  }));
  const now = Date.now();
  const snapshots = [];
  for (const [index, variantId] of [firstVariantId, secondVariantId].entries()) {
    for (let day = 0; day < 30; day += 1) {
      snapshots.push({
        card_id: printingId,
        language: 'en',
        primary_source: 'poketrace_sold',
        market_price_gbp: 100 + index * 50 + day,
        snapshot_at: new Date(now - 30 * 86_400_000 + 60_000 + day * 86_400_000).toISOString(),
        pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
        price_type: 'recent_sold_value',
        methodology_version: 'pricing-v2.0.0',
        source_breakdown: [{ sourceId: 'poketrace_sold', observationCount: 3 }],
      });
    }
    snapshots.push({
      card_id: printingId,
      language: 'en',
      primary_source: 'poketrace_sold',
      market_price_gbp: 200 + index,
      snapshot_at: new Date(now - 120_000).toISOString(),
      pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
      price_type: 'recent_sold_value',
      methodology_version: 'pricing-v2.0.0',
      source_breakdown: [{ sourceId: 'poketrace_sold', observationCount: 3 }],
    });
    snapshots.push({
      card_id: printingId,
      language: 'en',
      primary_source: 'poketrace_sold',
      market_price_gbp: 50 + index,
      snapshot_at: new Date(now - 31 * 86_400_000).toISOString(),
      pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
      price_type: 'recent_sold_value',
      methodology_version: 'pricing-v2.0.0',
      source_breakdown: [{ sourceId: 'poketrace_sold', observationCount: 3 }],
    });
  }
  // A source-null sibling row is newer than the valid rows. The SQL function
  // filters it before buckets are chosen; service filtering keeps the same
  // fail-closed rule when exercising the returned payload.
  snapshots.push({
    card_id: printingId,
    language: 'en',
    market_price_gbp: 9999,
    snapshot_at: new Date(now - 30_000).toISOString(),
    pricing_identity_json: { canonicalVariantId: firstVariantId, productType: 'raw_card', condition: 'raw_near_mint' },
  });
  const supabase = createSnapshotSupabase({ metadata: catalogueCards, snapshots });
  const service = createMarketPricingService({ supabase });
  const history = await service.snapshotHistory([firstVariantId, secondVariantId], { currency: 'GBP', rangeDays: 30 });
  const first = history.snapshots.filter((row) => row.variantId === firstVariantId);
  const second = history.snapshots.filter((row) => row.variantId === secondVariantId);
  assert.equal(first.length, 32, 'the first sibling retains 31 range points plus a baseline');
  assert.equal(second.length, 32, 'the second sibling cannot be displaced by the first sibling history');
  assert.ok(history.snapshots.every((row) => row.primarySource === 'poketrace_sold'));
  assert.ok(history.snapshots.every((row) => row.marketCentral < 9999));
  assert.equal(supabase.rpcCalls.length, 1);
  assert.ok(supabase.rpcCalls[0].args.p_card_ids.length <= 120);
}

async function assertPagedRangeHistoryKeepsBaseline() {
  const variantId = '88888888-8888-4888-8888-888888888888';
  const printingId = '99999999-9999-4999-8999-999999999999';
  const now = Date.now();
  const metadata = {
    variant_id: variantId, printing_id: printingId, language_code: 'en',
    set_id: '11111111-1111-4111-8111-111111111111', set_code: 'base-set',
    set_english_display_name: 'Base Set', collector_number: '4/102',
    card_english_display_name: 'Charizard', rarity_code: 'Holo Rare', variant_code: 'normal', finish_code: 'normal',
  };
  const valid = (snapshotAt, price) => ({
    card_id: printingId, language: 'en', primary_source: 'poketrace_sold', market_price_gbp: price,
    snapshot_at: snapshotAt, pricing_identity_json: { canonicalVariantId: variantId, productType: 'raw_card', condition: 'raw_near_mint' },
    price_type: 'recent_sold_value', methodology_version: 'pricing-v2.0.0', source_breakdown: [{ sourceId: 'poketrace_sold', observationCount: 3 }],
  });
  const snapshots = Array.from({ length: 1_000 }, (_, index) => valid(new Date(now - 60_000 - index * 1_000).toISOString(), 100 + index));
  snapshots.push(valid(new Date(now - 31 * 86_400_000).toISOString(), 50));
  const supabase = createSnapshotSupabase({ metadata, snapshots });
  const history = await createMarketPricingService({ supabase }).snapshotHistory([variantId], { currency: 'GBP', rangeDays: 30 });
  assert.equal(supabase.rangeCalls.length, 2, 'a full RPC page must fetch its next page');
  assert.ok(history.snapshots.some((row) => row.marketCentral === 50), 'the page-two pre-range baseline must be retained');
}

assertMigrationShape();
assertOpenApiAndClientContract();
assertPricingMathAndTitleValidation();
await assertEbayAdapterBoundary();
await assertRoutes();
await assertInvalidServiceInput();
await assertLabelledLegacySnapshotFallback();
await assertRawPriceDefaultsNearMint();
await assertCanonicalSnapshotLabelsAndBasis();
await assertManualRefreshIdentityAndGate();
await assertIdentityAwareDenseRangeHistory();
await assertPagedRangeHistoryKeepsBaseline();

console.log('Market pricing service tests passed.');
