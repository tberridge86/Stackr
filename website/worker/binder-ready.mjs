import {mergeCataloguePrintings} from './catalogue-printings.mjs';

// Only these complete public English catalogues may occupy the shared cache.
export const READY_CATALOGUES=[
 {setId:'258cb8e5-c769-540d-9e3c-40d4ed4dafdb',language:'en',total:161,name:'30th Celebration'},
 {setId:'d6d58c17-5923-496e-94ef-5819f34ae10c',language:'en',total:120,name:'Pitch Black'},
 {setId:'816ff627-a585-4953-99c4-a15c9b0b80e5',language:'en',total:122,name:'Chaos Rising'},
 {setId:'4f3046f3-9ab7-4068-a7df-dbe2b08c263c',language:'en',total:190,name:'Journey Together'},
 {setId:'977bf107-e10c-4d93-a7a4-3d7b775c5003',language:'en',total:130,name:'Phantasmal Flames'},
 {setId:'ddc668c0-316e-4dab-8c51-625167508fd6',language:'en',total:295,name:'Ascended Heroes'},
 {setId:'a1bde625-6996-5451-bcda-fb80fe5b428b',language:'en',total:141,name:'Delta Reign'}
];
const READY_BUNDLE_DATA={};
const READY_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READY_MAX_BYTES=2000000,READY_MAX_GZIP=260000,READY_MAX_ROWS=1000,READY_MAX_PAGES=20;
const READY_FRESH_MS=6*60*60*1000,READY_RETRY_MS=15*60*1000;
const readyFail=()=>{throw Error('Invalid complete public catalogue.');};
const readyText=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))readyFail();return value;};
const readyKeys=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))readyFail();};
function readyUrl(value){
 try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&host.includes('.')&&!/^[\d.]+$/.test(host)&&!host.includes(':')&&!host.startsWith('[')&&host!=='localhost'&&!host.endsWith('.localhost')&&!host.endsWith('.local')&&!host.endsWith('.internal')&&url.href.length<=2000)return url.href;}catch{}
 return null;
}
function readyImage(card,variant){
 const image=variant.image;if(!image||image.permissionStatus!=='approved'||image.cardId&&image.cardId!==card.cardId||image.setId&&image.setId!==card.set.setId)return null;
 const derivatives=(Array.isArray(image.derivatives)?image.derivatives:[]).filter(row=>['card-grid','search-result'].includes(row.role)).flatMap(row=>{const url=readyUrl(row.deliveryUrl||row.url);return url?[{role:row.role,deliveryUrl:url}]:[];});
 const url=readyUrl(image.deliveryUrl||image.url)||derivatives.find(row=>row.role==='card-grid')?.deliveryUrl;if(!url)return null;
 return {permissionStatus:'approved',cardId:card.cardId,setId:card.set.setId,deliveryUrl:url,derivatives};
}
export function compactReadyCard(card){
 if(!card||!READY_UUID.test(card.cardId||'')||!READY_UUID.test(card.catalogueVersionId||'')||card.game!=='pokemon'||card.languageCode!=='en'||!READY_UUID.test(card.set?.setId||'')||!Array.isArray(card.variants)||!card.variants.length||card.variants.length>32)readyFail();
 const variants=card.variants.map(variant=>{
  if(!READY_UUID.test(variant?.variantId||''))readyFail();
  return {variantId:variant.variantId,canonicalId:readyText(variant.canonicalId,400),variantCode:readyText(variant.variantCode,100),variantLabel:typeof variant.variantLabel==='string'?readyText(variant.variantLabel,100):variant.variantCode,finishCode:variant.finishCode==null?null:readyText(variant.finishCode,100),finishLabel:variant.finishLabel==null?null:readyText(variant.finishLabel,100),image:readyImage(card,variant)};
 });
 if(!variants.some(variant=>variant.variantId===card.defaultVariantId)||new Set(variants.map(variant=>variant.variantId)).size!==variants.length)readyFail();
 return {cardId:card.cardId,catalogueVersionId:card.catalogueVersionId,game:'pokemon',languageCode:'en',set:{setId:card.set.setId},collectorNumber:{value:readyText(card.collectorNumber?.value,80),sortKey:readyText(String(card.collectorNumber?.sortKey||card.collectorNumber?.value||''),100)},names:{native:readyText(card.names?.native,300),englishDisplay:card.names?.englishDisplay==null?null:readyText(card.names.englishDisplay,300)},defaultVariantId:card.defaultVariantId,variants};
}
function readySnapshot(value){if(Array.isArray(value))return '['+value.map(readySnapshot).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+readySnapshot(value[key])).join(',')+'}';return JSON.stringify(value);}
export function validateReadyBundle(value,spec,at=Date.now()){
 readyKeys(value,['schema','source','capturedAt','catalogueVersionId','complete','sourceRows','pageSizes','set','cards']);
 if(value.schema!==1||value.source!=='canonical-public-v1'||value.complete!==true||!READY_UUID.test(value.catalogueVersionId||'')||!Number.isFinite(Date.parse(value.capturedAt))||Date.parse(value.capturedAt)>at+300000||!Number.isSafeInteger(value.sourceRows)||value.sourceRows<spec.total||value.sourceRows>READY_MAX_ROWS||!Array.isArray(value.pageSizes)||!value.pageSizes.length||value.pageSizes.length>READY_MAX_PAGES||value.pageSizes.some(n=>!Number.isInteger(n)||n<1||n>50)||value.pageSizes.reduce((sum,n)=>sum+n,0)!==value.sourceRows)readyFail();
 readyKeys(value.set,['setId','game','languageCode','nativeName','englishDisplayName','setCode','total']);
 const set=value.set;if(set.setId!==spec.setId||set.game!=='pokemon'||set.languageCode!==spec.language||set.total!==spec.total)readyFail();
 readyText(set.nativeName,300);if(set.englishDisplayName!==null)readyText(set.englishDisplayName,300);if(set.setCode!==null)readyText(set.setCode,40);
 if(!Array.isArray(value.cards)||value.cards.length!==spec.total||value.cards.length>400)readyFail();
 const compact=value.cards.map(compactReadyCard);
 if(readySnapshot(compact)!==readySnapshot(value.cards)||compact.some(card=>card.set.setId!==spec.setId||card.languageCode!==spec.language||card.catalogueVersionId!==value.catalogueVersionId)||mergeCataloguePrintings(compact).length!==compact.length)readyFail();
 const variantIds=compact.flatMap(card=>card.variants.map(variant=>variant.variantId));if(new Set(variantIds).size!==variantIds.length)readyFail();
 if(new TextEncoder().encode(JSON.stringify(value)).length>READY_MAX_BYTES)readyFail();
 return value;
}
export async function captureReadyBundle(spec,upstream,at=Date.now()){
 const metadata=await upstream('/sets/'+spec.setId),set=metadata.data?.set;
 if(!set||set.setId!==spec.setId||set.languageCode!==spec.language||set.game!=='pokemon'||set.total!==spec.total)readyFail();
 const raw=[],pageSizes=[],cursors=new Set();let cursor=null;
 do{
  const page=await upstream('/sets/'+spec.setId+'/cards',new URLSearchParams({language:spec.language,limit:'50',...(cursor?{cursor}:{})})),cards=page.data?.cards,pagination=page.meta?.pagination;
  if(!Array.isArray(cards)||cards.length<1||cards.length>50||!pagination||!Object.hasOwn(pagination,'nextCursor')||page.meta.apiVersion!=='1')readyFail();
  raw.push(...cards);pageSizes.push(cards.length);cursor=pagination.nextCursor;
  if(raw.length>READY_MAX_ROWS||pageSizes.length>READY_MAX_PAGES||cursor!==null&&(typeof cursor!=='string'||!cursor||cursor.length>2048||cursors.has(cursor)||pageSizes.length>=READY_MAX_PAGES))readyFail();
  if(cursor)cursors.add(cursor);
 }while(cursor);
 // Merge the original rows before trimming presentation metadata so conflicts
 // in the canonical source cannot disappear during compaction.
 const cards=mergeCataloguePrintings(raw).map(compactReadyCard).sort((a,b)=>a.collectorNumber.sortKey.localeCompare(b.collectorNumber.sortKey,'en',{numeric:true})||a.cardId.localeCompare(b.cardId));
 return validateReadyBundle({schema:1,source:'canonical-public-v1',capturedAt:new Date(at).toISOString(),catalogueVersionId:cards[0]?.catalogueVersionId,complete:true,sourceRows:raw.length,pageSizes,set:{setId:set.setId,game:'pokemon',languageCode:set.languageCode,nativeName:set.nativeName,englishDisplayName:set.englishDisplayName||null,setCode:set.setCode||null,total:set.total},cards},spec,at);
}
async function readyReadJson(response){
 if(Number(response.headers.get('Content-Length')||0)>READY_MAX_BYTES)readyFail();
 const reader=response.body?.getReader();if(!reader)readyFail();const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>READY_MAX_BYTES){await reader.cancel();readyFail();}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function decodeReadyBundle(record,spec,at=Date.now()){
 if(!record||record.encoding!=='gzip-base64'||typeof record.data!=='string'||record.data.length>Math.ceil(READY_MAX_GZIP/3)*4)readyFail();
 const bytes=Uint8Array.from(atob(record.data),c=>c.charCodeAt(0));if(bytes.length>READY_MAX_GZIP)readyFail();
 const value=await readyReadJson(new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))));
 return validateReadyBundle(value,spec,at);
}
export function readyReference(bundle,at=Date.now()){
 return {complete:true,setId:bundle.set.setId,language:bundle.set.languageCode,total:bundle.cards.length,catalogueVersionId:bundle.catalogueVersionId,capturedAt:bundle.capturedAt,snapshotId:bundle.catalogueVersionId+':'+bundle.capturedAt,stale:at-Date.parse(bundle.capturedAt)>READY_FRESH_MS};
}
export function createBinderReadyService({upstream,now=Date.now,bundles=READY_BUNDLE_DATA,catalogues=READY_CATALOGUES}={}){
 if(catalogues.length>8||new Set(catalogues.map(row=>row.setId)).size!==catalogues.length)throw Error('Bounded public catalogue list required.');
 const specs=new Map(catalogues.map(row=>[row.setId,row])),memory=new Map(),decoding=new Map(),refreshing=new Map(),attempted=new Map();
 const specFor=(setId,lang)=>{const spec=specs.get(setId);return spec?.language===lang?spec:null;};
 async function seed(spec){
  if(memory.has(spec.setId))return memory.get(spec.setId);
  if(!decoding.has(spec.setId)){const pending=(async()=>{const record=bundles[spec.setId];if(!record)return null;const value=await decodeReadyBundle(record,spec,now());memory.set(spec.setId,value);return value;})().finally(()=>decoding.delete(spec.setId));decoding.set(spec.setId,pending);}
  return decoding.get(spec.setId);
 }
 async function refresh(spec,env){
  if(refreshing.has(spec.setId))return refreshing.get(spec.setId);
  attempted.set(spec.setId,now());
  const task=(async()=>{
   const bucket=env?.BUCKET,key='stackr-public-checklists/v1/'+spec.setId+'-'+spec.language+'.json';let revision=null;
   if(bucket?.get){try{const object=await bucket.get(key);if(object){revision=typeof object.etag==='string'?object.etag:null;if(object.size>READY_MAX_BYTES)readyFail();const value=validateReadyBundle(await readyReadJson(new Response(object.body)),spec,now());if(!memory.has(spec.setId)||Date.parse(value.capturedAt)>Date.parse(memory.get(spec.setId).capturedAt))memory.set(spec.setId,value);}}catch{}}
   const current=memory.get(spec.setId);if(current&&now()-Date.parse(current.capturedAt)<READY_FRESH_MS)return current;
   const value=await captureReadyBundle(spec,upstream,now());memory.set(spec.setId,value);
   if(bucket?.put){try{await bucket.put(key,JSON.stringify(value),{onlyIf:revision?{etagMatches:revision}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{kind:'public-canonical-checklist',schema:'1'}});}catch{}}
   return value;
  })().finally(()=>refreshing.delete(spec.setId));refreshing.set(spec.setId,task);return task;
 }
 async function get(setId,lang,env={},ctx){
  const spec=specFor(setId,lang);if(!spec)return null;
  const current=await seed(spec);
  if(!current)return refresh(spec,env);
  if(ctx?.waitUntil&&(!attempted.has(setId)||now()-attempted.get(setId)>=READY_RETRY_MS))ctx.waitUntil(refresh(spec,env).catch(()=>{}));
  return current;
 }
 return {get,supports:(setId,lang)=>!!specFor(setId,lang)};
}
