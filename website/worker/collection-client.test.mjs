import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('./catalogue-printings.mjs',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+readFileSync(new URL('../src/collection.js',import.meta.url),'utf8');
const removedEditorIds=new Set(['card-dialog','card-form','card-dialog-name','card-dialog-identity','target-binder','card-variant','card-dialog-image']);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
function harness(fetch,logos=[],options={}){
 const nodes=new Map(),documentEvents={};let renderedCards=[],renderedVersion=-1;
 function element(id=''){return {id,value:'',checked:false,hidden:false,disabled:false,open:false,textContent:'',_html:'',htmlWrites:0,get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.htmlWrites++;},dataset:{},elements:{},reset(){},classList:{toggle(){}},events:{},addEventListener(name,fn){this.events[name]=fn;},attributes:{},setAttribute(name,value){this.attributes[name]=value;},hasAttribute(name){return name in this.attributes;},replaceChildren(){this.innerHTML='';},insertAdjacentHTML(_,html){this.innerHTML+=html;},focus(){},remove(){this.removed=true;},append(){},close(){this.open=false;},showModal(){this.open=true;},querySelector(sel){return this.parts?.[sel]||node(id+sel);},querySelectorAll(){return this.fields||[];}};}
 const node=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
 const navigation=['sets','library'].map(view=>{const button=node('nav-'+view);button.dataset.view=view;return button;});
 node('collection-main').dataset.view='loading';
 function cardNodes(){
  const grid=node('binder-cards');if(renderedVersion!==grid.htmlWrites){renderedVersion=grid.htmlWrites;renderedCards=[...grid.innerHTML.matchAll(/<button\b([^>]*\bdata-card-key="([^"]+)"[^>]*)>/g)].map(match=>{
   const tile=element(),article=element(),feedback=element();tile.dataset.cardKey=match[2];for(const attribute of match[1].matchAll(/(aria-[\w-]+)="([^"]*)"/g))tile.setAttribute(attribute[1],attribute[2]);tile.closest=()=>article;tile.article=article;article.parts={'.card-tile':tile,'.own-status':feedback};
   const start=grid.innerHTML.lastIndexOf('<article',match.index),end=grid.innerHTML.indexOf('</article>',match.index)+10,original=grid.innerHTML.slice(start,end);Object.defineProperty(article,'outerHTML',{set(value){grid.innerHTML=grid.innerHTML.replace(original,value);}});
   let badge=null;const art=element();art.append=value=>{badge=value;badge.remove=()=>{badge=null;};};if(original.includes('class="owned-badge"')){badge=element();badge.textContent='Pulled';badge.remove=()=>{badge=null;};}tile.querySelector=selector=>selector==='.owned-badge'?badge:selector==='.card-art'?art:null;return tile;
  });}return renderedCards;
 }
 const document={getElementById:id=>removedEditorIds.has(id)?null:node(id),createElement:()=>element(),querySelectorAll(selector){if(selector==='[data-view]')return[node('collection-main'),...navigation];if(selector==='button[data-view]')return navigation;if(selector==='#delta-card-list [data-list-number]')return options.deltaCards||[];if(selector==='[data-card-key]'||selector==='#binder-cards [data-card-key]')return cardNodes();if(selector==='dialog')return [...nodes.values()].filter(n=>n.id.endsWith('dialog'));return[];},addEventListener(name,fn){documentEvents[name]=fn;}};
 node('collection-set-logos').textContent=JSON.stringify({logos});
 node('collection-set-links').textContent=JSON.stringify({matches:options.links||{}});
 node('collection-covers').textContent=JSON.stringify({covers:options.covers||[]});
 node('create-form').elements={name:element('name'),language:element('language')};
 const historyEntries=[],scrolls=[];
 const context={document,window:{addEventListener(){},scrollTo:value=>scrolls.push(value),...options.window},crypto:webcrypto,navigator:options.navigator,Image:options.Image,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,history:{replaceState(a,b,url){historyEntries.push(url);const u=new URL(url,'https://site.test');Object.assign(context.location,{pathname:u.pathname,search:u.search,hash:u.hash});}},location:{pathname:'/collection',search:'',hash:'',...options.location},fetch};
 const expose='globalThis.inspect={fetchReadySet,queueReady,scheduleReadySets,readyState:()=>[...readyPublic.values()],tapCard,openCardPreview,loadSavedBinderProgress,progressTask:()=>progressRun,openFeaturedBinder,warmCardImages,loadAccount,loadChecklist,togglePulled,isTrialBinder,quickState:()=>[...quickDrafts.values()],start,lock,showView,openSetCollection,setTargetFromQuery,shopHrefForBinder,setLogoUrl,binderCover,renderBinders,openCreate,saveDraft,openBinder,loadCards,loadSets,renderSets,refreshPulledState,cardState:()=>[...cardObjects.values()],advanceModal:()=>modalGeneration++,setMode:v=>mode=v};';
 vm.runInNewContext(source.replace(/\nstart\(\);/, '\n'+expose),context);
 function form(){const f=node('test-form');f.fields=[element('name'),element('archived')];f.parts={'button.primary':element('submit'),'.dialog-status':element('feedback')};f.parts['button.primary'].textContent='Save changes';return f;}
 return {api:context.inspect,node,form,location:context.location,historyEntries,scrolls,cardNode:key=>cardNodes().find(n=>n.dataset.cardKey===key),visibleCards:()=>cardNodes().filter(n=>!n.article.hidden&&!n.article.removed).map(n=>n.dataset.cardKey),clickCard:key=>documentEvents.click({target:{closest:()=>({dataset:{cardKey:key}})}}),inspectCard:key=>documentEvents.click({target:{closest:()=>({dataset:{inspectCard:key}})}})};
}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const tick=()=>new Promise(r=>setImmediate(r));
function cardOwnershipPage(binder,rows,url){
 const params=new URL(url,'https://site.test').searchParams,cardIds=(params.get('cardIds')||'').split(','),offset=Number(params.get('cursor')||0),selected=rows.filter(row=>cardIds.includes(row.cardId)),ownership=selected.slice(offset,offset+50);
 return {binder,cardIds,ownership,ownershipTotal:selected.length,meta:{pagination:{limit:50,offset,nextCursor:offset+ownership.length<selected.length?String(offset+ownership.length):null}}};
}
test('old Pokédex bookmarks return to the private binder library without species requests',async()=>{
 const calls=[],h=harness(url=>{calls.push(url);return Promise.resolve(response({binders:[],hasMore:false}));},[],{location:{hash:'#pokedex'}});await h.api.start();assert.equal(h.location.hash,'#library');assert.equal(calls.length,1);assert.ok(calls.every(u=>!u.includes('pokemon')));
});
test('returning login opens saved binders while an explicit discovery link still opens sets',async()=>{
 const saved={id:'saved-binder',language:'en',type:'custom',name:'My real saved binder',archived:false},calls=[];
 const h=harness((url,options)=>{calls.push({url,method:options.method});return Promise.resolve(response({binders:[saved],hasMore:false}));});
 await h.api.start();assert.equal(h.location.hash,'#library');assert.match(h.node('binder-grid').innerHTML,/My real saved binder/);assert.equal(h.node('collection-app').hidden,false);assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
 const explicit=harness(url=>Promise.resolve(response(url.includes('/catalogue/')?{data:{sets:[]},meta:{pagination:{nextCursor:null}}}:{binders:[saved],hasMore:false})),[],{location:{hash:'#sets'}});explicit.node('set-language').value='en';await explicit.api.start();assert.equal(explicit.location.hash,'#sets');
});
test('the account screen reads profile safely and discards late details after identity is lost',async()=>{
 const profile={account:{displayName:'<img src=x onerror=alert(1)>',email:'collector@example.test'},collection:{activeBinders:2,archivedBinders:1}};
 const h=harness(()=>Promise.resolve(response(profile)));await h.api.loadAccount();assert.equal(h.node('account-name').textContent,profile.account.displayName);assert.equal(h.node('account-name').innerHTML,'');assert.equal(h.node('account-counts').textContent,'2 saved binders · 1 archived');
 const pending=deferred(),late=harness(()=>pending.promise);const task=late.api.loadAccount();late.api.lock();pending.resolve(response(profile));await task;assert.equal(late.node('account-name').textContent,'Your account');assert.equal(late.node('account-email').textContent,'');assert.equal(late.node('account-counts').textContent,'');assert.equal(late.node('collection-app').hidden,true);assert.match(late.node('account-link').href,/signin-with-chatgpt/);
});
test('character covers match exact set and language and carry the set badge on the zipper',()=>{
 const h=harness(()=>assert.fail('Cover artwork cannot write ownership'),[],{covers:[{setId:'set-one',language:'en',character:'mewtwo',image:'/assets/binder-character-mewtwo-app.png'}]});
 const cover=h.api.binderCover({setId:'set-one',language:'en',type:'set',setName:'30th Celebration'});assert.match(cover,/embroidered-character/);assert.match(cover,/binder-purple-leather-angled-v1.webp/);assert.match(cover,/class="cover-logo embroidered-badge" title="30th Celebration"/);assert.doesNotMatch(cover,/zipper-label/);assert.match(cover,/binder-character-mewtwo-app.png/);
 for(const info of [{setId:'set-one',language:'ja',type:'set'},{setId:'other-set',language:'en',type:'set'},{setId:'set-one',language:'en',type:'custom',name:'Personal'}])assert.doesNotMatch(h.api.binderCover(info),/embroidered-character|binder-character-mewtwo-app.png/);
});
test('30th Celebration uses the requested Mew and Pikachu pattern without putting the badge on its front',()=>{
 const h=harness(()=>assert.fail('Decorative artwork must not fetch private data'),[],{covers:[{setId:'30th-set',language:'en',character:'mew-pikachu',image:'/assets/binder-character-mew-app.png',companionImage:'/assets/binder-character-pikachu-app.png'}]});
 const art=h.api.binderCover({setId:'30th-set',language:'en',type:'set',setName:'30th Celebration'});assert.match(art,/celebration-cover/);assert.match(art,/mew-pikachu-pattern/);assert.match(art,/binder-character-mew-app.png/);assert.match(art,/binder-character-pikachu-app.png/);assert.doesNotMatch(art,/binder-character-mewtwo-app.png|zipper-label/);
 const another=h.api.binderCover({setId:'other-30th',language:'en',type:'set',setName:'30th Celebration'});assert.doesNotMatch(another,/mew-pikachu-pattern/);
});
test('uncertain collection writes freeze visible fields and retry the identical action',async()=>{
 const pending=deferred(),calls=[];let attempt=0;
 const h=harness((url,options)=>{calls.push(JSON.parse(options.body));return ++attempt===1?pending.promise:Promise.resolve(response({ok:true}));});
 const form=h.form(),dialog=h.node('dialog');dialog.open=true;
 const draft={id:'same-action'},payload={id:draft.id,name:'Saved binder'};let saved=0;
 const first=h.api.saveDraft(draft,()=>draft,form,dialog,'/binder',()=>payload,()=>{saved++});
 assert.ok(form.fields.every(f=>f.disabled));assert.equal(form.querySelector('button.primary').disabled,true);
 pending.reject(new TypeError('Network unavailable'));await first;
 assert.ok(form.fields.every(f=>f.disabled));assert.equal(form.querySelector('button.primary').textContent,'Retry same change');assert.match(form.querySelector('.dialog-status').textContent,/unchanged details/);
 await h.api.saveDraft(draft,()=>draft,form,dialog,'/binder',()=>({id:'different',name:'Changed binder'}),()=>{saved++});
 assert.deepEqual(calls,[payload,payload]);assert.equal(saved,1);
});
test('an old binder save cannot mutate or close a newer settings dialog',async()=>{
 const pending=deferred(),h=harness(()=>pending.promise),form=h.form(),dialog=h.node('dialog');dialog.open=true;
 const old={id:'old'};let current=old,callbacks=0;
 const request=h.api.saveDraft(old,()=>current,form,dialog,'/binder',()=>({id:'old',name:'Old binder'}),()=>{callbacks++;dialog.close();});
 current={id:'new'};h.api.advanceModal();form.querySelector('.dialog-status').textContent='Loading the new binder settings';form.querySelector('button.primary').disabled=true;
 pending.resolve(response({ok:true}));await request;
 assert.equal(callbacks,0);assert.equal(dialog.open,true);assert.equal(form.querySelector('button.primary').disabled,true);assert.equal(form.querySelector('.dialog-status').textContent,'Loading the new binder settings');
});
test('definite validation failure permits corrections with a fresh action id',async()=>{
 const h=harness(()=>Promise.resolve(response({error:'Invalid binder name'},400))),form=h.form(),dialog=h.node('dialog');dialog.open=true;const draft={id:'bad-action'};
 await h.api.saveDraft(draft,()=>draft,form,dialog,'/binder',()=>({id:draft.id,name:''}),()=>assert.fail('should not succeed'));
 assert.equal(draft.payload,null);assert.notEqual(draft.id,'bad-action');assert.ok(form.fields.every(f=>!f.disabled));assert.equal(form.querySelector('button.primary').disabled,false);
});
test('refreshing the same binder invalidates an older search response and preserves fresh totals',async()=>{
 const pending=deferred();let reads=0;
 const data=()=>({binder:{id:'binder',name:'My binder',language:'en',type:'custom',revision:reads},summary:{uniqueCards:reads,totalVariants:reads,totalQuantity:reads},items:[],hasMore:false,nextOffset:0});
 const h=harness(url=>{if(url.includes('/catalogue/search'))return pending.promise;reads++;return Promise.resolve(response(data()));});
 await h.api.openBinder('binder');h.api.setMode('search');h.node('card-query').value='pikachu';const search=h.api.loadCards(true);await tick();
 await h.api.openBinder('binder');const fresh=h.node('binder-cards').innerHTML,summary=h.node('binder-summary').innerHTML;
 pending.resolve(response({data:{results:[{type:'card',card:{cardId:'old',names:{englishDisplay:'Stale search'},languageCode:'en',variants:[]}}]},meta:{pagination:{nextCursor:null}}}));await search;
 assert.equal(h.node('binder-cards').innerHTML,fresh);assert.equal(h.node('binder-summary').innerHTML,summary);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Stale search/);
});

const setBinder={id:'set-binder',name:'My set',language:'en',type:'set',setId:'real-set',setTotal:2,revision:1};
const checklistCard=(id,name)=>({cardId:id,game:'pokemon',set:{setId:'real-set'},names:{native:name,englishDisplay:name},languageCode:'en',collectorNumber:{value:id},defaultVariantId:'normal',variants:[{variantId:'normal',variantCode:'normal',finishCode:'normal'}]});
function setFlow(currentTotal=2){
 const calls=[];let quantity=0;
 const h=harness(url=>{
  calls.push(url);
  if(url.includes('/checklist')){const second=url.includes('cursor=next'),card=checklistCard(second?'two':'one',second?'Second card':'First card');return Promise.resolve(response({cards:[{card,ownedQuantity:0,ownedVariants:[]}],meta:{pagination:{nextCursor:second?null:'next'}},progress:{owned:quantity?1:0,total:currentTotal,checkedAt:'2026-11-04'}}));}
  return Promise.resolve(response({binder:{...setBinder,revision:quantity?2:1},summary:{uniqueCards:quantity?1:0,totalVariants:quantity?1:0,totalQuantity:quantity},items:[],hasMore:false,nextOffset:50,progress:{owned:quantity?1:0,total:2,checkedAt:'2026-11-04'}}));
 });return{...h,calls,setQuantity:q=>quantity=q};
}
test('a set binder opens its real checklist automatically without recording any cards as owned',async()=>{
 const h=setFlow();await h.api.openBinder('set-binder');
 assert.equal(h.calls.length,3);assert.match(h.calls[1],/\/checklist\?/);assert.match(h.node('binder-cards').innerHTML,/Second card/);assert.match(h.node('binder-cards').innerHTML,/First card/);assert.match(h.node('binder-cards').innerHTML,/data-owned="false"/);assert.equal(h.node('progress-percent').textContent,'0%');
});
test('refreshing a confirmed pulled card retains later loaded pages and counts it once',async()=>{
 const h=setFlow();await h.api.openBinder('set-binder');const previous=h.node('binder-cards').innerHTML;
 assert.match(previous,/Second card/);h.setQuantity(3);
 await h.api.refreshPulledState({binder:setBinder,payload:{cardId:'two'},ownership:{ownedQuantity:3,ownedVariants:[{variantId:'normal',quantity:3}]}});
 assert.equal(h.calls.filter(url=>url.includes('/checklist')).length,2);assert.equal(h.node('binder-cards').innerHTML,previous);assert.equal(h.api.cardState().find(x=>x.card.cardId==='two').ownedVariants[0].quantity,3);assert.equal(h.node('progress-percent').textContent,'50%');assert.match(h.node('binder-summary').innerHTML,/<strong>1<\/strong><span>Pulled/);assert.doesNotMatch(h.node('binder-summary').innerHTML,/Copies|Variants|Quantity/);assert.equal(h.cardNode('two:catalogue').querySelector('.owned-badge').textContent,'Pulled');
});
test('set discovery follows opaque catalogue pages, sorts actual release dates and filters the loaded library',async()=>{
 const calls=[],h=harness(url=>{calls.push(url);const second=url.includes('cursor=next'),s={setId:second?'new':'old',game:'pokemon',languageCode:'en',nativeName:second?'New set':'Old set',englishDisplayName:second?'New set':'Old set',setCode:second?'NEW':'OLD',total:100,releaseDate:second?'2026-10-01':'2020-01-01'};return Promise.resolve(response({data:{sets:[s]},meta:{pagination:{nextCursor:second?null:'next'}}}));});
 h.node('set-language').value='en';await h.api.loadSets();
 assert.equal(calls.length,2);assert.ok(calls.every(u=>u.includes('limit=50')));const markup=h.node('set-grid').innerHTML;assert.ok(markup.indexOf('New set')<markup.indexOf('Old set'));assert.equal(h.node('more-sets').hidden,true);
 h.node('set-query').value='new';h.api.renderSets();assert.match(h.node('set-grid').innerHTML,/New set/);assert.doesNotMatch(h.node('set-grid').innerHTML,/Old set/);assert.match(h.node('set-result-count').textContent,/1 matches from 2 sets/);
});

test('saving a card keeps the current checklist denominator when an older binder snapshot differs',async()=>{
 const h=setFlow(3);await h.api.openBinder('set-binder');h.setQuantity(1);await h.api.refreshPulledState({binder:setBinder,payload:{cardId:'one'},ownership:{ownedQuantity:1,ownedVariants:[{variantId:'normal',quantity:1}]}});assert.equal(h.node('progress-percent').textContent,'33%');assert.equal(h.node('progress-label').textContent,'1 / 3 cards pulled');
});
test('catalogue failure gives an explicit retry instead of reporting an empty set search',async()=>{
 const h=harness(()=>Promise.resolve(response({error:'Catalogue unavailable'},503)));h.node('set-language').value='en';await assert.rejects(h.api.loadSets(),/Catalogue unavailable/);assert.equal(h.node('retry-sets').hidden,false);assert.match(h.node('set-grid').innerHTML,/Sets could not load/);assert.doesNotMatch(h.node('set-grid').innerHTML,/No matching/);assert.equal(h.node('set-result-count').textContent,'Set list unavailable.');
});

const publishedLogo={setId:'canonical-set',language:'ja',setCode:'M6',url:'https://assets.stackrtcg.com/public/set_logo/approved/detail-page.webp'};
test('collector covers require the exact canonical set and printed language, even when another set has the same code',()=>{
 const h=harness(()=>assert.fail('Cover rendering must not fetch or write collection data'),[publishedLogo]);
 assert.equal(h.api.setLogoUrl('canonical-set','ja'),publishedLogo.url);
 assert.equal(h.api.setLogoUrl('canonical-set','en'),'');assert.equal(h.api.setLogoUrl('unknown-set','ja'),'');
 const wrong=h.api.binderCover({setId:'unknown-set',language:'ja',setCode:'M6',setName:'Another set'});
 assert.match(wrong,/Another set/);assert.match(wrong,/data-logo-status="unavailable"/);assert.doesNotMatch(wrong,/class="set-logo"/);
});
test('set binders retain the same published artwork after renaming while custom binders keep their own name',()=>{
 const h=harness(()=>assert.fail('No network read needed'),[publishedLogo]);
 const cover=h.api.binderCover({setId:'canonical-set',language:'ja',type:'set',name:'My renamed binder',setName:'Storm Emeralda'});
 assert.match(cover,/class="set-logo"/);assert.ok(cover.includes(publishedLogo.url));assert.match(cover,/loading="lazy"/);
 const custom=h.api.binderCover({setId:'canonical-set',language:'ja',type:'custom',name:'My favourites'});
 assert.doesNotMatch(custom,/class="set-logo"/);assert.match(custom,/My favourites/);assert.match(custom,/data-logo-status="custom"/);
});
test('collector covers reject unsafe artwork and escape catalogue text',()=>{
 const h=harness(()=>assert.fail('No network read needed'),[
  {...publishedLogo,url:'javascript:alert(1)'},{...publishedLogo,setId:'other-host',url:'https://unapproved.example/logo.png'},
  {...publishedLogo,setId:'local',file:'set-jp-storm-emeralda.png'}, {...publishedLogo,setId:'traversal',file:'../private.png'}
 ]);
 assert.equal(h.api.setLogoUrl('canonical-set','ja'),'');assert.equal(h.api.setLogoUrl('other-host','ja'),'');assert.equal(h.api.setLogoUrl('traversal','ja'),'');assert.equal(h.api.setLogoUrl('local','ja'),'/assets/set-jp-storm-emeralda.png');
 const markup=h.api.binderCover({language:'en',name:'<img src=x onerror=alert(1)>',setCode:'"><script>'});
 assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.doesNotMatch(markup,/<script>|<img src=x/);
});
test('discovery and reopened saved binders use the same set artwork without changing ownership',async()=>{
 let reads=0;
 const b={id:'saved-binder',language:'ja',type:'set',setId:'canonical-set',name:'My renamed binder',setName:'Storm Emeralda',setTotal:1,archived:false};
 const h=harness((url,options)=>{assert.equal(options.method,undefined);reads++;if(url.includes('/catalogue/sets'))return Promise.resolve(response({data:{sets:[{setId:b.setId,languageCode:b.language,setCode:'M6',englishDisplayName:'Storm Emeralda',nativeName:'ストームエメラルダ',total:1}]},meta:{pagination:{nextCursor:null}}}));if(url.includes('/checklist'))return Promise.resolve(response({cards:[],progress:{owned:0,total:1,checkedAt:'2026-11-04'},meta:{pagination:{nextCursor:null}}}));return Promise.resolve(response({binder:b,summary:{uniqueCards:0,totalVariants:0,totalQuantity:0},progress:{owned:0,total:1,checkedAt:'2026-11-04'},items:[],hasMore:false}));},[publishedLogo]);
 h.node('set-language').value='ja';await h.api.loadSets();const discover=h.node('set-grid').innerHTML;
 assert.ok(discover.includes(publishedLogo.url));assert.match(discover,/<strong class="set-name">Storm Emeralda/);
 await h.api.openBinder(b.id);h.api.renderBinders();
 assert.ok(h.node('binder-grid').innerHTML.includes(publishedLogo.url));assert.match(h.node('binder-grid').innerHTML,/My renamed binder/);assert.ok(h.node('binder-cover-preview').innerHTML.includes(publishedLogo.url));assert.equal(reads,3);assert.equal(h.node('progress-percent').textContent,'0%');
});

const LINK_SET='04fe9fe1-7206-4215-b9ab-ccea25916593';
const linkSet={setId:LINK_SET,game:'pokemon',languageCode:'ja',nativeName:'Test native set',englishDisplayName:'Test linked set',setCode:'SM6',total:0};
const matchingBinder={id:'linked-binder',name:'My existing linked binder',type:'set',setId:LINK_SET,language:'ja',archived:false,setTotal:0};
function linkedResponse(url,binders=[]){
 if(url.includes('/catalogue/sets/'))return response({data:{set:linkSet}});
 if(url.includes('/checklist'))return response({cards:[],progress:{owned:0,total:0},meta:{pagination:{nextCursor:null}}});
 if(url.startsWith('/api/binders?'))return response({binders,hasMore:false});
 return response({binder:matchingBinder,items:[],summary:{uniqueCards:0,totalVariants:0,totalQuantity:0},hasMore:false,progress:{owned:0,total:0}});
}
test('a direct set link opens an existing binder even when the initial library did not contain it',async()=>{
 const calls=[],h=harness((url,options)=>{calls.push({url,method:options.method});return Promise.resolve(linkedResponse(url,[matchingBinder]));});
 await h.api.openSetCollection(linkSet);assert.match(h.node('binder-title').textContent,/existing linked binder/);assert.equal(h.node('create-dialog').open,false);assert.ok(calls.some(x=>x.url.includes('setId='+LINK_SET)&&x.url.includes('language=ja')));assert.ok(calls.some(x=>x.url.includes('/linked-binder/checklist')));assert.ok(calls.every(x=>x.method===undefined));
});
test('a new set opens a prefilled creation dialog only after checking for existing binders, without creating ownership',async()=>{
 const calls=[],h=harness((url,options)=>{calls.push({url,method:options.method});return Promise.resolve(linkedResponse(url));});
 await h.api.openSetCollection(linkSet);assert.equal(h.node('create-dialog').open,true);assert.equal(h.node('create-form').elements.name.value,'Test linked set');assert.equal(h.node('create-form').elements.language.value,'ja');assert.equal(calls.length,2);assert.ok(calls.every(x=>x.method===undefined));
});
test('multiple matching binders require a choice and none is opened or created silently',async()=>{
 const h=harness(url=>Promise.resolve(linkedResponse(url,[matchingBinder,{...matchingBinder,id:'second-binder',name:'My second binder'}])));
 await h.api.openSetCollection(linkSet);assert.equal(h.node('create-dialog').open,false);assert.match(h.node('linked-binder-grid').innerHTML,/My second binder/);assert.match(h.node('linked-binder-grid').innerHTML,/My existing linked binder/);assert.equal(h.node('start-linked-binder').textContent,'Start another binder');assert.equal(h.node('binder-title').textContent,'');
});
test('failed or mismatched set links cannot offer unchecked duplicate creation',async()=>{
 const h=harness(url=>Promise.resolve(url.includes('/catalogue/')?linkedResponse(url):response({error:'Storage unavailable'},503)));
 await assert.rejects(h.api.openSetCollection(linkSet),/Storage unavailable/);assert.equal(h.node('start-linked-binder').hidden,true);assert.equal(h.node('retry-linked-set').hidden,false);assert.equal(h.node('create-dialog').open,false);
 const wrong=harness(url=>Promise.resolve(response(url.includes('/catalogue/')?{data:{set:{...linkSet,languageCode:'en'}}}:{binders:[],hasMore:false})));await assert.rejects(wrong.api.openSetCollection(linkSet),/exact set and language/);assert.equal(wrong.node('create-dialog').open,false);
});
test('late set-link reads do not open a dialog after the collector navigates away',async()=>{
 const pending=deferred(),h=harness(()=>pending.promise);const request=h.api.openSetCollection(linkSet);h.api.showView('library');pending.resolve(response({data:{set:linkSet}}));await request;assert.equal(h.node('create-dialog').open,false);assert.equal(h.node('start-linked-binder').hidden,true);
});
test('set selectors reject ambiguous parameters and sign-in leaves an embedded frame with the exact local destination',()=>{
 const search='?set='+LINK_SET+'&language=ja',hash='#linked',h=harness(()=>assert.fail('No network'),[],{location:{search,hash}});
 assert.equal(h.api.setTargetFromQuery(search).setId,LINK_SET);
 for(const q of ['?set=invalid&language=ja',search+'&language=en','?set='+LINK_SET+'&language=xx','?set='+LINK_SET])assert.throws(()=>h.api.setTargetFromQuery(q));
 assert.equal(h.node('account-link').target,undefined,'Ordinary Account navigation is not forced out of the page');
 h.api.lock();assert.equal(new URL('https://site.test'+h.node('collection-sign-in').href).searchParams.get('return_to'),'/collection'+search+hash);
 assert.equal(h.node('account-link').href,h.node('collection-sign-in').href,'The header and main sign-in action keep the same return route');
 assert.equal(h.node('account-link').target,'_top','Hosted sign-in must navigate the top-level page');
});
test('the binder shop link uses the same canonical set and exact language',()=>{
 const h=harness(()=>assert.fail('No network'),[],{links:{'jp-test':{setId:LINK_SET,language:'ja'}}});assert.equal(h.api.shopHrefForBinder(matchingBinder),'/shop?set=jp-test');assert.equal(h.api.shopHrefForBinder({...matchingBinder,language:'en'}),'');assert.equal(h.api.shopHrefForBinder({...matchingBinder,type:'custom'}),'');
});

const TRIAL_SET='258cb8e5-c769-540d-9e3c-40d4ed4dafdb';
const trialCard=n=>({cardId:'trial-card-'+n,game:'pokemon',catalogueVersionId:'verified-trial-version',set:{setId:TRIAL_SET},languageCode:'en',collectorNumber:{value:String(n).padStart(3,'0'),sortKey:String(n).padStart(12,'0')},names:{native:'Trial card '+n,englishDisplay:'Trial card '+n},defaultVariantId:'variant-'+n,variants:[{variantId:'variant-'+n,canonicalId:'pokemon:en:'+TRIAL_SET+':'+n+':normal',variantCode:'normal',finishCode:'normal',image:{permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com/test-card.png'}}]});
function trialFlow(options={}){
 const calls=[],writes=[],quantities=new Map(options.quantities||[]),actions=new Map();let revision=1,failPage=options.failPage,postAttempt=0,readAfterPost=false,failedRefresh=false;
 const binder=()=>({id:'trial-binder',name:'30th Celebration',type:'set',setId:TRIAL_SET,language:'en',archived:!!options.archived,revision});
 const catalogue=publicReady(TRIAL_SET,161);
 const h=harness(async(url,init)=>{
  calls.push({url,method:init.method});
  if(url.includes('/catalogue/ready/')){
   const offset=Number(new URL(url,'https://site.test').searchParams.get('cursor')||0);
   if(failPage===offset){failPage=null;return response({error:'Temporary catalogue outage'},503);}
   const data=publicPage(catalogue,url);if(options.mixedVersion&&offset===100)data.cards[0]={...data.cards[0],catalogueVersionId:'different-version'};return response(data);
  }
  if(url.includes('/checklist'))return response(ownershipPage(catalogue,binder(),[...quantities].filter(([,quantity])=>quantity>0).map(([cardId,quantity])=>({cardId,variantId:'variant-'+cardId.split('-').at(-1),quantity})),url));
  if(url.includes('/ownership')&&init.method==='POST'){
   const payload=JSON.parse(init.body);writes.push(payload);postAttempt++;
   if(options.unconfirmedCard&&payload.owned)return response({error:'This card could not be confirmed. Try again in a moment.'},503);
   if(!actions.has(payload.id)){actions.set(payload.id,payload);quantities.set(payload.cardId,payload.owned?1:0);revision++;}readAfterPost=true;
   if(options.uncertain&&postAttempt===1)throw new TypeError('Lost response');
   if(options.externalQuantity&&postAttempt>1)quantities.set(payload.cardId,options.externalQuantity);
   return response({ok:true,replayed:postAttempt>1,binder:binder()});
  }
  if(url.includes('/ownership?')){
   if(options.pendingRead&&!readAfterPost)return options.pendingRead.promise;
   if(options.failConfirmedRefresh&&readAfterPost&&!failedRefresh){failedRefresh=true;throw new TypeError('Read failed');}
   const ids=new URL(url,'https://site.test').searchParams.get('cardIds').split(','),rows=ids.map(cardId=>({cardId,variantId:'variant-'+cardId.split('-').at(-1),quantity:options.alreadyOwned||quantities.get(cardId)||0})).filter(row=>row.quantity>0);return response(cardOwnershipPage(binder(),rows,url));
  }
  return response({binder:binder(),summary:{uniqueCards:[...quantities.values()].filter(Boolean).length,totalVariants:[...quantities.values()].filter(Boolean).length,totalQuantity:[...quantities.values()].reduce((a,b)=>a+b,0)},items:[],hasMore:false,nextOffset:0,progress:{owned:[...quantities.values()].filter(Boolean).length,total:161,checkedAt:'2026-11-05'}});
 });return{...h,calls,writes,quantities};
}
test('30th Celebration automatically loads all 161 printings across four bounded pages without recording ownership',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');assert.equal(h.api.cardState().length,161);assert.equal(h.calls.filter(x=>x.url.includes('/catalogue/ready/')).length,4);assert.equal(h.calls.filter(x=>x.url.includes('/checklist')).length,1);assert.ok(h.calls.filter(x=>x.url.includes('/catalogue/ready/')||x.url.includes('/checklist')).every(x=>x.url.includes('paged=1')));assert.equal(h.writes.length,0);assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 161/);assert.match(h.node('binder-cards').innerHTML,/Trial card 161/);assert.match(h.node('binder-cards').innerHTML,/data-inspect-card/);assert.match(h.node('collection-status').textContent,/All 161 cards loaded/);
});
test('an interrupted public preload publishes no partial checklist and its retry action restarts bounded loading',async()=>{
 const h=trialFlow({failPage:100});await h.api.openBinder('trial-binder');assert.equal(h.api.cardState().length,0);assert.equal(h.node('more-cards').hidden,false);assert.equal(h.node('more-cards').textContent,'Retry loading cards');assert.equal(h.api.readyState().length,0);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);await h.node('more-cards').events.click({target:h.node('more-cards')});assert.equal(h.api.cardState().length,161);assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 161/);
});
test('a mixed catalogue version cannot become a completed trial checklist',async()=>{
 const h=trialFlow({mixedVersion:true});await h.api.openBinder('trial-binder');assert.equal(h.api.cardState().length,0);assert.equal(h.api.readyState().length,0);assert.match(h.node('collection-status').textContent,/public checklist could not be confirmed/);assert.doesNotMatch(h.node('cards-context').textContent,/Complete/);
});
test('one-tap ownership saves one exact variant only once even if tapped twice quickly',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');const key='trial-card-1:catalogue';await Promise.all([h.api.togglePulled(key),h.api.togglePulled(key)]);assert.equal(h.writes.length,1);assert.equal(h.writes[0].owned,true);assert.equal(h.writes[0].variantId,undefined);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,1);assert.equal(h.api.cardState().length,161);
});
test('tapping a checklist card selects one owned copy and keeps it unselected until confirmed',async()=>{
 const pending=deferred(),h=trialFlow({pendingRead:pending});await h.api.openBinder('trial-binder');
 assert.match(h.node('binder-cards').innerHTML,/aria-pressed="false" aria-label="Not pulled: Trial card 1. Tap to mark pulled."/);
 const selection=h.api.tapCard('trial-card-1:catalogue');await tick();assert.equal(h.writes.length,0);assert.equal(h.api.cardState()[0].ownedVariants.length,0);
 assert.equal(h.cardNode('trial-card-1:catalogue').attributes['aria-pressed'],'false');
 pending.resolve(response(cardOwnershipPage({id:'trial-binder',type:'set',setId:TRIAL_SET,language:'en',revision:1},[],'https://site.test/?cardIds=trial-card-1')));await selection;
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].owned,true);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,1);
 assert.equal(h.cardNode('trial-card-1:catalogue').attributes['aria-pressed'],'true');
});
test('tapping an owned checklist card removes it without opening the quantity editor',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');await h.api.tapCard('trial-card-1:catalogue');
 await h.api.tapCard('trial-card-1:catalogue');
 assert.equal(h.writes.length,2);assert.deepEqual(h.writes.map(write=>write.owned),[true,false]);assert.equal(h.quantities.get('trial-card-1'),0);assert.equal(h.api.cardState()[0].ownedVariants.length,0);assert.equal(h.cardNode('trial-card-1:catalogue').attributes['aria-pressed'],'false');
});
test('queued owned taps read fresh revisions and cannot race against each other',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');await Promise.all([h.api.togglePulled('trial-card-1:catalogue'),h.api.togglePulled('trial-card-2:catalogue')]);assert.equal(h.writes.length,2);assert.deepEqual(h.writes.map(p=>p.expectedRevision),[1,2]);assert.notEqual(h.writes[0].id,h.writes[1].id);assert.equal(h.api.cardState().filter(x=>x.ownedVariants.length).length,2);
});
test('the owned shortcut preserves an existing higher quantity discovered after a stale checklist',async()=>{
 const h=trialFlow({alreadyOwned:3});await h.api.openBinder('trial-binder');await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.writes.length,0);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,3);
});
test('an uncertain owned write retries identical intent and reads the latest quantity after replay',async()=>{
 const h=trialFlow({uncertain:true,externalQuantity:3});await h.api.openBinder('trial-binder');await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.api.cardState()[0].ownedVariants.length,0);assert.match(h.api.quickState()[0].error,/not confirmed/);await h.api.togglePulled('trial-card-1:catalogue');assert.deepEqual(h.writes[0],h.writes[1]);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,3);
});
test('a confirmed owned write with a failed refresh retries the read without writing twice',async()=>{
 const h=trialFlow({failConfirmedRefresh:true});await h.api.openBinder('trial-binder');await h.api.togglePulled('trial-card-1:catalogue');assert.match(h.api.quickState()[0].error,/Saved/);await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.writes.length,1);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,1);
});
test('leaving the binder while its saved-quantity read is pending cancels an undispatched owned change',async()=>{
 const pending=deferred(),h=trialFlow({pendingRead:pending});await h.api.openBinder('trial-binder');const request=h.api.togglePulled('trial-card-1:catalogue');await tick();h.api.showView('library');pending.resolve(response(cardOwnershipPage({id:'trial-binder',type:'set',setId:TRIAL_SET,language:'en',revision:1},[],'https://site.test/?cardIds=trial-card-1')));await request;assert.equal(h.writes.length,0);
});
test('archived and signed-out trial collections cannot use the owned shortcut',async()=>{
 const h=trialFlow({archived:true});await h.api.openBinder('trial-binder');await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.writes.length,0);h.api.lock();await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.writes.length,0);assert.equal(h.api.quickState().length,0);
});
test('an unconfirmed card remains not pulled and never asks for a quantity or finish choice',async()=>{
 const h=trialFlow({unconfirmedCard:true});await h.api.openBinder('trial-binder');await h.api.tapCard('trial-card-1:catalogue');
 assert.equal(h.api.cardState()[0].ownedVariants.length,0);assert.equal(h.cardNode('trial-card-1:catalogue').attributes['aria-pressed'],'false');assert.match(h.node('collection-status').textContent,/This card could not be confirmed/);assert.doesNotMatch(h.node('collection-status').textContent+h.cardNode('trial-card-1:catalogue').article.parts['.own-status'].textContent,/quantity|finish|style|choose/i);
});

function customOwnershipFlow(options={}){
 const calls=[],writes=[],actions=new Map(),saved=new Map(),control={};let revision=1;
 const binder=()=>({id:'custom-binder',name:'My binder',type:options.type||'custom',setId:options.type==='set'?'other-set':null,language:'en',revision,archived:false});
 const card=n=>({...trialCard(n),cardId:'custom-card-'+n,set:{setId:'other-set'},names:{native:'Custom card '+n,englishDisplay:'Custom card '+n}});
 const item=(n,variant='variant-'+n,quantity=1)=>({cardId:'custom-card-'+n,variantId:variant,canonicalId:'canonical:'+n+':'+variant,variantCode:variant,finishCode:variant,setId:'other-set',language:'en',nativeName:'Custom card '+n,englishName:'Custom card '+n,collectorNumber:String(n),imageUrl:'https://assets.stackrtcg.com/card.png',quantity});
 const put=row=>saved.set(row.cardId+':'+row.variantId,{...row});for(const row of options.items||[])put(item(...row));
 const rows=()=>[...saved.values()].filter(row=>row.quantity>0),ownershipRows=()=>rows().map(({cardId,variantId,quantity})=>({cardId,variantId,quantity}));
 const h=harness(async(url,init)=>{
  calls.push({url,method:init.method});const params=new URL(url,'https://site.test').searchParams;
  if(url.includes('/ownership')&&init.method==='POST'){
   const intent=JSON.parse(init.body);writes.push(intent);
   if(!actions.has(intent.id)){if(intent.expectedRevision!==revision)return response({error:'The binder changed'},409);actions.set(intent.id,intent);const n=Number(intent.cardId.split('-').at(-1));if(intent.owned)put(item(n));else for(const row of saved.values())if(row.cardId===intent.cardId)row.quantity=0;revision++;}
   if(control.uncertain){control.uncertain=false;throw new TypeError('Lost response');}return response({ok:true,binder:binder()});
  }
  if(url.includes('/ownership?')){
   if(control.pending&&(!control.pendingOffset||Number(params.get('cursor')||0)===control.pendingOffset))return control.pending.promise;
   if(control.changeRevision){control.changeRevision=false;revision++;}
   if(params.has('expectedRevision')&&Number(params.get('expectedRevision'))!==revision)return response({error:'The binder changed'},409);
   return response(cardOwnershipPage(binder(),ownershipRows(),url));
  }
  if(url.includes('/checklist'))return response({cards:[1,2].map(n=>{const c=card(n),variants=ownershipRows().filter(row=>row.cardId===c.cardId).map(({variantId,quantity})=>({variantId,quantity}));return {card:c,ownedVariants:variants,ownedQuantity:variants.reduce((sum,row)=>sum+row.quantity,0)};}),meta:{pagination:{nextCursor:null}},progress:{owned:new Set(rows().map(row=>row.cardId)).size,total:2}});
  if(url.includes('/catalogue/search')){const pages=options.searchPages||[[card(1),card(2)]],index=params.has('cursor')?1:0;return response({data:{results:pages[index].map(c=>({type:'card',card:c}))},meta:{pagination:{nextCursor:index+1<pages.length?'search-page-2':null}}});}
  if(url.includes('/catalogue/cards/')){const n=Number(url.split('/').at(-1).split('-').at(-1)),c=card(n);return response({data:{card:c}});}
  if(url.includes('/items?')){const row=saved.get(params.get('cardId')+':'+params.get('variantId'));return response({binder:binder(),quantity:row?.quantity||0});}
  const all=rows(),offset=Number(params.get('offset')||0);return response({binder:binder(),items:all.slice(offset,offset+50),hasMore:offset+50<all.length,nextOffset:offset+50,summary:{uniqueCards:new Set(all.map(row=>row.cardId)).size,totalVariants:all.length,totalQuantity:all.reduce((sum,row)=>sum+row.quantity,0)}});
 });return {...h,calls,writes,control,binder,rows,ownershipRows,card};
}
test('other set binders share the exact add/remove image behavior without a quantity dialog',async()=>{
 const h=customOwnershipFlow({type:'set'});await h.api.openBinder('custom-binder');await h.api.tapCard('custom-card-1:catalogue');await h.api.tapCard('custom-card-1:catalogue');assert.deepEqual(h.writes.map(write=>write.owned),[true,false]);assert.equal(h.api.cardState()[0].ownedVariants.length,0);
});
test('custom search displays a single Pulled state for legacy rows and clears it with one image tap',async()=>{
 const h=customOwnershipFlow({items:[[1,'normal',2],[1,'holo',3]]});await h.api.openBinder('custom-binder');h.api.setMode('search');await h.api.loadCards(true);
 const key='custom-card-1:catalogue';assert.equal(h.cardNode(key).attributes['aria-pressed'],'true');assert.equal(h.cardNode(key).attributes['aria-label'],'Pulled: Custom card 1. Tap to clear.');assert.equal(h.cardNode(key).querySelector('.owned-badge').textContent,'Pulled');assert.doesNotMatch(h.node('binder-cards').innerHTML,/5 copies|2 finishes|quantity|finish|data-edit-card|own-toggle/i);
 await h.api.tapCard(key);assert.equal(h.writes[0].owned,false);assert.equal(h.rows().length,0);assert.equal(h.cardNode(key).attributes['aria-pressed'],'false');await h.api.tapCard(key);assert.equal(h.writes[1].owned,true);assert.equal(h.rows()[0].quantity,1);
});
test('custom Pulled groups legacy rows into one card and keeps the next page offset aligned after clearing it',async()=>{
 const items=[[1,'normal',2],[1,'holo',3],...Array.from({length:53},(_,i)=>[i+2])],h=customOwnershipFlow({items});await h.api.openBinder('custom-binder');assert.equal(h.api.cardState().length,49);assert.equal(h.visibleCards().filter(key=>key==='custom-card-1:catalogue').length,1);assert.equal(h.cardNode('custom-card-1:catalogue').querySelector('.owned-badge').textContent,'Pulled');
 await h.api.tapCard('custom-card-1:catalogue');assert.equal(h.api.cardState().filter(entry=>entry.card.cardId==='custom-card-1').length,0);assert.equal(h.api.cardState().length,48);await h.api.loadCards(false);
 assert.equal(h.calls.some(call=>call.url.endsWith('/custom-binder?offset=48')),true);assert.equal(h.api.cardState().length,53);assert.equal(new Set(h.api.cardState().map(entry=>entry.card.cardId)).size,53);assert.equal(h.node('more-cards').hidden,true);
 const remaining=customOwnershipFlow({items:[...Array.from({length:60},(_,i)=>[1,'legacy-'+i,1]),[2],[3]]});await remaining.api.openBinder('custom-binder');assert.equal(remaining.visibleCards().length,1);await remaining.api.tapCard('custom-card-1:catalogue');assert.equal(remaining.visibleCards().length,0);assert.match(remaining.node('binder-cards').innerHTML,/No pulled cards on this page/);assert.equal(remaining.node('more-cards').hidden,false);await remaining.api.loadCards(false);assert.deepEqual(remaining.visibleCards(),['custom-card-2:catalogue','custom-card-3:catalogue']);assert.doesNotMatch(remaining.node('binder-cards').innerHTML,/No pulled cards on this page/);assert.equal(remaining.node('more-cards').hidden,true);assert.ok(remaining.calls.some(call=>call.url.endsWith('/custom-binder?offset=0')));
});
test('custom search merges the same printing across result pages and retains every catalogue finish',async()=>{
 const first={...trialCard(1),cardId:'custom-card-1',set:{setId:'other-set'}},second={...first,defaultVariantId:'holo',variants:[{...first.variants[0],variantId:'holo',canonicalId:'canonical-holo',variantCode:'holo',finishCode:'holo'}]},h=customOwnershipFlow({searchPages:[[first],[second]]});await h.api.openBinder('custom-binder');h.api.setMode('search');await h.api.loadCards(true);await h.api.loadCards(false);
 assert.equal(h.visibleCards().length,1);assert.equal(h.api.cardState().length,1);assert.deepEqual(Array.from(h.api.cardState()[0].card.variants,v=>v.variantId),['variant-1','holo']);
});
test('uncertain whole-card removal keeps the original action and target after changing tabs',async()=>{
 const h=customOwnershipFlow({items:[[1,'normal',2],[1,'holo',3]]});await h.api.openBinder('custom-binder');h.control.uncertain=true;await h.api.tapCard('custom-card-1:catalogue');assert.equal(h.api.cardState().length,1,'Unconfirmed clearing keeps the original pulled state');assert.equal(h.cardNode('custom-card-1:catalogue').attributes['aria-pressed'],'true');assert.match(h.api.quickState()[0].error,/not confirmed/);
 h.api.setMode('search');await h.api.loadCards(true);await h.api.tapCard('custom-card-1:catalogue');assert.deepEqual(h.writes[1],h.writes[0]);assert.equal(h.writes[1].owned,false);assert.equal(h.rows().length,0);assert.equal(h.api.quickState().length,0);await h.api.tapCard('custom-card-1:catalogue');assert.equal(h.writes[2].owned,true);assert.equal(h.rows()[0].quantity,1);
});
test('private ownership hydration stages all bounded pages before rendering custom owned cards',async()=>{
 const h=customOwnershipFlow({items:Array.from({length:121},(_,i)=>[1,'finish-'+i,1])});h.control.pending=deferred();h.control.pendingOffset=50;
 const task=h.api.openBinder('custom-binder');await tick();assert.equal(h.api.cardState().length,0);assert.equal(h.visibleCards().length,0);
 const pending=h.control.pending;h.control.pending=null;pending.resolve(response(cardOwnershipPage(h.binder(),h.ownershipRows(),'https://site.test/?cardIds=custom-card-1&cursor=50')));await task;
 assert.equal(h.api.cardState().length,1);assert.equal(h.api.cardState()[0].ownedVariants.length,121);assert.equal(h.cardNode('custom-card-1:catalogue').querySelector('.owned-badge').textContent,'Pulled');assert.doesNotMatch(h.node('binder-cards').innerHTML,/121|finish-|quantity|copies|data-edit-card/);const pages=h.calls.filter(call=>call.url.includes('/ownership?'));assert.equal(pages.length,3);assert.ok(pages.every(call=>call.url.includes('limit=50')&&call.url.includes('expectedRevision=1')));
 await h.api.loadCards(false);await h.api.loadCards(false);assert.equal(h.api.cardState().length,1);assert.equal(h.visibleCards().length,1);assert.equal(h.node('more-cards').hidden,true);assert.equal(h.writes.length,0,'Grouping old rows never rewrites saved selections');
 await h.api.tapCard('custom-card-1:catalogue');assert.equal(h.visibleCards().length,0);assert.match(h.node('binder-cards').innerHTML,/No pulled cards yet/);assert.equal(h.node('more-cards').hidden,true);assert.match(h.node('binder-summary').innerHTML,/<strong>0<\/strong><span>Pulled/);
});
test('a changed detail revision or invalid ownership continuation renders no mixed custom owned state',async()=>{
 const h=customOwnershipFlow({items:[[1]]});h.control.changeRevision=true;await assert.rejects(h.api.openBinder('custom-binder'),/binder changed/);assert.equal(h.api.cardState().length,0);assert.equal(h.visibleCards().length,0);
 const paged=customOwnershipFlow({items:Array.from({length:60},(_,i)=>[1,'finish-'+i,1])});paged.control.pending=deferred();paged.control.pendingOffset=50;const task=paged.api.openBinder('custom-binder');await tick();const second=cardOwnershipPage({...paged.binder(),revision:2},paged.ownershipRows(),'https://site.test/?cardIds=custom-card-1&cursor=50');paged.control.pending.resolve(response(second));await assert.rejects(task,/pulled cards could not be confirmed/);assert.equal(paged.api.cardState().length,0);assert.equal(paged.visibleCards().length,0);
});
test('leaving during custom ownership hydration cancels silently without altering the next view',async()=>{
 const h=customOwnershipFlow({items:[[1]]});h.control.pending=deferred();const task=h.api.openBinder('custom-binder');await tick();h.api.showView('library');h.node('collection-status').textContent='Your saved binders';h.control.pending.resolve(response(cardOwnershipPage(h.binder(),h.ownershipRows(),'https://site.test/?cardIds=custom-card-1')));await task;assert.equal(h.node('collection-status').textContent,'Your saved binders');assert.equal(h.node('collection-main').dataset.view,'library');assert.equal(h.writes.length,0);
});

const PITCH_SET='d6d58c17-5923-496e-94ef-5819f34ae10c';
function pitchFlow(setId=PITCH_SET,total=120){
 const binder={id:'pitch-binder',name:'Pitch Black',type:'set',setId,language:'en',revision:1,archived:false},calls=[],writes=[],saved=new Map();
 const card=n=>{const c=trialCard(n);return {...c,cardId:'pitch-card-'+n,set:{setId},catalogueVersionId:'pitch-version',variants:c.variants.map(v=>({...v,canonicalId:'pokemon:en:'+setId+':'+n+':normal'}))};};
 const extra=(c,id,finish)=>({...c,defaultVariantId:id,variants:[{...c.variants[0],variantId:id,canonicalId:'pokemon:en:'+setId+':'+c.collectorNumber.value+':'+finish,variantCode:finish,finishCode:finish}]});
 const first=card(1),detail={...first,variants:[first.variants[0],extra(first,'current-holo','holo').variants[0],extra(first,'current-reverse','reverse_holo').variants[0]]};
 const cards=Array.from({length:total},(_,index)=>card(index+1));cards[0].variants.push(extra(first,'provider-holo-alias','holo').variants[0]);cards[1].variants.push(extra(card(2),'second-reverse','reverse_holo').variants[0]);const catalogue=readyCatalogue(cards,setId);
 const h=harness((url,init)=>{
  calls.push({url,method:init.method});
  if(url.includes('/ownership')&&init.method==='POST'){const intent=JSON.parse(init.body);writes.push(intent);saved.set(intent.cardId,intent.owned?1:0);binder.revision++;return Promise.resolve(response({ok:true,binder}));}
  if(url.includes('/ownership?'))return Promise.resolve(response(cardOwnershipPage(binder,[...saved].filter(([,quantity])=>quantity>0).map(([cardId,quantity])=>({cardId,variantId:detail.defaultVariantId,quantity})),url)));
  if(url.includes('/catalogue/cards/'))return Promise.resolve(response({data:{card:detail}}));
  if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(catalogue,url)));
  if(url.includes('/checklist'))return Promise.resolve(response(ownershipPage(catalogue,binder,[],url)));
  if(url.includes('/items'))return Promise.resolve(response({binder,quantity:0}));
  const count=[...saved.values()].filter(Boolean).length;return Promise.resolve(response({binder,items:[],summary:{uniqueCards:count,totalQuantity:count,totalVariants:count},hasMore:false,progress:{owned:count,total}}));
 });
 return {...h,calls,binder,writes};
}
test('Pitch Black shows only pulled/not pulled despite multiple catalogue styles',async()=>{
 const h=pitchFlow();await h.api.openBinder(h.binder.id);assert.equal(h.api.cardState().length,120);assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 120 cards/);assert.equal(h.node('more-cards').hidden,true);assert.equal((h.node('binder-cards').innerHTML.match(/data-card-key=/g)||[]).length,120);assert.equal(h.api.cardState()[0].card.variants.length,2);
 await h.api.tapCard('pitch-card-1:catalogue');assert.equal(h.writes[0].owned,true);assert.equal(h.api.cardState()[0].ownedVariants[0].variantId,'variant-1');
 assert.equal(h.cardNode('pitch-card-1:catalogue').querySelector('.owned-badge').textContent,'Pulled');assert.doesNotMatch(h.node('binder-cards').innerHTML,/quantity|finish|holo|reverse|data-edit-card|own-toggle/i);assert.equal(h.node('owned-tab').textContent,'Pulled 1');assert.equal(h.node('missing-tab').textContent,'Not pulled 119');assert.match(h.node('binder-summary').innerHTML,/<strong>1<\/strong><span>Pulled/);assert.ok(h.calls.every(call=>!call.url.includes('/items')&&!call.url.includes('/catalogue/cards/')));
});

for(const [label,setId] of [['Chaos Rising','816ff627-a585-4953-99c4-a15c9b0b80e5'],['Journey Together','4f3046f3-9ab7-4068-a7df-dbe2b08c263c'],['Phantasmal Flames','977bf107-e10c-4d93-a7a4-3d7b775c5003'],['Delta Reign','a1bde625-6996-5451-bcda-fb80fe5b428b']])test(label+' uses the same direct owned/unowned image toggle',async()=>{
 const h=pitchFlow(setId,122);assert.equal(h.api.isTrialBinder(h.binder),true);await h.api.openBinder(h.binder.id);assert.equal(h.api.cardState().length,122);assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 122 cards/);assert.equal(h.node('more-cards').hidden,true);
 await h.api.tapCard('pitch-card-1:catalogue');await h.api.tapCard('pitch-card-1:catalogue');assert.deepEqual(h.writes.map(write=>write.owned),[true,false]);assert.equal(h.api.cardState()[0].ownedVariants.length,0);
});

test('Delta Reign list bookmarks show the sourced read-only list without creating a binder or requesting a guessed set',async()=>{
 const calls=[],h=harness((url,options)=>{calls.push({url,method:options.method});return Promise.resolve(response({binders:[],hasMore:false}));},[],{location:{hash:'#delta-list'}});await h.api.start();assert.equal(h.location.hash,'#delta-list');assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);assert.ok(!calls[0].url.includes('/catalogue/'));assert.equal(h.node('collection-status').textContent,'','The gallery explains its preview status once in its own heading area');assert.equal(h.scrolls.at(-1).top,0,'Opening the gallery starts at its title, not an old cover-grid scroll position');
});

test('Ascended Heroes loads its full 295-card checklist and uses the same direct ownership toggle',async()=>{
 const h=pitchFlow('ddc668c0-316e-4dab-8c51-625167508fd6',295);assert.equal(h.api.isTrialBinder(h.binder),true);await h.api.openBinder(h.binder.id);assert.equal(h.api.cardState().length,295);assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 295 cards/);assert.equal(h.node('more-cards').hidden,true);await h.api.tapCard('pitch-card-1:catalogue');assert.equal(h.writes[0].owned,true);await h.api.tapCard('pitch-card-1:catalogue');assert.equal(h.writes[1].owned,false);
});

test('opening a binder removes discovery chrome and restoring sets or sign-in restores the right context',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');assert.equal(h.node('collection-main').dataset.view,'binder');assert.equal(h.node('collection-intro').hidden,true);assert.equal(h.node('discover-sets').hidden,true);assert.equal(h.node('binder-language').textContent,'English');assert.equal(h.node('binder-description').textContent,'');assert.equal(h.node('binder-description').hidden,true);
 h.api.showView('sets');assert.equal(h.node('collection-intro').hidden,false);assert.equal(h.node('collection-main').dataset.view,'sets');h.api.showView('binder');h.api.lock();assert.equal(h.node('collection-main').dataset.view,'sign-in');assert.equal(h.node('collection-intro').hidden,false);assert.equal(h.node('collection-app').hidden,true);
});

test('a direct binder destination stays hidden until its heading is ready, without flashing discovery',async()=>{
 const pending=deferred(),binder={id:'11111111-1111-4111-8111-111111111111',name:'My saved binder',language:'en',type:'custom',archived:false};
 const h=harness(url=>url.startsWith('/api/binders?')?Promise.resolve(response({binders:[binder],hasMore:false})):pending.promise,[],{location:{hash:'#binder/'+binder.id}});
 h.node('collection-app').hidden=true;h.node('collection-intro').hidden=true;const task=h.api.start();await tick();
 assert.equal(h.node('collection-app').hidden,true);assert.equal(h.node('collection-intro').hidden,true);
 pending.resolve(response({binder,summary:{uniqueCards:0,totalQuantity:0,totalVariants:0},items:[],hasMore:false}));await task;
 assert.equal(h.node('collection-app').hidden,false);assert.equal(h.node('collection-main').dataset.view,'binder');assert.equal(h.node('binder-title').textContent,binder.name);assert.equal(h.node('collection-intro').hidden,true);
});

function delayedChecklist(options={}){
 const pending=deferred(),binder={id:'ordered-binder',name:'30th Celebration',setName:'30th Celebration',type:'set',setId:TRIAL_SET,language:'en',revision:1,archived:false};
 const catalogue=readyCatalogue([trialCard(3),trialCard(1),trialCard(2)],TRIAL_SET);
 const h=harness(url=>url.includes('/catalogue/ready/')?pending.promise:url.includes('/checklist')?Promise.resolve(response(ownershipPage(catalogue,binder,[],url))):Promise.resolve(response({binder,summary:{uniqueCards:0,totalQuantity:0,totalVariants:0},items:[],hasMore:false,progress:{owned:0,total:3}})),[],options);
 return {...h,pending,finish:()=>pending.resolve(response(publicPage(catalogue)))};
}
test('the complete checklist appears once in printed order instead of shuffling partially loaded card pages',async()=>{
 const h=delayedChecklist(),task=h.api.openBinder('ordered-binder');await tick();
 assert.match(h.node('binder-cards').innerHTML,/card-loading-art/);assert.doesNotMatch(h.node('binder-cards').innerHTML,/class="card-loading"|<i>|<span><\/span>/);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card|data-own-card/);assert.match(h.node('cards-context').textContent,/Loading this set/);assert.equal(h.node('binder-cards').attributes['aria-busy'],'true');
 h.finish();await task;const html=h.node('binder-cards').innerHTML;
 assert.ok(html.indexOf('Trial card 1')<html.indexOf('Trial card 2'));assert.ok(html.indexOf('Trial card 2')<html.indexOf('Trial card 3'));assert.equal(h.node('binder-cards').htmlWrites,2);assert.equal(h.node('binder-cards').attributes['aria-busy'],'false');assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 3/);
});
test('finishing an old checklist after navigation cannot reveal it over the binder library',async()=>{
 const h=delayedChecklist(),task=h.api.openBinder('ordered-binder');await tick();h.api.showView('library');const before=h.node('binder-cards').innerHTML;
 h.finish();await task;assert.equal(h.node('collection-main').dataset.view,'library');assert.equal(h.node('binder-cards').innerHTML,before);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);
});
test('header logos use exact set and language and unchanged identities keep cover and logo nodes intact',async()=>{
 let binder={id:'identity',name:'My name',setName:'Exact set',type:'set',setId:publishedLogo.setId,language:'ja',revision:1};
 const h=harness(url=>Promise.resolve(response(url.includes('/checklist')?{cards:[],progress:{owned:0,total:0},meta:{pagination:{nextCursor:null}}}:{binder,summary:{uniqueCards:0,totalQuantity:0,totalVariants:0},items:[],hasMore:false,progress:{owned:0,total:0}})),[publishedLogo]);
 await h.api.openBinder(binder.id);const coverWrites=h.node('binder-cover-preview').htmlWrites,logoWrites=h.node('binder-set-logo').htmlWrites;h.api.renderBinders();const libraryWrites=h.node('binder-grid').htmlWrites;
 assert.equal(h.node('binder-set-logo').hidden,false);assert.ok(h.node('binder-set-logo').innerHTML.includes(publishedLogo.url));
 await h.api.openBinder(binder.id);h.api.renderBinders();assert.equal(h.node('binder-cover-preview').htmlWrites,coverWrites);assert.equal(h.node('binder-set-logo').htmlWrites,logoWrites);assert.equal(h.node('binder-grid').htmlWrites,libraryWrites);
 binder={...binder,language:'en'};await h.api.openBinder(binder.id);assert.equal(h.node('binder-set-logo').hidden,true);assert.equal(h.node('binder-set-logo').innerHTML,'');
});
test('set discovery waits for bounded pages before placing its final date-sorted tiles',async()=>{
 const pending=deferred(),older={setId:'older',languageCode:'en',englishDisplayName:'Older set',releaseDate:'2020-01-01'},newer={...older,setId:'newer',englishDisplayName:'Newer set',releaseDate:'2026-11-01'};
 const h=harness(url=>url.includes('cursor=next')?pending.promise:Promise.resolve(response({data:{sets:[older]},meta:{pagination:{nextCursor:'next'}}})));h.node('set-language').value='en';
 const task=h.api.loadSets();await tick();assert.doesNotMatch(h.node('set-grid').innerHTML,/Older set/);assert.match(h.node('set-result-count').textContent,/1 found/);
 pending.resolve(response({data:{sets:[newer]},meta:{pagination:{nextCursor:null}}}));await task;const html=h.node('set-grid').innerHTML;assert.ok(html.indexOf('Newer set')<html.indexOf('Older set'));assert.equal(h.node('set-grid').htmlWrites,2);
});

test('only four distinct approved grid images are warmed and a failed decode cannot block the binder',async()=>{
 const requested=[],cards=Array.from({length:8},(_,i)=>{const c=trialCard(i+1);c.variants[0].image.deliveryUrl='https://assets.stackrtcg.com/card-'+i+'.png';return c;});
 class Image{set src(url){requested.push(url);queueMicrotask(()=>this.onload?.());}decode(){return Promise.reject(Error('Unavailable image'));}}
 const h=harness(()=>assert.fail('Image warming cannot call collection APIs'),[],{Image});await h.api.warmCardImages(cards);
 assert.equal(requested.length,4);assert.equal(new Set(requested).size,4);assert.deepEqual(requested,cards.slice(0,4).map(c=>c.variants[0].image.deliveryUrl));
});
test('leaving during initial image decoding cannot publish the old checklist into another view',async()=>{
 const decoding=deferred();class Image{set src(url){queueMicrotask(()=>this.onload?.());}decode(){return decoding.promise;}}
 const h=delayedChecklist({Image}),task=h.api.openBinder('ordered-binder');await tick();h.finish();await tick();assert.match(h.node('cards-context').textContent,/Loading card artwork/);
 h.api.showView('library');const before=h.node('binder-cards').innerHTML;decoding.resolve();await task;
 assert.equal(h.node('collection-main').dataset.view,'library');assert.equal(h.node('binder-cards').innerHTML,before);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);
});

const coverBinder={id:'11111111-1111-4111-8111-111111111111',name:'30th Celebration',setName:'30th Celebration',type:'set',setId:TRIAL_SET,language:'en',archived:false,revision:1};
const coverDetail=()=>({binder:coverBinder,summary:{uniqueCards:0,totalQuantity:0,totalVariants:0},items:[],hasMore:false,progress:{owned:0,total:1}});
const coverChecklist=(url)=>ownershipPage(publicReady(TRIAL_SET,1),coverBinder,[],url);
test('the actual cover click uses the same saved binder path as My binders even if upstream set metadata is unavailable',async()=>{
 const calls=[],h=harness((url,options)=>{calls.push({url,method:options.method});if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(publicReady(TRIAL_SET,1),url)));if(url.includes('/catalogue/'))assert.fail('A saved cover must not depend on extra catalogue metadata');return Promise.resolve(response(url.startsWith('/api/binders?')?{binders:[coverBinder],hasMore:false}:url.includes('/checklist')?coverChecklist(url):coverDetail()));},[],{location:{hash:'#sets'}});
 await h.api.start();assert.equal(calls.length,1,'Curated discovery does not enumerate generic sets');assert.equal(h.node('collection-status').textContent,'');
 await h.node('trial30-open').events.click({currentTarget:h.node('trial30-open')});
 assert.equal(h.node('collection-main').dataset.view,'binder');assert.match(h.node('binder-cards').innerHTML,/Trial card 1/);assert.equal(h.api.cardState().length,1);assert.ok(calls.every(c=>c.method===undefined));assert.equal(h.node('create-dialog').open,false);
});
test('a cover click bubbling through the page cannot cancel its pending binder load',async()=>{
 const detail=deferred(),h=harness(url=>url.includes('/catalogue/ready/')?Promise.resolve(response(publicPage(publicReady(TRIAL_SET,1),url))):url.startsWith('/api/binders?')?Promise.resolve(response({binders:[coverBinder],hasMore:false})):url.includes('/checklist')?Promise.resolve(response(coverChecklist(url))):detail.promise,[],{location:{hash:'#sets'}});
 await h.api.start();
 const opening=h.node('trial30-open').events.click({currentTarget:h.node('trial30-open')});
 // Match browser bubbling: the page carries data-view for CSS, but must not
 // register the navigation handler that belongs only on the tab buttons.
 h.node('collection-main').events.click?.({target:h.node('trial30-open')});
 detail.resolve(response(coverDetail()));await opening;
 assert.equal(h.node('collection-main').events.click,undefined);
 assert.equal(h.node('collection-main').dataset.view,'binder');assert.match(h.node('binder-cards').innerHTML,/Trial card 1/);
 assert.equal(typeof h.node('nav-library').events.click,'function');
});
test('a matching saved binder outside the first library page opens before an unnecessary upstream metadata read',async()=>{
 const calls=[],h=harness(url=>{calls.push(url);if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(publicReady(TRIAL_SET,1),url)));if(url.includes('/catalogue/'))assert.fail('Existing saved binders must stay usable during catalogue metadata outages');return Promise.resolve(response(url.startsWith('/api/binders?')?{binders:[coverBinder],hasMore:false}:url.includes('/checklist')?coverChecklist(url):coverDetail()));});
 await h.api.openSetCollection({setId:TRIAL_SET,languageCode:'en'});assert.equal(h.node('collection-main').dataset.view,'binder');assert.match(h.node('binder-cards').innerHTML,/Trial card 1/);assert.match(calls[0],/setId=/);
});
test('Delta gallery number search matches the numerator and does not match every /103 denominator',()=>{
 const rows=[['001','Heracross 001/103'],['103','Zinnia’s Trust 103/103'],['138','Mega Rayquaza ex 138/103']].map(([number,label])=>({hidden:false,dataset:{listNumber:number,deltaSearch:label}}));
 const h=harness(()=>assert.fail('A preview search must not request or change collection records'),[],{deltaCards:rows});
 const search=q=>{h.node('delta-card-query').value=q;h.node('delta-card-query').events.input();return rows.filter(r=>!r.hidden).map(r=>r.dataset.listNumber);};
 for(const q of ['103','103/103']){assert.deepEqual(search(q),['103']);assert.equal(h.node('delta-result-count').textContent,'1 card');}
 assert.deepEqual(search('1'),['001']);assert.deepEqual(search('mega rayquaza'),['138']);assert.equal(search('').length,3);
});
test('Start binder creates only after confirmation and opens the new checklist without a trip through My binders',async()=>{
 const writes=[],h=harness((url,options)=>{
  if(options.method==='POST'){const body=JSON.parse(options.body);writes.push(body);assert.equal(body.setId,TRIAL_SET);assert.equal(body.language,'en');return Promise.resolve(response({ok:true,binder:coverBinder}));}
  if(url.startsWith('/api/binders?'))return Promise.resolve(response({binders:[],hasMore:false}));
  if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(publicReady(TRIAL_SET,1),url)));
  if(url.includes('/catalogue/sets/'))return Promise.resolve(response({data:{set:{setId:TRIAL_SET,languageCode:'en',game:'pokemon',englishDisplayName:'30th Celebration',total:1}}}));
  return Promise.resolve(response(url.includes('/checklist')?coverChecklist(url):coverDetail()));
 },[],{location:{hash:'#sets'}});
 await h.api.start();await h.node('trial30-open').events.click({currentTarget:h.node('trial30-open')});assert.equal(h.node('create-dialog').open,true);assert.equal(writes.length,0);
 h.node('create-form').events.submit({preventDefault(){},target:h.node('create-form')});await tick();
 assert.equal(writes.length,1);assert.equal(h.node('create-dialog').open,false);assert.equal(h.node('collection-main').dataset.view,'binder');assert.match(h.node('binder-cards').innerHTML,/Trial card 1/);assert.equal(h.api.cardState().length,1);
});

function phantasmalSearchFlow(){
 const setId='977bf107-e10c-4d93-a7a4-3d7b775c5003',hits=[13,109,125,130],calls=[];
 const binder={id:'phantasmal-search',name:'Phantasmal Flames',type:'set',setId,language:'en',revision:1,archived:false,setTotal:130};
 const catalogue=readyCatalogue(Array.from({length:130},(_,i)=>{
  const n=i+1,card={...trialCard(n),cardId:'phantasmal-'+n,set:{setId},names:{englishDisplay:hits.includes(n)?'Mega Charizard X ex':'Other card '+n,native:hits.includes(n)?'Mega Charizard X ex':'Other card '+n}};
  card.variants[0].image.derivatives=[{role:'card-grid',deliveryUrl:'https://assets.stackrtcg.com/grid.webp'},{role:'detail-page',deliveryUrl:'https://assets.stackrtcg.com/detail.webp'}];return card;
 }),setId);
 const h=harness((url,init)=>{
  calls.push({url,method:init.method});assert.equal(init.method,undefined);assert.ok(!url.includes('/catalogue/search'),'A set search must use the full set checklist, not a page of global results');
  if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(catalogue,url)));
  if(url.includes('/checklist'))return Promise.resolve(response(ownershipPage(catalogue,binder,[{cardId:'phantasmal-13',variantId:'variant-13',quantity:2}],url)));
  return Promise.resolve(response({binder,summary:{uniqueCards:1,totalVariants:1,totalQuantity:2},items:[],hasMore:false,progress:{owned:1,total:130}}));
 });return {...h,calls,binder};
}
test('Phantasmal search finds Charizard across the full set and All, Owned and Missing retain the query',async()=>{
 const h=phantasmalSearchFlow();await h.api.openBinder(h.binder.id);
 assert.equal(h.visibleCards().length,130);assert.equal(h.node('card-search').hidden,false);
 h.node('card-query').value='Charizard';h.node('card-query').events.input();
 assert.deepEqual(h.visibleCards(),[13,109,125,130].map(n=>'phantasmal-'+n+':catalogue'));assert.match(h.node('cards-context').textContent,/4 of 130 cards · complete set/);
 h.node('owned-tab').events.click();assert.deepEqual(h.visibleCards(),['phantasmal-13:catalogue']);assert.equal(h.node('card-query').value,'Charizard');
 h.node('missing-tab').events.click();assert.deepEqual(h.visibleCards(),[109,125,130].map(n=>'phantasmal-'+n+':catalogue'));
 h.node('card-query').value='';h.node('card-query').events.input();assert.equal(h.visibleCards().length,129);
 h.node('checklist-tab').events.click();assert.equal(h.visibleCards().length,130);assert.equal(h.calls.length,5,'Filtering a loaded set does not fetch new catalogue pages or write ownership');
});
test('a no-match set search stays editable and clearing it restores the complete checklist',async()=>{
 const h=phantasmalSearchFlow();await h.api.openBinder(h.binder.id);
 h.node('card-query').value='Definitely absent';h.node('card-query').events.input();assert.equal(h.visibleCards().length,0);assert.equal(h.node('card-filter-empty').hidden,false);assert.match(h.node('card-filter-empty').innerHTML,/No matching cards/);assert.doesNotMatch(h.node('card-filter-empty').innerHTML,/next page/);
 assert.equal(h.node('card-search').hidden,false);assert.equal(h.node('card-query').disabled,false);
 h.node('card-query').value='';h.node('card-query').events.input();assert.equal(h.visibleCards().length,130);assert.equal(h.node('card-filter-empty').hidden,true);
 h.node('card-query').value='13/94';h.node('card-query').events.input();assert.deepEqual(h.visibleCards(),['phantasmal-13:catalogue'],'Collector number search matches the numerator without matching 130');
});
test('search typed while the last checklist page is pending is applied when the full set is ready',async()=>{
 const h=delayedChecklist(),task=h.api.openBinder('ordered-binder');await tick();
 h.node('card-query').value='Trial card 2';h.node('card-query').events.input();assert.equal(h.node('card-filter-empty').hidden,true);assert.match(h.node('binder-cards').innerHTML,/card-loading-art/);
 h.finish();await task;assert.deepEqual(h.visibleCards(),['trial-card-2:catalogue']);assert.match(h.node('cards-context').textContent,/1 of 3 cards · complete set/);
});
test('a saved owned change immediately leaves Missing while the full checklist remains available',async()=>{
 const h=trialFlow();await h.api.openBinder('trial-binder');h.node('missing-tab').events.click();assert.equal(h.visibleCards().length,161);
 await h.api.togglePulled('trial-card-1:catalogue');assert.equal(h.visibleCards().length,160);assert.ok(!h.visibleCards().includes('trial-card-1:catalogue'));assert.equal(h.api.cardState().length,161);
 h.node('owned-tab').events.click();assert.deepEqual(h.visibleCards(),['trial-card-1:catalogue']);assert.equal(h.writes.length,1);
});
test('artwork inspection opens a large approved image without reading or changing owned quantities',async()=>{
 const h=phantasmalSearchFlow();await h.api.openBinder(h.binder.id);const reads=h.calls.length;
 h.inspectCard('phantasmal-13:catalogue');assert.equal(h.node('card-preview-dialog').open,true);assert.equal(h.node('card-preview-title').textContent,'Mega Charizard X ex');assert.equal(h.node('card-preview-image').src,'https://assets.stackrtcg.com/detail.webp');assert.equal(h.calls.length,reads);
 h.api.lock();assert.equal(h.node('card-preview-dialog').open,false);assert.equal(h.api.cardState().length,0);assert.equal(h.node('card-query').value,'');
});
test('saved binder progress is read with at most three concurrent requests and reused for the same revision',async()=>{
 const binders=Array.from({length:5},(_,i)=>({...coverBinder,id:'progress-'+i,name:'Binder '+i,setTotal:100,revision:1}));let inFlight=0,maxInFlight=0,reads=0;
 const h=harness(async(url,init)=>{
  assert.equal(init.method,undefined);
  if(url.startsWith('/api/binders?'))return response({binders,hasMore:false});
  reads++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await tick();inFlight--;
  const binder=binders.find(b=>url==='/api/binders/'+b.id);return response({binder,summary:{uniqueCards:27,totalVariants:30,totalQuantity:40},progress:{owned:27,total:100},items:[],hasMore:false});
 });await h.api.start();assert.match(h.node('binder-grid').innerHTML,/Loading progress/);assert.doesNotMatch(h.node('binder-grid').innerHTML,/0 \/ 100 pulled/);await h.api.progressTask();
 assert.equal(maxInFlight,3);assert.equal(reads,5);assert.match(h.node('binder-grid').innerHTML,/27 \/ 100 pulled/);assert.match(h.node('binder-grid').innerHTML,/value="27"/);
 await h.api.loadSavedBinderProgress();assert.equal(reads,5);h.api.lock();assert.equal(h.node('binder-grid').innerHTML,'');assert.equal(h.node('binder-grid').dataset.renderKey,'');
});
test('an unavailable saved progress read never renders a false zero and an existing cover says Open binder',async()=>{
 const h=harness(url=>Promise.resolve(url.startsWith('/api/binders?')?response({binders:[coverBinder],hasMore:false}):response({error:'Unavailable'},503)));
 await h.api.start();assert.equal(h.node('trial30-open').textContent,'Open binder →');assert.equal(h.node('pitch-black-open').textContent,'Start binder →');await h.api.progressTask();assert.match(h.node('binder-grid').innerHTML,/Progress unavailable/);assert.doesNotMatch(h.node('binder-grid').innerHTML,/0%|value="0"/);
});

function publicReady(setId=TRIAL_SET,total=3){
 const value=readyCatalogue(Array.from({length:total},(_,index)=>({...trialCard(index+1),set:{setId}})),setId);return {...value,meta:publicPage(value).meta};
}
function readyCatalogue(cards,setId=cards[0]?.set?.setId){
 const capturedAt='2026-11-06T13:00:00.000Z',catalogueVersionId='verified-trial-version';
 const version=cards[0]?.catalogueVersionId||catalogueVersionId;return {cards,ready:{complete:true,setId,language:'en',total:cards.length,catalogueVersionId:version,capturedAt,snapshotId:version+':'+capturedAt,stale:false}};
}
function publicPage(value,url='https://site.test/'){
 const offset=Number(new URL(url,'https://site.test').searchParams.get('cursor')||0),cards=value.cards.slice(offset,offset+50);
 return {...value,cards,meta:{apiVersion:'1',pagination:{limit:50,offset,nextCursor:offset+cards.length<value.ready.total?String(offset+cards.length):null}}};
}
function ownershipPage(value,binder,items=[],url='https://site.test/'){
 const offset=Number(new URL(url,'https://site.test').searchParams.get('cursor')||0),ownership=items.slice(offset,offset+50);
 return {ready:value.ready,binderRevision:binder.revision,ownership,ownershipTotal:items.length,progress:{owned:new Set(items.map(item=>item.cardId)).size,total:value.ready.total,checkedAt:value.ready.capturedAt,capturedAt:value.ready.capturedAt,catalogueVersionId:value.ready.catalogueVersionId,referenceConsistent:true,source:'public-catalogue-snapshot',stale:false},meta:{apiVersion:'1',pagination:{limit:50,offset,nextCursor:offset+ownership.length<items.length?String(offset+ownership.length):null}}};
}
test('a preloaded public checklist opens with one fresh private quantity read and never stores ownership in its cache',async()=>{
 const publicData=publicReady(),calls=[],binder={...coverBinder};let quantity=2;
 const h=harness((url,options)=>{calls.push({url,options});if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(publicData,url)));if(url.includes('/checklist'))return Promise.resolve(response(ownershipPage(publicData,binder,[{cardId:'trial-card-1',variantId:'variant-1',quantity}],url)));return Promise.resolve(response({binder,items:[],summary:{uniqueCards:1,totalQuantity:quantity,totalVariants:1},hasMore:false,progress:{owned:1,total:3}}));});
 await h.api.fetchReadySet(TRIAL_SET);await h.api.openBinder(binder.id);assert.equal(h.api.cardState().length,3);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,2);assert.match(calls.find(call=>call.url.includes('/checklist')).url,/paged=1&limit=50&snapshot=/);assert.ok(calls.find(call=>call.url.includes('/checklist')).url.includes('expectedRevision=1'));assert.equal(calls.filter(call=>call.url.includes('/checklist')).length,1);assert.doesNotMatch(JSON.stringify(h.api.readyState()),/ownedQuantity|ownedVariants|ownership|quantity/);assert.match(h.node('progress-date').textContent,/pulled cards were checked now/);
 quantity=4;await h.api.openBinder(binder.id);assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,4);assert.equal(calls.filter(call=>call.url.includes('/catalogue/ready/')).length,1);assert.equal(calls.filter(call=>call.url.includes('/checklist')).length,2);
});
test('the paged endpoint publishes a full binder and an unsupported protocol cannot fall back to a full legacy response',async()=>{
 for(const fallback of [false,true]){
  const value=publicReady(),calls=[],h=harness(url=>{calls.push(url);if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(value,url)));if(url.includes('/checklist'))return Promise.resolve(fallback?response({error:'Use pages'},404):response(ownershipPage(value,coverBinder,[],url)));return Promise.resolve(response({...coverDetail(),progress:{owned:0,total:3}}));});
  await h.api.openBinder(coverBinder.id);assert.equal(h.api.cardState().length,fallback?0:3);assert.equal(calls.filter(url=>url.includes('/checklist')).length,1);assert.ok(!calls.some(url=>url.includes('complete=1')));if(!fallback)assert.match(h.node('cards-context').textContent,/Complete checklist loaded: 3/);assert.equal(h.node('binder-cards').htmlWrites,2);
 }
});
test('background catalogue warming has concurrency two, a fixed handful of sets, and no image downloads',async()=>{
 let idle;const pending=[],calls=[],images=[];class Image{set src(value){images.push(value);}}
 const h=harness((url,options)=>{calls.push({url,options});const value=deferred();pending.push({value,setId:url.split('/ready/')[1].split('?')[0]});return value.promise;},[],{navigator:{connection:{effectiveType:'4g'}},Image,window:{requestIdleCallback(callback){idle=callback;return 1;}}});
 h.api.scheduleReadySets();assert.equal(calls.length,0);idle();assert.equal(calls.length,2);
 let resolved=0;while(resolved<7){const entry=pending[resolved++];entry.value.resolve(response(publicReady(entry.setId,1)));await tick();assert.ok(calls.length-resolved<=2);}
 assert.equal(calls.length,7);assert.equal(h.api.readyState().length,7);assert.equal(images.length,0);assert.ok(calls.every(call=>call.options.priority==='low'&&call.options.method===undefined));
});
test('sign-in loss aborts pending public preloads and late responses cannot refill memory or reveal a checklist',async()=>{
 const pending=deferred(),calls=[],h=harness((url,options)=>{calls.push({url,options});return pending.promise;});
 const task=h.api.fetchReadySet(TRIAL_SET);h.api.lock();assert.equal(calls[0].options.signal.aborted,true);pending.resolve(response(publicReady()));await task;assert.equal(h.api.readyState().length,0);assert.equal(h.api.cardState().length,0);assert.equal(h.node('collection-app').hidden,true);
});
test('an inconsistent complete snapshot cannot appear as a finished binder',async()=>{
 const value=publicReady();value.cards[1].catalogueVersionId='another-version';const h=harness(url=>{assert.ok(!url.includes('/checklist'),'Unverified public pages cannot request private ownership');return Promise.resolve(response(url.includes('/catalogue/ready/')?publicPage(value,url):coverDetail()));});
 await h.api.openBinder(coverBinder.id);assert.equal(h.api.readyState().length,0);assert.equal(h.api.cardState().length,0);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);assert.match(h.node('collection-status').textContent,/complete public checklist could not be confirmed/);
});
test('a ready Phantasmal snapshot keeps all Charizard results searchable through fresh Owned and Missing filters',async()=>{
 const setId='977bf107-e10c-4d93-a7a4-3d7b775c5003',value=publicReady(setId,130),hits=[13,109,125,130],binder={...coverBinder,setId,name:'Phantasmal Flames'},calls=[];
 for(const n of hits)value.cards[n-1].names={native:'Mega Charizard X ex',englishDisplay:'Mega Charizard X ex'};
 const h=harness((url,init)=>{calls.push(url);assert.equal(init.method,undefined);return Promise.resolve(response(url.includes('/catalogue/ready/')?publicPage(value,url):url.includes('/checklist')?ownershipPage(value,binder,[{cardId:'trial-card-13',variantId:'variant-13',quantity:2}],url):{binder,summary:{uniqueCards:1,totalQuantity:2,totalVariants:1},items:[],hasMore:false,progress:{owned:1,total:130}}));});
 await h.api.fetchReadySet(setId);await h.api.openBinder(binder.id);assert.equal(h.visibleCards().length,130);
 h.node('card-query').value='Charizard';h.node('card-query').events.input();assert.deepEqual(h.visibleCards(),hits.map(n=>'trial-card-'+n+':catalogue'));
 h.node('owned-tab').events.click();assert.deepEqual(h.visibleCards(),['trial-card-13:catalogue']);
 h.node('missing-tab').events.click();assert.deepEqual(h.visibleCards(),[109,125,130].map(n=>'trial-card-'+n+':catalogue'));
 h.node('card-query').value='';h.node('card-query').events.input();assert.equal(h.visibleCards().length,129);
 h.node('checklist-tab').events.click();assert.equal(h.visibleCards().length,130);assert.equal(calls.length,5);assert.doesNotMatch(JSON.stringify(h.api.readyState()),/ownedQuantity|ownedVariants|ownership|quantity/);
});
test('late private ownership pages cannot publish a checklist after sign-in loss or navigation',async()=>{
 for(const leave of ['lock','navigate']){
  const pending=deferred(),value=publicReady(),h=harness(url=>url.includes('/catalogue/ready/')?Promise.resolve(response(publicPage(value,url))):url.includes('/checklist')?pending.promise:Promise.resolve(response(coverDetail())));
  const opening=h.api.openBinder(coverBinder.id);await tick();
  if(leave==='lock')h.api.lock();else h.api.showView('library');
  const before=h.node('binder-cards').innerHTML;
  pending.resolve(response(ownershipPage(value,coverBinder,[])));await opening;
  assert.equal(h.api.readyState().length,leave==='lock'?0:1);assert.doesNotMatch(JSON.stringify(h.api.readyState()),/ownership|quantity|ownedVariants/);assert.equal(h.api.cardState().length,0);assert.equal(h.node('binder-cards').innerHTML,before);assert.equal(h.node('collection-main').dataset.view,leave==='lock'?'sign-in':'library');
 }
});

test('private opening stages three bounded ownership pages and publishes the complete consistent checklist once',async()=>{
 const value=publicReady(TRIAL_SET,121),items=value.cards.map(card=>({cardId:card.cardId,variantId:card.defaultVariantId,quantity:2})),pending=deferred(),calls=[];
 const h=harness(url=>{calls.push(url);if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(value,url)));if(url.includes('/checklist'))return url.includes('cursor=100')?pending.promise:Promise.resolve(response(ownershipPage(value,coverBinder,items,url)));return Promise.resolve(response(coverDetail()));});
 const task=h.api.openBinder(coverBinder.id);await tick();assert.equal(calls.filter(url=>url.includes('/checklist')).length,3);assert.equal(h.api.cardState().length,0);assert.match(h.node('binder-cards').innerHTML,/card-loading-art/);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);
 pending.resolve(response(ownershipPage(value,coverBinder,items,'https://site.test/?cursor=100')));await task;
 assert.equal(h.api.cardState().length,121);assert.ok(h.api.cardState().every(row=>row.ownedVariants[0].quantity===2));assert.equal(h.node('binder-cards').htmlWrites,2);assert.equal(calls.filter(url=>url.includes('/catalogue/ready/')).length,3);assert.ok(calls.filter(url=>url.includes('/checklist')).every(url=>url.includes('paged=1')&&url.includes('expectedRevision=1')));assert.doesNotMatch(JSON.stringify(h.api.readyState()),/ownership|quantity|ownedVariants/);
});
test('private mismatches cannot publish missing cards, mixed snapshots, revisions, counts or reference metadata',async()=>{
 const mutations=[
  data=>data.binderRevision=2,
  data=>data.ready={...data.ready,snapshotId:'another-snapshot'},
  data=>data.progress.total=61,
  data=>data.progress.referenceConsistent=false,
  data=>data.progress.catalogueVersionId='another-version',
  data=>data.progress.checkedAt='2026-10-01T00:00:00Z',
  data=>data.progress.capturedAt='2026-10-01T00:00:00Z',
  data=>data.ownership[0]={...data.ownership[0],cardId:'unmapped-saved-card'},
  data=>data.ownership[0]={...data.ownership[0],cardId:'trial-card-1',variantId:'variant-1'},
  data=>data.meta.pagination.offset=99,
  data=>data.meta.pagination.nextCursor='50',
  data=>data.ownershipTotal=59,
  data=>data.ownership=Array.from({length:51},()=>data.ownership[0])
 ];
 for(const mutate of mutations){const value=publicReady(TRIAL_SET,60),items=value.cards.map(card=>({cardId:card.cardId,variantId:card.defaultVariantId,quantity:1}));
  const h=harness(url=>{if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(value,url)));if(url.includes('/checklist')){const data=ownershipPage(value,coverBinder,items,url);if(url.includes('cursor=50'))mutate(data);return Promise.resolve(response(data));}return Promise.resolve(response(coverDetail()));});
  await h.api.openBinder(coverBinder.id);assert.equal(h.api.cardState().length,0);assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);assert.doesNotMatch(h.node('cards-context').textContent,/Complete/);assert.doesNotMatch(JSON.stringify(h.api.readyState()),/ownership|quantity|ownedVariants/);
 }
});
test('a known printing retains a saved legacy finish quantity without hiding the owned card',async()=>{
 const value=publicReady(),h=harness(url=>Promise.resolve(response(url.includes('/catalogue/ready/')?publicPage(value,url):url.includes('/checklist')?ownershipPage(value,coverBinder,[{cardId:'trial-card-1',variantId:'saved-legacy-alias',quantity:4}],url):coverDetail())));
 await h.api.openBinder(coverBinder.id);assert.equal(h.api.cardState()[0].ownedVariants[0].variantId,'saved-legacy-alias');assert.equal(h.api.cardState()[0].ownedVariants[0].quantity,4);assert.match(h.node('binder-cards').innerHTML,/>Pulled<\/span>/);
});
test('a private revision conflict discards staged rows and retries once from the current binder revision',async()=>{
 for(const conflictsContinue of [false,true]){
  const value=publicReady(TRIAL_SET,60),calls=[];let revision=1,details=0;
  const h=harness(url=>{calls.push(url);if(url.includes('/catalogue/ready/'))return Promise.resolve(response(publicPage(value,url)));if(url.includes('/checklist')){
   if(revision===1&&url.includes('cursor=50')){revision=2;return Promise.resolve(response({error:'This binder changed while loading. Reopen it.'},409));}
   if(revision===2&&conflictsContinue)return Promise.resolve(response({error:'This binder changed again. Retry later.'},409));
   const items=value.cards.map(card=>({cardId:card.cardId,variantId:card.defaultVariantId,quantity:revision===1?1:3}));return Promise.resolve(response(ownershipPage(value,{...coverBinder,revision},items,url)));
  }details++;return Promise.resolve(response({...coverDetail(),binder:{...coverBinder,revision}}));});
  await h.api.openBinder(coverBinder.id);assert.equal(details,2);assert.equal(h.api.cardState().length,conflictsContinue?0:60);assert.equal(calls.filter(url=>url.includes('/checklist')).length,conflictsContinue?3:4);assert.ok(!calls.some(url=>url.includes('complete=1')));
  if(!conflictsContinue){assert.ok(h.api.cardState().every(row=>row.ownedVariants[0].quantity===3));assert.equal(h.node('binder-cards').htmlWrites,2);}else assert.doesNotMatch(h.node('binder-cards').innerHTML,/Trial card/);
 }
});
test('a public snapshot conflict restarts from a reloaded first page once and never caches partial pages',async()=>{
 for(const conflictsContinue of [false,true]){
  const first=publicReady(TRIAL_SET,60),second=publicReady(TRIAL_SET,60),calls=[];second.ready={...second.ready,catalogueVersionId:'current-version',snapshotId:'current-version:'+second.ready.capturedAt};second.cards=second.cards.map(card=>({...card,catalogueVersionId:'current-version'}));let round=0;
  const h=harness((url,options)=>{calls.push({url,options});if(!url.includes('cursor=')){round++;return Promise.resolve(response(publicPage(round===1?first:second,url)));}if(round===1||conflictsContinue)return Promise.resolve(response({error:'The public checklist changed.'},409));return Promise.resolve(response(publicPage(second,url)));});
  const result=await h.api.fetchReadySet(TRIAL_SET);assert.equal(round,2);assert.equal(calls.length,4);assert.ok(calls.filter(call=>!call.url.includes('cursor=')).every(call=>call.options.cache==='reload'));assert.equal(h.api.readyState().length,conflictsContinue?0:1);
  if(!conflictsContinue){assert.equal(result.cards.length,60);assert.ok(result.cards.every(card=>card.catalogueVersionId==='current-version'));}else assert.equal(result,null);
 }
});
test('the two-request public limit includes foreground loads and holds its slot through JSON body reading',async()=>{
 const calls=[],bodies=[],ids=[TRIAL_SET,PITCH_SET,'816ff627-a585-4953-99c4-a15c9b0b80e5'];
 const h=harness((url,options)=>{const body=deferred();calls.push({url,options});bodies.push(body);return Promise.resolve({status:200,ok:true,redirected:false,headers:new Headers({'Content-Type':'application/json'}),json:()=>body.promise});});
 const tasks=ids.map(setId=>h.api.fetchReadySet(setId));await tick();assert.equal(calls.length,2);
 bodies[0].resolve(publicReady(ids[0],1));await tick();assert.equal(calls.length,3);bodies[1].resolve(publicReady(ids[1],1));bodies[2].resolve(publicReady(ids[2],1));await Promise.all(tasks);assert.equal(h.api.readyState().length,3);assert.ok(calls.every(call=>call.url.includes('paged=1')&&call.options.priority==='low'));
});
