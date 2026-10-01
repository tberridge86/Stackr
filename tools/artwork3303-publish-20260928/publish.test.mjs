import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePlan,validateApproval,bind,assertManifest,assetId,payload,rehearse,safePath,STAGE_JA,assertConfig,assertNoConflictingFronts,objectKey,publicationObjects,uploadImmutable,writeMetadata} from './publish.mjs';
const bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url));
const receipt=JSON.parse(readFileSync(new URL('./plan-receipt.json',import.meta.url)));
const rows=validatePlan(bytes,receipt);
const card=r=>({...r,game_code:'pokemon',variant_id:'11111111-1111-4111-8111-111111111111',same_artwork_as_variant_id:null});

test('catalogue correction and artwork failure roll back in the same rehearsal transaction',async()=>{
  let total=38;const calls=[];const journal={assets:[],links:[],metadata_changes:0};
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')total=38;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  const correction=async()=>{total=53;return [{table:'catalog.sets',column:'printed_total',changed:true,before:38,after:53}];};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt,{},'staging',journal,async()=>new Map(),correction)),/asset binding unavailable/);
  assert.equal(total,38);assert.equal(calls.at(-1),'rollback');assert.equal(journal.metadata_changes,1);
  assert.equal(journal.catalogue_corrections[0].environment,'staging');
});

test('all 53 native corrections are journalled and roll back when later artwork binding fails',async()=>{
  let nativeWrites=0;const calls=[];const journal={assets:[],links:[],metadata_changes:0,native_name_corrections:[]};
  const audit=Array.from({length:53},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')nativeWrites=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  const nativeCorrection=async()=>{nativeWrites=53;return audit;};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt,{},'staging',journal,async()=>new Map(),null,nativeCorrection)),/asset binding unavailable/);
  assert.equal(nativeWrites,0);assert.equal(calls.at(-1),'rollback');assert.equal(journal.metadata_changes,53);assert.deepEqual(journal.native_name_correction_counts,{total:53,changed:53,printing_changes:53,card_name_changes:53});assert.deepEqual(journal.native_name_corrections,audit);
});

test('native correction audits require 53 unique environment-scoped printing and name identities',async()=>{
  const valid=Array.from({length:53},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:false,environment:'production'}));
  for(const audit of [valid.slice(1),valid.map((entry,index)=>index===52?{...entry,id:valid[0].id}:entry),valid.map((entry,index)=>index===52?{...entry,environment:'staging'}:entry)]){
    const db={query:async()=>{throw Error('must not reach asset queries');}};
    await assert.rejects(writeMetadata(db,[],receipt,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit),/native-name correction audit/i);
  }
});

test('receipt-bound 72 correction audit journals and rolls back with later artwork failure',async()=>{
  const receipt72={...receipt,native_name_corrections:72};let writes=0;const calls=[];const journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:72},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt72,{},'staging',journal,async()=>new Map(),null,async()=>{writes=72;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:72,changed:72,printing_changes:72,card_name_changes:72});
});

test('a 72-receipt rejects a truncated native correction audit before asset work',async()=>{
  const receipt72={...receipt,native_name_corrections:72};const audit=Array.from({length:71},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:false,environment:'production'}));
  const db={query:async()=>{throw Error('must not reach asset queries');}};
  await assert.rejects(writeMetadata(db,[],receipt72,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit),/native-name correction audit/i);
});

test('receipt-bound 70 correction audit journals and rolls back with later artwork failure',async()=>{
  const receipt70={...receipt,native_name_corrections:70};let writes=0;const calls=[];const journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:70},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt70,{},'staging',journal,async()=>new Map(),null,async()=>{writes=70;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:70,changed:70,printing_changes:70,card_name_changes:70});
});

test('a 70-receipt rejects a truncated native correction audit before asset work',async()=>{
  const receipt70={...receipt,native_name_corrections:70};const audit=Array.from({length:69},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:false,environment:'production'}));
  const db={query:async()=>{throw Error('must not reach asset queries');}};
  await assert.rejects(writeMetadata(db,[],receipt70,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit),/native-name correction audit/i);
});

test('receipt-bound 74 correction audit journals and rolls back with later artwork failure',async()=>{
  const receipt74={...receipt,native_name_corrections:74};let writes=0;const calls=[];const journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:74},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt74,{},'staging',journal,async()=>new Map(),null,async()=>{writes=74;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:74,changed:74,printing_changes:74,card_name_changes:74});
});

test('a 74-receipt rejects a truncated native correction audit before asset work',async()=>{
  const receipt74={...receipt,native_name_corrections:74};const audit=Array.from({length:73},(_,index)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${index}`,native_name_row_id:`name-${index}`,before:`old-${index}`,after:`new-${index}`,changed:false,environment:'production'}));
  const db={query:async()=>{throw Error('must not reach asset queries');}};
  await assert.rejects(writeMetadata(db,[],receipt74,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit),/native-name correction audit/i);
});

test('receipt-bound 81 corrections roll back with artwork failure and reject a truncated audit',async()=>{
  const receipt81={...receipt,native_name_corrections:81};let writes=0;const calls=[],journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:81},(_,i)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${i}`,native_name_row_id:`name-${i}`,before:`old-${i}`,after:`new-${i}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt81,{},'staging',journal,async()=>new Map(),null,async()=>{writes=81;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:81,changed:81,printing_changes:81,card_name_changes:81});
  const forbidden={query:async()=>{throw Error('must not reach asset queries');}};
  await assert.rejects(writeMetadata(forbidden,[],receipt81,{},'staging',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit.slice(1)),/native-name correction audit/i);
});

test('receipt-bound 97 corrections roll back with artwork failure and reject a truncated audit',async()=>{
  const receipt97={...receipt,native_name_corrections:97};let writes=0;const calls=[],journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:97},(_,i)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${i}`,native_name_row_id:`name-${i}`,before:`old-${i}`,after:`new-${i}`,changed:true,environment:'staging'}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt97,{},'staging',journal,async()=>new Map(),null,async()=>{writes=97;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:97,changed:97,printing_changes:97,card_name_changes:97});
  const forbidden={query:async()=>{throw Error('must not reach asset queries');}};
  await assert.rejects(writeMetadata(forbidden,[],receipt97,{},'staging',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>audit.slice(1)),/native-name correction audit/i);
});

test('omitted correction leaves the old metadata path unchanged',async()=>{
  const journal={assets:[],links:[],metadata_changes:0},calls=[];
  const db={query:async(sql)=>{calls.push(sql);return {rows:[]};}};
  await writeMetadata(db,[],receipt,{},'production',journal,async()=>new Map());
  assert.equal(journal.metadata_changes,0);assert.equal(journal.catalogue_corrections,undefined);
  assert.ok(calls.every(sql=>sql.startsWith('select')));
});

test('idempotent correction records evidence without counting a metadata mutation',async()=>{
  const journal={assets:[],links:[],metadata_changes:0};
  const db={query:async()=>({rows:[]})};
  await writeMetadata(db,[],receipt,{},'production',journal,async()=>new Map(),async()=>[{table:'catalog.sets',column:'printed_total',changed:false,before:53,after:53}]);
  assert.equal(journal.metadata_changes,0);assert.equal(journal.catalogue_corrections.length,1);
});

test('unexpected correction audit stops before any asset query',async()=>{
  for(const audit of [[],[{table:'catalog.sets',column:'total',changed:true}],[{table:'pricing.cards',column:'printed_total',changed:true}]]){
    const db={query:async()=>{throw Error('must not reach asset queries');}};
    await assert.rejects(writeMetadata(db,[],receipt,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),async()=>audit),/Invalid bounded catalogue correction audit/);
  }
});
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

test('transient storage rejection retries the immutable upload with bounded backoff',async()=>{
  let calls=0;const waits=[];
  assert.equal(await uploadImmutable(async()=>++calls<3?{error:{statusCode:'429',code:'DatabaseError'}}:{error:null},async ms=>waits.push(ms)),true);
  assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
});
test('retry can encounter an already-created object without overwriting it',async()=>{
  let calls=0;
  assert.equal(await uploadImmutable(async()=>++calls===1?{error:{statusCode:503}}:{error:{statusCode:409,message:'already exists'}},async()=>{}),false);
  assert.equal(calls,2);
});

test('edge 520 failures retry and recover an ambiguous immutable upload',async()=>{
  let calls=0;const waits=[];
  assert.equal(await uploadImmutable(async()=>++calls===1?{error:{statusCode:'520'}}:{error:null},async ms=>waits.push(ms)),true);
  assert.equal(calls,2);assert.deepEqual(waits,[1000]);
  calls=0;
  // A failed response can follow a successful write. Never overwrite its bytes:
  // the caller must still verify the public object's frozen hash and dimensions.
  assert.equal(await uploadImmutable(async()=>++calls===1?{error:{statusCode:520}}:{error:{statusCode:409,message:'already exists'}},async()=>{}),false);
  assert.equal(calls,2);
});
test('authentication, permanent errors and exhausted uploads stop before publication',async()=>{
  for(const status of [401,403,400,413,429,520]){
    let calls=0;const waits=[];
    await assert.rejects(uploadImmutable(async()=>{calls++;return {error:{statusCode:status,message:status===403?'already exists':'provider detail not copied'}};},async ms=>waits.push(ms)),new RegExp(`HTTP ${status}`));
    const retries=status===429||status===520;
    assert.equal(calls,retries?4:1);assert.deepEqual(waits,retries?[1000,2000,4000]:[]);
  }
});
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

test('receipt-bound Native97 variant-name audit journals 193 rows and rolls back with later artwork failure',async()=>{
  const receipt97={...receipt,native_name_corrections:97,native_search_name_rows:193};let writes=0;const calls=[],journal={assets:[],links:[],metadata_changes:0};
  const audit=Array.from({length:97},(_,i)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${i}`,before:`old-${i}`,after:`new-${i}`,changed:true,environment:'staging',native_name_rows:[{id:`name-${i}-a`,variant_id:`variant-${i}-a`,changed:true},...(i<96?[{id:`name-${i}-b`,variant_id:`variant-${i}-b`,changed:true}]:[])]}));
  const db={query:async(sql)=>{calls.push(sql);if(sql==='rollback')writes=0;if(sql.startsWith('select game_code'))throw Error('asset binding unavailable');return {rows:[]};}};
  await assert.rejects(rehearse(db,()=>writeMetadata(db,[rows[0]],receipt97,{},'staging',journal,async()=>new Map(),null,async()=>{writes=193;return audit;})),/asset binding unavailable/);
  assert.equal(writes,0);assert.equal(calls.at(-1),'rollback');assert.deepEqual(journal.native_name_correction_counts,{total:97,changed:97,printing_changes:97,card_name_changes:193,native_search_name_rows:193});assert.equal(journal.metadata_changes,97);assert.equal(journal.native_name_corrections.flatMap(a=>a.native_name_rows).length,193);
});

test('Native97 multi-row audit rejects truncated, extra, wrong-variant, mixed-change, and lossy entries before asset work',async()=>{
  const receipt97={...receipt,native_name_corrections:97,native_search_name_rows:193};
  const audit=Array.from({length:97},(_,i)=>({table:'catalog.card_printings',column:'native_name',id:`printing-${i}`,before:`old-${i}`,after:`new-${i}`,changed:false,environment:'production',native_name_rows:[{id:`name-${i}-a`,variant_id:`variant-${i}-a`,changed:false},...(i<96?[{id:`name-${i}-b`,variant_id:`variant-${i}-b`,changed:false}]:[])]}));
  const invalid=[audit.slice(1),audit.map((entry,i)=>i===0?{...entry,native_name_rows:entry.native_name_rows.slice(1)}:entry),audit.map((entry,i)=>i===0?{...entry,native_name_rows:[{...entry.native_name_rows[0],variant_id:entry.native_name_rows[1]?.variant_id??'duplicate'}]}:entry),audit.map((entry,i)=>i===0?{...entry,native_name_rows:[{...entry.native_name_rows[0],changed:true},entry.native_name_rows[1]]}:entry),audit.map((entry,i)=>i===0?{...entry,native_name_row_id:'lossy'}:entry)];
  for(const bad of invalid){const db={query:async()=>{throw Error('must not reach asset queries');}};await assert.rejects(writeMetadata(db,[],receipt97,{},'production',{assets:[],links:[],metadata_changes:0},async()=>new Map(),null,async()=>bad),/native-name correction audit/i);}
});
