import {createBinderService} from './binders.mjs';
import {createOwnerService} from './owner.mjs';
import {createStockroomService} from './stockroom.mjs';
import {createPriceService} from './pricing.mjs';
import {createShopService} from './shop-state.mjs';
import {createMediaService} from './media.mjs';
import {createCheckoutService} from './checkout.mjs';
import {renderSitePage} from './site-pages.mjs';

// Build-time replacements keep this Worker dependency-free and lazy-load assets.
const COLLECTION_HTML=__COLLECTION_HTML__;
const OWNER_HTML=__OWNER_HTML__;
const SITE_HTML=__SITE_HTML__;
const HISTORY_HTML=__HISTORY_HTML__;
const ABOUT_HTML=__ABOUT_HTML__;
const NOT_FOUND_HTML=__NOT_FOUND_HTML__;
const SITE_ASSETS=__SITE_ASSETS__;
const PRICE_PRODUCTS=__PRICE_PRODUCTS__;
const PRICE_SOURCES=__PRICE_SOURCES__;
const PRICE_SEEDS=__PRICE_SEEDS__;
const MEDIA_SOURCES=__MEDIA_SOURCES__;
const webBinders=createBinderService({onUpstreamFailure:issue=>console.error('stackr_catalogue_upstream',JSON.stringify(issue))});
const stockroom=createStockroomService({products:PRICE_PRODUCTS,getFeed:async env=>service(env).getSnapshot()});
const ownerBooks=createOwnerService({products:PRICE_PRODUCTS,getPrices:env=>stockroom.getPrices(env)});
const shop=createShopService({products:PRICE_PRODUCTS});
const media=createMediaService({sources:MEDIA_SOURCES});
const checkout=createCheckoutService({products:PRICE_PRODUCTS,getPrices:env=>stockroom.getPrices(env)});
let priceService;
let refreshPromise;
let priceStorage='memory';

function service(env){
 if(priceService)return priceService;
 const bucket=env?.BUCKET;
 const durable=bucket&&typeof bucket.get==='function'&&typeof bucket.put==='function';
 const readRecord=async key=>{
  const object=await bucket.get('stackr-shop-pricing/v2/'+key+'.json');
  if(!object)return {value:null,revision:null};
  if(typeof object.etag!=='string'||!object.etag)throw Error('Price revision unavailable');
  const body=await object.text();if(body.length>2*1024*1024)throw Error('Price snapshot too large');
  return {value:JSON.parse(body),revision:object.etag,body};
 };
 const cache=durable?{
  consistentSnapshots:true,
  read:readRecord,
  async compareAndSwap(key,state,revision){
   if(revision!==null&&(typeof revision!=='string'||!revision))throw Error('Price revision required');
   const body=JSON.stringify(state);if(body.length>2*1024*1024)throw Error('Price snapshot too large');
   const onlyIf=revision===null?{etagDoesNotMatch:'*'}:{etagMatches:revision};
   const written=await bucket.put('stackr-shop-pricing/v2/'+key+'.json',body,{onlyIf,httpMetadata:{contentType:'application/json'},customMetadata:{kind:'weekly-retail-reference',schema:'2'}});
   if(written!==null&&(typeof written?.etag!=='string'||!written.etag))throw Error('Conditional price persistence unavailable');
   const latest=await readRecord(key);
   if(written&&(!latest.value||latest.revision===written.etag&&latest.body!==body))throw Error('Price snapshot readback failed');
   return {written:written!==null,latest};
  }
 }:typeof caches!=='undefined'?{
  async get(key){const response=await caches.default.match('https://stackr-prices.invalid/'+encodeURIComponent(key));return response?response.json():null;},
  async put(key,state){await caches.default.put('https://stackr-prices.invalid/'+encodeURIComponent(key),new Response(JSON.stringify(state),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=1209600'}}));}
 }:undefined;
 priceStorage=durable?'r2':cache?'edge-cache':'memory';
 priceService=createPriceService({products:PRICE_PRODUCTS,sources:PRICE_SOURCES,seedQuotes:PRICE_SEEDS,cache,limits:{timeoutMs:2500,concurrency:4,batchSources:32}});
 return priceService;
}
async function priceResponse(request,env,ctx){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='GET')return new Response(JSON.stringify({error:'GET required'}),{status:405,headers:{...headers,Allow:'GET'}});
 const prices=service(env),snapshot=await prices.getSnapshot();
 const due=Date.parse(snapshot.nextRefreshAt)<=Date.now();
 if(due&&!refreshPromise){
  refreshPromise=prices.refresh().catch(()=>null).finally(()=>{refreshPromise=null;});
  if(ctx?.waitUntil)ctx.waitUntil(refreshPromise);
  else await refreshPromise;
 }
 const current=ctx?.waitUntil?snapshot:await prices.getSnapshot();
 const paused=['failed','conflict'].includes(current.persistenceStatus),pendingDue=current.refreshPending&&Date.parse(current.nextRefreshAt)<=Date.now(),refreshing=!paused&&(Boolean(refreshPromise)||pendingDue);
 try{
  const effective=await stockroom.applyPrices(env,current);
  return new Response(JSON.stringify({...effective,priceStorage,refreshing,nextPollSeconds:refreshing?5:300}),{headers});
 }catch{return new Response(JSON.stringify({error:'Price storage is temporarily unavailable.'}),{status:503,headers});}
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  // Read-only public-catalogue check, behind the unchanged Sites audience gate.
  // Service access proves hosted fetch compatibility, never visitor ownership.
  if(['/api/catalogue-check','/api/catalogue-check/pitch-black','/api/catalogue-check/chaos-rising','/api/catalogue-check/journey-together','/api/catalogue-check/phantasmal-flames','/api/catalogue-check/ascended-heroes','/api/catalogue-check/delta-reign'].includes(url.pathname)){
   if(request.method!=='GET'||url.search)return new Response(JSON.stringify({error:'Use GET without parameters.'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   return url.pathname.endsWith('/delta-reign')?webBinders.checkDeltaReign():url.pathname.endsWith('/ascended-heroes')?webBinders.checkAscendedHeroes():url.pathname.endsWith('/journey-together')?webBinders.checkJourneyTogether():url.pathname.endsWith('/phantasmal-flames')?webBinders.checkPhantasmalFlames():url.pathname.endsWith('/chaos-rising')?webBinders.checkChaosRising():url.pathname.endsWith('/pitch-black')?webBinders.checkPitchBlack():webBinders.checkCatalogue();
  }
  if(['/shop/','/sets/'].includes(url.pathname))return Response.redirect(url.origin+url.pathname.slice(0,-1)+url.search,308);
  if(['/api/checkout/config','/api/checkout','/api/checkout/status','/api/stripe/webhook'].includes(url.pathname))return checkout.handleRequest(request,env);
  if(url.pathname==='/api/binders'||url.pathname.startsWith('/api/binders/'))return webBinders.handleRequest(request,env,ctx);
  if(url.pathname.startsWith('/api/owner/'))return ownerBooks.handleRequest(request,env);
  if(url.pathname.startsWith('/api/stockroom/'))return stockroom.handleRequest(request,env);
  if(url.pathname==='/api/prices')return priceResponse(request,env,ctx);
  if(url.pathname.startsWith('/api/admin/media/'))return media.handleImport(request,env);
  if(['/api/shop','/api/interests','/api/admin/stock','/api/admin/interests'].includes(url.pathname))return shop.handleRequest(request,env);
  if(url.pathname.startsWith('/media/'))return media.handleRequest(request,env,ctx);
  if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response('GET required',{status:405,headers:{Allow:'GET, HEAD'}});
  const pageHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
  if(['/collection','/collection/'].includes(url.pathname))return new Response(request.method==='HEAD'?null:COLLECTION_HTML,{headers:{...pageHeaders,'Cache-Control':'private, no-store','X-Robots-Tag':'noindex,nofollow'}});
  if(['/owner','/owner/'].includes(url.pathname))return new Response(request.method==='HEAD'?null:OWNER_HTML,{headers:{...pageHeaders,'Cache-Control':'private, no-store','X-Robots-Tag':'noindex,nofollow'}});
  if(['/','/index.html','/shop','/shop/','/sets','/sets/'].includes(url.pathname))return new Response(request.method==='HEAD'?null:renderSitePage(SITE_HTML,url.pathname,url.origin),{headers:pageHeaders});
  if(['/history','/history/','/history.html'].includes(url.pathname))return new Response(request.method==='HEAD'?null:renderSitePage(HISTORY_HTML,url.pathname,url.origin),{headers:pageHeaders});
  if(['/about','/about/','/about.html'].includes(url.pathname))return new Response(request.method==='HEAD'?null:renderSitePage(ABOUT_HTML,url.pathname,url.origin),{headers:pageHeaders});
  if(url.pathname==='/favicon.ico')return Response.redirect(url.origin+'/assets/favicon-32.png',302);
  if(url.pathname.startsWith('/assets/')){
   let name;try{name=decodeURIComponent(url.pathname.slice(8));}catch{return new Response('Bad asset path',{status:400});}
   if(!Object.hasOwn(SITE_ASSETS,name))return new Response('Not found',{status:404});
   const asset=SITE_ASSETS[name],headers={'Content-Type':asset.mime,'Cache-Control':/^shop-[a-f0-9]{12}\.js$/.test(name)?'public, max-age=31536000, immutable':'public, max-age=3600',ETag:'"'+asset.hash+'"','X-Content-Type-Options':'nosniff'};
   if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
   const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
   return new Response(bytes,{headers});
  }
  return new Response(request.method==='HEAD'?null:NOT_FOUND_HTML,{status:404,headers:{...pageHeaders,'X-Robots-Tag':'noindex'}});
 }
};
