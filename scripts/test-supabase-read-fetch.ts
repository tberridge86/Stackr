import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseReadFetch } from '../lib/supabaseReadFetch';
import { PersonalDataReadTimeoutError } from '../lib/personalDataRead';

const origin = 'https://fixture.supabase.co';
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'x-fixture': 'kept' },
});
const timeoutError = (error: unknown) => error instanceof PersonalDataReadTimeoutError;

async function transportBoundaries() {
  let underlyingSignal: AbortSignal | null | undefined;
  const pending = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 15,
    fetchImpl: (async (_input, init) => {
      underlyingSignal = init?.signal;
      return new Promise<Response>(() => {});
    }) as typeof fetch });
  await assert.rejects(pending(`${origin}/auth/v1/user`), timeoutError);
  assert.equal(underlyingSignal?.aborted, true, 'timeout aborts underlying auth HTTP even if it ignores abort');

  let bodySignal: AbortSignal | null | undefined;
  const bodyFetch = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 15,
    fetchImpl: (async (_input, init) => {
      bodySignal = init?.signal;
      const response = json({ ignored: true });
      response.json = () => new Promise(() => {});
      return response;
    }) as typeof fetch });
  const response = await bodyFetch(`${origin}/rest/v1/binders`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-fixture'), 'kept');
  assert.ok(response instanceof Response);
  await assert.rejects(response.json(), timeoutError);
  assert.equal(bodySignal?.aborted, true, 'headers alone do not finish the body deadline');

  const denial = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 100,
    fetchImpl: (async () => json({ code: 'bad_jwt' }, 401)) as typeof fetch });
  const denied = await denial(`${origin}/auth/v1/user`);
  assert.equal(denied.status, 401, 'real denial status survives unchanged');
  assert.deepEqual(await denied.json(), { code: 'bad_jwt' });

  const success = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 15,
    fetchImpl: (async (_input, init) => { underlyingSignal = init?.signal; return json([{ id: 'row' }]); }) as typeof fetch });
  const successful = await success(`${origin}/rest/v1/binders`);
  const copy = successful.clone();
  assert.deepEqual(await successful.json(), [{ id: 'row' }]);
  assert.equal(await copy.text(), '[{"id":"row"}]');
  await pause(25);
  assert.equal(underlyingSignal?.aborted, false, 'completed bodies release the timer');
}

async function scopeAndSignals() {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const readFetch = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 15,
    fetchImpl: (async (input, init) => { calls.push({ input, init }); return json({ ok: true }); }) as typeof fetch });
  const writes = [
    [`${origin}/rest/v1/binders`, 'POST'],
    [`${origin}/rest/v1/rpc/mutate_collection`, 'POST'],
    [`${origin}/auth/v1/token?grant_type=password`, 'POST'],
    [`${origin}/auth/v1/signup`, 'POST'],
    [`${origin}/auth/v1/logout`, 'POST'],
    [`${origin}/storage/v1/object/cards`, 'GET'],
    ['https://fixture.supabase.co.attacker.example/rest/v1/binders', 'GET'],
    ['https://another.supabase.co/auth/v1/user', 'GET'],
  ];
  for (const [url, method] of writes) {
    const init = { method, headers: { Authorization: 'Bearer fixture-only' } };
    await readFetch(url, init);
    assert.equal(calls.at(-1)?.init, init, 'unrelated origins and write requests pass through with the exact init');
  }

  const controller = new AbortController();
  const request = new Request(`${origin}/rest/v1/binders`, {
    headers: { Authorization: 'Bearer fixture-only' }, signal: controller.signal,
  });
  const result = await readFetch(request, { cache: 'no-store' });
  assert.equal(calls.at(-1)?.input, request, 'the original Request retains its headers and other properties');
  assert.equal(calls.at(-1)?.init?.cache, 'no-store');
  const actualSignal = calls.at(-1)?.init?.signal;
  controller.abort();
  await assert.rejects(result.json(), (error: Error) => error.name === 'AbortError');
  assert.equal(actualSignal?.aborted, true, 'Request.signal cancellation reaches an already returned body');

  const preAborted = new AbortController(); preAborted.abort();
  const oldRequest = new Request(`${origin}/rest/v1/binders`, { signal: preAborted.signal });
  const before = calls.length;
  await assert.rejects(readFetch(oldRequest), (error: Error) => error.name === 'AbortError');
  assert.equal(calls.length, before, 'pre-cancelled reads never dispatch');
  const override = new AbortController();
  assert.deepEqual(await (await readFetch(oldRequest, { signal: override.signal })).json(), { ok: true });
  assert.deepEqual(await (await readFetch(oldRequest, { signal: null })).json(), { ok: true });
  const post = { method: 'POST' };
  await readFetch(oldRequest, post);
  assert.equal(calls.at(-1)?.init, post, 'init method overrides a Request method before scope selection');

  const refresh = createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 15,
    fetchImpl: (async (_input, init) => {
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, '{"refresh_token":"fixture-only"}');
      return new Promise<Response>(() => {});
    }) as typeof fetch });
  await assert.rejects(refresh(`${origin}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', body: '{"refresh_token":"fixture-only"}',
  }), timeoutError);

  const head = await readFetch(`${origin}/rest/v1/binders`, { method: 'HEAD' });
  assert.equal(head.status, 200);
}

async function realSdkAuthLock() {
  const user = { id: 'fixture-owner', aud: 'authenticated', created_at: new Date().toISOString() };
  const session = { access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const makeClient = (fetchImpl: typeof fetch, storageKey: string) => {
    let removed = 0;
    return { client: createClient(origin, 'fixture-public-key', {
      auth: { storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
        storage: { getItem: async () => JSON.stringify(session), setItem: async () => {}, removeItem: async () => { removed += 1; } } },
      global: { fetch: fetchImpl },
    }), removed: () => removed };
  };
  const started = deferred<void>(), release = deferred<Response>();
  const baselineCalls: string[] = [];
  const baseline = makeClient((async (input) => {
    const path = new URL(String(input)).pathname; baselineCalls.push(path);
    if (path === '/auth/v1/user') { started.resolve(); return release.promise; }
    return json([]);
  }) as typeof fetch, 'fixture-baseline');
  await baseline.client.auth.initialize();
  const originalUser = baseline.client.auth.getUser();
  await started.promise;
  let baselineSessionSettled = false;
  const originalSession = baseline.client.auth.getSession().then((value) => { baselineSessionSettled = true; return value; });
  const originalRows = baseline.client.from('binders').select('id');
  const rowsPromise = Promise.resolve(originalRows);
  await pause(20);
  assert.equal(baselineSessionSettled, false);
  assert.deepEqual(baselineCalls, ['/auth/v1/user'], 'a stalled auth read blocks database dispatch inside the real SDK');
  release.resolve(json(user));
  await Promise.all([originalUser, originalSession, rowsPromise]);
  assert.deepEqual(baselineCalls, ['/auth/v1/user', '/rest/v1/binders']);

  const calls: string[] = [];
  let transportSignal: AbortSignal | null | undefined;
  const repaired = makeClient(createSupabaseReadFetch({ supabaseUrl: origin, timeoutMs: 20,
    fetchImpl: (async (input, init) => {
      const path = new URL(String(input)).pathname; calls.push(path);
      if (path === '/auth/v1/user') {
        transportSignal = init?.signal;
        return new Promise<Response>(() => {});
      }
      return json([{ id: 'fixture-binder' }]);
    }) as typeof fetch }), 'fixture-repaired');
  await repaired.client.auth.initialize();
  // Auth-js logs fetch failures itself. Capture only this expected fixture error.
  const originalError = console.error;
  const logged: unknown[] = [];
  console.error = (error: unknown) => { logged.push(error); };
  try {
    const authRead = repaired.client.auth.getUser();
    const localSession = repaired.client.auth.getSession();
    const rows = Promise.resolve(repaired.client.from('binders').select('id'));
    const [authResult, local, database] = await Promise.all([authRead, localSession, rows]);
    assert.equal(authResult.error?.name, 'AuthRetryableFetchError', 'timeout remains a transport failure, not an auth denial');
    assert.equal(authResult.error?.status, 0);
    assert.equal(local.data.session?.user.id, user.id, 'transient timeout retains the signed-in session');
    assert.equal(database.error, null);
    assert.deepEqual(database.data, [{ id: 'fixture-binder' }]);
    assert.deepEqual(calls, ['/auth/v1/user', '/rest/v1/binders']);
    assert.equal(transportSignal?.aborted, true);
    assert.equal(repaired.removed(), 0, 'the transport does not sign out or delete auth storage');
    assert.ok(logged.some(timeoutError));
  } finally { console.error = originalError; }
}

async function main() {
  await transportBoundaries();
  await scopeAndSignals();
  await realSdkAuthLock();
  console.log('Supabase bounded reads: transport/body cancellation, Request signals, unchanged writes and real SDK auth-lock recovery pass (mock HTTP only).');
}

void main();
