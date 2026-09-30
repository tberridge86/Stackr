import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONTS, LANGUAGE, SET_COUNTS, SOURCE, SOURCE_RECORD, assertConfig,
  assertDisjointWithCompleted, exceptionLedger, sourcesFor, validateApproval, validatePlan,
} from './publish.mjs';
import { assertManifest, assetId, bind, publicationObjects } from '../artwork3303-publish-20260928/publish.mjs';

const frozen = (name) => new URL(`./${name}`, import.meta.url);

test('English45 reviewed ledger contains each permitted exact-source identity', () => {
  const rows = [...exceptionLedger().values()];
  assert.equal(rows.length, 67);
  assert.ok(rows.every((row) => row.language_code === LANGUAGE && row.category === 'Exact source needed'));
});

test('English45 frozen plan has exact source, canonical identity and derivative scope', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const bytes = readFileSync(frozen('cohort.json.gz'));
  const rows = validatePlan(bytes, receipt);
  assert.equal(rows.length, FRONTS);
  assert.equal(rows.flatMap((row) => row.objects).length, FRONTS * 4);
  assert.equal(publicationObjects(rows).length, FRONTS * 4);
  assert.deepEqual(Object.fromEntries(Object.keys(SET_COUNTS).map((code) => [code, rows.filter((row) => row.set_code === code).length])), SET_COUNTS);
  assert.ok(rows.every((row) => row.source_code === SOURCE && row.language_code === LANGUAGE));
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('x')]), receipt));
});

test('English45 cannot overlap any completed or frozen artwork release', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  assertDisjointWithCompleted(validatePlan(readFileSync(frozen('cohort.json.gz')), receipt));
});

test('approval is exact-cohort, exact-language and never source-wide', () => {
  const approval = JSON.parse(readFileSync(frozen('approval.json')));
  validateApproval(approval);
  for (const change of [
    { approved: false }, { fronts: 44 }, { source_code: 'scrydex' },
    { language_code: 'ja' }, { source_wide_approval: true }, { owner_statement: '' },
  ]) assert.throws(() => validateApproval({ ...approval, ...change }));
});

test('wrong confirmation and branch deployment are rejected', () => {
  assert.throws(() => assertConfig({}));
  assert.throws(() => assertConfig({ STACKR_ENGLISH45_CONFIRMATION: 'PUBLISH ENGLISH45', GITHUB_REF: 'refs/heads/topic' }));
});

const fixture = { id: 'pokemon-tcg-api-source', code: SOURCE, deprecated_at: null, ...SOURCE_RECORD };
test('Pokemon TCG API provenance is read-only in both environments', async () => {
  for (const environment of ['staging', 'production']) {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return { rows: [fixture] }; } };
    assert.equal((await sourcesFor(db, {}, environment)).get(SOURCE), fixture.id);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^select /);
    assert.ok(!calls.some((sql) => /insert|update|delete/i.test(sql)));
  }
});

test('changed, missing or inactive Pokemon TCG API provenance blocks publication', async () => {
  for (const rows of [[], [{ ...fixture, active: false }], [{ ...fixture, base_url: 'https://wrong.example' }]]) {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return { rows }; } };
    await assert.rejects(sourcesFor(db, {}, 'production'));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^select /);
  }
});

test('a pre-existing front blocks this release while its own receipt is idempotent', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const row = validatePlan(readFileSync(frozen('cohort.json.gz')), receipt)[0];
  const ours = { printing_id: row.printing_id, asset_id: assetId(row), variant_id: null, content_sha256: row.objects[0].sha256 };
  assertManifest([row], [ours], true);
  assert.throws(() => assertManifest([row], [{ ...ours, asset_id: 'existing-front' }]));
  assert.throws(() => bind([row], [{ ...row, game_code: 'pokemon', variant_id: '11111111-1111-4111-8111-111111111111', same_artwork_as_variant_id: 'existing' }], 'production'));
});
