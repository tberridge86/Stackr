/** Server-only bridge. Exact catalogue identities; no customer details cross sites. */
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Authorization'};
const WEEK=7*24*60*60*1000,MAX_LINES=5000;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const fail=(code,message,status=400)=>{throw Object.assign(new Error(message),{code,status});};
const int=(v,max=999999)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail('invalid_request','Use whole quantities and integer GBP pence.');return v;};
const pence=v=>{int(v,100000000);if(v===0)fail('invalid_price','Prices must be positive integer GBP pence.');return v;};
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v))fail('invalid_request','Invalid text field.');return v.trim();};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const identity=p=>({language:p.language,setKey:p.setKey,type:p.type,packs:p.packs,unit:p.unit,edition:p.edition||'standard',cardsPerPack:p.cardsPerPack??null});
const discount=v=>Math.floor((v*9000+5000)/10000);
function timestamp(v,dateOnly=false){
 if(typeof v!=='string'||!(dateOnly?/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/).test(v))fail('invalid_request','Use a valid UTC check date or timestamp.');
 const n=Date.parse(v),s=Number.isFinite(n)?new Date(n).toISOString():'';
 if(!s||s.slice(0,v.length===10?10:19)!==v.slice(0,v.length===10?10:19))fail('invalid_request','Use a valid check date.');return s;
}
async function digest(value){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function authenticated(request,env){
 const secret=env.STOCKROOM_SYNC_SECRET;
 if(typeof secret!=='string'||secret.length<32)return false;
 const auth=request.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length>2048)return false;
 const [a,b]=await Promise.all([digest(auth.slice(7)),digest(secret)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
async function body(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('invalid_request','JSON required.',415);
 if(Number(request.headers.get('Content-Length')||0)>1000000)fail('invalid_request','Request too large.',413);
 const reader=request.body?.getReader();if(!reader)fail('invalid_request','Missing request body.');let n=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>1000000){await reader.cancel();fail('invalid_request','Request too large.',413);}parts.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(data&&typeof data==='object'&&!Array.isArray(data))return data;}catch{}
 fail('invalid_request','Invalid JSON request.');
}
const all=async statement=>{const r=await statement.all();if(!r?.success||!Array.isArray(r.results))throw Error('Storage read failed');return r.results;};
const usable=(q,now)=>q?.status==='current'&&q.currency==='GBP'&&Number.isSafeInteger(q.shopPence)&&q.shopPence>0&&Number.isSafeInteger(q.marketPence)&&q.marketPence>0&&Date.parse(q.expiresAt)>now;
export function createStockroomService({products,getFeed,now=Date.now}){
 const catalogue=new Map(products.map(p=>[p.id,p]));
 const database=env=>{if(!env.DB?.prepare||!env.DB?.batch)throw Error('Storage unavailable');return env.DB;};
 async function readOverrides(env){
  // A build-only/static preview has no D1 binding and cannot contain overrides.
  if(!env.DB)return [];
  return all(database(env).prepare('SELECT * FROM shop_price_overrides'));
 }
 function overlay(feed,overrides){
  const result={...feed,products:{...feed?.products}};
  for(const row of overrides){
   const product=catalogue.get(row.product_id);if(!product)continue;
   const original=feed?.products?.[product.id]||{productId:product.id,identity:identity(product),currency:'GBP',status:'unavailable',sources:[]};
   const reference=row.basis==='feed'?JSON.parse(row.reference_json):original;
   result.products[product.id]={...reference,productId:product.id,identity:identity(product),currency:'GBP',
    status:Date.parse(row.expires_at)>now()&&Date.parse(row.market_checked)<=now()?'current':'stale',
    marketPence:row.market_pence,shopPence:row.sale_pence,savingsPence:row.market_pence-row.sale_pence,
    observedAt:row.basis==='owner'?row.market_checked:reference.observedAt,asOf:row.market_checked,expiresAt:row.expires_at,
    selectedSourceId:row.basis==='owner'?null:reference.selectedSourceId,
    currentSourceCount:row.basis==='owner'?0:reference.currentSourceCount,
    indicative:row.basis==='owner'||reference.indicative,
    referenceType:row.basis==='owner'?'Owner-entered reference':'UK retail asking price',
    method:row.basis==='owner'?'90% of the owner-entered reference. This reference has not been independently verified.':reference.method,
    priceOrigin:'stockroom',priceOverride:{basis:row.basis,source:row.market_source,checkedAt:row.market_checked,expiresAt:row.expires_at,revision:row.revision},
    feedReference:original};
  }
  return result;
 }
 async function applyPrices(env,feed){return overlay(feed,await readOverrides(env));}
 async function getPrices(env){return applyPrices(env,await getFeed(env));}
 async function priceRevision(quote,override){return 'p1.'+await digest(JSON.stringify({quote:quote??null,override:override?.revision??null}));}
 async function snapshot(env){
  const db=database(env),feed=await getFeed(env);
  const statements=[
   db.prepare('SELECT product_id,quantity,status,updated_at FROM shop_inventory'),
   db.prepare("SELECT l.product_id,SUM(CASE WHEN o.status IN ('creating','pending') THEN l.quantity ELSE 0 END) reserved,SUM(CASE WHEN o.status='paid' AND o.mode='live' THEN l.quantity ELSE 0 END) paid FROM shop_order_items l JOIN shop_orders o ON o.id=l.order_id GROUP BY l.product_id"),
   db.prepare('SELECT * FROM shop_price_overrides'),
   db.prepare("SELECT o.id,o.created_at,o.updated_at,o.subtotal_pence,o.delivery_pence,o.total_pence,l.product_id,l.quantity,l.unit_pence FROM shop_orders o JOIN shop_order_items l ON l.order_id=o.id WHERE o.status='paid' AND o.mode='live' ORDER BY o.updated_at,o.id,l.product_id LIMIT ?").bind(MAX_LINES+1)
  ];
  const result=await db.batch(statements);if(result.length!==4||result.some(r=>!r?.success||!Array.isArray(r.results)))throw Error('Snapshot unavailable');
  const [stock,activity,overrides,lines]=result.map(r=>r.results),stockMap=new Map(stock.map(r=>[r.product_id,r])),activityMap=new Map(activity.map(r=>[r.product_id,r])),overrideMap=new Map(overrides.map(r=>[r.product_id,r]));
  const prices=overlay(feed,overrides),checkedAt=new Date(now()).toISOString();
  const catalogueRows=await Promise.all(products.map(async p=>{
   const s=stockMap.get(p.id),a=activityMap.get(p.id),q=prices.products[p.id],current=usable(q,now());
   return {id:p.id,name:p.name,language:p.language,languageCode:p.languageCode,format:p.type,setKey:p.setKey,packs:p.packs,unit:p.unit,image:p.image||null,releaseDate:p.releaseDate||null,
    quantity:s?.quantity??null,status:s?.status??'unknown',updatedAt:s?.updated_at??null,reservedQuantity:a?.reserved||0,paidQuantity:a?.paid||0,
    salePence:current?q.shopPence:null,marketPence:current?q.marketPence:null,rrpPence:Number.isSafeInteger(p.rrpPence)&&p.rrpPence>0&&p.rrpSource?p.rrpPence:null,
    priceStatus:q?.status||'unavailable',priceAsOf:q?.asOf||q?.observedAt||null,priceExpiresAt:q?.expiresAt||null,priceRevision:await priceRevision(q,overrideMap.get(p.id)),
    referenceType:q?.referenceType||'UK retail asking price',marketSource:q?.priceOverride?.source||q?.sources?.find(s=>s.id===q.selectedSourceId)?.url||null,marketChecked:q?.asOf||q?.observedAt||null};
  }));
  const orders=new Map();for(const line of lines.slice(0,MAX_LINES)){
   if(!orders.has(line.id))orders.set(line.id,{id:line.id,reference:line.id,createdAt:line.created_at,paidAt:line.updated_at,status:'paid',items:[],subtotalPence:line.subtotal_pence,deliveryPence:line.delivery_pence,totalPence:line.total_pence});
   orders.get(line.id).items.push({productId:line.product_id,quantity:line.quantity,unitPence:line.unit_pence});
  }
  return {connected:true,checkedAt,products:catalogueRows,orders:[...orders.values()],ordersComplete:lines.length<=MAX_LINES};
 }
 function rows(data){
  if(!uuid(data.id)||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>500)fail('invalid_request','Use a stable operation UUID and 1–500 product rows.');
  const seen=new Set();return data.rows.map(r=>{
   if(!r||typeof r!=='object'||!catalogue.has(r.productId)||seen.has(r.productId))fail('invalid_request','Choose unique, exact shop product IDs.');seen.add(r.productId);
   if(![null,'unknown','in_stock','out_of_stock'].includes(r.expectedStatus))fail('invalid_request','Refresh the stock preview.');
   const expectedAt=r.expectedAt===null?null:timestamp(r.expectedAt),expectedQuantity=r.expectedQuantity===null?null:int(r.expectedQuantity);
   if(r.expectedPriceRevision!==null&&(typeof r.expectedPriceRevision!=='string'||!/^p1\.[a-f0-9]{64}$/.test(r.expectedPriceRevision)))fail('invalid_request','Refresh the price preview.');
   const row={productId:r.productId,quantity:int(r.quantity),expectedQuantity,expectedStatus:expectedAt===null&&expectedQuantity===null&&r.expectedStatus==='unknown'?null:r.expectedStatus,expectedAt,
    expectedReservedQuantity:int(r.expectedReservedQuantity,1000000000),expectedPaidQuantity:int(r.expectedPaidQuantity,1000000000),expectedPriceRevision:r.expectedPriceRevision,note:r.note==null?'Published from Stackr Stockroom':text(r.note)};
   if(r.salePence!=null){
    row.salePence=pence(r.salePence);
    const supplied=[r.marketPence,r.marketSource,r.marketChecked].some(v=>v!=null);
    if(supplied){row.marketPence=pence(r.marketPence);row.marketSource=text(r.marketSource);if(!row.marketSource)fail('invalid_price','Name the owner-entered reference.');row.marketChecked=timestamp(r.marketChecked,true);if(row.salePence!==discount(row.marketPence))fail('invalid_price','The shop price must be 90% of the reference, rounded to the nearest penny.');}
   }else if([r.marketPence,r.marketSource,r.marketChecked].some(v=>v!=null))fail('invalid_price','A reference update requires its sale price.');
   return row;
  });
 }
 async function publish(env,data){
  const db=database(env),validated=rows(data),serial=JSON.stringify({kind:'stockroom-publish',rows:validated});
  const replay=async()=>{const existing=await db.prepare('SELECT payload FROM owner_actions WHERE id=?').bind(data.id).first();if(!existing)return false;if(existing.payload!==serial)fail('operation_conflict','This operation ID was used for different data.',409);return true;};
  const success=replayed=>({ok:true,replay:replayed,replayed,operationId:data.id,updated:validated.length});
  if(await replay())return success(true);
  const feed=await getFeed(env),overrides=await readOverrides(env),prices=overlay(feed,overrides),overrideMap=new Map(overrides.map(r=>[r.product_id,r])),stamp=new Date(now()).toISOString(),statements=[];
  for(const row of validated){
   const q=prices.products?.[row.productId],override=overrideMap.get(row.productId);
   if(row.expectedReservedQuantity!==0)fail('stock_reserved','A checkout is still holding this product. Refresh after it settles.',409);
   if(await priceRevision(q,override)!==row.expectedPriceRevision)fail('price_changed','A price or its reference changed. Refresh the preview.',409);
   statements.push(db.prepare('INSERT INTO stockroom_sync_changes(action_id,product_id,expected_reserved_quantity,expected_paid_quantity,expected_override_revision) VALUES(?,?,?,?,?)').bind(data.id,row.productId,0,row.expectedPaidQuantity,override?.revision??null));
   statements.push(db.prepare("INSERT INTO owner_stock_changes(action_id,product_id,kind,expected_at,expected_quantity,expected_status,quantity,entry_id,note,changed_at,user_id) VALUES(?,?,'count',?,?,?,?,NULL,?,?,'stockroom-sync')").bind(data.id,row.productId,row.expectedAt,row.expectedQuantity,row.expectedStatus,row.quantity,row.note,stamp));
   if(row.salePence!=null){
    let reference,basis,market,source,checked,expiry;
    if(row.marketPence!=null){basis='owner';market=row.marketPence;source=row.marketSource;checked=row.marketChecked;expiry=new Date(Date.parse(checked)+WEEK).toISOString();reference=null;}
    else{const base=feed.products?.[row.productId];if(!usable(base,now())||row.salePence!==discount(base.marketPence))fail('invalid_price','A current matching feed reference is required, or supply a dated owner reference.',409);basis='feed';market=base.marketPence;source=base.sources?.find(s=>s.id===base.selectedSourceId)?.url||'Configured UK retail reference';checked=base.asOf||base.observedAt;expiry=base.expiresAt;reference=JSON.stringify(base);}
    if(Date.parse(checked)>now()||Date.parse(expiry)<=now())fail('stale_reference','The price reference must already be checked and less than seven days old.',409);
    statements.push(db.prepare('INSERT INTO shop_price_overrides(product_id,sale_pence,market_pence,basis,market_source,market_checked,expires_at,reference_json,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET sale_pence=excluded.sale_pence,market_pence=excluded.market_pence,basis=excluded.basis,market_source=excluded.market_source,market_checked=excluded.market_checked,expires_at=excluded.expires_at,reference_json=excluded.reference_json,revision=excluded.revision,updated_at=excluded.updated_at').bind(row.productId,row.salePence,market,basis,source,checked,expiry,reference,data.id,stamp));
   }
  }
  try{const result=await db.batch([db.prepare('INSERT INTO owner_actions(id,payload,created_at,user_id) VALUES(?,?,?,?)').bind(data.id,serial,stamp,'stockroom-sync'),...statements]);if(!Array.isArray(result)||result.some(r=>!r?.success))throw Error('Write unavailable');}
  catch(error){if(await replay())return success(true);throw error;}
  return success(false);
 }
 async function handleRequest(request,env={}){
  if(!await authenticated(request,env))return reply({ok:false,error:'unauthorized',message:'Stockroom service authentication required.'},401);
  const url=new URL(request.url);
  if(url.search)return reply({ok:false,error:'invalid_request',message:'Query parameters are not supported.'},400);
  try{
   if(url.pathname==='/api/stockroom/snapshot'&&request.method==='GET')return reply(await snapshot(env));
   if(url.pathname==='/api/stockroom/publish'&&request.method==='POST')return reply(await publish(env,await body(request)));
   return reply({ok:false,error:'not_found',message:'Unknown stockroom operation.'},404);
  }catch(error){
   const conflict=/stock_changed|stock_reserved|price_changed/.exec(String(error.message));
   if(conflict&&!error.status)return reply({ok:false,error:conflict[0],message:'Shop stock, checkout activity or pricing changed. Refresh the preview before publishing.'},409);
   return reply({ok:false,error:error.code||'unavailable',message:error.status?error.message:'The shop connection is temporarily unavailable. No update is confirmed.'},error.status||503);
  }
 }
 return {handleRequest,snapshot,applyPrices,getPrices};
}
