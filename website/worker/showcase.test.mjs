import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync('src/shop-showcase.js','utf8');
const photoSource=fs.readFileSync('src/shop-tools.js','utf8').split('function initProductCutouts')[0];
const groupsSource=fs.readFileSync('src/set-groups.js','utf8');
const releaseSource=groupsSource.match(/^function productIsUpcoming\([^\n]+/m)[0];
const stockSource=groupsSource.match(/function isProductInStock\(p\)\{[\s\S]*?\n\}/)[0];
const sha='a'.repeat(64),escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const product=(id,extra={})=>({id,name:'Set '+id,type:'Booster box',language:'Japanese',image:'/media/products/'+id+'--'+sha.slice(0,12),imageSha256:sha,imageWidth:1200,imageHeight:1600,imagePending:false,imageHDReady:true,...extra});
const cutout=(width,height,extra={})=>({sourceSha256:sha,sourceWidth:2000,sourceHeight:2000,bounds:{x:10,y:10,width,height},polygon:[[10,10],[width+10,10],[width+10,height+10],[10,height+10]],...extra});
function fixture(products,stocks={},ready=true){
 const timers=[];const node=()=>({textContent:'',hidden:false,dataset:{},style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;}}),pause=node(),mode=node(),count=node(),steps=[node(),node()],listeners={};
 const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 const area={dataset:{},writes:0,_html:'',stockLabel:null,events:{},get innerHTML(){return this._html.replace(/(<div id="opening-product-slide"[^>]*>)(<\/div>)/,'$1'+slide.innerHTML+'$2');},set innerHTML(value){this._html=value;if(!value.includes('data-opening-slide'))this.writes++;},querySelector(selector){return {'[data-opening-stock]':this.stockLabel,'[data-opening-slide]':this._html.includes('data-opening-slide')?slide:null,'[data-opening-pool]':this._html.includes('data-opening-slide')?slide.stage:null,'[data-opening-name]':slide.name,'[data-opening-format]':slide.format,'[data-opening-link]':slide.link,'[data-opening-pause]':pause,'[data-opening-mode]':mode,'[data-opening-count]':count}[selector]||null;},querySelectorAll(selector){return selector==='[data-opening-step]'?steps:selector==='[data-opening-orbit-item]'?slide.photos:[];},addEventListener(name,callback){this.events[name]=callback;}};
 const slide={...node(),_html:'',photos:[],stage:null,name:node(),format:node(),link:node(),get innerHTML(){return this._html.replace(/(data-opening-stock[^>]*>)[^<]+/,'$1'+(area.stockLabel?.textContent||''));},set innerHTML(value){this._html=value;area.writes++;const text=value.match(/data-opening-stock[^>]*>([^<]+)/)?.[1];area.stockLabel=text?{textContent:text}:null;
  this.stage={dataset:{openingPool:decode(value.match(/data-opening-pool="([^"]+)"/)?.[1]||'')}};
  this.photos=[...value.matchAll(/data-opening-position="([^"]+)" aria-hidden="([^"]+)" data-opening-photo-id="([^"]+)"/g)].map(([,position,hidden,id])=>{const button=node(),photo={...node(),dataset:{openingPosition:position,openingPhotoId:decode(id)},querySelector(){return button;}};photo.setAttribute('aria-hidden',hidden);return photo;});
 }};
 const motion={matches:false,addEventListener(name,callback){listeners['motion-'+name]=callback;}},document={hidden:false,body:{dataset:{phoneScreen:'home'}},querySelector(){return null;}};
 const context=vm.createContext({products,shopReady:ready,liveStock:id=>stocks[id]||{status:'unknown',quantity:null},get:id=>id==='opening-product'?area:null,escapeHtml,icon:name=>'<svg data-icon="'+name+'"></svg>',window:{matchMedia:()=>motion,addEventListener(name,callback){listeners[name]=callback;}},document,setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval(){}});
 vm.runInContext(releaseSource+'\n'+stockSource+'\n'+photoSource+'\n'+source,context);
 return {context,area,slide,stocks,motion,document,steps,pause,listeners,timers,select:()=>vm.runInContext('selectOpeningProduct()',context),pool:()=>vm.runInContext('openingProductPool()',context),render:()=>vm.runInContext('renderOpeningProduct()',context),advance:(step=1,manual=false)=>vm.runInContext('advanceOpeningShowcase('+step+','+manual+')',context)};
}

test('unconfirmed stock gets an explicitly labelled catalogue preview, never an availability claim',()=>{
 const p=product('a'),e=fixture([p]);assert.equal(e.select(),null);e.render();assert.match(e.area.innerHTML,/Catalogue preview/);assert.match(e.area.innerHTML,/data-inspect-photo="a"/);assert.doesNotMatch(e.area.innerHTML,/\d+ in stock/);
 e.stocks.a={status:'in_stock',quantity:0};assert.equal(e.select(),null);
 e.stocks.a={status:'out_of_stock',quantity:10};assert.equal(e.select(),null);
 for(const quantity of [null,undefined,-1,0.5,'3',NaN,Infinity]){e.stocks.a={status:'in_stock',quantity};assert.equal(e.select(),null);}
 e.stocks.a={status:'in_stock',quantity:1};assert.equal(e.select().id,'a');
 e.context.shopReady=false;assert.equal(e.select(),null);
});

test('showcase quality uses real subject pixels and cannot trust an HD flag or a large white canvas alone',()=>{
 const acceptable=product('good',{imageWidth:700,imageHeight:1000,imageHDReady:false});
 const bad=[product('pending',{imagePending:true}),product('no-image',{image:''}),product('wrong-url',{image:'javascript:alert(1)'}),product('no-sha',{imageSha256:''}),product('small-hd',{imageWidth:799,imageHeight:799,imageHDReady:true}),product('small-unflagged',{imageWidth:900,imageHeight:999,imageHDReady:false}),product('large-canvas',{imageWidth:2000,imageHeight:2000,imageCutout:cutout(300,500)}),product('stale-mask',{imageWidth:2000,imageHeight:2000,imageCutout:cutout(900,1100,{sourceSha256:'b'.repeat(64)})}),product('inflated-mask',{imageWidth:2000,imageHeight:2000,imageCutout:cutout(3000,1100)})];
 const items=[...bad,acceptable],e=fixture(items,Object.fromEntries(items.map(p=>[p.id,{status:'in_stock',quantity:1}])));assert.equal(e.select().id,'good');
 const threshold=product('threshold',{imageWidth:500,imageHeight:800,imageHDReady:true}),t=fixture([threshold],{threshold:{status:'in_stock',quantity:1}});assert.equal(t.select().id,'threshold');threshold.imageHDReady=false;assert.equal(t.select(),null);
});

test('selection prefers real resolution, then genuine gallery views, and stable product identities',()=>{
 const a=product('a'),z=product('z'),e=fixture([z,a],{a:{status:'in_stock',quantity:1},z:{status:'in_stock',quantity:1}});assert.equal(e.select().id,'a');
 z.gallery=[{id:'side',label:'Side',image:'/media/products/z-side--'+sha.slice(0,12),sha256:sha,width:1200,height:1600}];assert.equal(e.select().id,'z');
 z.gallery=[{id:'made-up',label:'Side',image:'https://unverified.invalid/side.png',sha256:sha,width:1200,height:1600}];assert.equal(e.select().id,'a');
 z.imageHeight=1800;assert.equal(e.select().id,'z');
 const padded=product('padded',{imageWidth:2000,imageHeight:2000,imageCutout:cutout(800,1100)}),larger=product('larger',{imageWidth:900,imageHeight:1400}),p=fixture([padded,larger],{padded:{status:'in_stock',quantity:3},larger:{status:'in_stock',quantity:3}});assert.equal(p.select().id,'larger');
});

test('the confirmed product uses the existing eager photograph, exact cutout aspect and native inspector controls',()=>{
 const p=product('portrait',{imageWidth:2000,imageHeight:2000,imageCutout:cutout(700,1400)}),e=fixture([p],{portrait:{status:'in_stock',quantity:7}});e.render();
 assert.match(e.area.innerHTML,/data-inspect-photo="portrait"/);assert.match(e.area.innerHTML,/data-product-play/);assert.match(e.area.innerHTML,/data-product-tilt/);assert.match(e.area.innerHTML,/preserveAspectRatio="xMidYMid meet"/);assert.match(e.area.innerHTML,/href="\/media\/products\/portrait/);assert.doesNotMatch(e.area.innerHTML,/data-cutout-src=/);
 assert.match(e.area.innerHTML,/Japanese/);assert.match(e.area.innerHTML,/7 in stock/);assert.match(e.area.innerHTML,/data-quick="portrait"/);assert.doesNotMatch(e.area.innerHTML,/£|Price pending|Terastal/);
 assert.equal(e.area.dataset.featuredSha,sha);
});

test('unchanged inventory preserves the active photograph and count-only changes update its caption',()=>{
 const p=product('a'),e=fixture([p],{a:{status:'in_stock',quantity:3}});e.render();const first=e.area.innerHTML,label=e.area.stockLabel;assert.equal(e.area.writes,1);
 e.render();assert.equal(e.area.writes,1);assert.equal(e.area.innerHTML,first);assert.equal(e.area.stockLabel,label);
 e.stocks.a.quantity=2;e.render();assert.equal(e.area.writes,1);assert.equal(label.textContent,'2 in stock');
 e.stocks.a.quantity=null;e.render();assert.equal(e.area.writes,2);assert.match(e.area.innerHTML,/Catalogue preview/);assert.doesNotMatch(e.area.innerHTML,/\d+ in stock/);assert.equal(e.area.dataset.featuredSha,sha);
 e.stocks.a.status='out_of_stock';e.render();assert.equal(e.area.writes,2);
});

test('future releases cannot be featured even when marked as available inventory',()=>{
 const future=product('future',{releaseDate:'2999-12-31'}),released=product('released',{releaseDate:'2000-01-01'}),e=fixture([future,released],{future:{status:'in_stock',quantity:10},released:{status:'in_stock',quantity:1}});
 future.imageHeight=2400;assert.equal(e.select().id,'released');e.render();assert.match(e.area.innerHTML,/data-inspect-photo="released"/);assert.doesNotMatch(e.area.innerHTML,/data-inspect-photo="future"/);
 e.stocks.released={status:'out_of_stock',quantity:0};assert.equal(e.select(),null);e.render();assert.match(e.area.innerHTML,/Catalogue preview/);assert.doesNotMatch(e.area.innerHTML,/data-inspect-photo="future"/);
 future.releaseDate=null;future.releaseMonth='2999-12';assert.equal(e.select(),null);
});

test('stock without a suitable photograph remains available through the shop rather than a misleading feature',()=>{
 const p=product('small',{imageWidth:300,imageHeight:500}),e=fixture([p],{small:{status:'in_stock',quantity:2}});e.render();assert.match(e.area.innerHTML,/Browse current stock/);assert.match(fs.readFileSync('src/index.html','utf8'),/<a class="opening-browse" href="\/shop"/);assert.doesNotMatch(e.area.innerHTML,/Explore shop/);assert.doesNotMatch(e.area.innerHTML,/data-inspect-photo|data-quick/);
 e.render();assert.equal(e.area.writes,1);
});

test('recent confirmed stock updates lead the showcase before photo size breaks ties',()=>{
 const old=product('old',{imageHeight:2400}),latest=product('latest'),invalid=product('invalid');
 const e=fixture([old,latest,invalid],{old:{status:'in_stock',quantity:2,updatedAt:'2026-10-01T12:00:00Z'},latest:{status:'in_stock',quantity:1,updatedAt:'2026-11-04T12:00:00Z'},invalid:{status:'in_stock',quantity:1,updatedAt:'not a date'}});
 assert.equal(e.select().id,'latest');assert.equal(e.pool().mode,'stock');assert.deepEqual(Array.from(e.pool().items,p=>p.id),['latest','old','invalid']);
});

test('rotation stops while hidden, off the home screen, hovered, focused or viewing a dialog',()=>{
 const e=fixture([product('a'),product('b')]);e.render();
 const shown=()=>JSON.parse(e.area.dataset.featuredKey)[1];assert.equal(shown(),'a');
 e.document.hidden=true;e.advance();assert.equal(shown(),'a');e.document.hidden=false;
 e.document.body.dataset.phoneScreen='shop';e.advance();assert.equal(shown(),'a');e.document.body.dataset.phoneScreen='home';
 e.document.querySelector=()=>({open:true});e.advance();assert.equal(shown(),'a');e.document.querySelector=()=>null;
 e.area.events.mouseenter();e.advance();assert.equal(shown(),'a');e.area.events.mouseleave();e.advance();assert.equal(shown(),'b');
 e.area.events.focusin();e.advance();assert.equal(shown(),'b');
 e.advance(1,true);assert.equal(shown(),'a');e.advance();assert.equal(shown(),'a');
 assert.equal(e.pause.textContent,'Play slideshow');
});

test('reduced motion starts paused with manual navigation still available',()=>{
 const e=fixture([product('a'),product('b')]);e.motion.matches=true;e.render();
 assert.equal(e.pause.hidden,true);e.advance();assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'a');
 e.advance(1,true);assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'b');
});

test('a first pointer click on Pause stays paused after focus, and keyboard Play resumes',()=>{
 const e=fixture([product('a'),product('b')]);e.render();
 const target={closest:selector=>selector==='[data-opening-pause]'?e.pause:null};
 assert.equal(e.pause.textContent,'Pause slideshow');
 e.area.events.pointerdown({target});e.area.events.focusin();e.area.events.click({target,detail:1});
 assert.equal(e.pause.textContent,'Play slideshow');e.advance();assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'a');
 e.area.events.click({target,detail:0});assert.equal(e.pause.textContent,'Pause slideshow');
 e.advance();assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'b');
});

test('a live stock arrival replaces preview mode and a sold-out item leaves the available rotation',()=>{
 const a=product('a'),b=product('b'),e=fixture([a,b]);e.render();assert.equal(e.pool().mode,'preview');
 e.stocks.b={status:'in_stock',quantity:3};e.render();assert.match(e.area.innerHTML,/3 in stock/);assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'b');
 e.stocks.a={status:'in_stock',quantity:2};e.render();assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'b');
 e.stocks.b={status:'out_of_stock',quantity:0};e.render();assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'a');assert.doesNotMatch(e.area.innerHTML,/data-inspect-photo="b"/);
 assert.ok(e.steps.every(button=>button.disabled));
});

test('failed artwork is removed from a bounded pool without cycling through the entire catalogue',()=>{
 const e=fixture(Array.from({length:12},(_,i)=>product('item-'+String(i).padStart(2,'0'))));e.render();
 const attempted=Array.from(e.pool().items,p=>p.id);assert.equal(attempted.length,8);
 for(const id of attempted)e.area.events.error({target:{closest:()=>({dataset:{openingPhotoId:id}})}});
 assert.equal(e.pool().items.length,0);assert.match(e.area.innerHTML,/Catalogue photos are temporarily unavailable/);assert.doesNotMatch(e.area.innerHTML,/stock is being confirmed/);
 assert.doesNotMatch(e.area.innerHTML,/data-inspect-photo/);
});

test('the automatic timer cycles in order, wraps, and resumes when focus leaves unless explicitly paused',()=>{
 const e=fixture([product('a'),product('b'),product('c')]);e.render();const shown=()=>JSON.parse(e.area.dataset.featuredKey)[1],tick=()=>e.timers[0].fn();assert.equal(e.timers[0].ms,7000);
 tick();assert.equal(shown(),'b');assert.equal(e.area.dataset.openingTurn,'next');e.area.events.focusin();tick();assert.equal(shown(),'b');e.area.events.focusout({relatedTarget:null});tick();assert.equal(shown(),'c');tick();assert.equal(shown(),'a');
 e.advance(-1,true);assert.equal(shown(),'c');assert.equal(e.area.dataset.openingTurn,'previous');tick();assert.equal(shown(),'c');
});

test('four real product nodes move through every position and wrap without replacing their images',()=>{
 const e=fixture(Array.from({length:4},(_,i)=>product(String.fromCharCode(97+i))));e.render();
 assert.equal(e.pool().items.length,4);const photos=[...e.slide.photos],writes=e.area.writes;
 assert.deepEqual(photos.map(p=>p.dataset.openingPosition),['front','right','back','left']);
 for(const expected of ['left','back','right','front']){
  e.advance();assert.equal(e.area.writes,writes,'Turning must retain the existing decoded image nodes');assert.ok(photos.every((p,i)=>p===e.slide.photos[i]));
  assert.equal(photos[0].dataset.openingPosition,expected);
  const front=photos.find(p=>p.dataset.openingPosition==='front');assert.equal(e.slide.link.dataset.quick,front.dataset.openingPhotoId);
  assert.ok(photos.every(p=>p.querySelector('button').disabled===(p!==front)));assert.ok(photos.every(p=>p.attributes['aria-hidden']===String(p!==front)));
 }
 e.advance(-1,true);assert.equal(e.area.writes,writes);assert.equal(photos[0].dataset.openingPosition,'right');
});

test('client takeover retains the already rendered photographs and fewer real stock items never get padded with previews',()=>{
 const e=fixture([product('a'),product('b'),product('c'),product('d')]);
 e.area.innerHTML=vm.runInContext('openingShowcaseMarkup()',e.context);
 e.slide.innerHTML=vm.runInContext('(()=>{const pool=openingProductPool();return openingProductSlideMarkup(pool.items[0],pool,0);})()',e.context);
 const photos=[...e.slide.photos],writes=e.area.writes;e.render();assert.equal(e.area.writes,writes);assert.ok(photos.every((p,i)=>p===e.slide.photos[i]));
 e.stocks.b={status:'in_stock',quantity:1};e.render();assert.equal(e.pool().mode,'stock');assert.deepEqual(e.slide.photos.map(p=>p.dataset.openingPhotoId),['b']);assert.match(e.area.innerHTML,/1 in stock/);
});

test('a pool of eight shows three photographs and brings the next from the concealed rear position',()=>{
 const e=fixture(Array.from({length:12},(_,i)=>product('p'+String(i).padStart(2,'0'))));e.render();assert.equal(e.slide.photos.length,8);
 const photos=[...e.slide.photos],writes=e.area.writes;
 for(let n=0;n<8;n++){const incoming=photos.find(p=>p.dataset.openingPhotoId==='p'+String((n+2)%8).padStart(2,'0'));assert.equal(incoming.dataset.openingPosition,'back');e.advance();assert.equal(incoming.dataset.openingPosition,'right');assert.equal(e.area.writes,writes);assert.ok(photos.every((p,i)=>p===e.slide.photos[i]));assert.equal(photos.filter(p=>p.dataset.openingPosition!=='back').length,3);assert.equal(photos.filter(p=>p.dataset.openingPosition==='front').length,1);for(const p of photos.filter(p=>p.dataset.openingPosition==='back'))assert.match(p.style.cssText,/clip-path:inset\(50% 50%\)/);}
 assert.equal(JSON.parse(e.area.dataset.featuredKey)[1],'p00');
 const front=vm.runInContext('openingSlotStyle(0,8)',e.context),back=vm.runInContext('openingSlotStyle(4,8)',e.context);
 assert.match(front,/top:60\.0000%/);assert.match(back,/top:54\.0000%/);assert.match(back,/scale\(0\.6200\)/);assert.doesNotMatch(back,/opacity/);
});
