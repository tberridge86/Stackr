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
const rowFor = key => rows.find(row => `${row.set_code}/${row.collector_number}` === key);
function mutateEvidence(alias, mutate) {
  const changed = clone(plan), changedTable = clone(table), row = changed.rows.find(row => `${row.set_code}/${row.collector_number}` === alias);
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
const oldSource = oldSources.find(row => row.code === 'scrydex');
const baselineAssets = {
  "production": [
    {
      "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
      "asset_type": "set_logo"
    },
    {
      "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
      "asset_type": "set_logo"
    },
    {
      "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
      "asset_type": "set_logo"
    }
  ],
  "staging": [
    {
      "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
      "asset_type": "set_logo"
    }
  ]
};

test('exact64 plan approval identities archive and20LF files freeze',async()=>{for(const[file,verify]of[['plan.json',b=>validatePlan(b,table)],['approval.json',validateApproval],['saved-targets.json',validateSavedTargets],['identity-table.json',b=>validateIdentityTable(b,saved)]]){const b=await readFile(new URL('./'+file,import.meta.url));verify(b);assert.throws(()=>verify(Buffer.concat([b,Buffer.from('\n')])),/changed/);}assert.equal(rows.length,64);assert.equal(indexObjects(rows).size,256);assert.equal(ARCHIVE_ID,644510720);assert.equal(plan.archive.file_count,260);assert.ok(approval.scope.startsWith('Exactly64 accepted Rocket'));const files=(await readdir(new URL('./',import.meta.url),{withFileTypes:true})).filter(e=>e.isFile()).map(e=>new URL('./'+e.name,import.meta.url));files.push(new URL('../../.github/workflows/artwork-vintage-rocket-fronts-production.yml',import.meta.url));assert.equal(files.length,20);for(const f of files)assert.ok(!(await readFile(f)).includes(13));const d=await readFile(new URL('./freeze-inputs.json',import.meta.url));assert.ok((await readFile(new URL('./freeze-local.mjs',import.meta.url),'utf8')).includes('digest(descriptor) === '+"'"+digest(d)+"'"));});
test('exact53Pokemon8Trainer3Energy48normal16holo and whole062 excluded',()=>{assert.deepEqual(plan.source_counts,{pokellector:64});assert.deepEqual(plan.delivery_scope.by_batch,{'JP-CARDS-055':{verified:25,held:0},'JP-CARDS-056':{verified:25,held:0},'JP-CARDS-057':{verified:14,held:1}});assert.deepEqual(plan.delivery_scope.excluded_aliases,['062']);assert.ok(!rows.some(r=>r.collector_number==='062'));for(const[c,n]of Object.entries({Pokemon:53,Trainer:8,Energy:3}))assert.equal(rows.filter(r=>r.evidence.source_body.accepted_category===c).length,n);for(const env of['production','staging']){bind(rows,plan.binding_expectations[env],env);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='normal').length,48);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='holo').length,16);}});
test('photoHTML fullprivateTCGfile canonical and INLINE identity stay distinct',()=>{for(const r of rows){const b=r.evidence.source_body;validatePublishedWitness(b,r);assert.equal(b.photo_source_provider,'pokellector');assert.equal(b.semantic_metadata_provider,'tcgdex');assert.equal(b.semantic_metadata_is_photo_provenance,false);assert.notEqual(b.photo_source_raw_html_sha256,b.semantic_provider_full_captured_json_file_sha256);assert.notEqual(b.semantic_provider_full_captured_json_file_sha256,b.semantic_provider_full_captured_json_canonical_sha256);assert.equal(canonicalHash(b.provider_metadata_identity_projection),b.provider_metadata_identity_projection_sha256);assert.equal(canonicalHash(b.independent_selection),b.independent_selection_public_canonical_json_sha256);assert.equal(b.historical_association.selected_source_card_id,null);assert.equal(b.historical_association.preparation_approved,false);assert.deepEqual(publicationBody(b),b);}});
test('all11 nonPokemon complete native bodies keep provider omissions and noPokemonfields',()=>{for(const r of rows.filter(r=>r.evidence.source_body.accepted_category!=='Pokemon')){const b=r.evidence.source_body,a=b.actual_pixel_signature;assert.equal(a.printedNationalDex,null);assert.equal(a.printedNumberIsNationalDex,false);assert.equal(a.printedCollectorNumber,null);assert.equal(a.hp,null);assert.equal(a.stage,null);assert.equal(a.retreat,null);assert.equal(a.attacks.length,0);assert.equal(a.abilities.length,0);assert.ok(a.nativeRules.length>0);assert.equal(b.pixel_observations.canonicalSourceBodyAbsent,true);assert.equal(b.source_rules_agreement_certified,false);assert.equal(a.printedHeader,b.accepted_category==='Trainer'?'TRAINER':'ENERGY');}});
test('actual artists native Energyfineprint and accepted uncertain scene qualifications retained',()=>{assert.equal(rowFor('PMCG4/048').evidence.source_body.actual_pixel_signature.artist,'Shin-ichi Yoshida');assert.equal(rowFor('PMCG4/065').evidence.source_body.actual_pixel_signature.artist,'Takumi Akabane');assert.ok(rowFor('PMCG4/063').evidence.source_body.actual_pixel_signature.nativeGenericEnergyRule.includes('かわりにならない'));assert.ok(rowFor('PMCG4/064').evidence.source_body.actual_pixel_signature.nativeRules.includes('どく・ねむり・マヒ・こんらん'));assert.equal(rowFor('PMCG4/065').evidence.source_body.actual_pixel_signature.energyProvides.units,null);assert.ok(rowFor('PMCG4/054').evidence.source_body.actual_pixel_signature.artwork.includes('not independently certified'));});
test('joint body source artist Energyrestriction QAcontrols and object tampering reject',()=>{for(const[key,mutate]of[['PMCG4/048',r=>{r.evidence.source_body.actual_pixel_signature.artist='Ken Sugimori';}],['PMCG4/065',r=>{r.evidence.source_body.actual_pixel_signature.artist='Kent Kanetsuna';}],['PMCG4/063',r=>{r.evidence.source_body.actual_pixel_signature.nativeGenericEnergyRule=null;}],['PMCG4/064',r=>{r.evidence.source_body.actual_pixel_signature.nativeRules+='burned';}],['PMCG4/052',r=>{r.evidence.source_body.actual_pixel_signature.abilities=[];}],['PMCG4/001',r=>{r.evidence.source_body.photo_source_provider='tcgdex';}],['PMCG4/002',r=>{r.evidence.source_body.queue_controls.source_qa.actual_japanese_full_front_verified=false;}],['PMCG4/003',r=>{r.evidence.source_body.queue_controls.identity_controls.printed_national_dex=3;}],['PMCG4/004',r=>{r.evidence.source_body.vendor_licence_verified=true;}],['PMCG4/005',r=>{r.evidence.source_body.independent_selection.sourceImageUrl='wrong';}],['PMCG4/006',r=>{r.objects[0].sha256='a'.repeat(64);}],['PMCG4/007',r=>{r.objects[1].width=r.objects[0].width+1;}]])mutateEvidence(key,mutate);for(const field of['variant_id','finish_code','card_native_name','collector_number','catalogue_version_id']){const p=clone(plan);p.binding_expectations.production[0][field]='wrong';assert.throws(()=>validateRows(p,table));}});
test('zero newproduction sources both17fields and only stagedPoke fixture guarded',()=>{validateSourcePlan(plan);assert.deepEqual(plan.new_sources.production,[]);assert.deepEqual(plan.new_sources.staging.map(s=>s.code),['pokellector']);assertSourcePolicies(plan,clone(oldSources),'production',true);for(const original of oldSources)for(const field of Object.keys(original)){const a=clone(oldSources);a.find(x=>x.code===original.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,a,'production',true));}for(const mutate of[p=>p.new_sources.production=[clone(p.source_policies.production[0])],p=>p.source_policies.production[0].active=true,p=>p.new_sources.staging=[]]){const p=clone(plan);mutate(p);assert.throws(()=>validateSourcePlan(p));assert.throws(()=>createSourceResolver(p));}});
test('public projection strips only named private paths and rejects commercial or unknown private data',()=>{assert.deepEqual(publicProjection({path:'D:/private/file',sha256:'hash'}),{sha256:'hash'});for(const k of['pricing','prices','marketplaces','pop_reports'])assert.throws(()=>publicProjection({[k]:null}));assert.throws(()=>publicProjection({unexpected:'C:/private/file'}));});

function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: baselineAssets[environment].map((asset, index) => ({ ...asset, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, asset_id: `old-logo-${index}`, printing_id: null, variant_id: null, storage_key: `immutable/old-${index}.png` })),
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
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 264);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 392);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));assert.deepEqual(db.state.sources,initial.sources);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, 3), initial.assets);
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

test('the single staging Pokellector fixture and all eligible artwork changes are rolled back', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 258);
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
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_VINTAGE_ROCKET_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK VINTAGE ROCKET FRONTS', STACKR_ARTWORK_VINTAGE_ROCKET_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_VINTAGE_ROCKET_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_VINTAGE_ROCKET_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_VINTAGE_ROCKET_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});
