import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as candidates from '../lib/stackrImageCandidates';
import * as policy from '../lib/tcgdexControlledCardReference';
import * as sizing from '../lib/stackrSizing';
import type { RetrievalImageEvent } from '../lib/performance';

// Render the actual component with minimal host/hooks doubles, then deliver
// image errors and changed props. This is component logic, not a native decode.
const hooks: any[] = []; let cursor = 0; let effects: (() => void)[] = [];
const React = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  memo: (fn: any) => fn,
  useState: (initial: any) => {
    const index = cursor++; if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value: any) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
  },
  useRef: (initial: any) => { const index = cursor++; return hooks[index] ?? (hooks[index] = { current: initial }); },
  useEffect: (effect: () => void) => { effects.push(effect); },
};
const cachedUris = new Set<string>();
const ExpoImage = Object.assign(() => null, {
  displayName: 'ExpoImage',
  prefetch: async (urls: string | string[]) => { for (const url of typeof urls === 'string' ? [urls] : urls) cachedUris.add(url); return true; },
});
const modules: Record<string, any> = {
  react: { ...React, default: React, __esModule: true },
  'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (v: any) => v, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) } },
  'expo-image': { Image: ExpoImage }, '@expo/vector-icons': { Ionicons: 'Icon' },
  './StackrImageElement': { StackrImageElement: 'ExpoImage' },
  './theme-context': { useTheme: () => ({ theme: { colors: { surface: 'white', textSoft: 'gray' } } }) },
  '../lib/stackrImageCandidates': candidates, '../lib/tcgdexControlledCardReference': policy,
  '../lib/stackrSizing': sizing,
};
const compiled = ts.transpileModule(fs.readFileSync('components/StackrImage.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const exports: any = {}; vm.runInNewContext(compiled, { exports, require: (id: string) => modules[id], Set, JSON });
function find(node: any, type: string): any {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type || node.type?.displayName === type) return node;
  for (const child of node.props?.children?.flat(Infinity) ?? []) { const found = find(child, type); if (found) return found; }
  return null;
}
function render(props: any) { cursor = 0; effects = []; const tree = exports.StackrImage(props); for (const effect of effects) effect(); return tree; }
const diagnostics: RetrievalImageEvent[] = [];
const props = { uri: 'https://approved.example/grid.webp', fullUri: 'https://approved.example/detail.webp',
  fallbackUris: ['https://approved.example/original.jpg'], cacheKey: 'printing', onDiagnostic: (event: RetrievalImageEvent) => diagnostics.push(event) };
let tree = render(props); const staleError = find(tree, 'ExpoImage').props.onError;
const staleLoad = find(tree, 'ExpoImage').props.onLoad;
const staleDisplay = find(tree, 'ExpoImage').props.onDisplay;
find(tree, 'ExpoImage').props.onLoad({ cacheType: 'memory', source: { width: 245, height: 342, url: 'PRIVATE_SIGNED_URL' } });
assert.equal(diagnostics.length, 1);
assert.equal(diagnostics[0].phase, 'loaded', 'decode/load must not imply a display callback');
find(tree, 'ExpoImage').props.onDisplay();
assert.equal(diagnostics[1].phase, 'displayed');
assert.doesNotMatch(JSON.stringify(diagnostics), /PRIVATE_SIGNED_URL|https:|printing/);
for (const expected of [props.uri, props.fullUri, props.fallbackUris[0]]) {
  let image = find(tree, 'ExpoImage'); assert.equal(image.props.source.uri, expected);
  assert.equal(image.props.source.cacheKey, expected, 'display uses the URL cache identity populated by Expo prefetch');
  const initialKey = image.props.key;
  image.props.onError(); tree = render(props);
  image = find(tree, 'ExpoImage');
  assert.equal(image.props.source.uri, expected, 'a transient failure retries the same exact rendition before fallback');
  assert.equal(image.props.source.cacheKey, expected, 'retry reuses the URI cache identity');
  assert.notEqual(image.props.key, initialKey, 'retry remounts the failed native image');
  image.props.onError(); tree = render(props);
}
assert.equal(find(tree, 'ExpoImage'), null); assert(find(tree, 'Icon'), 'exhaustion has an honest image placeholder');
assert.equal(diagnostics.filter(event => event.phase === 'retry').length, 3);
assert.equal(diagnostics.filter(event => event.phase === 'failed').length, 3);
assert.equal(diagnostics.filter(event => event.phase === 'failed' && event.terminal).length, 1, 'only exhausted exact candidates are terminal');
tree = render({ ...props, uri: 'https://approved.example/new-grid.webp' });
assert.equal(find(tree, 'ExpoImage').props.source.uri, 'https://approved.example/new-grid.webp');
staleError(); tree = render({ ...props, uri: 'https://approved.example/new-grid.webp' });
assert.equal(find(tree, 'ExpoImage').props.source.uri, 'https://approved.example/new-grid.webp', 'late errors cannot poison corrected artwork');
const beforeLateCallbacks = diagnostics.length;
staleLoad(); staleDisplay();
assert.equal(diagnostics.length, beforeLateCallbacks, 'superseded image callbacks cannot mark a newer source');
const shapedProps = { ...props, uri: 'https://approved.example/new-grid.webp', cardShape: true, contentFit: 'contain' };
tree = render(shapedProps);
tree.props.onLayout({ nativeEvent: { layout: { width: 200, height: 250 } } });
tree = render(shapedProps);
const shapedImage = find(tree, 'ExpoImage');
const frame = shapedImage.props.style[1];
assert.equal(frame.width, 180); assert.equal(frame.height, 250); assert.equal(frame.left, 10);
assert.equal(shapedImage.props.style[0].right, 0); assert.equal(shapedImage.props.style[0].bottom, 0);
assert.equal(frame.right, undefined); assert.equal(frame.bottom, undefined, 'card face dimensions override absolute-fill opposing edges');
const mergedFrame = Object.assign({}, ...shapedImage.props.style.filter(Boolean));
assert.deepEqual({ width: mergedFrame.width, height: mergedFrame.height, left: mergedFrame.left, top: mergedFrame.top, right: mergedFrame.right, bottom: mergedFrame.bottom }, { width: 180, height: 250, left: 10, top: 0, right: undefined, bottom: undefined });
assert.equal(frame.overflow, 'hidden'); assert.equal(frame.borderRadius, 8.1);
assert.equal(shapedImage.props.contentFit, 'contain', 'card edges preserve printed borders');
assert.equal(shapedImage.props.source.uri, shapedProps.uri, 'silhouette clipping does not replace source artwork');
tree = render({ ...props, preserveDetail: true });
find(tree, 'ExpoImage').props.onLoad({ cacheType: 'disk', source: { width: 1000, height: 1400 } });
assert.equal(diagnostics.at(-1)?.rendition, 'detail');
assert.equal(diagnostics.at(-1)?.width, 1000);
let deliveredLoads = 0;
tree = render({ ...props, uri: 'https://approved.example/diagnostic.webp', onDiagnostic: () => { throw new Error('diagnostic'); }, onLoad: () => { deliveredLoads++; } });
assert.doesNotThrow(() => find(tree, 'ExpoImage').props.onLoad());
assert.equal(deliveredLoads, 1, 'failed diagnostics cannot block the existing load callback');
const callbackProps = { ...props, uri: 'https://approved.example/current.webp',
  onLoad: () => { deliveredLoads++; }, onError: () => { throw new Error('Stale consumer error'); } };
tree = render(callbackProps);
const oldCandidate = find(tree, 'ExpoImage');
oldCandidate.props.onError(); tree = render(callbackProps);
oldCandidate.props.onLoad();
assert.equal(deliveredLoads, 1, 'load from the replaced retry attempt cannot mark the current image loaded');
assert.doesNotThrow(() => oldCandidate.props.onError(), 'old retry-attempt errors do not reach consumers');
tree = render({ ...callbackProps, uri: 'https://approved.example/other.webp' });
tree = render(callbackProps);
oldCandidate.props.onLoad();
assert.equal(deliveredLoads, 1, 'A -> B -> A rejects callbacks from the first A');
find(tree, 'ExpoImage').props.onLoad();
assert.equal(deliveredLoads, 2, 'current rendition load reaches its consumer');
tree = render({ ...callbackProps, cacheKey: 'another-surface' });
assert.equal(find(tree, 'ExpoImage').props.source.cacheKey, callbackProps.uri, 'the same URL shares its prefetched cache across card surfaces');
tree = render({ ...props, preserveDetail: true });
assert.equal(find(tree, 'ExpoImage').props.source.cacheKey, props.fullUri, 'the original full URI remains its own cache key');
assert.equal(find(tree, 'ExpoImage').props.allowDownscaling, false, 'inspection retains original decoded detail');
assert.equal(find(tree, 'ExpoImage').props.decodeFormat, 'argb');
const prefetchProps = { ...props, uri: 'https://approved.example/prefetch-grid.webp', fullUri: 'https://approved.example/prefetch-detail.webp' };
tree = render({ ...prefetchProps, preserveDetail: true });
void exports.prefetchStackrImages([prefetchProps.uri, prefetchProps.fullUri]).then((loaded: boolean) => {
  assert.equal(loaded, true);
  assert.equal(cachedUris.has(find(tree, 'ExpoImage').props.source.cacheKey), true, 'actual prefetch and displayed full image address the same cache entry');
  tree = render(prefetchProps);
  assert.equal(cachedUris.has(find(tree, 'ExpoImage').props.source.cacheKey), true, 'actual prefetch also addresses the displayed thumbnail');
  console.log('Actual StackrImage shares prefetched URI caches, retries exact renditions, rejects stale callbacks and preserves inspection detail.');
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
