import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';

test('current public company disclosures restore the authorized registered office and retired scripts do not ship',async()=>{
 const disclosure=(await readFile('src/index.html','utf8')).match(/<p>Registered office: ([^<]+)<\/p>/);assert.ok(disclosure);
 const request=path=>worker.fetch(new Request('https://shop.example'+path));
 for(const path of ['/','/shop','/sets','/about','/history']){
  const r=await request(path),html=await r.text();assert.equal(r.status,200);
  assert.ok(html.includes(disclosure[0]));assert.doesNotMatch(html,/<p>Registered: Derby, United Kingdom/);
 }
 const html=await readFile('dist/index.html','utf8'),current=html.match(/<script defer src="\/assets\/(shop-[a-f0-9]{12}\.js)"/)[1];
 const scripts=(await readdir('dist/assets')).filter(f=>/^shop-[a-f0-9]{12}\.js$/.test(f));assert.deepEqual(scripts,[current]);
 const script=await readFile('dist/assets/'+current,'utf8');assert.ok(script.includes('<dt>Registered office</dt><dd>'+disclosure[1]+'</dd>'));
});

test('curated discovery keeps complete owner covers, hides the generic catalogue and labels its start actions',async()=>{
 const html=await readFile('dist/collection.html','utf8'),links=JSON.parse(await readFile('src/collection-set-links.json','utf8'));
 assert.match(html,/<div id="other-collection-sets" hidden>/);assert.match(html,/<button id="new-binder" class="text-button" hidden>/);
 assert.equal((html.match(/Start binder →/g)||[]).length,7);assert.doesNotMatch(html,/Ownership saving is not available/);
 const covers=JSON.parse(html.match(/id="collection-covers">([\s\S]*?)<\/script>/)[1]).covers;
 const ready=Object.values(links.matches).filter(l=>l.binderReady);assert.equal(ready.length,7);
 for(const entry of ready)assert.ok(covers.some(c=>c.setId===entry.setId&&c.language===entry.language&&c.fullCover),'Every released binder must have its exact complete cover');
});

test('the web loader serves the exact recorded app layers and retains a static reduced-motion composition',async()=>{
 const registry=JSON.parse(await readFile('src/stackr-loading-assets.json','utf8')),html=await readFile('dist/collection.html','utf8');
 assert.equal(registry.sourceCommit,'665523719b1d637ec4c06fbcbfd209e565a4a01f');assert.match(html,/id="stackr-loading-template"/);assert.match(html,/@media\(prefers-reduced-motion:no-preference\)/);assert.match(html,/stackr-loading-card\{animation:stackr-loading-card 4s linear infinite/);
 assert.equal(registry.assets.length,5);
 for(const asset of registry.assets){const r=await worker.fetch(new Request('https://shop.example/assets/'+asset.file));assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
});
