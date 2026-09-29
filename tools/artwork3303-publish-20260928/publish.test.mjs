import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePlan,validateApproval,bind,assertManifest,assetId,payload,rehearse,safePath,STAGE_JA,assertConfig,assertNoConflictingFronts,objectKey,publicationObjects,retryArtworkStorage,uploadImmutableArtwork} from './publish.mjs';
const bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url));
const receipt=JSON.parse(readFileSync(new URL('./plan-receipt.json',import.meta.url)));
const rows=validatePlan(bytes,receipt);
const card=r=>({...r,game_code:'pokemon',variant_id:'11111111-1111-4111-8111-111111111111',same_artwork_as_variant_id:null});
test('frozen 7911 fronts have all 23733 display objects and immutable archives',()=>{assert.equal(rows.length,7911);assert.equal(rows.flatMap(r=>r.objects).length,31644);assert.equal(receipt.artifacts.length,43);});

test('production unique storage index permits every printing including shared Energy fronts',()=>{
  const plans=rows.map(r=>payload(r,'source',receipt,{approved:true},'production'));
  assert.equal(new Set(plans.map(p=>p.storage_key)).size,7911);
  const objects=publicationObjects(rows),keys=new Set(objects.map(objectKey));
  assert.equal(objects.length,31590);
  for(const p of plans){assert.ok(keys.has(p.storage_key));for(const d of p.derivative_list)assert.ok(keys.has(d.storageKey));}
  const counts=new Map();for(const r of rows)counts.set(r.objects[0].sha256,(counts.get(r.objects[0].sha256)??0)+1);
  const hash=[...counts].find(([,count])=>count>1)[0],shared=rows.filter(r=>r.objects[0].sha256===hash);
  assert.ok(shared.length>1);
  const a=plans.find(p=>p.printing_id===shared[0].printing_id),b=plans.find(p=>p.printing_id===shared[1].printing_id);
  assert.notEqual(a.storage_key,b.storage_key);assert.equal(a.content_sha256,b.content_sha256);
  assert.deepEqual(a.derivative_list,b.derivative_list);
  assert.throws(()=>objectKey(shared[0].objects[0]),/printing identity/);
});
test('changed cohort bytes and changed digest fail',()=>{const bad=Buffer.from(bytes);bad[50]^=1;assert.throws(()=>validatePlan(bad,receipt),/Frozen/);assert.throws(()=>validatePlan(bytes,{...receipt,cohort_sha256:'0'.repeat(64)}),/Frozen/);});
test('pending owner approval cannot publish',()=>{const a=JSON.parse(readFileSync(new URL('./approval.json',import.meta.url)));assert.throws(()=>validateApproval({...a,approved:false},receipt),/pending/);});
test('Taiwan permission and exact cohort approval are both required',()=>{const a={approved:true,cohort_sha256:receipt.cohort_sha256,fronts:7911,owner_statement:'test only',approved_at:'test'};assert.throws(()=>validateApproval(a,receipt),/Taiwan/);validateApproval({...a,store_resize_display_official_tw:true,official_tw_fronts:4926},receipt);});
test('earlier 365-front Taiwan attestation cannot approve the expanded cohort',()=>{assert.throws(()=>validateApproval({approved:true,cohort_sha256:receipt.cohort_sha256,fronts:7911,store_resize_display_official_tw:true,official_tw_fronts:365,owner_statement:'test only',approved_at:'test'},receipt),/Taiwan/);});
test('individual V-UNION fronts replace the two composite images',()=>{for(const review of receipt.single_card_replacements){const r=rows.find(r=>r.printing_id===review.printing_id);assert.equal(r.source_code,'pokedata_japanese');assert.equal(r.objects[0].sha256,review.replacement_sha256);assert.ok(!rows.some(x=>x.objects[0].sha256===review.old_composite_sha256));}});
test('a supplier image reused for another named card is rejected',()=>{const r=rows.find(r=>r.printing_id==='197f2997-8652-4629-a29b-b5eda292e989');assert.ok(r);assert.throws(()=>assertNoConflictingFronts([r,{...r,collector_number:'097',card_native_name:'不良蛙'}]),/conflicting/);assert.ok(!rows.some(r=>r.printing_id==='4501ce7e-9803-477b-b21c-754effc34e21'));});
test('matching unnumbered basic energy images can retain separate deck memberships',()=>{const r=rows.find(r=>r.language_code==='zh-tw'&&r.collector_number==='DAR');assert.ok(r);assertNoConflictingFronts([r,{...r,set_code:'another-deck',card_native_name:r.card_native_name.replace(/[【】]/g,'')}]);});
test('production binding rejects changed language, name, missing identity and artwork references',()=>{const r=rows[0];bind([r],[card(r)],'production');for(const change of [{language_code:'xx'},{card_native_name:'different'},{same_artwork_as_variant_id:'existing'}])assert.throws(()=>bind([r],[{...card(r),...change}],'production'));assert.throws(()=>bind([r],[],'production'),/Missing/);});
test('only the observed staging aliases are accepted',()=>{for(const [prod,stage] of [['SM1+','SM1p'],['SM2+','SM2p'],['SM5+','SM5p'],['SM3+','SM3+'],['SM4+','SM4+']]){const r=rows.find(r=>r.set_code===prod);assert.ok(r);const c={...card(r),set_code:stage,catalogue_version_id:STAGE_JA};bind([r],[c],'staging');assert.throws(()=>bind([r],[{...c,set_code:'invented'}],'staging'));}});
test('existing public artwork blocks insertion; an exact previous release is idempotent',()=>{const r=rows[0],a={asset_id:assetId(r),printing_id:r.printing_id,variant_id:null,content_sha256:r.objects[0].sha256};assertManifest([r],[a],true);assert.throws(()=>assertManifest([r],[{...a,asset_id:'older-artwork'}]),/Existing/);assert.throws(()=>assertManifest([r],[a,a],true),/Incomplete/);});
test('payload preserves printing scope, provenance and all three roles',()=>{const r=rows[0],p=payload(r,'source',receipt,{approved:false},'staging');assert.equal(p.printing_id,r.printing_id);assert.equal(p.variant_id,null);assert.equal(p.recognition_reference_eligible,false);assert.equal(p.derivative_list.length,3);assert.equal(p.content_sha256,r.objects[0].sha256);assert.equal(p.original_source_url,r.image_url);assert.ok(!('finish_code' in p));});
test('rollback rehearsal rolls back on success and on insert failure',async()=>{for(const failure of [false,true]){const calls=[],db={query:async sql=>{calls.push(sql);}};const run=rehearse(db,async()=>{if(failure)throw Error('insert failure');});if(failure)await assert.rejects(run,/insert failure/);else await run;assert.equal(calls.at(-1),'rollback');assert.ok(!calls.includes('commit'));}});
test('archive object paths cannot escape the package directory',()=>{assert.throws(()=>safePath('/packages','../outside'));assert.throws(()=>safePath('/packages','bad\\file'));assert.throws(()=>safePath('/packages','/absolute'));});
test('publication rejects branch revisions and a wrong database',()=>{assert.throws(()=>assertConfig({GITHUB_REF:'refs/heads/topic'}),/Protected/);const env={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK3303_CONFIRMATION:'PUBLISH ARTWORK3303',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.example.com/postgres'};assert.throws(()=>assertConfig(env),/Wrong database/);});

test('storage pool exhaustion retries the same immutable upload before verifying it',async()=>{
  const calls=[],waits=[],retries=[];
  const created=await uploadImmutableArtwork(async()=>{
    calls.push('upload');return calls.length===1?{error:{statusCode:'429',message:'database error, code: 08P01'}}:{error:null};
  },async()=>{calls.push('verify');},{wait:async ms=>waits.push(ms),onRetry:r=>retries.push(r)});
  assert.equal(created,true);assert.deepEqual(calls,['upload','upload','verify']);assert.deepEqual(waits,[2000]);assert.equal(retries[0].status,429);
});
test('an upload with a lost response can resume through 409 only after byte verification',async()=>{
  let uploads=0,verified=0;
  const created=await uploadImmutableArtwork(async()=>{
    uploads++;if(uploads===1)throw new TypeError('fetch failed');return {error:{statusCode:'409'}};
  },async()=>{verified++;},{wait:async()=>{}});
  assert.equal(created,false);assert.equal(uploads,2);assert.equal(verified,1);
  await assert.rejects(uploadImmutableArtwork(async()=>({error:{statusCode:409}}),async()=>{throw Error('Object bytes changed');}),/Object bytes changed/);
});
test('SDK-wrapped network failures retry without exposing upstream messages',async()=>{
  let uploads=0;
  const created=await uploadImmutableArtwork(async()=>{uploads++;return uploads===1?{error:{message:'fetch failed'}}:{error:null};},async()=>{},{wait:async()=>{}});
  assert.equal(created,true);assert.equal(uploads,2);
});
test('a confirmed upload remains journalled if subsequent public verification fails',async()=>{
  let created=false;
  await assert.rejects(uploadImmutableArtwork(async()=>({error:null}),async uploaded=>{created=uploaded;throw Error('Public object read failed');}),/Public object read failed/);
  assert.equal(created,true);
});
test('storage authorization and input failures never retry or reach verification',async()=>{
  for(const status of [400,401,403,413]){
    let uploads=0,verified=false;
    await assert.rejects(uploadImmutableArtwork(async()=>{uploads++;return {error:{statusCode:status,message:'duplicate secret upstream response'}};},async()=>{verified=true;},{wait:async()=>assert.fail('must not retry')}),new RegExp(`HTTP ${status}`));
    assert.equal(uploads,1);assert.equal(verified,false);
  }
});
test('persistent storage throttling stops after bounded backoff',async()=>{
  let uploads=0;const waits=[];
  await assert.rejects(uploadImmutableArtwork(async()=>{uploads++;return {error:{statusCode:429}};},async()=>assert.fail('must not verify'),{wait:async ms=>waits.push(ms)}),/HTTP 429/);
  assert.equal(uploads,8);assert.deepEqual(waits,[2000,4000,8000,16000,30000,30000,30000]);
});
test('storage reads recover from transient server failures but never accept invalid bytes',async()=>{
  let calls=0;
  assert.equal(await retryArtworkStorage(async()=>{if(calls++===0)throw Object.assign(Error('read failed'),{status:503});return 'bytes';},{wait:async()=>{}}),'bytes');
  await assert.rejects(retryArtworkStorage(async()=>{throw Error('Object bytes changed');},{wait:async()=>assert.fail('must not retry')}),/Object bytes changed/);
});
