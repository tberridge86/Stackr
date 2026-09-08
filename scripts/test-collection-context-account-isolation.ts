import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function main() {
  let accountId: string | null = 'collector-a';
  const reads = new Map<string, Deferred<any[]>>();
  const getRead = (id: string) => {
    const existing = reads.get(id);
    if (existing) return existing;
    const next = deferred<any[]>();
    reads.set(id, next);
    return next;
  };

  const states: any[] = [];
  const refs: any[] = [];
  const effects: { deps?: readonly unknown[]; cleanup?: () => void; callback?: () => void | (() => void) }[] = [];
  let hookIndex = 0;
  let latestValue: any = null;
  const dependenciesEqual = (left?: readonly unknown[], right?: readonly unknown[]) =>
    left?.length === right?.length && left?.every((value, index) => Object.is(value, right?.[index]));

  const CollectionContext: any = { Provider: Symbol('CollectionProvider') };
  const ReactMock: any = {
    createContext: () => CollectionContext,
    createElement: (type: unknown, props: any) => {
      if (type === CollectionContext.Provider) {
        latestValue = props.value;
        return props.children ?? null;
      }
      return null;
    },
    useState: (initial: unknown) => {
      const index = hookIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next: unknown) => {
        states[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(states[index]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = hookIndex++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useMemo: (factory: () => unknown) => { hookIndex += 1; return factory(); },
    useCallback: (callback: unknown) => { hookIndex += 1; return callback; },
    useEffect: (callback: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hookIndex++;
      const previous = effects[index];
      if (!previous || !dependenciesEqual(previous.deps, deps)) {
        previous?.cleanup?.();
        effects[index] = { deps, callback };
      }
    },
    useContext: () => null,
  };

  const source = fs.readFileSync(new URL('../components/collection-context.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react') return { ...ReactMock, default: ReactMock };
      if (name === '../lib/binders') return {
        fetchBinders: () => {
          assert.ok(accountId, 'a signed-out provider must not read private binders');
          return getRead(accountId).promise;
        },
        createBinder: async () => {},
        deleteBinder: async () => {},
      };
      if (name === '../lib/pokemonTcg') return { normalizePokemonCardLanguage: (language?: string | null) => language ?? 'en' };
      if (name === '../lib/accountRequestGuard') return {
        isCurrentAccountRequest: (current: any, token: any) => current.accountGeneration === token.accountGeneration && current.requestId === token.requestId,
      };
      if (name === './auth-context') return { useAuth: () => ({ user: accountId ? { id: accountId } : null, loading: false }) };
      return {};
    },
    console,
  });

  const render = async () => {
    hookIndex = 0;
    latestValue = null;
    exports.CollectionProvider({ children: null });
    for (const effect of effects) {
      const callback = effect?.callback;
      if (!callback) continue;
      effect.callback = undefined;
      effect.cleanup = callback() || undefined;
    }
    await flush();
  };

  await render();
  assert.equal(latestValue.loadingTrackedSets, true);
  assert.deepEqual(JSON.parse(JSON.stringify(latestValue.trackedSetIds)), []);

  accountId = 'collector-b';
  await render();
  assert.equal(latestValue.loadingTrackedSets, true, 'account switch must hide prior tracked sets');
  assert.deepEqual(JSON.parse(JSON.stringify(latestValue.trackedSetIds)), []);

  getRead('collector-a').resolve([{ type: 'official', source_set_id: 'old-set', language: 'en' }]);
  await flush();
  await render();
  assert.deepEqual(JSON.parse(JSON.stringify(latestValue.trackedSetIds)), [], 'late prior-account reads must be ignored');

  getRead('collector-b').resolve([{ type: 'official', source_set_id: 'current-set', language: 'en' }]);
  await flush();
  await render();
  assert.equal(latestValue.loadingTrackedSets, false);
  assert.deepEqual(JSON.parse(JSON.stringify(latestValue.trackedSetIds)), ['en:current-set']);

  accountId = null;
  await render();
  await render();
  assert.equal(latestValue.loadingTrackedSets, false, 'sign-out must settle without a private read');
  assert.deepEqual(JSON.parse(JSON.stringify(latestValue.trackedSetIds)), []);

  console.log('Collection provider checks passed: stale reads stay isolated across account switch and sign-out.');
}

void main();
