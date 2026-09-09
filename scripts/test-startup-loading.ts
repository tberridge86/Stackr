import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  FONT_LOAD_TIMEOUT_MS,
  STARTUP_REQUEST_TIMEOUT_MS,
  resolveStartupDestination,
  withStartupTimeout,
} from '../lib/startup';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

assert.equal(STARTUP_REQUEST_TIMEOUT_MS, 10_000, 'Startup requests must have a firm ten-second limit.');
assert.equal(FONT_LOAD_TIMEOUT_MS, 5_000, 'Bundled font loading must not hold the native splash indefinitely.');

assert.equal(resolveStartupDestination({
  authLoading: true,
  authError: null,
  user: null,
  profileLoading: false,
  profileError: null,
  collectorName: null,
}), null, 'Navigation waits while authentication is unresolved.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: 'Loading is taking longer than expected. Please try again.',
  user: null,
  profileLoading: false,
  profileError: null,
  collectorName: null,
}), null, 'An authentication failure must remain recoverable rather than routing as signed out.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: null,
  user: null,
  profileLoading: false,
  profileError: null,
  collectorName: null,
}), '/(auth)/login', 'A settled unauthenticated start opens sign-in.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: null,
  user: { id: 'collector-a' },
  profileLoading: true,
  profileError: null,
  collectorName: null,
}), null, 'Navigation waits while the signed-in profile is unresolved.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: null,
  user: { id: 'collector-a' },
  profileLoading: false,
  profileError: 'Loading is taking longer than expected. Please try again.',
  collectorName: null,
}), null, 'A profile failure must not send an existing collector through setup.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: null,
  user: { id: 'new-collector' },
  profileLoading: false,
  profileError: null,
  collectorName: null,
}), '/profile/setup', 'Only a successful zero-row profile result starts setup.');

assert.equal(resolveStartupDestination({
  authLoading: false,
  authError: null,
  user: { id: 'collector-a' },
  profileLoading: false,
  profileError: null,
  collectorName: 'Avery',
}), '/(tabs)', 'A loaded collector profile enters the app.');

async function runTimeoutChecks() {
  assert.equal(
    await withStartupTimeout(Promise.resolve('ready'), 50),
    'ready',
    'A settled startup request must retain its value.',
  );

  const pending = deferred<string>();
  await assert.rejects(
    withStartupTimeout(pending.promise, 15),
    { message: 'Loading is taking longer than expected. Please try again.' },
    'A startup request that never returns must reject with the recovery message.',
  );
  pending.resolve('late success');
  await pending.promise;

  const lateFailure = deferred<string>();
  await assert.rejects(
    withStartupTimeout(lateFailure.promise, 15),
    { message: 'Loading is taking longer than expected. Please try again.' },
    'The timeout must win when a request remains pending.',
  );
  lateFailure.reject(new Error('late network failure'));
  await lateFailure.promise.catch(() => undefined);

  const failing = Promise.reject(new Error('network unavailable'));
  await assert.rejects(
    withStartupTimeout(failing, 50),
    { message: 'network unavailable' },
    'A real request failure must remain distinguishable from a timeout.',
  );
}

type StartupRenderState = {
  auth: {
    user: unknown | null;
    loading: boolean;
    error: string | null;
    refreshAuth: () => Promise<void>;
  };
  profile: {
    profile: { collector_name: string | null } | null;
    loading: boolean;
    error: string | null;
    refreshProfile: () => Promise<void>;
  };
};

type RenderNode = {
  type: unknown;
  props: Record<string, unknown> & { children?: RenderNode[] };
};

const startupIndexSource = readFileSync('app/index.tsx', 'utf8');
const startupIndexModule: Record<string, unknown> = {};
let renderState: StartupRenderState;
let routedTo: string[] = [];

const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: RenderNode[]) => ({
  type,
  props: { ...(props ?? {}), children },
});

const compiledStartupIndex = ts.transpileModule(startupIndexSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
  },
}).outputText;

vm.runInNewContext(compiledStartupIndex, {
  exports: startupIndexModule,
  React: { createElement },
  require: (name: string) => ({
    react: {
      useEffect: (effect: () => void) => { effect(); },
      useRef: <T,>(value: T) => ({ current: value }),
    },
    'expo-router': { useRouter: () => ({ replace: (route: string) => routedTo.push(route) }) },
    'react-native': { TouchableOpacity: 'TouchableOpacity', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/auth-context': { useAuth: () => renderState.auth },
    '../components/profile-context': { useProfile: () => renderState.profile },
    '../components/StackrLoadingScreen': { StackrLoadingScreen: 'StackrLoadingScreen' },
    '../components/Text': { Text: 'Text' },
    '../components/theme-context': { useTheme: () => ({ theme: { colors: { bg: '#F6F5F8', primary: '#6938F5' } } }) },
    '../lib/startup': { resolveStartupDestination },
  })[name] ?? {},
  console,
});

const Index = startupIndexModule.default as () => RenderNode;

function findNode(node: unknown, type: unknown): RenderNode | null {
  if (!node || typeof node !== 'object' || !('props' in node) || !('type' in node)) return null;
  const renderNode = node as RenderNode;
  if (renderNode.type === type) return renderNode;
  for (const child of renderNode.props.children ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return null;
}

function renderStartup(state: StartupRenderState) {
  renderState = state;
  routedTo = [];
  return Index();
}

let authRetries = 0;
let profileRetries = 0;
const noAuthError = async () => { authRetries += 1; };
const noProfileError = async () => { profileRetries += 1; };

const waitingTree = renderStartup({
  auth: { user: null, loading: true, error: null, refreshAuth: noAuthError },
  profile: { profile: null, loading: true, error: null, refreshProfile: noProfileError },
});
const waitingScreen = findNode(waitingTree, 'StackrLoadingScreen');
assert.ok(waitingScreen, 'The real initial route must mount the animated loading screen.');
assert.equal(waitingScreen.props.busy, true);
assert.deepEqual(routedTo, [], 'Unresolved authentication must retain the loading view.');

renderStartup({
  auth: { user: { id: 'collector-a' }, loading: false, error: null, refreshAuth: noAuthError },
  profile: { profile: { collector_name: 'Avery' }, loading: false, error: null, refreshProfile: noProfileError },
});
assert.deepEqual(routedTo, ['/(tabs)'], 'A ready collector must route immediately without an artificial splash delay.');

renderStartup({
  auth: { user: { id: 'collector-a' }, loading: false, error: null, refreshAuth: noAuthError },
  profile: { profile: null, loading: false, error: null, refreshProfile: noProfileError },
});
assert.deepEqual(routedTo, ['/profile/setup'], 'A verified empty profile must still reach setup.');

renderStartup({
  auth: { user: null, loading: false, error: null, refreshAuth: noAuthError },
  profile: { profile: null, loading: false, error: null, refreshProfile: noProfileError },
});
assert.deepEqual(routedTo, ['/(auth)/login'], 'A settled signed-out session must reach sign-in.');

const profileFailureTree = renderStartup({
  auth: { user: { id: 'collector-a' }, loading: false, error: null, refreshAuth: noAuthError },
  profile: { profile: null, loading: false, error: 'Profile could not load', refreshProfile: noProfileError },
});
assert.deepEqual(routedTo, [], 'A profile failure must not route the collector to setup.');
assert.equal(findNode(profileFailureTree, 'StackrLoadingScreen')?.props.busy, false, 'Recovery must stop the busy animation.');
const profileRetry = findNode(profileFailureTree, 'TouchableOpacity');
assert.ok(profileRetry, 'A profile failure must render a retry control.');
const profileRetryAction = profileRetry.props.onPress as (() => void) | undefined;
profileRetryAction?.();
assert.equal(profileRetries, 1, 'The mounted retry control must retry the profile request.');
assert.equal(authRetries, 0, 'A profile failure must not restart authentication.');

const authFailureTree = renderStartup({
  auth: { user: null, loading: false, error: 'Account could not load', refreshAuth: noAuthError },
  profile: { profile: null, loading: false, error: null, refreshProfile: noProfileError },
});
assert.deepEqual(routedTo, [], 'An authentication failure must remain on the recovery screen.');
const authRetry = findNode(authFailureTree, 'TouchableOpacity');
assert.ok(authRetry, 'An authentication failure must render a retry control.');
const authRetryAction = authRetry.props.onPress as (() => void) | undefined;
authRetryAction?.();
assert.equal(authRetries, 1, 'The mounted retry control must retry authentication.');
assert.equal(profileRetries, 1, 'An authentication failure must not reload the profile first.');

void runTimeoutChecks()
  .then(() => {
    console.log('Startup routing and bounded-loading checks passed.');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
