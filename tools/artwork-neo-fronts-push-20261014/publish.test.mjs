import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';

const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });

test('finite Japanese batch plan, identities and approval are byte frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes);
    assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, FRONTS);
  assert.equal(approval.language_code, 'ja');
  assert.equal(indexObjects(rows).size, 100);
  assert.equal(plan.archive.file_count, 104);
});

test('aliases, printed National Dex and native names remain distinct and known', () => {
  const oddish = rows.find(row => row.collector_number === '001');
  assert.equal(oddish.evidence.source_body.printed_dex_number, 'No.043');
  assert.equal(oddish.card_native_name, '奇妙な');
  assert.equal(oddish.evidence.source_body.printed_name, 'ナゾノクサ');
  assert.equal(rows.filter(row => row.evidence.printed_identity.known_native_label_defect_retained_without_write).length, 19);
  for (const mutate of [
    row => { row.collector_number = '043'; },
    row => { row.provider_id = 'neo1_ja-43'; },
    row => { row.card_native_name = 'ナゾノクサ'; },
    row => { row.evidence.printed_identity.canonical_alias_is_not_printed_national_dex = false; },
    row => { row.evidence.printed_identity.current_native_label_not_used_for_match = false; },
    row => { row.evidence.source_body.printed_dex_number = 'No.001'; },
    row => { row.evidence.source_body.printed_name = 'チコリータ'; },
    row => { row.evidence.printed_identity.known_native_label_defect_retained_without_write = false; },
  ]) {
    const changed = clone(plan); const changedTable = clone(table);
    const row = changed.rows.find(row => row.collector_number === '001');
    mutate(row);
    const expected = changedTable.find(entry => entry.printing_id === row.printing_id);
    expected.evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
    assert.throws(() => validateRows(changed, changedTable));
  }
});

test('unknown IDs and substituted source or variants remain excluded even with a jointly changed table', () => {
  for (const mutate of [row => { row.printing_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; }, row => { row.variant_ids = [rows[1].variant_ids[0]]; }, row => { row.provider_id = rows[1].provider_id; }]) {
    const changed = clone(plan); const changedTable = clone(table); const oldId = changed.rows[0].printing_id;
    mutate(changed.rows[0]); Object.assign(changedTable.find(entry => entry.printing_id === oldId), changed.rows[0]);
    assert.throws(() => validateRows(changed, changedTable), /Unknown or relabelled/);
  }
});

test('normal and holo metadata are exact; generic front does not certify physical foil', () => {
  for (const environment of ['production', 'staging']) {
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'normal').length, 20);
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'holo').length, 5);
    bind(rows, plan.binding_expectations[environment], environment);
  }
  const holo = plan.binding_expectations.production.find(card => card.finish_code === 'holo');
  const changed = clone(plan); changed.binding_expectations.production.find(card => card.variant_id === holo.variant_id).finish_code = 'normal';
  assert.throws(() => validateRows(changed, table), /metadata finish changed/);
  for (const field of ['exact_finish_verified', 'physical_edition_verified', 'vendor_licence_verified']) {
    const changed = clone(plan); changed.rows[0].evidence[field] = true;
    assert.throws(() => validateRows(changed, table));
  }
});

test('the sole environment binding difference is the Japanese catalogue version', () => {
  assert.equal(rows[0].catalogue_version_id, PRODUCTION_JA);
  for (const card of plan.binding_expectations.staging) assert.equal(card.catalogue_version_id, STAGE_JA);
  for (const key of ['set_id', 'set_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'game_code', 'same_artwork_as_variant_id']) {
    const changed = clone(plan); changed.binding_expectations.staging[0][key] = 'unexpected';
    assert.throws(() => validateRows(changed, table));
  }
});

test('copyright, edition, readable whole face and material statements stay truthful even with repinned evidence digest', () => {
  for (const [field, value] of [['copyright_or_date_line_visible', true], ['copyright_year_inferred', true], ['copyright_year', 2000], ['edition_stamp_visible', true], ['edition_or_distribution_certified', true], ['material_foil_finish_certified', true], ['whole_original_inspected', false], ['full_frame_visible', false], ['name_number_and_symbol_readable', false], ['fine_print_readable', false]]) {
    const changed = clone(plan); const changedTable = clone(table); const row = changed.rows[0];
    row.evidence.pixel_identity[field] = value;
    changedTable.find(entry => entry.printing_id === row.printing_id).evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
    assert.throws(() => validateRows(changed, changedTable));
  }
});

test('undersized originals, changed original hashes and enlarged derivatives cannot be published', () => {
  for (const [width, height] of [[359, 504], [360, 503], [253, 359]]) {
    const changed = clone(plan); const changedTable = clone(table); const row = changed.rows[0];
    row.objects[0].width = width; row.objects[0].height = height;
    Object.assign(changedTable.find(entry => entry.printing_id === row.printing_id), { original_width: width, original_height: height });
    assert.throws(() => validateRows(changed, changedTable), /below minimum/);
  }
  for (const mutate of [row => { row.objects[0].sha256 = 'a'.repeat(64); }, row => { row.objects[3].width = row.objects[0].width + 1; }, row => { row.objects[3].height = row.objects[0].height + 1; }, row => { row.objects[1].file = '../escaped.webp'; }]) {
    const changed = clone(plan); mutate(changed.rows[0]); assert.throws(() => validateRows(changed, table));
  }
});

test('frozen body/source evidence cannot be silently rewritten', () => {
  for (const mutate of [e => { e.source_body.hp += 10; }, e => { e.source_body.attack_damage = []; }, e => { e.source_body.artist = 'unknown'; }, e => { e.source_metadata_sha256 = 'a'.repeat(64); }, e => { e.source_signature.dex = [1]; }, e => { e.identity_limits.physical_finish_certified = true; }, e => { e.owner_business_decision.source_wide_approval = true; }]) {
    const changed = clone(plan); mutate(changed.rows[0].evidence); assert.throws(() => validateRows(changed, table));
  }
});

test('all current singleton variants, native labels, aliases, finishes and versions remain exact', () => {
  for (const environment of ['production', 'staging']) assertBindings(plan, clone(plan.binding_expectations[environment]), environment);
  for (const key of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id']) {
    const changed = clone(plan.binding_expectations.production); changed[0][key] = 'unexpected';
    assert.throws(() => assertBindings(plan, changed, 'production'), /identity, name, variant or finish/);
  }
});

test('inactive Scrydex policy remains unchanged and production source insertion is excluded', async () => {
  validateSourcePlan(plan);
  assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true);
  for (const mutate of [p => { p.source_policies.production[0].active = true; }, p => { p.source_policies.production[0].licence_status = 'approved'; }, p => { p.new_sources.production = clone(p.source_policies.production); }, p => { p.new_sources.staging = []; }]) {
    const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed));
  }
  const unbounded = clone(plan); unbounded.new_sources.production = clone(plan.source_policies.production);
  const db = database();
  await assert.rejects(createSourceResolver(unbounded)(db, receipt, 'production'), /insertion is outside this cohort/);
  assert.equal(db.calls.length, 0);
});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_id: 'old-logo', asset_type: 'set_logo', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-logo.png' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', asset_id: 'old-symbol', asset_type: 'set_symbol', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-symbol.png' }],
    links: environment === 'staging' ? [] : [{ asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', catalogue_version_id: rows[0].catalogue_version_id, language_code: 'ja', asset_type: 'set_logo', set_id: rows[0].set_id, printing_id: null, variant_id: null }, { asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', catalogue_version_id: rows[0].catalogue_version_id, language_code: 'ja', asset_type: 'set_symbol', set_id: rows[0].set_id, printing_id: null, variant_id: null }],
    sources: plan.source_policies[environment].map((source, i) => ({ ...clone(source), id: `source-${i}` })),
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
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql => sql.startsWith('insert into ingest.sources')));
  for (const scope of ['printings', 'variants', 'names', 'sets', 'sources']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, 2), initial.assets);
  assert.deepEqual(db.state.links.slice(0, 2), initial.links);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0);
  assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('identity, old logo/symbol and links, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.assets[1].storage_key = 'changed-symbol'; }, s => { s.links[1].asset_type = 'changed-symbol-link'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_NEO_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK NEO FRONTS', STACKR_ARTWORK_NEO_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_NEO_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_NEO_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_NEO_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
