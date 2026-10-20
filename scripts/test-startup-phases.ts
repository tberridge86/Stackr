import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as performance from '../lib/performance';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function compile(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const module = { exports: {} as Record<string, any> };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  runInNewContext(source, { module, exports: module.exports, React, console, setTimeout, clearTimeout, ...globals,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected startup import: ${name}`); return dependencies[name]; },
  });
  return module.exports;
}

async function main() {
  const timers = new Map<number, () => void>(); let timerId = 0;
  const timerGlobals = { setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; }, clearTimeout: (id: number) => timers.delete(id) };
  let segments: string[] = []; let authError: string | null = null; let profileError: string | null = null; let readyCalls = 0;
  const frames = new Map<number, () => void>(); let frameId = 0; const phases: string[] = [];
  const { StartupReadySignal } = compile('components/StartupReadySignal.tsx', {
    react: React, 'react-native': { View: 'View' }, 'expo-router': { useSegments: () => segments },
    './auth-context': { useAuth: () => ({ error: authError }) }, './profile-context': { useProfile: () => ({ error: profileError }) },
    '../lib/performance': { markStartupPhase: (phase: string) => phases.push(phase) },
  }, { requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: (id: number) => frames.delete(id) });
  const onReady = () => { readyCalls++; };
  let screen!: ReactTestRenderer;
  await act(async () => { screen = create(React.createElement(StartupReadySignal, { onReady })); });
  await act(async () => { screen.root.findByType('View' as any).props.onLayout(); });
  assert.equal(frames.size, 0, 'bootstrap loading is not a ready destination');
  segments = ['(tabs)'];
  await act(async () => { screen.update(React.createElement(StartupReadySignal, { onReady })); });
  assert.equal(readyCalls, 0, 'route commit waits for a frame');
  await act(async () => { for (const callback of frames.values()) callback(); frames.clear(); });
  assert.equal(readyCalls, 1, 'laid-out destination releases the cover');
  assert.ok(phases.includes('navigation-ready'));
  segments = [];
  await act(async () => { screen.update(React.createElement(StartupReadySignal, { onReady })); });
  profileError = 'Profile unavailable';
  await act(async () => { screen.update(React.createElement(StartupReadySignal, { onReady })); });
  assert.equal(frames.size, 1, 'retry UI releases the cover even if the initial route cannot resolve');
  await act(async () => { screen.unmount(); });
  assert.equal(frames.size, 0, 'unmount cancels the queued handoff');

  let auth: any = { user: { id: 'a' }, loading: true, error: null };
  let tokenReads = 0; let permissionReads = 0; let handlerCalls = 0; let writes = 0;
  let failTokens = 0; let failWrites = 0;
  let token = deferred<{ data: string }>();
  const { default: Services } = compile('components/DeferredStartupServices.tsx', {
    react: React, 'react-native': { Platform: { OS: 'ios' } }, './auth-context': { useAuth: () => auth },
    '../lib/supabase': { supabase: { from: () => ({ update: () => ({ eq: async () => { writes++; return { error: failWrites-- > 0 ? new Error('synthetic profile failure') : null }; } }) }) } },
    'expo-device': { isDevice: true }, 'expo-notifications': {
      setNotificationHandler: () => { handlerCalls++; }, getPermissionsAsync: async () => { permissionReads++; return { status: 'granted' }; },
      getExpoPushTokenAsync: () => { tokenReads++; return failTokens-- > 0 ? Promise.reject(new Error('synthetic token failure')) : token.promise; },
    },
  }, timerGlobals);
  let services!: ReactTestRenderer;
  await act(async () => { services = create(React.createElement(Services)); });
  assert.equal(timers.size, 0, 'restored but unverified session cannot start registration');
  assert.equal(handlerCalls, 0, 'notification SDK is lazy until verified deferred work runs');
  auth = { user: { id: 'a' }, loading: false, error: null };
  await act(async () => { services.update(React.createElement(Services)); });
  assert.equal(timers.size, 1);
  // Repeated auth notifications for the same account must not register twice.
  auth = { ...auth, user: { id: 'a' } };
  await act(async () => { services.update(React.createElement(Services)); });
  assert.equal(timers.size, 1);
  await act(async () => { for (const callback of timers.values()) callback(); timers.clear(); await tick(); });
  assert.equal(tokenReads, 1); assert.equal(permissionReads, 1); assert.equal(handlerCalls, 1);
  auth = { user: { id: 'b' }, loading: false, error: null };
  await act(async () => { services.update(React.createElement(Services)); });
  await act(async () => { token.resolve({ data: 'synthetic-token' }); await tick(); });
  assert.equal(writes, 0, 'late token for old account cannot be persisted after switching');
  token = deferred<{ data: string }>();
  await act(async () => { for (const callback of timers.values()) callback(); timers.clear(); await tick(); });
  await act(async () => { token.resolve({ data: 'synthetic-token-b' }); await tick(); });
  assert.equal(writes, 1, 'current account retains notification registration');
  auth = { user: { id: 'c' }, loading: false, error: null };
  await act(async () => { services.update(React.createElement(Services)); });
  assert.equal(timers.size, 1);
  await act(async () => { services.unmount(); });
  assert.equal(timers.size, 0, 'unmount cancels deferred registration');

  const fireTimers = async () => { await act(async () => {
    const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); await tick();
  }); };
  const attemptsBeforeRetry = tokenReads;
  failTokens = 1; failWrites = 1;
  token = deferred<{ data: string }>(); token.resolve({ data: 'synthetic-retry' });
  await act(async () => { services = create(React.createElement(Services)); });
  await fireTimers();
  assert.equal(timers.size, 1, 'a temporary token failure schedules a retry');
  await fireTimers();
  assert.equal(timers.size, 1, 'returned profile-write error also schedules a retry');
  await fireTimers();
  assert.equal(tokenReads - attemptsBeforeRetry, 3);
  assert.equal(timers.size, 0, 'success ends the bounded retry sequence');
  await act(async () => { services.unmount(); });
  failTokens = 10;
  const attemptsBeforeExhaustion = tokenReads;
  await act(async () => { services = create(React.createElement(Services)); });
  await fireTimers(); await fireTimers(); await fireTimers();
  assert.equal(tokenReads - attemptsBeforeExhaustion, 3, 'persistent failure is capped at three attempts');
  assert.equal(timers.size, 0);
  await act(async () => { services.unmount(); });

  await act(async () => { services = create(React.createElement(Services)); });
  await fireTimers();
  assert.equal(timers.size, 1);
  auth = { user: null, loading: false, error: null };
  await act(async () => { services.update(React.createElement(Services)); });
  assert.equal(timers.size, 0, 'logout cancels a pending retry');
  await act(async () => { services.unmount(); });

  // The real auth provider must not launch notifications in either restore path.
  const userResponse = deferred<any>(); let listener!: (event: string, session: any) => void; let latestAuth: any;
  const authModule = compile('components/auth-context.tsx', {
    '../lib/performance': performance,
    react: React, '@react-native-async-storage/async-storage': { getAllKeys: async () => [], multiRemove: async () => {} },
    '../lib/startup': { withStartupTimeout: (promise: unknown) => promise },
    '../lib/supabase': { supabase: { auth: {
      getUser: () => userResponse.promise,
      onAuthStateChange: (callback: typeof listener) => { listener = callback; return { data: { listener: null, subscription: { unsubscribe() {} } } }; },
    } } },
  });
  function Consumer() { latestAuth = authModule.useAuth(); return null; }
  let provider!: ReactTestRenderer;
  await act(async () => { provider = create(React.createElement(authModule.AuthProvider, null, React.createElement(Consumer))); });
  await act(async () => { listener('INITIAL_SESSION', { user: { id: 'a' } }); });
  assert.equal(latestAuth.loading, true, 'local restore does not bypass server verification');
  await act(async () => { userResponse.resolve({ data: { user: { id: 'a' } }, error: null }); await tick(); });
  assert.equal(latestAuth.loading, false);
  const oldAccountTrace = performance.beginRetrieval('binder', 'tap');
  await act(async () => { listener('TOKEN_REFRESHED', { user: { id: 'a' } }); });
  assert.equal(performance.exportRetrievalObservations().observations.length, 1, 'same-account token refresh preserves its measurement block');
  await act(async () => { listener('SIGNED_IN', { user: { id: 'b' } }); });
  assert.equal(performance.exportRetrievalObservations().observations.length, 0, 'account switch clears prior journey counts and timings');
  const currentAccountTrace = performance.beginRetrieval('binder', 'tap');
  oldAccountTrace.facts(99, 'network', true); oldAccountTrace.settle();
  assert.equal(oldAccountTrace.pending(), false);
  assert.equal(performance.exportRetrievalObservations().observations[0].cards, 0);
  await act(async () => { listener('SIGNED_OUT', null); });
  assert.equal(performance.exportRetrievalObservations().observations.length, 0);
  assert.equal(currentAccountTrace.pending(), false, 'sign-out invalidates already issued diagnostic handles');
  await act(async () => { provider.unmount(); });
  console.log('Startup phases passed: route/layout handoff, recovery, cancellation, deferred SDK, deduplication and account-safe push registration.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
