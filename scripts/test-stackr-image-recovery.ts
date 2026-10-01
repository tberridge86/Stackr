import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as candidates from '../lib/stackrImageCandidates';
import * as policy from '../lib/tcgdexControlledCardReference';
import * as sizing from '../lib/stackrSizing';

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
const modules: Record<string, any> = {
  react: { ...React, default: React, __esModule: true },
  'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (v: any) => v, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } }, InteractionManager: { runAfterInteractions: () => ({ cancel() {} }) } },
  'expo-image': { Image: 'ExpoImage' }, '@expo/vector-icons': { Ionicons: 'Icon' },
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
  if (node.type === type) return node;
  for (const child of node.props?.children?.flat(Infinity) ?? []) { const found = find(child, type); if (found) return found; }
  return null;
}
function render(props: any) { cursor = 0; effects = []; const tree = exports.StackrImage(props); for (const effect of effects) effect(); return tree; }
const props = { uri: 'https://approved.example/grid.webp', fullUri: 'https://approved.example/detail.webp',
  fallbackUris: ['https://approved.example/original.jpg'], cacheKey: 'printing' };
let tree = render(props); const staleError = find(tree, 'ExpoImage').props.onError;
for (const expected of [props.uri, props.fullUri, props.fallbackUris[0]]) {
  const image = find(tree, 'ExpoImage'); assert.equal(image.props.source.uri, expected);
  assert.equal(image.props.source.cacheKey, `printing:${expected}`, 'each rendition has a distinct cache entry');
  image.props.onError(); tree = render(props);
}
assert.equal(find(tree, 'ExpoImage'), null); assert(find(tree, 'Icon'), 'exhaustion has an honest image placeholder');
tree = render({ ...props, uri: 'https://approved.example/new-grid.webp' });
assert.equal(find(tree, 'ExpoImage').props.source.uri, 'https://approved.example/new-grid.webp');
staleError(); tree = render({ ...props, uri: 'https://approved.example/new-grid.webp' });
assert.equal(find(tree, 'ExpoImage').props.source.uri, 'https://approved.example/new-grid.webp', 'late errors cannot poison corrected artwork');
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
console.log('Actual StackrImage component advances through three renditions, stops at a placeholder and recovers on corrected props without remount/reinstall.');
