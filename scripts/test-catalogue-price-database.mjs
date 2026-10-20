import assert from 'node:assert/strict';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';

const stalled = async (_input, { signal }) => {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
};
// Keep the loop alive because AbortSignal.timeout does not retain a Node handle.
const loop = setInterval(() => {}, 1000);
try {
  assert.throws(() => createCataloguePriceDatabase('https://deadline.test', 'fixture', { timeoutMs: 0 }), /deadline/);
  let attempts = 0;
  const failures = [];
  const db = createCataloguePriceDatabase('https://deadline.test', 'fixture', {
    timeoutMs: 30,
    onTransportFailure: event => failures.push(event),
    fetchImpl: async (...args) => { attempts++; return stalled(...args); },
  });
  const started = performance.now();
  const deadline = await db.schema('api').rpc('read_catalogue_prices', { p_references: ['fixture'] });
  assert.ok(deadline.error, 'a stalled database request must fail at its deadline');
  assert.ok(performance.now() - started < 1000, 'database outage cannot leave a worker hanging');
  assert.equal(attempts, 1, 'do not automatically replay a POST after a timeout');
  const controller = new AbortController();
  const pending = db.schema('api').rpc('read_catalogue_prices', { p_references: ['fixture'] }).abortSignal(controller.signal);
  controller.abort(new Error('caller-cancelled'));
  const cancelled = await pending;
  assert.match(cancelled.error?.message ?? '', /caller-cancelled/);
  assert.equal(attempts, 2);
  assert.deepEqual(failures.map(event => event.reason), ['request_deadline', 'caller_aborted']);
  const transportFailure = new Error('secret-bearing upstream URL/header/body');
  for (const rpc of ['list_reviewed_cardmarket_printing_mappings', 'read_catalogue_bulk_feed', 'begin_catalogue_bulk_sweep', 'catalogue_bulk_price_coverage_page', 'unreviewed_secret_path']) {
    const observed = [];
    let calls = 0;
    const client = createCataloguePriceDatabase('https://deadline.test', 'secret-server-key', {
      onTransportFailure: event => observed.push(event),
      fetchImpl: async () => { calls++; throw transportFailure; },
    });
    const failed = await client.schema('api').rpc(rpc, { secret_card: 'secret-card-body' });
    assert(failed.error);
    assert.equal(calls, 1, 'transport failure never retries a POST');
    assert.deepEqual(observed, [{ event: 'catalogue_price_database_transport_failed',
      rpc: rpc === 'unreviewed_secret_path' ? 'unknown' : rpc, reason: 'transport_error', timeoutMs: 45000 }]);
    assert(!JSON.stringify(observed).includes('secret'), 'diagnostics exclude request/exception secrets');
  }
  for (const observer of [() => { throw Error('observer failed'); }, async () => { throw Error('async observer failed'); }]) {
    const observerFailure = createCataloguePriceDatabase('https://deadline.test', 'fixture', {
      onTransportFailure: observer, fetchImpl: async () => { throw transportFailure; },
    });
    const observedFailure = await observerFailure.schema('api').rpc('read_catalogue_bulk_feed', {});
    assert.match(observedFailure.error.message, /secret-bearing/, 'observer cannot replace original failure');
  }
  const successEvents = [];
  const sqlFailure = createCataloguePriceDatabase('https://deadline.test', 'fixture', {
    onTransportFailure: event => successEvents.push(event),
    fetchImpl: async () => new Response(JSON.stringify({ code: '57014', message: 'statement timeout' }),
      { status: 400, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal((await sqlFailure.schema('api').rpc('read_catalogue_bulk_feed', {})).error.code, '57014');
  assert.deepEqual(successEvents, [], 'SQL failures are responses, never relabelled as transport failures');
  const success = createCataloguePriceDatabase('https://deadline.test', 'fixture', {
    onTransportFailure: event => successEvents.push(event),
    fetchImpl: async () => new Response('[{"value":1}]', { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.deepEqual((await success.schema('api').rpc('read_catalogue_bulk_feed', {})).data, [{ value: 1 }]);
  assert.deepEqual(successEvents, []);
  console.log('Catalogue database controls passed: bounded outage, caller cancellation, no replay, safe RPC diagnostics, observer isolation and unchanged SQL/success responses.');
} finally { clearInterval(loop); }
