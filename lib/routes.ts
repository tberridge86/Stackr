import type { Href } from 'expo-router';

export const ROUTES = {
  home: '/(tabs)' as Href,
  collection: '/(tabs)/binder' as Href,
  scan: '/scan' as Href,
  scanCollection: { pathname: '/scan', params: { mode: 'market' } } as Href,
  scanBinder: '/scan' as Href,
  // Seller scans must enter through Inventory so the account-scoped callback
  // is installed before the camera returns a recognised or manually selected card.
  scanSellerIn: { pathname: '/(tabs)/inventory', params: { startScan: 'stock_in' } } as Href,
  scanSellerOut: { pathname: '/(tabs)/inventory', params: { startScan: 'stock_out' } } as Href,
  market: '/(tabs)/market' as Href,
  search: '/(tabs)/search' as Href,
  community: '/(tabs)/community' as Href,
  profile: '/(tabs)/profile' as Href,
  sellerDashboard: '/seller' as Href,
  sellerInventory: '/(tabs)/inventory' as Href,
  sellerListings: { pathname: '/(tabs)/market', params: { segment: 'myListings' } } as Href,
  sellerOrders: '/seller/orders' as Href,
  listingNew: '/listing/new' as Href,
  offers: '/offers' as Href,
  priceLookup: '/prices' as Href,
  priceBuilder: '/price-builder' as Href,
  friends: '/friends' as Href,
  notifications: '/notifications' as Href,
  settings: '/settings' as Href,
} as const;

export const LEGACY_ROUTE_REDIRECTS = {
  '/--': '/' as Href,
  '/binder-legacy': ROUTES.collection,
  '/binder': ROUTES.collection,
  '/collection': ROUTES.collection,
  '/community': ROUTES.community,
  '/search': ROUTES.search,
  '/marketplace': ROUTES.market,
  '/market-place': ROUTES.market,
  '/trade': ROUTES.market,
  '/trade/[userId]': ROUTES.market,
  '/(tabs)/trade': ROUTES.market,
  '/camera': ROUTES.scan,
  '/scan/camera': ROUTES.scan,
  '/listing': ROUTES.listingNew,
  '/listing/camera': ROUTES.listingNew,
  '/listing/[id]': ROUTES.market,
  '/list': ROUTES.listingNew,
  '/callback': '/(auth)/callback' as Href,
  '/auth/callback': '/(auth)/callback' as Href,
  '/reset-password': '/(auth)/reset-password' as Href,
  '/auth/reset-password': '/(auth)/reset-password' as Href,
  '/user/[id]': '/community/profile/[userId]' as Href,
} as const;

export type CollectorTabKey = 'home' | 'collection' | 'scan' | 'market' | 'search';
export type SellerTabKey = 'dashboard' | 'inventory' | 'scan' | 'listings';

export const COLLECTOR_TABS: Array<{ key: CollectorTabKey; label: string; route: Href }> = [
  { key: 'home', label: 'Home', route: ROUTES.home },
  { key: 'collection', label: 'Collection', route: ROUTES.collection },
  { key: 'scan', label: 'Scan', route: ROUTES.scan },
  { key: 'market', label: 'The Market', route: ROUTES.market },
  { key: 'search', label: 'Search', route: ROUTES.search },
];

export const SELLER_TABS: Array<{ key: SellerTabKey; label: string; route: Href }> = [
  { key: 'dashboard', label: 'Home', route: ROUTES.sellerDashboard },
  { key: 'inventory', label: 'Inventory', route: ROUTES.sellerInventory },
  { key: 'scan', label: 'Scan', route: ROUTES.scanSellerIn },
  { key: 'listings', label: 'The Market', route: ROUTES.sellerListings },
];
