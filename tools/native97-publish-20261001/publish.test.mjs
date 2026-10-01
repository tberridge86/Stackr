import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,validateRow,correctionPlan,frozenConstants,exceptionLedger,validateApproval,sourcesFor,assertConfig} from './publish.mjs';
import {TCGPLAYER_SOURCE} from '../native96-publish-20260930/publish.mjs';

const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
const bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url));
const receipt=read('./plan-receipt.json');
const rows=JSON.parse(gunzipSync(bytes));
const plan=correctionPlan();
const constants=frozenConstants();
const ledger=exceptionLedger();
const validate=r=>validateRow(r,ledger.get(r.printing_id),constants,plan);

test('frozen VS1 scope is exactly 97 fronts, 97 repairs, no unchanged names, and 388 objects',()=>{
  assert.equal(validatePlan(bytes,receipt).length,97);
  assert.equal(plan.length,97);
  assert.equal(plan.flatMap((row) => row.expected_native_name_rows.staging).length,193);
  assert.equal(plan.flatMap((row) => row.expected_native_name_rows.production).length,193);
  assert.equal(rows.filter(r=>r.metadata_correction_required).length,97);
  assert.deepEqual(rows.filter(r=>!r.metadata_correction_required),[]);
  assert.equal(rows.flatMap(r=>r.objects).length,388);
  for(const d of [{fronts:96},{native_name_corrections:96},{derivative_references:290},{object_references:387},{unchanged_native_names:1}]) assert.throws(()=>validatePlan(bytes,{...receipt,...d}));
});

test('VS1 review, source group, denominator, and repair bindings reject drift',()=>{
  const sample=rows[0];
  validate(sample);
  for(const mutate of [
    r=>r.evidence.provider_group_id=24179,
    r=>r.evidence.independent_visual_review.observed_printed_number=`${r.collector_number}/140`,
    r=>r.set_id='00000000-0000-4000-8000-000000000000',
    r=>r.evidence.independent_visual_review.source_url='https://example.com',
    r=>r.card_native_name='wrong',
    r=>r.metadata_correction_required=false,
  ]) { const changed=structuredClone(sample);mutate(changed);assert.throws(()=>validate(changed)); }
});

test('repair-plan, source provenance, object identity, and approval scope reject tampering',()=>{
  const sample=rows[0], index=plan.findIndex(p=>p.printing_id===sample.printing_id);
  validate(sample);
  for(const delta of [{proposed_native_name:'wrong'},{source_url:'https://example.com'},{original_sha256:'f'.repeat(64)},{observed_printed_number:'001/999'},{reviewer:'other'}]) {
    const changed=structuredClone(plan);Object.assign(changed[index],delta);assert.throws(()=>validateRow(sample,ledger.get(sample.printing_id),constants,changed));
  }
  for(const mutate of [r=>r.source_code='other',r=>r.evidence.provider_id='bad',r=>r.objects[1].file='../bad.webp',r=>r.objects[0].mime_type='image/png',r=>r.objects[2].role='original',r=>r.objects[3].artifact_id=1,r=>r.objects[0].width=0]) {
    const changed=structuredClone(sample);mutate(changed);assert.throws(()=>validate(changed));
  }
  const approval=read('./approval.json');
  for(const delta of [{approved:false},{store_resize_display:false},{source_wide_approval:true},{native_name_corrections:96},{source_counts:{tcgplayer_card_artwork:96}}]) assert.throws(()=>validateApproval({...approval,...delta}));
});

test('all VS1 members are repairs; a no-repair boundary is rejected',()=>{
  assert(rows.every(r=>r.metadata_correction_required));
  const sample=structuredClone(rows[0]);
  sample.metadata_correction_required=false;
  assert.throws(()=>validate(sample));
  const alteredPlan=plan.filter(p=>p.printing_id!==sample.printing_id);
  assert.throws(()=>validateRow(rows[0],ledger.get(rows[0].printing_id),constants,alteredPlan));
});

test('approval, config, and source resolver remain constrained',async()=>{
  const approval=read('./approval.json');validateApproval(approval);
  for(const delta of [{fronts:96},{native_name_corrections:96},{source_wide_approval:true}]) assert.throws(()=>validateApproval({...approval,...delta}));
  assert.throws(()=>assertConfig({}));
  const calls=[];
  const db={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('select')?[{...TCGPLAYER_SOURCE,id:'ja'}]:[]};}};
  assert.equal((await sourcesFor(db,receipt,'production')).size,1);
  assert.equal((await sourcesFor(db,receipt,'staging')).size,1);
  assert.equal(calls.filter(x=>x.startsWith('insert')).length,1);
});
