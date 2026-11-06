
'use strict';
const products=__PRODUCTS__;
const paths={
 chevron:'<path d="m6 9 6 6 6-6"/>',
 filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',
 chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>',
 store:'<path d="M3 10h18l-2-6H5l-2 6Zm1 0v11h16V10M9 21v-7h6v7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
 box:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10M7.5 5.5l9 5"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';}
document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});
const get=id=>document.getElementById(id);
const byId=id=>products.find(p=>p.id===id);
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey='stackr-five-product-shop-v1';
let state={cart:{},saved:[]};
const customerLimit=3;
let category='All',setKey='all',language='English',onlySaved=false,query='',sort='featured',priceRange='all',toastTimer,toastReturnFocus,productLimit=24,lastFilterSignature='';
let browseRestoreInProgress=false,productHistoryIsClosing=false,browseScrollTimer,filterSheet;
const searchRankCache=new WeakMap();
const initialBrowseSnapshot=history.state?.stackrBrowse;
try{
 const saved=JSON.parse(localStorage.getItem(storageKey));
 if(saved&&typeof saved==='object'){
  state.saved=Array.isArray(saved.saved)?[...new Set(saved.saved.filter(id=>byId(id)))]:[];
  for(const[id,n]of Object.entries(saved.cart||{})){if(byId(id)&&Number.isInteger(n)&&n>0)state.cart[id]=Math.min(customerLimit,n);}
 }
}catch{}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}}
function dismissToast(){
 const area=get('toast');clearTimeout(toastTimer);
 if(area.contains(document.activeElement)){
  const target=toastReturnFocus?.isConnected?toastReturnFocus:[...document.querySelectorAll('dialog[open]')].at(-1)?.querySelector('button:not(:disabled)')||get('search');
  target?.focus({preventScroll:true});
 }
 area.classList.remove('show');area.hidden=true;area.inert=true;area.replaceChildren();
}
function toast(message,action){
 dismissToast();toastReturnFocus=document.activeElement;
 const area=get('toast'),top=[...document.querySelectorAll('dialog[open]')].at(-1);(top||document.body).append(area);const copy=document.createElement('span');copy.textContent=message;area.append(copy);
 if(action){const button=document.createElement('button');button.textContent=action.label;button.addEventListener('click',()=>{dismissToast();action.run();},{once:true});area.append(button);}
 area.hidden=false;area.inert=false;area.classList.add('show');toastTimer=setTimeout(dismissToast,5000);
}
function productSearchRank(p){
 const value=browseContext.normalise(query),cached=searchRankCache.get(p);if(cached?.query===value)return cached.rank;
 const aliases={ETBs:'etb elite trainer box',Boxes:'booster box display',Bundles:'bundle six packs',Blisters:'blister',Collections:'collection',Tins:'tin',Decks:'deck battle deck',UPCs:'upc ultra premium collection'};
 const rank=browseContext.rank(p,value,aliases[p.category]||'');searchRankCache.set(p,{query:value,rank});return rank;
}
function matchesSearch(p){return productSearchRank(p)!==null;}
function updateCounts(){
 const count=Object.values(state.cart).reduce((a,b)=>a+b,0);
 document.querySelectorAll('[data-cart-count]').forEach(el=>{el.textContent=count;});
 document.querySelectorAll('[data-open-cart]').forEach(el=>el.setAttribute('aria-label','Open basket, '+count+' items'));
 get('saved-count').textContent=state.saved.length?'('+state.saved.length+')':'';
 get('saved-toggle').setAttribute('aria-pressed',String(onlySaved));
 get('saved-toggle').setAttribute('aria-label',(onlySaved?'Show all products':'Show saved products')+', '+state.saved.length+' saved');
}
function productCard(p){
 const saved=state.saved.includes(p.id),full=escapeHtml(p.name+' '+p.type),available=isProductInStock(p);
 const photo='<button class="product-image-button" data-quick="'+p.id+'" aria-label="View '+full+'"><span class="product-tilt" data-product-tilt>'+productPhoto(p,'lazy')+'</span><span class="product-view-hint">View product '+icon('arrow')+'</span></button>';
 const title='<button class="product-name-button" data-quick="'+p.id+'">'+escapeHtml(p.name)+'</button>';
 return '<article class="product-card '+(available?'is-in-stock':'is-interest-only')+'" data-product="'+p.id+'">'+
 '<div class="product-visual">'+setBadge(p)+saveButton(p,saved)+photo+'</div>'+
 '<div class="product-info"><h3 data-title-length="'+(p.name.length>30?'long':'regular')+'">'+title+'</h3><p class="product-meta">'+escapeHtml(p.type)+'<span class="language-label">'+languageBadge(p)+'</span></p>'+
 '<p class="product-sub">'+packText(p)+'</p>'+(productIsUpcoming(p)?'<p class="product-release">'+escapeHtml(productReleaseLabel(p))+'</p>':'')+'<div class="product-bottom">'+pricePair(p)+
 (available?'<button class="add-button" data-add="'+p.id+'" '+(cartMaximum(p.id)<=(state.cart[p.id]||0)?'disabled':'')+' aria-label="Add '+full+' to bag">'+icon('plus')+' '+addLabel(p)+'</button>':'')+'</div>'+
 '<div class="product-utility"><button class="stock-shortcut" data-product-stock="'+p.id+'">'+stockLabel(p.id)+'</button></div>'+(available?'<p class="purchase-limit">Maximum 3 per product per order</p>':interestButton(p))+'</div></article>';
}
function renderProducts(){
 const normal=query.trim().toLocaleLowerCase('en-GB');
 document.body.dataset.browsing=String(!!normal||onlySaved||setKey!=='all'||category!=='All'||priceRange!=='all'||language!=='all'||availability!=='all');
 let list=products.filter(p=>matchesLanguage(p)&&matchesAvailability(p)&&matchesBudget(p)&&matchesSet(p,setKey)&&(category==='All'||p.category===category)&&(!onlySaved||state.saved.includes(p.id))&&
  matchesSearch(p));
 if(sort==='featured')list.sort((a,b)=>(normal?productSearchRank(a)-productSearchRank(b):0)||compareSetReleases(a,b));
 if(sort==='low'||sort==='high')list.sort((a,b)=>{const x=productPence(a),y=productPence(b);return Number(x===null)-Number(y===null)||(x===null?0:(sort==='low'?x-y:y-x));});
 if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 get('result-count').textContent=list.length+' '+(onlySaved?'saved ':'')+'product'+(list.length===1?'':'s');
 document.querySelectorAll('[data-category]').forEach(el=>{
  const selected=el.dataset.category===category;
  el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));
 });
 renderCatalogueNavigation();
 get('results-note').hidden=!normal&&!onlySaved&&setKey==='all'&&category==='All'&&priceRange==='all'&&language==='all'&&availability==='all';
 get('shop-title').textContent=setKey==='all'?'Shop Pokémon':(setEntries.find(s=>s.key===setKey).setName||setEntries.find(s=>s.key===setKey).name);
 get('active-filter').textContent=[language!=='all'?language:'',setKey!=='all'?(setEntries.find(s=>s.key===setKey).setName||setEntries.find(s=>s.key===setKey).name):'',category!=='All'?formatLabels[category]:'',priceRange!=='all'?budgetLabels[priceRange]:'',availability!=='all'?({in_stock:'In stock',out_of_stock:'Out of stock',unknown:'Availability to be confirmed'}[availability]):'',onlySaved?'Saved products':'',normal?'Search: '+query.trim():''].filter(Boolean).join(' · ');
 const signature=JSON.stringify([category,setKey,language,onlySaved,query,sort,priceRange,availability]),changed=signature!==lastFilterSignature;
 if(changed){productLimit=24;lastFilterSignature=signature;}
 renderGroupedCatalogue(list,changed);
 document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
 if(get('availability-filter')&&shopReady){
  const candidates=products.filter(p=>matchesLanguage(p)&&matchesBudget(p)&&matchesSet(p,setKey)&&(category==='All'||p.category===category)&&(!onlySaved||state.saved.includes(p.id))&&matchesSearch(p));
  for(const option of get('availability-filter').options){const labels={all:'All products',in_stock:'In stock',out_of_stock:'Out of stock',unknown:'To be confirmed'};option.textContent=labels[option.value]+' ('+candidates.filter(p=>option.value==='all'||stockStatus(p)===option.value).length+')';}
 }
 if(get('shop-language-select'))get('shop-language-select').value=language;
 renderSearchSuggestions(list.length,list);updateCounts();rememberBrowseContext();if(filterSheet?.open)refreshFilterDraft();
}
function reset(){
 category='All';language='English';availability='all';onlySaved=false;query='';priceRange='all';sort='featured';get('sort').value='featured';get('budget').value='all';if(get('availability-filter'))get('availability-filter').value='all';get('search').value='';clearSetFilter();renderFeature(byId('asc-etb'));renderProducts();
}
function add(id){
 const p=byId(id);if(!p)return;
 const n=state.cart[id]||0;
 if(!isProductInStock(p)){showInterest(id);return;}
 if(n>=cartMaximum(id)){toast(!currentQuote(p)?'A current market reference is not available for this product.':recordedQuantity(id)===0?'This product is sold out.':'Limit: 3 of each product per customer.');return;}
 state.cart[id]=n+1;persist();renderCart();renderProducts();
 syncOpenProductStock();productFeedback('bag','[data-open-cart]');
 toast(p.name+' added to your bag',{label:'View bag',run:()=>{renderCart();get('cart-dialog').showModal();}});
}
function toggleSaved(id){
 if(!byId(id))return;
 const index=state.saved.indexOf(id);
 if(index<0)state.saved.push(id);else state.saved.splice(index,1);
 const focus=document.activeElement?.dataset.save===id;
 persist();renderProducts();syncSaveButtons();
 if(focus)document.querySelector('[data-save="'+id+'"]')?.focus({preventScroll:true});
 productFeedback('success','[data-save="'+id+'"]');toast(index<0?'Saved on this device.':'Removed from saved items.');
}
function totals(){
 let cents=0,market=0,count=0,priced=0;const unpriced=[];
 for(const[id,n]of Object.entries(state.cart)){const q=currentQuote(byId(id));count+=n;if(!q){unpriced.push(id);continue;}cents+=q.shopPence*n;market+=q.marketPence*n;priced+=n;}
 return {subtotal:cents/100,market:market/100,savings:(market-cents)/100,delivery:null,total:null,count,priced,unpriced};
}
function cartItem(id,n){
 const p=byId(id);
 return '<div class="cart-item"><div class="cart-img">'+productPhoto(p)+'</div>'+
 '<div class="cart-info"><h3>'+escapeHtml(p.name)+'</h3><p>'+escapeHtml(p.type)+' · '+escapeHtml(p.language)+'</p><small class="cart-limit">Maximum 3 per product per order</small><div class="cart-line"><div class="stepper">'+
 '<button data-change="'+id+'" data-delta="-1" aria-label="Decrease '+escapeHtml(p.name+' '+p.type)+' quantity">−</button>'+
 '<output aria-label="'+escapeHtml(p.name+' '+p.type)+' quantity">'+n+'</output><button data-change="'+id+'" data-delta="1" aria-label="Increase '+escapeHtml(p.name+' '+p.type)+' quantity" '+(n>=cartMaximum(id)?'disabled':'')+'>+</button>'+
 '</div><span class="line-price">'+(currentQuote(p)?money(currentQuote(p).shopPence*n/100):'Recheck price')+'</span></div><button class="remove" data-remove="'+id+'">Remove</button></div></div>';
}
function renderCart(){
 const resuming=!!window.stackrPendingCheckout?.(),c=window.stackrCheckout||{enabled:false,deliveryPence:null},delivery=c.deliveryPence,entries=Object.entries(state.cart),t=totals(),stockUnavailable=entries.some(([id,n])=>!isProductInStock(byId(id))||n>cartMaximum(id));
 get('cart-items').innerHTML=entries.length?entries.map(([id,n])=>cartItem(id,n)).join(''):'<div class="cart-empty">'+icon('bag')+'<h3>Your bag is empty.</h3><p>Explore the shop to find your next addition.</p><button class="primary" data-close>Browse products '+icon('arrow')+'</button></div>';
 get('cart-summary').hidden=!entries.length;
 get('cart-summary').innerHTML='<div class="summary-line muted"><span>Market reference'+(t.unpriced.length?' · priced items':'')+'</span><span>'+(t.priced?money(t.market):'Unavailable')+'</span></div>'+
 '<div class="summary-line"><span>StackR subtotal'+(t.unpriced.length?' · partial':'')+'</span><strong>'+(t.priced?money(t.subtotal):'Pending')+'</strong></div>'+
 (t.priced?'<div class="summary-line saving"><span>10% lower · you save</span><strong>'+money(t.savings)+'</strong></div>':'')+
 '<div class="summary-line muted"><span>Delivery</span><span>'+(delivery===null?'To be confirmed':money(delivery/100))+'</span></div>'+
 '<div class="summary-line total"><strong>Final total</strong><strong>'+(c.enabled&&!t.unpriced.length&&delivery!==null?money(t.subtotal+delivery/100):'To be confirmed')+'</strong></div>'+
 '<button class="primary" id="checkout-preview" '+(!c.enabled||window.stackrCheckoutBusy?.()||!resuming&&(t.unpriced.length||stockUnavailable)?'disabled':'')+'>'+(window.stackrCheckoutBusy?.()?'Opening secure checkout…':c.enabled?(resuming?'Resume secure checkout':c.mode==='test'?'Stripe test checkout':'Secure checkout'):'Checkout opens soon')+' '+icon('arrow')+'</button><p class="example-note">'+(resuming?'Your checkout attempt keeps its original prices. Review the total and stock hold on the secure payment page. ':stockUnavailable?'Some items are no longer available. Remove them or check their stock. ':'')+(t.unpriced.length?'Some products need a current reference before a total can be confirmed. ':'')+''+(c.enabled?'Stock is held when secure checkout opens. Payment is handled by Stripe.':'Adding to your bag does not reserve stock. Checkout is not open yet.')+'</p>';
 updateCounts();
}
function quick(id){
 const p=byId(id);if(!p)return;
 const route='#product/'+encodeURIComponent(p.id),wasOpen=get('quick-dialog').open,fromRoute=location.hash===route;
 if(!wasOpen&&!fromRoute){rememberBrowseContext(true);history.pushState({...history.state,stackrProduct:p.id,stackrProductEntry:true},'',route);}
 else history.replaceState({...history.state,stackrProduct:p.id},'',route);
 closeSearchSuggestions();
 get('quick-body').dataset.product=id;
 const rows=[['Set',p.setName||p.name],['Product format',p.edition&&p.edition!=='standard'?p.edition:'Standard retail edition'],['Availability',stockLabel(p.id)],...(productReleaseLabel(p)?[['Release',productReleaseLabel(p).replace(/^(?:Published|Set) release: /,'')]]:[]),['Language',p.language],['Pack count',packText(p,true)],['Unit','1 retail item'],...(p.cardsPerPack?[['Cards per pack',p.cardsPerPack]]:[]),...(p.reference?[['Catalogue ref',p.reference]]:[])];
 get('quick-body').innerHTML='<div class="quick-art"><button class="inspection-launch" data-inspect-photo="'+p.id+'" aria-label="Inspect '+escapeHtml(p.name+' '+p.type)+' photograph" '+(!p.image||p.imagePending?'disabled':'')+'><span class="product-tilt" data-product-tilt>'+productPhoto(p,'eager')+'</span><span class="inspect-hint">'+icon('search')+' Inspect photo</span></button><div class="photo-tools"><span>Product photograph</span>'+(p.photoReference?'<button class="photo-reference" data-photo-reference="'+p.id+'">Another supplier view</button>':'')+'</div></div>'+
 '<div class="quick-copy">'+setMark(p,'quick-set-mark')+
 '<span class="eyebrow">'+escapeHtml(p.series)+'</span><h2 id="quick-title">'+escapeHtml(p.name)+'</h2><div class="product-sub quick-product-identity">'+escapeHtml(p.type)+'<span>'+languageBadge(p)+'</span></div><p class="quick-availability" data-product-stock="'+p.id+'">'+stockLabel(p.id)+'</p>'+pricePair(p)+'<div class="quick-action-panel"><p class="preview-action-note">Shop preview · Orders are not open</p><div class="quick-actions" data-quick-actions>'+quickProductActions(p)+'</div></div>'+
 '<div class="product-detail-jumps"><a class="contents-jump" href="#product-contents" data-view-contents>Box contents '+icon('arrow')+'</a><a class="contents-jump" href="#product-chases" data-view-chases>Collector picks '+icon('arrow')+'</a></div>'+
 priceShareButton(p)+'<p class="purchase-limit" data-quick-limit '+(!isProductInStock(p)?'hidden':'')+'>Maximum 3 of each product per order</p><button class="product-stock-link" data-product-stock="'+p.id+'">'+stockLabel(p.id)+' · Stock &amp; arrivals '+icon('arrow')+'</button><details class="product-specifications"><summary>Product details '+icon('chevron')+'</summary><p>'+escapeHtml(p.description)+'</p><ul class="detail-list">'+rows.map(([label,value])=>'<li><span>'+label+'</span><strong'+(label==='Availability'?' data-detail-stock':'')+'>'+escapeHtml(value)+'</strong></li>').join('')+'</ul></details>'+
 '<details class="product-delivery"><summary>Delivery &amp; returns '+icon('chevron')+'</summary><p>Delivery charges are not set. Dispatch services and final returns terms will be published before orders open.</p><button class="text-link" data-info="delivery">Read delivery &amp; returns '+icon('arrow')+'</button></details><p class="random-note">Booster contents are random. Only separately listed promo cards are guaranteed as part of the product format.</p></div>'+renderSetHighlights(p)+renderContents(p)+'<div class="quick-related">'+relatedProducts(p)+'</div>';
 if(!get('quick-dialog').open)get('quick-dialog').showModal();
 get('quick-dialog').scrollTop=0;
}
function openInfo(title,content){infoViewGeneration++;get('info-title').textContent=title;get('info-content').innerHTML=content;get('info-dialog').showModal();}
async function checkout(){return startStripeCheckout();}

document.addEventListener('click',e=>{
 const target=e.target.closest('button,a');if(!target)return;
 document.querySelectorAll('.nav-menu[open]').forEach(menu=>menu.removeAttribute('open'));
 if(target.dataset.info){openStoreInfo(target.dataset.info);return;}
 if(target.dataset.set){const fromMenu=!!target.closest('.mega-menu');chooseSet(target.dataset.set,!!target.closest('.catalogue-sidebar'));if(fromMenu)get('shop').scrollIntoView({behavior:'smooth'});return;}
 if(target.hasAttribute('data-reset')){reset();return;}
 if(target.dataset.category){category=target.dataset.category;onlySaved=false;renderProducts();return;}
 if(target.dataset.filterLink){priceRange='all';get('budget').value='all';category=target.dataset.filterLink;onlySaved=false;query='';get('search').value='';clearSetFilter();renderFeature(products.find(p=>p.category===category));renderProducts();return;}
 if(target.dataset.add){add(target.dataset.add);return;}
 if(target.dataset.save){toggleSaved(target.dataset.save);return;}
 if(target.dataset.quick){selectProduct(target.dataset.quick);return;}
 if(target.hasAttribute('data-open-cart')){renderCart();get('cart-dialog').showModal();return;}
 if(target.hasAttribute('data-close')){target.closest('dialog').close();return;}
 if(target.dataset.change){
  const id=target.dataset.change;if(!byId(id))return;
  const delta=Number(target.dataset.delta);if(delta!==1&&delta!==-1)return;
  state.cart[id]=Math.max(0,Math.min(delta<0?customerLimit:cartMaximum(id),(state.cart[id]||0)+delta));
  if(!state.cart[id])delete state.cart[id];persist();renderCart();renderProducts();
  productFeedback('selection');
  get('cart-items').querySelector('[data-change="'+id+'"][data-delta="'+target.dataset.delta+'"]')?.focus();
  return;
 }
 if(target.dataset.remove){delete state.cart[target.dataset.remove];persist();renderCart();renderProducts();return;}
 if(target.id==='checkout-preview')checkout();
});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{
 if(e.target!==d)return;const r=d.getBoundingClientRect();
 if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();
}));
function savedView(){language='all';availability='all';if(get('availability-filter'))get('availability-filter').value='all';priceRange='all';get('budget').value='all';onlySaved=!onlySaved;category='All';query='';get('search').value='';clearSetFilter();renderProducts();get('shop').scrollIntoView({behavior:'smooth'});}
get('saved-toggle').addEventListener('click',savedView);
get('mobile-saved').addEventListener('click',savedView);
get('search-toggle').addEventListener('click',()=>{
 const open=get('search-box').classList.toggle('open');
 get('search-toggle').setAttribute('aria-expanded',String(open));if(open)get('search').focus();
});
get('search').addEventListener('input',e=>{query=e.target.value;if(query.trim()){category='All';onlySaved=false;priceRange='all';get('budget').value='all';catalogueView='products';document.querySelectorAll('[data-catalogue-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.catalogueView===catalogueView)));}if(setKey!=='all')clearSetFilter();renderProducts();});
get('search-clear').addEventListener('click',()=>{query='';get('search').value='';renderProducts();get('search').focus();});
get('sort').addEventListener('change',e=>{sort=e.target.value;renderProducts();});
get('budget').addEventListener('change',e=>{priceRange=e.target.value;renderProducts();});
get('filter-toggle').addEventListener('click',()=>{if(matchMedia('(max-width:900px)').matches){openFilterSheet();return;}const open=get('catalogue-filters').classList.toggle('open');get('filter-toggle').setAttribute('aria-expanded',String(open));});
get('quick-dialog').addEventListener('close',()=>{
 if(productHistoryIsClosing||interestReturnProduct)return;
 if(location.hash.startsWith('#product/')){
  if(history.state?.stackrProductEntry)history.back();
  else{history.replaceState({...history.state,stackrProduct:null,stackrProductEntry:false},'','#shop');restoreBrowseContext(history.state?.stackrBrowse);}
 }
});
window.addEventListener('hashchange',openLinkedProduct);
window.addEventListener('popstate',()=>{
 if(location.hash.startsWith('#product/')){openLinkedProduct();return;}
 productHistoryIsClosing=true;if(get('quick-dialog').open)get('quick-dialog').close();
 restoreBrowseContext(history.state?.stackrBrowse);queueMicrotask(()=>{productHistoryIsClosing=false;});
});
document.querySelectorAll('.nav-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)document.querySelectorAll('.nav-menu').forEach(other=>{if(other!==menu)other.open=false;});}));
document.addEventListener('click',e=>{if(!e.target.closest('.nav-menu'))document.querySelectorAll('.nav-menu[open]').forEach(menu=>menu.open=false);});

document.addEventListener('keydown',e=>{
 if(e.key==='Escape')document.querySelectorAll('.nav-menu[open]').forEach(menu=>menu.removeAttribute('open'));
 if(e.key==='Escape'&&!document.querySelector('dialog[open]')){
  get('search-box').classList.remove('open');get('search-toggle').setAttribute('aria-expanded','false');
 }
});
get('about-preview').addEventListener('click',()=>openStoreInfo('preview'));
get('delivery-info').addEventListener('click',()=>openStoreInfo('delivery'));
get('format-guide').addEventListener('click',()=>openStoreInfo('formats'));
renderSetNavigation();renderFeature(byId('asc-etb'));renderProducts();renderCart();openLinkedProduct();
