import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertBindings, assertSourcePolicies, compareSnapshots, createMetadataGuard } from '../artwork-trainer-kit-push-20261013/metadata-guard.mjs';
import { assetId, writeMetadata, rehearse, bind, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
import { validateSourceRow, projectQueueControls, publicationBody } from './source-proof.mjs';

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

test('exact two source/subset/archive and finite approval are byte frozen', async () => {
  for (const [file, validate] of [['plan.json', bytes => validatePlan(bytes, table)], ['approval.json', validateApproval], ['saved-targets.json', validateSavedTargets], ['identity-table.json', bytes => validateIdentityTable(bytes, saved)]]) {
    const bytes = await readFile(new URL(`./${file}`, import.meta.url));
    validate(bytes); assert.throws(() => validate(Buffer.concat([bytes, Buffer.from('\n')])), /changed/);
  }
  assert.equal(rows.length, 2); assert.equal(indexObjects(rows).size, 8);
  assert.equal(plan.archive.id, 641804110); assert.equal(plan.archive.file_count, 12);
});

test('only051/052 are selected; five Trainers remain null-source holds and Shining holds stay outside', () => {
  assert.deepEqual(rows.map(row => row.collector_number), ['051', '052']);
  assert.equal(plan.delivery_scope.saved_batch_tasks, 7); assert.equal(plan.delivery_scope.eligible_fronts, 2);
  assert.deepEqual(plan.delivery_scope.excluded_aliases, ['053', '054', '055', '056', '057']);
  assert.ok(plan.delivery_scope.excluded.every(row => row.selectedSourceCardId === null && row.holds.length > 0));
  assert.deepEqual(plan.delivery_scope.outside_fixed_cohort[0].aliases, ['022', '023']);
  assert.equal(plan.delivery_scope.whole_batch_completion_asserted, false);
  for (const field of ['eligible_fronts', 'saved_batch_tasks', 'excluded_aliases', 'whole_batch_completion_asserted']) {
    const changed = clone(plan); changed.delivery_scope[field] = null;
    assert.throws(() => validateRows(changed, table), /scope/);
  }
});

function sourceFixture(row) {
  const body = row.evidence.source_body;
  const original = row.objects[0];
  const raw = {
    canonicalCollectorAlias: row.collector_number, printingId: row.printing_id, variantId: row.variant_ids[0],
    selectedSourceCardId: row.provider_id, sourceMetadataCapture: { sha256: row.evidence.source_metadata_sha256, sourceSignature: body.source_signature, sourceSignatureSha256: body.source_signature_sha256, sourceAttackArraySha256: body.source_attack_array_sha256 },
    original: { sha256: original.sha256, bytes: original.byte_size, width: original.width, height: original.height, mimeType: 'image/webp', format: 'WEBP', fullPILDecodePassed: true, fullSharpDecodePassed: true, sourceBytesUnchanged: true, generatedOrUpscaled: false, minimumDetailResolution: true, hd720x1008: false },
    actualPixelSignature: body.actual_pixel_signature, actualPixelSignatureSha256: body.actual_pixel_signature_sha256,
    pixelObservations: body.actual_pixel_observations, sourceVariantSupport: body.source_variant_support,
    providerMetadataDiscrepancies: body.provider_metadata_discrepancies,
    currentProductionBinding: plan.binding_expectations.production.find(card => card.printing_id === row.printing_id),
    currentNativeLabel: row.card_native_name, currentNativeLabelRetained: true,
    batchId: 'JP-CARDS-012', canonicalSetCode: 'neo3', canonicalLanguageCode: 'ja',
    exactCanonicalPokemonSourceMatch: true, quarantineComparisonOnly: false,
    eligibleSourceOriginalForIndependentReview: true, holds: [],
    vendorLicenceVerified: false, underlyingCopyrightLicenceVerified: false,
    physicalEditionVerified: false, physicalFinishVerified: false, sourceWideApproval: false,
  };
  const eligible = { printingId: row.printing_id, variantId: row.variant_ids[0], original: { sha256: original.sha256 }, sourceMetadataSha256: row.evidence.source_metadata_sha256, sourceSignatureSha256: body.source_signature_sha256, sourceAttackArraySha256: body.source_attack_array_sha256, actualPixelSignatureSha256: body.actual_pixel_signature_sha256 };
  const metadata = { sourceSignature: body.source_signature, sourceMetadata: { sha256: row.evidence.source_metadata_sha256, data: body.provider_metadata }, tcgMetadata: { data: body.tcgdex_metadata } };
  return { raw, eligible, metadata };
}

test('the separate actual signature schema and top-level JA controls are derived without invented artist fields', () => {
  assert.ok(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(plan)));
  for (const row of rows) {
    const body = row.evidence.source_body; const fixture = sourceFixture(row);
    validateSourceRow(fixture.raw, fixture.eligible, fixture.metadata);
    assert.ok('artist' in body.actual_pixel_signature); assert.ok(!('printedArtist' in body.actual_pixel_signature));
    assert.deepEqual(projectQueueControls(fixture.raw), body.queue_controls);
    assert.ok(body.provider_metadata.translation.en.abilities[0].text.length > 0);
    const privateBody = clone(body); privateBody.actual_pixel_observations.path = 'D:/private/original.webp';
    assert.deepEqual(publicationBody(privateBody), body);
    privateBody.unexpected_path = 'D:/unplanned-path'; assert.throws(() => publicationBody(privateBody), /Private local path/);
  }
});

test('original/source/form/body/signature drift and unbound aliases fail before preparation or publication', () => {
  for (const row of rows) {
    for (const mutate of [
      raw => { raw.original.sha256 = 'a'.repeat(64); },
      raw => { raw.sourceMetadataCapture.sha256 = 'a'.repeat(64); },
      raw => { raw.actualPixelSignature.nativeAbilityText = 'unverified body'; },
      raw => { raw.actualPixelSignature.nativeName = 'another form'; },
      raw => { raw.canonicalCollectorAlias = '053'; },
    ]) {
      const fixture = clone(sourceFixture(row)); mutate(fixture.raw);
      assert.throws(() => validateSourceRow(fixture.raw, fixture.eligible, fixture.metadata));
    }
    for (const mutate of [
      row => { row.objects[0].sha256 = 'a'.repeat(64); },
      row => { row.evidence.source_metadata_sha256 = 'a'.repeat(64); },
      row => { row.evidence.source_body.actual_pixel_signature.nativeAbilityText = 'unverified body'; },
      row => { row.evidence.source_body.provider_metadata.translation.en.abilities[0].text = 'rewritten'; },
      row => { row.evidence.source_body.provider_metadata_discrepancies = []; },
      row => { row.evidence.source_body.queue_controls.source_qa.original_sha256 = 'a'.repeat(64); },
      row => { row.card_native_name = 'changed'; },
      row => { row.collector_number = '053'; },
      row => { row.variant_ids = [rows.find(other => other.printing_id !== row.printing_id).variant_ids[0]]; },
    ]) mutateEvidence(row.collector_number, mutate);
  }
});

test('Porygon2 excludes Colorless and Blissey retains actual retreat2 versus reported1', () => {
  const porygon = rowFor(plan, '051').evidence.source_body;
  assert.match(porygon.actual_pixel_signature.nativeAbilityText, /（「無色」以外）/);
  assert.equal(porygon.actual_pixel_observations.nonColorlessRestrictionActuallyVisible, true);
  const blissey = rowFor(plan, '052').evidence.source_body;
  assert.equal(blissey.actual_pixel_signature.retreatSymbols, 2);
  assert.equal(blissey.source_signature.convertedRetreatCost, 1);
  assert.equal(blissey.tcgdex_metadata.retreat, 2);
  mutateEvidence('051', row => { row.evidence.source_body.actual_pixel_signature.nativeAbilityText = row.evidence.source_body.actual_pixel_signature.nativeAbilityText.replace('（「無色」以外）', ''); });
  mutateEvidence('052', row => { row.evidence.source_body.actual_pixel_signature.retreatSymbols = 1; });
});

test('both current holo singleton bindings, labels, physical limits and unenlarged objects are preserved', () => {
  for (const environment of ['production', 'staging']) {
    assert.ok(plan.binding_expectations[environment].every(card => card.finish_code === 'holo' && card.variant_code === 'holo'));
    bind(rows, plan.binding_expectations[environment], environment);
  }
  for (const field of ['variant_id', 'finish_code', 'variant_code', 'card_native_name', 'collector_number', 'language_code', 'catalogue_version_id', 'same_artwork_as_variant_id']) {
    const changed = clone(plan); changed.binding_expectations.staging[0][field] = 'changed';
    assert.throws(() => validateRows(changed, table));
  }
  for (const mutate of [row => { row.objects[0].width = 359; }, row => { row.objects[1].width = row.objects[0].width + 1; }, row => { row.evidence.physical_edition_verified = true; }, row => { row.evidence.source_body.actual_pixel_signature.editionOrMaterialCertified = true; }]) mutateEvidence('051', mutate);
});

test('inactive production source remains complete and only absent staging source becomes rollback fixture', () => {
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
  assert.equal(Object.values(initial).reduce((count, rows) => count + rows.length, 0), 14);
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
  assert.equal(Object.values(initial).reduce((count, rows) => count + rows.length, 0), 11);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_AWAKENING_FINAL2_CONFIRMATION: 'PUBLISH ARTWORK AWAKENING FINAL 2', STACKR_ARTWORK_AWAKENING_FINAL2_PACKAGES: '/packages', STACKR_ARTWORK_AWAKENING_FINAL2_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_AWAKENING_FINAL2_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_AWAKENING_FINAL2_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
