import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const [app,phone,browser,groups,browse,productText,dateText]=await Promise.all(['src/app.js','src/phone-commerce.js','src/set-browser.js','src/set-groups.js','src/browse-context.js','src/products.json','src/set-release-dates.json'].map(file=>readFile(file,'utf8')));
const products=JSON.parse(productText),registry=JSON.parse(dateText);
const clone=value=>JSON.parse(JSON.stringify(value));

test('all English, Japanese and Korean sets use sourced expansion dates, independently of product releases',()=>{
 const context=vm.createContext({products,setReleaseDates:registry.sets});
 vm.runInContext(browser,context);
 const entries=clone(vm.runInContext('setEntries',context));
 const expansions=entries.filter(entry=>!['all','collections'].includes(entry.key));
 assert.equal(entries[0].key,'all');assert.equal(entries.at(-1).key,'collections');
 for(const entry of expansions.filter(entry=>['English','Japanese','Korean'].includes(entry.language))){
  const date=registry.sets[entry.key];assert(date,'Missing '+entry.key);assert(registry.sources[date.sourceId]?.url.startsWith('https://'));
 }
 const dates=expansions.map(entry=>registry.sets[entry.key]?.releaseDate||null);
 let previous='9999-12-31',unknown=false;
 for(const date of dates){if(!date){unknown=true;continue;}assert.equal(unknown,false,'A known date follows an unknown date');assert(date<=previous);previous=date;}
 assert.equal(registry.sets['ascended-heroes'].releaseDate,'2026-01-30');
 assert.equal(registry.sets['prismatic-evolutions'].releaseDate,'2025-01-17');
 assert.equal(registry.sets['astral-radiance'].releaseDate,'2022-05-27');
 context.late={setKey:'prismatic-evolutions',releaseDate:'2099-01-01'};
 context.earlier={setKey:'journey-together',releaseDate:'1900-01-01'};
 assert(vm.runInContext('compareSetReleases(late,earlier)',context)>0);
 assert.equal(vm.runInContext('setReleaseLabel({key:"unconfirmed-test-set"})',context),'Set release date unconfirmed');
});

test('shop reset restores English and default sort while intentional history languages survive',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
 const context=vm.createContext({get,byId:()=>({}),clearSetFilter(){},renderFeature(){},renderProducts(){}});
 const reset=app.slice(app.indexOf('function reset(){'),app.indexOf('function add('));
 vm.runInContext("let category='Boxes',language='Korean',availability='all',onlySaved=true,query='x',priceRange='over75',sort='high';"+reset+'reset();',context);
 assert.deepEqual(clone(vm.runInContext('({category,language,availability,onlySaved,query,priceRange,sort})',context)),{category:'All',language:'English',availability:'in_stock',onlySaved:false,query:'',priceRange:'all',sort:'featured'});
 assert.equal(get('sort').value,'featured');
 const rules=vm.runInNewContext(browse+';browseContext');
 const allowed={categories:['All'],sets:['all'],languages:['all','English','Japanese']};
 assert.equal(rules.snapshot({},allowed).language,'English');
 for(const language of ['all','English','Japanese'])assert.equal(rules.snapshot({language},allowed).language,language);
 const initial=app.match(/let category=.*?;/)[0];assert.equal(vm.runInNewContext(initial+'language'),'English');
 assert.equal(vm.runInNewContext(phone+';exploreLanguage'),'English');
});

test('empty stock matches can recover without erasing the other filters and saved misses are truthful',()=>{
 const source=groups.slice(groups.indexOf('function emptyCatalogue(){'),groups.indexOf('function selectProduct('));
 const context=vm.createContext({availability:'in_stock',onlySaved:false,shopReady:true,state:{saved:['saved']},icon:()=>''});
 vm.runInContext(source,context);
 assert.match(vm.runInContext('emptyCatalogue()',context),/data-all-availability/);
 vm.runInContext("availability='all';onlySaved=true",context);
 assert.match(vm.runInContext('emptyCatalogue()',context),/No saved products match/);
 context.state.saved=[];assert.match(vm.runInContext('emptyCatalogue()',context),/No saved products yet/);
});

function checkoutFixture({gate=Promise.resolve(),storageFailure=false,malformedAttempt=false,statusFailure=false}={}){
 const notices=[],dialogs=[],posted=[],destinations=[];let reads=0;
 const memory=new Map();const product={id:'box'};
 const stored={attemptId:'11111111-1111-4111-8111-111111111111',fingerprint:malformedAttempt?'broken':JSON.stringify([{productId:'box',quantity:1,expectedUnitPence:1000}])};
 memory.set('stackr-checkout-attempt',JSON.stringify(stored));
 const sessionStorage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value),removeItem(key){if(storageFailure)throw Error('Storage unavailable');memory.delete(key);}};
 const context=vm.createContext({URL,URLSearchParams,sessionStorage,crypto:{randomUUID:()=>stored.attemptId},customerLimit:3,state:{cart:{box:1}},get:()=>null,byId:id=>id==='box'?product:null,currentQuote:()=>({shopPence:1000}),cartMaximum:()=>3,isProductInStock:()=>true,liveStock:()=>({quantity:5}),renderCart(){},persist(){},icon:()=>'',escapeHtml:String,toast:message=>notices.push(message),openInfo:(title,body)=>dialogs.push({title,body}),location:{origin:'https://shop.example',search:'?session_id=cs_test_123456789012345'},window:{location:{assign:url=>destinations.push(url)}},loadShopState:async()=>{reads++;await gate;},refreshLivePrices:async()=>{},shopApi:async(path,options)=>{
  if(path==='/api/checkout/config')return {enabled:true,mode:'test',deliveryPence:0};
  if(path.startsWith('/api/checkout/status')){if(statusFailure)throw Error('Offline');return {status:'paid',attemptId:stored.attemptId,mode:'test'};}
  posted.push(JSON.parse(options.body));return {url:'https://checkout.stripe.com/c/pay/test'};
 }});
 vm.runInContext(phone,context);
 return {context,notices,dialogs,posted,destinations,reads:()=>reads};
}

test('repeated checkout clicks share one refresh and one idempotent checkout request',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=checkoutFixture({gate});
 const first=vm.runInContext('startStripeCheckout()',f.context),second=vm.runInContext('startStripeCheckout()',f.context);
 assert.equal(f.reads(),1);assert.equal(vm.runInContext('checkoutBusy',f.context),true);
 release();await Promise.all([first,second]);
 assert.equal(f.posted.length,1);assert.equal(f.destinations.length,1);assert.equal(vm.runInContext('checkoutBusy',f.context),false);
});

test('a checkout refresh failure is handled and releases the busy guard',async()=>{
 const f=checkoutFixture();f.context.refreshLivePrices=async()=>{throw Error('Pricing offline');};
 await vm.runInContext('startStripeCheckout()',f.context);
 assert.equal(f.posted.length,0);assert.deepEqual(f.notices,['Pricing offline']);assert.equal(vm.runInContext('checkoutBusy',f.context),false);
});

test('confirmed payment remains confirmed when local checkout storage is unavailable or malformed',async()=>{
 for(const options of [{storageFailure:true},{malformedAttempt:true}]){
  const f=checkoutFixture(options);await vm.runInContext('confirmCheckoutReturn()',f.context);
  assert.equal(f.dialogs.at(-1).title,'Payment confirmed');
 }
});

test('unconfirmed payment offers a read-only retry and the supplied support email',async()=>{
 const f=checkoutFixture({statusFailure:true});await vm.runInContext('confirmCheckoutReturn()',f.context);
 assert.equal(f.dialogs.at(-1).title,'Unable to confirm payment');
 assert.match(f.dialogs.at(-1).body,/data-retry-payment/);assert.match(f.dialogs.at(-1).body,/href="mailto:Hello@StackrTCG.com"/);
});
