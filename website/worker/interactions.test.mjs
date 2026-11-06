import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile('src/interaction-geometry.js','utf8');
const geometry=vm.runInNewContext(source+';productGeometry');
const bounds={width:600,height:500,photoWidth:400,photoHeight:400};
const copy=value=>JSON.parse(JSON.stringify(value));

test('photo fit preserves the supplier aspect ratio in portrait and landscape viewports',()=>{
 for(const [width,height,ratio]of [[326,400,.61],[1000,520,1.5],[256,270,.8]]){
  const fit=geometry.fit(width,height,ratio);
  assert(fit.width<=width+.001&&fit.height<=height+.001);
  assert(Math.abs(fit.width/fit.height-ratio)<.00001);
 }
});
test('zoom clamps to 1–4× and the fitted photo cannot pan outside its limits',()=>{
 assert.deepEqual(copy(geometry.constrain({scale:.3,x:200,y:-200},bounds)),{scale:1,x:0,y:0});
 assert.deepEqual(copy(geometry.constrain({scale:10,x:10000,y:-10000},bounds)),{scale:4,x:500,y:-550});
 assert.deepEqual(copy(geometry.constrain({scale:2,x:80,y:-90},bounds)),{scale:2,x:80,y:-90});
});
test('zoom preserves the photograph point under the pointer until an edge is reached',()=>{
 const before={scale:2,x:20,y:-15},anchor={x:30,y:-20};
 const after=geometry.zoomAt(before,3,anchor,bounds);
 assert.equal((anchor.x-before.x)/before.scale,(anchor.x-after.x)/after.scale);
 assert.equal((anchor.y-before.y)/before.scale,(anchor.y-after.y)/after.scale);
 assert.deepEqual(copy(geometry.zoomAt(after,1,anchor,bounds)),{scale:1,x:0,y:0});
});
test('resizing after zoom re-constrains pan and tilt remains bounded outside the stage',()=>{
 const resized=geometry.constrain({scale:2,x:400,y:-400},{width:1000,height:800,photoWidth:400,photoHeight:400});
 assert.equal(resized.x,0);assert.equal(Math.abs(resized.y),0);
 assert.deepEqual(copy(geometry.tilt(500,-100,200,200)),{x:5,y:6});
 assert.deepEqual(copy(geometry.tilt(100,100,200,200)),{x:0,y:0});
});
test('card rotation remains a readable front view and its surface light stays on the card',()=>{
 const right=geometry.rotateCard({yaw:30,pitch:20},100,100),left=geometry.rotateCard({yaw:-30,pitch:-20},-100,-100);
 assert.equal(right.yaw,45);assert.equal(right.pitch,30);assert.equal(left.yaw,-45);assert.equal(left.pitch,-30);
 for(const pose of [right,left,geometry.cardPose(100,100,200,200),geometry.cardPose(-100,500,200,200)]){
  assert(pose.lightX>=0&&pose.lightX<=100);assert(pose.lightY>=0&&pose.lightY<=100);assert(Math.abs(pose.yaw)<=45);assert(Math.abs(pose.pitch)<=30);
 }
});

test('showcase card fitting keeps the complete native card inside short and wide stages',async()=>{
 const viewer=await readFile('src/card-viewer.js','utf8');
 const measure=viewer.match(/ function measure\(\)\{[\s\S]*?\n \}\n new ResizeObserver/)[0].replace(/\n new ResizeObserver$/,'');
 for(const [width,height,nativeWidth,ratio]of [[320,262,733,733/1024],[1200,640,300,300/419],[700,800,868,868/1212],[200,140,733,733/1024]]){
  const padding={paddingLeft:'25px',paddingRight:'25px',paddingTop:'20px',paddingBottom:'32px'},values={};
  vm.runInNewContext(measure+';measure();',{dialog:{open:true},stage:{clientWidth:width,clientHeight:height},getComputedStyle:()=>padding,productGeometry:geometry,nativeWidth,cardRatio:ratio,surface:{style:{setProperty:(key,value)=>values[key]=value}}});
  const fitted=parseFloat(values['--card-fit-width']);
  assert(fitted>0&&fitted<=nativeWidth&&fitted<=width-50);
  assert(fitted/ratio<=height-52+.001,'the complete card must fit above its controls');
 }
});

const inspectorSource=await readFile('src/interactions.js','utf8');
const inspectorViews=vm.runInNewContext(inspectorSource.slice(inspectorSource.indexOf('function productInspectorViews('),inspectorSource.indexOf('(function initProductInteractions'))+';productInspectorViews');
test('photograph choices retain exact declared identities and avoid repeating the same master',async()=>{
 const registry=JSON.parse(await readFile('src/product-gallery.json','utf8'));
 const products=JSON.parse(await readFile('src/products.json','utf8'));
 let total=0;
 for(const [id,entry]of Object.entries(registry.products)){
  const product=products.find(p=>p.id===id);assert(product);assert.equal(product.language,entry.language);
  const photos=entry.photos.map((photo,index)=>({...photo,image:'/media/products/'+id+'-view-'+index+'--'+photo.sha256.slice(0,12)}));
  const views=inspectorViews({...product,gallery:photos});
  assert.equal(views.length,photos.length);assert.equal(views[0].id,'main');assert.equal(views[0].image,product.image);
  assert.equal(views[0].label,photos.find(photo=>photo.sha256===product.imageSha256).label);
  assert.equal(new Set(views.map(photo=>photo.image)).size,views.length);
  for(const photo of views)assert.match(photo.sourceUrl,/^https:\/\//);
  total+=photos.length;
 }
 assert.equal(total,13);
 const p={image:'/media/products/exact',imageSha256:'a'.repeat(64),gallery:[{id:'wrong',label:'Wrong source',image:'https://example.com/photo.jpg',width:2000,height:2000,sha256:'b'.repeat(64)}]};
 assert.equal(inspectorViews(p).length,1,'unresolved remote images must not enter the source-photo gallery');
});

test('gallery loading preserves the visible photograph and a failed selection can be retried',()=>{
 const actual=inspectorSource.slice(inspectorSource.indexOf(' function failedPhoto('),inspectorSource.indexOf(' function open('));
 const requests=[],status={},choices=[{dataset:{inspectorView:'main'},setAttribute(){}},{dataset:{inspectorView:'back'},setAttribute(){}}];
 const first={id:'main',label:'Front',image:'/media/products/front'},back={id:'back',label:'Back',image:'/media/products/back'};
 const context=vm.createContext({
  photos:[first,back],selected:first,displayed:first,product:{id:'exact',name:'Exact',type:'Bundle',language:'English'},photoReady:true,pendingImage:null,loadToken:0,
  pointers:new Map(),rememberedViews:new Map(),drag:null,view:{scale:1,x:0,y:0},
  viewport:{dataset:{},classList:{remove(){}},setAttribute(){}},photoStatus:status,retry:{hidden:true},zoomControls:{hidden:false},
  viewChoices:{querySelectorAll:()=>choices},sourceLink(){},render(){},measure(){},icon:()=>'',
  object:{innerHTML:'front photograph',querySelector:()=>({})},productPhoto:p=>p.image,dialog:{open:true},
  Image:class{constructor(){requests.push(this);}},
 });
 vm.runInContext(actual,context);
 vm.runInContext('selectPhoto("back")',context);
 assert.equal(context.object.innerHTML,'front photograph');assert.equal(context.displayed.id,'main');assert.equal(context.photoReady,false);
 requests[0].onerror();
 assert.equal(context.selected.id,'back');assert.equal(context.displayed.id,'main');assert.equal(context.rememberedViews.get('exact'),'back');
 assert.match(status.textContent,/Back could not load\. Showing front\./);assert.equal(context.retry.hidden,false);
 vm.runInContext('selectPhoto("back")',context);requests[1].onload();
 assert.equal(context.displayed.id,'back');assert.equal(context.object.innerHTML,back.image);assert.equal(context.photoReady,true);assert.equal(context.retry.hidden,true);
 vm.runInContext('selectPhoto("main")',context);const stale=requests[2].onload;
 vm.runInContext('selectPhoto("back")',context);stale();
 assert.equal(context.displayed.id,'back');assert.match(status.textContent,/Loading back/,'an older response cannot replace a newer requested view');
});

// Execute the actual catalogue action renderer against changing inventory.
const groupSource=await readFile('src/set-groups.js','utf8');
const catalogueContext=vm.createContext({
 document:{addEventListener(){}},shopReady:true,stock:{status:'unknown',quantity:null},
 liveStock(){return this.stock;},state:{cart:{},saved:[]},cartMaximum:()=>2,addLabel:()=> 'Add to bag',
 icon:()=>'',interestButton:()=>'<button data-interest="p">Register interest</button>',saveButton:()=>'<button data-save="p">Save</button>',
});
// Bound functions make inventory changes visible without using any live service.
catalogueContext.liveStock=()=>catalogueContext.stock;
vm.runInContext(groupSource,catalogueContext);
const actions=()=>vm.runInContext('quickProductActions({id:"p"})',catalogueContext);
test('inspection retains interest and Save but exposes no purchase action without confirmed stock',()=>{
 for(const status of ['unknown','out_of_stock']){
  catalogueContext.stock={status,quantity:null};assert.match(actions(),/data-interest/);assert.doesNotMatch(actions(),/data-add/);
 }
 catalogueContext.stock={status:'in_stock',quantity:0};assert.doesNotMatch(actions(),/data-add/);
 catalogueContext.stock={status:'in_stock',quantity:2};catalogueContext.shopReady=false;assert.doesNotMatch(actions(),/data-add/);
 catalogueContext.shopReady=true;assert.match(actions(),/data-add/);assert.doesNotMatch(actions(),/data-interest/);
 catalogueContext.state.cart.p=2;assert.match(actions(),/data-add="p" disabled/);
 catalogueContext.stock={status:'out_of_stock',quantity:0};assert.doesNotMatch(actions(),/data-add/);
});
