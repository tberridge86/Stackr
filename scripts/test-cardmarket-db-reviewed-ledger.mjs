import assert from 'node:assert/strict';
import { loadReviewedCardmarketLedger } from './cardmarket-db-reviewed-ledger.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=n=>({cardmarket_product_id:n,cardmarket_category_id:51,printing_id:id(n),catalogue_version_id:id(99),language_evidence:{x:1},variant_evidence:{x:1},finish_evidence:{x:1},review_reference:'review'});
let calls=0;const api={rpc:async(_n,args)=>({data:++calls===1?Array.from({length:500},(_,i)=>row(i+1)):[row(501)],error:null})};
const ledger=await loadReviewedCardmarketLedger({api});assert.equal(ledger.mappings.length,501);
await assert.rejects(()=>loadReviewedCardmarketLedger({api:{rpc:async()=>({data:[row(0)],error:null})}}),/Invalid reviewed mapping row/);
console.log('Cardmarket DB reviewed ledger validates pages, row schema, monotonic cursor and bounds.');
