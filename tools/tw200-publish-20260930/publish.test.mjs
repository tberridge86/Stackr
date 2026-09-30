import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRONTS, LANGUAGE, SET_COUNTS, SOURCE, TW_SOURCE_NOTES, assertConfig,
  assertDisjointWithCompleted, exceptionLedger, sourcesFor, validateApproval, validatePlan,
} from './publish.mjs';
import { assertManifest, assetId, bind, publicationObjects, rehearse } from '../artwork3303-publish-20260928/publish.mjs';

const frozen = (name) => new URL(`./${name}`, import.meta.url);

test('TW200 reviewed exception ledger has exactly the frozen set membership', () => {
  const rows = [...exceptionLedger().values()];
  assert.equal(rows.length, FRONTS);
  assert.deepEqual(Object.fromEntries(Object.keys(SET_COUNTS).map((code) => [code, rows.filter((row) => row.set_code === code).length])), SET_COUNTS);
  assert.ok(rows.every((row) => row.language_code === LANGUAGE && row.category === 'Exact source needed'));
});

test('TW200 frozen plan has exact source, language, set and derivative scope', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const bytes = readFileSync(frozen('cohort.json.gz'));
  const rows = validatePlan(bytes, receipt);
  assert.equal(rows.length, FRONTS);
  assert.equal(rows.flatMap((row) => row.objects).length, FRONTS * 4);
  assert.ok(publicationObjects(rows).length <= FRONTS * 4);
  assert.deepEqual(Object.fromEntries(Object.keys(SET_COUNTS).map((code) => [code, rows.filter((row) => row.set_code === code).length])), SET_COUNTS);
  assert.ok(rows.every((row) => row.source_code === SOURCE && row.language_code === LANGUAGE));
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('x')]), receipt));
});

test('TW200 cannot overlap either completed artwork release', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const rows = validatePlan(readFileSync(frozen('cohort.json.gz')), receipt);
  assertDisjointWithCompleted(rows);
});

test('approval is exact-cohort, exact-language and never source-wide', () => {
  const approval = JSON.parse(readFileSync(frozen('approval.json')));
  validateApproval(approval);
  for (const change of [
    { approved: false }, { fronts: 199 }, { source_code: 'scrydex' },
    { language_code: 'en' }, { source_wide_approval: true }, { owner_statement: '' },
  ]) assert.throws(() => validateApproval({ ...approval, ...change }));
});

test('wrong confirmation and branch deployment are rejected', () => {
  assert.throws(() => assertConfig({}));
  assert.throws(() => assertConfig({ STACKR_TW200_CONFIRMATION: 'PUBLISH TW200', GITHUB_REF: 'refs/heads/topic' }));
});

const fixture = {
  id: 'tw-source', source_type: 'image', base_url: 'https://asia.pokemon-card.com/tw',
  active: false, licence_status: 'under_review', deprecated_at: null, internal_notes: TW_SOURCE_NOTES,
};
test('staging provenance fixture is temporary and never updates a source', async () => {
  let source = null;
  const calls = [];
  const db = { query: async (sql, args) => {
    calls.push(sql);
    if (sql.startsWith('insert into ingest.sources')) { assert.deepEqual(args, [TW_SOURCE_NOTES]); source = { ...fixture }; }
    if (sql === 'rollback') source = null;
    return { rows: sql.startsWith('select') && source ? [source] : [] };
  } };
  await rehearse(db, async () => assert.equal((await sourcesFor(db, {}, 'staging')).get(SOURCE), 'tw-source'));
  assert.equal(source, null);
  assert.equal(calls.at(-1), 'rollback');
  assert.ok(!calls.some((sql) => /update /i.test(sql)));
});

test('production provenance is read-only and rejects missing or changed records', async () => {
  for (const rows of [[], [fixture], [{ ...fixture, active: true }], [{ ...fixture, internal_notes: 'changed' }]]) {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return { rows }; } };
    if (rows.length === 1 && rows[0] === fixture) assert.equal((await sourcesFor(db, {}, 'production')).get(SOURCE), 'tw-source');
    else await assert.rejects(sourcesFor(db, {}, 'production'));
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
