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

const Surface = load();
async function main() {
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(React.createElement(Surface, { source: 'catalogue', profile: { profile: 'cosmos' }, width: 180, height: 250, x: { value: 0.8 }, y: { value: -0.6 } })); });
  assert.equal(root.toJSON(), null, 'web must not fabricate a foil approximation without a reviewed material renderer');
  console.log('Card foil web fallback stays visually truthful: no unverified material is rendered.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
