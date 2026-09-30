import { readFileSync } from 'node:fs';
import test from 'node:test'; import assert from 'node:assert/strict';
import { EXCLUDED_PRINTING_ID, FRONTS, LANGUAGE_COUNTS, TCGPLAYER_SOURCE, assertConfig, exceptionLedger, frozenConstants, sourcesFor, validateApproval, validatePlan, validateRow } from './publish.mjs';
const file = (name) => new URL(`./${name}`, import.meta.url);

test('native96 has a reviewed English/Japanese ledger boundary', () => {
  const rows = [...exceptionLedger().values()]; assert.ok(rows.length >= FRONTS); assert.equal(new Set(rows.map((row) => row.printing_id)).size, rows.length);
});
test('native96 frozen plan remains exact, visual-reviewed, disjoint and four-object', () => {
  const bytes = readFileSync(file('cohort.json.gz')); const receipt = JSON.parse(readFileSync(file('plan-receipt.json'))); const rows = validatePlan(bytes, receipt);
  assert.equal(rows.length, FRONTS); assert.deepEqual(Object.fromEntries(Object.keys(LANGUAGE_COUNTS).map((language) => [language, rows.filter((row) => row.language_code === language).length])), LANGUAGE_COUNTS); assert.equal(rows.flatMap((row) => row.objects).length, FRONTS * 4);
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('x')]), receipt));
});
test('native96 approval has no source-wide scope', () => {
  const approval = JSON.parse(readFileSync(file('approval.json'))); validateApproval(approval);
  for (const changed of [{ fronts: 95 }, { approved: false }, { store_resize_display: false }, { source_wide_approval: true }, { source_counts: { tcgplayer_card_artwork: 95 } }]) assert.throws(() => validateApproval({ ...approval, ...changed }));
});
test('configuration rejects unconfirmed or unprotected deployment', () => {
  assert.throws(() => assertConfig({})); assert.throws(() => assertConfig({ STACKR_NATIVE96_CONFIRMATION: 'PUBLISH NATIVE96', GITHUB_REF: 'refs/heads/topic' }));
});
test('staging only may create inactive image provenance and production must preserve it', async () => {
  for (const environment of ['staging', 'production']) {
    const calls=[]; const db={ query: async (sql, args) => { calls.push({sql,args}); return /^select/i.test(sql) ? { rows: [{ id:'source', deprecated_at:null, ...TCGPLAYER_SOURCE }] } : { rows: [] }; } };
    const resolved = await sourcesFor(db, null, environment); assert.equal(resolved.get(TCGPLAYER_SOURCE.code), 'source');
    assert.equal(calls.length, environment === 'staging' ? 2 : 1); if (environment === 'staging') assert.match(calls[0].sql, /insert into ingest\.sources/i); else assert.match(calls[0].sql, /^select/i);
  }
});
test('source resolver rejects changed or absent production provenance', async () => {
  const changed={ query:async(sql) => /^select/i.test(sql) ? { rows: [{ id:'source', deprecated_at:null, ...TCGPLAYER_SOURCE, active:true }] } : { rows:[] } };
  const absent={ query:async() => ({ rows:[] }) };
  await assert.rejects(sourcesFor(changed, null, 'production')); await assert.rejects(sourcesFor(absent, null, 'production'));
});
test('review guard rejects real mutations to face identity, checksum, number, exclusion and language', () => {
  const rows = validatePlan(readFileSync(file('cohort.json.gz')), JSON.parse(readFileSync(file('plan-receipt.json')))); const row = structuredClone(rows.find((item) => item.language_code === 'ja'));
  const ledger = exceptionLedger(); const frozen = frozenConstants();
  const fails = (mutate) => { const changed = structuredClone(row); mutate(changed); assert.throws(() => validateRow(changed, ledger.get(changed.printing_id), frozen)); };
  fails((item) => { item.evidence.independent_visual_review.observed_native_title = 'wrong title'; });
  fails((item) => { item.evidence.independent_visual_review.original_sha256 = '0'.repeat(64); });
  fails((item) => { item.evidence.independent_visual_review.observed_printed_number = '999/999'; });
  fails((item) => { item.printing_id = EXCLUDED_PRINTING_ID; });
  fails((item) => { item.language_code = 'en'; });
});
