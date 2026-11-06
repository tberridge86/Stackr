import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('the initial page contains the genuine catalogue showcase before JS and serves its cached deferred runtime',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Page and packaged assets must not await an external service');
 try{
  const {default:worker}=await import('../dist/server/index.js');
  const request=(path,options)=>worker.fetch(new Request('https://shop.example'+path,options));
  const page=await request('/'),html=await page.text();assert.equal(page.status,200);assert.ok(Buffer.byteLength(html)<500000,'Keep the initial HTML below the previous 2.7MB payload');
  assert.match(html,/<body[^>]*data-phone-screen="home"/);assert.match(html,/data-initial-preview="catalogue"/);assert.match(html,/opening-preview-clip-/);assert.match(html,/Catalogue preview · check availability/);assert.match(html,/data-stock-confirmed="false"/);assert.doesNotMatch(html,/const products=|const setHighlights=/);
  const initial=html.match(/data-initial-preview="catalogue"[\s\S]*?<\/section>/)[0],photos=[...initial.matchAll(/data-opening-photo-id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(photos.length,8);assert.equal(new Set(photos).size,8);for(const position of ['front','left','right','back'])assert.ok(initial.includes('data-opening-position="'+position+'"'));
  const name=html.match(/<script defer src="\/assets\/(shop-[a-f0-9]{12}\.js)"/)[1],r=await request('/assets/'+name),script=await r.text(),sha=createHash('sha256').update(script).digest('hex');
  assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'text/javascript; charset=utf-8');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.match(r.headers.get('Cache-Control'),/immutable/);assert.equal(name,'shop-'+sha.slice(0,12)+'.js');assert.equal(script,await readFile('dist/assets/'+name,'utf8'));assert.match(script,/initShopState\(\)/);
  const cached=await request('/assets/'+name,{headers:{'If-None-Match':r.headers.get('ETag')}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
  assert.equal(await(await request('/assets/'+name,{method:'HEAD'})).text(),'');
  const onlyInScript=[...script.matchAll(/assets\/([a-z0-9][a-z0-9._-]+\.(?:png|webp))/g)].map(m=>m[1]).find(n=>!html.includes('assets/'+n));assert.ok(onlyInScript);assert.equal((await request('/assets/'+onlyInScript)).status,200,'Images referenced only from deferred JS must remain packaged');
  for(const [path,screen]of [['/shop','shop'],['/sets','explore']])assert.match(await(await request(path)).text(),new RegExp('data-phone-screen="'+screen+'"'));
 }finally{globalThis.fetch=originalFetch;}
});
test('collection removes Pokédex and releases the exact Delta Reign binder alongside its legacy gallery',async()=>{
 const html=await readFile('dist/collection.html','utf8');assert.doesNotMatch(html,/Pokédex|binder-dex-tab|species-grid/);assert.match(html,/id="pitch-black-open"/);assert.match(html,/binder-pitch-black-darkrai-grid-v1.webp/);assert.match(html,/binder-delta-reign-rayquaza-grid-v1.webp/);
 assert.match(html,/id="delta-reign-open" class="primary" aria-label="Start Delta Reign binder">Start binder →/);assert.doesNotMatch(html,/Ownership saving is not available|class="collection-trial collection-pending"/);assert.match(html,/Physical finishes are not yet classified/);const numbers=[...html.matchAll(/data-list-number="(\d{3})"/g)].map(m=>m[1]);assert.equal(numbers.length,141);assert.equal(new Set(numbers).size,141);assert.equal(numbers[0],'001');assert.equal(numbers.at(-1),'141');assert.match(html,/Growing Grass Energy/);assert.match(html,/Legendary Trench/);
});
