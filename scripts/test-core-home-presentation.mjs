import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, dependencies) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, console, Date, Intl,
    require(id) { assert.ok(id in dependencies, 'Unexpected dependency: ' + id); return dependencies[id]; } });
  return module.exports;
}
const presentation = load('lib/coreHomePresentation.ts', {});
const summary = (state, priced, total, amount) => ({ collectionValue: amount, totalCardsOwned: total,
  uniqueCards: 4, binderCount: 2, valuation: { state, pricedUnits: priced, totalUnits: total } });
for (const [input, amount, percent] of [
  [null, '—', null], [summary('empty', 0, 0, 0), '£0.00', null],
  [summary('unavailable', 0, 5, null), '—', 0], [summary('unavailable', 0, 5, 0), '—', 0],
  [summary('partial', 3, 5, 120.5), '£120.50', 60],
  [summary('available', 5, 5, 0), '£0.00', 100],
]) {
  const actual = presentation.getCoreHomeValuePresentation(input);
  assert.equal(actual.amount, amount); assert.equal(actual.pricedPercent, percent);
  if (input && input.valuation.state !== 'empty') assert.match(actual.detail, /Stored estimate.*price dates unavailable/);
}

let auth = { user: { id: 'A' }, loading: false, error: null, cachedReadSession: { epoch: 1 }, refreshAuth() {} };
const reads = [], routes = [];
const theme = { dark: false, colors: { bg: '#f8f5fb', card: '#fff', text: '#271730',
  textSoft: '#65536c', primary: '#7544a3', border: '#ded4e4' } };
const home = load('features/home/CoreHomeScreen.tsx', {
  react: React,
  'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable',
    RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 320 }) },
  'expo-linear-gradient': { LinearGradient: 'Gradient' },
  'expo-router': { router: { push: route => routes.push(route) }, useFocusEffect: callback => React.useEffect(callback, [callback]) },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '../../components/Text': { Text: 'Text' }, '../../components/theme-context': { useTheme: () => ({ theme }) },
  '../../components/auth-context': { useAuth: () => auth, isKnownAuthDenial: error => error?.status === 403 },
  '../../lib/coreHomeData': { startCoreHomeRead(options) { reads.push(options); return { dispose() {}, done: Promise.resolve() }; } },
  '../../lib/collectionSummaryInvalidation': { subscribeCollectionSummaryInvalidation: () => () => {} },
  '../../lib/binderLibraryCache': { readPersistedBinderOverview: async () => null },
  '../../components/BinderArtwork': { BinderArtwork: 'BinderArtwork' },
  '../../components/StackrNavigationIcon': { StackrNavigationIcon: 'Icon' },
  '../../lib/stackrBrand': { stackrBrand: { wordmark: 'actual-wordmark' } },
  '../../lib/stackrIcons': { stackrIcons: { setDiscovery: 'sets-art', pokedex: 'pokedex-art' } },
  '../../lib/coreHomePresentation': presentation,
});
let screen;
await act(async () => { screen = Renderer.create(React.createElement(home.default)); });
const text = () => screen.root.findAllByType('Text').map(node => node.children.filter(item => typeof item === 'string').join('')).join('\n');
assert.equal(screen.root.findByProps({ accessibilityLabel: 'Stackr' }).props.source, 'actual-wordmark');
await act(async () => {
  reads.at(-1).onSummary(summary('partial', 3, 5, 120.5));
  reads.at(-1).onBinders([{ id: 'binder-one', name: 'My anniversary', type: 'official', cover_key: null,
    source_set_id: '88e351b5-8191-5ef4-854b-2978046cda53', language: 'ja', source_set_display_name: '30th Celebration' }]);
  reads.at(-1).onDone();
});
assert.match(text(), /£120\.50/); assert.match(text(), /3 of 5 copies priced/);
assert.equal(screen.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue.now, 60);
assert.equal(screen.root.findByType('BinderArtwork').props.sourceSetId, '88e351b5-8191-5ef4-854b-2978046cda53');
assert.equal(screen.root.findByType('BinderArtwork').props.sourceSetLanguage, 'ja');
assert.ok(screen.root.findByType('BinderArtwork').props.width * 1.18 <= 112, 'The logo shelf fits inside a 320px phone card');
assert.equal(screen.root.findByType('BinderArtwork').props.showProgressBar, false, 'Home cannot fabricate binder progress from six preview rows');
await act(async () => {
  for (const label of ['Search cards and sets', 'Discover sets', 'Open collection Pokédex', 'Open My anniversary']) {
    screen.root.findByProps({ accessibilityLabel: label }).props.onPress();
  }
});
assert.deepEqual(JSON.parse(JSON.stringify(routes)), ['/(tabs)/search', '/(tabs)/explore', '/(tabs)/pokedex',
  { pathname: '/binder/[id]', params: { id: 'binder-one' } }]);
await act(async () => reads.at(-1).onSummary(summary('unavailable', 0, 5, null)));
assert.doesNotMatch(text(), /£0\.00|£120\.50/);
assert.match(text(), /Prices unavailable/);
const previous = reads.at(-1);
auth = { ...auth, user: { id: 'B' }, cachedReadSession: { epoch: 2 } };
await act(async () => screen.update(React.createElement(home.default)));
assert.equal(previous.isCurrent(), false); assert.equal(reads.at(-1).userId, 'B');
assert.doesNotMatch(text(), /My anniversary|Prices unavailable/);
const verified = reads.at(-1);
auth = { ...auth, loading: true };
await act(async () => screen.update(React.createElement(home.default)));
assert.equal(verified.isCurrent(), false); assert.match(text(), /Checking your sign-in/);
assert.equal(reads.length, 2, 'Unverified auth does not initiate another private read');
await act(async () => screen.unmount());
console.log('PASS actual Home render: stored-value coverage, brand, artwork identity, navigation and account transitions');
