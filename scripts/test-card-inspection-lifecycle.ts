import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as motion from '../lib/cardPreviewMotion';
import * as contract from '../lib/cardInspection';
import * as performance from '../lib/performance';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function load(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const module = { exports: {} as any };
  const source = process.env.CARD_INSPECTION_BASELINE === '1' && file === 'components/CardInspectionProvider.tsx'
    ? execFileSync('git', ['show', `bd2aa90414f40533979e4161d5c0e8fbf78708cf:${file}`], { encoding: 'utf8' })
    : readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return React;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }, ...globals });
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
    }, cardLightCrossing: (isCurrent?: () => boolean) => {
      if (isCurrent?.() ?? true) foilHapticCalls++;
    } } },
  });
  function Material() { React.useEffect(() => { gpuSurfaces++; return () => { gpuSurfaces--; }; }, []); return null; }
  let root!: ReactTestRenderer;
  const preview = (active: boolean, motionPaused = false, foilHaptics = false, resetKey = 0, lightHaptics = false) => React.createElement(InteractiveCardPreview, { active, motionPaused, foilHaptics, lightHaptics, resetKey,
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
  await act(async () => { root.update(preview(true, false, false, 2, true)); });
  const dragReaction = foilReaction().reaction;
  dragReaction.react(dragReaction.prepare()); // Settle at the actual neutral rendered position.
  gesture.onPanResponderMove(null, { dx: 140, dy: 0 });
  const dragged = dragReaction.prepare();
  assert.equal(dragged.x, 1, 'the light cue follows the same combined drag/sensor value as the rendered card');
  dragReaction.react(dragged);
  assert.equal(queuedUiToJs.length, 1, 'an actual drag queues one studio-light cue without sensor movement');
  queuedUiToJs.shift()!();
  assert.equal(foilHapticCalls, 1, 'the current studio-light cue reaches the native facade'); cases++;
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
  let openingListener: (state: string) => void = () => {};
  let openingListeners = 0;
  const openingAppState = { currentState: 'active', addEventListener: (_: string, listener: typeof openingListener) => {
    openingListener = listener; openingListeners++;
    return { remove: () => { openingListeners--; } };
  } };
  const pendingOpeningGuards: ((() => boolean) | undefined)[] = [];
  const trace: string[] = [];
  const inspectionNode = 'InspectionModal' as React.ElementType;
  function Viewer({ onClose }: { onClose: (action?: () => void) => void }) {
    React.useEffect(() => { trace.push('viewer-mounted'); return () => { trace.push('viewer-unmounted'); }; }, []);
    return React.createElement(inspectionNode, { onClose });
  }
  const dependencies = {
    '../lib/performance': performance,
    'react-native': { AppState: openingAppState },
    'expo-router': { usePathname: () => pathname },
    '../lib/cardInspection': contract,
    '../lib/haptics': { stackrHaptics: { cardInspection: (isCurrent?: () => boolean) => { haptics++; pendingOpeningGuards.push(isCurrent); } } },
    get './CardInspectionViewer'() { lazyLoads++; return { __esModule: true, default: Viewer }; },
  };
  const { CardInspectionProvider, useCardInspection } = load('components/CardInspectionProvider.tsx', dependencies);
  let inspect!: (request: contract.CardInspectionRequest) => void;
  let listMounts = 0;
  let listState: unknown;
  let observePathChange = false;
  let preEffectRouteGuard: boolean | undefined;
  function List() {
    inspect = useCardInspection().inspectCard;
    const [state] = React.useState({ scrollOffset: 1452, filter: 'reverse-holo', cachedRows: ['one', 'two'] });
    listState = state;
    React.useEffect(() => { listMounts++; }, []);
    React.useLayoutEffect(() => {
      if (observePathChange) preEffectRouteGuard = pendingOpeningGuards.at(-1)?.();
    });
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
  assert.equal(pendingOpeningGuards[0]?.(), true, 'accepted opening supplies a live guard before delayed native dispatch'); cases++;
  await act(async () => { root.root.findByType(inspectionNode).props.onClose(() => trace.push('quick-actions')); });
  assert.equal(root.root.findAllByType(inspectionNode).length, 0); cases++;
  assert.equal(pendingOpeningGuards[0]?.(), false, 'closing invalidates the opening before preference hydration settles'); cases++;
  assert.equal(listState, before); assert.equal(listMounts, 1, 'closing preserves list instance, filters, scroll and cached rows'); cases++;
  assert.deepEqual(trace, ['viewer-mounted', 'viewer-unmounted', 'quick-actions'], 'quick actions run only after inspection is dismissed'); cases++;
  await act(async () => { inspect(request); });
  const priorOpening = pendingOpeningGuards.at(-1);
  await act(async () => { inspect({ ...request, card: { id: 'two' } }); });
  assert.equal(priorOpening?.(), false, 'replacement invalidates the prior delayed opening');
  assert.equal(pendingOpeningGuards.at(-1)?.(), true, 'replacement opening is current'); cases++;
  const backgroundOpening = pendingOpeningGuards.at(-1);
  openingAppState.currentState = 'inactive';
  assert.equal(backgroundOpening?.(), false, 'foreground guard applies before passive effects or event delivery'); cases++;
  openingListener('inactive');
  openingAppState.currentState = 'active';
  openingListener('active');
  assert.equal(backgroundOpening?.(), false, 'foreground return cannot revive a queued opening'); cases++;
  await act(async () => { inspect(request); });
  observePathChange = true;
  pathname = '/search';
  await act(async () => { root.update(shell()); });
  assert.equal(preEffectRouteGuard, false, 'navigation masks delayed feedback before passive route cleanup'); cases++;
  assert.equal(root.root.findAllByType(inspectionNode).length, 0, 'leaving the screen releases the viewer'); cases++;
  assert.equal(pendingOpeningGuards.at(-1)?.(), false, 'navigation invalidates delayed opening feedback'); cases++;
  await act(async () => { inspect(request); });
  const unmountedOpening = pendingOpeningGuards.at(-1);
  assert.equal(unmountedOpening?.(), true);
  await act(async () => { root.unmount(); });
  assert.equal(unmountedOpening?.(), false, 'provider unmount invalidates delayed opening feedback'); cases++;
  assert.equal(openingListeners, 0, 'provider releases its foreground listener'); cases++;

  // Execute the actual facade with the actual provider guards across delayed
  // preference hydration. Native dispatch is observed; physical feedback is not.
  let hapticNow = 1000, enabled = true;
  let hydration: Promise<boolean> = Promise.resolve(true);
  const impacts: string[] = [];
  const actualHaptics = load('lib/haptics.ts', {
    'expo-haptics': { ImpactFeedbackStyle: { Rigid: 'rigid' }, NotificationFeedbackType: {},
      impactAsync: async (style: string) => { impacts.push(style); }, selectionAsync: async () => {} },
    'react-native': { Platform: { OS: 'ios' } },
    './hapticPreference': { getStoredHapticsEnabled: () => enabled,
      hydrateStoredHapticsPreference: () => hydration,
      saveStoredHapticsEnabled: async (next: boolean) => { enabled = next; return next; },
      setTransientHapticsEnabled: (next: boolean) => { enabled = next; } },
  }, { Date: { now: () => hapticNow } });
  for (const transition of ['inactive', 'background', 'close', 'replace', 'navigate', 'unmount', 'disabled', 'current'] as const) {
    openingAppState.currentState = 'active';
    enabled = true;
    hapticNow += 1000;
    let finishHydration!: (enabled: boolean) => void;
    hydration = new Promise(resolve => { finishHydration = resolve; });
    const dispatched: Promise<void>[] = [];
    dependencies['../lib/haptics'].stackrHaptics.cardInspection = (isCurrent?: () => boolean) => {
      const work = actualHaptics.stackrHaptics.cardInspection(isCurrent);
      dispatched.push(work);
    };
    await act(async () => { root = create(shell()); });
    await act(async () => { inspect(request); });
    if (transition === 'inactive' || transition === 'background') {
      openingAppState.currentState = transition;
      openingListener(transition);
      openingAppState.currentState = 'active';
      openingListener('active');
    } else if (transition === 'close') {
      await act(async () => root.root.findByType(inspectionNode).props.onClose());
    } else if (transition === 'replace') {
      await act(async () => { inspect({ ...request, card: { id: 'replacement' } }); });
    } else if (transition === 'navigate') {
      pathname = `${pathname}/next`;
      await act(async () => { root.update(shell()); });
    } else if (transition === 'unmount') {
      await act(async () => { root.unmount(); });
    } else if (transition === 'disabled') enabled = false;
    const beforeImpacts = impacts.length;
    finishHydration(enabled);
    await Promise.all(dispatched);
    assert.equal(impacts.length - beforeImpacts, transition === 'current' || transition === 'replace' ? 1 : 0,
      `${transition}: only a current enabled opening may dispatch after hydration`);
    if (transition !== 'unmount') await act(async () => { root.unmount(); });
    assert.equal(openingListeners, 0); cases++;
  }
  console.log(`Card inspection lifecycle: ${cases} cases passed, 0 failed (React renderer, mocked native boundaries).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
