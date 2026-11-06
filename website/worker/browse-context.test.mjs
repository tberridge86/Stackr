import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const rules=vm.runInNewContext((await readFile('src/browse-context.js','utf8'))+';browseContext');
const clone=value=>JSON.parse(JSON.stringify(value));
const english={name:'Prismatic Evolutions',setName:'Prismatic Evolutions',type:'Elite Trainer Box',category:'ETBs',language:'English',reference:'POK-PE-ETB',packs:9};
const japanese={name:'Terastal Festival ex',nativeName:'テラスタルフェスex',type:'Booster box',category:'Boxes',language:'Japanese',reference:'SV8A',packs:10};

test('exact product, reference and set names rank before a partial or corrected spelling',()=>{
 assert.equal(rules.rank(english,'Prismatic Evolutions'),0);
 assert.equal(rules.rank(japanese,'SV8A'),0);
 assert(rules.rank(english,'Prismatic')>0);
 assert(rules.rank(english,'Prismtic')>rules.rank(english,'Prismatic'));
 assert.notEqual(rules.rank(japanese,'Terestral Festival'),null);
 assert.equal(rules.rank(english,'unrelated expansion'),null);
});
test('native names and printed numeric identities are preserved rather than guessed',()=>{
 assert.equal(rules.rank(japanese,'テラスタルフェスex'),0);
 assert.equal(rules.rank(japanese,'테라스탈'),null);
 assert.equal(rules.rank({...japanese,collectorNumber:'004/100'},'004/100'),0);
 assert.equal(rules.rank({...japanese,collectorNumber:'004/100'},'005/100'),null);
 assert.equal(rules.rank(english,'8 packs'),null);
 assert.notEqual(rules.rank(english,'9 packs'),null);
});
test('language and edition terms narrow matches without substituting another product',()=>{
 assert.notEqual(rules.rank(japanese,'festival japanese'),null);
 assert.equal(rules.rank(japanese,'festival korean'),null);
 assert.equal(rules.rank({...english,edition:'Pokemon Center'},'pokemon center'),3);
 assert.equal(rules.rank(english,'ETB','etb elite trainer box'),3);
});
test('price-filter previews use exact pence boundaries and exclude missing references',()=>{
 assert.equal(rules.inBudget(null,'all'),true);
 assert.equal(rules.inBudget(null,'under25'),false);
 assert.equal(rules.inBudget(2499,'under25'),true);
 assert.equal(rules.inBudget(2500,'under25'),false);
 assert.equal(rules.inBudget(2500,'25to75'),true);
 assert.equal(rules.inBudget(7500,'25to75'),true);
 assert.equal(rules.inBudget(7500,'over75'),false);
 assert.equal(rules.inBudget(7501,'over75'),true);
});
const allowed={categories:['All','ETBs','Boxes'],sets:['all','prismatic','festival'],languages:['all','English','Japanese']};
test('back-navigation snapshots retain the actual browse context and expanded sets',()=>{
 const state={query:'festival',category:'Boxes',setKey:'festival',language:'Japanese',availability:'unknown',priceRange:'all',sort:'name',onlySaved:true,view:'products',scrollY:986,productLimit:48,setLimit:72,openSets:['festival'],focusProduct:'sv8a-box'};
 assert.deepEqual(clone(rules.snapshot(state,allowed)),state);
});
test('unknown or malformed history fields cannot introduce unsupported catalogue filters',()=>{
 const value=clone(rules.snapshot({query:'x'.repeat(400),category:'fake',language:'invented',setKey:'unknown',availability:'reserved',sort:'price',view:'cards',scrollY:-500,productLimit:999999,openSets:['festival','unknown'],onlySaved:'true'},allowed));
 assert.equal(value.query.length,300);assert.equal(value.category,'All');assert.equal(value.language,'English');assert.equal(value.setKey,'all');assert.equal(value.availability,'all');assert.equal(value.sort,'featured');assert.equal(value.view,'sets');assert.equal(value.scrollY,0);assert.equal(value.productLimit,1000);assert.equal(value.onlySaved,false);assert.deepEqual(value.openSets,['festival']);
 assert.equal(rules.snapshot(null,allowed),null);
});

const app=await readFile('src/app.js','utf8');
const toastSource=app.slice(app.indexOf('function dismissToast(){'),app.indexOf('function productSearchRank('));
function toastFixture(){
 let document;
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.classList={values:new Set(),add(name){this.values.add(name);},remove(name){this.values.delete(name);}};this.isConnected=true;this.events={};this.hidden=false;this.inert=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  contains(element){return this===element||this.children.some(child=>child.contains?.(element));}
  addEventListener(name,callback){this.events[name]=callback;}
  focus(){document.activeElement=this;}
 }
 const area=new Element('div'),launcher=new Element('button'),other=new Element('input'),timers=new Map();let serial=0;
 document={activeElement:launcher,body:new Element('body'),querySelectorAll:()=>[],createElement:tag=>new Element(tag)};
 const context=vm.createContext({document,get:id=>id==='toast'?area:other,setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext('let toastTimer,toastReturnFocus;'+toastSource,context);
 return {area,launcher,other,document,context,expire(){const fn=[...timers.values()].at(-1);fn();}};
}
test('expired actionable feedback removes its button from keyboard interaction and restores focus',()=>{
 const f=toastFixture();vm.runInContext('toast("Added",{label:"View bag",run(){}})',f.context);
 const button=f.area.children.find(child=>child.tag==='button');assert(button);button.focus();
 f.expire();assert.equal(f.area.hidden,true);assert.equal(f.area.inert,true);assert.equal(f.area.children.length,0);assert.equal(f.document.activeElement,f.launcher);
});
test('expiring feedback does not steal focus after the user moves to another control',()=>{
 const f=toastFixture();vm.runInContext('toast("Saved")',f.context);f.other.focus();f.expire();
 assert.equal(f.document.activeElement,f.other);assert.equal(f.area.children.length,0);
 vm.runInContext('toast("Saved again")',f.context);assert.equal(f.area.hidden,false);assert.equal(f.area.inert,false);assert.equal(f.area.children[0].textContent,'Saved again');
});

test('opening and switching products retains a single return entry and restores exploration context',async()=>{
 const tools=await readFile('src/shop-tools.js','utf8');
 const groups=await readFile('src/set-groups.js','utf8');
 const releaseSource=groups.slice(groups.indexOf('function productIsUpcoming('),groups.indexOf('function isProductInStock('));
 const historySource=tools.slice(tools.indexOf('function currentBrowseContext(){'),tools.indexOf("window.addEventListener('scroll'"));
 const quickSource=app.slice(app.indexOf('function quick(id){'),app.indexOf('function openInfo('));
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},open:false,value:'',scrollTop:0,innerHTML:'',querySelectorAll:()=>[],replaceChildren(){},showModal(){this.open=true;}});return nodes.get(id);};
 const location={hash:'#shop'},entries=[],history={state:{otherFeature:'retained'},replaceState(value,_,url){this.state=value;if(url)location.hash=url;},pushState(value,_,url){entries.push(this.state);this.state=value;location.hash=url;}};
 const items=[{...english,id:'prismatic-etb',releaseDate:'2026-11-06'},{...english,id:'prismatic-bundle',type:'Booster bundle'}];
 const window={scrollY:986,scrollTo(x,y){this.scrollY=y;}};
 const context=vm.createContext({get,history,location,window,document:{activeElement:{closest:()=>({dataset:{quick:'prismatic-etb'}})},querySelectorAll:()=>[]},requestAnimationFrame:fn=>fn(),byId:id=>items.find(p=>p.id===id),stockLabel:()=> 'Availability to be confirmed',languageBadge:p=>p.language,packText:()=> '9 packs',escapeHtml:String,productPhoto:()=>'',setMark:()=>'',icon:()=>'',pricePair:()=>'',quickProductActions:()=>'',priceShareButton:()=>'',renderSetHighlights:()=>'',renderContents:()=>'',relatedProducts:()=>'',isProductInStock:()=>false,closeSearchSuggestions(){},renderProducts(){},renderSetNavigation(){}});
 vm.runInContext((await readFile('src/browse-context.js','utf8'))+`;let query='prismtic',category='ETBs',setKey='prismatic',language='English',availability='unknown',priceRange='all',sort='featured',onlySaved=false,catalogueView='products',productLimit=48,catalogueSetLimit=72,lastFilterSignature='',browseRestoreInProgress=false;const openCatalogueSets=new Set(['prismatic']),formatLabels={All:'All',ETBs:'ETBs',Boxes:'Boxes'},setEntries=[{key:'all'},{key:'prismatic'}],languageDefinitions={English:{},Japanese:{}};`+releaseSource+historySource+quickSource,context);
 vm.runInContext('quick("prismatic-etb")',context);
 assert.equal(entries.length,1);assert.equal(location.hash,'#product/prismatic-etb');assert.equal(entries[0].stackrBrowse.query,'prismtic');assert.equal(entries[0].stackrBrowse.scrollY,986);assert.equal(history.state.otherFeature,'retained');
 assert.match(get('quick-body').innerHTML,/<span>Release<\/span><strong>6 November 2026<\/strong>/);
 assert.match(get('quick-body').innerHTML,/quick-product-identity/);
 vm.runInContext('quick("prismatic-bundle")',context);
 assert.equal(entries.length,1);assert.equal(location.hash,'#product/prismatic-bundle');assert.equal(history.state.stackrProductEntry,true);
 assert.doesNotMatch(get('quick-body').innerHTML,/Published release:/);
 const saved=entries[0].stackrBrowse;context.saved=saved;
 vm.runInContext("query='different';category='All';catalogueView='sets';restoreBrowseContext(saved)",context);
 assert.equal(vm.runInContext('query',context),'prismtic');assert.equal(get('search').value,'prismtic');assert.equal(vm.runInContext('category',context),'ETBs');assert.equal(vm.runInContext('catalogueView',context),'products');assert.equal(vm.runInContext('productLimit',context),48);assert.equal(window.scrollY,986);assert.deepEqual(clone(vm.runInContext('[...openCatalogueSets]',context)),['prismatic']);
});
