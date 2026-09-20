import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeCollectionPriceRead, blocksIndependentPriceRead, storedCollectionPriceResults } from '../lib/stableCollectionPrices';
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

import { hasLowerPreparedPriceCoverage, isPreparedGeneralValuation, preparedGeneralPricingSummary, preparedValuationTrend, preferredPreparedValuation, type PreparedGeneralValuation, type PreparedValuation } from '../lib/preparedCollectionValuation';
const now=Date.parse('2026-09-19T03:00:00Z');
const prepared={total:8,currency:'GBP',totalUnits:4,distinctPriceIdentities:4,pricedUnits:4,freshUnits:4,olderPriceUnits:0,unpricedUnits:0,
  pending:0,retrying:0,unsupported:0,unresolved:0,noProviderQuote:0,oldestSourceAt:null,latestSourceAt:null,
  collectionRevision:'collection',valuationRevision:'valuation',calculatedAt:'2026-09-19T01:00:00Z',refresh:null,trend:{scope:'s',evidence:'b',eligible:true,points:[
  {at:'2026-09-18T01:00:00Z',total:10,evidence:'a'},{at:'2026-09-19T01:00:00Z',total:8,evidence:'b'}]},binders:[]} as PreparedValuation;
assert.deepEqual(preparedValuationTrend(prepared,7,now),{values:[10,8],change:-2,percent:-20});
assert.equal(preparedValuationTrend({...prepared,unpricedUnits:1},7,now).values.length,0);
assert.equal(preparedValuationTrend({...prepared,total:9},7,now).values.length,0);
assert.equal(preparedValuationTrend({...prepared,trend:undefined},7,now).values.length,0);
const general = { total: 13, currency: 'GBP', totalUnits: 4, distinctPriceIdentities: 4, pricedUnits: 3,
  exactPricedUnits: 1, generalEstimateUnits: 2, freshUnits: 3, olderPriceUnits: 0, unpricedUnits: 1,
  pending: 1, retrying: 0, unsupported: 0, unresolved: 0, noProviderQuote: 0, oldestSourceAt: null, latestSourceAt: null,
  valuationBasis: 'general_card_estimate', binders: [] } as PreparedGeneralValuation;
assert.equal(preparedGeneralPricingSummary(general)?.total, 13);
assert.equal(preparedGeneralPricingSummary(general)?.generalEstimateUnits, 2);
const exactForGeneral = { ...prepared, currency: 'GBP', totalUnits: 4, distinctPriceIdentities: 4, pricedUnits: 1,
  freshUnits: 1, olderPriceUnits: 0, unpricedUnits: 3, pending: 3, retrying: 0, unsupported: 0,
  unresolved: 0, noProviderQuote: 0, oldestSourceAt: null, latestSourceAt: null } as PreparedValuation;
assert.equal(isPreparedGeneralValuation(preferredPreparedValuation({ ...exactForGeneral, general })), true);
assert.equal(preferredPreparedValuation({ ...exactForGeneral, general: { ...general, pricedUnits: 2 } }).total, 8,
  'Invalid additive coverage never replaces the established exact valuation.');
assert.equal(preferredPreparedValuation({ ...exactForGeneral, totalUnits: 5, pricedUnits: 2, general }).total, 8,
  'A general summary for a different collection cannot replace the exact valuation.');
const retained = storedCollectionPriceResults(inputs, previous);
const retainedSummary = summariseCollectionPricing(retained.map((result) => ({
  quantity: result?.quantity,
  centralValue: result?.central,
  evidenceStatus: result?.status,
  freshness: result?.freshness,
})));
assert.equal(hasLowerPreparedPriceCoverage({ totalUnits: 366, pricedUnits: 103, unpricedUnits: 263 }, retainedSummary), true,
  'A lower-coverage prepared subtotal must not erase current exact saved evidence, even when its reported unit count differs.');
assert.equal(hasLowerPreparedPriceCoverage({ totalUnits: 366, pricedUnits: 250, unpricedUnits: 116 }, retainedSummary), false);
assert.equal(hasLowerPreparedPriceCoverage({ totalUnits: 366, pricedUnits: 103, unpricedUnits: 0 }, retainedSummary), false);
const afterRemoval = storedCollectionPriceResults(inputs.slice(1), previous);
const afterRemovalSummary = summariseCollectionPricing(afterRemoval.map((result) => ({
  quantity: result?.quantity,
  centralValue: result?.central,
  evidenceStatus: result?.status,
  freshness: result?.freshness,
})));
assert.equal(afterRemovalSummary.total, 2490, 'Removed identities are not retained in the fallback subtotal.');
assert.equal(storedCollectionPriceResults([{ ...inputs[0], variantCode: 'holo' }], previous)[0], null,
  'A changed finish cannot reuse a normal-card quote.');
const invalidated = mergeCollectionPriceRead([inputs[0]], [{ ...initial[0], central: null, status: 'unavailable', requestError: null }], previous);
assert.equal(storedCollectionPriceResults([inputs[0]], invalidated)[0]?.central, null,
  'An authoritative invalidation cannot be retained by the prepared-coverage guard.');
const homeSource = readFileSync('features/home/HubScreen.tsx', 'utf8');
assert.match(homeSource,
  /if \(!selectedPricing \|\| hasLowerPreparedPriceCoverage\(selectedSummary, retainedStoredPricing\)\) \{[\s\S]{0,160}preparedValuationAvailableRef\.current = false;[\s\S]{0,80}prepared = null;[\s\S]{0,120}\} else \{[\s\S]{0,100}preparedValuationAvailableRef\.current = true;/,
  'A lower-coverage prepared response must take the existing stored-price path, while accepted prepared coverage keeps the prepared path.');
