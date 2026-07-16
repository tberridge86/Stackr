import type { Href } from 'expo-router';

export const ROUTES = {
  home: '/(tabs)' as Href,
  collection: '/(tabs)/binder' as Href,
  scan: '/scan' as Href,
  scanCollection: { pathname: '/scan', params: { mode: 'market' } } as Href,
  scanBinder: '/scan' as Href,
  scanSellerIn: { pathname: '/scan', params: { mode: 'inventory', flow: 'stock_in' } } as Href,
  scanSellerOut: { pathname: '/scan', params: { mode: 'inventory', flow: 'stock_out' } } as Href,
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
  '/binder-legacy': ROUTES.collection,
  '/binder': ROUTES.collection,
  '/collection': ROUTES.collection,
  '/marketplace': ROUTES.market,
  '/market-place': ROUTES.market,
  '/trade': ROUTES.market,
  '/camera': ROUTES.scan,
  '/scan/camera': ROUTES.scan,
  '/listing': ROUTES.listingNew,
  '/list': ROUTES.listingNew,
  '/callback': '/(auth)/callback' as Href,
  '/auth/callback': '/(auth)/callback' as Href,
  '/reset-password': '/(auth)/reset-password' as Href,
  '/auth/reset-password': '/(auth)/reset-password' as Href,
  '/user/[id]': '/community/profile/[userId]' as Href,
} as const;

export type CollectorTabKey = 'home' | 'collection' | 'scan' | 'market' | 'search';
export type SellerTabKey = 'dashboard' | 'inventory' | 'scan' | 'listings' | 'orders';

export const COLLECTOR_TABS: Array<{ key: CollectorTabKey; label: string; route: Href }> = [
  { key: 'home', label: 'Home', route: ROUTES.home },
  { key: 'collection', label: 'Collection', route: ROUTES.collection },
  { key: 'scan', label: 'Scan', route: ROUTES.scan },
  { key: 'market', label: 'The Market', route: ROUTES.market },
  { key: 'search', label: 'Search', route: ROUTES.search },
];

export const SELLER_TABS: Array<{ key: SellerTabKey; label: string; route: Href }> = [
  { key: 'dashboard', label: 'Home', route: ROUTES.home },
  { key: 'inventory', label: 'Inventory', route: ROUTES.sellerInventory },
  { key: 'scan', label: 'Scan', route: ROUTES.scanSellerIn },
  { key: 'listings', label: 'The Market', route: ROUTES.sellerListings },
  { key: 'orders', label: 'Orders', route: ROUTES.sellerOrders },
];
