import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {classifyCataloguePricing,mainClassifyCataloguePricing} from './classify-catalogue-pricing.mjs';

const versions=[{id:'publication',language_code:'en'}];
const complete={totalPublishedVariants:3,classified:3,catalogueVersions:versions};
const cursor='00000000-0000-4000-8000-000000000002';
const stub=(pages,coverage=complete)=>({schema:()=>({rpc:async(name)=>({data:name==='store_pricing_classification_page'?pages.shift():coverage})})});
const result=await classifyCataloguePricing(stub([{processed:2,complete:false,nextAfter:cursor},{processed:1,complete:true}]),{pageSize:2,log:()=>{}});
assert.equal(result.processed,3);assert.equal(result.pages,2);
await assert.rejects(classifyCataloguePricing(stub([{processed:0,complete:false,nextAfter:cursor}]),{log:()=>{}}),/cursor/);
await assert.rejects(classifyCataloguePricing(stub([{processed:500,complete:false,nextAfter:cursor},{processed:500,complete:false,nextAfter:cursor}]),{log:()=>{}}),/cursor/);
await assert.rejects(classifyCataloguePricing(stub([{processed:1,complete:true}],{...complete,classified:2}),{log:()=>{}}),/unprocessed/);
let reads=0;
await assert.rejects(classifyCataloguePricing({schema:()=>({rpc:async(name)=>({data:name==='store_pricing_classification_page'?{processed:1,complete:true}:{...complete,catalogueVersions:++reads===1?versions:[]}})})},{log:()=>{}}),/Publication changed/);
await assert.rejects(mainClassifyCataloguePricing([]),/approved server write lane/);

// Exercise the real offline CLI with the production lane flag present. A fixture
// must still make no DB writes, even after the ingestion finally hook.
const dir=mkdtempSync(join(tmpdir(),'stackr-classification-fixture-'));
try {
 const file=join(dir,'fixture.json');const at=new Date().toISOString();
 writeFileSync(file,JSON.stringify({candidates:[],group:{categoryId:3,groupId:1},products:[],prices:[],datasetAt:at,fx:{rate:0.75,at,source:'fixture'}}));
 const child=spawnSync(process.execPath,['scripts/refresh-catalogue-bulk-prices.mjs',`--fixture=${file}`],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,STACKR_CATALOGUE_BULK_PRICING_ENABLED:'true'}});
 assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout.trim()).providerCalls,0);
 const disabled=spawnSync(process.execPath,['scripts/cardmarket-daily-worker.mjs'],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,STACKR_CARDMARKET_DAILY_WORKER_ENABLED:'false',STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED:'true'}});
 assert.equal(disabled.status,1);assert.match(disabled.stderr,/daily worker is disabled/);
 assert.doesNotMatch(disabled.stderr,/Classification failed/,'a disabled daily worker must not reach classification');
} finally {rmSync(dir,{recursive:true});}
console.log('Classification worker: bounded cursors, frozen publication, complete denominator, guarded writes and offline fixture isolation passed.');
