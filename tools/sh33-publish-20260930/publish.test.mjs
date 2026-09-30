import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTORS, FRONTS, LANGUAGE, SET_CODE, SOURCE, assertConfig,
  assertDisjointWithCompleted, exceptionLedger, metadataCorrection, sourcesFor,
  validateApproval, validatePlan,
} from './publish.mjs';
import { TARGET, catalogueCorrection } from './repair.mjs';
import { assertManifest, assetId, bind, publicationObjects, rehearse } from '../artwork3303-publish-20260928/publish.mjs';
import { TW_SOURCE_NOTES } from '../tw200-publish-20260930/publish.mjs';

const frozen = (name) => new URL(`./${name}`, import.meta.url);

test('SH33 reviewed exception ledger is exactly collectors 021 through 053', () => {
  const rows = [...exceptionLedger().values()];
  assert.equal(rows.length, FRONTS);
  assert.deepEqual(rows.map((row) => row.collector_number).sort(), COLLECTORS);
  assert.ok(rows.every((row) => row.language_code === LANGUAGE && row.set_code === SET_CODE
    && row.category === 'Printed denominator conflict' && row.set_id === TARGET.set_id));
});

test('SH33 frozen plan has exact official artwork, identity and derivative scope', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const bytes = readFileSync(frozen('cohort.json.gz'));
  const rows = validatePlan(bytes, receipt);
  assert.equal(rows.length, FRONTS);
  assert.equal(rows.flatMap((row) => row.objects).length, FRONTS * 4);
  assert.ok(publicationObjects(rows).length <= FRONTS * 4);
  assert.deepEqual(rows.map((row) => row.collector_number).sort(), COLLECTORS);
  assert.ok(rows.every((row) => row.source_code === SOURCE && row.language_code === LANGUAGE));
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('x')]), receipt));
});

test('SH33 cannot overlap every completed or prepared predecessor cohort', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const rows = validatePlan(readFileSync(frozen('cohort.json.gz')), receipt);
  assertDisjointWithCompleted(rows);
});

test('approval permits only the 33 fronts and one set printed-total correction', () => {
  const approval = JSON.parse(readFileSync(frozen('approval.json')));
  validateApproval(approval);
  for (const change of [
    { approved: false }, { fronts: 32 }, { source_code: 'scrydex' },
    { language_code: 'en' }, { source_wide_approval: true }, { owner_statement: '' },
    { metadata_correction: { ...approval.metadata_correction, before: 37 } },
    { metadata_correction: { ...approval.metadata_correction, after: 54 } },
    { metadata_correction: { ...approval.metadata_correction, preserve_total: false } },
  ]) assert.throws(() => validateApproval({ ...approval, ...change }));
  assert.throws(() => metadataCorrection({ ...approval.metadata_correction, id: '00000000-0000-4000-8000-000000000000' }));
});

test('wrong confirmation and branch deployment are rejected', () => {
  assert.throws(() => assertConfig({}));
  assert.throws(() => assertConfig({ STACKR_SH33_CONFIRMATION: 'PUBLISH SH33', GITHUB_REF: 'refs/heads/topic' }));
});

test('SH33 wires the single reviewed catalogue correction hook', () => {
  assert.equal(typeof catalogueCorrection, 'function');
  assert.deepEqual({
    table: 'catalog.sets', id: TARGET.set_id, column: 'printed_total', before: TARGET.before, after: TARGET.after,
  }, {
    table: 'catalog.sets', id: '929a6c13-5b43-4aba-b887-1f86cc94ce31', column: 'printed_total', before: 38, after: 53,
  });
});

const fixture = {
  id: 'tw-source', source_type: 'image', base_url: 'https://asia.pokemon-card.com/tw',
  active: false, licence_status: 'under_review', deprecated_at: null, internal_notes: TW_SOURCE_NOTES,
};
test('SH33 reuses the temporary staging-only Taiwan provenance fixture', async () => {
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

test('SH33 production provenance is read-only and rejects missing or changed records', async () => {
  for (const rows of [[], [fixture], [{ ...fixture, active: true }], [{ ...fixture, internal_notes: 'changed' }]]) {
    const calls = [];
    const db = { query: async (sql) => { calls.push(sql); return { rows }; } };
    if (rows.length === 1 && rows[0] === fixture) assert.equal((await sourcesFor(db, {}, 'production')).get(SOURCE), 'tw-source');
    else await assert.rejects(sourcesFor(db, {}, 'production'));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^select /);
  }
});

test('a pre-existing front blocks SH33 while its own receipt remains idempotent', () => {
  const receipt = JSON.parse(readFileSync(frozen('plan-receipt.json')));
  const row = validatePlan(readFileSync(frozen('cohort.json.gz')), receipt)[0];
  const ours = { printing_id: row.printing_id, asset_id: assetId(row), variant_id: null, content_sha256: row.objects[0].sha256 };
  assertManifest([row], [ours], true);
  assert.throws(() => assertManifest([row], [{ ...ours, asset_id: 'existing-front' }]));
  assert.throws(() => bind([row], [{ ...row, game_code: 'pokemon', variant_id: '11111111-1111-4111-8111-111111111111', same_artwork_as_variant_id: 'existing' }], 'production'));
});
