import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
import { projectQueueControls, publicationBody } from './source-proof.mjs';

const { plan, rows, approval, receipt, table, saved } = await loadFrozen();
const clone = value => structuredClone(value);
const journal = () => ({ assets: [], links: [], metadata_changes: 0 });
const rowFor = (value, alias) => value.rows.find(row => row.collector_number === alias);
function mutateEvidence(alias, mutate) {
  const changed = clone(plan);
  const changedTable = clone(table);
  const row = rowFor(changed, alias);
  mutate(row);
  const expected = changedTable.find(entry => entry.printing_id === row.printing_id);
  expected.body_sha256 = digest(Buffer.from(JSON.stringify(row.evidence.source_body)));
  expected.evidence_sha256 = digest(Buffer.from(JSON.stringify(row.evidence)));
  expected.original_sha256 = row.objects[0].sha256;
  assert.throws(() => validateRows(changed, changedTable));
}

test('finite source, subset, four-role archive and approval are byte frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes);
    assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, 48); assert.equal(indexObjects(rows).size, 192);
  assert.equal(plan.archive.id, 641737169); assert.equal(plan.archive.file_count, 196);
});

test('JA queue controls derive from actual proof and public evidence excludes workstation paths', () => {
  assert.ok(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(plan)));
  for (const row of rows) {
    const body = row.evidence.source_body;
    const raw = { pixelObservations: body.actual_pixel_observations, canonicalCollectorAlias: row.collector_number, currentNativeLabel: row.card_native_name, sourceMetadataHash: row.evidence.source_metadata_sha256, original: { sha256: row.objects[0].sha256 }, actualPixelSignatureSha256: body.actual_pixel_signature_sha256 };
    assert.deepEqual(projectQueueControls(raw), body.queue_controls);
  }
  const privateBody = clone(rowFor(plan, '034').evidence.source_body);
  privateBody.append_only_credit_clarification.recheckedView.path = 'D:/private-source-view.webp';
  assert.deepEqual(publicationBody(privateBody), rowFor(plan, '034').evidence.source_body);
  privateBody.unexpected_path = 'D:/unplanned-private-path';
  assert.throws(() => publicationBody(privateBody), /Private local path/);
});

test('two finish holds and seven outside tasks remain excluded from partial fixed50 publication', () => {
  assert.equal(plan.delivery_scope.saved_batch_tasks, 50);
  assert.equal(plan.delivery_scope.eligible_fronts, 48);
  assert.deepEqual(plan.delivery_scope.excluded_aliases, ['022', '023']);
  assert.equal(plan.delivery_scope.outside_fixed_cohort.length, 7);
  assert.equal(plan.delivery_scope.whole_batch_completion_asserted, false);
  assert.deepEqual(plan.delivery_scope.by_batch, { 'JP-CARDS-010': { verified: 23, held: 2 }, 'JP-CARDS-011': { verified: 25, held: 0 } });
  assert.ok(!rows.some(row => ['022', '023'].includes(row.collector_number)));
  for (const field of ['eligible_fronts', 'saved_batch_tasks', 'excluded_aliases', 'whole_batch_completion_asserted']) {
    const changed = clone(plan); changed.delivery_scope[field] = null;
    assert.throws(() => validateRows(changed, table), /scope/);
  }
});

test('all pinned source, original, actual body, queue controls and canonical bindings reject drift', () => {
  for (const alias of ['001', '011', '012', '014', '017', '021', '024', '026', '027', '030', '031', '032', '033', '034', '045', '048']) {
    for (const mutate of [
      row => { row.objects[0].sha256 = 'a'.repeat(64); },
      row => { row.evidence.source_metadata_sha256 = 'a'.repeat(64); },
      row => { row.evidence.source_body.actual_pixel_observations.bodyEffectFactsObserved = ['unverified body']; },
      row => { row.evidence.source_body.generic_other_rows_may_relax = true; },
      row => { row.evidence.source_body.queue_controls.source_qa.original_sha256 = 'a'.repeat(64); },
      row => { row.collector_number = '999'; },
      row => { row.card_native_name = 'changed'; },
      row => { row.variant_ids = [rows.find(other => other.printing_id !== row.printing_id).variant_ids[0]]; },
    ]) {
      mutateEvidence(alias, mutate);
    }
    if (rowFor(plan, alias).evidence.source_body.provider_metadata_discrepancies.length) mutateEvidence(alias, row => { row.evidence.source_body.provider_metadata_discrepancies = []; });
  }
  mutateEvidence('001', row => { row.evidence.source_body = clone(rowFor(plan, '048').evidence.source_body); });
});

test('actual retreat13, variable damage11 and comparison bodies retain exact pixel resolutions', () => {
  const conflicts = rows.flatMap(row => row.evidence.source_body.provider_metadata_discrepancies);
  assert.equal(conflicts.filter(item => item.field === 'retreat').length, 13);
  assert.equal(rows.filter(row => row.evidence.source_body.provider_metadata_discrepancies.some(item => item.field === 'attackDamage')).length, 11);
  assert.equal(conflicts.filter(item => item.field === 'attackDamage').length, 12);
  const hoOh = rowFor(plan, '011').evidence.source_body.actual_pixel_observations;
  assert.equal(hoOh.retreatSymbolsObserved, 2); assert.equal(hoOh.printedAttackNamesObserved.length, 3);
  assert.deepEqual(rowFor(plan, '012').evidence.source_body.actual_pixel_observations.attackDamageObserved, ['10×']);
  assert.equal(rowFor(plan, '014').evidence.source_body.actual_pixel_observations.retreatSymbolsObserved, 2);
  assert.match(rowFor(plan, '024').evidence.source_body.actual_pixel_observations.bodyEffectFactsObserved[1], /reduced by10/);
  assert.match(rowFor(plan, '048').evidence.source_body.actual_pixel_observations.bodyEffectFactsObserved[1], /for each damage counter/);
});

test('three Unown forms, Baby031 and exact attack/ability label exceptions cannot spread', () => {
  for (const [alias, form, ability] of [['030', 'K', 'KEEP'], ['032', 'B', 'BEAR'], ['033', 'Y', 'YIELD']]) {
    const pixels = rowFor(plan, alias).evidence.source_body.actual_pixel_observations;
    assert.equal(pixels.unownLetterObserved, form); assert.ok(pixels.abilityNamesObserved[0].startsWith(ability));
    mutateEvidence(alias, row => { row.evidence.source_body.actual_pixel_observations.unownLetterObserved = 'A'; });
  }
  const baby = rowFor(plan, '031').evidence.source_body;
  assert.equal(baby.actual_pixel_observations.actualBabyRuleBoxVisible, true);
  assert.equal(baby.actual_pixel_observations.babyEvolutionTextObserved, 'ルージュラへ進化');
  assert.deepEqual(baby.provider_metadata.rules, []);
  for (const [alias, names] of [['017', ['つきあげる', 'つのでいちげき']], ['027', ['ビリリパンチ', 'エレキテール']]]) {
    const body = rowFor(plan, alias).evidence.source_body;
    assert.deepEqual(body.actual_pixel_observations.printedAttackNamesObserved, names);
    assert.equal(body.provider_metadata.attacks[0].name, body.provider_metadata.attacks[1].name);
  }
  assert.deepEqual(rowFor(plan, '021').evidence.source_body.actual_pixel_observations.abilityNamesObserved, ['クリスタルボディ']);
  assert.deepEqual(rowFor(plan, '026').evidence.source_body.actual_pixel_observations.abilityNamesObserved, ['せんすい']);
  mutateEvidence('031', row => { row.evidence.source_body.actual_pixel_observations.observedBabyRuleText = null; });
});

test('qualified null Ho-oh artist and complete Starmie/Magneton credits stay distinct from provider labels', () => {
  const body = rowFor(plan, '011').evidence.source_body;
  assert.equal(body.actual_pixel_observations.artistObserved, null);
  assert.equal(body.actual_pixel_observations.artistReadCertain, false);
  assert.equal(body.source_signature.artist, 'Kimiya Masago');
  assert.equal(body.append_only_credit_clarification.printedArtistText, null);
  assert.equal(rowFor(plan, '034').evidence.source_body.actual_pixel_observations.artistObserved, 'Keita Komatsuya / CR CG gangs');
  assert.equal(rowFor(plan, '045').evidence.source_body.actual_pixel_observations.artistObserved, '"Big Mama" Tagawa / CR CG gangs');
  for (const alias of ['011', '034', '045']) mutateEvidence(alias, row => { row.evidence.source_body.actual_pixel_observations.artistObserved = row.evidence.source_body.source_signature.artist; });
});

test('all33 normal/15 holo current singleton tuples and canonical labels remain unchanged', () => {
  for (const environment of ['production', 'staging']) {
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'normal').length, 33);
    assert.equal(plan.binding_expectations[environment].filter(card => card.finish_code === 'holo').length, 15);
    bind(rows, plan.binding_expectations[environment], environment);
  }
  for (const field of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id', 'same_artwork_as_variant_id']) {
    const changed = clone(plan); changed.binding_expectations.staging[0][field] = 'changed';
    assert.throws(() => validateRows(changed, table));
  }
  for (const mutate of [row => { row.objects[0].width = 359; }, row => { row.objects[1].width = row.objects[0].width + 1; }, row => { row.evidence.physical_edition_verified = true; }, row => { row.evidence.source_body.actual_pixel_observations.copyrightYearInferred = true; }]) mutateEvidence('001', mutate);
});

test('inactive production source is preserved and only absent staging source is a rollback fixture', () => {
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
    links: environment === 'production' ? ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'].map((asset_id, index) => ({ asset_id, catalogue_version_id: PRODUCTION_JA, language_code: 'ja', asset_type: index === 0 ? 'set_logo' : 'set_symbol', set_id: rows[0].set_id, printing_id: null, variant_id: null })) : [],
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
  assert.equal(Object.values(initial).reduce((count, rows) => count + rows.length, 0), 198);
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS);
  assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.before_counts.names, FRONTS * 2);
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
  assert.equal(Object.values(initial).reduce((count, rows) => count + rows.length, 0), 195);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_AWAKENING_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK AWAKENING FRONTS', STACKR_ARTWORK_AWAKENING_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_AWAKENING_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_AWAKENING_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_AWAKENING_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
