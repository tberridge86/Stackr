/* The same exact set identity and unaltered art used in the catalogue. */
(function initCardViewer(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const dialog=document.createElement('dialog');dialog.id='card-viewer';dialog.className='card-viewer';dialog.setAttribute('aria-labelledby','card-viewer-title');
 dialog.innerHTML='<div class="card-viewer-header"><div><span class="card-viewer-brand">StackR</span><h2 id="card-viewer-title"></h2><p id="card-viewer-set"></p></div><button class="card-viewer-close" aria-label="Close card viewer">'+icon('close')+'</button></div><div class="card-viewer-main"><div class="card-viewer-stage" tabindex="0" role="region" aria-label="Rotate the card by dragging or using the arrow keys. Press Home to reset." aria-describedby="card-viewer-help"><div class="card-surface"></div><span class="card-stage-hint" id="card-viewer-help">Drag to rotate</span></div><aside class="card-viewer-panel"><div class="card-viewer-identity"><span class="section-kicker" id="card-viewer-language"></span><h3 id="card-viewer-name"></h3><p id="card-viewer-number"></p><span id="card-viewer-rarity"></span></div><div class="card-rotation-controls" role="group" aria-label="Card rotation"><button data-card-left aria-label="Rotate card left">'+icon('arrow')+'</button><button data-card-reset>Reset</button><button data-card-right aria-label="Rotate card right">'+icon('arrow')+'</button></div><label class="card-shine-control"><input type="checkbox" switch checked> Surface shine</label><p class="card-effect-note">Display effect. The card’s actual finish may differ.</p><a class="card-source" target="_blank" rel="noreferrer">Original source '+icon('arrow')+'</a></aside></div><div class="card-viewer-footer"><button data-card-previous aria-label="Previous chase card">'+icon('arrow')+'</button><output id="card-viewer-position" aria-live="polite"></output><button data-card-next aria-label="Next chase card">'+icon('arrow')+'</button></div>';
 document.body.append(dialog);
 const stage=dialog.querySelector('.card-viewer-stage'),surface=dialog.querySelector('.card-surface'),shineControl=dialog.querySelector('.card-shine-control input');
 let nativeWidth=600,cardRatio=733/1024,entry=null,index=0,launcher=null,pose={yaw:0,pitch:0,lightX:50,lightY:45},drag=null,frame=0,pendingPoint=null;
 function measure(){
  if(!dialog.open)return;
  const style=getComputedStyle(stage),width=Math.max(1,stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)),height=Math.max(1,stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
  const fit=productGeometry.fit(width,height,cardRatio),fitted=Math.max(1,Math.min(nativeWidth,fit.width,560));
  surface.style.setProperty('--card-fit-width',fitted+'px');
 }
 new ResizeObserver(measure).observe(stage);
 function render(){
  surface.style.setProperty('--card-yaw',pose.yaw+'deg');surface.style.setProperty('--card-pitch',pose.pitch+'deg');
  surface.style.setProperty('--light-x',pose.lightX+'%');surface.style.setProperty('--light-y',pose.lightY+'%');
  surface.style.setProperty('--shine-angle',(110+pose.yaw*1.5)+'deg');surface.dataset.shine=String(shineControl.checked);
  surface.dataset.rotation=Math.round(pose.yaw)+','+Math.round(pose.pitch);
 }
 function reset(){pose={yaw:0,pitch:0,lightX:50,lightY:45};render();}
 function showCard(next){
  if(!entry||!Number.isInteger(next)||next<0||next>=Math.min(3,entry.cards.length))return;
  index=next;const card=entry.cards[index];
  get('card-viewer-title').textContent=card.name;get('card-viewer-name').textContent=card.name;
  get('card-viewer-set').textContent=entry.setName+' · '+entry.language+' · '+card.number;get('card-viewer-language').textContent=entry.language;
  get('card-viewer-number').textContent=card.number;get('card-viewer-rarity').textContent=card.rarity||'';
  dialog.querySelector('.card-effect-note').textContent=card.displayImagePending?(card.imagePendingReason||'A clean image of this exact printing has not been verified.'):(card.imageNotice?card.imageNotice+'. Surface shine is a display effect.':'Display effect. The card’s actual finish may differ.');
  surface.innerHTML=chaseCardArtwork(card,'eager')+'<span class="card-surface-shine" aria-hidden="true"></span>';
  nativeWidth=card.crop?.width||card.imageWidth||600;cardRatio=(card.crop?.width||card.imageWidth||733)/(card.crop?.height||card.imageHeight||1024);surface.style.setProperty('--card-native-width',nativeWidth+'px');surface.style.setProperty('--card-ratio',cardRatio);delete surface.dataset.failed;measure();
  const imagePending=card.displayImagePending||!card.image;
  surface.dataset.failed=String(imagePending);stage.setAttribute('aria-label',imagePending?'Card details. Clean image pending.':'Rotate the card by dragging or using the arrow keys. Press Home to reset.');
  dialog.querySelectorAll('.card-rotation-controls button').forEach(button=>button.disabled=imagePending);shineControl.disabled=imagePending;get('card-viewer-help').textContent=imagePending?'Clean image pending':'Drag to rotate';
  const source=dialog.querySelector('.card-source'),url=card.url||card.sourceUrl||entry.sourceUrls?.[0]||entry.source;
  let sourceUrl='';try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password)sourceUrl=u.href;}catch{}
  source.hidden=!sourceUrl;source.href=sourceUrl||'#';get('card-viewer-position').textContent=String(index+1).padStart(2,'0')+' / '+String(Math.min(3,entry.cards.length)).padStart(2,'0');
  dialog.querySelector('[data-card-previous]').disabled=index===0;dialog.querySelector('[data-card-next]').disabled=index===Math.min(3,entry.cards.length)-1;
  surface.classList.remove('card-intro');reset();measure();
  if(!imagePending&&!reduced.matches)requestAnimationFrame(()=>{if(dialog.open)surface.classList.add('card-intro');});
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-card-set][data-card-id]');if(!button)return;
  const candidate=setHighlights.sets[button.dataset.cardSet],next=candidate?.cards?.findIndex(card=>card.id===button.dataset.cardId);
  if(!candidate||next<0||next===undefined)return;
  launcher=button;entry=candidate;dialog.showModal();showCard(next);stage.focus({preventScroll:true});productFeedback('selection');
 });
 dialog.querySelector('.card-viewer-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);frame=0;pendingPoint=null;drag=null;entry=null;stage.classList.remove('is-dragging');surface.replaceChildren();if(launcher?.isConnected)launcher.focus({preventScroll:true});});
 dialog.querySelector('[data-card-previous]').addEventListener('click',()=>{showCard(index-1);productFeedback('selection');});
 dialog.querySelector('[data-card-next]').addEventListener('click',()=>{showCard(index+1);productFeedback('selection');});
 function rotate(yaw,pitch=0){if(surface.dataset.failed==='true')return;pose=productGeometry.rotateCard(pose,yaw,pitch);render();}
 dialog.querySelector('[data-card-left]').addEventListener('click',()=>{rotate(-15);productFeedback('selection');});
 dialog.querySelector('[data-card-right]').addEventListener('click',()=>{rotate(15);productFeedback('selection');});
 dialog.querySelector('[data-card-reset]').addEventListener('click',()=>{reset();productFeedback('selection');});
 shineControl.addEventListener('change',()=>{render();productFeedback('selection');});
 stage.addEventListener('pointerdown',event=>{
  if(surface.dataset.failed==='true'||event.pointerType==='mouse'&&event.button!==0||drag)return;
  surface.classList.remove('card-intro');pendingPoint=null;drag={id:event.pointerId,x:event.clientX,y:event.clientY,pose:{...pose}};
  stage.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');
 });
 stage.addEventListener('pointermove',event=>{
  if(surface.dataset.failed==='true')return;
  const r=stage.getBoundingClientRect();
  if(drag&&drag.id===event.pointerId){
   pose=productGeometry.rotateCard(drag.pose,(event.clientX-drag.x)/Math.max(1,r.width)*85,-(event.clientY-drag.y)/Math.max(1,r.height)*65);
   pose.lightX=productGeometry.clamp((event.clientX-r.left)/r.width*100,0,100);pose.lightY=productGeometry.clamp((event.clientY-r.top)/r.height*100,0,100);
  }else if(event.pointerType==='mouse'&&!reduced.matches){pendingPoint={x:event.clientX-r.left,y:event.clientY-r.top,width:r.width,height:r.height};}
  else return;
  if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(pendingPoint&&!drag){pose=productGeometry.cardPose(pendingPoint.x,pendingPoint.y,pendingPoint.width,pendingPoint.height);pendingPoint=null;}render();});
 },{passive:true});
 function end(event){if(drag?.id!==event.pointerId)return;drag=null;stage.classList.remove('is-dragging');render();}
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
 stage.addEventListener('pointerleave',()=>{if(!drag&&!reduced.matches)reset();});
 stage.addEventListener('keydown',event=>{
  const moves={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,8],ArrowDown:[0,-8]};
  if(event.key==='Home'){event.preventDefault();reset();}
  else if(moves[event.key]){event.preventDefault();rotate(...moves[event.key]);}
 });
 surface.addEventListener('error',()=>{surface.dataset.failed='true';dialog.querySelectorAll('.card-rotation-controls button').forEach(button=>button.disabled=true);shineControl.disabled=true;get('card-viewer-help').textContent='Image unavailable. Open the original source below.';},true);
 surface.addEventListener('load',()=>{measure();delete surface.dataset.failed;dialog.querySelectorAll('.card-rotation-controls button').forEach(button=>button.disabled=false);shineControl.disabled=false;get('card-viewer-help').textContent='Drag to rotate';},true);
 reduced.addEventListener('change',()=>{cancelAnimationFrame(frame);frame=0;pendingPoint=null;drag=null;stage.classList.remove('is-dragging');surface.classList.remove('card-intro');reset();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dialog.open){cancelAnimationFrame(frame);frame=0;pendingPoint=null;drag=null;stage.classList.remove('is-dragging');surface.classList.remove('card-intro');}});
})();
