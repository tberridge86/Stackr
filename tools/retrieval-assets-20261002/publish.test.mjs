import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyPackage, assertExecutionEnvironment, readObject, applyAssociations } from './publish.mjs';
test('frozen payload decodes and binds exactly nine cache copies plus M5 original and three sizes', async () => {
  const plan = await verifyPackage();
  assert.equal(plan.objects.filter(o => o.oldKey).length, 9);
  for (const a of plan.cacheAssets) {
    assert.equal(a.derivative_list.length, a.after.length);
    for (let i = 0; i < a.after.length; i++) {
      assert.deepEqual({ ...a.after[i], storageKey: a.derivative_list[i].storageKey }, a.derivative_list[i]);
      assert.ok(plan.objects.some(o => o.oldKey === a.derivative_list[i].storageKey && o.key === a.after[i].storageKey && o.sha256 === a.after[i].contentSha256));
    }
  }
  assert.deepEqual(plan.m5.asset.derivative_list.map(d => d.role).sort(), ['card-grid', 'detail-page', 'search-result']);
});
test('production execution rejects local calls, wrong SHA, wrong database and non-main branches', () => {
  const head = 'a'.repeat(40);
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: head, STACKR_EXPECTED_MAIN_SHA: head, STACKR_RETRIEVAL_CONFIRMATION: 'PUBLISH RETRIEVAL REPAIRS',
    SUPABASE_DB_URL: 'postgres://postgres.oakdbbzdqwurpjnoqhmu@example.invalid/db', SUPABASE_PRODUCTION_SECRET_KEY: 'test-only' };
  assert.doesNotThrow(() => assertExecutionEnvironment(env, head));
  for (const [key, value] of [['GITHUB_ACTIONS','false'],['GITHUB_EVENT_NAME','push'],['GITHUB_REF','refs/heads/other'],
    ['STACKR_EXPECTED_MAIN_SHA','b'.repeat(40)],['SUPABASE_DB_URL','postgres://staging.invalid/db'],['STACKR_RETRIEVAL_CONFIRMATION','']]) {
    assert.throws(() => assertExecutionEnvironment({ ...env, [key]: value }, head));
  }
  assert.throws(() => assertExecutionEnvironment(env, 'b'.repeat(40)));
});
test('existing protected workflow isolates the retrieval asset lane', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  assert.match(workflow, /options: \[retrieval_assets,/);
  assert.match(workflow, /release_scope != 'retrieval_assets'/);
  const job = workflow.split('  retrieval_assets:')[1].split('  backend_only:')[0];
  assert.match(job, /environment: production/);
  assert.match(job, /test "\$FORBIDDEN_FLAGS" = 'false false false false'/);
  assert.match(job, /test -z "\$OTHER_IDENTIFIERS"/);
  assert.doesNotMatch(job, /railway up|eas update|wrangler deploy|run:.*apply-migration/);
});
function fixture(plan) {
  const common = { asset_visibility:'public_catalogue', publicly_servable:true, retention_status:'active',
    permission_status:'approved', rights_status:'approved', deleted_at:null, deprecated_at:null };
  return [...plan.cacheAssets.map(a=>({...common,id:a.id,variant_id:a.variantId,storage_provider:'supabase_storage',derivative_list:a.derivative_list})),
    {...common,id:plan.m5.id,variant_id:plan.m5.variantId,printing_id:plan.m5.printingId,storage_provider:'external_reference',storage_key:null,
      derivative_list:[],original_source_url:plan.m5.asset.original_source_url,source_attribution:'pokemon_card_jp_official',updated_at:plan.m5.beforeUpdatedAt}];
}
function fakeDatabase(initial, failOnUpdate=Infinity) {
  let committed=structuredClone(initial), pending, updates=0;
  const calls=[];
  return { calls, rows:()=>committed, async query(sql, params) {
    calls.push(sql);
    if(sql==='begin') pending=structuredClone(committed);
    else if(sql==='commit') {committed=pending; pending=null;}
    else if(sql==='rollback') pending=null;
    else if(sql.startsWith('select')) return {rows:structuredClone(pending ?? committed)};
    else if(sql.startsWith('update')) {
      if(++updates===failOnUpdate) throw new Error('simulated interrupted write');
      const row=pending.find(r=>r.id===params[0]);
      if(params.length===2) row.derivative_list=JSON.parse(params[1]);
      else {row.storage_provider='supabase_storage';row.storage_key=params[2];row.derivative_list=JSON.parse(params[8]);}
      return {rowCount:1};
    }
    return {rows:[]};
  }};
}
test('transaction validates every identity before writing and rolls back partial failures', async()=>{
  const plan=await verifyPackage(), original=fixture(plan);
  const bad=structuredClone(original); bad[3].variant_id=original[0].variant_id;
  const changed=fakeDatabase(bad);
  await assert.rejects(applyAssociations(changed,plan,async()=>{}));
  assert.equal(changed.calls.filter(x=>x.startsWith('update')).length,0);
  assert.equal(changed.calls.at(-1),'rollback');
  const interrupted=fakeDatabase(original,3);
  await assert.rejects(applyAssociations(interrupted,plan,async()=>{}));
  assert.deepEqual(interrupted.rows(),original);
  assert.equal(interrupted.calls.at(-1),'rollback');
});
test('resume accepts exactly published bindings without issuing another update',async()=>{
  const plan=await verifyPackage(), db=fakeDatabase(fixture(plan));
  await applyAssociations(db,plan,async()=>{});
  assert.equal(db.calls.filter(x=>x.startsWith('update')).length,4);
  await applyAssociations(db,plan,async()=>{});
  assert.equal(db.calls.filter(x=>x.startsWith('update')).length,4);
  const stale=fixture(plan); stale[1].rights_status='pending';
  await assert.rejects(applyAssociations(fakeDatabase(stale),plan,async()=>{}));
});
test('public verification rejects malformed headers and altered bytes',async()=>{
  const plan=await verifyPackage(), o=plan.objects[0], bytes=await readFile(new URL('./payload/'+o.file,import.meta.url));
  const response=(body,header)=>async()=>new Response(body,{headers:{'cache-control':header}});
  await assert.rejects(readObject(o,false,response(bytes,'public, max-age=public, max-age=31536000, immutable')));
  await assert.rejects(readObject(o,false,response(new Uint8Array([1,2,3]),'public, max-age=31536000')));
  assert.equal((await readObject(o,false,response(bytes,'public, max-age=31536000'))).sha256,o.sha256);
});
