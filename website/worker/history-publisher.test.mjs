import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';

test('completed history publication retires its temporary upload route while immutable delivery remains available',async()=>{
 const history=JSON.parse(readFileSync('src/pokemon-history.json','utf8')),image=history.events.find(e=>e.id==='1996-first-tcg').image;
 const bytes=readFileSync('src/assets/'+image.file),key='contents/history-'+image.id+'--'+image.sha256.slice(0,12);
 const own='history-publisher-test-secret-at-least-32-characters',old='existing-media-test-secret-at-least-32-characters';
 const objects=new Map();let puts=0;
 const object=(stored,body)=>stored?{size:stored.bytes.length,httpEtag:'"'+image.sha256+'"',httpMetadata:stored.options.httpMetadata,customMetadata:stored.options.customMetadata,...(body?{body:new Response(stored.bytes).body}:{})}:null;
 const BUCKET={async get(k){return object(objects.get(k),true);},async head(k){return object(objects.get(k),false);},async put(k,data,options){puts++;assert.equal(options.onlyIf.get('If-None-Match'),'*');if(objects.has(k))return null;objects.set(k,{bytes:Uint8Array.from(data),options});return object(objects.get(k),false);}};
 const env={BUCKET,MEDIA_IMPORT_SECRET:old,HISTORY_MEDIA_IMPORT_SECRET:own};
 const upload=(prefix= '/api/admin/history-media/',token=own,k=key)=>new Request('https://stackr.test'+prefix+k,{method:'POST',body:bytes,headers:{'Content-Type':image.mime,'X-StackR-Media-Import':token}});
 assert.equal((await worker.fetch(upload(),{...env,HISTORY_MEDIA_IMPORT_SECRET:undefined})).status,404);
 assert.equal((await worker.fetch(upload('/api/admin/history-media/',old),env)).status,404);
 assert.equal((await worker.fetch(upload('/api/admin/history-media/',own,'products/black-bundle'),env)).status,404);
 assert.equal((await worker.fetch(upload(),env)).status,404,'even a stale runtime binding cannot reopen the retired route');
 const saved=await worker.fetch(upload('/api/admin/media/',old),env);assert.equal(saved.status,201);assert.equal((await saved.json()).sha256,image.sha256);
 assert.equal((await worker.fetch(upload('/api/admin/media/',old),env)).status,200);assert.equal(puts,1);
 assert.equal((await worker.fetch(upload('/api/admin/media/',own),env)).status,403,'existing publisher secret must stay separate');
 assert.equal((await worker.fetch(upload('/api/admin/media/',old),env)).status,200);
 const disabled={...env,HISTORY_MEDIA_IMPORT_SECRET:undefined};assert.equal((await worker.fetch(upload(),disabled)).status,404);
 const delivered=await worker.fetch(new Request('https://stackr.test/media/'+key),disabled);assert.equal(delivered.status,200);
 assert.equal(createHash('sha256').update(new Uint8Array(await delivered.arrayBuffer())).digest('hex'),image.sha256);
});
