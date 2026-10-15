import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { digest } from '../queue1-publish-20260927/publish.mjs';
import { loadFrozen, validatePlan, validateApproval, validateRows, validateSourcePlan, validateIdentityTable, validateSavedTargets, indexObjects, FRONTS, COHORT_SHA, PRODUCTION_JA, ARCHIVE_ID } from './frozen.mjs';
import { assertConfig, createSourceResolver, rollbackReceipt, rollbackSql } from './publish.mjs';
import { assertSourcePolicies, compareSnapshots, createMetadataGuard, readSnapshot } from './metadata-guard.mjs';
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

const oldSources = [
  {
    "id": "9aacaaee-8915-42aa-9e91-fceaa8422d03",
    "code": "pokellector",
    "active": false,
    "base_url": "https://jp.pokellector.com",
    "terms_url": null,
    "created_at": "2026-10-15T16:04:18.931823+00:00",
    "updated_at": "2026-10-15T16:04:18.931823+00:00",
    "source_type": "image",
    "display_name": "Pokellector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "cbcafdd8-f3df-4543-b4e3-b5e8fc6847ab",
    "code": "scrydex",
    "active": false,
    "base_url": "https://scrydex.com",
    "terms_url": null,
    "created_at": "2026-09-27T14:42:49.489402+00:00",
    "updated_at": "2026-09-27T14:42:49.489402+00:00",
    "source_type": "image",
    "display_name": "Scrydex",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  }
];
const oldSource=oldSources.find(row=>row.code==='scrydex');

test('exact21 plan/approval/saved/table/archive bytes freeze and all20 text files equal committed LF', async () => {
  for(const [file,verify] of [['plan.json',b=>validatePlan(b,table)],['approval.json',validateApproval],['saved-targets.json',validateSavedTargets],['identity-table.json',b=>validateIdentityTable(b,saved)]]){const b=await readFile(new URL(`./${file}`,import.meta.url));verify(b);assert.throws(()=>verify(Buffer.concat([b,Buffer.from('\n')])),/changed/);}
  assert.equal(rows.length,21);assert.equal(indexObjects(rows).size,84);assert.ok(ARCHIVE_ID>0);assert.equal(plan.archive.file_count,88);
  const files=(await readdir(new URL('./',import.meta.url),{withFileTypes:true})).filter(e=>e.isFile()).map(e=>new URL(`./${e.name}`,import.meta.url));files.push(new URL('../../.github/workflows/artwork-neo1-final-fronts-production.yml',import.meta.url));assert.equal(files.length,20);
  for(const file of files){const b=await readFile(file);assert.ok(!b.includes(13),file.pathname);assert.deepEqual(b,Buffer.from(b.toString('utf8').replace(/\r\n?/gu,'\n')));}
  const descriptor=await readFile(new URL('./freeze-inputs.json',import.meta.url));assert.ok((await readFile(new URL('./freeze-local.mjs',import.meta.url),'utf8')).includes(`digest(descriptor) === '${digest(descriptor)}'`));
});
test('exact JP00621 current tuples retain18Trainer3Energy/20normal1holo095 and zero finite holds',()=>{
  assert.deepEqual(plan.source_counts,{scrydex:21});assert.deepEqual(plan.delivery_scope.by_batch,{'JP-CARDS-006':{verified:21,held:0}});assert.deepEqual(plan.delivery_scope.excluded,[]);
  assert.equal(rows.filter(r=>r.evidence.source_body.accepted_category==='Trainer').length,18);assert.equal(rows.filter(r=>r.evidence.source_body.accepted_category==='Energy').length,3);
  for(const env of ['production','staging']){assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='normal').length,20);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='holo').length,1);bind(rows,plan.binding_expectations[env],env);}
  assert.equal(plan.binding_expectations.production.find(c=>c.collector_number==='095').finish_code,'holo');
});
test('rawHTML/private parsedJSON bytes/canonicalJSON/safe identity/privatepeer/publicpeer hashes remain distinct',()=>{
  for(const row of rows){const b=row.evidence.source_body;validatePublishedWitness(b,row);assert.equal(canonicalHash(b.actual_pixel_signature),b.actual_pixel_signature_sha256);assert.equal(canonicalHash(b.provider_metadata_identity_projection),b.provider_metadata_identity_projection_sha256);assert.notEqual(b.provider_metadata_raw_html_sha256,b.provider_metadata_full_captured_json_file_sha256);assert.notEqual(b.provider_metadata_full_captured_json_canonical_sha256,b.provider_metadata_full_captured_json_file_sha256);assert.equal(b.historical_standalone_captured_json_file_sha256,null);assert.equal(b.historical_association.selected_source_card_id,null);assert.equal(b.historical_association.preparation_approved,false);assert.equal(b.historical_association.publication_approved,false);assert.equal(canonicalHash(b.independent_selection),b.independent_selection_public_canonical_json_sha256);assert.notEqual(b.independent_selection_raw_canonical_json_sha256,b.independent_selection_public_canonical_json_sha256);assert.deepEqual(publicationBody(b),b);}
});
test('positive number-free Trainer/Energy witnesses retain081uncertaincredit/077unguessedscene/087max2/092Trainer',()=>{
  for(const row of rows){const a=row.evidence.source_body.actual_pixel_signature;for(const field of ['printedCollectorNumber','printedNationalDex','nationalDex','hp','pokemonStage','retreatCost'])assert.equal(a[field],null);assert.deepEqual(a.orderedAttacks,[]);assert.equal(a.rarityMark,null);assert.equal(a.rarityReadCertain,false);}
  const a=rowFor('081').evidence.source_body.actual_pixel_signature;assert.equal(a.artist,null);assert.equal(a.artistReadCertain,false);assert.ok(a.artistVisibleCreditFragments.includes('/CR CG gangs'));
  assert.ok(rowFor('077').evidence.source_body.pixel_observations.artworkDiscriminator.includes('Species/human identity not certified'));
  const e=rowFor('087').evidence.source_body.actual_pixel_signature.nativeRulesText;assert.ok(e.includes('最大2枚'));assert.ok(!e.includes('見せ'));
  assert.equal(rowFor('092').evidence.source_body.actual_pixel_signature.printedHeader,'TRAINER');assert.ok(rowFor('092').evidence.source_body.source_signature.supertype.includes('エネルギー'));
});
test('wholeTool/Stadium common clauses and all three SpecialEnergy fineprint blocks stay positive and separate',()=>{
  for(const row of rows){const a=row.evidence.source_body.actual_pixel_signature;if(a.printedSubtype==='ポケモンのどうぐ')assert.equal(a.toolCommonClausePresent,true);if(a.printedSubtype==='スタジアムカード')assert.equal(a.stadiumCommonClausePresent,true);}
  for(const [alias,type]of[['094','Darkness'],['095','Metal'],['096','Colorless']]){const a=rowFor(alias).evidence.source_body.actual_pixel_signature;assert.equal(a.printedHeader,'ENERGY');assert.equal(a.nativeRules.length,3);assert.deepEqual(a.energyProvided,{type,units:1});}
});
test('joint source/body/artist/form/wording/rarity/reference/privatehash/currenttuple/original changes reject',()=>{
  for(const[alias,mutate]of[
    ['081',r=>{r.evidence.source_body.actual_pixel_signature.artist='Yousuke Hirata';}],['077',r=>{r.evidence.source_body.pixel_observations.artworkDiscriminator='Named human/species';}],['087',r=>{r.evidence.source_body.actual_pixel_signature.nativeRulesText='Choose3 and reveal';}],['092',r=>{r.evidence.source_body.actual_pixel_signature.printedHeader='ENERGY';}],['079',r=>{r.evidence.source_body.actual_pixel_signature.nativeRules.shift();}],['085',r=>{r.evidence.source_body.actual_pixel_signature.stadiumCommonClausePresent=false;}],['094',r=>{r.evidence.source_body.actual_pixel_signature.nativeRules.pop();}],['095',r=>{r.evidence.source_body.actual_pixel_signature.energyProvided.type='Darkness';}],['096',r=>{r.evidence.source_body.actual_pixel_signature.energyProvided.units=2;}],['076',r=>{r.evidence.source_body.provider_metadata_full_captured_json_file_sha256=r.evidence.source_body.provider_metadata_raw_html_sha256;}],['078',r=>{r.evidence.source_body.provider_metadata_identity_projection.rules=[];}],['080',r=>{r.evidence.source_body.actual_pixel_signature.rarityMark='●';}],['082',r=>{r.evidence.source_body.actual_pixel_signature.nationalDex=82;}],['083',r=>{r.objects[0].sha256='a'.repeat(64);}],['084',r=>{r.objects[1].width=r.objects[0].width+1;}],['088',r=>{r.evidence.source_body.independent_selection.referenceEvidence.literalImageUrl='https://example.invalid/wrong.png';}],
  ])mutateEvidence(alias,mutate);
  for(const field of ['variant_id','finish_code','card_native_name','collector_number','catalogue_version_id']){const p=clone(plan);p.binding_expectations.production[0][field]='wrong';assert.throws(()=>validateRows(p,table));}
});
test('zero newproduction sources; both17-field existing policies and only stagingScrydex fixture are guarded',()=>{
  validateSourcePlan(plan);assert.deepEqual(plan.new_sources.production,[]);assert.deepEqual(plan.new_sources.staging.map(s=>s.code),['scrydex']);assertSourcePolicies(plan,clone(oldSources),'production',true);
  for(const field of Object.keys(oldSource)){const changed=clone(oldSources);changed.find(s=>s.code==='scrydex')[field]='changed';assert.throws(()=>assertSourcePolicies(plan,changed,'production',true));}
  const poke=oldSources.find(s=>s.code==='pokellector');for(const field of Object.keys(poke)){const changed=clone(oldSources);changed.find(s=>s.code==='pokellector')[field]='changed';assert.throws(()=>assertSourcePolicies(plan,changed,'production',true));}
  for(const mutate of[p=>{p.new_sources.production=[clone(p.source_policies.production[0])];},p=>{p.source_policies.production[0].active=true;},p=>{p.new_sources.staging=[];}]){const p=clone(plan);mutate(p);assert.throws(()=>validateSourcePlan(p));assert.throws(()=>createSourceResolver(p));}
});
test('public projection strips only named privatepaths and rejects commercial or unexpected privatepayload',()=>{
  assert.deepEqual(publicProjection({path:'D:/private/file',sha256:'hash',file:'source-batches/retained.json'}),{sha256:'hash',file:'source-batches/retained.json'});
  for(const key of ['prices','pricing','marketplaces','pop_reports','privateFullNativeCapturedMetadata'])assert.throws(()=>publicationBody({[key]:null}));assert.throws(()=>publicProjection({unexpected:'D:/private/file'}));
});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: [...new Set(rows.map(row => row.set_id))].flatMap((set_id, index) => ['set_logo', 'set_symbol'].map((asset_type, offset) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index * 2 + offset).padStart(12, '0')}`, asset_id: `old-${index}-${asset_type}`, asset_type, printing_id: null, variant_id: null, set_id, storage_key: `immutable/old-${index}-${asset_type}.png` }))),
    links: Array.from({ length: environment === 'production' ? 2 : 0 }, (_, index) => ({ asset_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index % 4).padStart(12, '0')}`, catalogue_version_id: index < 2 ? (environment === 'production' ? PRODUCTION_JA : STAGE_JA) : `historical-version-${index}`, language_code: 'ja', asset_type: index % 2 ? 'set_symbol' : 'set_logo', set_id: rows[index % rows.length].set_id, printing_id: null, variant_id: null })),
    sources: environment === 'production' ? clone(oldSources) : [],
  };
  const calls = [];
  let saved, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select to_jsonb(source) as payload from ingest.sources')) return { rows: state.sources.map(source => ({ payload: clone(source) })) };
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
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select * from ${table} where`)) {
      const result = clone(state[scope]);
      // Model pg's direct-column timestamp parsing so a second unsafe source
      // reader cannot pass only because the fixture stored JSON strings.
      if (scope === 'sources') for (const source of result) for (const key of ['created_at', 'updated_at', 'deprecated_at', 'source_updated_at']) if (source[key]) source[key] = new Date(source[key]);
      return { rows: result };
    }
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}

test('full source JSON keeps timestamp microseconds and rejects even a one-microsecond source change', async () => {
  const db = database();
  const directColumnDriverValue = { ...clone(oldSource), created_at: new Date(oldSource.created_at), updated_at: new Date(oldSource.updated_at) };
  assert.notEqual(canonicalHash(directColumnDriverValue), canonicalHash(oldSource));
  const snapshot = await readSnapshot(db, rows, plan.scope_counts.production);
  const source = snapshot.find(row => row.scope === 'sources' && row.payload.code === 'scrydex').payload;
  assert.deepEqual(source, oldSource);
  assert.equal(source.created_at, '2026-09-27T14:42:49.489402+00:00');
  assertSourcePolicies(plan, clone(oldSources), 'production');
  const changed = clone(source); changed.created_at = '2026-09-27T14:42:49.489403+00:00';
  assert.throws(() => assertSourcePolicies(plan, oldSources.map(row=>row.code==='scrydex'?changed:clone(row)), 'production'), /Full17-field/);
});

test('source resolver uses the same microsecond-preserving JSON reader as snapshots', async () => {
  const db = database();
  const result = await createSourceResolver(plan)(db, receipt, 'production');
  assert.equal(result.get('scrydex'), oldSource.id);
  assert.equal(result.size, 2);
  assert.ok(!db.calls.some(sql => sql.startsWith('select * from ingest.sources')));
  const changed = database(); changed.state.sources[0].updated_at = '2026-09-27T14:42:49.489403+00:00';
  await assert.rejects(createSourceResolver(plan)(changed, receipt, 'production'), /Full17-field/);
});

test('publication inserts only the eligible fronts/links and no provenance source; every existing scoped row survives; rerun is empty', async () => {
  const db = database(); const initial = clone(db.state); const guard = createMetadataGuard(plan); const first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS);
  assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.before_counts.names, FRONTS * 2);
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 91);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 133);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));assert.deepEqual(db.state.sources,initial.sources);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, 2), initial.assets);
  assert.deepEqual(db.state.links.slice(0, initial.links.length), initial.links);
  const second = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', second, createSourceResolver(plan), null, null, guard);
  assert.equal(second.assets.filter(asset => asset.created).length, 0);
  assert.equal(second.links.filter(link => link.created).length, 0);
  assert.equal(second.preservation.before_sha256, second.preservation.after_sha256);
});

test('identity, old logo/symbol and links, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.assets[1].storage_key = 'changed-symbol'; }, s => { s.links[1].asset_type = 'changed-symbol-link'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources[0].robots_policy = 'changed'; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
    const db = database(); const initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))), /scoped row changed|counts changed|source insertion|source count|source policy changed|metadata insertion|existing provenance changed/);
    assert.deepEqual(db.state, initial);
    assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('the single staging Scrydex fixture and all eligible artwork changes are rolled back', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 87);
  assert.equal(result.assets.length, FRONTS);
  assert.deepEqual(db.state, initial);
});

test('reused preservation comparison rejects unjournalled new assets or unplanned production source insertion', () => {
  const before = [oldSource].map((source, i) => ({ scope: 'sources', identity: String(i), payload: source }));
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'assets', identity: 'unlisted', payload: {} }], journal(), plan, 'production'), /journal and new rows differ/);
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'sources', identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'), /source insertion/);
});

test('rollback binds only successful new artwork IDs and preserves objects, links and source policies', () => {
  const success = { ...journal(), status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-13', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', printing_id: rows[1].printing_id, created: false }] };
  const rollback = rollbackReceipt(success, plan);
  assert.equal(rollback.assets.length, 1);
  assert.deepEqual(rollback.retained_inactive_provenance_sources, []);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_NEO1_FINAL_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK NEO1 FINAL FRONTS', STACKR_ARTWORK_NEO1_FINAL_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_NEO1_FINAL_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_NEO1_FINAL_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_NEO1_FINAL_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
