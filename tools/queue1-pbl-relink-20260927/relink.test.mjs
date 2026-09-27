import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertConfig, validateCohort, validatePair, validatePublicSources, relinkPayload, samePayload, SOURCE_SET, TARGET_SET, VERSION, PREFIX } from './relink.mjs';
const rows=validateCohort(readFileSync(new URL('./cohort.json',import.meta.url)));
const row=rows[0];
function fixture(){
  const base={game_code:'pokemon',language_code:'en',catalogue_version_id:VERSION,collector_number:row.collector_number,card_english_display_name:row.name};
  const cards=[{...base,set_id:TARGET_SET,set_code:'PBL',printing_id:row.duplicate_printing_id,variant_id:'target',variant_code:'normal',finish_code:null},{...base,set_id:SOURCE_SET,set_code:'me05',printing_id:row.canonical_printing_id,variant_id:'source',variant_code:'normal',finish_code:'normal'}];
  const source={id:'original',asset_id:row.source_asset_id,variant_id:'source',content_sha256:row.sha256,storage_key:row.storage_key,permission_status:'approved',rights_status:'approved',publicly_servable:true,asset_visibility:'public_catalogue',retention_status:'active',asset_type:'card_image',storage_provider:'supabase_storage',storage_bucket:'stackr-catalogue-public',derivative_list:structuredClone(row.derivative_list),original_source_url:`https://assets.tcgdex.net/en/me/me05/${row.collector_number.padStart(3,'0')}/high.webp`,recognition_reference_eligible:true,byte_size:'100'};
  return {cards,source};
}
test('fixed 120-printing cohort is pinned and tamper-evident',()=>{
  assert.equal(rows.length,120);assert.throws(()=>validateCohort(Buffer.from(JSON.stringify(rows))),/changed/);
});
test('exact duplicate pair retains independent original printing IDs',()=>{
  const {cards,source}=fixture();assert.equal(validatePair(row,cards,source).printing_id,row.duplicate_printing_id);
  const payload=relinkPayload(row,source);assert.equal(payload.printing_id,row.duplicate_printing_id);assert.equal(payload.set_id,TARGET_SET);assert.equal(payload.variant_id,null);assert.equal(payload.recognition_reference_eligible,false);assert.ok(payload.asset_id.startsWith(PREFIX));assert.equal(source.variant_id,'source');assert.equal(payload.storage_key,source.storage_key);
});
for(const [label,mutate] of [
  ['foreign language',f=>f.cards[0].language_code='ja'],
  ['wrong number',f=>f.cards[0].collector_number='999'],
  ['same name different set',f=>f.cards[0].set_id=SOURCE_SET],
  ['changed name',f=>f.cards[0].card_english_display_name='Different'],
  ['finish drift',f=>f.cards[0].finish_code='holo'],
  ['reverse or stamped source',f=>{f.cards[1].variant_code='reverse_holo';f.cards[1].finish_code='reverse_holo';}],
  ['foreign provider image',f=>f.source.original_source_url='https://assets.tcgdex.net/ja/me/me05/001/high.webp'],
  ['source rights revoked',f=>f.source.permission_status='denied'],
  ['different stored bytes',f=>f.source.content_sha256='0'.repeat(64)],
  ['duplicate target binding',f=>f.cards.push({...f.cards[0]})],
])test(`rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>validatePair(row,f.cards,f.source));});
test('retries accept the exact payload but reject storage or provenance changes',()=>{
  const {source}=fixture();const a=relinkPayload(row,source);assert.equal(samePayload({...a,id:'another',byte_size:100},a),true);assert.equal(samePayload({...a,storage_key:'other'},a),false);assert.equal(samePayload({...a,recognition_reference_eligible:true},a),false);
});
test('withdrawn, replaced or rebound public sources cannot be resurrected',()=>{
  const m={asset_id:row.source_asset_id,printing_id:row.canonical_printing_id,content_sha256:row.sha256,derivative_list:row.derivative_list};
  validatePublicSources([row],[m]);assert.throws(()=>validatePublicSources([row],[]));assert.throws(()=>validatePublicSources([row],[{...m,printing_id:row.duplicate_printing_id}]));assert.throws(()=>validatePublicSources([row],[{...m,content_sha256:'0'.repeat(64)}]));
});
test('execution forbids alternate refs, targets and URL overrides',()=>{
  const env={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_PBL_CONFIRMATION:'RELINK PBL',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
  assertConfig(env,true);assert.throws(()=>assertConfig({...env,GITHUB_REF:'refs/heads/other'},true));assert.throws(()=>assertConfig({...env,SUPABASE_DB_URL:env.SUPABASE_STAGING_DB_URL},true));assert.throws(()=>assertConfig({...env,SUPABASE_DB_URL:env.SUPABASE_DB_URL+'?sslmode=disable'},true));assert.throws(()=>assertConfig(env,false));
});
test('workflow isolates relinking from broad deployment and requires the protected environment',()=>{
  const wf=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const job=wf.match(/^  pbl_artwork_links:\r?\n[\s\S]*?(?=^  [a-z_]+:\r?\n)/m)?.[0];assert.ok(job);assert.match(job,/environment: production/);assert.match(job,/expected_main_sha/);assert.match(job,/false false false false/);assert.match(wf,/inputs\.release_scope != 'pbl_artwork_links'/);assert.doesNotMatch(job,/SUPABASE_ACCESS_TOKEN|SUPABASE_PRODUCTION_SECRET_KEY|SUPABASE_STAGING_SECRET_KEY/);
});
