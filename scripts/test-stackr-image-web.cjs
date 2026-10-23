const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const TestRenderer = require('react-test-renderer');
const nativeWeb = require('react-native-web');
const ts = require('typescript');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, modules = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (Object.hasOwn(modules, name)) return modules[name];
    throw new Error(`Unexpected dependency ${name} in ${file}`);
  }, URL, Set, JSON, process: { env: {} } });
  return exports;
}

const ExpoImage = props => React.createElement('span', { 'data-expo-fallback': true });
ExpoImage.prefetch = async () => true;
const common = { react: React, 'react-native': nativeWeb, 'expo-image': { Image: ExpoImage } };
const web = load('components/StackrImageElement.web.tsx', common);
const native = load('components/StackrImageElement.tsx', common);
const image = load('components/StackrImage.tsx', {
  ...common,
  '@expo/vector-icons': { Ionicons: () => React.createElement('span', { 'data-unavailable': true }) },
  './StackrImageElement': web,
  './theme-context': { useTheme: () => ({ theme: { colors: { surface: '#eeeeee', textSoft: '#222222' } } }) },
  '../lib/stackrSizing': load('lib/stackrSizing.ts'),
  '../lib/stackrImageCandidates': load('lib/stackrImageCandidates.ts'),
  '../lib/tcgdexControlledCardReference': load('lib/tcgdexControlledCardReference.ts'),
});

const thumbnail = 'https://cdn.example.invalid/cards/exact/grid.webp';
const original = 'https://cdn.example.invalid/cards/exact/original.jpg';
const props = { thumbnailUri: thumbnail, fullUri: original, style: { width: 200, height: 280 },
  placeholderColor: '#abcdef', accessibilityLabel: 'Exact card artwork' };
const markup = renderToStaticMarkup(React.createElement(image.StackrImage, props));
assert.match(markup, /<img[^>]+loading="lazy"/);
assert.match(markup, /decoding="async"/);
assert.match(markup, /fetchPriority="auto"/);
assert.match(markup, /width:200px/);
assert.match(markup, /height:280px/);
assert.match(markup, /background-color:(?:#abcdef|rgba?\(171, ?205, ?239[^)]*\))/);
assert.match(markup, /alt="Exact card artwork"/);
assert.ok(markup.includes(`src="${thumbnail}"`), 'the actual supplied CDN thumbnail reaches the DOM unchanged');
assert.ok(!markup.includes(original), 'a list row must not request or preload its full-resolution fallback');
assert.doesNotMatch(markup, /rel="preload"/, 'ordinary lazy rows do not gain eager React image preload hints');

for (const intent of [{ priority: 'high' }, { prefetch: true }, { preserveDetail: true, thumbnailUri: undefined }]) {
  const html = renderToStaticMarkup(React.createElement(image.StackrImage, { ...props, ...intent }));
  assert.match(html, /<img[^>]+loading="eager"/, 'visible/detail/prewarmed images retain eager intent');
}
const low = renderToStaticMarkup(React.createElement(image.StackrImage, { ...props, priority: 'low' }));
assert.match(low, /loading="lazy"/);
assert.match(low, /fetchPriority="low"/);

// Special source/cache/transition behavior remains Expo's responsibility.
for (const overrides of [
  { source: 42 },
  { source: { uri: thumbnail, headers: { Authorization: 'test-placeholder' } } },
  { source: { uri: `${thumbnail}?token=test-placeholder` } },
  { cachePolicy: 'memory' },
  { cachePolicy: 'none' },
  { placeholder: { uri: thumbnail } },
  { transition: 120 },
  { tintColor: '#ffffff' },
]) {
  const html = renderToStaticMarkup(React.createElement(web.StackrImageElement,
    { source: { uri: thumbnail }, loading: 'lazy', ...overrides }));
  assert.match(html, /data-expo-fallback="true"/);
  assert.doesNotMatch(html, /<img/);
}

async function main() {
  let renderer;
  const diagnostics = [];
  let loaded = 0;
  const runtimeProps = { ...props, onLoad: () => { loaded++; }, onDiagnostic: event => diagnostics.push(event) };
  await TestRenderer.act(() => { renderer = TestRenderer.create(React.createElement(image.StackrImage, runtimeProps)); });
  const current = () => renderer.root.findByType('img');
  assert.equal(current().props.src, thumbnail);
  await TestRenderer.act(() => current().props.onLoad({ currentTarget: { naturalWidth: 245, naturalHeight: 342 } }));
  assert.equal(loaded, 1);
  assert.deepEqual(diagnostics.map(event => event.phase), ['loaded', 'displayed']);
  assert.equal(diagnostics[0].width, 245);
  assert.equal(diagnostics[0].cache, 'unknown', 'DOM load must not be reported as a proven cache miss');
  const frameBefore = renderer.toJSON().props.style;
  const stale = current().props.onError;
  await TestRenderer.act(() => current().props.onError());
  assert.equal(current().props.src, thumbnail, 'one same-rendition retry precedes fallback');
  await TestRenderer.act(() => current().props.onError());
  assert.equal(current().props.src, original, 'only the supplied same-printing fallback may follow');
  assert.equal(current().props.loading, 'lazy');
  assert.deepEqual(renderer.toJSON().props.style, frameBefore, 'loading and failure do not change the reserved frame');
  await TestRenderer.act(() => current().props.onError());
  await TestRenderer.act(() => current().props.onError());
  assert.equal(renderer.root.findAllByType('img').length, 0, 'exhaustion ends requests');
  assert.equal(renderer.root.findAllByProps({ 'data-unavailable': true }).length, 1);

  const replacement = 'https://cdn.example.invalid/cards/corrected/grid.webp';
  await TestRenderer.act(() => renderer.update(React.createElement(image.StackrImage,
    { ...runtimeProps, thumbnailUri: replacement })));
  await TestRenderer.act(() => stale());
  assert.equal(current().props.src, replacement, 'late errors cannot poison a new identity');
  await TestRenderer.act(() => renderer.unmount());

  let nativeRenderer;
  await TestRenderer.act(() => { nativeRenderer = TestRenderer.create(React.createElement(native.StackrImageElement,
    { source: { uri: thumbnail }, loading: 'lazy', priority: 'low', cachePolicy: 'memory-disk' })); });
  const passthrough = nativeRenderer.root.findByType(ExpoImage).props;
  assert.equal(passthrough.loading, undefined, 'browser-only loading never reaches native Expo');
  assert.equal(passthrough.source.uri, thumbnail);
  assert.equal(passthrough.priority, 'low');
  assert.equal(passthrough.cachePolicy, 'memory-disk');
  await TestRenderer.act(() => nativeRenderer.unmount());
  console.log('Web image DOM markup and component events pass: lazy/eager priority, unchanged CDN URLs, stable frames, exact fallback/retry and native Expo passthrough. Browser network timing remains unmeasured.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
