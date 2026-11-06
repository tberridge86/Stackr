import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPriceService, STALE_MS} from './pricing.mjs';

// Execute the actual Worker adapter against durable-object semantics without a
// browser, live retailer, or a large re-import of the image-bearing bundle.
const workerSource=await readFile('worker/index.js','utf8');
const adapter=workerSource.slice(workerSource.indexOf('let priceService;'),workerSource.indexOf('export default'));
const product={id:'black',language:'English',setKey:'black-bolt',type:'Booster bundle',packs:6,unit:'1 retail unit'};
const identity={...product,edition:'standard',cardsPerPack:null};delete identity.id;
const descriptor={id:'retailer',name:'Example UK',url:'https://retailer.example/black',format:'jsonld',country:'GB',currency:'GBP',identity,match:{titles:['Black Bolt Booster Bundle'],requiredText:['6 booster packs','English']}};
const document='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Black Bolt Booster Bundle',description:'6 booster packs in English.',offers:{'@type':'Offer',price:'69.99',priceCurrency:'GBP',availability:'https://schema.org/InStock'}})+'</script>';
function freshAdapter(){
 const context=vm.createContext({createPriceService,PRICE_PRODUCTS:[product],PRICE_SOURCES:{black:[descriptor]},PRICE_SEEDS:[],Date,Response,Request,URL});
 return vm.runInContext(adapter+';({priceResponse});',context);
}
const request=()=>new Request('https://stackr.local/api/prices');

test('weekly Worker snapshots survive fresh instances in R2 and preserve dated failures',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,values=new Map();let clock=Date.parse('2026-11-02T22:00:00Z'),calls=0,writes=0,offline=false;
 const bucket={
  get:async key=>{const entry=values.get(key);return entry?{etag:entry.etag,text:async()=>entry.body}:null;},
  put:async(key,body,options)=>{
   const existing=values.get(key),condition=options?.onlyIf;
   if(condition?.etagMatches&&existing?.etag!==condition.etagMatches||condition?.etagDoesNotMatch==='*'&&existing)return null;
   const entry={body,etag:'revision-'+(++writes)};values.set(key,entry);return {etag:entry.etag};
  }
 };
 Date.now=()=>clock;globalThis.fetch=async()=>{calls++;if(offline)throw Error('Offline');return new Response(document);};
 try{
  const first=await(await freshAdapter().priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(first.priceStorage,'r2');assert.equal(first.persistenceStatus,'stored');assert.equal(first.discountBps,1000);assert.equal(first.products.black.shopPence,6299);assert.equal(calls,1);assert.equal(writes,1);
  assert.equal(values.size,1);assert.match([...values.keys()][0],/^stackr-shop-pricing\/v2\/stackr-prices-v2-[a-f0-9]+\.json$/);
  const loaded=await(await freshAdapter().priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(loaded.persistenceStatus,'loaded');assert.equal(loaded.products.black.asOf,first.products.black.asOf);assert.equal(calls,1,'A new deployment must load the durable weekly snapshot');
  clock+=STALE_MS;offline=true;
  const failed=await(await freshAdapter().priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(failed.products.black.status,'stale');assert.equal(failed.products.black.asOf,first.products.black.asOf);assert.equal(failed.products.black.marketPence,6999);assert.equal(failed.persistenceStatus,'stored');
  const retained=await(await freshAdapter().priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(retained.products.black.status,'stale');assert.equal(retained.products.black.asOf,first.products.black.asOf);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('unavailable conditional-write metadata is reported instead of claiming durable success',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;
 Date.now=()=>Date.parse('2026-11-02T22:00:00Z');globalThis.fetch=async()=>new Response(document);
 try{
  const bucket={get:async()=>null,put:async()=>{}};
  const feed=await(await freshAdapter().priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(feed.priceStorage,'r2');assert.equal(feed.persistenceStatus,'failed');assert.equal(feed.products.black.status,'unavailable');
  const jobs=[],newWorker=await freshAdapter().priceResponse(request(),{BUCKET:bucket},{waitUntil(job){jobs.push(job);}});
  assert.equal((await newWorker.json()).products.black.status,'unavailable','Unsaved evidence cannot be invented by a fresh instance');
  await Promise.all(jobs);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('failed durable writes pause repeated retailer batches instead of retrying on every poll',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let clock=Date.parse('2026-11-02T22:00:00Z'),calls=0;
 Date.now=()=>clock;globalThis.fetch=async()=>{calls++;return new Response(document);};
 try{
  const bucket={get:async()=>null,put:async()=>{throw Error('Write unavailable');}},worker=freshAdapter();
  const first=await(await worker.priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(first.persistenceStatus,'failed');assert.equal(first.refreshing,false);assert.equal(first.nextPollSeconds,300);assert.equal(first.products.black.status,'unavailable');assert.equal(calls,1);
  assert(Date.parse(first.nextRefreshAt)>clock);
  const second=await(await worker.priceResponse(request(),{BUCKET:bucket})).json();
  assert.equal(second.persistenceStatus,'failed');assert.equal(calls,1,'The same warm instance must not re-fetch retailers during its failure backoff');
  clock+=300000;await worker.priceResponse(request(),{BUCKET:bucket});assert.equal(calls,2,'A bounded retry is allowed after the backoff');
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});
