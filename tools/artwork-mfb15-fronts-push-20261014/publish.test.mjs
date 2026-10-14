import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, CATALOGUE_VERSION } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { compareSnapshots, createMetadataGuard } from './metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind } from '../artwork3303-publish-20260928/publish.mjs';

const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });

test('exact fifteen identities, archive members and owner decision are byte frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes);
    assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, FRONTS); assert.equal(indexObjects(rows).size, 60);
  assert.equal(plan.archive.file_count, 64); assert.equal(approval.language_code, 'en');
  assert.equal(plan.metadata_revision, 2); assert.equal(approval.metadata_revision, 2);
  assert.notEqual(plan.archive.id, 641545169);
  assert.equal(plan.prior_unpublished_metadata.archive_asset_id, 641545169);
  assert.equal(plan.prior_unpublished_metadata.old_files_and_release_asset_preserved, true);
  assert.equal(rows.filter(row => row.evidence.source_has_hd_dimensions).length, 7);
});

test('My First Battle aliases remain internal; unnumbered cards never gain collector footers', () => {
  assert.equal(rows.find(row => row.collector_number === '2').evidence.printed_identity.printed_national_dex, '0002');
  for (const mutate of [
    row => { row.collector_number = '0002'; },
    row => { row.evidence.printed_identity.printed_collector_number = '2'; },
    row => { row.evidence.source_body.actual_pixels.printedCollectorNumberObserved = '2/34'; },
    row => { row.evidence.source_body.signature.printedCollectorNumber = '2'; },
    row => { row.evidence.printed_identity.canonical_alias_is_internal_only = false; },
    row => { row.evidence.identity_checks.printedCollectorOpticallyVerified = true; },
  ]) {
    const changed = clone(plan); mutate(changed.rows[0]);
    assert.throws(() => validateRows(changed, table));
  }
});

test('nineteen unresolved targets stay excluded and both fixed batches remain partial', () => {
  assert.equal(plan.delivery_scope.saved_batch_tasks, 34);
  assert.equal(plan.delivery_scope.eligible_fronts, 15);
  assert.equal(plan.delivery_scope.held_captured_originals, 9);
  assert.equal(plan.delivery_scope.excluded_ambiguous_targets, 10);
  for (const mutate of [p => { p.delivery_scope.whole_batch_completion_asserted = true; }, p => { p.rows.push(clone(p.rows[0])); }, p => { p.delivery_scope.held_captured_originals = 0; }, p => { p.delivery_scope.excluded_ambiguous_targets = 0; }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed, table));
  }
});

test('actual whole English frame, HP, deck silhouette, artist and ordered body are pinned', () => {
  for (const mutate of [
    p => { p.fullCardFrameObserved = false; }, p => { p.printedStageHeaderObserved = 'BASIS'; },
    p => { p.wholePrintingLanguageVerified = false; }, p => { p.printedHPObserved = 120; },
    p => { p.artistObserved = 'other artist'; }, p => { p.deckSilhouetteObserved = 'Pikachu'; },
    p => { p.orderedAttacksObserved[0].damage = '999'; }, p => { p.orderedAttacksObserved.reverse(); },
    p => { p.orderedAttacksObserved[0].costSymbols = []; }, p => { p.copyrightYearInferredFromReleaseDate = true; },
  ]) {
    const changed = clone(plan); mutate(changed.rows[0].evidence.source_body.actual_pixels);
    assert.throws(() => validateRows(changed, table));
  }
});

test('Magneton correctly prints0082; internal alias20 and numeric Dex82 remain distinct', () => {
  const row = rows.find(row => row.collector_number === '20');
  assert.equal(row.evidence.source_body.actual_pixels.printedNationalDexTextObserved, '0082');
  assert.equal(row.evidence.source_body.signature.nationalDexNumber, '0082');
  assert.equal(row.evidence.source_body.actual_pixels.printedNationalDexNumericValue, 82);
  assert.equal(row.evidence.source_body.actual_pixels.printedCollectorNumberObserved, null);
  assert.equal(row.collector_number, '20');
  assert.deepEqual(row.evidence.source_body.actual_pixels.providerMetadataDiscrepancies, []);
  assert.deepEqual(row.evidence.source_body.provider_metadata_discrepancies, []);
  assert.equal(row.evidence.source_body.current_observation_correction.correct_observed_dex, '0082');
  assert.ok(row.evidence.source_body.inline_glyph_resolution.sourceHTMLBodyWitness.includes('alt="Lightning"'));
  assert.equal(row.evidence.source_body.inline_glyph_resolution.canonicalCorrection, false);
  for (const mutate of [r => { r.evidence.source_body.inline_glyph_resolution = null; }, r => { r.evidence.source_body.inline_glyph_resolution.originalHTMLIncludesInlineLightningGlyph = false; }, r => { r.evidence.source_body.actual_pixels.printedNationalDexTextObserved = '082'; }, r => { r.evidence.source_body.current_observation_correction.receipt_sha256 = 'a'.repeat(64); }]) {
    const changed = clone(plan); mutate(changed.rows.find(r => r.collector_number === '20'));
    assert.throws(() => validateRows(changed, table));
  }
});

test('per-file attribution and fair-use facts survive without an invented artwork licence', () => {
  const voltorb = rows.find(row => row.collector_number === '21');
  assert.deepEqual(voltorb.evidence.source_rights.source_attribution, []);
  assert.match(voltorb.evidence.source_rights.artwork_specific_rights_tag, /official database/);
  for (const field of ['vendor_licence_verified', 'underlying_copyright_licence_verified', 'sourcewide_approval']) {
    const changed = clone(plan); changed.rows[0].evidence.source_rights[field] = true;
    assert.throws(() => validateRows(changed, table));
  }
  const changed = clone(plan); changed.rows[0].evidence.source_rights.source_attribution = [];
  assert.throws(() => validateRows(changed, table));
});

test('unknown source, original substitution, upscaling, metadata or physical claims fail closed', () => {
  for (const mutate of [
    p => { p.rows[0].printing_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; },
    p => { p.rows[0].provider_id = rows[1].provider_id; }, p => { p.rows[0].variant_ids = rows[1].variant_ids; },
    p => { p.rows[0].objects[0].sha256 = 'a'.repeat(64); }, p => { p.rows[0].objects[3].width = 9000; },
    p => { p.rows[0].evidence.source_body.actual_pixels.physicalEditionVerified = true; },
    p => { p.binding_expectations.staging[0].finish_code = 'reverse_holo'; },
    p => { p.binding_expectations.production[0].card_native_name = 'other'; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed, table)); }
  for (const environment of ['production', 'staging']) bind(rows, plan.binding_expectations[environment], environment);
});

test('only the exact inactive attribution-required source and rollback staging fixtures are permitted', () => {
  validateSourcePlan(plan);
  for (const mutate of [p => { p.new_sources.production[0].active = true; }, p => { p.new_sources.production[0].licence_status = 'approved'; }, p => { p.new_sources.production[0].attribution_required = false; }, p => { p.new_sources.production.push(clone(p.new_sources.production[0])); }, p => { p.new_sources.staging = []; }, p => { p.source_policies.production[0].active = true; }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed));
  }
});

// Transaction double mirrors the accepted publisher contract and retains full
// existing source payloads so policy-extraneous fields are also protected.
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

test('publication adds exactly15 assets15 links1 inactive source, preserves every old row; rerun adds zero', async () => {
  const db = database(), initial = clone(db.state), guard = createMetadataGuard(plan), first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(a => a.created).length, 15); assert.equal(first.links.filter(l => l.created).length, 15);
  assert.equal(first.preservation.new_inactive_provenance_sources, 1);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  for (const scope of ['assets', 'links', 'sources']) assert.deepEqual(db.state[scope][0], initial[scope][0]);
  assert.equal(db.state.sources.find(s => s.code === 'bulbapedia').active, false);
  const second = journal(); await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(a => a.created).length, 0); assert.equal(second.links.filter(l => l.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('all staging artwork and both temporary source fixtures roll back', async () => {
  const db = database('staging'), initial = clone(db.state), result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 2); assert.equal(result.assets.length, 15);
  assert.deepEqual(db.state, initial); assert.equal(db.calls.at(-1), 'rollback');
});

test('old metadata/set assets/links/full source changes or unplanned provenance abort and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.links[0].asset_type = 'changed'; }, s => { s.sources[0].created_at = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources.push({ id: 'unplanned', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra' }); }]) {
    const db = database(), initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))));
    assert.deepEqual(db.state, initial); assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('preservation rejects unjournalled artwork or source additions', () => {
  const before = plan.source_policies.production.map((source, i) => ({ scope: 'sources', identity: String(i), payload: source }));
  for (const scope of ['assets', 'sources']) assert.throws(() => compareSnapshots(before, [...before, { scope, identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'));
});

test('rollback hides only newly created successful cohort assets, retaining immutable bytes and provenance', () => {
  const success = { ...journal(), status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-14', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', printing_id: rows[1].printing_id, created: false }] };
  const rollback = rollbackReceipt(success, plan), sql = rollbackSql(rollback);
  assert.equal(rollback.assets.length, 1); assert.equal(rollback.assets[0].asset_id, assetId(rows[0]));
  assert.ok(sql.includes(COHORT_SHA) && sql.includes('SET publicly_servable=false'));
  assert.ok(!sql.includes('DELETE') && !sql.includes('UPDATE ingest.sources') && !sql.includes('000000000002'));
  assert.throws(() => rollbackReceipt({ ...success, status: 'commit_outcome_unknown' }, plan));
});

test('exact-main/manual/two-project/private-output gates retain the dedicated confirmation', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_MFB15_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK MFB15 FRONTS', STACKR_ARTWORK_MFB15_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_MFB15_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_MFB15_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_MFB15_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
