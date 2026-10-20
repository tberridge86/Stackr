import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, FINISH_HOLD_PRINTING } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse } from '../artwork3303-publish-20260928/publish.mjs';

const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });

test('Noivern/Pikachu eligible front plan and exact business decision are byte-frozen', async () => {
  const bytes = await readFile(new URL('./plan.json', import.meta.url));
  const decision = await readFile(new URL('./approval.json', import.meta.url));
  assert.equal(validatePlan(bytes, table).rows.length, FRONTS);
  assert.equal(validateApproval(decision).vendor_licence_verified, false);
  const savedBytes = await readFile(new URL('./saved-targets.json', import.meta.url));
  assert.equal(validateSavedTargets(savedBytes).length, 53);
  assert.throws(() => validateSavedTargets(Buffer.concat([savedBytes, Buffer.from('\n')])), /saved target identities changed/);
  const tableBytes = await readFile(new URL('./identity-table.json', import.meta.url));
  assert.equal(validateIdentityTable(tableBytes, saved).length, FRONTS);
  assert.throws(() => validateIdentityTable(Buffer.concat([tableBytes, Buffer.from('\n')]), saved), /identity table bytes changed/);
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('\n')]), table), /plan bytes changed/);
  assert.throws(() => validateApproval(Buffer.concat([decision, Buffer.from('\n')])), /decision bytes changed/);
});

test('exact nonconsecutive subset, source aliases, printed deck and original identity stay bounded', () => {
  for (const mutate of [
    p => { p.rows[0].language_code = 'ja'; },
    p => { p.rows.find(r => r.set_code === 'tk-xy-n').collector_number = '12'; },
    p => { p.rows[0].provider_id = p.rows.find(r => r.set_code !== p.rows[0].set_code).provider_id; },
    p => { p.rows[0].evidence.pixel_identity.printedDenominator += 1; },
    p => { p.rows[0].evidence.pixel_identity.printedCollectorNumber = '30/30'; },
    p => { p.rows[0].evidence.pixel_identity.copyrightInferredFromReleaseYear = true; },
    p => { p.rows[0].evidence.pixel_identity.copyrightYearObservedFromPixels = false; },
    p => { p.rows[0].evidence.pixel_identity.deckSymbol = 'Different deck'; },
    p => { p.rows[0].objects[0] = clone(p.rows.find(r => r.set_code !== p.rows[0].set_code).objects[0]); },
    p => { p.rows[0].evidence.pixel_identity.outerPhysicalCornerGeometryCertified = true; },
    p => { p.rows[0].objects[0].height += 1; },
    p => { p.rows[0].objects[3].width = p.rows[0].objects[0].width + 1; },
    p => { p.rows[0].evidence.vendor_licence_verified = true; },
    p => { p.rows[0].evidence.exact_finish_verified = true; },
    p => { p.rows[0].evidence.product_reference_used_for_binding = true; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed, table)); }
});

test('undersized or unreadable research fronts fail minimum detail quality despite matching table dimensions', () => {
  for (const [width, height] of [[253, 359], [320, 448], [575, 800], [576, 799]]) {
    const changed = clone(plan); const changedTable = clone(table);
    const row = changed.rows[0];
    row.objects[0].width = width; row.objects[0].height = height;
    const bound = changedTable.find(entry => entry.printing_id === row.printing_id);
    bound.original_width = width; bound.original_height = height;
    assert.throws(() => validateRows(changed, changedTable), /below minimum detail quality/);
  }
  for (const field of ['nameNumberAndSymbolReadable', 'finePrintReadable', 'completePrintedFaceAndFrameVisible']) {
    const changed = clone(plan); changed.rows[0].evidence.pixel_identity[field] = false;
    assert.throws(() => validateRows(changed, table), /readable printed face/);
  }
});

test('energy title/symbol observations are preserved without inventing a literal catalogue title on the face', () => {
  const energy = rows.find(row => row.card_native_name.includes('Energy') && row.evidence.pixel_identity.energyTypeSymbol);
  assert.ok(energy.evidence.pixel_identity.printedName.includes('ENERGY'));
  assert.ok(energy.evidence.pixel_identity.energyTypeSymbol.length > 0);
  for (const field of ['printedName', 'energyTypeSymbol']) {
    const changed = clone(plan);
    changed.rows.find(row => row.printing_id === energy.printing_id).evidence.pixel_identity[field] = 'Wrong energy identity';
    assert.throws(() => validateRows(changed, table), /readable printed face/);
  }
});

test('Professor’s Letter24 punctuation alias preserves the exact canonical name and inspected title', () => {
  const row = rows.find(candidate => candidate.set_code === 'tk-xy-n' && candidate.collector_number === '24');
  assert.equal(row.card_native_name, 'Professor’s Letter');
  assert.equal(row.evidence.source_metadata_name, "Professor's Letter");
  assert.equal(row.evidence.pixel_identity.printedName, 'Professor’s Letter');
  assert.equal(plan.binding_expectations.production.find(card => card.printing_id === row.printing_id).card_native_name, 'Professor’s Letter');
  const changed = clone(plan);
  changed.rows.find(candidate => candidate.printing_id === row.printing_id).evidence.source_metadata_name = 'Professor’s Letter';
  assert.throws(() => validateRows(changed, table), /Source metadata hash, name or collector alias/);
});

test('observed Sonic Bazooka symbol order and Potion transcription stay source facts without changing metadata', () => {
  const noivern = rows.find(row => row.set_code === 'tk-xy-n' && row.collector_number === '13');
  const order = noivern.evidence.pixel_identity.attackCostSymbolOrderDifference;
  assert.deepEqual(order.actualLeftToRight, ['Psychic', 'Darkness', 'Colorless']);
  assert.deepEqual(order.metadataOrder, ['Darkness', 'Psychic', 'Colorless']);
  assert.equal(order.sameRequiredSymbolsAndCounts, true);
  assert.equal(order.canonicalMetadataChanged, false);
  const potion = rows.find(row => row.set_code === 'tk-xy-p' && row.collector_number === '21');
  assert.equal(potion.evidence.pixel_identity.rules[0], 'Heal 30 damage from 1 of your Pokémon.');
  const fact = potion.evidence.source_metadata_content_discrepancies[0];
  assert.equal(fact.sourceValue, 'Heal 30 damage from I of your Pokémon');
  assert.equal(fact.singleFullOriginalRechecked, true);
  assert.equal(fact.canonicalMetadataChanged, false);
  const changed = clone(plan);
  changed.rows.find(row => row.printing_id === potion.printing_id).evidence.pixel_identity.rules[0] = fact.sourceValue;
  assert.throws(() => validateRows(changed, table), /printed face\/deck\/year\/content evidence changed/);
});

test('identical immutable display paths can deduplicate while conflicting aliases and shared originals cannot', () => {
  const duplicate = [...clone(rows), clone(rows[0])];
  assert.equal(indexObjects(duplicate).size, indexObjects(rows).size);
  for (const field of ['sha256', 'byte_size', 'width', 'height', 'mime_type', 'role', 'artifact_id']) {
    const changed = clone(duplicate);
    changed.at(-1).objects[2][field] = 'conflict';
    assert.throws(() => indexObjects(changed), /Incompatible immutable object path alias/);
  }
  const changed = clone(plan); const changedTable = clone(table);
  const target = changed.rows[1];
  target.objects[0] = clone(changed.rows[0].objects[0]);
  const bound = changedTable.find(entry => entry.printing_id === target.printing_id);
  bound.original_sha256 = target.objects[0].sha256;
  bound.original_width = target.objects[0].width; bound.original_height = target.objects[0].height;
  assert.throws(() => validateRows(changed, changedTable), /Originals cannot be reused|conflicting card identities/);
});

test('the two real energy thumbnail aliases retain separate printing/original/detail identities and all208 references', () => {
  for (const [setCode, refs, hash] of [
    ['tk-xy-n', ['26', '28'], 'f21eedba6a685103f4cef8a613c3b564cffd711455aaa6885ce80d90ccdb6437'],
    ['tk-xy-p', ['3', '5'], 'f56d701d4ad33462ff0f4b7fe94b0308f072f3b15955468c70ac6eae07d0280b'],
  ]) {
    const pair = rows.filter(row => row.set_code === setCode && refs.includes(row.collector_number));
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0].printing_id, pair[1].printing_id);
    assert.notEqual(pair[0].objects[0].sha256, pair[1].objects[0].sha256);
    assert.notEqual(pair[0].objects[3].sha256, pair[1].objects[3].sha256);
    assert.deepEqual(pair[0].objects[2], pair[1].objects[2]);
    assert.equal(pair[0].objects[2].sha256, hash);
    assert.equal(pair[0].objects[2].width, 96);
  }
  assert.equal(rows.flatMap(row => row.objects).length, 208);
  assert.equal(indexObjects(rows).size, 206);
  assert.equal(plan.archive.file_count, 209);
});

test('known Noivern30 finish mismatch stays held even if a table and row are relabelled together', () => {
  const changed = clone(plan); const changedTable = clone(table);
  const oldId = changed.rows[0].printing_id;
  changed.rows[0].printing_id = FINISH_HOLD_PRINTING;
  changedTable.find(entry => entry.printing_id === oldId).printing_id = FINISH_HOLD_PRINTING;
  assert.throws(() => validateRows(changed, changedTable), /normal\/source holofoil mismatch remains held/);
});

test('all current singleton variants, native names, numbers, finishes and published versions stay exact', () => {
  assertBindings(plan, clone(plan.binding_expectations.production), 'production');
  for (const key of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id']) {
    const changed = clone(plan.binding_expectations.production); changed[0][key] = 'unexpected';
    assert.throws(() => assertBindings(plan, changed, 'production'), /identity, name, variant or finish/);
  }
});

test('existing Scrydex policy remains unchanged; no production provenance additions are permitted', async () => {
  validateSourcePlan(plan);
  assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true);
  for (const mutate of [
    p => { p.source_policies.production[0].active = true; },
    p => { p.source_policies.production[0].licence_status = 'approved'; },
    p => { p.new_sources.production = clone(p.source_policies.production); },
    p => { p.new_sources.staging = []; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateSourcePlan(changed)); }
  const altered = clone(plan.source_policies.production); altered[0].internal_notes = 'changed';
  assert.throws(() => assertSourcePolicies(plan, altered, 'production', true), /source policy changed/);
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
    assets: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_id: 'old-logo', asset_type: 'set_logo', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-logo.png' }],
    links: [{ asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', catalogue_version_id: rows[0].catalogue_version_id, language_code: 'en', asset_type: 'set_logo', set_id: rows[0].set_id, printing_id: null, variant_id: null }],
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
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: rows[0].catalogue_version_id }] };
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
  assert.deepEqual(db.state.assets[0], initial.assets[0]);
  assert.deepEqual(db.state.links[0], initial.links[0]);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0);
  assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('identity, old-logo, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_NOIVERN_PIKACHU_CONFIRMATION: 'PUBLISH ARTWORK NOIVERN PIKACHU', STACKR_ARTWORK_NOIVERN_PIKACHU_PACKAGES: '/packages', STACKR_ARTWORK_NOIVERN_PIKACHU_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_NOIVERN_PIKACHU_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_NOIVERN_PIKACHU_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
