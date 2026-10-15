import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFrozen,validateRows,validatePlan,validateApproval,validateSourcePlan,STAGING_FIXTURE_POLICY,COHORT_SHA} from './frozen.mjs';
import {assertConfig,createSourceResolver,rollbackReceipt,rollbackSql} from './publish.mjs';
import {readSnapshot,assertSourcePolicies,createMetadataGuard,snapshotHash} from './metadata-guard.mjs';
import {assetId,writeMetadata,rehearse} from '../artwork3303-publish-20260928/publish.mjs';
import {canonicalHash,publicProjection,validatePublishedWitness} from './source-proof.mjs';
const {plan,rows,approval,receipt,table}=await loadFrozen();
const clone=structuredClone;
const VERSION='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8',STAGE_VERSION='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
const oldSources=[
  {
    "id": "5f5909c2-b088-43d7-9f84-5d8686e1c7e4",
    "code": "pricecharting",
    "active": false,
    "base_url": "https://www.pricecharting.com",
    "terms_url": null,
    "created_at": "2026-10-15T21:26:03.082846+00:00",
    "updated_at": "2026-10-15T21:26:03.082846+00:00",
    "source_type": "image",
    "display_name": "PriceCharting (owner supplied card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
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
const baselineAssets={production:[{asset_type:'set_symbol'},{asset_type:'set_logo'}],staging:[{asset_type:'set_logo'}]};
const journal=()=>({assets:[],links:[],metadata_changes:0});
function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code, is_default:true })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: baselineAssets[environment].map((asset, index) => ({ ...asset, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, asset_id: `old-logo-${index}`, printing_id: null, variant_id: null, storage_key: `immutable/old-${index}.png` })),
    links: Array.from({ length: environment === 'production' ? 3 : 2 }, (_, index) => ({ asset_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index % 4).padStart(12, '0')}`, catalogue_version_id: index < 2 ? (environment === 'production' ? VERSION : STAGE_VERSION) : `historical-version-${index}`, language_code: 'en', asset_type: index % 2 ? 'set_symbol' : 'set_logo', set_id: rows[index % rows.length].set_id, printing_id: null, variant_id: null })),
    sources: environment === 'production' ? clone(oldSources) : [],
  };
  if(environment === 'staging') for(const printing of state.printings) delete printing.printing_discriminator;
  const calls = [];
  let saved, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select to_jsonb(source) as payload from ingest.sources')) return { rows: state.sources.map(source => ({ payload: clone(source) })) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: environment === 'staging' ? STAGE_VERSION : VERSION }] };
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
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select to_jsonb(scoped) as payload from ${table} scoped where`)) {
      const result = clone(state[scope]);
      // Model pg's direct-column timestamp parsing so a second unsafe source
      // reader cannot pass only because the fixture stored JSON strings.
      if (scope === 'sources') for (const source of result) for (const key of ['created_at', 'updated_at', 'deprecated_at', 'source_updated_at']) if (source[key]) source[key] = new Date(source[key]);
      return { rows: result.map(payload => ({payload})) };
    }
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}



async function guardedPlan(db,env='production'){
 const p=clone(plan),snapshot=await readSnapshot(db,rows,p.scope_counts[env]);p.before_snapshot_hashes[env]=snapshotHash(snapshot);
 assert.equal(snapshot.length,env==='production'?14:8);return p;
}
test('exact English Energy2/30 preserves ENERGY, bolt, goldRaichu mark and sole default normal tuple',()=>{
 validateRows(plan,table);validateSourcePlan(plan);assert.equal(rows.length,1);const row=rows[0],body=row.evidence.source_body,a=body.actual_pixel_signature;
 assert.equal(row.language_code,'en');assert.equal(row.set_code,'tk-sm-r');assert.equal(row.collector_number,'2');assert.equal(row.card_native_name,'Lightning Energy');assert.equal(row.work_type,'CARDS');assert.equal(body.accepted_category,'Energy');assert.equal(a.printedTitle,'ENERGY');assert.equal(a.semanticEnergyType,'Lightning');assert.equal(a.printedCollectorNumber,'2/30');assert.equal(a.trainerKitGoldMarkObserved,true);assert.ok(a.trainerKitGoldMarkDescription.includes('Raichu'));
 for(const field of ['hp','nationalDex','stage','rulesBody','artist'])assert.equal(a[field],null);assert.deepEqual(a.attacks,[]);assert.deepEqual(a.abilities,[]);assert.equal(a.literalPrintedWordsLightningOrPsychicEnergyClaimed,false);assert.equal(a.printedSetCodeLiteral,null);
 for(const key of ['current_production_binding','current_staging_binding']){assert.equal(body[key].variants[0].is_default,true);assert.equal(body[key].variants[0].finish_code,'normal');assert.equal(body[key].variants[0].id,'a5401eba-11c3-42f1-a05e-f76b3db9d945');}
 assert.equal(row.provider_id,'pricecharting-image-url-sha256:c476992336733cd7d8945cf4bf5c2e3e6120347a96b7672fed22fa6531630df8');assert.equal(body.photo_identity_projection.sourceProductId,'6610761');assert.equal(row.evidence.asset_variant_id,null);assert.equal(row.evidence.source_variant_id,null);assert.deepEqual(plan.new_sources.production,[]);validatePublishedWitness(body,row);
});
test('joint Energy identity/category/body/default/authority forgery fails with recomputed hashes',()=>{
 const changes=[r=>{r.language_code='ja';},r=>{r.set_code='tk-sm-l';},r=>{r.collector_number='20';},r=>{r.provider_id='pricecharting:6610761';},r=>{r.work_type='SHARP';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.source_body.accepted_category='Pokemon';},r=>{r.evidence.source_body.actual_pixel_signature.semanticEnergyType='Psychic';},r=>{r.evidence.source_body.actual_pixel_signature.printedCollectorNumber='20/30';},r=>{r.evidence.source_body.actual_pixel_signature.hp=60;},r=>{r.evidence.source_body.actual_pixel_signature.nationalDex=26;},r=>{r.evidence.source_body.actual_pixel_signature.stage='Basic';},r=>{r.evidence.source_body.actual_pixel_signature.artist='Wrong';},r=>{r.evidence.source_body.actual_pixel_signature.attacks.push({name:'Attack'});},r=>{r.evidence.source_body.actual_pixel_signature.rulesBody='Rule';},r=>{r.evidence.source_body.actual_pixel_signature.trainerKitGoldMarkObserved=false;},r=>{r.evidence.source_body.current_production_binding.variants[0].is_default=false;},r=>{r.evidence.source_body.quality_qualification.whole_uncropped_fabric_photograph_retained=false;},r=>{r.evidence.source_body.quality_qualification.glare_uneven_lighting_shadow_perspective_surface_specks_retained=false;},r=>{r.evidence.source_body.quality_qualification.pristine_condition_certified=true;},r=>{r.evidence.source_body.native_optical_gain_claimed=true;},r=>{r.evidence.source_body.physical_finish_certified=true;},r=>{r.evidence.source_body.root_finite_authority.private_package_is_production_ready=true;},r=>{r.evidence.source_body.historical_authority.preparation_approved=true;},r=>{r.objects[0].sha256='0'.repeat(64);},r=>{r.objects[0].mime_type='image/png';},r=>{r.objects[3].width=1600;}];
 for(const mutate of changes){const p=clone(plan),t=clone(table);mutate(p.rows[0]);p.rows[0].evidence.source_body.actual_pixel_signature_canonical_sha256=canonicalHash(p.rows[0].evidence.source_body.actual_pixel_signature);t[0].evidence_sha256=canonicalHash(p.rows[0].evidence);assert.throws(()=>validateRows(p,t));}
 for(const field of ['variant_id','finish_code','catalogue_version_id','same_artwork_as_variant_id']){const p=clone(plan);p.binding_expectations.staging[0][field]='wrong';assert.throws(()=>validateRows(p,table));}
});
test('plan/approval bytes and duplicate front scopes remain closed',async()=>{
 const bytes=await readFile(new URL('./plan.json',import.meta.url));assert.throws(()=>validatePlan(Buffer.concat([bytes,Buffer.from(' ')]),table));
 const a=clone(approval);a.approved=false;assert.throws(()=>validateApproval(Buffer.from(JSON.stringify(a))));
 const p=clone(plan);p.rows.push(clone(p.rows[0]));assert.throws(()=>validateRows(p,table));
});
test('all68 existing source fields and microseconds, including initial Price finite2 notes, are immutable',()=>{
 assertSourcePolicies(plan,clone(oldSources),'production');assert.equal(oldSources.length,4);assert.ok(oldSources.every(source=>Object.keys(source).length===17));
 for(const source of oldSources)for(const field of Object.keys(source)){const sources=clone(oldSources);sources.find(row=>row.code===source.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,sources,'production'));}
 const changed=clone(oldSources);changed.find(source=>source.code==='pricecharting').created_at=new Date(changed.find(source=>source.code==='pricecharting').created_at);assert.throws(()=>assertSourcePolicies(plan,changed,'production'));
});
test('production source creation/policy edits and extra stage fixtures cannot be authorised',()=>{
 for(const mutate of [p=>{p.new_sources.production=[p.new_sources.staging[0]];},p=>{p.production_source_changes_allowed=1;},p=>{p.source_policies.production.find(source=>source.code==='pricecharting').active=true;},p=>{p.source_policies.production.find(source=>source.code==='pricecharting').internal_notes+=' finite1 revised';},p=>{p.new_sources.staging.push(p.source_policies.production[0]);},p=>{p.source_policies.staging.push(p.source_policies.production[0]);}]){const p=clone(plan);mutate(p);assert.throws(()=>createSourceResolver(p));}
});
test('both readers retain all four JSON source rows and domain aliases while production executes zero inserts',async()=>{
 const db=database();const snapshot=await readSnapshot(db,rows,plan.scope_counts.production);
 for(const source of oldSources)assert.deepEqual(snapshot.find(row=>row.scope==='sources'&&row.payload.code===source.code).payload,source);
 db.failSourceInsert=true;const map=await createSourceResolver(plan)(db,receipt,'production');assert.equal(map.size,4);assert.ok(map.has('pricecharting'));
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')||sql.startsWith('select * from ingest.sources')));
 assert.ok(db.calls.filter(sql=>sql.startsWith('select to_jsonb(source)')).every(sql=>sql.includes('lower(code)')&&sql.includes('limit 5')&&sql.includes('base_url ilike')));
});
test('missing Price, missing unrelated source and domain aliases fail without creating/adopting rows',async()=>{
 for(const code of ['pricecharting','scrydex','pokellector','tcgcollector']){const db=database();db.state.sources=db.state.sources.filter(source=>source.code!==code);await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
 const db=database();db.state.sources.push({...clone(oldSources[0]),id:'other',code:'alternate',base_url:'https://pricecharting.com/alias'});await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));
});
test('production14→16 adds only one printing-shared asset/link and preserves all four sources',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();db.failSourceInsert=true;
 await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
 assert.equal(j.assets.length,1);assert.equal(j.links.length,1);assert.equal(j.preservation.new_inactive_provenance_sources,0);assert.deepEqual(j.preservation.created_provenance_sources,[]);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),14);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),16);
 assert.deepEqual(db.state.sources,initial.sources);for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);assert.deepEqual(db.state.assets.slice(0,2),initial.assets);assert.deepEqual(db.state.links.slice(0,3),initial.links);
 assert.equal(db.state.assets.find(asset=>asset.asset_type==='card_image').variant_id,null);assert.equal(j.links[0].variant_id,null);
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));
 await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only a temporary Price fixture and returns8 unchanged rows',async()=>{
 const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
 assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
 await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
 assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');assert.equal(j.assets.length,1);assert.equal(j.links.length,1);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),8);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),11);assert.deepEqual(db.state,initial);
});
test('canonical/old asset/link/source drift is rejected before inserts and post-write drift rolls back',async()=>{
 for(const mutate of [s=>{s.printings[0].native_name='changed';},s=>{s.variants[0].finish_code='first_edition';},s=>{s.names[0].name='changed';},s=>{s.assets[0].storage_key='changed';},s=>{s.links[0].asset_type='changed';},s=>{s.sources[0].updated_at='2026-10-15T21:26:03.082847+00:00';}]){
  const db=database(),p=await guardedPlan(db);mutate(db.state);await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));
  const after=database(),q=await guardedPlan(after),initial=clone(after.state);after.mutateAfterLinks=mutate;await assert.rejects(rehearse(after,()=>writeMetadata(after,rows,receipt,approval,'production',journal(),createSourceResolver(q),null,null,createMetadataGuard(q))));assert.deepEqual(after.state,initial);
 }
});
test('stage fixture defaults, concurrent creation and reread drift fail closed',async()=>{
 for(const mutate of [s=>{s.terms_url='unplanned';},s=>{s.rate_limit_config={limit:1};},s=>{s.extra='field';},s=>{s.updated_at='2026-10-15T19:45:00.123457+00:00';}]){const db=database('staging');db.mutateAfterSourceInsert=mutate;await assert.rejects(createSourceResolver(plan)(db,receipt,'staging'));}
 const db=database('staging');db.concurrentSourceOnInsert=true;await assert.rejects(createSourceResolver(plan)(db,receipt,'staging'),/concurrent/);
 const changed=database('staging');changed.mutateAfterSourceInsert=s=>{s.created_at=s.updated_at='2026-10-15T19:45:00.123457+00:00';};await assert.rejects(createSourceResolver(plan)(changed,receipt,'staging'),/changed before resolver/);
});
test('source and link write failures roll back without changing existing policies or leaving a fixture',async()=>{
 for(const[env,flag]of [['staging','failSourceInsert'],['staging','failLinkInsert'],['production','failLinkInsert']]){const db=database(env),p=await guardedPlan(db,env),initial=clone(db.state);db[flag]=true;await assert.rejects(rehearse(db,()=>writeMetadata(db,rows,receipt,approval,env,journal(),createSourceResolver(p),null,null,createMetadataGuard(p))),/Injected/);assert.deepEqual(db.state,initial);}
});
test('rollback hides only this successful shared asset and retains all provenance and immutable data',()=>{
 const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-15',preservation:{created_provenance_sources:[]},assets:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',printing_id:rows[0].printing_id,created:true}]};
 const result=rollbackReceipt(success,plan),sql=rollbackSql(result);assert.equal(result.assets[0].asset_id,assetId(rows[0]));assert.deepEqual(result.retained_inactive_provenance_sources,[]);assert.ok(sql.includes(COHORT_SHA)&&sql.includes('a.variant_id IS NULL'));assert.ok(!sql.includes('DELETE')&&!sql.includes('UPDATE ingest.sources'));
 assert.throws(()=>rollbackReceipt({...success,preservation:{created_provenance_sources:[{code:'pricecharting'}]}},plan));assert.throws(()=>rollbackReceipt({...success,status:'commit_outcome_unknown'},plan));
});
test('protected exact-main confirmation and separated private-output gates remain enforced',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_CONFIRMATION:'PUBLISH ARTWORK TKSMR LIGHTNING2 FRONT',STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PACKAGES:'/packages',STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
 assertConfig(env);for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_TKSMR_LIGHTNING2_FRONT_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public body rejects commercial captures/private paths and retains exact accepted English Energy witness',()=>{
 for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{file:'D:/private/raw.html'}])assert.throws(()=>publicProjection(value));assert.deepEqual(publicProjection(rows[0].evidence.source_body),rows[0].evidence.source_body);
});

test('whole fabric photograph and imperfections retained without pristine or native optical certificates',()=>{
 const row=rows[0],q=row.evidence.source_body.quality_qualification;assert.equal(q.whole_uncropped_fabric_photograph_retained,true);assert.equal(q.glare_uneven_lighting_shadow_perspective_surface_specks_retained,true);assert.equal(q.pristine_condition_certified,false);assert.equal(q.original_HD_pixels,true);assert.equal(q.detail_derivative_HD_pixels,false);assert.deepEqual(row.objects.map(o=>[o.width,o.height]),[[1200,1600],[240,320],[96,128],[720,960]]);
});
test('existing set images and default normal flag preserved; live app large expectation uses original',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db);assert.equal(db.state.variants[0].is_default,true);await writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p));assert.deepEqual(db.state.assets.slice(0,2),initial.assets);assert.deepEqual(db.state.links.slice(0,3),initial.links);assert.deepEqual(db.state.variants,initial.variants);
 assert.equal(plan.app_display_expectation.large_role,'original');assert.deepEqual(plan.app_display_expectation.large_dimensions,[1200,1600]);assert.deepEqual(plan.app_display_expectation.detail_dimensions,[720,960]);assert.ok(plan.app_display_expectation.detail_dimensions[1]<1000);assert.notDeepEqual(plan.app_display_expectation.large_dimensions,plan.app_display_expectation.detail_dimensions);
});
