#!/usr/bin/env node
/** Run from the repository root AFTER the PNG pack has been imported. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const assetRoot = 'assets/rev2/12-chinese-set-logos';
const receipt = JSON.parse(fs.readFileSync(path.join(root,assetRoot,'manifest.json'),'utf8'));
const snapshot = JSON.parse(fs.readFileSync('docs/releases/chinese-logo-pack-20260917.json','utf8'));
assert.equal(receipt.records.length,134);
assert.equal(receipt.mappedCount,123);
assert.equal(receipt.unresolvedCount,11);
const checksum = (b) => crypto.createHash('sha256').update(b).digest('hex');
const canonicalIds = new Set();
for (const r of receipt.records) {
  assert.equal(r.language,'zh-cn');
  assert.match(r.logoFile,/^logos\/[a-z0-9][a-z0-9._-]*\.png$/);
  const bytes=fs.readFileSync(path.join(root,assetRoot,r.logoFile));
  assert.equal(checksum(bytes),r.sha256);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),r.width);assert.equal(bytes.readUInt32BE(20),r.height);
  if(r.status==='mapped') {
    assert.equal(snapshot.activePublishedIdsByCode[r.code],r.canonicalSetId);
    assert.ok(!canonicalIds.has(r.canonicalSetId));canonicalIds.add(r.canonicalSetId);
  } else assert.equal(r.canonicalSetId,null);
}
assert.equal(canonicalIds.size,123);
const source=fs.readFileSync('lib/simplifiedChineseSetLogos.ts','utf8');
const result=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
assert.equal((result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const moduleBox={exports:{}};
let requiredPngs=0;
vm.runInNewContext(result.outputText,{module:moduleBox,exports:moduleBox.exports,require:(request)=>{
  assert.ok(request.endsWith('.png'),'No new runtime library/provider dependency.');
  const filename=path.resolve(root,'lib',request);
  assert.ok(fs.existsSync(filename));requiredPngs++;
  return filename;
}});
assert.equal(requiredPngs,123,'Metro requires a literal existing PNG per mapped identity.');
const get=moduleBox.exports.getSimplifiedChineseSetLogoSourceForSet;
for(const r of receipt.records.filter(x=>x.status==='mapped')) {
  const expected=path.join(root,assetRoot,r.logoFile);
  for(const language of ['zh-cn','zh_CN','zh-Hans','zh-Hans-CN']) assert.equal(get({id:r.canonicalSetId,language,setCode:r.sourceCode}),expected);
  assert.equal(get({setId:r.canonicalSetId},'zh-cn'),expected);
  for(const language of ['ja','en','ko','zh-tw','zh-Hant','zh','zh-Hans-TW','']) assert.equal(get({id:r.canonicalSetId,language},'zh-cn'),null);
  assert.equal(get({id:r.canonicalSetId}),null);
  assert.equal(get({id:r.canonicalSetId,language:'zh-cn',setCode:'wrong'}),null);
  assert.equal(get({id:r.canonicalSetId,language:'zh-cn',setCode:r.code,externalIds:{setCode:'wrong'}}),null);
  assert.equal(get({id:r.canonicalSetId,setId:'another',language:'zh-cn'}),null);
  assert.equal(get({id:'unknown',setCode:r.code,name:r.sourceName,language:'zh-cn'}),null);
  assert.equal(get({id:r.code,setCode:r.code,language:'zh-cn'}),null);
}
for(const r of receipt.records.filter(x=>x.status==='unresolved')) assert.equal(get({id:r.assetId,name:r.sourceName,setCode:r.code,language:'zh-cn'}),null);
for(const id of ['constructor','__proto__','prototype']) assert.equal(get({id,language:'zh-cn'}),null);
const explore=fs.readFileSync('app/(tabs)/explore.tsx','utf8');
assert.ok(explore.includes("from '../../lib/simplifiedChineseSetLogos'"));
assert.match(explore,/getLocalSetArtworkSourceForSet\(\{[\s\S]*?\}\) \?\? getSimplifiedChineseSetLogoSourceForSet\(/);
assert.ok(explore.includes('chineseSetDisplayCode'));
assert.ok(explore.includes('resizeMode="contain"'));
const visibleCodeBlock = explore.match(/const chineseSetDisplayCode =[\s\S]*?;\n/);
assert.ok(visibleCodeBlock, 'The printed-code display block must exist.');
assert.ok(!/\bitem\.id\b/.test(visibleCodeBlock[0]), 'UUIDs must not become visible printed set codes.');
console.log('134 unchanged PNGs verified; 123 exact Simplified Chinese identities resolve; 11 unresolved entries remain unmapped. No release/device claim.');
