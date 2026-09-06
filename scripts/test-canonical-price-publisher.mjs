import assert from 'node:assert/strict';
import { publishCanonicalPriceEstimate } from '../backend/lib/marketPricing/publishEstimates.js';
import { projectCanonicalSnapshot } from '../backend/lib/pricingV2/snapshotProjection.js';
import { buildPricingSnapshotRow, publicPriceType } from '../backend/lib/pricingV2/engine.js';

const variantId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-05T12:00:00.000Z';

function fixture() {
  const sold = [1, 2, 3].map((id) => ({
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    market_identity_id: '33333333-3333-4333-8333-333333333333', variant_id: variantId,
    sealed_product_variant_id: null, condition_code: 'raw_near_mint', grader_code: null, grade_id: null,
    provider_code: 'manual_verified_import', source_item_id: `12345678900${id}`,
    sold_price: 10 + id, shipping_price: id === 2 ? 100 : null, currency_code: 'GBP',
    sold_at: '2026-09-04T10:00:00Z', observed_at: '2026-09-04T12:00:00Z',
    source_url: `https://www.ebay.co.uk/itm/12345678900${id}`, raw_title: 'Exact reviewed card sale',
    raw_record_id: `raw-${id}`, evidence_sha256: String(id).repeat(64),
    sale_verification_state: 'confirmed', transaction_status: 'completed', final_price_confirmed: true,
    canonical_match_verified: true, provenance_version: 'sold-provenance-v1', parsed_match_confidence: 0.99,
  }));
  return {
    'market.sold_observations': sold,
    'market.source_providers': [{ code: 'manual_verified_import', provider_kind: 'manual_import', active: true,
      supports_sold_observations: true, data_licence_status: 'approved', automated_refresh_allowed: false }],
    'market.price_estimate_versions': [{ id: versionId, version_key: 'market-pricing-v1.0.0', status: 'active' }],
    'ingest.sources': [{ id: 'source-1', code: 'manual_verified_import', source_type: 'manual', active: true, licence_status: 'approved' }],
    'ingest.raw_source_records': sold.map((row) => ({ id: row.raw_record_id, source_id: 'source-1', record_type: 'price',
      provider_record_id: row.source_item_id, source_url: row.source_url, licence_status: 'approved',
      validation_status: 'valid', payload_hash: row.evidence_sha256 })),
  };
}

function client(data = fixture(), acknowledgement = null) {
  const calls = [];
  return { calls, schema(schema) { return {
    from(table) {
      const key = `${schema}.${table}`;
      assert(Object.hasOwn(data, key), `Unreviewed table access: ${key}`);
      const query = { then(resolve, reject) { return Promise.resolve({ data: data[key], error: null }).then(resolve, reject); } };
      for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
        query[method] = (...args) => { calls.push({ key, method, args }); return query; };
      }
      return query;
    },
    async rpc(name, args) {
      calls.push({ schema, name, args });
      assert.equal(schema, 'api');
      assert.equal(name, 'apply_canonical_price_estimate_batch');
      return acknowledgement ?? { data: { status: 'applied', estimateVersionId: versionId,
        requestedCount: 1, writtenCount: 1, includedSoldDecisionCount: 3 }, error: null };
    },
  }; } };
}

const dryClient = client();
const dry = await publishCanonicalPriceEstimate(dryClient, { variantId, now });
assert.equal(dry.status, 'ready');
assert.equal(dry.plan.estimates[0].central_estimate, 12, 'Shipping is not silently blended with unknown shipping');
assert.equal(dry.plan.estimates[0].outlier_summary.price_basis, 'item_price_excludes_shipping');
assert(!dryClient.calls.some((call) => call.name), 'Dry-run is strictly read-only');
assert(dryClient.calls.some((call) => call.method === 'eq' && call.args[0] === 'variant_id' && call.args[1] === variantId));
assert(dryClient.calls.some((call) => call.method === 'limit' && call.args[0] === 201));
assert(dryClient.calls.some((call) => call.method === 'lte' && call.args[0] === 'sold_at' && call.args[1] === now));

const writeClient = client();
const applied = await publishCanonicalPriceEstimate(writeClient, { variantId, now, dryRun: false });
assert.equal(applied.writtenCount, 1);
assert.equal(writeClient.calls.filter((call) => call.name).length, 1);
const identity = { cardId: 'printing-alias', canonicalVariantId: variantId, rawCondition: 'near_mint',
  productType: 'raw_card', language: 'en', identityKey: 'exact-v2-identity' };
const legacyEstimate = { marketEstimate: 112, priceType: 'recent_sold_value', primarySource: 'ebay_active', compCount: 99 };
const legacyConfidence = { score: 99, label: 'high', explanation: 'Legacy estimate' };
const projected = projectCanonicalSnapshot(identity, legacyEstimate, legacyConfidence, applied);
const snapshot = buildPricingSnapshotRow(identity, projected.estimate, projected.confidence);
assert.equal(snapshot.market_price_gbp, 12, 'History and canonical API must use the same acknowledged item price, not delivered/FX estimates');
assert.equal(snapshot.card_id, identity.cardId, 'History keeps the canonical printing alias');
assert.equal(snapshot.canonical_identity_key, identity.identityKey, 'Snapshot identity is not the distinct DB evidence identity key');
assert.equal(snapshot.pricing_identity_json.canonicalVariantId, variantId);
assert.equal(snapshot.calculation_summary.priceBasis, 'item_price_excludes_shipping');
assert.equal(snapshot.calculated_at, now);
assert.equal(snapshot.stale_after, applied.estimate.stale_after, 'Reading old sales must not invent fresh evidence');
assert.equal(snapshot.proven_last_sold, false, 'An aggregate never equals an individual Last sold amount');
assert.equal(snapshot.last_sold_observation_id, null);
assert.equal(snapshot.price_type, 'recent_sold_market_estimate');
assert.equal(snapshot.primary_source, 'manual_verified_import');
assert.equal(snapshot.active_listing_indication_gbp, null);
assert.equal(snapshot.comp_count, 3);
const fallback = projectCanonicalSnapshot(identity, legacyEstimate, legacyConfidence, { status: 'disabled' });
assert.equal(fallback.estimate.priceBasis, 'normalised_delivered_price_gbp');
const fallbackSnapshot = buildPricingSnapshotRow(identity, fallback.estimate, fallback.confidence);
assert.equal(fallbackSnapshot.proven_last_sold, false);
assert.equal(publicPriceType({ price_type: 'recent_sold_value', proven_last_sold: true, last_sold_observation_id: versionId }), 'recent_sold_market_estimate');
for (const change of [
  { variant_id: versionId }, { condition_code: 'raw_damaged' }, { display_currency_code: 'USD' },
  { central_estimate: null }, { product_kind: 'graded_card' }, { outlier_summary: { price_basis: 'delivered' } },
]) assert.throws(() => projectCanonicalSnapshot(identity, legacyEstimate, legacyConfidence,
  { ...applied, estimate: { ...applied.estimate, ...change } }), /snapshot scope and price basis/);
assert.throws(() => projectCanonicalSnapshot(identity, legacyEstimate, legacyConfidence, { ...applied, dryRun: true }), /snapshot scope and price basis/);

const noData = fixture(); noData['market.sold_observations'] = [];
assert.equal((await publishCanonicalPriceEstimate(client(noData), { variantId, now, dryRun: false })).status, 'no_qualified_evidence');

for (const mutate of [
  (data) => { data['ingest.raw_source_records'][0].payload_hash = 'f'.repeat(64); },
  (data) => { data['market.source_providers'][0].active = false; },
  (data) => { data['ingest.sources'][0].licence_status = 'unreviewed'; },
  (data) => { data['market.sold_observations'][0].transaction_status = 'refunded'; },
  (data) => { data['market.sold_observations'][0].observed_at = '2099-01-01T00:00:00Z'; },
]) {
  const data = fixture(); mutate(data); const db = client(data);
  assert.equal((await publishCanonicalPriceEstimate(db, { variantId, now, dryRun: false })).writtenCount, 0);
  assert(!db.calls.some((call) => call.name), 'Unqualified evidence must never reach the writer');
}

for (const mutate of [
  (data) => { data['market.sold_observations'][0].variant_id = versionId; },
  (data) => { data['market.price_estimate_versions'] = []; },
  (data) => { data['market.sold_observations'] = Array(201).fill(data['market.sold_observations'][0]); },
]) {
  const data = fixture(); mutate(data); const db = client(data);
  await assert.rejects(publishCanonicalPriceEstimate(db, { variantId, now, dryRun: false }));
  assert(!db.calls.some((call) => call.name));
}
await assert.rejects(publishCanonicalPriceEstimate(client(), { variantId, now, currency: 'USD' }), /no implicit FX/);
await assert.rejects(publishCanonicalPriceEstimate(client(), { variantId, now, condition: 'near_mint' }), /explicit supported/);
await assert.rejects(publishCanonicalPriceEstimate(client(fixture(), { data: { status: 'applied', writtenCount: 0 }, error: null }),
  { variantId, now, dryRun: false }), /incomplete acknowledgement/);
await assert.rejects(publishCanonicalPriceEstimate(client(fixture(), { data: null, error: { message: 'rejected evidence' } }),
  { variantId, now, dryRun: false }), /publication failed/);

console.log('Canonical price publisher: bounded exact scope, retained evidence, dry-run, acknowledgements and failure paths passed.');
