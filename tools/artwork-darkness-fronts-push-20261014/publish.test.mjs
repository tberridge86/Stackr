import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
import { canonicalHash, projectQueueControls, publicationBody } from './source-proof.mjs';

const { plan, rows, approval, receipt, table } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });
const rowFor = (value, alias) => value.rows.find(row => row.collector_number === alias);
function mutateEvidence(alias, mutate) {
  const changed = clone(plan); const changedTable = clone(table); const row = rowFor(changed, alias);
  mutate(row);
  const expected = changedTable.find(entry => entry.printing_id === row.printing_id);
  expected.body_sha256 = digest(Buffer.from(JSON.stringify(row.evidence.source_body)));
  expected.evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
  expected.original_sha256 = row.objects[0].sha256;
  assert.throws(() => validateRows(changed, changedTable));
}

test('exact47 source/subset/archive and finite approval are byte frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, rows)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes); assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, 47); assert.equal(indexObjects(rows).size, 188);
  assert.equal(plan.archive.id, 641915513); assert.equal(plan.archive.file_count, 192);
});

test('three finish conflicts and complete024 remain outside the exact47 partial delivery', () => {
  assert.equal(plan.delivery_scope.saved_batch_tasks, 50);
  assert.equal(plan.delivery_scope.eligible_fronts, 47);
  assert.deepEqual(plan.delivery_scope.excluded_aliases, ['013', '025', '047']);
  assert.ok(plan.delivery_scope.excluded.every(row => row.original === null && row.currentFinish === 'normal' && row.sourceVariants.includes('holofoil')));
  assert.equal(plan.delivery_scope.outside_fixed_cohort[0].alias, '024');
  assert.equal(plan.delivery_scope.whole_batch_completion_asserted, false);
  assert.deepEqual(plan.delivery_scope.by_batch, { 'JP-CARDS-013': { verified: 23, held: 2 }, 'JP-CARDS-014': { verified: 24, held: 1 } });
  assert.ok(!rows.some(row => ['013', '024', '025', '047'].includes(row.collector_number)));
  for (const field of ['eligible_fronts', 'saved_batch_tasks', 'excluded_aliases', 'whole_batch_completion_asserted']) {
    const changed = clone(plan); changed.delivery_scope[field] = null;
    assert.throws(() => validateRows(changed, table), /scope/);
  }
});

test('full raw provider JSON, source signatures and accepted actual signatures have distinct truthful hashes', () => {
  assert.ok(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(plan)));
  for (const row of rows) {
    const body = row.evidence.source_body;
    assert.equal(canonicalHash(body.provider_metadata), body.provider_metadata_canonical_json_sha256);
    assert.equal(body.provider_metadata_raw_html_sha256, row.evidence.source_metadata_sha256);
    assert.notEqual(body.provider_metadata_raw_html_sha256, body.provider_metadata_canonical_json_sha256);
    assert.equal(canonicalHash(body.source_signature), body.source_signature_sha256);
    assert.equal(canonicalHash(body.actual_pixel_signature), body.actual_pixel_signature_sha256);
    assert.ok(body.provider_metadata.translation.en.attacks.length > 0);
    const raw = { canonicalCollectorAlias: row.collector_number, currentNativeLabel: row.card_native_name, sourceMetadataHash: row.evidence.source_metadata_sha256, original: { sha256: row.objects[0].sha256 }, actualPixelSignature: body.actual_pixel_signature, actualPixelSignatureSha256: body.actual_pixel_signature_sha256, pixelObservations: body.actual_pixel_observations };
    assert.deepEqual(projectQueueControls(raw), body.queue_controls);
    const privateBody = clone(body); privateBody.actual_pixel_observations.originalObservation.path = 'D:/private/original.webp';
    assert.deepEqual(publicationBody(privateBody), body);
    privateBody.unexpected_path = 'D:/unplanned-path'; assert.throws(() => publicationBody(privateBody), /Private local path/);
  }
});

test('source/body/form/original/current-binding drift fails even after recomputing table evidence hashes', () => {
  for (const mutate of [
    row => { row.objects[0].sha256 = 'a'.repeat(64); },
    row => { row.evidence.source_metadata_sha256 = 'a'.repeat(64); },
    row => { row.evidence.source_body.actual_pixel_signature.nativeName = 'another form'; },
    row => { row.evidence.source_body.actual_pixel_signature.orderedAttacks[0].effect = 'unverified body'; },
    row => { row.evidence.source_body.provider_metadata.translation.en.attacks[0].text = 'rewritten'; },
    row => { row.evidence.source_body.provider_metadata.attacks[0].text = 'rewritten'; },
    row => { row.evidence.source_body.queue_controls.source_qa.original_sha256 = 'a'.repeat(64); },
    row => { row.evidence.source_body.independent_selection.independentlySelectedSourceCardId = 'unbound'; },
    row => { row.card_native_name = 'changed'; },
    row => { row.collector_number = '013'; },
    row => { row.variant_ids = [rows[1].variant_ids[0]]; },
  ]) mutateEvidence('001', mutate);
});

test('former comparison modes and null selections survive separately from current independent acceptance', () => {
  for (const alias of ['008', '046', '050', '051']) {
    const body = rowFor(plan, alias).evidence.source_body;
    assert.equal(body.historical_association.capture_mode, 'quarantine_comparison_only');
    assert.ok(body.independent_selection.comparisonResolution);
    assert.equal(body.current_acceptance.independently_accepted, true);
    mutateEvidence(alias, row => { row.evidence.source_body.historical_association.capture_mode = 'ordinary'; });
  }
  for (const alias of ['050', '051']) assert.equal(rowFor(plan, alias).evidence.source_body.historical_association.selected_source_card_id, null);
});

test('UnownL/S retain actual HP50, four-card header and distinct opponent-deck versus own-Prize body', () => {
  const l = rowFor(plan, '050').evidence.source_body; const s = rowFor(plan, '051').evidence.source_body;
  for (const body of [l, s]) {
    assert.equal(body.actual_pixel_signature.hp, 50); assert.equal(Number(body.source_signature.hp), 40);
    assert.match(body.actual_pixel_signature.rules[0].text, /4枚/);
  }
  assert.match(l.actual_pixel_signature.abilities[0].criticalNativeText, /相手の山札/);
  assert.match(s.actual_pixel_signature.abilities[0].criticalNativeText, /サイドカード/);
  assert.deepEqual(s.actual_pixel_signature.orderedAttacks[0].cost, ['Psychic', 'Colorless']);
  assert.equal(s.actual_pixel_signature.orderedAttacks[0].damage, '20'); assert.equal(s.actual_pixel_signature.retreat, 1);
  assert.match(s.approved_actual_pixel_guard, /Psychic plus Colorless/);
  assert.match(s.historical_association.identity_match.nativeBodyBridge.form.actualPixelGuard, /two Psychic/);
  mutateEvidence('051', row => { row.evidence.source_body.approved_actual_pixel_guard = 'two Psychic'; });
  mutateEvidence('051', row => { row.evidence.source_body.actual_pixel_signature.orderedAttacks[0].cost = ['Psychic', 'Psychic']; });
  mutateEvidence('050', row => { row.evidence.source_body.actual_pixel_signature.abilities[0].criticalNativeText = '自分の山札'; });
});

test('17 retreat discrepancies, complete artists and actual attack orthography remain source-qualified', () => {
  assert.equal(rows.filter(row => row.evidence.source_body.provider_metadata_discrepancies.some(item => item.type === 'retreat_metadata_disagreement')).length, 17);
  assert.equal(rows.filter(row => row.evidence.source_body.source_signature.convertedRetreatCost === null && row.evidence.source_body.actual_pixel_signature.retreat === 0).length, 7);
  for (const [alias, artist] of [['009', 'K. Hoshiba / CR CG gangs'], ['012', 'Shin-ichi Yoshikawa / CR CG gangs'], ['030', 'Jungo Suzuki / CR CG gangs']]) {
    const body = rowFor(plan, alias).evidence.source_body;
    assert.equal(body.actual_pixel_signature.artist, artist); assert.notEqual(body.source_signature.artist, artist);
    mutateEvidence(alias, row => { row.evidence.source_body.actual_pixel_signature.artist = row.evidence.source_body.source_signature.artist; });
  }
  assert.equal(rowFor(plan, '020').evidence.source_body.actual_pixel_signature.orderedAttacks[0].name, 'もやす');
  assert.equal(rowFor(plan, '035').evidence.source_body.actual_pixel_signature.orderedAttacks[0].name, 'てっぽうみず');
});

test('41normal6holo singleton bindings preserve names, no enlargement and physical limits', () => {
  for (const environment of ['production', 'staging']) {
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'normal').length, 41);
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'holo').length, 6);
    bind(rows, plan.binding_expectations[environment], environment);
  }
  for (const field of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id', 'same_artwork_as_variant_id']) {
    const changed = clone(plan); changed.binding_expectations.staging[0][field] = 'changed';
    assert.throws(() => validateRows(changed, table));
  }
  for (const mutate of [row => { row.objects[0].width = 359; }, row => { row.objects[1].width = row.objects[0].width + 1; }, row => { row.evidence.physical_edition_verified = true; }, row => { row.evidence.source_body.actual_pixel_observations.copyrightYearInferred = true; }]) mutateEvidence('001', mutate);
});

test('inactive Scrydex policy is unchanged and only absent staging source may be a rollback fixture', () => {
  validateSourcePlan(plan); assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true);
  for (const mutate of [p => { p.source_policies.production[0].active = true; }, p => { p.source_policies.production[0].licence_status = 'approved'; }, p => { p.new_sources.production = clone(p.source_policies.production); }, p => { p.new_sources.staging = []; }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed));
  }
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
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 197);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 291);
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
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 193);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_DARKNESS_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK DARKNESS FRONTS', STACKR_ARTWORK_DARKNESS_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_DARKNESS_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_DARKNESS_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_DARKNESS_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
