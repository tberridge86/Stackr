import assert from 'node:assert/strict';
import type { InventoryMovementReason } from '../lib/inventory';
import { getSellerStockOutRoute } from '../lib/sellerStockOutRouting';

assert.equal(getSellerStockOutRoute('Sold'), 'sale-cart');
assert.equal(getSellerStockOutRoute('Customer purchase'), 'sale-cart');

const directReasons: InventoryMovementReason[] = [
  'Traded',
  'Shipped',
  'Lost/Damaged',
  'Removed from Collection',
  'Other',
];

for (const reason of directReasons) {
  assert.equal(getSellerStockOutRoute(reason), 'direct', `${reason} must remain a direct stock-out`);
}

console.log('Seller stock-out routing tests passed.');
