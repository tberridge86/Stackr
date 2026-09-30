import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validatePlan,validateApproval,assertConfig,sourcesFor,COHORT_SHA} from './publish.mjs';
import {publicationObjects,assertManifest,assetId,bind} from '../artwork3303-publish-20260928/publish.mjs';
import {gunzipSync} from 'node:zlib';
import {APPROVAL_PATH,APPROVAL_SHA} from '../mep89-publish-20260927/publish.mjs';
import {rehearse} from '../artwork3303-publish-20260928/publish.mjs';
const receipt=JSON.parse(readFileSync(new URL('./plan-receipt.json',import.meta.url))),bytes=readFileSync(new URL('./cohort.json.gz',import.meta.url)),rows=validatePlan(bytes,receipt);
test('49 recovered fronts exclude the provider card back and completed 7911 cohort',()=>{
  assert.equal(publicationObjects(rows).length,196);assert.ok(!rows.some(r=>r.provider_id==='hsp-HGSS18'));
  const original=JSON.parse(gunzipSync(readFileSync(new URL('../artwork3303-publish-20260928/cohort.json.gz',import.meta.url))));
  const published=new Set(original.map(r=>r.printing_id));assert.ok(rows.every(r=>!published.has(r.printing_id)));
});
test('archive or cohort drift is rejected',()=>{assert.throws(()=>validatePlan(Buffer.concat([bytes,Buffer.from('x')]),receipt));assert.throws(()=>validatePlan(bytes,{...receipt,artifacts:[{...receipt.artifacts[0],id:1}]}));});
test('a prior or absent owner attestation cannot approve these 49 fronts',()=>{const pending=JSON.parse(readFileSync(new URL('./approval.json',import.meta.url)));assert.throws(()=>validateApproval({...pending,approved:false}));const valid={approved:true,store_resize_display:true,fronts:49,cohort_sha256:COHORT_SHA,source_code:'scrydex',language_code:'en',source_wide_approval:false,owner_statement:'Test fixture only',approved_at:'test'};validateApproval(valid);for(const x of [{fronts:89},{cohort_sha256:'old'},{source_wide_approval:true},{language_code:'ja'},{owner_statement:null}])assert.throws(()=>validateApproval({...valid,...x}));});
test('branch deployment and wrong confirmation are rejected',()=>{assert.throws(()=>assertConfig({}));assert.throws(()=>assertConfig({STACKR_ENGLISH49_CONFIRMATION:'PUBLISH ENGLISH49',GITHUB_REF:'refs/heads/topic'}));});
test('existing card fronts block publication and identities cannot drift',()=>{const r=rows[0];assert.throws(()=>assertManifest([r],[{printing_id:r.printing_id,asset_id:'existing',variant_id:null,content_sha256:r.objects[0].sha256}]));assertManifest([r],[{printing_id:r.printing_id,asset_id:assetId(r),variant_id:null,content_sha256:r.objects[0].sha256}],true);assert.throws(()=>bind([r],[{...r,game_code:'pokemon',language_code:'ja'}],'production'));});
test('source access is read-only and activation drift is rejected',async()=>{const calls=[];await assert.rejects(sourcesFor({query:async sql=>{calls.push(sql);return {rows:[{active:true}]};}}));assert.equal(calls.length,1);assert.match(calls[0],/^select /);});

const sourceFixture={id:'fixture',source_type:'image',base_url:'https://scrydex.com',active:false,licence_status:'under_review',deprecated_at:null,internal_notes:`Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; ${APPROVAL_PATH}; ${APPROVAL_SHA}. No source-wide approval.`};
test('absent staging provenance is temporary and rolled back with the rehearsal',async()=>{
  let source=null;const calls=[];
  const db={query:async(sql,args)=>{calls.push(sql);if(sql.startsWith('insert into ingest.sources')){assert.deepEqual(args,[sourceFixture.internal_notes]);assert.match(sql,/on conflict\(code\) do nothing$/);source={...sourceFixture};}if(sql==='rollback')source=null;return {rows:sql.startsWith('select')&&source?[source]:[]};}};
  await rehearse(db,async()=>assert.equal((await sourcesFor(db,receipt,'staging')).get('scrydex'),'fixture'));
  assert.equal(source,null);assert.equal(calls.at(-1),'rollback');
});
test('production never creates or updates provenance, including when missing',async()=>{
  for(const existing of [[],[sourceFixture],[{...sourceFixture,active:true}],[{...sourceFixture,internal_notes:'changed'}]]){
    const calls=[];const db={query:async sql=>{calls.push(sql);return {rows:existing};}};
    if(existing[0]===sourceFixture)assert.equal((await sourcesFor(db,receipt,'production')).get('scrydex'),'fixture');else await assert.rejects(sourcesFor(db,receipt,'production'));
    assert.equal(calls.length,1);assert.match(calls[0],/^select /);
  }
});
test('conflicting staging source is not overwritten and rehearsal rolls back',async()=>{
  const calls=[];const db={query:async sql=>{calls.push(sql);return {rows:sql.startsWith('select')?[{...sourceFixture,active:true}]:[]};}};
  await assert.rejects(rehearse(db,()=>sourcesFor(db,receipt,'staging')));assert.equal(calls.at(-1),'rollback');assert.ok(!calls.some(sql=>/update /i.test(sql)));
});
