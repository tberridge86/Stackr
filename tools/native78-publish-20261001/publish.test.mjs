import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,validateRow,correctionPlan,frozenConstants,exceptionLedger,validateApproval,sourcesFor,assertConfig} from './publish.mjs';
import {TCGPLAYER_SOURCE} from '../native96-publish-20260930/publish.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url)),receipt=read('./plan-receipt.json'),rows=JSON.parse(gunzipSync(bytes)),constants=frozenConstants(),plan=correctionPlan(),ledger=exceptionLedger();
const validate=r=>validateRow(r,ledger.get(r.printing_id),constants,plan);
test('frozen 78-front E2/E3 scope binds 74 repairs, four unchanged names and 312 objects',()=>{
 assert.equal(validatePlan(bytes,receipt).length,78);assert.equal(plan.length,74);assert.equal(rows.filter(r=>r.metadata_correction_required).length,74);assert.equal(rows.filter(r=>!r.metadata_correction_required).length,4);assert.deepEqual(rows.reduce((a,r)=>(a[r.language_code]=(a[r.language_code]??0)+1,a),{}),{ja:78});assert.deepEqual(rows.reduce((a,r)=>(a[`${r.language_code}/${r.set_code}`]=(a[`${r.language_code}/${r.set_code}`]??0)+1,a),{}),{'ja/E2':4,'ja/E3':74});assert.equal(rows.flatMap(r=>r.objects).length,312);
 for(const delta of [{native_name_corrections:73},{fronts:77},{object_references:311},{derivative_references:233},{corrections_sha256:'0'.repeat(64)}])assert.throws(()=>validatePlan(bytes,{...receipt,...delta}));
});
test('review evidence, exact repair names, number, source and original checksum are bound',()=>{
 const sample=rows[0];validate(sample);
 for(const mutate of [r=>r.card_native_name='wrong',r=>r.previous_native_name='wrong',r=>r.evidence.independent_visual_review.observed_native_title='wrong',r=>r.evidence.independent_visual_review.observed_printed_number='001/999',r=>r.evidence.independent_visual_review.original_sha256='a'.repeat(64),r=>r.evidence.independent_visual_review.visual_identity_verified=false,r=>r.evidence.independent_visual_review.metadata_correction_required=false,r=>r.evidence.independent_visual_review.source_url='https://example.com']){const changed=structuredClone(sample);mutate(changed);assert.throws(()=>validate(changed));}
 const changedPlan=structuredClone(plan);changedPlan[0].proposed_native_name='wrong';assert.throws(()=>validateRow(sample,ledger.get(sample.printing_id),constants,changedPlan));
 for(const delta of [{source_url:'https://example.com'},{original_sha256:'f'.repeat(64)},{observed_printed_number:'004/129'},{reviewer:'unverified'}]){const changed=structuredClone(plan);Object.assign(changed[0],delta);assert.throws(()=>validateRow(sample,ledger.get(sample.printing_id),constants,changed));}
});

test('source, object paths, MIME and protected approval cannot broaden',()=>{
 for(const mutate of [r=>r.evidence.provider_group_id=1,r=>r.evidence.source_url='https://example.com',r=>r.objects[1].file='../bad.webp',r=>r.objects[0].mime_type='image/png',r=>r.objects[2].role='original',r=>r.objects[3].artifact_id=1,r=>r.objects[0].width=0]){const changed=structuredClone(rows[0]);mutate(changed);assert.throws(()=>validate(changed));}
 const a=read('./approval.json');for(const delta of [{approved:false},{store_resize_display:false},{source_wide_approval:true},{native_name_corrections:71},{source_counts:{tcgplayer_card_artwork:73}}])assert.throws(()=>validateApproval({...a,...delta}));
});

test('four correct E3 names remain unchanged with exact review identities',()=>{
 const unchanged=rows.filter(r=>!r.metadata_correction_required);assert.deepEqual(unchanged.map(r=>r.set_code+'/'+r.collector_number).sort(),['E3/078','E3/083','E3/085','E3/087']);
 for(const sample of unchanged){validate(sample);for(const mutate of [r=>r.card_native_name='wrong',r=>r.previous_native_name='wrong',r=>r.metadata_correction_required=true,r=>r.evidence.independent_visual_review.metadata_correction_required=true,r=>r.evidence.independent_visual_review.set_id='00000000-0000-4000-8000-000000000000',r=>r.evidence.independent_visual_review.observed_native_title='wrong']){const r=structuredClone(sample);mutate(r);assert.throws(()=>validate(r));}}
 assert.throws(()=>validatePlan(bytes,{...receipt,unchanged_native_names:3}));
});

test('repair identities and E2/E3 source groups and denominators cannot cross',()=>{
 for(const code of ['E2','E3']){const sample=rows.find(r=>r.set_code===code&&r.metadata_correction_required),index=plan.findIndex(p=>p.printing_id===sample.printing_id);validate(sample);
  for(const delta of [{set_id:'00000000-0000-4000-8000-000000000000'},{set_code:'E1'},{language_code:'en'},{collector_number:'999'}]){const changed=structuredClone(plan);Object.assign(changed[index],delta);assert.throws(()=>validateRow(sample,ledger.get(sample.printing_id),constants,changed));}
  for(const mutate of [r=>r.evidence.provider_group_id=code==='E2'?23732:23731,r=>r.evidence.independent_visual_review.observed_printed_number=r.collector_number+'/'+(code==='E2'?'087':'092'),r=>r.evidence.independent_visual_review.set_id='00000000-0000-4000-8000-000000000000']){const r=structuredClone(sample);mutate(r);assert.throws(()=>validate(r));}
 }
});
test('approval/config and one-source resolver remain bounded',async()=>{
 const a=read('./approval.json');validateApproval(a);assert.throws(()=>validateApproval({...a,fronts:73}));assert.throws(()=>assertConfig({}));assert.throws(()=>assertConfig({STACKR_NATIVE72_CONFIRMATION:'PUBLISH NATIVE72',GITHUB_REF:'refs/heads/topic'}));
 for(const env of ['staging','production']){const calls=[],db={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('select')?[{...TCGPLAYER_SOURCE,id:'ja'}]:[]};}};assert.equal((await sourcesFor(db,receipt,env)).size,1);assert.equal(calls.length,env==='staging'?2:1);assert.equal(calls.filter(x=>x.sql.startsWith('insert')).length,env==='staging'?1:0);}
 for(const delta of [{active:true},{licence_status:'approved'},{attribution_required:false},{deprecated_at:'2026-10-01'}])await assert.rejects(()=>sourcesFor({query:async()=>({rows:[{...TCGPLAYER_SOURCE,...delta,id:'ja'}]})},receipt,'production'));
});
