/* One price policy for cards, details and bag. The server owns source retrieval. */
let priceFeed=pricingBootstrap;
let priceConnection='snapshot';
let priceRequest=null;
let priceTimer;
const priceMaximumAge=7*24*60*60*1000;
const priceSourceIdentities=Object.fromEntries(Object.entries(pricingBootstrap.products).map(([id,quote])=>[id,quote.sources.map(({id,name,url})=>({id,name,url}))]));

function priceTimestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
 const time=Date.parse(value),date=new Date(time);
 if(!Number.isFinite(time)||time<0||time>Date.now()||date.toISOString().slice(0,19)!==value.slice(0,19))return null;
 return time;
}
function currentSource(source){
 if(!source||source.status!=='current'||source.currency!=='GBP'||!Number.isSafeInteger(source.marketPence)||source.marketPence<=0||source.marketPence>100000000)return false;
 const asOf=priceTimestamp(source.asOf||source.observedAt),observed=priceTimestamp(source.observedAt);
 return asOf!==null&&observed!==null&&asOf<=observed&&Date.now()-asOf<priceMaximumAge;
}
function currentQuote(p){
 if(!p)return null;
 const q=priceFeed?.products?.[p.id],identity=q?.identity;
 if(!q||q.status!=='current'||!identity||q.productId!==p.id||q.currency!=='GBP'||priceFeed.currency!=='GBP'||priceFeed.discountBps!==1000)return null;
 const expected={language:p.language,setKey:p.setKey,type:p.type,packs:p.packs,unit:p.unit,edition:p.edition||'standard',cardsPerPack:p.cardsPerPack??null};
 if(Object.keys(expected).some(key=>identity[key]!==expected[key]))return null;
 const asOf=priceTimestamp(q.asOf||q.observedAt),observed=priceTimestamp(q.observedAt);
 if(asOf===null||observed===null||asOf>observed||Date.now()-asOf>=priceMaximumAge)return null;
 if(!Number.isSafeInteger(q.marketPence)||q.marketPence<=0||q.marketPence>100000000)return null;
 const expectedPrice=Math.floor((q.marketPence*9000+5000)/10000);
 if(q.shopPence!==expectedPrice||q.savingsPence!==q.marketPence-q.shopPence)return null;
 // Owner references are deliberately separate from the configured retailer feed.
 // Their original check time is retained and can never be extended by a publish.
 if(q.priceOrigin==='stockroom'&&q.priceOverride?.basis==='owner'){
  const ref=q.priceOverride,expiry=Date.parse(q.expiresAt);
  if(q.referenceType!=='Owner-entered reference'||typeof ref.source!=='string'||!ref.source.trim()||ref.source.length>2000||/[\x00-\x1f\x7f]/.test(ref.source)||typeof ref.revision!=='string'||ref.checkedAt!==q.asOf||ref.expiresAt!==q.expiresAt||expiry!==asOf+priceMaximumAge||expiry<=Date.now()||q.selectedSourceId!==null||q.currentSourceCount!==0)return null;
  return q;
 }
 const configured=priceSourceIdentities[p.id]||[];
 if(!Array.isArray(q.sources)||!q.sources.length||q.sources.length>4||q.configuredSourceCount!==q.sources.length||q.sources.length!==configured.length)return null;
 const ids=new Set();
 for(const source of q.sources){
  if(!source||typeof source!=='object'||typeof source.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(source.id)||ids.has(source.id)||typeof source.name!=='string'||source.name.length>200||source.currency!=='GBP'||!['current','stale','unavailable'].includes(source.status))return null;
  if(!configured.some(expected=>expected.id===source.id&&expected.name===source.name&&expected.url===source.url))return null;
  try{const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password)return null;}catch{return null;}
  if(source.status==='current'&&!currentSource(source))return null;
  ids.add(source.id);
 }
 const sources=q.sources.filter(currentSource),selected=sources.find(source=>source.id===q.selectedSourceId);
 if(!selected||!Number.isSafeInteger(q.currentSourceCount)||q.currentSourceCount!==sources.length||selected.marketPence!==q.marketPence||selected.asOf!==q.asOf||selected.observedAt!==q.observedAt||q.marketPence!==Math.min(...sources.map(source=>source.marketPence)))return null;
 return q;
}
function productPence(p){return currentQuote(p)?.shopPence??null;}
function priceReferenceLabel(q){return q?.priceOrigin==='stockroom'&&q.priceOverride?.basis==='owner'?'Owner-entered reference':'UK retail reference';}
function priceText(p){const value=productPence(p);return value===null?'Price to be confirmed':money(value/100);}
function addLabel(p){return stockStatus(p)==='out_of_stock'?'Out of stock':!isProductInStock(p)?'Availability to be confirmed':!currentQuote(p)?'Price to be confirmed':(state.cart[p.id]||0)>=cartMaximum(p.id)?state.cart[p.id]+' in your bag':'Add to bag';}
function priceStamp(q){
 return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(q.asOf||q.observedAt));
}
function priceNextCheck(){
 const value=Date.parse(priceFeed?.nextRefreshAt||'');
 return Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'Europe/London'}).format(new Date(value)):null;
}
function renderPricingStatus(){
 const count=products.filter(p=>currentQuote(p)).length;
 const node=get('pricing-status');if(!node)return;
 node.dataset.connection=priceConnection;
 get('pricing-status-text').textContent=['failed','conflict'].includes(priceFeed?.persistenceStatus)?'Price update paused. Please try again shortly.':priceConnection==='live'?(priceFeed.refreshPending||priceFeed.refreshing?'Updating weekly retail references':count?'Weekly retail references · next check '+(priceNextCheck()||'pending'):'No current retail references'):priceConnection==='refreshing'?'Checking weekly references.':priceConnection==='snapshot'?'Saved retail references':'Price service unavailable';
 get('pricing-coverage').textContent=count+'/'+products.length+' products priced';
 if(products.some(p=>currentQuote(p)?.priceOverride?.basis==='owner'))get('pricing-status-text').textContent='Current references · owner-entered values are labelled';
 if(get('reference-state'))get('reference-state').textContent=count?count+' current references':'Prices pending';
}
function refreshPriceSurfaces(){
 const before=document.activeElement;
 const suggestionsOpen=!get('search-suggestions').hidden;
 const focus=before?.dataset?.change?{selector:'#cart-dialog [data-change="'+before.dataset.change+'"][data-delta="'+before.dataset.delta+'"]',inDialog:true}:before?.dataset?.add?{selector:'[data-add="'+before.dataset.add+'"]'}:before?.dataset?.save?{selector:'[data-save="'+before.dataset.save+'"]'}:null;
 renderProducts();renderCart();
 if(!suggestionsOpen)closeSearchSuggestions();
 document.querySelectorAll('[data-pricing-for]').forEach(node=>{const p=byId(node.dataset.pricingFor);if(p)node.outerHTML=pricePair(p);});
 document.querySelectorAll('[data-add]').forEach(button=>{const p=byId(button.dataset.add);if(p)button.disabled=(state.cart[p.id]||0)>=cartMaximum(p.id);});
 syncPriceCardAvailability();
 renderPricingStatus();
 if(focus&&(focus.inDialog||!document.querySelector('dialog[open]')))document.querySelector(focus.selector)?.focus({preventScroll:true});
}
async function refreshLivePrices(){
 if(priceRequest)return priceRequest;
 priceRequest=(async()=>{
  if(location.protocol==='file:'){priceConnection='snapshot';refreshPriceSurfaces();return false;}
  priceConnection='refreshing';renderPricingStatus();
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),18000);
  try{
   const response=await fetch('/api/prices',{cache:'no-store',credentials:'same-origin',signal:abort.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Price service unavailable');
   const next=await response.json();
   if(next.discountBps!==1000||next.currency!=='GBP'||!next.products||typeof next.products!=='object'||Array.isArray(next.products))throw Error('Invalid price feed');
   priceFeed=next;priceConnection='live';refreshPriceSurfaces();if(next.refreshing&&!['failed','conflict'].includes(next.persistenceStatus))setTimeout(()=>{if(!document.hidden)refreshLivePrices();},5000);return true;
  }catch{priceConnection='unavailable';refreshPriceSurfaces();return false;}
  finally{clearTimeout(timeout);}
 })().finally(()=>{priceRequest=null;});
 return priceRequest;
}
function initLivePricing(){
 renderPricingStatus();refreshLivePrices();
 function startTimer(){clearInterval(priceTimer);priceTimer=setInterval(()=>{if(!document.hidden)refreshLivePrices();},300000);}
 startTimer();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLivePrices();});
 window.addEventListener('pagehide',()=>{clearInterval(priceTimer);priceTimer=null;});
 window.addEventListener('pageshow',event=>{if(event.persisted){startTimer();refreshLivePrices();}});
}

const languageDefinitions={
 English:{label:'English',code:'en'},Japanese:{label:'Japanese',code:'ja'},
 'Simplified Chinese':{label:'Chinese',code:'zh-CN'},Korean:{label:'Korean',code:'ko-KR'}
};
function flagIcon(language){
 const code=languageDefinitions[language]?.code;
 const common='class="language-flag" viewBox="0 0 60 40" role="img" aria-label="'+escapeHtml(language)+'"';
 if(code==='ja')return '<svg '+common+'><rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#bc002d"/></svg>';
 if(code==='en')return '<svg '+common+'><rect width="60" height="40" fill="#012169"/><path d="m0 0 60 40M60 0 0 40" stroke="#fff" stroke-width="9"/><path d="m0 0 60 40M60 0 0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="14"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="8"/></svg>';
 if(code==='zh-CN'){
  function star(x,y,r,angle=-90){let d='';for(let i=0;i<10;i++){const a=(angle+i*36)*Math.PI/180,s=i%2?r*.382:r;d+=(i?'L':'M')+(x+Math.cos(a)*s).toFixed(2)+' '+(y+Math.sin(a)*s).toFixed(2);}return '<path d="'+d+'Z" fill="#ffde00"/>';}
  return '<svg '+common+'><rect width="60" height="40" fill="#de2910"/>'+star(10,11,6)+[[20,4],[24,9],[24,16],[20,22]].map(([x,y])=>star(x,y,2,Math.atan2(11-y,10-x)*180/Math.PI)).join('')+'</svg>';
 }
 if(code==='ko-KR'){
  function bars(x,y,rotation,pattern){return '<g transform="translate('+x+' '+y+') rotate('+rotation+')" stroke="#111" stroke-width="2">'+pattern.map((solid,i)=>solid?'<path d="M-6 '+(i*3-3)+'h12"/>':'<path d="M-6 '+(i*3-3)+'h5m2 0h5"/>').join('')+'</g>';}
  return '<svg '+common+'><rect width="60" height="40" fill="#fff"/><g transform="rotate(-33 30 20)"><circle cx="30" cy="20" r="9" fill="#0047a0"/><path d="M21 20a9 9 0 0 1 18 0c0 6-9 6-9 0s-9-6-9 0Z" fill="#cd2e3a"/></g>'+bars(13,10,-55,[1,1,1])+bars(47,10,55,[0,1,0])+bars(13,30,55,[1,0,1])+bars(47,30,-55,[0,0,0])+'</svg>';
 }
 return '';
}
function languageBadge(p){return flagIcon(p.language)+'<span>'+escapeHtml(languageDefinitions[p.language]?.label||p.language)+'</span>';}
function renderLanguageFilters(){
 get('language-filters').innerHTML='<button data-language="all" aria-pressed="'+(language==='all')+'">All</button>'+Object.keys(languageDefinitions).map(value=>'<button data-language="'+value+'" aria-label="Filter '+escapeHtml(value)+' products" aria-pressed="'+(language===value)+'">'+flagIcon(value)+'<span>'+languageDefinitions[value].label+'</span></button>').join('');
}
function renderFormatBrowser(){
 const names={All:'All products',Bundles:'Bundles',ETBs:'ETBs',Boxes:'Booster boxes',Blisters:'Blisters',Collections:'Collections',UPCs:'UPCs',Tins:'Tins',Decks:'Decks'};
 const assets={All:'assets/stackr-shop-mark.png',Bundles:'assets/format-bundles.png',ETBs:'assets/format-etbs.png',Boxes:'assets/format-boxes.png',Blisters:'assets/format-blisters.png',Collections:'assets/format-collections.png',UPCs:'assets/format-upcs.png',Tins:'assets/format-tins.png'};
 get('format-browser').innerHTML=Object.entries(names).map(([key,label])=>'<button data-category="'+key+'" aria-pressed="'+(category===key)+'">'+(assets[key]?'<img src="'+assets[key]+'" alt="" width="64" height="64">':'<span class="format-generic" aria-hidden="true">'+icon('box')+'</span>')+'<span>'+label+'</span></button>').join('');
}
