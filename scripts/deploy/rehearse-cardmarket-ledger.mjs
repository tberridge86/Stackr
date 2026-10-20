import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerifiedSupabasePostgresClient} from './verified-supabase-postgres.mjs';
import {CARDMARKET_LEDGER_SIGNATURE,PRICE_GUARD_STAGING_PROJECT,rehearsePriceIdentityGuard} from './rehearse-price-identity-guard-core.mjs';
const canonical=JSON.parse(readFileSync('docs/releases/pricing-identity-guard-canonical-baseline-20261006.json','utf8'));
const candidate={
 path:'docs/releases/pricing-cardmarket-ledger-candidate-20261006.sql',
 sourceLfSha256:'6ea53be5d373faea6db7a4fff3445b497f952919f3d3b7fdf745865ff5b39ff0',
 predecessorDefinitionMd5:'8a23b5ed8bfb28bfc3bc38650f973f89',
 candidateDefinitionMd5:'0b412ef55657e19e5bd606a387fcdbaf'
};
const baseline=canonical.targetBaselines.find(row=>row.project===PRICE_GUARD_STAGING_PROJECT);
const source=readFileSync(candidate.path,'utf8');
assert.equal(process.env.SUPABASE_PROJECT_REF,PRICE_GUARD_STAGING_PROJECT,'price_guard_target_mismatch');
assert.equal(process.env.STACKR_DEPLOYMENT_ENVIRONMENT,'staging','price_guard_environment_mismatch');
assert(process.env.STACKR_SOURCE_DB_URL,'price_guard_database_url_missing');
let address;
try{address=new URL(process.env.STACKR_SOURCE_DB_URL);}catch{throw Error('price_guard_database_address_invalid');}
assert(address.hostname==='db.'+PRICE_GUARD_STAGING_PROJECT+'.supabase.co'||(address.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(address.username).endsWith('.'+PRICE_GUARD_STAGING_PROJECT)),'price_guard_database_address_mismatch');
const connection=createVerifiedSupabasePostgresClient(process.env.STACKR_SOURCE_DB_URL,'stackr-cardmarket-ledger-rehearsal',{statement_timeout:8000,query_timeout:10000});
const client={query:(...args)=>connection.query(...args),exec:text=>connection.query(text)};
let connected=false;
try{
 await connection.connect();connected=true;
 const result=await rehearsePriceIdentityGuard({client,projectRef:PRICE_GUARD_STAGING_PROJECT,signature:CARDMARKET_LEDGER_SIGNATURE,candidate,baseline,migrationSql:source,
 readCanary:async client=>{
  for(const role of ['anon','authenticated']){
   await client.exec('savepoint cardmarket_denial');
   let denied=false;
   try{await client.exec('set local role '+role);await client.query('select * from api.list_reviewed_cardmarket_printing_mappings(0,100)');}
   catch(error){denied=error.code==='42501';}
   finally{await client.exec('rollback to savepoint cardmarket_denial;release savepoint cardmarket_denial');}
   assert(denied,'price_guard_public_read_access_drift');
  }
  await client.exec('set local role service_role');
  let failed=false;
  try{
   for(const cap of [0,501,null]){
    const invalid=await client.query('select * from api.list_reviewed_cardmarket_printing_mappings(0,$1)',[cap]);
    assert.equal(invalid.rows.length,0,'price_guard_read_limit_drift');
   }
   const pages=[];let after=0;
   for(let page=0;page<2;page++){
    const result=await client.query('select * from api.list_reviewed_cardmarket_printing_mappings($1,100)',[after]);
    assert.equal(result.rows.length,100,'price_guard_canary_incomplete');
    for(const row of result.rows){
     const product=Number(row.cardmarket_product_id);
     assert(Number.isSafeInteger(product)&&product>after,'price_guard_ledger_cursor_drift');
     assert.equal(row.cardmarket_category_id,51,'price_guard_category_drift');
     for(const key of ['printing_id','catalogue_version_id'])assert(/^[a-f0-9-]{36}$/.test(row[key]),'price_guard_identity_drift');
     for(const key of ['language_evidence','variant_evidence','finish_evidence'])assert(row[key]&&typeof row[key]==='object'&&!Array.isArray(row[key]),'price_guard_evidence_missing');
     assert(String(row.review_reference??'').trim(),'price_guard_review_missing');
     after=product;
    }
    pages.push({rows:result.rows});
   }
   return pages;
  }catch(error){failed=true;throw error;}
  finally{if(!failed)await client.exec('reset role');}
 }});
 console.log(JSON.stringify({...result,canaryPages:result.canaryCount,canaryMappings:200,fullLedgerCompletion:false,sourceCandidatePath:candidate.path}));
}catch(error){
 const code=/^[A-Z0-9_]{1,32}$/.test(String(error?.code))?String(error.code):'PRICE_GUARD_REHEARSAL_FAILED';
 const message=String(error?.message??'').split('\n')[0];
 console.error(JSON.stringify({ok:false,rollbackOnly:true,projectRef:PRICE_GUARD_STAGING_PROJECT,code,gate:/^price_guard_[a-z0-9_]{1,80}$/.test(message)?message:'unknown'}));
 process.exitCode=1;
}finally{if(connected)await connection.end();}
