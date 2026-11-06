(()=>{'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const languages={en:'English',ja:'Japanese','zh-cn':'Simplified Chinese','zh-tw':'Traditional Chinese',ko:'Korean'};
function newId(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function safeImage(value){try{const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');if(u.protocol!=='https:'||u.username||u.password||u.port||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||host.startsWith('[')||u.href.length>2000)return '';return u.href;}catch{return '';}}
function imageFor(card,variant){const a=variant?.image;if(!a||a.permissionStatus!=='approved'||a.cardId&&a.cardId!==card.cardId||a.setId&&a.setId!==card.set?.setId)return '';return safeImage(a.derivatives?.find(d=>d.role==='card-grid')?.deliveryUrl||a.derivatives?.find(d=>d.role==='card-grid')?.url||a.deliveryUrl);}
async function warmCardImages(cards){
 if(typeof Image!=='function')return;
 const urls=[...new Set(cards.map(card=>imageFor(card,card.variants?.find(v=>v.variantId===card.defaultVariantId)||card.variants?.[0])).filter(Boolean))].slice(0,4);
 await Promise.all(urls.map(url=>new Promise(resolve=>{
  const image=new Image();let finished=false;
  const done=()=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve();},timer=setTimeout(done,2500);
  image.onload=()=>{if(typeof image.decode==='function')image.decode().then(done,done);else done();};image.onerror=done;image.decoding='async';image.src=url;
 })));
}
// Catalogue artwork is presentation metadata; collection identity stays canonical.
const setLogos=(()=>{try{return new Map(JSON.parse($('collection-set-logos')?.textContent||'{"logos":[]}').logos.map(row=>[row.setId+':'+row.language,row]));}catch{return new Map();}})();
const coverArt=(()=>{try{return new Map(JSON.parse($('collection-covers')?.textContent||'{"covers":[]}').covers.map(row=>[row.setId+':'+row.language,row]));}catch{return new Map();}})();
let coverSerial=0;
function coverImage(value){if(/^\/assets\/[a-z0-9][a-z0-9._-]*\.(?:png|webp|jpe?g)$/.test(value||''))return value;return safeImage(value);}
function celebrationPattern(art,serial){
 const mew=coverImage(art.image),pikachu=coverImage(art.companionImage);if(!mew||!pikachu)return '';
 const mewPath='M287 195C274 188 248 214 225 244C199 276 177 303 166 331C152 359 161 379 184 386C213 395 245 387 279 379L299 387 307 410 322 447 344 489 362 529 383 550 396 552 398 544 390 523 381 504 394 492 430 537 458 565 477 571 486 564 484 551 475 531 463 506 445 479 437 454 420 431 414 408 397 390 399 378 416 369 423 361 421 353 408 344 391 340 373 332 370 319 378 304 382 287 375 272 360 258 338 249 314 246 292 249 272 255 254 256 238 259 238 273 247 289 240 306 241 325 252 343 271 355 291 360 303 369C266 378 223 390 191 376C160 364 180 326 202 299C228 269 255 246 277 224C288 211 291 199 287 195Z';
 const pikaPath='M250 143L277 157 301 200 321 253 351 245 379 248 400 254 434 211 471 183 492 180 484 206 471 234 462 266 466 292 475 317 477 348 489 363 505 355 520 341 531 351 529 367 520 385 505 405 488 416 477 439 486 463 494 482 483 506 464 523 455 542 475 569 468 589 442 601 419 596 393 578 369 565 345 570 322 580 299 571 286 550 268 523 254 502 245 484 241 463 249 444 266 431 269 406 256 389 247 368 237 349 245 330 248 312 256 292 246 278 237 256 234 233 238 205 243 180Z M155 273L195 294 189 319 229 337 217 366 268 391 260 414 202 388 216 361 179 342 193 316 153 296Z';
 const sprite=(name,file,w,h,path,box,x,y,width,height)=>{const id=serial+'-'+name+'-'+x;return '<svg x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" viewBox="'+box+'"><defs><clipPath id="'+id+'"><path d="'+path+'"/></clipPath><filter id="'+id+'-source" x="0" y="0" width="700" height="750" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -9 0 9 0 -.4" result="blue"/>'+(name==='mew'?'<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 12 -12 0 0 -.1" result="magenta"/><feComposite in="blue" in2="magenta" operator="in" result="key"/>':'')+'<feComposite in="SourceGraphic" in2="'+(name==='mew'?'key':'blue')+'" operator="out"/></filter></defs><g clip-path="url(#'+id+')"><image href="'+esc(file)+'" width="'+w+'" height="'+h+'" filter="url(#'+id+'-source)"/><path d="M0 0H700V750H0Z" fill="url(#'+serial+'-stitches)"/></g></svg>';};
 return '<svg class="embroidered-character mew-pikachu-pattern" viewBox="0 0 400 520" focusable="false"><defs><pattern id="'+serial+'-stitches" width="2.8" height="3.6" patternUnits="userSpaceOnUse"><path d="M0 3L2.8 0" stroke="#f5e5fa" stroke-width=".65" opacity=".44"/></pattern></defs><g fill="none" stroke="#debde3" stroke-width="1.6" stroke-dasharray="3 3" opacity=".45"><path d="M50 490C200 380 390 140 290 30M30 60C180 20 260 400 370 470"/><circle cx="340" cy="76" r="13"/><circle cx="57" cy="390" r="9"/></g>'+sprite('mew',mew,648,726,mewPath,'152 190 345 390',-12,15,274,310)+sprite('pikachu',pikachu,650,714,pikaPath,'145 140 395 470',146,181,262,320)+sprite('mew',mew,648,726,mewPath,'152 190 345 390',286,-9,108,124)+sprite('pikachu',pikachu,650,714,pikaPath,'145 140 395 470',-9,393,103,124)+'</svg>';
}
function setLogoUrl(setId,language){
 const row=setLogos.get(setId+':'+language);if(!row)return '';
 if(row.file)return /^[a-z0-9][a-z0-9._-]*\.(?:png|webp|jpe?g)$/.test(row.file)?'/assets/'+row.file:'';
 const url=safeImage(row.url);return url&&new URL(url).hostname==='assets.stackrtcg.com'?url:'';
}
function binderCover(info,className='binder-cover'){
 const logo=info.type==='custom'?'':setLogoUrl(info.setId,info.language),row=setLogos.get(info.setId+':'+info.language),title=info.setName||info.name||'Collection';
 const art=info.type==='custom'?null:coverArt.get(info.setId+':'+info.language),image=coverImage(art?.image),serial='cover-character-'+(++coverSerial);
 const fullCover=coverImage(art?.fullCover);
 if(fullCover)return '<span class="'+className+' collector-cover leather-cover complete-cover" data-logo-status="embedded" aria-hidden="true"><img class="complete-cover-art" src="'+esc(fullCover)+'" alt="" loading="lazy" decoding="async"></span>';
 const character=art?.character==='mew-pikachu'?celebrationPattern(art,serial):image&&art?.character==='mewtwo'?'<svg class="embroidered-character" viewBox="150 200 395 465" focusable="false"><defs><clipPath id="'+serial+'"><path d="M315 205L336 213 347 232 372 229 383 207 397 214 401 238 405 249 415 275 407 300 393 315 381 320 389 330 403 333 418 348 437 374 464 385 478 371 493 368 503 379 501 390 516 389 527 399 528 410 516 420 501 421 494 435 479 438 467 427 445 424 430 416 422 427 438 450 464 494 480 529 479 553 491 567 514 573 528 584 529 594 520 602 497 604 476 596 456 577 430 547 406 522 384 523 365 548 341 585 318 619 316 637 305 649 287 655 263 653 253 647 252 635 263 618 278 608 295 580 305 553 304 524 293 508 283 486 282 462 286 442 269 427 254 411 239 396 221 382 206 372 197 373 191 390 181 407 169 409 162 400 164 378 173 350 191 326 212 313 233 311 254 319 269 331 281 349 294 365 305 355 319 338 334 332 341 321 325 304 318 286 320 266 325 246Z"/></clipPath><pattern id="'+serial+'-thread" width="2.7" height="3.6" patternUnits="userSpaceOnUse"><path d="M0 3L2.7 0" stroke="#f1e3fc" stroke-width=".7" opacity=".5"/></pattern></defs><image href="'+esc(image)+'" width="658" height="744" clip-path="url(#'+serial+')"/><path d="M150 200H545V665H150Z" clip-path="url(#'+serial+')" fill="url(#'+serial+'-thread)"/></svg>':image?'<span class="cover-chase-inlay"><img src="'+esc(image)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest(\'.cover-chase-inlay\').hidden=true"></span>':'';
 return '<span class="'+className+' collector-cover leather-cover'+(art?.character==='mew-pikachu'?' celebration-cover':'')+'" data-logo-status="'+(info.type==='custom'?'custom':logo?'available':'unavailable')+'" aria-hidden="true"><img class="leather-base" src="/assets/binder-purple-leather-angled-v1.webp" alt="" loading="lazy" decoding="async"><span class="cover-top"><img class="cover-mark" src="/assets/stackr-mark-original.png" alt=""><small>'+esc(info.type==='custom'?'STACKR':info.setCode||row?.setCode||languages[info.language])+'</small></span><span class="cover-character">'+character+'</span><span class="cover-logo embroidered-badge" title="'+esc(title)+'">'+(logo?'<img class="set-logo" src="'+esc(logo)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false">':'')+'<strong class="cover-fallback"'+(logo?' hidden':'')+'>'+esc(info.setCode||row?.setCode||'STACKR')+'</strong></span></span>';
}
let binders=[],active=null,libraryOffset=0,sets=[],setCursor=null,setLanguage='en',view='sets',mode='owned',cardOffset=0,cardCursor=null,cardObjects=new Map(),generation=0,searchGeneration=0,locked=false,createDraft=null,cardDraft=null,editDraft=null,modalGeneration=0;
let setsLoading=false,linkedSet=null,linkedTarget=null,accountGeneration=0;
const TRIAL_SET_ID='258cb8e5-c769-540d-9e3c-40d4ed4dafdb';
const PITCH_BLACK_SET_ID='d6d58c17-5923-496e-94ef-5819f34ae10c';
const CHAOS_RISING_SET_ID='816ff627-a585-4953-99c4-a15c9b0b80e5';
const JOURNEY_TOGETHER_SET_ID='4f3046f3-9ab7-4068-a7df-dbe2b08c263c',PHANTASMAL_FLAMES_SET_ID='977bf107-e10c-4d93-a7a4-3d7b775c5003';
const ASCENDED_HEROES_SET_ID='ddc668c0-316e-4dab-8c51-625167508fd6';
const DELTA_REIGN_SET_ID='a1bde625-6996-5451-bcda-fb80fe5b428b';
const readySetIds=[TRIAL_SET_ID,PITCH_BLACK_SET_ID,CHAOS_RISING_SET_ID,JOURNEY_TOGETHER_SET_ID,PHANTASMAL_FLAMES_SET_ID,ASCENDED_HEROES_SET_ID,DELTA_REIGN_SET_ID];
// This memory contains public canonical cards only. Saved quantities are read
// afresh from owner-filtered, revision-checked pages when a binder opens.
const readyPublic=new Map(),readyPending=new Map(),readyControllers=new Set();
let readyEpoch=0,readyScheduled=null,readyActive=0,readyQueue=[],readyNetwork=0,readyWaiters=[];
const sameReady=(a,b)=>!!a&&!!b&&['setId','language','total','catalogueVersionId','capturedAt','snapshotId'].every(key=>a[key]===b[key]);
const validReady=(reference,setId)=>reference?.complete===true&&reference.setId===setId&&reference.language==='en'&&readySetIds.includes(setId)&&Number.isSafeInteger(reference.total)&&reference.total>0&&reference.total<=400&&typeof reference.snapshotId==='string'&&reference.snapshotId.length<=100&&typeof reference.catalogueVersionId==='string'&&reference.snapshotId===reference.catalogueVersionId+':'+reference.capturedAt&&Number.isFinite(Date.parse(reference.capturedAt));
function rememberReady(cards,reference,setId){
 if(!validReady(reference,setId)||!Array.isArray(cards)||cards.length!==reference.total||new Set(cards.map(card=>card.cardId)).size!==cards.length||cards.some(card=>card.game!=='pokemon'||card.set?.setId!==setId||card.languageCode!=='en'||card.catalogueVersionId!==reference.catalogueVersionId||!Array.isArray(card.variants)||!card.variants.length))throw Error('The complete public checklist could not be confirmed. Retry this binder.');
 const value={cards,ready:reference};readyPublic.set(setId,value);return value;
}
function releaseReadySlot(){for(let waiter;(waiter=readyWaiters.shift());){if(waiter.epoch===readyEpoch&&!locked){waiter.resolve(true);return;}waiter.resolve(false);}readyNetwork--;}
async function readyPageRequest(path,controller,epoch,reload=false){
 if(readyNetwork>=2){if(!await new Promise(resolve=>readyWaiters.push({epoch,resolve})))return null;}else readyNetwork++;
 let timer;try{if(locked||epoch!==readyEpoch)return null;timer=setTimeout(()=>controller.abort(),15000);const response=await fetch(path,{credentials:'same-origin',cache:reload?'reload':'default',priority:'low',signal:controller.signal,headers:{Accept:'application/json'}});const data=response.ok&&!response.redirected&&response.headers.get('Content-Type')?.startsWith('application/json')?await response.json():null;if(!data)await response.body?.cancel();return {response,data};}finally{clearTimeout(timer);releaseReadySlot();}
}
async function fetchReadySet(setId){
 if(locked||!readySetIds.includes(setId))return null;if(readyPublic.has(setId))return readyPublic.get(setId);if(readyPending.has(setId))return readyPending.get(setId);
 const epoch=readyEpoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);readyControllers.add(controller);
 const task=(async()=>{try{
  for(let attempt=0;attempt<2;attempt++){
   let cursor=null,reference=null,restart=false;const cards=[],seen=new Set();
   for(let page=0;page<8;page++){
    const result=await readyPageRequest('/api/binders/catalogue/ready/'+setId+'?'+new URLSearchParams({language:'en',paged:'1',limit:'50',...(cursor!==null?{cursor,snapshot:reference.snapshotId}:{})}),controller,epoch,cursor===null),response=result?.response;
    if(!response)return null;if(response.status===401){lock();return null;}if(response.status===409){restart=true;break;}if(!result.data)return null;
    const data=result.data;if(locked||epoch!==readyEpoch)return null;const pagination=data.meta?.pagination,offset=cards.length;
    if(!validReady(data.ready,setId)||reference&&!sameReady(reference,data.ready)||!Array.isArray(data.cards)||data.cards.length>50||pagination?.limit!==50||pagination.offset!==offset||data.cards.length!==Math.min(50,data.ready.total-offset))throw Error('The public checklist pages could not be confirmed.');
    reference=data.ready;for(const card of data.cards){if(seen.has(card.cardId))throw Error('The public checklist repeated a card.');seen.add(card.cardId);cards.push(card);}
    const expected=cards.length<reference.total?String(cards.length):null;if(pagination.nextCursor!==expected)throw Error('The public checklist pages were incomplete.');
    cursor=pagination.nextCursor;if(cursor===null)return rememberReady(cards,reference,setId);
   }
   if(!restart)return null;
  }
  return null;
 }catch{return null;}finally{clearTimeout(timer);readyControllers.delete(controller);if(epoch===readyEpoch)readyPending.delete(setId);}})();
 readyPending.set(setId,task);return task;
}
function pumpReady(){
 while(!locked&&readyActive<2&&readyQueue.length){const entry=readyQueue.shift(),epoch=readyEpoch;readyActive++;fetchReadySet(entry.setId).then(value=>{if(value&&entry.images&&epoch===readyEpoch&&!locked)warmCardImages(value.cards);}).finally(()=>{if(epoch===readyEpoch){readyActive--;pumpReady();}});}
}
function queueReady(setId,images=false){
 if(locked||typeof navigator==='undefined'||!readySetIds.includes(setId))return;const cached=readyPublic.get(setId);if(cached){if(images)warmCardImages(cached.cards);return;}
 const queued=readyQueue.find(entry=>entry.setId===setId);if(queued){queued.images=queued.images||images;return;}if(readyPending.has(setId)){if(images)readyPending.get(setId).then(value=>{if(value&&!locked)warmCardImages(value.cards);});return;}
 readyQueue.push({setId,images});pumpReady();
}
function scheduleReadySets(){
 if(locked||typeof navigator==='undefined'||navigator.connection?.saveData||/^(slow-)?2g$/.test(navigator.connection?.effectiveType||''))return;
 const epoch=readyEpoch,run=()=>{readyScheduled=null;if(epoch===readyEpoch&&!locked)readySetIds.forEach(setId=>queueReady(setId));};
 readyScheduled=typeof window.requestIdleCallback==='function'?{idle:window.requestIdleCallback(run,{timeout:2500})}:{timer:setTimeout(run,1200)};
}
function cancelReady(){readyEpoch++;if(readyScheduled?.idle!==undefined)window.cancelIdleCallback?.(readyScheduled.idle);if(readyScheduled?.timer!==undefined)clearTimeout(readyScheduled.timer);readyScheduled=null;for(const controller of readyControllers)controller.abort();for(const waiter of readyWaiters.splice(0))waiter.resolve(false);readyControllers.clear();readyPublic.clear();readyPending.clear();readyQueue=[];readyActive=0;}
const needsCurrentFinishes=id=>[PITCH_BLACK_SET_ID,CHAOS_RISING_SET_ID,JOURNEY_TOGETHER_SET_ID,PHANTASMAL_FLAMES_SET_ID,ASCENDED_HEROES_SET_ID].includes(id);
const isTrialBinder=b=>b?.type==='set'&&[TRIAL_SET_ID,PITCH_BLACK_SET_ID,CHAOS_RISING_SET_ID,JOURNEY_TOGETHER_SET_ID,PHANTASMAL_FLAMES_SET_ID,ASCENDED_HEROES_SET_ID,DELTA_REIGN_SET_ID].includes(b.setId)&&b.language==='en';
let ownershipEpoch=0,trialLoading=false,trialVersion=null;
const quickDrafts=new Map();let quickQueue=Promise.resolve();
const setLinks=(()=>{try{return JSON.parse($('collection-set-links')?.textContent||'{"matches":{}}').matches;}catch{return {};}})();
const validSetId=id=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id||'');
function setTargetFromQuery(search){const p=new URLSearchParams(search);if(!p.has('set'))return null;const id=p.get('set'),language=p.get('language');if(p.getAll('set').length!==1||p.getAll('language').length!==1||!validSetId(id)||!Object.hasOwn(languages,language))throw Error('This set link is invalid. Choose a set from Discover sets.');return {setId:id,languageCode:language};}
function shopHrefForBinder(b){if(b.type!=='set')return '';const found=Object.entries(setLinks).find(([,v])=>v.setId===b.setId&&v.language===b.language);return found?'/shop?set='+encodeURIComponent(found[0]):'';}
async function openFeaturedBinder(target){
 queueReady(target.setId,true);
 const matches=binders.filter(b=>b.type==='set'&&b.setId===target.setId&&b.language===target.languageCode&&!b.archived);
 if(matches.length===1)return openBinder(matches[0].id);
 return openSetCollection(target);
}
async function openSetCollection(target,auto=true){
 if(!validSetId(target?.setId)||!Object.hasOwn(languages,target?.languageCode))throw Error('Choose an exact set and language.');
 linkedTarget={setId:target.setId,languageCode:target.languageCode};linkedSet=null;showView('linked');const gen=generation;
 $('linked-set-title').textContent='Your set collection';$('linked-set-description').textContent='';$('linked-set-cover').innerHTML='';$('linked-binder-grid').replaceChildren();$('start-linked-binder').hidden=true;$('retry-linked-set').hidden=true;$('linked-set-state').textContent='Finding your saved binders…';status('Opening your collection…');
 try{
  const matches=[];let offset=0;
  for(let page=0;page<4;page++){
   const result=await api(query({setId:target.setId,language:target.languageCode,archived:0,offset}));if(gen!==generation||locked)return;
   if(!Array.isArray(result.binders)||result.binders.length>50||result.binders.some(b=>b.type!=='set'||b.setId!==target.setId||b.language!==target.languageCode||b.archived||matches.some(x=>x.id===b.id)))throw Error('Your matching binders could not be confirmed. Retry before creating another.');
   matches.push(...result.binders);if(!result.hasMore)break;
   if(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<=offset||page===3)throw Error('Your matching binder list is incomplete. Retry before creating another.');offset=result.nextOffset;
  }
  for(const b of matches){const i=binders.findIndex(old=>old.id===b.id);if(i>=0)binders[i]=b;else binders.push(b);}
  if(auto&&matches.length===1){await openBinder(matches[0].id);return;}
  $('linked-binder-grid').innerHTML=matches.map(b=>'<button class="binder" data-binder="'+esc(b.id)+'">'+binderCover(b)+'<span class="binder-caption"><strong>'+esc(b.name)+'</strong><span>'+esc(languages[b.language])+'</span></span></button>').join('');
  $('linked-set-state').textContent=matches.length?'Choose your saved binder.':'Preparing this set’s checklist…';
  const metadata=await api('/catalogue/sets/'+target.setId);if(gen!==generation||locked)return;
  const set=metadata.data?.set;if(!set||set.game!=='pokemon'||set.setId!==target.setId||set.languageCode!==target.languageCode)throw Error('The catalogue did not confirm this exact set and language.');
  linkedSet=set;$('linked-set-title').textContent=set.englishDisplayName||set.nativeName;$('linked-set-description').textContent=languages[set.languageCode]+' · '+(set.total??'Unconfirmed')+' cards';$('linked-set-cover').innerHTML=binderCover({setId:set.setId,language:set.languageCode,setName:set.englishDisplayName||set.nativeName,setCode:set.setCode});
  $('start-linked-binder').hidden=false;$('start-linked-binder').textContent=matches.length?'Start another binder':'Start binder';
  $('linked-set-state').textContent=matches.length?'Choose your saved binder, or start another.':'Start this set’s checklist, then mark the cards you own.';
  status(matches.length?'Your saved binders are ready.':'This set is ready to collect.');if(auto&&!matches.length)openCreate(set);
 }catch(e){if(gen===generation&&!locked){$('start-linked-binder').hidden=true;$('retry-linked-set').hidden=false;$('linked-set-state').textContent=matchesNotice();status(e.message,true);}throw e;}
}
function matchesNotice(){return 'The set or your existing binders could not be checked. Choose an available saved binder, or retry.';}

let checklistReference=null,checklistSeen=new Set(),checklistCards=new Map(),checklistExpected=null,seenCursors=new Set();
function status(message,error=false){$('collection-status').textContent=message;$('collection-status').classList.toggle('error',error);}
function lock(){locked=true;cancelReady();$('collection-main').setAttribute('aria-busy','false');$('collection-main').dataset.view='sign-in';$('collection-intro').hidden=false;ownershipEpoch++;accountGeneration++;quickDrafts.clear();trialLoading=false;generation++;modalGeneration++;binders=[];active=null;cardObjects.clear();$('collection-app').hidden=true;$('sign-in').hidden=false;$('account-name').textContent='Your account';$('account-email').textContent='';$('account-counts').textContent='';$('account-link').textContent='Sign in';document.querySelectorAll('dialog').forEach(d=>d.close());$('binder-grid').replaceChildren();$('linked-binder-grid').replaceChildren();linkedSet=null;$('collection-sign-in').href='/signin-with-chatgpt?return_to='+encodeURIComponent('/collection'+(location.search||'')+(location.hash||''));$('account-link').href=$('collection-sign-in').href;$('binder-cards').replaceChildren();$('new-binder').disabled=true;}
async function api(path='',body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000);try{const r=await fetch('/api/binders'+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(r.status===401){lock();throw Error('Sign in to open your private website collection.');}if(r.redirected||!r.headers.get('Content-Type')?.startsWith('application/json'))throw Error('Sign in again or retry.');const data=await r.json();if(!r.ok||body&&data.ok!==true)throw Object.assign(Error(data.error||'The change was not confirmed.'),{status:r.status});return data;}finally{clearTimeout(timer);}}
const query=o=>'?'+new URLSearchParams(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined));
async function act(button,fn){if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){status(e.name==='AbortError'?'The response timed out. Retry to confirm the same action.':e.message,true);}finally{button.disabled=false;}}
function showView(name){$('collection-app').hidden=false;$('collection-main').setAttribute('aria-busy','false');if(name!=='binder'){ownershipEpoch++;trialLoading=false;}generation++;searchGeneration++;view=name;$('collection-main').dataset.view=name;$('collection-intro').hidden=name!=='sets';$('discover-sets').hidden=true;document.querySelectorAll('[data-view-panel]').forEach(s=>s.hidden=s.dataset.viewPanel!==name);$('binder-detail').hidden=name!=='binder';document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===name?'page':'false'));$('account-link').setAttribute('aria-current',name==='account'?'page':'false');history.replaceState(null,'',(location.pathname||'/collection')+(name==='linked'?(location.search||''):'')+(name==='binder'?'#binder/'+active.id:'#'+name));}
async function loadAccount(){const gen=++accountGeneration;$('retry-account').hidden=true;$('account-counts').textContent='Checking your saved binders…';try{const data=await api('/account');if(gen!==accountGeneration||locked)return;if(!data.account||!data.collection)throw Error('Your account details could not be confirmed.');$('account-name').textContent=data.account.displayName||'Your account';$('account-email').textContent=data.account.email||'';$('account-email').hidden=!data.account.email;$('account-counts').textContent=data.collection.activeBinders+(data.collection.activeBinders===1?' saved binder · ':' saved binders · ')+data.collection.archivedBinders+' archived';}catch(e){if(gen===accountGeneration&&!locked){$('account-counts').textContent=e.message;$('retry-account').hidden=false;}throw e;}}
function renderBinders(){const list=binders.filter(b=>b.archived===$('show-archived').checked),key=JSON.stringify([$('show-archived').checked,list.map(b=>[b.id,b.name,b.type,b.setId,b.language,b.setName,b.setCode,b.setTotal,b.archived])]);if($('binder-grid').dataset.renderKey===key)return;$('binder-grid').dataset.renderKey=key;$('binder-grid').innerHTML=list.length?list.map(b=>'<button class="binder" data-binder="'+esc(b.id)+'">'+binderCover(b)+'<span class="binder-caption"><strong>'+esc(b.name)+'</strong><span>'+esc(languages[b.language])+' · '+esc(b.archived?'Archived':b.type==='set'?(b.setTotal??'—')+' cards':'Custom collection')+'</span></span></button>').join(''):'<div class="empty"><h3>'+($('show-archived').checked?'No archived binders.':'Your first binder starts here.')+'</h3><p>'+($('show-archived').checked?'Archived collections can be restored here.':'Discover a set to start collecting, or create a custom binder for your favourites.')+'</p></div>';}
async function loadBinders(reset=true){const gen=++generation;if(reset)libraryOffset=0;const r=await api(query({archived:$('show-archived').checked?'1':'0',offset:libraryOffset}));if(gen!==generation||locked)return;if(reset)binders=r.binders;else binders=[...binders,...r.binders.filter(b=>!binders.some(old=>old.id===b.id))];libraryOffset=r.nextOffset;$('more-binders').hidden=!r.hasMore;renderBinders();}
function setProgress(p){$('binder-progress').hidden=!p;if(!p)return;const valid=Number.isSafeInteger(p.total)&&p.total>0&&p.owned<=p.total;const percent=valid?Math.round(p.owned/p.total*100):0;$('progress-label').textContent=p.owned+' / '+(p.total??'unconfirmed')+' unique cards owned';$('progress-percent').textContent=valid?percent+'%':'Total pending';$('progress-bar').value=percent;$('progress-date').textContent=(p.source==='public-catalogue-snapshot'?(p.stale?'Cached checklist':'Checklist')+' captured ':'Set total checked ')+(p.checkedAt?new Date(p.checkedAt).toLocaleDateString('en-GB'):'date unavailable')+(p.source==='public-catalogue-snapshot'?'. Your saved quantities were checked now.':'. Multiple finishes count as one card here.');}
function binderHeader(data){active=data.binder;
 const cover=$('binder-cover-preview'),coverKey=JSON.stringify([active.type,active.setId,active.language,active.setName,active.setCode]);
 if(cover.dataset.coverKey!==coverKey){cover.innerHTML=binderCover(active);cover.dataset.coverKey=coverKey;}
 const logo=$('binder-set-logo'),url=active.type==='set'?setLogoUrl(active.setId,active.language):'';
 logo.hidden=!url;if(logo.dataset.sourceUrl!==url){logo.dataset.sourceUrl=url;logo.dataset.logoStatus=url?'available':'unavailable';logo.innerHTML=url?'<img src="'+esc(url)+'" alt="" decoding="async">':'';}
 const shopHref=shopHrefForBinder(active);$('binder-shop-link').hidden=!shopHref;$('binder-shop-link').href=shopHref||'/shop';const i=binders.findIndex(b=>b.id===active.id);if(i>=0)binders[i]=active;else binders.unshift(active);$('binder-title').textContent=active.name;$('binder-language').textContent=languages[active.language]+(active.archived?' · Archived':'');const description=active.type==='set'&&active.setName&&active.setName!==active.name?active.setName:'';$('binder-description').textContent=description;$('binder-description').hidden=!description;$('binder-summary').innerHTML=[['Cards',data.summary.uniqueCards],['Copies',data.summary.totalQuantity],['Variants',data.summary.totalVariants]].map(([l,n])=>'<div class="stat"><strong>'+n+'</strong><span>'+l+'</span></div>').join('');setProgress(data.progress);$('trial30-help').hidden=!isTrialBinder(active);$('checklist-tab').hidden=active.type!=='set';$('search-tab').disabled=active.archived;$('owned-tab').disabled=false;}
async function openBinder(id){
 ownershipEpoch++;trialLoading=false;searchGeneration++;const gen=++generation;status('Opening your binder…');
 const data=await api('/'+id);if(gen!==generation||locked)return;
 binderHeader(data);showView('binder');mode=active.type==='set'?'checklist':'owned';
 cardOffset=data.nextOffset;cardCursor=null;cardObjects.clear();modeButtons();
 if(mode==='checklist'){try{await loadChecklist(true);}catch(e){if(view==='binder'&&active?.id===id&&!locked)status(e.message,true);}return;}
 $('binder-cards').innerHTML=data.items.length?data.items.map(item=>ownedTile(item)).join(''):emptyCards('Your binder is ready.','Find a card, choose its finish and record how many you own.');
 $('more-cards').hidden=!data.hasMore;
 $('cards-context').textContent=active.archived?'This binder is archived. Restore it in Binder settings to make changes.':'Saved cards · quantities are specific to each printing and finish.';status('Collection loaded.');
}
async function refreshSavedQuantity(draft){
 const b=draft.binder,payload=draft.payload;
 if(active?.id!==b.id||view!=='binder')return;
 const gen=++generation,search=++searchGeneration;
 if(mode==='checklist'||mode==='owned')for(const [key,entry] of [...cardObjects]){
  if(entry.card.cardId!==payload.cardId||entry.item&&entry.item.variantId!==payload.variantId)continue;
  entry.ownedVariants=entry.ownedVariants.filter(v=>v.variantId!==payload.variantId);
  if(payload.quantity>0)entry.ownedVariants.push({variantId:payload.variantId,quantity:payload.quantity});
  if(entry.item)entry.item.quantity=payload.quantity;
  const count=entry.item?payload.quantity:entry.ownedVariants.reduce((sum,v)=>sum+v.quantity,0);
  const node=[...document.querySelectorAll('[data-card-key]')].find(n=>n.dataset.cardKey===key);
  if(!node)continue;
  if(entry.item&&!count){node.remove();cardObjects.delete(key);continue;}
  node.dataset.owned=String(count>0);if(node.hasAttribute('aria-pressed'))node.setAttribute('aria-pressed',String(count>0));let badge=node.querySelector('.owned-badge');
  if(!count)badge?.remove();else{if(!badge){badge=document.createElement('span');badge.className='owned-badge';node.querySelector('.card-art').append(badge);}badge.textContent=count+' owned';}
 }
 try{const data=await api('/'+b.id);if(gen===generation&&search===searchGeneration&&active?.id===b.id&&view==='binder'&&!locked){if(mode==='checklist'&&checklistReference?.binderId===b.id)data.progress={...checklistReference,owned:data.summary.uniqueCards,total:checklistReference.total!==null&&data.summary.uniqueCards<=checklistReference.total?checklistReference.total:null};binderHeader(data);syncQuickControls();status('Quantity saved.');}}
 catch{if(gen===generation&&!locked)status('Quantity saved. Reopen the binder to refresh its totals.',true);}
}

function syncQuickControls(){
 for(const button of document.querySelectorAll('[data-own-card]')){
  const entry=cardObjects.get(button.dataset.ownCard),draft=active&&quickDrafts.get(active.id+':'+button.dataset.ownCard),owned=entry?.ownedVariants?.some(v=>v.quantity>0);
  button.disabled=locked||trialLoading||!!draft?.sending||!!active?.archived;
  button.textContent=draft?.sending?'Saving…':owned?'Owned ✓':draft?.error?'Retry save':'Mark owned';button.dataset.owned=String(!!owned);button.setAttribute('aria-label',button.textContent+' · '+(entry?.card.names?.englishDisplay||entry?.card.names?.native||'card'));
  const article=button.closest('.trial-card'),tile=article?.querySelector('.card-tile'),feedback=article?.querySelector('.own-status');
  if(tile){tile.disabled=locked||trialLoading||!!draft?.sending;tile.setAttribute('aria-pressed',String(!!owned));tile.setAttribute('aria-label',(owned?'Edit owned card: ':'Mark owned: ')+(entry?.card.names?.englishDisplay||entry?.card.names?.native||'card'));}if(feedback)feedback.textContent=draft?.error||'';
 }
}
function tapCard(key){
 if(isTrialBinder(active)&&mode==='checklist')return markOwned(key);
 return openCard(key);
}
function markOwned(key){
 const entry=cardObjects.get(key),b=active;if(locked||trialLoading||!isTrialBinder(b)||b.archived||mode!=='checklist'||!entry)return Promise.resolve();
 if(needsCurrentFinishes(b.setId))return openCard(key).catch(e=>status(e.message,true));
 if(entry.ownedVariants.some(v=>v.quantity>0)||entry.card.variants?.length!==1||!entry.card.variants[0].canonicalId)return openCard(key).catch(e=>status(e.message,true));
 const mapKey=b.id+':'+key;let draft=quickDrafts.get(mapKey);if(draft?.sending)return quickQueue;
 if(!draft){draft={id:newId(),payload:null,error:'',sending:false};quickDrafts.set(mapKey,draft);}
 const epoch=ownershipEpoch,current=()=>!locked&&ownershipEpoch===epoch&&active?.id===b.id&&view==='binder'&&mode==='checklist';
 draft.sending=true;draft.error='';syncQuickControls();
 quickQueue=quickQueue.catch(()=>{}).then(async()=>{
  try{
   if(!current())return;
   if(!draft.payload){
    const state=await api('/'+b.id+'/items'+query({cardId:entry.card.cardId,variantId:entry.card.variants[0].variantId}));if(!current())return;
    if(state.binder?.id!==b.id||!isTrialBinder(state.binder)||!Number.isSafeInteger(state.quantity)||state.quantity<0)throw Error('The saved quantity could not be confirmed.');
    if(state.quantity>0){quickDrafts.delete(mapKey);await refreshSavedQuantity({binder:state.binder,payload:{cardId:entry.card.cardId,variantId:entry.card.variants[0].variantId,quantity:state.quantity}});return;}
    draft.payload={id:draft.id,expectedRevision:state.binder.revision,cardId:entry.card.cardId,variantId:entry.card.variants[0].variantId,quantity:1};
   }
   if(!draft.confirmed){await api('/'+b.id+'/items',draft.payload);draft.confirmed=true;}
   const saved=await api('/'+b.id+'/items'+query({cardId:draft.payload.cardId,variantId:draft.payload.variantId}));
   if(saved.binder?.id!==b.id||!isTrialBinder(saved.binder)||!Number.isSafeInteger(saved.quantity)||saved.quantity<0)throw Error('The latest saved quantity could not be confirmed.');
   quickDrafts.delete(mapKey);if(current())await refreshSavedQuantity({binder:b,payload:{...draft.payload,quantity:saved.quantity}});
  }catch(e){
   if(e.status===400||e.status===409){draft.payload=null;draft.confirmed=false;draft.id=newId();}
   draft.error=e.status===409?'Your collection changed. Tap to retry.':draft.confirmed?'Saved. Tap to refresh the latest quantity.':'Save not confirmed. Tap to retry the same change.';
   if(current())status(e.message,true);
  }finally{draft.sending=false;if(!current()&&!draft.payload)quickDrafts.delete(mapKey);if(current())syncQuickControls();}
 });return quickQueue;
}
async function loadChecklist(reset=true){
 if(!isTrialBinder(active)||mode!=='checklist')return loadCards(reset);
 const epoch=ownershipEpoch,id=active.id,stagedRows=reset?new Map():null;let terminal=false;
 trialLoading=true;syncQuickControls();$('binder-cards').setAttribute('aria-busy','true');
 try{
  for(let page=0;page<20;page++){
   const result=await loadCards(reset&&page===0,stagedRows);if(epoch!==ownershipEpoch||active?.id!==id||mode!=='checklist'||locked||!result)return;
   if(!result.hasMore){terminal=true;status(checklistExpected!==null&&checklistSeen.size===checklistExpected?'All '+checklistSeen.size+' cards loaded. Mark the ones you own.':'The catalogue checklist is incomplete. Your saved cards are safe.');return;}
   $('cards-context').textContent='Loading checklist · '+checklistSeen.size+' / '+(checklistExpected??'unconfirmed')+' cards…';
   status('Loading the full set · '+checklistSeen.size+' / '+(checklistExpected??'unconfirmed')+' cards…');
  }
  status('More checklist pages remain. Continue loading below.');
 }finally{if(epoch===ownershipEpoch&&active?.id===id&&mode==='checklist'&&!locked){
  if(stagedRows?.size){
   const cards=[...checklistCards.values()].filter(card=>stagedRows.has(card.cardId)).sort((a,b)=>String(a.collectorNumber?.sortKey||a.collectorNumber?.value||'').localeCompare(String(b.collectorNumber?.sortKey||b.collectorNumber?.value||''),'en',{numeric:true})||a.cardId.localeCompare(b.cardId));
   const context=$('cards-context').textContent;$('cards-context').textContent='Loading card artwork…';await warmCardImages(cards);
   if(epoch===ownershipEpoch&&active?.id===id&&mode==='checklist'&&!locked){
    cardObjects.clear();$('binder-cards').innerHTML=cards.map(card=>{const row=stagedRows.get(card.cardId);return tile(card,row.ownedQuantity,null,row.ownedVariants);}).join('');
    $('cards-context').textContent=terminal?context:'Checklist partially loaded: '+cards.length+' / '+(checklistExpected??'unconfirmed')+' cards. Continue loading below.';
    $('more-cards').hidden=!cardCursor;
   }
  }else if(!stagedRows){const tiles=[...$('binder-cards').querySelectorAll('.trial-card')].sort((a,b)=>a.dataset.printingSort.localeCompare(b.dataset.printingSort,'en',{numeric:true}));if(tiles.length)$('binder-cards').append(...tiles);}
  if(epoch===ownershipEpoch&&active?.id===id&&mode==='checklist'&&!locked){$('binder-cards').setAttribute('aria-busy','false');trialLoading=false;syncQuickControls();}
 }}
}

const emptyCards=(title,copy)=>'<div class="empty"><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p></div>';
const loadingCards=()=>'<div class="card-loading-art" aria-hidden="true">'+$('stackr-loading-template').innerHTML+'</div>';
function filterDeltaCards(){
 const normal=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=normal($('delta-card-query').value.trim()),number=/^\d{1,3}(?:\/103)?$/.test(q)?q.split('/')[0].padStart(3,'0'):null;let count=0;
 for(const row of document.querySelectorAll('#delta-card-list [data-list-number]')){row.hidden=number?row.dataset.listNumber!==number:!normal(row.dataset.deltaSearch).includes(q);if(!row.hidden)count++;}
 for(const group of document.querySelectorAll('[data-delta-group]'))group.hidden=![...group.querySelectorAll('[data-list-number]')].some(row=>!row.hidden);
 $('delta-result-count').textContent=count+' '+(count===1?'card':'cards');
}
function openDeltaCard(button){
 const image=button.querySelector('img'),src=image?.getAttribute('src');if(!/^\/media\/cards\/delta-reign-en-\d{3}--[a-f0-9]{12}$/.test(src||''))return;
 $('delta-card-title').textContent=button.getAttribute('aria-label').replace(/^View /,'');$('delta-card-image').src=src;$('delta-card-image').alt=image.alt;$('delta-card-dialog').showModal();
}
function openDeltaList(){showView('delta-list');status('');window.scrollTo?.({top:0,left:0,behavior:'instant'});}
function tile(card,quantity=null,item=null,ownedVariants=[]){const variant=item?{variantId:item.variantId}:card.variants?.find(v=>v.variantId===card.defaultVariantId)||card.variants?.[0],name=card.names?.englishDisplay||card.names?.native||'Card',native=card.names?.native||'',image=item?safeImage(item.imageUrl):imageFor(card,variant),key=card.cardId+':'+(item?.variantId||'catalogue');cardObjects.set(key,{card,item,ownedVariants});const selection=isTrialBinder(active)&&mode==='checklist',markup='<button class="card-tile"'+(selection?' aria-pressed="'+String(quantity>0)+'" aria-label="'+esc((quantity>0?'Edit owned card: ':'Mark owned: ')+name)+'"':'')+(selection&&trialLoading?' disabled':'')+(quantity===null?'':' data-owned="'+String(quantity>0)+'"')+' data-card-key="'+esc(key)+'"><span class="card-art">'+(image?'<img src="'+esc(image)+'" alt="'+esc(native||name)+'" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="image-missing" hidden>Image unavailable</span>':'<span class="image-missing">Image unavailable</span>')+(quantity>0?'<span class="owned-badge">'+quantity+' owned</span>':'')+'</span><strong>'+esc(name)+'</strong><small>'+esc((card.collectorNumber?.value||'')+' · '+(languages[card.languageCode]||card.languageCode))+'</small>'+(native&&native!==name?'<small>'+esc(native)+'</small>':'')+(item?'<small>'+esc(item.finishCode||item.variantCode)+'</small>':'')+'</button>';if(!isTrialBinder(active)||mode!=='checklist')return markup;const label=quantity>0?'Owned ✓':'Mark owned',order=card.collectorNumber?.sortKey||card.collectorNumber?.value||'';return '<article class="trial-card" data-printing-sort="'+esc(order)+'">'+markup+'<button class="own-toggle" data-own-card="'+esc(key)+'" data-owned="'+String(quantity>0)+'"'+(active.archived||trialLoading?' disabled':'')+'>'+label+'</button><p class="own-status" data-own-status="'+esc(key)+'" role="status"></p></article>';}
function ownedTile(item){const card={cardId:item.cardId,languageCode:item.language,set:{setId:item.setId},names:{native:item.nativeName,englishDisplay:item.englishName},collectorNumber:{value:item.collectorNumber},variants:[{variantId:item.variantId,variantCode:item.variantCode,finishCode:item.finishCode,variantLabel:item.variantCode,finishLabel:item.finishCode}],defaultVariantId:item.variantId};return tile(card,item.quantity,item,[{variantId:item.variantId,quantity:item.quantity}]);}
function modeButtons(){for(const m of ['owned','checklist','search'])$(m+'-tab').setAttribute('aria-pressed',String(mode===m));$('card-search').hidden=mode!=='search';}
function nextCursor(meta,prior){const page=meta?.pagination;if(!page||!Object.hasOwn(page,'nextCursor'))throw Error('The catalogue did not confirm whether more cards are available.');const next=page.nextCursor;if(next!==null&&(typeof next!=='string'||!next||next===prior||seenCursors.has(next)))throw Error('The catalogue repeated a page. Your saved cards are safe.');if(next)seenCursors.add(next);return next;}
function checklistMarkup(rows){
 const ownership=new Map(rows.map(row=>[row.card.cardId,row])),incoming=mergeCataloguePrintings(rows.map(row=>row.card));let markup='';
 for(const card of incoming){
  const previous=checklistCards.get(card.cardId),merged=mergeCataloguePrinting(previous,card),row=ownership.get(card.cardId);
  checklistCards.set(card.cardId,merged);checklistSeen.add(card.cardId);
  const next=tile(merged,row.ownedQuantity,null,row.ownedVariants);
  if(!previous){markup+=next;continue;}
  const node=[...document.querySelectorAll('[data-card-key]')].find(n=>n.dataset.cardKey===card.cardId+':catalogue');
  if(node)(node.closest('.trial-card')||node).outerHTML=next;
 }
 return markup;
}
async function checklistPage(id,current,attempt=0){
 if(current||!isTrialBinder(active))return api('/'+id+'/checklist'+query({limit:50,cursor:current}));
 const setId=active.setId,revision=active.revision,epoch=ownershipEpoch,gen=searchGeneration,isCurrent=()=>!locked&&epoch===ownershipEpoch&&gen===searchGeneration&&active?.id===id&&mode==='checklist';
 const cached=await fetchReadySet(setId);if(!isCurrent())return null;if(!cached)throw Error('The complete public checklist could not be confirmed. Retry this binder.');
 const owned=new Map(),seen=new Set(),knownCards=new Set(cached.cards.map(card=>card.cardId));let cursor=null,total=null,progress=null;
 try{for(let page=0;page<200;page++){
  const data=await api('/'+id+'/checklist'+query({paged:1,limit:50,snapshot:cached.ready.snapshotId,expectedRevision:revision,cursor}));if(!isCurrent())return null;
  const pagination=data.meta?.pagination,offset=seen.size;
  if(!sameReady(cached.ready,data.ready)||data.ready?.complete!==true||data.binderRevision!==revision||!Array.isArray(data.ownership)||data.ownership.length>50||!Number.isSafeInteger(data.ownershipTotal)||data.ownershipTotal<0||data.ownershipTotal>10000||total!==null&&data.ownershipTotal!==total||pagination?.limit!==50||pagination.offset!==offset||data.ownership.length!==Math.min(50,data.ownershipTotal-offset))throw Error('The checklist snapshot or binder revision changed. Reopen this binder to refresh it.');
  if(!data.progress||!Number.isSafeInteger(data.progress.owned)||data.progress.owned<0||data.progress.total!==cached.ready.total||data.progress.referenceConsistent!==true||data.progress.catalogueVersionId!==cached.ready.catalogueVersionId||data.progress.checkedAt!==cached.ready.capturedAt||data.progress.capturedAt!==cached.ready.capturedAt||data.progress.source!=='public-catalogue-snapshot'||progress&&['owned','total','checkedAt','catalogueVersionId','referenceConsistent'].some(key=>progress[key]!==data.progress[key]))throw Error('Your saved quantities and checklist reference could not be confirmed. Reopen this binder.');
  total=data.ownershipTotal;progress=data.progress;
  for(const item of data.ownership){const key=item.cardId+':'+item.variantId;if(typeof item.cardId!=='string'||!knownCards.has(item.cardId)||typeof item.variantId!=='string'||!item.variantId||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>9999||seen.has(key))throw Error('Your saved quantities could not be matched to this checklist. Review Owned cards before retrying.');seen.add(key);if(!owned.has(item.cardId))owned.set(item.cardId,[]);owned.get(item.cardId).push({variantId:item.variantId,quantity:item.quantity});}
  const expected=seen.size<total?String(seen.size):null;if(pagination.nextCursor!==expected)throw Error('Your saved quantity pages were incomplete. Reopen this binder.');
  cursor=pagination.nextCursor;if(cursor===null){if(seen.size!==total||owned.size!==progress.owned)throw Error('Your saved quantity totals could not be confirmed. Reopen this binder.');return {cards:cached.cards.map(card=>({card,ownedQuantity:(owned.get(card.cardId)||[]).reduce((sum,row)=>sum+row.quantity,0),ownedVariants:owned.get(card.cardId)||[]})),ready:data.ready,progress,binderRevision:revision,meta:{pagination:{nextCursor:null}}};}
 }}catch(error){if(error.status===409&&isCurrent()){readyPublic.delete(setId);if(attempt===0){const latest=await api('/'+id);if(!isCurrent())return null;binderHeader(latest);status('Your binder changed. Refreshing its checklist…');return checklistPage(id,null,1);}}throw error;}
 throw Error('Your saved quantity pages exceeded the binder limit. Reopen this binder.');
}
async function loadCards(reset,stagedRows=null){if(!active)return;const id=active.id,gen=++searchGeneration;if(reset){cardOffset=0;cardCursor=null;cardObjects.clear();checklistReference=null;trialVersion=null;checklistSeen=new Set();checklistCards=new Map();seenCursors=new Set();$('binder-cards').innerHTML=stagedRows?loadingCards():emptyCards('Loading cards…','Reading the StackR catalogue.');$('cards-context').textContent='Loading this set’s checklist…';$('more-cards').hidden=true;}status('Loading cards…');
 let markup='',hasMore=false;
 try{if(mode==='owned'){const data=await api('/'+id+query({offset:cardOffset}));if(gen!==searchGeneration||id!==active?.id||locked)return;binderHeader(data);markup=data.items.map(ownedTile).join('');cardOffset=data.nextOffset;hasMore=data.hasMore;}
 else if(mode==='checklist'){const current=cardCursor,data=await checklistPage(id,current);if(gen!==searchGeneration||id!==active?.id||locked)return;if(isTrialBinder(active)&&checklistReference&&checklistReference.total!==data.progress.total)throw Error('The set total changed while loading. Reopen this binder to refresh the checklist.');setProgress(data.progress);checklistReference={binderId:id,...data.progress};checklistExpected=data.progress.total;const rows=data.cards;if(isTrialBinder(active)){const versions=new Set(rows.map(row=>row.card.catalogueVersionId).filter(Boolean));if(versions.size>1||trialVersion&&versions.size&&![...versions].includes(trialVersion))throw Error('The set catalogue changed while loading. Reopen this binder to load a consistent checklist.');if(versions.size)trialVersion=[...versions][0];}markup=checklistMarkup(rows);if(Number.isSafeInteger(checklistExpected)&&checklistSeen.size>checklistExpected)throw Error('The catalogue returned more cards than the confirmed set total. Reopen this binder to retry.');cardCursor=nextCursor(data.meta,current);if(stagedRows)for(const row of rows)stagedRows.set(row.card.cardId,row);hasMore=!!cardCursor;$('cards-context').textContent=hasMore?checklistSeen.size+' checklist cards loaded. Load the next page to continue.':checklistExpected!==null&&checklistSeen.size===checklistExpected?'Complete checklist loaded: '+checklistSeen.size+' cards.':'Catalogue checklist incomplete: '+checklistSeen.size+' returned; '+(checklistExpected??'unconfirmed')+' expected. Your ownership is still saved.';}
 else{const current=cardCursor,data=await api('/catalogue/search'+query({q:$('card-query').value.trim(),language:active.language,limit:50,cursor:current}));if(gen!==searchGeneration||id!==active?.id||locked)return;const cards=(data.data.results||[]).filter(r=>r.type==='card'&&r.card).map(r=>r.card).filter(c=>active.type!=='set'||c.set?.setId===active.setId);markup=cards.map(c=>tile(c)).join('');cardCursor=nextCursor(data.meta,current);hasMore=!!cardCursor;$('cards-context').textContent='Exact-language results'+(active.type==='set'?' matching this set':'')+'. Choose a card to select its finish.';}
 if(!stagedRows){if(reset)$('binder-cards').innerHTML=markup||emptyCards('No matching cards on this page.',mode==='search'?'Try another name or number, or continue to the next page.':'Find cards to add to this binder.');else $('binder-cards').insertAdjacentHTML('beforeend',markup);}$('more-cards').hidden=!!stagedRows||!hasMore;syncQuickControls();status('Cards loaded.');return {hasMore};}catch(e){if(gen===searchGeneration&&id===active?.id&&!locked&&reset){$('binder-cards').innerHTML=emptyCards('Cards could not load.','Your saved collection is safe. Retry this tab or your search.');$('more-cards').hidden=true;}throw e;}}
function setMatches(set,q){const normal=v=>String(v||'').normalize('NFKC').toLocaleLowerCase();return !q||normal([set.englishDisplayName,set.nativeName,set.setCode].join(' ')).includes(normal(q));}
function renderSets(){
 if(setsLoading){$('set-result-count').textContent='Discovering sets · '+sets.length+' found…';return;}
 const q=$('set-query').value.trim(),sorted=[...sets].filter(s=>setMatches(s,q)).sort((a,b)=>(b.releaseDate||'').localeCompare(a.releaseDate||'')||(a.englishDisplayName||a.nativeName).localeCompare(b.englishDisplayName||b.nativeName));
 $('set-result-count').textContent=sorted.length+(q?' matches from '+sets.length+' sets':' sets')+' loaded'+' · newest first'+(setsLoading?' · discovering more…':setCursor?' · more sets available':'');
 $('set-grid').innerHTML=sorted.map(s=>{
  return '<button class="set-card" '+('data-create-set="'+esc(s.setId)+'"')+'>'+binderCover({setId:s.setId,language:s.languageCode,setName:s.englishDisplayName||s.nativeName,setCode:s.setCode},'set-cover')+'<span class="set-info"><strong class="set-name">'+esc(s.englishDisplayName||s.nativeName)+'</strong>'+(s.englishDisplayName&&s.nativeName!==s.englishDisplayName?'<span class="set-native">'+esc(s.nativeName)+'</span>':'')+'<span>'+esc(languages[s.languageCode])+' · '+esc(s.total===null||s.total===undefined?'Card total pending':s.total+' cards')+'</span><small>'+esc(s.releaseDate?.slice(0,10)||'Release date unavailable')+'</small><b>'+'Collect this set'+' <span aria-hidden="true">→</span></b></span></button>';
 }).join('')||emptyCards(setsLoading?'Looking for your set…':'No matching sets loaded.',setCursor||setsLoading?'More catalogue pages are available. Try the set name or code.':'Try another name or printed language.');
}
async function loadSets(reset=true){
 const gen=++generation;$('retry-sets').hidden=true;
 if(reset){sets=[];setCursor=null;$('set-grid').innerHTML=emptyCards('Discovering sets…','Finding the cards you can collect.');$('more-sets').hidden=true;}
 setLanguage=$('set-language').value;status('Discovering sets…');setsLoading=true;const visited=new Set();let pages=0;
 try{do{
  const cursor=setCursor,r=await api('/catalogue/sets'+query({language:setLanguage,limit:50,cursor}));
  if(gen!==generation||locked)return;
  const list=r.data.sets;if(!Array.isArray(list))throw Error('The set catalogue could not be read. Retry in a moment.');
  sets=[...sets,...list.filter(s=>!sets.some(old=>old.setId===s.setId))];
  const next=r.meta?.pagination?.nextCursor;
  if(next!==null&&(typeof next!=='string'||!next||next===cursor||visited.has(next)))throw Error('The catalogue repeated a set page. Your binders are safe.');
  if(next)visited.add(next);setCursor=next;pages++;setsLoading=!!setCursor&&reset&&pages<20;
  $('set-result-count').textContent='Discovering sets · '+sets.length+' found…';$('more-sets').hidden=!setCursor||setsLoading;
 }while(setsLoading);
 renderSets();status('Choose a set to start collecting.');
 }catch(e){if(gen!==generation||locked)return;setsLoading=false;renderSets();$('retry-sets').hidden=false;$('more-sets').hidden=true;if(!sets.length){$('set-result-count').textContent='Set list unavailable.';$('set-grid').innerHTML=emptyCards('Sets could not load.','Retry in a moment. Your saved binders are safe.');}throw e;}
 finally{if(gen===generation)setsLoading=false;}
}

function openCreate(set=null){$('create-cover-preview').hidden=!set;$('create-cover-preview').innerHTML=set?binderCover({setId:set.setId,language:set.languageCode,setName:set.englishDisplayName||set.nativeName,setCode:set.setCode}):'';modalGeneration++;resetForm($('create-form'),set?'Start binder':'Create binder');$('create-title').textContent=set?'Start your binder':'Create a custom binder';$('create-language-label').hidden=!!set;createDraft={id:newId(),binderId:newId(),set};$('create-form').reset();$('create-form').elements.language.value=set?.languageCode||'en';$('create-form').elements.language.disabled=!!set;$('create-form').elements.name.value=set?.englishDisplayName||set?.nativeName||'';$('create-set-note').textContent=set?languages[set.languageCode]+' · Loads this set’s cards into a checklist. Mark the ones you own.':'A custom binder for your selected cards. Discover sets to start a set checklist.';$('create-form').querySelector('.dialog-status').textContent='';$('create-dialog').showModal();}
async function refreshCurrentFinishes(source,key){
 const gen=++modalGeneration,epoch=ownershipEpoch,originView=view,binderId=active?.id;
 const data=await api('/catalogue/cards/'+encodeURIComponent(source.card.cardId));
 if(gen!==modalGeneration||epoch!==ownershipEpoch||originView!==view||binderId!==active?.id||locked||cardObjects.get(key)!==source)return false;
 const card=data.data?.card;
 if(!card||card.cardId!==source.card.cardId||card.set?.setId!==source.card.set?.setId||card.languageCode!==source.card.languageCode||!Array.isArray(card.variants)||!card.variants.length||card.variants.some(v=>!v.variantId||!v.canonicalId))throw Error('The current printing and finishes could not be confirmed. Your saved cards are unchanged.');
 const current=new Set(card.variants.map(v=>v.variantId));
 if((source.ownedVariants||[]).some(v=>v.quantity>0&&!current.has(v.variantId))||source.item&&!current.has(source.item.variantId))throw Error('A saved finish is not in the current catalogue. Review Owned cards before changing it; your saved quantity is unchanged.');
 source.card=card;return true;
}
async function openCard(key){const source=cardObjects.get(key);if(!source)return;if(needsCurrentFinishes(source.card.set?.setId)&&!await refreshCurrentFinishes(source,key))return;const eligible=binders.filter(b=>!b.archived&&b.language===source.card.languageCode&&(b.type==='custom'||b.setId===source.card.set?.setId));if(!eligible.length){status('Create a binder in '+languages[source.card.languageCode]+' first. For another existing binder, load it from My binders.',true);return;}modalGeneration++;cardDraft={id:newId(),source,payload:null};const f=$('card-form');resetForm(f,'Save quantity');f.querySelector('.dialog-status').textContent='';$('card-dialog-name').textContent=source.card.names.englishDisplay||source.card.names.native;$('card-dialog-identity').textContent=(source.card.collectorNumber?.value||'')+' · '+languages[source.card.languageCode];$('target-binder').innerHTML=eligible.map(b=>'<option value="'+b.id+'">'+esc(b.name)+'</option>').join('');if(active&&eligible.some(b=>b.id===active.id))$('target-binder').value=active.id;$('card-variant').innerHTML=(source.card.variants||[]).map(v=>'<option value="'+esc(v.variantId)+'">'+esc(v.variantLabel||v.variantCode)+' · '+esc(v.finishLabel||v.finishCode||'Finish not recorded')+'</option>').join('');$('card-variant').value=source.item?.variantId||source.card.defaultVariantId||source.card.variants?.[0]?.variantId;const image=source.item?.imageUrl||imageFor(source.card,source.card.variants?.find(v=>v.variantId===$('card-variant').value));$('card-dialog-image').src=safeImage(image);$('card-dialog-image').hidden=!safeImage(image);$('card-dialog').showModal();await populateQuantity();}
async function populateQuantity(){const draft=cardDraft;if(!draft||draft.payload)return;draft.binder=null;const gen=++modalGeneration,f=$('card-form'),button=f.querySelector('button.primary');button.disabled=true;try{const b=$('target-binder').value,v=$('card-variant').value,card=cardDraft.source.card;if(!b||!v)throw Error('Select a binder and exact finish.');const result=await api('/'+b+'/items'+query({cardId:card.cardId,variantId:v}));if(gen!==modalGeneration||!$('card-dialog').open||locked)return;cardDraft.binder=result.binder;cardDraft.quantity=result.quantity;cardDraft.payload=null;cardDraft.id=newId();f.elements.quantity.value=result.quantity||1;f.querySelector('.dialog-status').textContent=result.quantity+' currently owned in this binder.';}catch(e){if(gen===modalGeneration&&draft===cardDraft)f.querySelector('.dialog-status').textContent=e.message;}finally{if(gen===modalGeneration&&draft===cardDraft)button.disabled=!draft.binder;}}
document.addEventListener('visibilitychange',()=>$('collection-main').classList.toggle('loading-paused',document.hidden));
document.addEventListener('error',e=>{if(e.target.matches?.('.binder-title-logo img'))e.target.closest('.binder-title-logo').dataset.logoStatus='unavailable';if(e.target.matches?.('.set-logo')){const cover=e.target.closest('.collector-cover');e.target.hidden=true;if(cover){cover.querySelector('.cover-fallback').hidden=false;cover.dataset.logoStatus='unavailable';}}},true);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('journey-together-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:JOURNEY_TOGETHER_SET_ID,languageCode:'en'})));
$('phantasmal-flames-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:PHANTASMAL_FLAMES_SET_ID,languageCode:'en'})));
$('ascended-heroes-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:ASCENDED_HEROES_SET_ID,languageCode:'en'})));
$('delta-reign-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:DELTA_REIGN_SET_ID,languageCode:'en'})));
$('delta-card-query').addEventListener('input',filterDeltaCards);
$('trial30-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:TRIAL_SET_ID,languageCode:'en'})));
$('pitch-black-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:PITCH_BLACK_SET_ID,languageCode:'en'})));
$('chaos-rising-open').addEventListener('click',e=>act(e.currentTarget,()=>openFeaturedBinder({setId:CHAOS_RISING_SET_ID,languageCode:'en'})));
for(const [id,setId] of [['trial30-open',TRIAL_SET_ID],['pitch-black-open',PITCH_BLACK_SET_ID],['chaos-rising-open',CHAOS_RISING_SET_ID],['journey-together-open',JOURNEY_TOGETHER_SET_ID],['phantasmal-flames-open',PHANTASMAL_FLAMES_SET_ID],['ascended-heroes-open',ASCENDED_HEROES_SET_ID],['delta-reign-open',DELTA_REIGN_SET_ID]])for(const event of ['pointerenter','focus'])$(id).addEventListener(event,()=>queueReady(setId,true));
$('account-link').addEventListener('click',e=>{if(locked)return;e.preventDefault();showView('account');status('');loadAccount().catch(e=>status(e.message,true));});$('retry-account').addEventListener('click',e=>act(e.target,loadAccount));
$('start-linked-binder').addEventListener('click',()=>{if(linkedSet)openCreate(linkedSet);});$('retry-linked-set').addEventListener('click',e=>act(e.target,()=>openSetCollection(linkedTarget)));
$('retry-collection').addEventListener('click',e=>act(e.target,start));$('new-binder').addEventListener('click',()=>openCreate());$('retry-sets').addEventListener('click',e=>act(e.target,()=>loadSets(!sets.length)));$('set-query').addEventListener('input',renderSets);$('discover-sets').addEventListener('click',()=>{showView('sets');status('');$('trial30-open').focus();});$('back-binders').addEventListener('click',()=>{active=null;showView('library');status('');loadBinders().catch(e=>status(e.message,true));});
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>{showView(b.dataset.view);status('');if(view==='library')loadBinders().catch(e=>status(e.message,true));if(view==='sets')status('');}));
$('show-archived').addEventListener('change',()=>loadBinders().catch(e=>status(e.message,true)));$('more-binders').addEventListener('click',e=>act(e.target,()=>loadBinders(false)));$('set-language').addEventListener('change',()=>loadSets().catch(e=>status(e.message,true)));$('more-sets').addEventListener('click',e=>act(e.target,()=>loadSets(false)));
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.deltaCard){openDeltaCard(b);return;}if(b.dataset.ownCard){markOwned(b.dataset.ownCard);return;}if(b.dataset.binder)openBinder(b.dataset.binder).catch(e=>status(e.message,true));if(b.dataset.createSet){const selected=sets.find(s=>s.setId===b.dataset.createSet);if(selected)openSetCollection(selected).catch(e=>status(e.message,true));}if(b.dataset.cardKey)tapCard(b.dataset.cardKey).catch(e=>status(e.message,true));});
for(const m of ['owned','checklist','search'])$(m+'-tab').addEventListener('click',()=>{mode=m;searchGeneration++;modeButtons();if(m==='search'){$('binder-cards').innerHTML=emptyCards('Find the card you own.','Search in '+languages[active.language]+', then choose the exact finish.');$('more-cards').hidden=true;$('card-query').focus();}else loadChecklist(true).catch(e=>status(e.message,true));});
$('card-search').addEventListener('submit',e=>{e.preventDefault();act(e.submitter,()=>loadCards(true));});$('more-cards').addEventListener('click',e=>act(e.target,()=>loadChecklist(false)));
function freezeFields(form,disabled){form.querySelectorAll('input,select,textarea').forEach(field=>field.disabled=disabled);}
function resetForm(form,label){freezeFields(form,false);const button=form.querySelector('button.primary');button.disabled=false;button.textContent=label;}
async function saveDraft(draft,getCurrent,form,dialog,path,makePayload,onSuccess){
 if(!draft||draft.sending||!dialog.open)return;
 const epoch=modalGeneration,button=form.querySelector('button.primary'),label=button.textContent;
 const isCurrent=()=>!locked&&getCurrent()===draft&&modalGeneration===epoch&&dialog.open;
 if(!draft.payload)draft.payload=makePayload();
 draft.sending=true;freezeFields(form,true);button.disabled=true;button.textContent='Saving…';
 form.querySelector('.dialog-status').textContent='Saving this exact change. Keep this form open to confirm it.';
 try{const result=await api(path,draft.payload);if(isCurrent())await onSuccess(result,draft);}
 catch(err){if(!isCurrent())return;
  if(err.status===400){draft.payload=null;draft.id=newId();freezeFields(form,false);if(form.id==='create-form'&&draft.set)form.elements.language.disabled=true;button.textContent=label;button.disabled=false;form.querySelector('.dialog-status').textContent=err.message;}
  else if(err.status===409){button.textContent='Reopen to refresh';button.disabled=true;form.querySelector('.dialog-status').textContent=err.message+' Close this form and reopen it to load the latest saved state.';}
  else{button.textContent='Retry same change';button.disabled=false;form.querySelector('.dialog-status').textContent='The result is not confirmed. Retry the same unchanged details, or close and reopen to check what was saved. '+(err.name==='AbortError'?'The response timed out.':err.message);}
 }finally{draft.sending=false;}
}
$('create-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target,draft=createDraft;saveDraft(draft,()=>createDraft,f,$('create-dialog'),'',()=>({id:draft.id,binderId:draft.binderId,name:f.elements.name.value,type:draft.set?'set':'custom',language:draft.set?.languageCode||f.elements.language.value,...(draft.set?{setId:draft.set.setId}:{})}),async r=>{$('create-dialog').close();$('show-archived').checked=false;status('Binder created and saved privately.');await openBinder(r.binder.id);});});
$('target-binder').addEventListener('change',populateQuantity);$('card-variant').addEventListener('change',populateQuantity);
$('card-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target,draft=cardDraft;if(!draft?.binder)return;const b=draft.binder;saveDraft(draft,()=>cardDraft,f,$('card-dialog'),'/'+b.id+'/items',()=>({id:draft.id,expectedRevision:b.revision,cardId:draft.source.card.cardId,variantId:f.elements.variantId.value,quantity:Number(f.elements.quantity.value)}),async()=>{$('card-dialog').close();status('Quantity saved.');await refreshSavedQuantity(draft);});});
$('edit-binder').addEventListener('click',()=>{modalGeneration++;editDraft={id:newId(),binder:{...active}};const f=$('edit-form');resetForm(f,'Save changes');f.elements.name.value=active.name;f.elements.archived.checked=active.archived;f.querySelector('.dialog-status').textContent='';$('edit-dialog').showModal();});
$('edit-form').addEventListener('submit',e=>{e.preventDefault();const f=e.target,draft=editDraft;saveDraft(draft,()=>editDraft,f,$('edit-dialog'),'/'+draft.binder.id,()=>({id:draft.id,expectedRevision:draft.binder.revision,name:f.elements.name.value,archived:f.elements.archived.checked}),async()=>{$('edit-dialog').close();await openBinder(draft.binder.id);status('Binder settings saved.');});});
window.addEventListener('pagehide',lock);window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
async function start(){$('retry-collection').hidden=true;try{$('ascended-heroes-cover').innerHTML=binderCover({setId:ASCENDED_HEROES_SET_ID,language:'en',setName:'Ascended Heroes',setCode:'me02.5'});$('phantasmal-flames-cover').innerHTML=binderCover({setId:PHANTASMAL_FLAMES_SET_ID,language:'en',setName:'Phantasmal Flames',setCode:'me02'});$('journey-together-cover').innerHTML=binderCover({setId:JOURNEY_TOGETHER_SET_ID,language:'en',setName:'Journey Together',setCode:'sv09'});$('chaos-rising-cover').innerHTML=binderCover({setId:CHAOS_RISING_SET_ID,language:'en',setName:'Chaos Rising',setCode:'me04'});$('pitch-black-cover').innerHTML=binderCover({setId:PITCH_BLACK_SET_ID,language:'en',setName:'Pitch Black',setCode:'me05'});$('trial30-cover').innerHTML=binderCover({setId:TRIAL_SET_ID,language:'en',setName:'30th Celebration',setCode:'30C'});const params=new URLSearchParams(location.search||'');await loadBinders();if(locked)return;const hash=location.hash.slice(1);if(/^binder\/[0-9a-f-]{36}$/.test(hash))await openBinder(hash.slice(7));else if(params.has('set'))await openSetCollection(setTargetFromQuery(location.search));else if(hash==='account'){showView('account');await loadAccount();status('Your collection account.');}else if(hash==='library'||!hash&&!params.size&&binders.length){showView('library');status(binders.length?'Welcome back. Your saved binders are ready.':'Choose a set to start your first binder.');}else if(hash==='delta-list'){openDeltaList();}else if(hash==='pokedex'){showView('library');status('Your saved binders.');}else{if(Object.hasOwn(languages,params.get('language')))$('set-language').value=params.get('language');if(params.get('q'))$('set-query').value=params.get('q').slice(0,150);showView('sets');status('');}scheduleReadySets();}catch(e){$('collection-main').setAttribute('aria-busy','false');$('retry-collection').hidden=locked||!$('collection-app').hidden;status(e.message,true);}}


start();
})();
