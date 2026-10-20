import assert from 'node:assert/strict';
import { exportCompletedCardmarketProvenance, materializeCardmarketProvenance } from './cardmarket-provenance-resumable.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
const calls = [];
const api = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (name === 'begin_cardmarket_provenance_run') return { data: { runId, status: 'running' }, error: null };
  if (name === 'process_cardmarket_provenance_page') {
    const pages = calls.filter(call => call.name === name).length;
    return { data: pages === 1 ? { status: 'running', processed: 500 } : { status: 'complete', processed: 12 }, error: null };
  }
  if (name === 'list_cardmarket_completed_provenance_candidates') {
    assert.equal(args.p_run, runId);
    if (args.p_after_product_id === 0) return { data: [{ provider_product_id: 101, printing_id: '11111111-1111-4111-8111-111111111111', language_code: 'en', catalogue_version_id: '22222222-2222-4222-8222-222222222222', provenance: { externalIds: ['sv1-1'], variantIds: ['33333333-3333-4333-8333-333333333333'], finishCodes: ['normal', 'holo'] } }], error: null };
    return { data: [], error: null };
  }
  throw Error(`Unexpected RPC ${name}`);
} };

assert.deepEqual(await api.rpc('begin_cardmarket_provenance_run', {}), { data: { runId, status: 'running' }, error: null });
calls.length = 0;

const materialized = await materializeCardmarketProvenance({ api, maxPages: 2 });
assert.deepEqual(materialized, { runId, status: 'complete', processed: 512 });
assert.equal(calls.filter(call => call.name === 'process_cardmarket_provenance_page').length, 2);
const retained = { feeds: { products: { products: [{ idProduct: 101, idCategory: 51, name: 'Verified official product' }] } } };
const exported = await exportCompletedCardmarketProvenance({ api, retained, runId, pageSize: 1 });
assert.equal(exported.candidates.length, 1);
assert.equal(exported.candidates[0].mappingTemplate.finishEvidence.type, 'blended_public_guide_not_exact_finish');
assert.equal(exported.candidates[0].reviewRequired, true);
await assert.rejects(() => materializeCardmarketProvenance({ api, runId: 'not-a-run' }), /Invalid Cardmarket provenance run id/);
console.log('Cardmarket provenance operator resumes bounded pages and exports only completed, review-required printing candidates.');
