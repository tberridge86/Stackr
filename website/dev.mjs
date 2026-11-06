import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import worker from './dist/server/index.js';

// Local HTTP adapter for the same compiled Worker used in production.
// Storage bindings are supplied only by hosting; the Worker handles their absence.
let ownerPreview;
async function previewOwnerEnvironment(){if(ownerPreview)return ownerPreview;const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const entry of journal.entries)db.exec(await readFile('drizzle/'+entry.tag+'.sql','utf8'));const DB={prepare(query){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(query).get(...args)||null;},async all(){return {success:true,results:db.prepare(query).all(...args)};},async run(){return this.sync();},sync(){const r=db.prepare(query).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){db.exec('BEGIN');try{const r=statements.map(s=>s.sync());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};return ownerPreview={DB,SHOP_OWNER_EMAIL:'owner@preview.invalid'};}
const option=(flag,fallback)=>{const i=process.argv.indexOf(flag);return i<0?fallback:process.argv[i+1];};
const port=Number(option('--port',process.env.PORT||'3000'));
const host=option('--host','0.0.0.0');
createServer(async(req,res)=>{
 try{
  // Development-only responsive harness: the iframe runs the unchanged shop.
  if(['/__preview/mobile','/__preview/history','/__preview/owner-mobile','/__preview/collection-mobile','/__preview/collector-covers-mobile','/__preview/trial30-mobile'].includes(req.url)){
   const framePath=req.url==='/__preview/history'?'/history':req.url==='/__preview/owner-mobile'?'/__preview/owner':req.url==='/__preview/collection-mobile'?'/__preview/collection':req.url==='/__preview/collector-covers-mobile'?'/__preview/collector-covers':req.url==='/__preview/trial30-mobile'?'/__preview/trial30-artwork':'/';
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>StackR mobile review</title><style>body{margin:0;background:#e8e9f0;font:14px system-ui;display:flex;justify-content:center;gap:32px;padding:16px}main{display:flex;flex-direction:column;gap:10px}iframe{border:1px solid #c9ccda;background:white;width:390px;height:844px;max-width:none}label{display:flex;gap:12px;align-items:center}select{font:inherit;padding:5px}</style><main><label>Viewport <select aria-label="Preview width" onchange="document.querySelector(\'iframe\').style.width=this.value+\'px\'"><option value="390">390 px</option><option value="320">320 px</option><option value="430">430 px</option></select></label><iframe src="'+framePath+'" title="StackR mobile shop"></iframe></main>');return;
  }
  if(req.url==='/__preview/trial30-artwork'){const html=await readFile('working/trial30-artwork-review.html','utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
  if(req.url==='/__preview/collector-covers'){
   const html=await readFile('working/collector-cover-review.html','utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;
  }
  if(['/__preview/owner','/__preview/collection'].includes(req.url)){
   const isCollection=req.url==='/__preview/collection';const html=await readFile(isCollection?'dist/collection.html':'dist/owner.html','utf8');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end(html.replace('<body>','<body><div style="padding:8px;background:#ffe5c9;text-align:center;font:12px system-ui">LOCAL PREVIEW · disposable records only</div>').replace('<script>',`<script>const actualFetch=window.fetch.bind(window);window.fetch=(url,options)=>actualFetch(typeof url==='string'&&url.startsWith('/api/owner')?url.replace('/api/owner','/__preview/owner-api'):typeof url==='string'&&url.startsWith('/api/binders')?url.replace('/api/binders','/__preview/binder-api'):url,options);</script><script>`));return;
  }
  // Optional read-only cache of exact, hash-verified hosted originals for visual QA.
  if(req.url?.startsWith('/media/')){
   try{
    const manifest=JSON.parse(await readFile('working/preview-media/manifest.json','utf8')),entry=manifest[req.url];
    if(entry&&/^[a-f0-9]{64}$/.test(entry.sha256)){
     const bytes=await readFile('working/preview-media/'+entry.sha256);
     res.writeHead(200,{'Content-Type':entry.mime,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return;
    }
   }catch{}
  }
  const method=req.method||'GET',headers=new Headers();
  for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
  const request=new Request('http://'+headers.get('host')+req.url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
  let input=request,environment={};if(req.url?.startsWith('/__preview/owner-api')||req.url?.startsWith('/__preview/binder-api')){environment=await previewOwnerEnvironment();const h=new Headers(request.headers);h.set('oai-authenticated-user-id','preview-owner');h.set('oai-authenticated-user-email','owner@preview.invalid');input=new Request(request.url.replace('/__preview/owner-api','/api/owner').replace('/__preview/binder-api','/api/binders'),{method:request.method,headers:h,...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{})});}
  const response=await worker.fetch(input,environment, {waitUntil:promise=>promise.catch(()=>{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Local preview unavailable.');}
}).listen(port,host,()=>console.log('StackR preview listening on '+host+':'+port));
