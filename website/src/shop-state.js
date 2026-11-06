/* Server-backed stock and product interest. Browser storage never holds enquiries. */
let shopState={products:{},visitor:{signedIn:false,isOwner:false},interests:[]};
let shopReady=false,shopRequest=null,availability='all',adminDemand=null,adminLimit=60;
let shopReadGeneration=0;
let shopPrivateEpoch=0;
let infoViewGeneration=0,shopTimer,interestReturnProduct=null;
function clearPrivateShopData(invalidate=false){
 shopPrivateEpoch++;
 if(invalidate){shopReadGeneration++;shopRequest=null;}
 adminDemand=null;shopState.visitor={signedIn:false,isOwner:false,email:''};shopState.interests=[];
 for(const item of Object.values(shopState.products))delete item.note;
 const admin=get('shop-admin-dialog');if(admin?.open)admin.close();
 if(get('admin-demand'))get('admin-demand').innerHTML='';if(get('admin-stock-list'))get('admin-stock-list').innerHTML='';
 if(get('interest-form')||get('interest-feedback')){get('info-dialog').close();get('info-content').innerHTML='';}
 if(get('manage-shop'))get('manage-shop').hidden=true;if(get('owner-portal-link'))get('owner-portal-link').hidden=true;
}
function liveStock(id){return shopState.products[id]||{status:'unknown',quantity:null,updatedAt:null};}
function matchesAvailability(p){return availability==='all'||stockStatus(p)===availability;}
function interestButton(p){
 const registered=shopState.interests.includes(p.id);
 return '<button class="interest-button '+(registered?'is-registered':'')+'" data-interest="'+p.id+'" aria-label="'+(registered?'Manage interest in ':'Register interest in ')+escapeHtml(p.name+' '+p.type+' '+p.language)+'">'+(registered?'Interest registered':'Register interest')+icon('arrow')+'</button>';
}
async function shopApi(path,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('The shop could not confirm this request. Please sign in again or retry.');
  const data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.message||({sign_in_required:'Please sign in again.',owner_required:'Only the shop owner can make this change.',storage_unavailable:'The register is temporarily unavailable. No change has been confirmed.'}[data.error])||'The shop could not save this change. Please try again.'),{code:data.error});
  if(options.method&&options.method!=='GET'&&data.ok!==true)throw Error('The shop did not confirm the change.');
  return data;
 }finally{clearTimeout(timeout);}
}
function updateShopSurfaces(){
 const searchOpen=!get('search-suggestions').hidden;
 renderProducts();renderCart();renderStockBoard();syncOpenProductStock();if(!searchOpen)closeSearchSuggestions();
 if(typeof renderOpeningProduct==='function')renderOpeningProduct();
 document.querySelectorAll('[data-interest]').forEach(button=>{const p=byId(button.dataset.interest);if(p)button.outerHTML=interestButton(p);});
 document.querySelectorAll('[data-product-stock]').forEach(button=>{button.textContent=stockLabel(button.dataset.productStock);});
 document.querySelectorAll('[data-add]').forEach(button=>{const p=byId(button.dataset.add);if(p)button.disabled=(state.cart[p.id]||0)>=cartMaximum(p.id);});
 const manage=get('manage-shop');if(manage)manage.hidden=!shopReady||!shopState.visitor.isOwner;const portal=get('owner-portal-link');if(portal)portal.hidden=!shopReady||!shopState.visitor.isOwner;
 const status=get('shop-connection');if(status)status.textContent=shopReady?'Availability up to date':'Stock service unavailable';
 if(window.stackrMobileRefresh)window.stackrMobileRefresh();
}
async function loadShopState(force=false){
 if(shopRequest&&!force)return shopRequest;
 if(location.protocol==='file:'){shopReady=false;return false;}
 const generation=++shopReadGeneration;
 shopRequest=(async()=>{
  try{
   const next=await shopApi('/api/shop');
   if(generation!==shopReadGeneration)return false;
   if(!next.products||typeof next.products!=='object'||!Array.isArray(next.interests)||!next.visitor)throw Error('Invalid stock response');
   const clean={};
   for(const p of products){const item=next.products[p.id];if(!item||!['in_stock','out_of_stock','unknown'].includes(item.status))throw Error('Invalid stock state');
    if(item.quantity!==null&&(!Number.isSafeInteger(item.quantity)||item.quantity<0))throw Error('Invalid stock quantity');
    clean[p.id]={...item};
   }
   if(shopState.visitor.email!==next.visitor.email||shopState.visitor.isOwner!==next.visitor.isOwner)clearPrivateShopData();
   shopState={products:clean,visitor:{signedIn:next.visitor.signedIn===true,isOwner:next.visitor.isOwner===true,email:typeof next.visitor.email==='string'?next.visitor.email:''},interests:next.interests.filter(id=>byId(id))};
   shopReady=true;updateShopSurfaces();return true;
  }catch{if(generation!==shopReadGeneration)return false;shopReady=false;clearPrivateShopData();updateShopSurfaces();return false;}
 })().finally(()=>{if(generation===shopReadGeneration)shopRequest=null;});return shopRequest;
}
function showInterest(id){
 const p=byId(id);if(!p)return;
 const registered=shopState.interests.includes(id);
 let body='<div class="interest-product-summary"><div class="interest-product-photo">'+productPhoto(p,'eager')+'</div><div class="interest-product-copy">'+setMark(p)+'<p class="interest-product">'+escapeHtml(p.name)+'<span>'+escapeHtml(p.type+' · '+p.language)+'</span></p><small>'+stockLabel(id)+'</small></div></div>';
 if(location.protocol==='file:')body+='<p>Open the live shop to register your interest.</p><a class="primary" href="https://stackr-private-exchange-concept.berridge14.chatgpt.site/#product/'+encodeURIComponent(id)+'">Open live shop '+icon('arrow')+'</a>';
 else if(!shopReady)body+='<p>The interest register is temporarily unavailable. Nothing has been submitted.</p><button class="primary" data-retry-shop>Try again</button>';
 else if(!shopState.visitor.signedIn)body+='<p>Sign in to record your interest and manage it later.</p><a class="primary" href="/signin-with-chatgpt?return_to='+encodeURIComponent('/#product/'+id)+'" target="_top">Sign in with ChatGPT '+icon('arrow')+'</a>';
 else if(registered)body+='<div class="interest-success">Your interest is registered.</div><p>It helps us decide what to stock. This is not an order or a stock reservation.</p><button class="text-link" data-withdraw-interest="'+id+'">Withdraw my interest</button><p role="status" id="interest-feedback"></p>';
 else body+='<form id="interest-form" data-product="'+id+'"><label>Email<input type="email" value="'+escapeHtml(shopState.visitor.email)+'" readonly required></label><label>How many would you consider?<select name="quantity"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><label class="consent-line"><input type="checkbox" name="consent" required><span>Save my email and interest in this product so StackR can plan stock and contact me about its availability.</span></label><p class="form-note">No payment or reservation. You can withdraw your interest here at any time. Updates are not sent automatically.</p><button class="primary" type="submit">Register my interest '+icon('arrow')+'</button><p role="status" id="interest-feedback"></p></form>';
 const contents=renderContents(p).replaceAll('id="product-contents"','id="interest-contents"').replaceAll('id="contents-title"','id="interest-contents-title"').replaceAll('aria-labelledby="contents-title"','aria-labelledby="interest-contents-title"');
 body+='<details class="interest-product-details"><summary>Product details &amp; contents '+icon('chevron')+'</summary><p>'+escapeHtml(p.description)+'</p>'+contents+renderSetHighlights(p).replace('id="product-chases"','id="interest-chases"')+'</details>';
 if(currentQuote(p))body+=priceShareButton(p);
 if(get('quick-dialog').open){interestReturnProduct=id;get('quick-dialog').close();}
 if(interestReturnProduct===id)body='<button type="button" class="text-link interest-back" data-interest-back>← Back to product</button>'+body;
 openInfo('Register interest',body);
}
async function submitInterest(form){
 const epoch=shopPrivateEpoch,view=infoViewGeneration;
 const feedback=get('interest-feedback'),button=form.querySelector('[type=submit]');button.disabled=true;feedback.textContent='Saving your interest…';
 try{
  const expectedEmail=form.querySelector('[type=email]').value;
  if(!await loadShopState(true)||shopState.visitor.email!==expectedEmail)throw Error('Your sign-in changed. Reopen this product to confirm your interest.');
  if(epoch!==shopPrivateEpoch)return;
  const quantity=Number(new FormData(form).get('quantity'));
  const saved=await shopApi('/api/interests',{method:'POST',body:JSON.stringify({productId:form.dataset.product,quantity,consent:new FormData(form).get('consent')==='on'})});
  if(epoch!==shopPrivateEpoch)return;
  if(saved.productId!==form.dataset.product||saved.interested!==true||saved.quantity!==quantity)throw Error('The interest registration was not confirmed.');
  shopState.interests=[...new Set([...shopState.interests,form.dataset.product])];
  productFeedback('success');
  const loaded=await loadShopState(true);if(epoch!==shopPrivateEpoch)return;if(view!==infoViewGeneration||!get('info-dialog').open||!form.isConnected){toast('Your interest was registered.');return;}if(loaded)showInterest(form.dataset.product);else openInfo('Interest saved','<div class="interest-success">Your interest was saved.</div><p>Availability could not be reloaded. Refresh the shop to manage your registration.</p>');
 }catch(error){if(epoch===shopPrivateEpoch&&view===infoViewGeneration){feedback.textContent=error.message;button.disabled=false;}}
}
async function withdrawInterest(id){
 const epoch=shopPrivateEpoch,view=infoViewGeneration;
 const feedback=get('interest-feedback');if(feedback)feedback.textContent='Withdrawing…';
 try{const saved=await shopApi('/api/interests',{method:'DELETE',body:JSON.stringify({productId:id})});if(epoch!==shopPrivateEpoch)return;if(saved.productId!==id||saved.interested!==false)throw Error('The withdrawal was not confirmed.');shopState.interests=shopState.interests.filter(productId=>productId!==id);await loadShopState(true);if(epoch!==shopPrivateEpoch)return;if(view!==infoViewGeneration||!get('info-dialog').open){toast('Your interest was withdrawn.');return;}openInfo('Interest withdrawn','<p>Your interest in this product has been removed.</p>');}catch(error){if(epoch===shopPrivateEpoch&&view===infoViewGeneration&&feedback)feedback.textContent=error.message;}
}
function stockAdminRows(){
 const term=(get('admin-search')?.value||'').trim().toLowerCase(),wanted=get('admin-status-filter')?.value||'all';
 const list=products.filter(p=>(wanted==='all'||liveStock(p.id).status===wanted)&&(!term||[p.name,p.type,p.language,p.reference].join(' ').toLowerCase().includes(term)));
 get('admin-stock-list').innerHTML=list.slice(0,adminLimit).map(p=>{const s=liveStock(p.id);return '<form class="admin-stock-row" data-stock-form="'+p.id+'"><div><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.type+' · '+p.language)+'</small></div><label><span>Status</span><select name="status">'+[['unknown','Stock not set'],['in_stock','In stock'],['out_of_stock','Out of stock']].map(([value,label])=>'<option value="'+value+'" '+(s.status===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label><span>Available quantity</span><input name="quantity" type="number" min="0" max="99999" step="1" value="'+(s.quantity??'')+'" placeholder="Not counted"></label><label><span>Private note</span><input name="note" maxlength="500" value="'+escapeHtml(s.note||'')+'" placeholder="Optional"></label><button type="submit" class="admin-save">Save</button><output role="status"></output></form>';}).join('')||'<p>No products match.</p>';
 get('admin-product-count').textContent=Math.min(adminLimit,list.length)+' / '+list.length+' products';
 if(list.length>adminLimit)get('admin-stock-list').insertAdjacentHTML('beforeend','<button type="button" class="load-more-products" id="more-admin-products">Show more products</button>');
}
function renderDemand(){
 const data=adminDemand||{products:[],registrations:[]};
 const ranked=[...data.products].filter(x=>byId(x.productId)).sort((a,b)=>b.people-a.people||b.units-a.units);
 get('admin-demand').innerHTML='<div class="demand-heading"><div><h3>What people want</h3><p>Unique registrations and requested quantities. These are expressions of interest.</p></div><button class="text-link" id="export-interest" '+(!data.registrations.length?'disabled':'')+'>Export CSV '+icon('arrow')+'</button></div>'+(data.hasMore?'<p class="admin-limit-note">Showing the newest '+Number(data.registrationLimit||1000)+' contacts. Product demand counts include every registration. The CSV export has the same contact limit.</p>':'')+(ranked.length?'<div class="demand-grid">'+ranked.map(item=>{const p=byId(item.productId);return '<article><span>'+escapeHtml(p.language)+'</span><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.type)+'</small><p><b>'+Number(item.people)+'</b> interested · '+Number(item.units)+' units</p></article>';}).join('')+'</div>':'<p class="admin-empty">No interest registrations yet. Counts will appear when visitors register.</p>')+'<details><summary>View registered contacts</summary><div class="interest-table-wrap"><table><thead><tr><th>Product</th><th>Email</th><th>Quantity</th><th>Registered</th></tr></thead><tbody>'+data.registrations.map(row=>{const p=byId(row.productId);return '<tr><td>'+escapeHtml(p?p.name+' · '+p.language:row.productId)+'</td><td>'+escapeHtml(row.email)+'</td><td>'+Number(row.quantity)+'</td><td>'+escapeHtml(new Date(row.createdAt).toLocaleDateString('en-GB'))+'</td></tr>';}).join('')+'</tbody></table></div></details>';
}
async function openShopAdmin(){
 if(!shopReady||!shopState.visitor.isOwner)return;
 const epoch=shopPrivateEpoch,email=shopState.visitor.email;
 get('admin-error').textContent='';stockAdminRows();get('shop-admin-dialog').showModal();
 try{const demand=await shopApi('/api/admin/interests');if(epoch!==shopPrivateEpoch||!shopReady||!shopState.visitor.isOwner||shopState.visitor.email!==email)return;if(!Array.isArray(demand.products)||!Array.isArray(demand.registrations))throw Error('Interest report could not be confirmed.');adminDemand=demand;renderDemand();}catch(error){if(epoch===shopPrivateEpoch)get('admin-error').textContent=error.message;}
}
async function saveStock(form){
 const values=new FormData(form),output=form.querySelector('output'),button=form.querySelector('button'),status=values.get('status');
 const raw=String(values.get('quantity')).trim(),quantity=status==='out_of_stock'?0:status==='unknown'?null:raw===''?null:Number(raw);
 output.textContent='Saving…';button.disabled=true;
 try{
  const result=await shopApi('/api/admin/stock',{method:'PATCH',body:JSON.stringify({productId:form.dataset.stockForm,status,quantity,note:String(values.get('note')||'')})});
  if(result.productId!==form.dataset.stockForm||result.product?.status!==status||result.product?.quantity!==quantity)throw Error('The stock change was not confirmed.');
  if(!await loadShopState(true))throw Error('Saved, but stock could not be reloaded. Refresh before making another change.');
  const saved=liveStock(form.dataset.stockForm);form.elements.quantity.value=saved.quantity??'';form.elements.status.value=saved.status;output.textContent='Saved';
 }catch(error){output.textContent=error.message;}finally{button.disabled=false;}
}
async function exportInterests(){
 const epoch=shopPrivateEpoch;
 try{
  const response=await fetch('/api/admin/interests?format=csv',{credentials:'same-origin',cache:'no-store'});if(!response.ok||response.redirected||!/^text\/csv(?:\s*;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('Export unavailable');
  if(epoch!==shopPrivateEpoch||!shopReady||!shopState.visitor.isOwner)return;
  if(response.headers.get('X-Export-Truncated')==='true')get('admin-error').textContent='This export contains the newest 1,000 contacts. Product totals include all registrations.';
  const blob=await response.blob();if(epoch!==shopPrivateEpoch||!shopReady||!shopState.visitor.isOwner)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='StackR_Product_Interest.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){if(epoch===shopPrivateEpoch)get('admin-error').textContent=error.message;}
}
function chaseCardArtwork(card,loading='lazy'){
 const c=card.crop,alt=escapeHtml(card.name+' '+card.number+' · '+card.language);
 if(!card.image||card.displayImagePending)return '<span class="chase-photo-pending">Clean card image pending</span>';
 const style=c?' style="position:absolute;width:'+(c.sourceWidth/c.width*100)+'%;height:auto;max-width:none;left:'+(-c.x/c.width*100)+'%;top:'+(-c.y/c.height*100)+'%"':'';
 const picture='<img data-chase-photo src="'+escapeHtml(card.image)+'" alt="'+alt+'" loading="'+loading+'" width="'+(c?c.sourceWidth:card.imageWidth||733)+'" height="'+(c?c.sourceHeight:card.imageHeight||1024)+'"'+style+'>';
 return '<span class="chase-picture">'+(c?'<span class="chase-crop" style="--card-ratio:'+(c.width/c.height)+';aspect-ratio:'+c.width+'/'+c.height+'">'+picture+'</span>':picture)+'</span><span class="chase-photo-pending" hidden>Card photo unavailable</span>';
}
function collectionLinkFor(p){
 const language={English:'en',Japanese:'ja','Simplified Chinese':'zh-cn','Traditional Chinese':'zh-tw',Korean:'ko'}[p.language]||'en',link=setCollectionLinks.matches[p.setKey];
 if(p.setKey==='collections')return {href:'/collection#library',label:'Your binders',copy:'Keep your selected cards in a personal binder.'};
 if(link&&link.language===language&&link.binderReady===true)return {href:'/collection?set='+encodeURIComponent(link.setId)+'&language='+encodeURIComponent(language),label:'Collect this set',copy:'Open your binder or start this set’s checklist.'};
 return {href:'/collection#sets',label:'View collector binders',copy:'Choose a set with a custom StackR cover.'};
}
function renderSetHighlights(p){
 const candidate=setHighlights.sets[p.setKey],entry=candidate?.language===p.language?candidate:null;
 const cards=entry?.cards||[];
 const heading=cards.length===3?'3 collector picks':'Collector picks';
 const title=escapeHtml(p.setName||p.name);
 const gallery=cards.length?'<p class="chase-gallery-hint">Swipe to view the cards. Tap to rotate.</p><div class="chase-cards" role="region" aria-label="Three collector picks" tabindex="0">'+cards.slice(0,3).map(card=>{
  return '<button class="chase-card-button" data-card-set="'+escapeHtml(p.setKey)+'" data-card-id="'+escapeHtml(card.id)+'" aria-label="Inspect '+escapeHtml(card.name+' '+card.number+' '+p.language)+'">'+chaseCardArtwork(card)+'<strong>'+escapeHtml(card.name)+'</strong><small>'+escapeHtml(card.number)+' · '+escapeHtml(p.language)+'</small><span class="chase-inspect">'+(card.displayImagePending?'View card details':'Rotate card')+' '+icon('arrow')+'</span></button>';
 }).join('')+'</div>':'<p class="set-empty">'+(p.setKey==='collections'?(p.packs===0?'This fixed product is not one expansion. See its listed contents.':'This product contains packs from several expansions. See the contents for its pack selection.'):'Exact-language chase cards are being verified for this set.')+'</p>';
 const app=setHighlights.app||{};
 const linked=collectionLinkFor(p);
 const action='<a class="primary" href="'+escapeHtml(linked.href)+'">'+escapeHtml(linked.label)+' '+icon('arrow')+'</a><p>'+escapeHtml(linked.copy)+'</p>'+(app.url&&app.status==='verified-public'?'<a href="'+escapeHtml(app.url)+'" target="_blank" rel="noreferrer">StackR app</a>':'');
 return '<section class="set-highlights" id="product-chases" tabindex="-1" aria-label="'+title+' chase cards"><div class="contents-heading"><div><span class="section-kicker">Set: '+title+'</span><h3>'+heading+'</h3></div><span>'+escapeHtml(p.language)+'</span></div>'+gallery+(cards.length?'<p class="chase-method">Collector picks · not a current price ranking. Booster contents are random.</p>':'')+'<div class="app-set-cta"><img src="assets/stackr-mark-original.png" alt="" width="48" height="54"><div><h3>Your collection</h3>'+action+'</div></div></section>';
}
function initShopState(){
 get('availability-controls').innerHTML='<div class="shop-state-toolbar"><label for="availability-filter">Availability</label><select id="availability-filter"><option value="all">All products</option><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="unknown">Availability to be confirmed</option></select><small id="shop-connection">Loading stock…</small><button id="manage-shop" class="manage-shop" hidden>Manage stock & interest '+icon('arrow')+'</button><a id="owner-portal-link" class="manage-shop" href="/owner" hidden>Business portal</a></div>';
 document.body.insertAdjacentHTML('beforeend','<dialog id="shop-admin-dialog" class="shop-admin-dialog" aria-labelledby="shop-admin-title"><div class="dialog-head"><div><span class="dialog-kicker">Owner controls</span><h2 id="shop-admin-title">Stock & interest</h2></div><button class="close-dialog" data-close aria-label="Close shop management">'+icon('close')+'</button></div><div class="shop-admin-body"><p class="admin-intro">Set your actual shop availability here. Supplier availability does not set your stock. Saving a stock status does not open checkout or take payments.</p><p id="admin-error" role="status"></p><div class="admin-stock-tools"><label>Find a product<input id="admin-search" type="search" placeholder="Set, format or language"></label><label>Show<select id="admin-status-filter"><option value="all">All statuses</option><option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="unknown">Stock not set</option></select></label><span id="admin-product-count"></span></div><div id="admin-stock-list"></div><section id="admin-demand"></section></div></dialog>');
 get('info-dialog').addEventListener('close',()=>{if(!interestReturnProduct)return;const id=interestReturnProduct;interestReturnProduct=null;if(location.hash==='#product/'+encodeURIComponent(id)){quick(id);get('quick-body').querySelector('[data-interest]')?.focus({preventScroll:true});}});
 window.addEventListener('popstate',()=>{if(interestReturnProduct&&location.hash!=='#product/'+encodeURIComponent(interestReturnProduct)){interestReturnProduct=null;get('info-dialog').close();}});
 document.addEventListener('click',event=>{if(event.target.closest('[data-interest-back]'))get('info-dialog').close();});
 get('availability-filter').addEventListener('change',event=>{availability=event.target.value;renderProducts();});
 get('manage-shop').addEventListener('click',openShopAdmin);
 get('admin-search').addEventListener('input',()=>{adminLimit=60;stockAdminRows();});get('admin-status-filter').addEventListener('change',()=>{adminLimit=60;stockAdminRows();});
 document.addEventListener('submit',event=>{if(event.target.id==='interest-form'){event.preventDefault();submitInterest(event.target);}if(event.target.hasAttribute('data-stock-form')){event.preventDefault();saveStock(event.target);}});
 document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.interest)showInterest(button.dataset.interest);if(button.dataset.withdrawInterest)withdrawInterest(button.dataset.withdrawInterest);if(button.hasAttribute('data-retry-shop'))loadShopState().then(ok=>{if(ok)get('info-dialog').close();});if(button.id==='more-admin-products'){adminLimit+=60;stockAdminRows();}if(button.id==='export-interest')exportInterests();if(button.hasAttribute('data-app-details'))openInfo('StackR app','<p>View sets and manage your collection in the StackR app.</p><p>'+escapeHtml(setHighlights.app?.message||'A public App Store download is not yet verified. We’ll add the download link when it is available.')+'</p>');});
 const startTimer=()=>{clearInterval(shopTimer);shopTimer=setInterval(()=>{if(!document.hidden)loadShopState();},30000);};
 loadShopState();startTimer();document.addEventListener('visibilitychange',()=>{if(document.hidden){shopReady=false;clearPrivateShopData(true);}else loadShopState(true);});
 window.addEventListener('pagehide',()=>{clearInterval(shopTimer);shopReady=false;clearPrivateShopData(true);});window.addEventListener('pageshow',event=>{if(event.persisted){startTimer();loadShopState(true);}});
}
