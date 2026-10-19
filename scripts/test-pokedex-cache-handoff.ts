import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const rawEntries = (offset: number, length: number, prefix = 'pokemon') => Array.from({ length }, (_, index) => {
  const id = offset + index + 1;
  return { name: `${prefix}-${id}`, speciesName: `${prefix}-${id}`, speciesId: id,
    routeName: `${prefix}-${id}`, routeId: id, url: `https://pokeapi.co/api/v2/pokemon/${id}/` };
});
const savedEntries = () => rawEntries(0, 1025, 'saved').map((row) => ({ ...row, id: row.speciesId }));

function harness(cache: Promise<string | null>) {
  const requests: { offset: number; limit: number; response: ReturnType<typeof deferred<any>> }[] = [];
  const writes: string[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const context = {
    React, console, Promise, Array, Map, Set, String, Number, Boolean, Object, JSON, RegExp, URLSearchParams, AbortController,
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  };
  const compile = (file: string, dependencies: Record<string, unknown>) => {
    const module = { exports: {} as Record<string, any> };
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    runInNewContext(compiled, { ...context, module, exports: module.exports,
      require: (name: string) => {
        if (name.startsWith('../../assets/')) return name;
        assert.ok(name in dependencies, `Unexpected Pokédex dependency: ${name}`);
        return dependencies[name];
      },
    });
    return module.exports;
  };
  const optional = compile('lib/optionalCatalogueEnrichment.ts', {});
  const native = { FlatList: 'FlatList', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles }, useWindowDimensions: () => ({ width: 393, height: 852 }) };
  const dependencies = {
    react: React, 'react-native': native,
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#112233' }) } }) },
    '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' },
    '../../components/StackrFunctionalIcon': { StackrFunctionalIcon: 'Image' },
    '@react-native-async-storage/async-storage': { getItem: () => cache, setItem: async (_key: string, value: string) => { writes.push(value); } },
    '../../components/Text': { Text: 'Text' }, '../../components/FeatureTipModal': { FeatureTipGate: 'Tip' },
    'expo-router': { router: { push: () => undefined } }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../lib/pokedexCollection': { fetchOwnedPokemonNameSet: () => { throw new Error('Private ownership must use its independent hook'); }, pokemonNameMatchesCardName: () => false },
    '../../lib/stackrApiV1': { stackrApiClient: { pokemonIndex: (options: any) => { const response = deferred<any>(); requests.push({ ...options, response }); return response.promise; } } },
    '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' },
    '../../components/StackrScreen': { PokemonArtworkGlow: 'Glow', StackrScreen: 'Screen' },
    '../../lib/stackrIcons': { stackrIcons: { pokedex: 'pokedex-icon' } },
    '../../lib/pokedexOwnershipState': { usePokedexOwnership: () => ({ values: null, status: 'loading', message: null }) },
    '../../lib/optionalCatalogueEnrichment': optional,
  };
  return { Screen: compile('app/(tabs)/pokedex.tsx', dependencies).default as React.ComponentType, requests, writes, timers };
}

async function mount(host: ReturnType<typeof harness>) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(host.Screen)); await tick(); });
  return renderer;
}
function rows(renderer: ReactTestRenderer): any[] {
  return renderer.root.findAll((node) => String(node.type) === 'FlatList')[0]?.props.data ?? [];
}
async function respond(host: ReturnType<typeof harness>, offset: number, length: number) {
  const request = host.requests.find((entry) => entry.offset === offset);
  assert.ok(request, `Expected public index request at offset ${offset}`);
  await act(async () => { request!.response.resolve({ data: { count: 1025, indexVersion: 'fixture-v1', results: rawEntries(offset, length) } }); await tick(); });
}

async function run() {
  const stalled = deferred<string | null>();
  const cold = harness(stalled.promise);
  const coldScreen = await mount(cold);
  assert.equal(cold.requests.length, 0, 'a disk lookup may use its small existing cache budget');
  const deadline = [...cold.timers.values()].find((timer) => timer.delay === 25);
  assert.ok(deadline, 'an unresolved disk cache must have a 25ms handoff instead of holding remote retrieval indefinitely');
  await act(async () => { deadline!.callback(); await tick(); });
  assert.equal(cold.requests.length, 1, 'remote facts start after the disk budget even if storage remains pending');
  await respond(cold, 0, 151);
  assert.equal(rows(coldScreen).length, 151, 'first useful facts render before the continuation');
  assert.equal(cold.writes.length, 0, 'partial catalogue rows must not be persisted as a complete cache');
  await act(async () => { stalled.resolve(JSON.stringify(savedEntries())); await tick(); });
  assert.equal(rows(coldScreen).length, 151, 'a late disk result must not replace the current remote facts');
  assert.equal(rows(coldScreen)[0].name, 'pokemon-1');
  await respond(cold, 151, 874);
  assert.equal(rows(coldScreen).length, 1025);
  assert.equal(cold.writes.length, 1, 'only the validated complete catalogue is persisted');
  await act(async () => { coldScreen.unmount(); });

  const warm = harness(Promise.resolve(JSON.stringify(savedEntries())));
  const warmScreen = await mount(warm);
  assert.equal(rows(warmScreen).length, 1025, 'a ready valid disk cache still renders its complete saved catalogue');
  assert.equal(warm.timers.size, 0, 'a fast cache clears the optional handoff timer');
  await respond(warm, 0, 151);
  assert.equal(rows(warmScreen)[0].name, 'saved-1', 'background partial facts cannot downgrade a complete saved catalogue');
  await act(async () => { warmScreen.unmount(); });
  await respond(warm, 151, 874);
  assert.equal(warm.writes.length, 0, 'an unmounted refresh must not persist late results');

  const neverRead = deferred<string | null>();
  const leaving = harness(neverRead.promise);
  const leavingScreen = await mount(leaving);
  await act(async () => { leavingScreen.unmount(); await tick(); });
  assert.equal(leaving.timers.size, 0, 'leaving during the optional cache read cancels its handoff timer');
  assert.equal(leaving.requests.length, 0, 'an unmounted disk read must not start network retrieval');
  neverRead.resolve(null);
  await tick();
  assert.equal(leaving.requests.length, 0, 'a late disk result cannot start an unmounted screen’s retrieval');
  console.log('Pokédex actual screen: bounded disk handoff, first useful facts, late-cache suppression, complete-only persistence and unmount passed.');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
