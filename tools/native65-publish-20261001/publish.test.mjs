import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,validateRow,correctionPlan,frozenConstants,exceptionLedger,validateApproval,sourcesFor,assertConfig} from './publish.mjs';
import {TCGPLAYER_SOURCE} from '../native96-publish-20260930/publish.mjs';
import {SOURCE as KOREAN_SOURCE} from '../korean232-publish-20260930/publish.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url)),receipt=read('./plan-receipt.json'),rows=JSON.parse(gunzipSync(bytes)),constants=frozenConstants(),plan=correctionPlan(),ledger=exceptionLedger();
const validate=r=>validateRow(r,ledger.get(r.printing_id),constants,plan);
test('65-front frozen scope has 53 repairs, 12 unchanged names and 260 objects',()=>{
 assert.equal(validatePlan(bytes,receipt).length,65);assert.equal(plan.length,53);
 assert.equal(rows.filter(r=>r.metadata_correction_required).length,53);
 assert.deepEqual(rows.reduce((a,r)=>(a[r.language_code]=(a[r.language_code]??0)+1,a),{}),{ja:58,ko:7});
 assert.equal(rows.flatMap(r=>r.objects).length,260);
 assert.throws(()=>validatePlan(Buffer.concat([bytes,Buffer.from('x')]),receipt));
 for(const delta of [{native_name_corrections:52},{fronts:66},{object_references:259},{corrections_sha256:'0'.repeat(64)},{artifacts:[{...receipt.artifacts[0],id:1}]}])assert.throws(()=>validatePlan(bytes,{...receipt,...delta}));
});
test('native-name old/new guards reject wrong repairs and wrong unchanged names',()=>{
 for(const sample of [rows.find(r=>r.metadata_correction_required),rows.find(r=>!r.metadata_correction_required)]){
  for(const mutate of [r=>r.card_native_name='wrong',r=>r.previous_native_name='wrong',r=>r.metadata_correction_required=!r.metadata_correction_required]){const changed=structuredClone(sample);mutate(changed);assert.throws(()=>validate(changed));}
 }
 const changedPlan=structuredClone(plan);changedPlan[0].proposed_native_name='wrong';
 const row=rows.find(r=>r.printing_id===plan[0].printing_id);assert.throws(()=>validateRow(row,ledger.get(row.printing_id),constants,changedPlan));
});
test('historical failed-name reviews only pass with exact corresponding repair',()=>{
 const held=rows.filter(r=>r.evidence.independent_visual_review.passed===false);assert.equal(held.length,8);
 for(const row of held){validate(row);assert.throws(()=>validateRow(row,ledger.get(row.printing_id),constants,plan.filter(p=>p.printing_id!==row.printing_id)));}
});
test('E2/009 is the single explicit suffix alias and cannot cover a name mismatch',()=>{
 const row=rows.find(r=>r.set_code==='E2'&&r.collector_number==='009');assert.ok(row);validate(row);assert.equal(row.metadata_correction_required,false);
 const changed=structuredClone(row);changed.evidence.independent_visual_review.accepted_title_suffix='-008/092';assert.throws(()=>validate(changed));
});
test('literal visual review and source mutations reject for both languages',()=>{
 for(const language of ['ja','ko']){
  const sample=rows.find(r=>r.language_code===language);
  for(const mutate of [r=>r.language_code='en',r=>r.set_id='00000000-0000-4000-8000-000000000001',r=>r.image_url='https://example.com/wrong.png',r=>r.evidence.independent_visual_review.observed_native_title='wrong',r=>r.evidence.independent_visual_review.observed_printed_number='999/999',r=>r.evidence.independent_visual_review.source_url='https://example.com',r=>r.evidence.independent_visual_review.original_sha256='a'.repeat(64),r=>r.evidence.independent_visual_review.reviewer='unverified']){
   const changed=structuredClone(sample);mutate(changed);assert.throws(()=>validate(changed));
  }
 }
});
test('archive path, role, dimensions and source provenance cannot drift',()=>{
 for(const mutate of [r=>r.objects[0].sha256='b'.repeat(64),r=>r.objects[1].file='../other/image.webp',r=>r.objects[1].file=r.objects[1].file.replace('prepared/','acquired/'),r=>r.objects[2].role='original',r=>r.objects[3].artifact_id=1,r=>r.objects[1].width=0,r=>r.objects[0].mime_type='image/png',r=>r.evidence.provider_category_id=3]){
  const changed=structuredClone(rows.find(r=>r.language_code==='ja'));mutate(changed);assert.throws(()=>validate(changed));
 }
});
test('approval and exact protected branch confirmation stay bounded',()=>{
 const a=read('./approval.json');validateApproval(a);
 for(const delta of [{native_name_corrections:54},{approved:false},{store_resize_display:false},{source_wide_approval:true},{fronts:64},{corrections_sha256:'0'.repeat(64)},{source_counts:{tcgplayer_card_artwork:65}}])assert.throws(()=>validateApproval({...a,...delta}));
 assert.throws(()=>assertConfig({}));assert.throws(()=>assertConfig({STACKR_NATIVE65_CONFIRMATION:'PUBLISH NATIVE65',GITHUB_REF:'refs/heads/topic'}));
});
test('production sources are read-only and staging inserts cannot alter policy',async()=>{
 for(const env of ['staging','production']){
  const calls=[],db={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('select')?[{...TCGPLAYER_SOURCE,id:'ja'},{...KOREAN_SOURCE,id:'ko'}]:[]};}};
  assert.equal((await sourcesFor(db,receipt,env)).size,2);assert.equal(calls.length,env==='staging'?3:1);
  for(const call of calls.filter(c=>c.sql.startsWith('insert'))){assert.match(call.sql,/on conflict\(code\) do nothing/);assert.doesNotMatch(call.sql,/\bupdate\b/i);}
 }
 for(const delta of [{active:true},{licence_status:'approved'},{attribution_required:false},{deprecated_at:'2026-10-01'}]){
  const db={query:async()=>({rows:[{...TCGPLAYER_SOURCE,...delta,id:'ja'},{...KOREAN_SOURCE,id:'ko'}]})};await assert.rejects(()=>sourcesFor(db,receipt,'production'));
 }
});
