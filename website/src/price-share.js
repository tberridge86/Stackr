/* A dated, user-initiated image export of the same validated live quote. */
let activePriceCard=null;
const quoteSignature=q=>JSON.stringify([q.productId,q.marketPence,q.shopPence,q.asOf,q.observedAt,q.selectedSourceId,q.priceOverride?.revision]);
function priceShareButton(p){return '<button class="share-price-button" data-price-card="'+p.id+'" '+(!currentQuote(p)?'disabled hidden':'')+'>'+(!currentQuote(p)?'Price card · awaiting reference':'Share a price comparison')+icon('arrow')+'</button>';}
function syncPriceCardAvailability(){
 document.querySelectorAll('[data-price-card]').forEach(button=>{const available=!!currentQuote(byId(button.dataset.priceCard));button.disabled=!available;button.hidden=!available;button.innerHTML=(available?'Share a price comparison':'Price card · awaiting reference')+icon('arrow');});
 if(activePriceCard){const q=currentQuote(byId(activePriceCard.id));if(!q||quoteSignature(q)!==activePriceCard.signature){activePriceCard=null;if(get('price-share-status'))get('price-share-status').textContent='The reference changed or expired. Reopen the comparison for the current price.';document.querySelectorAll('[data-download-price-card],[data-native-share-price-card]').forEach(button=>{button.disabled=true;});}}
}
function canvasImage(source){return new Promise((resolve,reject)=>{const image=new Image(),timer=setTimeout(()=>reject(Error('Image timed out')),12000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(Error('Image unavailable'));};image.src=source;});}
function cardText(ctx,text,x,y,width,size,lineHeight,maxLines=3){
 ctx.font='600 '+size+'px Inter, Arial, sans-serif';const words=String(text).split(/\s+/),lines=[];let line='';
 for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>width&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);
 if(lines.length>maxLines)return cardText(ctx,text,x,y,width,size-3,lineHeight-3,maxLines);
 lines.forEach((value,index)=>ctx.fillText(value,x,y+lineHeight*index));return y+lineHeight*lines.length;
}
function containedImage(ctx,image,x,y,w,h,bounds){const b=bounds||{x:0,y:0,width:image.naturalWidth,height:image.naturalHeight},scale=Math.min(w/b.width,h/b.height),dw=b.width*scale,dh=b.height*scale;ctx.drawImage(image,b.x,b.y,b.width,b.height,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}
async function renderPriceCard(canvas,p,q){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export is unavailable');
 await document.fonts.ready;
 const logo=await canvasImage(document.querySelector('.brand-wordmark').src);
 const product=p.image&&!p.imagePending?await canvasImage(p.image):null;
 canvas.width=1080;canvas.height=1350;ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);
 const ink='#07145f',purple='#6938f5',muted='#62677b';
 containedImage(ctx,logo,64,42,260,76);ctx.fillStyle=ink;ctx.font='500 22px Inter, Arial';ctx.textAlign='right';ctx.fillText('THE CARD SHOP',1016,88);ctx.textAlign='left';
 ctx.fillStyle=purple;ctx.fillRect(64,154,952,4);
 if(product)containedImage(ctx,product,64,196,420,440,p.imageCutout?.bounds);
 else{const mark=await canvasImage(document.querySelector('.brand-mark').src);containedImage(ctx,mark,114,216,320,340);ctx.fillStyle=muted;ctx.font='400 24px Inter, Arial';ctx.fillText('Product photo pending',114,606);}
 ctx.fillStyle=purple;ctx.font='500 22px Inter, Arial';ctx.fillText(p.language.toUpperCase(),540,230);
 ctx.fillStyle=ink;const end=cardText(ctx,p.name,540,295,476,56,65,4);
 ctx.fillStyle=muted;ctx.font='400 28px Inter, Arial';ctx.fillText(p.type,540,end+12);ctx.fillText(packText(p)+(p.cardsPerPack?' · '+p.cardsPerPack+' cards / pack':''),540,end+55);
 ctx.fillStyle=ink;ctx.font='600 38px Inter, Arial';ctx.fillText('StackR price comparison',64,710);
 ctx.fillStyle=purple;ctx.font='500 24px Inter, Arial';ctx.fillText('STACKR PRICE',64,772);ctx.font='600 92px Inter, Arial';ctx.fillText(money(q.shopPence/100),64,875);
 ctx.fillStyle=ink;ctx.font='500 24px Inter, Arial';ctx.fillText('SAVE '+money(q.savingsPence/100),650,782);ctx.fillStyle=muted;ctx.font='400 24px Inter, Arial';ctx.fillText('Against the reference below',650,823);
 const axisMax=Math.ceil(q.marketPence/1000)*1000,barWidth=850;
 const rows=[{label:priceReferenceLabel(q),value:q.marketPence,y:946,color:'#a8abc0'},{label:'StackR',value:q.shopPence,y:1053,color:purple}];
 for(const row of rows){ctx.fillStyle=ink;ctx.font='500 25px Inter, Arial';ctx.fillText(row.label,64,row.y);ctx.textAlign='right';ctx.fillText(money(row.value/100),1016,row.y);ctx.textAlign='left';ctx.fillStyle='#f1f0f7';ctx.fillRect(64,row.y+18,barWidth,28);ctx.fillStyle=row.color;ctx.fillRect(64,row.y+18,barWidth*row.value/axisMax,28);}
 ctx.strokeStyle='#d9dbe4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(64,1124);ctx.lineTo(914,1124);ctx.stroke();ctx.fillStyle=muted;ctx.font='400 20px Inter, Arial';ctx.fillText('£0',64,1154);ctx.textAlign='right';ctx.fillText(money(axisMax/100),914,1154);ctx.textAlign='left';
 const stamp=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(q.asOf));
 const source=q.sources.find(s=>s.id===q.selectedSourceId);
 ctx.fillStyle=ink;ctx.font='500 22px Inter, Arial';ctx.fillText('Checked '+stamp+' · UK time',64,1210);
 ctx.fillStyle=muted;ctx.font='400 20px Inter, Arial';const label=q.priceOverride?.basis==='owner'?'Owner-entered reference · not independently verified':(source?.name||'Retail reference')+' · '+q.currentSourceCount+' retailer'+(q.currentSourceCount===1?' (indicative)':'s checked');ctx.fillText(label,64,1247,952);
 ctx.fillText(q.priceOverride?.basis==='owner'?'Owner-entered product reference; see the shop for its dated source.':'Exact product, language and unit. VAT included; delivery excluded.',64,1280);
 ctx.fillText(q.priceOverride?.basis==='owner'?'Dated owner reference. Not independently verified.':'Dated asking-price comparison. Shop preview; orders not open.',64,1313);
 return {stamp,source:q.priceOverride?.basis==='owner'?'Owner-entered reference (not independently verified)':source?.name||'Retail reference',axisMax,marketBar:barWidth*q.marketPence/axisMax,shopBar:barWidth*q.shopPence/axisMax};
}
async function showPriceCard(id){
 const p=byId(id),q=currentQuote(p);if(!p||!q){toast('A current reference is needed to share this price.');return;}
 activePriceCard=null;
 openInfo('Share your price comparison','<p class="price-share-note">A dated image of this exact product and its current retail reference. Share it or save it as a PNG.</p><canvas id="price-share-canvas" class="price-share-preview" width="1080" height="1350" aria-label="Preparing price comparison"></canvas><p id="price-share-status" class="price-share-note" role="status">Preparing your image…</p><div class="price-share-actions"><button class="primary" data-download-price-card disabled>Download PNG</button><button class="text-link" data-native-share-price-card hidden disabled>Share image '+icon('arrow')+'</button></div>');
 const canvas=get('price-share-canvas'),generation=infoViewGeneration;
 try{
  const details=await renderPriceCard(canvas,p,q);
  if(generation!==infoViewGeneration||!canvas.isConnected||!get('info-dialog').open)return;
  const current=currentQuote(p);if(!current||quoteSignature(current)!==quoteSignature(q))throw Error('The reference changed. Reopen this card for the latest price.');
  const description=p.name+' '+p.type+' · '+p.language+'. StackR '+money(q.shopPence/100)+'; '+priceReferenceLabel(q)+' '+money(q.marketPence/100)+'. Save '+money(q.savingsPence/100)+' (10%). Checked '+details.stamp+'. '+details.source+'.';
  canvas.setAttribute('aria-label',description);get('price-share-status').textContent=description;
  activePriceCard={id,signature:quoteSignature(q),canvas,details};
  document.querySelector('[data-download-price-card]').disabled=false;
  const native=document.querySelector('[data-native-share-price-card]');native.hidden=typeof navigator.share!=='function';native.disabled=false;
 }catch(error){if(generation===infoViewGeneration&&get('price-share-status')){canvas.hidden=true;get('price-share-status').textContent=error.message==='Image unavailable'?'The product image could not load. Reopen the comparison to try again.':error.message;}}
}
async function exportPriceCard(native=false){
 const card=activePriceCard,p=card&&byId(card.id),q=currentQuote(p);
 if(!card||!q||quoteSignature(q)!==card.signature){activePriceCard=null;toast('This reference has changed or expired. Reopen the price comparison.');return;}
 const blob=await new Promise(resolve=>card.canvas.toBlob(resolve,'image/png'));if(!blob){toast('The image could not be saved.');return;}
 const current=currentQuote(p);if(!current||quoteSignature(current)!==card.signature){toast('This price expired. Reopen the comparison.');return;}
 const file=new File([blob],'StackR-'+p.id+'-'+new Date(q.asOf).toISOString().slice(0,10)+'.png',{type:'image/png'});
 if(native&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return;}catch(error){if(error.name==='AbortError')return;toast('Sharing is unavailable here. Use Download PNG.');return;}}
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.priceCard)showPriceCard(button.dataset.priceCard);else if(button.hasAttribute('data-download-price-card'))exportPriceCard();else if(button.hasAttribute('data-native-share-price-card'))exportPriceCard(true);});
get('info-dialog').addEventListener('close',()=>{activePriceCard=null;});
