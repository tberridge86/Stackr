/* Hosted Stripe Checkout. No payment credentials or stock authority reach the browser. */
const CHECKOUT_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SESSION=/^cs_(?:test_|live_)?[A-Za-z0-9_]{10,200}$/;
const COOKIE='stackr_checkout_client';
function reply(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{...CHECKOUT_HEADERS,...headers}});}
function fault(code,status=400,message){return Object.assign(Error(code),{code,status,message:message||code});}
function config(env){
 const mode=env.STRIPE_MODE==='live'?'live':'test';
 const delivery=/^\d{1,7}$/.test(env.SHOP_SHIPPING_PENCE||'')?Number(env.SHOP_SHIPPING_PENCE):null;
 let origin=null;try{const u=new URL(env.SHOP_PUBLIC_ORIGIN);if(u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash)origin=u.origin;}catch{}
 const ready=env.SHOP_CHECKOUT_ENABLED==='true'&&env.SHOP_POLICIES_READY==='true'&&delivery!==null&&origin&&new RegExp('^(?:sk|rk)_'+mode+'_').test(env.STRIPE_SECRET_KEY||'')&&/^whsec_.+/.test(env.STRIPE_WEBHOOK_SECRET||'');
 return {enabled:!!ready,mode:ready?mode:'unavailable',deliveryPence:ready?delivery:null,origin};
}
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function signingKey(secret){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function signature(secret,text){return [...new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function validSignature(secret,text,hex){if(!/^[a-f0-9]{64}$/.test(hex||''))return false;return crypto.subtle.verify('HMAC',await signingKey(secret),Uint8Array.from(hex.match(/../g),h=>parseInt(h,16)),new TextEncoder().encode(text));}
async function clientId(request,env){
 const value=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const[id,sig]=value.split('.');return UUID.test(id||'')&&await validSignature(env.STRIPE_SECRET_KEY,'guest:'+id,sig)?id:null;
}
async function readBody(request,limit){
 if(!request.body)throw fault('body_required');
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fault('body_too_large',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function resultRows(r){if(r?.success===false||!Array.isArray(r?.results))throw Error('storage');return r.results;}
async function write(stmt){const r=await stmt.run();if(!r||r.success===false)throw Error('storage');return r;}
async function batch(db,statements){const r=await db.batch(statements);if(!Array.isArray(r)||r.some(x=>x?.success===false))throw Error('storage');return r;}
export function createCheckoutService({products,getPrices,fetchImpl=fetch,now=Date.now}){
 const catalogue=new Map(products.map(p=>[p.id,p]));
 const iso=()=>new Date(now()).toISOString();
 async function stripe(env,path,{body,key}={}){
  const response=await fetchImpl('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:body.toString()}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
  const data=await response.json();if(!response.ok)throw Object.assign(Error('stripe_request_failed'),{stripeStatus:response.status,stripeParam:data?.error?.param});return data;
 }
 function parameters(order,env){
  const c=config(env),form=new URLSearchParams({mode:'payment',success_url:c.origin+'/shop?session_id={CHECKOUT_SESSION_ID}',cancel_url:c.origin+'/shop?checkout=cancelled',expires_at:String(order.expires_at),client_reference_id:order.id,'metadata[stackr_order_id]':order.id,'payment_method_types[0]':'card','shipping_address_collection[allowed_countries][0]':'GB','shipping_options[0][shipping_rate_data][type]':'fixed_amount','shipping_options[0][shipping_rate_data][fixed_amount][amount]':String(order.delivery_pence),'shipping_options[0][shipping_rate_data][fixed_amount][currency]':'gbp','shipping_options[0][shipping_rate_data][display_name]':'UK delivery'});
  for(const[item,index]of JSON.parse(order.items_json).map((item,index)=>[item,index])){const product=catalogue.get(item.productId);form.set('line_items['+index+'][price_data][currency]','gbp');form.set('line_items['+index+'][price_data][unit_amount]',String(item.unitPence));form.set('line_items['+index+'][price_data][product_data][name]',product.name+' · '+product.type+' · '+product.language);form.set('line_items['+index+'][quantity]',String(item.quantity));}
  return form;
 }
 async function orderById(env,id){return env.DB.prepare('SELECT * FROM shop_orders WHERE id = ?').bind(id).first();}
 async function applySession(env,session,event=null){
  const id=session.metadata?.stackr_order_id;if(!UUID.test(id||''))throw fault('unknown_order',404);
  const order=await orderById(env,id);if(!order)throw fault('unknown_order',404);
  if(order.mode!==(session.livemode?'live':'test')||order.stripe_session_id&&order.stripe_session_id!==session.id||session.client_reference_id!==id)throw fault('payment_mismatch',409);
  let status=order.status;
  if(session.payment_status==='paid'){
   if(session.currency!=='gbp'||session.amount_total!==order.total_pence||session.status!=='complete')throw fault('payment_mismatch',409);
   if(['expired','failed'].includes(order.status))throw fault('payment_needs_review',409);
   status='paid';
  }else if(session.status==='expired'&&['creating','pending'].includes(order.status))status='expired';
  const statements=[];
  if(event)statements.push(env.DB.prepare('INSERT INTO shop_payment_events (event_id, order_id, event_type, received_at) VALUES (?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING').bind(event.id,id,event.type,iso()));
  statements.push(env.DB.prepare("UPDATE shop_orders SET status = ?, stripe_session_id = ?, payment_intent = ?, updated_at = ? WHERE id = ? AND status IN ('creating','pending')").bind(status,session.id,typeof session.payment_intent==='string'?session.payment_intent:null,iso(),id));
  await batch(env.DB,statements);return {...order,status};
 }
 async function openSession(env,order){
  if(order.status==='paid')throw fault('already_paid',409,'This order is already paid. Please check your receipt.');
  if(['expired','failed'].includes(order.status))throw fault('checkout_expired',409,'This checkout has closed. Refresh your bag and start again.');
  if(order.stripe_session_id){
   const session=await stripe(env,'checkout/sessions/'+encodeURIComponent(order.stripe_session_id));
   if(session.status!=='open'){await applySession(env,session);throw fault('checkout_closed',409,'This checkout has already closed. Check your payment before starting again.');}
   if(!order.stripe_url)throw Error('checkout_url_missing');return order.stripe_url;
  }
  let session;
  try{session=await stripe(env,'checkout/sessions',{body:parameters(order,env),key:'stackr:'+order.id});}
  catch(error){
   // An ambiguous network/5xx failure may have created a payable session. Keep its hold;
   // retry with exactly the same Stripe idempotency key instead of selling it twice.
   if([400,401,402,403,404,422].includes(error.stripeStatus)&&(now()/1000<order.expires_at||error.stripeStatus===400&&error.stripeParam==='expires_at'))await write(env.DB.prepare("UPDATE shop_orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'creating'").bind(iso(),order.id));
   throw fault('checkout_unavailable',503,'Secure checkout could not be opened. Your bag is kept; retry the same checkout shortly.');
  }
  if(!SESSION.test(session.id||'')||session.livemode!==(order.mode==='live'))throw Error('stripe_mode_mismatch');
  if(session.status!=='open'){await applySession(env,session);throw fault('checkout_closed',409,'This checkout has closed. Check your payment before starting again.');}
  const u=new URL(session.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw Error('checkout_url_invalid');
  await write(env.DB.prepare("UPDATE shop_orders SET stripe_session_id = ?, stripe_url = ?, status = 'pending', updated_at = ? WHERE id = ? AND status IN ('creating','pending')").bind(session.id,u.href,iso(),order.id));
  return u.href;
 }
 async function reconcileExpired(env){
  const orders=resultRows(await env.DB.prepare("SELECT * FROM shop_orders WHERE status IN ('creating','pending') AND expires_at < ? ORDER BY created_at LIMIT 8").bind(Math.floor(now()/1000)).all());
  for(const order of orders){try{
   // Reusing the original idempotency key recovers a session after a lost response.
   if(!order.stripe_session_id){if(now()-Date.parse(order.created_at)>23*3600000)continue;await openSession(env,order);}
   else await applySession(env,await stripe(env,'checkout/sessions/'+encodeURIComponent(order.stripe_session_id)));
  }catch{/* Leave uncertain holds intact for explicit reconciliation. */}}
 }
 async function handleRequest(request,env={}){
  const url=new URL(request.url),path=url.pathname,c=config(env);
  const methods={'/api/checkout/config':'GET','/api/checkout':'POST','/api/checkout/status':'GET','/api/stripe/webhook':'POST'};
  if(!methods[path])return reply({error:'not_found'},404);
  if(request.method!==methods[path])return reply({error:'method_not_allowed'},405,{Allow:methods[path]});
  if(path==='/api/checkout/config'){
   const headers={};if(c.enabled&&!await clientId(request,env)){const id=crypto.randomUUID();headers['Set-Cookie']=COOKIE+'='+id+'.'+await signature(env.STRIPE_SECRET_KEY,'guest:'+id)+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400';}
   return reply({enabled:c.enabled,mode:c.mode,deliveryPence:c.deliveryPence},200,headers);
  }
  // Webhooks still settle existing sessions if the merchant pauses new checkouts.
  if(path==='/api/checkout'&&!c.enabled)return reply({error:'checkout_not_open',message:'Checkout is not open yet. No payment has been taken.'},503);
  try{
   if(!env.DB?.prepare||!env.DB?.batch)throw Error('storage');
   if(path==='/api/stripe/webhook'){
    if(!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_SECRET_KEY)return reply({error:'webhook_not_configured'},503);
    const raw=await readBody(request,65536),parts=(request.headers.get('Stripe-Signature')||'').split(','),t=parts.find(x=>x.startsWith('t='))?.slice(2),signatures=parts.filter(x=>x.startsWith('v1=')).slice(0,5).map(x=>x.slice(3));
    if(!/^\d+$/.test(t||'')||Math.abs(now()/1000-Number(t))>300||!(await Promise.all(signatures.map(sig=>validSignature(env.STRIPE_WEBHOOK_SECRET,t+'.'+raw,sig)))).some(Boolean))return reply({error:'invalid_signature'},400);
    let event;try{event=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
    if(!/^evt_[A-Za-z0-9_]{1,200}$/.test(event?.id||''))return reply({error:'invalid_event'},400);
    if(!['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded'].includes(event.type))return reply({ok:true});
    if(event.livemode!==(env.STRIPE_MODE==='live'))return reply({error:'wrong_mode'},400);
    if(await env.DB.prepare('SELECT event_id FROM shop_payment_events WHERE event_id = ?').bind(event.id).first())return reply({ok:true});
    const id=event.data?.object?.id;if(!SESSION.test(id||''))return reply({error:'invalid_session'},400);
    await applySession(env,await stripe(env,'checkout/sessions/'+encodeURIComponent(id)),event);return reply({ok:true});
   }
   const client=await clientId(request,env);if(!client)throw fault('checkout_session_required',401,'Please refresh the shop before checkout.');
   if(path==='/api/checkout/status'){
    const id=url.searchParams.get('session_id');if(!SESSION.test(id||''))throw fault('invalid_session');
    const session=await stripe(env,'checkout/sessions/'+encodeURIComponent(id)),order=await orderById(env,session.metadata?.stackr_order_id);
    if(!order||order.client_id!==client)throw fault('order_not_found',404);
    const updated=await applySession(env,session);return reply({status:updated.status,mode:updated.mode,attemptId:updated.id});
   }
   if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw fault('same_origin_required',403);
   if(url.origin!==c.origin)throw fault('checkout_origin_mismatch',403);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw fault('json_required',415);
   let body;try{body=JSON.parse(await readBody(request,8192));}catch(error){if(error.status)throw error;throw fault('invalid_json');}
   if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['items','attemptId'].includes(k))||!UUID.test(body.attemptId||'')||!Array.isArray(body.items)||!body.items.length||body.items.length>20)throw fault('invalid_checkout');
   const seen=new Set(),items=body.items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['productId','quantity','expectedUnitPence'].includes(k))||!catalogue.has(item.productId)||seen.has(item.productId)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>3||!Number.isSafeInteger(item.expectedUnitPence)||item.expectedUnitPence<=0)throw fault('invalid_items');
    const product=catalogue.get(item.productId),release=product.releaseDate||(/^\d{4}-\d{2}$/.test(product.releaseMonth||'')?product.releaseMonth+'-01':null);
    if(release&&Date.parse(release+'T00:00:00Z')>now())throw fault('product_not_released',409,'This product has not reached its published release date. You can register interest in the shop.');
    seen.add(item.productId);return {productId:item.productId,quantity:item.quantity,unitPence:item.expectedUnitPence};
   }).sort((a,b)=>a.productId.localeCompare(b.productId));
   const serial=JSON.stringify(items);let order=await orderById(env,body.attemptId);
   if(order){if(order.client_id!==client||order.items_json!==serial||order.mode!==c.mode)throw fault('attempt_conflict',409);return reply({ok:true,url:await openSession(env,order)});}
   await reconcileExpired(env);
   const prices=await getPrices(env);let subtotal=0;
   for(const item of items){const q=prices.products?.[item.productId],p=catalogue.get(item.productId);if(q?.status!=='current'||q.currency!=='GBP'||prices.currency!=='GBP'||Date.parse(q.expiresAt)<=now()||!Number.isFinite(Date.parse(q.expiresAt))||q.shopPence!==item.unitPence||!Number.isSafeInteger(q.shopPence)||q.shopPence<1||Object.entries({language:p.language,setKey:p.setKey,type:p.type,packs:p.packs,unit:p.unit,edition:p.edition||'standard',cardsPerPack:p.cardsPerPack??null}).some(([k,value])=>q.identity?.[k]!==value))throw fault('price_changed',409,'A product price needs refreshing. Please review your bag.');subtotal+=q.shopPence*item.quantity;}
   if(!Number.isSafeInteger(subtotal)||subtotal>100000000)throw fault('order_too_large');
   const time=iso(),expires=Math.floor(now()/1000)+31*60,ipHash=await digest(env.STRIPE_SECRET_KEY+'|'+(request.headers.get('CF-Connecting-IP')||client));
   order={id:body.attemptId,client_id:client,ip_hash:ipHash,status:'creating',mode:c.mode,items_json:serial,subtotal_pence:subtotal,delivery_pence:c.deliveryPence,total_pence:subtotal+c.deliveryPence,created_at:time,updated_at:time,expires_at:expires};
   try{await batch(env.DB,[env.DB.prepare('INSERT INTO shop_orders (id,client_id,ip_hash,status,mode,items_json,subtotal_pence,delivery_pence,total_pence,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(order.id,client,ipHash,'creating',c.mode,serial,subtotal,c.deliveryPence,order.total_pence,time,time,expires),...items.map(item=>env.DB.prepare('INSERT INTO shop_order_items (order_id,product_id,quantity,unit_pence) VALUES (?,?,?,?)').bind(order.id,item.productId,item.quantity,item.unitPence))]);}
   catch(error){if(String(error.message).includes('stock_unavailable'))throw fault('stock_changed',409,'Stock changed while you were browsing. Please refresh your bag.');if(String(error.message).includes('checkout_limit'))throw fault('checkout_active',409,'You already have an open checkout. Return to it, or wait for its stock hold to expire.');const existing=await orderById(env,body.attemptId);if(existing&&existing.client_id===client&&existing.items_json===serial)return reply({ok:true,url:await openSession(env,existing)});throw error;}
   return reply({ok:true,url:await openSession(env,order)});
  }catch(error){return reply({error:error.code||'checkout_unavailable',message:error.status?error.message:'Checkout could not be confirmed. Your bag is kept. Please retry shortly.'},error.status||503);}
 }
 return {handleRequest};
}
