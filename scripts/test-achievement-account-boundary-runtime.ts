import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> { let resolve!: (value: T) => void; return { promise: new Promise(done => { resolve = done; }), resolve }; }
function compile(file: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module, exports: module.exports, React, console, Date, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected runtime import: ${name}`); return dependencies[name];
  } });
  return module.exports;
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function settle() { await act(async () => { for (let index = 0; index < 12; index += 1) await tick(); }); }
const unlock = (id: string, coins = 0) => ({ id, title: id, accolade: id, tier: 'bronze', icon: 'star', coinReward: coins, unlockedAt: '2026-10-12T00:00:00Z' });

async function main() {
  let account = 'account-a';
  let authEpoch = 1;
  const pending = new Map<string, { unlocks: Deferred<any[]>; coins: Deferred<number>; coinsClaimed: boolean }[]>();
  const unlockRead = (id: string) => {
    const next = { unlocks: deferred<any[]>(), coins: deferred<number>(), coinsClaimed: false };
    const reads = pending.get(id) ?? []; reads.push(next); pending.set(id, reads); return next.unlocks.promise;
  };
  const coinRead = (id: string) => {
    const next = (pending.get(id) ?? []).find(read => !read.coinsClaimed);
    assert.ok(next, `Coin read without matching unlock read for ${id}`); next.coinsClaimed = true; return next.coins.promise;
  };
  const readsFor = (id: string, index = -1) => (pending.get(id) ?? []).at(index)!;
  let notifier: ((userId: string, values: any[]) => void) | null = null;
  let pendingServiceAuth: Deferred<any> | null = null;
  const achievementService = compile('lib/achievements.ts', {
    './supabase': { supabase: {
      auth: { getUser: async () => {
        const pendingAuth = pendingServiceAuth;
        if (pendingAuth) { pendingServiceAuth = null; return pendingAuth.promise; }
        return { data: { user: account ? { id: account } : null }, error: null };
      } },
      from: () => {
        const query: any = {
          select: () => query,
          eq: () => query,
          in: () => query,
          order: () => query,
          insert: (rows: { achievement_id: string }[]) => ({ select: async () => ({ data: rows.map(row => ({ achievement_id: row.achievement_id, unlocked_at: '2026-10-12T00:00:00Z' })), error: null }) }),
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject),
        };
        return query;
      },
    } },
  });
  const AnimatedValue = class { interpolate() { return 0; } };
  const achievementContext = compile('components/achievement-context.tsx', {
    react: React,
    'react-native': { Animated: { View: 'AnimatedView', Value: AnimatedValue, sequence: () => ({ start() {} }), parallel: () => ({ start() {} }), spring: () => ({}), timing: () => ({}), loop: () => ({}), delay: () => ({}) }, Easing: { out: () => 0, back: () => 0, cubic: 0, in: () => 0 }, View: 'View' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './Text': { Text: 'Text' },
    './theme-context': { useTheme: () => ({ theme: { colors: { primary: '#000', card: '#fff', border: '#ddd', text: '#000', textSoft: '#555' } } }) },
    './auth-context': { useAuth: () => ({
      user: account ? { id: account } : null,
      cachedReadSession: account ? { userId: account, expiresAt: Math.floor(Date.now() / 1000) + 3600, epoch: authEpoch } : null,
    }) },
    '../lib/achievements': {
      ...achievementService,
      fetchUserAchievementUnlocks: unlockRead,
      fetchUserCoinBalance: coinRead,
      setAchievementUnlockNotifier: (callback: typeof notifier) => {
        notifier = callback;
        achievementService.setAchievementUnlockNotifier(callback);
      },
    },
  });
  const { AchievementProvider, useAchievements } = achievementContext;
  let observed: any;
  function Consumer() { observed = useAchievements(); return null; }
  const tree = () => React.createElement(AchievementProvider, null, React.createElement(Consumer));
  let root!: ReactTestRenderer;
  await act(async () => { root = create(tree()); });
  const firstA = readsFor('account-a');

  account = 'account-b';
  authEpoch += 1;
  await act(async () => { root.update(tree()); });
  const b = readsFor('account-b'); b.unlocks.resolve([unlock('b-unlock')]); b.coins.resolve(22); await settle();
  assert.equal(observed.coinBalance, 22); assert.equal(observed.unlocks[0]?.id, 'b-unlock');
  firstA.unlocks.resolve([unlock('a1-unlock')]); firstA.coins.resolve(11); await settle();
  assert.equal(observed.coinBalance, 22, 'late A1 reads cannot replace B'); assert.equal(observed.unlocks[0]?.id, 'b-unlock');

  account = 'account-a';
  authEpoch += 1;
  await act(async () => { root.update(tree()); });
  assert.equal(observed.coinBalance, 0, 'the previous account is masked before A2 loads'); assert.equal(observed.unlocks.length, 0);
  const a2 = readsFor('account-a');
  // Account A is revisited: a new provider generation must not reuse its completed A1 result.
  assert.notEqual(a2, firstA, 'same identity ABA starts new reads');
  a2.unlocks.resolve([unlock('a2-unlock')]); a2.coins.resolve(33); await settle();
  assert.equal(observed.coinBalance, 33); assert.equal(observed.unlocks[0]?.id, 'a2-unlock');

  const oldNotifier = notifier!;
  account = 'account-b';
  authEpoch += 1;
  await act(async () => { root.update(tree()); });
  await act(async () => { notifier!('account-b', [unlock('current-b-before-refresh', 5)]); }); await settle();
  assert.equal(observed.coinBalance, 5, 'a current B notification before B refresh cannot inherit hidden A coins');
  assert.deepEqual(JSON.parse(JSON.stringify(observed.unlocks.map((value: any) => value.id))), ['current-b-before-refresh'],
    'a current B notification before B refresh cannot inherit hidden A unlocks');
  const b2 = readsFor('account-b'); b2.unlocks.resolve([unlock('b2-unlock')]); b2.coins.resolve(44); await settle();
  await act(async () => { oldNotifier('account-a', [unlock('stale-a-notification', 99)]); }); await settle();
  assert.equal(observed.coinBalance, 44, 'an old service emission for A cannot add coins to B');
  assert.equal(observed.unlocks[0]?.id, 'b2-unlock', 'an old service emission for A cannot add an unlock to B');
  await act(async () => { notifier!('account-b', [unlock('current-b-notification', 5)]); }); await settle();
  assert.equal(observed.coinBalance, 49, 'the current account notifier still works');
  await act(async () => { await achievementService.checkAchievements({ masterSetEnabled: true }); }); await settle();
  assert.ok(observed.unlocks.some((value: any) => value.id === 'master_mode'), 'the actual service emits the unlock with the checked account provenance');

  account = '';
  authEpoch += 1;
  await act(async () => { root.update(tree()); });
  assert.equal(observed.coinBalance, 0); assert.equal(observed.unlocks.length, 0, 'sign-out masks achievements immediately');
  await act(async () => { root.unmount(); });
  (notifier as ((userId: string, values: any[]) => void) | null)?.('account-b', [unlock('after-unmount', 100)]); await settle();

  // The service must keep the provider lease from request start, rather than
  // looking up the current global notifier when a delayed check completes.
  account = 'account-a';
  authEpoch += 1;
  await act(async () => { root = create(tree()); });
  const serviceA1 = readsFor('account-a'); serviceA1.unlocks.resolve([unlock('service-a1')]); serviceA1.coins.resolve(31); await settle();
  const delayedA1Auth = deferred<any>();
  pendingServiceAuth = delayedA1Auth;
  const delayedA1 = achievementService.checkAchievements({ masterSetEnabled: true });
  await act(async () => {
    account = 'account-b'; authEpoch += 1; root.update(tree());
    account = 'account-a'; authEpoch += 1; root.update(tree());
  });
  const serviceA2 = readsFor('account-a'); serviceA2.unlocks.resolve([unlock('service-a2')]); serviceA2.coins.resolve(53); await settle();
  delayedA1Auth.resolve({ data: { user: { id: 'account-a' } }, error: null });
  await delayedA1; await settle();
  assert.equal(observed.coinBalance, 53, 'a delayed service A1 completion cannot add coins after B→A2');
  assert.equal(observed.unlocks.some((value: any) => value.id === 'master_mode'), false, 'a delayed service A1 completion cannot toast into A2');

  const delayedBAuth = deferred<any>();
  pendingServiceAuth = delayedBAuth;
  const delayedWithNewIdentity = achievementService.checkAchievements({ masterSetEnabled: true });
  account = 'account-b';
  authEpoch += 1;
  await act(async () => { root.update(tree()); });
  const serviceB2 = readsFor('account-b'); serviceB2.unlocks.resolve([unlock('service-b2')]); serviceB2.coins.resolve(64); await settle();
  delayedBAuth.resolve({ data: { user: { id: 'account-b' } }, error: null });
  await delayedWithNewIdentity; await settle();
  assert.equal(observed.coinBalance, 64, 'a delayed service lookup resolving as B cannot use the old A notifier');
  assert.equal(observed.unlocks.some((value: any) => value.id === 'master_mode'), false);
  await act(async () => { await achievementService.checkAchievements({ masterSetEnabled: true }); }); await settle();
  assert.ok(observed.unlocks.some((value: any) => value.id === 'master_mode'), 'a current B service check still notifies B');
  await act(async () => { root.unmount(); });
  console.log('Achievement account-boundary runtime passed: slow reads, A/B/ABA, notifier provenance, sign-out and unmount.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
