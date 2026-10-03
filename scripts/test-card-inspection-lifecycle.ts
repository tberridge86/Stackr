import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as motion from '../lib/cardPreviewMotion';
import * as contract from '../lib/cardInspection';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function load(file: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return React;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency: ${name}`);
  } });
  return module.exports;
}

async function main() {
  let cases = 0, sensors = 0, gpuSurfaces = 0, cancellations = 0, foilHapticCalls = 0;
  let appListener: (state: string) => void = () => {};
  let motionListener: (reduced: boolean) => void = () => {};
  let appListeners = 0, preferenceListeners = 0;
  let gesture: any;
  const reactions: Array<{ prepare: () => any; react: (value: any) => void }> = [];
  const queuedUiToJs: Array<() => void> = [];
  let userReduced = false;
  const useShared = (value: unknown) => React.useMemo(() => ({ value }), []);
  const { InteractiveCardPreview } = load('components/InteractiveCardPreview.tsx', {
    'react-native': {
      View: 'View', Platform: { OS: 'ios' }, StyleSheet: { create: (x: unknown) => x },
      PanResponder: { create: (options: any) => { gesture = options; return { panHandlers: {} }; } },
      AppState: { currentState: 'active', addEventListener: (_: string, listener: typeof appListener) => {
        appListener = listener; appListeners++; return { remove: () => { appListeners--; } };
      } },
      AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: (_: string, listener: typeof motionListener) => {
        motionListener = listener; preferenceListeners++; return { remove: () => { preferenceListeners--; } };
      } },
    },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'AnimatedView' }, SensorType: { ROTATION: 'rotation' },
      useSharedValue: useShared,
      useDerivedValue: (fn: () => unknown) => ({ get value() { return fn(); } }),
      useAnimatedStyle: (fn: () => unknown) => fn(),
      useAnimatedReaction: (prepare: () => any, react: (value: any) => void) => { reactions.push({ prepare, react }); },
      runOnJS: (fn: (...args: any[]) => void) => (...args: any[]) => { queuedUiToJs.push(() => fn(...args)); },
      cancelAnimation: () => { cancellations++; },
      withTiming: (value: number) => value, withSpring: (value: number) => value,
      useAnimatedSensor: () => {
        React.useEffect(() => { sensors++; return () => { sensors--; }; }, []);
        return { sensor: { value: { pitch: 0, roll: 0, qw: 1 } } };
      },
    },
    '../lib/cardPreviewMotion': motion,
    '../lib/cardMotionPreference': { useCardMotionPreference: () => ({ reduced: userReduced, loaded: true }) },
    '../lib/haptics': { stackrHaptics: { cardFoilCrossing: (isCurrent?: () => boolean) => {
      if (isCurrent?.() ?? true) foilHapticCalls++;
    } } },
  });
  function Material() { React.useEffect(() => { gpuSurfaces++; return () => { gpuSurfaces--; }; }, []); return null; }
  let root!: ReactTestRenderer;
  const preview = (active: boolean, motionPaused = false, foilHaptics = false, resetKey = 0) => React.createElement(InteractiveCardPreview, { active, motionPaused, foilHaptics, resetKey,
    renderMaterial: () => React.createElement(Material),
  }, React.createElement('Artwork'));
  await act(async () => { root = create(preview(false)); });
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); cases++;
  await act(async () => { root.update(preview(true)); });
  assert.equal(sensors, 1); assert.equal(gpuSurfaces, 1); cases++;
  const foilReaction = () => reactions.map(reaction => ({ reaction, sample: reaction.prepare() }))
    .filter(({ sample }) => sample && 'allowed' in sample).at(-1)!;
  const queueFoilCrossing = () => {
    const { reaction, sample } = foilReaction();
    reaction.react({ ...sample, x: 0, y: 0, allowed: true });
    reaction.react({ ...sample, x: 1, y: 0, allowed: true });
    assert.equal(queuedUiToJs.length, 1, 'only the threshold crossing queues a JS haptic callback');
  };
  await act(async () => { root.update(preview(true, false, true)); });
  queueFoilCrossing();
  await act(async () => { root.update(preview(true, true, true)); });
  queuedUiToJs.shift()!();
  assert.equal(foilHapticCalls, 0, 'a delayed foil callback expires after pause'); cases++;
  await act(async () => { root.update(preview(true, false, true)); });
  queueFoilCrossing();
  await act(async () => { root.update(preview(true, false, true, 1)); });
  queuedUiToJs.shift()!();
  assert.equal(foilHapticCalls, 0, 'a delayed foil callback expires after recenter'); cases++;
  await act(async () => { root.update(preview(false, false, true)); });
  queuedUiToJs.length = 0;
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); cases++;
  await act(async () => { root.update(preview(true, false, true)); });
  queueFoilCrossing();
  await act(async () => { root.update(preview(false, false, true)); });
  queuedUiToJs.shift()!();
  assert.equal(foilHapticCalls, 0, 'a delayed foil callback expires after viewer close'); cases++;
  await act(async () => { root.update(preview(true)); });
  assert.equal(gesture.onMoveShouldSetPanResponder(null, { numberActiveTouches: 1, dx: 8, dy: 0 }), true); cases++;
  assert.equal(gesture.onMoveShouldSetPanResponder(null, { numberActiveTouches: 2, dx: 80, dy: 0 }), false); cases++;
  await act(async () => { appListener('background'); });
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); cases++;
  await act(async () => { appListener('active'); });
  assert.equal(sensors, 1); assert.equal(gpuSurfaces, 1); cases++;
  await act(async () => { motionListener(true); });
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); cases++;
  assert.equal(gesture.onMoveShouldSetPanResponder(null, { numberActiveTouches: 1, dx: 80, dy: 0 }), false); cases++;
  await act(async () => { motionListener(false); });
  assert.equal(sensors, 1); assert.equal(gpuSurfaces, 1); cases++;
  userReduced = true;
  await act(async () => { root.update(preview(true)); });
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); cases++;
  userReduced = false;
  await act(async () => { root.update(preview(true)); });
  assert.equal(sensors, 1); assert.equal(gpuSurfaces, 1); cases++;
  await act(async () => { root.unmount(); });
  assert.equal(sensors, 0); assert.equal(gpuSurfaces, 0); assert.equal(appListeners, 0); assert.equal(preferenceListeners, 0); cases++;
  assert.ok(cancellations >= 8, 'smoothing/return animations are cancelled on suspension and unmount'); cases++;

  let lazyLoads = 0, haptics = 0, pathname = '/binder/one';
  const trace: string[] = [];
  const inspectionNode = 'InspectionModal' as React.ElementType;
  function Viewer({ onClose }: { onClose: (action?: () => void) => void }) {
    React.useEffect(() => { trace.push('viewer-mounted'); return () => { trace.push('viewer-unmounted'); }; }, []);
    return React.createElement(inspectionNode, { onClose });
  }
  const dependencies = {
    'expo-router': { usePathname: () => pathname },
    '../lib/cardInspection': contract,
    '../lib/haptics': { stackrHaptics: { cardInspection: () => { haptics++; } } },
    get './CardInspectionViewer'() { lazyLoads++; return { __esModule: true, default: Viewer }; },
  };
  const { CardInspectionProvider, useCardInspection } = load('components/CardInspectionProvider.tsx', dependencies);
  let inspect!: (request: contract.CardInspectionRequest) => void;
  let listMounts = 0;
  let listState: unknown;
  function List() {
    inspect = useCardInspection().inspectCard;
    const [state] = React.useState({ scrollOffset: 1452, filter: 'reverse-holo', cachedRows: ['one', 'two'] });
    listState = state;
    React.useEffect(() => { listMounts++; }, []);
    return React.createElement('CardList');
  }
  const shell = () => React.createElement(CardInspectionProvider, {}, React.createElement(List));
  await act(async () => { root = create(shell()); });
  const before = listState;
  assert.equal(lazyLoads, 0, 'normal list rendering cannot load the viewer or native shader'); cases++;
  const request: contract.CardInspectionRequest = { source: 'catalogue', card: { id: 'one' }, imageUri: 'https://example.invalid/one.png' };
  await act(async () => { inspect({ ...request, source: 'condition-photo' }); });
  assert.equal(lazyLoads, 0); assert.equal(haptics, 0); cases++;
  await act(async () => { inspect(request); });
  assert.equal(root.root.findAllByType(inspectionNode).length, 1); assert.equal(haptics, 1); cases++;
  await act(async () => { root.root.findByType(inspectionNode).props.onClose(() => trace.push('quick-actions')); });
  assert.equal(root.root.findAllByType(inspectionNode).length, 0); cases++;
  assert.equal(listState, before); assert.equal(listMounts, 1, 'closing preserves list instance, filters, scroll and cached rows'); cases++;
  assert.deepEqual(trace, ['viewer-mounted', 'viewer-unmounted', 'quick-actions'], 'quick actions run only after inspection is dismissed'); cases++;
  await act(async () => { inspect(request); });
  pathname = '/search';
  await act(async () => { root.update(shell()); });
  assert.equal(root.root.findAllByType(inspectionNode).length, 0, 'leaving the screen releases the viewer'); cases++;
  await act(async () => { root.unmount(); });
  console.log(`Card inspection lifecycle: ${cases} cases passed, 0 failed (React renderer, mocked native boundaries).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
