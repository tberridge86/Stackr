import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createPriceService} from './worker/pricing.mjs';
import {renderSitePage} from './worker/site-pages.mjs';
import {validateProductFrame} from './worker/product-frames.mjs';
const root=process.cwd(),src=path.join(root,'src'),out=path.join(root,'dist');
await fs.mkdir(path.join(out,'assets'),{recursive:true});
const products=JSON.parse(await fs.readFile(path.join(src,'products.json'),'utf8'));
if(!products.length||new Set(products.map(p=>p.id)).size!==products.length)throw Error('Expected unique product identities');
const productContents=JSON.parse(await fs.readFile(path.join(src,'product-contents.json'),'utf8'));
const shopInventory=JSON.parse(await fs.readFile(path.join(src,'inventory.json'),'utf8'));
const setHighlights=JSON.parse(await fs.readFile(path.join(src,'set-highlights.json'),'utf8'));
const collectorHighlightSources=structuredClone(setHighlights.sets);
const releaseRegistry=JSON.parse(await fs.readFile(path.join(src,'set-release-dates.json'),'utf8'));
const setReleaseDates=releaseRegistry.sets;
if(releaseRegistry.schemaVersion!==1||!setReleaseDates)throw Error('Missing set release-date registry');
for(const[key,entry]of Object.entries(setReleaseDates)){
 if(!products.some(product=>product.setKey===key)||!/^\d{4}-\d{2}-\d{2}$/.test(entry.releaseDate)||!Number.isFinite(Date.parse(entry.releaseDate))||new Date(entry.releaseDate).toISOString().slice(0,10)!==entry.releaseDate||!releaseRegistry.sources?.[entry.sourceId]?.url?.startsWith('https://'))throw Error('Unverified set release date '+key);
}
const foundationsCss=await fs.readFile(path.join(src,'site-foundations.css'),'utf8');
const imageQuality=JSON.parse(await fs.readFile(path.join(src,'image-quality.json'),'utf8'));
const pokemonHistory=JSON.parse(await fs.readFile(path.join(src,'pokemon-history.json'),'utf8'));
const historyArtifacts=JSON.parse(await fs.readFile(path.join(src,'history-artifacts.json'),'utf8'));
const historyMap=JSON.parse(await fs.readFile(path.join(src,'history-map.json'),'utf8'));
if(pokemonHistory.schemaVersion!==1||!Array.isArray(pokemonHistory.events)||!pokemonHistory.events.length)throw Error('Invalid history collection');
const productGallery=JSON.parse(await fs.readFile(path.join(src,'product-gallery.json'),'utf8'));
if(productGallery.schemaVersion!==1||!productGallery.products)throw Error('Invalid product gallery registry');
for(const[id,entry]of Object.entries(productGallery.products)){
 const product=products.find(p=>p.id===id);
 if(!product||product.language!==entry.language||!Array.isArray(entry.photos)||!entry.photos.length||entry.photos.length>8)throw Error('Mismatched product gallery '+id);
}
const priceSources=JSON.parse(await fs.readFile(path.join(root,'worker','price-sources.json'),'utf8'));
const priceSeeds=JSON.parse(await fs.readFile(path.join(src,'pricing-seeds.json'),'utf8'));
const pricingBootstrap=await createPriceService({products,sources:priceSources,seedQuotes:priceSeeds}).getSnapshot();
async function assetFiles(dir,prefix=''){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())result.push(...await assetFiles(path.join(dir,entry.name),name+'/'));else result.push(name);}return result;}
const files=await assetFiles(path.join(src,'assets'));
if(!files.includes(historyMap.file)||!Number.isSafeInteger(historyMap.width)||!Number.isSafeInteger(historyMap.height)||historyMap.width<=0||historyMap.height<=0||!historyMap.sourcePage?.startsWith('https://')||createHash('sha256').update(await fs.readFile(path.join(src,'assets',historyMap.file))).digest('hex')!==historyMap.sha256)throw Error('Invalid history map original');
const setLogoRegistry=JSON.parse(await fs.readFile(path.join(src,'set-logos.json'),'utf8'));
if(setLogoRegistry.schemaVersion!==1||!setLogoRegistry.logos)throw Error('Invalid set logo registry');
for(const p of products)if(!Object.hasOwn(setLogoRegistry.logos,p.setKey))delete p.setLogo;
for(const[key,logo]of Object.entries(setLogoRegistry.logos)){
 const items=products.filter(p=>p.setKey===key);
 if(!items.length||items.some(p=>p.language!==logo.language)||!files.includes(logo.file)||!/^[a-f0-9]{64}$/.test(logo.sha256)||createHash('sha256').update(await fs.readFile(path.join(src,'assets',logo.file))).digest('hex')!==logo.sha256)throw Error('Missing, mismatched or changed set logo '+key);
 for(const p of items)p.setLogo=logo.file;
}
function imageAsset(name){if(!files.includes(name))throw Error('Missing asset '+name);return 'assets/'+name;}
const mediaSources={};
function mediaImage(value,key,sha256){if(!value)return '';if(!value.startsWith('https://'))return imageAsset(value.replace(/^assets\//,''));const url=new URL(value);if(url.username||url.password||url.port||/^(?:localhost|.*\.local|\d+(?:\.\d+){3}|\[.*\])$/i.test(url.hostname))throw Error('Invalid media source '+key);mediaSources[key]={url:value,...(sha256?{sha256}:{})};return '/media/'+key;}
function validateHistoryOutline(image,label){if(image.subjectPolygon){const c=image.crop;if(image.registrationSourceSha256!==image.sha256||!c||image.subjectPolygon.length!==4||image.subjectPolygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<c.x||point[1]<c.y||point[0]>c.x+c.width||point[1]>c.y+c.height))throw Error('Stale archive subject registration '+label);}const o=image.cardOutline;if(!o)return;if(o.sourceSha256!==image.sha256||o.sourceWidth!==image.width||o.sourceHeight!==image.height||typeof o.path!=='string'||o.path.length>20000||!/^[MLCQZ0-9+.,\s-]+$/.test(o.path))throw Error('Stale or invalid card outline '+label);const points=o.path.replace(/[MLCQZ]/g,' ').trim().split(/[\s,]+/).map(Number);if(points.length<12||points.length%2||points.some((n,index)=>!Number.isFinite(n)||n<0||n>(index%2?image.height:image.width)))throw Error('Card outline outside original '+label);}
const historyResolved={};
const historyDeliveryRoutes=new Map();
async function historyImageSource(image,id){
 const originalKey='contents/history-'+id+'--'+image.sha256.slice(0,12);
 const remoteOriginal=image.url?mediaImage(image.url,originalKey,image.sha256):null;
 const original=image.file?'/'+imageAsset(image.file):remoteOriginal;
 if(!image.delivery){const identity=(image.url||image.file)+'\n'+image.sha256;if(historyDeliveryRoutes.has(identity))return historyDeliveryRoutes.get(identity);historyDeliveryRoutes.set(identity,original);return original;}
 const d=image.delivery;
 if(!image.url?.startsWith('https://')||!/^history-renditions\/[a-z0-9_-]+\.(?:webp|png|jpg)$/.test(d.file||'')||!/^[a-f0-9]{64}$/.test(d.sha256||'')||!['image/webp','image/png','image/jpeg'].includes(d.mime)||![d.width,d.height,d.bytes].every(value=>Number.isSafeInteger(value)&&value>0)||d.width>image.width||d.height>image.height||Math.abs(d.width/image.width-d.height/image.height)>1/Math.min(image.width,image.height))throw Error('Invalid history rendition '+id);
 const bytes=await fs.readFile(path.join(src,d.file));
 if(bytes.length!==d.bytes||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('Changed history rendition '+id);
 const identity=image.url+'\n'+image.sha256+'\n'+d.sha256;
 if(historyDeliveryRoutes.has(identity))return historyDeliveryRoutes.get(identity);
 const key='contents/history-'+id+'-display--'+d.sha256.slice(0,12);
 mediaSources[key]={kind:'stored-rendition',original:{url:image.url,sha256:image.sha256},delivery:{sha256:d.sha256,mime:d.mime,bytes:d.bytes}};
 const route='/media/'+key;historyDeliveryRoutes.set(identity,route);image.masterSrc=original;return route;
}
if(historyArtifacts.schemaVersion!==1||!historyArtifacts.assets)throw Error('Invalid history artifact registry');
for(const[id,original]of Object.entries(historyArtifacts.assets)){
 const image=structuredClone(original);
 validateHistoryOutline(image,id);
 if(!/^[a-z0-9-]+$/.test(id)||!/^[a-f0-9]{64}$/.test(image.sha256)||![image.width,image.height].every(value=>Number.isSafeInteger(value)&&value>0)||!image.caption||!image.sourceUrl?.startsWith('https://'))throw Error('Invalid history artifact '+id);
 if(image.crop){const c=image.crop;if(c.sourceSha256!==image.sha256||c.sourceWidth!==image.width||c.sourceHeight!==image.height||![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>image.width||c.y+c.height>image.height)throw Error('Stale history artifact framing '+id);}
 if(image.subjectPolygon){const c=image.crop;if(image.registrationSourceSha256!==image.sha256||!c||image.subjectPolygon.length!==4||image.subjectPolygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<c.x||point[1]<c.y||point[0]>c.x+c.width||point[1]>c.y+c.height))throw Error('Stale history card registration '+id);}
 if(image.file){if(createHash('sha256').update(await fs.readFile(path.join(src,'assets',image.file))).digest('hex')!==image.sha256)throw Error('Changed history artifact '+id);image.src='/'+imageAsset(image.file);}
 else{if(!image.url?.startsWith('https://'))throw Error('Missing history original '+id);image.src=await historyImageSource(image,id);}
 historyResolved[id]=image;
}
function historyArtifact(id){if(!historyResolved[id])throw Error('Unknown history artifact '+id);return historyResolved[id];}
pokemonHistory.openingArtwork=historyArtifact(pokemonHistory.openingArtifactId);
for(const event of pokemonHistory.events){if(event.artifactIds)event.artifacts=event.artifactIds.map(historyArtifact);if(event.peel)event.exhibit={kind:event.peel.kind||'cards',cover:historyArtifact(event.peel.cover),cards:event.peel.cards.map(historyArtifact),...(event.peel.insert?{insert:historyArtifact(event.peel.insert)}:{}),...(event.peel.backs?{backs:event.peel.backs.map(historyArtifact)}:{})};}
function validatedMask(mask,sha,width,height,label){
 return validateProductFrame(mask,sha,width,height,label);
}
function validatedTone(tone,sha,label){if(!tone)return null;if(tone.sourceSha256!==sha||!Number.isFinite(tone.gamma)||tone.gamma<.85||tone.gamma>1||tone.amplitude!==1||tone.offset!==0||tone.colorInterpolation!=='sRGB')throw Error('Invalid or stale photo tone '+label);return {gamma:tone.gamma};}
function validatedLogoIsolation(mask,logo,label){
 if(!mask)return null;const b=mask.bounds;
 if(mask.sourceSha256!==logo.sha256||mask.sourceWidth!==logo.width||mask.sourceHeight!==logo.height||typeof mask.path!=='string'||mask.path.length>300000||!/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(mask.path)||!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>logo.width||b.y+b.height>logo.height)throw Error('Invalid or stale logo isolation '+label);
 return mask;
}
for(const p of products){
 if(!['English','Japanese','Simplified Chinese','Korean'].includes(p.language))throw Error('Missing product language: '+p.id);
 const quality=imageQuality.products[p.id],mask=validatedMask(quality?.cutout,p.imageSha256,p.imageWidth,p.imageHeight,p.id);
 const gallery=productGallery.products[p.id];
 if(gallery)p.gallery=gallery.photos.map((photo,index)=>{
  if(!photo.id||!photo.label||!/^https:\/\//.test(photo.sourceUrl)||!/^https:\/\//.test(photo.url)||!Number.isSafeInteger(photo.width)||!Number.isSafeInteger(photo.height)||photo.width<=0||photo.height<=0||!/^[a-f0-9]{64}$/.test(photo.sha256))throw Error('Invalid gallery view '+p.id+' '+index);
  const {url,...metadata}=photo;
  return {...metadata,image:mediaImage(url,'products/'+p.id+'-view-'+index+'--'+photo.sha256.slice(0,12),photo.sha256)};
 });
 if(mask)p.imageCutout=mask;
 const tone=validatedTone(quality?.tone,p.imageSha256,p.id);if(tone)p.imageTone=tone;
 for(const old of quality?.history||[]){if(!/^[a-f0-9]{64}$/.test(old.sha256))throw Error('Invalid retained photo '+p.id);mediaImage(old.url,'products/'+p.id+'--'+old.sha256.slice(0,12),old.sha256);}
 const reference=quality?.referencePhoto;
 if(reference){const referenceImage=mediaImage(reference.url,'products/'+p.id+'--'+reference.sha256.slice(0,12),reference.sha256);if(reference.storefrontApproved!==false)p.photoReference={image:referenceImage,imageCutout:validatedMask(reference.cutout,reference.sha256,reference.width,reference.height,p.id+' reference'),imageTone:validatedTone(reference.tone,reference.sha256,p.id+' reference'),label:reference.label};}
 if(p.imagePending&&quality?.storefrontPhotoPending&&p.image)mediaImage(p.image,'products/'+p.id,p.imageSha256);
 const legacyImage=p.imagePending?'':mediaImage(p.image,'products/'+p.id,p.imageSha256);
 if(legacyImage.startsWith('/media/')&&p.imageSha256){
  const versioned='products/'+p.id+'--'+p.imageSha256.slice(0,12);
  mediaSources[versioned]=mediaSources['products/'+p.id];p.image='/media/'+versioned;
 }else p.image=legacyImage;
 if(p.setLogo){const logo=setLogoRegistry.logos[p.setKey];p.setLogo=logo.delivery==='media'?mediaImage(logo.sourceUrl,'sets/'+p.setKey+'--'+logo.sha256.slice(0,12),logo.sha256):imageAsset(p.setLogo);if(logo.crop){const c=logo.crop;if(![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>logo.width||c.y+c.height>logo.height)throw Error('Invalid logo viewport '+p.setKey);p.setLogoCrop={...c,sourceWidth:logo.width,sourceHeight:logo.height};}}
 if(p.setLogo){const isolation=validatedLogoIsolation(setLogoRegistry.logos[p.setKey].logoIsolation,setLogoRegistry.logos[p.setKey],p.setKey);if(isolation)p.setLogoIsolation=isolation;}
 if(!shopInventory.products[p.id])throw Error('Missing explicit inventory state: '+p.id);
}
for(const[id,entry]of Object.entries(productContents.products)){if(entry.photo)entry.photo=mediaImage(entry.photo,'contents/'+id,entry.photoSha256);for(const[index,component]of (entry.components||[]).entries())component.image=mediaImage(component.image,'contents/'+id+'-'+index,component.sha256);}
for(const event of pokemonHistory.events){
 if(event.image)validateHistoryOutline(event.image,event.id);
 if(!event.id||!['cards','games','films','events','anime'].includes(event.lane)||!Number.isSafeInteger(event.year)||!event.headline||!event.description||!event.region||!event.sourceUrl?.startsWith('https://'))throw Error('Unverified history event '+event.id);
 if(event.image){const image=event.image;if(!/^[a-z0-9-]+$/.test(image.id)||!/^[a-f0-9]{64}$/.test(image.sha256)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<=0||image.height<=0)throw Error('Invalid history image '+event.id);if(image.crop){const c=image.crop;if(c.sourceSha256!==image.sha256||c.sourceWidth!==image.width||c.sourceHeight!==image.height||![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>image.width||c.y+c.height>image.height)throw Error('Invalid archive viewport '+event.id);}const legacy=await historyImageSource(image,image.id);if(image.file&&createHash('sha256').update(await fs.readFile(path.join(src,'assets',image.file))).digest('hex')!==image.sha256)throw Error('Changed history original '+event.id);image.src=image.file?'/'+imageAsset(image.file):legacy;}
}
for(const[key,entry]of Object.entries(setHighlights.sets)){
 const sharedCrops=new Map();
 for(const[index,card]of (entry.cards||[]).entries()){
  const source=card.displayImagePending?'':card.image,route=mediaImage(source,'cards/'+key+'-'+index+(card.imageSha256?'--'+card.imageSha256.slice(0,12):''),card.imageSha256);
  const sharedKey=source+'\n'+(card.imageSha256||'');
  if(card.imageFile){
   if(card.displayImagePending||createHash('sha256').update(await fs.readFile(path.join(src,'assets',card.imageFile))).digest('hex')!==card.imageSha256)throw Error('Changed or pending local chase original '+card.id);
   card.image='/'+imageAsset(card.imageFile);
  }else card.image=card.crop?(sharedCrops.get(sharedKey)||route):route;
  if(card.crop)sharedCrops.set(sharedKey,card.image);
  card.url=card.url||card.sourceUrl||entry.sourceUrls?.[0]||entry.source;
 }
}
const setBrowser=await fs.readFile(path.join(src,'set-browser.js'),'utf8');
const groups=await fs.readFile(path.join(src,'set-groups.js'),'utf8');
const tools=await fs.readFile(path.join(src,'shop-tools.js'),'utf8');
const live=await fs.readFile(path.join(src,'live-pricing.js'),'utf8');
const stock=await fs.readFile(path.join(src,'shop-state.js'),'utf8');
const setCollectionLinks=JSON.parse(await fs.readFile(path.join(src,'collection-set-links.json'),'utf8'));
const shopLanguages={English:'en',Japanese:'ja','Simplified Chinese':'zh-cn','Traditional Chinese':'zh-tw',Korean:'ko'};
if(setCollectionLinks.schemaVersion!==1||!setCollectionLinks.matches)throw Error('Invalid set/collection links');
for(const [key,link]of Object.entries(setCollectionLinks.matches)){
 const entry=setHighlights.sets[key];
 if(!entry||link.language!==entry.languageCode?.toLowerCase()||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(link.setId)||products.some(p=>p.setKey===key&&shopLanguages[p.language]!==link.language))throw Error('Mismatched collection link '+key);
}
const data='const setCollectionLinks='+JSON.stringify(setCollectionLinks)+';\nconst productContents='+JSON.stringify(productContents)+';\nconst shopInventory='+JSON.stringify(shopInventory)+';\nconst pricingBootstrap='+JSON.stringify(pricingBootstrap)+';\nconst setHighlights='+JSON.stringify(setHighlights)+';\nconst setReleaseDates='+JSON.stringify(setReleaseDates)+';\n'+stock+'\n';
const browseContext=await fs.readFile(path.join(src,'browse-context.js'),'utf8');
const storyNavigation=await fs.readFile(path.join(src,'story-navigation.js'),'utf8');
new vm.Script(storyNavigation,{filename:'StackR-story-navigation.js'});
const script=browseContext+'\n'+(await fs.readFile(path.join(src,'app.js'),'utf8')).replace('__PRODUCTS__',()=>JSON.stringify(products)).replace('const paths={',()=>data+live+'\n'+setBrowser+'\n'+groups+'\nconst paths={')+'\n'+tools;
new vm.Script(script,{filename:'StackR-shop.js'});
const collector=await fs.readFile(path.join(src,'collector.js'),'utf8');
new vm.Script(collector,{filename:'StackR-collector.js'});
const priceShare=await fs.readFile(path.join(src,'price-share.js'),'utf8');
new vm.Script(priceShare,{filename:'StackR-price-share.js'});
const interactionGeometry=await fs.readFile(path.join(src,'interaction-geometry.js'),'utf8');
const interactions=await fs.readFile(path.join(src,'interactions.js'),'utf8');
new vm.Script(interactionGeometry+'\n'+interactions,{filename:'StackR-interactions.js'});
const showcase=await fs.readFile(path.join(src,'shop-showcase.js'),'utf8');
const cardViewer=await fs.readFile(path.join(src,'card-viewer.js'),'utf8');
new vm.Script(showcase+'\n'+cardViewer,{filename:'StackR-showcase.js'});
const historyScript=(await fs.readFile(path.join(src,'history-page.js'),'utf8')).replace('__POKEMON_HISTORY__',()=>JSON.stringify(pokemonHistory).replace(/</g,'\\u003c'));
new vm.Script(historyScript,{filename:'StackR-history.js'});
const historyMarkup=new vm.Script(historyScript+'\nhistoryTimelineMarkup();').runInNewContext({URL});
const historyOpeningMarkup=new vm.Script(historyScript+'\nhistoryOpeningMarkup();').runInNewContext({URL});
const sharedCss=await fs.readFile(path.join(src,'shared-shell.css'),'utf8');
const sharedJs=await fs.readFile(path.join(src,'shared-shell.js'),'utf8');
new vm.Script(sharedJs,{filename:'StackR-shared-shell.js'});
const css=(await fs.readFile(path.join(src,'styles.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'retail.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'collector.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'shop-polish.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'shop-tools.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'brand.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'shop-state.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'image-quality.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'typography.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'editorial.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'studio-photo.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'artwork-layout.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'set-groups.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'brand-refinement.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'interactions.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'showcase.css'),'utf8'));
const websiteCss=(await fs.readFile(path.join(src,'browse-context.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'website.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'art-quality.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'art-showcase.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'story.css'),'utf8'));
const phoneCommerce=await fs.readFile(path.join(src,'phone-commerce.js'),'utf8');
new vm.Script(phoneCommerce,{filename:'phone-commerce.js'});
const phoneCss=(await fs.readFile(path.join(src,'phone-commerce.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'home-showcase.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'ui-finesse.css'),'utf8'));
const baseCss=css.replace(/@font-face\s*\{[^}]*\}/g,'');
const shopRuntime=script+'\n'+collector+'\n'+priceShare+'\n'+interactionGeometry+'\n'+interactions+'\n'+showcase+'\n'+cardViewer+'\nrenderOpeningProduct();renderLanguageFilters();renderFormatBrowser();initProductCutouts();initLivePricing();initShopState();\n'+storyNavigation+'\n'+phoneCommerce+'\ninitPhoneCommerce();\n'+sharedJs;
const shopRuntimeFile='shop-'+createHash('sha256').update(shopRuntime).digest('hex').slice(0,12)+'.js';
// Current HTML never points at older bundles. Do not carry retired disclosure
// payloads into a privacy release or its static deployment archive.
for(const file of await fs.readdir(path.join(out,'assets')))if(/^shop-[a-f0-9]{12}\.js$/.test(file)&&file!==shopRuntimeFile)await fs.unlink(path.join(out,'assets',file));
await fs.writeFile(path.join(out,'assets',shopRuntimeFile),shopRuntime);
// Render the existing truthful catalogue composition before any client JS loads.
// No stock snapshot is fabricated: real inventory still comes from /api/shop.
const escapePreview=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const previewContext=vm.createContext({products,setReleaseDates,shopReady:false,liveStock:()=>({status:'unknown',quantity:null}),escapeHtml:escapePreview,icon:name=>name==='arrow'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>':''});
vm.runInContext(groups.match(/^function productIsUpcoming\([^\n]+/m)[0]+'\n'+groups.match(/function isProductInStock\(p\)\{[\s\S]*?\n\}/)[0]+'\n'+tools.split('function initProductCutouts')[0]+'\n'+showcase,previewContext);
const openingPreview=vm.runInContext('(()=>{const pool=openingProductPool();return pool.items.length?openingProductSlideMarkup(pool.items[0],pool,0):"";})()',previewContext).replaceAll('product-clip-','opening-preview-clip-').replaceAll('photo-tone-','opening-preview-tone-');
const firstPreviewImage=openingPreview.match(/data-opening-position="front"[\s\S]*?data-product-photo\s+(?:href|src)="([^"]+)"/)?.[1];
let html=(await fs.readFile(path.join(src,'index.html'),'utf8')).replaceAll('__PRODUCT_COUNT__',String(products.length));
const openingShell=vm.runInContext('openingShowcaseMarkup("",true,openingProductPool().items.length)',previewContext).replace('<div id="opening-product-slide" data-opening-slide role="group" aria-roledescription="slide"></div>','<div id="opening-product-slide" data-opening-slide role="group" aria-roledescription="slide">'+openingPreview+'</div>');
html=html.replace('__OPENING_PREVIEW__',openingShell);
if(firstPreviewImage)html=html.replace('</head>','<link rel="preload" as="image" fetchpriority="high" href="'+firstPreviewImage+'">\n</head>');
html=html.replaceAll('__HERO_IMAGE__',products.find(product=>product.id==='cn-terastal-grand-box').image);
html=html.replaceAll('__HOME_HISTORY_IMAGE__',historyResolved['game-boy-500'].src);
for(const[key,value]of Object.entries({'__CSS__':baseCss+'\n'+websiteCss+'\n'+phoneCss,'__SHOP_SCRIPT__':'/assets/'+shopRuntimeFile,'__LOGO__':imageAsset('stackr-shop-wordmark.png'),'__MARK__':imageAsset('stackr-shop-mark.png')}))html=html.replaceAll(key,()=>value);
if(/__(CSS|SCRIPT|LOADER|LOGO|MARK|STAR|BACKDROP|ETB|PRODUCTS|POKEMON_HISTORY)__/.test(html))throw Error('Unfilled page template');
html=renderSitePage(html.replace('</style>',foundationsCss+'\n'+sharedCss+'\n</style>'));
await fs.writeFile(path.join(out,'index.html'),html);
let historyHtml=await fs.readFile(path.join(src,'history-page.html'),'utf8');
const historyTokens={'__HISTORY_CSS__':(await fs.readFile(path.join(src,'history-page.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'history-reveal.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'history-polish.css'),'utf8')),'__MOMENT_COUNT__':String(pokemonHistory.events.length),'__HISTORY_CONTENT__':historyMarkup,'__HISTORY_OPENING_ART__':historyOpeningMarkup,'__HISTORY_SCRIPT__':historyScript+'\n'+sharedJs,'__LOGO__':imageAsset('stackr-shop-wordmark.png'),'__MARK__':imageAsset('stackr-shop-mark.png'),'__MAP_IMAGE__':imageAsset(historyMap.file),'__MAP_WIDTH__':String(historyMap.width),'__MAP_HEIGHT__':String(historyMap.height),'__MAP_SOURCE__':historyMap.sourcePage,'__MAP_CREDIT__':historyMap.credit};
for(const[key,value]of Object.entries(historyTokens))historyHtml=historyHtml.replaceAll(key,()=>value);
if(/__(?:HISTORY|MAP|LOGO|MARK)_[A-Z_]*__/.test(historyHtml))throw Error('Unfilled history page template');
historyHtml=renderSitePage(historyHtml.replace('</style>',foundationsCss+'\n'+sharedCss+'\n</style>'),'/history');
await fs.writeFile(path.join(out,'history.html'),historyHtml);
let aboutHtml=await fs.readFile(path.join(src,'about-page.html'),'utf8');
for(const[key,value]of Object.entries({'__ABOUT_CSS__':await fs.readFile(path.join(src,'about-page.css'),'utf8'),'__ABOUT_SCRIPT__':(await fs.readFile(path.join(src,'return-shop.js'),'utf8'))+'\n'+sharedJs,'__LOGO__':imageAsset('stackr-shop-wordmark.png'),'__MARK__':imageAsset('stackr-shop-mark.png')}))aboutHtml=aboutHtml.replaceAll(key,()=>value);
if(/__[A-Z_]+__/.test(aboutHtml))throw Error('Unfilled About page template');
aboutHtml=renderSitePage(aboutHtml.replace('</style>',foundationsCss+'\n'+sharedCss+'\n</style>'),'/about');
await fs.writeFile(path.join(out,'about.html'),aboutHtml);
const notFoundHtml=await fs.readFile(path.join(src,'not-found.html'),'utf8');
await fs.writeFile(path.join(out,'404.html'),notFoundHtml);
for(const name of files){if(!html.includes('assets/'+name)&&!shopRuntime.includes('assets/'+name)&&!historyHtml.includes('assets/'+name)&&!aboutHtml.includes('assets/'+name)&&!notFoundHtml.includes('assets/'+name)&&!['inter-license.txt','bricolage-ofl.txt','icon-512.png'].includes(name))continue;await fs.mkdir(path.dirname(path.join(out,'assets',name)),{recursive:true});await fs.copyFile(path.join(src,'assets',name),path.join(out,'assets',name));}
console.log(JSON.stringify({products:products.length,sets:new Set(products.filter(p=>p.setLogo).map(p=>p.setKey)).size,htmlBytes:Buffer.byteLength(html),assetFiles:files.length,output:'dist/index.html'}));

const ownerJs=await fs.readFile(path.join(src,'owner.js'),'utf8');
new vm.Script(ownerJs,{filename:'StackR-owner.js'});
const fsSyncOwnerCss=await fs.readFile(path.join(src,'owner.css'),'utf8');
const ownerHtml=(await fs.readFile(path.join(src,'owner.html'),'utf8')).replace('__OWNER_CSS__',()=>fsSyncOwnerCss).replace('__OWNER_JS__',()=>ownerJs);
await fs.writeFile(path.join(out,'owner.html'),ownerHtml);

const collectionJs=(await fs.readFile(path.join(root,'worker/catalogue-printings.mjs'),'utf8')).replace(/^export /gm,'')+'\n'+(await fs.readFile(path.join(src,'collection.js'),'utf8'))+'\n'+sharedJs;
new vm.Script(collectionJs,{filename:'StackR-collection.js'});
const collectionCss=(await fs.readFile(path.join(src,'collection.css'),'utf8'))+'\n'+(await fs.readFile(path.join(src,'stackr-loading.css'),'utf8'))+'\n'+sharedCss;
const stackrLoadingMarkup=await fs.readFile(path.join(src,'stackr-loading.html'),'utf8');
const loadingAssets=JSON.parse(await fs.readFile(path.join(src,'stackr-loading-assets.json'),'utf8'));
for(const asset of loadingAssets.assets){
 if(!/^stackr-loading-[a-z-]+\.webp$/.test(asset.file)||!/^originals\/loading\/[a-z.-]+$/.test(asset.originalFile)||createHash('sha256').update(await fs.readFile(path.join(root,asset.originalFile))).digest('hex')!==asset.originalSha256||createHash('sha256').update(await fs.readFile(path.join(src,'assets',asset.file))).digest('hex')!==asset.sha256)throw Error('Changed StackR loading layer');
 await fs.copyFile(path.join(src,'assets',asset.file),path.join(out,'assets',asset.file));
}
const collectionLogos=JSON.parse(await fs.readFile(path.join(src,'collection-set-logos.json'),'utf8'));
if(collectionLogos.schemaVersion!==1||collectionLogos.source?.deliveryEnvironment!=='production'||!Array.isArray(collectionLogos.logos))throw Error('Invalid collector artwork registry');
const collectorLogoKeys=new Set();
const collectorLanguageNames={en:'English',ja:'Japanese','zh-cn':'Simplified Chinese','zh-tw':'Traditional Chinese',ko:'Korean'};
for(const row of collectionLogos.logos){
 const key=row.setId+':'+row.language;
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.setId)||!['en','ja','zh-cn','zh-tw','ko'].includes(row.language)||collectorLogoKeys.has(key))throw Error('Invalid or duplicate collector artwork identity '+key);
 collectorLogoKeys.add(key);
 if(row.file){
  if(row.headerRendition){
   const rendition=row.headerRendition,url=new URL(row.url);
   if(url.origin!=='https://assets.stackrtcg.com'||url.username||url.password||url.hash||!url.pathname.startsWith('/public/set_logo/')||!/^set-logo-[a-z0-9-]+-header-v1\.webp$/.test(row.file)||!/^originals\/collection-set-logos\/[a-z0-9.-]+$/.test(rendition.sourcePath)||!Number.isSafeInteger(rendition.width)||rendition.width<1||rendition.width>256||!Number.isSafeInteger(rendition.height)||rendition.height<1||rendition.height>112)throw Error('Invalid collector header logo '+key);
   const master=await fs.readFile(path.join(root,rendition.sourcePath)),delivery=await fs.readFile(path.join(src,'assets',row.file));
   if(createHash('sha256').update(master).digest('hex')!==row.originalSha256||createHash('sha256').update(delivery).digest('hex')!==rendition.sha256||delivery.length!==rendition.bytes||delivery.length>65536)throw Error('Changed collector header logo '+key);
  }else{
   const logo=setLogoRegistry.logos[row.siteLogoKey];
   if(!logo||logo.language!==collectorLanguageNames[row.language]||logo.file!==row.file||logo.sha256!==row.sha256||logo.crop||logo.logoIsolation)throw Error('Unverified collector logo asset '+key);
  }
  await fs.copyFile(path.join(src,'assets',row.file),path.join(out,'assets',row.file));
  // The Worker packages literal asset references from the completed HTML.
  row.url='/assets/'+row.file;
 }else{
  const url=new URL(row.url);
  if(url.origin!=='https://assets.stackrtcg.com'||url.username||url.password||url.hash||!url.pathname.startsWith('/public/set_logo/'))throw Error('Unverified collector logo delivery '+key);
 }
}
const coverRegistry=JSON.parse(await fs.readFile(path.join(src,'collection-cover-art.json'),'utf8'));
if(coverRegistry.schemaVersion!==1||!coverRegistry.base||!coverRegistry.characters?.mewtwo)throw Error('Missing binder cover artwork');
for(const asset of [coverRegistry.base,...Object.values(coverRegistry.characters),...Object.values(coverRegistry.completeCovers||{})]){
 if(!/^[a-z0-9][a-z0-9._-]*\.(?:png|webp)$/.test(asset.file)||createHash('sha256').update(await fs.readFile(path.join(src,'assets',asset.file))).digest('hex')!==asset.sha256)throw Error('Changed binder cover source');
 await fs.copyFile(path.join(src,'assets',asset.file),path.join(out,'assets',asset.file));
}
const collectionCovers={covers:Object.entries(setCollectionLinks.matches).flatMap(([key,link])=>{
 const entry=collectorHighlightSources[key],card=entry?.cards?.find(c=>c.imageVerified&&c.imageSha256&&!c.displayImagePending);
 if(!card||card.languageCode?.toLowerCase()!==link.language)return [];
 const theme30=coverRegistry.selection.owner30thTheme.siteSetKeys.includes(key),mewtwo=!theme30&&coverRegistry.selection.mewtwoNames.includes(card.name),image=theme30?'/assets/'+coverRegistry.characters.mew.file:mewtwo?'/assets/'+coverRegistry.characters.mewtwo.file:card.imageFile?'/assets/'+card.imageFile:card.image;
 if(!image?.startsWith('/assets/')){const url=new URL(image);if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Invalid collector character source');}
 const completeCover=theme30?coverRegistry.completeCovers.celebration30th:Object.values(coverRegistry.completeCovers).find(c=>c.siteSetKeys?.includes(key));
 return [{setId:link.setId,language:link.language,character:theme30?'mew-pikachu':mewtwo?'mewtwo':null,image,...(theme30?{companionImage:'/assets/'+coverRegistry.characters.pikachu.file}:{}),...(completeCover?{fullCover:'/assets/'+completeCover.file}:{}),chaseName:theme30?'Mew & Pikachu':card.name,chaseCardId:card.id,selection:theme30?'Owner-selected 30th Celebration theme':'Editorial collector pick; not a current value ranking'}];
})};
for(const link of Object.values(setCollectionLinks.matches))if(link.binderReady&&!collectionCovers.covers.some(c=>c.setId===link.setId&&c.language===link.language&&c.fullCover))throw Error('Curated binder requires complete verified cover artwork');
// A published numbered preview is factual metadata, never a canonical ownership import.
const deltaList=JSON.parse(await fs.readFile(path.join(root,'catalogue-staging','delta-reign-en.json'),'utf8'));
if(deltaList.language!=='en'||deltaList.printedTotal!==103||deltaList.cards?.length!==141||deltaList.ownershipReady!==false||deltaList.canonicalCatalogueCheck?.published!==false||deltaList.cards.some((c,i)=>c.number!==String(i+1).padStart(3,'0')||c.printedNumber!==c.number+'/103'||!c.name||typeof c.name!=='string'||c.language!=='en'||c.canonicalCardId!==null||c.canonicalVariantIds?.length))throw Error('Unverified Delta Reign preview list');
const deltaEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deltaArt=JSON.parse(await fs.readFile(path.join(root,'catalogue-staging/delta-reign-artwork-en.json'),'utf8'));
if(deltaArt.language!=='en'||deltaArt.ownershipReady!==false||deltaArt.sharedCatalogueApproval!=='not-confirmed'||deltaArt.assets?.length!==141)throw Error('Unverified Delta Reign preview artwork');
for(const [index,asset]of deltaArt.assets.entries()){
 const card=deltaList.cards[index];
 if(asset.number!==card.number||asset.printedNumber!==card.printedNumber||asset.name.replace(' ♀','♀')!==card.name.replace(' ♀','♀')||asset.language!=='en'||asset.width!==400||asset.height!==558||asset.mediaKey!=='cards/delta-reign-en-'+asset.number+'--'+asset.sha256?.slice(0,12)||!asset.url?.startsWith('https://billsarchive.com/assets/delta-reign/small/me06-'+asset.number+'_')||!asset.file?.startsWith('originals/delta-reign-preview/dlr-en-'+asset.number+'--'))throw Error('Mismatched English preview '+card.number);
 const bytes=await fs.readFile(path.join(root,asset.file));if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Changed English preview '+card.number);
 card.previewImage=mediaImage(asset.url,asset.mediaKey,asset.sha256);
}
const deltaMarkup=[['Main set',deltaList.cards.slice(0,103)],['Secret rares',deltaList.cards.slice(103)]].map(([heading,cards])=>'<div data-delta-group><h3>'+heading+' · '+cards.length+'</h3><ol class="delta-card-list">'+cards.map(c=>'<li data-list-number="'+c.number+'" data-delta-search="'+deltaEscape(c.name+' '+c.printedNumber)+'"><button class="card-tile delta-card" type="button" data-delta-card="'+c.number+'" aria-label="View '+deltaEscape(c.name)+' '+c.printedNumber+'"><span class="card-art"><img src="'+c.previewImage+'" width="400" height="558" alt="'+deltaEscape(c.name)+' · DLR '+c.printedNumber+' · English" loading="lazy" decoding="async"></span><strong>'+deltaEscape(c.name)+'</strong><small>'+c.printedNumber+'</small></button></li>').join('')+'</ol></div>').join('');
const collectionHtml=(await fs.readFile(path.join(src,'collection.html'),'utf8')).replaceAll('__STACKR_LOADING__',()=>stackrLoadingMarkup).replace('__DELTA_REIGN_LIST__',()=>deltaMarkup).replace('__DELTA_REIGN_COVER__','/assets/'+coverRegistry.completeCovers.deltaReign.file).replace('__COLLECTION_CSS__',()=>collectionCss).replace('__COLLECTION_LINKS__',()=>JSON.stringify(setCollectionLinks).replaceAll('<','\\u003c')).replace('__COLLECTION_LOGOS__',()=>JSON.stringify(collectionLogos).replaceAll('<','\\u003c')).replace('__COLLECTION_COVERS__',()=>JSON.stringify(collectionCovers).replaceAll('<','\\u003c')).replace('__COLLECTION_JS__',()=>collectionJs);
await fs.writeFile(path.join(out,'collection.html'),collectionHtml);
await fs.writeFile(path.join(out,'media-sources.json'),JSON.stringify(mediaSources,null,2));
