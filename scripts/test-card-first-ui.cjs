/* Actual shared-component interactions + source layout contracts, not native render timing. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const theme = { colors: { primary: '#6b35e5', text: '#252428', textSoft: '#65616b', card: '#ffffff', bg: '#fafafa', border: '#d9d4df', surface: '#f0ecf5' } };
let dismissals = 0;
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const mocks = {
  react: { __esModule: true, default: React },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  'react-native': { Keyboard: { dismiss() { dismissals++; } }, StyleSheet: { create: (styles) => styles, hairlineWidth: 1 }, TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View' },
  './StackrModalSystem': { StackrBottomSheet: 'StackrBottomSheet' },
  './StackrNavigationIcon': { StackrNavigationIcon: 'StackrNavigationIcon' },
  './Text': { Text: 'Text' },
  './theme-context': { useTheme: () => ({ theme }) },
};
const loaded = { exports: {} };
const compiled = ts.transpileModule(read('components/StackrBrowseControls.tsx'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: (id) => { assert.ok(id in mocks, `Unexpected runtime dependency: ${id}`); return mocks[id]; } });
const C = loaded.exports;
function all(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
}
const first = (node, predicate) => { const match = all(node, predicate)[0]; assert.ok(match, 'Expected element not found'); return match; };
const flatStyle = (style) => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatStyle)) : style;
const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node);

test('binder action reuses the existing Collection glyph and caller callback', () => {
  let presses = 0; const button = C.StackrBinderButton({ onPress: () => presses++ });
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityLabel, 'Create binder');
  assert.ok(flatStyle(button.props.style).minHeight >= 44);
  assert.equal(first(button, (n) => n.type === 'StackrNavigationIcon').props.name, 'collection');
  button.props.onPress(); assert.equal(presses, 1);
  const disabled = C.StackrBinderButton({ onPress() {}, disabled: true });
  assert.equal(disabled.props.disabled, true); assert.equal(disabled.props.accessibilityState.disabled, true);
});

test('toolbar edits and clears query, selects ownership, opens filters without clearing state', () => {
  let query = 'Pikachu', selection = 'all', opened = 0; const before = dismissals;
  const toolbar = C.StackrBrowseToolbar({ search: query, onSearchChange: (value) => query = value, onOpenFilters: () => opened++, activeFilterCount: 2, selected: selection, choices: [{ key: 'all', label: 'All' }, { key: 'owned', label: 'Owned' }], onSelect: (value) => selection = value, resultLabel: '8 shown' });
  first(toolbar, (n) => n.type === 'TextInput').props.onChangeText('Charizard'); assert.equal(query, 'Charizard');
  first(toolbar, (n) => n.props.accessibilityLabel === 'Clear search').props.onPress(); assert.equal(query, '');
  first(toolbar, (n) => n.props.accessibilityLabel === 'Owned').props.onPress(); assert.equal(selection, 'owned');
  first(toolbar, (n) => n.type === 'TouchableOpacity' && n.props.accessibilityLabel.startsWith('Filters')).props.onPress();
  assert.equal(opened, 1); assert.equal(dismissals, before + 1); assert.equal(selection, 'owned');
  assert.match(text(toolbar), /Filters · 2/); assert.match(text(toolbar), /8 shown/);
  for (const button of all(toolbar, (n) => n.type === 'TouchableOpacity')) assert.ok(flatStyle(button.props.style).minHeight >= 44);
});

test('toolbar inset can match a screen that already has outer padding', () => {
  const props = { search: '', onSearchChange() {}, onOpenFilters() {} };
  assert.equal(flatStyle(C.StackrBrowseToolbar(props).props.style).paddingHorizontal, 16);
  assert.equal(flatStyle(C.StackrBrowseToolbar({ ...props, horizontalInset: 0 }).props.style).paddingHorizontal, 0);
});

test('filter options wrap, expose selection and preserve exact option keys', () => {
  let selection; const group = C.StackrBrowseFilterGroup({ title: 'Rarity', choices: [{ key: 'SAR', label: 'Special illustration rare', count: 6 }], selected: 'SAR', onSelect: (key) => selection = key });
  const button = first(group, (n) => n.type === 'TouchableOpacity');
  assert.equal(button.props.accessibilityState.selected, true); assert.match(button.props.accessibilityLabel, /6 entries/);
  assert.equal(flatStyle(button.props.style).minHeight, 44); assert.equal(flatStyle(button.props.style).maxWidth, '100%');
  button.props.onPress(); assert.equal(selection, 'SAR');
  assert.ok(all(group, (n) => n.type === 'View').some((n) => flatStyle(n.props.style)?.flexWrap === 'wrap'));
});

test('filter sheet reuses the existing modal and separates close from reset', () => {
  let closed = 0, cleared = 0; const child = React.createElement('ActualFilterContent', {});
  const sheet = C.StackrBrowseFilterSheet({ visible: true, onClose: () => closed++, onClear: () => cleared++, children: child });
  assert.equal(sheet.type, 'StackrBottomSheet'); assert.equal(sheet.props.visible, true);
  sheet.props.onClose(); assert.equal(closed, 1); assert.equal(cleared, 0);
  sheet.props.onClear(); assert.equal(cleared, 1);
  sheet.props.footer.props.onPress(); assert.equal(closed, 2); assert.equal(cleared, 1);
  assert.ok(flatStyle(sheet.props.footer.props.style).minHeight >= 44);
});

test('summary keeps supplied artwork and action rather than synthesising another icon', () => {
  const logo = React.createElement('ApprovedLogo', { identity: 'set-and-language' });
  const summary = C.StackrBrowseSummary({ title: 'Set', logo, action: React.createElement('BinderAction', {}), children: 'Ownership pending' });
  assert.equal(first(summary, (n) => n.type === 'ApprovedLogo').props.identity, 'set-and-language');
  assert.match(text(summary), /Ownership pending/); assert.equal(summary.props.testID, 'browse-summary');
});

function sourceFile(file) { return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function elements(source, tag) { const found = []; const visit = (n) => { if ((ts.isJsxElement(n) && n.openingElement.tagName.getText(source) === tag) || (ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === tag)) found.push(n); ts.forEachChild(n, visit); }; visit(source); return found; }
function attrs(node) { return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes; }
function attr(node, name) { return attrs(node).properties.find((p) => ts.isJsxAttribute(p) && p.name.text === name); }

test('set has one two-column grid; identity summary is its scrollable header, advanced filters are outside it', () => {
  const source = sourceFile('app/set/[id].tsx'); const grids = elements(source, 'FlatList'); assert.equal(grids.length, 1);
  assert.equal(attr(grids[0], 'numColumns').initializer.expression.text, '2');
  assert.match(attr(grids[0], 'data').getText(source), /visibleFilteredCards/);
  assert.match(attr(grids[0], 'ListHeaderComponent').getText(source), /StackrBrowseSummary/);
  assert.equal(elements(source, 'StackrBrowseToolbar').length, 1);
  assert.equal(elements(source, 'StackrBrowseFilterSheet').length, 1);
  assert.equal(elements(source, 'StackrActionButton').length, 0, 'No full-width create-binder banner');
  const code = source.text; assert.ok(!code.includes('Collection Progress') && !code.includes('always pinned'));
  assert.match(code, /ownershipReady \? .*catalogue entries owned/);
  assert.match(code, /Published total:/); assert.match(code, /Loaded catalogue entries:/);
  assert.ok(!code.includes('progressPercent'), 'No percentage using an unverified mixed counting basis');
});

test('Collection library uses a real grid with scrolling shortcuts and no expanding inline sort list', () => {
  const source = sourceFile('app/(tabs)/binder.tsx');
  assert.equal(elements(source, 'StackrBinderButton').length, 1);
  const grid = elements(source, 'FlatList')[0]; assert.ok(grid); assert.match(attr(grid, 'ListHeaderComponent').getText(source), /COLLECTION_VAULT_SHORTCUTS/);
  assert.equal(elements(source, 'StackrBrowseFilterSheet').length, 1);
  assert.ok(source.text.includes('onDragEnd={async ({ data }) =>'), 'Existing binder reordering retained');
  assert.ok(source.text.includes('navigationIcon="collection"'), 'Empty create-binder action uses the same icon');
});

test('Search, Market and Discover Sets share the compact toolbar and preserve existing sheets', () => {
  for (const file of ['app/(tabs)/search.tsx', 'features/market/MarketTabScreen.tsx', 'app/(tabs)/explore.tsx']) assert.equal(elements(sourceFile(file), 'StackrBrowseToolbar').length, 1, file);
  assert.match(read('app/(tabs)/search.tsx'), /<SearchFilterSheet/);
  const market = read('features/market/MarketTabScreen.tsx');
  assert.ok(market.includes("const disabled = mode === 'buy' && option.key === 'chase'"));
  assert.ok(market.includes('showMyListings={canPublishListing}') && market.includes('canPublishListing ?'));
});

test('binder options retain ownership-safe management, exact artwork and correct sorting labels', () => {
  const code = read('features/binder/BinderDetailScreen.tsx');
  assert.ok(code.includes('title="Binder options"'));
  for (const required of ['coverKey={binder.cover_key}', 'fallbackArtSource={customNameArt?.source ?? null}', 'disabled={updatingVisibility}', 'onValueChange={togglePublic}', 'disabled={updatingMasterSet}', 'onValueChange={toggleMasterSet}', "label: 'Owned first'", "label: 'Missing first'"]) assert.ok(code.includes(required), required);
  assert.ok(!code.includes('{sortDropdownOpen && ('), 'No expanding dropdown consuming the card viewport');
});

test('Home retains brand, GBP pricing and artwork while placing collection ahead of price details', () => {
  const source = read('features/home/HubScreen.tsx'); const render = source.slice(source.indexOf('{/* TOP BAR */}'));
  assert.ok(render.indexOf('<HomeCollectionHero') < render.indexOf('<ValueTrackerCard'));
  for (const retained of ['stackrBrand.logoDisplay', 'stackrBrand.spelt', 'currency="GBP"', 'pricingWarning={collectionPricingWarning}', 'onRefresh={refreshLivePrices}']) assert.ok(render.includes(retained), retained);
});

test('all changed native source parses without errors and there is no replacement bottom-nav halo', () => {
  for (const file of ['app/(tabs)/binder.tsx', 'app/(tabs)/explore.tsx', 'app/(tabs)/search.tsx', 'app/_layout.tsx', 'app/binder/new.tsx', 'app/set/[id].tsx', 'components/StackrBrowseControls.tsx', 'components/PremiumUI.tsx', 'components/HomeCollectorSections.tsx', 'components/HomeCommandCenter.tsx', 'features/binder/BinderDetailScreen.tsx', 'features/home/HubScreen.tsx', 'features/market/MarketTabScreen.tsx']) assert.equal(sourceFile(file).parseDiagnostics.length, 0, file);
  const nav = read('app/_layout.tsx'); assert.ok(!nav.includes('activeGlowColor')); assert.ok(nav.includes('StackrNavigationIcon')); assert.ok(nav.includes('useSafeAreaInsets'));
});
