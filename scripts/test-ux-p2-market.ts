import assert from 'node:assert/strict';
import {
  hasUsableSavedMarketProductId,
  parseSavedMarketProductIds,
  createSavedProductLoadGate,
} from '../lib/savedMarketProducts';

assert.deepEqual(parseSavedMarketProductIds(null), []);
assert.deepEqual(
  parseSavedMarketProductIds(JSON.stringify([' product-a ', 'product-b', 'product-a'])),
  ['product-a', 'product-b'],
  'Saved product IDs should be normalised and de-duplicated before resolving products.',
);
assert.throws(
  () => parseSavedMarketProductIds('{not-json'),
  /Saved products could not be read/,
  'A corrupt saved-product record must surface a retryable error instead of being treated as an empty list.',
);
assert.throws(
  () => parseSavedMarketProductIds(JSON.stringify(['ok', '', 3])),
  /Saved products could not be read/,
  'Malformed product IDs must not be used for product lookups or removal writes.',
);
assert.equal(hasUsableSavedMarketProductId('  product-a  '), true);
assert.equal(hasUsableSavedMarketProductId(''), false);
assert.equal(hasUsableSavedMarketProductId('x'.repeat(201)), false);

const loadGate = createSavedProductLoadGate();
const initialSignedInLoad = loadGate.start();
assert.equal(loadGate.isCurrent(initialSignedInLoad), true, 'An initial signed-in load remains valid until identity binding completes.');
const resolvedSignedInLoad = loadGate.start();
assert.equal(loadGate.isCurrent(resolvedSignedInLoad), true, 'The post-bind load request becomes the request allowed to update the UI.');

const pendingAuthLoad = loadGate.start();
loadGate.invalidate();
assert.equal(loadGate.isCurrent(pendingAuthLoad), false, 'An auth change while getUser is pending prevents the old account from binding or rendering.');

const firstOverlappingLoad = loadGate.start();
const secondOverlappingLoad = loadGate.start();
assert.equal(loadGate.isCurrent(firstOverlappingLoad), false, 'Only the newest overlapping load may render saved products.');
assert.equal(loadGate.isCurrent(secondOverlappingLoad), true);

const loadBeforeRemoval = loadGate.start();
loadGate.invalidate();
assert.equal(loadGate.isCurrent(loadBeforeRemoval), false, 'A removal invalidates an in-flight load before it can restore the removed item.');
const reloadAfterRemoval = loadGate.start();
assert.equal(loadGate.isCurrent(reloadAfterRemoval), true, 'The reload after a successful removal is allowed to render the persisted result.');

console.log('P2 market saved-product state checks passed.');
