import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {validateProductFrame} from './product-frames.mjs';

const sha='a'.repeat(64),frame=()=>({sourceSha256:sha,sourceWidth:100,sourceHeight:120,bounds:{x:10,y:20,width:80,height:90},polygon:[[10,20],[90,20],[90,110],[10,110]]});
const outline=()=>({...frame(),outlinePath:'M 10 20 L 90 20 L 90 110 L 10 110 Z'});
const invalid=mask=>assert.throws(()=>validateProductFrame(mask,sha,100,120),/Invalid or stale/);

test('legacy frames and bounded, closed multi-part outlines remain supported',()=>{
 const old=frame(),mask=outline();assert.equal(validateProductFrame(null,sha,100,120),null);
 assert.equal(validateProductFrame(old,sha,100,120),old);
 mask.outlinePath+=' M 30 40 L 40 40 L 40 50 Z';
 assert.equal(validateProductFrame(mask,sha,100,120),mask);
});
test('a new original cannot inherit stale display geometry',()=>{
 invalid({...outline(),sourceSha256:'b'.repeat(64)});
 invalid({...outline(),sourceWidth:101});invalid({...outline(),sourceHeight:121});
 invalid({...outline(),bounds:{x:10,y:20,width:100,height:90}});
 invalid({...outline(),polygon:[[0,0],[100,0],[101,120],[0,120]]});
});
test('unsafe or incomplete path commands and out-of-frame coordinates are rejected',()=>{
 for(const value of ['M 10 20 L 90 20 L 90 110','M 10 20 L 90 20 Z','L 10 20 L 90 20 L 90 110 Z','M 10 20 M 20 30 L 90 110 Z','M 10 20 Q 90 20 90 110 Z','M 9 20 L 90 20 L 90 110 Z','M 10 20 L 91 20 L 90 110 Z','M 10 20 L 90 20 L 90 111 Z','M 1e999 20 L 90 20 L 90 110 Z','M 10 20 L 90 20 L 90 110 Z"/><script/>'])invalid({...frame(),outlinePath:value});
});
test('path complexity is limited before rendering',()=>{
 invalid({...frame(),outlinePath:'M 10 20 '+'L 10 20 '.repeat(4096)+'Z'});
 invalid({...frame(),outlinePath:'M 10 20 L 90 20 L 90 110 Z '.repeat(33)});
 invalid({...outline(),outlinePath:' '.repeat(50001)});
});

const products=JSON.parse(fs.readFileSync('src/products.json','utf8'));
const quality=JSON.parse(fs.readFileSync('src/image-quality.json','utf8'));
test('every published product has exact-source geometry and no retained exterior white canvas frame',()=>{
 assert.equal(products.length,253);
 let replaced=0;
 for(const p of products){
  assert.equal(p.imagePending,false,p.id);
  const q=quality.products[p.id],mask=q?.cutout;assert(mask,p.id);
  validateProductFrame(mask,p.imageSha256,p.imageWidth,p.imageHeight,p.id);
  assert.notEqual(mask.method,'stock-white-canvas-framing',p.id);
  assert.notEqual(mask.includesSourceWhiteBackground,true,p.id);
  if(mask.outlinePath){replaced++;assert.equal(mask.originalBytesUnchanged,true,p.id);assert(q.framingEvidence.visualReview,p.id);}
 }
 assert.equal(replaced,150);
});
test('white box faces stay within their closed retail outline while the exterior canvas is excluded',()=>{
 const inside=(points,x,y)=>points.reduce((v,a,i)=>{const b=points[(i+1)%points.length];return (a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]?!v:v;},false);
 for(const [id,x,y] of [['en-terapagos-ex-ultra-premium-collection-ultra-premium-collection',1700,800],['en-30th-celebration-upc-day',300,320],['en-30th-celebration-upc-night',300,320]]){
  const mask=quality.products[id].cutout;
  assert(inside(mask.polygon,x,y),id+' white printing must be preserved');
  assert(!inside(mask.polygon,1,1),id+' exterior canvas must be excluded');
 }
});
test('all product preview contexts share clipped originals with unique clip IDs and working eager/lazy sources',()=>{
 const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({escapeHtml,icon:()=>''});
 vm.runInContext(fs.readFileSync('src/shop-tools.js','utf8').split('function initProductCutouts')[0],context);
 const p=products.find(p=>p.id==='en-30th-celebration-upc-day');
 context.product={...p,imageCutout:quality.products[p.id].cutout};
 const eager=vm.runInContext('productPhoto(product,"eager")',context),lazy=vm.runInContext('productPhoto(product)',context);
 assert.match(eager,/<clipPath[^>]+><path d="M /);assert.match(eager,/data-photo-frame="alpha"/);
 assert.match(eager,/data-product-photo href=/);assert.doesNotMatch(eager,/data-cutout-src=/);
 assert.match(lazy,/data-product-photo data-cutout-src=/);
 assert.notEqual(eager.match(/clipPath id="([^"]+)"/)[1],lazy.match(/clipPath id="([^"]+)"/)[1]);
 context.product={...p,imageCutout:frame()};assert.match(vm.runInContext('productPhoto(product)',context),/<polygon /);
});
test('both repaired Chinese deliveries bundle the exact previously verified source bytes',()=>{
 for(const id of ['cn-collect-151-journey-151-c-jumbo-box','cn-gem-pack-vol-7-box']){
  const p=products.find(p=>p.id===id);assert.match(p.image,/^[a-z0-9-]+\.(jpg|webp)$/);
  assert.equal(createHash('sha256').update(fs.readFileSync('src/assets/'+p.image)).digest('hex'),p.imageSha256,id);
  assert.match(p.imageSource.assetUrl,/^https:\/\//);
 }
});
test('the compiled Worker serves both bundled originals with their pinned bytes and image types',async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 for(const id of ['cn-collect-151-journey-151-c-jumbo-box','cn-gem-pack-vol-7-box']){
  const p=products.find(p=>p.id===id),response=await worker.fetch(new Request('https://stackr.test/assets/'+p.image),{}, {waitUntil(){}});
  assert.equal(response.status,200,id);assert.match(response.headers.get('content-type'),/^image\/(jpeg|webp)/);
  assert.equal(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex'),p.imageSha256,id);
 }
});
