const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const requireRepo = createRequire(path.resolve('package.json'));
const ts = requireRepo('typescript');
function load(file, modules) {
  const code = ts.transpileModule(fs.readFileSync('' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {}; vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, console, Set, JSON }); return exports;
}
const planner = load('lib/cardImagePreloadWindow.ts', {});
const urls = Array.from({ length: 100 }, (_, i) => `https://approved.example/${i}/grid.webp`);
let checks = 0;
const same = (a, b, message) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, message); checks++; };
same(planner.cardImagePreloadWindow(urls, [0, 1]), urls.slice(0, 8), 'visible plus six ahead');
same(planner.cardImagePreloadWindow(urls, [42, 40, 41]), urls.slice(40, 49), 'scroll follows actual viewport');
same(planner.cardImagePreloadWindow(urls, [99]), [urls[99]], 'end is bounded');
same(planner.cardImagePreloadWindow(urls, [-1, NaN, 100]), [], 'invalid/no visible items never preload whole set');
same(planner.cardImagePreloadWindow(urls, Array.from({ length: 50 }, (_, i) => i)), urls.slice(0, 18), 'hard cap eighteen');
same(planner.cardImagePreloadWindow([urls[0], null, urls[0], urls[2]], [0, 1, 2], 1), [urls[0], urls[2]], 'nulls and repeated artwork deduplicate');
same(planner.cardImagePreloadWindow(urls, [10], 999, 999), urls.slice(10, 17), 'lookahead remains six');

let cursor = 0, focused = true;
const hooks = [], pending = [], scheduled = [];
const react = {
  useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
  useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((d, n) => d !== hooks[i].deps[n])) hooks[i] = { fn, deps }; return hooks[i].fn; },
  useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((d, n) => d !== hooks[i].deps[n])) { hooks[i]?.cleanup?.(); hooks[i] = { deps }; pending.push(() => { hooks[i].cleanup = fn(); }); } },
};
const hook = load('hooks/useCardImagePreload.ts', {
  react, '@react-navigation/native': { useIsFocused: () => focused },
  '../lib/cardImagePreloadWindow': planner,
  '../components/StackrImage': { prefetchStackrImagesAfterInteractions(values, limit) { const task = { values: [...values], limit, cancelled: false }; scheduled.push(task); return () => { task.cancelled = true; }; } },
});
function render(values, initial = 4) { cursor = 0; const callback = hook.useCardImagePreload(values, initial); while (pending.length) pending.shift()(); return callback; }
const first = render(urls);
same(scheduled[0].values, urls.slice(0, 10), 'initial visible page plus small lookahead');
first({ viewableItems: [{ index: 40, isViewable: true }, { index: 41, isViewable: true }] });
same(scheduled.at(-1).values, urls.slice(40, 48), 'actual viewability callback drives preloading');
assert(scheduled[0].cancelled); checks++;
const count = scheduled.length;
first({ viewableItems: [{ index: 40 }, { index: 41 }] });
assert.equal(scheduled.length, count, 'unchanged viewport does not reschedule'); checks++;
assert.equal(render([...urls]), first, 'callback stays stable for native list'); checks++;
const replacement = urls.map(u => u.replace('/grid.webp', '/corrected-grid.webp'));
render(replacement);
same(scheduled.at(-1).values, replacement.slice(0, 10), 'changed search/image references replace queued work');
focused = false; render(replacement); assert(scheduled.at(-1).cancelled, 'blur cancels pending work'); checks++;
const hiddenCount = scheduled.length; first({ viewableItems: [{ index: 70 }] }); assert.equal(scheduled.length, hiddenCount, 'hidden route never preloads'); checks++;
focused = true; render(replacement); same(scheduled.at(-1).values, replacement.slice(0, 10), 'focus resumes bounded warming');
for (const h of hooks) h.cleanup?.(); assert(scheduled.at(-1).cancelled, 'unmount cancels pending work'); checks++;

const hostReact = { createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
  Children: { toArray: children => Array.isArray(children) ? children : [children] }, isValidElement: item => Boolean(item?.type), useRef: value => ({ current: value }) };
const seen = [];
const rails = load('components/search/SearchResults.tsx', {
  react: { ...hostReact, default: hostReact, __esModule: true },
  'react-native': { View: 'View', FlatList: 'FlatList', ScrollView: 'ScrollView' },
  '../theme-context': { useTheme: () => ({ theme: { colors: {} } }) },
  '../../hooks/useCardImagePreload': { useCardImagePreload(values) { seen.push(values); return first; } },
});
function find(node, type) { if (!node || typeof node !== 'object') return null; if (node.type === type) return node; for (const child of node.props?.children?.flat(Infinity) ?? []) { const found = find(child, type); if (found) return found; } return null; }
const children = urls.map((uri, i) => ({ type: 'Card', key: `printing-${i}`, props: { imageUri: uri, fullImageUri: 'https://approved.example/detail.webp' } }));
const rail = rails.SearchRailSection({ title: 'Cards', children, cardImageUris: urls });
const list = find(rail, 'FlatList'); assert(list && !find(rail, 'ScrollView')); checks++;
assert.equal(list.props.initialNumToRender, 4); assert.equal(list.props.maxToRenderPerBatch, 4); checks++;
assert.equal(list.props.onViewableItemsChanged, first); same(seen.at(-1), urls, 'only supplied thumbnails passed; full image stays in card action');
assert.equal(list.props.keyExtractor(children[12], 12), 'printing-12'); checks++;
assert(find(rails.SearchRailSection({ title: 'Sets', children }), 'ScrollView'), 'non-card rails retain existing layout'); checks++;
const binderSource = fs.readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
const binderCallback = binderSource.match(/const onBinderViewableItemsChanged = useRef\(([\s\S]*?)\)\.current;/)?.[1];
assert(binderCallback, 'read the actual binder callback');
const traceCalls = [], priceCalls = [], imageCalls = [], priceIds = { current: [] };
const callbackExports = {};
vm.runInNewContext(ts.transpileModule('exports.callback = ' + binderCallback, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: callbackExports, imageViewableRef: { current: value => imageCalls.push(value) },
  retrievalTraceRef: { current: { visible: value => traceCalls.push(value) } }, visiblePriceIdsRef: priceIds,
  visiblePriceReaderRef: { current: { request: value => priceCalls.push(value) } },
});
const viewableItems = [{ index: 14, item: { id: 'visible-exact-printing' }, isViewable: true }, { index: 15, item: { id: 'hidden-row' }, isViewable: false }];
callbackExports.callback({ viewableItems });
assert.equal(imageCalls[0].viewableItems, viewableItems, 'images receive actual viewport indices'); checks++;
same(priceCalls, [['visible-exact-printing']], 'existing pricing receives exactly its original visible IDs');
same(traceCalls, [[{ id: 'visible-exact-printing' }]], 'existing retrieval tracing is preserved');
console.log(`${checks} preloading/window/lifecycle/actual-rail checks passed. Native scrolling remains a device gate.`);
