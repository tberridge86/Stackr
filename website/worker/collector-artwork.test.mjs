import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';

test('the compiled Worker serves every local collector logo with its verified source or bounded header rendition',async()=>{
 const registry=JSON.parse(readFileSync(new URL('../src/collection-set-logos.json',import.meta.url),'utf8'));
 const files=new Map(registry.logos.filter(row=>row.file).map(row=>[row.file,row]));
 assert.ok(files.size>0);
 for(const row of files.values()){
  const response=await worker.fetch(new Request('https://shop.test/assets/'+row.file),{}, {waitUntil(){}});
  assert.equal(response.status,200,row.siteLogoKey+' must be in the deployment artifact');
  assert.match(response.headers.get('content-type'),/^image\//);
  const bytes=new Uint8Array(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.headerRendition?.sha256||row.sha256,(row.siteLogoKey||row.setId)+' must retain the approved delivery bytes');
  if(row.headerRendition){
   assert.equal(createHash('sha256').update(readFileSync(row.headerRendition.sourcePath)).digest('hex'),row.originalSha256,'Keep the exact canonical master as provenance');
   assert.ok(bytes.length<=65536,'Do not load a multi-megabyte original into a small header');
  }
 }
});
