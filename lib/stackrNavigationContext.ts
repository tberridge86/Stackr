import type { CollectorTabKey, SellerTabKey } from './routes';

type Section = 'home' | 'collection' | 'scan' | 'market' | 'search' | 'inventory';
type AppMode = 'collector' | 'seller';
export type StackrTabKey = CollectorTabKey | SellerTabKey;

/** Only route names and the active indices are read; no account data is retained. */
export type StackrNavigationState = Readonly<{
  index?: number;
  routes: readonly Readonly<{ name: string; state?: StackrNavigationState }>[];
}>;

function pathForRoute(value: string) {
  const path = `/${value}`.replace(/\/+/g, '/').split(/[?#]/, 1)[0]
    .replace(/\/\([^/]+\)(?=\/|$)/g, '').replace(/\/index$/, '').replace(/\/$/, '');
  return path || '/';
}

const inSection = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
const isDetail = (path: string) => ['card', 'set', 'product', 'pokemon'].some(name => inSection(path, `/${name}`));

function sectionForPath(path: string): Section | null {
  // Detail pages inherit their origin before applying any direct-link default.
  if (isDetail(path)) return null;
  if (path === '/' || path === '/seller') return 'home';
  if (['binder', 'binder-legacy', 'collection', 'duplicates', 'explore', 'pokedex', 'corocoro']
    .some(name => inSection(path, `/${name}`))) return 'collection';
  if (inSection(path, '/inventory')) return 'inventory';
  if (inSection(path, '/scan') || inSection(path, '/scan-hub') || inSection(path, '/camera')) return 'scan';
  if (['market', 'marketplace', 'market-place', 'trade', 'offer', 'offers', 'orders',
    'listing', 'list', 'watchlist', 'prices', 'price-builder', 'seller/orders']
    .some(name => inSection(path, `/${name}`))) return 'market';
  if (inSection(path, '/search')) return 'search';
  if (inSection(path, '/community') || inSection(path, '/friends')) return 'home';
  return null;
}

function tabForSection(section: Section, mode: AppMode): StackrTabKey {
  if (mode === 'seller') {
    if (section === 'market') return 'listings';
    if (section === 'inventory') return 'inventory';
    if (section === 'scan') return 'scan';
    return 'dashboard';
  }
  if (section === 'inventory') return 'home';
  return section;
}

function selectedRoute(state: StackrNavigationState, stack = false) {
  const fallback = stack ? state.routes.length - 1 : 0;
  const index = Number.isInteger(state.index) ? state.index! : fallback;
  return Math.min(state.routes.length - 1, Math.max(0, index));
}

function sectionForRoute(route: StackrNavigationState['routes'][number], depth = 0): Section | null {
  if (depth > 12) return null;
  if (route.name === '(tabs)') {
    // A synthetic initial tab route on a deep link is not a visited origin.
    if (!route.state?.routes.length) return null;
    return sectionForRoute(route.state.routes[selectedRoute(route.state)], depth + 1);
  }
  if (route.name.startsWith('(auth)')) return null;
  const section = sectionForPath(pathForRoute(route.name));
  if (section) return section;
  if (!route.state?.routes.length) return null;
  return sectionForRoute(route.state.routes[selectedRoute(route.state)], depth + 1);
}

export function resolveActiveStackrTab(
  pathname: string,
  mode: AppMode,
  state?: StackrNavigationState | null,
): StackrTabKey {
  const path = pathForRoute(pathname);
  const section = sectionForPath(path);
  if (section) return tabForSection(section, mode);

  if (state?.routes.length) {
    for (let index = selectedRoute(state, true); index >= 0; index--) {
      const route = state.routes[index];
      // The root index is the startup redirect, not the Home tab.
      if (route.name === 'index') continue;
      const origin = sectionForRoute(route);
      if (origin) return tabForSection(origin, mode);
    }
  }

  if (mode === 'seller') return 'dashboard';
  if (inSection(path, '/card') || inSection(path, '/product')) return 'search';
  if (inSection(path, '/set') || inSection(path, '/pokemon')) return 'collection';
  return 'home';
}

const browsingBackRoutes = new Set([
  'card/[id]', 'set/[id]', 'product/[id]', 'pokemon/[id]', 'corocoro',
  'notifications', 'value-history', 'help', 'about', 'legal',
]);

/** Native edge-swipe only. Editing, scanning and redirect routes remain guarded. */
export const canUseBrowsingBackGesture = (routeName: string) => browsingBackRoutes.has(routeName);
