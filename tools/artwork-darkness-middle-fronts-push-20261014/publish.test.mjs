import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA } from './frozen.mjs';
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

test('exact45 archive/approval/subset and all19 actual LF text bytes are frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes); assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, 45); assert.equal(indexObjects(rows).size, 180);
  assert.equal(plan.archive.id, 642427555); assert.equal(plan.archive.file_count, 184);
  const files = (await readdir(new URL('./', import.meta.url), { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => new URL(`./${entry.name}`, import.meta.url));
  files.push(new URL('../../.github/workflows/artwork-darkness-middle-fronts-production.yml', import.meta.url));
  assert.equal(files.length, 19);
  for (const file of files) { const bytes = await readFile(file); assert.ok(!bytes.includes(13), file.pathname); assert.deepEqual(bytes, Buffer.from(bytes.toString('utf8').replace(/\r\n?/gu, '\n'))); }
  const descriptor = await readFile(new URL('./freeze-inputs.json', import.meta.url));
  assert.ok((await readFile(new URL('./freeze-local.mjs', import.meta.url), 'utf8')).includes(`digest(descriptor) === '${digest(descriptor)}'`));
});

test('exact mixed42Pokemon/3Trainer selection preserves five zero-request finish holds and correct batch totals', () => {
  assert.equal(rows.filter(row => row.evidence.source_body.accepted_category === 'Pokemon').length, 42);
  assert.deepEqual(rows.filter(row => row.evidence.source_body.accepted_category === 'Trainer').map(row => row.collector_number), ['099', '100', '101']);
  assert.deepEqual(plan.delivery_scope.by_batch, { 'JP-CARDS-015': { verified: 24, held: 1 }, 'JP-CARDS-016': { verified: 21, held: 4 } });
  assert.equal(plan.delivery_scope.saved_batch_tasks, 50); assert.equal(plan.delivery_scope.eligible_fronts, 45);
  assert.deepEqual(plan.delivery_scope.excluded_aliases, ['068', '080', '082', '084', '098']);
  assert.ok(plan.delivery_scope.excluded.every(row => row.original === null && row.imageRequests === 0));
  assert.equal(plan.delivery_scope.whole_batch_completion_asserted, false);
  for (const key of ['by_batch', 'eligible_fronts', 'excluded_aliases']) { const changed = clone(plan); changed.delivery_scope[key] = null; assert.throws(() => validateRows(changed, table)); }
});

test('raw historical rows, accepted signatures and public projections have separate truthful provenance', () => {
  let changedSignatures = 0;
  for (const row of rows) {
    const b = row.evidence.source_body;
    validatePublishedWitness(b, row);
    assert.equal(canonicalHash(b.actual_pixel_signature), b.actual_pixel_signature_sha256);
    assert.equal(canonicalHash(b.historical_actual_pixel_signature), b.historical_actual_pixel_signature_sha256);
    assert.notEqual(b.historical_source_handoff_row_canonical_json_sha256, b.approved_projection_row_canonical_json_sha256);
    assert.equal(canonicalHash(b.provider_metadata_identity_projection), b.provider_metadata_identity_projection_sha256);
    assert.notEqual(b.provider_metadata_full_captured_json_sha256, b.provider_metadata_identity_projection_sha256);
    assert.equal(canonicalHash(b.independent_selection), b.independent_selection_public_canonical_json_sha256);
    assert.deepEqual(publicationBody(b), b); assert.ok(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(b)));
    if (b.actual_pixel_signature_sha256 !== b.historical_actual_pixel_signature_sha256) changedSignatures++;
  }
  assert.equal(changedSignatures, 4);
  const trainer = rowFor('099').evidence.source_body.independent_selection;
  const privateSelection = clone(trainer); privateSelection.referenceEvidence.original.path = 'D:/private/reference.webp'; privateSelection.tcgdexMetadataCapture.data.pricing = { cardmarket: null, tcgplayer: null };
  assert.deepEqual(publicProjection(privateSelection), trainer);
  privateSelection.tcgdexMetadataCapture.data.pricing.cardmarket = 12;
  assert.throws(() => publicProjection(privateSelection), /Unexpected commercial/);
});

test('only086 has qualified null artist and Trainers retain corrected number-free positive body/reference QA', () => {
  const porygon = rowFor('086').evidence.source_body;
  assert.equal(porygon.actual_pixel_signature.artist, null); assert.equal(porygon.actual_pixel_observations.artistReadCertain, false);
  assert.equal(porygon.actual_pixel_signature.sourceRecordedArtist, 'Hiromichi Sugiyama');
  assert.equal(porygon.artist_optical_qualification.visiblePrintedCreditSuffix, 'CR CG gangs');
  assert.equal(rows.filter(row => row.evidence.source_body.queue_controls.pixel_observations.artist_read_certain === false).length, 1);
  for (const alias of ['099', '100', '101']) {
    const b = rowFor(alias).evidence.source_body, a = b.actual_pixel_signature;
    assert.equal(a.printedNumberIsNationalDex, false); assert.equal(b.historical_actual_pixel_signature.printedNumberIsNationalDex, true);
    for (const key of ['printedCollectorNumber', 'printedDexNumber', 'nationalDex', 'hp', 'stage', 'retreatSymbols']) assert.equal(a[key], null);
    assert.equal(a.orderedAttackNames.length, 0); assert.ok(a.nativeRulesText.length > 20);
    assert.equal(b.historical_association.selected_source_card_id, null);
    assert.equal(b.queue_controls.source_qa.actual_japanese_unnumbered_trainer_front_verified, true);
    assert.equal(b.queue_controls.identity_controls.pokemon_identity_asserted, false);
  }
  assert.equal(rowFor('101').evidence.source_body.actual_pixel_signature.artist, 'Hideki Kazama');
});

test('seven semantic comparisons, ten Unown whole forms/powers and14 retreat disagreements retain accepted witnesses', () => {
  for (const alias of ['057', '058', '063', '065', '085', '088', '095']) {
    const b = rowFor(alias).evidence.source_body;
    assert.equal(b.historical_association.capture_mode, 'quarantine_comparison_only');
    assert.ok(b.independent_selection.comparisonResolution);
  }
  const unown = rows.filter(row => row.evidence.source_body.actual_pixel_signature.nationalDex === 201);
  assert.equal(unown.length, 10);
  for (const row of unown) { const a = row.evidence.source_body.actual_pixel_signature; assert.ok(a.form && a.form !== 'ordinary'); assert.ok(a.abilities.length > 0); assert.ok(a.rules.some(rule => rule.includes('4枚'))); }
  assert.equal(rows.filter(row => row.evidence.source_body.accepted_provider_metadata_discrepancies.some(item => item.type === 'retreat_metadata_disagreement')).length, 14);
});

test('old086 artist, oldTrainer flag, borrowed body/Dex, wrong form/reference/original and commercial data reject', () => {
  for (const [alias, mutate] of [
    ['086', row => { row.evidence.source_body.actual_pixel_signature.artist = 'Hiromichi Sugiyama'; }],
    ['086', row => { row.evidence.source_body.queue_controls.pixel_observations.artist_read_certain = true; }],
    ['052', row => { row.evidence.source_body.actual_pixel_signature.form = 'Z'; }],
    ['099', row => { row.evidence.source_body.actual_pixel_signature.printedNumberIsNationalDex = true; }],
    ['099', row => { row.evidence.source_body.actual_pixel_signature.nationalDex = 201; }],
    ['100', row => { row.evidence.source_body.actual_pixel_signature.nativeRulesText = rowFor('099').evidence.source_body.actual_pixel_signature.nativeRulesText; }],
    ['101', row => { row.evidence.source_body.independent_selection.referenceEvidence.original.sha256 = 'a'.repeat(64); }],
    ['101', row => { row.evidence.source_body.actual_pixel_signature.artist = 'another'; }],
    ['052', row => { row.objects[0].sha256 = 'a'.repeat(64); }],
    ['052', row => { row.evidence.source_body.provider_metadata_identity_projection.attacks[0].damage = '999'; }],
  ]) mutateEvidence(alias, mutate);
  for (const key of ['prices', 'marketplaces', 'pop_reports', 'provider_metadata']) { const b = clone(rowFor('052').evidence.source_body); b[key] = []; assert.throws(() => publicationBody(b), /Commercial raw/); }
  const b = clone(rowFor('052').evidence.source_body); b.unexpected_path = 'D:/private/path'; assert.throws(() => publicationBody(b), /Private local path/);
});

test('current37normal8holo names, singleton variant/version bindings, source policy and no enlargement remain fixed', () => {
  for (const environment of ['production', 'staging']) {
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'normal').length, 37);
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'holo').length, 8);
    bind(rows, plan.binding_expectations[environment], environment);
  }
  for (const field of ['variant_id', 'finish_code', 'card_native_name', 'collector_number', 'catalogue_version_id']) { const changed = clone(plan); changed.binding_expectations.staging[0][field] = 'changed'; assert.throws(() => validateRows(changed, table)); }
  for (const mutate of [row => { row.objects[0].width = 359; }, row => { row.objects[1].width = row.objects[0].width + 1; }, row => { row.evidence.physical_edition_verified = true; }]) mutateEvidence('052', mutate);
  validateSourcePlan(plan); assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true);
  for (const mutate of [p => { p.source_policies.production[0].active = true; }, p => { p.new_sources.production = clone(p.source_policies.production); }, p => { p.new_sources.staging = []; }]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed)); }
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
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 189);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 279);
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
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 185);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_DARKNESS_MIDDLE_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK DARKNESS MIDDLE FRONTS', STACKR_ARTWORK_DARKNESS_MIDDLE_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_DARKNESS_MIDDLE_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_DARKNESS_MIDDLE_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_DARKNESS_MIDDLE_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
