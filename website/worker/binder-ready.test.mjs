import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {READY_CATALOGUES,captureReadyBundle,compactReadyCard,createBinderReadyService,decodeReadyBundle,readyReference,validateReadyBundle} from './binder-ready.mjs';
import {createBinderService} from './binders.mjs';

const AT=Date.parse('2026-11-06T13:40:00Z'),SET='258cb8e5-c769-540d-9e3c-40d4ed4dafdb',VERSION='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8',spec={setId:SET,language:'en',total:2,name:'Fixture'};
function card(number){const cardId=number===1?'4c115ca5-778a-5c65-ab36-40bf55740d04':'2e4c1dec-84d8-554d-acc5-59af82981c63',variantId=number===1?'0077273b-aa04-508f-be3a-4e021b249ee2':'00088bf3-51de-42a3-8ebb-41ce1d649631';return {cardId,catalogueVersionId:VERSION,game:'pokemon',languageCode:'en',set:{setId:SET},collectorNumber:{value:String(number),sortKey:String(number)},names:{native:'Card '+number,englishDisplay:'Card '+number},defaultVariantId:variantId,variants:[{variantId,canonicalId:'pokemon:en:'+SET+':'+number+':normal',variantCode:'normal',variantLabel:'Normal',finishCode:'normal',finishLabel:'Normal',image:{permissionStatus:'approved',cardId,setId:SET,deliveryUrl:'https://assets.stackrtcg.com/card-'+number+'.png',derivatives:[{role:'card-grid',deliveryUrl:'https://assets.stackrtcg.com/card-'+number+'.webp'}]}}]};}
const bundle=(at=AT)=>({schema:1,source:'canonical-public-v1',capturedAt:new Date(at).toISOString(),catalogueVersionId:VERSION,complete:true,sourceRows:2,pageSizes:[2],set:{setId:SET,game:'pokemon',languageCode:'en',nativeName:'Fixture',englishDisplayName:'Fixture',setCode:'TEST',total:2},cards:[card(1),card(2)].map(compactReadyCard)});
const encoded=value=>({encoding:'gzip-base64',data:gzipSync(JSON.stringify(value)).toString('base64')});
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
function upstreamFixture({duplicate=false,loop=false,mixed=false}={}){const calls=[];return {calls,async get(path,params=new URLSearchParams()){calls.push({path,params});if(!path.endsWith('/cards'))return {data:{set:bundle().set},meta:{apiVersion:'1'}};const first=card(1),second=card(2);if(mixed)second.catalogueVersionId=randomUUID();const extra={...first,defaultVariantId:'17ded47f-42fd-4cc1-b9ac-a90447313d87',variants:[{...first.variants[0],variantId:'17ded47f-42fd-4cc1-b9ac-a90447313d87',canonicalId:'pokemon:en:'+SET+':1:holo',variantCode:'holo'}]};return {data:{cards:params.has('cursor')?[second]:duplicate?[first,extra]:[first,second]},meta:{apiVersion:'1',pagination:{nextCursor:loop?'repeated':duplicate&&!params.has('cursor')?'last':null}}};}};}

test('all shipped gzip checklists verify canonical identities, versions, full totals and checksums',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../catalogue-cache/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.catalogues.length,READY_CATALOGUES.length);let compressed=0;
 for(const spec of READY_CATALOGUES){const entry=manifest.catalogues.find(row=>row.setId===spec.setId),bytes=readFileSync(new URL('../catalogue-cache/'+entry.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);const value=await decodeReadyBundle({encoding:'gzip-base64',data:bytes.toString('base64')},spec,Date.now());assert.equal(value.cards.length,spec.total);assert.equal(value.sourceRows,entry.sourceRows);assert.equal(value.catalogueVersionId,entry.catalogueVersionId);assert.ok(value.cards.every(card=>card.variants.every(variant=>!variant.image||variant.image.permissionStatus==='approved')));compressed+=bytes.length;}
 assert.ok(compressed<400000,'The handful of complete public checklists remains bounded');
});
test('public snapshot validation rejects missing cards, mixed versions, private fields and cross-set or language identities',()=>{
 for(const mutate of [b=>b.cards.pop(),b=>b.cards[0].catalogueVersionId=randomUUID(),b=>b.cards[0].ownedQuantity=2,b=>b.ownership=[{quantity:2}],b=>b.cards[0].set.setId=randomUUID(),b=>b.cards[0].languageCode='ja',b=>b.sourceRows=1001,b=>b.pageSizes=[51],b=>b.cards[1]=structuredClone(b.cards[0])]){const value=bundle();mutate(value);assert.throws(()=>validateReadyBundle(value,spec,AT));}
 for(const mutate of [c=>c.variants[0].image.permissionStatus='pending',c=>c.variants[0].image.cardId=randomUUID(),c=>c.variants[0].image.deliveryUrl='https://localhost/private',c=>c.variants[0].image.deliveryUrl='javascript:alert(1)']){const value=card(1);mutate(value);if(!value.variants[0].image.deliveryUrl.startsWith('https://assets'))value.variants[0].image.derivatives=[];assert.equal(compactReadyCard(value).variants[0].image,null);}
});
test('read-only capture merges raw finish rows and refuses loops or mixed catalogue versions',async()=>{
 const fixture=upstreamFixture({duplicate:true}),value=await captureReadyBundle(spec,fixture.get,AT);assert.equal(value.cards.length,2);assert.equal(value.sourceRows,3);assert.equal(value.cards[0].variants.length,2);assert.deepEqual(value.pageSizes,[2,1]);
 for(const options of [{loop:true},{mixed:true}])await assert.rejects(captureReadyBundle(spec,upstreamFixture(options).get,AT));
});
test('fresh embedded data answers without upstream work and unknown identities never occupy shared storage',async()=>{
 let upstreamCalls=0,bucketReads=0;const tasks=[],service=createBinderReadyService({catalogues:[spec],bundles:{[SET]:encoded(bundle())},now:()=>AT,upstream:()=>{upstreamCalls++;assert.fail('Fresh reference must not refetch');}}),env={BUCKET:{async get(){bucketReads++;return null;}}},ctx={waitUntil:task=>tasks.push(task)};
 const values=await Promise.all([service.get(SET,'en',env,ctx),service.get(SET,'en',env,ctx)]);await Promise.all(tasks);assert.equal(values[0],values[1]);assert.equal(upstreamCalls,0);assert.equal(bucketReads,1);
 assert.equal(await service.get(randomUUID(),'en',env,ctx),null);assert.equal(await service.get(SET,'ja',env,ctx),null);assert.equal(bucketReads,1);assert.equal(readyReference(values[0],AT).stale,false);
});
test('stale public data stays usable while one request-driven refresh validates and persists only canonical data',async()=>{
 const gate=deferred(),fixture=upstreamFixture(),writes=[],tasks=[];let clock=AT;
 const service=createBinderReadyService({catalogues:[spec],bundles:{[SET]:encoded(bundle(AT-7*3600000))},now:()=>clock,upstream:async(...args)=>{await gate.promise;return fixture.get(...args);}}),env={BUCKET:{async get(){return null;},async put(key,value,options){writes.push({key,value,options});return{etag:'revision'};}}},ctx={waitUntil:task=>tasks.push(task)};
 const first=await service.get(SET,'en',env,ctx),second=await service.get(SET,'en',env,ctx);assert.equal(first,second);assert.equal(readyReference(first,AT).stale,true);assert.equal(writes.length,0);gate.resolve();await Promise.all(tasks);
 const latest=await service.get(SET,'en',env,ctx);assert.equal(readyReference(latest,AT).stale,false);assert.equal(fixture.calls.length,2);assert.equal(writes.length,1);assert.match(writes[0].key,/^stackr-public-checklists\/v1\//);assert.equal(writes[0].options.customMetadata.kind,'public-canonical-checklist');assert.doesNotMatch(writes[0].value,/ownedQuantity|ownership|user_id|quantity|password/);
 clock+=1000;await service.get(SET,'en',env,ctx);assert.equal(fixture.calls.length,2);
});
test('an invalid shared record cannot replace the seed, and failed refreshes are throttled',async()=>{
 let calls=0,reads=0;const tasks=[],invalid=bundle(AT-3600000);invalid.cards[0].quantity=999;
 const service=createBinderReadyService({catalogues:[spec],bundles:{[SET]:encoded(bundle(AT-7*3600000))},now:()=>AT,upstream:async()=>{calls++;throw Error('offline');}}),env={BUCKET:{async get(){reads++;return{size:1000,etag:'bad',body:new Response(JSON.stringify(invalid)).body};}}},ctx={waitUntil:task=>tasks.push(task)};
 assert.equal((await service.get(SET,'en',env,ctx)).cards[0].quantity,undefined);await Promise.all(tasks);await service.get(SET,'en',env,ctx);assert.equal(calls,1);assert.equal(reads,1);assert.equal(tasks.length,1);
});

test('complete private checklists fetch fresh owner quantities on every read while public preloads never include them',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0003_web_binders.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{success:true,results:sql.prepare(query).all(...args)};}};},async batch(){assert.fail('Reads must not write');}};
 const alice=randomUUID(),bob=randomUUID(),stamp=new Date(AT).toISOString(),one=card(1);
 for(const [id,user] of [[alice,'alice'],[bob,'bob']])sql.prepare('INSERT INTO web_binders(id,user_id,name,type,language,set_id,created_at,updated_at) VALUES(?,?,?,\'set\',\'en\',?,?,?)').run(id,user,'Saved',SET,stamp,stamp);
 const insert=sql.prepare('INSERT INTO web_binder_items(binder_id,card_id,variant_id,canonical_id,variant_code,set_id,language,native_name,collector_number,quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
 insert.run(alice,one.cardId,one.defaultVariantId,one.variants[0].canonicalId,'normal',SET,'en','Card','1',2,stamp,stamp);insert.run(bob,one.cardId,one.defaultVariantId,one.variants[0].canonicalId,'normal',SET,'en','Card','1',7,stamp,stamp);
 let upstreamCalls=0;const service=createBinderService({readyBundles:{[SET]:encoded(bundle())},readyCatalogues:[spec],now:()=>AT,fetchImpl:async()=>{upstreamCalls++;throw Error('No public gateway query is needed for the bundled checklist');}}),call=(path,user='alice')=>service.handleRequest(new Request('https://site.test/api/binders'+path,{headers:user?{'oai-authenticated-user-id':user}:{}}),{DB});
 try{
  const publicResponse=await call('/catalogue/ready/'+SET+'?language=en'),preloaded=await publicResponse.json();assert.match(publicResponse.headers.get('Cache-Control'),/^public/);assert.equal(preloaded.cards.length,2);assert.doesNotMatch(JSON.stringify(preloaded),/ownedQuantity|ownedVariants|ownership|quantity|alice|bob/);
  const firstResponse=await call('/'+alice+'/checklist?complete=1'),first=await firstResponse.json();assert.equal(firstResponse.headers.get('Cache-Control'),'private, no-store');assert.equal(first.cards[0].ownedQuantity,2);assert.equal(first.progress.owned,1);assert.equal(first.meta.pagination.nextCursor,null);assert.equal(upstreamCalls,0);
  sql.prepare('UPDATE web_binder_items SET quantity=4 WHERE binder_id=?').run(alice);
  const fresh=await(await call('/'+alice+'/checklist?complete=1&reference='+encodeURIComponent(first.ready.snapshotId))).json();assert.equal(fresh.cards,undefined);assert.equal(fresh.ownership[0].quantity,4);assert.equal((await(await call('/'+bob+'/checklist?complete=1','bob')).json()).cards[0].ownedQuantity,7);
  assert.equal((await call('/'+alice+'/checklist?complete=1','bob')).status,404);assert.equal((await call('/'+alice+'/checklist?complete=1',null)).status,401);assert.equal((await call('/'+alice+'/checklist?complete=1&user_id=bob')).status,400);assert.equal((await call('/'+alice+'/checklist?complete=1&complete=1')).status,400);
  assert.equal(sql.prepare('SELECT count(*) n FROM web_binder_actions').get().n,0);assert.equal(upstreamCalls,0);
 }finally{sql.close();}
});

test('a concurrent tab addition cannot make complete-checklist progress disagree with its returned quantities',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0003_web_binders.sql',import.meta.url),'utf8'));
 const binderId=randomUUID(),stamp=new Date(AT).toISOString(),firstCard=card(1),secondCard=card(2);
 sql.prepare('INSERT INTO web_binders(id,user_id,name,type,language,set_id,created_at,updated_at) VALUES(?,\'alice\',\'Saved\',\'set\',\'en\',?,?,?)').run(binderId,SET,stamp,stamp);
 const insert=entry=>sql.prepare('INSERT INTO web_binder_items(binder_id,card_id,variant_id,canonical_id,variant_code,set_id,language,native_name,collector_number,quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(binderId,entry.cardId,entry.defaultVariantId,entry.variants[0].canonicalId,'normal',SET,'en',entry.names.native,entry.collectorNumber.value,1,stamp,stamp);
 insert(firstCard);let added=false;
 const DB={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){const results=sql.prepare(query).all(...args);if(!added){added=true;insert(secondCard);}return{success:true,results};}};},async batch(){assert.fail('Complete checklist reads must not write');}};
 const service=createBinderService({readyBundles:{[SET]:encoded(bundle())},readyCatalogues:[spec],now:()=>AT,fetchImpl:async()=>assert.fail('The embedded public catalogue is already available')}),read=async()=>{const response=await service.handleRequest(new Request('https://site.test/api/binders/'+binderId+'/checklist?complete=1',{headers:{'oai-authenticated-user-id':'alice'}}),{DB});assert.equal(response.status,200);return response.json();};
 try{
  // The second card is saved by another tab after this request has read its
  // item rows. Its progress must describe the same snapshot as those rows.
  const first=await read();assert.equal(first.cards.filter(row=>row.ownedQuantity>0).length,1);assert.equal(first.progress.owned,1);assert.equal(first.progress.referenceConsistent,true);
  const next=await read();assert.equal(next.cards.filter(row=>row.ownedQuantity>0).length,2);assert.equal(next.progress.owned,2);assert.equal(next.progress.total,2);
 }finally{sql.close();}
});

function shippedBundles(){const manifest=JSON.parse(readFileSync(new URL('../catalogue-cache/manifest.json',import.meta.url),'utf8'));return Object.fromEntries(manifest.catalogues.map(entry=>[entry.setId,{encoding:'gzip-base64',data:readFileSync(new URL('../catalogue-cache/'+entry.file,import.meta.url)).toString('base64')}]));}
test('new public preload pages never exceed fifty cards and pin every continuation to one verified snapshot',async()=>{
 const service=createBinderService({readyBundles:shippedBundles(),fetchImpl:async()=>assert.fail('Preloaded catalogue pages must not refetch the public gateway')}),read=(setId,query,user='alice')=>service.handleRequest(new Request('https://site.test/api/binders/catalogue/ready/'+setId+'?'+query,{headers:user?{'oai-authenticated-user-id':user}:{}}));
 for(const spec of READY_CATALOGUES){
  const seen=new Set();let cursor=null,reference=null,pages=0;
  do{const response=await read(spec.setId,new URLSearchParams({language:'en',paged:'1',limit:'50',...(cursor?{cursor,snapshot:reference.snapshotId}:{})})),data=await response.json();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/^public/);assert.equal(data.cards.length,Math.min(50,spec.total-seen.size));assert.ok(data.cards.length<=50);assert.equal(data.meta.pagination.offset,seen.size);if(reference)assert.equal(data.ready.snapshotId,reference.snapshotId);reference=data.ready;for(const card of data.cards){assert.ok(!seen.has(card.cardId));seen.add(card.cardId);assert.equal(card.catalogueVersionId,reference.catalogueVersionId);}cursor=data.meta.pagination.nextCursor;pages++;assert.ok(pages<=8);assert.doesNotMatch(JSON.stringify(data),/ownership|quantity|ownedQuantity|ownedVariants|user_id/);}while(cursor);
  assert.equal(seen.size,spec.total);
  assert.equal((await read(spec.setId,'paged=1&limit=51')).status,400);assert.equal((await read(spec.setId,'paged=1&cursor=50')).status,400);assert.equal((await read(spec.setId,'paged=1&snapshot=wrong')).status,409);assert.equal((await read(spec.setId,'paged=1&paged=1')).status,400);assert.equal((await read(spec.setId,'paged=1&cursor=-1&snapshot='+encodeURIComponent(reference.snapshotId))).status,400);
 }
 assert.equal((await read(SET,'paged=1',null)).status,401);
 const legacy=await(await read(SET,'language=en')).json();assert.equal(legacy.cards.length,161,'The deployed v65 client retains its legacy response');
});

async function pagedPrivateFixture(){
 const bundles=shippedBundles(),setSpec=READY_CATALOGUES.find(entry=>entry.setId===SET),publicBundle=await decodeReadyBundle(bundles[SET],setSpec),sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0003_web_binders.sql',import.meta.url),'utf8'));
 const binderId=randomUUID(),stamp=new Date().toISOString();sql.prepare('INSERT INTO web_binders(id,user_id,name,type,language,set_id,created_at,updated_at) VALUES(?,\'alice\',\'Saved\',\'set\',\'en\',?,?,?)').run(binderId,SET,stamp,stamp);
 let afterRows=null;const DB={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){const results=sql.prepare(query).all(...args);if(afterRows&&query.startsWith('SELECT i.card_id')){const callback=afterRows;afterRows=null;callback();}return{success:true,results};}};},async batch(){assert.fail('Paged checklist reads must not write');}};
 const insert=card=>sql.prepare('INSERT INTO web_binder_items(binder_id,card_id,variant_id,canonical_id,variant_code,set_id,language,native_name,collector_number,quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(binderId,card.cardId,card.defaultVariantId,card.variants[0].canonicalId,card.variants[0].variantCode,SET,'en',card.names.native,card.collectorNumber.value,1,stamp,stamp);
 const reference=readyReference(publicBundle),service=createBinderService({readyBundles:bundles,fetchImpl:async()=>assert.fail('The verified cache is already present')}),read=(params={},user='alice',id=binderId)=>service.handleRequest(new Request('https://site.test/api/binders/'+id+'/checklist?'+new URLSearchParams({paged:'1',limit:'50',snapshot:reference.snapshotId,expectedRevision:'1',...params}),{headers:user?{'oai-authenticated-user-id':user}:{}}),{DB});
 return{sql,binderId,reference,cards:publicBundle.cards,insert,read,afterRows(callback){afterRows=callback;},change(){sql.prepare('UPDATE web_binders SET revision=revision+1 WHERE id=?').run(binderId);}};
}
test('new private ownership pages cap every reply at fifty fresh owner rows and keep empty binders to one page',async()=>{
 const fixture=await pagedPrivateFixture();try{
  const empty=await(await fixture.read()).json();assert.deepEqual(empty.ownership,[]);assert.equal(empty.ownershipTotal,0);assert.equal(empty.meta.pagination.nextCursor,null);assert.equal(empty.binderRevision,1);
  for(const card of fixture.cards.slice(0,121))fixture.insert(card);let cursor=null,count=0;
  do{const response=await fixture.read(cursor?{cursor}:{}),data=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.ok(data.ownership.length<=50);assert.equal(data.cards,undefined);assert.equal(data.meta.pagination.offset,count);assert.equal(data.ownershipTotal,121);assert.equal(data.progress.owned,121);assert.equal(data.binderRevision,1);assert.equal(data.ready.snapshotId,fixture.reference.snapshotId);count+=data.ownership.length;cursor=data.meta.pagination.nextCursor;}while(cursor);assert.equal(count,121);
  assert.equal((await fixture.read({},'bob')).status,404);assert.equal((await fixture.read({},null)).status,401);assert.equal((await fixture.read({expectedRevision:'2'})).status,409);assert.equal((await fixture.read({snapshot:'wrong'})).status,409);assert.equal((await fixture.read({limit:'51'})).status,400);assert.equal((await fixture.read({complete:'1'})).status,400);assert.equal((await fixture.read({cursor:'-1'})).status,400);assert.equal((await fixture.read({cursor:'10001'})).status,400);
 }finally{fixture.sql.close();}
});
test('private paging rejects changes both during a row read and between continuations before returning mixed quantities',async()=>{
 const fixture=await pagedPrivateFixture();try{
  for(const card of fixture.cards.slice(0,61))fixture.insert(card);const first=await(await fixture.read()).json();assert.equal(first.meta.pagination.nextCursor,'50');fixture.change();const between=await fixture.read({cursor:first.meta.pagination.nextCursor});assert.equal(between.status,409);assert.equal((await between.json()).ownership,undefined);
  fixture.afterRows(()=>fixture.change());const during=await fixture.read({expectedRevision:'2'});assert.equal(during.status,409);assert.equal((await during.json()).ownership,undefined);
  const fresh=await fixture.read({expectedRevision:'3'});assert.equal(fresh.status,200);assert.equal((await fresh.json()).binderRevision,3);
 }finally{fixture.sql.close();}
});
