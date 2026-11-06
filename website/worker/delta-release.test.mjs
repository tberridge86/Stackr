import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createBinderService} from './binders.mjs';

const SET='a1bde625-6996-5451-bcda-fb80fe5b428b';
const bytes=readFileSync(new URL('../catalogue-cache/'+SET+'-en.json.gz',import.meta.url));
const catalogue=JSON.parse(gunzipSync(bytes));

test('released Delta keeps all 141 canonical numbered cards and printing artwork without inventing finishes',()=>{
 const receipt=JSON.parse(readFileSync(new URL('../docs/delta-reign-catalogue-release-20261106.json',import.meta.url),'utf8'));
 assert.equal(catalogue.catalogueVersionId,receipt.activation[0].id);assert.equal(catalogue.cards.length,141);
 const ids=new Map(receipt.import[0].issued_identities.map(row=>[row.number,row]));
 for(const [index,card] of catalogue.cards.entries()){
  const number=String(index+1).padStart(3,'0'),issued=ids.get(number);assert.equal(card.collectorNumber.value,number);assert.equal(card.cardId,issued.printing_id);
  assert.equal(card.languageCode,'en');assert.equal(card.set.setId,SET);assert.equal(card.variants.length,1);
  const variant=card.variants[0];assert.equal(variant.variantId,issued.variant_id);assert.equal(variant.variantCode,'unclassified');assert.equal(variant.finishCode,null);assert.equal(variant.finishLabel,null);
  assert.equal(variant.image.permissionStatus,'approved');assert.equal(variant.image.cardId,card.cardId);assert.match(variant.image.deliveryUrl,new RegExp('/media/cards/delta-reign-en-'+number+'--[a-f0-9]{12}$'));
 }
});

test('the read-only Delta hosted diagnostic checks every printing and current card validation without storage',async()=>{
 let reads=0;
 const service=createBinderService({fetchImpl:async input=>{
  reads++;const url=new URL(input);let data;
  if(url.pathname==='/v1/sets/'+SET)data={set:catalogue.set};
  else if(url.pathname==='/v1/sets/'+SET+'/cards'){const offset=Number(url.searchParams.get('cursor')||0);return new Response(JSON.stringify({data:{cards:catalogue.cards.slice(offset,offset+50)},meta:{apiVersion:'1',pagination:{limit:50,nextCursor:offset+50<141?String(offset+50):null}}}),{headers:{'Content-Type':'application/json'}});}
  else{const card=catalogue.cards.find(card=>url.pathname==='/v1/cards/'+card.cardId);assert.ok(card);data={card};}
  return new Response(JSON.stringify({data,meta:{apiVersion:'1'}}),{headers:{'Content-Type':'application/json'}});
 }});
 const response=await service.checkDeltaReign(),data=await response.json();assert.equal(response.status,200);assert.equal(data.loaded,141);assert.equal(data.approvedArtwork,141);assert.equal(data.currentCardValidated,true);assert.equal(reads,5);
});

test('Delta creation and checklist reuse verified metadata while real canonical ownership persists privately and replays once',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../drizzle/0003_web_binders.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let args=[];return{bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return{success:true,results:sql.prepare(query).all(...args)};},sync(){const result=sql.prepare(query).run(...args);return{success:true,meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.sync());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 let upstreamReads=0;
 const options={readyBundles:{[SET]:{encoding:'gzip-base64',data:bytes.toString('base64')}},now:()=>Date.parse(catalogue.capturedAt),fetchImpl:async input=>{
  upstreamReads++;const id=new URL(input).pathname.split('/').at(-1),card=catalogue.cards.find(card=>card.cardId===id);assert.ok(card,'Only exact current card validation may use upstream');
  return new Response(JSON.stringify({data:{card},meta:{apiVersion:'1'}}),{headers:{'content-type':'application/json'}});
 }};
 let service=createBinderService(options);
 const call=(path='',body,user='alice')=>service.handleRequest(new Request('https://site.test/api/binders'+path,{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':'shared@example.test'}:{}),Origin:'https://site.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB});
 const ok=async(path,body,user)=>{const r=await call(path,body,user),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 try{
  const metadata=await ok('/catalogue/sets/'+SET);assert.equal(metadata.data.set.total,141);assert.equal(metadata.meta.source,'public-catalogue-snapshot');
  let {binder}=await ok('',{id:randomUUID(),binderId:randomUUID(),type:'set',setId:SET,name:'Delta Reign',language:'en'});assert.equal(binder.setTotal,141);assert.equal(upstreamReads,0);
  const first=await ok('/'+binder.id+'/checklist?complete=1');assert.equal(first.cards.length,141);assert.equal(first.progress.owned,0);assert.equal(upstreamReads,0);
  const card=catalogue.cards[0],action={id:randomUUID(),expectedRevision:binder.revision,cardId:card.cardId,variantId:card.defaultVariantId,quantity:1};
  const saved=await ok('/'+binder.id+'/items',action);assert.equal(upstreamReads,1);const replay=await ok('/'+binder.id+'/items',action);assert.equal(replay.replayed,true);assert.equal(upstreamReads,1);
  service=createBinderService(options);const reopened=await ok('/'+binder.id+'/checklist?complete=1');assert.equal(reopened.cards[0].ownedQuantity,1);assert.equal(reopened.progress.owned,1);assert.equal(reopened.progress.total,141);
  assert.equal(sql.prepare('SELECT finish_code FROM web_binder_items').get().finish_code,null);assert.equal(sql.prepare('SELECT quantity FROM web_binder_items').get().quantity,1);
  assert.equal((await call('/'+binder.id+'/checklist?complete=1',undefined,'bob')).status,404);assert.equal((await call('/'+binder.id+'/items',{...action,id:randomUUID(),expectedRevision:saved.binder.revision},'bob')).status,404);
  assert.equal((await call('/'+binder.id,undefined,null)).status,401);assert.equal((await ok('',undefined,'bob')).binders.length,0);
  assert.equal((await call('/'+binder.id+'/items',{...action,id:randomUUID(),quantity:2})).status,409);
 }finally{sql.close();}
});
