/* Product inspection is independent of availability. Purchase requires confirmed stock. */
const openCatalogueSets=new Set();
let catalogueSetLimit=24,catalogueWaitingGroups=new Map(),catalogueView='sets';
function productIsUpcoming(p,now=Date.now()){if(!p)return false;const date=p.releaseDate||(/^\d{4}-\d{2}$/.test(p.releaseMonth||'')?p.releaseMonth+'-01':null);return !!date&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&Date.parse(date+'T00:00:00Z')>now;}
function productReleaseLabel(p){if(!p?.releaseDate&&!p?.releaseMonth){const released=typeof setReleaseDates!=='undefined'&&setReleaseDates[p?.setKey]?.releaseDate;return released?'Set release: '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(released+'T00:00:00Z')):'';}const date=p.releaseDate||p.releaseMonth+'-01',format=p.releaseDate?{day:'numeric',month:'long',year:'numeric'}:{month:'long',year:'numeric'};return 'Published release: '+new Intl.DateTimeFormat('en-GB',{...format,timeZone:'Europe/London'}).format(new Date(date+'T00:00:00Z'));}
function isProductInStock(p){
 const item=p&&liveStock(p.id);
 return !!p&&!productIsUpcoming(p)&&shopReady&&item.status==='in_stock'&&item.quantity!==0;
}
function setMark(entry,className=''){
 const name=entry.setName||entry.name||'Mixed-set collections',logo=entry.setLogo||entry.logo;
 const code=entry.key==='all'?'ALL':entry.key==='collections'||entry.setKey==='collections'?'MIXED SETS':entry.code||(entry.reference&&!entry.reference.startsWith('POK')?entry.reference:'')||name.split(' ').map(word=>word[0]).join('').slice(0,5);
 const c=entry.setLogoCrop||entry.logoCrop,fallback='<span class="set-mark-fallback" '+(logo?'hidden':'')+'>'+icon('box')+'<strong>'+escapeHtml(code)+'</strong></span>';
 const isolation=entry.setLogoIsolation||entry.logoIsolation;
 let picture='';
 if(logo&&isolation){
  const b=isolation.bounds,pad=1,clip='set-isolation-'+(setMark.serial=(setMark.serial||0)+1);
  picture='<svg class="set-logo-crop set-logo-isolated" data-lazy-svg role="img" aria-label="'+escapeHtml(name)+' set logo" viewBox="'+[b.x-pad,b.y-pad,b.width+pad*2,b.height+pad*2].join(' ')+'" preserveAspectRatio="xMidYMid meet"><title>'+escapeHtml(name)+' set logo</title><defs><clipPath id="'+clip+'" clipPathUnits="userSpaceOnUse"><path d="'+escapeHtml(isolation.path)+'"/></clipPath></defs><image data-set-logo-photo data-svg-src="'+escapeHtml(logo)+'" x="0" y="0" width="'+isolation.sourceWidth+'" height="'+isolation.sourceHeight+'" clip-path="url(#'+clip+')"/></svg>';
 }else if(logo)picture=c?'<svg class="set-logo-crop" data-lazy-svg role="img" aria-label="'+escapeHtml(name)+' set logo" viewBox="'+[c.x,c.y,c.width,c.height].join(' ')+'" preserveAspectRatio="xMidYMid meet"><title>'+escapeHtml(name)+' set logo</title><image data-set-logo-photo data-svg-src="'+escapeHtml(logo)+'" x="0" y="0" width="'+c.sourceWidth+'" height="'+c.sourceHeight+'"/></svg>':'<img data-set-logo-photo src="'+escapeHtml(logo)+'" alt="'+escapeHtml(name)+' set logo" loading="lazy" width="180" height="90">';
 return '<span class="set-mark '+className+'">'+picture+fallback+'</span>';
}
function stockStatus(p){return !p||!shopReady?'unknown':isProductInStock(p)?'in_stock':liveStock(p.id).status==='out_of_stock'||liveStock(p.id).quantity===0?'out_of_stock':'unknown';}
function renderSetGroup(group){
 const first=group.items[0],open=openCatalogueSets.has(group.key),out=group.items.filter(p=>stockStatus(p)==='out_of_stock').length;
 const label=out===group.items.length?'Out of stock':out?'Register interest':'Availability to be confirmed';
 return '<details class="catalogue-set" data-catalogue-set="'+group.key+'" '+(open?'open':'')+'><summary>'+setMark(group.entry)+
 '<span class="catalogue-set-copy"><strong>'+escapeHtml(group.entry.setName||first.setName||first.name)+'</strong><small>'+languageBadge(first)+'<span>'+escapeHtml(setReleaseLabel(group.entry))+'</span><span>'+group.items.length+' product'+(group.items.length===1?'':'s')+'</span>'+(setHighlights.sets[group.key]?.cards?.length===3?'<span class="set-chase-badge">3 chase cards</span>':'')+'</small></span>'+
 '<span class="catalogue-set-photo">'+productPhoto(first,'lazy')+'</span><span class="catalogue-set-status"><span>'+label+'</span><small>View products</small></span>'+icon('chevron')+'</summary>'+
 '<div class="set-product-grid" data-set-products="'+group.key+'">'+(open?group.items.map(productCard).join(''):'')+'</div></details>';
}
function renderGroupedCatalogue(list,filterChanged){
 const focusedSet=document.activeElement?.matches('[data-catalogue-set]>summary')?document.activeElement.parentElement.dataset.catalogueSet:null;
 get('product-grid').querySelectorAll('[data-catalogue-set]').forEach(details=>{if(details.open)openCatalogueSets.add(details.dataset.catalogueSet);else openCatalogueSets.delete(details.dataset.catalogueSet);});
 if(filterChanged)catalogueSetLimit=24;
 if(catalogueView==='products'){
  get('product-grid').classList.add('catalogue-results');
  get('product-grid').innerHTML=list.length?'<div class="catalogue-product-grid">'+list.slice(0,productLimit).map(productCard).join('')+'</div>'+(list.length>productLimit?'<button class="load-more-products" data-more-products>Show more products · '+(list.length-productLimit)+' remaining</button>':''):emptyCatalogue();
  return;
 }
 const available=list.filter(isProductInStock),waiting=list.filter(p=>!isProductInStock(p));
 catalogueWaitingGroups=new Map();
 for(const p of waiting){
  if(!catalogueWaitingGroups.has(p.setKey))catalogueWaitingGroups.set(p.setKey,{key:p.setKey,entry:setEntries.find(e=>e.key===p.setKey),items:[]});
  catalogueWaitingGroups.get(p.setKey).items.push(p);
 }
 if(filterChanged&&setKey!=='all')openCatalogueSets.add(setKey);
 const groups=[...catalogueWaitingGroups.values()].sort((a,b)=>compareSetReleases(a.entry,b.entry));
 const emptyStock=!shopReady?'Stock not confirmed.':'No products marked in stock.';
 const stockHeading='<div class="catalogue-block-heading"><h3>In stock</h3><span>'+available.length+' product'+(available.length===1?'':'s')+'</span></div>';
 const stockContent=available.length?'<div class="in-stock-grid">'+available.slice(0,productLimit).map(productCard).join('')+'</div>'+(available.length>productLimit?'<button class="load-more-products" data-more-stock>Show more in-stock products · '+(available.length-productLimit)+' remaining</button>':''):
 '<p class="no-stock-message">'+emptyStock+(waiting.length?' Browse the sets below and register interest.':'')+'</p>';
 const groupContent=groups.length?'<section class="interest-catalogue" aria-labelledby="interest-catalogue-title"><div class="catalogue-block-heading"><h3 id="interest-catalogue-title">Browse sets</h3><span>'+groups.length+' set'+(groups.length===1?'':'s')+'</span></div><p class="catalogue-explainer">Expand a set to see its products and register interest.</p><div class="catalogue-set-list">'+groups.slice(0,catalogueSetLimit).map(renderSetGroup).join('')+'</div>'+(groups.length>catalogueSetLimit?'<button class="load-more-products" data-more-sets>Show more sets · '+(groups.length-catalogueSetLimit)+' remaining</button>':'')+'</section>':'';
 get('product-grid').classList.add('catalogue-results');
 get('product-grid').innerHTML=list.length?(available.length||availability==='in_stock'?'<section class="available-catalogue" aria-label="Confirmed in-stock products">'+stockHeading+stockContent+'</section>':'')+groupContent:emptyCatalogue();
 if(focusedSet)[...get('product-grid').querySelectorAll('[data-catalogue-set]')].find(details=>details.dataset.catalogueSet===focusedSet)?.querySelector('summary').focus({preventScroll:true});
}
function emptyCatalogue(){
 if(availability==='in_stock'&&!onlySaved)return '<div class="empty-results"><h3>'+(shopReady?'No in-stock matches.':'Unable to check stock.')+'</h3><p>'+(shopReady?'View matching catalogue products to see availability and register interest.':'Please refresh stock shortly. You can still browse matching catalogue products.')+'</p><button class="primary" data-all-availability>View matching catalogue products '+icon('arrow')+'</button><button class="text-link" data-reset>Reset filters</button></div>';
 const savedEmpty=onlySaved&&!state.saved.length;
 return '<div class="empty-results"><h3>'+(savedEmpty?'No saved products yet.':onlySaved?'No saved products match.':'No products found.')+'</h3><p>'+(savedEmpty?'Choose Save on a product to keep it here.':'Try a different set, language or clear your filters.')+'</p><button class="primary" data-reset>Reset filters '+icon('arrow')+'</button></div>';
}
function selectProduct(id){if(byId(id))quick(id);}
function quickProductActions(p){return (isProductInStock(p)?'<button class="primary" data-add="'+p.id+'" '+(cartMaximum(p.id)<=(state.cart[p.id]||0)?'disabled':'')+'>'+addLabel(p)+' '+icon('plus')+'</button>':interestButton(p))+saveButton(p,state.saved.includes(p.id));}
function syncOpenProductStock(){
 const dialog=get('quick-dialog'),p=byId(get('quick-body').dataset.product);
 if(!dialog.open||!p)return;
 const actions=dialog.querySelector('[data-quick-actions]'),focused=document.activeElement,kind=focused?.matches('[data-add]')?'[data-add]':focused?.matches('[data-interest]')?'[data-interest]':focused?.matches('[data-save]')?'[data-save]':null;
 actions.innerHTML=quickProductActions(p);dialog.querySelector('[data-quick-limit]').hidden=!isProductInStock(p);
 const stock=dialog.querySelector('[data-detail-stock]');if(stock)stock.textContent=stockLabel(p.id);
 if(kind)(actions.querySelector(kind)||actions.querySelector('button'))?.focus({preventScroll:true});
}
document.addEventListener('toggle',event=>{
 const details=event.target;
 if(!details.matches?.('[data-catalogue-set]')||!details.isConnected)return;
 const key=details.dataset.catalogueSet;
 if(details.open){openCatalogueSets.add(key);const body=details.querySelector('[data-set-products]');if(!body.children.length)body.innerHTML=(catalogueWaitingGroups.get(key)?.items||[]).map(productCard).join('');}
 else openCatalogueSets.delete(key);
},true);
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.hasAttribute('data-all-availability')){availability='all';get('availability-filter').value='all';renderProducts();}
 if(button.hasAttribute('data-more-stock')){productLimit+=24;renderProducts();}
 if(button.hasAttribute('data-more-products')){const previous=productLimit;productLimit+=24;renderProducts();get('product-grid').querySelectorAll('.product-card')[previous]?.querySelector('[data-quick]')?.focus({preventScroll:true});}
 if(button.dataset.catalogueView){catalogueView=button.dataset.catalogueView;productLimit=24;document.querySelectorAll('[data-catalogue-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.catalogueView===catalogueView)));renderProducts();closeSearchSuggestions();}
 if(button.hasAttribute('data-more-sets')){const previous=catalogueSetLimit;catalogueSetLimit+=24;renderProducts();get('product-grid').querySelectorAll('[data-catalogue-set]')[previous]?.querySelector('summary').focus({preventScroll:true});}
});
