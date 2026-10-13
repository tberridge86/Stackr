import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const future = Math.floor(Date.now() / 1000) + 3600;
const overview = (owner: string, id: string) => ({
  binders: [{ id, user_id: owner, name: id, color: '#fff', type: 'custom', is_public: false, source_set_id: null, created_at: '2026-10-12T00:00:00.000Z' }],
  customNameArtKeys: {},
});

function compileBinder(dependencies: Record<string, unknown>) {
  const file = 'app/(tabs)/binder.tsx';
  const source = readFileSync(file, 'utf8');
  const renderStart = source.indexOf('  // MAIN RENDER');
  assert.ok(renderStart > 0, 'binder screen has a render boundary for the runtime harness');
  const harnessed = `${source.slice(0, renderStart)}\n  return React.createElement('SavedBinderState', { visibleBinders, loading, savedReadOnlyMessage, savedReadOnly, canOpenSavedBinder });\n}\n`;
  const module = { exports: {} as Record<string, any> };
  const generic: any = new Proxy(function () {}, { get: () => generic, apply: () => generic });
  const compiled = ts.transpileModule(harnessed, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    React,
    console,
    Date,
    Promise,
    Set,
    Map,
    Object,
    Array,
    String,
    Number,
    require: (name: string) => dependencies[name] ?? generic,
  });
  return module.exports.default as React.ComponentType;
}

async function settle() {
  await act(async () => { for (let i = 0; i < 8; i += 1) await tick(); });
}

async function main() {
  let auth = { user: null, loading: false, cachedReadSession: { userId: 'owner-a', expiresAt: future, epoch: 1 } as { userId: string; expiresAt: number; epoch: number } | null };
  const reads = new Map<string, Deferred<any>>();
  const writes: unknown[] = [];
  let remoteCalls = 0;
  const cacheRead = (owner: string) => {
    const pending = deferred<any>();
    reads.set(owner, pending);
    return pending.promise;
  };
  const genericObject = {};
  const Binder = compileBinder({
    react: React,
    'expo-router': { router: { replace() {}, push() {}, back() {} }, useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]), useLocalSearchParams: () => ({ readOnly: 'true' }) },
    'react-native': { useWindowDimensions: () => ({ width: 390 }), Alert: { alert() {} } },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: { bg: '#fff' } } }) },
    '../../components/profile-context': { useProfile: () => ({ profile: null }) },
    '../../components/auth-context': { useAuth: () => auth },
    '../../lib/stackrQuery': { stackrQueryClient: { setQueryData: (...args: unknown[]) => writes.push(args), getQueryData: () => null, fetchQuery: async () => { remoteCalls += 1; return null; }, invalidateQueries: async () => {} }, stackrQueryKeys: { binderLibrary: (id: string) => ['binder', id], binderLibraryRoot: ['binder-root'], binderLibrarySummaries: () => ['summary'] }, stackrQueryTiming: { hotPathStaleMs: 1 } },
    '../../lib/binders': { fetchBinders: async () => { remoteCalls += 1; return []; }, invalidateBinderCaches() {}, deleteBinder: async () => {} },
    '../../lib/supabase': { supabase: { auth: { getSession: async () => { remoteCalls += 1; return { data: {}, error: null }; } } } },
    '../../lib/collectionPricingApi': { loadCollectionPrices: async () => { remoteCalls += 1; return []; } },
    '../../lib/ownership': { fetchOwnedCardRows: async () => [] },
    '../../lib/binderLibraryCache': { readPersistedBinderOverview: cacheRead, isBinderLibraryOverviewForUser: () => true, removePersistedBinderOverview: async () => {}, writePersistedBinderOverview: async () => {} },
    '../../lib/stackrIcons': { stackrIcons: genericObject },
    '../../components/BinderModeBadge': { BINDER_MODE_BADGE_SOURCES: genericObject, BinderModeIconBadge: genericObject },
  });

  let root!: ReactTestRenderer;
  await act(async () => { root = create(React.createElement(Binder)); });
  assert.ok(reads.has('owner-a'), 'saved binder screen reads only the validated disk cache for the current local owner');
  auth = { user: null, loading: false, cachedReadSession: { userId: 'owner-b', expiresAt: future, epoch: 2 } };
  await act(async () => { root.update(React.createElement(Binder)); });
  reads.get('owner-a')!.resolve(overview('owner-a', 'binder-a'));
  await settle();
  let state = root.root.findByType('SavedBinderState' as any).props;
  assert.equal(state.visibleBinders.length, 0, 'a late owner A cache cannot paint while owner B is current');
  const olderBRead = reads.get('owner-b')!;
  auth = { user: null, loading: false, cachedReadSession: { userId: 'owner-b', expiresAt: future, epoch: 3 } };
  await act(async () => { root.update(React.createElement(Binder)); });
  olderBRead.resolve(overview('owner-b', 'older-binder-b'));
  await settle();
  assert.equal(root.root.findByType('SavedBinderState' as any).props.visibleBinders.length, 0, 'a previous same-account session epoch cannot publish its delayed saved read');
  reads.get('owner-b')!.resolve(overview('owner-b', 'binder-b'));
  await settle();
  state = root.root.findByType('SavedBinderState' as any).props;
  assert.equal(state.visibleBinders[0]?.id, 'binder-b', 'the current owner may display only its own saved binders');
  const heldOpenCallback = state.canOpenSavedBinder as () => boolean;
  assert.equal(heldOpenCallback(), true, 'a current unexpired saved card may open its read-only detail');
  assert.equal(remoteCalls, 0, 'saved binder mode makes no session, refresh, pricing, or summary requests');
  assert.ok(writes.length > 0, 'saved cache is placed only in in-memory UI state after owner validation');

  auth = { user: null, loading: false, cachedReadSession: null };
  await act(async () => { root.update(React.createElement(Binder)); });
  await settle();
  state = root.root.findByType('SavedBinderState' as any).props;
  assert.equal(state.visibleBinders.length, 0, 'sign-out masks saved rows before another account can see them');
  assert.equal(heldOpenCallback(), false, 'a held card press callback fails closed after sign-out instead of routing an old binder id');
  assert.match(state.savedReadOnlyMessage, /expired/i, 'expired or absent local session fails closed with an account-check route');
  await act(async () => { root.unmount(); });

  console.log('Saved binder screen runtime passed: disk-only owner cache, A/B late-result masking, no remote calls, sign-out mask, and unmount cleanup.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
