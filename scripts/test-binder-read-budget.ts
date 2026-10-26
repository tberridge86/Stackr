import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cache from '../lib/requestCache';

const accountCacheSource = ts.transpileModule(fs.readFileSync('lib/binderAccountCache.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const source = ts.transpileModule(fs.readFileSync('lib/binders.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deadlineSource = ts.transpileModule(fs.readFileSync('lib/personalDataRead.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const row = (id: string, binderId = 'binder') => ({ id, binder_id: binderId, card_id: `card-${id}`,
  set_id: 'set', language: 'en', owned: true, owned_quantity: 4, condition: 'Mint', notes: `note-${id}`, slot_order: 1 });
type Page = { data: ReturnType<typeof row>[] | null; error: Error | null };
function harness(load: (from: number, signal?: AbortSignal) => Promise<Page>, initialSignout = false) {
  cache.invalidateRequestCache();
  const calls: { from: number; signal?: AbortSignal; deadlineCount: number }[] = [];
  const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const deadlines = new Map<number, () => void>();
  let deadlineCount = 0;
  let accountId: string | null = 'owner';
  let signoutTriggered = false;
  const deadlineExports = {};
  // Execute the actual deadline module with a deterministic clock, including
  // its abort/settlement logic, rather than timing the test runner's workload.
  vm.runInNewContext(deadlineSource, { exports: deadlineExports, AbortController,
    setTimeout: (callback: () => void, ms: number) => {
      assert.equal(ms, 10_000); const id = ++deadlineCount; deadlines.set(id, callback); return id;
    }, clearTimeout: (id: number) => deadlines.delete(id) });
  const supabase = {
    auth: { getSession: async () => {
      const session = accountId ? { user: { id: accountId }, access_token: 'fixture-' + accountId } : null;
      if (initialSignout && !signoutTriggered) {
        signoutTriggered = true;
        accountId = null;
        for (const listener of [...listeners]) listener('SIGNED_OUT', null);
      }
      return { data: { session }, error: null };
    },
      onAuthStateChange(callback: (event: string, session: { user: { id: string } } | null) => void) {
      listeners.add(callback);
      queueMicrotask(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', accountId ? { user: { id: accountId } } : null); });
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    } },
    from(table: string) {
      let from = 0; let signal: AbortSignal | undefined;
      const query = {
        select: () => query, eq: () => query, order: () => query,
        range: (start: number, end: number) => { assert.equal(end - start, 49); from = start; return query; },
        abortSignal: (value: AbortSignal) => { signal = value; return query; },
        maybeSingle: async () => ({ data: { id: 'binder', user_id: 'owner', type: 'custom', language: 'en' }, error: null }),
        then(resolve: (page: Page) => unknown, reject: (error: unknown) => unknown) {
          assert.equal(table, 'binder_cards'); calls.push({ from, signal, deadlineCount }); return load(from, signal).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase }, './requestCache': cache,
    './personalDataRead': deadlineExports,
    './pokemonTcg': { normalizePokemonCardLanguage: () => 'en' },
  };
  // Execute the production account/session wrapper; this fixture keeps its
  // collection revision fixed because these tests exercise retrieval, not edits.
  dependencies['./collectionSummaryInvalidation'] = { getCollectionSummaryVersion: () => 0 };
  const accountCacheExports = {};
  vm.runInNewContext(accountCacheSource, { exports: accountCacheExports,
    require: (name: string) => dependencies[name] ?? {}, AbortController, console });
  dependencies['./binderAccountCache'] = accountCacheExports;
  const exports: Record<string, any> = {};
  vm.runInNewContext(source, { exports, require: (name: string) => dependencies[name] ?? {}, console,
    AbortController, setTimeout, clearTimeout });
  return { calls, listeners, get deadlineCount() { return deadlineCount; }, get activeDeadlines() { return deadlines.size; }, expire: () => { for (const callback of [...deadlines.values()]) callback(); },
    read: () => exports.fetchBinderCards('binder', { includePrices: false, includeAssets: false }) as Promise<any[]>,
    auth: (id: string | null, event = id ? 'SIGNED_IN' : 'SIGNED_OUT') => {
      accountId = id;
      for (const listener of [...listeners]) listener(event, id ? { user: { id } } : null);
    } };
}

let failures = 0;
async function test(name: string, work: () => Promise<void>) {
  try { await work(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}:`, error); }
}

async function main() {
await test('short server pages continue to empty and preserve quantities and stable slot ordering', async () => {
  const h = harness(async (from) => ({ data: [row('a'), row('b'), row('c')].slice(from, from + 1), error: null }));
  const rows = await h.read();
  assert.deepEqual(Array.from(rows, (item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(h.calls.map((call) => call.from), [0, 1, 2, 3]);
  assert(rows.every((item) => item.owned_quantity === 4 && item.condition === 'Mint' && item.notes === `note-${item.id}`));
  assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

await test('all 137 saved cards are retained across 50-row responses', async () => {
  const expected = Array.from({ length: 137 }, (_, index) => row(String(index)));
  const h = harness(async (from) => ({ data: expected.slice(from, from + 50), error: null }));
  const rows = await h.read();
  assert.deepEqual(Array.from(rows, (item) => item.id), expected.map((item) => item.id));
  assert.deepEqual(h.calls.map((call) => call.from), [0, 50, 100, 137]);
});

await test('one operation deadline aborts a stalled body, releases coalesced callers and permits retry', async () => {
  let release!: (page: Page) => void; let retry = false;
  const h = harness(async (from) => retry ? ({ data: from ? [] : [row('fresh')], error: null })
    : new Promise<Page>((resolve) => { release = resolve; }));
  const first = h.read(); const joined = h.read();
  const observed: { outcome: PromiseSettledResult<any[]>[] | null } = { outcome: null };
  void Promise.allSettled([first, joined]).then((result) => { observed.outcome = result; });
  await tick(); h.expire(); await tick();
  const outcome = observed.outcome;
  assert(outcome, 'shared service must settle without a screen timeout');
  assert(outcome.every((item) => item.status === 'rejected' && item.reason.name === 'PersonalDataReadTimeoutError'));
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].signal?.aborted, true);
  retry = true; release({ data: [row('late')], error: null }); await tick();
  assert.equal(h.calls.length, 1, 'late abandoned page must not dispatch another page');
  assert.equal((await h.read())[0].id, 'fresh'); assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

await test('deadline covers multiple individually fast pages instead of restarting per page', async () => {
  let release!: (page: Page) => void;
  const h = harness(async (from) => from < 2 ? { data: [row(String(from))], error: null }
    : new Promise<Page>((resolve) => { release = resolve; }));
  const pending = h.read();
  void pending.catch(() => undefined);
  await tick();
  assert.equal(h.calls.length, 3); assert.equal(new Set(h.calls.map(call => call.deadlineCount)).size, 1, 'later pages must not restart any operation deadline');
  assert.equal(h.activeDeadlines, 2, 'settled session timers are removed and paging does not add per-page deadlines');
  h.expire(); await assert.rejects(pending, { name: 'PersonalDataReadTimeoutError' });
  release({ data: [row('late')], error: null }); await tick(); assert.equal(h.calls.length, 3);
});

await test('account change cancels shared work before another page and rejects late old-account rows', async () => {
  let release!: (page: Page) => void;
  const h = harness(async () => new Promise<Page>((resolve) => { release = resolve; }));
  const pending = h.read(); await tick(); h.auth('other');
  release({ data: [row('old')], error: null });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].signal?.aborted, true); assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

await test('same-account token refresh does not cancel useful shared work', async () => {
  let release!: (page: Page) => void;
  const h = harness(async (from) => from ? { data: [], error: null } : new Promise<Page>((resolve) => { release = resolve; }));
  const pending = h.read(); await tick(); h.auth('owner', 'TOKEN_REFRESHED');
  release({ data: [row('same')], error: null }); assert.equal((await pending)[0].id, 'same');
});

await test('sign-out rejects a stalled read immediately without waiting for its transport', async () => {
  const h = harness(async () => new Promise<Page>(() => {}));
  const observed: { error?: { name?: string } } = {};
  void h.read().catch((error) => { observed.error = error; });
  await tick(); h.auth(null); await tick();
  assert.equal(observed.error?.name, 'AbortError');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].signal?.aborted, true); assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

await test('auth invalidation before pagination starts dispatches no private query', async () => {
  const h = harness(async () => ({ data: [row('never')], error: null }), true);
  await assert.rejects(h.read(), { name: 'AbortError' });
  assert.equal(h.calls.length, 0); assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

for (const problem of ['duplicate', 'foreign', 'error']) await test(`${problem} continuation fails instead of caching a complete prefix`, async () => {
  let repaired = false;
  const h = harness(async (from) => ({
    data: !from ? [row('a')] : repaired ? [] : problem === 'duplicate' ? [row('a')] : problem === 'foreign' ? [row('b', 'foreign')] : null,
    error: !repaired && from && problem === 'error' ? new Error('page denied') : null,
  }));
  await assert.rejects(h.read()); repaired = true;
  assert.equal((await h.read()).length, 1, 'failure is not cached'); assert.equal(h.listeners.size, 1, 'only the shared idle account observer remains');
});

await test('bounded page count rejects an endless distinct response', async () => {
  const h = harness(async (from) => ({ data: [row(String(from))], error: null }));
  await assert.rejects(h.read(), /page|budget/i); assert.equal(h.calls.length, 5120);
});

if (failures) process.exitCode = 1;
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
