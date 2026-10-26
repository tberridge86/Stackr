import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createMeasuredTransport, loadHomeReader, measureDependencyLoad, publicKeyOnly, safeFailure,
  summarizeHttp, pinHomeReaderSource, assertFrozenSource, TARGETS, validateCredentials } from './lib/home-authenticated-measurement.mjs';
import { run } from './measure-home-authenticated.mjs';

// Offline only. The real SDK, readers/cache/pagers and API client use fixture HTTP.
const owner = '11111111-1111-4111-8111-111111111111';
const binder = '22222222-2222-4222-8222-222222222222';
const email = 'designated-fixture@example.invalid', password = 'PRIVATE-TEST-PASSWORD';
const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'FIXTURE-SIGNATURE'].join('.');
const key = 'sb_publishable_fixture';
const prepared = { data: { state: 'ready', requestedCollectionRevision: 'fixture-revision', summary: {
  total: 20, currency: 'GBP', totalUnits: 2, pricedUnits: 2, freshUnits: 2, olderPriceUnits: 0,
  unpricedUnits: 0, distinctPriceIdentities: 1, pending: 0, retrying: 0, unsupported: 0, unresolved: 0,
  noProviderQuote: 0, collectionRevision: 'fixture-revision', valuationRevision: 'fixture-price',
  calculatedAt: '2026-10-26T00:00:00Z', oldestSourceAt: null, latestSourceAt: null, binders: [], refresh: null,
}, refreshRequest: null }, meta: {} };
const session = { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'PRIVATE-TEST-REFRESH',
  user: { id: owner, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function fixtureFetch({ cap = 50, denied = false, duplicate = false } = {}) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    assert.equal(init.redirect, 'error', 'provider redirects cannot forward credentials');
    const url = new URL(input); calls.push({ path: url.pathname, method: init.method ?? 'GET' });
    if (url.pathname === '/auth/v1/token') {
      assert.equal(JSON.parse(init.body).email, email); assert.equal(JSON.parse(init.body).password, password);
      return json(session);
    }
    if (url.pathname === '/auth/v1/user') return json(session.user);
    if (url.pathname.endsWith('/collection-valuation')) return denied
      ? json({ error: { code: 'access_denied', message: password + email + token }, meta: {} }, 403) : json(prepared);
    const table = url.pathname.split('/').at(-1), offset = Number(url.searchParams.get('offset'));
    const size = Math.min(Number(url.searchParams.get('limit')), cap);
    if (table === 'binders') return json(offset ? [] : [{ id: binder, user_id: owner, name: 'Private binder', type: 'custom', created_at: '2026-10-26' }]);
    if (table === 'user_card_variants') return json(offset ? [] : [{ id: 'owned-fixture', user_id: owner, card_id: 'fixture', set_id: 'en:set', variant: 'normal', quantity: 2 }]);
    const all = Array.from({ length: 102 }, (_, index) => ({ id: duplicate ? 'same-id' : 'saved-' + index,
      binder_id: binder, card_id: 'fixture-' + index, set_id: 'en:set', language: 'en', owned: true,
      owned_quantity: 1, notes: password, image_url: 'https://private.invalid/' + token }));
    return json(all.slice(offset, offset + size));
  };
  return { fetch, calls };
}
const tempRoot = resolve(process.platform === 'win32' ? 'D:/workspace' : tmpdir());
const temp = mkdtempSync(resolve(tempRoot, 'stackr-auth-measurement-test-'));
try {
  const credentials = resolve(temp, 'qa.json');
  writeFileSync(credentials, JSON.stringify({ email: '', password: '' }));
  const blocked = await run(['--credentials-file=' + credentials], { fetchImpl: () => { throw Error('No preflight network'); } });
  assert.equal(blocked.networkPerformed, false); assert.equal(blocked.state, 'blocked');
  const protectedContents = readFileSync(credentials, 'utf8');
  const overwrite = spawnSync(process.execPath, ['scripts/measure-home-authenticated.mjs', '--credentials-file=' + credentials,
    '--output=' + credentials], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  assert.equal(overwrite.status, 1); assert.equal(readFileSync(credentials, 'utf8'), protectedContents);
  const existingOutput = resolve(temp, 'already-exists.json'); writeFileSync(existingOutput, 'keep-existing');
  const existing = spawnSync(process.execPath, ['scripts/measure-home-authenticated.mjs', '--output=' + existingOutput],
    { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  assert.equal(existing.status, 1); assert.equal(readFileSync(existingOutput, 'utf8'), 'keep-existing');
  writeFileSync(credentials, JSON.stringify({ email, password }));
  await assert.rejects(run(['--execute', '--credentials-file=' + credentials]), { code: 'designated_account_acknowledgement_required' });
  await assert.rejects(run(['--execute', '--designated-qa-account', '--credentials-file=' + credentials]), { code: 'prepared_get_acknowledgement_required' });
  assert.equal(validateCredentials({ email: '', password: '' }), null);
  assert.throws(() => publicKeyOnly('sb_secret_private'), { code: 'privileged_or_invalid_key' });
  const service = ['e30', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'secret'].join('.');
  assert.throws(() => publicKeyOnly(service), { code: 'privileged_or_invalid_key' });
  assert.equal(publicKeyOnly(key), key);

  const pinned = pinHomeReaderSource(process.cwd());
  assertFrozenSource(process.cwd(), pinned);
  assert.throws(() => assertFrozenSource(process.cwd(), { ...pinned, blobs: { ...pinned.blobs, binders: 'wrong' } }), { code: 'source_changed' });
  assert.throws(() => loadHomeReader(process.cwd(), {}, { ...pinned, blobs: { ...pinned.blobs, homeSavedCollection: 'wrong' } }), { code: 'source_changed' });
  const raw = fixtureFetch();
  const transport = createMeasuredTransport({ fetchImpl: raw.fetch });
  transport.bindSession(session);
  for (const [url, method] of [
    ['https://evil.invalid/rest/v1/binders', 'GET'],
    [TARGETS.supabase + '/auth/v1/admin/users', 'GET'],
    [TARGETS.supabase + '/rest/v1/rpc/request_collection_valuation', 'POST'],
    [TARGETS.api + '/market/collection-valuation/refresh', 'POST'],
    [TARGETS.supabase + '/rest/v1/binders?select=*&offset=0&limit=50', 'GET'],
  ]) await assert.rejects(transport.fetch(url, { method, headers: { Authorization: 'Bearer ' + token } }));
  assert.equal(raw.calls.length, 0, 'disallowed traffic never reaches transport');
  transport.close();

  const { createClient } = await import('@supabase/supabase-js');
  for (const cap of [17, 50, 100, 500]) {
    const fixture = fixtureFetch({ cap });
    const measured = createMeasuredTransport({ fetchImpl: fixture.fetch });
    const supabase = createClient(TARGETS.supabase, key, { global: { fetch: measured.fetch },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signed = await supabase.auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null); measured.bindSession(signed.data.session);
    const reader = loadHomeReader(process.cwd(), supabase, pinned);
    try {
      const api = new (reader.load('stackrApiV1').StackrApiClient)({ baseUrl: TARGETS.api,
        fetchImpl: measured.fetch, getAccessToken: async () => token, getDeviceId: async () => '' });
      const cold = await measureDependencyLoad({ mode: 'concurrent', scenario: 'cold-client-memory', reader, supabase, api, transport: measured, userId: owner });
      assert.equal(cold.report.facts.savedPlacements, 102);
      assert.ok(cold.report.http.streams.every(stream => stream.completeByEmptyPage));
      assert.equal(cold.report.prepared.earlyEligible, true);
      const warm = await measureDependencyLoad({ mode: 'serial', scenario: 'immediate-warm-return', reader, supabase, api, transport: measured, userId: owner });
      assert.equal(warm.report.http.categories.binder_cards, undefined, 'immediate warm facts use actual scoped cache');
      const invalidated = await measureDependencyLoad({ mode: 'concurrent', scenario: 'local-invalidation', reader, supabase, api, transport: measured, userId: owner });
      assert.equal(invalidated.report.facts.savedPlacements, 102);
      assert.ok(invalidated.report.http.categories.binder_cards.requests > 1);
      const emitted = JSON.stringify([cold.report, warm.report, invalidated.report]);
      for (const secret of [owner, binder, email, password, token, 'private.invalid']) assert.equal(emitted.includes(secret), false);
      assert.equal(fixture.calls.some(call => call.method !== 'GET' && call.path !== '/auth/v1/token'), false);
    } finally { reader.close(); supabase.auth.stopAutoRefresh(); measured.close(); }
  }

  const successFixture = fixtureFetch();
  const success = await run(['--execute', '--designated-qa-account', '--allow-prepared-generation-get', '--include-actions',
    '--credentials-file=' + credentials], { fetchImpl: successFixture.fetch });
  assert.equal(success.state, 'measured');
  assert.equal(success.samples.filter(sample => sample.mode).length, 8);
  assert.equal(success.samples.find(sample => sample.pairIntegrity).pairIntegrity.exactFactsEqual, true);
  assert.equal(successFixture.calls.filter(call => call.path.endsWith('/collection-valuation')).length, 8);
  const vendorLogs = [], originalError = console.error;
  console.error = (...args) => vendorLogs.push(args.map(String).join(' '));
  let networkFailure;
  try { networkFailure = await run(['--execute', '--designated-qa-account', '--allow-prepared-generation-get',
    '--credentials-file=' + credentials], { fetchImpl: async () => { throw new Error(password + email + token); } });
  } finally { console.error = originalError; }
  for (const secret of [email, password, token]) assert.equal(vendorLogs.join(' ').includes(secret), false);
  assert.equal(networkFailure.state, 'failed');
  assert.equal(networkFailure.networkPerformed, true);
  assert.ok(networkFailure.httpAllActions.requests >= 1);
  for (const secret of [email, password, token]) assert.equal(JSON.stringify(networkFailure).includes(secret), false);

  const hanging = createMeasuredTransport({ fetchImpl: async () => new Response(new ReadableStream({ start() {} })) });
  const cancelled = new AbortController();
  const pendingBody = hanging.fetch(TARGETS.supabase + '/auth/v1/user', { signal: cancelled.signal });
  const rejected = assert.rejects(pendingBody, { code: 'request_cancelled_or_timed_out' });
  cancelled.abort(); await rejected; hanging.close();
  const tooLarge = createMeasuredTransport({ maxBytes: 2, fetchImpl: async () => json({ private: password }) });
  await assert.rejects(tooLarge.fetch(TARGETS.supabase + '/auth/v1/user'), { code: 'body_budget_exhausted' });
  tooLarge.close();

  const deniedFixture = fixtureFetch({ denied: true });
  const receipt = await run(['--execute', '--designated-qa-account', '--allow-prepared-generation-get', '--credentials-file=' + credentials], { fetchImpl: deniedFixture.fetch });
  assert.equal(receipt.reason, 'qa_prepared_access_denied');
  assert.equal(deniedFixture.calls.filter(call => call.path.endsWith('/collection-valuation')).length, 1);
  for (const secret of [owner, binder, email, password, token]) assert.equal(JSON.stringify(receipt).includes(secret), false);
  assert.equal(safeFailure(new Error(password)).code, 'measurement_failed');
  assert.equal(summarizeHttp([]).requests, 0);
  console.log('Authenticated Home tooling passed: blank/preflight no IO, explicit QA/prepared opt-ins, privilege/target/method guards, actual SDK/readers/cache, lower caps17/50/100/500, complete exhaustion, private-data redaction, and prepared403 stop.');
} finally {
  assert.equal(dirname(resolve(temp)), tempRoot);
  assert.ok(basename(temp).startsWith('stackr-auth-measurement-test-'));
  rmSync(temp, { recursive: true });
}
