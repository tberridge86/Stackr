
// Expansion dates are sourced separately: a later bundle or ETB is not a new set.
function setReleaseDate(entry){return setReleaseDates[entry.key||entry.setKey]?.releaseDate||null;}
function compareSetReleases(a,b){
 const aKey=a.key||a.setKey,bKey=b.key||b.setKey;
 if(aKey===bKey)return 0;
 if(aKey==='collections'||bKey==='collections')return aKey==='collections'?1:-1;
 const x=setReleaseDate(a),y=setReleaseDate(b);
 return Number(!x)-Number(!y)||(x&&y?y.localeCompare(x):0)||(a.setName||a.name||aKey).localeCompare(b.setName||b.name||bKey,'en-GB')||aKey.localeCompare(bKey,'en-GB');
}
function setReleaseLabel(entry){
 const date=setReleaseDate(entry);
 return date?'Set release: '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')):'Set release date unconfirmed';
}
const setOrder=[...new Set(products.map(p=>p.setKey))].filter(key=>key!=='collections');
const setEntries=[{key:'all',name:'All sets',count:products.length},...setOrder.map(key=>{
 const first=products.find(p=>p.setKey===key);
 return {key,setName:first.setName||first.name,reference:first.reference,name:(first.setName||first.name)+(first.language!=='English'?' · '+first.language:''),language:first.language,productId:first.id,logo:first.setLogo,logoCrop:first.setLogoCrop,logoIsolation:first.setLogoIsolation,count:products.filter(p=>p.setKey===key).length};
}).sort(compareSetReleases),{key:'collections',setName:'Mixed-set collections',name:'Mixed-set products',productId:'charizard-upc',count:products.filter(p=>p.setKey==='collections').length}];
function matchesSet(p,key){return key==='all'||p.setKey===key;}
function packText(p,full=false){return p.packs===0?'No booster packs':p.packs+' '+(full?'booster ':'')+(p.packs===1?'pack':'packs');}
function renderSetNavigation(){
 renderCatalogueNavigation();
 const setNav=get('set-nav');if(setNav)setNav.innerHTML=setEntries.filter(entry=>entry.key==='all'||(entry.key==='collections'?(language==='all'||language==='English'):language==='all'||entry.language===language)).map(entry=>{
  const active=setKey===entry.key;
  const content=entry.key==='all'?'<span>All sets</span><span>'+products.filter(matchesLanguage).length+' products</span>':setMark(entry)+'<small>'+escapeHtml(entry.language||'Mixed-set collections')+'</small>';
  return '<button class="set-tab '+(entry.key==='all'?'set-all':entry.key==='collections'?'set-collections':'')+'" data-set="'+entry.key+'" aria-label="'+(entry.key==='all'?'Show all products':'Shop '+escapeHtml(entry.name))+'" aria-pressed="'+active+'">'+content+'</button>';
 }).join('');
 document.querySelectorAll('[data-catalog-count]').forEach(el=>{el.textContent=products.length;});
}
function setBadge(p){
 return '<button class="set-badge '+(!p.setLogo?'set-code-badge':'')+'" data-set="'+p.setKey+'" aria-label="Browse '+escapeHtml(p.setName||p.name)+' products">'+setMark(p)+'</button>';
}
function renderFeature(p){
 if(!p||!get('featured-product'))return;
 const name=escapeHtml(p.name),type=escapeHtml(p.type),full=escapeHtml(p.name+' '+p.type);
 const mark=p.setLogo?'<img class="hero-set-mark" src="'+p.setLogo+'" alt="'+escapeHtml(p.setName)+' expansion logo" width="458" height="232">':'<span class="hero-set-mark collection-heading">Pokémon TCG</span>';
 get('featured-product').innerHTML='<div class="hero-topline"><strong>Featured product</strong><span>'+escapeHtml(p.series)+'</span></div>'+
 '<div class="hero-product-stage">'+mark+'<button class="hero-art-button" data-quick="'+p.id+'" aria-label="Inspect '+full+'">'+productPhoto(p,'eager')+'</button><span class="hero-edition">'+(p.category==='ETBs'?'Standard retail edition':'One retail unit')+'</span></div>'+
 '<div class="hero-caption"><div><h2 id="hero-title">'+name+'</h2><p>'+type+' · '+packText(p)+' · '+escapeHtml(p.language)+'</p></div>'+pricePair(p)+
 '<div class="hero-bottomline"><span>Preview only · Stock unverified</span><button class="hero-detail" data-quick="'+p.id+'">View product '+icon('arrow')+'</button></div></div>';
}
function chooseSet(key,keepFormat=false){
 const entry=setEntries.find(s=>s.key===key);if(!entry)return;
 setKey=key;if(!keepFormat){category='All';priceRange='all';get('budget').value='all';}onlySaved=false;query='';get('search').value='';
 if(entry.language&&language!=='all'&&entry.language!==language)language=entry.language;
 renderSetNavigation();renderFeature(byId(entry.productId||'asc-etb'));renderProducts();
}
function clearSetFilter(){setKey='all';renderSetNavigation();}
function openStoreInfo(key){
 const close='<button class="primary" data-close>Continue browsing '+icon('arrow')+'</button>';
 const content={
  preview:{title:'About this store preview',body:'<div class="info-card">This is a design preview. No orders or payments are taken.</div><p>The catalogue contains '+products.length+' identified Pokémon products across English, Japanese, Simplified Chinese and Korean editions. Dated UK retail references support a StackR price 10% lower where an exact current match is available. Open the reference beside a price to inspect its source.</p><p>Your bag and saved products stay in this browser. Stock declarations and interest registrations are saved by the shop. Orders and payments are not open.</p><p>Product artwork is recorded from official Pokémon pages, Asmodee UK and verified retailer galleries. Some photographs need an internet connection.</p>'},
  about:{title:'The story of Stackr',body:'<p>Stackr began with Jack and his son collecting Pokémon together, and an incomplete Neo collection from QVC finding its way back out of storage.</p><p>We work with reputable wholesalers for English and international Pokémon TCG products. Our aim is <strong>10% below a checked UK retail reference, reviewed weekly</strong>, and to keep products available for people who love collecting.</p><p>Read Jack’s story in the About Stackr section.</p><div class="info-card">Orders and payments are not open.</div>'},
  pricing:{title:'How our prices are checked',body:'<p>Our aim is <strong>10% below a checked UK retail reference</strong>, reviewed every Monday at 09:00 UK time.</p><p>Each comparison must match the exact product, language, edition, pack count and retail unit. The reference is the lowest in-stock GBP retail asking price among the sources shown, including VAT and excluding delivery.</p><p><strong>A retail asking price is not a completed-sale valuation.</strong> Last-sold information is not connected. Source links, the date checked and the next review are available beside each product price.</p><p>A reference expires after seven days. When there is no current verified comparison, the product shows Price to be confirmed and no saving is claimed.</p>'},
  contact:{title:'Contact StackR',body:'<p>For product questions or help with the shop, email <a href="mailto:Hello@StackrTCG.com">Hello@StackrTCG.com</a>.</p><p>Jack is the person behind StackR. Please include the product name and language, or your order reference if you have one.</p>'},
  seller:{title:'Company information',body:"<dl class=\"info-facts\"><dt>Trading brand</dt><dd>StackR</dd><dt>Registered company</dt><dd>STACKRTCG LIMITED</dd><dt>Company number</dt><dd><a href=\"https://find-and-update.company-information.service.gov.uk/company/17386590\" target=\"_blank\" rel=\"noopener noreferrer\">17386590</a></dd><dt>Registered in</dt><dd>England and Wales</dd><dt>Registered office</dt><dd>18 Lyndhurst Grove, Chaddesden, Derby, England, DE21 6RY</dd><dt>Contact</dt><dd><a href=\"mailto:Hello@StackrTCG.com\">Hello@StackrTCG.com</a></dd><dt>Returns address</dt><dd>Contact us before arranging a return.</dd></dl><p>Orders are not yet open. Delivery services and final returns terms will be confirmed before orders open. </p>"},
  delivery:{title:'Delivery & returns',body:'<div class="info-card">Orders are not open.</div><h3>Delivery costs</h3><p>Delivery charges, services and dispatch times have not been set. No delivery charge is included in the preview bag.</p><h3>Returns and damaged items</h3><p>Contact <a href="mailto:Hello@StackrTCG.com">Hello@StackrTCG.com</a> with your order reference and details of the issue. A returns policy and business and returns address will be published before orders open. Contact us before sending an item back.</p>'},
  formats:{title:'Product guide',body:'<p><strong>Booster bundles:</strong> six packs in each bundle shown.</p><p><strong>Elite Trainer Boxes:</strong> nine packs plus a promo card and accessories in the standard English editions shown.</p><p><strong>Booster boxes:</strong> English displays contain 36 packs. Japanese Black Bolt and White Flare contain 20 packs of 7 cards; Mega Symphonia has 30 packs of 5. Korean Black Bolt and White Flare have 20 packs of 7. The Simplified Chinese slim box has 15 packs of 5, and Terastal Grand has 10 packs of 10.</p><p><strong>Blisters:</strong> one or three packs, as shown on the individual product.</p><p><strong>Special collections:</strong> three to five packs plus the pictured promo items, as described in each listing.</p><p><strong>Mega Charizard X ex UPC:</strong> eighteen packs and themed items.</p><p>Each basket item is one retail unit. Assorted promo artwork is identified in the description.</p>'},
  privacy:{title:'Privacy & browser storage',body:'<p>This preview does not collect payment information or delivery addresses. Signing in supplies your identity to manage your interest registrations.</p><p>Website binders and their quantities are saved privately against your Site sign-in. They are separate from existing app collections and can be archived and restored. Your saved products and bag quantities are kept in this browser’s local storage. They stay on this device and can be removed by clearing this site’s browser data.</p><p>If you register interest, the shop stores your signed-in email, chosen product, quantity and consent time. Only the shop owner can view the demand register. You can withdraw your registration from that product. No availability emails are sent automatically.</p>'}
 };
 const item=content[key]||content.preview;openInfo(item.title,item.body+close);
}

const formatLabels={All:'All products',ETBs:'Elite Trainer Boxes',Bundles:'Booster bundles',Boxes:'Booster boxes',Blisters:'Blisters',UPCs:'Ultra-Premium Collections',Collections:'Special collections',Tins:'Tins',Decks:'Battle decks'};
const budgetLabels={all:'All prices',under25:'Under £25','25to75':'£25 to £75',over75:'Over £75'};
function matchesBudget(p){const cents=productPence(p);return priceRange==='all'||(cents!==null&&((priceRange==='under25'&&cents<2500)||(priceRange==='25to75'&&cents>=2500&&cents<=7500)||(priceRange==='over75'&&cents>7500)));}
function normaliseSearch(value){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function matchesLanguage(p){return language==='all'||p.language===language;}
function matchesSearch(p){
 const aliases={ETBs:'etb elite trainer box',Boxes:'booster box display',Bundles:'bundle six packs',Blisters:'blister',Collections:'collection'};
 const text=normaliseSearch('pokemon '+p.name+' '+p.type+' '+p.series+' '+p.setName+' '+p.category+' '+p.packs+' packs '+p.language+' '+(p.nativeName||'')+' '+(p.reference||'')+' '+(aliases[p.category]||''));
 return normaliseSearch(query).split(/\s+/).filter(Boolean).every(term=>text.includes(term));
}
function renderCatalogueNavigation(){
 const formats=document.querySelector('#catalogue-filters .categories');for(const key of ['Tins','Decks'])if(!formats.querySelector('[data-category="'+key+'"]'))formats.insertAdjacentHTML('beforeend','<button data-category="'+key+'" aria-pressed="false"><span>'+formatLabels[key]+'</span><span data-category-count="'+key+'"></span></button>');
 const countable=products.filter(p=>matchesLanguage(p)&&matchesAvailability(p)&&matchesSet(p,setKey)&&matchesBudget(p)&&matchesSearch(p)&&(!onlySaved||state.saved.includes(p.id)));
 document.querySelectorAll('[data-category-count]').forEach(el=>{el.textContent=countable.filter(p=>el.dataset.categoryCount==='All'||p.category===el.dataset.categoryCount).length;});
 const entries=setEntries;
 if(!get('sidebar-sets').children.length)get('sidebar-sets').innerHTML=entries.map(entry=>'<button data-set="'+entry.key+'" aria-pressed="false">'+setMark(entry)+'<span>'+escapeHtml(entry.name)+'</span><span data-set-count="'+entry.key+'"></span></button>').join('');
 get('sidebar-sets').querySelectorAll('[data-set]').forEach(button=>{button.setAttribute('aria-pressed',String(setKey===button.dataset.set));const entry=setEntries.find(s=>s.key===button.dataset.set);button.hidden=entry?.language&&language!=='all'&&entry.language!==language;});
 get('sidebar-sets').querySelectorAll('[data-set-count]').forEach(el=>{el.textContent=products.filter(p=>matchesLanguage(p)&&matchesAvailability(p)&&matchesSet(p,el.dataset.setCount)&&(category==='All'||p.category===category)&&matchesBudget(p)&&matchesSearch(p)&&(!onlySaved||state.saved.includes(p.id))).length;});
 if(!get('nav-sets').children.length)get('nav-sets').innerHTML='<span class="menu-kicker">Sets</span><div class="set-menu-grid">'+setEntries.filter(entry=>!['all','collections'].includes(entry.key)).map(entry=>'<button data-set="'+entry.key+'" aria-pressed="false">'+setMark(entry)+'<span>'+escapeHtml(entry.name)+'</span></button>').join('')+'</div><a href="#shop" data-reset class="menu-view-all">Browse all '+products.length+' products '+icon('arrow')+'</a>';
 get('nav-sets').querySelectorAll('[data-set]').forEach(button=>button.setAttribute('aria-pressed',String(setKey===button.dataset.set)));
}
function relatedProducts(p){
 const related=products.filter(item=>item.id!==p.id&&item.setKey===p.setKey).slice(0,2);
 if(!related.length)return '';
 const heading=p.setKey==='collections'?'You may also like':'More from this set';
 return '<section class="related-products" aria-label="'+heading+'"><h3>'+heading+'</h3><div class="related-list">'+related.map(item=>'<button data-quick="'+item.id+'">'+productPhoto(item,'lazy')+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(item.type)+' · '+escapeHtml(item.language)+'</small></span>'+icon('arrow')+'</button>').join('')+'</div></section>';
}
function openLinkedProduct(){
 if(!location.hash.startsWith('#product/'))return;
 let id;try{id=decodeURIComponent(location.hash.slice(9));}catch{return;}
 if(byId(id)){if(shopReady)selectProduct(id);else loadShopState().then(()=>{if(location.hash==='#product/'+encodeURIComponent(id))selectProduct(id);});}
}
