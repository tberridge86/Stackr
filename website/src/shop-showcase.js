/* Live stock leads the showcase; catalogue previews never imply availability. */
function openingProductQuality(p){
 if(!p||p.imagePending||typeof p.image!=='string'||!/^(?:https:\/\/|\/?assets\/|\/media\/)/.test(p.image)||!/^[a-f0-9]{64}$/.test(p.imageSha256||''))return null;
 const crop=p.imageCutout,bounds=crop?.bounds;
 if(crop&&(crop.sourceSha256!==p.imageSha256||!bounds||crop.sourceWidth!==p.imageWidth||crop.sourceHeight!==p.imageHeight||![bounds.x,bounds.y].every(value=>Number.isFinite(value)&&value>=0)||bounds.x+bounds.width>crop.sourceWidth||bounds.y+bounds.height>crop.sourceHeight))return null;
 const width=bounds?.width??p.imageWidth,height=bounds?.height??p.imageHeight;
 if(![width,height].every(value=>Number.isFinite(value)&&value>0))return null;
 const longEdge=Math.max(width,height);
 if(longEdge<1000&&!(p.imageHDReady===true&&longEdge>=800))return null;
 const gallery=(Array.isArray(p.gallery)?p.gallery:[]).filter(photo=>photo&&photo.id&&photo.label&&/^\/media\/products\/[a-z0-9-]+$/.test(photo.image||'')&&/^[a-f0-9]{64}$/.test(photo.sha256||'')&&[photo.width,photo.height].every(value=>Number.isFinite(value)&&value>0)).length;
 return {longEdge,area:width*height,gallery};
}
function openingProductHasStock(p){const quantity=p&&liveStock(p.id).quantity;return isProductInStock(p)&&Number.isSafeInteger(quantity)&&quantity>0;}
function openingQualityOrder(a,b){return b.quality.longEdge-a.quality.longEdge||b.quality.area-a.quality.area||b.quality.gallery-a.quality.gallery||a.product.id.localeCompare(b.product.id);}
function openingStockUpdated(p){const value=Date.parse(liveStock(p.id).updatedAt);return Number.isFinite(value)?value:0;}
function openingStockCandidates(list=products){
 return list.filter(openingProductHasStock).map(product=>({product,quality:openingProductQuality(product)})).filter(entry=>entry.quality).sort((a,b)=>openingStockUpdated(b.product)-openingStockUpdated(a.product)||openingQualityOrder(a,b)).map(entry=>entry.product);
}
function selectOpeningProduct(list=products){return openingStockCandidates(list)[0]||null;}
function openingProductStockText(p){const quantity=liveStock(p.id).quantity;return Number.isSafeInteger(quantity)&&quantity>0?quantity+' in stock':'In stock';}
const openingShowcase={id:null,mode:null,paused:false,hovered:false,focused:false,pauseIntent:null,failed:new Set(),timer:null,motion:null};
function openingProductPool(list=products){
 const stock=openingStockCandidates(list);
 if(stock.length)return {mode:'stock',items:stock.slice(0,8).filter(p=>!openingShowcase.failed.has(p.id))};
 const released=list.filter(p=>!productIsUpcoming(p)).map(product=>({product,quality:openingProductQuality(product)})).filter(entry=>entry.quality);
 const release=p=>Date.parse(p.releaseDate||(typeof setReleaseDates!=='undefined'&&setReleaseDates[p.setKey]?.releaseDate)||'')||0;
 const opaque=p=>p.imageCutout?.method==='stock-white-canvas-framing'?1:0;
 released.sort((a,b)=>(a.product.language==='English'?0:1)-(b.product.language==='English'?0:1)||opaque(a.product)-opaque(b.product)||release(b.product)-release(a.product)||openingQualityOrder(a,b));
 const picks=[],sets=new Set();
 for(const {product} of released){const key=product.setKey||product.id;if(sets.has(key))continue;sets.add(key);picks.push(product);if(picks.length===8)break;}
 for(const {product} of released){if(picks.length===8)break;if(!picks.includes(product))picks.push(product);}
 // A bounded pool prevents repeated retries through the whole catalogue after image failures.
 return {mode:'preview',items:picks.filter(p=>!openingShowcase.failed.has(p.id))};
}
function openingPoolKey(pool){return JSON.stringify([pool.mode,pool.items.map(p=>[p.id,p.imageSha256,p.image,p.name,p.type,p.language])]);}
function openingPosition(offset,total){return offset===0?'front':offset===1?'right':offset===total-1?'left':'back';}
function openingSlotStyle(offset,total){
 const position=openingPosition(offset,total),[x,y,scale,tilt,z]=({front:[50,60,1,0,30],right:[79,55,.8,3,20],left:[21,55,.8,-3,20],back:[50,54,.62,0,10]})[position];
 // Only the front and its two neighbours are shown. The next photograph is
 // already decoded in the concealed rear position and emerges from there.
 const clip=position==='back'?'inset(50% 50%)':'inset(-24% -24%)';
 return 'left:'+x.toFixed(4)+'%;top:'+y.toFixed(4)+'%;transform:translate(-50%,-50%) scale('+scale.toFixed(4)+') rotate('+tilt.toFixed(4)+'deg);z-index:'+z+';clip-path:'+clip;
}
function openingProductSlideMarkup(p,pool,index){
 const stock=pool.mode==='stock'?openingProductStockText(p):'Catalogue preview · check availability';
 const photos=pool.items.map((item,i)=>{
  const position=openingPosition((i-index+pool.items.length)%pool.items.length,pool.items.length),front=position==='front';
  return '<span class="showcase-orbit-item" data-opening-orbit-item data-opening-position="'+position+'" aria-hidden="'+String(!front)+'" data-opening-photo-id="'+escapeHtml(item.id)+'" style="'+openingSlotStyle((i-index+pool.items.length)%pool.items.length,pool.items.length)+'"><span class="showcase-float"><button class="opening-product-button" type="button" data-product-play data-inspect-photo="'+escapeHtml(item.id)+'" aria-label="Inspect '+escapeHtml(item.name+' '+item.type+' · '+item.language)+' photograph"'+(front?'':' disabled tabindex="-1"')+'><span class="product-tilt" data-product-tilt>'+productPhoto(item,'eager')+'</span></button></span></span>';
 }).join('');
 return '<div class="opening-product-stage floating-product-stage" data-opening-pool="'+escapeHtml(openingPoolKey(pool))+'">'+photos+'</div><div class="opening-product-caption"><strong data-opening-name>'+escapeHtml(p.name)+'</strong><span data-opening-format>'+escapeHtml(p.type+' · '+p.language)+'</span><span class="opening-product-stock" data-opening-stock data-stock-confirmed="'+String(pool.mode==='stock')+'">'+stock+'</span><button class="text-link" type="button" data-opening-link data-quick="'+escapeHtml(p.id)+'">View product '+icon('arrow')+'</button></div>';
}
function openingShowcaseMarkup(content='',initial=false,total=0){
 return '<section class="floating-showcase" aria-roledescription="carousel" aria-label="Featured products"'+(initial?' data-initial-preview="catalogue"':'')+'><p class="showcase-kicker" data-opening-mode>'+(initial?'From the catalogue':'')+'</p><div id="opening-product-slide" data-opening-slide role="group" aria-roledescription="slide">'+content+'</div><div class="showcase-controls"><div class="showcase-paging"><button type="button" data-opening-step="-1" aria-label="Previous product" aria-controls="opening-product-slide"'+(initial?' disabled':'')+'>'+icon('arrow')+'</button><span data-opening-count aria-label="Product position">'+(initial&&total?'1 / '+total:'')+'</span><button type="button" data-opening-step="1" aria-label="Next product" aria-controls="opening-product-slide"'+(initial?' disabled':'')+'>'+icon('arrow')+'</button></div><button class="showcase-pause" type="button" data-opening-pause'+(initial?' disabled':'')+'>Pause slideshow</button></div></section>';
}
function syncOpeningShowcaseControls(){
 const area=get('opening-product');if(!area)return;
 const pool=openingProductPool(),index=pool.items.findIndex(p=>p.id===openingShowcase.id),multiple=pool.items.length>1;
 const pause=area.querySelector('[data-opening-pause]');
 if(pause){pause.disabled=false;pause.hidden=!multiple||openingShowcase.motion?.matches===true;pause.textContent=openingShowcase.paused?'Play slideshow':'Pause slideshow';pause.setAttribute('aria-label',pause.textContent);}
 area.querySelectorAll('[data-opening-step]').forEach(button=>button.disabled=!multiple);
 const count=area.querySelector('[data-opening-count]');if(count)count.textContent=(index+1)+' / '+pool.items.length;
 const slide=area.querySelector('[data-opening-slide]');if(slide){slide.setAttribute('aria-label','Product '+(index+1)+' of '+pool.items.length);slide.setAttribute('aria-live',openingShowcase.paused||openingShowcase.focused||openingShowcase.hovered||openingShowcase.motion?.matches?'polite':'off');}
 area.dataset.slideshowPaused=String(openingShowcase.paused||openingShowcase.focused||openingShowcase.hovered||openingShowcase.motion?.matches);
}
function advanceOpeningShowcase(step=1,manual=false){
 const area=get('opening-product'),pool=openingProductPool();if(!area||pool.items.length<2)return;
 if(!manual&&(openingShowcase.paused||openingShowcase.focused||openingShowcase.hovered||openingShowcase.motion?.matches||document.hidden||document.body.dataset.phoneScreen!=='home'||document.querySelector('dialog[open]')))return;
 if(manual)openingShowcase.paused=true;
 const index=pool.items.findIndex(p=>p.id===openingShowcase.id);
 openingShowcase.id=pool.items[(Math.max(0,index)+step+pool.items.length)%pool.items.length].id;
 area.dataset.openingTurn=step<0?'previous':'next';
 renderOpeningProduct();
}
function initOpeningShowcase(area){
 if(area.dataset.showcaseReady)return;
 area.dataset.showcaseReady='true';
 if(!openingShowcase.motion){openingShowcase.motion=window.matchMedia('(prefers-reduced-motion: reduce)');openingShowcase.paused=openingShowcase.motion.matches;}
 // Keep the server-rendered photographs when the client takes over.
 if(!area.querySelector('[data-opening-slide]'))area.innerHTML=openingShowcaseMarkup();
 if(area.dataset.showcaseBound)return;
 area.dataset.showcaseBound='true';
 area.addEventListener('pointerdown',event=>{if(event.target.closest('[data-opening-pause]'))openingShowcase.pauseIntent=!openingShowcase.paused;});
 area.addEventListener('pointercancel',()=>{openingShowcase.pauseIntent=null;});
 area.addEventListener('click',event=>{
  const step=event.target.closest('[data-opening-step]');if(step){advanceOpeningShowcase(Number(step.dataset.openingStep),true);return;}
  if(event.target.closest('[data-opening-pause]')){openingShowcase.paused=event.detail>0&&openingShowcase.pauseIntent!==null?openingShowcase.pauseIntent:!openingShowcase.paused;openingShowcase.pauseIntent=null;if(!openingShowcase.paused)openingShowcase.focused=false;syncOpeningShowcaseControls();}
 });
 area.addEventListener('mouseenter',()=>{openingShowcase.hovered=true;syncOpeningShowcaseControls();});
 area.addEventListener('mouseleave',()=>{openingShowcase.hovered=false;syncOpeningShowcaseControls();});
 area.addEventListener('focusin',()=>{openingShowcase.focused=true;syncOpeningShowcaseControls();});
 area.addEventListener('focusout',event=>{if(!area.contains?.(event.relatedTarget)){openingShowcase.focused=false;syncOpeningShowcaseControls();}});
 area.addEventListener('error',event=>{
  const id=event.target.closest?.('[data-opening-photo-id]')?.dataset.openingPhotoId;
  if(id&&!openingShowcase.failed.has(id)){openingShowcase.failed.add(id);renderOpeningProduct();}
 },true);
 openingShowcase.motion.addEventListener('change',()=>{if(openingShowcase.motion.matches)openingShowcase.paused=true;syncOpeningShowcaseControls();});
 const start=()=>{clearInterval(openingShowcase.timer);openingShowcase.timer=setInterval(()=>advanceOpeningShowcase(),7000);};
 start();window.addEventListener('pagehide',()=>clearInterval(openingShowcase.timer));window.addEventListener('pageshow',event=>{if(event.persisted)start();});
}
function renderOpeningProduct(){
 const area=get('opening-product');if(!area)return;
 const pool=openingProductPool(),was=openingShowcase.id;area.dataset.openingItems=String(pool.items.length);
 if(!pool.items.length){
  const key=openingShowcase.failed.size?'photos-unavailable':products.some(openingProductHasStock)?'no-qualified-photo':'stock-unconfirmed';
  if(area.dataset.featuredKey!==key)area.innerHTML='<div class="opening-product-empty"><p>'+(key==='photos-unavailable'?'Catalogue photos are temporarily unavailable. Explore the shop below.':key==='no-qualified-photo'?'Browse current stock':'Current stock is being confirmed')+'</p></div>';
  area.dataset.featuredKey=key;delete area.dataset.featuredSha;delete area.dataset.showcaseReady;return;
 }
 initOpeningShowcase(area);
 if(openingShowcase.mode!==pool.mode||!pool.items.some(p=>p.id===was))openingShowcase.id=pool.items[0].id;
 openingShowcase.mode=pool.mode;
 const index=pool.items.findIndex(p=>p.id===openingShowcase.id),p=pool.items[index];
 const key=JSON.stringify([pool.mode,p.id,p.imageSha256,p.image,p.name,p.type,p.language,pool.items.map(item=>[item.id,item.imageSha256])]);
 const stage=area.querySelector('[data-opening-pool]');
 if(!stage||stage.dataset.openingPool!==openingPoolKey(pool))area.querySelector('[data-opening-slide]').innerHTML=openingProductSlideMarkup(p,pool,index);
 // Ordinary turns only change positions. Images, decoded pixels and DOM identity
 // survive every step, including wrapping back to the first product.
 area.querySelectorAll('[data-opening-orbit-item]').forEach(photo=>{
  const itemIndex=pool.items.findIndex(item=>item.id===photo.dataset.openingPhotoId),position=openingPosition((itemIndex-index+pool.items.length)%pool.items.length,pool.items.length),front=position==='front';
  photo.style.cssText=openingSlotStyle((itemIndex-index+pool.items.length)%pool.items.length,pool.items.length);photo.dataset.openingPosition=position;photo.setAttribute('aria-hidden',String(!front));const button=photo.querySelector('button');button.disabled=!front;button.tabIndex=front?0:-1;
 });
 const name=area.querySelector('[data-opening-name]'),format=area.querySelector('[data-opening-format]'),link=area.querySelector('[data-opening-link]');
 if(name)name.textContent=p.name;if(format)format.textContent=p.type+' · '+p.language;if(link)link.dataset.quick=p.id;
 area.dataset.featuredKey=key;area.dataset.featuredSha=p.imageSha256;
 const label=area.querySelector('[data-opening-stock]');if(label)label.textContent=pool.mode==='stock'?openingProductStockText(p):'Catalogue preview · check availability';
 area.querySelector('[data-opening-mode]').textContent=pool.mode==='stock'?'In stock now':'From the catalogue';
 syncOpeningShowcaseControls();
}
