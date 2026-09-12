import assert from 'node:assert/strict';
import {
  binderCanonicalVariantCode,
  binderPriceInputForRow,
  loadProgressiveBinderPrices,
  mergeBinderPriceResults,
} from '../lib/binderPricing';
import { loadCollectionPrices } from '../lib/collectionPricingApi';

async function main() {
const row: any = {
  id: 'binder-row', card_id: 'legacy-card', api_card_id: 'legacy-api-card', set_id: 'legacy-set', api_set_id: 'legacy-api-set',
  catalogue_match_status: 'catalogue', language: 'en', owned: true, owned_quantity: 2, condition: 'Near Mint', tcg_price: 9, last_price_update: '2026-09-01T00:00:00Z',
  card: { id: '11111111-1111-4111-8111-111111111111', language: 'en', set: { id: '22222222-2222-4222-8222-222222222222' }, externalIds: { stackrVariant: '44444444-4444-4444-8444-444444444444' }, raw_data: { language: 'en', stackr: { canonical: true, cardId: '11111111-1111-4111-8111-111111111111', defaultVariantId: '33333333-3333-4333-8333-333333333333', variants: [
    { variantId: '33333333-3333-4333-8333-333333333333', variantCode: 'normal' }, { variantId: '44444444-4444-4444-8444-444444444444', variantCode: 'reverse-holo' },
  ] } } },
};

assert.equal(binderCanonicalVariantCode(row), 'reverse-holo', 'the declared canonical UUID selects its matching finish');
const input = binderPriceInputForRow(row, { language: 'en' });
assert.deepEqual(input.references, ['11111111-1111-4111-8111-111111111111', 'legacy-api-card', 'legacy-card'],
  'catalogue facts lead while matched saved IDs remain normal-resolution fallbacks');
assert.equal(input.variantCode, 'reverse-holo');
assert.equal(input.condition, 'Near Mint');
assert.equal(binderPriceInputForRow({ ...row, condition: 'Lightly Played' }).condition, 'Near Mint',
  'binder rendering applies the saved condition adjustment once to the base quote');
assert.ok(input.trustedResolution, 'canonical card facts create a trusted exact resolution');
let resolverCalls = 0;
let quotedVariant = '';
const [trustedQuote] = await loadCollectionPrices([input], {
  resolver: async () => { resolverCalls += 1; throw new Error('canonical facts must avoid alias resolution'); },
  client: { cardPrice: async (variantId: string) => {
    quotedVariant = variantId;
    return { data: { estimates: { central: 12.5 }, status: 'recent_sold_value', freshness: 'fresh', calculatedAt: '2026-09-12T10:00:00Z', staleAfter: null, unavailableReason: null } };
  } } as any,
});
assert.equal(resolverCalls, 0, 'trusted canonical facts bypass redundant alias resolution');
assert.equal(quotedVariant, '44444444-4444-4444-8444-444444444444', 'the declared finish selects the exact price variant');
assert.equal(trustedQuote.central, 12.5);

const merged = mergeBinderPriceResults([row], [{
  key: row.id, quantity: 2, reference: '11111111-1111-4111-8111-111111111111', variantId: '44444444-4444-4444-8444-444444444444', central: 12.5,
  status: 'recent_sold_value', freshness: 'fresh', calculatedAt: '2026-09-12T10:00:00Z', staleAfter: null,
  unavailableReason: null, requestError: null,
}]);
assert.equal(merged[0].tcg_price, 12.5);
assert.equal(merged[0].last_price_update, '2026-09-12T10:00:00Z');

const retained = mergeBinderPriceResults([row], [{
  key: row.id, quantity: 2, reference: '11111111-1111-4111-8111-111111111111', variantId: '44444444-4444-4444-8444-444444444444', central: null,
  status: 'unavailable', freshness: 'unknown', calculatedAt: null, staleAfter: null,
  unavailableReason: 'No evidence', requestError: null,
}]);
assert.equal(retained[0], row, 'an unavailable quote cannot erase a stored value');
assert.equal(mergeBinderPriceResults([row], [{ ...trustedQuote, calculatedAt: '2026-08-01T00:00:00Z', freshness: 'stale' }])[0], row,
  'an older cached quote cannot overwrite newer displayed evidence');
assert.equal(mergeBinderPriceResults([row], [{ ...trustedQuote, freshness: 'expired' }])[0], row,
  'expired evidence cannot overwrite displayed evidence');

const unresolved = { ...row, card: { externalIds: { stackrVariant: 'variant-missing' }, raw_data: { stackr: { variants: [] } } } };
assert.equal(binderPriceInputForRow(unresolved, { language: 'en' }).variantCode, undefined,
  'a UUID without a declared finish cannot invent a price variant');

const secondRow = { ...row, id: 'binder-row-2' };
let deniedQuoteCalls = 0;
let deniedResolverCalls = 0;
let interruptedStatus: number | null = null;
const deniedRows = await loadProgressiveBinderPrices([row, secondRow], { language: 'en' }, {
  concurrency: 1,
  resolver: async () => { deniedResolverCalls += 1; throw new Error('trusted rows cannot resolve aliases'); },
  client: { cardPrice: async () => {
    deniedQuoteCalls += 1;
    throw Object.assign(new Error('access denied'), { status: 403, code: 'access_denied' });
  } } as any,
  onInterrupted: (failure) => { interruptedStatus = failure.status; },
});
assert.equal(deniedResolverCalls, 0, 'a canonical row never starts redundant alias lookup');
assert.equal(deniedQuoteCalls, 1, '403 stops scheduling later binder price rows');
assert.equal(deniedRows[0].tcg_price, 9);
assert.equal(deniedRows[1].tcg_price, 9, 'deferred rows retain their stored values');
assert.equal(interruptedStatus, 403, 'a viewport reader can stop retrying after an access interruption');
console.log('Binder pricing uses canonical facts, preserves saved quotes, and declines unproven finishes.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
