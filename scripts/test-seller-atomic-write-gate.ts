import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SELLER_ATOMIC_WRITES_DISABLED_MESSAGE,
  SELLER_ATOMIC_WRITES_ENABLED,
  assertSellerAtomicWritesEnabled,
  isSellerAtomicWritesDisabledError,
} from '../lib/sellerAtomicWrites';

assert.equal(
  SELLER_ATOMIC_WRITES_ENABLED,
  false,
  'The store bridge must embed seller atomic writes as default-off'
);
assert.throws(
  () => assertSellerAtomicWritesEnabled(),
  (error: unknown) => error instanceof Error
    && error.message === SELLER_ATOMIC_WRITES_DISABLED_MESSAGE
);
assert.equal(
  isSellerAtomicWritesDisabledError(new Error(SELLER_ATOMIC_WRITES_DISABLED_MESSAGE)),
  true
);
assert.equal(isSellerAtomicWritesDisabledError(new Error('Network request failed')), false);

const inventorySource = readFileSync(join(process.cwd(), 'lib', 'inventory.ts'), 'utf8');
const guardIndex = inventorySource.indexOf('assertSellerAtomicWritesEnabled();');
const authIndex = inventorySource.indexOf('supabase.auth.getUser()', guardIndex);
const rpcIndex = inventorySource.indexOf("supabase.rpc('commit_seller_inventory_batch'", guardIndex);
const cacheWriteIndex = inventorySource.indexOf('AsyncStorage.setItem(STORAGE_KEY', guardIndex);

assert.ok(guardIndex >= 0, 'Seller batch entrypoint must contain the write guard');
assert.ok(authIndex > guardIndex, 'Write guard must run before authentication work');
assert.ok(rpcIndex > guardIndex, 'Write guard must run before the atomic RPC');
assert.ok(cacheWriteIndex > guardIndex, 'Write guard must run before local cache mutation');
assert.ok(
  inventorySource.includes('p_binder_deltas: input.binderDeltas ?? []'),
  'Atomic batches must carry binder quantity deltas'
);

const saveSalesIndex = inventorySource.indexOf('export async function saveInventorySales');
const saveSalesGuardIndex = inventorySource.indexOf('assertSellerAtomicWritesEnabled();', saveSalesIndex);
const saveSalesCacheIndex = inventorySource.indexOf('AsyncStorage.setItem(SALES_STORAGE_KEY', saveSalesIndex);
assert.ok(saveSalesIndex >= 0, 'Legacy sales cache helper must be present or removed');
assert.ok(saveSalesGuardIndex > saveSalesIndex && saveSalesGuardIndex < saveSalesCacheIndex,
  'Legacy sales cache helper must fail closed before writing');

const inventoryScreenSource = readFileSync(
  join(process.cwd(), 'app', '(tabs)', 'inventory.tsx'),
  'utf8'
);
const screenCommitIndex = inventoryScreenSource.indexOf('await commitSellerInventoryBatch({');
const screenStateIndex = inventoryScreenSource.indexOf('setItems(committed.items);', screenCommitIndex);

assert.ok(screenCommitIndex >= 0, 'Inventory screen must use the atomic commit entrypoint');
assert.ok(screenStateIndex > screenCommitIndex, 'Inventory state must update only after the RPC resolves');
assert.equal(
  inventoryScreenSource.includes('setItems(input.nextItems)'),
  false,
  'Inventory screen must not optimistically apply seller changes'
);
assert.equal(inventoryScreenSource.includes('saveInventoryItems'), false);
assert.equal(inventoryScreenSource.includes('addInventorySale'), false);
assert.equal(inventoryScreenSource.includes('saveInventorySales('), false);
assert.ok(
  inventoryScreenSource.includes('quantity_delta: actualChange'),
  'Quantity changes must preserve binder-linked quantities'
);
assert.ok(
  inventoryScreenSource.includes('quantity_delta: -line.quantity'),
  'Sales must preserve binder-linked quantities'
);

console.log('Seller atomic write gate tests passed.');
