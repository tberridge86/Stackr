import assert from 'node:assert/strict';
import { createLatestRequestGate } from '../lib/latestRequestGate';
import { parseSavedMarketListingIds } from '../lib/marketSavedItemParser';
import { productPrefillBlocksPublication, resolveCanonicalProductPrefill } from '../lib/productListingPrefill';

assert.deepEqual(parseSavedMarketListingIds('["listing-1", "listing-1"]'), ['listing-1']);
assert.throws(() => parseSavedMarketListingIds('{"ids":[]}'), /could not be read/);
assert.throws(() => parseSavedMarketListingIds('42'), /could not be read/);
assert.throws(() => parseSavedMarketListingIds('[null,{}]'), /could not be read/);

const gate = createLatestRequestGate();
const first = gate.start();
const second = gate.start();
assert.equal(gate.isCurrent(first), false);
assert.equal(gate.isCurrent(second), true);

assert.equal(productPrefillBlocksPublication('resolving'), true);
assert.equal(productPrefillBlocksPublication('failed'), true);
assert.equal(productPrefillBlocksPublication('manual'), false);
assert.equal(resolveCanonicalProductPrefill('same-name-a', 'same-name-a'), 'resolved');
assert.equal(resolveCanonicalProductPrefill('same-name-a', 'same-name-b'), 'failed');

console.log('TestFlight P1 regression tests passed');
