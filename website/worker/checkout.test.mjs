import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {createCheckoutService} from './checkout.mjs';
import {createShopService} from './shop-state.mjs';

const origin='https://shop.stackr.test';
const products=[{id:'black-bundle',name:'Black Bolt',type:'Booster bundle',language:'English',setKey:'black-bolt',packs:6,unit:'one retail item'},{id:'jp-box',name:'Black Bolt',type:'Booster box',language:'Japanese',setKey:'jp-black-bolt',packs:20,unit:'one retail item'}];
function fixture(overrides={}){
 const catalogueProducts=overrides.products||products;
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const migration of ['0000_shop_stock_interest','0001_stripe_checkout'])sqlite.exec(readFileSync(new URL('../drizzle/'+migration+'.sql',import.meta.url),'utf8'));
 let clock=Date.parse('2026-11-03T12:00:00Z');
 const DB={prepare(sql){let values=[];const statement={bind(...args){values=args;return statement;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {success:true,results:sqlite.prepare(sql).all(...values)};},async run(){return statement.sync();},sync(){const r=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.sync());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const env={DB,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_MODE:'test',SHOP_CHECKOUT_ENABLED:'true',SHOP_POLICIES_READY:'true',SHOP_PUBLIC_ORIGIN:origin,SHOP_SHIPPING_PENCE:'395',SHOP_OWNER_EMAIL:'owner@example.com'};
 const quotes={currency:'GBP',products:Object.fromEntries(catalogueProducts.map(p=>[p.id,{status:'current',identity:{...p,edition:p.edition||'standard',cardsPerPack:p.cardsPerPack??null},currency:'GBP',shopPence:2500,expiresAt:new Date(clock+86400000).toISOString()}]))};
 const sessions=new Map(),keys=new Map(),requests=[];let fail=null;
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');
  if(fail==='network'){fail=null;throw Error('lost response');}
  if(fail==='stripe400'){fail=null;return Response.json({error:{message:'bad params'}},{status:400});}
  if(options.method==='POST'){
   const key=options.headers['Idempotency-Key'];if(keys.has(key))return Response.json(sessions.get(keys.get(key)));
   const form=new URLSearchParams(options.body),id='cs_test_'+randomUUID().replaceAll('-','');
   const session={id,url:'https://checkout.stripe.com/c/pay/'+id,metadata:{stackr_order_id:form.get('metadata[stackr_order_id]')},client_reference_id:form.get('client_reference_id'),status:'open',payment_status:'unpaid',livemode:false,currency:'gbp',amount_total:395+catalogueProducts.reduce((n,p,i)=>n+Number(form.get('line_items['+i+'][quantity]')||0)*Number(form.get('line_items['+i+'][price_data][unit_amount]')||0),0),payment_intent:'pi_fixture'};
   sessions.set(id,session);keys.set(key,id);return Response.json(session);
  }
  const id=url.split('/').at(-1);return sessions.has(id)?Response.json(sessions.get(id)):Response.json({error:'missing'},{status:404});
 };
 const service=createCheckoutService({products:catalogueProducts,getPrices:async()=>quotes,fetchImpl,now:()=>clock});
 const request=(path,{method='GET',body,cookie,headers={}}={})=>new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const call=(path,options,overrides={})=>service.handleRequest(request(path,options),{...env,...overrides});
 const guest=async()=>{const r=await call('/api/checkout/config');return r.headers.get('Set-Cookie').split(';')[0];};
 const stock=(id='black-bundle',quantity=5)=>sqlite.prepare('INSERT OR REPLACE INTO shop_inventory(product_id,status,quantity,note,updated_at,updated_by) VALUES(?,?,?,?,?,?)').run(id,'in_stock',quantity,'',new Date(clock).toISOString(),'owner');
 const quantity=(id='black-bundle')=>sqlite.prepare('SELECT quantity FROM shop_inventory WHERE product_id=?').get(id)?.quantity;
 const checkout=(cookie,items=[{productId:'black-bundle',quantity:1,expectedUnitPence:2500}],attemptId=randomUUID())=>({method:'POST',cookie,body:{items,attemptId}});
 async function webhook(session,type='checkout.session.completed',id='evt_'+randomUUID().replaceAll('-',''),overrides={}){
  const event={id,type,livemode:false,data:{object:{id:session.id}}},body=JSON.stringify(event),t=String(Math.floor(clock/1000)),sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.'+body).digest('hex');
  return service.handleRequest(new Request(origin+'/api/stripe/webhook',{method:'POST',body,headers:{'Stripe-Signature':'t='+t+',v1='+sig}}),{...env,...overrides});
 }
 return {sqlite,env,DB,service,call,request,guest,stock,quantity,checkout,sessions,keys,requests,quotes,webhook,fail:value=>{fail=value;},tick:ms=>{clock+=ms;},close:()=>sqlite.close()};
}

test('checkout remains closed without explicit merchant, delivery, policy and webhook configuration',async()=>{
 const f=fixture();try{
  for(const override of [{SHOP_CHECKOUT_ENABLED:'false'},{SHOP_POLICIES_READY:'false'},{STRIPE_SECRET_KEY:undefined},{STRIPE_WEBHOOK_SECRET:''},{SHOP_SHIPPING_PENCE:''},{SHOP_PUBLIC_ORIGIN:'http://unsafe.test'},{STRIPE_MODE:'live'}]){
   const r=await f.call('/api/checkout/config',{},override);assert.equal((await r.json()).enabled,false);assert.equal(r.headers.get('Set-Cookie'),null);
   assert.equal((await f.call('/api/checkout',f.checkout(''),override)).status,503);
  }
  assert.equal(f.requests.length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_orders').get().n,0);
 }finally{f.close();}
});

test('guest checkout validates origin, signed cookie, exact product identities, duplicate lines and server prices',async()=>{
 const f=fixture();try{
  f.stock();const cookie=await f.guest();
  assert.match(cookie,/^stackr_checkout_client=/);
  assert.equal((await f.call('/api/checkout',f.checkout('forged'))).status,401);
  assert.equal((await f.call('/api/checkout',{...f.checkout(cookie),headers:{Origin:'https://evil.test'}})).status,403);
  for(const items of [[{productId:'missing',quantity:1,expectedUnitPence:2500}],[{productId:'black-bundle',quantity:4,expectedUnitPence:2500}],[{productId:'black-bundle',quantity:1,expectedUnitPence:1}],Array(2).fill({productId:'black-bundle',quantity:1,expectedUnitPence:2500})])assert([400,409].includes((await f.call('/api/checkout',f.checkout(cookie,items))).status));
  assert.equal(f.quantity(),5);assert.equal(f.requests.length,0);
 }finally{f.close();}
});

test('future release dates reject checkout before any stock hold or Stripe request, then open at the release boundary',async()=>{
 const release=Date.parse('2026-11-06T00:00:00Z'),f=fixture({products:products.map(p=>p.id==='black-bundle'?{...p,releaseDate:'2026-11-06'}:p)});try{
  f.stock();f.quotes.products['black-bundle'].expiresAt='2026-11-07T00:00:00Z';
  const cookie=await f.guest(),request=f.checkout(cookie);
  const blocked=async()=>{
   const r=await f.call('/api/checkout',request);assert.equal(r.status,409);assert.equal((await r.json()).error,'product_not_released');
   assert.equal(f.quantity(),5);assert.equal(f.requests.length,0);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_orders').get().n,0);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_order_items').get().n,0);
  };
  await blocked();f.tick(release-Date.parse('2026-11-03T12:00:00Z')-1);await blocked();
  f.tick(1);const r=await f.call('/api/checkout',request);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
  assert.equal(f.quantity(),4);assert.equal(f.requests.length,1);
 }finally{f.close();}
});

test('a month-only Ditto release never substitutes for a confirmed counted stock record',async()=>{
 const ditto={id:'ditto',name:'30th Celebration — Ditto',type:'Premium collection',language:'English',setKey:'celebration-30th',packs:8,unit:'one retail item',releaseMonth:'2026-11'};
 const f=fixture({products:[ditto]});try{
  const cookie=await f.guest(),request=f.checkout(cookie,[{productId:'ditto',quantity:1,expectedUnitPence:2500}]);
  for(const unknownCount of [false,true]){
   if(unknownCount){f.stock('ditto',5);f.sqlite.prepare('UPDATE shop_inventory SET quantity=NULL WHERE product_id=?').run('ditto');}
   const r=await f.call('/api/checkout',request);assert.equal(r.status,409);assert.equal((await r.json()).error,'stock_changed');
   assert.equal(f.requests.length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_orders').get().n,0);
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_order_items').get().n,0);
  }
  f.stock('ditto',2);const r=await f.call('/api/checkout',request);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
  assert.equal(f.quantity('ditto'),1);assert.equal(f.requests.length,1);
 }finally{f.close();}
});

test('checkout atomically holds counted stock and uses server totals, exact language and a stable Stripe idempotency key',async()=>{
 const f=fixture();try{
  f.stock();f.stock('jp-box',3);const cookie=await f.guest(),request=f.checkout(cookie,[{productId:'jp-box',quantity:2,expectedUnitPence:2500},{productId:'black-bundle',quantity:3,expectedUnitPence:2500}]);
  const a=await f.call('/api/checkout',request);assert.equal(a.status,200);assert.equal((await a.json()).ok,true);assert.equal(f.quantity(),2);assert.equal(f.quantity('jp-box'),1);
  const b=await f.call('/api/checkout',request);assert.equal(b.status,200);assert.equal(f.quantity(),2);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
  const form=new URLSearchParams(f.requests[0].options.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'2500');assert.match(form.get('line_items[1][price_data][product_data][name]'),/Japanese/);assert.equal(form.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'395');assert.equal(form.get('payment_method_types[0]'),'card');
  assert.equal(f.sqlite.prepare('SELECT total_pence FROM shop_orders').get().total_pence,12895);
 }finally{f.close();}
});

test('two shoppers cannot buy the last unit and an unavailable cart rolls back every stock hold',async()=>{
 const f=fixture();try{
  f.stock('black-bundle',1);const alice=await f.guest(),bob=await f.guest();
  const results=await Promise.all([f.call('/api/checkout',f.checkout(alice)),f.call('/api/checkout',f.checkout(bob))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.quantity(),0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM shop_orders').get().n,1);
 }finally{f.close();}
 const g=fixture();try{
  g.stock();const cookie=await g.guest();const r=await g.call('/api/checkout',g.checkout(cookie,[{productId:'black-bundle',quantity:1,expectedUnitPence:2500},{productId:'jp-box',quantity:1,expectedUnitPence:2500}]));
  assert.equal(r.status,409);assert.equal(g.quantity(),5);assert.equal(g.sqlite.prepare('SELECT COUNT(*) n FROM shop_orders').get().n,0);
 }finally{g.close();}
});

test('signed webhooks confirm actual Stripe payment once; forged totals or signatures cannot confirm orders',async()=>{
 const f=fixture();try{
  f.stock();const cookie=await f.guest();await f.call('/api/checkout',f.checkout(cookie));const session=[...f.sessions.values()][0];session.status='complete';session.payment_status='paid';
  assert.equal((await f.service.handleRequest(new Request(origin+'/api/stripe/webhook',{method:'POST',body:'{}',headers:{'Stripe-Signature':'t=1,v1=bad'}}),f.env)).status,400);
  session.amount_total=1;assert.equal((await f.webhook(session)).status,409);assert.equal(f.sqlite.prepare('SELECT status FROM shop_orders').get().status,'pending');
  session.amount_total=2895;assert.equal((await f.webhook(session,'checkout.session.completed','evt_once')).status,200);assert.equal((await f.webhook(session,'checkout.session.completed','evt_once')).status,200);assert.equal((await f.webhook(session,'checkout.session.completed','evt_twice')).status,200);
  assert.equal(f.quantity(),4);assert.equal(f.sqlite.prepare('SELECT status FROM shop_orders').get().status,'paid');
  const r=await f.call('/api/checkout/status?session_id='+session.id,{cookie});assert.equal((await r.json()).status,'paid');assert.equal((await f.call('/api/checkout/status?session_id='+session.id,{cookie},{SHOP_CHECKOUT_ENABLED:'false'})).status,200);
  assert.equal((await f.call('/api/checkout/status?session_id='+session.id,{cookie:await f.guest()})).status,404);
 }finally{f.close();}
});

test('confirmed session expiry releases stock exactly once and owner recounts cannot overwrite active holds',async()=>{
 const f=fixture();try{
  f.stock();const cookie=await f.guest();await f.call('/api/checkout',f.checkout(cookie));const session=[...f.sessions.values()][0];
  const stockService=createShopService({products,now:()=>Date.parse('2026-11-03T12:00:00Z')});
  const admin=new Request(origin+'/api/admin/stock',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'},body:JSON.stringify({productId:'black-bundle',status:'in_stock',quantity:20})});
  assert.equal((await stockService.handleRequest(admin,f.env)).status,409);assert.equal(f.quantity(),4);
  session.status='expired';assert.equal((await f.webhook(session,'checkout.session.expired','evt_expire')).status,200);assert.equal(f.quantity(),5);
  assert.equal((await f.webhook(session,'checkout.session.expired','evt_expire_again')).status,200);assert.equal(f.quantity(),5);
 }finally{f.close();}
});

test('uncertain Stripe failures keep a single hold and retry safely; pausing sales still permits payment settlement',async()=>{
 const f=fixture();try{
  f.stock();const cookie=await f.guest(),request=f.checkout(cookie);f.fail('network');assert.equal((await f.call('/api/checkout',request)).status,503);assert.equal(f.quantity(),4);
  assert.equal((await f.call('/api/checkout',request)).status,200);assert.equal(f.quantity(),4);
  assert.equal(f.requests[0].options.headers['Idempotency-Key'],f.requests[1].options.headers['Idempotency-Key']);
  const session=[...f.sessions.values()][0];session.status='complete';session.payment_status='paid';assert.equal((await f.webhook(session,'checkout.session.completed','evt_paused',{SHOP_CHECKOUT_ENABLED:'false'})).status,200);
  assert.equal(f.sqlite.prepare('SELECT status FROM shop_orders').get().status,'paid');
 }finally{f.close();}
});

test('definitive Stripe rejection returns held stock and unknown counts cannot be sold',async()=>{
 const f=fixture();try{
  f.stock();const cookie=await f.guest();f.fail('stripe400');assert.equal((await f.call('/api/checkout',f.checkout(cookie))).status,503);assert.equal(f.quantity(),5);
  f.sqlite.prepare("UPDATE shop_inventory SET quantity=NULL, status='in_stock'").run();assert.equal((await f.call('/api/checkout',f.checkout(cookie))).status,409);
 }finally{f.close();}
});
