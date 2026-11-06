import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderSitePage, pageDetails} from './site-pages.mjs';

test('metadata follows each canonical route without query strings or duplicate tags',async()=>{
 const source=await readFile('src/index.html','utf8');
 for(const route of Object.keys(pageDetails)){
  const once=renderSitePage(source,route,'https://shop.example');
  const twice=renderSitePage(once,route,'https://shop.example');
  assert.equal((twice.match(/property="og:image"/g)||[]).length,1);
  assert.equal((twice.match(/rel="canonical"/g)||[]).length,1);
  assert(twice.includes(`href="https://shop.example${route}"`));
  assert(twice.includes('content="https://shop.example/assets/stackr-social.png"'));
  assert(twice.includes('<title>'+pageDetails[route].title+'</title>'));
 }
 assert.equal(renderSitePage(source,'/made-up'),source);
});

test('actual Worker serves helpful 404s, metadata and every advertised browser icon',async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const request=(path,method='GET')=>worker.fetch(new Request('https://shop.example'+path,{method}));
 const missing=await request('/not-a-real-page?attempt=%3Cscript%3E');
 assert.equal(missing.status,404);
 assert.equal(missing.headers.get('Content-Type'),'text/html; charset=utf-8');
 assert.equal(missing.headers.get('X-Robots-Tag'),'noindex');
 const body=await missing.text();
 assert.match(body,/href="\/shop"/);assert.match(body,/href="\/sets"/);
 assert.match(body,/mailto:Hello@StackrTCG.com/);assert.doesNotMatch(body,/attempt=/);
 assert.equal(await(await request('/not-a-real-page','HEAD')).text(),'');
 assert.equal((await request('/not-a-real-page','POST')).status,405);
 assert.equal((await request('/api/not-a-real-route')).status,404);
 for(const route of ['/','/shop','/sets','/about','/history']){
  const response=await request(route+'?tracking=discard');assert.equal(response.status,200);
  const html=await response.text();assert(html.includes(`<link rel="canonical" href="https://shop.example${route}">`));
  assert.doesNotMatch(html,/tracking=discard/);
 }
 const manifest=await request('/assets/site.webmanifest');
 assert.equal(manifest.headers.get('Content-Type'),'application/manifest+json');
 const icons=(await manifest.json()).icons;
 for(const icon of [...icons,{src:'/assets/favicon-32.png',sizes:'32x32'},{src:'/assets/apple-touch-icon.png',sizes:'180x180'},{src:'/assets/stackr-social.png',sizes:'1200x630'}]){
  const response=await request(icon.src);assert.equal(response.status,200,icon.src);
  assert.equal(response.headers.get('Content-Type'),'image/png');
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20),icon.sizes);
 }
});
