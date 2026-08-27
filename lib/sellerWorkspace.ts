import type { Href } from 'expo-router';
import { ROUTES } from './routes';

export type SellerCapabilityStatus = 'available' | 'partial' | 'backend_required';

export type SellerWorkspaceItem = {
  key: string;
  label: string;
  description: string;
  status: SellerCapabilityStatus;
  route?: Href;
  backendDependency?: string;
};

export const SELLER_WORKSPACE_ITEMS: SellerWorkspaceItem[] = [
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Search stock, manage quantities and review estimated value.',
    status: 'available',
    route: ROUTES.sellerInventory,
  },
  {
    key: 'scan_in',
    label: 'Scan In',
    description: 'Record purchased, traded or store intake stock in reviewable inventory batches.',
    status: 'available',
    route: ROUTES.scanSellerIn,
  },
  {
    key: 'scan_out',
    label: 'Scan Out',
    description: 'Record sold, traded, transferred or damaged stock leaving inventory.',
    status: 'available',
    route: ROUTES.scanSellerOut,
  },
  {
    key: 'listings',
    label: 'Listings',
    description: 'Create and manage active marketplace and trade listings.',
    status: 'partial',
    route: ROUTES.sellerListings,
    backendDependency: 'Listing lifecycle currently supports active, archived and sold states; fulfilment states need order services.',
  },
  {
    key: 'bulk_tools',
    label: 'Bulk Tools',
    description: 'CSV import/export, bulk relisting and reconciliation.',
    status: 'backend_required',
    backendDependency: 'Requires bulk import/export jobs and reconciliation APIs.',
  },
];

export function getSellerWorkspaceSummary(items = SELLER_WORKSPACE_ITEMS) {
  return {
    available: items.filter((item) => item.status === 'available').length,
    partial: items.filter((item) => item.status === 'partial').length,
    backendRequired: items.filter((item) => item.status === 'backend_required').length,
  };
}
