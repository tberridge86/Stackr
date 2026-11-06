import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPriceService} from './pricing.mjs';

const workerSource=await readFile('worker/index.js','utf8');
const adapterSource=workerSource.slice(workerSource.indexOf('let priceService;'),workerSource.indexOf('export default'));
const clock=Date.parse('2026-11-02T22:00:00Z');

// R2 conditional PUT returns null when its precondition fails. Reads observe the
// last completed write. Metadata and body are captured together for each GET.
function sharedR2({beforePut}={}){
 const rows=new Map();let revision=0,rejected=0;
 const unquote=value=>value?.replace(/^"|"$/g,'');
 return {
  rows,get rejected(){return rejected;},
  async get(key){const row=rows.get(key);return row?{etag:row.etag,httpEtag:'"'+row.etag+'"',version:row.etag,size:Buffer.byteLength(row.body),uploaded:new Date(clock),customMetadata:row.customMetadata||{},text:async()=>row.body}:null;},
  async put(key,value,options={}){
   await beforePut?.(key,value,options);
   const row=rows.get(key),condition=options.onlyIf;
   const matches=condition instanceof Headers?condition.get('If-Match'):condition?.etagMatches;
   const differs=condition instanceof Headers?condition.get('If-None-Match'):condition?.etagDoesNotMatch;
   if(matches&&(!row||matches!=='*'&&unquote(matches)!==row.etag)||differs&&(differs==='*'?!!row:!!row&&unquote(differs)===row.etag)){rejected++;return null;}
   const body=String(value),etag='revision-'+(++revision);rows.set(key,{body,etag,customMetadata:options.customMetadata});
   return {etag,httpEtag:'"'+etag+'"',version:etag,size:Buffer.byteLength(body)};
  }
 };
}
function fixture(count=1){
 const products=[],sources={},seeds=[];
 for(let index=0;index<count;index++){
  const id='p'+index,product={id,name:'Bundle '+index,language:'English',setKey:'set-'+index,type:'Booster bundle',packs:6,unit:'1 retail unit',edition:'standard'};
  const identity={language:product.language,setKey:product.setKey,type:product.type,packs:6,unit:product.unit,edition:'standard',cardsPerPack:null};
  products.push(product);sources[id]=[{id:'retailer',name:'Retailer',url:'https://retailer.example/'+id,country:'GB',currency:'GBP',format:'jsonld',identity,match:{titles:[product.name],requiredText:['English','6 booster packs']}}];
  seeds.push({productId:id,sourceId:'retailer',identity,currency:'GBP',marketPence:5000,observedAt:new Date(clock).toISOString(),asOf:new Date(clock).toISOString()});
 }
 return {products,sources,seeds};
}
function freshAdapter(data){
 const context=vm.createContext({createPriceService,PRICE_PRODUCTS:data.products,PRICE_SOURCES:data.sources,PRICE_SEEDS:data.seeds,Date,Response,Request,URL,Headers,crypto});
 return vm.runInContext(adapterSource+';({service,priceResponse});',context);
}
function retailDocument(product,stock='InStock'){
 return '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:product.name,description:'English 6 booster packs',offers:{'@type':'Offer',price:'50',priceCurrency:'GBP',availability:'https://schema.org/'+stock}})+'</script>';
}

test('a stale in-flight isolate cannot overwrite a newer out-of-stock withdrawal in R2',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,data=fixture(),bucket=sharedR2();
 let startB,releaseB;const bStarted=new Promise(resolve=>{startB=resolve;}),bGate=new Promise(resolve=>{releaseB=resolve;});
 Date.now=()=>clock;
 try{
  globalThis.fetch=async()=>new Response(retailDocument(data.products[0],'OutOfStock'));
  const a=freshAdapter(data).service({BUCKET:bucket});await a.getSnapshot();
  globalThis.fetch=async()=>{startB();await bGate;throw Error('Network failure');};
  const b=freshAdapter(data).service({BUCKET:bucket});await b.getSnapshot();
  const olderAttempt=b.refresh();await bStarted;
  const withdrawal=await a.refresh();assert.equal(withdrawal.products.p0.status,'unavailable');
  releaseB();const losingAttempt=await olderAttempt;
  assert.equal(losingAttempt.products.p0.status,'unavailable','A stale caller must adopt the winning withdrawal rather than display an active seed');
  assert(bucket.rejected>0,'The stale write must fail an R2 precondition');
  const restored=await freshAdapter(data).service({BUCKET:bucket}).getSnapshot();
  assert.equal(restored.products.p0.status,'unavailable','A fresh Worker must retain the definitive withdrawal');
 }finally{releaseB?.();globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('warm isolates reload the persisted batch cursor instead of repeating and regressing progress',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,data=fixture(65),bucket=sharedR2(),calls=[];
 Date.now=()=>clock;globalThis.fetch=async url=>{calls.push(url);const id=new URL(url).pathname.slice(1),product=data.products.find(p=>p.id===id);return new Response(retailDocument(product));};
 try{
  const a=freshAdapter(data).service({BUCKET:bucket}),b=freshAdapter(data).service({BUCKET:bucket});
  await a.getSnapshot();await b.getSnapshot();
  const first=await a.refresh();assert.equal(first.refreshProgress.completedSources,32);assert.equal(first.refreshPending,true);
  const second=await b.refresh();assert.equal(second.refreshProgress.completedSources,64);assert.equal(second.refreshPending,true);
  const completed=await a.refresh();assert.equal(completed.refreshPending,false);assert.equal(completed.refreshProgress.completedSources,65);
  assert.equal(calls.length,65,'Each fixed source should be retrieved once across the three persisted batches');
  assert.equal(new Set(calls).size,65);
  const restored=await freshAdapter(data).service({BUCKET:bucket}).getSnapshot();
  assert.equal(restored.refreshPending,false);assert.equal(restored.refreshProgress.completedSources,65);assert.equal(Object.values(restored.products).filter(p=>p.status==='current').length,65);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('a definitive withdrawal merges when its first conditional write loses to a failed request',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,data=fixture(),bucket=sharedR2();
 let started,release;const fetchStarted=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 Date.now=()=>clock;
 try{
  globalThis.fetch=async()=>{started();await gate;return new Response(retailDocument(data.products[0],'OutOfStock'));};
  const withdrawal=freshAdapter(data).service({BUCKET:bucket});await withdrawal.getSnapshot();
  globalThis.fetch=async()=>{throw Error('Network failure');};
  const failure=freshAdapter(data).service({BUCKET:bucket});await failure.getSnapshot();
  const pendingWithdrawal=withdrawal.refresh();await fetchStarted;
  const failedAttempt=await failure.refresh();assert.equal(failedAttempt.products.p0.status,'current','The existing dated seed may remain available on a network failure');
  release();const result=await pendingWithdrawal;
  assert(bucket.rejected>0,'The withdrawal must encounter and resolve a competing write');
  assert.equal(result.products.p0.status,'unavailable','A conditional conflict must not discard a verified stock withdrawal');
  const restored=await freshAdapter(data).service({BUCKET:bucket}).getSnapshot();assert.equal(restored.products.p0.status,'unavailable');
 }finally{release?.();globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('an older withdrawal cannot replace a newer verified in-stock observation after a conflict',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,data=fixture();let currentClock=clock,hold=true,started,release;
 const writeStarted=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const bucket=sharedR2({beforePut:async(key,body)=>{const value=JSON.parse(String(body));if(hold&&value.quotes?.['p0:retailer']?.inactive){hold=false;started();await gate;}}});
 Date.now=()=>currentClock;
 try{
  globalThis.fetch=async()=>new Response(retailDocument(data.products[0],'OutOfStock'));
  const older=freshAdapter(data).service({BUCKET:bucket});await older.getSnapshot();
  globalThis.fetch=async()=>new Response(retailDocument(data.products[0]));
  const newer=freshAdapter(data).service({BUCKET:bucket});await newer.getSnapshot();
  const oldAttempt=older.refresh();await writeStarted;
  currentClock+=1000;const current=await newer.refresh();assert.equal(current.products.p0.status,'current');assert.equal(current.products.p0.observedAt,new Date(currentClock).toISOString());
  release();const oldResult=await oldAttempt;
  assert(bucket.rejected>0,'The delayed old withdrawal must lose its original version');
  assert.equal(oldResult.products.p0.status,'current');assert.equal(oldResult.products.p0.observedAt,current.products.p0.observedAt,'The newer verified observation must retain authority');
  const restored=await freshAdapter(data).service({BUCKET:bucket}).getSnapshot();assert.equal(restored.products.p0.status,'current');assert.equal(restored.products.p0.observedAt,current.products.p0.observedAt);
 }finally{release?.();globalThis.fetch=originalFetch;Date.now=originalNow;}
});
