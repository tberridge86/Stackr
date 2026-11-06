import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {renderSitePage} from './worker/site-pages.mjs';
import {READY_CATALOGUES,decodeReadyBundle} from './worker/binder-ready.mjs';

const root=process.cwd();
const html=await fs.readFile(path.join(root,'dist/index.html'),'utf8');
const historyHtml=await fs.readFile(path.join(root,'dist/history.html'),'utf8');
const aboutHtml=await fs.readFile(path.join(root,'dist/about.html'),'utf8');
const notFoundHtml=await fs.readFile(path.join(root,'dist/404.html'),'utf8');
const ownerHtml=await fs.readFile(path.join(root,'dist/owner.html'),'utf8');
const collectionHtml=await fs.readFile(path.join(root,'dist/collection.html'),'utf8');
const shopScriptNames=[...html.matchAll(/<script\s+defer\s+src="\/assets\/(shop-[a-f0-9]{12}\.js)"/g)].map(match=>match[1]);
const shopScriptReferences=(await Promise.all(shopScriptNames.map(name=>fs.readFile(path.join(root,'dist/assets',name),'utf8')))).join('\n');
const assets={};
const types={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf','.webmanifest':'application/manifest+json','.js':'text/javascript; charset=utf-8'};
for(const name of await fs.readdir(path.join(root,'dist/assets'))){
 if(!(await fs.stat(path.join(root,'dist/assets',name))).isFile()||(!html.includes('assets/'+name)&&!shopScriptReferences.includes('assets/'+name)&&!historyHtml.includes('assets/'+name)&&!aboutHtml.includes('assets/'+name)&&!notFoundHtml.includes('assets/'+name)&&!ownerHtml.includes('assets/'+name)&&!collectionHtml.includes('assets/'+name)&&!['inter-license.txt','bricolage-ofl.txt','icon-512.png'].includes(name)))continue;
 const bytes=await fs.readFile(path.join(root,'dist/assets',name));
 assets[name]={data:bytes.toString('base64'),mime:types[path.extname(name)]||'application/octet-stream',hash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
let pricing=await fs.readFile(path.join(root,'worker/pricing.mjs'),'utf8');
if(/^\s*import\s/m.test(pricing)||/^\s*export\s+(?:default|\{)/m.test(pricing))throw Error('Pricing module must use dependency-free named declarations');
pricing=pricing.replace(/^export (?=(?:const|function|class)\b)/gm,'');
let worker=await fs.readFile(path.join(root,'worker/index.js'),'utf8');
const printingHelpers=(await fs.readFile(path.join(root,'worker/catalogue-printings.mjs'),'utf8')).replace(/^export /gm,'');
const readyManifest=JSON.parse(await fs.readFile(path.join(root,'catalogue-cache/manifest.json'),'utf8')),readyBundles={};
if(readyManifest.schema!==1||readyManifest.source!=='https://api.stackrtcg.com/v1'||!Array.isArray(readyManifest.catalogues)||readyManifest.catalogues.length!==READY_CATALOGUES.length)throw Error('Complete public catalogue manifest required');
for(const spec of READY_CATALOGUES){
 const entries=readyManifest.catalogues.filter(row=>row.setId===spec.setId&&row.language===spec.language);if(entries.length!==1)throw Error('One ready bundle per canonical set required');
 const entry=entries[0];if(entry.file!==spec.setId+'-'+spec.language+'.json.gz'||entry.total!==spec.total)throw Error('Ready bundle identity mismatch');
 const bytes=await fs.readFile(path.join(root,'catalogue-cache',entry.file));
 if(bytes.length!==entry.compressedBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Ready bundle checksum mismatch');
 const record={encoding:'gzip-base64',data:bytes.toString('base64')},value=await decodeReadyBundle(record,spec);
 if(value.capturedAt!==entry.capturedAt||value.catalogueVersionId!==entry.catalogueVersionId||value.sourceRows!==entry.sourceRows||Buffer.byteLength(JSON.stringify(value))!==entry.uncompressedBytes)throw Error('Ready bundle manifest mismatch');
 readyBundles[spec.setId]=record;
}
const binderReady=(await fs.readFile(path.join(root,'worker/binder-ready.mjs'),'utf8')).replace("import {mergeCataloguePrintings} from './catalogue-printings.mjs';",'').replace('const READY_BUNDLE_DATA={};',()=> 'const READY_BUNDLE_DATA='+JSON.stringify(readyBundles)+';').replace(/^export (?=(?:async\s+)?(?:const|function|class)\b)/gm,'');
const sitePages=(await fs.readFile(path.join(root,'worker/site-pages.mjs'),'utf8')).replace(/^export (?=(?:const|function)\b)/gm,'');
worker=worker.replace("import {renderSitePage} from './site-pages.mjs';",()=>sitePages);
worker=worker.replace("import {createPriceService} from './pricing.mjs';",()=>`const createPriceService=(()=>{\n${pricing}\nreturn createPriceService;\n})();`);
for(const[file,name]of [['shop-state.mjs','createShopService'],['media.mjs','createMediaService'],['checkout.mjs','createCheckoutService'],['owner.mjs','createOwnerService'],['binders.mjs','createBinderService']]){
 let source=await fs.readFile(path.join(root,'worker',file),'utf8');
 if(file==='binders.mjs')source=source.replace("import {mergeCataloguePrintings} from './catalogue-printings.mjs';",()=>'__PRINTING_HELPERS__');
 if(file==='binders.mjs')source=source.replace('__PRINTING_HELPERS__',()=>printingHelpers);
 if(file==='binders.mjs')source=source.replace("import {createBinderReadyService,readyReference} from './binder-ready.mjs';",()=>binderReady);
 if(/^\s*import\s/m.test(source)||/^\s*export\s+(?:default|\{)/m.test(source))throw Error('Worker modules must use dependency-free named declarations');
 source=source.replace(/^export (?=(?:async\s+)?(?:const|function|class)\b)/gm,'');
 worker=worker.replace('import {'+name+"} from './"+file+"';",()=>`const ${name}=(()=>{\n${source}\nreturn ${name};\n})();`);
}
const products=JSON.parse(await fs.readFile(path.join(root,'src/products.json'),'utf8'));
const sources=JSON.parse(await fs.readFile(path.join(root,'worker/price-sources.json'),'utf8'));
const seeds=JSON.parse(await fs.readFile(path.join(root,'src/pricing-seeds.json'),'utf8'));
const mediaSources=JSON.parse(await fs.readFile(path.join(root,'dist/media-sources.json'),'utf8'));
const replacements={__COLLECTION_HTML__:collectionHtml,__OWNER_HTML__:ownerHtml,__SITE_HTML__:html,__HISTORY_HTML__:historyHtml,__ABOUT_HTML__:aboutHtml,__NOT_FOUND_HTML__:notFoundHtml,__SITE_ASSETS__:assets,__PRICE_PRODUCTS__:products,__PRICE_SOURCES__:sources,__PRICE_SEEDS__:seeds,__MEDIA_SOURCES__:mediaSources};
for(const[key,value]of Object.entries(replacements))worker=worker.replace(key,()=>JSON.stringify(value));
if(/__(?:SITE|PRICE|MEDIA|HISTORY|ABOUT|NOT_FOUND)_[A-Z_]+__/.test(worker))throw Error('Unfilled Worker template');
const output=path.join(root,'dist/server/index.js');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,worker);
await fs.mkdir(path.join(root,'dist/.openai'),{recursive:true});
await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
const module=await import(pathToFileURL(output).href+'?verify='+Date.now());
if(typeof module.default?.fetch!=='function')throw Error('Worker must export default.fetch');
const response=await module.default.fetch(new Request('https://stackr.local/'));
if(response.status!==200||(await response.text())!==renderSitePage(html,'/','https://stackr.local'))throw Error('Worker HTML route failed');
// Final archive boundary: only runtimes referenced by this compiled HTML ship.
for(const name of await fs.readdir(path.join(root,'dist/assets')))if(/^shop-[a-f0-9]{12}\.js$/.test(name)&&!shopScriptNames.includes(name))await fs.unlink(path.join(root,'dist/assets',name));
console.log(JSON.stringify({worker:output,workerBytes:Buffer.byteLength(worker),assetCount:Object.keys(assets).length,priceSources:Object.keys(sources).length}));
