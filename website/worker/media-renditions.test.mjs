import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createMediaService} from './media.mjs';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4/8AAAAASUVORK5CYII=', 'base64'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const key='contents/archive-phone--'+digest(png).slice(0,12),masterUrl='https://images.example.com/archive/master.png',masterSha='b'.repeat(64),token='test-rendition-publisher-secret-at-least-32-chars';
const entry=()=>({kind:'stored-rendition',original:{url:masterUrl,sha256:masterSha},delivery:{sha256:digest(png),mime:'image/png',bytes:png.length}});
const request=(options={})=>new Request('https://stackr.test/media/'+key,options);
const upload=(options={})=>new Request('https://stackr.test/api/admin/media/'+key,{method:'POST',body:png,...options,headers:{'Content-Type':'image/png','X-StackR-Media-Import':token,...options.headers}});
function bucketMock(){const objects=new Map();let puts=0;const object=(key,saved,body)=>saved?{key,size:saved.bytes.length,httpEtag:'"'+digest(saved.bytes)+'"',httpMetadata:structuredClone(saved.options.httpMetadata),customMetadata:structuredClone(saved.options.customMetadata),...(body?{body:new Response(saved.bytes.slice()).body}:{})}:null;return {objects,get puts(){return puts;},async get(key){return object(key,objects.get(key),true);},async head(key){return object(key,objects.get(key),false);},async put(key,bytes,options){puts++;assert.equal(options.onlyIf.get('If-None-Match'),'*');if(objects.has(key))return null;objects.set(key,{bytes:Uint8Array.from(bytes),options});return object(key,objects.get(key),false);}};}

test('missing stored renditions never retrieve a master or pretend to transform it',async()=>{
 const bucket=bucketMock();let fetches=0;const service=createMediaService({sources:{[key]:entry()},fetchImpl:async()=>{fetches++;throw Error('Master must not be fetched');}});
 const get=await service.handleRequest(request(),{BUCKET:bucket});assert.equal(get.status,503);assert.deepEqual(await get.json(),{error:'photo_awaiting',code:'rendition_not_ready'});assert.equal(get.headers.get('Cache-Control'),'no-store');assert.equal(get.headers.get('Retry-After'),'30');
 const head=await service.handleRequest(request({method:'HEAD'}),{BUCKET:bucket});assert.equal(head.status,503);assert.equal(await head.text(),'');assert.equal(fetches,0);assert.equal(bucket.puts,0);
 const absent=await service.handleRequest(request(),{});assert.equal(absent.status,503);assert.equal((await absent.json()).code,'storage_unavailable');assert.equal(fetches,0);
});

test('a pinned rendition imports exact delivery bytes and keeps its distinct original provenance',async()=>{
 const bucket=bucketMock(),env={BUCKET:bucket,MEDIA_IMPORT_SECRET:token};let fetches=0;
 const service=createMediaService({sources:{[key]:entry()},fetchImpl:async()=>{fetches++;throw Error('No source fetch');}});
 const first=await service.handleImport(upload(),env);assert.equal(first.status,201);assert.deepEqual(await first.json(),{ok:true,key,sha256:digest(png),stored:true});
 const [[storageKey,saved]]=bucket.objects;assert.equal(storageKey,'stackr-shop-renditions/v1/'+digest([masterUrl,masterSha,digest(png),'image/png',png.length].join('\n')));assert.deepEqual(saved.bytes,png);assert.equal(saved.options.httpMetadata.contentType,'image/png');
 assert.deepEqual(saved.options.customMetadata,{source:masterUrl,sha256:digest(png),expectedsha256:digest(png),version:'1',kind:'stored-rendition',originalsha256:masterSha,deliverybytes:String(png.length)});
 assert.equal((await service.handleImport(upload(),env)).status,200);assert.equal(bucket.puts,1);
 const fresh=createMediaService({sources:{[key]:entry()},fetchImpl:async()=>{throw Error('Never fetch persisted rendition');}}),get=await fresh.handleRequest(request(),{BUCKET:bucket});assert.equal(get.status,200);assert.equal(get.headers.get('Content-Type'),'image/png');assert.equal(get.headers.get('Content-Length'),String(png.length));assert.deepEqual(new Uint8Array(await get.arrayBuffer()),png);
 const head=await fresh.handleRequest(request({method:'HEAD'}),{BUCKET:bucket});assert.equal(head.status,200);assert.equal(await head.text(),'');const conditional=await fresh.handleRequest(request({headers:{'If-None-Match':head.headers.get('ETag')}}),{BUCKET:bucket});assert.equal(conditional.status,304);assert.equal(fetches,0);
});

test('rendition declarations fail closed without an exact public original and pinned delivery identity',async()=>{
 const malformed=[value=>delete value.original.sha256,value=>value.original.url='https://user:secret@images.example.com/master.png',value=>value.original.url='http://images.example.com/master.png',value=>value.original.url='https://localhost/master.png',value=>value.original.sha256='bad',value=>delete value.delivery.sha256,value=>value.delivery.mime='text/html',value=>value.delivery.bytes=0,value=>value.delivery.bytes=png.length+.5,value=>value.delivery.bytes=10*1024*1024+1,value=>value.kind='unknown-rendition'];
 for(const mutate of malformed){const value=entry();mutate(value);const bucket=bucketMock();let calls=0;const service=createMediaService({sources:{[key]:value},fetchImpl:async()=>{calls++;throw Error('No fetch');}}),response=await service.handleRequest(request(),{BUCKET:bucket});assert.equal(response.status,502);assert.equal((await response.json()).code,'invalid_source');assert.equal((await service.handleImport(upload(),{BUCKET:bucket,MEDIA_IMPORT_SECRET:token})).status,502);assert.equal(bucket.puts,0);assert.equal(calls,0);}
});

test('rendition imports enforce delivery type, exact length and bytes before storing anything',async()=>{
 const bucket=bucketMock(),env={BUCKET:bucket,MEDIA_IMPORT_SECRET:token},service=createMediaService({sources:{[key]:entry()},fetchImpl:async()=>{throw Error('Never fetch');}});
 assert.equal((await service.handleImport(upload(),{BUCKET:bucket})).status,404);assert.equal((await service.handleImport(upload({headers:{'X-StackR-Media-Import':'wrong'}}),env)).status,403);
 const wrongType=await service.handleImport(upload({headers:{'Content-Type':'image/jpeg'}}),env);assert.equal(wrongType.status,415);assert.equal((await wrongType.json()).code,'import_content_type');
 for(const bytes of [png.subarray(0,png.length-1),Uint8Array.from([...png,0])]){const response=await service.handleImport(upload({body:bytes}),env);assert.equal(response.status,400);assert.equal((await response.json()).code,'import_size_mismatch');}
 const changed=png.slice();changed[changed.length-1]^=1;const hash=await service.handleImport(upload({body:changed}),env);assert.equal(hash.status,422);assert.equal((await hash.json()).code,'import_hash_mismatch');
 const bogus=await service.handleImport(upload({body:new Uint8Array(png.length)}),env);assert.equal(bogus.status,422);assert.equal((await bogus.json()).code,'import_not_image');assert.equal(bucket.puts,0);
});

test('rendition provenance or declared-size corruption is never served or overwritten',async()=>{
 for(const mutate of [saved=>saved.options.customMetadata.kind='original',saved=>saved.options.customMetadata.originalsha256='0'.repeat(64),saved=>saved.options.customMetadata.source='https://wrong.example/master.png',saved=>saved.options.customMetadata.deliverybytes=String(png.length+1),saved=>saved.bytes=Uint8Array.from([...png,0])]){const bucket=bucketMock(),env={BUCKET:bucket,MEDIA_IMPORT_SECRET:token},service=createMediaService({sources:{[key]:entry()}});await service.handleImport(upload(),env);mutate([...bucket.objects.values()][0]);const get=await service.handleRequest(request(),env);assert.equal(get.status,502);assert.equal((await get.json()).code,'cached_media_invalid');const again=await service.handleImport(upload(),env);assert.equal(again.status,502);assert.equal(bucket.puts,1);}
});

test('original source and rendition changes create new immutable objects while source snapshots stay fixed',async()=>{
 const bucket=bucketMock(),env={BUCKET:bucket,MEDIA_IMPORT_SECRET:token},first=entry(),service=createMediaService({sources:{[key]:first}});
 first.original.url='https://changed.example/master.png';first.original.sha256='0'.repeat(64);first.delivery.sha256='0'.repeat(64);first.delivery.bytes=1;
 assert.equal((await service.handleImport(upload(),env)).status,201);assert.equal([...bucket.objects.values()][0].options.customMetadata.source,masterUrl);
 for(const change of [value=>value.original.url+='?version=2',value=>value.original.sha256='c'.repeat(64)]){const value=entry();change(value);const next=createMediaService({sources:{[key]:value}});assert.equal((await next.handleRequest(request(),{BUCKET:bucket})).status,503);assert.equal((await next.handleImport(upload(),env)).status,201);}
 const next=entry(),changed=Uint8Array.from([...png,0]);next.delivery.sha256=digest(changed);next.delivery.bytes=changed.length;const delivery=createMediaService({sources:{[key]:next}});assert.equal((await delivery.handleImport(upload({body:changed}),env)).status,201);assert.equal(bucket.objects.size,4);assert([...bucket.objects.keys()].every(key=>key.startsWith('stackr-shop-renditions/v1/')));
 const original=createMediaService({sources:{[key]:{url:masterUrl,sha256:digest(png),mime:'image/png'}},fetchImpl:async()=>new Response(png,{headers:{'Content-Type':'image/png'}})});assert.equal((await original.handleRequest(request(),{BUCKET:bucket})).status,200);assert.equal(bucket.objects.size,5);assert([...bucket.objects.keys()].some(key=>key.startsWith('stackr-shop-originals/v1/')));
});
