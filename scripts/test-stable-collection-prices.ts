import assert from 'node:assert/strict';
import { mergeCollectionPriceRead, blocksIndependentPriceRead } from '../lib/stableCollectionPrices';
import { summariseCollectionPricing } from '../lib/collectionPricingState';
import type { CollectionPriceInput, CollectionPriceResult } from '../lib/collectionPricingApi';
const inputs: CollectionPriceInput[]=Array.from({length:250},(_,i)=>({key:String(i),references:[String(i)],quantity:1,
  language:'ja',setId:'set',variantCode:'normal',productType:'raw_card',condition:'near_mint'}));
const initial: CollectionPriceResult[]=inputs.map((i)=>({key:i.key,quantity:1,reference:i.key,variantId:i.key,
  central:10,status:'legacy_cached_market_estimate',freshness:'fresh',calculatedAt:'2026-09-18T00:00:00Z',staleAfter:'2026-09-20T00:00:00Z',unavailableReason:null,requestError:null}));
const previous=mergeCollectionPriceRead(inputs,initial,[]);
const partial=initial.map((r,i)=>i<60?{...r,central:8,calculatedAt:'2026-09-19T00:00:00Z'}:{...r,central:null,
  status:'unavailable' as const,requestError:'timeout',requestFailure:{kind:'service_error' as const,status:503,code:null,requestId:null,deferred:false}});
const merged=mergeCollectionPriceRead(inputs,partial,previous);
const summary=summariseCollectionPricing(merged.map(({result:r})=>({quantity:r.quantity,centralValue:r.central,evidenceStatus:r.status,freshness:r.freshness})));
assert.equal(summary.pricedUnits,250);assert.equal(summary.total,2380);assert.equal(summary.staleUnits,190);
assert.equal(mergeCollectionPriceRead(inputs.slice(1),partial.slice(1),merged).length,249,'removed cards stay removed');
assert.equal(mergeCollectionPriceRead([{...inputs[61],quantity:3}],[partial[61]],merged)[0].result.quantity,3);
assert.equal(mergeCollectionPriceRead([{...inputs[61],variantCode:'holo'}],[partial[61]],merged)[0].result.central,null,'corrected finish cannot reuse old quote');
assert.equal(mergeCollectionPriceRead([inputs[61]],[{...partial[61],requestError:null,requestFailure:undefined}],merged)[0].result.central,null,'authoritative invalidation removes evidence');
assert.equal(mergeCollectionPriceRead([inputs[61]],[partial[61]],[])[0].result.central,null,'account cleared state stays empty');
assert.equal(blocksIndependentPriceRead({kind:'service_error'}),false);
for(const kind of ['authentication_required','access_denied','rate_limited'])assert.equal(blocksIndependentPriceRead({kind}),true);
console.log('Stable price evidence: 250-to-60, decreases, removals, quantity changes, identity correction, invalidation and account clearing passed.');
