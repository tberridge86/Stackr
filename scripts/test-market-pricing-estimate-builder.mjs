import assert from 'node:assert/strict';
import { buildCanonicalPriceEstimatePlan } from '../backend/lib/marketPricing/estimateBuilder.js';

const NOW = '2026-08-23T12:00:00.000Z';
const VERSION_ID = '00000000-0000-4000-8000-000000000001';

function sold(id, price, overrides = {}) {
  return {
    id,
    market_identity_id: '00000000-0000-4000-8000-000000000010',
    variant_id: '00000000-0000-4000-8000-000000000020',
    sealed_product_variant_id: null,
    provider_code: 'manual_verified_import',
    provider_authorised: true,
    raw_evidence_verified: true,
    source_item_id: `source-${id}`,
    sold_price: price,
    shipping_price: 0,
    currency_code: 'GBP',
    condition_code: 'raw_near_mint',
    grader_code: null,
    grade_id: null,
    observed_at: '2026-08-22T13:00:00.000Z',
    sold_at: '2026-08-22T12:00:00.000Z',
    source_url: `https://www.ebay.co.uk/itm/source-${id}`,
    raw_title: 'Verified sale evidence',
    raw_record_id: '00000000-0000-4000-8000-000000000099',
    evidence_sha256: 'a'.repeat(64),
    sale_verification_state: 'confirmed',
    final_price_confirmed: true,
    canonical_match_verified: true,
    transaction_status: 'completed',
    provenance_version: 'sold-provenance-v1',
    parsed_match_confidence: 0.95,
    ...overrides,
  };
}

const plan = buildCanonicalPriceEstimatePlan({
  estimateVersionId: VERSION_ID,
  now: NOW,
  observations: [
    sold('a', 10),
    sold('b', 12),
    sold('c', 14),
    sold('duplicate-a', 10, { source_item_id: 'source-a' }),
    sold('low-confidence', 11, { parsed_match_confidence: 0.84 }),
    sold('usd', 11, { currency_code: 'USD' }),
  ],
});

assert.equal(plan.summary.inputObservations, 6);
assert.equal(plan.summary.estimateCount, 1);
assert.equal(plan.summary.totalSoldObservationsUsed, 3);
assert.equal(plan.estimates[0].display_currency_code, 'GBP');
assert.equal(plan.estimates[0].evidence_status, 'recent_sold_value');
assert.equal(plan.estimates[0].central_estimate, 12);
assert.equal(plan.estimates[0].sold_sample_count, 3);
assert.equal(plan.estimates[0].outlier_summary.duplicate_observation_count, 1);
assert.equal(plan.estimates[0].stale_after, '2026-08-25T12:00:00.000Z');
assert.ok(plan.excluded.some((row) => row.reason === 'below_minimum_match_confidence'));
assert.ok(plan.excluded.some((row) => row.reason === 'unsupported_display_currency_for_current_builder'));

const unproven = buildCanonicalPriceEstimatePlan({
  estimateVersionId: VERSION_ID,
  now: NOW,
  observations: [
    sold('legacy-a', 10, { sale_verification_state: 'unknown' }),
    sold('legacy-b', 12, { sale_verification_state: 'unknown' }),
    sold('legacy-c', 14, { sale_verification_state: 'unknown' }),
  ],
});
assert.equal(unproven.estimates.length, 0, 'legacy sold rows must not produce a recent sold value');
assert.equal(unproven.excluded.filter((row) => row.reason === 'unproven_sold_observation').length, 3);

const unauthorisedProvider = buildCanonicalPriceEstimatePlan({
  estimateVersionId: VERSION_ID,
  now: NOW,
  observations: [
    sold('restricted-a', 10, { provider_authorised: false }),
    sold('restricted-b', 12, { provider_authorised: false }),
    sold('restricted-c', 14, { provider_authorised: false }),
  ],
});
assert.equal(unauthorisedProvider.estimates.length, 0, 'a restricted provider must not produce sold evidence');

const detachedRawEvidence = buildCanonicalPriceEstimatePlan({
  estimateVersionId: VERSION_ID,
  now: NOW,
  observations: [
    sold('detached-a', 10, { raw_evidence_verified: false }),
    sold('detached-b', 12, { raw_evidence_verified: false }),
    sold('detached-c', 14, { raw_evidence_verified: false }),
  ],
});
assert.equal(detachedRawEvidence.estimates.length, 0, 'a detached or hash-mismatched raw record must not produce sold evidence');

const insufficient = buildCanonicalPriceEstimatePlan({
  estimateVersionId: VERSION_ID,
  now: NOW,
  observations: [sold('only-a', 10), sold('only-b', 12)],
});
assert.equal(insufficient.estimates.length, 0);
assert.equal(insufficient.excluded[0].reason, 'insufficient_exact_sold_observations');

for (const domain of ['com', 'co.uk', 'de', 'fr', 'it', 'es', 'ca', 'com.au', 'at', 'be', 'ch', 'ie', 'nl', 'pl', 'com.sg', 'com.hk', 'com.my', 'ph']) {
  const originals = [sold('a', 10), sold('b', 12), sold('c', 14)];
  const item = { source_item_id: '123456789012', source_url: `https://www.ebay.${domain}/itm/123456789012` };
  originals[0] = sold('a', 10, item);
  const repeated = sold('other-provider', 10, { ...item, provider_code: 'poketrace_sold', source_url: 'https://www.ebay.co.uk/itm/123456789012' });
  const deduped = buildCanonicalPriceEstimatePlan({ estimateVersionId: VERSION_ID, now: NOW, observations: [...originals, repeated] });
  assert.equal(deduped.estimates[0].sold_sample_count, 3, `${domain}: a cross-provider repeat is not a fourth sale`);
  for (const disagreement of [{ sold_price: 999 }, { sold_at: '2026-08-22T11:00:00Z' }]) {
    const conflicting = buildCanonicalPriceEstimatePlan({ estimateVersionId: VERSION_ID, now: NOW, observations: [...originals, { ...repeated, ...disagreement }] });
    assert.equal(conflicting.estimates.length, 0, 'Disputed sale evidence must not be arbitrarily chosen');
    assert.ok(conflicting.excluded.some((row) => row.reason === 'conflicting_sale_evidence'));
  }
}
const itemOnly = buildCanonicalPriceEstimatePlan({ estimateVersionId: VERSION_ID, now: NOW,
  observations: [sold('a', 10, { shipping_price: null }), sold('b', 12, { shipping_price: 100 }), sold('c', 14)] });
assert.equal(itemOnly.estimates[0].central_estimate, 12);
assert.equal(itemOnly.estimates[0].outlier_summary.price_basis, 'item_price_excludes_shipping');

console.log('Market pricing estimate builder tests passed.');
