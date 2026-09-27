import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertConfig, validateCohort, validatePair, validatePublicSources, relinkPayload, samePayload, copyKey, copyObjects, targetManifest, SOURCE_SET, TARGET_SET, VERSION, PREFIX } from './relink.mjs';
const rows=validateCohort(readFileSync(new URL('./cohort.json',import.meta.url)));
const row=rows[0];
function fixture(){
  const base={game_code:'pokemon',language_code:'en',catalogue_version_id:VERSION,collector_number:row.collector_number,card_english_display_name:row.name};
  const cards=[{...base,set_id:TARGET_SET,set_code:'PBL',printing_id:row.duplicate_printing_id,variant_id:'target',variant_code:'normal',finish_code:null},{...base,set_id:SOURCE_SET,set_code:'me05',printing_id:row.canonical_printing_id,variant_id:'source',variant_code:'normal',finish_code:'normal'}];
  const source={id:'original',asset_id:row.source_asset_id,variant_id:'source',content_sha256:row.sha256,storage_key:row.storage_key,permission_status:'approved',rights_status:'approved',publicly_servable:true,asset_visibility:'public_catalogue',retention_status:'active',asset_type:'card_image',storage_provider:'supabase_storage',storage_bucket:'stackr-catalogue-public',derivative_list:structuredClone(row.derivative_list),original_source_url:`https://assets.tcgdex.net/en/me/me05/${row.collector_number.padStart(3,'0')}/high.webp`,recognition_reference_eligible:true,byte_size:'100'};
  return {cards,source,front:{id:'me05-'+row.collector_number.padStart(3,'0'),localId:row.collector_number.padStart(3,'0'),name:row.name,set:{id:'me05'},image:`https://assets.tcgdex.net/en/me/me05/${row.collector_number.padStart(3,'0')}`}};
}
test('fixed 120-printing cohort is pinned and tamper-evident',()=>{
  assert.equal(rows.length,120);assert.throws(()=>validateCohort(Buffer.from(JSON.stringify(rows))),/changed/);
});
test('exact duplicate pair retains independent original printing IDs',()=>{
  const {cards,source,front}=fixture();assert.equal(validatePair(row,cards,source,front).printing_id,row.duplicate_printing_id);
  const payload=relinkPayload(row,source);assert.equal(payload.printing_id,row.duplicate_printing_id);assert.equal(payload.set_id,TARGET_SET);assert.equal(payload.variant_id,null);assert.equal(payload.recognition_reference_eligible,false);assert.ok(payload.asset_id.startsWith(PREFIX));assert.equal(source.variant_id,'source');assert.notEqual(payload.storage_key,source.storage_key);assert.equal(payload.storage_key,copyKey(row));assert.deepEqual(payload.derivative_list,source.derivative_list);
});
for(const [label,mutate] of [
  ['foreign language',f=>f.cards[0].language_code='ja'],
  ['wrong number',f=>f.cards[0].collector_number='999'],
  ['same name different set',f=>f.cards[0].set_id=SOURCE_SET],
  ['changed name',f=>f.cards[0].card_english_display_name='Different'],
  ['finish drift',f=>f.cards[0].finish_code='holo'],
  ['named stamp source',f=>{f.cards[1].variant_code='staff';f.cards[1].finish_code='staff';}],
  ['withdrawn provider descriptor',f=>f.front=undefined],
  ['wrong live image reference',f=>f.front.image+='-reverse'],
  ['foreign provider image',f=>f.source.original_source_url='https://assets.tcgdex.net/ja/me/me05/001/high.webp'],
  ['source rights revoked',f=>f.source.permission_status='denied'],
  ['different stored bytes',f=>f.source.content_sha256='0'.repeat(64)],
  ['duplicate target binding',f=>f.cards.push({...f.cards[0]})],
])test(`rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>validatePair(row,f.cards,f.source,f.front));});
test('retries accept the exact payload but reject storage or provenance changes',()=>{
  const {source}=fixture();const a=relinkPayload(row,source);assert.equal(samePayload({...a,id:'another',byte_size:100},a),true);assert.equal(samePayload({...a,storage_key:'other'},a),false);assert.equal(samePayload({...a,recognition_reference_eligible:true},a),false);
});
test('withdrawn, replaced or rebound public sources cannot be resurrected',()=>{
  const m={asset_id:row.source_asset_id,set_id:SOURCE_SET,printing_id:row.canonical_printing_id,content_sha256:row.sha256,derivative_list:row.derivative_list};
  validatePublicSources([row],[m]);assert.throws(()=>validatePublicSources([row],[]));assert.throws(()=>validatePublicSources([row],[{...m,printing_id:row.duplicate_printing_id}]));assert.throws(()=>validatePublicSources([row],[{...m,content_sha256:'0'.repeat(64)}]));
  assert.throws(()=>validatePublicSources([row],[{...m,set_id:TARGET_SET}]));
});

test('empty target bindings do not scan the public manifest',async()=>{
  let calls=0;const db={query:async()=>{calls++;return {rows:[]};}};
  assert.deepEqual(await targetManifest(db,[row],fixture().cards),[]);assert.equal(calls,1);
});

test('bounded public read retains conflicting target bindings and excludes unrelated overrides',async()=>{
  const {cards}=fixture();let calls=0;
  const target={set_id:TARGET_SET,printing_id:row.duplicate_printing_id,asset_id:'conflicting-artwork'};
  const wrongSet={set_id:SOURCE_SET,printing_id:row.duplicate_printing_id,asset_id:'wrong-set'};
  const db={query:async(sql,params)=>{
    calls++;
    if(calls===1){assert.deepEqual(params,[VERSION,TARGET_SET,[row.duplicate_printing_id],['target']]);return {rows:[{id:'candidate'}]};}
    assert.match(sql,/asset_row_id=any/);assert.deepEqual(params,[['candidate'],VERSION]);
    return {rows:[target,wrongSet,{set_id:SOURCE_SET,printing_id:row.canonical_printing_id,asset_id:'unrelated'}]};
  }};
  assert.deepEqual(await targetManifest(db,[row],cards),[target,wrongSet]);
});
test('execution forbids alternate refs, targets and URL overrides',()=>{
  const env={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_PBL_CONFIRMATION:'RELINK PBL',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
  assertConfig(env,true);assert.throws(()=>assertConfig({...env,GITHUB_REF:'refs/heads/other'},true));assert.throws(()=>assertConfig({...env,SUPABASE_DB_URL:env.SUPABASE_STAGING_DB_URL},true));assert.throws(()=>assertConfig({...env,SUPABASE_DB_URL:env.SUPABASE_DB_URL+'?sslmode=disable'},true));assert.throws(()=>assertConfig(env,false));
});
test('workflow isolates relinking from broad deployment and requires the protected environment',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const job=wf.match(/^  pbl_artwork_links:\r?\n[\s\S]*?(?=^  [a-z_]+:\r?\n)/m)?.[0];assert.ok(job);assert.match(job,/environment: production/);assert.match(job,/expected_main_sha/);assert.match(job,/false false false false/);assert.match(wf,/inputs\.release_scope != 'pbl_artwork_links'/);assert.match(job,/SUPABASE_PRODUCTION_SECRET_KEY/);assert.doesNotMatch(job,/SUPABASE_STAGING_SECRET_KEY/);
});

test('120 copied originals preserve hashes and have distinct immutable keys',()=>{
  const keys=rows.map(copyKey);assert.equal(new Set(keys).size,120);
  for(let i=0;i<rows.length;i++){assert.notEqual(keys[i],rows[i].storage_key);assert.ok(keys[i].includes(rows[i].sha256));assert.ok(keys[i].includes(rows[i].duplicate_printing_id));}
  assert.throws(()=>copyKey({...row,storage_key:'outside/original.jpg'}));
  assert.throws(()=>copyKey({...row,duplicate_printing_id:'../unsafe'}));
});

test('copy plans retain original provenance and reject mismatched source bytes',()=>{
  const {source}=fixture();const [o]=copyObjects([row],[source]);assert.equal(o.sourceKey,source.storage_key);assert.equal(o.key,copyKey(row));assert.equal(o.sha256,source.content_sha256);assert.equal(o.byteSize,100);
  assert.throws(()=>copyObjects([row],[{...source,content_sha256:'0'.repeat(64)}]));
  const p=relinkPayload(row,source);assert.equal(p.storage_key,p.storage_path);assert.equal(p.storage_key,p.archival_storage_key);assert.ok(p.url.endsWith(p.storage_key));assert.equal(p.original_source_url,source.original_source_url);
});

test('a reverse-associated asset is usable only as a provider-verified generic printing front',()=>{
  const f=fixture();f.cards[1].variant_code='reverse_holo';f.cards[1].finish_code='reverse_holo';
  assert.throws(()=>validatePair(row,f.cards,f.source));validatePair(row,f.cards,f.source,f.front);
  const p=relinkPayload(row,f.source);assert.equal(p.variant_id,null);assert.equal(JSON.parse(p.licensing_review_notes).exactFinishVerified,false);
});
