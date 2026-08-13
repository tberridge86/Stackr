export const SELLER_INVENTORY_SCAN_FLOWS = Object.freeze(['stock_in', 'stock_out'] as const);

export function isPremiumSellerInventoryScan(input: {
  mode?: string | null;
  flow?: string | null;
}) {
  return input.mode === 'inventory'
    || SELLER_INVENTORY_SCAN_FLOWS.some((flow) => flow === input.flow);
}
