import type { InventoryMovementReason } from './inventory';

export type SellerStockOutRoute = 'sale-cart' | 'direct';

export function getSellerStockOutRoute(
  reason: InventoryMovementReason | 'Customer purchase'
): SellerStockOutRoute {
  return reason === 'Sold' || reason === 'Customer purchase' ? 'sale-cart' : 'direct';
}
