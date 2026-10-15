import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA, ARCHIVE_ID } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
import { canonicalHash, publicProjection, publicationBody, validatePublishedWitness } from './source-proof.mjs';
const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });
const rowFor = alias => rows.find(row => row.collector_number === alias);
function mutateEvidence(alias, mutate) {
  const changed = clone(plan), changedTable = clone(table), row = changed.rows.find(row => row.collector_number === alias);
  mutate(row);
  const expected = changedTable.find(entry => entry.printing_id === row.printing_id);
  expected.body_sha256 = digest(Buffer.from(JSON.stringify(row.evidence.source_body)));
  expected.evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
  expected.original_sha256 = row.objects[0].sha256;
  assert.throws(() => validateRows(changed, changedTable));
}

test('exact13 archive, approval, saved identities and all19 LF working bytes are frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes); assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, 13); assert.equal(indexObjects(rows).size, 52);
  assert.ok(ARCHIVE_ID > 0); assert.equal(plan.archive.id, ARCHIVE_ID); assert.equal(plan.archive.file_count, 56);
  const files = (await readdir(new URL('./', import.meta.url), { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => new URL(`./${entry.name}`, import.meta.url));
  files.push(new URL('../../.github/workflows/artwork-darkness-final-fronts-production.yml', import.meta.url));
  assert.equal(files.length, 19);
  for (const file of files) { const bytes = await readFile(file); assert.ok(!bytes.includes(13), file.pathname); assert.deepEqual(bytes, Buffer.from(bytes.toString('utf8').replace(/\r\n?/gu, '\n'))); }
  const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
  assert.ok((await readFile(new URL('./freeze-local.mjs', import.meta.url), 'utf8')).includes(`digest(descriptor) === '${digest(descriptor)}'`));
});

test('finite JP017 scope is11Trainer1Energy1Pokemon and11normal2holo, with zero batch holds', () => {
  const bodies = rows.map(row => row.evidence.source_body);
  assert.equal(bodies.filter(body => body.accepted_category === 'Trainer').length, 11);
  assert.equal(bodies.filter(body => body.accepted_category === 'Energy').length, 1);
  assert.equal(bodies.filter(body => body.accepted_category === 'Pokemon').length, 1);
  assert.deepEqual(plan.delivery_scope.by_batch, { 'JP-CARDS-017': { verified: 13, held: 0 } });
  assert.equal(plan.delivery_scope.saved_batch_tasks, 13); assert.equal(plan.delivery_scope.eligible_fronts, 13);
  assert.deepEqual(plan.delivery_scope.excluded_aliases, []); assert.deepEqual(plan.delivery_scope.excluded, []);
  assert.equal(plan.delivery_scope.whole_batch_completion_asserted, false);
  for (const key of ['by_batch', 'eligible_fronts', 'excluded_aliases']) { const changed = clone(plan); changed.delivery_scope[key] = null; assert.throws(() => validateRows(changed, table)); }
});

test('raw HTML, full captured JSON file, canonical identity, raw historical and public projection hashes stay distinct', () => {
  for (const row of rows) {
    const body = row.evidence.source_body;
    validatePublishedWitness(body, row);
    assert.equal(canonicalHash(body.actual_pixel_signature), body.actual_pixel_signature_sha256);
    assert.equal(canonicalHash(body.historical_actual_pixel_signature), body.historical_actual_pixel_signature_sha256);
    assert.notEqual(body.historical_source_handoff_row_canonical_json_sha256, body.approved_projection_row_canonical_json_sha256);
    assert.equal(canonicalHash(body.provider_metadata_identity_projection), body.provider_metadata_identity_projection_sha256);
    assert.notEqual(body.provider_metadata_full_captured_json_file_sha256, body.provider_metadata_identity_projection_sha256);
    assert.equal(canonicalHash(body.independent_selection), body.independent_selection_public_canonical_json_sha256);
    assert.notEqual(body.independent_selection_raw_canonical_json_sha256, body.independent_selection_public_canonical_json_sha256);
    assert.deepEqual(publicationBody(body), body);
    assert.ok(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(body)));
    assert.equal(body.historical_association.selected_source_card_id, null);
  }
});

test('Trainer and Energy actual witnesses remain number-free;112 artist uncertainty is local;229 Dex is229', () => {
  for (const row of rows.filter(row => row.collector_number !== '229')) {
    const body = row.evidence.source_body, actual = body.actual_pixel_signature;
    assert.equal(actual.printedNumberIsNationalDex, false);
    assert.equal(body.historical_actual_pixel_signature.printedNumberIsNationalDex, false);
    for (const key of ['printedCollectorNumber', 'printedDexNumber', 'nationalDex', 'hp', 'stage', 'retreatSymbols']) assert.equal(actual[key], null);
    assert.deepEqual(actual.orderedAttackNames, []); assert.ok(actual.nativeRulesText.length > 20);
    assert.equal(body.queue_controls.identity_controls.pokemon_identity_asserted, false);
    assert.equal(body.queue_controls.source_qa.printed_number_and_national_dex_absent_verified, true);
  }
  const uncertain = rowFor('112').evidence.source_body.actual_pixel_signature;
  assert.equal(uncertain.artist, null); assert.equal(uncertain.artistReadCertain, false); assert.equal(uncertain.sourceRecordedArtist, 'Yousuke Hirata');
  assert.ok(uncertain.visiblePrintedArtistSuffix.includes('Hirata')); assert.ok(uncertain.artistOpticalQualification);
  const houndoom = rowFor('229').evidence.source_body.actual_pixel_signature;
  assert.equal(houndoom.nationalDex, 229); assert.equal(houndoom.printedDexText, 'No.229'); assert.equal(houndoom.sourceOrdinal24IsNotPrintedCollectorNumber, true);
});

test('Miracle Energy has four actual restrictions;109 uses active Energy asKO;110 retains Baby andBasic wholeStadium rules and recovery history', () => {
  const energy = rowFor('113').evidence.source_body;
  assert.equal(energy.actual_pixel_signature.header, 'ENERGY'); assert.equal(energy.actual_pixel_signature.nativeRules.length, 4);
  assert.equal(energy.queue_controls.source_qa.actual_japanese_unnumbered_energy_front_verified, true);
  assert.equal(energy.queue_controls.source_qa.actual_japanese_unnumbered_trainer_front_verified, false);
  assert.ok(energy.actual_pixel_signature.nativeRules[0].includes('番の終わり')); assert.ok(energy.actual_pixel_signature.nativeRules[3].includes('デッキに1枚'));
  assert.ok(rowFor('109').evidence.source_body.accepted_provider_metadata_discrepancies.length > 0);
  const stadium = rowFor('110').evidence.source_body;
  assert.equal(stadium.actual_pixel_signature.artist, 'Tomokazu Komiya'); assert.equal(stadium.actual_pixel_signature.nativeRules.length, 2);
  assert.ok(stadium.actual_pixel_signature.nativeRules[0].includes('ベイビィ')); assert.ok(stadium.actual_pixel_signature.nativeRules[0].includes('たね'));
  assert.ok(stadium.independent_selection.historicalPartialRawCapture.sha256.startsWith('19215'));
  assert.ok(stadium.independent_selection.sourceMetadataRecoveryHistory);
});

test('borrowed Energy HP/Dex/header/body,112 restored artist,229ordinal,110history and reference/original substitutions reject jointly rewritten evidence', () => {
  for (const [alias, mutate] of [
    ['113', row => { row.evidence.source_body.actual_pixel_signature.hp = 60; }],
    ['113', row => { row.evidence.source_body.actual_pixel_signature.nationalDex = 113; }],
    ['113', row => { row.evidence.source_body.actual_pixel_signature.header = 'TRAINER'; }],
    ['113', row => { row.evidence.source_body.actual_pixel_signature.nativeRules = row.evidence.source_body.actual_pixel_signature.nativeRules.slice(0, 2); }],
    ['112', row => { row.evidence.source_body.actual_pixel_signature.artist = 'Yousuke Hirata'; }],
    ['229', row => { row.evidence.source_body.actual_pixel_signature.nationalDex = 24; }],
    ['110', row => { row.evidence.source_body.independent_selection.historicalPartialRawCapture.sha256 = 'a'.repeat(64); }],
    ['110', row => { row.evidence.source_body.provider_metadata_identity_projection.rules = []; }],
    ['102', row => { row.evidence.source_body.independent_selection.referenceEvidence.original.sha256 = 'a'.repeat(64); }],
    ['102', row => { row.objects[0].sha256 = 'a'.repeat(64); }],
  ]) mutateEvidence(alias, mutate);
});

test('current exact names/singleton variants/11normal2holo and existing inactive source policy remain immutable with no enlargement', () => {
  for (const environment of ['production', 'staging']) {
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'normal').length, 11);
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'holo').length, 2);
    bind(rows, plan.binding_expectations[environment], environment);
  }
  for (const field of ['variant_id', 'finish_code', 'card_native_name', 'collector_number', 'catalogue_version_id']) { const changed = clone(plan); changed.binding_expectations.staging[0][field] = 'changed'; assert.throws(() => validateRows(changed, table)); }
  for (const mutate of [row => { row.objects[0].width = 359; }, row => { row.objects[1].width = row.objects[0].width + 1; }, row => { row.evidence.physical_edition_verified = true; }]) mutateEvidence('102', mutate);
  validateSourcePlan(plan); assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true);
  for (const mutate of [p => { p.source_policies.production[0].active = true; }, p => { p.new_sources.production = clone(p.source_policies.production); }, p => { p.new_sources.staging = []; }]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed)); }
});

test('public projection strips only named private paths and rejects commercial or unexpected path data', () => {
  const body = rowFor('102').evidence.source_body;
  const selection = clone(body.independent_selection); selection.referenceEvidence.original.path = 'D:/private/reference.webp';
  assert.deepEqual(publicProjection(selection), body.independent_selection);
  for (const key of ['pricing', 'prices', 'marketplaces', 'pop_reports', 'provider_metadata']) { const changed = clone(body); changed[key] = null; assert.throws(() => publicationBody(changed), /Commercial raw/); }
  const changed = clone(body); changed.unexpected_path = 'D:/private/path'; assert.throws(() => publicationBody(changed), /Private local path/);
});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_id: 'old-logo', asset_type: 'set_logo', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-logo.png' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', asset_id: 'old-symbol', asset_type: 'set_symbol', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-symbol.png' }],
    links: [
      ...['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'].map((asset_id, index) => ({ asset_id, catalogue_version_id: environment === 'staging' ? STAGE_JA : PRODUCTION_JA, language_code: 'ja', asset_type: index === 0 ? 'set_logo' : 'set_symbol', set_id: rows[0].set_id, printing_id: null, variant_id: null })),
      ...(environment === 'production' ? Array.from({ length: 3 }, (_, index) => ({ asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', catalogue_version_id: `historical-version-${index}`, language_code: 'ja', asset_type: 'set_logo', set_id: rows[0].set_id, printing_id: null, variant_id: null })) : []),
    ],
    sources: plan.source_policies[environment].map((source, i) => ({ ...clone(source), id: `source-${i}`, retained_private_provenance: 'full-source-row-must-survive' })),
  };
  const calls = [];
  let saved, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: environment === 'staging' ? STAGE_JA : PRODUCTION_JA }] };
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ id: asset.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ ...clone(asset), asset_row_id: asset.id })) };
    if (sql.startsWith('insert into ingest.sources')) {
      const source = Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, i) => [key, parameters[i]]));
      if (!state.sources.some(s => s.code === source.code)) state.sources.push({ ...source, deprecated_at: null, id: `new-source-${source.code}` });
      return { rows: [] };
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.assets.some(asset => asset.asset_id === data.asset_id)) {
        const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++nextId).padStart(12, '0')}`;
        state.assets.push({ ...data, id }); inserted.push({ id });
      }
      return { rows: inserted };
    }
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.links.some(link => link.asset_id === data.asset_id && link.catalogue_version_id === data.catalogue_version_id)) { state.links.push(data); inserted.push(data); }
      db.mutateAfterLinks?.(state);
      return { rows: clone(inserted) };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(asset => parameters[0].includes(asset.asset_id))) };
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select * from ${table} where`)) return { rows: clone(state[scope]) };
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}

test('publication inserts only the eligible fronts/links and no source rows; every existing scoped row survives; rerun is empty', async () => {
  const db = database(); const initial = clone(db.state); const guard = createMetadataGuard(plan); const first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS);
  assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.before_counts.names, FRONTS * 2);
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 61);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 87);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql => sql.startsWith('insert into ingest.sources')));
  for (const scope of ['printings', 'variants', 'names', 'sets', 'sources']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, 2), initial.assets);
  assert.deepEqual(db.state.links.slice(0, initial.links.length), initial.links);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0);
  assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('identity, old logo/symbol and links, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.assets[1].storage_key = 'changed-symbol'; }, s => { s.links[1].asset_type = 'changed-symbol-link'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources[0].retained_private_provenance = 'changed'; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
    const db = database(); const initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))), /scoped row changed|counts changed|source insertion|source count|source policy changed|metadata insertion/);
    assert.deepEqual(db.state, initial);
    assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('the single staging Scrydex fixture and all eligible artwork changes are rolled back', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 57);
  assert.equal(result.assets.length, FRONTS);
  assert.deepEqual(db.state, initial);
});

test('reused preservation comparison rejects unjournalled new assets or any production source insert', () => {
  const before = plan.source_policies.production.map((source, i) => ({ scope: 'sources', identity: String(i), payload: source }));
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'assets', identity: 'unlisted', payload: {} }], journal(), plan, 'production'), /journal and new rows differ/);
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'sources', identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'), /source insertion/);
});

test('rollback binds only successful new artwork IDs and preserves objects, links and source policies', () => {
  const success = { ...journal(), status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-13', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', printing_id: rows[1].printing_id, created: false }] };
  const rollback = rollbackReceipt(success, plan);
  assert.equal(rollback.assets.length, 1);
  assert.equal(rollback.assets[0].asset_id, assetId(rows[0]));
  assert.ok(rollbackSql(rollback).includes(COHORT_SHA));
  assert.ok(rollbackSql(rollback).includes('SET publicly_servable=false'));
  assert.ok(!rollbackSql(rollback).includes('DELETE'));
  assert.ok(!rollbackSql(rollback).includes('UPDATE ingest.sources'));
  assert.ok(!rollbackSql(rollback).includes('000000000002'));
  assert.throws(() => rollbackReceipt({ ...success, status: 'commit_outcome_unknown' }, plan), /verified publication/);
  assert.ok(rollbackSql(rollbackReceipt({ ...success, assets: [] }, plan)).includes('no rollback writes'));
});

test('execution retains exact-main/manual/two-project/private-output gates under its own confirmation', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_DARKNESS_FINAL_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK DARKNESS FINAL FRONTS', STACKR_ARTWORK_DARKNESS_FINAL_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_DARKNESS_FINAL_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_DARKNESS_FINAL_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_DARKNESS_FINAL_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
