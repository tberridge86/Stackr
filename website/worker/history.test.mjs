import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const data=JSON.parse(fs.readFileSync('src/pokemon-history.json','utf8'));
const source=fs.readFileSync('src/history-page.js','utf8');
const evidence=JSON.parse(fs.readFileSync('data/history-source-evidence-20261102.json','utf8'));
const registry=fs.existsSync('src/history-artifacts.json')?JSON.parse(fs.readFileSync('src/history-artifacts.json','utf8')):{assets:{}};
const control=()=>({listeners:{},attributes:{},disabled:false,addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},hasAttribute(key){return Object.hasOwn(this.attributes,key);},getAttribute(key){return this.attributes[key]??null;}});
const styles=()=>({values:{},setProperty(key,value){this.values[key]=value;},removeProperty(key){delete this.values[key];}});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetSource=image=>image.file?'/assets/'+image.file:'/media/contents/history-'+image.id+'--'+image.sha256.slice(0,12);
function runtimeHistory(){
 const runtime=structuredClone(data),assets=Object.fromEntries(Object.entries(registry.assets||{}).map(([id,image])=>[id,{...image,id,src:assetSource({...image,id})}]));
 for(const event of runtime.events){if(event.image)event.image.src=assetSource(event.image);if(event.artifactIds)event.artifacts=event.artifactIds.map(id=>assets[id]);if(event.peel)event.exhibit={kind:event.peel.kind||'cards',cover:assets[event.peel.cover],cards:event.peel.cards.map(id=>assets[id]),...(event.peel.insert?{insert:assets[event.peel.insert]}:{}),...(event.peel.backs?{backs:event.peel.backs.map(id=>assets[id])}:{})};}
 if(runtime.openingArtifactId)runtime.openingArtwork=assets[runtime.openingArtifactId];
 return runtime;
}
function environment({reduced=true,serverRendered=false,referrer='https://stackr.test/#shop',vibration=false,persistedTouch=false,withObserver=false,withTear=false}={}){
 const runtimeData=runtimeHistory();
 const previous=control(),next=control(),output={},motion=control(),map=control(),start=control(),scrolls=[],focus=[],returns=[],vibrations=[],label={hidden:true},touch={...control(),checked:false,closest:()=>label};
 const yearValues=[...new Set(data.events.map(event=>event.year))].sort((a,b)=>a-b);
 const years=yearValues.map((year,index)=>({dataset:{historyYear:String(year)},querySelector(){return {getBoundingClientRect:()=>({top:1000+index*600}),focus:options=>focus.push({year,options})};}}));
 const figures=[{style:styles(),getBoundingClientRect:()=>({top:100,bottom:300,height:200})}];
 const images=runtimeData.events.filter(event=>event.image?.crop).map(event=>({dataset:{historySrc:event.image.src},...control()}));
 const peelButton={...control(),disabled:true},peelBounds={top:180,bottom:1380,height:1200},peelStage={getBoundingClientRect:()=>({height:500})};
 const tearHandle={...control(),captures:[],setPointerCapture(id){this.captures.push(id);}},peel={dataset:withTear?{historyRevealKind:'tear'}:{},style:styles(),getBoundingClientRect:()=>peelBounds,querySelector:selector=>selector==='[data-tear-handle]'?tearHandle:peelStage,parentElement:{querySelector:()=>peelButton}};
 const mount={dataset:{},innerHTML:serverRendered?'server-rendered content':'',...control(),querySelector(selector){return {'[data-history-year]':serverRendered?years[0]:null,'[data-history-previous]':previous,'[data-history-next]':next,'[data-history-current]':output,'.history-year-nav':{clientHeight:64}}[selector];},querySelectorAll(selector){return {'[data-history-year]':years,'.history-event-art>.history-objects>.history-figure':figures,'[data-history-peel]':[peel],'[data-history-src]':images}[selector]||[];}};
 const root={style:styles(),scrollHeight:12000},reducedQuery={matches:reduced,...control()},body={dataset:{}},backLink=control(),frames=new Map();let frameId=0,now=1000;
 const inspectorContent={nodes:[],replaceChildren(...nodes){this.nodes=nodes;}},inspectorTitle={},inspectorClose=control();
 const inspector={...control(),open:false,querySelector:selector=>({'[data-inspector-content]':inspectorContent,'h2':inspectorTitle,'[data-inspector-close]':inspectorClose}[selector]),showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}};
 const doc={referrer,hidden:false,body,documentElement:root,...control(),getElementById:id=>id==='timeline-content'?mount:null,querySelector:selector=>({'[data-history-header]':{getBoundingClientRect:()=>({bottom:76})},'[data-world-map]':map,'[data-history-motion]':motion,'[data-history-touch]':touch,'[data-history-inspector]':inspector,'.history-start':start}[selector]||null),querySelectorAll:()=>[backLink]};
 const win={innerHeight:900,scrollY:0,scrollTo:value=>scrolls.push(value),...control(),history:{length:2,back:()=>returns.push('back')}};
 const observers=[];class Observer{constructor(callback,options){this.callback=callback;this.options=options;this.targets=[];observers.push(this);}observe(target){this.targets.push(target);}unobserve(target){this.targets=this.targets.filter(value=>value!==target);}disconnect(){this.targets=[];}}
 const storage=new Map([['stackr-history-touch',persistedTouch?'on':'off']]);
 const context=vm.createContext({URL,document:doc,window:win,location:{origin:'https://stackr.test'},navigator:vibration?{vibrate:value=>vibrations.push(value)}:{},performance:{now:()=>now},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},matchMedia:()=>reducedQuery,...(withObserver?{IntersectionObserver:Observer}:{}),requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(source.replace('__POKEMON_HISTORY__',JSON.stringify(runtimeData)),context);
 return {context,runtimeData,mount,previous,next,output,years,images,scrolls,focus,motion,map,start,root,body,frames,figures,peel,peelBounds,peelButton,tearHandle,backLink,returns,win,doc,reducedQuery,touch,label,vibrations,storage,observers,inspector,inspectorContent,inspectorTitle,inspectorClose,advance(ms=1000){now+=ms;},flush(){for(const[id,fn]of [...frames]){frames.delete(id);fn();}}};
}
const render=e=>vm.runInContext('renderPokemonHistory()',e.context);

test('history preserves date precision, regions and chronological reading order across media',()=>{
 assert(data.events.length>=18);assert.equal(new Set(data.events.map(event=>event.id)).size,data.events.length);assert(!/turn\d+(?:view|search)/.test(JSON.stringify(data)));
 for(const event of data.events){assert(['cards','games','films','anime','events'].includes(event.lane));assert(event.description.trim().split(/\s+/).length<=45);assert(event.region);assert.equal(new URL(event.sourceUrl).protocol,'https:');assert.equal(event.date.length,{day:10,month:7,year:4}[event.datePrecision]);}
 const {context}=environment(),groups=vm.runInContext('historyTimelineGroups()',context),sorted=data.events.slice().sort((a,b)=>a.year-b.year||a.order-b.order);
 assert.deepEqual(Array.from(groups,group=>group.year),[...new Set(sorted.map(event=>event.year))]);
 assert.deepEqual(Array.from(groups).flatMap(group=>Array.from(group.events,event=>event.id)),sorted.map(event=>event.id));
 const corocoro=data.events.find(event=>event.id==='1996-corocoro-mew');assert.equal(corocoro.lane,'games');assert.equal(corocoro.datePrecision,'month');assert(data.prelude.description.includes('Guinness World Records'));
});

test('all timeline entries and their source links are server-renderable; JS keeps existing content',()=>{
 const e=environment(),markup=vm.runInContext('historyTimelineMarkup()',e.context);
 assert.equal((markup.match(/data-history-event=/g)||[]).length,data.events.length);
 for(const event of data.events)assert(markup.includes('data-history-event="'+event.id+'"'));
 assert.doesNotMatch(markup,/<article[^>]*\shidden(?:\s|>)/);assert.match(markup,/loading="lazy"/);
 assert(markup.indexOf('data-history-event="1999-gold-silver"')<markup.indexOf('data-history-event="1999-neo-file"'));
 const server=environment({serverRendered:true});render(server);assert.equal(server.mount.innerHTML,'server-rendered content');
 assert.equal(vm.runInContext("historySourceLink('javascript:alert(1)','bad')",e.context),'');
 assert.equal(vm.runInContext("historySourceLink('https://user:secret@example.com/','bad')",e.context),'');
});

test('magazine markup retains the cover and complete card identities without hiding its no-JS state',()=>{
 const e=environment();const exhibit={cover:{src:'/cover.png',caption:'CoroCoro November 1996',width:450,height:650,sourceUrl:'https://example.com/issue'},cards:[{src:'/pikachu.png',caption:'Ivy Pikachu, 1996',width:490,height:688,sourceUrl:'https://example.com/pikachu',crop:{x:10,y:10,width:470,height:668,sourceWidth:490,sourceHeight:688}},{src:'/jigglypuff.png',caption:'Jigglypuff, 1996',width:659,height:923,sourceUrl:'https://example.com/jigglypuff'}]};
 e.context.exhibit=exhibit;const markup=vm.runInContext('historyPeelMarkup(exhibit)',e.context);
 const imageLinks=markup.match(/<a\b[^>]*data-history-inspect[^>]*>/g)||[];assert.equal(imageLinks.length,3);assert(imageLinks.every(link=>/\bhref="\/(?:cover|pikachu|jigglypuff)\.png"/.test(link)&&/target="_blank"/.test(link)),'without JS the artwork must still open the exact image');assert.equal((markup.match(/data-peel-card=/g)||[]).length,2);assert.match(markup,/Ivy Pikachu, 1996/);assert.match(markup,/Jigglypuff, 1996/);assert.doesNotMatch(markup,/data-peel-ready/);
 const reveal=markup.match(/<button\b[^>]*data-peel-toggle[^>]*>/)?.[0];assert(reveal);assert.match(reveal,/aria-pressed="false"/);assert.match(reveal,/\bdisabled\b/,'no-JS readers must not receive a nonfunctional Reveal button');assert(markup.indexOf('data-peel-toggle')<markup.indexOf('data-history-peel'),'the control must precede the long sticky runway');
 assert.match(markup,/<noscript>[\s\S]*?<image\b[^>]*\bhref="\/pikachu\.png"/,'a cropped exact card face remains visible without JS');
 e.context.promo={openingArtwork:exhibit.cards[0]};const croppedOpening=vm.runInContext('historyOpeningMarkup(promo)',e.context);assert.match(croppedOpening,/<image\b[^>]*\bhref="\/pikachu\.png"/);assert.doesNotMatch(croppedOpening,/data-history-src/,'the opening image must load eagerly');e.context.promo={openingArtwork:exhibit.cards[1]};assert.match(vm.runInContext('historyOpeningMarkup(promo)',e.context),/fetchpriority="high"/);
});

test('year controls clamp, restore focus and respect reduced motion without remounting',()=>{
 const e=environment();render(e);const years=[...new Set(data.events.map(event=>event.year))].sort((a,b)=>a-b);
 assert.equal(e.previous.disabled,true);assert.equal(e.next.disabled,false);assert.equal(e.output.textContent,String(years[0]));
 e.next.listeners.click();assert.equal(e.output.textContent,String(years[1]));assert.equal(e.previous.disabled,false);assert.equal(e.scrolls.at(-1).behavior,'auto');assert.equal(e.focus.at(-1).year,years[1]);assert.equal(e.focus.at(-1).options.preventScroll,true);
 for(let i=0;i<years.length+2;i++)e.next.listeners.click();assert.equal(e.output.textContent,String(years.at(-1)));assert.equal(e.next.disabled,true);
 for(let i=0;i<years.length+2;i++)e.previous.listeners.click();assert.equal(e.output.textContent,String(years[0]));assert.equal(e.previous.disabled,true);
 const html=e.mount.innerHTML;render(e);assert.equal(e.mount.innerHTML,html);assert.equal(e.motion.disabled,true);assert.equal(e.motion.textContent,'Movement reduced');assert.equal(e.frames.size,0);
 assert.equal(e.peel.style.values['--peel'],1);assert.equal(e.peelButton.disabled,true,'reduced-motion readers receive the cards already separated');
});

test('map pan, artwork movement and magazine reveal remain bounded at scroll extremes',()=>{
 const {context}=environment();
 assert(vm.runInContext('historyMapOffset(0,12000,900)===0',context));assert.equal(vm.runInContext('historyMapOffset(5550,12000,900)',context),-15);assert.equal(vm.runInContext('historyMapOffset(14000,12000,900)',context),-30);assert(vm.runInContext('historyMapOffset(-100,900,900)===0',context));
 assert.equal(vm.runInContext('historyArtworkOffset(100000,100,900)',context),22);assert.equal(vm.runInContext('historyArtworkOffset(-100000,100,900)',context),-22);assert(vm.runInContext('historyArtworkOffset(200,100,900)>historyArtworkOffset(100,100,900)',context));
 assert.equal(vm.runInContext('historyPeelProgress(180,1200,500,164)',context),0);assert.equal(vm.runInContext('historyPeelProgress(-186,1200,500,164)',context),.5);assert.equal(vm.runInContext('historyPeelProgress(-536,1200,500,164)',context),1);assert.equal(vm.runInContext('historyPeelProgress(-10000,1200,500,164)',context),1);assert.equal(vm.runInContext('historyPeelProgress(500,500,500,164)',context),0);
});

test('scroll coalesces frames; pause and system preference cancel motion while leaving the cards usable',()=>{
 const e=environment({reduced:false});render(e);assert.equal(e.peelButton.disabled,false,'Reveal becomes available once its behaviour is attached');assert.equal(e.frames.size,1);e.win.listeners.scroll();e.win.listeners.scroll();assert.equal(e.frames.size,1);e.flush();
 assert(e.root.style.values['--map-y']);assert(e.figures[0].style.values['--art-y']);
 e.peelBounds.top=-186;e.peelBounds.bottom=1014;e.win.listeners.scroll();e.flush();assert.equal(e.peel.style.values['--peel'],.5);
 const frozen=e.root.style.values['--map-y'];e.motion.listeners.click();assert.equal(e.body.dataset.historyMotion,'paused');assert.equal(e.motion.attributes['aria-pressed'],'true');assert.equal(e.root.style.values['--map-y'],frozen);e.win.listeners.scroll();assert.equal(e.frames.size,0);
 e.peelButton.listeners.click();assert.equal(e.peel.style.values['--peel'],1,'a paused reader can use explicit Reveal');assert.equal(e.peelButton.attributes['aria-pressed'],'true');
 e.motion.listeners.click();e.flush();assert.equal(e.motion.attributes['aria-pressed'],'false');assert.equal(e.peel.style.values['--peel'],1,'manual Reveal survives subsequent scroll updates');
 e.peelButton.listeners.click();assert.equal(e.peel.style.values['--peel'],0);assert.equal(e.peelButton.attributes['aria-pressed'],'false');e.win.listeners.scroll();e.flush();assert.equal(e.peel.style.values['--peel'],0,'manual Reset must remain closed at the current scroll position');e.win.listeners.resize();e.flush();assert.equal(e.peel.style.values['--peel'],0,'resizing must not undo Reset');
 e.peelBounds.top=-1400;e.peelBounds.bottom=-200;e.win.listeners.scroll();e.flush();e.peelBounds.top=-186;e.peelBounds.bottom=1014;e.win.listeners.scroll();e.flush();assert.equal(e.peel.style.values['--peel'],.5,'leaving the exhibit releases its manual override for re-entry');
 e.reducedQuery.matches=true;e.reducedQuery.listeners.change();assert.equal(e.frames.size,0);assert.equal(e.motion.disabled,true);assert.equal(e.body.dataset.historyReduced,'true');assert.equal(e.peel.style.values['--peel'],1);
});

test('optional vibration requires support, opt-in, trusted touch input and a cooldown',()=>{
 const unsupported=environment({reduced:false});render(unsupported);assert.equal(unsupported.label.hidden,true);
 const e=environment({reduced:false,vibration:true});render(e);assert.equal(e.label.hidden,false);assert.equal(e.touch.checked,false);e.doc.listeners.pointerdown({isTrusted:true,pointerType:'touch'});e.next.listeners.click();assert.deepEqual(e.vibrations,[]);
 e.touch.checked=true;e.touch.listeners.change();assert.deepEqual(e.vibrations,[9]);assert.equal(e.storage.get('stackr-history-touch'),'on');
 e.advance();e.doc.listeners.keydown();e.next.listeners.click();assert.deepEqual(e.vibrations,[9]);
 e.doc.listeners.pointerdown({isTrusted:false,pointerType:'touch'});e.next.listeners.click();assert.deepEqual(e.vibrations,[9]);
 e.doc.listeners.pointerdown({isTrusted:true,pointerType:'touch'});e.next.listeners.click();e.next.listeners.click();assert.deepEqual(e.vibrations,[9,9]);
 e.advance();e.reducedQuery.matches=true;e.reducedQuery.listeners.change();e.next.listeners.click();assert.deepEqual(e.vibrations,[9,9]);
});

test('archive inspector opens the exact selected artwork and returns focus when closed',()=>{
 const e=environment();render(e);let focused=false;const deferred={dataset:{historySrc:'/media/contents/exact-pikachu'},...control()},clone={exact:'Ivy Pikachu',querySelectorAll:()=>[deferred]},artwork={cloneNode:()=>clone};
 const button={...control(),querySelector:()=>artwork,focus:options=>{focused=options.preventScroll;}};button.setAttribute('aria-label','Enlarge Ivy Pikachu, 1996');button.setAttribute('href','/media/contents/exact-pikachu');let prevented=false;
 e.doc.listeners.click({target:{closest:()=>button},preventDefault:()=>{prevented=true;}});assert(prevented,'JS enlargement replaces the exact-image link without navigating away');assert.equal(e.inspector.open,true);assert.equal(e.inspectorTitle.textContent,'Ivy Pikachu, 1996');assert.equal(e.inspectorContent.nodes[0],clone);assert.equal(deferred.attributes.href,'/media/contents/exact-pikachu');assert.equal(deferred.dataset.historySrc,undefined);
 e.inspectorClose.listeners.click();assert.equal(e.inspector.open,false);assert.equal(e.inspectorContent.nodes.length,0);assert(focused);
 const unavailable={...button,attributes:{...button.attributes,'aria-disabled':'true'}};e.doc.listeners.click({target:{closest:()=>unavailable},preventDefault:()=>{}});assert.equal(e.inspector.open,false);
});

test('cropped archive originals defer requests until near the viewport, with a no-observer fallback',()=>{
 const e=environment({withObserver:true});render(e);assert(e.images.length>0);assert(e.images.every(image=>!image.attributes.href));
 const observer=e.observers.find(item=>item.targets.includes(e.images[0]));assert(observer,'cropped originals must be observed before loading');
 observer.callback([{target:e.images[0],isIntersecting:false}]);assert.equal(e.images[0].attributes.href,undefined);
 const expected=e.images[0].dataset.historySrc;observer.callback([{target:e.images[0],isIntersecting:true}]);assert.equal(e.images[0].attributes.href,expected);assert.equal(e.images[0].dataset.historySrc,undefined);assert(!observer.targets.includes(e.images[0]));
 const fallback=environment();render(fallback);assert(fallback.images.every(image=>image.attributes.href));
});

test('return to shop restores its originating page and preserves normal links for external arrivals',()=>{
 const e=environment();render(e);let prevented=false;e.start.listeners.click({preventDefault:()=>{prevented=true;}});assert(prevented,'Start must avoid another fragment history entry');assert.equal(e.output.textContent,String(data.events[0].year));prevented=false;e.backLink.listeners.click({preventDefault:()=>{prevented=true;}});assert(prevented);assert.deepEqual(e.returns,['back']);
 const direct=environment({referrer:'https://elsewhere.example/'});render(direct);direct.backLink.listeners.click({preventDefault:()=>assert.fail('external arrivals must use the normal shop link')});assert.equal(direct.returns.length,0);
});

test('original archives, source-bound crops and Johto rendition retain exact provenance',()=>{
 for(const original of evidence.originals){const file='src/assets/history-'+original.eventId+(original.mime==='image/png'?'.png':'.jpg');assert.equal(hash(fs.readFileSync(file)),original.sha256);assert.equal(new URL(original.sourceUrl).protocol,'https:');}
 const entries=[...data.events.flatMap(event=>event.image?[event.image]:[]),...Object.values(registry.assets||{})];
 for(const image of entries){assert.match(image.sha256,/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(image.width)&&image.width>0);assert(Number.isSafeInteger(image.height)&&image.height>0);assert.equal(new URL(image.sourceUrl).protocol,'https:');assert(!Object.hasOwn(image,'localPath'));if(image.file)assert.equal(hash(fs.readFileSync('src/assets/'+image.file)),image.sha256);else assert.equal(new URL(image.url).protocol,'https:');if(image.crop){const c=image.crop;assert.equal(c.sourceSha256,image.sha256);assert.equal(c.sourceWidth,image.width);assert.equal(c.sourceHeight,image.height);assert(c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=image.width&&c.y+c.height<=image.height);}}
 const map=JSON.parse(fs.readFileSync('src/history-map.json','utf8')),png=fs.readFileSync('src/assets/'+map.file);assert.equal(hash(png),map.sha256);assert.equal(png.readUInt32BE(16),map.width);assert.equal(png.readUInt32BE(20),map.height);assert.equal(map.width/map.height,map.original.width/map.original.height);assert.equal(new URL(map.sourcePage).protocol,'https:');assert.match(map.credit,/Hexa Typhlosion/);
});

test('SVG and map failures hide broken artwork, disable enlargement and preserve useful text',()=>{
 const e=environment();render(e);const artwork=control(),button=control(),fallback={hidden:true};button.setAttribute('href','/exact-card.png');const figure={querySelector:selector=>({'.history-artwork':artwork,'[data-history-inspect]':button,'.history-image-missing':fallback}[selector])};const target={matches:selector=>selector.includes('[data-history-source]'),closest:selector=>selector==='figure'?figure:null};
 e.doc.listeners.error({target});assert.equal(artwork.attributes.hidden,'');assert.equal(button.attributes.disabled,'');assert.equal(button.attributes['aria-disabled'],'true');assert.equal(button.attributes.href,undefined);assert.equal(fallback.hidden,false);assert.doesNotThrow(()=>e.doc.listeners.error({target:{matches:()=>false}}));e.map.listeners.error();assert.equal(e.map.attributes.hidden,'');
});


test('CoroCoro reveals peel the cards in sequence and never lift Mew before opening the insert',()=>{
 const {context}=environment();const phases=p=>JSON.parse(vm.runInContext('JSON.stringify(historyRevealPhases('+p+',"tear"))',context));
 const closed=phases(0),first=phases(.3),sleeve=phases(.6),open=phases(1);
 assert.equal(closed.a,0);assert.equal(closed.b,0);assert.equal(closed.mew,0);
 assert(first.a>0);assert.equal(first.b,0);assert(first.curlA>0);assert.equal(first.unfold,0);assert.equal(first.mew,0);
 assert.equal(sleeve.tear,1);assert(sleeve.unfold>0);assert.equal(sleeve.mew,0);
 for(const key of ['a','b','tear','unfold','mew'])assert.equal(open[key],1);
 assert(open.curlA<1e-12);assert(open.curlB<1e-12);
 for(const p of [-100,0,.2,.5,.9,1,100])for(const value of Object.values(phases(p)))assert(value>=0&&value<=1);
});

test('Mew uses the original insert photograph and an explicit narrow pull handle',()=>{
 const e=environment(),markup=vm.runInContext('historyPeelMarkup(pokemonHistoryData.events.find(e=>e.id==="2001-corocoro-mew").exhibit)',e.context);
 assert.match(markup,/data-history-reveal-kind="tear"/);assert.match(markup,/history-insert-front/);assert.match(markup,/data-tear-handle[^>]*aria-label="Pull down to open the Shining Mew insert"[^>]*disabled/);
 assert.match(markup,/Original sealed Shining Mew paper insert/);assert.match(markup,/mew-2001-original-insert/);assert.match(markup,/history-mew-card/);
 assert.equal((markup.match(/data-history-inspect/g)||[]).length,3,'cover, original sleeve and original card all remain inspectable');
 assert.equal(vm.runInContext('historyTearDrag(.1,38,190)',e.context),.30000000000000004);
 assert.equal(vm.runInContext('historyTearDrag(0,-300)',e.context),0);assert.equal(vm.runInContext('historyTearDrag(.2,900)',e.context),1);
});

test('only a drag on the Mew handle takes pointer capture; release opens it and reduced motion stays revealed',()=>{
 const e=environment({reduced:false,withTear:true});render(e);e.flush();const gesture={pointerId:7,button:0,clientY:300,preventDefault(){this.prevented=true;}};
 e.tearHandle.listeners.pointerdown(gesture);assert.deepEqual(e.tearHandle.captures,[7]);assert.equal(gesture.prevented,true);
 e.tearHandle.listeners.pointermove({...gesture,clientY:455});assert(e.peel.style.values['--tear']>0);assert(e.peel.style.values['--peel']>0);assert.equal(e.tearHandle.disabled,false,'the captured handle stays enabled until pointer release');
 e.tearHandle.listeners.pointerup({...gesture,clientY:390});assert.equal(e.peel.style.values['--peel'],1);assert.equal(e.peel.style.values['--mew'],1);assert.equal(e.peel.dataset.manualReveal,'true');
 e.peelButton.listeners.click();assert.equal(e.peel.style.values['--peel'],0);
 const reduced=environment({reduced:true,withTear:true});render(reduced);assert.equal(reduced.peel.style.values['--mew'],1);assert.equal(reduced.tearHandle.disabled,true);
 const untouched={...gesture,prevented:false};reduced.tearHandle.listeners.pointerdown(untouched);assert.equal(untouched.prevented,false);assert.deepEqual(reduced.tearHandle.captures,[]);
});

test('one hundred moments reach the thirtieth anniversary with games, cards, screen stories and shared events',()=>{
 assert.equal(data.events.length,100);assert.equal(Math.min(...data.events.map(e=>e.year)),1996);assert.equal(Math.max(...data.events.map(e=>e.year)),2026);
 assert.deepEqual(new Set(data.events.map(e=>e.lane)),new Set(['games','cards','films','anime','events']));
 assert(data.events.some(e=>e.id==='2021-celebrations'));assert(data.events.some(e=>e.id==='2026-thirty-tcg'));assert(data.events.some(e=>e.id==='2026-thirtieth-campaign'));
 assert(data.events.filter(e=>e.lane==='events').length>=14);assert(data.events.filter(e=>e.year>2023).length>=10);
 for(const e of data.events)assert(e.image||e.artifactIds?.length||e.peel||e.stats?.length,'Each moment needs a genuine archive object or sourced visual explanation: '+e.id);
 for(let i=1;i<data.events.length;i++)assert(data.events[i-1].date<=data.events[i].date,'Reading order must match the supported dates');
});

test('small original artwork carries its native display cap instead of being stretched',()=>{
 const e=environment();e.context.small={src:'/assets/small-original.png',width:160,height:230,caption:'Original archival card',sourceUrl:'https://example.com/archive'};
 const markup=vm.runInContext('historyArtwork(small)',e.context);assert.match(markup,/--archive-width:160px/);assert.match(markup,/--art-native-width:160px/);
 for(const item of data.events.filter(item=>['1999-power-one','2000-spell-unown','2001-celebi-film','2002-heroes-film','2005-lucario-film','2017-i-choose-you-film'].includes(item.id)))assert(item.image.width>=500,'Official film stills must retain enough pixels for a phone display');
});

test('the attached backs register to the original magazine and printed faces remain complete',()=>{
 const e=environment(),exhibit=e.runtimeData.events.find(event=>event.id==='1996-corocoro-cards').exhibit;
 assert(exhibit.insert&&exhibit.backs.length===2);
 const page=exhibit.insert.crop;
 for(const back of exhibit.backs){
  assert.equal(back.sha256,exhibit.insert.sha256);assert.equal(back.registrationSourceSha256,exhibit.insert.sha256);
  const c=back.crop;assert(c.x>=page.x&&c.y>=page.y&&c.x+c.width<=page.x+page.width&&c.y+c.height<=page.y+page.height);
  for(const [x,y]of back.subjectPolygon)assert(x>=c.x&&y>=c.y&&x<=c.x+c.width&&y<=c.y+c.height);
 }
 const markup=vm.runInContext('historyPeelMarkup(pokemonHistoryData.events.find(e=>e.id==="1996-corocoro-cards").exhibit)',e.context);
 assert.match(markup,/history-original-page/);assert.equal((markup.match(/history-card-reverse/g)||[]).length,2);assert.equal((markup.match(/history-card-face/g)||[]).length,2);
 assert.doesNotMatch(markup,/history-promo-mount|history-insert-backing/);assert.match(markup,/concealed left\/right card order is illustrative/);
 const css=fs.readFileSync('src/history-reveal.css','utf8');assert.doesNotMatch(css,/--curl-a,|--curl-b,|invisible lid/);assert.match(css,/\.history-card-face\{transform:rotateY\(180deg\)/);
});

test('a real tap advances through the physical sequence, and pause cancels its pending frames',()=>{
 const e=environment({reduced:false});render(e);e.flush();e.peelButton.listeners.click({isTrusted:true});
 assert.equal(e.peel.style.values['--peel'],0);e.advance(420);e.flush();assert(e.peel.style.values['--card-a']>0);assert.equal(e.peel.style.values['--card-b'],0);assert.equal(e.peel.style.values['--turn-b'],0);
 e.advance(980);e.flush();assert.equal(e.peel.style.values['--peel'],1);assert.equal(e.peel.style.values['--turn-b'],1);
 e.peelButton.listeners.click({isTrusted:true});e.advance(200);e.flush();assert(e.frames.size>0);e.motion.listeners.click();assert.equal(e.frames.size,0);
 const m=environment({reduced:false,withTear:true});render(m);m.flush();m.peelButton.listeners.click({isTrusted:true});m.advance(800);m.flush();assert.equal(m.peel.style.values['--tear'],1);assert.equal(m.peel.style.values['--mew-out'],0);m.advance(800);m.flush();assert.equal(m.peel.style.values['--mew-out'],1);assert.equal(m.peel.dataset.mewExtracted,'true');
});

test('weak artwork replacements and transparent-margin frames retain exact source identities',()=>{
 const replacements=['1999-english-base','2001-vs','2001-web'];
 for(const id of replacements){const image=data.events.find(e=>e.id===id).image;assert(image.file?.startsWith('history-quality-'));assert(image.width>=350);assert.equal(hash(fs.readFileSync('src/assets/'+image.file)),image.sha256);}
 const usum=data.events.find(e=>e.id==='2017-ultra-sun-moon').image;assert(usum.crop.height>=800,'Real game packages must retain enough native detail for inspection');assert.equal(new URL(usum.url).hostname,'www.gamefreak.co.jp');assert(usum.delivery.width<=usum.width);assert(usum.delivery.bytes<usum.bytes,'A phone should not download the publisher master to see a game cover');
 const london=data.events.find(e=>e.id==='2022-worlds-london').image;assert(london.crop.width>=490&&london.crop.width<london.width/2);assert.equal(london.crop.sourceSha256,london.sha256);
 assert.match(data.events.find(e=>e.id==='2004-first-worlds').image.caption,/logo/);
});

test('card silhouettes clip the original raster in source coordinates and keep separate static references',()=>{
 const e=environment(),card={src:'/media/contents/exact-card',width:639,height:1078,caption:'Exact printed card',sourceUrl:'https://example.com/original',crop:{x:73,y:317,width:492,height:692,sourceWidth:639,sourceHeight:1078},cardOutline:{sourceSha256:'a'.repeat(64),sourceWidth:639,sourceHeight:1078,path:'M 91 317 L 546 317 Q 565 317 565 336 L 565 990 Q 565 1009 546 1009 L 91 1009 Q 73 1009 73 990 L 73 336 Q 73 317 91 317 Z'}};
 e.context.card=card;
 const first=vm.runInContext('historyArtwork(card)',e.context),second=vm.runInContext('historyArtwork(card)',e.context);
 assert.match(first,/<figure[^>]*class="history-figure is-card is-portrait"/);
 assert.match(first,/viewBox="73 317 492 692"/,'masking must retain the complete declared card viewport');
 assert.match(first,/<image[^>]*x="0" y="0" width="639" height="1078"/,'card pixels must use the original photograph geometry');
 assert(first.includes('<path d="'+card.cardOutline.path+'"'),'the supplied outline must remain in source pixel coordinates');
 const ids=[...first.matchAll(/<clipPath id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,2,'normal and no-JS artwork each need their own clipping definition');
 assert.equal(ids[1],ids[0]+'-static');
 for(const id of ids)assert(first.includes('<image data-history-source clip-path="url(#'+id+')"'),'the raster itself must be clipped');
 assert.match(first,/<noscript>[\s\S]*?<image[^>]*href="\/media\/contents\/exact-card"/);
 assert(!second.includes('id="'+ids[0]+'"'),'another instance of the same card must not reuse its definition id');
 assert.doesNotMatch(first,/<svg[^>]*\bclip-path=/,'outer-SVG clipping can be overridden by gallery CSS and must not carry the silhouette');
 e.context.cover={...card,caption:'Original magazine cover'};delete e.context.cover.cardOutline;
 const cover=vm.runInContext('historyArtwork(cover)',e.context);assert.doesNotMatch(cover,/is-card|<clipPath|clip-path=/,'magazines and game boxes must keep their own rectangular edges');
});

test('inspector clones isolate clipping references without changing the original artwork',()=>{
 const e=environment(),originalClip={id:'history-card-edge-42'},originalImage={attributes:{'clip-path':'url(#history-card-edge-42)',width:'639',height:'1078'}},clip={id:originalClip.id},image={attributes:{...originalImage.attributes},getAttribute(key){return this.attributes[key];},setAttribute(key,value){this.attributes[key]=value;}},copy={querySelectorAll:selector=>selector==='clipPath[id]'?[clip]:selector==='[clip-path]'?[image]:[]};
 e.context.artwork={cloneNode(deep){assert.equal(deep,true);return copy;}};
 const cloned=vm.runInContext('historyCloneArtwork(artwork)',e.context);
 assert.equal(cloned,copy);assert.equal(clip.id,'history-card-edge-42-inspector');assert.equal(image.attributes['clip-path'],'url(#history-card-edge-42-inspector)');
 assert.equal(originalClip.id,'history-card-edge-42');assert.equal(originalImage.attributes['clip-path'],'url(#history-card-edge-42)');
 assert.equal(image.attributes.width,'639');assert.equal(image.attributes.height,'1078');
});

test('all standalone timeline card faces have outlines bound to their exact source image',()=>{
 const cards=[...['corocoro-1996-pikachu','corocoro-1996-jigglypuff','corocoro-2001-shining-mew-pokumon'].map(id=>registry.assets[id]),...['1999-english-base','2001-vs','2001-web'].map(id=>data.events.find(event=>event.id===id)?.image)];
 for(const card of cards){assert(card,'a required standalone card must retain its exact asset');const outline=card.cardOutline;assert(outline,'missing source-bound silhouette: '+card.id);assert.equal(outline.sourceSha256,card.sha256);assert.equal(outline.sourceWidth,card.width);assert.equal(outline.sourceHeight,card.height);assert.match(outline.path,/^M\s*\d/);assert.match(outline.path,/Z$/);}
 for(const id of ['corocoro-1996-cover','corocoro-2001-cover','1996-red-green-0','1999-gold-silver-0'])assert(!registry.assets[id].cardOutline,'cover/packaging must not receive a generic card cut: '+id);
});
