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

const { StackrPageTitle, StackrScreen } = loadComponent('components/StackrScreen.tsx');
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

const collectionTitle = StackrPageTitle({ title: 'Collection', accentText: 'ction' }) as ElementNode;
assert.equal(collectionTitle.props.accessibilityLabel, 'Collection');
assert.equal(collectionTitle.props.children[0], 'Colle', 'Page titles preserve the complete unaccented prefix.');
assert.equal(collectionTitle.props.children[1].props.children, 'ction', 'An explicit accent suffix must never be truncated.');

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

function renderRoot(fontsLoaded: boolean, fontError: unknown, animationCompletes = true, pathname = '/') {
  const stateValues = [false, true] as boolean[];
  let stateIndex = 0;
  const scheduledTimers: { delay: number; callback: () => void }[] = [];
  const effectCleanups: (() => void)[] = [];
  let hideCalls = 0;
  let typographyCalls = 0;
  let hapticHydrationCalls = 0;
  let animationStopCalls = 0;
  const root = rootFunction('RootLayout', {
    React: react,
    useFonts: () => [fontsLoaded, fontError],
    useState: (initial: boolean) => {
      const index = stateIndex++;
      if (stateValues[index] === undefined) stateValues[index] = initial;
      return [stateValues[index], (next: boolean | ((previous: boolean) => boolean)) => {
        stateValues[index] = typeof next === 'function' ? next(stateValues[index]) : next;
      }];
    },
    useEffect: (effect: () => unknown) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') effectCleanups.push(cleanup as () => void);
    },
    useRef: (value: unknown) => ({ current: value }),
    useCallback: (callback: () => void) => callback,
    usePathname: () => pathname,
    setTimeout: (callback: () => void, delay: number) => {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    },
    clearTimeout: () => {},
    configureNativeTypographyDefaults: () => { typographyCalls += 1; },
    hydrateStackrHapticsPreference: () => { hapticHydrationCalls += 1; return Promise.resolve(true); },
    SplashScreen: { hideAsync: () => { hideCalls += 1; return Promise.resolve(); } },
    StatusBar: 'StatusBar',
    Platform: { OS: 'ios' },
    FONT_LOAD_TIMEOUT_MS: 5_000,
    lightTheme: { colors: { bg: '#F6F5F8' } },
    View: 'View', Animated: {
      Value: function Value(this: { stopAnimation: () => void }) { this.stopAnimation = () => { animationStopCalls += 1; }; },
      View: 'AnimatedView',
      timing: () => ({ start: (callback?: (result: { finished: boolean }) => void) => {
        if (animationCompletes) callback?.({ finished: true });
      } }),
    }, StackrLoadingScreen: 'StackrLoadingScreen',
    Inter_400Regular: 'regular', Inter_500Medium: 'medium', Inter_600SemiBold: 'semibold',
    Inter_700Bold: 'bold', Inter_800ExtraBold: 'extraBold',
    ThemeProvider: 'ThemeProvider', StackrSafeAreaBoundary: 'StackrSafeAreaBoundary',
    StackrQueryProvider: 'StackrQueryProvider', AppShell: 'AppShell',
  });
  return {
    render: () => {
      stateIndex = 0;
      return root();
    },
    scheduledTimers,
    getHideCalls: () => hideCalls,
    getTypographyCalls: () => typographyCalls,
    getHapticHydrationCalls: () => hapticHydrationCalls,
    getEffectCleanups: () => effectCleanups,
    getAnimationStopCalls: () => animationStopCalls,
  };
}

const pendingFonts = renderRoot(false, null);
let root = pendingFonts.render();
assert.equal(pendingFonts.getHapticHydrationCalls(), 1, 'Root startup hydrates the persisted haptics preference.');
assert.equal(root.type, 'ThemeProvider');
assert.equal(root.props.children.type, 'View');
assert.equal(root.props.children.props.children.type, 'StackrLoadingScreen', 'Pending fonts mount the real Stackr loading screen.');
assert.equal(pendingFonts.scheduledTimers.length, 1, 'Pending fonts schedule one bounded fallback.');
assert.equal(pendingFonts.scheduledTimers[0].delay, 5_000, 'The font fallback uses the reviewed five-second limit.');
assert.equal(pendingFonts.getHideCalls(), 0, 'The native splash remains visible until a React layout occurs.');
root.props.children.props.onLayout();
assert.equal(pendingFonts.getHideCalls(), 1, 'The first rendered layout hides the native splash.');

pendingFonts.scheduledTimers[0].callback();
root = pendingFonts.render();
assert.equal(root.props.children.props.children.type, 'StackrSafeAreaBoundary', 'The app shell renders after the font fallback expires.');
const recoveredShell = root.props.children.props.children.props.children;
const childNodes = (children: unknown) => Array.isArray(children) ? children : [children];
assert.equal(recoveredShell.type, 'View');
const hiddenAppShell = recoveredShell.props.children[0];
assert.equal(hiddenAppShell.type, 'View');
assert.equal(hiddenAppShell.props.children.type, 'StackrQueryProvider');
assert.equal(hiddenAppShell.props.children.props.children.type, 'AppShell');
assert.equal(recoveredShell.props.children[1].type, 'AnimatedView', 'The completed loading animation covers the ready app shell.');
assert.equal(hiddenAppShell.props.accessibilityElementsHidden, true, 'The loading overlay hides only the app shell from screen readers.');
assert.equal(recoveredShell.props.children[1].props.accessibilityViewIsModal, true, 'The loading overlay is announced as the active modal view.');

const overlayScreen = childNodes(recoveredShell.props.children[1].props.children)
  .find((child: any) => child?.type === 'StackrLoadingScreen');
overlayScreen.props.onReadyForDismiss();
root = pendingFonts.render();
assert.equal(childNodes(root.props.children.props.children.props.children.props.children)
  .some((child: any) => child?.type === 'AnimatedView'), false, 'A completed animation removes the startup overlay.');

const loadedFonts = renderRoot(true, null);
root = loadedFonts.render();
assert.equal(root.props.children.props.children.type, 'StackrSafeAreaBoundary', 'Loaded fonts render the app shell without a timer.');
assert.equal(loadedFonts.scheduledTimers.length, 1, 'A bounded startup animation fallback is scheduled after the fonts settle.');
assert.equal(loadedFonts.scheduledTimers[0].delay, 6_000);
assert.equal(loadedFonts.getTypographyCalls(), 1, 'Loaded fonts configure the native typography defaults.');

const stalledAnimation = renderRoot(true, null, false);
root = stalledAnimation.render();
const stalledShell = root.props.children.props.children.props.children;
assert.equal(stalledShell.props.children[1].type, 'AnimatedView');
stalledAnimation.scheduledTimers[0].callback();
root = stalledAnimation.render();
assert.equal(childNodes(root.props.children.props.children.props.children.props.children)
  .some((child: any) => child?.type === 'AnimatedView'), false, 'The hard deadline removes a startup overlay even if its animation callback never arrives.');

const splashPreviewRoot = renderRoot(true, null, true, '/splash-preview');
root = splashPreviewRoot.render();
const splashPreviewShell = root.props.children.props.children.props.children;
assert.equal(childNodes(splashPreviewShell.props.children).some((child: any) => child?.type === 'AnimatedView'), false, 'The dedicated splash preview is not covered by the startup overlay.');
const splashPreviewContent = childNodes(splashPreviewShell.props.children)
  .find((child: any) => child?.type === 'View');
assert.equal(splashPreviewContent.props.accessibilityElementsHidden, false, 'The splash preview app content remains accessible.');

const unmountedRoot = renderRoot(true, null);
unmountedRoot.render();
for (const cleanup of unmountedRoot.getEffectCleanups()) cleanup();
assert.ok(unmountedRoot.getAnimationStopCalls() > 0, 'Unmounting cancels the startup animation and its fallback timer.');

const failedFonts = renderRoot(false, new Error('font unavailable'));
root = failedFonts.render();
assert.equal(root.props.children.props.children.type, 'StackrSafeAreaBoundary', 'A font load error must not trap startup on the loader.');
assert.equal(failedFonts.scheduledTimers.length, 1, 'A font fallback still gets the bounded loading dismissal guard.');

console.log('Shared UX release checks passed: scaling, inset ownership, 393/430 previews, landscape, native pass-through, root startup lifecycle.');
