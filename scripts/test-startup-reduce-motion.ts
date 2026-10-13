import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const requireFromProject = createRequire(`${process.cwd()}/package.json`);

assert.equal(
  createHash('sha256').update(readFileSync('assets/startup/stackr-premium-opening.mp4')).digest('hex'),
  '809a97349ed29f348724266ea9807af81a83a7edafae01371c2ffedca149a989',
  'The bundled premium opening video must remain byte-for-byte identical to the approved MP4.',
);

const startupVideoSource = readFileSync('components/StackrStartupVideo.tsx', 'utf8');
assert.match(startupVideoSource, /assets\/startup\/stackr-premium-opening\.mp4/);
assert.match(startupVideoSource, /assets\/startup\/stackr-premium-poster\.png/);

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

function createHost(preference: Promise<boolean>) {
  const states: unknown[] = [];
  const refs: unknown[] = [];
  const effects: { deps?: readonly unknown[]; cleanup?: () => void; effect: () => void | (() => void) }[] = [];
  let cursor = 0;
  let starts = 0;
  let completions = 0;
  const listeners = new Map<string, () => void>();
  const timers = new Map<number, () => void>();
  let timerIndex = 0;
  const player = { pause() {}, play() { starts += 1; }, status: 'readyToPlay', addListener(name: string, callback: () => void) { listeners.set(name, callback); return { remove() { listeners.delete(name); } }; } };
  const value = () => ({ setValue() {}, interpolate: () => ({}), stopAnimation() {} });
  const react = {
    createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props: { ...props, children } }),
    useCallback: <T,>(callback: T) => callback,
    useState<T>(initial: T) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index] as T, (next: T | ((previous: T) => T)) => { states[index] = typeof next === 'function' ? (next as (previous: T) => T)(states[index] as T) : next; }] as const;
    },
    useRef<T>(initial: T) { const index = cursor++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index] as { current: T }; },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = cursor++;
      const previous = effects[index];
      const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((entry, i) => entry !== previous.deps?.[i]);
      if (changed) { previous?.cleanup?.(); effects[index] = { deps, effect }; }
    },
  };
  const module = { exports: {} as Record<string, unknown> };
  const source = ts.transpileModule(readFileSync('components/StackrStartupVideo.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const animation = { start: () => { starts += 1; }, stop: () => {} };
  function Value() { return value(); }
  const animated = { Value, spring: () => animation, timing: () => animation, loop: () => animation, sequence: () => animation, multiply: () => ({}), add: () => ({}) };
  const require = (name: string) => ({
    react: { __esModule: true, default: react, ...react },
    'expo-video': { useVideoPlayer: (_asset: unknown, setup: (value: unknown) => void) => { setup(player); return player; }, VideoView: 'VideoView' },
    'react-native': {
      AccessibilityInfo: { isReduceMotionEnabled: () => preference, addEventListener: () => ({ remove() {} }) },
      Animated: animated, Easing: { inOut: (x: unknown) => x, cubic: 'cubic', sin: 'sin' }, Image: 'Image', StyleSheet: { create: (x: unknown) => x, absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } }, useWindowDimensions: () => ({ width: 390, height: 844 }), View: 'View',
    },
    './Text': { Text: 'Text' }, './theme-context': { useTheme: () => ({ theme: { dark: false, colors: { bg: '#fff', text: '#111' } } }) },
    '../lib/stackrSizing': { stackrLogoSizes: { loadingWordmarkHeightRatio: 0.2 } }, '../lib/typography': { typeScale: { sectionTitle: {}, caption: {} } },
  } as Record<string, unknown>)[name] ?? 'asset';
  vm.runInNewContext(source, { module, exports: module.exports, require, setTimeout: (callback: () => void) => { timers.set(++timerIndex, callback); return timerIndex; }, clearTimeout: (id: number) => timers.delete(id) });
  const Screen = module.exports.StackrStartupVideo as (props: { onComplete: () => void }) => unknown;
  const render = () => {
    cursor = 0;
    const tree = Screen({ onComplete: () => { completions += 1; } });
    for (const record of effects) { if (record && !record.cleanup) { const cleanup = record.effect(); if (cleanup) record.cleanup = cleanup; } }
    return tree;
  };
  return { render, starts: () => starts, completions: () => completions, end: () => listeners.get('playToEnd')?.(), timeout: () => { for (const callback of timers.values()) callback(); }, unmount: () => { for (const effect of effects) effect?.cleanup?.(); }, listeners, timers };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

function findNode(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.props?.children?.flat(Infinity) ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function main() {
const pending = deferred<boolean>();
const pendingHost = createHost(pending.promise);
pendingHost.render();
assert.equal(pendingHost.starts(), 0, 'an unresolved system preference must keep startup still');
pending.resolve(true); await settle(); pendingHost.render();
assert.equal(pendingHost.starts(), 0, 'Reduce Motion enabled before first animation must keep startup still');
assert.equal(pendingHost.completions(), 1, 'Reduce Motion bypasses the presentation without blocking startup');

const allowed = deferred<boolean>();
const allowedHost = createHost(allowed.promise);
allowedHost.render();
assert.equal(allowedHost.starts(), 0, 'motion remains paused while the preference is pending');
allowed.resolve(false); await settle(); allowedHost.render();
assert.equal(allowedHost.starts(), 1, 'the exact video starts once after the system allows motion');
let openingTree = allowedHost.render();
const frame = findNode(openingTree, node => node.type === 'View' && typeof node.props.onLayout === 'function');
assert.ok(frame, 'poster and video require one explicitly sized native frame');
const frameSize = frame.props.style.find((style: any) => typeof style?.width === 'number');
assert.equal(frameSize.width, 320, 'the frame retains the established splash size');
assert.equal(frameSize.height, 320, 'the reveal has a square frame');
const video = findNode(openingTree, node => node.type === 'VideoView');
const poster = findNode(openingTree, node => node.type === 'Image');
assert.equal(poster, null, 'allowed motion must not flash the finished poster before the formation starts');
assert.equal(video.props.style[1].opacity, 0, 'video stays hidden before its native frame is ready');
video.props.onFirstFrameRender();
openingTree = allowedHost.render();
assert.equal(findNode(openingTree, node => node.type === 'VideoView').props.style[1].opacity, 0, 'an early first-frame event must not expose the video before native layout');
frame.props.onLayout({ nativeEvent: { layout: { width: 0, height: 0 } } });
assert.equal(findNode(allowedHost.render(), node => node.type === 'VideoView').props.style[1].opacity, 0, 'zero-size layout cannot complete the handoff');
frame.props.onLayout({ nativeEvent: { layout: { width: 320, height: 320 } } });
assert.equal(findNode(allowedHost.render(), node => node.type === 'VideoView').props.style[1].opacity, 1, 'the reveal is visible only after both native layout and a rendered frame');
const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
const nativeSplash = appConfig.expo.plugins.find((plugin: any) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
assert.equal(nativeSplash.image, './assets/startup/stackr-premium-first-frame.png', 'native startup must begin on the approved video’s opening frame, not its finished logo');
assert.equal(
  createHash('sha256').update(readFileSync(nativeSplash.image)).digest('hex'),
  '56edc45df636e2e5393502e34cb607c7e809732f07d8e133d043f507fac7f1a6',
  'The native handoff still is the full-resolution first frame extracted from the unchanged approved MP4.',
);
const { getIosSplashConfig } = requireFromProject('@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/getIosSplashConfig');
const { getTemplateAsync } = requireFromProject('@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/withIosSplashScreenStoryboard');
const { applySplashScreenStoryboard } = requireFromProject('@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/withIosSplashScreenStoryboardImage');
const iosSplash = getIosSplashConfig(appConfig.expo, nativeSplash);
assert.equal(iosSplash.image, nativeSplash.image, 'the installed Expo plugin retains the opening still');
const storyboard = applySplashScreenStoryboard(await getTemplateAsync(), iosSplash);
const launchView = storyboard.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
assert.equal(launchView.subviews[0].imageView.length, 1, 'generated iOS storyboard keeps a valid image view and constraints');
assert.equal(launchView.subviews[0].imageView[0].rect[0].$.width, 320, 'native opening still matches the player’s centred square');
assert.equal(launchView.subviews[0].imageView[0].rect[0].$.height, 320);
assert.equal(launchView.subviews[0].imageView[0].$.image, 'SplashScreenLogo');
allowedHost.end(); allowedHost.end();
assert.equal(allowedHost.completions(), 1, 'playback completes startup exactly once');
allowedHost.unmount();
assert.equal(allowedHost.listeners.size, 0, 'unmount removes player listeners');
assert.equal(allowedHost.timers.size, 0, 'unmount clears playback deadline');

const unavailable = deferred<boolean>();
const unavailableHost = createHost(unavailable.promise);
unavailableHost.render();
unavailable.reject(new Error('unavailable')); await settle(); unavailableHost.render();
assert.equal(unavailableHost.starts(), 0, 'an unreadable preference fails safely with no startup animation');

assert.equal(unavailableHost.completions(), 1, 'unreadable preference bypasses playback');
const stalled = createHost(new Promise<boolean>(() => {}));
stalled.render(); stalled.timeout();
assert.equal(stalled.completions(), 1, 'stalled player or preference cannot trap launch');
console.log('Startup video: motion preferences, completion, stall deadline and cleanup passed.');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
