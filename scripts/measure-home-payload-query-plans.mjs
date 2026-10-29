import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCollectionSummaryDatabase } from './test-fixtures/collection-summary-db.mjs';
// Local PostgreSQL only: no credentials or hosted connection.
const columns = 'id,binder_id,card_id,set_id,language,api_card_id,api_set_id,card_name,card_number,image_url,set_name,set_total,slot_order,owned,owned_quantity,condition,grade_company,grade,notes,created_at';
const {db,add,clear,asUser,binder,saved,userB} = await createCollectionSummaryDatabase();
const output = {environment:'Local in-memory PGlite synthetic RLS fixture',executedAnalysis:true,hostedPlan:false,pageSize:500,newIndexes:[],
 limitations:['Synthetic row widths and approximate existing RLS/index shapes; not production plans.','Each page runs once under EXPLAIN ANALYZE plus a separate verification SELECT; timings are not a cold/warm benchmark.','JSON bytes cover saved-card query results, not HTTP compression or the Home screen.'],cohorts:[]};
try {
 await db.exec(`alter table public.binder_cards
 add column api_card_id text, add column api_set_id text, add column card_name text default 'Synthetic card',
 add column card_number text default '001', add column image_url text default 'https://example.invalid/card.webp',
 add column set_name text default 'Synthetic set', add column set_total integer default 2000,
 add column notes text default 'Retained private note', add column created_at timestamptz default '2026-10-25T00:00:00Z',
 add column ebay_price numeric default 12.34, add column cardmarket_price numeric default 10.25,
 add column last_price_update timestamptz default '2026-10-25T00:00:00Z',
 add column cert_number text default 'fixture-certificate', add column slab_image_url text default 'https://example.invalid/private-slab.webp',
 add column graded_value numeric default 50, add column graded_at timestamptz, add column owned_card_variant_id uuid,
 add column lifecycle_version integer default 1;`);
 for (const [name,count,languages] of [['empty',0,['en']],['small',24,['en']],['large',1702,['en']],['multilingual',250,['en','ja','zh-cn','zh-tw','ko']]]) {
  await clear();
  const own=count?languages.map((language,i)=>binder(i+1,{language})):[];
  const foreign=binder(99,{user_id:userB});
  await add('binders',[...own,foreign]);
  await add('binder_cards',[...Array.from({length:count},(_,i)=>saved(i+100,own[i%own.length].id,languages[i%languages.length]+':'+i,{language:languages[i%languages.length]})),
   ...Array.from({length:10000},(_,i)=>saved(i+100000,foreign.id,'foreign:'+i))]);
  await db.exec('analyze public.binders; analyze public.binder_cards');
  await asUser();
  const scope=own.map(b=>b.id), result={name,ownRows:count,foreignRows:10000,variants:[]};
  let baseline;
  for (const [label,projection] of [['before','*'],['after',columns]]) {
   const query='select '+projection+' from public.binder_cards where binder_id=any($1::uuid[]) order by id limit 500 offset $2';
   const rows=[],pages=[]; let jsonBytes=0;
   if(scope.length) for(let offset=0;;) {
    const plan=(await db.query('explain (analyze,buffers,format json) '+query,[scope,offset])).rows[0]['QUERY PLAN'][0];
    const page=(await db.query(query,[scope,offset])).rows;
    assert.equal(plan.Plan['Actual Rows'],page.length);
    jsonBytes+=Buffer.byteLength(JSON.stringify(page)); pages.push({offset,plan}); rows.push(...page);
    if(!page.length)break; offset+=page.length;
   }
   assert.equal(rows.length,count);
   if(label==='before')baseline=rows;
   else assert.deepEqual(rows,baseline.map(row=>Object.fromEntries(columns.split(',').map(k=>[k,row[k]]))));
   result.variants.push({label,query,returnedRows:rows.length,jsonBytes,analyzedPageExecutions:pages.length,verificationPageExecutions:pages.length,
    totalExecutionMs:pages.reduce((sum,p)=>sum+p.plan['Execution Time'],0),
    firstPage:pages[0]??null,lastDataPage:pages.length>1?pages.at(-2):null,emptyProofPage:pages.at(-1)??null});
  }
  await asUser(userB);
  assert.equal((await db.query('select '+columns+' from public.binder_cards where binder_id=any($1::uuid[])',[scope])).rows.length,0);
  result.foreignAccountExcluded=true; output.cohorts.push(result);
 }
 console.log(JSON.stringify(output,null,2));
}finally{await db.close();}
