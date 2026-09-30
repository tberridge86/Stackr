import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HELD, SOURCE, FRONTS, frozenConstants, validatePlan, validateRow, validateApproval, sourcesFor, assertConfig } from './publish.mjs';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const bytes = readFileSync(new URL('./cohort.json.gz', import.meta.url));
const receipt = read('./plan-receipt.json');
const rows = JSON.parse(gunzipSync(bytes));
const constants = frozenConstants();
const ledger = new Map(JSON.parse(gunzipSync(readFileSync(new URL('../../docs/releases/artwork3681-exceptions-20260930.json.gz', import.meta.url)))).map(row => [row.printing_id, row]));

test('frozen plan verifies all 232 exact fronts with four files and seven holds excluded', () => {
  assert.equal(validatePlan(bytes, receipt).length, FRONTS);
  assert.equal(rows.flatMap(row => row.objects).length, 928);
  assert.equal(rows.filter(row => row.set_code === 'SV4K').length, 93);
  assert.equal(rows.filter(row => row.set_code === 'SV4M').length, 93);
  assert.equal(rows.filter(row => row.set_code === 'SV5K').length, 46);
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('changed')]), receipt));
  assert.throws(() => validatePlan(bytes, {...receipt, derivative_references: 695}));
  assert.throws(() => validatePlan(bytes, {...receipt, artifacts: [{...receipt.artifacts[0], id: 1}]}));
});

test('all seven held identities reject even if ledger and review are made consistent', () => {
  assert.equal(HELD.length, 7);
  for (const key of HELD) {
    const original = [...ledger.values()].find(row => `${row.set_code}/${row.collector_number}` === key && row.language_code === 'ko');
    assert.ok(original);
    const changed = {...structuredClone(rows[0]), ...original};
    changed.evidence = structuredClone(rows[0].evidence);
    assert.throws(() => validateRow(changed, original, constants), /Held/);
  }
});

test('literal review mutations reject independently of unchanged catalogue identity', () => {
  const sample = rows.find(row => row.set_code === 'SV4M' && row.collector_number === '060');
  for (const mutate of [q => q.passed = false, q => q.observed_native_title = 'wrong script', q => q.observed_printed_number = '060/071', q => q.observed_printed_number = '061/066', q => q.observed_printed_set_code = 'SV4K', q => q.original_sha256 = '0'.repeat(64), q => q.language_code = 'ja', q => q.source_url = 'https://example.com/wrong.png']) {
    const changed = structuredClone(sample); mutate(changed.evidence.independent_visual_review);
    assert.throws(() => validateRow(changed, ledger.get(changed.printing_id), constants));
  }
});

test('energy aliases require the exact observed symbol and ex only changes suffix spacing', () => {
  for (const sample of rows.filter(row => row.collector_number === '095' || row.card_native_name.endsWith(' ex'))) {
    validateRow(sample, ledger.get(sample.printing_id), constants);
    const changed = structuredClone(sample);
    changed.evidence.independent_visual_review.observed_native_title = '기본[Water symbol]에너지';
    assert.throws(() => validateRow(changed, ledger.get(changed.printing_id), constants));
  }
});

test('wrong source, object set and archive paths reject', () => {
  for (const mutate of [r => r.language_code = 'ja', r => r.image_url = r.image_url.replace('cards.image.pokemonkorea.co.kr', 'example.com'), r => r.objects[1].role = 'original', r => r.objects[2].role = 'thumbnail', r => r.objects[0].sha256 = 'a'.repeat(64), r => r.objects[0].width = 511, r => r.objects[1].artifact_id = 1, r => r.objects[1].file = '../wrong.webp', r => r.objects[1].height = 0]) {
    const changed = structuredClone(rows[0]); mutate(changed);
    assert.throws(() => validateRow(changed, ledger.get(changed.printing_id), constants));
  }
});

test('approval is restricted to exact frozen count, source, languages and storage permission', () => {
  const approval = read('./approval.json'); validateApproval(approval);
  for (const delta of [{approved:false},{store_resize_display:false},{fronts:239},{source_wide_approval:true},{source_counts:{[SOURCE.code]:239}},{language_counts:{ko:232,ja:1}},{owner_statement:''}]) assert.throws(() => validateApproval({...approval,...delta}));
});

test('inactive provenance is inserted idempotently in the surrounding transaction, never updated', async () => {
  for (const environment of ['staging','production']) {
    const calls=[];
    const db={query:async(sql,args)=>{calls.push({sql,args});return /^select/i.test(sql)?{rows:[{id:'source',...SOURCE,deprecated_at:null}]}:{rows:[]};}};
    assert.equal((await sourcesFor(db,receipt,environment)).get(SOURCE.code),'source');
    assert.equal(calls.length,2);
    assert.match(calls[0].sql,/on conflict\(code\) do nothing/);
    assert.doesNotMatch(calls[0].sql,/\bupdate\b/i);
    assert.deepEqual(calls[0].args,Object.values(SOURCE));
  }
});

test('source policy or unavailable provenance fails closed', async () => {
  for (const delta of [{active:true},{base_url:'https://example.com'},{licence_status:'approved'},{attribution_required:false},{deprecated_at:'2026-09-30'}]) {
    const db={query:async(sql)=>({rows:/^select/i.test(sql)?[{id:'source',...SOURCE,deprecated_at:null,...delta}]:[]})};
    await assert.rejects(sourcesFor(db,receipt,'production'));
  }
  await assert.rejects(sourcesFor({query:async()=>({rows:[]})},receipt,'production'));
});

test('unconfirmed and non-main publication configurations reject', () => {
  assert.throws(() => assertConfig({}));
  assert.throws(() => assertConfig({STACKR_KOREAN232_CONFIRMATION:'PUBLISH KOREAN232',GITHUB_REF:'refs/heads/topic'}));
});
