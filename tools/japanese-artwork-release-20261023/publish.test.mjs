import test from 'node:test';
import assert from 'node:assert/strict';
import { assetId, createPublicationJournal, rehearse, STAGE_JA, writeMetadata } from '../artwork3303-publish-20260928/publish.mjs';
import { assertConfig, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, BINDING_FIELDS, createMetadataGuard, createSourceResolver, orderedSnapshot, readSnapshot, snapshotCounts, snapshotHash, SOURCE_FIELDS, validateSourcePlan } from './metadata-guard.mjs';

const clone = value => structuredClone(value);
const id = number => `aaaaaaaa-aaaa-4aaa-8aaa-${String(number).padStart(12, '0')}`;
const VERSION = id(90), SET = id(91), COHORT = 'c'.repeat(64);
const source = {
  id: id(92), code: 'tcgcollector', active: false, base_url: 'https://www.tcgcollector.com', terms_url: null,
  created_at: '2026-10-15T20:03:02.485064+00:00', updated_at: '2026-10-15T20:03:02.485064+00:00',
  source_type: 'image', display_name: 'TCGCollector provenance', deprecated_at: null, robots_policy: null,
  internal_notes: 'Existing finite source decision; preserve this exact policy and timestamp.', licence_status: 'under_review',
  deprecated_reason: null, rate_limit_config: {}, source_updated_at: null, attribution_required: true,
};
const fixture = Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map(field => [field, field === 'internal_notes' ? 'Temporary inactive source for rolled-back staging rehearsal only.' : source[field]]));
const rows = [1, 2].map(number => ({
  printing_id: id(number), set_id: SET, set_code: 'web1', collector_number: String(number).padStart(3, '0'), language_code: 'ja', card_native_name: number === 1 ? 'ピカチュウ' : 'ミュウ', catalogue_version_id: VERSION,
  source_code: 'tcgcollector', image_url: `https://static.tcgcollector.com/content/images/test-${number}.webp`, evidence: { visually_checked: true, visible_edition: 'unstamped' },
  objects: ['original', 'card-grid', 'search-result', 'detail-page'].map((role, index) => ({ role, sha256: String(number * 4 + index).padStart(64, '0'), byte_size: 100, width: 100, height: 140, mime_type: 'image/webp', artifact_id: 'test', file: `${number}-${role}.webp` })),
}));
const bindings = environment => [
  { ...rows[0], variant_id: id(11), variant_code: 'normal', finish_code: 'normal', is_default: true },
  { ...rows[1], variant_id: id(12), variant_code: 'holo', finish_code: 'holo', is_default: false },
  { ...rows[1], variant_id: id(13), variant_code: 'reverse_holo', finish_code: 'reverse_holo', is_default: false },
].map(row => Object.fromEntries(BINDING_FIELDS.map(field => [field, field === 'game_code' ? 'pokemon' : field === 'same_artwork_as_variant_id' ? null : field === 'catalogue_version_id' && environment === 'staging' ? STAGE_JA : row[field]])));

function planFor() {
  return {
    rows: clone(rows), sourcePolicies: { production: [clone(source)], staging: [] }, newSources: { production: [], staging: [clone(fixture)] },
    bindingExpectations: { production: bindings('production'), staging: bindings('staging') },
    scopeCounts: {
      production: { printings: 2, variants: 3, names: 6, sets: 1, assets: 1, links: 1, sources: 1 },
      staging: { printings: 2, variants: 3, names: 6, sets: 1, assets: 1, links: 0, sources: 0 },
    },
    beforeSnapshotHashes: { production: '0'.repeat(64), staging: '0'.repeat(64) },
  };
}

function database(environment = 'production') {
  const initialBindings = bindings(environment), version = environment === 'production' ? VERSION : STAGE_JA;
  const state = {
    printings: rows.map(row => ({ id: row.printing_id, set_id: row.set_id, native_name: row.card_native_name, collector_number: row.collector_number, language_code: 'ja', english_display_name: 'Preserve display supplement', updated_at: '2026-10-22T01:00:00.123456+00:00' })),
    variants: initialBindings.map(row => ({ id: row.variant_id, printing_id: row.printing_id, variant_code: row.variant_code, finish_code: row.finish_code, is_default: row.is_default })),
    names: initialBindings.flatMap((row, index) => ['native', 'en'].map((kind, offset) => ({ id: id(100 + index * 2 + offset), printing_id: row.printing_id, variant_id: row.variant_id, name: kind === 'native' ? row.card_native_name : 'Preserve English supplement', kind }))),
    sets: [{ id: SET, set_code: 'web1', name: 'Preserve set metadata', printed_total: 48 }],
    assets: [{ id: id(200), asset_id: 'old-set-logo', asset_type: 'set_logo', set_id: SET, printing_id: null, variant_id: null, storage_key: 'existing/immutable-logo.png', publicly_servable: true }],
    links: environment === 'production' ? [{ asset_id: id(200), catalogue_version_id: version, language_code: 'ja', asset_type: 'set_logo', set_id: SET, printing_id: null, variant_id: null }] : [],
    sources: environment === 'production' ? [clone(source)] : [],
  };
  let saved, nextId = 300;
  const db = { state, calls: [], cards: initialBindings, async query(sql, parameters = []) {
    db.calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.includes('from api.catalogue_cards')) {
      if (sql.startsWith('select c.game_code')) {
        assert.ok(sql.includes('from api.catalogue_cards c join catalog.card_variants v on v.id=c.variant_id'));
        assert.ok(sql.includes('v.variant_code,v.finish_code,v.is_default'));
        assert.ok(sql.includes('where c.printing_id=any($1::uuid[]) limit 4'));
        assert.ok(!sql.includes('c.is_default'));
        assert.deepEqual(parameters, [rows.map(row => row.printing_id)]);
        return { rows: db.cards.flatMap(card => {
          const variant = state.variants.find(row => row.id === card.variant_id);
          return variant ? [{ ...clone(card), ...Object.fromEntries(['variant_code', 'finish_code', 'is_default'].map(field => [field, variant[field]])) }] : [];
        }) };
      }
      if (/\bis_default\b/u.test(sql)) throw Error('api.catalogue_cards has no is_default column');
      assert.ok(sql.startsWith('select game_code'));
      return { rows: clone(db.cards) };
    }
    if (sql.startsWith('select to_jsonb(source) as payload from ingest.sources')) return { rows: state.sources.map(payload => ({ payload: clone(payload) })) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: parameters[0].includes(version) ? [{ id: version }] : [] };
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ id: asset.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: clone(state.assets.filter(asset => asset.asset_type === 'card_image' && state.links.some(link => link.asset_id === asset.id && link.catalogue_version_id === version)).map(asset => ({ ...asset, asset_row_id: asset.id }))) };
    if (sql.startsWith('insert into ingest.sources')) {
      if (db.failSourceInsert) throw Error('Injected source insert failure');
      const inserted = { ...clone(source), ...Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((field, index) => [field, parameters[index]])), id: id(400), created_at: '2026-10-23T01:00:00.123456+00:00', updated_at: '2026-10-23T01:00:00.123456+00:00' };
      if (db.concurrentSourceInsert) { state.sources.push(inserted); return { rows: [] }; }
      if (state.sources.some(item => item.code === inserted.code)) return { rows: [] };
      state.sources.push(inserted);
      const returned = clone(inserted);
      db.mutateAfterSourceInsert?.(inserted);
      return { rows: [{ payload: returned }] };
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const asset of JSON.parse(parameters[0])) if (!state.assets.some(old => old.asset_id === asset.asset_id)) {
        const generatedId = id(++nextId);
        state.assets.push({ ...asset, id: generatedId, created_at: '2026-10-23T01:00:00.123456+00:00' });
        inserted.push({ id: generatedId });
      }
      return { rows: inserted };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(asset => parameters[0].includes(asset.asset_id))) };
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      if (db.failLinkInsert) throw Error('Injected link insert failure');
      const inserted = [];
      for (const link of JSON.parse(parameters[0])) if (!state.links.some(old => old.asset_id === link.asset_id && old.catalogue_version_id === link.catalogue_version_id)) { state.links.push(link); inserted.push(link); }
      db.mutateAfterLinks?.(state);
      return { rows: clone(inserted) };
    }
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links']]) if (sql.startsWith(`select to_jsonb(scoped) as payload from ${table} scoped where`)) return { rows: clone(state[scope]).map(payload => ({ payload })) };
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}

async function freeze(db, environment = 'production') {
  const plan = planFor();
  plan.scopeCounts[environment].variants = db.state.variants.length;
  const snapshot = await readSnapshot(db, plan.rows, plan.scopeCounts[environment]);
  plan.beforeSnapshotHashes[environment] = snapshotHash(snapshot);
  assert.deepEqual(snapshotCounts(snapshot), plan.scopeCounts[environment]);
  return plan;
}
const receipt = { cohort_sha256: COHORT };
const approval = { approved: true, owner_statement: 'Release these exact Japanese fronts now.' };
const journal = () => createPublicationJournal(receipt);
const apply = (db, plan, environment, result = journal()) => writeMetadata(db, plan.rows, receipt, approval, environment, result, createSourceResolver(plan), null, null, createMetadataGuard(plan)).then(() => result);

test('protected manual exact-main gates reject wrong target, confirmation and overlapping private receipts', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_JAPANESE_ARTWORK_CONFIRMATION: 'PUBLISH JAPANESE ARTWORK', STACKR_JAPANESE_ARTWORK_PACKAGES: '/packages', STACKR_JAPANESE_ARTWORK_OUTPUT: '/public', STACKR_JAPANESE_ARTWORK_PRIVATE_OUTPUT: '/private', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const change of [{ GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' }, { STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { STACKR_JAPANESE_ARTWORK_CONFIRMATION: 'yes' }, { STACKR_JAPANESE_ARTWORK_PRIVATE_OUTPUT: '/public/private' }, { STACKR_JAPANESE_ARTWORK_OUTPUT: '/private/receipts' }, { SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }]) assert.throws(() => assertConfig({ ...env, ...change }));
});

test('all17 existing source fields, microseconds and source absence remain immutable', async () => {
  const plan = planFor();
  assert.equal(Object.keys(source).length, 17);
  assertSourcePolicies(plan, [clone(source)], 'production');
  for (const field of SOURCE_FIELDS) {
    const altered = clone(source); altered[field] = field === 'active' ? true : 'changed';
    assert.throws(() => assertSourcePolicies(plan, [altered], 'production'));
  }
  const date = clone(source); date.updated_at = new Date(date.updated_at);
  assert.throws(() => assertSourcePolicies(plan, [date], 'production'));
  assert.throws(() => snapshotHash(date));
  for (const sources of [[], [source, { ...source, id: id(99), code: 'alias' }]]) {
    const db = database(); db.state.sources = clone(sources);
    await assert.rejects(createSourceResolver(plan)(db, receipt, 'production'));
    assert.ok(!db.calls.some(sql => sql.startsWith('insert')));
  }
  const db = database();
  const map = await createSourceResolver(plan)(db, receipt, 'production');
  assert.equal(map.get('tcgcollector'), source.id);
  assert.ok(!db.calls.some(sql => sql.startsWith('insert')));
  assert.ok(db.calls.every(sql => sql.includes('to_jsonb(source)') && sql.includes('base_url ilike') && sql.includes('limit 3')));
});

test('only one explicit inactive temporary staging fixture can be planned', () => {
  validateSourcePlan(planFor());
  for (const mutate of [plan => { plan.newSources.production.push(clone(fixture)); }, plan => { plan.sourcePolicies.production[0].active = true; }, plan => { plan.newSources.staging[0].licence_status = 'approved'; }, plan => { plan.newSources.staging.push(clone(fixture)); }, plan => { plan.newSources.staging[0].extra = true; }, plan => { delete plan.sourcePolicies.production[0].terms_url; }]) {
    const plan = planFor(); mutate(plan); assert.throws(() => createSourceResolver(plan));
  }
});

test('production adds only printing-front assets and links, preserving names, variants, defaults, set mark and source', async () => {
  const db = database(), before = clone(db.state), plan = await freeze(db);
  const result = await apply(db, plan, 'production');
  assert.equal(result.assets.length, 2); assert.equal(result.links.length, 2);
  assert.equal(result.preservation.created_assets, 2); assert.equal(result.preservation.created_links, 2);
  assert.equal(result.preservation.created_provenance_sources.length, 0);
  assert.equal(result.preservation.source_policy_changes, 0);
  for (const scope of ['printings', 'variants', 'names', 'sets', 'sources']) assert.deepEqual(db.state[scope], before[scope]);
  assert.deepEqual(db.state.assets[0], before.assets[0]); assert.deepEqual(db.state.links[0], before.links[0]);
  for (const asset of db.state.assets.slice(1)) { assert.equal(asset.variant_id, null); assert.equal(asset.source_id, source.id); assert.equal(asset.publicly_servable, true); assert.equal(asset.recognition_reference_eligible, false); }
  for (const link of result.links) assert.equal(link.variant_id, null);
  assert.ok(!db.calls.some(sql => /^(update|delete|insert into ingest.sources)/u.test(sql)));
  await assert.rejects(apply(db, plan, 'production'), /before snapshot changed/u);
});

test('staging rehearsal creates one inactive fixture and rolls back every artwork and source write', async () => {
  const db = database('staging'), before = clone(db.state), plan = await freeze(db, 'staging');
  let result;
  await rehearse(db, async () => { result = await apply(db, plan, 'staging'); });
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(result.preservation.created_provenance_sources[0].code, 'tcgcollector');
  assert.equal(result.preservation.new_inactive_provenance_sources, 1);
  assert.deepEqual(db.state, before);
});

test('staging preserves deprecated table variants excluded from the exact published API bindings', async () => {
  const db = database('staging');
  db.state.variants.push({ id: id(777), printing_id: rows[0].printing_id, variant_code: 'first_edition', finish_code: 'first_edition', is_default: false, deprecated_at: '2026-10-22T01:00:00.123456+00:00', corrected_by_variant_id: id(11) });
  const before = clone(db.state), plan = await freeze(db, 'staging');
  assert.equal(plan.scopeCounts.staging.variants, 4);
  assert.equal(plan.bindingExpectations.staging.length, 3);
  let result;
  await rehearse(db, async () => { result = await apply(db, plan, 'staging'); });
  assert.equal(result.preservation.before_counts.variants, 4);
  assert.equal(result.preservation.after_counts.variants, 4);
  assert.deepEqual(db.state, before);
  const missingPrinting = clone(plan);
  missingPrinting.bindingExpectations.staging = missingPrinting.bindingExpectations.staging.filter(binding => binding.printing_id !== rows[0].printing_id);
  assert.throws(() => createMetadataGuard(missingPrinting), /cover exactly/u);
});

test('all existing metadata scopes reject drift both before insertion and after insertion with full rollback', async () => {
  const changes = [state => { state.printings[0].native_name = 'changed'; }, state => { state.variants[0].is_default = false; }, state => { state.variants[0].finish_code = 'first_edition'; }, state => { state.names[0].name = 'changed'; }, state => { state.sets[0].printed_total += 1; }, state => { state.assets[0].storage_key = 'changed'; }, state => { state.links[0].asset_type = 'changed'; }, state => { state.sources[0].updated_at = '2026-10-15T20:03:02.485065+00:00'; }];
  for (const mutate of changes) {
    const early = database(), earlyPlan = await freeze(early);
    mutate(early.state);
    await assert.rejects(apply(early, earlyPlan, 'production'), /before snapshot changed/u);
    assert.ok(!early.calls.some(sql => sql.startsWith('insert')));
    const late = database(), latePlan = await freeze(late), before = clone(late.state);
    late.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(late, () => apply(late, latePlan, 'production')));
    assert.deepEqual(late.state, before);
  }
});

test('binding SQL reads edition, finish and default from canonical variants when the API omits default', async () => {
  const db = database(), plan = await freeze(db);
  for (const card of db.cards) { delete card.is_default; card.variant_code = 'stale-api-variant'; card.finish_code = 'stale-api-finish'; }
  const guard = createMetadataGuard(plan);
  await guard.before(db, plan.rows, 'production');
  const query = db.calls.find(sql => sql.startsWith('select c.game_code'));
  const fields = query.slice('select '.length, query.indexOf(' from ')).split(',');
  assert.deepEqual(fields.map(field => field.slice(2)), BINDING_FIELDS);
  assert.equal(fields.filter(field => field.startsWith('c.')).length, 10);
  assert.equal(fields.filter(field => field.startsWith('v.')).length, 3);
  await assert.rejects(db.query('select game_code,is_default from api.catalogue_cards where printing_id=any($1::uuid[])', [rows.map(row => row.printing_id)]), /no is_default/u);
});

test('API native name, alias and membership changes fail independently of the table snapshot', async () => {
  assert.ok(BINDING_FIELDS.includes('is_default'));
  for (const change of [{ card_native_name: 'Different native name' }, { same_artwork_as_variant_id: id(13) }, { catalogue_version_id: id(888) }]) {
    const db = database(), plan = await freeze(db);
    Object.assign(db.cards[0], change);
    await assert.rejects(apply(db, plan, 'production'), /Current identity/u);
    assert.ok(!db.calls.some(sql => sql.startsWith('insert')));
  }
  const plan = planFor();
  assert.throws(() => assertBindings(plan, [...bindings('production'), bindings('production')[0]], 'production'));
});

test('new variant-bound assets, altered links, unplanned metadata rows and deletion roll back', async () => {
  for (const mutate of [state => { state.assets[1].variant_id = id(11); }, state => { state.links[1].printing_id = rows[1].printing_id; }, state => { state.names.push({ id: id(999), printing_id: rows[0].printing_id, name: 'Unexpected' }); }, state => { state.names.pop(); }, state => { state.sources.push({ ...source, id: id(999), code: 'alias' }); }]) {
    const db = database(), plan = await freeze(db), before = clone(db.state);
    db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => apply(db, plan, 'production')));
    assert.deepEqual(db.state, before);
  }
});

test('staging fixture defaults, concurrent insertion and reread mutation fail closed and roll back', async () => {
  for (const mutate of [row => { row.terms_url = 'https://changed.example'; }, row => { row.rate_limit_config = { limit: 1 }; }, row => { row.extra = 'unexpected'; }, row => { row.updated_at = '2026-10-23T01:00:00.123457+00:00'; }, row => { row.created_at = row.updated_at = '2026-10-23T01:00:00.123457+00:00'; }]) {
    const db = database('staging'), plan = await freeze(db, 'staging'), before = clone(db.state);
    db.mutateAfterSourceInsert = mutate;
    await assert.rejects(rehearse(db, () => apply(db, plan, 'staging')));
    assert.deepEqual(db.state, before);
  }
  const concurrent = database('staging'), plan = await freeze(concurrent, 'staging'), before = clone(concurrent.state);
  concurrent.concurrentSourceInsert = true;
  await assert.rejects(rehearse(concurrent, () => apply(concurrent, plan, 'staging')), /Concurrent/u);
  assert.deepEqual(concurrent.state, before);
});

test('source and link write failures preserve every previous row and leave no temporary fixture', async () => {
  for (const [environment, flag] of [['staging', 'failSourceInsert'], ['staging', 'failLinkInsert'], ['production', 'failLinkInsert']]) {
    const db = database(environment), plan = await freeze(db, environment), before = clone(db.state);
    db[flag] = true;
    await assert.rejects(rehearse(db, () => apply(db, plan, environment)), /Injected/u);
    assert.deepEqual(db.state, before);
  }
});

test('full JSON snapshots are bounded and timestamp microseconds are significant', async () => {
  const db = database(), plan = await freeze(db);
  const before = await readSnapshot(db, rows, plan.scopeCounts.production);
  assert.deepEqual(before, orderedSnapshot(before));
  const changed = clone(before); changed.find(row => row.scope === 'printings').payload.updated_at = '2026-10-22T01:00:00.123457+00:00';
  assert.notEqual(snapshotHash(before), snapshotHash(changed));
  db.state.assets.push(...Array.from({ length: 3 }, (_, index) => ({ ...source, id: id(700 + index), set_id: SET, printing_id: null, variant_id: null })));
  await assert.rejects(readSnapshot(db, rows, plan.scopeCounts.production), /sentinel overflow/u);
  const invalid = planFor(); delete invalid.beforeSnapshotHashes.production;
  assert.throws(() => createMetadataGuard(invalid));
  for (const mutate of [plan => { plan.scopeCounts.production.sources = 0; }, plan => { plan.rows[0].language_code = 'en'; }, plan => { plan.rows[0].variant_id = id(11); }]) {
    const altered = planFor(); mutate(altered); assert.throws(() => createMetadataGuard(altered));
  }
});

test('rollback receipt binds only newly created verified assets and generates no object, source, link or catalogue deletion', async () => {
  const db = database(), plan = await freeze(db), result = await apply(db, plan, 'production');
  Object.assign(result, { status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-23T01:00:00.000Z' });
  result.assets[1].created = false;
  result.preservation.created_assets = 1;
  const rollback = rollbackReceipt(result, plan, COHORT), sql = rollbackSql(rollback);
  assert.equal(rollback.assets.length, 1);
  assert.equal(rollback.assets[0].asset_id, assetId(rows[0]));
  assert.ok(sql.includes(COHORT) && sql.includes('a.variant_id IS NULL') && sql.includes('FOR UPDATE OF a') && sql.includes('UPDATE catalog.assets a SET publicly_servable=false'));
  assert.ok(!/DELETE|UPDATE ingest|UPDATE catalog\.card|UPDATE catalog\.catalogue_version_assets/iu.test(sql));
  assert.deepEqual(rollback.retained_inactive_provenance_sources, []);
  for (const mutate of [row => { row.status = 'commit_outcome_unknown'; }, row => { row.cohort_sha256 = 'b'.repeat(64); }, row => { row.assets[0].printing_id = id(999); }, row => { row.assets.push(clone(row.assets[0])); }, row => { row.preservation.created_provenance_sources.push({ code: 'tcgcollector' }); }, row => { row.ownership_changes = 1; }]) {
    const changed = clone(result); mutate(changed); assert.throws(() => rollbackReceipt(changed, plan, COHORT));
  }
  const malicious = clone(rollback); malicious.assets[0].asset_id += "';delete from catalog.assets;--";
  assert.throws(() => rollbackSql(malicious));
  assert.match(rollbackSql({ ...rollback, assets: [] }), /no rollback writes/u);
});
