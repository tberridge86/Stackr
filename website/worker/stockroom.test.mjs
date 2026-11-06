import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {createStockroomService} from './stockroom.mjs';
import {createOwnerService} from './owner.mjs';
import {createCheckoutService} from './checkout.mjs';
const origin='https://shop.test',secret='disposable-test-secret-not-a-production-key';
const products=[{id:'day',name:'Day',type:'Ultra-Premium Collection',language:'English',languageCode:'en',setKey:'30th',packs:30,unit:'1 retail unit'},{id:'night',name:'Night',type:'Ultra-Premium Collection',language:'English',languageCode:'en',setKey:'30th',packs:30,unit:'1 retail unit'}];
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const tag of ['0000_shop_stock_interest','0001_stripe_checkout','0002_owner_books','0004_stockroom_bridge'])sql.exec(readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8'));
 let clock=Date.parse('2026-11-06T12:00:00Z'),beforeWrite=null;
 const DB={prepare(query){let values=[];return{query,bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {success:true,results:sql.prepare(query).all(...values)};},async run(){return this.sync();},sync(){const s=sql.prepare(query);if(s.columns().length)return {success:true,results:s.all(...values)};const r=s.run(...values);return {success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){if(beforeWrite&&statements.some(s=>s.query.startsWith('INSERT INTO owner_actions'))){const run=beforeWrite;beforeWrite=null;run();}sql.exec('BEGIN');try{const r=statements.map(s=>s.sync());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const feed={currency:'GBP',discountBps:1000,products:Object.fromEntries(products.map(p=>[p.id,{productId:p.id,identity:{language:p.language,setKey:p.setKey,type:p.type,packs:p.packs,unit:p.unit,edition:'standard',cardsPerPack:null},status:'current',currency:'GBP',shopPence:9000,marketPence:10000,savingsPence:1000,observedAt:'2026-11-05T00:00:00.000Z',asOf:'2026-11-05T00:00:00.000Z',expiresAt:'2026-11-12T00:00:00.000Z',selectedSourceId:'retailer',configuredSourceCount:1,currentSourceCount:1,indicative:true,sources:[{id:'retailer',name:'Configured retailer',url:'https://retailer.test/'+p.id,currency:'GBP',marketPence:10000,status:'current',observedAt:'2026-11-05T00:00:00.000Z',asOf:'2026-11-05T00:00:00.000Z'}]}]))};
 const env={DB,STOCKROOM_SYNC_SECRET:secret,SHOP_OWNER_EMAIL:'owner@test.uk'},service=createStockroomService({products,getFeed:async()=>structuredClone(feed),now:()=>clock});
 const call=(path,data,headers={},overrides={})=>service.handleRequest(new Request(origin+'/api/stockroom/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})}),{...env,...overrides});
 const ok=async(path,data)=>{const r=await call(path,data),b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;};
 const snap=()=>ok('snapshot');
 const row=(p,quantity=5,extra={})=>({productId:p.id,quantity,expectedQuantity:p.quantity,expectedStatus:p.status,expectedAt:p.updatedAt,expectedReservedQuantity:p.reservedQuantity,expectedPaidQuantity:p.paidQuantity,expectedPriceRevision:p.priceRevision,...extra});
 const publish=async(quantity=5,extra={})=>{const s=await snap();return ok('publish',{id:randomUUID(),rows:[row(s.products[0],quantity,extra)]});};
 const qty=(id='day')=>sql.prepare('SELECT quantity FROM shop_inventory WHERE product_id=?').get(id)?.quantity;
 const reserve=(id=randomUUID(),mode='live',productId='day',quantity=1)=>{sql.prepare("INSERT INTO shop_orders(id,client_id,ip_hash,status,mode,items_json,subtotal_pence,delivery_pence,total_pence,created_at,updated_at,expires_at) VALUES(?,?,?,'creating',?,'[{\"email\":\"must-not-leak@test.uk\"}]',?,395,?,?,?,0)").run(id,'private-client-'+id,'private-ip-hash',mode,quantity*9000,quantity*9000+395,new Date(clock).toISOString(),new Date(clock).toISOString());sql.prepare('INSERT INTO shop_order_items(order_id,product_id,quantity,unit_pence) VALUES(?,?,?,9000)').run(id,productId,quantity);return id;};
 return {sql,DB,env,service,call,ok,snap,row,publish,qty,reserve,feed,now:()=>clock,tick:n=>{clock+=n;},race:f=>{beforeWrite=f;},close:()=>sql.close()};
}
test('bridge fails closed, exact catalogue starts unknown, response contains no identity or customer data',async()=>{
 const f=fixture();try{
  for(const overrides of [{STOCKROOM_SYNC_SECRET:undefined},{STOCKROOM_SYNC_SECRET:'short'}])assert.equal((await f.call('snapshot',undefined,{},overrides)).status,401);
  assert.equal((await f.call('snapshot',undefined,{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await f.call('snapshot',undefined,{'oai-authenticated-user-id':'owner',Authorization:''})).status,401);
  const s=await f.snap();assert.equal(s.connected,true);assert.equal(s.ordersComplete,true);assert.equal(s.products.length,2);assert.equal(s.products[0].quantity,null);assert.equal(s.products[0].status,'unknown');assert.equal(s.products[0].rrpPence,null);assert.match(s.products[0].priceRevision,/^p1\.[a-f0-9]{64}$/);
  assert.equal((await f.call('snapshot')).headers.get('Access-Control-Allow-Origin'),null);assert.match((await f.call('snapshot')).headers.get('Cache-Control'),/no-store/);
  await f.publish(8);const live=f.reserve(),pending=f.reserve(),trial=f.reserve(undefined,'test');
  f.sql.prepare("UPDATE shop_orders SET status='paid',payment_intent='must-not-leak' WHERE id IN (?,?)").run(live,trial);
  const next=await f.snap();assert.equal(next.products[0].quantity,5);assert.equal(next.products[0].paidQuantity,1);assert.equal(next.products[0].reservedQuantity,1);assert.equal(next.orders.length,1);assert.equal(next.orders[0].id,live);assert.deepEqual(next.orders[0].items,[{productId:'day',quantity:1,unitPence:9000}]);
  assert.doesNotMatch(JSON.stringify(next),/must-not-leak|private-client|private-ip-hash|client_id|payment_intent|stripe_url|items_json/);
 }finally{f.close();}
});
test('stock publish uses exact IDs, stable replay, missing-row CAS and an atomic batch',async()=>{
 const f=fixture();try{
  const s=await f.snap(),data={id:randomUUID(),rows:s.products.map(p=>f.row(p,5))};
  assert.equal((await f.ok('publish',data)).replay,false);assert.equal((await f.ok('publish',data)).replay,true);assert.equal(f.qty(),5);assert.equal(f.qty('night'),5);assert.equal(f.sql.prepare('SELECT count(*) n FROM owner_actions').get().n,1);
  assert.equal((await f.call('publish',{...data,rows:[{...data.rows[0],quantity:8}]})).status,409);
  const stale=await f.snap();f.sql.prepare("UPDATE shop_inventory SET quantity=6,updated_at='2026-11-06T12:00:01.000Z' WHERE product_id='night'").run();
  const r=await f.call('publish',{id:randomUUID(),rows:stale.products.map(p=>f.row(p,9,{salePence:18000,marketPence:20000,marketSource:'Owner source',marketChecked:'2026-11-06'}))});assert.equal(r.status,409);assert.equal(f.qty(),5);assert.equal(f.qty('night'),6);assert.equal(f.sql.prepare('SELECT count(*) n FROM shop_price_overrides').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM owner_actions').get().n,1);
  assert.equal((await f.call('publish',{id:randomUUID(),rows:[{...data.rows[0],productId:'day-ish'}]})).status,400);
  assert.equal((await f.call('publish',{id:randomUUID(),rows:[data.rows[0],data.rows[0]]})).status,400);
 }finally{f.close();}
});
test('active holds and a reservation created after validation both block writes',async()=>{
 const f=fixture();try{
  await f.publish(5);let s=await f.snap();f.race(()=>f.reserve());
  const result=await f.call('publish',{id:randomUUID(),rows:[f.row(s.products[0],10)]});assert.equal(result.status,409);assert.equal((await result.json()).error,'stock_reserved');assert.equal(f.qty(),4);
  s=await f.snap();assert.equal(s.products[0].reservedQuantity,1);assert.equal((await f.call('publish',{id:randomUUID(),rows:[f.row(s.products[0],10)]})).status,409);
 }finally{f.close();}
});
test('paid-unit guard catches settlement even when available stock and timestamp do not move',async()=>{
 const f=fixture();try{
  await f.publish(5);const order=f.reserve();const s=await f.snap();
  f.race(()=>f.sql.prepare("UPDATE shop_orders SET status='paid' WHERE id=?").run(order));
  const data={id:randomUUID(),rows:[f.row(s.products[0],10,{expectedReservedQuantity:0})]};
  const result=await f.call('publish',data);assert.equal(result.status,409);assert.equal((await result.json()).error,'stock_changed');assert.equal(f.qty(),4);
 }finally{f.close();}
});
test('manual price is preserved as owner evidence and every price consumer sees the same expiry',async()=>{
 const f=fixture();try{
  const s=await f.snap(),data={id:randomUUID(),rows:[f.row(s.products[0],5,{salePence:18000,marketPence:20000,marketSource:'https://example.test/reference?'+ 'a'.repeat(1000),marketChecked:'2026-11-06'})]};
  await f.ok('publish',data);const priced=await f.service.getPrices(f.env),q=priced.products.day,next=await f.snap();
  assert.equal(q.shopPence,18000);assert.equal(q.referenceType,'Owner-entered reference');assert.equal(q.feedReference.marketPence,10000);assert.equal(q.feedReference.sources[0].url,'https://retailer.test/day');assert.equal(q.asOf,'2026-11-06T00:00:00.000Z');assert.equal(q.expiresAt,'2026-11-13T00:00:00.000Z');assert.equal(next.products[0].salePence,18000);assert.equal(next.products[0].rrpPence,null);
  const owner=createOwnerService({products,getPrices:env=>f.service.getPrices(env),now:f.now});
  const request=new Request(origin+'/api/owner/dashboard',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@test.uk'}});
  const dashboard=await(await owner.handleRequest(request,f.env)).json();assert.equal(dashboard.inventory.find(i=>i.product_id==='day').salePence,18000);
  const clientSource=readFileSync(new URL('../src/live-pricing.js',import.meta.url),'utf8');class Clock extends Date{static now(){return f.now();}}
  const context=vm.createContext({pricingBootstrap:f.feed,Date:Clock,Intl,URL,product:products[0],value:priced});vm.runInContext(clientSource+';priceFeed=value;',context);assert.equal(vm.runInContext('currentQuote(product).shopPence',context),18000);assert.equal(vm.runInContext('priceReferenceLabel(currentQuote(product))',context),'Owner-entered reference');
  f.tick(Date.parse(q.expiresAt)-f.now());const expired=await f.snap();assert.equal(expired.products[0].salePence,null);assert.equal(expired.products[0].priceStatus,'stale');assert.equal(vm.runInContext('currentQuote(product)',context),null);
  assert.equal((await f.ok('publish',data)).replay,true,'A lost response retry must remain idempotent after reference expiry');
 }finally{f.close();}
});
test('publish rejects stale, future or mismatched prices without touching stock',async()=>{
 const f=fixture();try{
  const s=await f.snap(),base=f.row(s.products[0],5,{salePence:18000,marketPence:20000,marketSource:'Owner source',marketChecked:'2026-11-06'});
  for(const patch of [{marketChecked:'2026-10-30'},{marketChecked:'2026-11-07'},{marketChecked:'2026-02-30'},{salePence:19000},{marketPence:0},{marketSource:''}]){const r=await f.call('publish',{id:randomUUID(),rows:[{...base,...patch}]});assert([400,409].includes(r.status),JSON.stringify(await r.json()));}
  assert.equal(f.qty(),undefined);assert.equal(f.sql.prepare('SELECT count(*) n FROM owner_actions').get().n,0);
 }finally{f.close();}
});
test('feed price keeps its original provenance and expiry; feed changes invalidate preview',async()=>{
 const f=fixture();try{
  const s=await f.snap(),row=f.row(s.products[0],5,{salePence:9000});await f.ok('publish',{id:randomUUID(),rows:[row]});
  const q=(await f.service.getPrices(f.env)).products.day;assert.equal(q.priceOverride.basis,'feed');assert.equal(q.expiresAt,'2026-11-12T00:00:00.000Z');assert.deepEqual(q.sources,f.feed.products.day.sources);
  const next=await f.snap();f.feed.products.day.marketPence=12000;f.feed.products.day.shopPence=10800;
  assert.equal((await f.call('publish',{id:randomUUID(),rows:[f.row(next.products[0],9)]})).status,409);assert.equal(f.qty(),5);
 }finally{f.close();}
});
test('concurrent override revision change rolls back the stock operation',async()=>{
 const f=fixture();try{
  await f.publish(5,{salePence:18000,marketPence:20000,marketSource:'Owner source',marketChecked:'2026-11-06'});const s=await f.snap();
  f.race(()=>{const id=randomUUID();f.sql.prepare("INSERT INTO owner_actions(id,payload,created_at,user_id) VALUES(?,'other','2026-11-06T12:00:00.000Z','other')").run(id);f.sql.prepare("UPDATE shop_price_overrides SET revision=? WHERE product_id='day'").run(id);});
  const result=await f.call('publish',{id:randomUUID(),rows:[f.row(s.products[0],10)]});assert.equal(result.status,409);assert.equal((await result.json()).error,'price_changed');assert.equal(f.qty(),5);
 }finally{f.close();}
});
test('checkout charges the same owner price and refuses it after expiry',async()=>{
 const f=fixture();try{
  await f.publish(5,{salePence:18000,marketPence:20000,marketSource:'Owner source',marketChecked:'2026-11-06'});
  const env={...f.env,STRIPE_SECRET_KEY:'sk_test_disposable',STRIPE_WEBHOOK_SECRET:'whsec_disposable',STRIPE_MODE:'test',SHOP_CHECKOUT_ENABLED:'true',SHOP_POLICIES_READY:'true',SHOP_PUBLIC_ORIGIN:origin,SHOP_SHIPPING_PENCE:'395'};
  let called=0;const checkout=createCheckoutService({products,getPrices:e=>f.service.getPrices(e),now:f.now,fetchImpl:async(url,options)=>{called++;const form=new URLSearchParams(options.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'18000');return Response.json({id:'cs_test_disposable12345',url:'https://checkout.stripe.com/c/pay/disposable',livemode:false,status:'open'});}});
  const guest=async()=>{const r=await checkout.handleRequest(new Request(origin+'/api/checkout/config'),env);return r.headers.get('Set-Cookie').split(';')[0];};
  const order=async expectedUnitPence=>checkout.handleRequest(new Request(origin+'/api/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:await guest()},body:JSON.stringify({attemptId:randomUUID(),items:[{productId:'day',quantity:1,expectedUnitPence}]})}),env);
  assert.equal((await order(9000)).status,409);const success=await order(18000);assert.equal(success.status,200,JSON.stringify(await success.json()));assert.equal(called,1);assert.equal(f.qty(),4);
  // Settle the disposable session so expiry is checking the quote, not a hold.
  f.sql.prepare("UPDATE shop_orders SET status='paid' WHERE status='pending'").run();f.tick(Date.parse('2026-11-13T00:00:00Z')-f.now());
  const expired=await order(18000);assert.equal(expired.status,409);assert.equal((await expired.json()).error,'price_changed');assert.equal(called,1);
 }finally{f.close();}
});
test('override storage errors cannot silently fall back to a different feed price',async()=>{
 const f=fixture();try{f.sql.exec('DROP TABLE shop_price_overrides');await assert.rejects(f.service.getPrices(f.env));assert.equal((await f.call('snapshot')).status,503);}finally{f.close();}
});
