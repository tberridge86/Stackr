import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SELLER_ATOMIC_WRITES_ENABLED,
  assertSellerAtomicWritesEnabled,
} from '../lib/sellerAtomicWrites';

assert.equal(SELLER_ATOMIC_WRITES_ENABLED, true);

let mutationAttempted = false;
assert.doesNotThrow(() => {
  assertSellerAtomicWritesEnabled();
  mutationAttempted = true;
});
assert.equal(mutationAttempted, true, 'the canary OTA must enable the atomic seller path');

const inventorySource = readFileSync(join(process.cwd(), 'lib', 'inventory.ts'), 'utf8');
const guardIndex = inventorySource.indexOf('assertSellerAtomicWritesEnabled();');
const authIndex = inventorySource.indexOf('supabase.auth.getUser()', guardIndex);
const rpcIndex = inventorySource.indexOf("supabase.rpc('commit_seller_inventory_batch'", guardIndex);
const cacheWriteIndex = inventorySource.indexOf('AsyncStorage.setItem(STORAGE_KEY', guardIndex);

assert.ok(guardIndex >= 0, 'Seller batch entrypoint must contain the write guard');
assert.ok(authIndex > guardIndex, 'Write guard must run before authentication work');
assert.ok(rpcIndex > guardIndex, 'Write guard must run before the atomic RPC');
assert.ok(cacheWriteIndex > guardIndex, 'Write guard must run before local cache mutation');

const inventoryScreenSource = readFileSync(
  join(process.cwd(), 'app', '(tabs)', 'inventory.tsx'),
  'utf8'
);
const screenCommitIndex = inventoryScreenSource.indexOf('await commitSellerInventoryBatch({');
const screenStateIndex = inventoryScreenSource.indexOf('setItems(committed.items);', screenCommitIndex);

assert.ok(screenCommitIndex >= 0, 'Inventory screen must use the atomic commit entrypoint');
assert.ok(screenStateIndex > screenCommitIndex, 'Inventory state must update only after the RPC resolves');
assert.equal(inventoryScreenSource.includes('setItems(input.nextItems)'), false);
assert.equal(inventoryScreenSource.includes('saveInventoryItems'), false);
assert.equal(inventoryScreenSource.includes('addInventorySale'), false);
assert.equal(inventoryScreenSource.includes('saveInventorySales('), false);
assert.equal(inventoryScreenSource.includes('saveInventoryMovements('), false);

console.log('Seller atomic write gate tests passed.');
