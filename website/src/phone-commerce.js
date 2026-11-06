/* Separate discovery from buying; the stock service remains the only stock source. */
let phoneScreen='home',exploreLanguage='English',exploreQuery='',exploreLimit=18;
let checkoutState={enabled:false,mode:'unavailable',deliveryPence:null};
let checkoutBusy=false,checkoutAttempt=null,lastExploreStockStamp='';
function phoneRoute(){return location.pathname.replace(/\/$/,'')==='/sets'?'explore':location.pathname.replace(/\/$/,'')==='/shop'||location.hash==='#shop'||location.hash.startsWith('#product/')?'shop':'home';}
function phoneSetStock(entry){
 const list=products.filter(p=>p.setKey===entry.key),count=list.filter(isProductInStock).length;
 if(!shopReady)return {label:'Stock not confirmed',count:0,kind:'unknown'};
 return count?{label:count+' in-stock '+(count===1?'product':'products'),count,kind:'in_stock'}:list.every(p=>stockStatus(p)==='out_of_stock')?{label:'Out of stock',count:0,kind:'out_of_stock'}:{label:'Stock to be confirmed',count:0,kind:'unknown'};
}
function exploreEntries(){
 return setEntries.filter(s=>!['all','collections'].includes(s.key)&&(exploreLanguage==='all'||s.language===exploreLanguage)&&browseContext.rank(byId(s.productId),exploreQuery)!==null);
}
function renderExploreSets(){
 if(!get('explore-grid'))return;
 const entries=exploreEntries();get('explore-count').textContent=entries.length+' sets';
 get('explore-grid').innerHTML=entries.length?entries.slice(0,exploreLimit).map(entry=>{
  const stock=phoneSetStock(entry),cards=setHighlights.sets[entry.key]?.cards?.slice(0,3)||[];
  return '<button class="explore-set-card" data-explore-set="'+entry.key+'" aria-label="Explore '+escapeHtml(entry.name)+'"><span class="explore-set-logo">'+setMark(entry)+'</span><span class="explore-card-fan" aria-hidden="true">'+cards.map(card=>'<span>'+chaseCardArtwork(card)+'</span>').join('')+'</span><span class="explore-set-copy"><small>'+languageBadge(byId(entry.productId))+'</small><strong data-title-length="'+(entry.setName.length>30?'long':'regular')+'">'+escapeHtml(entry.setName)+'</strong><span class="explore-release">'+escapeHtml(setReleaseLabel(entry))+'</span><span class="explore-stock" data-kind="'+stock.kind+'">'+escapeHtml(stock.label)+'</span><span class="explore-set-link">Explore set '+icon('arrow')+'</span></span></button>';
 }).join(''):'<div class="explore-empty"><h2>No sets found</h2><p>Try another name or language.</p><button class="text-link" data-clear-explore>Clear filters</button></div>';
 get('explore-more').hidden=entries.length<=exploreLimit;
 get('explore-more').textContent='More sets · '+Math.max(0,entries.length-exploreLimit)+' remaining';
 document.querySelectorAll('[data-explore-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.exploreLanguage===exploreLanguage)));
}
function openExploreSet(key){
 const entry=setEntries.find(s=>s.key===key);if(!entry||!entry.productId)return;
 const p=byId(entry.productId),stock=phoneSetStock(entry),list=products.filter(item=>item.setKey===key),collection=collectionLinkFor(p);
 get('explore-detail').dataset.setKey=key;
 get('explore-detail').innerHTML='<div class="explore-detail-heading">'+setMark(entry)+'<span class="section-kicker">'+escapeHtml(entry.language)+'</span><h2 id="explore-set-title">'+escapeHtml(entry.setName)+'</h2><p>'+escapeHtml(setReleaseLabel(entry))+'</p><p>'+list.length+' '+(list.length===1?'product format':'product formats')+' in the catalogue</p><a class="secondary explore-collect-action" href="'+escapeHtml(collection.href)+'">'+escapeHtml(collection.label)+' '+icon('arrow')+'</a><p class="explore-collection-note">'+escapeHtml(collection.copy)+'</p></div>'+renderSetHighlights(p).replace('id="product-chases"','id="explore-chases"')+'<div class="explore-detail-shop"><p class="explore-stock" data-kind="'+stock.kind+'">'+escapeHtml(stock.label)+'</p><button class="primary" data-shop-explored-set="'+entry.key+'">'+(stock.count?'Shop this set':'View products & register interest')+' '+icon('arrow')+'</button></div>';
 if(!get('explore-set-dialog').open)get('explore-set-dialog').showModal();get('explore-set-dialog').scrollTop=0;
}
function showPhoneScreen(screen,{push=true,scroll=true}={}){
 if(!['home','shop','explore'].includes(screen))return;
 phoneScreen=screen;document.body.dataset.phoneScreen=screen;const footerDetails=get('footer-details');if(footerDetails)footerDetails.open=false;if(screen!=='explore'&&get('explore-set-dialog')?.open)get('explore-set-dialog').close();
 const sections={home:['.home-opening','.stackr-hero','.home-collection','.shop-feature-links'],shop:['.format-browser','.shop-section','.stock-board','.product-guide','.help-section'],explore:['.explore-section']};
 for(const[which,selectors]of Object.entries(sections))for(const selector of selectors)document.querySelectorAll(selector).forEach(node=>node.hidden=which!==screen);
 document.querySelectorAll('[data-screen-nav]').forEach(link=>{if(link.dataset.screenNav===screen)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 const url=screen==='shop'?'/shop':screen==='explore'?'/sets':'/';
 if(push&&location.pathname!==url){rememberBrowseContext(true);history.pushState({...history.state,stackrScreen:screen},'',url);}
 get('search-box').classList.remove('open');get('search-toggle').setAttribute('aria-expanded','false');closeSearchSuggestions();
 if(screen==='explore')renderExploreSets();
 if(screen==='shop'){catalogueView='products';document.querySelectorAll('[data-catalogue-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catalogueView==='products')));renderProducts();}
 if(scroll)window.scrollTo({top:0,behavior:'instant'});
 document.title=screen==='explore'?'Explore Pokémon Sets — StackR':screen==='shop'?'Shop Pokémon — StackR':'StackR — The Card Shop';
}
function updatePhoneStock(){
 if(!window.stackrMobileReady)return;
 const available=products.filter(isProductInStock).length;
 get('live-stock-count').textContent=shopReady?available?available+' products available':'Stock being confirmed':'Stock temporarily unavailable';
 get('live-stock-count').dataset.connected=String(shopReady);
 get('shop-live-status').textContent=shopReady?'Stock checked '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date()):'Unable to check stock';
 const stamp=JSON.stringify([shopReady,...products.map(p=>[liveStock(p.id).status,liveStock(p.id).quantity])]);
 if(phoneScreen==='explore'&&!get('explore-set-dialog').open&&stamp!==lastExploreStockStamp){const focused=document.activeElement?.dataset.exploreSet;renderExploreSets();if(focused)get('explore-grid').querySelector('[data-explore-set="'+focused+'"]')?.focus({preventScroll:true});}lastExploreStockStamp=stamp;
}
async function loadCheckoutConfig(){
 try{const c=await shopApi('/api/checkout/config');checkoutState={enabled:c.enabled===true,mode:c.mode,deliveryPence:Number.isSafeInteger(c.deliveryPence)?c.deliveryPence:null};}
 catch{checkoutState={enabled:false,mode:'unavailable',deliveryPence:null};}
 window.stackrCheckout=checkoutState;renderCart();
}
function pendingCheckoutItems(){
 if(!checkoutAttempt)return null;
 try{const items=JSON.parse(checkoutAttempt.fingerprint);if(!Array.isArray(items))return null;
 const current=Object.entries(state.cart).map(([productId,quantity])=>({productId,quantity})).sort((a,b)=>a.productId.localeCompare(b.productId));
 const prior=items.map(({productId,quantity})=>({productId,quantity})).sort((a,b)=>a.productId.localeCompare(b.productId));
 return JSON.stringify(current)===JSON.stringify(prior)?items:null;
 }catch{return null;}
}
async function startStripeCheckout(){
 if(checkoutBusy)return;
 checkoutBusy=true;renderCart();
 try{
  await Promise.all([loadShopState(true),refreshLivePrices(),loadCheckoutConfig()]);
  if(!checkoutState.enabled){toast('Checkout opens soon. No payment has been taken.');return;}
  const resume=pendingCheckoutItems(),items=resume||Object.entries(state.cart).map(([productId,quantity])=>({productId,quantity,expectedUnitPence:currentQuote(byId(productId))?.shopPence})).sort((a,b)=>a.productId.localeCompare(b.productId));
  if(!items.length||!resume&&items.some(i=>!isProductInStock(byId(i.productId))||cartMaximum(i.productId)<i.quantity||!Number.isSafeInteger(liveStock(i.productId).quantity)||!Number.isSafeInteger(i.expectedUnitPence))){toast('Please check the available quantities and prices in your bag.');return;}
  const fingerprint=JSON.stringify(items);
  if(!checkoutAttempt||checkoutAttempt.fingerprint!==fingerprint){checkoutAttempt={fingerprint,attemptId:crypto.randomUUID()};try{sessionStorage.setItem('stackr-checkout-attempt',JSON.stringify(checkoutAttempt));}catch{}}
  const result=await shopApi('/api/checkout',{method:'POST',body:JSON.stringify({items,attemptId:checkoutAttempt.attemptId})});
  const destination=new URL(result.url,location.origin);if(destination.protocol!=='https:'||destination.hostname!=='checkout.stripe.com')throw Error('The secure payment page could not be verified.');
  window.location.assign(destination.href);
 }catch(error){if(['checkout_expired','checkout_closed','price_changed','stock_changed','attempt_conflict'].includes(error.code)){checkoutAttempt=null;try{sessionStorage.removeItem('stackr-checkout-attempt');}catch{}}toast(error.message||'Checkout could not open. Please try again.');await loadShopState(true);}
 finally{checkoutBusy=false;renderCart();}
}
async function confirmCheckoutReturn(){
 const params=new URLSearchParams(location.search),sessionId=params.get('session_id');
 if(params.get('checkout')==='cancelled'){toast('Checkout cancelled. Your bag is still here.');history.replaceState(history.state,'','/shop');return;}
 if(!sessionId||!/^cs_(?:test_|live_)?[A-Za-z0-9_]{10,200}$/.test(sessionId))return;
 openInfo('Checking your payment','<p role="status">Confirming your payment with Stripe…</p>');
 try{
  const result=await shopApi('/api/checkout/status?session_id='+encodeURIComponent(sessionId));
  if(result.status==='paid'){
   // A local storage failure must not overturn a server-confirmed payment.
   try{
    const attempt=JSON.parse(sessionStorage.getItem('stackr-checkout-attempt')||'null');
    if(attempt?.attemptId===result.attemptId){
     const purchased=JSON.parse(attempt.fingerprint);
     if(Array.isArray(purchased)&&purchased.every(item=>item&&byId(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=customerLimit)){
      for(const item of purchased){const left=(state.cart[item.productId]||0)-item.quantity;if(left>0)state.cart[item.productId]=left;else delete state.cart[item.productId];}persist();
     }
     checkoutAttempt=null;sessionStorage.removeItem('stackr-checkout-attempt');
    }
   }catch{}
   openInfo('Payment confirmed','<div class="interest-success">'+(result.mode==='test'?'Test payment confirmed.':'Your payment is confirmed.')+'</div><p>'+escapeHtml(result.mode==='test'?'This was a Stripe test. No money was charged.':'Your order is recorded. Keep your Stripe receipt for your records.')+'</p><button class="primary" data-close>Continue browsing '+icon('arrow')+'</button>');
  }else openInfo('Payment not confirmed','<p>Your payment is '+escapeHtml(result.status)+'. Your bag has been kept. Please check before trying another payment.</p><button class="primary" data-close>Return to shop</button>');
  await loadShopState(true);renderCart();
 }catch{openInfo('Unable to confirm payment','<p>We could not check the payment yet. Check your Stripe receipt before trying another payment.</p><button class="primary" data-retry-payment>Check payment again</button><p>For help, email <a href="mailto:Hello@StackrTCG.com">Hello@StackrTCG.com</a> with your order or Stripe receipt reference.</p>');}
}
function initPhoneCommerce(){
 document.body.insertAdjacentHTML('beforeend','<nav class="phone-tabbar" aria-label="StackR navigation"><a href="/" data-screen-nav="home">'+icon('store')+'<span>Home</span></a><a href="/shop" data-screen-nav="shop">'+icon('box')+'<span>Shop</span></a><a href="/sets" data-screen-nav="explore">'+icon('search')+'<span>Sets</span></a><a href="/collection">'+icon('heart')+'<span>Collect</span></a><button data-open-cart>'+icon('bag')+'<span>Bag <b data-cart-count>0</b></span></button></nav><dialog id="explore-set-dialog" class="explore-set-dialog" aria-labelledby="explore-set-title"><div class="explore-sheet-bar"><span>Explore sets</span><button data-close aria-label="Close set">'+icon('close')+'</button></div><div id="explore-detail"></div></dialog>');
 const languages=['all','English','Japanese','Simplified Chinese','Korean'];
 get('explore-languages').innerHTML=languages.map(value=>'<button data-explore-language="'+value+'" aria-pressed="'+(value===exploreLanguage)+'">'+(value==='all'?'All languages':value==='Simplified Chinese'?'Chinese':value)+'</button>').join('');
 const firstRoute=phoneRoute();if(!initialBrowseSnapshot&&!browseRestoreInProgress&&!location.hash.startsWith('#product/'))availability='all';catalogueView='products';get('availability-filter').value=availability;
 try{const attempt=JSON.parse(sessionStorage.getItem('stackr-checkout-attempt')||'null');if(attempt&&typeof attempt.fingerprint==='string'&&/^[\da-f-]{36}$/.test(attempt.attemptId))checkoutAttempt=attempt;}catch{}
 window.stackrMobileReady=true;window.stackrMobileRefresh=updatePhoneStock;window.stackrPendingCheckout=pendingCheckoutItems;window.stackrCheckoutBusy=()=>checkoutBusy;
 const linkedShopKey=new URLSearchParams(location.search).get('set');if(firstRoute==='shop'&&setEntries.some(s=>s.key===linkedShopKey&&!['all','collections'].includes(s.key))){availability='all';get('availability-filter').value=availability;chooseSet(linkedShopKey);}
 showPhoneScreen(firstRoute,{push:false,scroll:false});updateCounts();updatePhoneStock();loadCheckoutConfig();confirmCheckoutReturn();
 if(location.hash==='#bag'){renderCart();get('cart-dialog').showModal();history.replaceState(history.state,'','/shop');}
 if(location.hash==='#delivery'){openStoreInfo('delivery');history.replaceState(history.state,'','/shop');}
 get('explore-search').addEventListener('input',event=>{exploreQuery=event.target.value;exploreLimit=18;renderExploreSets();});
 document.addEventListener('click',event=>{
  const target=event.target.closest('a,button');if(!target)return;
  if(target.dataset.screenNav){if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(target.dataset.screenNav==='shop')reset();showPhoneScreen(target.dataset.screenNav);}
  if(target.dataset.exploreSet)openExploreSet(target.dataset.exploreSet);
  if(target.hasAttribute('data-retry-payment'))confirmCheckoutReturn();
  if(target.hasAttribute('data-clear-explore')){exploreQuery='';exploreLanguage='English';exploreLimit=18;get('explore-search').value='';renderExploreSets();}
  if(target.dataset.exploreLanguage){exploreLanguage=target.dataset.exploreLanguage;exploreLimit=18;renderExploreSets();}
  if(target.id==='explore-more'){const before=exploreLimit;exploreLimit+=18;renderExploreSets();get('explore-grid').children[before]?.focus({preventScroll:true});}
  if(target.dataset.shopExploredSet){get('explore-set-dialog').close();availability=phoneSetStock(setEntries.find(s=>s.key===target.dataset.shopExploredSet)).count?'in_stock':'all';get('availability-filter').value=availability;chooseSet(target.dataset.shopExploredSet);showPhoneScreen('shop');}
  if(target.hasAttribute('data-stock-refresh')){target.disabled=true;loadShopState(true).finally(()=>{target.disabled=false;updatePhoneStock();});}
 });
 // Existing format, set, search and saved controls also lead into the shopping screen.
 document.addEventListener('click',event=>{if(event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const target=event.target.closest('[data-reset],[data-set],[data-category],[data-filter-link],#search-toggle,#saved-toggle,#search-submit,#mobile-saved,a[href="#shop"],a[href="#start-here"]');if(target&&!target.hasAttribute('data-screen-nav'))showPhoneScreen('shop',{scroll:false});},true);
 get('search').addEventListener('focus',()=>{if(phoneScreen!=='shop')showPhoneScreen('shop',{scroll:false});});
 window.addEventListener('popstate',()=>showPhoneScreen(history.state?.stackrScreen||phoneRoute(),{push:false,scroll:false}));
 window.addEventListener('focus',()=>loadShopState(true));
}
