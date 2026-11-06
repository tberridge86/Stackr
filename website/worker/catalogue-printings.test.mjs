import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCataloguePrinting,mergeCataloguePrintings} from './catalogue-printings.mjs';
const normal={variantId:'normal-id',canonicalId:'pokemon:en:set:028:normal',finishCode:'normal',image:{permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com/normal.webp'}};
const holo={variantId:'holo-id',canonicalId:'pokemon:en:set:028:holo',finishCode:'holo',image:{permissionStatus:'approved',deliveryUrl:'https://assets.stackrtcg.com/holo.webp'}};
const row=variant=>({cardId:'printing-028',game:'pokemon',set:{setId:'set'},languageCode:'en',names:{englishDisplay:'Card'},collectorNumber:{value:'028'},catalogueVersionId:'version-1',defaultVariantId:variant.variantId,variants:[variant],updatedAt:'2026-11-05T10:00:00Z'});
test('finish rows become one printing without changing variant IDs, default choice or inputs',()=>{
 const input=[row(normal),{...row(holo),updatedAt:'2026-11-05T11:00:00Z'},row(normal)],before=structuredClone(input),merged=mergeCataloguePrintings(input);
 assert.equal(merged.length,1);assert.deepEqual(merged[0].variants,[normal,holo]);assert.equal(merged[0].defaultVariantId,normal.variantId);assert.equal(merged[0].updatedAt,'2026-11-05T11:00:00Z');assert.deepEqual(input,before);
 assert.deepEqual(mergeCataloguePrinting(merged[0],row(holo)),merged[0]);
});
test('different names, language, set, printing numbers or catalogue versions cannot be combined',()=>{
 for(const patch of [{names:{englishDisplay:'Different'}},{languageCode:'ja'},{set:{setId:'other'}},{collectorNumber:{value:'029'}},{catalogueVersionId:'version-2'}])assert.throws(()=>mergeCataloguePrintings([row(normal),{...row(holo),...patch}]),/conflicting/);
 for(const patch of [{canonicalId:'different'},{finishCode:'reverse_holo'},{image:{permissionStatus:'unapproved',deliveryUrl:'https://other.example/art.webp'}}])assert.throws(()=>mergeCataloguePrintings([row(normal),{...row(normal),variants:[{...normal,...patch}]}]),/conflicting/);
});
test('provider aliases are retained explicitly, never silently rewritten into a guessed finish ID',()=>{
 const alias={...holo,variantId:'provider-holo-alias'},merged=mergeCataloguePrintings([row(holo),row(alias)])[0];assert.deepEqual(merged.variants.map(v=>v.variantId),['holo-id','provider-holo-alias']);assert.equal(merged.defaultVariantId,'holo-id');
});
test('invalid identities or a default absent from the supplied variants fail closed',()=>{
 for(const value of [null,{}, {...row(normal),variants:null},{...row(normal),defaultVariantId:'unknown'}])assert.throws(()=>mergeCataloguePrintings([value]),/conflicting/);
});
