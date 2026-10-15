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
const VERSION='1a23b7a7-c50e-4601-9180-a25c950d27ea',STAGE_VERSION='d560cd01-de2a-4713-9518-b967fb4c5ac9';
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
const baselineAssets={production:Array.from({length:2},()=>({asset_type:'set_logo'})),staging:Array.from({length:2},()=>({asset_type:'set_logo'}))};
const journal=()=>({assets:[],links:[],metadata_changes:0});
function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: baselineAssets[environment].map((asset, index) => ({ ...asset, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, asset_id: `old-logo-${index}`, printing_id: null, variant_id: null, storage_key: `immutable/old-${index}.png` })),
    links: Array.from({ length: environment === 'production' ? 5 : 2 }, (_, index) => ({ asset_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index % 4).padStart(12, '0')}`, catalogue_version_id: index < 2 ? (environment === 'production' ? VERSION : STAGE_VERSION) : `historical-version-${index}`, language_code: 'en', asset_type: index % 2 ? 'set_symbol' : 'set_logo', set_id: rows[index % rows.length].set_id, printing_id: null, variant_id: null })),
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
 assert.equal(snapshot.length,env==='production'?16:9);return p;
}
test('frozen Japanese Eevee preserves internal049, printedNo133, normal singleton and shared asset',()=>{
 validateRows(plan,table);validateSourcePlan(plan);assert.equal(rows.length,1);assert.equal(rows[0].collector_number,'049');assert.equal(rows[0].card_native_name,'Eevee');
 const body=rows[0].evidence.source_body;assert.equal(body.actual_pixel_signature.printedName,'イーブイ');assert.equal(body.actual_pixel_signature.printedNationalDex,'No.133');assert.equal(body.actual_pixel_signature.printedCollectorNumber,null);
 assert.equal(rows[0].evidence.asset_variant_id,null);assert.equal(rows[0].evidence.source_variant_id,null);assert.equal(body.root_finite_authority.private_package_is_production_ready,false);
 assert.deepEqual(plan.new_sources.production,[]);assert.deepEqual(plan.new_sources.staging,[STAGING_FIXTURE_POLICY]);validatePublishedWitness(body,rows[0]);
});
test('joint identity/body/edition/authority tampering fails despite a rewritten evidence table',()=>{
 const changes=[r=>{r.source_code='scrydex';},r=>{r.provider_id+='wrong';},r=>{r.language_code='en';},r=>{r.variant_ids[0]='wrong';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.source_variant_id=r.variant_ids[0];},r=>{r.evidence.source_body.actual_pixel_signature.printedNationalDex='No.049';},r=>{r.evidence.source_body.actual_pixel_signature.printedCollectorNumber='049';},r=>{r.evidence.source_body.actual_pixel_signature.hp=40;},r=>{r.evidence.source_body.actual_pixel_signature.ability.semanticClauses.optionalUse=false;},r=>{r.evidence.source_body.actual_pixel_signature.ability.semanticClauses.basicEnergyOnlyClaimed=true;},r=>{r.evidence.source_body.actual_pixel_signature.ability.semanticClauses.disabledWhile.pop();},r=>{r.evidence.source_body.actual_pixel_signature.ability.semanticClauses.shuffleAfter=false;},r=>{r.evidence.source_body.actual_pixel_signature.artist='Wrong';},r=>{r.evidence.source_body.actual_pixel_signature.attacks[0].cost=['Fire'];},r=>{r.evidence.source_body.unlimited_edition_certified=true;},r=>{r.evidence.source_body.physical_finish_certified=true;},r=>{r.evidence.source_body.provider_body_verbatim_agreement_certified=true;},r=>{r.evidence.source_body.root_finite_authority.private_package_is_production_ready=true;},r=>{r.evidence.source_body.historical_authority.preparation_approved=true;},r=>{r.evidence.queue_controls.identity_controls.canonical_alias_is_internal_only=false;},r=>{r.objects[0].sha256='0'.repeat(64);},r=>{r.objects[0].mime_type='image/png';},r=>{r.objects[3].width=1600;}];
 for(const mutate of changes){const p=clone(plan),t=clone(table);mutate(p.rows[0]);t[0].evidence_sha256=canonicalHash(p.rows[0].evidence);assert.throws(()=>validateRows(p,t));}
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
test('production16→18 adds only one printing-shared asset/link and preserves all four sources',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();db.failSourceInsert=true;
 await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
 assert.equal(j.assets.length,1);assert.equal(j.links.length,1);assert.equal(j.preservation.new_inactive_provenance_sources,0);assert.deepEqual(j.preservation.created_provenance_sources,[]);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),16);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),18);
 assert.deepEqual(db.state.sources,initial.sources);for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);assert.deepEqual(db.state.assets.slice(0,2),initial.assets);assert.deepEqual(db.state.links.slice(0,5),initial.links);
 assert.equal(db.state.assets.find(asset=>asset.asset_type==='card_image').variant_id,null);assert.equal(j.links[0].variant_id,null);
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));
 await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only a temporary Price fixture and returns9 unchanged rows',async()=>{
 const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
 assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
 await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
 assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');assert.equal(j.assets.length,1);assert.equal(j.links.length,1);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),9);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),12);assert.deepEqual(db.state,initial);
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
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_NEO2_EEVEE_FRONT_CONFIRMATION:'PUBLISH ARTWORK NEO2 EEVEE FRONT',STACKR_ARTWORK_NEO2_EEVEE_FRONT_PACKAGES:'/packages',STACKR_ARTWORK_NEO2_EEVEE_FRONT_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
 assertConfig(env);for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.STACKR_ARTWORK_NEO2_EEVEE_FRONT_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_NEO2_EEVEE_FRONT_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public body rejects commercial captures/private paths and retains exact accepted Japanese witness',()=>{
 for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{file:'D:/private/raw.html'}])assert.throws(()=>publicProjection(value));assert.deepEqual(publicProjection(rows[0].evidence.source_body),rows[0].evidence.source_body);
});
