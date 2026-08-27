import assert from 'node:assert/strict';
import type {
  InventoryCardSnapshot,
  InventoryItem,
  InventoryMovementDraft,
} from '../lib/inventory';

process.env.APP_VARIANT = 'staging';
process.env.EXPO_PUBLIC_APP_VARIANT = 'staging';
process.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED = 'false';
process.env.EXPO_PUBLIC_SELLER_TRIAL_MODE = 'true';
process.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE = 'true';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://lmwfhvexfcoyeuoyrlco.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_test';

async function main() {
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const supabase: any = { auth: {} };
const NodeModule = require('node:module') as any;
const originalModuleLoad = NodeModule._load;
NodeModule._load = function mockSellerTrialDependencies(request: string, parent: { filename?: string } | undefined, isMain: boolean) {
  if (request === './supabase' && parent?.filename?.endsWith('/lib/inventory.ts')) {
    return { supabase };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};
const inventory = require('../lib/inventory') as typeof import('../lib/inventory');
NodeModule._load = originalModuleLoad;

const localStore = new Map<string, string>();
Object.assign(AsyncStorage, {
  getItem: async (key: string) => localStore.get(key) ?? null,
  setItem: async (key: string, value: string) => { localStore.set(key, value); },
  removeItem: async (key: string) => { localStore.delete(key); },
});

let activeUserId = 'trial-user-one';
let getUserCalls = 0;
let sellerRpcCalls = 0;
(supabase.auth as any).getSession = async () => ({
  data: { session: { user: { id: activeUserId, app_metadata: {} } } },
  error: null,
});
(supabase.auth as any).getUser = async () => {
  getUserCalls += 1;
  throw new Error('Seller Trial must not verify inventory through remote getUser');
};
(supabase as any).rpc = async () => {
  sellerRpcCalls += 1;
  throw new Error('Seller Trial must not call a seller RPC');
};

const card: InventoryCardSnapshot = {
  id: 'trial-card-1',
  name: 'Trial Pikachu',
  number: '025',
  set_id: 'trial-set',
  set_name: 'Trial Set',
  rarity: 'Common',
  image_small: null,
  image_large: null,
  tcg_price: 1,
  ebay_price: null,
  cardmarket_price: null,
};
const item: InventoryItem = {
  ...inventory.createInventoryItem(card, 'Near Mint', 1),
  id: 'trial-item-1',
};
const movement: InventoryMovementDraft = {
  inventory_item_id: item.id,
  action_type: 'scan_in',
  card_id: card.id,
  set_id: card.set_id,
  card_name: card.name,
  quantity: 1,
  reason: 'Added to Sell/Trade',
};

const firstCommit = await inventory.commitSellerInventoryBatch({
  expectedItems: [],
  items: [item],
  movements: [movement],
  requestId: 'trial-request-1',
});
assert.equal(firstCommit.result.replayed, false);
assert.equal(firstCommit.result.movementCount, 1);
assert.equal(localStore.size, 1, 'the trial must persist one atomic ledger envelope');
assert.deepEqual((await inventory.loadInventoryItems()).map((row) => row.id), [item.id]);
assert.equal((await inventory.loadInventoryMovements()).length, 1);

const exactReplay = await inventory.commitSellerInventoryBatch({
  expectedItems: [],
  items: [item],
  movements: [movement],
  requestId: 'trial-request-1',
});
assert.equal(exactReplay.result.replayed, true);
assert.equal(exactReplay.result.movementCount, 1, 'replay must return the original receipt result');
assert.equal((await inventory.loadInventoryMovements()).length, 1, 'replay must not duplicate movement history');

await assert.rejects(
  inventory.commitSellerInventoryBatch({
    expectedItems: [],
    items: [{ ...item, quantity: 2 }],
    movements: [movement],
    requestId: 'trial-request-1',
  }),
  /request ID was reused with different inventory data/,
);

await assert.rejects(
  inventory.commitSellerInventoryBatch({
    expectedItems: [],
    items: [{ ...item, quantity: 2 }],
    movements: [movement],
    requestId: 'trial-request-stale',
  }),
  /inventory changed/,
);

await assert.rejects(
  inventory.commitSellerInventoryBatch({
    expectedItems: [item],
    items: [item],
    binderDeltas: [{
      binder_id: 'binder-1',
      card_id: card.id,
      set_id: card.set_id!,
      quantity_delta: 1,
    }],
    requestId: 'trial-request-binder',
  }),
  /Binder changes are disabled/,
);

activeUserId = 'trial-user-two';
assert.deepEqual(await inventory.loadInventoryItems(), [], 'trial ledgers must be account scoped');
activeUserId = 'trial-user-one';

await inventory.clearSellerTrialLedger();
assert.deepEqual(await inventory.loadInventoryItems(), []);

const concurrentResults = await Promise.allSettled([
  inventory.commitSellerInventoryBatch({
    expectedItems: [],
    items: [item],
    movements: [movement],
    requestId: 'trial-concurrent-1',
  }),
  inventory.commitSellerInventoryBatch({
    expectedItems: [],
    items: [{ ...item, id: 'trial-item-2' }],
    movements: [{ ...movement, inventory_item_id: 'trial-item-2' }],
    requestId: 'trial-concurrent-2',
  }),
]);
assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
assert.match(
  String(concurrentResults.find((result) => result.status === 'rejected')?.reason),
  /inventory changed/,
  'serialized concurrent saves must make the stale operation fail closed',
);

await inventory.clearSellerTrialLedger();
assert.equal(localStore.size, 0);

const saveThenClearResults = await Promise.allSettled([
  inventory.commitSellerInventoryBatch({
    expectedItems: [],
    items: [item],
    movements: [movement],
    requestId: 'trial-commit-before-clear',
  }),
  inventory.clearSellerTrialLedger(),
]);
assert.equal(saveThenClearResults[1].status, 'fulfilled', 'the requested reset must complete');
if (saveThenClearResults[0].status === 'rejected') {
  assert.match(String(saveThenClearResults[0].reason), /data was cleared/);
}
assert.deepEqual(
  await inventory.loadInventoryItems(),
  [],
  'a reset queued after a save must leave no resurrected trial inventory',
);
assert.equal(localStore.size, 0);
assert.equal(getUserCalls, 0);
assert.equal(sellerRpcCalls, 0);

console.log('Seller Trial atomic local-ledger tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
