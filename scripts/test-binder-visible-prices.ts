import assert from 'node:assert/strict';
import { createVisibleBinderPriceReader } from '../lib/binderVisiblePrices';

type Row = { id: string };
const rows: Row[] = Array.from({ length: 80 }, (_, index) => ({ id: `row-${index + 1}` }));
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function clock() {
  let now = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let next = 0;
  return {
    now: () => now,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++next;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: unknown) => { timers.delete(Number(id)); },
    advance: (milliseconds: number) => { now += milliseconds; },
    runOne: () => {
      const [id, timer] = [...timers.entries()][0] ?? [];
      if (id != null && timer) { timers.delete(id); timer.callback(); }
    },
    delays: () => [...timers.values()].map((timer) => timer.delay),
  };
}

async function main() {
  const activeClock = clock();
  const calls: string[][] = [];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const reader = createVisibleBinderPriceReader(rows, {
    ...activeClock,
    loader: async (batch) => { calls.push(batch.map((row) => row.id)); if (calls.length === 1) await wait; },
  });
  reader.request(rows.slice(0, 20).map((row) => row.id));
  await tick();
  reader.request(rows.slice(0, 20).map((row) => row.id));
  assert.equal(calls.length, 1, 'repeated viewability does not duplicate an active batch');
  release();
  await tick(); await tick();
  reader.request(rows.slice(0, 20).map((row) => row.id));
  await tick();
  assert.equal(calls.flat().length, 20, 'completed visible rows are never repriced by repeated callbacks');
  reader.dispose();

  const retryClock = clock();
  const retryCalls: string[][] = [];
  const retry = createVisibleBinderPriceReader(rows, {
    ...retryClock,
    loader: async (batch) => {
      retryCalls.push(batch.map((row) => row.id));
      return { failure: { status: 503 } };
    },
  });
  retry.request(['row-1']);
  await tick();
  assert.deepEqual(retryClock.delays(), [30_000]);
  retry.request(['row-1', 'row-2']);
  await tick();
  assert.equal(retryCalls.length, 1, 'a new viewport cannot bypass a service cooldown');
  retryClock.advance(30_000); retryClock.runOne();
  await tick(); await tick();
  assert.deepEqual(retryCalls[1], ['row-1', 'row-2'], 'the visible failed row retries once after its absolute cooldown');
  retry.dispose();

  const awayClock = clock();
  const awayCalls: string[][] = [];
  const away = createVisibleBinderPriceReader(rows, {
    ...awayClock,
    loader: async (batch) => { awayCalls.push(batch.map((row) => row.id)); return { failure: { status: 429 } }; },
  });
  away.request(['row-1']); await tick();
  away.request(['row-2']);
  awayClock.advance(60_000); awayClock.runOne();
  await tick(); await tick();
  assert.deepEqual(awayCalls, [['row-1'], ['row-2']], 'a row that left the viewport is dropped instead of retried');
  away.dispose();

  const authClock = clock();
  let authCalls = 0;
  const auth = createVisibleBinderPriceReader(rows, {
    ...authClock,
    loader: async () => { authCalls += 1; return { failure: { status: 403 } }; },
  });
  auth.request(['row-1', 'row-2']); await tick(); await tick();
  auth.request(['row-3']); await tick();
  assert.equal(authCalls, 1, 'access denial terminally stops queued and future reads');
  auth.resumeAfterAuthentication(); await tick();
  assert.equal(authCalls, 1, 'token refresh must not bypass a 403 permission denial');
  auth.dispose();

  const renewedClock = clock();
  const renewedCalls: string[][] = [];
  const renewed = createVisibleBinderPriceReader(rows, {
    ...renewedClock,
    loader: async batch => {
      renewedCalls.push(batch.map(row => row.id));
      if (renewedCalls.length === 1) return { failure: { status: 401 } };
    },
  });
  renewed.request(['row-1']); await tick();
  renewed.request(['row-2']);
  renewed.resumeAfterAuthentication(); await tick();
  assert.deepEqual(renewedCalls, [['row-1'], ['row-2']], 'fresh credentials resume only currently visible rows');
  renewed.resumeAfterAuthentication(); await tick();
  assert.equal(renewedCalls.length, 2, 'refresh events do not duplicate completed reads');
  renewed.dispose();

  const offlineClock = clock();
  let offlineCalls = 0;
  const offline = createVisibleBinderPriceReader(rows, {
    ...offlineClock,
    loader: async () => { offlineCalls += 1; throw new Error('Network disconnected'); },
  });
  offline.request(['row-1']); await tick();
  assert.deepEqual(offlineClock.delays(), [30_000], 'network interruption is retryable, not a completed no-price result');
  offlineClock.advance(30_000); offlineClock.runOne(); await tick();
  offlineClock.advance(30_000); offlineClock.runOne(); await tick();
  assert.equal(offlineCalls, 2, 'network retries remain bounded to one');
  offline.dispose();

  const budgetClock = clock();
  const budgetCalls: string[][] = [];
  const budget = createVisibleBinderPriceReader(rows, {
    ...budgetClock,
    loader: async (batch) => { budgetCalls.push(batch.map((row) => row.id)); },
  });
  budget.request(rows.map((row) => row.id));
  for (let index = 0; index < 12; index += 1) await tick();
  assert.equal(budgetCalls.flat().length, 60, 'visible loads stay below the 60 requests/minute budget');
  assert.ok(budgetClock.delays().some((delay) => delay >= 60_000), 'budget exhaustion schedules a cooldown');
  budget.dispose();
  console.log('Visible binder price reads are deduplicated, viewport-bounded, and cooldown-safe.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
