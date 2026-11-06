import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/shop-state.js',import.meta.url),'utf8');
const registry=JSON.parse(readFileSync(new URL('../src/collection-set-links.json',import.meta.url),'utf8'));
const context={setCollectionLinks:registry,encodeURIComponent};
vm.runInNewContext(source.slice(source.indexOf('function collectionLinkFor('),source.indexOf('function renderSetHighlights('))+'\nglobalThis.link=collectionLinkFor;',context);
test('only the curated cover release gets direct shop collection links with exact canonical identities',()=>{
 let ready=0;
 for(const [key,entry]of Object.entries(registry.matches)){
  const language={en:'English',ja:'Japanese','zh-cn':'Simplified Chinese','zh-tw':'Traditional Chinese',ko:'Korean'}[entry.language],result=context.link({setKey:key,language,setName:entry.shopSetName});
  const u=new URL(result.href,'https://site.test');assert.equal(u.pathname,'/collection');
  if(entry.binderReady){ready++;assert.equal(u.searchParams.get('set'),entry.setId);assert.equal(u.searchParams.get('language'),entry.language);assert.equal(result.label,'Collect this set');}
  else{assert.equal(u.hash,'#sets');assert.equal(u.searchParams.has('set'),false);assert.equal(result.label,'View collector binders');}
 }
 assert.equal(ready,7);
});
test('unmatched, wrong-language and mixed-set products never claim an exact catalogue binding',()=>{
 const unknown=context.link({setKey:'unmatched',language:'Korean',setName:'A & B'});const q=new URL(unknown.href,'https://site.test');assert.equal(q.searchParams.has('set'),false);assert.equal(q.hash,'#sets');assert.equal(unknown.label,'View collector binders');
 const wrong=context.link({setKey:'jp-storm-emeralda',language:'English',setName:'Storm Emeralda'});assert.equal(new URL(wrong.href,'https://site.test').searchParams.has('set'),false);
 assert.equal(context.link({setKey:'collections',language:'English'}).href,'/collection#library');
});
