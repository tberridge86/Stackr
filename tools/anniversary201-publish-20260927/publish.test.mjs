import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertConfig, validateEvidence, bind, environmentRows, payload, validateManifest, rehearse, manifest, PREFIX, VERSIONS, PROJECTS, APPROVAL_PATH, updateCoverage } from './publish.mjs';
const bytes=readFileSync(new URL('./cohort.json',import.meta.url));
const approval=readFileSync(new URL('../../'+APPROVAL_PATH,import.meta.url));
const rows=validateEvidence(bytes,approval);
const metadata=JSON.parse(readFileSync(new URL('../newsets480-publish-20260927/cohort.json',import.meta.url)));
const cards=()=>rows.map(r=>({...r}));
test('201 frozen source images bind to the exact owner-approved population',()=>{
  assert.equal(rows.length,201);
  assert.throws(()=>validateEvidence(Buffer.concat([bytes,Buffer.from(' ')]),approval));
  assert.throws(()=>validateEvidence(bytes,Buffer.concat([approval,Buffer.from(' ')])));
  bind(rows,cards());
});
for(const [label,mutate] of [
  ['language',c=>c[0].language_code='ja'],['set',c=>c[0].set_id=VERSIONS.en],
  ['native name',c=>c[0].card_native_name='Other'],['finish',c=>c[0].finish_code='staff'],
  ['artwork alias',c=>c[0].same_artwork_as_variant_id=VERSIONS.en],
  ['missing printing',c=>c.pop()],['duplicate printing',c=>c[1]={...c[0]}],
  ['printed number',c=>c[0].collector_number='999']
])test(`rejects changed ${label}`,()=>{const c=cards();mutate(c);assert.throws(()=>bind(rows,c));});
test('Classic repeated printed numbers and all RGB cards have distinct images',()=>{
  const repeated=rows.filter(r=>r.set_code==='30C-CLASSIC' && r.collector_number==='106');
  assert.equal(repeated.length,3);assert.equal(new Set(repeated.map(r=>r.image_sha256)).size,3);
  assert.deepEqual(repeated.map(r=>r.provider_id).sort(),['me55c-106','me55c-106m','me55c-106p']);
  for(const lang of ['en','ja'])assert.equal(rows.filter(r=>r.language_code===lang && ['R','G','B'].includes(r.collector_number)).length,3);
});
test('Japanese LEGEND halves are individually reviewed and not the old combined source',()=>{
  const halves=rows.filter(r=>['m6a_ja-151','m6a_ja-152'].includes(r.provider_id));
  assert.equal(halves.length,2);assert.notEqual(halves[0].image_sha256,halves[1].image_sha256);
  assert.ok(halves.every(r=>r.visual_identity_checked && r.width<r.height && r.image_url.startsWith('https://images.scrydex.com/')));
});
test('staging uses its existing Japanese identities while production IDs remain frozen',()=>{
  const stage=environmentRows(rows,'staging',metadata),prod=environmentRows(rows,'production',metadata);
  assert.ok(stage.some((r,i)=>r.printing_id!==prod[i].printing_id));
  for(let i=0;i<rows.length;i++)assert.equal(prod[i].printing_id,rows[i].printing_id);
  assert.equal(new Set(stage.map(r=>r.printing_id)).size,201);
});
function plan(r=rows[0]){return {r,objects:['original','card-grid','search-result','detail-page'].map(role=>({role,key:`public/${role}`,sha256:r.image_sha256,byteSize:r.bytes,width:r.width,height:r.height,mimeType:role==='original'?'image/png':'image/webp'}))};}
test('artwork stays at printing-front scope with three derivatives and no recognition approval',()=>{
  for(const r of [rows[0],rows.find(r=>r.language_code==='ja')]){
    const p=payload(plan(r),'source');assert.equal(p.set_id,r.set_id);assert.equal(p.printing_id,r.printing_id);
    assert.equal(p.variant_id,null);assert.equal(p.recognition_reference_eligible,false);
    assert.equal(p.derivative_list.length,3);assert.equal(p.original_source_identifier,r.provider_id);
    assert.equal(JSON.parse(p.licensing_review_notes).product_scope,'pokemon_tcg_physical');
  }
});
test('public manifest rejects a cross-language version, conflict, or incomplete batch',()=>{
  // Match the actual public view: there is no language_code field.
  const found=rows.map(r=>({set_id:r.set_id,variant_id:null,printing_id:r.printing_id,catalogue_version_id:r.catalogue_version_id,asset_id:`${PREFIX}${r.printing_id}:${r.image_sha256}`,content_sha256:r.image_sha256}));
  validateManifest(rows,found,true);
  for(const bad of [found.slice(1),[{...found[0],catalogue_version_id:VERSIONS.ja}], [{...found[0],asset_id:'other'}]])assert.throws(()=>validateManifest(rows,bad,true));
});
test('both rehearsals roll back on failure; production does not replay catalogue DDL',async()=>{
  for(const env of ['staging','production']){
    const seen=[];const db={query:async q=>{seen.push(q);if(q.startsWith('select printing_id'))throw Error('catalogue unavailable');return {rows:[]};}};
    await assert.rejects(rehearse(db,[plan()],env,metadata,'bad migration',{}));
    assert.equal(seen.at(-1),'rollback');assert.ok(!seen.includes('commit'));
    if(env==='production')assert.ok(!seen.some(q=>q.includes('supabase_migrations')||q.startsWith('alter ')));
  }
});
test('coverage uses 161 + 30 English and 10 stored + 166 reference Japanese fronts',async()=>{
  const queries=[];const db={query:async(sql,args)=>{queries.push(args);return {rows:[{set_id:args[1]}]};}};
  const summary=await updateCoverage(db,rows,metadata,'production');
  assert.deepEqual(summary.map(s=>[s.stored_fronts,s.official_references,s.total]),[[161,0,161],[10,166,176],[30,0,30]]);
  assert.equal(queries.length,3);
  await assert.rejects(updateCoverage(db,rows.slice(1),metadata,'production'),/denominator/);
});
test('empty asset targets avoid public-view scan',async()=>{let count=0;const db={query:async()=>{count++;return {rows:[]};}};assert.deepEqual(await manifest(db,rows),[]);assert.equal(count,1);});
test('protected release requires exact main and target projects',()=>{
  const e={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ANNIVERSARY201_CONFIRMATION:'PUBLISH ANNIVERSARY201',SUPABASE_DB_URL:`postgres://postgres@db.${PROJECTS.production}.supabase.co/postgres`,SUPABASE_STAGING_DB_URL:`postgres://postgres@db.${PROJECTS.staging}.supabase.co/postgres`};
  assertConfig(e,true);
  for(const x of [{GITHUB_REF:'refs/heads/other'},{STACKR_EXPECTED_MAIN_SHA:'b'.repeat(40)},{STACKR_ANNIVERSARY201_CONFIRMATION:'YES'},{SUPABASE_DB_URL:e.SUPABASE_STAGING_DB_URL}])assert.throws(()=>assertConfig({...e,...x},true));
  assert.throws(()=>assertConfig(e,false));
});
test('release scope preserves production protection, shared lock and unrelated-deployment exclusions',()=>{
  const w=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const job=w.split('\n  anniversary201_artwork:')[1].split('\n  deploy:')[0];
  assert.match(w,/group: stackr-production-deployment/);assert.match(w,/inputs\.release_scope != 'anniversary201_artwork'/);
  for(const pattern of [/environment: production/,/test "\$EXPECTED_SHA" = "\$GITHUB_SHA"/,/false false false false/,/test -z "\$OTHER_IDENTIFIERS"/,/publish\.mjs --execute/,/secret-scan/])assert.match(job,pattern);
});
