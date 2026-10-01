import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

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
  const value = () => ({ setValue() {}, interpolate: () => ({}), stopAnimation() {} });
  const react = {
    createElement: () => null,
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
  const source = ts.transpileModule(readFileSync('components/StackrLoadingScreen.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const animation = { start: () => { starts += 1; }, stop: () => {} };
  function Value() { return value(); }
  const animated = { Value, spring: () => animation, timing: () => animation, loop: () => animation, sequence: () => animation, multiply: () => ({}), add: () => ({}) };
  const require = (name: string) => ({
    react: { __esModule: true, default: react, ...react },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native': {
      AccessibilityInfo: { isReduceMotionEnabled: () => preference, addEventListener: () => ({ remove() {} }) },
      Animated: animated, Easing: { inOut: (x: unknown) => x, cubic: 'cubic', sin: 'sin' }, Image: 'Image', StyleSheet: { create: (x: unknown) => x, absoluteFillObject: {} }, useWindowDimensions: () => ({ width: 390 }), View: 'View',
    },
    './Text': { Text: 'Text' }, './theme-context': { useTheme: () => ({ theme: { dark: false, colors: { bg: '#fff', text: '#111' } } }) },
    '../lib/stackrSizing': { stackrLogoSizes: { loadingWordmarkHeightRatio: 0.2 } }, '../lib/typography': { typeScale: { sectionTitle: {}, caption: {} } },
  } as Record<string, unknown>)[name] ?? 'asset';
  vm.runInNewContext(source, { module, exports: module.exports, require, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const Screen = module.exports.StackrLoadingScreen as (props: Record<string, never>) => unknown;
  const render = () => {
    cursor = 0;
    Screen({});
    for (const record of effects) { if (record && !record.cleanup) { const cleanup = record.effect(); if (cleanup) record.cleanup = cleanup; } }
  };
  return { render, starts: () => starts };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

async function main() {
const pending = deferred<boolean>();
const pendingHost = createHost(pending.promise);
pendingHost.render();
assert.equal(pendingHost.starts(), 0, 'an unresolved system preference must keep startup still');
pending.resolve(true); await settle(); pendingHost.render();
assert.equal(pendingHost.starts(), 0, 'Reduce Motion enabled before first animation must keep startup still');

const allowed = deferred<boolean>();
const allowedHost = createHost(allowed.promise);
allowedHost.render();
assert.equal(allowedHost.starts(), 0, 'motion remains paused while the preference is pending');
allowed.resolve(false); await settle(); allowedHost.render();
assert.ok(allowedHost.starts() >= 5, 'motion starts only after the system explicitly allows it');

const unavailable = deferred<boolean>();
const unavailableHost = createHost(unavailable.promise);
unavailableHost.render();
unavailable.reject(new Error('unavailable')); await settle(); unavailableHost.render();
assert.equal(unavailableHost.starts(), 0, 'an unreadable preference fails safely with no startup animation');

console.log('Startup Reduce Motion preference lifecycle: pending, enabled, disabled and error paths passed.');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
