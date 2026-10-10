import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module from 'node:module';
import { dirname, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { CARD_LOADING_DURATION, CARD_LOADING_STILL, CARD_LOADING_TRACKS, CARD_LOADING_SIZES, cardLoadingValue } from '../lib/stackrCardLoadingMotion';

const slots: unknown[] = [];
let cursor = 0;
let starts = 0;
let stops = 0;
let removed = 0;
const effects: { deps?: unknown[]; cleanup?: () => void }[] = [];
let effectCursor = 0;
let pending: (() => void)[] = [];
let motionChanged: (value: boolean) => void;
let appChanged: (value: string) => void;
class Value {
  initial: number;
  constructor(public value: number) { this.initial = value; }
  setValue(value: number) { this.value = value; }
  stopAnimation() {}
  interpolate(track: unknown) { return track; }
}
const react = {
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
  useRef: (value: unknown) => { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); },
  useState: (value: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = value;
    return [slots[i], (next: unknown) => { slots[i] = next; }];
  },
  useEffect: (callback: () => (() => void) | undefined, deps: unknown[]) => {
    const i = effectCursor++;
    const previous = effects[i];
    if (!previous || deps.some((value, j) => !Object.is(value, previous.deps?.[j]))) {
      pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: callback() }; });
    }
  },
};
const native = {
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: (_: string, fn: typeof motionChanged) => { motionChanged = fn; return { remove() { removed += 1; } }; },
  },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, fn: typeof appChanged) => { appChanged = fn; return { remove() { removed += 1; } }; },
  },
  Animated: { Value, View: 'AnimatedView', timing: (clock: Value, config: { useNativeDriver: boolean; isInteraction: boolean; duration: number }) => {
    assert.equal(config.useNativeDriver, true);
    assert.equal(config.isInteraction, false, 'Loading must not hold up virtualized lists.');
    assert.equal(config.duration, CARD_LOADING_DURATION);
    return { reset() { clock.setValue(clock.initial); } };
  }, loop: (animation: { reset(): void }) => ({ start() { animation.reset(); starts += 1; }, stop() { stops += 1; } }) },
  Easing: { linear: 'linear' }, Image: 'Image', View: 'View', Platform: { OS: 'ios' }, StyleSheet: { create: (v: unknown) => v },
};
const file = resolve('components/StackrLoadingIndicator.tsx');
const compiled = transformSync(readFileSync(file, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
const moduleApi = Module as unknown as { _load: Function; _nodeModulePaths(path: string): string[] };
const original = moduleApi._load;
moduleApi._load = function(request: string, parent: unknown, main: boolean) {
  if (request === 'react') return { __esModule: true, default: react, ...react };
  if (request === 'react-native') return native;
  if (request.endsWith('.png')) {
    const file = resolve(dirname((parent as Module).filename), request);
    assert.ok(existsSync(file), `Required loading artwork is missing: ${request}`);
    return 1;
  }
  return original.call(this, request, parent, main);
};
const loaded = new Module(file) as Module & { _compile(code: string, file: string): void; paths: string[] };
loaded.filename = file;
loaded.paths = moduleApi._nodeModulePaths(resolve('components'));
try { loaded._compile(compiled, file); } finally { moduleApi._load = original; }
const { StackrLoadingIndicator } = loaded.exports;
function render(props = {}) {
  cursor = 0; effectCursor = 0; pending = [];
  const element = StackrLoadingIndicator(props);
  pending.forEach(fn => fn());
  return element;
}

async function main() {
  render();
  assert.equal(starts, 0, 'Unknown motion preferences must stay still.');
  await Promise.resolve();
  render();
  assert.equal(starts, 1);
  assert.equal((slots[0] as { current: Value }).current.value, 0, 'Loop reset must start at the beginning, not the finished protection pose.');
  appChanged('background'); render();
  assert.equal(stops, 1, 'Backgrounding stops the loop.');
  appChanged('active'); render();
  assert.equal(starts, 2);
  motionChanged(true); render();
  assert.equal(stops, 2, 'Reduce Motion stops an already-running loop.');
  assert.equal((slots[0] as { current: Value }).current.value, CARD_LOADING_STILL);
  assert.equal(render({ animating: false }), null, 'Completed operations hide their busy indicator.');
  assert.ok(render({ animating: false, hidesWhenStopped: false }));
  effects.forEach(effect => effect.cleanup?.());
  assert.equal(removed, 2, 'Unmount removes both platform listeners.');
  for (const time of [1220, 1440, 1900, 1970, 2260, 2330, 2400, CARD_LOADING_STILL]) {
    assert.equal(cardLoadingValue(CARD_LOADING_TRACKS.cardX, time), cardLoadingValue(CARD_LOADING_TRACKS.sleeveX, time));
    assert.equal(cardLoadingValue(CARD_LOADING_TRACKS.cardY, time), cardLoadingValue(CARD_LOADING_TRACKS.sleeveY, time));
  }
  assert.ok(cardLoadingValue(CARD_LOADING_TRACKS.cardX, 0) < cardLoadingValue(CARD_LOADING_TRACKS.sleeveX, 0) - 80, 'Card and empty sleeve start as separate objects.');
  assert.ok(cardLoadingValue(CARD_LOADING_TRACKS.sleeveX, 0) < cardLoadingValue(CARD_LOADING_TRACKS.loaderX, 0) - 80, 'Empty top loader starts separately.');
  assert.ok(cardLoadingValue(CARD_LOADING_TRACKS.cardY, 780) + CARD_LOADING_SIZES.card[1] / 2 < cardLoadingValue(CARD_LOADING_TRACKS.sleeveY, 780) - CARD_LOADING_SIZES.sleeve[1] / 2, 'First jump clears the penny sleeve opening before insertion.');
  assert.ok(cardLoadingValue(CARD_LOADING_TRACKS.sleeveY, 1900) + CARD_LOADING_SIZES.sleeve[1] / 2 < cardLoadingValue(CARD_LOADING_TRACKS.loaderY, 1900) - CARD_LOADING_SIZES.loader[1] / 2, 'Second jump clears the top loader opening before insertion.');
  assert.equal(cardLoadingValue(CARD_LOADING_TRACKS.sceneOpacity, CARD_LOADING_STILL), 1);
  assert.equal(cardLoadingValue(CARD_LOADING_TRACKS.sheenOpacity, CARD_LOADING_STILL), 0);
  console.log('Card loading: motion preference, backgrounding, completion, cleanup and sleeve alignment passed.');
}
void main();
