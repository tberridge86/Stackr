import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

type Element = { type: string | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> };
const host = (type: string) => type;
let hookIndex = 0;
const hookState: unknown[] = [];
const reactMock = {
  createElement(type: Element['type'], props: Record<string, unknown> | null, ...children: unknown[]): Element { return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }; },
  useMemo: <T,>(factory: () => T) => factory(), useCallback: <T,>(value: T) => value, useRef: <T,>(value: T) => ({ current: value }), useEffect: () => undefined,
  useState: <T,>(initial: T) => { const slot = hookIndex++; if (hookState[slot] === undefined) hookState[slot] = initial; return [hookState[slot] as T, (next: T | ((current: T) => T)) => { hookState[slot] = typeof next === 'function' ? (next as (current: T) => T)(hookState[slot] as T) : next; }] as const; },
};
class AnimatedValue { interpolate() { return 0; } setValue() {} }
const mocks: Record<string, unknown> = {
  react: { __esModule: true, default: reactMock, ...reactMock },
  'react-native': { ActivityIndicator: host('ActivityIndicator'), Image: host('Image'), Modal: host('Modal'), Pressable: host('Pressable'), ScrollView: host('ScrollView'), TouchableOpacity: host('TouchableOpacity'), View: host('View'), StyleSheet: { create: <T,>(value: T) => value, absoluteFill: {} }, Animated: { Value: AnimatedValue, spring: () => ({ start() {} }) }, useWindowDimensions: () => ({ width: 393 }) },
  'react-native-svg': { __esModule: true, default: host('Svg'), Defs: host('Defs'), LinearGradient: host('LinearGradient'), Path: host('Path'), Stop: host('Stop') },
  '@expo/vector-icons': { Ionicons: host('Ionicons') }, './Text': { Text: host('Text') },
  './theme-context': { useTheme: () => ({ isDark: false, theme: { colors: { card: '#fff', border: '#ddd', text: '#111', textSoft: '#666', surface: '#f7f3ff', primary: '#6938F5' } } }) },
  '../lib/typography': { numericTextStyle: {}, tabularNumberStyle: {}, typeScale: { caption: {}, support: {}, heroValue: {}, micro: {}, cardTitle: {} } },
  '../lib/valueTrackerChartLayout': { VALUE_TRACKER_CHART_HEIGHT: 96, getValueTrackerChartWidth: (panelWidth: number, screenWidth: number) => Math.max(1, (panelWidth || screenWidth - 48) - 20) },
};

const componentPath = resolve('components/ValueTrackerCard.tsx');
const originalLoad = (Module as unknown as { _load: Function })._load;
const originalPng = require.extensions['.png'];
require.extensions['.png'] = (module) => { module.exports = 1; };
(Module as unknown as { _load: Function })._load = function mocked(request: string, parent: unknown, isMain: boolean) { return request in mocks ? mocks[request] : originalLoad.call(this, request, parent, isMain); };
const loaded = new Module(componentPath);
(loaded as unknown as { filename: string }).filename = componentPath;
(loaded as unknown as { _compile(code: string, filename: string): void })._compile(transformSync(readFileSync(componentPath, 'utf8'), { loader: 'tsx', format: 'cjs', target: 'es2022' }).code, componentPath);
(Module as unknown as { _load: Function })._load = originalLoad;
require.extensions['.png'] = originalPng;
const Card = (loaded as unknown as { exports: { ValueTrackerCard: (props: Record<string, unknown>) => unknown } }).exports.ValueTrackerCard;
function render(props: Record<string, unknown>) { hookIndex = 0; return Card(props); }
function text(node: unknown): string { if (Array.isArray(node)) return node.map(text).join(''); if (!node || typeof node !== 'object') return typeof node === 'string' ? node : ''; return text((node as Element).props.children); }
function find(node: unknown, predicate: (item: Element) => boolean): Element | null { if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean) ?? null; if (!node || typeof node !== 'object') return null; const item = node as Element; return predicate(item) ? item : find(item.props.children, predicate); }
function findAll(node: unknown, predicate: (item: Element) => boolean): Element[] { if (Array.isArray(node)) return node.flatMap((item) => findAll(item, predicate)); if (!node || typeof node !== 'object') return []; const item = node as Element; return [...(predicate(item) ? [item] : []), ...findAll(item.props.children, predicate)]; }
function styleOf(value: unknown): Record<string, unknown> { return Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(styleOf)) : value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

let selectedRange = '';
let refreshCalls = 0;
let historyCalls = 0;
const props = { compact: true, totalValue: 120, pricingState: 'fresh', pricingCoverageLabel: '3/3 stored prices', ownedCount: 3, percentageChange: 5, absoluteChange: 6, trendData: [100, 108, 120], onPress() { historyCalls += 1; }, onRefresh() { refreshCalls += 1; }, onTrendRangeChange(range: string) { selectedRange = range; } };
const initial = render(props);
const chartHost = find(initial, (item) => item.type === 'View' && typeof item.props.onLayout === 'function');
assert.ok(chartHost, 'Compact Home uses the candidate measured chart host.');
(chartHost.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 369 } } });
const measured = render(props);
const svg = find(measured, (item) => item.type === 'Svg');
assert.equal(svg?.props.width, 349);
assert.equal(svg?.props.height, 76);
assert.match(text(measured), /£120\.00/);
assert.match(text(measured), /\+£6\.00 \(\+5\.0%\) · 7D/);
assert.ok(find(measured, (item) => item.type === 'Ionicons' && item.props.name === 'arrow-up'));
assert.match(text(measured), /3\/3 stored prices/, 'Compact keeps the candidate coverage summary visible.');
assert.ok(find(measured, (item) => item.type === 'View' && item.props.accessible === false), 'Compact uses a neutral outer View instead of an all-card press target.');
assert.ok(find(measured, (item) => item.type === 'View' && styleOf(item.props.style).flexWrap === 'nowrap'), 'Compact Home keeps its refresh in the header row.');
assert.ok(find(measured, (item) => item.type === 'View' && styleOf(item.props.style).flexBasis === 'auto'), 'Compact Home overrides the narrow-card full-width copy basis.');
const initialRefreshButtons = findAll(measured, (item) => item.props.accessibilityLabel === 'Queue live price refresh');
assert.equal(initialRefreshButtons.length, 1, 'Compact exposes one top-right refresh action.');
assert.deepEqual(initialRefreshButtons[0].props.accessibilityState, { disabled: false, busy: false });
(initialRefreshButtons[0].props.onPress as (event: { stopPropagation(): void }) => void)({ stopPropagation() {} });
assert.equal(refreshCalls, 1);
const historyButton = find(measured, (item) => item.props.accessibilityLabel === 'View value history');
assert.ok(historyButton, 'History is reachable alongside Price details while collapsed.');
(historyButton.props.onPress as () => void)();
assert.equal(historyCalls, 1);
const detailsButton = find(measured, (item) => item.props.accessibilityLabel === 'Show price details');
assert.ok(detailsButton, 'Compact value exposes an accessible Price details disclosure.');
(detailsButton.props.onPress as (event: { stopPropagation(): void }) => void)({ stopPropagation() {} });
const expanded = render(props);
assert.ok(find(expanded, (item) => item.props.accessibilityLabel === 'Hide price details'));
assert.equal(findAll(expanded, (item) => item.props.accessibilityLabel === 'Queue live price refresh').length, 1, 'Price details must not duplicate refresh.');
assert.match(text(render({ ...props, absoluteChange: -6, percentageChange: -5 })), /-£6\.00 \(-5\.0%\) · 7D/);
assert.ok(find(render({ ...props, absoluteChange: -6, percentageChange: -5 }), (item) => item.type === 'Ionicons' && item.props.name === 'arrow-down'));
assert.match(text(render({ ...props, totalValue: null, pricingState: 'unavailable', pricingWarning: 'No comparable sales' })), /No stored market estimate yet/);
assert.match(text(render({ ...props, totalValue: null, ownedCount: 0, pricingState: 'empty' })), /Start tracking your collection/);
assert.match(text(render({ ...props, pricingState: 'partial' })), /Known subtotal/);
assert.match(text(render({ ...props, pricingState: 'stale', pricingWarning: 'Stored price is stale' })), /Stored price is stale/);
assert.match(text(render({ ...props, isLoading: true })), /Collection Value/);
assert.match(text(render({ ...props, totalValue: null, error: 'Refresh failed' })), /Value unavailable right now/);
const errorRecovery = render({ ...props, totalValue: null, error: 'Refresh failed', onRetry() {} });
assert.equal(find(errorRecovery, (item) => item.props.accessibilityLabel === 'Retry loading collection prices')?.props.accessibilityRole, 'button');
const longAmount = render({ ...props, totalValue: 1234567.89 });
assert.match(text(longAmount), /£1,234,568/);
const rangeButtons = [
  find(expanded, (item) => item.type === 'TouchableOpacity' && text(item) === '7D'),
  find(expanded, (item) => item.type === 'TouchableOpacity' && text(item) === '30D'),
].filter(Boolean) as Element[];
assert.equal(rangeButtons.length, 2, 'The candidate keeps exactly one 7D/30D control.');
assert.ok(rangeButtons.every((button) => styleOf(button.props.style).minWidth === 44 && styleOf(button.props.style).minHeight === 44), 'Compact range controls retain 44px touch targets.');
(rangeButtons[1].props.onPress as (event: { stopPropagation(): void }) => void)({ stopPropagation() {} });
assert.equal(selectedRange, '30D');
const refreshButton = find(expanded, (item) => item.props.accessibilityLabel === 'Queue live price refresh');
assert.ok(refreshButton, 'Refresh remains a queued candidate action.');
(refreshButton.props.onPress as (event: { stopPropagation(): void }) => void)({ stopPropagation() {} });
assert.equal(refreshCalls, 2);
(find(expanded, (item) => item.props.accessibilityLabel === 'Hide price details')?.props.onPress as (event: { stopPropagation(): void }) => void)({ stopPropagation() {} });
assert.ok(find(render(props), (item) => item.props.accessibilityLabel === 'Show price details'));

console.log('Home pricing release compact layout and pricing states passed.');
