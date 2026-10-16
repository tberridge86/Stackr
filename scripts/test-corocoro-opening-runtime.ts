import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { getCorocoroIssueGroup } from '../lib/corocoroIssueArchive';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let focused = true;
let reduced = false;
let preferenceLoaded = true;
let source: number | null = 200105;
const listeners = new Map<string, (value: any) => void>();
const animations: { options: any; finish: (result: { finished: boolean }) => void; stopped: boolean }[] = [];
class Value {
  current: number;
  constructor(value: number) { this.current = value; }
  setValue(value: number) { this.current = value; }
  interpolate(options: unknown) { return { value: this, options }; }
}
const useFocusEffect = (callback: () => (() => void) | void) => React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
const native = {
  View: 'View', Pressable: 'Pressable', StyleSheet: { create: (value: unknown) => value },
  Easing: { cubic: 'cubic', inOut: (value: unknown) => value },
  Animated: {
    Value, View: 'AnimatedView',
    timing: (_value: unknown, options: unknown) => {
      const record = { options, finish: (_result: { finished: boolean }) => {}, stopped: false };
      animations.push(record);
      return { start: (callback: typeof record.finish) => { record.finish = callback; }, stop: () => { record.stopped = true; } };
    },
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: (name: string, callback: (value: any) => void) => { listeners.set(name, callback); return { remove: () => listeners.delete(name) }; },
  },
  AppState: { addEventListener: (name: string, callback: (value: any) => void) => { listeners.set(name, callback); return { remove: () => listeners.delete(name) }; } },
};
const module = { exports: {} as Record<string, any> };
const dependencies: Record<string, unknown> = {
  react: React, 'react-native': native, 'expo-router': { useFocusEffect },
  '../lib/cardMotionPreference': { useCardMotionPreference: () => ({ loaded: preferenceLoaded, reduced }) },
  '../lib/corocoroIssueArchive': { formatCorocoroIssueMonth: () => 'May 2001' },
  '../lib/corocoroSuppliedCovers': { getCorocoroSuppliedCover: () => source },
  './StackrImage': { StackrImage: 'StackrImage' }, './Text': { Text: 'Text' },
  './theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#6938F5' }) } }) },
};
const compiled = ts.transpileModule(readFileSync('components/CorocoroIssueOpening.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
runInNewContext(compiled, { module, exports: module.exports, React, console,
  require: (name: string) => { if (!(name in dependencies)) throw Error(`Unexpected opening dependency ${name}`); return dependencies[name]; } });

async function main() {
  let renderer!: ReactTestRenderer;
  const component = module.exports.CorocoroIssueOpening;
  const issue = getCorocoroIssueGroup('monthly:2001-05')!;
  const update = async () => { await act(async () => renderer.update(React.createElement(component, { issue }))); };
  const button = (label: string) => renderer.root.findByProps({ accessibilityLabel: label });
  const coverImage = () => renderer.root.find(node => String(node.type) === 'StackrImage');
  const load = async () => { await act(async () => coverImage().props.onLoad()); };
  const text = () => renderer.root.findAll(node => String(node.type) === 'Text').map(node => node.children.join('')).join(' ');
  await act(async () => { renderer = create(React.createElement(component, { issue })); });
  assert.equal(animations.length, 0, 'Entering an issue leaves browsing available without mandatory animation');
  assert.equal(coverImage().props.source, 200105, 'Opening uses the exact owner-supplied cover');
  await act(async () => button('Skip magazine opening').props.onPress());
  assert.equal(renderer.root.findAll(node => String(node.type) === 'StackrImage').length, 1, 'Skipping before load keeps the original image mounted');
  await load();
  assert.equal(button('Replay magazine opening').props.disabled, false, 'A skipped loading cover becomes replayable when its image arrives');
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(React.createElement(component, { issue })); });
  await load();
  await act(async () => button('Open magazine cover').props.onPress());
  assert.equal(animations[0].options.useNativeDriver, true); assert.equal(animations[0].options.duration, 1100);
  await act(async () => button('Skip magazine opening').props.onPress());
  assert(animations[0].stopped); assert.match(text(), /does not mark any card owned/);
  await act(async () => animations[0].finish({ finished: true }));
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Replay magazine opening' }).length, 1, 'Late animation completion cannot reopen an issue');
  await act(async () => button('Replay magazine opening').props.onPress());
  await act(async () => listeners.get('change')!('background'));
  assert(animations[1].stopped); assert.match(text(), /Ready to browse/);
  focused = false; await update(); focused = true; await update();
  assert.equal(animations.length, 2, 'Returning to a retained issue does not restart its opening');
  reduced = true; await update();
  await act(async () => button('Replay magazine opening').props.onPress());
  assert.equal(animations.length, 2, 'Reduced motion settles without a timing animation');
  reduced = false; preferenceLoaded = false; await update();
  await act(async () => button('Replay magazine opening').props.onPress());
  assert.equal(animations.length, 2, 'Unknown motion preference defaults to a still entrance');
  await act(async () => renderer.unmount());

  preferenceLoaded = true;
  await act(async () => { renderer = create(React.createElement(component, { issue })); });
  await act(async () => coverImage().props.onError());
  assert.match(text(), /Cover unavailable/); assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Open magazine cover' }).length, 0);
  await act(async () => renderer.unmount());
  source = null;
  await act(async () => { renderer = create(React.createElement(component, { issue })); });
  assert.match(text(), /No verified cover/);
  assert.equal(renderer.root.findAll(node => String(node.type) === 'StackrImage').length, 0);
  await act(async () => renderer.unmount());
  assert.equal(listeners.size, 0);
  console.log('CoroCoro cover entrance: original cover, optional finite native motion, skip, replay, reduced-motion defaults, foreground/focus cancellation and missing images passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
