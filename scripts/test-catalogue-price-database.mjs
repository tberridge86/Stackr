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
  const db = createCataloguePriceDatabase('https://deadline.test', 'fixture', {
    timeoutMs: 30,
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
  console.log('Catalogue price database deadlines passed: bounded outage, caller cancellation, and no POST replay.');
} finally { clearInterval(loop); }
