import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function load() {
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync('components/CardFoilSurface.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return React;
    if (name === 'react-native') return { StyleSheet: { absoluteFill: { position: 'absolute' } } };
    if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
    if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'AnimatedView' }, useAnimatedStyle: (fn: () => unknown) => fn() };
    throw new Error(`Unexpected runtime dependency: ${name}`);
  } });
  return module.exports.default as React.ComponentType<any>;
}

const plain = { profile: 'plain', mask: { kind: 'none' }, material: {} };
const region = { x: 0.1, y: 0.2, width: 0.7, height: 0.4 };
const props = (profile: any, source: string = 'catalogue') => ({ source, profile, width: 180, height: 250, x: { value: 0 }, y: { value: 0 } });
const Surface = load();
async function render(profile: any, source?: string) {
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(React.createElement(Surface, props(profile, source))); });
  return root.toJSON();
}
const find = (node: any, type: string): any[] => !node ? [] : [node, ...(Array.isArray(node.children) ? node.children.flatMap((child: any) => find(child, type)) : [])].filter((child: any) => child?.type === type);

async function main() {
  const neutral = await render(plain);
  const neutralGradients = find(neutral, 'LinearGradient');
  assert.equal(neutralGradients.length, 1, 'plain cards retain one basic reflection layer');
  assert.ok(neutralGradients[0].props.colors.every((colour: string) => !colour.includes('214,237,255')), 'plain reflection remains achromatic');

  const artwork = await render({ profile: 'diagonal', mask: { kind: 'artwork', regions: [region] }, material: {} });
  assert.equal(find(artwork, 'LinearGradient').length, 1, 'artwork aliases receive exactly one contained foil layer');
  assert.equal(find(artwork, 'LinearGradient')[0].props.colors.some((colour: string) => colour.includes('214,237,255')), true, 'verified artwork geometry receives the restrained chromatic highlight');

  const complexExclusion = await render({ profile: 'reverse', mask: { kind: 'outside-artwork', regions: [region, { ...region, y: 0.7 }] }, material: {} });
  assert.equal(find(complexExclusion, 'LinearGradient').length, 1, 'complex exclusion falls back to one neutral layer');
  assert.ok(find(complexExclusion, 'LinearGradient')[0].props.colors.every((colour: string) => !colour.includes('214,237,255')), 'complex exclusion never leaks chromatic material over a protected region');

  assert.equal(await render({ profile: 'radiant', mask: { kind: 'full' }, material: {} }, 'condition-photo'), null, 'condition photos never receive a catalogue foil surface');
  console.log('Card foil web fallback: 8 cases passed, 0 failed (React renderer, not browser GPU evidence).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
