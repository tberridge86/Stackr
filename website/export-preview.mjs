import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

// Inline local assets; linked source photography falls back gracefully offline.
const root=process.cwd();
const destination=path.resolve(process.argv[2]||'working/export');
await fs.mkdir(destination,{recursive:true});
let html=await fs.readFile(path.join(root,'dist/index.html'),'utf8');
// Only our own content-hashed local bundle may be embedded for file export.
for(const match of [...html.matchAll(/<script\s+defer\s+src="\/assets\/(shop-[a-f0-9]{12}\.js)"\s*><\/script>/g)]){
 const script=await fs.readFile(path.join(root,'dist/assets',match[1]),'utf8');
 html=html.replace(match[0],()=>'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
}
if(/<script\b[^>]*\bsrc=/i.test(html))throw Error('Unexpected external runtime dependency');
const mediaReference=/(?<=["'(=\s])\/media\/([a-zA-Z0-9_/-]+)/g;
let mediaSources={};
try{mediaSources=JSON.parse(await fs.readFile(path.join(root,'dist/media-sources.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT'||/(?<=["'(=\s])\/media\//.test(html))throw Error('Build the pinned media source map before exporting');}
if(!mediaSources||typeof mediaSources!=='object'||Array.isArray(mediaSources))throw Error('Invalid media source map');
const linkedMedia=new Set();
function sourceUrl(key){
 const source=mediaSources[key];if(!source||typeof source.url!=='string')throw Error('Unresolved media source: '+key);
 let url;try{url=new URL(source.url);}catch{throw Error('Invalid media source: '+key);}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||!host.includes('.')||host.endsWith('.')||/^(?:\[.*\]|\d+(?:\.\d+){3})$/.test(host)||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host))throw Error('Non-public media source: '+key);
 linkedMedia.add(key);
 // Percent-encoding apostrophes is safe in HTML attributes, JS strings and CSS URLs.
 return url.href.replaceAll("'",'%27');
}
function rewriteMedia(text,htmlContext){
 return text.replace(mediaReference,(_,key)=>{
  const value=sourceUrl(key);
  return htmlContext?value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'):value;
 });
}
// Script/style text does not decode HTML entities. Keep both contexts valid,
// and replace complete keys so e.g. products/p cannot corrupt products/promo.
let rewritten='',position=0;
for(const match of html.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)){
 rewritten+=rewriteMedia(html.slice(position,match.index),true)+rewriteMedia(match[0],false);
 position=match.index+match[0].length;
}
html=rewritten+rewriteMedia(html.slice(position),true);
if(/(?<=["'(=\s])\/media\//.test(html))throw Error('Unresolved relative media reference');
const files=await fs.readdir(path.join(root,'dist/assets'));
let embedded=0;
for(const file of files){
 const reference='assets/'+file;
 if(!html.includes(reference))continue;
 const ext=path.extname(file).slice(1);
 const mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp',svg:'image/svg+xml',ttf:'font/ttf',woff2:'font/woff2',pdf:'application/pdf',txt:'text/plain'}[ext]||'application/octet-stream';
 const bytes=await fs.readFile(path.join(root,'dist/assets',file));
 html=html.replaceAll(reference,'data:'+mime+';base64,'+bytes.toString('base64'));
 embedded++;
}
if(/["'(]\s*assets\/[A-Za-z0-9_.-]+/.test(html))throw Error('Unembedded local asset reference');
if(/<script[^>]+src=/.test(html))throw Error('Unexpected external runtime dependency');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
 new vm.Script(match[1],{filename:'StackR-offline-preview.js'});
}
const output=path.join(destination,'StackR_Card_Shop_Preview.html');
await fs.writeFile(output,html);
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),embeddedAssets:embedded,linkedMediaSources:linkedMedia.size}));
