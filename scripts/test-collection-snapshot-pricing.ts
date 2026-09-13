import assert from 'node:assert/strict';
import {
  exactLegacyRawNearMintReference,
  exactTrustedRawNearMintVariantId,
  loadExactCollectionSnapshotPrices,
  loadLegacyCollectionSnapshotPrices,
  type CollectionPriceInput,
} from '../lib/collectionPricingApi';

const cardId = '11111111-1111-4111-8111-111111111111';
const setId = '22222222-2222-4222-8222-222222222222';
const normalId = '33333333-3333-4333-8333-333333333333';
const holoId = '44444444-4444-4444-8444-444444444444';
const input = (key: string, variantCode = 'normal', condition = 'Near Mint'): CollectionPriceInput => ({
  key, references: [cardId], quantity: 2, language: 'en', setId, variantCode, condition,
  trustedResolution: {
    canonical: true, cardId, setId, language: 'en', defaultVariantId: normalId,
    variants: [{ variantId: normalId, variantCode: 'normal' }, { variantId: holoId, variantCode: 'holo' }],
  },
});
assert.equal(exactTrustedRawNearMintVariantId(input('normal')), normalId);
assert.equal(exactTrustedRawNearMintVariantId({ ...input('holo', 'holo'), productType: 'graded_card' }), null,
  'graded cards must never read a raw near-mint snapshot');
assert.equal(exactTrustedRawNearMintVariantId(input('condition', 'normal', 'Damaged')), null,
  'a saved non-NM condition must not inherit the NM snapshot');
assert.equal(exactLegacyRawNearMintReference({ key: 'legacy-null', references: [], quantity: 1, language: 'ja', setId: 'S12a', legacySetId: 'S12a', legacyReference: 'S12a-146', condition: 'Near Mint' }), 'S12a-146', 'an unmarked legacy finish remains a printing-level cached estimate');
assert.equal(exactLegacyRawNearMintReference({ key: 'graded', references: [], quantity: 1, language: 'en', setId: 'me4', legacySetId: 'me4', legacyReference: 'me4-33', productType: 'graded_card', condition: 'Near Mint' }), null);
assert.equal(exactLegacyRawNearMintReference({ key: 'edition', references: [], quantity: 1, language: 'en', setId: 'me4', legacySetId: 'me4', legacyReference: 'me4-33', edition: 'first_edition', condition: 'Near Mint' }), null);

(async () => {
const legacyRequests: unknown[] = [];
const legacyProgress: number[] = [];
const legacyRead = await loadLegacyCollectionSnapshotPrices([
  { key: 'legacy-row', references: [], quantity: 2, language: 'ja', setId: 'ja:S12a', legacySetId: 'ja:S12a', legacyReference: 'S12a-146', condition: 'Near Mint' },
  { key: 'legacy-grade', references: [], quantity: 1, language: 'ja', setId: 'ja:S12a', legacySetId: 'ja:S12a', legacyReference: 'S12a-147', productType: 'graded_card', condition: 'Near Mint' },
  { key: 'legacy-second-group', references: [], quantity: 1, language: 'en', setId: 'me4', legacySetId: 'me4', legacyReference: 'me4-33', condition: 'Near Mint' },
  { key: 'legacy-third-group', references: [], quantity: 1, language: 'zh-cn', setId: 'sv1', legacySetId: 'sv1', legacyReference: 'sv1-1', condition: 'Near Mint' },
], {
  async marketPriceSnapshots(request) {
    legacyRequests.push(request);
    if (legacyRequests.length === 2) throw Object.assign(new Error('service unavailable'), { status: 503, code: 'service_unavailable' });
    return { data: { snapshots: [], legacySnapshots: [{ cardId: 'S12a-146', legacySetId: 'ja:S12a', languageCode: 'ja', marketCentral: 4.25, currency: 'GBP', calculatedAt: '2026-09-06T00:00:00Z', snapshotAt: '2026-09-06T00:00:00Z', priceType: 'market_estimate', freshness: 'stale', staleAfter: null, primarySource: 'tcgdex', priceBasis: 'unknown_or_mixed_normalisation', quoteScope: 'printing_level' }] } } as any;
  },
}, undefined, (read) => { legacyProgress.push(read.results.size); });
assert.deepEqual(legacyRequests[0], { legacyIds: ['S12a-146'], legacySetId: 'ja:S12a', language: 'ja', latestOnly: true }, 'legacy batches retain Japanese colon-scoped set IDs and exclude grades');
assert.equal(legacyRequests.length, 2, 'a recognized interruption stops remaining legacy groups instead of continuing the request storm');
assert.equal(legacyRead.results.get(0)?.central, 4.25, 'a null-finish raw NM row receives only its labelled legacy printing estimate');
assert.equal(legacyRead.results.has(1), false, 'graded rows never receive a raw legacy estimate');
assert.equal(legacyRead.failure?.status, 503, 'the interruption is returned with the preserved first group');
assert.deepEqual(legacyProgress, [1, 1], 'legacy batches publish usable partial results without waiting for the complete collection');

const requested: string[][] = [];
const read = await loadExactCollectionSnapshotPrices([input('first'), input('same')], {
  client: {
    async marketPriceSnapshots({ variantIds }) {
      requested.push(variantIds ?? []);
      return { data: { snapshots: [{
        cardId: normalId, variantId: normalId, marketCentral: 12.5, currency: 'GBP',
        priceType: 'legacy_cached_market_estimate', freshness: 'fresh',
        calculatedAt: '2026-09-13T07:00:00.000Z', snapshotAt: '2026-09-13T07:00:00.000Z',
        staleAfter: '2026-09-13T13:00:00.000Z', quoteScope: 'exact_variant', primarySource: 'tcgdex',
      }, {
        cardId: normalId, variantId: normalId, marketCentral: 1, currency: 'GBP',
        priceType: 'legacy_cached_market_estimate', freshness: 'fresh',
        calculatedAt: '2026-09-12T07:00:00.000Z', snapshotAt: '2026-09-12T07:00:00.000Z',
        staleAfter: '2026-09-12T13:00:00.000Z', quoteScope: 'exact_variant', primarySource: 'tcgdex',
      }] } } as any;
    },
  },
});
assert.deepEqual(requested, [[normalId]], 'duplicate owned units share one 24-ID snapshot request');
assert.equal(read.results.size, 2);
assert.equal(read.results.get(0)?.central, 12.5);
assert.equal(read.results.get(1)?.quantity, 2);

const rejected = await loadExactCollectionSnapshotPrices([input('bad')], {
  client: { async marketPriceSnapshots() { return { data: { snapshots: [{
    variantId: normalId, cardId: normalId, marketCentral: 99, currency: 'GBP', priceType: 'legacy_cached_market_estimate',
    freshness: 'fresh', calculatedAt: null, snapshotAt: '2026-09-13T07:00:00.000Z', quoteScope: 'printing_level',
  }] } } as any; } },
});
assert.equal(rejected.results.size, 0, 'printing-level history cannot be promoted to an exact owned variant quote');
const printingRead = await loadExactCollectionSnapshotPrices([{
  key: 'legacy', references: ['me4-33'], quantity: 1, language: 'en', setId,
  variantCode: 'normal', condition: 'Near Mint', canonicalPrintingId: cardId,
}], {
  client: { async marketPriceSnapshots({ printingIds }) {
    assert.deepEqual(printingIds, [cardId], 'legacy saved rows request a bounded canonical printing batch');
    return { data: { snapshots: [{
      cardId, variantId: normalId, printingId: cardId, setId, languageCode: 'en', variantCode: 'normal',
      marketCentral: 4.5, currency: 'GBP', priceType: 'legacy_cached_market_estimate', freshness: 'fresh',
      calculatedAt: '2026-09-13T07:00:00.000Z', snapshotAt: '2026-09-13T07:00:00.000Z', quoteScope: 'exact_variant',
    }] } } as any;
  } },
});
assert.equal(printingRead.results.get(0)?.central, 4.5, 'printing results require matching set, language and normal finish metadata');
console.log('Exact collection snapshot batching retains trusted variant, condition, scope and duplicate safeguards.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
