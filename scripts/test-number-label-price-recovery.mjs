import assert from 'node:assert/strict';
import { matchesNumberLabel, planNumberLabelRecovery, numberLabelPricePlan, recheckNumberLabelRecovery, mainNumberLabelRecovery } from './recover-labelled-catalogue-prices.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = { variant_id: id(1), printing_id: id(2), set_id: id(3), catalogue_version_id: id(4),
  language_code: 'en', variant_code: 'normal', finish_code: 'normal', collector_number: '048',
  card_english_display_name: 'Eiscue', unique_collector_number: true, provider_mapping: null };
const product = { categoryId: 3, groupId: 23120, productId: 497459, name: 'Eiscue - 048/193',
  extendedData: [{ name: 'Number', value: '048/193' }], presaleInfo: { isPresale: false } };
const input = { candidates: [row], products: [product], group: { categoryId: 3, groupId: 23120 },
  prices: [{ productId: 497459, subTypeName: 'Normal', marketPrice: 0.13 }],
  datasetAt: new Date(Date.now() - 3600000).toISOString(),
  fx: { rate: 0.75, at: new Date(Date.now() - 3600000).toISOString(), source: 'fixture-fx' } };
assert.equal(matchesNumberLabel(row, product), true);
assert.equal(matchesNumberLabel({ ...row, collector_number: '48' }, { ...product, name: 'Eiscue (048)' }), true);
for (const name of ['Eiscue - 049/193', 'Eiscue - 048/194', 'Eiscue (1st Edition)', 'Eiscue (Cosmos Holo)', 'Eiscue - 048/193 (Stamped)', 'Different Card - 048/193']) {
  assert.equal(matchesNumberLabel(row, { ...product, name }), false, name);
}
assert.equal(matchesNumberLabel({ ...row, collector_number: '048/194' }, product), false, 'canonical denominator conflict');
assert.equal(matchesNumberLabel(row, { ...product, extendedData: [...product.extendedData, { name: 'Number', value: '049/193' }] }), false, 'conflicting provider number fields');
const recovery = planNumberLabelRecovery(input);
assert.equal(recovery.mappings.length, 1);
assert.equal(recovery.mappings[0].subtype, 'Normal');
assert.equal(numberLabelPricePlan(input, recovery).results[0].quote.price, 0.13);
assert.equal(numberLabelPricePlan(input, recovery).results[0].mapping.method, 'reviewed');
const noRecovery = options => assert.equal(planNumberLabelRecovery({ ...input, ...options }).mappings.length, 0);
noRecovery({ candidates: [{ ...row, language_code: 'ja' }] });
noRecovery({ candidates: [{ ...row, unique_collector_number: false }] });
noRecovery({ candidates: [{ ...row, provider_mapping: { method: 'reviewed', product_id: 999 } }] });
noRecovery({ candidates: [{ ...row, variant_code: 'first_edition', finish_code: 'first_edition' }] });
noRecovery({ candidates: [row, { ...row, variant_id: id(8), printing_id: id(9) }] });
noRecovery({ products: [product, { ...product, productId: 999 }] });
noRecovery({ products: [{ ...product, presaleInfo: { isPresale: true } }] });
noRecovery({ products: [{ ...product, categoryId: 85 }] });
noRecovery({ prices: [...input.prices, input.prices[0]] });
noRecovery({ prices: [{ ...input.prices[0], marketPrice: 0 }] });
noRecovery({ prices: [{ ...input.prices[0], subTypeName: 'Reverse Holofoil' }] });
assert.throws(() => planNumberLabelRecovery({ ...input, candidates: [row, { ...row, variant_id: id(8) }] }), /collision/);
assert.throws(() => planNumberLabelRecovery({ ...input, group: { ...input.group, categoryId: 85 } }), /English/);
const currentApi = ({ rows = input.candidates, datasetAt = input.datasetAt } = {}) => ({ rpc: async (name, args) => {
  if (name === 'catalogue_bulk_group_candidates') return { data: rows, error: null };
  assert.equal(name, 'read_catalogue_bulk_feed');
  return { data: { dataset_at: datasetAt, payload: { results: args.p_key.endsWith('/products') ? input.products : input.prices } }, error: null };
} });
assert.equal((await recheckNumberLabelRecovery(currentApi(), input, recovery)).recovery.mappings.length, 1);
await assert.rejects(recheckNumberLabelRecovery(currentApi({ datasetAt: '2000-01-01T00:00:00Z' }), input, recovery), /build changed/);
await assert.rejects(recheckNumberLabelRecovery(currentApi({ rows: [{ ...row, provider_mapping: { method: 'reviewed', product_id: 999 } }] }), input, recovery), /mapping changed/);
await assert.rejects(recheckNumberLabelRecovery(currentApi({ rows: [{ ...row, unique_collector_number: false }] }), input, recovery), /mapping changed/);
assert.equal(matchesNumberLabel({ ...row, card_english_display_name: '' }, product), false, 'empty names cannot prove identity');
await assert.rejects(mainNumberLabelRecovery(['--apply','--fixture=must-not-be-read']),/offline recovery reports only/,'offline planner cannot mutate a database');
console.log('Number-label recovery: verified labels, identity/edition/language/finish conflicts, duplicate claims and positive quotes passed.');
