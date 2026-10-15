import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadFrozen,validateRows,validatePlan,validateApproval,validateSourcePlan,NEW_SOURCE_POLICY,COHORT_SHA} from './frozen.mjs';
import {assertConfig,createSourceResolver,rollbackReceipt,rollbackSql} from './publish.mjs';
import {readSnapshot,assertSourcePolicies,createMetadataGuard,snapshotHash} from './metadata-guard.mjs';
import {assetId,writeMetadata,rehearse} from '../artwork3303-publish-20260928/publish.mjs';
import {canonicalHash,publicProjection,validatePublishedWitness} from './source-proof.mjs';
const {plan,rows,approval,receipt,table} = await loadFrozen();
const clone = structuredClone;
const VERSION = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
const FRONTS = 2;
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
const baselineAssets = {production:Array.from({length:4},()=>({asset_type:'set_logo'})),staging:Array.from({length:3},()=>({asset_type:'set_logo'}))};
const journal = () => ({assets:[],links:[],metadata_changes:0});
function database(environment = 'production') {
  const state = {
    printings: rows.map(r => ({ id: r.printing_id, set_id: r.set_id, native_name: r.card_native_name, collector_number: r.collector_number, printing_discriminator: '' })),
    variants: plan.binding_expectations[environment].map(c => ({ id: c.variant_id, printing_id: c.printing_id, variant_code: c.variant_code, finish_code: c.finish_code })),
    names: plan.binding_expectations[environment].flatMap((c, i) => ['native', 'en'].map(kind => ({ id: `name-${i}-${kind}`, printing_id: c.printing_id, variant_id: c.variant_id, name: c.card_native_name, kind }))),
    sets: [...new Map(rows.map(r => [r.set_id, { id: r.set_id, set_code: r.set_code, name: r.set_code }])).values()],
    assets: baselineAssets[environment].map((asset, index) => ({ ...asset, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, asset_id: `old-logo-${index}`, printing_id: null, variant_id: null, storage_key: `immutable/old-${index}.png` })),
    links: Array.from({ length: 4 }, (_, index) => ({ asset_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index % 4).padStart(12, '0')}`, catalogue_version_id: index < 2 ? (environment === 'production' ? VERSION : VERSION) : `historical-version-${index}`, language_code: 'en', asset_type: index % 2 ? 'set_symbol' : 'set_logo', set_id: rows[index % rows.length].set_id, printing_id: null, variant_id: null })),
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
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: environment === 'staging' ? VERSION : VERSION }] };
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


async function guardedPlan(db,environment='production') {
  const local = clone(plan);
  const snapshot = await readSnapshot(db,rows,local.scope_counts[environment]);
  local.before_snapshot_hashes[environment] = snapshotHash(snapshot);
  assert.equal(snapshot.length,environment==='production'?26:22);
  return local;
}
test('frozen two printing fronts bind four ordinary variants and eight immutable objects',()=>{
  validateRows(plan,table);validateSourcePlan(plan);
  assert.equal(rows.length,2);assert.equal(new Set(rows.flatMap(row=>row.variant_ids)).size,4);
  assert.deepEqual(plan.new_sources.staging,[NEW_SOURCE_POLICY]);assert.deepEqual(plan.source_policies.staging,[]);
  for(const row of rows){assert.equal(row.evidence.asset_variant_id,null);assert.equal(row.evidence.delivery_kind,'shared');validatePublishedWitness(row.evidence.source_body,row);}
});
test('joint identity/body/authority/object tampering fails even with a rewritten evidence table',()=>{
  const cases = [r=>{r.source_code='tcgcollector';},r=>{r.provider_id+='wrong';},r=>{r.language_code='ja';},r=>{r.variant_ids.pop();},r=>{r.variant_ids[0]='unbound';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.delivery_kind='exact';},r=>{r.evidence.exact_finish_verified=true;},r=>{r.evidence.source_body.exactReverseHoloPhotoClaimed=true;},r=>{r.evidence.source_body.physicalEditionCertified=true;},r=>{r.evidence.source_body.actualPixelSignature.printedCollectorNumber='103a/147';},r=>{r.evidence.source_body.actualPixelSignature.printedEReaderId='C-32-a';},r=>{r.evidence.source_body.actualPixelSignature.hp=999;},r=>{r.evidence.source_body.actualPixelSignature.attacks[0].cost=['Fire'];},r=>{r.evidence.source_body.actualPixelSignature.artist='Wrong';},r=>{r.evidence.queue_controls.g.category='Trainer';},r=>{r.evidence.source_body.currentAuthority.privatePackageIsProductionReady=true;},r=>{r.evidence.source_body.historicalAuthority.sourcePreparationApproved=true;},r=>{r.objects[0].sha256='a'.repeat(64);},r=>{r.objects[0].mime_type='image/png';},r=>{r.objects[3].width=1600;}];
  for(const change of cases){const p=clone(plan),t=clone(table);change(p.rows[0]);t[0].evidence_sha256=canonicalHash(p.rows[0].evidence);t[0].original_sha256=p.rows[0].objects[0].sha256;assert.throws(()=>validateRows(p,t));}
  for(const field of ['variant_id','finish_code','catalogue_version_id','same_artwork_as_variant_id']){const p=clone(plan);p.binding_expectations.staging[0][field]='wrong';assert.throws(()=>validateRows(p,table));}
});
test('plan/approval bytes, duplicate fronts and held aliases cannot broaden finite authority',async()=>{
  const bytes=await readFile(new URL('./plan.json',import.meta.url));assert.throws(()=>validatePlan(Buffer.concat([bytes,Buffer.from(' ')]),table));
  const a=JSON.parse(await readFile(new URL('./approval.json',import.meta.url)));a.approved=false;assert.throws(()=>validateApproval(Buffer.from(JSON.stringify(a))));
  const p=clone(plan);p.rows[1]=clone(p.rows[0]);assert.throws(()=>validateRows(p,table));
  const q=clone(plan);q.rows[0].collector_number='50b';assert.throws(()=>validateRows(q,table));
});
test('all51 old source fields and microseconds, including unused TCGCollector, remain immutable',()=>{
  assertSourcePolicies(plan,clone(oldSources),'production');
  assert.equal(oldSources.length,3);assert.ok(oldSources.every(source=>Object.keys(source).length===17));
  for(const source of oldSources)for(const field of Object.keys(source)){const changed=clone(oldSources);changed.find(row=>row.code===source.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,changed,'production'));}
  const changed=clone(oldSources);changed[0].created_at=new Date(changed[0].created_at);assert.throws(()=>assertSourcePolicies(plan,changed,'production'));
});
test('exact nine-field inactive policy and zero-source staging cannot be forged',()=>{
  for(const mutate of [p=>{p.new_sources.production[0].active=true;},p=>{p.new_sources.production[0].licence_status='approved';},p=>{p.new_sources.production[0].code='other';},p=>{p.new_sources.production[0].internal_notes+=' approved globally';},p=>{p.new_sources.staging.push(p.source_policies.production[0]);},p=>{p.source_policies.staging.push(p.source_policies.production[0]);}]){const p=clone(plan);mutate(p);assert.throws(()=>createSourceResolver(p));}
});
test('snapshot and resolver share the exact JSON source reader with all four domain sentinels',async()=>{
  const db=database();const snapshot=await readSnapshot(db,rows,plan.scope_counts.production);
  for(const original of oldSources)assert.deepEqual(snapshot.find(row=>row.scope==='sources'&&row.payload.code===original.code).payload,original);
  const result=await createSourceResolver(plan)(db,receipt,'production');assert.equal(result.size,4);
  assert.ok(db.calls.filter(sql=>sql.startsWith('select to_jsonb(source)')).every(sql=>sql.includes('lower(code)')&&sql.includes('limit 5')&&sql.includes('base_url ilike')));
  assert.ok(!db.calls.some(sql=>sql.startsWith('select * from ingest.sources')));
});
test('production adds exactly two shared assets/two links/one inactive source and preserves26 rows',async()=>{
  const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();
  await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
  assert.equal(j.assets.length,2);assert.equal(j.links.length,2);assert.equal(j.preservation.created_assets,2);assert.equal(j.preservation.created_links,2);assert.equal(j.preservation.new_inactive_provenance_sources,1);
  assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),26);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),31);
  assert.deepEqual(db.state.sources.slice(0,3),initial.sources);assert.equal(db.state.sources[3].code,'pricecharting');assert.equal(db.state.sources[3].active,false);
  for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);
  assert.deepEqual(db.state.assets.slice(0,4),initial.assets);assert.deepEqual(db.state.links.slice(0,4),initial.links);
  for(const asset of db.state.assets.filter(asset=>asset.asset_type==='card_image'))assert.equal(asset.variant_id,null);
  assert.ok(j.links.every(link=>link.variant_id===null));
  await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only PriceCharting and fully returns22 rows after rollback',async()=>{
  const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
  assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
  await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
  assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');
  assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),22);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),27);
  assert.deepEqual(db.state,initial);assert.equal(db.calls.at(-1),'rollback');
});
test('frozen before-image drift aborts before insert; post-write metadata drift rolls back',async()=>{
  for(const mutate of [s=>{s.printings[0].native_name='changed';},s=>{s.variants[0].finish_code='first_edition';},s=>{s.assets[0].storage_key='changed';},s=>{s.links[0].asset_type='changed';},s=>{s.names[0].name='changed';},s=>{s.sources[0].updated_at='2026-10-15T16:04:18.931824+00:00';}]){
    const db=database(),p=await guardedPlan(db);mutate(db.state);
    await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
    assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));
    const after=database(),q=await guardedPlan(after),initial=clone(after.state);after.mutateAfterLinks=mutate;
    await assert.rejects(rehearse(after,()=>writeMetadata(after,rows,receipt,approval,'production',journal(),createSourceResolver(q),null,null,createMetadataGuard(q))));assert.deepEqual(after.state,initial);
  }
});
test('unknown/domain alias, preexisting or concurrent PriceCharting provenance is never adopted',async()=>{
  for(const code of ['pricecharting','PRICECHARTING','unplanned-domain-alias']){const db=database();db.state.sources.push({...clone(oldSources[0]),code,base_url:'https://www.pricecharting.com'});await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
  const db=database();db.concurrentSourceOnInsert=true;await assert.rejects(createSourceResolver(plan)(db,receipt,'production'),/concurrent/);
});
test('new full17 defaults/generated row and returned-versus-reread source cannot drift',async()=>{
  for(const mutate of [s=>{s.terms_url='unexpected';},s=>{s.rate_limit_config={limit:1};},s=>{s.robots_policy='unexpected';},s=>{s.updated_at='2026-10-15T19:45:00.123457+00:00';},s=>{s.extra='field';},s=>{s.id='not-a-uuid';}]){const db=database();db.mutateAfterSourceInsert=mutate;await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));}
  const db=database();db.mutateAfterSourceInsert=s=>{s.created_at=s.updated_at='2026-10-15T19:45:00.123457+00:00';};await assert.rejects(createSourceResolver(plan)(db,receipt,'production'),/changed before resolver/);
});
test('write failure rolls back source and partial assets and retains error semantics',async()=>{
  for(const flag of ['failSourceInsert','failLinkInsert']){const db=database(),p=await guardedPlan(db),initial=clone(db.state);db[flag]=true;await assert.rejects(rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p))),/Injected/);assert.deepEqual(db.state,initial);}
});
test('rollback binds successful shared assets and retains immutable bytes, links and inactive source',()=>{
  const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-15',preservation:{created_provenance_sources:[{code:'pricecharting',id:'cccccccc-cccc-4ccc-8ccc-000000000001',full_row_sha256:'a'.repeat(64)}]},assets:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',printing_id:rows[0].printing_id,created:true}]};
  const rollback=rollbackReceipt(success,plan),sql=rollbackSql(rollback);assert.equal(rollback.assets[0].asset_id,assetId(rows[0]));assert.equal(rollback.retained_inactive_provenance_sources[0].active,false);assert.ok(sql.includes(COHORT_SHA)&&sql.includes('a.variant_id IS NULL'));assert.ok(!sql.includes('DELETE')&&!sql.includes('UPDATE ingest.sources'));
  assert.throws(()=>rollbackReceipt({...success,status:'commit_outcome_unknown'},plan));
});
test('protected manual exact-main confirmation and private-output gates remain intact',()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_AQUAPOLIS_SHARED_FRONTS_CONFIRMATION:'PUBLISH ARTWORK AQUAPOLIS SHARED FRONTS',STACKR_ARTWORK_AQUAPOLIS_SHARED_FRONTS_PACKAGES:'/packages',STACKR_ARTWORK_AQUAPOLIS_SHARED_FRONTS_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
  assertConfig(env);
  for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_ARTWORK_AQUAPOLIS_SHARED_FRONTS_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_AQUAPOLIS_SHARED_FRONTS_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public provenance rejects private paths/commercial bodies and preserves reviewed safe bodies',()=>{
  for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{path:'D:/private/input.json'}])assert.throws(()=>publicProjection(value));
  for(const row of rows)assert.deepEqual(publicProjection(row.evidence.source_body),row.evidence.source_body);
});
