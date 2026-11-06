import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const [app,stock,browser]=await Promise.all(['src/app.js','src/shop-state.js','src/set-browser.js'].map(file=>readFile(file,'utf8')));
const quickSource=app.slice(app.indexOf('function quick(id){'),app.indexOf('async function checkout('));
const historySource=app.slice(app.indexOf("get('quick-dialog').addEventListener('close'"),app.indexOf("document.querySelectorAll('.nav-menu').forEach(menu=>menu.addEventListener('toggle'"));
const linkedProductSource=browser.slice(browser.indexOf('function openLinkedProduct(){'));
const product={id:'phantasmal-etb',name:'Phantasmal Flames',type:'Elite Trainer Box',language:'English',series:'Mega Evolution',description:'A sealed retail product',packs:9};

// Native dialog close events and history traversals are queued. Keeping that
// ordering here catches a lost return target that synchronous close stubs miss.
function journey(){
 const nodes=new Map(),tasks=[],microtasks=[],restored=[];let context,document;
 const eventTarget=target=>{
  target.events=new Map();
  target.addEventListener=(name,callback)=>{const callbacks=target.events.get(name)||[];callbacks.push(callback);target.events.set(name,callbacks);};
  target.dispatch=(name,details={})=>{for(const callback of target.events.get(name)||[])callback({type:name,target,...details});};
  return target;
 };
 class Element{
  constructor(tag='div',attrs={}){eventTarget(this);this.tagName=tag.toUpperCase();this.attrs=attrs;this.dataset={};for(const[key,value]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;this.children=[];this.open=false;this.hidden=false;this.isConnected=true;this.value='';this.scrollTop=0;this._html='';this.classList={add(){},remove(){},toggle(){}};}
  set innerHTML(value){this.removeChildren();this._html=value;this.children=parse(value);}
  get innerHTML(){return this._html;}
  removeChildren(){for(const child of this.children){child.isConnected=false;const id=child.attrs.id;if(id&&nodes.get(id)===child)nodes.delete(id);}this.children=[];}
  insertAdjacentHTML(_,value){this.children.push(...parse(value));}
  matches(selector){if(selector==='button')return this.tagName==='BUTTON';const attr=selector.match(/^\[([^\]]+)\]$/)?.[1];return !!attr&&Object.hasOwn(this.attrs,attr);}
  querySelector(selector){return this.children.find(child=>child.matches(selector))||null;}
  querySelectorAll(selector){return this.children.filter(child=>child.matches(selector));}
  closest(selector){return this.matches(selector)?this:null;}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  setAttribute(name,value){this.attrs[name]=value;}
  removeAttribute(name){delete this.attrs[name];}
  focus(){document.activeElement=this;}
  showModal(){if(this.open)return;this.returnFocus=document.activeElement;this.open=true;this.focus();}
  close(){if(!this.open)return;this.open=false;this.returnFocus?.focus();tasks.push(()=>this.dispatch('close'));}
 }
 function parse(html){return [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map(([,tag,attributes])=>{const attrs=Object.fromEntries([...attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,name,value])=>[name,value??'']));const el=new Element(tag,attrs);if(attrs.id)nodes.set(attrs.id,el);return el;});}
 for(const id of ['quick-dialog','quick-body','info-dialog','info-title','info-content','availability-controls'])nodes.set(id,new Element(id.endsWith('dialog')?'dialog':'div',{id}));
 const trigger=new Element('button',{'data-quick':product.id});
 document=eventTarget({activeElement:trigger,hidden:false,body:new Element('body'),querySelectorAll:()=>[]});
 const location={hash:'',pathname:'/shop',protocol:'https:'};
 const browse={query:'Phantasmal',language:'English',availability:'all',scrollY:986,focusProduct:product.id};
 const entries=[{url:'https://stackr.test/shop',state:{stackrBrowse:{...browse}}}];let index=0,pushes=0;
 const window=eventTarget({scrollY:986,scrollTo(){}});
 const setUrl=url=>{const parsed=new URL(url,entries[index].url);location.hash=parsed.hash;location.pathname=parsed.pathname;return parsed.href;};
 const move=delta=>tasks.push(()=>{if(!entries[index+delta])return;const before=location.hash;index+=delta;setUrl(entries[index].url);window.dispatch('popstate');if(location.hash!==before)window.dispatch('hashchange');});
 const history={get state(){return entries[index].state;},replaceState(value,_,url){entries[index].state=value;if(url)entries[index].url=setUrl(url);},pushState(value,_,url){const href=new URL(url,entries[index].url).href;entries.splice(index+1);entries.push({url:href,state:value});index++;pushes++;setUrl(href);},back(){move(-1);},forward(){move(1);}};
 const get=id=>nodes.get(id)||null;
 context=vm.createContext({
  get,window,document,location,history,URL,products:[product],byId:id=>id===product.id?product:null,
  queueMicrotask:fn=>microtasks.push(fn),setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},
  rememberBrowseContext(){history.replaceState({...history.state,stackrBrowse:{...browse}},'');},restoreBrowseContext:value=>restored.push(value),
  closeSearchSuggestions(){},stockLabel:()=> 'Availability to be confirmed',packText:()=> '9 packs',escapeHtml:String,
  productPhoto:()=>'<span>Product photo</span>',setMark:()=>'',icon:()=>'',pricePair:()=>'',languageBadge:()=> 'English',
  productReleaseLabel:()=>'',quickProductActions:p=>'<button data-interest="'+p.id+'">Register interest</button>',
  priceShareButton:()=>'',renderSetHighlights:()=>'',renderContents:()=>'<section id="product-contents" aria-labelledby="contents-title"><h3 id="contents-title">Contents</h3></section>',relatedProducts:()=>'',isProductInStock:()=>false,currentQuote:()=>null
 });
 vm.runInContext(stock+'\nlet productHistoryIsClosing=false;\n'+quickSource+'\nfunction selectProduct(id){quick(id);}\n'+linkedProductSource+'\n'+historySource,context);
 vm.runInContext('loadShopState=async()=>true;renderSetHighlights=()=>"";initShopState();shopReady=true;shopState={products:{"phantasmal-etb":{note:"private supplier note"}},visitor:{signedIn:true,isOwner:true,email:"owner@example.test"},interests:[]};',context);
 const run=source=>vm.runInContext(source,context);
 const flush=()=>{let guard=0;while(tasks.length||microtasks.length){while(microtasks.length)microtasks.shift()();if(tasks.length)tasks.shift()();assert(++guard<50,'Unexpected navigation loop');}};
 const openInterest=()=>{run('quick("phantasmal-etb");showInterest("phantasmal-etb");');flush();};
 return {get,document,window,history,location,entries,restored,run,flush,openInterest,get pushes(){return pushes;},get index(){return index;}};
}

test('product → interest → Back keeps one modal and one product history entry',()=>{
 const f=journey();f.openInterest();
 assert.equal(f.pushes,1);assert.equal(f.get('quick-dialog').open,false);assert.equal(f.get('info-dialog').open,true);assert(f.get('interest-form'));
 const back=f.get('info-content').querySelector('[data-interest-back]');assert(back);
 f.document.dispatch('click',{target:back});f.flush();
 assert.equal(f.get('info-dialog').open,false);assert.equal(f.get('quick-dialog').open,true);assert.equal(f.location.hash,'#product/phantasmal-etb');assert.equal(f.pushes,1);
 assert.equal(f.document.activeElement,f.get('quick-body').querySelector('[data-interest]'));
 f.get('quick-dialog').close();f.flush();
 assert.equal(f.index,0);assert.equal(f.location.hash,'');assert.equal(f.get('quick-dialog').open,false);assert.equal(f.restored.at(-1).query,'Phantasmal');assert.equal(f.restored.at(-1).scrollY,986);
});

test('closing interest by its dialog control returns to the same product without a new history entry',()=>{
 const f=journey();f.openInterest();f.get('info-dialog').close();f.flush();
 assert.equal(f.get('quick-dialog').open,true);assert.equal(f.get('info-dialog').open,false);assert.equal(f.run('interestReturnProduct'),null);assert.equal(f.pushes,1);
});

test('browser Back dismisses interest without reopening it; Forward restores the product',()=>{
 const f=journey();f.openInterest();f.history.back();f.flush();
 assert.equal(f.index,0);assert.equal(f.get('info-dialog').open,false);assert.equal(f.get('quick-dialog').open,false);assert.equal(f.run('interestReturnProduct'),null);assert.equal(f.restored.at(-1).language,'English');
 f.history.forward();f.flush();
 assert.equal(f.index,1);assert.equal(f.location.hash,'#product/phantasmal-etb');assert.equal(f.get('quick-dialog').open,true);assert.equal(f.get('info-dialog').open,false);assert.equal(f.pushes,1);
});

for(const cause of ['private invalidation','hidden tab','pagehide'])test(cause+' clears private interest content and restores the public product route',()=>{
 const f=journey();f.openInterest();
 if(cause==='private invalidation')f.run('shopReady=false;clearPrivateShopData();');
 else if(cause==='hidden tab'){f.document.hidden=true;f.document.dispatch('visibilitychange');}
 else f.window.dispatch('pagehide');
 f.flush();
 assert.equal(f.get('info-dialog').open,false);assert.equal(f.get('info-content').innerHTML,'');assert.equal(f.get('interest-form'),null);assert.equal(f.get('interest-feedback'),null);
 assert.equal(f.run('shopState.visitor.signedIn'),false);assert.equal(f.run('shopState.visitor.email'),'');assert.equal(f.run('shopState.products["phantasmal-etb"].note'),undefined);
 assert.equal(f.get('quick-dialog').open,true);assert.equal(f.location.hash,'#product/phantasmal-etb');assert.equal(f.pushes,1);assert.equal(f.run('interestReturnProduct'),null);
 if(cause==='hidden tab'){f.document.hidden=false;f.document.dispatch('visibilitychange');}
 if(cause==='pagehide')f.window.dispatch('pageshow',{persisted:true});
 f.flush();assert.equal(f.get('quick-dialog').open,true);assert.equal(f.pushes,1);
});

test('private invalidation does not resurrect a product after its route has changed',()=>{
 const f=journey();f.openInterest();
 f.history.replaceState({stackrProduct:null},'','/shop');f.run('shopReady=false;clearPrivateShopData();');f.flush();
 assert.equal(f.get('info-dialog').open,false);assert.equal(f.get('quick-dialog').open,false);assert.equal(f.location.hash,'');assert.equal(f.run('interestReturnProduct'),null);assert.equal(f.pushes,1);
});

test('interest opened directly from the catalogue closes back to the catalogue',()=>{
 const f=journey();f.run('showInterest("phantasmal-etb")');f.flush();
 assert.equal(f.get('info-dialog').open,true);assert.equal(f.get('quick-dialog').open,false);assert.equal(f.get('info-content').querySelector('[data-interest-back]'),null);
 f.get('info-dialog').close();f.flush();
 assert.equal(f.get('quick-dialog').open,false);assert.equal(f.get('info-dialog').open,false);assert.equal(f.pushes,0);assert.equal(f.location.hash,'');
});
