import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBinderService} from './binders.mjs';
const SET='258cb8e5-c769-540d-9e3c-40d4ed4dafdb';
function transport({duplicate=false}={}){
 const calls=[];
 const fetchImpl=async(input,init)=>{
  if(init.redirect==='error')throw new TypeError('Unsupported redirect mode: error');
  const url=new URL(input);calls.push({url,init});assert.equal(init.redirect,'manual');assert.equal(init.method,'GET');assert.equal(url.origin,'https://api.stackrtcg.com');assert.deepEqual(Object.keys(init.headers).sort(),['Accept','User-Agent']);
  let data,meta={apiVersion:'1',generatedAt:'2026-11-05T08:30:00Z'};
  if(url.pathname==='/v1/sets')data={sets:[{setId:SET}]};
  else if(url.pathname==='/v1/sets/'+SET)data={set:{setId:SET,languageCode:'en',game:'pokemon',total:161}};
  else if(url.pathname==='/v1/sets/'+SET+'/cards'){
   const offset=Number(url.searchParams.get('cursor')||0);assert.equal(url.searchParams.get('limit'),'50');
   data={cards:Array.from({length:Math.min(50,161-offset)},(_,i)=>{const cardId=duplicate?'013aaf61-7b4f-4f79-b96f-285b53de2d41':randomUUID();return{cardId,languageCode:'en',game:'pokemon',set:{setId:SET},catalogueVersionId:'same-version',variants:[{image:{setId:SET,cardId,permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com/public/card_image/test.png'}}]};})};meta.pagination={limit:50,nextCursor:offset+50<161?String(offset+50):null};
  }else assert.fail('Unexpected upstream '+url.pathname);
  if(url.pathname==='/v1/sets')meta.pagination={limit:1,nextCursor:null};
  return new Response(JSON.stringify({data,meta}),{headers:{'Content-Type':'application/json'}});
 };return{fetchImpl,calls};
}
test('fixed hosted-catalogue probe checks all 161 real-shaped rows through Workers-compatible GET requests without storage',async()=>{
 const f=transport(),service=createBinderService({fetchImpl:f.fetchImpl});const r=await service.checkCatalogue(),data=await r.json();assert.equal(r.status,200);assert.equal(data.loaded,161);assert.equal(data.approvedArtwork,161);assert.deepEqual(data.pageSizes,[50,50,50,11]);assert.equal(f.calls.length,6);assert.equal(data.setId,SET);assert.ok(!('binders' in data));assert.ok(!('owner' in data));
});
test('the hosted-catalogue probe fails closed on duplicate printing identities',async()=>{
 const f=transport({duplicate:true}),r=await createBinderService({fetchImpl:f.fetchImpl}).checkCatalogue();assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
});
test('the compiled probe rejects visitor parameters and methods while private binders still require visitor identity',async()=>{
 const original=globalThis.fetch,f=transport();try{
  globalThis.fetch=f.fetchImpl;const {default:worker}=await import('../dist/server/index.js?catalogue-check-regression');
  for(const path of ['/api/catalogue-check?url=https://untrusted.example','/api/catalogue-check?setId=other'])assert.equal((await worker.fetch(new Request('https://site.test'+path),{})).status,400);
  assert.equal((await worker.fetch(new Request('https://site.test/api/catalogue-check',{method:'POST'}),{})).status,400);assert.equal(f.calls.length,0);
  const privateRead=await worker.fetch(new Request('https://site.test/api/binders',{headers:{'OAI-Sites-Authorization':'Bearer not-a-visitor'}}),{});assert.equal(privateRead.status,401);assert.equal(f.calls.length,0);
  const probe=await worker.fetch(new Request('https://site.test/api/catalogue-check'),{});assert.equal(probe.status,200);assert.equal((await probe.json()).loaded,161);
 }finally{globalThis.fetch=original;}
});

for(const [method,pitch] of [['checkPitchBlack','d6d58c17-5923-496e-94ef-5819f34ae10c'],['checkChaosRising','816ff627-a585-4953-99c4-a15c9b0b80e5']])test(method+' probe merges reported finish rows without storage or arbitrary targets',async()=>{
 const one=randomUUID(),two=randomUUID();let requests=0;
 const card=(id,finish)=>({cardId:id,game:'pokemon',languageCode:'en',set:{setId:pitch},catalogueVersionId:'fixed',defaultVariantId:id+'-'+finish,variants:[{variantId:id+'-'+finish,canonicalId:'pokemon:en:'+pitch+':'+id+':'+finish,finishCode:finish,image:{permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com/image.webp'}}]});
 const service=createBinderService({fetchImpl:async(input,init)=>{requests++;const u=new URL(input);assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(u.origin,'https://api.stackrtcg.com');assert.ok(u.pathname.startsWith('/v1/sets/'+pitch));const data=u.pathname.endsWith('/cards')?{cards:[card(one,'normal'),card(one,'holo'),card(two,'normal')]}:{set:{setId:pitch,game:'pokemon',languageCode:'en',total:2}};return new Response(JSON.stringify({data,meta:{apiVersion:'1',generatedAt:'2026-11-05T20:00:00Z',...(u.pathname.endsWith('/cards')?{pagination:{limit:50,nextCursor:null}}:{})}}),{headers:{'Content-Type':'application/json'}});}});
 const r=await service[method](),d=await r.json();assert.equal(r.status,200);assert.equal(d.sourceRows,3);assert.equal(d.loaded,2);assert.equal(d.reportedVariantIds,3);assert.equal(d.approvedArtwork,2);assert.equal(requests,2);assert.equal(d.binders,undefined);
});
