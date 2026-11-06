import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createBinderService} from './binders.mjs';

const SET='04fe9fe1-7206-4215-b9ab-ccea25916593',OTHER_SET='013aaf61-7b4f-4f79-b96f-285b53de2d41';
const CARD='c4cc3a63-6dc2-4ff4-98a3-fcfb70f2766a',SECOND='2e4c1dec-84d8-554d-acc5-59af82981c63';
const NORMAL='00088bf3-51de-42a3-8ebb-41ce1d649631',HOLO='17ded47f-42fd-4cc1-b9ac-a90447313d87';
const time='2026-11-04T20:00:00.000Z';
function printing(cardId=CARD){return {cardId,game:'pokemon',languageCode:'en',set:{setId:SET},names:{native:'Pikachu',englishDisplay:'Pikachu'},collectorNumber:{value:'1'},defaultVariantId:NORMAL,variants:[NORMAL,HOLO].map((variantId,index)=>({variantId,canonicalId:`pokemon:en:${SET}:1:${index?'holo':'normal'}`,variantCode:index?'holo':'normal',finishCode:index?'holofoil':'normal',image:{permissionStatus:'approved',cardId,setId:SET,deliveryUrl:'https://assets.stackrtcg.com/original.png',derivatives:[{role:'card-grid',deliveryUrl:'https://assets.stackrtcg.com/grid.webp'}]}}))};}
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../drizzle/0003_web_binders.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},sync(){const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.sync());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const issues=[],calls=[],state={fail:false,redirect:false,card:printing(),set:{setId:SET,game:'pokemon',languageCode:'en',nativeName:'A real set',total:2},malformed:false,missingPagination:false,repeatCursor:false};
 const fetchImpl=async(input,init)=>{
  const u=new URL(input);calls.push({url:u,init});if(init.redirect==='error')throw new TypeError('Unsupported redirect mode: error');if(state.fail)throw Error('offline');if(state.redirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/collect'}});
  let data,meta={apiVersion:'1',generatedAt:time};
  if(/^\/v1\/cards\//.test(u.pathname))data={card:structuredClone(state.card)};
  else if(u.pathname==='/v1/sets/'+SET)data={set:{...state.set}};
  else if(u.pathname==='/v1/sets')data={sets:[{...state.set}]};
  else if(u.pathname==='/v1/sets/'+SET+'/cards')data={cards:u.searchParams.has('cursor')?[printing(SECOND)]:[printing()]};
  else if(u.pathname==='/v1/search')data={results:[{type:'card',card:printing()}]};
  else if(u.pathname==='/v1/pokemon')data={count:1025,indexVersion:'verified-index',results:[{speciesId:1,speciesName:'bulbasaur',name:'bulbasaur'}]};
  else if(u.pathname==='/v1/pokemon/bulbasaur/cards')data={cards:[printing()]};
  else return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
  if(u.searchParams.has('limit')&&u.pathname!=='/v1/pokemon')meta.pagination={limit:Number(u.searchParams.get('limit')),nextCursor:u.pathname.endsWith('/cards')&&!u.searchParams.has('cursor')?'opaque-next':null};
  if(state.finishRows&&u.pathname==='/v1/sets/'+SET+'/cards')data={cards:[{...printing(),defaultVariantId:NORMAL,variants:[printing().variants[0]]},{...printing(),defaultVariantId:HOLO,variants:[printing().variants[1]],...(state.finishConflict?{names:{native:'Changed printing'}}:{})}]};
  if(state.malformed)meta.apiVersion='unexpected';
  if(state.missingPagination)delete meta.pagination;
  if(state.repeatCursor&&meta.pagination)meta.pagination.nextCursor=u.searchParams.get('cursor');
  return new Response(JSON.stringify({data,meta}),{headers:{'Content-Type':'application/json'}});
 };
 let service=createBinderService({fetchImpl,now:()=>Date.parse(time),onUpstreamFailure:issue=>issues.push(issue)});
 const call=(path='',data,user='alice',headers={})=>service.handleRequest(new Request('https://site.test/api/binders'+path,{method:data?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),'oai-authenticated-user-email':'same-email@example.test',Origin:'https://site.test','Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})}),{DB});
 const ok=async(path,data,user)=>{const r=await call(path,data,user),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const create=async(over={},user='alice')=>{const payload={id:randomUUID(),binderId:randomUUID(),name:'My collection',type:'custom',language:'en',...over};const result=await ok('',payload,user);return {...result,payload};};
 const put=(binder,quantity=1,over={})=>({id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,variantId:NORMAL,quantity,...over});
 return {sql,DB,state,calls,issues,call,ok,create,put,restart(){service=createBinderService({fetchImpl,now:()=>Date.parse(time),onUpstreamFailure:issue=>issues.push(issue)});},close(){sql.close();}};
}

test('missing identity and cross-origin writes fail before any storage or upstream access',async()=>{
 const f=fixture();try{for(const path of ['', '/catalogue/sets'])assert.equal((await f.call(path,undefined,null)).status,401);const data={id:randomUUID(),binderId:randomUUID(),name:'Private',type:'custom',language:'en'};assert.equal((await f.call('',data,'alice',{Origin:'https://evil.test'})).status,403);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binders').get().n,0);assert.equal(f.calls.length,0);}finally{f.close();}
});
test('checklists join explicit finish rows into one printing without doubling owned quantities',async()=>{
 const f=fixture();try{
  let {binder}=await f.create({type:'set',setId:SET});binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;
  f.state.finishRows=true;const r=await f.ok('/'+binder.id+'/checklist?limit=50');assert.equal(r.cards.length,1);assert.equal(r.cards[0].card.cardId,CARD);assert.deepEqual(r.cards[0].card.variants.map(v=>v.variantId),[NORMAL,HOLO]);assert.equal(r.cards[0].ownedQuantity,5);assert.equal(r.cards[0].ownedVariants.length,2);assert.equal(r.progress.owned,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binder_items').get().n,2);
  f.state.finishConflict=true;assert.equal((await f.call('/'+binder.id+'/checklist?limit=50')).status,503);assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,5);
 }finally{f.close();}
});
test('account ownership uses Sites ID even when emails are the same and survives a service restart',async()=>{
 const f=fixture();try{const {binder}=await f.create();f.restart();assert.equal((await f.ok('/'+binder.id)).binder.name,'My collection');assert.equal((await f.ok('',undefined,'bob')).binders.length,0);assert.equal((await f.call('/'+binder.id,undefined,'bob')).status,404);assert.equal((await f.call('/'+binder.id+'/items',f.put(binder),'bob')).status,404);assert.equal((await f.call('/'+binder.id,{id:randomUUID(),expectedRevision:1,archived:true},'bob')).status,404);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binder_actions').get().n,1);}finally{f.close();}
});
test('account details use authenticated identity and count only this user’s persistent binders',async()=>{
 const f=fixture();try{
  await f.create({name:'Alice collection'});let {binder}=await f.create({name:'Archived Alice collection'});
  await f.ok('/'+binder.id,{id:randomUUID(),expectedRevision:binder.revision,archived:true});await f.create({name:'Bob collection'},'bob');f.restart();
  const r=await f.call('/account',undefined,'alice',{'oai-authenticated-user-full-name':'Jack%20Berridge','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'}),data=await r.json();
  assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(data.account.displayName,'Jack Berridge');assert.equal(data.account.provider,'ChatGPT');assert.deepEqual(data.collection,{activeBinders:1,archivedBinders:1});assert.equal(data.account.email,'same-email@example.test');assert.equal(data.account.userId,undefined);
  const other=await f.ok('/account',undefined,'bob');assert.deepEqual(other.collection,{activeBinders:1,archivedBinders:0});assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('account reads cannot select another identity, write a profile or use service access as visitor identity',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('/account',undefined,null,{'OAI-Sites-Authorization':'Bearer service-access'})).status,401);
  assert.equal((await f.call('/account?user_id=bob')).status,400);assert.equal((await f.call('/account',{name:'Invented profile'})).status,405);
  assert.deepEqual((await f.ok('/account')).collection,{activeBinders:0,archivedBinders:0});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binders').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binder_actions').get().n,0);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('create is idempotent and replay conflict cannot alter names or owners',async()=>{
 const f=fixture();try{const {binder,payload}=await f.create();assert.equal((await f.ok('',payload)).replayed,true);assert.equal((await f.call('',{...payload,name:'Changed'})).status,409);assert.equal((await f.call('',{...payload,userId:'bob'})).status,400);assert.equal((await f.ok('/'+binder.id)).binder.name,'My collection');assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binders').get().n,1);}finally{f.close();}
});
test('set creation verifies canonical set, language and total; user-supplied totals are rejected',async()=>{
 const f=fixture();try{const {binder}=await f.create({type:'set',setId:SET});assert.equal(binder.setTotal,2);assert.equal(binder.setCheckedAt,time);const bad={id:randomUUID(),binderId:randomUUID(),name:'Bad',type:'set',setId:SET,language:'ja'};assert.equal((await f.call('',bad)).status,400);assert.equal((await f.call('',{...bad,language:'en',setTotal:999})).status,400);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binders').get().n,1);}finally{f.close();}
});
test('exact printing variants persist separately; retries do not add copies twice',async()=>{
 const f=fixture();try{let {binder}=await f.create();const first=f.put(binder,2);binder=(await f.ok('/'+binder.id+'/items',first)).binder;assert.equal((await f.ok('/'+binder.id+'/items',first)).replayed,true);binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;f.restart();const saved=await f.ok('/'+binder.id);assert.equal(saved.items.length,2);assert.equal(saved.summary.uniqueCards,1);assert.equal(saved.summary.totalQuantity,5);assert.equal(saved.items[0].imageUrl,'https://assets.stackrtcg.com/grid.webp');assert.equal(saved.items.find(i=>i.variantId===HOLO).finishCode,'holofoil');assert.equal(binder.revision,3);}finally{f.close();}
});
test('whole-card ownership uses the current canonical default for every binder type and replays without adding copies',async()=>{
 for(const type of ['custom','set']){const f=fixture();try{
  let {binder}=await f.create({type,...(type==='set'?{setId:SET}:{})});f.state.card.defaultVariantId=HOLO;
  const intent={id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:true};binder=(await f.ok('/'+binder.id+'/ownership',intent)).binder;
  assert.equal((await f.ok('/'+binder.id+'/ownership',intent)).replayed,true);
  const state=await f.ok('/'+binder.id+'/ownership?cardIds='+CARD);assert.equal(state.ownershipTotal,1);assert.deepEqual(state.ownership,[{cardId:CARD,variantId:HOLO,quantity:1}]);
  assert.equal((await f.ok('/'+binder.id)).items[0].finishCode,'holofoil');assert.equal(binder.revision,2);
  const remove={id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:false};binder=(await f.ok('/'+binder.id+'/ownership',remove)).binder;
  await f.ok('/'+binder.id+'/ownership',{id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:true});
  assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,1);
 }finally{f.close();}}
});
test('marking a whole card unowned clears all copies and finishes atomically without needing the catalogue',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;
  f.state.fail=true;const before=f.calls.length,intent={id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:false};
  const removed=await f.ok('/'+binder.id+'/ownership',intent);assert.equal(removed.binder.revision,binder.revision+1);assert.equal(f.calls.length,before);
  assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binder_items WHERE quantity=0').get().n,2);
  assert.equal((await f.ok('/'+binder.id+'/ownership',intent)).replayed,true);assert.equal((await f.ok('/'+binder.id)).binder.revision,removed.binder.revision);
 }finally{f.close();}
});
test('an interrupted multi-finish removal rolls back every quantity, revision and action before retry',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;
  const intent={id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:false};
  f.sql.exec("CREATE TRIGGER fail_finish BEFORE UPDATE ON web_binder_items WHEN NEW.variant_id='"+HOLO+"' BEGIN SELECT RAISE(ABORT,'test_write_failure'); END;");
  assert.equal((await f.call('/'+binder.id+'/ownership',intent)).status,503);const unchanged=await f.ok('/'+binder.id);assert.equal(unchanged.summary.totalQuantity,5);assert.equal(unchanged.binder.revision,binder.revision);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binder_actions WHERE id=?').get(intent.id).n,0);
  f.sql.exec('DROP TRIGGER fail_finish');await f.ok('/'+binder.id+'/ownership',intent);assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,0);
 }finally{f.close();}
});
test('replaying a removal after a later quantity edit cannot erase the newer saved copies',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,5))).binder;
  const intent={id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:false};binder=(await f.ok('/'+binder.id+'/ownership',intent)).binder;
  binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;
  const replayed=await f.ok('/'+binder.id+'/ownership',intent);assert.equal(replayed.replayed,true);assert.equal(replayed.binder.revision,binder.revision);assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,3);
  assert.equal((await f.call('/'+binder.id+'/ownership',{...intent,owned:true})).status,409);
 }finally{f.close();}
});
test('mark-owned preserves an existing higher quantity and never silently rewrites saved finishes',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,6,{variantId:HOLO}))).binder;
  f.state.fail=true;await f.ok('/'+binder.id+'/ownership',{id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:true});
  const state=await f.ok('/'+binder.id+'/ownership?cardIds='+CARD);assert.deepEqual(state.ownership,[{cardId:CARD,variantId:HOLO,quantity:6}]);assert.equal(state.ownershipTotal,1);
 }finally{f.close();}
});
test('missing, stale or ambiguous default finishes cannot mark a card owned',async()=>{
 const f=fixture();try{
  const {binder}=await f.create();for(const change of [card=>delete card.defaultVariantId,card=>card.defaultVariantId=randomUUID(),card=>card.variants.push({...card.variants[0]}),card=>card.variants[0].canonicalId='',card=>card.variants[0].variantCode=null]){
   f.state.card=printing();change(f.state.card);const r=await f.call('/'+binder.id+'/ownership',{id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:true});assert.equal(r.status,400);assert.match((await r.json()).error,/Edit quantity \/ finish/);
  }
  assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,0);assert.equal((await f.ok('/'+binder.id)).binder.revision,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM web_binder_actions').get().n,1);
 }finally{f.close();}
});
test('whole-card ownership enforces the canonical set, printed language, private owner, archive and same-origin boundaries',async()=>{
 const f=fixture();try{
  let {binder}=await f.create({type:'set',setId:SET});const intent=()=>({id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:true});
  assert.equal((await f.call('/'+binder.id+'/ownership?cardIds='+CARD,undefined,null)).status,401);assert.equal((await f.call('/'+binder.id+'/ownership?cardIds='+CARD,undefined,'bob')).status,404);assert.equal((await f.call('/'+binder.id+'/ownership',intent(),'bob')).status,404);
  assert.equal((await f.call('/'+binder.id+'/ownership',intent(),'alice',{Origin:'https://evil.test'})).status,403);
  f.state.card.set.setId=OTHER_SET;assert.equal((await f.call('/'+binder.id+'/ownership',intent())).status,400);f.state.card=printing();f.state.card.languageCode='ja';assert.equal((await f.call('/'+binder.id+'/ownership',intent())).status,400);
  f.state.card=printing();assert.equal((await f.call('/'+binder.id+'/ownership',{...intent(),variantId:HOLO})).status,400);
  binder=(await f.ok('/'+binder.id,{id:randomUUID(),expectedRevision:binder.revision,archived:true})).binder;assert.equal((await f.call('/'+binder.id+'/ownership',intent())).status,409);assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,0);
 }finally{f.close();}
});
test('whole-card reads bound selected printings, return exact finish counts privately and reject inconsistent revisions',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;
  const r=await f.call('/'+binder.id+'/ownership?cardIds='+CARD+','+SECOND),state=await r.json();assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(state.cardIds,[CARD,SECOND]);assert.equal(state.ownership.reduce((sum,row)=>sum+row.quantity,0),5);assert.equal(state.ownership.length,2);assert.equal(state.meta.pagination.nextCursor,null);
  for(const query of ['cardIds='+CARD+','+CARD,'cardIds='+Array.from({length:51},()=>randomUUID()).join(','),'cardIds='+CARD+'&user_id=bob','cardIds='+CARD+'&cardIds='+SECOND])assert.equal((await f.call('/'+binder.id+'/ownership?'+query)).status,400);
  const prepare=f.DB.prepare;let changed=false;f.DB.prepare=function(query){const stmt=prepare(query),read=stmt.all;if(query.startsWith('SELECT i.card_id,i.variant_id,i.quantity'))stmt.all=async()=>{const value=await read.call(stmt);if(!changed){changed=true;f.sql.prepare('UPDATE web_binders SET revision=revision+1 WHERE id=?').run(binder.id);}return value;};return stmt;};
  assert.equal((await f.call('/'+binder.id+'/ownership?cardIds='+CARD)).status,409);
 }finally{f.close();}
});
test('simultaneous whole-card removal and quantity edit cannot commit against the same binder revision',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,5))).binder;
  const results=await Promise.all([f.call('/'+binder.id+'/ownership',{id:randomUUID(),expectedRevision:binder.revision,cardId:CARD,owned:false}),f.call('/'+binder.id+'/items',f.put(binder,3))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const state=await f.ok('/'+binder.id);assert.equal(state.binder.revision,binder.revision+1);assert.ok([0,3].includes(state.summary.totalQuantity));
 }finally{f.close();}
});
test('ownership pages never return more than 50 saved variants and require a stable continuation revision',async()=>{
 const f=fixture();try{
  let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;
  const insert=f.sql.prepare('INSERT INTO web_binder_items SELECT binder_id,card_id,?,canonical_id,variant_code,finish_code,set_id,language,native_name,english_name,collector_number,image_url,quantity,created_at,updated_at FROM web_binder_items WHERE binder_id=? AND variant_id=?');for(let i=1;i<121;i++)insert.run(randomUUID(),binder.id,NORMAL);
  const path='/'+binder.id+'/ownership?cardIds='+CARD,first=await f.ok(path);assert.equal(first.ownership.length,50);assert.equal(first.ownershipTotal,121);assert.equal(first.meta.pagination.nextCursor,'50');
  assert.equal((await f.call(path+'&cursor=50')).status,400);assert.equal((await f.call(path+'&limit=51')).status,400);
  const second=await f.ok(path+'&cursor=50&expectedRevision='+binder.revision),last=await f.ok(path+'&cursor=100&expectedRevision='+binder.revision);assert.equal(second.ownership.length,50);assert.equal(last.ownership.length,21);assert.equal(last.meta.pagination.nextCursor,null);assert.equal(new Set([...first.ownership,...second.ownership,...last.ownership].map(row=>row.variantId)).size,121);
  await f.ok('/'+binder.id+'/items',f.put(binder,3));assert.equal((await f.call(path+'&cursor=50&expectedRevision='+binder.revision)).status,409);
 }finally{f.close();}
});
test('invalid variant, wrong set and wrong printed language never create ownership',async()=>{
 const f=fixture();try{const {binder}=await f.create({type:'set',setId:SET});assert.equal((await f.call('/'+binder.id+'/items',f.put(binder,1,{variantId:randomUUID()}))).status,400);f.state.card.set.setId=OTHER_SET;assert.equal((await f.call('/'+binder.id+'/items',f.put(binder))).status,400);f.state.card=printing();f.state.card.languageCode='ja';assert.equal((await f.call('/'+binder.id+'/items',f.put(binder))).status,400);assert.equal((await f.ok('/'+binder.id)).summary.totalQuantity,0);assert.equal((await f.ok('/'+binder.id)).binder.revision,1);}finally{f.close();}
});
test('simultaneous stale writes cannot lose updates; only one revision commits',async()=>{
 const f=fixture();try{const {binder}=await f.create();const r=await Promise.all([f.call('/'+binder.id+'/items',f.put(binder,1)),f.call('/'+binder.id+'/items',f.put(binder,2))]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);const saved=await f.ok('/'+binder.id);assert.equal(saved.binder.revision,2);assert.equal(saved.items.length,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binder_actions').get().n,2);}finally{f.close();}
});
test('archive is private and reversible; archived contents cannot be changed',async()=>{
 const f=fixture();try{let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id,{id:randomUUID(),expectedRevision:binder.revision,archived:true})).binder;assert.equal((await f.ok('')).binders.length,0);assert.equal((await f.ok('?archived=1')).binders.length,1);assert.equal((await f.call('/'+binder.id+'/items',f.put(binder,3))).status,409);binder=(await f.ok('/'+binder.id,{id:randomUUID(),expectedRevision:binder.revision,archived:false,name:'Restored'})).binder;assert.equal(binder.name,'Restored');assert.equal((await f.ok('/'+binder.id)).items[0].quantity,2);}finally{f.close();}
});
test('upstream outage cannot fabricate additions; saved quantities can still be reduced or removed',async()=>{
 const f=fixture();try{let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;f.state.fail=true;assert.equal((await f.call('/'+binder.id+'/items',f.put(binder,3))).status,503);assert.equal((await f.ok('/'+binder.id)).items[0].quantity,2);binder=(await f.ok('/'+binder.id+'/items',f.put(binder,1))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,0))).binder;assert.equal((await f.ok('/'+binder.id)).items.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binder_items').get().n,1);assert.equal(f.sql.prepare('SELECT quantity FROM web_binder_items').get().quantity,0);}finally{f.close();}
});
test('catalogue proxy validates fixed paths and page bounds before fetching, forwards no credentials',async()=>{
 const f=fixture();try{for(const path of ['/catalogue/sets?limit=51','/catalogue/sets?limit=0','/catalogue/sets?url=https://evil.test','/catalogue/https://evil.test','/catalogue/search?q=a&limit=1&limit=2','/catalogue/pokemon?offset=-1'])assert.equal((await f.call(path)).status>=400,true,path);assert.equal(f.calls.length,0);await f.ok('/catalogue/sets?language=ja&limit=50&cursor=opaque');const call=f.calls[0];assert.equal(call.url.origin,'https://api.stackrtcg.com');assert.equal(call.url.searchParams.get('cursor'),'opaque');assert.equal(call.init.redirect,'manual');assert.deepEqual(Object.keys(call.init.headers).sort(),['Accept','User-Agent']);assert.equal(call.init.method,'GET');}finally{f.close();}
});
test('checklist keeps distinct printing progress separate from variant and quantity counts',async()=>{
 const f=fixture();try{let {binder}=await f.create({type:'set',setId:SET});binder=(await f.ok('/'+binder.id+'/items',f.put(binder,2))).binder;binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3,{variantId:HOLO}))).binder;const first=await f.ok('/'+binder.id+'/checklist?limit=1');assert.equal(first.progress.owned,1);assert.equal(first.progress.total,2);assert.equal(first.cards[0].ownedQuantity,5);assert.equal(first.cards[0].ownedVariants.length,2);assert.equal(first.meta.pagination.nextCursor,'opaque-next');const second=await f.ok('/'+binder.id+'/checklist?limit=1&cursor=opaque-next');assert.equal(second.cards[0].card.cardId,SECOND);assert.equal(second.cards[0].ownedQuantity,0);assert.equal(second.meta.pagination.nextCursor,null);assert.equal((await f.call('/'+binder.id+'/checklist',undefined,'bob')).status,404);}finally{f.close();}
});
test('canonical Pokédex can be browsed within a binder without inventing species ownership',async()=>{
 const f=fixture();try{const {binder}=await f.create();const index=await f.ok('/catalogue/pokemon?offset=0&limit=1');assert.equal(index.data.results[0].speciesId,1);assert.equal(index.data.count,1025);const cards=await f.ok('/catalogue/pokemon/bulbasaur/cards?language=en&limit=1');assert.equal(cards.data.cards.length,1);assert.equal((await f.ok('/'+binder.id)).summary.ownedSpecies,null);}finally{f.close();}
});
test('unapproved or executable image URLs are not persisted as card imagery',async()=>{
 const f=fixture();try{const {binder}=await f.create();f.state.card.variants[0].image={permissionStatus:'approved',deliveryUrl:'javascript:alert(1)'};await f.ok('/'+binder.id+'/items',f.put(binder));assert.equal((await f.ok('/'+binder.id)).items[0].imageUrl,null);}finally{f.close();}
});
test('malformed catalogue responses fail closed and leave actions and revisions untouched',async()=>{
 const f=fixture();try{const {binder}=await f.create();f.state.malformed=true;assert.equal((await f.call('/'+binder.id+'/items',f.put(binder))).status,503);assert.equal((await f.ok('/'+binder.id)).binder.revision,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binder_actions').get().n,1);}finally{f.close();}
});
test('missing pagination cannot be presented as a completed checklist',async()=>{
 const f=fixture();try{const {binder}=await f.create({type:'set',setId:SET});f.state.missingPagination=true;assert.equal((await f.call('/'+binder.id+'/checklist')).status,503);}finally{f.close();}
});
test('a changed set denominator cannot produce an impossible completed progress claim',async()=>{
 const f=fixture();try{let {binder}=await f.create({type:'set',setId:SET});binder=(await f.ok('/'+binder.id+'/items',f.put(binder))).binder;f.state.set.total=0;const page=await f.ok('/'+binder.id+'/checklist');assert.equal(page.progress.total,null);assert.equal(page.progress.referenceConsistent,false);}finally{f.close();}
});
test('an upstream cursor loop fails visibly instead of endlessly repeating cards',async()=>{
 const f=fixture();try{f.state.repeatCursor=true;assert.equal((await f.call('/catalogue/sets?limit=1&cursor=opaque')).status,503);}finally{f.close();}
});
test('catalogue image URLs cannot target local networks, IP literals, credentials or unusual ports',async()=>{
 const f=fixture();try{let {binder}=await f.create();for(const url of ['https://localhost/image.png','https://sub.localhost/image.png','https://printer.local./image.png','https://system.internal/image.png','https://127.0.0.1/image.png','https://[::1]/image.png','https://2130706433/image.png','https://u:p@assets.stackrtcg.com/a.png','https://assets.stackrtcg.com:8443/a.png']){f.state.card.variants[0].image={permissionStatus:'approved',deliveryUrl:url};const data=f.put(binder,(await f.ok('/'+binder.id)).summary.totalQuantity+1);binder=(await f.ok('/'+binder.id+'/items',data)).binder;assert.equal((await f.ok('/'+binder.id)).items[0].imageUrl,null,url);}f.state.card.variants[0].image={permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com:443/public/a.png'};binder=(await f.ok('/'+binder.id+'/items',f.put(binder,10))).binder;assert.equal((await f.ok('/'+binder.id)).items[0].imageUrl,'https://assets.stackrtcg.com/public/a.png');}finally{f.close();}
});
test('exact item lookup returns persisted quantity and current revision without leaking another account',async()=>{
 const f=fixture();try{let {binder}=await f.create();binder=(await f.ok('/'+binder.id+'/items',f.put(binder,3))).binder;const path='/'+binder.id+'/items?cardId='+CARD+'&variantId='+NORMAL;f.state.fail=true;const count=f.calls.length,found=await f.ok(path);assert.equal(found.quantity,3);assert.equal(found.binder.revision,binder.revision);assert.equal((await f.ok('/'+binder.id+'/items?cardId='+CARD+'&variantId='+HOLO)).quantity,0);assert.equal((await f.call(path,undefined,'bob')).status,404);assert.equal((await f.call(path+'&userId=alice')).status,400);assert.equal((await f.call(path+'&variantId='+HOLO)).status,400);assert.equal((await f.call('/'+binder.id+'/items?cardId='+CARD)).status,400);assert.equal(f.calls.length,count);}finally{f.close();}
});

test('exact-set lookup finds the owner binder beyond the first library page without exposing another owner or language',async()=>{
 const f=fixture();try{
  const {binder}=await f.create({type:'set',setId:SET});
  f.sql.prepare('UPDATE web_binders SET updated_at=? WHERE id=?').run('2020-01-01',binder.id);
  for(let i=0;i<51;i++)await f.create({name:'Other '+i});
  await f.create({type:'set',setId:SET},'bob');
  f.state.set.languageCode='ja';await f.create({type:'set',setId:SET,language:'ja'});
  assert.ok(!(await f.ok('')).binders.some(b=>b.id===binder.id));
  const result=await f.ok('?setId='+SET+'&language=en');assert.equal(result.binders.length,1);assert.equal(result.binders[0].id,binder.id);assert.equal(result.hasMore,false);
  const other=await f.ok('?setId='+SET+'&language=en',undefined,'bob');assert.equal(other.binders.length,1);assert.notEqual(other.binders[0].id,binder.id);
 }finally{f.close();}
});
test('exact-set lookup validates both selectors, rejects duplicates and retains the sign-in boundary',async()=>{
 const f=fixture();try{
  for(const q of ['?setId='+SET,'?language=en','?setId=invalid&language=en','?setId='+SET+'&language=xx','?setId='+SET+'&language=en&language=ja'])assert.equal((await f.call(q)).status,400,q);
  assert.equal((await f.call('?setId='+SET+'&language=en',undefined,null)).status,401);
  const {binder}=await f.create({type:'set',setId:SET});await f.ok('/'+binder.id,{id:randomUUID(),expectedRevision:1,archived:true});
  assert.equal((await f.ok('?setId='+SET+'&language=en')).binders.length,0);assert.equal((await f.ok('?setId='+SET+'&language=en&archived=1')).binders[0].id,binder.id);
 }finally{f.close();}
});
test('matching binders retain bounded stable pagination',async()=>{
 const f=fixture();try{
  for(let i=0;i<51;i++)await f.create({name:'Set binder '+i,type:'set',setId:SET});
  const first=await f.ok('?setId='+SET+'&language=en'),next=await f.ok('?setId='+SET+'&language=en&offset='+first.nextOffset);
  assert.equal(first.binders.length,50);assert.equal(first.hasMore,true);assert.equal(next.binders.length,1);assert.equal(next.hasMore,false);assert.ok(!first.binders.some(b=>b.id===next.binders[0].id));
 }finally{f.close();}
});

test('catalogue redirects remain rejected without following an arbitrary destination',async()=>{
 const f=fixture();try{f.state.redirect=true;const r=await f.call('/catalogue/sets/'+SET);assert.equal(r.status,503);assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.redirect,'manual');assert.equal(f.calls[0].url.hostname,'api.stackrtcg.com');assert.equal(f.issues[0].phase,'response');assert.equal(f.issues[0].status,302);assert.equal(f.issues[0].route,'/sets/:id');assert.equal(f.sql.prepare('SELECT count(*) n FROM web_binders').get().n,0);}finally{f.close();}
});
test('catalogue failure diagnostics contain bounded transport facts and no visitor input or identity',async()=>{
 const f=fixture();try{f.state.fail=true;await f.call('/catalogue/search?q=private-search-value');assert.equal(f.issues.length,1);assert.deepEqual(Object.keys(f.issues[0]).sort(),['elapsedMs','error','phase','route','status']);assert.equal(f.issues[0].route,'/search');assert.equal(f.issues[0].phase,'transport');assert.ok(!JSON.stringify(f.issues).includes('private-search-value'));assert.ok(!JSON.stringify(f.issues).includes('same-email'));}finally{f.close();}
});
