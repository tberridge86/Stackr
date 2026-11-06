/* Catalogue discovery, product contents and a transparent inventory board. */
function productPhoto(p,loading='lazy'){
 if(!p.image||p.imagePending)return '<span class="photo-unavailable photo-pending">'+icon('box')+'<span>Product photo coming soon</span><small>'+escapeHtml(p.language)+'</small></span>';
 const alt=escapeHtml(p.name+' '+p.type+' · '+p.language),cutout=p.imageCutout;
 let picture;
 if(cutout){
  const b=cutout.bounds,pad=Math.max(b.width,b.height)*.015;
  productPhoto.cutoutSerial=(productPhoto.cutoutSerial||0)+1;
  const clip='product-clip-'+productPhoto.cutoutSerial;
  const tone=p.imageTone,filter='photo-tone-'+productPhoto.cutoutSerial;
  const toneDef=tone?'<filter id="'+filter+'" filterUnits="userSpaceOnUse" x="'+b.x+'" y="'+b.y+'" width="'+b.width+'" height="'+b.height+'" color-interpolation-filters="sRGB"><feComponentTransfer>'+['R','G','B'].map(channel=>'<feFunc'+channel+' type="gamma" amplitude="1" exponent="'+tone.gamma+'" offset="0"/>').join('')+'</feComponentTransfer></filter>':'';
  const shape=cutout.outlinePath?'<path d="'+escapeHtml(cutout.outlinePath)+'" fill="white" stroke="none"/>':'<polygon points="'+cutout.polygon.map(point=>point.join(',')).join(' ')+'" fill="white" stroke="none"/>';
  picture='<svg class="product-cutout" data-photo-frame="'+(cutout.method==='stock-white-canvas-framing'?'opaque':'alpha')+'" role="img" aria-label="'+alt+'" viewBox="'+[b.x-pad,b.y-pad,b.width+pad*2,b.height+pad*2].join(' ')+'" preserveAspectRatio="xMidYMid meet"><title>'+alt+'</title><defs><clipPath id="'+clip+'" clipPathUnits="userSpaceOnUse">'+shape+'</clipPath>'+toneDef+'</defs><image data-product-photo '+(loading==='eager'?'href':'data-cutout-src')+'="'+escapeHtml(p.image)+'" x="0" y="0" width="'+cutout.sourceWidth+'" height="'+cutout.sourceHeight+'" clip-path="url(#'+clip+')"'+(tone?' filter="url(#'+filter+')"':'')+'/></svg>';
 }else picture='<img data-product-photo src="'+escapeHtml(p.image)+'" alt="'+alt+'" loading="'+loading+'" width="700" height="700">';
 return picture+'<span class="photo-unavailable" hidden>'+icon('box')+'<span>Product photo unavailable</span><small>'+escapeHtml(p.name)+' · '+escapeHtml(p.language)+'</small></span>';
}
function initProductCutouts(){
 const watched=new Set();let scheduled=false;
 const load=image=>{const source=image.getAttribute('data-cutout-src')||image.getAttribute('data-svg-src');if(source){image.setAttribute('href',source);image.removeAttribute('data-cutout-src');image.removeAttribute('data-svg-src');}};
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const image=entry.target.querySelector('image[data-cutout-src],image[data-svg-src]');if(image)load(image);observer.unobserve(entry.target);watched.delete(entry.target);}},{rootMargin:'250px'}):null;
 const scan=()=>{scheduled=false;for(const stage of watched)if(!stage.isConnected){observer.unobserve(stage);watched.delete(stage);}document.querySelectorAll('image[data-cutout-src],image[data-svg-src]').forEach(image=>{const stage=image.closest('svg.product-cutout,svg[data-lazy-svg]');if(!observer||!stage)load(image);else if(!watched.has(stage)){watched.add(stage);observer.observe(stage);}});};
 new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(scan);}}).observe(document.body,{childList:true,subtree:true});
 scan();
}
function saveButton(p,saved){
 return '<button class="save-product '+(saved?'is-saved':'')+'" data-save="'+p.id+'" aria-pressed="'+saved+'" aria-label="'+(saved?'Unsave ':'Save ')+escapeHtml(p.name+' '+p.type+' '+p.language)+'">'+icon('heart')+'<span data-save-label>'+(saved?'Saved':'Save')+'</span></button>';
}
function syncSaveButtons(){
 document.querySelectorAll('[data-save]').forEach(button=>{
  const saved=state.saved.includes(button.dataset.save),p=byId(button.dataset.save);
  button.setAttribute('aria-pressed',String(saved));button.classList.toggle('is-saved',saved);
  button.querySelector('[data-save-label]').textContent=saved?'Saved':'Save';
  button.setAttribute('aria-label',(saved?'Unsave ':'Save ')+p.name+' '+p.type+' '+p.language);
 });
}
function stockLabel(id){const p=byId(id),item=liveStock(id);return !shopReady?'Availability to be confirmed':stockStatus(p)==='out_of_stock'?'Out of stock':isProductInStock(p)?(item.quantity===null?'In stock':item.quantity+' in stock'):'Availability to be confirmed';}
function cartMaximum(id){const p=byId(id);if(!isProductInStock(p)||!currentQuote(p))return 0;const n=liveStock(id).quantity;return Math.min(customerLimit,n===null?customerLimit:n);}
function pricePair(p){
 const q=currentQuote(p);
 if(!q)return '<div class="price-pair is-unpriced" data-pricing-for="'+p.id+'"><button class="unpriced-evidence" data-price-evidence="'+p.id+'" aria-label="Why a price is not yet confirmed for '+escapeHtml(p.name+' '+p.type+' '+p.language)+'">Price to be confirmed '+icon('arrow')+'</button></div>';
 return '<div class="price-pair" data-pricing-for="'+p.id+'"><div class="product-price"><span class="price-label">StackR</span><strong class="price">'+money(q.shopPence/100)+'</strong></div><button class="market-compare" data-price-evidence="'+p.id+'" aria-label="View dated '+priceReferenceLabel(q)+' for '+escapeHtml(p.name+' '+p.type+' '+p.language)+'"><span>'+priceReferenceLabel(q)+'</span><strong>'+money(q.marketPence/100)+'</strong><small>Checked '+priceStamp(q)+'</small></button><small class="saving-label">10% lower · save '+money(q.savingsPence/100)+'</small></div>';
}
function showPriceEvidence(id){
 const p=byId(id);if(!p)return;const q=currentQuote(p),historical=priceFeed?.products?.[id];
 let body='<p><strong>'+escapeHtml(p.name+' · '+p.type+' · '+p.language)+'</strong></p>';
 if(q?.priceOverride?.basis==='owner'){
  body+='<dl class="info-facts"><dt>Owner-entered reference</dt><dd>'+money(q.marketPence/100)+'</dd><dt>StackR price</dt><dd>'+money(q.shopPence/100)+'</dd><dt>Saving against this reference</dt><dd>10% · '+money(q.savingsPence/100)+'</dd><dt>Reference checked</dt><dd>'+priceStamp(q)+'</dd><dt>Reference supplied</dt><dd>'+escapeHtml(q.priceOverride.source)+'</dd></dl>';
  body+='<p>This reference was entered by the shop owner. It has not been independently checked by the pricing feed and is not a verified market value or RRP. It expires seven days after its recorded check date.</p>';
  const feed=q.feedReference;
  if(feed?.sources?.some(source=>source.status==='current'))body+='<h3>Separate configured retail evidence</h3>'+feed.sources.filter(source=>currentSource(source)&&source.url?.startsWith('https://')).map(source=>'<a class="reference-source" href="'+escapeHtml(source.url)+'" target="_blank" rel="noreferrer">'+escapeHtml(source.name)+' · '+money(source.marketPence/100)+' · checked '+priceStamp(source)+' '+icon('arrow')+'</a>').join('');
 }else if(q){
  body+='<dl class="info-facts"><dt>UK retail reference</dt><dd>'+money(q.marketPence/100)+'</dd><dt>StackR price</dt><dd>'+money(q.shopPence/100)+'</dd><dt>Saving</dt><dd>10% · '+money(q.savingsPence/100)+'</dd><dt>Reference checked</dt><dd>'+priceStamp(q)+'</dd><dt>Next weekly check</dt><dd>'+(priceNextCheck()||'Pending')+'</dd><dt>Coverage</dt><dd>'+escapeHtml(q.currentSourceCount)+' retailer'+(q.currentSourceCount===1?' · indicative':'s')+'</dd></dl>';
  body+='<p>Lowest exact in-stock UK retail asking price among the sources checked. VAT included; delivery excluded. One retailer gives an indicative reference, not a market-wide valuation.</p>';
  if(q.sources.some(source=>source.error))body+='<p>A source could not be checked in the latest update. Its previous dated reference remains available until it expires.</p>';
  body+=q.sources.filter(source=>source.status==='current'&&source.url?.startsWith('https://')).map(source=>'<a class="reference-source" href="'+escapeHtml(source.url)+'" target="_blank" rel="noreferrer">'+escapeHtml(source.name)+' · '+money(source.marketPence/100)+' · checked '+priceStamp(source)+' '+icon('arrow')+'</a>').join('');
 }else{
  body+='<p>A current reference is not available for this exact product, language and retail unit. No current price or saving is claimed.</p>';
  const configured=priceSourceIdentities[p.id]||[],past=(historical?.sources||[]).filter(source=>source&&source.currency==='GBP'&&Number.isSafeInteger(source.marketPence)&&source.marketPence>0&&priceTimestamp(source.asOf||source.observedAt)!==null&&configured.some(item=>item.id===source.id&&item.url===source.url&&item.name===source.name));
  if(past.length)body+='<h3>Previous retail references</h3><p>Historical records only. These do not set a current StackR price.</p>'+past.map(source=>'<a class="reference-source" href="'+escapeHtml(source.url)+'" target="_blank" rel="noreferrer">'+escapeHtml(source.name)+' · '+money(source.marketPence/100)+' · checked '+priceStamp(source)+' '+icon('arrow')+'</a>').join('');
 }
 openInfo('How your price is calculated',body+'<p>StackR price = 90% of the dated reference, rounded to the nearest penny. A reference expires after seven days; publishing a price does not renew its check date.</p><p>Completed-sale data is not connected. No last-sold value is claimed.</p>');
}
function setLanguage(value){
 if(value!=='all'&&!languageDefinitions[value])return;
 language=value;
 const entry=setEntries.find(item=>item.key===setKey);
 if(entry?.language&&value!=='all'&&entry.language!==value)setKey='all';
 if(setKey==='collections'&&value!=='all'&&value!=='English')setKey='all';
 renderSetNavigation();renderProducts();
 const first=products.find(p=>matchesLanguage(p)&&matchesSet(p,setKey));if(first)renderFeature(first);
}
function showCatalogue(){
 closeSearchSuggestions();
 get('search-box').classList.remove('open');
 get('search-toggle').setAttribute('aria-expanded','false');
 get('search').blur();
 history.replaceState({...history.state,stackrProduct:null,stackrProductEntry:false},'','#shop');
 get('shop').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 get('shop-title').setAttribute('tabindex','-1');
 get('shop-title').focus({preventScroll:true});
}
function closeSearchSuggestions(){get('search-suggestions').hidden=true;get('search').setAttribute('aria-expanded','false');}
function renderSearchSuggestions(count,list=[]){
 const panel=get('search-suggestions');
 const value=browseContext.normalise(query);
 if(!value||!get('search-box').contains(document.activeElement)){closeSearchSuggestions();return;}
 const matches=setEntries.filter(entry=>!['all','collections'].includes(entry.key)&&(language==='all'||entry.language===language)).map(entry=>({entry,rank:browseContext.rank(entry,value)})).filter(item=>item.rank!==null).sort((a,b)=>a.rank-b.rank).slice(0,2).map(item=>item.entry);
 const direct=list.slice().sort((a,b)=>productSearchRank(a)-productSearchRank(b)).slice(0,3);
 panel.innerHTML='<p class="search-feedback" role="status">'+count+' '+(count===1?'product':'products')+' found</p>'+
 (direct.some(p=>productSearchRank(p)>=6)?'<p class="search-empty">Close spellings are included. Check the exact set and language below.</p>':'')+
 direct.map(p=>'<button class="search-product-result" data-quick="'+p.id+'"><span><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.type+' · '+p.language+(p.edition&&p.edition!=='standard'?' · '+p.edition:''))+'</small></span>'+icon('arrow')+'</button>').join('')+
 matches.map(entry=>'<button class="search-set-result" data-search-set="'+entry.key+'">'+setMark(entry)+'<span><strong>'+escapeHtml(entry.name)+'</strong><small>'+entry.count+' products in this set</small></span>'+icon('arrow')+'</button>').join('')+
 (count?'<button class="search-all-results" data-search-submit>View all '+count+' results '+icon('arrow')+'</button>':'<p class="search-empty">Try a set name such as “Prismatic”, or a format such as “ETB”.</p>');
 panel.hidden=false;get('search').setAttribute('aria-expanded','true');
}
function contentsIcon(kind){
 const shapes={
  packs:'<path d="M6 3h12v18H6zM6 6h12M6 18h12M10 9h4v6h-4zM3 5v14M21 5v14"/>',
  promo:'<rect x="6" y="2" width="13" height="19" rx="2"/><path d="m12.5 6 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5ZM9 17h7M3 5v14"/>',
  sleeves:'<rect x="7" y="5" width="12" height="17" rx="2"/><path d="M4 19V3a1 1 0 0 1 1-1h11M10 8h6v9h-6z"/>',
  energy:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m13 6-4 7h4l-2 5 5-8h-4l1-4Z"/>',
  dice:'<rect x="3" y="3" width="14" height="14" rx="3"/><path d="M8 21h10a3 3 0 0 0 3-3V8"/><circle cx="7" cy="7" r=".7"/><circle cx="13" cy="7" r=".7"/><circle cx="10" cy="10" r=".7"/><circle cx="7" cy="13" r=".7"/><circle cx="13" cy="13" r=".7"/>',
  coin:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 8 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/>',
  markers:'<circle cx="8" cy="8" r="5"/><circle cx="16" cy="16" r="5"/><path d="M7 6h2M6 8h4M15 16h2M16 15v2"/>',
  box:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 0v10l9 5 9-5V8M12 13v10M7 6l9 5"/>',
  guide:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15M6 8h3M6 11h3M15 8h3M15 11h3"/>',
  code:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 10-3 2 3 2M15 10l3 2-3 2M13 9l-2 6"/>'
 };
 return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(shapes[kind]||shapes.box)+'</svg>';
}
function renderContents(p){
 const entry=productContents.products[p.id];
 const items=entry?entry.items:[{kind:'packs',quantity:p.packs,label:'Booster packs',detail:p.setName||'Mixed expansions'},{kind:'box',quantity:1,label:'Retail unit',detail:p.type}];
 const components=(entry?.components||[]).map(item=>'<figure class="contents-component"><img data-contents-photo src="'+escapeHtml(item.image)+'" alt="'+escapeHtml(item.label)+'" width="180" height="180" loading="lazy"><figcaption>'+escapeHtml(item.label)+'. Included quantities are listed below.</figcaption></figure>').join('');
 const photo=entry?.photo?'<a class="contents-photo" href="'+escapeHtml(entry.photo)+'" target="_blank" rel="noreferrer"><img data-contents-photo src="'+escapeHtml(entry.photo)+'" alt="'+escapeHtml(p.name+' '+p.type)+' contents laid out" width="800" height="800" loading="lazy"><span>Contents photograph · View larger '+icon('arrow')+'</span></a>':'';
 return '<section class="contents-panel" id="product-contents" tabindex="-1" aria-labelledby="contents-title"><div class="contents-heading"><div><span class="section-kicker">Contents</span><h3 id="contents-title">What’s in the box?</h3></div><span>'+escapeHtml(p.type)+'</span></div>'+photo+components+
 '<div class="contents-grid '+(!entry?'contents-simple':'')+'">'+items.map(item=>'<div class="contents-item"><span class="contents-symbol">'+contentsIcon(item.kind)+'</span><div><strong>'+escapeHtml(item.quantity)+'</strong><span>'+escapeHtml(item.label)+'</span><small>'+escapeHtml(item.detail||'')+'</small></div></div>').join('')+'</div>'+
 '<p class="contents-note">'+(entry?.edition?escapeHtml(entry.edition)+'. ':'')+'Illustrated quantities apply to one retail item. Booster contents are random.</p>'+(entry?.source?'<a class="contents-source" href="'+escapeHtml(entry.source)+'" target="_blank" rel="noreferrer">View product source '+icon('arrow')+'</a>':'')+'</section>';
}
function stockRecord(id){const item=liveStock(id);return shopReady&&item.status!=='unknown'?{...(shopInventory.products[id]||{}),onHand:item.quantity,verifiedAt:item.updatedAt,quantityEvidence:'Owner-declared stock'}:shopInventory.products[id]||{};}
function recordedQuantity(id){
 const item=stockRecord(id);
 const checked=Date.parse(item.verifiedAt);
 return Number.isInteger(item.onHand)&&item.onHand>=0&&typeof item.quantityEvidence==='string'&&item.quantityEvidence.trim()&&Number.isFinite(checked)&&checked<=Date.now()+300000?item.onHand:null;
}
function arrivalLabel(id){
 const item=stockRecord(id),date=item.expectedDate;
 const checked=Date.parse(item.verifiedAt);
 if(typeof item.arrivalEvidence!=='string'||!item.arrivalEvidence.trim()||!Number.isFinite(checked)||checked>Date.now()+300000)return 'Not confirmed';
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return 'Not confirmed';
 const timestamp=Date.parse(date+'T12:00:00Z');
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==date)return 'Not confirmed';
 if(date<new Date().toISOString().slice(0,10))return 'Awaiting updated date';
 const text=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(timestamp));
 return 'Expected '+text+(Number.isInteger(item.incoming)&&item.incoming>0?' · '+item.incoming+' units':'');
}
function renderStockBoard(){
 if(get('stock-overview')&&!get('stock-overview').open)return;
 const selected=get('stock-set-filter').value||'all';
 const groups=[...setOrder.map(key=>({key,name:setEntries.find(e=>e.key===key).name,items:products.filter(p=>p.setKey===key)})),{key:'other',name:'Mixed-set collections',items:products.filter(p=>!setOrder.includes(p.setKey))}].filter(g=>g.items.length&&(selected==='all'||g.key===selected));
 const openGroups=[...get('stock-groups').querySelectorAll('details[open]')].map(el=>el.dataset.stockGroup);
 get('stock-groups').innerHTML=groups.map(group=>{
  const counts=group.items.map(p=>recordedQuantity(p.id));
  const allCounted=counts.every(n=>n!==null);
  const inStock=group.items.filter(isProductInStock).length,outOfStock=shopReady?group.items.filter(p=>liveStock(p.id).status==='out_of_stock').length:0;
  const quantity=inStock+' in stock · '+outOfStock+' out of stock';
  const dates=group.items.map(p=>arrivalLabel(p.id)).filter(label=>label.startsWith('Expected '));
  const logoProduct=group.items.find(p=>p.setLogo),logo=logoProduct?.setLogo;
  const rows=group.items.map(p=>{const n=recordedQuantity(p.id);return '<tr><th scope="row"><button data-quick="'+p.id+'">'+escapeHtml(p.name)+'<span>'+escapeHtml(p.type)+' · '+escapeHtml(p.language)+'</span></button></th><td>'+ escapeHtml(stockLabel(p.id))+'</td><td>'+escapeHtml(arrivalLabel(p.id))+'</td></tr>';}).join('');
  return '<details class="stock-group" data-stock-group="'+group.key+'" '+((selected!=='all'||openGroups.includes(group.key))?'open':'')+'><summary><span class="stock-set">'+setMark({setName:group.name,setLogo:logo,setLogoCrop:logoProduct?.setLogoCrop,reference:group.items[0].reference,setKey:group.items[0].setKey})+'<span><strong>'+escapeHtml(group.name)+'</strong><small>'+group.items.length+' products</small></span></span><span class="stock-group-status"><span>'+quantity+'</span><small>'+(dates.length?'Arrival dates listed below':'Restock not confirmed')+'</small></span>'+icon('chevron')+'</summary><div class="stock-table-wrap"><table><thead><tr><th scope="col">Product</th><th scope="col">On hand</th><th scope="col">Next arrival</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
 }).join('');
}
function showProductStock(id){
 const p=byId(id);if(!p)return;
 if(get('stock-overview'))get('stock-overview').open=true;
 get('stock-set-filter').value=setOrder.includes(p.setKey)?p.setKey:'other';
 renderStockBoard();
 document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
 history.replaceState({...history.state,stackrProduct:null,stackrProductEntry:false},'','#stock-board');
 get('stock-board').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 get('stock-title').setAttribute('tabindex','-1');get('stock-title').focus({preventScroll:true});
}
get('shop-language-select')?.addEventListener('change',event=>setLanguage(event.target.value));
get('search-submit').addEventListener('click',showCatalogue);
get('search').addEventListener('keydown',event=>{
 if(event.key==='Enter'){event.preventDefault();showCatalogue();}
 if(event.key==='ArrowDown'&&query.trim()){event.preventDefault();if(get('search-suggestions').hidden)renderProducts();get('search-suggestions').querySelector('button')?.focus();}
 if(event.key==='Escape')closeSearchSuggestions();
});
get('search').addEventListener('click',()=>{if(query.trim())renderProducts();});
get('stock-set-filter').addEventListener('change',renderStockBoard);
get('stock-set-filter').innerHTML='<option value="all">All sets &amp; languages</option>'+setOrder.map(key=>'<option value="'+key+'">'+escapeHtml(setEntries.find(e=>e.key===key).name)+'</option>').join('')+'<option value="other">Mixed-set collections</option>';
document.addEventListener('error',event=>{
 const image=event.target;if(!(image instanceof HTMLImageElement)&&!(typeof SVGImageElement!=='undefined'&&image instanceof SVGImageElement))return;
 if(image.hasAttribute('data-product-photo')){const picture=image.closest('svg.product-cutout')||image;picture.setAttribute('hidden','');const fallback=picture.nextElementSibling;if(fallback)fallback.hidden=false;}
 if(image.hasAttribute('data-set-logo-photo')){const picture=image.closest('svg.set-logo-crop')||image;picture.setAttribute('hidden','');const fallback=picture.nextElementSibling;if(fallback)fallback.hidden=false;}
 if(image.hasAttribute('data-contents-photo'))image.hidden=true;
 if(image.hasAttribute('data-chase-photo')){const picture=image.closest('.chase-picture');if(picture){picture.hidden=true;const fallback=picture.nextElementSibling;if(fallback)fallback.hidden=false;}const hint=image.closest('.chase-card-button')?.querySelector('.chase-inspect');if(hint)hint.innerHTML='View card details '+icon('arrow');}
},true);
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a');
 if(target?.getAttribute('href')==='#stock-board'&&get('stock-overview'))get('stock-overview').open=true;
 if(target?.dataset.searchSet){chooseSet(target.dataset.searchSet);showCatalogue();}
 if(target?.hasAttribute('data-search-submit'))showCatalogue();
 if(target?.hasAttribute('data-view-chases')){event.preventDefault();get('product-chases')?.focus({preventScroll:true});get('product-chases')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 if(target?.hasAttribute('data-view-contents')){event.preventDefault();get('product-contents').focus({preventScroll:true});get('product-contents').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 if(target?.dataset.productStock)showProductStock(target.dataset.productStock);
 if(target?.dataset.priceEvidence)showPriceEvidence(target.dataset.priceEvidence);
 if(target?.hasAttribute('data-refresh-prices'))refreshLivePrices();
 if(target?.dataset.language){setLanguage(target.dataset.language);closeSearchSuggestions();}
 if(!event.target.closest('#search-box'))closeSearchSuggestions();
});
get('search-suggestions').addEventListener('keydown',event=>{
 const buttons=[...get('search-suggestions').querySelectorAll('button')];
 const index=buttons.indexOf(document.activeElement);
 if(event.key==='Escape'){event.stopPropagation();closeSearchSuggestions();get('search').focus();}
 if(event.key==='ArrowDown'){event.preventDefault();buttons[Math.min(index+1,buttons.length-1)]?.focus();}
 if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)get('search').focus();else buttons[index-1].focus();}
});
if(get('stock-overview')){get('stock-overview').addEventListener('toggle',()=>{if(get('stock-overview').open)renderStockBoard();});if(location.hash==='#stock-board')get('stock-overview').open=true;}
renderStockBoard();

/* Keep exploration context on the browse history entry, not in the product URL. */
function currentBrowseContext(){
 const focused=document.activeElement?.closest('[data-quick]');
 return {query,category,setKey,language,availability,priceRange,sort,onlySaved,view:catalogueView,scrollY:window.scrollY,productLimit,setLimit:catalogueSetLimit,openSets:[...openCatalogueSets],focusProduct:focused?.dataset.quick||null};
}
function rememberBrowseContext(force=false){
 if(browseRestoreInProgress||!force&&get('quick-dialog').open)return;
 // Read the real disclosure state because opening a set does not rerender the list.
 get('product-grid').querySelectorAll('[data-catalogue-set]').forEach(details=>{if(details.open)openCatalogueSets.add(details.dataset.catalogueSet);else openCatalogueSets.delete(details.dataset.catalogueSet);});
 history.replaceState({...history.state,stackrBrowse:currentBrowseContext()},'');
}
function restoreBrowseContext(raw){
 const value=browseContext.snapshot(raw,{categories:Object.keys(formatLabels),sets:setEntries.map(entry=>entry.key),languages:['all',...Object.keys(languageDefinitions)]});
 if(!value)return;
 browseRestoreInProgress=true;
 query=value.query;category=value.category;setKey=value.setKey;language=value.language;availability=value.availability;priceRange=value.priceRange;sort=value.sort;onlySaved=value.onlySaved;catalogueView=value.view;
 productLimit=value.productLimit;catalogueSetLimit=value.setLimit;openCatalogueSets.clear();value.openSets.forEach(key=>openCatalogueSets.add(key));
 get('search').value=query;get('budget').value=priceRange;get('sort').value=sort;if(get('availability-filter'))get('availability-filter').value=availability;
 document.querySelectorAll('[data-catalogue-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.catalogueView===catalogueView)));
 get('product-grid').replaceChildren();lastFilterSignature=JSON.stringify([category,setKey,language,onlySaved,query,sort,priceRange,availability]);
 renderSetNavigation();renderProducts();closeSearchSuggestions();
 requestAnimationFrame(()=>{
  requestAnimationFrame(()=>{
   if(value.focusProduct)[...get('product-grid').querySelectorAll('[data-quick]')].find(button=>button.dataset.quick===value.focusProduct)?.focus({preventScroll:true});
   window.scrollTo(0,value.scrollY);browseRestoreInProgress=false;
  });
 });
}
window.addEventListener('scroll',()=>{if(get('quick-dialog').open||browseRestoreInProgress)return;clearTimeout(browseScrollTimer);browseScrollTimer=setTimeout(()=>rememberBrowseContext(),150);},{passive:true});
window.addEventListener('pagehide',()=>rememberBrowseContext());

function pendingFilterCount(draft){
 return products.filter(p=>(draft.language==='all'||p.language===draft.language)&&(draft.category==='All'||p.category===draft.category)&&(draft.setKey==='all'||p.setKey===draft.setKey)&&(draft.availability==='all'||stockStatus(p)===draft.availability)&&browseContext.inBudget(productPence(p),draft.priceRange)&&matchesSearch(p)&&(!onlySaved||state.saved.includes(p.id))).length;
}
function openFilterSheet(){
 if(!filterSheet){
  filterSheet=document.createElement('dialog');filterSheet.className='filter-sheet';filterSheet.id='filter-sheet';filterSheet.setAttribute('aria-labelledby','filter-sheet-title');
  filterSheet.innerHTML='<form><header class="filter-sheet-head"><h2 id="filter-sheet-title">Filter products</h2><button type="button" data-sheet-cancel aria-label="Cancel filter changes">'+icon('close')+'</button></header><div class="filter-sheet-fields"><label for="sheet-language">Language<select id="sheet-language" name="language"></select></label><label for="sheet-category">Product format<select id="sheet-category" name="category"></select></label><label for="sheet-set">Expansion<select id="sheet-set" name="setKey"></select></label><label for="sheet-availability">Availability<select id="sheet-availability" name="availability"><option value="all">All products</option><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="unknown">Availability to be confirmed</option></select></label><label for="sheet-price">Price per product<select id="sheet-price" name="priceRange"></select></label><p>Price filters include only products with a current retail reference. Changes apply when you select Apply filters.</p></div><footer class="filter-sheet-foot"><output id="filter-sheet-count" aria-live="polite"></output><button type="button" class="filter-sheet-reset" data-sheet-reset>Reset filters</button><button type="submit" class="filter-sheet-apply">Apply filters</button></footer></form>';
  document.body.append(filterSheet);
  filterSheet.querySelector('[data-sheet-cancel]').addEventListener('click',()=>filterSheet.close());
  filterSheet.addEventListener('close',()=>{get('filter-toggle').setAttribute('aria-expanded','false');get('filter-toggle').focus({preventScroll:true});});
  filterSheet.addEventListener('click',event=>{if(event.target===filterSheet){const rect=filterSheet.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)filterSheet.close();}});
  filterSheet.querySelector('form').addEventListener('change',()=>refreshFilterDraft());
  filterSheet.querySelector('[data-sheet-reset]').addEventListener('click',()=>{for(const[key,value]of Object.entries({language:'English',category:'All',setKey:'all',availability:'all',priceRange:'all'}))filterSheet.querySelector('[name="'+key+'"]').value=value;refreshFilterDraft();});
  filterSheet.querySelector('form').addEventListener('submit',event=>{
   event.preventDefault();const draft=readFilterDraft();language=draft.language;category=draft.category;setKey=draft.setKey;availability=draft.availability;priceRange=draft.priceRange;
   get('budget').value=priceRange;if(get('availability-filter'))get('availability-filter').value=availability;renderSetNavigation();renderProducts();filterSheet.close();
  });
 }
 filterSheet.querySelector('[name="language"]').innerHTML='<option value="all">All languages</option>'+Object.keys(languageDefinitions).map(name=>'<option value="'+escapeHtml(name)+'">'+escapeHtml(name)+'</option>').join('');
 filterSheet.querySelector('[name="category"]').innerHTML=Object.entries(formatLabels).map(([key,name])=>'<option value="'+key+'">'+escapeHtml(name)+'</option>').join('');
 filterSheet.querySelector('[name="setKey"]').innerHTML=setEntries.map(entry=>'<option value="'+entry.key+'">'+escapeHtml(entry.name)+'</option>').join('');
 filterSheet.querySelector('[name="priceRange"]').innerHTML=Object.entries(budgetLabels).map(([key,name])=>'<option value="'+key+'">'+escapeHtml(name)+'</option>').join('');
 for(const[key,value]of Object.entries({language,category,setKey,availability,priceRange}))filterSheet.querySelector('[name="'+key+'"]').value=value;
 refreshFilterDraft();get('filter-toggle').setAttribute('aria-expanded','true');filterSheet.showModal();
}
function readFilterDraft(){return Object.fromEntries(['language','category','setKey','availability','priceRange'].map(key=>[key,filterSheet.querySelector('[name="'+key+'"]').value]));}
function refreshFilterDraft(){
 const draft=readFilterDraft(),setSelect=filterSheet.querySelector('[name="setKey"]');
 const matchingSets=setEntries.filter(entry=>(!entry.language||draft.language==='all'||entry.language===draft.language)&&(entry.key!=='collections'||draft.language==='all'||draft.language==='English'));
 if(!matchingSets.some(entry=>entry.key===draft.setKey))draft.setKey='all';
 setSelect.innerHTML=matchingSets.map(entry=>'<option value="'+entry.key+'">'+escapeHtml(entry.name)+'</option>').join('');
 setSelect.value=draft.setKey;
 const count=pendingFilterCount(draft);get('filter-sheet-count').textContent=count+' product'+(count===1?'':'s')+' match';
}
if(initialBrowseSnapshot)restoreBrowseContext(initialBrowseSnapshot);
