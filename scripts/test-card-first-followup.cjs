/* Executes actual screen filter/reset expressions and toolbar callbacks. Not device rendering. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = process.env.STACKR_UI_SOURCE_ROOT || path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = ts.createSourceFile('set.tsx', read('app/set/[id].tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, (child) => { found ??= find(child, predicate); });
  return found;
}
function expression(code, context = {}) {
  const output = ts.transpileModule(`exports.value = (${code});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { ...context, exports });
  return exports.value;
}
function initializer(name) {
  const node = find(source, (n) => ts.isVariableDeclaration(n) && n.name.getText(source) === name);
  assert.ok(node?.initializer, `Missing real screen declaration: ${name}`);
  return node.initializer.getText(source);
}
function hook(predicate) {
  const node = find(source, (n) => ts.isCallExpression(n) && n.expression.getText(source) === 'useEffect' && predicate(n.getText(source)));
  assert.ok(node, 'Expected real screen effect');
  return node;
}
const sections = ['pattern', 'texture', 'masterBall', 'stamped'];
const cards = sections.map((section, i) => Object.freeze({ id: `variant-${i}`, number: '001', name: 'Pikachu', localName: '', section, rarity: i % 2 ? 'AR' : 'Common', language: 'zh-CN' }));
// Keep overlay rows distinct to verify that filtering/windowing still presents
// the exact priced row, even though quote requests follow the visible window.
const pricedCards = cards.map((card, i) => Object.freeze({ ...card, runtimeCataloguePricing: i === 2 ? Object.freeze({
  displayPrice: 12.34, currency: 'GBP', priceType: 'market_estimate', updatedAt: '2026-10-03T20:05:38.000Z',
  pricingStatus: 'stale', sourceLabel: 'Stale TCGplayer general market estimate', confidence: 'medium',
  unavailableReason: null, priceBasis: 'general',
}) : undefined }));
function filterContext(overrides = {}) {
  return {
    cards, pricedCards, variantQuantities: new Map([['set:variant-1:normal', 1]]), search: '', filter: 'all',
    selectedRarity: 'All', ALL_RARITY_FILTER: 'All', sort: 'number', setId: 'set', finishSection: 'all',
    hasCompletionistSections: true, completionistFamilyCounts: new Map(), useMemo: (fn) => fn(),
    getVariants: () => ['normal'], getVariantKey: (card, set, finish) => `${set}:${card}:${finish}`,
    getSetCardDisplayName: (card) => card.name, getCardRarityFilter: (card) => ({ key: card.rarity, label: card.rarity, rank: 1 }),
    getFinishSectionKey: (card) => card.section, ...overrides,
  };
}
const ids = (rows) => Array.from(rows, (row) => row.id);
function displayedRows(overrides = {}) {
  const context = filterContext(overrides);
  const filteredCards = expression(initializer('filteredCards'), context);
  const visibleFilteredCards = expression(initializer('visibleFilteredCards'), {
    ...context, filteredCards, visibleCardCount: context.cards.length,
  });
  const pricedCardsBySource = expression(initializer('pricedCardsBySource'), context);
  return expression(initializer('pricedVisibleFilteredCards'), { ...context, visibleFilteredCards, pricedCardsBySource });
}

test('real set state and Clear all start from all finishes, with no forced default group', () => {
  const initial = expression(initializer('[finishSection, setFinishSection]'), { useState: (value) => value });
  assert.equal(initial, 'all');
  const state = {};
  expression(initializer('clearCardFilters'), {
    useCallback: (fn) => fn, ALL_RARITY_FILTER: 'All',
    ...Object.fromEntries(['Search', 'Filter', 'SelectedRarity', 'Sort', 'FinishSection'].map((key) => [`set${key}`, (value) => state[key] = value])),
  })();
  assert.deepEqual(state, { Search: '', Filter: 'all', SelectedRarity: 'All', Sort: 'number', FinishSection: 'all' });
});

test('real set filter shows every printing by default and still intersects finish, ownership and rarity', () => {
  const before = JSON.stringify(cards);
  const all = displayedRows();
  assert.deepEqual(ids(all), cards.map((row) => row.id));
  all.forEach((row, index) => assert.equal(row, pricedCards[index], 'Exact overlay row identity must be preserved'));
  assert.deepEqual(all[2].runtimeCataloguePricing, pricedCards[2].runtimeCataloguePricing,
    'Saved stale general estimates must remain attached to the real filtered row');
  assert.deepEqual(ids(displayedRows({ finishSection: 'stamped' })), ['variant-3']);
  assert.deepEqual(ids(displayedRows({ filter: 'owned' })), ['variant-1']);
  assert.deepEqual(ids(displayedRows({ filter: 'missing', selectedRarity: 'AR' })), ['variant-3']);
  assert.equal(displayedRows({ search: 'not-present' }).length, 0);
  assert.equal(displayedRows({ cards: [], pricedCards: [] }).length, 0);
  assert.equal(JSON.stringify(cards), before, 'Filtering must not mutate catalogue data');
});

test('real badge and finish options distinguish All finishes from an active filter', () => {
  const availableFinishSections = sections.map((key) => ({ key, label: key, count: 1 }));
  const base = { hasCompletionistSections: true, availableFinishSections, finishSection: 'all', cards };
  const active = expression(initializer('activeFinishSection'), base);
  assert.equal(active, null);
  const badge = find(source, (n) => ts.isJsxAttribute(n) && n.name.text === 'activeFilterCount');
  const context = { ...base, selectedRarity: 'All', ALL_RARITY_FILTER: 'All', sort: 'number', activeFinishSection: active };
  assert.equal(expression(badge.initializer.expression.getText(source), context), 0);
  assert.equal(expression(badge.initializer.expression.getText(source), { ...context, activeFinishSection: availableFinishSections[1] }), 1);
  const options = find(source, (n) => ts.isJsxAttribute(n) && n.name.text === 'choices' && n.getText(source).includes('availableFinishSections'));
  const values = expression(options.initializer.expression.getText(source), base);
  assert.equal(values[0].key, 'all'); assert.equal(values[0].label, 'All finishes'); assert.equal(values[0].count, cards.length);
  assert.deepEqual(Array.from(values.slice(1), (row) => row.key), sections);
});

test('real scope effects keep valid filters but clear invalid groups and reset on a different set', () => {
  const reset = hook((code) => code.includes('availableFinishSections.some'));
  for (const [finishSection, hasCompletionistSections, expected] of [['all', true, []], ['texture', true, []], ['stamped', true, ['all']], ['texture', false, ['all']]]) {
    const values = [];
    expression(reset.arguments[0].getText(source), { finishSection, hasCompletionistSections, availableFinishSections: [{ key: 'texture' }], setFinishSection: (value) => values.push(value) })();
    assert.deepEqual(values, expected);
  }
  const scope = hook((code) => code.includes('clearCardFilters()'));
  assert.match(scope.arguments[1].getText(source), /setId/);
  const actions = [];
  expression(scope.arguments[0].getText(source), { setSetLogoFailed: (value) => actions.push(['logo', value]), clearCardFilters: () => actions.push(['clear']), setBrowseFiltersVisible: (value) => actions.push(['sheet', value]) })();
  assert.deepEqual(actions, [['logo', false], ['clear'], ['sheet', false]]);
});

test('real toolbar retains submit callbacks and busy state; Search wires recent-search persistence', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  let dismissed = 0, submitted = 0;
  const mocks = {
    react: { __esModule: true, default: React }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss: () => dismissed++ }, StyleSheet: { create: (value) => value }, TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View' },
    './StackrModalSystem': { StackrBottomSheet: 'Sheet' }, './StackrNavigationIcon': { StackrNavigationIcon: 'Icon' },
    './StackrLoadingIndicator': { StackrLoadingIndicator: 'StackrLoadingIndicator' },
    './Text': { Text: 'Text' }, './theme-context': { useTheme: () => ({ theme: { colors: {} } }) },
  };
  const output = ts.transpileModule(read('components/StackrBrowseControls.tsx'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => { assert.ok(name in mocks, `Unexpected runtime dependency: ${name}`); return mocks[name]; } });
  function walk(node, type) {
    if (Array.isArray(node)) return node.flatMap((child) => walk(child, type));
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...walk(node.props?.children, type)];
  }
  const props = { search: 'Pikachu', onSearchChange() {}, onOpenFilters() {}, loading: true, onSubmitSearch: () => submitted++ };
  const toolbar = module.exports.StackrBrowseToolbar(props);
  walk(toolbar, 'TextInput')[0].props.onSubmitEditing();
  assert.equal(dismissed, 1); assert.equal(submitted, 1);
  assert.equal(toolbar.props.accessibilityState.busy, true); assert.equal(walk(toolbar, 'StackrLoadingIndicator').length, 1);
  const idle = module.exports.StackrBrowseToolbar({ ...props, loading: false, onSubmitSearch: undefined });
  walk(idle, 'TextInput')[0].props.onSubmitEditing();
  assert.equal(submitted, 1); assert.equal(walk(idle, 'StackrLoadingIndicator').length, 0);
  const search = read('app/(tabs)/search.tsx');
  assert.match(search, /onSubmitSearch=\{\(\) => \{ void rememberSearch\(\); \}\}/);
  assert.match(search, /loading=\{loading\}/); assert.match(search, /placeholder=\{showcaseConfig\?\.placeholder/);
});
