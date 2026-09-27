import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { assertConfig, validateEvidence, bind, payload, validateManifest, rehearse, manifest, PREFIX, SET, VERSION, PROJECTS, APPROVAL_PATH } from './publish.mjs';
const bytes = readFileSync(new URL('./cohort.json',import.meta.url));
const approval = readFileSync(new URL('../../'+APPROVAL_PATH,import.meta.url));
const rows = validateEvidence(bytes,approval);
const cards = () => rows.map(r => ({...r,game_code:'pokemon',same_artwork_as_variant_id:null}));
test('131 frozen image hashes and owner permission are bound together',() => {
  assert.equal(rows.length,131);
  assert.throws(() => validateEvidence(Buffer.concat([bytes,Buffer.from(' ')]),approval));
  assert.throws(() => validateEvidence(bytes,Buffer.concat([approval,Buffer.from(' ')])));
});
test('all English identities bind without creating or replacing cards',() => bind(rows,cards()));
for (const [name, mutate] of [
  ['Japanese artwork',c => c[0].language_code='ja'],
  ['wrong set',c => c[0].set_id=VERSION],
  ['renamed card',c => c[0].card_english_display_name='Different'],
  ['changed finish',c => c[0].finish_code='staff'],
  ['same artwork alias',c => c[0].same_artwork_as_variant_id=VERSION],
  ['missing printing',c => c.pop()],
  ['ambiguous printing',c => c[1]={...c[0]}],
  ['wrong Pocket number',c => c[0].collector_number='132'],
]) test(`rejects ${name}`,() => {const c=cards();mutate(c);assert.throws(() => bind(rows,c));});
function plan(r=rows[0]) {
  return {r,objects:['original','card-grid','search-result','detail-page'].map(role => ({role,key:`public/${role}`,sha256:r.image_sha256,byteSize:r.bytes,width:r.width,height:r.height,mimeType:role==='original'?'image/png':'image/webp'}))};
}
test('front-only payload retains Scrydex provenance and Pocket distinction',() => {
  const r=rows.find(r=>r.collector_number==='003');
  const p=payload(plan(r),'source');
  assert.equal(p.variant_id,null);assert.equal(p.recognition_reference_eligible,false);
  assert.equal(p.original_source_identifier,'tcgp-B2a-3');
  assert.equal(p.source_attribution,'Scrydex');assert.equal(p.derivative_list.length,3);
  assert.equal(JSON.parse(p.licensing_review_notes).product_scope,'pokemon_tcg_pocket');
  assert.equal(JSON.parse(p.licensing_review_notes).source_name_suffix,'EX');
  assert.equal(JSON.parse(p.licensing_review_notes).exact_finish_verified,false);
});
test('public coverage rejects conflicting images and incomplete batches',() => {
  const found=rows.map(r=>({set_id:SET,variant_id:null,printing_id:r.printing_id,asset_id:`${PREFIX}${r.printing_id}:${r.image_sha256}`,content_sha256:r.image_sha256}));
  validateManifest(rows,found,true);
  assert.throws(()=>validateManifest(rows,found.slice(1),true));
  assert.throws(()=>validateManifest(rows,[{...found[0],variant_id:rows[0].variant_id}]));
  assert.throws(()=>validateManifest(rows,[{...found[0],asset_id:'another-source'}]));
});
test('rehearsal failure always rolls back and never commits',async()=>{
  const seen=[];
  const db={query:async sql=>{seen.push(sql);if(sql.startsWith('select id from catalog.catalogue_versions'))throw new Error('schema conflict');return {rows:[]};}};
  await assert.rejects(rehearse(db,[plan()]),/schema conflict/);
  assert.equal(seen.at(-1),'rollback');assert.ok(!seen.includes('commit'));
});
test('empty target binding avoids an expensive public-view scan',async()=>{
  let count=0;const db={query:async()=>{count++;return {rows:[]};}};
  assert.deepEqual(await manifest(db,rows),[]);assert.equal(count,1);
});
test('release requires exact main, confirmation and correct database projects',()=>{
  const e={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_POCKET131_CONFIRMATION:'PUBLISH POCKET131',SUPABASE_DB_URL:`postgres://postgres@db.${PROJECTS.production}.supabase.co/postgres`,SUPABASE_STAGING_DB_URL:`postgres://postgres@db.${PROJECTS.staging}.supabase.co/postgres`};
  assertConfig(e,true);
  for(const override of [{GITHUB_REF:'refs/heads/other'},{STACKR_EXPECTED_MAIN_SHA:'b'.repeat(40)},{STACKR_POCKET131_CONFIRMATION:'YES'},{SUPABASE_DB_URL:e.SUPABASE_STAGING_DB_URL}])assert.throws(()=>assertConfig({...e,...override},true));
  assert.throws(()=>assertConfig(e,false));
});
test('protected release lane keeps the shared lock and disables unrelated deployment',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  const job=workflow.split('\n  pocket131_artwork:')[1].split('\n  deploy:')[0];
  assert.match(workflow,/group: stackr-production-deployment/);
  assert.match(workflow,/inputs\.release_scope != 'pocket131_artwork'/);
  assert.match(job,/environment: production/);assert.match(job,/test "\$EXPECTED_SHA" = "\$GITHUB_SHA"/);
  assert.match(job,/false false false false/);assert.match(job,/test -z "\$OTHER_IDENTIFIERS"/);
  assert.match(job,/publish\.mjs --execute/);assert.match(job,/secret-scan/);
});
