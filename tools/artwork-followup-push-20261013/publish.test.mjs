import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, COHORT_SHA, SOURCE_FIELDS } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots, createMetadataGuard } from './metadata-guard.mjs';
import { assetId, writeMetadata, rehearse } from '../artwork3303-publish-20260928/publish.mjs';

const { plan, rows, approval, receipt } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });

test('byte-frozen fifty-seven-front plan and scoped business decision reject modified bytes', async () => {
  const bytes = await readFile(new URL('./plan.json', import.meta.url));
  const decision = await readFile(new URL('./approval.json', import.meta.url));
  assert.equal(validatePlan(bytes).rows.length, 57);
  assert.equal(validateApproval(decision).vendor_licence_verified, false);
  assert.throws(() => validatePlan(Buffer.concat([bytes, Buffer.from('\n')])), /plan bytes changed/);
  assert.throws(() => validateApproval(Buffer.concat([decision, Buffer.from('\n')])), /decision bytes changed/);
});

test('front scope rejects unknown collectors, source URL, unsupported finish, licence and enlargement', () => {
  for (const mutate of [
    p => { p.rows[0].language_code = 'ja'; },
    p => { p.rows.find(r => r.set_code === 'P-A').collector_number = '073'; },
    p => { p.rows.find(r => r.set_code === 'sve').provider_id = 'sve-25'; },
    p => { p.rows.find(r => r.set_code === 'svp').collector_number = '211'; },
    p => { p.rows[0].image_url += '?alternate'; },
    p => { p.rows[0].objects[3].width = 1024; },
    p => { p.rows[0].evidence.vendor_licence_verified = true; },
    p => { p.rows[0].evidence.exact_finish_verified = true; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed)); }
});

test('Ancient Mew inference and Pocket metadata remain distinct from printed physical identity', () => {
  for (const mutate of [
    p => { p.rows.find(r => r.set_code === 'miscp').evidence.pixel_identity.canonicalEditionMetadataInvented = true; },
    p => { p.rows.find(r => r.set_code === 'miscp').evidence.pixel_identity.copyrightYear2000Present = false; },
    p => { p.rows.find(r => r.set_code === 'P-A').evidence.pixel_identity.printedSetCollectorNumberPresent = true; },
    p => { p.rows.find(r => r.set_code === 'sve').evidence.pixel_identity.otherStampedEditionSelected = true; },
  ]) { const changed = clone(plan); mutate(changed); assert.throws(() => validateRows(changed)); }
});

test('all eighty-one current variant, name, number and catalogue-version bindings are exact', () => {
  assertBindings(plan, clone(plan.binding_expectations.production), 'production');
  for (const key of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id']) {
    const changed = clone(plan.binding_expectations.production); changed[0][key] = 'unexpected';
    assert.throws(() => assertBindings(plan, changed, 'production'), /identity, name, variant or finish/);
  }
});

test('inactive under-review exact Limitless provenance is permitted, never broad source activation', () => {
  validateSourcePlan(plan);
  assertSourcePolicies(plan, clone(plan.source_policies.production), 'production');
  assertSourcePolicies(plan, [...clone(plan.source_policies.production), ...clone(plan.new_sources.production)], 'production', true);
  for (const key of SOURCE_FIELDS) {
    const changed = clone(plan); changed.new_sources.production[0][key] = 'changed';
    assert.throws(() => validateSourcePlan(changed));
  }
  for (const [key, value] of [['active', true], ['licence_status', 'approved'], ['internal_notes', 'unbounded'], ['base_url', 'https://example.com']]) {
    const changed = [...clone(plan.source_policies.production), ...clone(plan.new_sources.production)]; changed[1][key] = value;
    assert.throws(() => assertSourcePolicies(plan, changed, 'production', true), /source policy changed/);
  }
  assert.throws(() => assertSourcePolicies(plan, [], 'production'), /source count|source missing/);
  assert.throws(() => assertSourcePolicies(plan, clone(plan.source_policies.production), 'production', true), /source missing/);
});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_id: 'old-logo', asset_type: 'set_logo', printing_id: null, variant_id: null, set_id: rows[0].set_id, storage_key: 'immutable/old-logo.png' }],
    links: [{ asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', catalogue_version_id: rows[0].catalogue_version_id, language_code: 'en', asset_type: 'set_logo', set_id: rows[0].set_id, printing_id: null, variant_id: null }],
    sources: plan.source_policies[environment].map((s, i) => ({ ...clone(s), id: `source-${i}` })),
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
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(a => a.asset_type === 'card_image').map(a => ({ id: a.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: state.assets.filter(a => a.asset_type === 'card_image').map(a => ({ ...clone(a), asset_row_id: a.id })) };
    if (sql.startsWith('insert into ingest.sources')) {
      const source = Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, i) => [key, parameters[i]]));
      if (!state.sources.some(s => s.code === source.code)) state.sources.push({ ...source, deprecated_at: null, id: `new-source-${source.code}` });
      return { rows: [] };
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.assets.some(a => a.asset_id === data.asset_id)) {
        const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++nextId).padStart(12, '0')}`;
        state.assets.push({ ...data, id }); inserted.push({ id });
      }
      return { rows: inserted };
    }
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.links.some(l => l.asset_id === data.asset_id && l.catalogue_version_id === data.catalogue_version_id)) { state.links.push(data); inserted.push(data); }
      db.mutateAfterLinks?.(state);
      return { rows: clone(inserted) };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(a => parameters[0].includes(a.asset_id))) };
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select * from ${table} where`)) return { rows: clone(state[scope]) };
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}

test('asset-only publication retains all metadata and old logos; one inactive source created; rerun inserts nothing', async () => {
  const db = database(); const initial = clone(db.state); const guard = createMetadataGuard(plan); const first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(a => a.created).length, 57);
  assert.equal(first.links.filter(a => a.created).length, 57);
  assert.equal(first.preservation.before_counts.names, 162);
  assert.equal(first.preservation.new_inactive_provenance_sources, 1);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.sources[0], initial.sources[0]);
  assert.equal(db.state.sources[1].active, false);
  assert.equal(db.state.sources[1].licence_status, 'under_review');
  assert.deepEqual(db.state.assets[0], initial.assets[0]);
  assert.deepEqual(db.state.links[0], initial.links[0]);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(a => a.created).length, 0);
  assert.equal(second.links.filter(a => a.created).length, 0);
  assert.equal(second.preservation.new_inactive_provenance_sources, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('same-transaction guard rejects identity, existing policy, set mark and source-scope changes and rolls back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'holo'; }, s => { s.printings[0].printing_discriminator = 'invented-edition'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources[1].licence_status = 'approved'; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
    const db = database(); const initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))), /scoped row changed|counts changed|source insertion|source count|source policy changed|metadata insertion/);
    assert.deepEqual(db.state, initial);
    assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('staging creates only two inactive fixtures inside the rolled-back artwork rehearsal', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 2);
  assert.equal(result.assets.length, 57);
  assert.deepEqual(db.state, initial);
});

test('preservation guard refuses an unjournalled asset or provenance row', () => {
  const before = plan.source_policies.production.map((s, i) => ({ scope: 'sources', identity: String(i), payload: s }));
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'assets', identity: 'unlisted', payload: {} }], journal(), plan, 'production'), /journal and new rows differ/);
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'sources', identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'), /source insertion/);
});

test('rollback binds only successful created asset UUIDs and retains objects, links and source provenance', () => {
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

test('execution requires exact protected main, manual workflow and private output outside public receipts', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_FOLLOWUP_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP', STACKR_ARTWORK_FOLLOWUP_PACKAGES: '/packages', STACKR_ARTWORK_FOLLOWUP_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_FOLLOWUP_CONFIRMATION: 'PUBLISH ARTWORK NEXT PUSH' }, { ...env, STACKR_ARTWORK_FOLLOWUP_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
