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
  const stateValues = [false, true, false] as boolean[];
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
    }, StackrLoadingScreen: 'StackrLoadingScreen', StackrStartupVideo: 'StackrStartupVideo', STARTUP_VIDEO_TIMEOUT_MS: 12_000,
    Inter_400Regular: 'regular', Inter_500Medium: 'medium', Inter_600SemiBold: 'semibold',
    Inter_700Bold: 'bold', Inter_800ExtraBold: 'extraBold',
    ThemeProvider: 'ThemeProvider', StackrSafeAreaBoundary: 'StackrSafeAreaBoundary',
    StackrQueryProvider: 'StackrQueryProvider', AppShell: 'AppShell',
  });
  return {
    render: () => {
      // Flush state changes made by effects as React would before the next paint.
      for (let pass = 0; pass < 3; pass += 1) {
        stateIndex = 0;
        const before = JSON.stringify(stateValues);
        const tree = root();
        if (before === JSON.stringify(stateValues)) return tree;
      }
      throw new Error('Root did not settle after effect updates.');
    },
    scheduledTimers,
    getHideCalls: () => hideCalls,
    getTypographyCalls: () => typographyCalls,
    getHapticHydrationCalls: () => hapticHydrationCalls,
    getEffectCleanups: () => effectCleanups,
    getAnimationStopCalls: () => animationStopCalls,
  };
}

const childNodes = (children: unknown): any[] => Array.isArray(children) ? children : [children];
const shell = (root: any) => root.props.children.props.children.props.children;
const app = (root: any) => childNodes(shell(root).props.children)[0];
const overlay = (root: any) => childNodes(shell(root).props.children).find((child: any) => child?.type === 'AnimatedView');
const pendingFonts = renderRoot(false, null);
let root = pendingFonts.render();
assert.equal(pendingFonts.getHapticHydrationCalls(), 1);
assert.equal(root.type, 'ThemeProvider');
assert.equal(app(root).props.children.props.children.type, 'StackrLoadingScreen', 'Fonts can load underneath the startup video.');
assert.ok(overlay(root), 'Video is mounted from the first render, including pending fonts.');
assert.deepEqual(pendingFonts.scheduledTimers.map(timer => timer.delay), [5_000, 12_500], 'Fonts and media have independent bounded deadlines.');
assert.equal(pendingFonts.getHideCalls(), 0);
root.props.children.props.onLayout();
assert.equal(pendingFonts.getHideCalls(), 1, 'Native static splash hands off on the first React layout.');
const video = childNodes(overlay(root).props.children).find((child: any) => child?.type === 'StackrStartupVideo');
video.props.onComplete();
root = pendingFonts.render();
assert.ok(overlay(root), 'Video completion waits for font readiness without remounting playback.');
pendingFonts.scheduledTimers[0].callback();
root = pendingFonts.render();
assert.equal(app(root).props.children.props.children.type, 'AppShell');
assert.equal(overlay(root), undefined, 'The finished video is dismissed once fonts settle.');
assert.equal(app(root).props.accessibilityElementsHidden, false);

const loadedFonts = renderRoot(true, null);
root = loadedFonts.render();
assert.equal(loadedFonts.getTypographyCalls(), 1);
assert.equal(app(root).props.children.props.children.type, 'AppShell');
assert.equal(app(root).props.accessibilityElementsHidden, true, 'The launch modal hides underlying app content.');
assert.equal(overlay(root).props.accessibilityViewIsModal, true);
assert.equal(loadedFonts.scheduledTimers[0].delay, 12_500);
const loadedVideo = childNodes(overlay(root).props.children).find((child: any) => child?.type === 'StackrStartupVideo');
loadedVideo.props.onComplete();
root = loadedFonts.render();
assert.equal(overlay(root), undefined, 'Ready startup dismisses at playback completion.');

const stalledAnimation = renderRoot(true, null, false);
stalledAnimation.render();
stalledAnimation.scheduledTimers[0].callback();
assert.equal(overlay(stalledAnimation.render()), undefined, 'The hard deadline removes the modal even if fade/decoder callbacks stall.');
const preview = renderRoot(true, null, true, '/splash-preview');
root = preview.render();
assert.equal(overlay(root), undefined);
assert.equal(app(root).props.accessibilityElementsHidden, false);
for (const cleanup of loadedFonts.getEffectCleanups()) cleanup();
assert.ok(loadedFonts.getAnimationStopCalls() > 0, 'Unmount clears startup animation and guard.');
const failedFonts = renderRoot(false, new Error('font unavailable'));
assert.equal(app(failedFonts.render()).props.children.props.children.type, 'AppShell', 'A font error falls back to usable app text.');
console.log('Shared UX release checks passed: scaling, inset ownership and bounded video startup lifecycle.');
