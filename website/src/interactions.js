/* Direct manipulation of original product photographs. No synthetic angles. */
function productFeedback(kind='selection',selector){
 document.dispatchEvent(new CustomEvent('stackr-feedback',{detail:{kind,selector}}));
}
function productInspectorViews(p){
 const photos=(Array.isArray(p.gallery)?p.gallery:[]).filter(photo=>photo&&typeof photo.id==='string'&&typeof photo.label==='string'&&/^\/media\/products\/[a-z0-9-]+$/.test(photo.image)&&/^[a-f0-9]{64}$/.test(photo.sha256)&&Number.isSafeInteger(photo.width)&&Number.isSafeInteger(photo.height)&&photo.width>0&&photo.height>0);
 const original=photos.find(photo=>photo.sha256===p.imageSha256),main={id:'main',label:original?.label||'Product',image:p.image,width:p.imageWidth,height:p.imageHeight,sourceUrl:original?.sourceUrl||'',imageCutout:p.imageCutout,imageTone:p.imageTone};
 return [main,...photos.filter(photo=>photo.sha256!==p.imageSha256).map(photo=>({...photo,imageCutout:null,imageTone:null}))];
}
(function initProductInteractions(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
 let haptics=true,lastHaptic=0,lastInput='keyboard';
 try{haptics=localStorage.getItem('stackr-haptics')!=='off';}catch{}
 function haptic(kind){
  if(!haptics||reduced.matches||lastInput!=='touch'||document.hidden||typeof navigator.vibrate!=='function'||performance.now()-lastHaptic<75)return;
  lastHaptic=performance.now();try{navigator.vibrate(kind==='bag'?[18,35,28]:kind==='success'?[12,35,16]:kind==='error'?[24,45,24]:7);}catch{}
 }
 function pulse(element,kind){
  if(!element||reduced.matches||typeof element.animate!=='function')return;
  if(kind==='success'||kind==='bag')element.animate([{transform:'scale(1)'},{transform:'scale(1.07)',offset:.45},{transform:'scale(1)'}],{duration:270,easing:'cubic-bezier(.2,.75,.2,1)'});
 }
 document.addEventListener('stackr-feedback',event=>{
  const {kind,selector}=event.detail;haptic(kind);
  if(selector)document.querySelectorAll(selector).forEach(element=>pulse(element,kind));
 });
 document.addEventListener('pointerdown',event=>{lastInput=event.pointerType;},{passive:true});
 document.addEventListener('keydown',()=>{lastInput='keyboard';},{passive:true});
 document.addEventListener('click',event=>{
  const control=event.target.closest('button,summary');
  if(!control||control.disabled||!event.isTrusted)return;
  if(control.matches('[data-save],[data-add]'))return; // Confirmed outcomes trigger their own feedback.
  if(control.matches('[data-language],[data-category],[data-filter-link],[data-catalogue-view],[data-interest],[data-quick],[data-catalogue-set]>summary,[data-inspect-photo]'))haptic('selection');
 });
 {
  const label=document.createElement('label');label.className='haptics-control';
  label.innerHTML='<input type="checkbox" switch '+(haptics?'checked':'')+'> Touch feedback';
  get('mobile-saved').after(label);
  label.querySelector('input').addEventListener('change',event=>{haptics=event.target.checked;try{localStorage.setItem('stackr-haptics',haptics?'on':'off');}catch{}if(haptics)haptic('selection');});
  const help=document.createElement('button');help.className='haptics-info';help.textContent='About touch feedback';help.addEventListener('click',()=>openInfo('Touch feedback','<p>On supported Android browsers, adding to the demo bag produces a short vibration. Successful actions have visible confirmations on every device.</p><p>iPhone Safari can provide a native tap when you change a switch, including this setting and Surface shine. Ordinary website buttons cannot request custom vibration on iPhone.</p><p>The demo bag does not take payment. A purchase confirmation must come from a live checkout.</p>'));label.after(help);
 }
 const opening=document.querySelector('.brand-opening');
 if(opening){
  opening.addEventListener('pointermove',event=>{if(reduced.matches||!fine.matches)return;const r=opening.getBoundingClientRect();opening.style.setProperty('--brand-drift',((event.clientX-r.left)/r.width-.5)*12+'px');},{passive:true});
  opening.addEventListener('pointerleave',()=>opening.style.removeProperty('--brand-drift'));
  reduced.addEventListener('change',()=>opening.style.removeProperty('--brand-drift'));
 }

 const dialog=document.createElement('dialog');dialog.id='photo-inspector';dialog.className='photo-inspector';dialog.setAttribute('aria-labelledby','inspector-title');
 dialog.innerHTML='<div class="inspector-header"><div><span class="section-kicker">Product photographs</span><h2 id="inspector-title"></h2><p id="inspector-edition"></p></div><button class="inspector-close" aria-label="Close photograph">'+icon('close')+'</button></div><div class="inspector-viewport" tabindex="0" role="region" aria-label="Product photograph. Use plus and minus to zoom, and arrow keys to pan." aria-describedby="inspector-help inspector-status"><div class="inspector-object"></div></div><div class="inspector-bottom"><div class="inspector-views" role="group" aria-label="Product views" hidden></div><div class="inspector-photo-state"><p id="inspector-status" role="status"></p><button data-inspector-retry hidden>Retry photograph</button><a class="inspector-source" target="_blank" rel="noopener noreferrer" hidden>Original source '+icon('arrow')+'</a></div><div class="inspector-footer"><p id="inspector-help">Pinch or use + to zoom. Drag the enlarged photograph.</p><div class="inspector-controls" role="group" aria-label="Photograph zoom"><button data-zoom-out aria-label="Zoom out">-</button><output id="inspector-zoom" aria-live="polite">100%</output><button data-zoom-in aria-label="Zoom in">+</button><button data-zoom-reset>Reset</button></div></div></div>';
 document.body.append(dialog);
 const viewport=dialog.querySelector('.inspector-viewport'),object=dialog.querySelector('.inspector-object'),zoomOut=dialog.querySelector('[data-zoom-out]'),zoomIn=dialog.querySelector('[data-zoom-in]'),viewChoices=dialog.querySelector('.inspector-views'),photoStatus=get('inspector-status'),photoSource=dialog.querySelector('.inspector-source'),retry=dialog.querySelector('[data-inspector-retry]'),zoomControls=dialog.querySelector('.inspector-controls');
 let view={scale:1,x:0,y:0},bounds={width:1,height:1,photoWidth:1,photoHeight:1},launcher=null,drag=null,dragged=false,product=null,photos=[],selected=null,displayed=null,photoReady=false,maxZoom=4,loadToken=0,pendingImage=null;
 const pointers=new Map(),rememberedViews=new Map();
 function render(){
  view.scale=productGeometry.clamp(view.scale,1,maxZoom);
  view=productGeometry.constrain(view,bounds);
  object.style.transform='translate3d('+view.x+'px,'+view.y+'px,0) scale('+view.scale+')';
  viewport.dataset.zoomed=String(view.scale>1);get('inspector-zoom').textContent=Math.round(view.scale*100)+'%';
  zoomOut.disabled=!photoReady||view.scale<=1;zoomIn.disabled=!photoReady||view.scale>=maxZoom-.001;
  dialog.querySelector('[data-zoom-reset]').disabled=!photoReady||view.scale===1&&view.x===0&&view.y===0;
 }
 function measure(){
  if(!dialog.open||!displayed)return;
  const svg=object.querySelector('svg.product-cutout'),img=object.querySelector('img');
  const ratio=svg?svg.viewBox.baseVal.width/svg.viewBox.baseVal.height:img?.naturalWidth/img?.naturalHeight||displayed.width/displayed.height||1;
  bounds.width=viewport.clientWidth;bounds.height=viewport.clientHeight;
  const fit=productGeometry.fit(Math.max(1,bounds.width-64),Math.max(1,bounds.height-64),ratio);
  const crop=displayed.imageCutout,nativeWidth=crop?crop.bounds.width+Math.max(crop.bounds.width,crop.bounds.height)*.03:displayed.width||img?.naturalWidth||fit.width;
  if(fit.width>nativeWidth){fit.height*=nativeWidth/fit.width;fit.width=nativeWidth;}
  maxZoom=Math.max(1,Math.min(4,nativeWidth/Math.max(1,fit.width)));
  bounds.photoWidth=fit.width;bounds.photoHeight=fit.height;object.style.width=fit.width+'px';object.style.height=fit.height+'px';render();
 }
 function setZoom(next,anchor={x:0,y:0}){if(!photoReady)return;view=productGeometry.zoomAt(view,productGeometry.clamp(next,1,maxZoom),anchor,bounds);render();}
 function centerPoint(event){const rect=viewport.getBoundingClientRect();return {x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2};}
 function sourceLink(photo){
  let url;try{url=new URL(photo.sourceUrl);if(url.protocol!=='https:'||url.username||url.password)url=null;}catch{}
  photoSource.hidden=!url;if(url)photoSource.href=url.href;else photoSource.removeAttribute('href');
 }
 function failedPhoto(){
  photoReady=!!displayed;viewport.setAttribute('aria-busy','false');delete viewport.dataset.loading;retry.hidden=false;zoomControls.hidden=!photoReady;
  photoStatus.textContent=selected.label+' could not load.'+(displayed?' Showing '+displayed.label.toLowerCase()+'.':' Choose another view or retry.');
  if(!displayed)object.innerHTML='<span class="photo-unavailable">'+icon('box')+'<span>Photograph unavailable</span></span>';
  render();
 }
 function selectPhoto(id){
  const photo=photos.find(item=>item.id===id);if(!photo)return;
  selected=photo;rememberedViews.set(product.id,id);pointers.clear();drag=null;viewport.classList.remove('is-dragging');photoReady=false;retry.hidden=true;
  viewChoices.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inspectorView===id)));
  sourceLink(photo);photoStatus.textContent='Loading '+photo.label.toLowerCase()+'…';viewport.setAttribute('aria-busy','true');viewport.dataset.loading='true';render();
  if(pendingImage){pendingImage.onload=null;pendingImage.onerror=null;}
  const token=++loadToken,image=new Image();pendingImage=image;
  image.onload=()=>{
   if(token!==loadToken||!dialog.open)return;
   pendingImage=null;displayed=photo;photoReady=true;view={scale:1,x:0,y:0};
   object.innerHTML=productPhoto({...product,image:photo.image,imageCutout:photo.imageCutout,imageTone:photo.imageTone},'eager');
   const img=object.querySelector('img');if(img)img.alt=product.name+' '+product.type+' · '+product.language+' — '+photo.label;
   viewport.setAttribute('aria-busy','false');delete viewport.dataset.loading;zoomControls.hidden=false;photoStatus.textContent=photo.label;measure();
  };
  image.onerror=()=>{if(token!==loadToken||!dialog.open)return;pendingImage=null;failedPhoto();};
  image.src=photo.image;
 }
 function open(id,button){
  const p=byId(id);if(!p?.image||p.imagePending)return;
  launcher=button;product=p;photos=productInspectorViews(p);displayed=null;photoReady=false;maxZoom=4;view={scale:1,x:0,y:0};pointers.clear();drag=null;object.innerHTML='';object.style.width='100%';object.style.height='100%';zoomControls.hidden=false;
  get('inspector-title').textContent=p.name;get('inspector-edition').textContent=p.type+' · '+p.language;
  viewChoices.hidden=photos.length<2;viewChoices.innerHTML=photos.map(photo=>'<button data-inspector-view="'+escapeHtml(photo.id)+'" aria-pressed="false">'+escapeHtml(photo.label)+'</button>').join('');
  dialog.showModal();selectPhoto(photos.find(photo=>photo.id===rememberedViews.get(p.id))?.id||'main');viewport.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-inspect-photo]');if(button&&!button.disabled)open(button.dataset.inspectPhoto,button);});
 dialog.querySelector('.inspector-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{loadToken++;if(pendingImage){pendingImage.onload=null;pendingImage.onerror=null;pendingImage=null;}pointers.clear();drag=null;object.innerHTML='';displayed=null;photoReady=false;if(launcher?.isConnected)launcher.focus({preventScroll:true});});
 viewChoices.addEventListener('click',event=>{const button=event.target.closest('[data-inspector-view]');if(button&&button.dataset.inspectorView!==selected?.id){selectPhoto(button.dataset.inspectorView);haptic('selection');}});
 retry.addEventListener('click',()=>{if(selected)selectPhoto(selected.id);});
 object.addEventListener('load',measure,true);
 object.addEventListener('error',()=>{if(viewport.dataset.loading==='true')return;displayed=null;failedPhoto();},{capture:true});
 new ResizeObserver(measure).observe(viewport);
 zoomIn.addEventListener('click',()=>{setZoom(view.scale+.5);haptic('selection');});
 zoomOut.addEventListener('click',()=>{setZoom(view.scale-.5);haptic('selection');});
 dialog.querySelector('[data-zoom-reset]').addEventListener('click',()=>{view={scale:1,x:0,y:0};render();haptic('selection');});
 viewport.addEventListener('wheel',event=>{event.preventDefault();setZoom(view.scale*Math.exp(-productGeometry.clamp(event.deltaY,-100,100)*.0025),centerPoint(event));},{passive:false});
 viewport.addEventListener('dblclick',event=>{event.preventDefault();if(!dragged)setZoom(view.scale>1?1:2,centerPoint(event));});
 function gesture(){
  const values=[...pointers.values()];
  if(values.length>=2){const a=values[0],b=values[1];return {point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(a.x-b.x,a.y-b.y)};}
  return {point:values[0],distance:0};
 }
 function beginGesture(){if(!pointers.size){drag=null;return;}const current=gesture();drag={...current,view:{...view}};}
 viewport.addEventListener('pointerdown',event=>{
  if(!photoReady||event.pointerType==='mouse'&&event.button!==0)return;
  dragged=false;pointers.set(event.pointerId,centerPoint(event));viewport.setPointerCapture(event.pointerId);beginGesture();viewport.classList.add('is-dragging');
 });
 viewport.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!drag)return;
  pointers.set(event.pointerId,centerPoint(event));const current=gesture();
  const dx=current.point.x-drag.point.x,dy=current.point.y-drag.point.y;
  if(Math.abs(dx)+Math.abs(dy)>4)dragged=true;
  if(current.distance&&drag.distance){
   const scale=productGeometry.clamp(drag.view.scale*current.distance/Math.max(1,drag.distance),1,maxZoom),ratio=scale/drag.view.scale;
   view=productGeometry.constrain({scale,x:current.point.x-(drag.point.x-drag.view.x)*ratio,y:current.point.y-(drag.point.y-drag.view.y)*ratio},bounds);render();
  }else if(view.scale>1){view={...view,x:drag.view.x+dx,y:drag.view.y+dy};render();}
 });
 function endGesture(event){pointers.delete(event.pointerId);beginGesture();if(!pointers.size){viewport.classList.remove('is-dragging');render();}}
 viewport.addEventListener('pointerup',endGesture);viewport.addEventListener('pointercancel',endGesture);viewport.addEventListener('lostpointercapture',endGesture);
 viewport.addEventListener('keydown',event=>{
  if(!photoReady)return;
  if(['+','=','-','0','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();else return;
  if(event.key==='+'||event.key==='=')setZoom(view.scale+.5);
  else if(event.key==='-')setZoom(view.scale-.5);
  else if(event.key==='0'||event.key==='Home'){view={scale:1,x:0,y:0};render();}
  else {const step=event.shiftKey?100:35;view.x+=event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0;view.y+=event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0;render();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pointers.clear();drag=null;viewport.classList.remove('is-dragging');}});
 // Disable inspection when a supplier image fails, without hiding the product details.
 document.addEventListener('error',event=>{
  if(!event.target.hasAttribute?.('data-product-photo'))return;
  const button=event.target.closest('.inspection-launch,.opening-product-button');if(button){button.disabled=true;const hint=button.querySelector('.inspect-hint,.opening-inspect-label');if(hint)hint.hidden=true;}
 },true);
})();
