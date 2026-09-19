import assert from 'node:assert/strict';
import express from 'express';
import { createV1Router } from '../backend/routes/v1.js';
const owner='44444444-4444-4444-8444-444444444444';
const seen=[];
const summary={collectionRevision:'r1',valuationRevision:'v1',total:2380,totalUnits:250,pricedUnits:250,olderPriceUnits:190,freshUnits:60};
const app=express();app.use(express.json());
app.use('/v1',createV1Router({env:{STACKR_PRICING_ACCESS_MODE:'personal',STACKR_PRICING_OWNER_USER_ID:owner},service:{},
  getAuthenticatedUserId:async(req)=>req.headers.authorization==='Bearer owner'?owner:'55555555-5555-4555-8555-555555555555',
  pricingService:{collectionValuation:async(id,refresh)=>{seen.push({id,refresh});return {state:'ready',summary};}}}));
const server=app.listen(0,'127.0.0.1');await new Promise((r)=>server.once('listening',r));
const url=`http://127.0.0.1:${server.address().port}/v1/market/collection-valuation`;
try{
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:{Authorization:'Bearer other'}})).status,403);
  assert.equal(seen.length,0);
  const response=await fetch(url,{headers:{Authorization:'Bearer owner'}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await response.json()).data.summary.total,2380);
  const refresh=await fetch(url+'/refresh',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({ownerId:'forged'})});
  assert.equal(refresh.status,202);assert.equal(seen.at(-1).id,owner);assert.equal(seen.at(-1).refresh,true);
  assert.equal(seen.length,2,'only stored summary / queue service called; no provider service exists in this fixture');
}finally{await new Promise((r)=>server.close(r));}
console.log('Prepared valuation HTTP: owner authorization, private caches, complete body, queued collection refresh and no provider path passed.');
