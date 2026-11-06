import {mergeCataloguePrintings} from './catalogue-printings.mjs';
import {createBinderReadyService,readyReference} from './binder-ready.mjs';
// Private, server-persisted NEW website collections; no Supabase account mapping.
const API='https://api.stackrtcg.com/v1';
const ROOT='/api/binders';
const LANGUAGES=new Set(['en','ja','ko','zh-cn','zh-tw']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin'};
const fault=(message,status=400)=>Object.assign(Error(message),{status});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const uuid=v=>{if(typeof v!=='string'||!UUID.test(v))throw fault('Use an exact canonical ID.');return v.toLowerCase();};
const integer=(v,max)=>{if(!Number.isSafeInteger(v)||v<0||v>max)throw fault('Use a whole number within the allowed range.');return v;};
const text=(v,max,required=true)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(v)||required&&!v.trim())throw fault('Invalid text field.');return v.trim();};
const language=v=>{if(!LANGUAGES.has(v))throw fault('Choose a supported printed language.');return v;};
function readyPageSelectors(params,privateRead=false){
 const allowed=privateRead?['paged','limit','cursor','snapshot','expectedRevision']:['paged','language','limit','cursor','snapshot'];
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw fault('Unsupported paged checklist parameter.');
 if(params.get('paged')!=='1')throw fault('Use the paged checklist selector.');
 const limit=integer(Number(params.get('limit')||50),50);if(!limit)throw fault('Page size must be 1–50.');
 const cursor=params.get('cursor');if(cursor!==null&&!/^(?:0|[1-9]\d{0,4})$/.test(cursor))throw fault('Invalid checklist cursor.');
 const offset=integer(Number(cursor||0),privateRead?10000:400),snapshot=params.has('snapshot')?text(params.get('snapshot'),100):null;
 if((params.has('cursor')||privateRead)&&!snapshot)throw fault('Continue with the exact public checklist snapshot.');
 const revision=privateRead?integer(Number(params.get('expectedRevision')),1000000000):null;if(privateRead&&!revision)throw fault('Refresh the binder before loading its quantities.');
 return {limit,offset,snapshot,revision};
}
const identity=request=>{const v=request.headers.get('oai-authenticated-user-id');return v&&v.length<=200&&!/[\x00-\x20\x7f]/.test(v)?v:null;};
const keys=(o,allowed)=>{if(Object.keys(o).some(k=>!allowed.includes(k)))throw fault('Unsupported request field.');};
async function boundedJson(response,max){
 if(Number(response.headers.get('Content-Length')||0)>max)throw fault('Response is too large.',413);
 const reader=response.body?.getReader();if(!reader)throw fault('Missing JSON.');let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw fault('Response is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fault('Invalid JSON.');}
}
async function readBody(request){
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw fault('Same-origin request required.',403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw fault('JSON required.',415);
 const data=await boundedJson(request,16000);if(!data||typeof data!=='object'||Array.isArray(data))throw fault('Invalid request.');return data;
}
function route(path,params){
 const query=new URLSearchParams();let allowed=[],paged=false;
 if(path==='/sets'){allowed=['language','limit','cursor','setCode'];paged=true;}
 else if(path==='/search'){allowed=['language','q','limit','cursor'];paged=true;query.set('q',text(params.get('q'),150));}
 else if(/^\/sets\/[0-9a-f-]+\/cards$/i.test(path)){uuid(path.split('/')[2]);allowed=['language','limit','cursor'];paged=true;query.set('includeAssets','true');}
 else if(/^\/(cards|sets)\/[0-9a-f-]+$/i.test(path)){uuid(path.split('/')[2]);}
 else if(path==='/pokemon'){allowed=['offset','limit'];query.set('offset',String(integer(Number(params.get('offset')||0),2000)));}
 else if(/^\/pokemon\/[a-z0-9-]{1,80}\/cards$/.test(path)){allowed=['language','limit','cursor'];paged=true;}
 else throw fault('Catalogue route not found.',404);
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw fault('Unsupported catalogue parameter.');
 if(allowed.includes('language'))query.set('language',language(params.get('language')||'en'));
 if(paged||path==='/pokemon'){const limit=integer(Number(params.get('limit')||50),50);if(!limit)throw fault('Page size must be 1–50.');query.set('limit',String(limit));}
 if(params.has('cursor'))query.set('cursor',text(params.get('cursor'),2048));
 if(params.has('setCode'))query.set('setCode',text(params.get('setCode'),40));
 return {path,query,limit:Number(query.get('limit'))||null};
}
function approvedImage(card,variant){
 const a=variant.image;if(!a||a.permissionStatus!=='approved'||a.cardId&&a.cardId!==card.cardId||a.setId&&a.setId!==card.set.setId)return null;
 const candidates=[...(Array.isArray(a.derivatives)?a.derivatives.filter(d=>d.role==='card-grid'):[]),a];
 for(const candidate of candidates){try{
  const u=new URL(candidate.deliveryUrl||candidate.url),host=u.hostname.toLowerCase().replace(/\.$/,'');
  const local=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||host.startsWith('[');
  if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!local&&u.href.length<=2000)return u.href;
 }catch{}}
 return null;
}
function canonicalCard(card,cardId,variantId,binder){
 if(!card||card.game!=='pokemon'||card.cardId!==cardId||!UUID.test(card.set?.setId||'')||card.languageCode!==binder.language||binder.type==='set'&&card.set.setId!==binder.setId)throw fault('This printing does not belong to the binder’s set and language.');
 const variant=Array.isArray(card.variants)&&card.variants.find(v=>v.variantId===variantId);
 if(!variant)throw fault('Select an exact variant returned by the catalogue.');
 return {cardId,variantId,canonicalId:text(variant.canonicalId,400),variantCode:text(variant.variantCode,100),finishCode:variant.finishCode===null||variant.finishCode===undefined?null:text(variant.finishCode,100),setId:card.set.setId,language:card.languageCode,nativeName:text(card.names?.native,300),englishName:card.names?.englishDisplay?text(card.names.englishDisplay,300):null,collectorNumber:text(card.collectorNumber?.value,80),imageUrl:approvedImage(card,variant)};
}
const binderDto=b=>({id:b.id,name:b.name,type:b.type,language:b.language,setId:b.set_id,setName:b.set_name,setTotal:b.set_total,setCheckedAt:b.set_checked_at,revision:b.revision,archived:b.archived===1,createdAt:b.created_at,updatedAt:b.updated_at});
const itemDto=i=>({cardId:i.card_id,variantId:i.variant_id,canonicalId:i.canonical_id,variantCode:i.variant_code,finishCode:i.finish_code,setId:i.set_id,language:i.language,nativeName:i.native_name,englishName:i.english_name,collectorNumber:i.collector_number,imageUrl:i.image_url,quantity:i.quantity,updatedAt:i.updated_at});

export function createBinderService({fetchImpl=fetch,now=Date.now,onUpstreamFailure=()=>{},readyBundles,readyCatalogues}={}){
 const stamp=()=>new Date(now()).toISOString();
 const all=async statement=>{const r=await statement.all();if(!r?.success||!Array.isArray(r.results))throw Error('storage_read');return r.results;};
 async function upstream(path,params=new URLSearchParams()){
  const spec=route(path,params),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000),started=now();let phase='transport',upstreamStatus=null;
  try{
   // Workers supports manual/follow, but rejects redirect:error before any I/O.
   // Manual still rejects redirects below without contacting their destination.
   const r=await fetchImpl(API+spec.path+(spec.query.size?'?'+spec.query:''),{method:'GET',redirect:'manual',headers:{Accept:'application/json','User-Agent':'StackR-Website-Binder/1.0'},signal:controller.signal});
   upstreamStatus=r.status;phase='response';
   if(!r.ok||!r.headers.get('Content-Type')?.includes('application/json'))throw Error('catalogue_unavailable');
   phase='contract';
   const value=await boundedJson(r,2000000);
   if(!value?.data||value.meta?.apiVersion!=='1')throw Error('catalogue_contract');
   const p=value.meta.pagination;
   // A page without an explicit continuation state must never look complete.
   if(spec.limit&&spec.path!=='/pokemon'&&(!p||!Object.hasOwn(p,'nextCursor')))throw Error('catalogue_pagination_missing');
   if(p&&(p.nextCursor!==null&&p.nextCursor!==undefined&&(typeof p.nextCursor!=='string'||!p.nextCursor.length||p.nextCursor.length>2048)||p.limit!==undefined&&(!Number.isInteger(p.limit)||p.limit<1||p.limit>50)))throw Error('catalogue_pagination');
   if(p?.nextCursor&&p.nextCursor===spec.query.get('cursor'))throw Error('catalogue_cursor_loop');
   for(const key of ['cards','sets','results'])if(Array.isArray(value.data[key])&&spec.limit&&value.data[key].length>spec.limit)throw Error('catalogue_page_limit');
   return value;
  }catch(e){try{onUpstreamFailure({route:spec.path.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,':id'),phase,status:upstreamStatus,error:e.name==='AbortError'?'timeout':e.name==='TypeError'?'transport_type_error':'invalid_response',elapsedMs:Math.max(0,now()-started)});}catch{}throw fault('The canonical catalogue is temporarily unavailable. Saved collections remain safe; retry later.',503);}finally{clearTimeout(timer);}
 }
 async function checkCatalogue(){
  const id='258cb8e5-c769-540d-9e3c-40d4ed4dafdb',lang='en',setQuery=new URLSearchParams({language:lang,limit:'1'});
  try{
   const [index,metadata]=await Promise.all([upstream('/sets',setQuery),upstream('/sets/'+id)]),set=metadata.data.set;
   if(!Array.isArray(index.data.sets)||!set||set.setId!==id||set.languageCode!==lang||set.game!=='pokemon'||(!Number.isSafeInteger(set.total)||set.total<=0||set.total>400))throw Error('probe_metadata');
   const seen=new Set(),versions=new Set(),pages=[];let cursor=null,approvedArt=0;
   do{
    const page=await upstream('/sets/'+id+'/cards',new URLSearchParams({language:lang,limit:'50',...(cursor?{cursor}:{})}));
    if(!Array.isArray(page.data.cards))throw Error('probe_cards');
    for(const card of page.data.cards){if(!UUID.test(card.cardId||'')||card.set?.setId!==id||card.languageCode!==lang||card.game!=='pokemon'||seen.has(card.cardId))throw Error('probe_identity');seen.add(card.cardId);if(card.catalogueVersionId)versions.add(card.catalogueVersionId);if(card.variants?.some(v=>approvedImage(card,v)))approvedArt++;}
    pages.push(page.data.cards.length);cursor=page.meta.pagination.nextCursor;if(cursor&&pages.length>=8)throw Error('probe_page_bound');
   }while(cursor);
   if(seen.size!==set.total||versions.size>1)throw Error('probe_incomplete');
   return reply({ok:true,checkedAt:stamp(),scope:'Public catalogue reads only; no collection or stock access.',setId:id,language:lang,expected:set.total,loaded:seen.size,approvedArtwork:approvedArt,pageSizes:pages});
  }catch{return reply({ok:false,error:'The live catalogue check failed. No collection or stock data was accessed.'},503);}
 }
 const readyCataloguesService=createBinderReadyService({upstream,now,...(readyBundles?{bundles:readyBundles}:{}),...(readyCatalogues?{catalogues:readyCatalogues}:{})});
 async function checkFeaturedCatalogue(kind){
  const {id,name}={pitchBlack:{id:'d6d58c17-5923-496e-94ef-5819f34ae10c',name:'Pitch Black'},chaosRising:{id:'816ff627-a585-4953-99c4-a15c9b0b80e5',name:'Chaos Rising'},journeyTogether:{id:'4f3046f3-9ab7-4068-a7df-dbe2b08c263c',name:'Journey Together'},phantasmalFlames:{id:'977bf107-e10c-4d93-a7a4-3d7b775c5003',name:'Phantasmal Flames'},ascendedHeroes:{id:'ddc668c0-316e-4dab-8c51-625167508fd6',name:'Ascended Heroes'},deltaReign:{id:'a1bde625-6996-5451-bcda-fb80fe5b428b',name:'Delta Reign'}}[kind],lang='en';
  try{
   const value=await upstream('/sets/'+id),set=value.data.set;
   if(!set||set.setId!==id||set.languageCode!==lang||set.game!=='pokemon'||!Number.isSafeInteger(set.total)||set.total<=0||set.total>400)throw Error('probe_metadata');
   const raw=[],pages=[],cursors=new Set(),versions=new Set();let cursor=null;
   do{
    const page=await upstream('/sets/'+id+'/cards',new URLSearchParams({language:lang,limit:'50',...(cursor?{cursor}:{})}));
    if(!Array.isArray(page.data.cards))throw Error('probe_cards');
    for(const c of page.data.cards){if(!UUID.test(c?.cardId||'')||c.set?.setId!==id||c.languageCode!==lang||c.game!=='pokemon')throw Error('probe_identity');if(c.catalogueVersionId)versions.add(c.catalogueVersionId);raw.push(c);}
    pages.push(page.data.cards.length);cursor=page.meta.pagination.nextCursor;if(cursor&&(cursors.has(cursor)||pages.length>=(kind==='ascendedHeroes'?20:8)))throw Error('probe_page_bound');if(cursor)cursors.add(cursor);
   }while(cursor);
   const cards=mergeCataloguePrintings(raw);if(cards.length!==set.total||versions.size>1)throw Error('probe_incomplete');
   let currentCardValidated=false;if(kind==='deltaReign'){const first=cards[0],detail=await upstream('/cards/'+first.cardId);canonicalCard(detail.data.card,first.cardId,first.defaultVariantId,{type:'set',setId:id,language:lang});currentCardValidated=true;}
   return reply({ok:true,checkedAt:stamp(),scope:'Public '+name+' catalogue reads only; no collection or stock access.',...(kind==='deltaReign'?{currentCardValidated}:{}),setId:id,language:lang,expected:set.total,loaded:cards.length,sourceRows:raw.length,reportedVariantIds:cards.reduce((n,c)=>n+c.variants.length,0),approvedArtwork:cards.filter(c=>c.variants.some(v=>approvedImage(c,v))).length,pageSizes:pages});
  }catch{return reply({ok:false,error:'The live '+name+' catalogue check failed. No collection or stock data was accessed.'},503);}
 }
 async function own(db,user,id){const row=await db.prepare('SELECT * FROM web_binders WHERE id=? AND user_id=?').bind(id,user).first();if(!row)throw fault('Binder not found.',404);return binderDto(row);}
 async function replay(db,user,id,payload){const saved=await db.prepare('SELECT payload FROM web_binder_actions WHERE user_id=? AND id=?').bind(user,id).first();if(!saved)return false;if(saved.payload!==JSON.stringify(payload))throw fault('This action ID was already used for different data.',409);return true;}
 async function apply(db,user,id,binderId,operation,expectedRevision,payload,statements){
  if(await replay(db,user,id,payload))return true;
  try{const result=await db.batch([db.prepare('INSERT INTO web_binder_actions(user_id,id,binder_id,operation,expected_revision,payload,created_at) VALUES(?,?,?,?,?,?,?)').bind(user,id,binderId,operation,expectedRevision,JSON.stringify(payload),stamp()),...statements]);if(!Array.isArray(result)||result.some(r=>!r?.success))throw Error('storage_write');}
  catch(e){if(await replay(db,user,id,payload))return true;throw e;}return false;
 }
 async function summary(db,user,binder){
  return await db.prepare('SELECT COUNT(DISTINCT i.card_id) uniqueCards,COUNT(*) totalVariants,COALESCE(SUM(i.quantity),0) totalQuantity FROM web_binder_items i JOIN web_binders b ON b.id=i.binder_id WHERE b.id=? AND b.user_id=? AND i.quantity>0').bind(binder.id,user).first();
 }
 async function setMetadata(id,lang,env,ctx){const bundle=await readyCataloguesService.get(id,lang,env,ctx);return bundle?{data:{set:bundle.set},meta:{apiVersion:'1',generatedAt:bundle.capturedAt,source:'public-catalogue-snapshot',stale:readyReference(bundle,now()).stale}}:upstream('/sets/'+id);}
 async function setInfo(id,lang,env,ctx){const r=await setMetadata(id,lang,env,ctx),s=r.data.set;if(!s||s.setId!==id||s.game!=='pokemon'||s.languageCode!==lang)throw fault('Select an exact set in the chosen language.');return {name:text(s.nativeName||s.englishDisplayName,300),total:Number.isSafeInteger(s.total)&&s.total>=0&&s.total<=10000?s.total:null,checkedAt:r.meta.generatedAt||stamp()};}
 async function handleRequest(request,env={},ctx){
  const user=identity(request);if(!user)return reply({error:'Sign in to use your private website binders.',signInPath:'/signin-with-chatgpt?return_to=%2Fcollection'},401);
  const url=new URL(request.url),path=url.pathname.slice(ROOT.length);
  try{
   if(!url.pathname.startsWith(ROOT)||!['GET','POST'].includes(request.method))throw fault('Route not found.',404);
   const readyMatch=path.match(/^\/catalogue\/ready\/([0-9a-f-]+)$/i);
   if(readyMatch){
    if(request.method!=='GET')throw fault('Catalogue reads use GET.',405);
    const page=url.searchParams.has('paged')?readyPageSelectors(url.searchParams):null;
    if(!page)for(const key of url.searchParams.keys())if(key!=='language'||url.searchParams.getAll(key).length!==1)throw fault('Unsupported public checklist parameter.');
    const bundle=await readyCataloguesService.get(uuid(readyMatch[1]),language(url.searchParams.get('language')||'en'),env,ctx);if(!bundle)throw fault('This set uses the paged checklist.',404);
    const ready=readyReference(bundle,now());if(page?.snapshot&&page.snapshot!==ready.snapshotId)throw fault('The public checklist changed. Reopen the binder to refresh it.',409);
    if(page&&page.offset>=bundle.cards.length)throw fault('Checklist cursor is outside this set.');
    const cards=page?bundle.cards.slice(page.offset,page.offset+page.limit):bundle.cards;
    return new Response(JSON.stringify({set:bundle.set,cards,ready,...(page?{meta:{apiVersion:'1',pagination:{limit:page.limit,offset:page.offset,nextCursor:page.offset+cards.length<bundle.cards.length?String(page.offset+cards.length):null}}}:{})}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
   }
   if(path.startsWith('/catalogue/')){if(request.method!=='GET')throw fault('Catalogue reads use GET.',405);const setMatch=path.match(/^\/catalogue\/sets\/([0-9a-f-]+)$/i);if(setMatch&&!url.search)return reply(await setMetadata(uuid(setMatch[1]),'en',env,ctx));return reply(await upstream(path.slice('/catalogue'.length),url.searchParams));}
   const db=env.DB;if(!db?.prepare||!db?.batch)throw Error('storage_missing');
   if(path==='/account'){
    if(request.method!=='GET')throw fault('Account details use GET.',405);
    if(url.search)throw fault('Account details do not accept parameters.');
    const counts=await db.prepare('SELECT COALESCE(SUM(CASE WHEN archived=0 THEN 1 ELSE 0 END),0) activeBinders,COALESCE(SUM(CASE WHEN archived=1 THEN 1 ELSE 0 END),0) archivedBinders FROM web_binders WHERE user_id=?').bind(user).first();
    const clean=v=>String(v||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,320);
    const email=clean(request.headers.get('oai-authenticated-user-email'));
    let name=request.headers.get('oai-authenticated-user-full-name')||'';
    if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name);}catch{name='';}}
    return reply({account:{provider:'ChatGPT',displayName:clean(name)||'Your account',email},collection:{activeBinders:counts?.activeBinders||0,archivedBinders:counts?.archivedBinders||0}});
   }
   const match=path.match(/^\/([0-9a-f-]+)(?:\/(items|checklist))?$/i);
   if(path!==''&&!match)throw fault('Route not found.',404);
   const binderId=match?uuid(match[1]):null,part=match?.[2]||null;
   if(request.method==='GET'){
    if(!binderId){
     for(const key of url.searchParams.keys())if(!['archived','offset','setId','language'].includes(key)||url.searchParams.getAll(key).length!==1)throw fault('Unsupported query.');
     const archived=url.searchParams.get('archived')||'0';if(!['0','1'].includes(archived))throw fault('Invalid archive filter.');const offset=integer(Number(url.searchParams.get('offset')||0),10000);
     const filtered=url.searchParams.has('setId')||url.searchParams.has('language');
     if(filtered&&(!url.searchParams.has('setId')||!url.searchParams.has('language')))throw fault('Select both the exact set and language.');
     const rows=filtered?await all(db.prepare("SELECT * FROM web_binders WHERE user_id=? AND archived=? AND type='set' AND set_id=? AND language=? ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?").bind(user,Number(archived),uuid(url.searchParams.get('setId')),language(url.searchParams.get('language')),offset)):await all(db.prepare('SELECT * FROM web_binders WHERE user_id=? AND archived=? ORDER BY updated_at DESC,id LIMIT 51 OFFSET ?').bind(user,Number(archived),offset));
     return reply({binders:rows.slice(0,50).map(binderDto),hasMore:rows.length>50,nextOffset:offset+50});
    }
    const binder=await own(db,user,binderId);
    if(part==='items'){
     for(const key of url.searchParams.keys())if(!['cardId','variantId'].includes(key)||url.searchParams.getAll(key).length!==1)throw fault('Unsupported item parameter.');
     const cardId=uuid(url.searchParams.get('cardId')),variantId=uuid(url.searchParams.get('variantId'));
     const item=await db.prepare('SELECT i.quantity FROM web_binder_items i JOIN web_binders b ON b.id=i.binder_id WHERE b.id=? AND b.user_id=? AND i.card_id=? AND i.variant_id=?').bind(binderId,user,cardId,variantId).first();
     return reply({binder,quantity:item?.quantity??0});
    }
    if(part==='checklist'){
     if(binder.type!=='set')throw fault('Only a set binder has a set checklist.');
     if(url.searchParams.has('paged')){
      const page=readyPageSelectors(url.searchParams,true);if(binder.revision!==page.revision)throw fault('This binder changed while loading. Reopen it to read consistent quantities.',409);
      const bundle=await readyCataloguesService.get(binder.setId,binder.language,env,ctx);if(!bundle)throw fault('This set uses the paged catalogue checklist.',404);
      const ready=readyReference(bundle,now());if(page.snapshot!==ready.snapshotId)throw fault('The public checklist changed. Reopen the binder to refresh it.',409);
      const [items,counts]=await Promise.all([all(db.prepare('SELECT i.card_id,i.variant_id,i.quantity FROM web_binder_items i JOIN web_binders b ON b.id=i.binder_id WHERE b.id=? AND b.user_id=? AND i.quantity>0 ORDER BY i.card_id,i.variant_id LIMIT ? OFFSET ?').bind(binderId,user,page.limit,page.offset)),summary(db,user,binder)]);
      // Revision guards cover changes during either read as well as between
      // pages. Private rows are never retained in the shared public cache.
      if((await own(db,user,binderId)).revision!==page.revision)throw fault('This binder changed while loading. Reopen it to read consistent quantities.',409);
      if(page.offset>counts.totalVariants||items.length!==Math.min(page.limit,counts.totalVariants-page.offset))throw fault('The saved quantities could not be read consistently. Reopen this binder.',409);
      const progress={owned:counts.uniqueCards,total:counts.uniqueCards<=bundle.set.total?bundle.set.total:null,checkedAt:bundle.capturedAt,capturedAt:bundle.capturedAt,source:'public-catalogue-snapshot',catalogueVersionId:bundle.catalogueVersionId,stale:ready.stale,referenceConsistent:counts.uniqueCards<=bundle.set.total};
      return reply({ownership:items.map(item=>({cardId:item.card_id,variantId:item.variant_id,quantity:item.quantity})),ownershipTotal:counts.totalVariants,binderRevision:page.revision,ready,progress,meta:{apiVersion:'1',pagination:{limit:page.limit,offset:page.offset,nextCursor:page.offset+items.length<counts.totalVariants?String(page.offset+items.length):null}}});
     }
     // Legacy v65 clients still use this full response; new clients select
     // paged=1 and never request an unbounded checklist or ownership payload.
     if(url.searchParams.has('complete')){
      for(const key of url.searchParams.keys())if(!['complete','reference'].includes(key)||url.searchParams.getAll(key).length!==1)throw fault('Unsupported complete checklist parameter.');
      if(url.searchParams.get('complete')!=='1')throw fault('Use the complete checklist selector.');
      const reference=url.searchParams.has('reference')?text(url.searchParams.get('reference'),100):null;
      const bundle=await readyCataloguesService.get(binder.setId,binder.language,env,ctx);if(!bundle)throw fault('This set uses the paged checklist.',404);
      // Only public data enters the shared cache. This owner-filtered read and
      // every quantity in this response are performed again on each request.
      const items=await all(db.prepare('SELECT i.card_id,i.variant_id,i.quantity FROM web_binder_items i JOIN web_binders b ON b.id=i.binder_id WHERE b.id=? AND b.user_id=? AND i.quantity>0').bind(binderId,user)),ready=readyReference(bundle,now());
      const owned=new Map();for(const item of items){if(!owned.has(item.card_id))owned.set(item.card_id,[]);owned.get(item.card_id).push({variantId:item.variant_id,quantity:item.quantity});}
      const progress={owned:owned.size,total:owned.size<=bundle.set.total?bundle.set.total:null,checkedAt:bundle.capturedAt,capturedAt:bundle.capturedAt,source:'public-catalogue-snapshot',catalogueVersionId:bundle.catalogueVersionId,stale:ready.stale,referenceConsistent:owned.size<=bundle.set.total};
      return reply({...(reference===ready.snapshotId?{ownership:items.map(item=>({cardId:item.card_id,variantId:item.variant_id,quantity:item.quantity}))}:{cards:bundle.cards.map(card=>({card,ownedQuantity:(owned.get(card.cardId)||[]).reduce((sum,item)=>sum+item.quantity,0),ownedVariants:owned.get(card.cardId)||[]}))}),ready,meta:{apiVersion:'1',pagination:{nextCursor:null}},progress});
     }
     for(const key of url.searchParams.keys())if(!['limit','cursor'].includes(key))throw fault('Unsupported checklist parameter.');
     const params=new URLSearchParams(url.searchParams);params.set('language',binder.language);
     const [page,reference,counts]=await Promise.all([upstream('/sets/'+binder.setId+'/cards',params),setInfo(binder.setId,binder.language),summary(db,user,binder)]);
     if(!Array.isArray(page.data.cards))throw fault('The catalogue returned an incomplete checklist.',503);
     for(const card of page.data.cards){if(!card||!UUID.test(card.cardId||'')||card.game!=='pokemon'||card.set?.setId!==binder.setId||card.languageCode!==binder.language)throw fault('The catalogue returned inconsistent checklist identities.',503);}
     let cards;try{cards=mergeCataloguePrintings(page.data.cards);}catch{throw fault('The catalogue returned conflicting printings. Retry this binder.',503);}
     const seen=new Set(cards.map(card=>card.cardId));
     const items=seen.size?await all(db.prepare('SELECT card_id,variant_id,quantity FROM web_binder_items WHERE binder_id=? AND quantity>0 AND card_id IN ('+[...seen].map(()=>'?').join(',')+')').bind(binderId,...seen)):[];
     return reply({cards:cards.map(card=>({card,ownedQuantity:items.filter(i=>i.card_id===card.cardId).reduce((n,i)=>n+i.quantity,0),ownedVariants:items.filter(i=>i.card_id===card.cardId).map(i=>({variantId:i.variant_id,quantity:i.quantity}))})),meta:page.meta,progress:{owned:counts.uniqueCards,total:reference.total!==null&&counts.uniqueCards<=reference.total?reference.total:null,checkedAt:reference.checkedAt,referenceConsistent:reference.total!==null&&counts.uniqueCards<=reference.total}});
    }
    for(const key of url.searchParams.keys())if(key!=='offset')throw fault('Unsupported detail parameter.');
    const offset=integer(Number(url.searchParams.get('offset')||0),10000);
    const [items,counts]=await Promise.all([all(db.prepare('SELECT i.* FROM web_binder_items i JOIN web_binders b ON b.id=i.binder_id WHERE b.id=? AND b.user_id=? AND i.quantity>0 ORDER BY i.created_at,i.card_id,i.variant_id LIMIT 51 OFFSET ?').bind(binderId,user,offset)),summary(db,user,binder)]);
    return reply({binder,items:items.slice(0,50).map(itemDto),hasMore:items.length>50,nextOffset:offset+50,summary:{...counts,ownedSpecies:null},progress:binder.type==='set'?{owned:counts.uniqueCards,total:binder.setTotal!==null&&counts.uniqueCards<=binder.setTotal?binder.setTotal:null,checkedAt:binder.setCheckedAt,source:'saved-set-metadata'}:null});
   }
   const data=await readBody(request),id=uuid(data.id);
   if(!binderId){
    keys(data,['id','binderId','name','type','language','setId']);const nextId=uuid(data.binderId),name=text(data.name,100),lang=language(data.language);if(!['custom','set'].includes(data.type))throw fault('Choose a custom or set binder.');
    const setId=data.type==='set'?uuid(data.setId):null;if(data.type==='custom'&&data.setId!==undefined&&data.setId!==null)throw fault('Custom binders do not have a set ID.');
    const payload={operation:'create',binderId:nextId,name,type:data.type,language:lang,setId};
    if(await replay(db,user,id,payload))return reply({ok:true,replayed:true,binder:await own(db,user,nextId)});
    const reference=setId?await setInfo(setId,lang,env,ctx):null,time=stamp();
    const again=await apply(db,user,id,nextId,'create',0,payload,[db.prepare('INSERT INTO web_binders(id,user_id,name,type,language,set_id,set_name,set_total,set_checked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(nextId,user,name,data.type,lang,setId,reference?.name??null,reference?.total??null,reference?.checkedAt??null,time,time)]);
    return reply({ok:true,replayed:again,binder:await own(db,user,nextId)});
   }
   const binder=await own(db,user,binderId),revision=integer(data.expectedRevision,1000000000);
   if(!revision)throw fault('Refresh the binder before changing it.');
   if(!part){
    keys(data,['id','expectedRevision','name','archived']);if(data.name===undefined&&data.archived===undefined)throw fault('Choose a change.');
    const name=data.name===undefined?null:text(data.name,100),archived=data.archived===undefined?null:data.archived;if(archived!==null&&typeof archived!=='boolean')throw fault('Invalid archive state.');
    const payload={operation:'edit',binderId,expectedRevision:revision,name,archived};
    const again=await apply(db,user,id,binderId,'edit',revision,payload,[db.prepare('UPDATE web_binders SET name=COALESCE(?,name),archived=COALESCE(?,archived) WHERE id=? AND user_id=?').bind(name,archived===null?null:Number(archived),binderId,user)]);
    return reply({ok:true,replayed:again,binder:await own(db,user,binderId)});
   }
   if(part!=='items')throw fault('Route not found.',404);
   keys(data,['id','expectedRevision','cardId','variantId','quantity']);const cardId=uuid(data.cardId),variantId=uuid(data.variantId),quantity=integer(data.quantity,9999),payload={operation:'item',binderId,expectedRevision:revision,cardId,variantId,quantity};
   if(await replay(db,user,id,payload))return reply({ok:true,replayed:true,binder:await own(db,user,binderId)});
   if(binder.revision!==revision||binder.archived)throw fault('This binder changed or is archived. Refresh before retrying.',409);
   const existing=await db.prepare('SELECT * FROM web_binder_items WHERE binder_id=? AND card_id=? AND variant_id=?').bind(binderId,cardId,variantId).first();
   if(!quantity&&!existing)throw fault('This exact printing and variant is not in the binder.');
   let card=existing?itemDto(existing):null;
   if(!existing||quantity>existing.quantity){const raw=await upstream('/cards/'+cardId);card=canonicalCard(raw.data.card,cardId,variantId,binder);}
   const time=stamp();
   const again=await apply(db,user,id,binderId,'item',revision,payload,[db.prepare('INSERT INTO web_binder_items(binder_id,card_id,variant_id,canonical_id,variant_code,finish_code,set_id,language,native_name,english_name,collector_number,image_url,quantity,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM web_binders WHERE id=? AND user_id=? AND archived=0 ON CONFLICT(binder_id,card_id,variant_id) DO UPDATE SET canonical_id=excluded.canonical_id,variant_code=excluded.variant_code,finish_code=excluded.finish_code,set_id=excluded.set_id,language=excluded.language,native_name=excluded.native_name,english_name=excluded.english_name,collector_number=excluded.collector_number,image_url=excluded.image_url,quantity=excluded.quantity,updated_at=excluded.updated_at').bind(binderId,cardId,variantId,card.canonicalId,card.variantCode,card.finishCode,card.setId,card.language,card.nativeName,card.englishName,card.collectorNumber,card.imageUrl,quantity,time,time,binderId,user)]);
   return reply({ok:true,replayed:again,binder:await own(db,user,binderId)});
  }catch(e){if(/binder_.*conflict|UNIQUE/.test(String(e.message)))return reply({error:'This binder changed or this action already exists. Refresh before retrying.'},409);if(/binder_item_limit/.test(String(e.message)))return reply({error:'This binder has reached its 10,000 variant limit.'},409);return reply({error:e.status?e.message:'Collection storage is temporarily unavailable. No change is confirmed.'},e.status||503);}
 }
 return {handleRequest,checkCatalogue,checkPitchBlack:()=>checkFeaturedCatalogue('pitchBlack'),checkChaosRising:()=>checkFeaturedCatalogue('chaosRising'),checkJourneyTogether:()=>checkFeaturedCatalogue('journeyTogether'),checkPhantasmalFlames:()=>checkFeaturedCatalogue('phantasmalFlames'),checkAscendedHeroes:()=>checkFeaturedCatalogue('ascendedHeroes'),checkDeltaReign:()=>checkFeaturedCatalogue('deltaReign')};
}
