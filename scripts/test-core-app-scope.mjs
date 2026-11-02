import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const defer = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const passthrough = ({ children }) => children;
function compile(source, file) {
  return ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
}
function load(file, dependencies, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8'), file) + extra, {
    module, exports: module.exports, React, require(id) {
      if (!(id in dependencies)) throw new Error('Unexpected runtime import: ' + id + ' in ' + file);
      return dependencies[id];
    }, AbortController, Promise, Map, Set, Date, setTimeout, clearTimeout, console,
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  }, { filename: file });
  return module.exports;
}
const policy = load('lib/appCapabilities.ts', {});
assert.equal(policy.CORE_COLLECTION_MODE, true);
const theme = { colors: { bg: '#fff', card: '#fff', text: '#111', primary: '#6344a0', border: '#ddd' } };
const navModes = [], activeScreens = [], activeTabs = [];
const Stack = ({ children }) => children;
Stack.Protected = ({ guard, children }) => guard ? children : null;
Stack.Screen = props => { activeScreens.push(props.name); return null; };
const Tabs = ({ children }) => children;
Tabs.Protected = Stack.Protected;
Tabs.Screen = props => { activeTabs.push(props.name); return null; };
const shell = load('components/StackrAppShell.tsx', {
  react: React,
  'react-native-gesture-handler': { GestureHandlerRootView: passthrough },
  'expo-router': { Stack, router: { push() {} }, usePathname: () => '/', useRootNavigationState: () => ({}) },
  'expo-status-bar': { StatusBar: () => null },
  './app-mode-context': { AppModeProvider: passthrough, useAppMode: () => ({ mode: 'seller' }) },
  './theme-context': { useTheme: () => ({ theme }) },
  'react-native': { KeyboardAvoidingView: passthrough, Platform: { OS: 'ios' }, TouchableOpacity: 'Button', View: passthrough },
  './Text': { Text: 'Text' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  '../lib/appCapabilities': policy, './StackrPopupProvider': { StackrPopupProvider: passthrough },
  './StackrBackdrop': { StackrBackdrop: () => null },
  './StackrNavigationIcon': { StackrNavigationIcon: () => null },
  '../lib/typography': { typeScale: {} },
  '../lib/routes': { COLLECTOR_TABS: [
    { key: 'home', label: 'Home', route: '/' }, { key: 'collection', label: 'Binders', route: '/binder' },
    { key: 'scan', label: 'Scan' }, { key: 'market', label: 'Market' }, { key: 'search', label: 'Search', route: '/search' },
  ], SELLER_TABS: [] },
  '../lib/stackrNavigationContext': { canUseBrowsingBackGesture: () => true, resolveActiveStackrTab: (p, mode) => { navModes.push(mode); return 'home'; } },
  '../lib/stackrSizing': { stackrTabBarSizes: { secondaryFrame: 32, barHeightIos: 80, paddingBottomIos: 5 } },
  '../lib/haptics': { stackrHaptics: { selection() {} } },
  './CardInspectionProvider': { CardInspectionProvider: passthrough },
  './StartupReadySignal': { StartupReadySignal: () => null },
});
let app;
await act(async () => { app = Renderer.create(React.createElement(shell.default, { startupVisible: false, onReady() {} })); });
assert.deepEqual([...new Set(activeScreens)].sort(), [...policy.CORE_STACK_ROUTES].sort());
assert.equal(activeScreens.includes('scan'), false);
assert.equal(activeScreens.includes('product/[id]'), false);
assert.deepEqual(app.root.findAll(node => node.type === 'Button').map(node => node.props.accessibilityLabel).sort(), ['Binders', 'Home', 'Search']);
assert.ok(navModes.length && navModes.every(mode => mode === 'collector'), 'persisted seller state cannot alter core navigation');
await act(async () => app.unmount());
const tabs = load('app/(tabs)/_layout.tsx', {
  react: React, 'expo-router': { Tabs }, '../../lib/appCapabilities': policy,
  '../../components/StackrFunctionalIcon': { StackrFunctionalIcon: () => null },
  '../../components/theme-context': { useTheme: () => ({ theme }) },
  '../../lib/stackrIcons': { stackrIcons: {} }, '../../components/StackrScreen': { StackrCardActionIcon: () => null },
  '../../lib/stackrSizing': { stackrTabBarSizes: {} },
});
await act(async () => { app = Renderer.create(React.createElement(tabs.default)); });
assert.deepEqual(activeTabs.sort(), ['binder', 'index', 'search']);
await act(async () => app.unmount());

// Every filesystem stack route must have an explicit protected declaration.
const shellSource = fs.readFileSync('components/StackrAppShell.tsx', 'utf8');
const declared = new Set([...shellSource.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map(match => match[1]));
function routes(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const name = prefix + item.name;
    if (name.startsWith('(tabs)/')) return [];
    if (item.isDirectory()) return routes(path.join(dir, item.name), name + '/');
    return name.endsWith('.tsx') && !name.endsWith('_layout.tsx') ? [name.slice(0, -4)] : [];
  });
}
for (const route of routes('app')) assert.ok(declared.has(route), 'unprotected route: ' + route);


// Render the actual root while fonts are pending: core shell is usable without
// mounting video or profile loading, while account setup retains its provider.
let pathname = '/', profileReads = 0, videoMounts = 0, shellMounts = 0;
const AnimatedValue = class { stopAnimation() {} };
const rootModule = load('app/_layout.tsx', {
  react: React, 'expo-router': { usePathname: () => pathname },
  'expo-status-bar': { StatusBar: () => null },
  'react-native': { Animated: { Value: AnimatedValue, View: passthrough, timing: () => ({ start() {} }) },
    Platform: { OS: 'ios' }, Text: function Text() {}, TextInput: function TextInput() {}, View: passthrough },
  'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
  '@expo-google-fonts/inter': { useFonts: () => [false, null] },
  '../components/auth-context': { AuthProvider: passthrough },
  '../components/profile-context': { ProfileProvider: ({ children, enabled }) => { if (enabled) profileReads++; return children; } },
  '../components/theme-context': { ThemeProvider: passthrough },
  '../components/StackrSafeAreaBoundary': { StackrSafeAreaBoundary: passthrough },
  '../components/StackrQueryProvider': { StackrQueryProvider: passthrough },
  '../components/StackrLoadingScreen': { StackrLoadingScreen: () => null },
  '../components/StackrStartupVideo': { StackrStartupVideo: () => { videoMounts++; return null; }, STARTUP_VIDEO_TIMEOUT_MS: 9000 },
  '../components/StackrAppShell': { __esModule: true, default: () => { React.useEffect(() => { shellMounts++; }, []); return null; } },
  '../lib/appCapabilities': policy, '../lib/typography': { stackrFonts: {} },
  '../lib/haptics': { hydrateStackrHapticsPreference() {} },
  '../lib/runtimeFetchDiagnostics': { installRuntimeFetchDiagnostics() {} },
  '../lib/startup': { FONT_LOAD_TIMEOUT_MS: 5000 }, '../lib/theme': { lightTheme: theme },
  '../lib/performance': { markStartupPhase() {} },
});
await act(async () => { app = Renderer.create(React.createElement(rootModule.default)); await tick(); });
assert.ok(shellMounts > 0, 'pending fonts must not withhold core navigation');
assert.equal(profileReads, 0);
assert.equal(videoMounts, 0);
pathname = '/profile/setup';
await act(async () => { app.update(React.createElement(rootModule.default)); await tick(); });
assert.ok(profileReads > 0, 'account setup still enables the real profile context');
assert.equal(shellMounts, 1, 'account setup must preserve navigation and query state');
pathname = '/';
await act(async () => { app.update(React.createElement(rootModule.default)); await tick(); });
assert.equal(shellMounts, 1, 'returning Home must preserve navigation and query state');
assert.equal(videoMounts, 0);
await act(async () => app.unmount());
const destinations = [];
const indexModule = load('app/index.tsx', {
  react: React,
  'expo-router': { useRouter: () => ({ replace: value => destinations.push(value) }) },
  'react-native': { TouchableOpacity: 'Button', View: passthrough },
  'react-native-safe-area-context': { SafeAreaView: passthrough },
  '../components/auth-context': { useAuth: () => ({ user: null, loading: true, error: null, cachedReadSession: null }) },
  '../components/profile-context': { useProfile: () => ({ profile: null, loading: true, error: null }) },
  '../components/StackrLoadingScreen': { StackrLoadingScreen: () => null },
  '../components/Text': { Text: 'Text' }, '../components/theme-context': { useTheme: () => ({ theme }) },
  '../lib/binderLibraryCache': { isBinderLibraryOverviewForUser: () => false, readPersistedBinderOverview: async () => null },
  '../lib/startup': { resolveStartupDestination: () => { throw new Error('Legacy startup gate invoked'); } },
  '../lib/appCapabilities': policy,
});
await act(async () => { app = Renderer.create(React.createElement(indexModule.default)); });
assert.deepEqual(destinations, ['/(tabs)']);
await act(async () => app.unmount());


// Execute the actual Search source creation block, with providers that fail if invoked.
const searchSource = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
const start = searchSource.indexOf('    const shouldSearchProducts =');
const end = searchSource.indexOf('    const [correctionFirst', start);
assert.ok(start > 0 && end > start);
for (const category of ['cards', 'sets']) {
  const calls = { cards: 0, sets: 0 };
  const fail = name => () => { throw new Error('Disabled provider invoked: ' + name); };
  const context = {
    CORE_COLLECTION_MODE: true, category, trimmed: 'Pikachu booster box', primary: 'Pikachu',
    catalogueProductTypeFilter: undefined, listingProductTypeFilter: undefined, normalisedTerms: [], selectedLanguage: 'ja',
    force: false, requestId: 1, requestRef: { current: 1 }, pageLease: { signal: new AbortController().signal },
    canonicalCards: null, retrievalTrace: { phase() {} }, mapCardResults: rows => rows,
    productTypeMatchesIntent: () => true, isRawCardCategory: value => value === 'cards',
    correctPokemonNameQuery: async () => null, readCachedCanonicalSearch: async () => null,
    searchLocalPokemonCards: async (query, options) => { calls.cards++; assert.equal(options.limit, 36); return []; },
    searchSetsQuick: async () => { calls.sets++; return []; },
    searchMarketProducts: fail('products'), fetchListingSearchWithMedia: fail('listings'),
    supabase: { from: fail('profiles') }, Promise, Map,
  };
  const result = await vm.runInNewContext(compile('(async () => {' + searchSource.slice(start, end)
    + '\nreturn Promise.all([cardsPromise, setsPromise, productsPromise, profilesPromise, listingsPromise]); })()', 'search-block.ts'), context);
  assert.deepEqual(calls, category === 'cards' ? { cards: 1, sets: 0 } : { cards: 0, sets: 1 });
  assert.equal(result.length, 5);
}

// Extract and execute the real account action against stale/current account scenarios.
const accountSource = fs.readFileSync('features/settings/CoreAccountScreen.tsx', 'utf8');
const accountAst = ts.createSourceFile('Account.tsx', accountSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let action;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'signOut') action = node.getText(accountAst); ts.forEachChild(node, visit); }
visit(accountAst);
for (const scenario of ['current', 'stale-before-response', 'denied', 'already-busy']) {
  const calls = [], currentAccount = { current: 'A' };
  const context = {
    user: { id: 'A' }, currentAccount, busyRef: { current: scenario === 'already-busy' },
    setBusy() {}, supabase: { auth: {
      async getUser() { if (scenario === 'stale-before-response') currentAccount.current = 'B';
        return { data: { user: { id: 'A' } }, error: scenario === 'denied' ? new Error('Denied') : null }; },
      async signOut(options) { calls.push(options); return {}; },
    } }, refreshAuth: async () => {}, router: { replace() {} }, Alert: { alert() {} }, Error,
  };
  await vm.runInNewContext('(async () => {' + compile(action, 'action.ts') + '; await signOut();})()', context);
  assert.equal(calls.length, scenario === 'current' ? 1 : 0);
  if (calls.length) assert.equal(calls[0].scope, 'local');
}

// A canonical card renders before optional artwork settles; stale details cannot leak.
const requests = [];
let params = { id: 'card-A', language: 'ja' };
const cardModule = load('features/card/CoreCardDetailScreen.tsx', {
  react: React, 'react-native': { ScrollView: passthrough, View: passthrough },
  'expo-router': { router: { canGoBack: () => false, replace() {}, push() {} }, useLocalSearchParams: () => params },
  '../../components/StackrScreen': { StackrScreen: passthrough, StackrPageHeader: 'Header' },
  '../../components/StackrControls': { StackrButton: 'Button' }, '../../components/StackrImage': { StackrImage: 'CardImage' },
  '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: () => null }, '../../components/Text': { Text: 'Text' },
  '../../components/theme-context': { useTheme: () => ({ theme }) },
  '../../lib/stackrDomainAdapter': { fetchStackrCard: (id, options) => { const pending = defer(); requests.push({ id, options, pending }); return pending.promise; } },
  '../../lib/cardArtworkPresentation': { getCardArtworkPresentation: () => undefined },
  '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 136 } },
});
const card = (id, name) => ({ id, name, englishDisplayName: name, localName: 'ブロロン', language: 'ja', number: '060',
  images: { small: 'https://assets.stackrtcg.com/' + id + '/grid.png' }, set: { id: 'SV1S', name: 'Scarlet ex' } });
await act(async () => { app = Renderer.create(React.createElement(cardModule.default)); });
await act(async () => requests[0].options.onCanonicalCard(card('card-A', 'Varoom')));
assert.equal(app.root.findByType('Header').props.title, 'Varoom');
params = { id: 'card-B', language: 'ja' };
await act(async () => app.update(React.createElement(cardModule.default)));
assert.equal(requests[0].options.signal.aborted, true);
await act(async () => { requests[0].pending.resolve(card('card-A', 'Stale')); await tick(); });
assert.notEqual(app.root.findByType('Header').props.title, 'Stale');
await act(async () => requests[1].options.onCanonicalCard(card('card-B', 'Current')));
assert.equal(app.root.findByType('Header').props.title, 'Current');
assert.ok(app.root.findByType('CardImage').props.uri.endsWith('/card-B/grid.png'));
await act(async () => app.unmount());
console.log('PASS core route/tab protection, source request suppression, local account action and canonical card race regressions');

