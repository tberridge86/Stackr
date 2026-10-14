import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, CATALOGUE_VERSION } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { createMetadataGuard } from './metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind } from '../artwork3303-publish-20260928/publish.mjs';

const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });

test('exact eight source/identity/decision bytes and thirty-six archive members remain frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url)); validate(bytes);
    assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])));
  }
  assert.equal(rows.length, 8); assert.equal(indexObjects(rows).size, 32); assert.equal(plan.archive.file_count, 36);
  assert.ok(rows.every(row => row.objects[0].width === 1375 && row.objects[0].height === 1920));
});

test('the reconciled BASIC/full-frame originals supersede historical holds without changing catalogue identity', () => {
  assert.equal(rows.filter(row => row.evidence.source_body.actual_pixels.printedStageHeaderObserved === 'BASIC').length, 7);
  const wartortle = rows.find(row => row.collector_number === '26');
  assert.equal(wartortle.evidence.source_body.actual_pixels.printedStageHeaderObserved, 'STAGE 1');
  for (const row of rows) {
    assert.ok(row.evidence.source_body.prior_holds_retained_as_history.length > 0);
    assert.equal(row.evidence.source_body.observation_correction_only, true);
    assert.deepEqual(row.evidence.source_body.current_holds, []);
  }
  for (const mutate of [p => { p.printedStageHeaderObserved = 'BASIS'; }, p => { p.fullCardFrameObserved = false; }, p => { p.completeCopyrightLineLegible = false; }, p => { p.wholePrintingLanguageVerified = false; }, p => { p.printedHPObserved = 999; }]) {
    const changed = clone(plan); mutate(changed.rows[0].evidence.source_body.actual_pixels);
    assert.throws(() => validateRows(changed, table));
  }
});

test('unnumbered aliases, Dex, exact source/body and no-enlargement controls cannot be substituted', () => {
  for (const row of rows) {
    assert.equal(row.evidence.printed_identity.printed_collector_number, null);
    assert.equal(row.evidence.printed_identity.canonical_alias_is_internal_only, true);
  }
  for (const mutate of [r => { r.collector_number = '0102'; }, r => { r.evidence.printed_identity.printed_collector_number = '5'; }, r => { r.evidence.source_body.actual_pixels.printedCollectorNumberObserved = '5/34'; }, r => { r.evidence.source_body.actual_pixels.orderedAttacksObserved[0].damage = '999'; }, r => { r.evidence.source_body.actual_pixels.artistObserved = 'other'; }, r => { r.objects[3].width = 9000; }, r => { r.provider_id = 'File:Other.jpg'; }, r => { r.variant_ids = rows[1].variant_ids; }]) {
    const changed = clone(plan); mutate(changed.rows[0]); assert.throws(() => validateRows(changed, table));
  }
  for (const environment of ['production', 'staging']) bind(rows, plan.binding_expectations[environment], environment);
});

test('prior fifteen and ExeggutorHP120/90 remain outside this exact-eight partial-batch scope', () => {
  assert.deepEqual(plan.delivery_scope.accepted_aliases, ['5', '7', '11', '23', '26', '27', '29', '31']);
  assert.equal(plan.delivery_scope.previous_cohort_fronts_required_live, 15);
  assert.deepEqual(plan.delivery_scope.excluded_control_aliases, ['6']);
  assert.equal(plan.delivery_scope.remaining_identity_holds_after_prior15_and_this8, 11);
  for (const mutate of [p => { p.delivery_scope.whole_batch_completion_asserted = true; }, p => { p.delivery_scope.excluded_control_aliases = []; }, p => { p.rows[0].collector_number = '6'; }, p => { p.rows.push(clone(p.rows[0])); }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed, table));
  }
});

test('existing inactive sources are required and no new production provenance or licence promotion is allowed', () => {
  validateSourcePlan(plan); assert.equal(plan.source_policies.production.length, 2);
  assert.deepEqual(plan.new_sources.production, []); assert.equal(plan.new_sources.staging.length, 2);
  for (const mutate of [p => { p.source_policies.production[0].active = true; }, p => { p.source_policies.production[1].licence_status = 'approved'; }, p => { p.new_sources.production.push(clone(p.source_policies.production[1])); }, p => { p.source_policies.production.pop(); }, p => { p.new_sources.staging = []; }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed));
  }
  for (const key of ['vendor_licence_verified', 'underlying_copyright_licence_verified', 'sourcewide_approval']) {
    const changed = clone(plan); changed.rows[0].evidence.source_rights[key] = true; assert.throws(() => validateRows(changed, table));
  }
});

// The transaction double is inserted below from the accepted publisher test
// fixture; all state is local and no database client is loaded by these tests.
function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [{ id: rows[0].set_id, set_code: 'mfb', name: 'My First Battle' }],
    assets: environment === 'staging' ? [] : [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_id: 'old-logo', asset_type: 'set_logo', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-logo.png' }],
    links: environment === 'staging' ? [] : [{ asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', catalogue_version_id: CATALOGUE_VERSION, language_code: 'en', asset_type: 'set_logo', set_id: rows[0].set_id, printing_id: null, variant_id: null }],
    sources: plan.source_policies[environment].map((source, i) => ({ ...clone(source), id: `source-${i}`, created_at: 'preserve-original-source-date' })),
  };
  const calls = []; let savedState, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { savedState = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, savedState); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: CATALOGUE_VERSION }] };
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(a => a.asset_type === 'card_image').map(a => ({ id: a.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: state.assets.filter(a => a.asset_type === 'card_image').map(a => ({ ...clone(a), asset_row_id: a.id })) };
    if (sql.startsWith('insert into ingest.sources')) {
      const source = Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, i) => [key, parameters[i]]));
      if (!state.sources.some(s => s.code === source.code)) state.sources.push({ ...source, deprecated_at: null, id: `new-source-${source.code}` });
      return { rows: [] };
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.assets.some(a => a.asset_id === data.asset_id)) { const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++nextId).padStart(12, '0')}`; state.assets.push({ ...data, id }); inserted.push({ id }); }
      return { rows: inserted };
    }
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.links.some(l => l.asset_id === data.asset_id && l.catalogue_version_id === data.catalogue_version_id)) { state.links.push(data); inserted.push(data); }
      db.mutateAfterLinks?.(state); return { rows: clone(inserted) };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(a => parameters[0].includes(a.asset_id))) };
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select * from ${table} where`)) return { rows: clone(state[scope]) };
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}


test('production adds exactly eight assets/eight links, no sources; all old rows survive and rerun adds zero', async () => {
  const db = database(), initial = clone(db.state), guard = createMetadataGuard(plan), first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS); assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0); assert.ok(!db.calls.some(sql => sql.startsWith('insert into ingest.sources')));
  for (const scope of ['printings', 'variants', 'names', 'sets', 'sources']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets[0], initial.assets[0]); assert.deepEqual(db.state.links[0], initial.links[0]);
  const second = journal(); await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0); assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('staging fixture sources and all artwork changes roll back', async () => {
  const db = database('staging'), initial = clone(db.state), result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 2); assert.equal(result.assets.length, 8); assert.deepEqual(db.state, initial);
});

test('changes to old names/variants/artwork/links/full source rows or unplanned sources abort and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.links[0].asset_type = 'changed'; }, s => { s.sources[0].created_at = 'changed'; }, s => { s.sources[1].active = true; }, s => { s.sources.push({ id: 'unexpected', code: 'unexpected' }); }]) {
    const db = database(), initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))));
    assert.deepEqual(db.state, initial); assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('rollback binds only newly created successful cohort images and preserves immutable objects/provenance', () => {
  const success = { ...journal(), status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-14', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }] };
  const rollback = rollbackReceipt(success, plan), sql = rollbackSql(rollback);
  assert.equal(rollback.assets[0].asset_id, assetId(rows[0])); assert.ok(sql.includes(COHORT_SHA) && sql.includes('SET publicly_servable=false'));
  assert.ok(!sql.includes('DELETE') && !sql.includes('UPDATE ingest.sources'));
  assert.throws(() => rollbackReceipt({ ...success, status: 'commit_outcome_unknown' }, plan));
});

test('dedicated confirmation retains exact-main/manual/two-project/private-output boundaries', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_MFB8_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK MFB8 FRONTS', STACKR_ARTWORK_MFB8_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_MFB8_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, STACKR_ARTWORK_MFB8_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK MFB15 FRONTS' }, { ...env, STACKR_ARTWORK_MFB8_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
