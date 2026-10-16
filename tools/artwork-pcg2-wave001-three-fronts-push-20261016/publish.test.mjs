import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFrozen,validateRows,validatePlan,validateApproval,validateSourcePlan,STAGING_FIXTURE_POLICY,COHORT_SHA} from './frozen.mjs';
import {assertConfig,createSourceResolver,rollbackReceipt,rollbackSql} from './publish.mjs';
import {readSnapshot,assertSourcePolicies,createMetadataGuard,snapshotHash} from './metadata-guard.mjs';
import {assetId,writeMetadata,rehearse} from '../artwork3303-publish-20260928/publish.mjs';
import {canonicalHash,publicProjection,validatePublishedWitness,validateAuthorityPackets,knownSource,observed} from './source-proof.mjs';
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
const logo={id:'6852a23f-256e-4d3a-b003-2b3266ebfaa4',asset_id:'pcg2-existing-logo',asset_type:'set_logo',printing_id:null,variant_id:null,set_id:rows[0].set_id,storage_key:'immutable/pcg2-logo.png'};
const baselineAssets={production:[logo],staging:[]};
const baselineLinks={production:[{asset_id:logo.id,catalogue_version_id:VERSION,language_code:'ja',asset_type:'set_logo',set_id:rows[0].set_id,printing_id:null,variant_id:null}],staging:[]};
const journal=()=>({assets:[],links:[],metadata_changes:0});
function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code, is_default:knownSource(c.printing_id).defaultFlag })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: clone(baselineAssets[environment]),
    links: clone(baselineLinks[environment]),
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
 assert.equal(snapshot.length,env==='production'?19:13);return p;
}
test('exact three PCG2 fronts preserve nullable catalogue values and one holofalse/two normaltrue defaults',()=>{
 validateRows(plan,table);validateSourcePlan(plan);assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>knownSource(r.printing_id).defaultFlag),[false,true,true]);
 for(const r of rows){const k=knownSource(r.printing_id),b=r.evidence.source_body,a=b.actual_pixel_signature.actualPrintedObservations;validatePublishedWitness(b,r);assert.equal(a.printedNativeName,k.printedName);assert.equal(a.printedCardClass,'Pokemon');assert.equal(a.printedHP,k.hp);assert.equal(a.abilities.length,k.abilityCount);assert.equal(a.attacks.length,k.attackCount);assert.equal(b.accepted_category,null);assert.equal(b.recorded_inventory_category,null);assert.equal(b.canonical_english_null_preserved,true);assert.equal(Object.hasOwn(a,'printedNationalDex'),false);assert.equal(Object.hasOwn(a,'printedSetCodeLiteral'),false);assert.equal(Object.hasOwn(a,'printedForm'),false);assert.equal(b.raw_source_printed_witness.printedEvolutionPlacement,null);assert.equal(b.root_actual_printed_witness.printedEvolutionPlacement,k.actualEvolutionPlacement);for(const env of ['current_production_binding','current_staging_binding']){assert.equal(b[env].variants[0].is_default,k.defaultFlag);assert.equal(b[env].variants[0].variant_code,k.variantCode);}}
 assert.equal(knownSource(rows[0].printing_id).variantCode,'holo');assert.equal(rows[1].objects[0].width,1200);assert.equal(rows[1].objects[0].height,1600);
});
test('raw null placements and separate root literals resist joint forgery',()=>{
 for(let i=0;i<3;i++)for(const change of [b=>{b.raw_source_printed_witness.printedEvolutionPlacement=b.root_actual_printed_witness.printedEvolutionPlacement??'invented';},b=>{b.root_actual_printed_witness.printedEvolutionPlacement='truncated';b.actual_pixel_signature.actualPrintedObservations.printedEvolutionPlacement='truncated';},b=>{b.additive_actual_evolution_observation.rootActualLiteral='invented';},b=>{b.raw_source_witness_is_verbatim_certified=true;},b=>{b.raw_source_historical_flags.preparationApproved=true;}]){const q=clone(rows[i]),b=q.evidence.source_body;change(b);b.raw_source_printed_witness_canonical_sha256=canonicalHash(b.raw_source_printed_witness);b.root_actual_printed_witness_canonical_sha256=canonicalHash(b.root_actual_printed_witness);b.actual_pixel_signature_canonical_sha256=canonicalHash(b.actual_pixel_signature);q.evidence.queue_controls=clone(b.queue_controls);assert.throws(()=>validatePublishedWitness(b,q));const p=clone(plan),t=clone(table);p.rows[i]=q;t[i].evidence_sha256=canonicalHash(q.evidence);assert.throws(()=>validateRows(p,t));}
});
test('joint body, scope, default and source forgeries fail even when witness hashes are recomputed',()=>{
 const changes=[r=>{r.language_code='en';},r=>{r.set_code='PCG9';},r=>{r.provider_id='pricecharting:'+knownSource(r.printing_id).productId;},r=>{r.work_type='SHARP';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.source_body.accepted_category='Pokemon';},r=>{r.evidence.source_body.actual_printed_ability_logo='wrong';},r=>{r.evidence.source_body.raw_source_witness_not_rewritten=false;},r=>{r.evidence.source_body.actual_pixel_signature.actualPrintedObservations.printedNonCollectorIdentifier='No.1';},r=>{r.evidence.source_body.actual_pixel_signature.actualPrintedObservations.printedForm='delta';},r=>{const a=r.evidence.source_body.actual_pixel_signature.actualPrintedObservations;if(a.attacks.length)a.attacks[0].effect='truncated';else a.printedRules='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.actualPrintedObservations.printedPokemonExRule='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.actualPrintedObservations.printedNationalDex=1;},r=>{r.evidence.source_body.actual_pixel_signature.actualPrintedObservations.printedSetCodeLiteral='PCG3';},r=>{r.evidence.source_body.required_asset_scope.printing_id='wrong';},r=>{r.evidence.source_body.photo_identity_projection.canonicalPrintingId='wrong';},r=>{r.evidence.source_body.current_production_binding.variants[0].is_default=!knownSource(r.printing_id).defaultFlag;},r=>{r.evidence.source_body.current_staging_binding.variants[0].finish_code='first_edition';},r=>{r.evidence.source_body.physical_material_authenticity_verified=true;},r=>{r.evidence.source_body.unlimited_edition_certified=true;},r=>{r.evidence.source_body.vendor_licence_certified=true;},r=>{r.evidence.source_body.source_wide_approval=true;},r=>{r.evidence.source_body.native_optical_gain_claimed=true;},r=>{r.evidence.source_body.provider_metadata_raw={sellerPrices:[12]};},r=>{r.objects[0].sha256='0'.repeat(64);},r=>{r.objects[3].height=9999;}];
 for(let i=0;i<3;i++)for(const mutate of changes){const p=clone(plan),t=clone(table);mutate(p.rows[i]);p.rows[i].evidence.source_body.actual_pixel_signature_canonical_sha256=canonicalHash(p.rows[i].evidence.source_body.actual_pixel_signature);t[i].evidence_sha256=canonicalHash(p.rows[i].evidence);assert.throws(()=>validateRows(p,t));if(canonicalHash(p.rows[i].evidence.source_body)!==canonicalHash(rows[i].evidence.source_body))assert.throws(()=>validatePublishedWitness(p.rows[i].evidence.source_body,p.rows[i]));}
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
test('production19→25 adds exactly three printing-shared assets/links and preserves all four sources',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();db.failSourceInsert=true;
 await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
 assert.equal(j.assets.length,3);assert.equal(j.links.length,3);assert.equal(j.preservation.new_inactive_provenance_sources,0);assert.deepEqual(j.preservation.created_provenance_sources,[]);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),19);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),25);
 assert.deepEqual(db.state.sources,initial.sources);for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);
 assert.equal(db.state.assets.find(asset=>asset.asset_type==='card_image').variant_id,null);assert.equal(j.links[0].variant_id,null);
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));
 await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only a temporary Price fixture and returns13 unchanged rows',async()=>{
 const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
 assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
 await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
 assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');assert.equal(j.assets.length,3);assert.equal(j.links.length,3);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),13);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),20);assert.deepEqual(db.state,initial);
});
test('canonical/old asset/link/source drift is rejected before inserts and post-write drift rolls back',async()=>{
 for(const mutate of [s=>{s.printings[0].native_name='changed';},s=>{s.variants[0].finish_code='first_edition';},s=>{s.names[0].name='changed';},s=>{s.assets.push({id:'unexpected',storage_key:'changed'});},s=>{s.links.push({asset_id:'unexpected',catalogue_version_id:'unexpected',asset_type:'changed'});},s=>{s.sources[0].updated_at='2026-10-15T21:26:03.082847+00:00';}]){
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
 const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-15',preservation:{created_provenance_sources:[]},assets:rows.map((r,i)=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(i+1).padStart(12,'0'),printing_id:r.printing_id,created:true}))};
 const result=rollbackReceipt(success,plan),sql=rollbackSql(result);assert.equal(result.assets.length,3);for(let i=0;i<3;i++)assert.equal(result.assets[i].asset_id,assetId(rows[i]));assert.deepEqual(result.retained_inactive_provenance_sources,[]);assert.ok(sql.includes(COHORT_SHA)&&sql.includes('a.variant_id IS NULL'));assert.ok(!sql.includes('DELETE')&&!sql.includes('UPDATE ingest.sources'));
 assert.throws(()=>rollbackReceipt({...success,preservation:{created_provenance_sources:[{code:'pricecharting'}]}},plan));assert.throws(()=>rollbackReceipt({...success,status:'commit_outcome_unknown'},plan));
});
test('protected exact-main confirmation and separated private-output gates remain enforced',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_PCG2_WAVE001_THREE_FRONTS_CONFIRMATION:'PUBLISH ARTWORK PCG2 WAVE001 THREE FRONTS',STACKR_ARTWORK_PCG2_WAVE001_THREE_FRONTS_PACKAGES:'/packages',STACKR_ARTWORK_PCG2_WAVE001_THREE_FRONTS_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
 assertConfig(env);for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.STACKR_ARTWORK_PCG2_WAVE001_THREE_FRONTS_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_PCG2_WAVE001_THREE_FRONTS_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public body rejects commercial captures/private paths and retains exact accepted Japanese witness',()=>{
 for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{file:'D:/private/raw.html'}])assert.throws(()=>publicProjection(value));assert.deepEqual(publicProjection(rows[0].evidence.source_body),rows[0].evidence.source_body);
});

test('existing PCG2 logo/link and two normaltrue/one holofalse defaults survive metadata writes and rollback',async()=>{
 for(const env of ['production','staging']){const db=database(env),initial=clone(db.state),p=await guardedPlan(db,env),j=journal();const apply=()=>writeMetadata(db,rows,receipt,approval,env,j,createSourceResolver(p),null,null,createMetadataGuard(p));assert.ok(db.state.variants.every(v=>v.is_default===knownSource(v.printing_id).defaultFlag));if(env==='production'){await apply();assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);assert.deepEqual(db.state.variants,initial.variants);}else{await rehearse(db,apply);assert.deepEqual(db.state,initial);}}
 for(let i=0;i<3;i++){const db=database(),p=await guardedPlan(db);db.state.variants[i].is_default=!db.state.variants[i].is_default;await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
});
test('all measured LARGE selections retain one original and two detail pages and reject invented optical certification',()=>{
 assert.deepEqual(plan.app_display_expectation.map(e=>e.large_role),['detail-page','original','detail-page']);
 for(const r of rows){const b=r.evidence.source_body;assert.equal(b.native_optical_gain_claimed,false);assert.equal(b.provider_native_resolution_certified,false);assert.equal(b.shared_front_eligibility_does_not_authenticate_physical_edition,true);for(const mutate of [b=>{b.native_optical_gain_claimed=true;},b=>{b.source_provider_body_verbatim_agreement=true;},b=>{b.unresolved_physical_qualifications=[];}]){const q=clone(r);mutate(q.evidence.source_body);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}}
 const p=clone(plan);p.app_display_expectation[0].large_role='original';assert.throws(()=>validateRows(p,table));
});
