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
    "id": "a6215bb2-738a-4fb5-ace2-18baf3adfe0c",
    "code": "tcgcollector",
    "active": false,
    "base_url": "https://www.tcgcollector.com",
    "terms_url": null,
    "created_at": "2026-10-15T20:03:02.485064+00:00",
    "updated_at": "2026-10-15T20:03:02.485064+00:00",
    "source_type": "image",
    "display_name": "TCGCollector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
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
const baselineAssets = {
  "production": [
    {
      "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
      "asset_type": "set_logo"
    }
  ],
  "staging": [
    {
      "set_id": "40cb9e83-3e60-4966-8d2d-4edb02bf1ac7",
      "asset_type": "set_logo"
    }
  ]
};

test('exact8 immutable plan, approval, saved targets and twenty LF files reject byte drift',async()=>{
 for(const[file,verify]of[['plan.json',b=>validatePlan(b,table)],['approval.json',validateApproval],['saved-targets.json',validateSavedTargets],['identity-table.json',b=>validateIdentityTable(b,saved)]]){const bytes=await readFile(new URL(`./${file}`,import.meta.url));verify(bytes);assert.throws(()=>verify(Buffer.concat([bytes,Buffer.from('\n')])));}
 assert.equal(rows.length,8);assert.equal(indexObjects(rows).size,32);assert.equal(plan.archive.file_count,36);assert.equal(ARCHIVE_ID,645030064);
 const files=(await readdir(new URL('./',import.meta.url),{withFileTypes:true})).filter(e=>e.isFile()).map(e=>new URL(`./${e.name}`,import.meta.url));files.push(new URL('../../.github/workflows/artwork-mc-basic-energy-fronts-push-20261015.yml',import.meta.url));assert.equal(files.length,20);for(const file of files)assert.ok(!(await readFile(file)).includes(13),'Working bytes must equal committed LF bytes');
 const descriptor=await readFile(new URL('./freeze-inputs.json',import.meta.url));assert.ok((await readFile(new URL('./freeze-local.mjs',import.meta.url),'utf8')).includes(`digest(descriptor) === '${digest(descriptor)}'`));
});
test('only eight Japanese MC normal singletons with actual footer codes are allowed',()=>{
 assert.deepEqual(plan.source_counts,{tcgcollector:8});assert.deepEqual(rows.map(r=>r.collector_number).sort(),['DAR','FIG','FIR','GRA','LIG','MET','PSY','WAT']);assert.deepEqual(plan.delivery_scope.by_batch,{'JP-CARDS-002':{verified:8,held:0}});
 for(const env of ['production','staging']){bind(rows,plan.binding_expectations[env],env);assert.equal(plan.binding_expectations[env].filter(c=>c.finish_code==='normal').length,8);}
 for(const row of rows){const a=row.evidence.source_body.actual_pixel_signature;assert.equal(a.printedSetCode,'MC');assert.equal(a.printedFooterReference,row.collector_number);assert.equal(a.canonicalAliasIsInternalOnly,false);assert.equal(a.printedNationalDex,null);assert.equal(a.printedNumericCollectorNumber,null);assert.equal(a.printedTitleUsesTypeGlyphRatherThanWrittenKanji,true);assert.equal(a.titleSemanticNameIsVerbatimPrintedKanji,false);}
});
test('literal TCGCollector photo hashes and safe projections remain separate from private full HTML',()=>{
 for(const row of rows){const b=row.evidence.source_body;assert.equal(row.source_code,'tcgcollector');assert.equal(row.provider_id,'tcgcollector-image-url-sha256:'+digest(Buffer.from(row.image_url)));assert.equal(b.photo_source_identifier,row.provider_id);assert.equal(b.semantic_metadata_provider,null);assert.equal(b.tcgdex_metadata_used,false);assert.equal(canonicalHash(b.photo_identity_projection),b.photo_identity_projection_sha256);assert.equal(b.photo_identity_projection.sourceRawHtml,undefined);assert.equal(b.photo_identity_projection.sourceRawHtmlSha256,row.evidence.source_metadata_sha256);validatePublishedWitness(b,row);}
});
test('fresh final authority satisfies the immutable private archives historical false gate separately',()=>{
 assert.equal(plan.publication_conditions_satisfied,true);assert.equal(plan.maximum_new_production_sources,0);assert.equal(plan.prior_verified_production_run,38798480441);assert.equal(plan.publication_supplement_sha256,'597c96b61f46d45dcefacde19856c5659c65465dcad1b2b0b59a075e2ccef46a');
 for(const row of rows){const b=row.evidence.source_body;assert.equal(b.publication_gate.production_ready,false);assert.equal(b.publication_gate.fresh_checkpoint_bound_by_this_private_package,false);assert.equal(b.historical_association.selected_source_card_id,null);assert.equal(b.historical_association.source_only_preparation_approved,false);assert.equal(b.independent_coverage.independentDirectWholeFrontView,true);assert.equal(row.objects[0].width,868);assert.equal(row.objects[0].height,1212);assert.equal(row.objects[0].mime_type,'image/webp');assert.ok(row.objects.slice(1).every(o=>o.width<=868&&o.height<=1212));}
 for(const change of[p=>{p.publication_conditions_satisfied=false;},p=>{p.publication_supplement_sha256='a'.repeat(64);},p=>{p.source_policy_checkpoint_sha256='a'.repeat(64);},p=>{p.maximum_new_production_sources=1;},p=>{p.prior_verified_production_run=0;}]){const copy=clone(plan);change(copy);assert.throws(()=>validateSourcePlan(copy));}
});
test('joint body, footer, glyph, byte, finish and environment tampering cannot rebind authority',()=>{
 for(const mutate of[r=>{r.evidence.source_body.actual_pixel_signature.printedNationalDex=1;},r=>{r.evidence.source_body.actual_pixel_signature.hp=100;},r=>{r.evidence.source_body.actual_pixel_signature.printedHeaderLeft='TRAINER';},r=>{r.evidence.source_body.actual_pixel_signature.printedFooterReference='FIR';},r=>{r.evidence.source_body.actual_pixel_signature.titleSemanticNameIsVerbatimPrintedKanji=true;},r=>{r.evidence.source_body.actual_pixel_signature.nativeRules='borrowed';},r=>{r.evidence.source_body.publication_gate.production_ready=true;},r=>{r.source_code='pokellector';},r=>{r.objects[0].sha256='a'.repeat(64);},r=>{r.objects[0].mime_type='image/png';},r=>{r.objects[0].width=570;},r=>{r.objects[1].width=9999;}])mutateEvidence('MC/GRA',mutate);
 for(const field of ['variant_id','finish_code','card_native_name','collector_number','catalogue_version_id']){const copy=clone(plan);copy.binding_expectations.production[0][field]='wrong';assert.throws(()=>validateRows(copy,table));}
});
test('all three existing full17 sources and original finite3 policy must remain unchanged',()=>{
 validateSourcePlan(plan);assert.deepEqual(plan.new_sources.production,[]);assert.deepEqual(plan.new_sources.staging.map(s=>s.code),['tcgcollector']);assert.equal(canonicalHash(plan.new_sources.staging[0]),'207957571711627d17ab7e1ed0ef77f6635426ee9a5972d47d316e3fcba9bd1e');assertSourcePolicies(plan,clone(oldSources),'production',false);
 for(const original of oldSources)for(const field of Object.keys(original)){const copy=clone(oldSources);copy.find(s=>s.code===original.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,copy,'production',false));}
 for(const mutate of[p=>{p.source_policies.production[0].active=true;},p=>{p.new_sources.production=[clone(p.new_sources.staging[0])];},p=>{p.new_sources.staging[0].internal_notes+=' finite8';},p=>{p.new_sources.staging.push(clone(p.source_policies.production[0]));},p=>{p.new_sources.staging=[];}]){const copy=clone(plan);mutate(copy);assert.throws(()=>createSourceResolver(copy));}
});
test('public source projections reject private paths and commercial captures',()=>{
 for(const key of ['pricing','prices','marketplaces','pop_reports','privateDecodedMetadata'])assert.throws(()=>publicProjection({[key]:null}));assert.throws(()=>publicProjection({unexpected:'C:/private/file'}));for(const row of rows)assert.deepEqual(publicationBody(row.evidence.source_body),row.evidence.source_body);
});

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
      if (db.failSourceInsert) throw Error('Injected source insert failure');
      const source = { ...Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, index) => [key, parameters[index]])), id:'cccccccc-cccc-4ccc-8ccc-000000000001', terms_url:null, robots_policy:null, rate_limit_config:{}, source_updated_at:null, deprecated_at:null, deprecated_reason:null, created_at:'2026-10-15T19:45:00.123456+00:00', updated_at:'2026-10-15T19:45:00.123456+00:00' };
      if (db.concurrentSourceOnInsert) { state.sources.push(source); return {rows:[]}; }
      if (state.sources.some(item=>item.code===source.code)) return {rows:[]};
      state.sources.push(source);const returned=clone(source);db.mutateAfterSourceInsert?.(source);return {rows:[{payload:returned}]};
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
      if (db.failLinkInsert) throw Error('Injected link write failure');
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
  assert.equal(result.size, 3);
  assert.ok(!db.calls.some(sql => sql.startsWith('select * from ingest.sources')));
  assert.ok(db.calls.filter(sql=>sql.startsWith('select to_jsonb(source)')).every(sql=>sql.includes('base_url ilike any($2::text[])')&&sql.includes('limit 4')));
  const changed = database(); changed.state.sources[0].updated_at = '2026-09-27T14:42:49.489403+00:00';
  await assert.rejects(createSourceResolver(plan)(changed, receipt, 'production'), /Full17-field/);
});

test('production adds8assets8links with no source writes, preserves39oldrows and reruns empty', async () => {
  const db = database(); const initial = clone(db.state); const guard = createMetadataGuard(plan); const first = journal();
  await writeMetadata(db, rows, receipt, approval, 'production', first, createSourceResolver(plan), null, null, guard);
  assert.equal(first.assets.filter(asset => asset.created).length, FRONTS);
  assert.equal(first.links.filter(link => link.created).length, FRONTS);
  assert.equal(first.preservation.before_counts.names, FRONTS * 2);
  assert.equal(Object.values(first.preservation.before_counts).reduce((a, b) => a + b, 0), 39);
  assert.equal(Object.values(first.preservation.after_counts).reduce((a, b) => a + b, 0), 55);
  assert.equal(first.preservation.new_inactive_provenance_sources, 0);
  assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));assert.deepEqual(db.state.sources,initial.sources);assert.deepEqual(first.preservation.created_provenance_sources,[]);
  for (const scope of ['printings', 'variants', 'names', 'sets']) assert.deepEqual(db.state[scope], initial[scope]);
  assert.deepEqual(db.state.assets.slice(0, initial.assets.length), initial.assets);
  assert.deepEqual(db.state.links.slice(0, initial.links.length), initial.links);
  const second=journal();await writeMetadata(db,rows,receipt,approval,'production',second,createSourceResolver(plan),null,null,guard);assert.equal(second.assets.filter(a=>a.created).length,0);assert.equal(second.links.filter(a=>a.created).length,0);assert.equal(second.preservation.before_sha256,second.preservation.after_sha256);

});

test('identity, old logo/symbol and links, existing policy and unplanned provenance changes abort before commit and roll back', async () => {
  for (const mutate of [s => { s.names[0].name = 'changed'; }, s => { s.variants[0].finish_code = 'changed-finish'; }, s => { s.printings[0].collector_number = 'unapproved'; }, s => { s.assets[0].storage_key = 'changed'; }, s => { s.links[1].asset_type = 'changed-symbol-link'; }, s => { s.sets[0].name = 'changed'; }, s => { s.sources[0].active = true; }, s => { s.sources[0].robots_policy = 'changed'; }, s => { s.sources.push({ id: 'unplanned-source', code: 'unexpected' }); }, s => { s.names.push({ id: 'extra-name' }); }]) {
    const db = database(); const initial = clone(db.state); db.mutateAfterLinks = mutate;
    await assert.rejects(rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'production', journal(), createSourceResolver(plan), null, null, createMetadataGuard(plan))), /scoped row changed|counts changed|source insertion|source count|source policy changed|metadata insertion|existing provenance changed/);
    assert.deepEqual(db.state, initial);
    assert.equal(db.calls.at(-1), 'rollback');
  }
});

test('the single staging TCGCollector fixture and all eligible artwork changes are rolled back', async () => {
  const db = database('staging'); const initial = clone(db.state); const result = journal();
  await rehearse(db, () => writeMetadata(db, rows, receipt, approval, 'staging', result, createSourceResolver(plan), null, null, createMetadataGuard(plan)));
  assert.equal(result.preservation.staging_fixture_sources, 1);
  assert.equal(Object.values(result.preservation.after_counts).reduce((a,b)=>a+b,0),51);
  assert.equal(Object.values(result.preservation.before_counts).reduce((a, b) => a + b, 0), 34);
  assert.equal(result.assets.length, FRONTS);
  assert.deepEqual(db.state, initial);
});

test('reused preservation comparison rejects unjournalled new assets or unplanned production source insertion', () => {
  const before = [oldSource].map((source, i) => ({ scope: 'sources', identity: String(i), payload: source }));
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'assets', identity: 'unlisted', payload: {} }], journal(), plan, 'production'), /journal and new rows differ/);
  assert.throws(() => compareSnapshots(before, [...before, { scope: 'sources', identity: 'unlisted', payload: { code: 'unexpected' } }], journal(), plan, 'production'), /source insertion/);
});

test('rollback binds only successful new artwork IDs and preserves objects, links and source policies', () => {
  const success = { ...journal(), preservation:{created_provenance_sources:[]}, status: 'published_manifest_and_public_bytes_verified', revision: 'a'.repeat(40), verified_at: '2026-10-13', assets: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', printing_id: rows[0].printing_id, created: true }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', printing_id: rows[0].printing_id, created: false }] };
  const rollback = rollbackReceipt(success, plan);
  assert.equal(rollback.assets.length, 1);
  assert.deepEqual(rollback.retained_inactive_provenance_sources,[]);
  assert.equal(rollback.assets[0].asset_id, assetId(rows[0]));
  assert.ok(rollbackSql(rollback).includes(COHORT_SHA));
  assert.ok(rollbackSql(rollback).includes('SET publicly_servable=false'));
  assert.ok(!rollbackSql(rollback).includes('DELETE'));
  assert.ok(!rollbackSql(rollback).includes('UPDATE ingest.sources'));
  assert.ok(!rollbackSql(rollback).includes('000000000002'));
  for(const provenance of [[{code:'wrong',id:'cccccccc-cccc-4ccc-8ccc-000000000001',full_row_sha256:'a'.repeat(64)}],[{code:'tcgcollector',id:'not-a-uuid',full_row_sha256:'a'.repeat(64)}]])assert.throws(()=>rollbackReceipt({...success,preservation:{created_provenance_sources:provenance}},plan),/source receipt/);
  assert.throws(() => rollbackReceipt({ ...success, status: 'commit_outcome_unknown' }, plan), /verified publication/);
  assert.ok(rollbackSql(rollbackReceipt({ ...success, assets: [] }, plan)).includes('no rollback writes'));
});

test('execution retains exact-main/manual/two-project/private-output gates under its own confirmation', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), STACKR_EXPECTED_MAIN_SHA: 'a'.repeat(40), STACKR_ARTWORK_MC_BASIC_ENERGY_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK MC BASIC ENERGY FRONTS', STACKR_ARTWORK_MC_BASIC_ENERGY_FRONTS_PACKAGES: '/packages', STACKR_ARTWORK_MC_BASIC_ENERGY_FRONTS_OUTPUT: '/public', SUPABASE_STAGING_DB_URL: 'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres', SUPABASE_DB_URL: 'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
  assertConfig(env);
  for (const changed of [{ ...env, GITHUB_REF: 'refs/heads/feature' }, { ...env, STACKR_EXPECTED_MAIN_SHA: 'b'.repeat(40) }, { ...env, SUPABASE_DB_URL: env.SUPABASE_STAGING_DB_URL }, { ...env, GITHUB_EVENT_NAME: 'pull_request' }, { ...env, STACKR_ARTWORK_MC_BASIC_ENERGY_FRONTS_CONFIRMATION: 'PUBLISH ARTWORK FOLLOWUP' }, { ...env, STACKR_ARTWORK_MC_BASIC_ENERGY_FRONTS_PRIVATE_OUTPUT: '/public/private' }]) assert.throws(() => assertConfig(changed));
});

test('unexpected or concurrent source creation cannot be adopted and all failures roll back',async()=>{
 for(const mode of ['existing','alias','concurrent','source-write','link-write']){
  const db=database('staging');
  if(mode==='existing'||mode==='alias')db.state.sources.push({...clone(plan.new_sources.staging[0]),id:'cccccccc-cccc-4ccc-8ccc-000000000099',code:mode==='existing'?'tcgcollector':'other-tcgcollector-alias'});
  const initial=clone(db.state);
  if(mode==='concurrent')db.concurrentSourceOnInsert=true;
  if(mode==='source-write')db.failSourceInsert=true;
  if(mode==='link-write')db.failLinkInsert=true;
  await assert.rejects(rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',journal(),createSourceResolver(plan),null,null,createMetadataGuard(plan))));
  assert.deepEqual(db.state,initial);assert.equal(db.calls.at(-1),'rollback');
  assert.ok(!db.calls.some(sql=>/^update ingest[.]sources/i.test(sql)));
 }
});

test('new source defaults and full17 creation receipt reject drift both before and after artwork writes',async()=>{
 for(const mutate of [source=>{source.terms_url='unreviewed';},source=>{source.robots_policy='changed';},source=>{source.rate_limit_config={requests:100};},source=>{source.source_updated_at='2026-10-15';},source=>{source.deprecated_reason='changed';},source=>{source.created_at='2026-10-15T19:45:00.123457+00:00';source.updated_at=source.created_at;},source=>{source.id='cccccccc-cccc-4ccc-8ccc-000000000099';},source=>{source.active=true;},source=>{source.extra='unplanned';}]){
  for(const phase of ['after-insert','after-links']){
   const db=database(),initial=clone(db.state);
   if(phase==='after-insert')db.mutateAfterSourceInsert=mutate;
   else db.mutateAfterLinks=state=>mutate(state.sources.find(source=>source.code==='tcgcollector'));
   await assert.rejects(rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',journal(),createSourceResolver(plan),null,null,createMetadataGuard(plan))));
   assert.deepEqual(db.state,initial);
  }
 }
});
