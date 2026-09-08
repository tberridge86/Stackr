import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type ElementNode = {
  type: unknown;
  props: Record<string, any>;
};

const react = {
  Fragment: 'Fragment',
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): ElementNode {
    return { type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } };
  },
  memo: (component: unknown) => component,
  useMemo: (compute: () => unknown) => compute(),
};

function flattenStyle(style: any): Record<string, unknown> | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style;
}

let platform = 'web';
let dimensions = { width: 393, height: 852 };
let previewWindow: { name: string } | undefined;
const typography = {
  resolveTypographyStyle: () => ({ fontFamily: 'approved-font' }),
  tabularNumberStyle: { fontVariant: ['tabular-nums'] },
  stackrFonts: { medium: 'approved-medium', extraBold: 'approved-extra-bold' },
  typeScale: { pageTitle: {} },
};

function loadComponent(relativePath: string): Record<string, any> {
  const source = readFileSync(path.resolve(relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: relativePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const native = {
    Text: 'NativeText', View: 'View', Image: 'Image',
    Platform: { OS: platform },
    useWindowDimensions: () => dimensions,
    StyleSheet: { create: (value: unknown) => value, flatten: flattenStyle },
  };
  const modules: Record<string, unknown> = {
    react,
    'react-native': native,
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView',
      SafeAreaFrameContext: { Provider: 'FrameProvider' },
      SafeAreaInsetsContext: { Provider: 'InsetsProvider' },
    },
    './Text': { Text: 'StackrText' },
    './theme-context': { useTheme: () => ({ theme: { colors: { text: '#123', bg: '#fff' } } }) },
    '../lib/typography': typography,
    '../lib/stackrSizing': { stackrActionIconSizes: {} },
  };
  const requireMock = (name: string) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  };
  new Function('require', 'module', 'exports', 'window', compiled)(requireMock, module, module.exports, previewWindow);
  return module.exports;
}

const { Text } = loadComponent('components/Text.tsx');
const defaultText = Text({ children: 'Accessible title' }) as ElementNode;
assert.equal(defaultText.props.allowFontScaling, true);
assert.equal(defaultText.props.maxFontSizeMultiplier, 0);
assert.equal(defaultText.props.children, 'Accessible title');
const overriddenText = Text({ allowFontScaling: false, maxFontSizeMultiplier: 1.8, style: { color: '#456' } }) as ElementNode;
assert.equal(overriddenText.props.allowFontScaling, false);
assert.equal(overriddenText.props.maxFontSizeMultiplier, 1.8);
assert.equal(flattenStyle(overriddenText.props.style)?.color, '#456');

const { StackrScreen } = loadComponent('components/StackrScreen.tsx');
for (const [variant, edges] of [
  ['tab', ['top', 'left', 'right']],
  ['detail', ['top', 'left', 'right']],
  ['form', ['top', 'bottom', 'left', 'right']],
] as const) {
  const screen = StackrScreen({ variant, children: 'screen content' }) as ElementNode;
  assert.equal(screen.type, 'SafeAreaView');
  assert.deepEqual(screen.props.edges, edges);
  assert.equal(flattenStyle(screen.props.style)?.paddingTop, undefined);
  assert.equal(screen.props.children.props.children, 'screen content');
}
assert.deepEqual(StackrScreen({ safeAreaEdges: ['left', 'right'] }).props.edges, ['left', 'right']);
assert.deepEqual(StackrScreen({ safeAreaEdges: [] }).props.edges, []);

function boundaryFor(os: string, name: string | undefined, width = 393, height = 852): ElementNode {
  platform = os;
  dimensions = { width, height };
  previewWindow = name === undefined ? undefined : { name };
  const { StackrSafeAreaBoundary } = loadComponent('components/StackrSafeAreaBoundary.tsx');
  return StackrSafeAreaBoundary({ children: 'existing app' });
}

for (const os of ['ios', 'android']) {
  const result = boundaryFor(os, 'stackr-iphone-15-preview');
  assert.equal(result.type, 'Fragment', `${os} must retain the native provider without adding insets or padding`);
  assert.deepEqual(result.props, { children: 'existing app' });
}
for (const name of [undefined, '', 'ordinary-browser-tab']) {
  assert.equal(boundaryFor('web', name).type, 'Fragment');
}
for (const [width, height] of [[393, 852], [430, 932]]) {
  const result = boundaryFor('web', 'stackr-iphone-15-preview', width, height);
  assert.equal(result.type, 'FrameProvider');
  assert.deepEqual(result.props.value, { x: 0, y: 0, width, height });
  assert.equal(result.props.children.type, 'InsetsProvider');
  assert.deepEqual(result.props.children.props.value, { top: 59, right: 0, bottom: 34, left: 0 });
  assert.equal(result.props.children.props.children, 'existing app');
  assert.equal(result.props.style, undefined, 'Preview supplies context only; screens own the padding');
}
assert.deepEqual(
  boundaryFor('web', 'stackr-iphone-15-preview', 852, 393).props.children.props.value,
  { top: 0, right: 34, bottom: 0, left: 59 },
);

// Execute the actual root functions in isolation: importing the entire app would
// start unrelated auth, network and native providers, which these checks avoid.
const layoutSource = readFileSync(path.resolve('app/_layout.tsx'), 'utf8');
const layoutAst = ts.createSourceFile('app/_layout.tsx', layoutSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function rootFunction(name: string, dependencies: Record<string, unknown>): (...args: any[]) => any {
  const declaration = layoutAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing ${name}`);
  const raw = declaration.getText(layoutAst).replace(/^export default /, '');
  const compiled = ts.transpileModule(raw, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}\nreturn ${name};`)(...Object.values(dependencies));
}
const nativeText = { defaultProps: { maxFontSizeMultiplier: 1.25, accessibilityLabel: 'preserved' } };
const nativeInput = { defaultProps: { maxFontSizeMultiplier: 1.2, autoCorrect: false } };
rootFunction('configureNativeTypographyDefaults', {
  NativeText: nativeText, NativeTextInput: nativeInput, stackrFonts: typography.stackrFonts,
})();
assert.equal(nativeText.defaultProps.maxFontSizeMultiplier, 0);
assert.equal(nativeInput.defaultProps.maxFontSizeMultiplier, 0);
assert.equal(nativeText.defaultProps.accessibilityLabel, 'preserved');
assert.equal(nativeInput.defaultProps.autoCorrect, false);

const root = rootFunction('RootLayout', {
  React: react, useFonts: () => [true, null], useEffect: () => {},
  Inter_400Regular: 'regular', Inter_500Medium: 'medium', Inter_600SemiBold: 'semibold',
  Inter_700Bold: 'bold', Inter_800ExtraBold: 'extraBold',
  ThemeProvider: 'ThemeProvider', StackrSafeAreaBoundary: 'StackrSafeAreaBoundary',
  StackrQueryProvider: 'StackrQueryProvider', AppShell: 'AppShell',
})();
assert.equal(root.type, 'ThemeProvider');
assert.equal(root.props.children.type, 'StackrSafeAreaBoundary');
assert.equal(root.props.children.props.children.type, 'StackrQueryProvider');
assert.equal(root.props.children.props.children.props.children.type, 'AppShell');

console.log('Shared UX release checks passed: scaling, inset ownership, 393/430 previews, landscape, native pass-through, root integration.');
