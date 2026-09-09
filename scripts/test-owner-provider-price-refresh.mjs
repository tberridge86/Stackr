import assert from 'node:assert/strict';
import {
  OWNER_PRICE_REFRESH_MAX_LIMIT,
  ownedRowEligibility,
  parseOwnerPriceRefreshArguments,
  resolveOwnedProviderVariant,
} from './lib/owner-provider-price-refresh-core.mjs';
import { runOwnerProviderRefresh } from './refresh-owner-provider-prices.mjs';

const variant = '11111111-1111-4111-8111-111111111111';
const set = '22222222-2222-4222-8222-222222222222';
const owned = { card_id: 'tcgdex-card', set_id: 'tcgdex-set', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
const identifiers = [
  { source_entity_type: 'card', external_id: 'tcgdex-card', set_id: set, variant_id: variant },
  { source_entity_type: 'set', external_id: 'tcgdex-set', set_id: set, variant_id: null },
];
const catalogue = [{ variant_id: variant, set_id: set, language_code: 'en', variant_code: 'normal', finish_code: 'normal' }];

assert.deepEqual(parseOwnerPriceRefreshArguments([]), { limit: 10, dryRun: true });
assert.deepEqual(parseOwnerPriceRefreshArguments(['--limit=2', '--apply']), { limit: 2, dryRun: false });
assert.throws(() => parseOwnerPriceRefreshArguments([`--limit=${OWNER_PRICE_REFRESH_MAX_LIMIT + 1}`]), /1 to 30/);
assert.equal(ownedRowEligibility({ ...owned, condition: 'Lightly Played' }), 'not_raw_near_mint');
assert.equal(ownedRowEligibility({ ...owned, grade: '10' }), 'graded_card');
assert.deepEqual(resolveOwnedProviderVariant(owned, identifiers, catalogue), { ok: true, variantId: variant });
assert.deepEqual(resolveOwnedProviderVariant({ ...owned, card_id: variant, set_id: set }, [], catalogue), { ok: true, variantId: variant });
assert.equal(resolveOwnedProviderVariant(owned, identifiers, [{ ...catalogue[0], finish_code: 'holo' }]).reason, 'unsupported_or_unpublished_variant');
assert.equal(resolveOwnedProviderVariant(owned, [...identifiers, { ...identifiers[0], variant_id: '33333333-3333-4333-8333-333333333333' }], [...catalogue, { ...catalogue[0], variant_id: '33333333-3333-4333-8333-333333333333' }]).reason, 'ambiguous_saved_identity');

function query(data) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, gt() { return chain; }, order() { return chain; }, limit() { return chain; }, in() { return chain; },
    then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); },
  };
  return chain;
}
const supabase = {
  from(name) { return query(name === 'user_card_variants' ? [owned, owned] : []); },
  schema() { return { from(name) { return query(name === 'catalogue_external_identifiers' ? identifiers : catalogue); } }; },
};
let calls = 0;
const dry = await runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate: async () => { calls += 1; }, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 2, dryRun: true });
assert.equal(dry.selected, 1, 'duplicate saved identities must use one provider refresh');
assert.equal(calls, 0, 'dry run must never invoke provider refresh');
const applied = await runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate: async (id, input) => { calls += 1; assert.equal(id, variant); assert.deepEqual(input, { productType: 'raw_card', condition: 'near_mint', currency: 'GBP' }); }, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 2, dryRun: false });
assert.equal(applied.refreshed, 1);
assert.equal(calls, 1);

console.log('Owner provider price refresh tests passed.');
