import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {renderSitePage} from './site-pages.mjs';

// Exercise the actual bundled Worker without issuing any external requests.
test('Worker routes, cached first response, background refresh and outage retention',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;
 const products=JSON.parse(await readFile('src/products.json','utf8'));
 const sources=JSON.parse(await readFile('worker/price-sources.json','utf8'));
 const seeds=JSON.parse(await readFile('src/pricing-seeds.json','utf8'));
 const time=Math.max(Date.parse('2026-11-02T22:00:00Z'),...seeds.map(quote=>Date.parse(quote.observedAt)||0))+3600000;
 const expectedSources=Object.values(sources).reduce((count,entries)=>count+entries.length,0);
 const eligibleSeeds=seeds.filter(quote=>Date.parse(quote.asOf||quote.observedAt)<=time&&time-Date.parse(quote.asOf||quote.observedAt)<7*24*60*60*1000&&(sources[quote.productId]||[]).some(source=>source.id===quote.sourceId));
 const expectedCurrent=new Set(eligibleSeeds.map(quote=>quote.productId)).size;
 const expectedPrice=id=>{const values=eligibleSeeds.filter(quote=>quote.productId===id).map(quote=>quote.marketPence);return values.length?Math.min(...values):null;};
 Date.now=()=>time;
 let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async()=>{calls++;await gate;throw Error('Simulated provider outage');};
 try{
  const source=await readFile('dist/server/index.js','utf8');
  assert(!/^\s*import\s/m.test(source),'Artifact must be self-contained');
  // A data URL checks the publishing contract independently of package.json.
  const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(typeof worker.fetch,'function');
  const request=(url,options)=>worker.fetch(new Request('https://stackr.local'+url,options));
  const html=await request('/');assert.equal(html.status,200);assert.equal(await html.text(),renderSitePage(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),'/','https://stackr.local'));
  for(const route of ['/shop','/sets']){const page=await request(route);assert.equal(page.status,200);assert.equal(await page.text(),renderSitePage(await readFile('dist/index.html','utf8'),route,'https://stackr.local'));}
  for(const route of ['/shop/','/sets/']){const redirect=await request(route);assert.equal(redirect.status,308);assert.equal(redirect.headers.get('Location'),'https://stackr.local'+route.slice(0,-1));}
  const disabledCheckout=await request('/api/checkout/config');assert.equal((await disabledCheckout.json()).enabled,false);
  const head=await request('/',{method:'HEAD'});assert.equal(await head.text(),'');
  const historyHtml=await readFile(new URL('../dist/history.html',import.meta.url),'utf8');
  for(const route of ['/history','/history/','/history.html']){const history=await request(route);assert.equal(history.status,200);assert.equal(await history.text(),renderSitePage(historyHtml,route,'https://stackr.local'));assert.equal(await(await request(route,{method:'HEAD'})).text(),'');assert.equal((await request(route,{method:'POST'})).status,405);}
  assert.equal((historyHtml.split('<script>')[0].match(/data-history-event=/g)||[]).length,JSON.parse(await readFile('src/pokemon-history.json','utf8')).events.length);
  const aboutHtml=await readFile(new URL('../dist/about.html',import.meta.url),'utf8');
  for(const route of ['/about','/about/','/about.html']){const about=await request(route);assert.equal(about.status,200);assert.equal(await about.text(),renderSitePage(aboutHtml,route,'https://stackr.local'));assert.equal(await(await request(route,{method:'HEAD'})).text(),'');assert.equal((await request(route,{method:'POST'})).status,405);}
  const shopHtml=await readFile('dist/index.html','utf8');assert.match(shopHtml,/href="\/about"/);assert.match(shopHtml,/href="\/history"/);assert.doesNotMatch(shopHtml,/class="story-copy"/);assert.match(aboutHtml,/QVC/);assert.match(aboutHtml,/<strong>completionist<\/strong>/);
  for(const image of Object.values(JSON.parse(await readFile('src/history-artifacts.json','utf8')).assets).filter(image=>image.file)){const asset=await request('/assets/'+image.file);assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),await readFile('src/assets/'+image.file));}
  for(const file of ['johto-gold-silver-map.png',...JSON.parse(await readFile('src/pokemon-history.json','utf8')).events.filter(event=>event.image?.file).map(event=>event.image.file)]){const asset=await request('/assets/'+file);assert.equal(asset.status,200);assert.deepEqual(Buffer.from(await asset.arrayBuffer()),await readFile('src/assets/'+file));}
  assert.equal((await request('/',{method:'POST'})).status,405);
  assert.equal((await request('/api/unknown')).status,404);
  assert.equal((await request('/api/prices',{method:'POST'})).headers.get('Allow'),'GET');
  assert.equal((await request('/assets/%E0%A4%A')).status,400);
  assert.equal((await request('/assets/__proto__')).status,404);
  for(const [name,mime]of [['format-boxes.png','image/png'],['stackr-brand-sheet.pdf','application/pdf'],['inter-latin-variable.woff2','font/woff2'],['bricolage-grotesque-latin.woff2','font/woff2'],['bricolage-ofl.txt','text/plain; charset=utf-8'],['inter-license.txt','text/plain; charset=utf-8']]){
   const asset=await request('/assets/'+name);assert.equal(asset.status,200);assert.equal(asset.headers.get('Content-Type'),mime);
   assert((await asset.arrayBuffer()).byteLength>1000);
   assert.equal((await request('/assets/'+name,{headers:{'If-None-Match':asset.headers.get('ETag')}})).status,304);
   assert.equal(await (await request('/assets/'+name,{method:'HEAD'})).text(),'');
  }
  const jobs=[],ctx={waitUntil:job=>jobs.push(job)};
  const started=performance.now();
  const first=await worker.fetch(new Request('https://stackr.local/api/prices?url=https://evil.invalid'),{},ctx);
  assert(performance.now()-started<500,'A slow provider must not block the saved feed');
  const feed=await first.json();
  assert.equal(feed.currency,'GBP');assert.equal(feed.discountBps,1000);
  assert.equal(Object.keys(feed.products).length,products.length);assert.equal(feed.refreshing,true);
  assert.deepEqual(Object.keys(feed.products).sort(),products.map(product=>product.id).sort());
  assert.equal(Object.values(feed.products).filter(q=>q.status==='current').length,expectedCurrent);
  assert.equal(feed.products['black-bundle'].marketPence,expectedPrice('black-bundle'));
  assert.equal(feed.products['black-bundle'].shopPence,expectedPrice('black-bundle')===null?null:Math.floor((expectedPrice('black-bundle')*9000+5000)/10000));
  assert.equal(feed.products['prism-bundle'].marketPence,expectedPrice('prism-bundle'));
  assert.equal(jobs.length,1);assert(calls<=4);
  await worker.fetch(new Request('https://stackr.local/api/prices'),{},ctx);
  assert.equal(jobs.length,1,'Concurrent visitors share the same refresh');
  release();await Promise.all(jobs);
  for(let batch=0;batch<12;batch++){
   const pending=await(await worker.fetch(new Request('https://stackr.local/api/prices'),{},ctx)).json();
   if(!pending.refreshing&&!pending.refreshPending)break;
   await Promise.all(jobs);
  }
  assert.equal(calls,expectedSources);
  const retained=await (await worker.fetch(new Request('https://stackr.local/api/prices'),{},ctx)).json();
  assert.equal(retained.refreshing,false);assert.equal(retained.refreshPending,false);assert.equal(jobs.length,Math.ceil(expectedSources/32));
  assert.equal(retained.products['black-bundle'].observedAt,feed.products['black-bundle'].observedAt);
  assert.equal(retained.products['black-bundle'].shopPence,feed.products['black-bundle'].shopPence);
  assert.equal(retained.products['prism-bundle'].shopPence,feed.products['prism-bundle'].shopPence);
 }finally{release?.();globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('standalone export pins complete media keys and preserves live-only API destinations',async()=>{
 const temporaryRoot=path.resolve(tmpdir());
 const directory=await mkdtemp(path.join(temporaryRoot,'stackr-export-'));
 try{
  await mkdir(path.join(directory,'dist/assets'),{recursive:true});
  const source='https://images.example.com/a.png?version=1&art=box';
  const runtime='const pictures=["/media/products/p","/media/products/promo"];function register(){if(location.protocol===\'file:\')return;fetch(\'/api/interests\');}',name='shop-'+createHash('sha256').update(runtime).digest('hex').slice(0,12)+'.js';
  const html='<html><style>.photo{background-image:url(\'/media/products/promo\')}</style><body><img src="/media/contents/p"><script defer src="/assets/'+name+'"></script></body></html>';
  await writeFile(path.join(directory,'dist/assets',name),runtime);
  await writeFile(path.join(directory,'dist/index.html'),html);
  await writeFile(path.join(directory,'dist/media-sources.json'),JSON.stringify({'products/p':{url:source},'products/promo':{url:'https://images.example.com/promo.png'},'contents/p':{url:source}}));
  const exporter=fileURLToPath(new URL('../export-preview.mjs',import.meta.url));
  const result=JSON.parse(execFileSync(process.execPath,[exporter,path.join(directory,'export')],{cwd:directory,encoding:'utf8'}));
  const exported=await readFile(result.output,'utf8');
  assert.equal(result.linkedMediaSources,3);
  assert.match(exported,/src="https:\/\/images\.example\.com\/a\.png\?version=1&amp;art=box"/);
  assert.match(exported,/const pictures=\["https:\/\/images\.example\.com\/a\.png\?version=1&art=box","https:\/\/images\.example\.com\/promo\.png"\]/);
  assert.match(exported,/url\('https:\/\/images\.example\.com\/promo\.png'\)/);
  assert.match(exported,/location\.protocol==='file:'/);assert.match(exported,/fetch\('\/api\/interests'\)/);
  assert.doesNotMatch(exported,/['"]\/media\//);
  await writeFile(path.join(directory,'dist/media-sources.json'),'{}');
  assert.throws(()=>execFileSync(process.execPath,[exporter,path.join(directory,'unresolved')],{cwd:directory,stdio:'pipe'}),/Command failed/);
 }finally{
  const target=path.resolve(directory);
  assert.equal(path.dirname(target),temporaryRoot);assert(path.basename(target).startsWith('stackr-export-'));
  await rm(target,{recursive:true,force:true});
 }
});
