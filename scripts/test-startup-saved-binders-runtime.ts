import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as performance from '../lib/performance';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error?: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function compile(file: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, {
    module,
    exports: module.exports,
    React,
    console,
    Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected runtime import: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const future = Math.floor(Date.now() / 1000) + 3_600;
const session = (userId: string, expiresAt = future) => ({ user: { id: userId }, expires_at: expiresAt });

async function settle() {
  await act(async () => { for (let index = 0; index < 8; index += 1) await tick(); });
}

async function main() {
  let authListener!: (event: string, value: unknown) => void;
  let authResponse = deferred<any>();
  const cacheReads = new Map<string, Deferred<unknown>[]>();
  const routes: unknown[] = [];
  const cacheRead = (userId: string) => {
    const next = deferred<unknown>();
    const reads = cacheReads.get(userId) ?? [];
    reads.push(next);
    cacheReads.set(userId, reads);
    return next.promise;
  };
  const latestCacheRead = (userId: string) => cacheReads.get(userId)?.at(-1);
  const authModule = compile('components/auth-context.tsx', {
    '../lib/performance': performance,
    react: React,
    '@react-native-async-storage/async-storage': { getAllKeys: async () => [], multiRemove: async () => {} },
    '../lib/startup': { withStartupTimeout: (promise: Promise<unknown>) => promise },
    '../lib/supabase': { supabase: { auth: {
      getUser: () => authResponse.promise,
      onAuthStateChange: (callback: typeof authListener) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    } } },
  });
  const indexModule = compile('app/index.tsx', {
    react: React,
    'expo-router': { useRouter: () => ({ replace: (route: unknown) => routes.push(route) }) },
    'react-native': { TouchableOpacity: 'TouchableOpacity', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/auth-context': { useAuth: authModule.useAuth },
    '../components/profile-context': { useProfile: () => ({ profile: null, loading: true, error: null, refreshProfile: async () => {} }) },
    '../components/StackrLoadingScreen': { StackrLoadingScreen: 'StackrLoadingScreen' },
    '../components/Text': { Text: 'Text' },
    '../components/theme-context': { useTheme: () => ({ theme: { colors: { bg: '#fff', primary: '#111' } } }) },
    '../lib/startup': { resolveStartupDestination: () => null },
    '../lib/binderLibraryCache': {
      readPersistedBinderOverview: cacheRead,
      isBinderLibraryOverviewForUser: (snapshot: unknown, userId: string) => (snapshot as { owner?: unknown } | null)?.owner === userId,
    },
  });
  const Index = indexModule.default;
  const tree = () => React.createElement(authModule.AuthProvider, null, React.createElement(Index));
  assert.equal(authModule.isKnownAuthDenial({ status: 400, code: 'user_not_found', message: 'Deleted user' }), true);
  assert.equal(authModule.isKnownAuthDenial({ status: 400, code: 'session_not_found' }), true);
  assert.equal(authModule.isKnownAuthDenial({ status: 503, message: 'Network unavailable' }), false);
  const savedButton = (root: ReactTestRenderer) => root.root.findAllByType('TouchableOpacity' as any)
    .find(node => node.findAllByType('Text' as any).some(text => text.children.join('') === 'View saved binders'));

  let root!: ReactTestRenderer;
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a')); });
  latestCacheRead('owner-a')!.resolve({ owner: 'owner-a' });
  await settle();
  const validButton = savedButton(root);
  assert.ok(validButton, 'a valid local session and exact owner cache expose the saved-binders escape hatch while server validation hangs');
  await act(async () => { validButton!.props.onPress(); });
  assert.deepEqual(JSON.parse(JSON.stringify(routes)), [{ pathname: '/(tabs)/binder', params: { readOnly: 'true' } }]);

  // A verified server denial masks local access immediately, even if the local cache was ready.
  authResponse.reject({ status: 403, message: 'Access denied' });
  await settle();
  assert.equal(savedButton(root), undefined, 'known server denial removes the local read-only option');
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a')); });
  await settle();
  assert.equal(savedButton(root), undefined, 'a late restored-session event cannot revive a server-denied cache');
  await act(async () => { root.unmount(); });

  // No restored session and expired sessions cannot read another account's cache.
  authResponse = deferred<any>();
  cacheReads.clear(); routes.length = 0;
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', null); });
  await settle();
  assert.equal(savedButton(root), undefined, 'no local session has no saved-binders option');
  await act(async () => { root.unmount(); });

  authResponse = deferred<any>();
  cacheReads.clear();
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a', Math.floor(Date.now() / 1000) - 1)); });
  await settle();
  assert.equal(savedButton(root), undefined, 'an expired local session has no saved-binders option');
  await act(async () => { root.unmount(); });

  // A missing or foreign envelope remains unavailable even with a valid session.
  authResponse = deferred<any>();
  cacheReads.clear();
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', session('owner-c')); });
  latestCacheRead('owner-c')!.resolve({ owner: 'owner-a' });
  await settle();
  assert.equal(savedButton(root), undefined, 'a foreign or invalid overview cannot enable the saved-binders option');
  await act(async () => { root.unmount(); });

  // Account changes reject stale A reads; returning to A must run a fresh owner-bound read.
  authResponse = deferred<any>();
  cacheReads.clear();
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a')); });
  const firstA = latestCacheRead('owner-a')!;
  await act(async () => { authListener('SIGNED_IN', session('owner-b')); });
  firstA.resolve({ owner: 'owner-a' });
  await settle();
  assert.equal(savedButton(root), undefined, 'late account A cache cannot expose saved binders while account B is current');
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a')); });
  await settle();
  assert.equal(savedButton(root), undefined, 'a late initial session cannot undo a newer real account event');
  latestCacheRead('owner-b')!.resolve({ owner: 'owner-b' });
  await settle();
  assert.ok(savedButton(root), 'the current account B may use only its own cache');
  await act(async () => { authListener('SIGNED_IN', session('owner-a', future + 1)); });
  await settle();
  assert.equal(savedButton(root), undefined, 'A-B-A clears the prior A cache eligibility until its new read completes');
  latestCacheRead('owner-a')!.resolve({ owner: 'owner-a' });
  await settle();
  assert.ok(savedButton(root), 'the new current A envelope can enable only a fresh matching read');
  const stalePress = savedButton(root)!.props.onPress;
  await act(async () => {
    authListener('SIGNED_IN', session('owner-b', future + 1));
    authListener('SIGNED_IN', session('owner-a', future + 1));
  });
  await settle();
  assert.equal(savedButton(root), undefined, 'a batched same-expiry A-B-A transition invalidates the prior A render by epoch');
  await act(async () => { stalePress(); });
  assert.equal(routes.length, 0, 'a stale saved-view button cannot navigate after an auth change');
  latestCacheRead('owner-a')!.resolve({ owner: 'owner-a' });
  await settle();
  assert.ok(savedButton(root), 'the current same-expiry A session requires its own new cache read');
  await act(async () => { authListener('SIGNED_OUT', null); });
  await settle();
  assert.equal(savedButton(root), undefined, 'sign-out clears local saved-binders access');
  await act(async () => { root.unmount(); });

  // A cache completion after unmount must be ignored.
  authResponse = deferred<any>();
  cacheReads.clear();
  await act(async () => { root = create(tree()); });
  await act(async () => { authListener('INITIAL_SESSION', session('owner-a')); });
  const pendingA = latestCacheRead('owner-a')!;
  await act(async () => { root.unmount(); });
  pendingA.resolve({ owner: 'owner-a' });
  await settle();

  console.log('Startup saved-binders runtime passed: local session expiry, owner envelope, denial, sign-out, A/B/ABA, route and unmount guards.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
