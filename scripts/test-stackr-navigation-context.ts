import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canUseBrowsingBackGesture,
  resolveActiveStackrTab,
  type StackrNavigationState,
} from '../lib/stackrNavigationContext';
import { COLLECTOR_TABS, SELLER_TABS } from '../lib/routes';

type Route = StackrNavigationState['routes'][number];
const route = (name: string): Route => ({ name });
const stack = (...routes: Route[]): StackrNavigationState => ({ index: routes.length - 1, routes });
const tabs = (name: string): Route => ({
  name: '(tabs)',
  state: { index: 1, routes: [route('index'), route(name), route('market')] },
});
let checks = 0;
function expect(path: string, state: StackrNavigationState | undefined, expected: string, mode: 'collector' | 'seller' = 'collector') {
  assert.equal(resolveActiveStackrTab(path, mode, state), expected, `${mode}: ${path} should select ${expected}`);
  checks++;
}

// Each detail keeps the actually visited section, even across chains of detail pages.
for (const [origin, expected] of [['index', 'home'], ['binder', 'collection'], ['search', 'search'], ['market', 'market'], ['scan-hub', 'scan']] as const) {
  for (const entity of ['card', 'set', 'product', 'pokemon']) {
    expect(`/${entity}/one`, stack(tabs(origin), route(`${entity}/[id]`)), expected);
    expect(`/${entity}/two`, stack(tabs(origin), route('set/[id]'), route(`${entity}/[id]`)), expected);
  }
}
expect('/card/one', stack(route('binder/[id]'), route('card/[id]')), 'collection');
expect('/product/one', stack(route('orders'), route('product/[id]')), 'market');
expect('/card/one', stack(route('pokedex'), route('pokemon/[id]'), route('card/[id]')), 'collection');

// Direct links do not invent a Home visit from startup or a synthetic tab route.
for (const entity of ['card', 'product', 'set', 'pokemon']) {
  const expected = entity === 'card' || entity === 'product' ? 'search' : 'collection';
  expect(`/${entity}/one`, undefined, expected);
  expect(`/${entity}/one`, stack(route('index'), route('(tabs)'), route(`${entity}/[id]`)), expected);
}
expect('/explore', undefined, 'collection');
expect('/pokedex', undefined, 'collection');
expect('/corocoro', undefined, 'collection');
expect('/corocoro/november', undefined, 'collection');
expect('/(tabs)/search/index?query=card', undefined, 'search');
expect('/(tabs)/binder/', undefined, 'collection');
expect('/market-place', undefined, 'market');
expect('/inventory', undefined, 'home');

// A popped route and inactive tab entries are not navigation history.
const browsing = stack(tabs('search'), route('card/[id]'), route('notifications'));
expect('/notifications', browsing, 'search');
expect('/card/one', { ...browsing, index: 1 }, 'search');
expect('/search', { ...browsing, index: 0 }, 'search');
expect('/card/one', { index: 1, routes: [tabs('binder'), route('card/[id]'), route('market')] }, 'collection');
expect('/card/one', stack({ name: '(tabs)', state: { index: 0, routes: [route('search'), route('market')] } }, route('card/[id]')), 'search');
expect('/card/one', stack(tabs('binder')), 'collection'); // path can update before root state

// Switching mode always chooses a tab offered by that mode, with no retained account state.
for (const path of ['/', '/explore', '/pokedex', '/corocoro', '/set/one', '/pokemon/one', '/search', '/unknown']) {
  expect(path, undefined, 'dashboard', 'seller');
}
expect('/seller/index', undefined, 'dashboard', 'seller');
expect('/inventory', undefined, 'inventory', 'seller');
expect('/seller/orders', undefined, 'listings', 'seller');
expect('/market', undefined, 'listings', 'seller');
expect('/scan-hub', undefined, 'scan', 'seller');
expect('/card/one', stack(tabs('inventory'), route('card/[id]')), 'inventory', 'seller');
expect('/card/one', stack(tabs('market'), route('card/[id]')), 'listings', 'seller');
expect('/card/one', stack(tabs('search'), route('card/[id]')), 'dashboard', 'seller');
expect('/card/one', stack(tabs('market'), route('card/[id]')), 'market');
expect('/card/one', undefined, 'search');
for (const mode of ['collector', 'seller'] as const) {
  const offered = new Set<string>((mode === 'seller' ? SELLER_TABS : COLLECTOR_TABS).map(tab => tab.key));
  for (const path of ['/', '/inventory', '/market', '/card/one', '/set/one', '/scan-hub', '/about', '/unknown']) {
    assert.ok(offered.has(resolveActiveStackrTab(path, mode, browsing)), `${path} resolves to an available ${mode} tab`);
    checks++;
  }
}

// Only the named browsing screens may use native edge-swipe. Workflows remain guarded.
for (const name of ['card/[id]', 'set/[id]', 'product/[id]', 'pokemon/[id]', 'corocoro', 'notifications', 'value-history', 'help', 'about', 'legal']) {
  assert.equal(canUseBrowsingBackGesture(name), true, `${name} permits edge-swipe`); checks++;
}
for (const name of ['(tabs)', 'index', 'scan', 'scan/result', 'scan/camera', 'binder/[id]', 'binder/new', 'binder/add-cards', 'listing/new', 'offer/new', 'offer/[id]', 'offers', 'seller/onboarding', 'login', '(auth)', 'settings']) {
  assert.equal(canUseBrowsingBackGesture(name), false, `${name} retains its restriction`); checks++;
}
const shell = readFileSync('components/StackrAppShell.tsx', 'utf8');
assert.match(shell, /resolveActiveStackrTab\(pathname, mode, navigationState\)/, 'the live tab bar uses the resolver and current root state');
assert.match(shell, /gestureEnabled: canUseBrowsingBackGesture\(route.name\)/, 'native screen options use the browsing allowlist');
assert.match(shell, /fullScreenGestureEnabled: false/, 'full-screen back gestures remain disabled');

console.log(`Stackr navigation: ${checks + 3} checks passed for origins, deep links, back navigation, mode changes and edge-swipe scope.`);
