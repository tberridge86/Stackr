import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import createV1Router from '../routes/v1.js';
import { createCatalogueV1Service } from '../lib/stackrApiV1.js';
import * as trace from '../lib/traceContext.js';

const names = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phaseByTable = {
  published_catalogue_versions: 'manifest_versions',
  catalogue_delta_changes: 'manifest_latest_change',
  catalogue_languages: 'manifest_languages',
};
const expectedPhases = Object.values(phaseByTable).sort();
const rows = {
  published_catalogue_versions: names.map((code, index) => ({ id: id(index + 1),
    version_key: `fixture-${code}`, language_code: code, language_sort_order: index })),
  catalogue_delta_changes: [{ change_sequence: 17 }],
  catalogue_languages: names.map((code, index) => ({ code, bcp47_code: code,
    english_name: code, native_name: code, sort_order: index })),
};
const responseFor = (table) => new Response(JSON.stringify(rows[table]), { status: 200 });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; !predicate() && i < 200; i++) await sleep(5);
  assert.ok(predicate(), message);
}

async function fixture(t, transport, { failingLogger = false } = {}) {
  const events = [], requests = [], deferred = new Set();
  let loggingFailures = 0;
  const log = (line) => {
    const event = JSON.parse(line);
    if (failingLogger && ['stackr_catalogue_manifest_read', 'stackr_trace_span'].includes(event.event)) {
      loggingFailures++;
      throw new Error('fixture telemetry failure');
    }
    events.push(event);
  };
  t.mock.method(console, 'info', log);
  t.mock.method(console, 'error', log);
  const sdk = createClient('https://fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: trace.createTracedFetch((input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://fixture.invalid', 'No remote requests are permitted.');
      const table = url.pathname.split('/').at(-1);
      const context = trace.currentTrace();
      const request = { table, url, context, signal: init.signal };
      requests.push(request);
      const holdBody = () => {
        const body = new Promise((resolve, reject) => {
          const finish = (callback, value) => {
            init.signal?.removeEventListener('abort', abort);
            deferred.delete(release);
            callback(value);
          };
          const abort = () => finish(reject, init.signal.reason);
          const release = () => finish(resolve, JSON.stringify(rows[table]));
          request.release = release;
          deferred.add(release);
          init.signal?.addEventListener('abort', abort, { once: true });
        });
        return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: () => body };
      };
      return transport?.(request, holdBody) ?? responseFor(table);
    }) },
  });
  const service = createCatalogueV1Service({ supabase: sdk });
  const app = express();
  app.use(trace.traceMiddleware());
  app.use('/v1', createV1Router({ service }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    for (const release of deferred) release();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { events, requests, get loggingFailures() { return loggingFailures; },
    request(path = '/v1/catalog/manifest', headers = {}) {
      const req = http.get({ hostname: '127.0.0.1', port: server.address().port, path, headers, agent: false });
      const result = new Promise((resolve, reject) => {
        req.on('error', reject);
        req.on('response', res => {
          let body = '';
          res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
        });
      });
      result.catch(() => {});
      return { req, result };
    },
  };
}

const phases = (f) => f.events.filter(event => event.event === 'stackr_catalogue_manifest_read');
const finished = (f) => phases(f).filter(event => event.outcome !== 'started');

function assertManifest(result) {
  assert.equal(result.status, 200);
  const body = result.body.data;
  assert.equal(body.currentCatalogueVersion, names.map(code => `fixture-${code}`).join('|'));
  assert.equal(body.latestChangeSequence, 17);
  assert.deepEqual(body.availableLanguageShards.map(shard => [shard.languageCode, shard.catalogueVersionId]),
    names.map((code, index) => [code, id(index + 1)]));
  assert.equal(result.headers['cache-control'], 'public, max-age=300, stale-while-revalidate=600');
  assert.ok(result.headers.etag); assert.ok(result.headers['x-request-id']);
}

test('parallel manifest reads include full body timing and link SDK spans to fixed phase context', async (t) => {
  const f = await fixture(t, (_request, hold) => hold());
  const request = f.request();
  await until(() => f.requests.length === 3, 'All three essential queries start before any body completes.');
  assert.equal(phases(f).length, 3, 'Each dependency emits a start event.');
  assert.deepEqual(phases(f).map(event => event.phase).sort(), expectedPhases);
  assert.equal(finished(f).length, 0, 'Headers alone do not finish a dependency.');
  const sdkSpans = f.events.filter(event => event.event === 'stackr_trace_span');
  assert.equal(sdkSpans.length, 3, 'SDK header spans are already complete while query bodies wait.');
  await sleep(25);
  for (const item of [...f.requests].reverse()) item.release();
  const result = await request.result;
  assertManifest(result);
  const resultRequestId = result.headers['x-request-id'];
  assert.equal(phases(f).length, 6);
  const endings = finished(f);
  assert.ok(endings.every(event => event.outcome === 'success' && event.duration_ms >= 20));
  assert.equal(new Set(phases(f).map(event => event.trace_id)).size, 1);
  assert.equal(new Set(endings.map(event => event.span_id)).size, 3);
  for (const item of f.requests) {
    assert.equal(item.context.catalogueReadPhase, phaseByTable[item.table]);
    assert.equal(item.signal.aborted, false);
    const phase = endings.find(event => event.phase === phaseByTable[item.table]);
    const sdk = sdkSpans.find(event => event.phase === phase.phase);
    assert.equal(sdk.parent_span_id, phase.span_id);
    assert.equal(sdk.trace_id, phase.trace_id);
    assert.equal(phase.parent_span_id, phases(f)[0].parent_span_id);
    assert.equal(phase.request_id, resultRequestId);
    assert.equal(sdk.request_id, resultRequestId);
    assert.deepEqual(Object.keys(phase).sort(), ['duration_ms', 'event', 'outcome', 'parent_span_id', 'phase', 'request_id', 'span_id', 'trace_id']);
  }
});

test('essential manifest query failure retains its HTTP error contract and safe error outcome', async (t) => {
  const f = await fixture(t, request => request.table === 'catalogue_delta_changes'
    ? new Response(JSON.stringify({ code: '57014', message: 'fixture dependency failure' }), { status: 400 }) : undefined);
  const result = await f.request().result;
  assert.equal(result.status, 500);
  assert.equal(result.body.error.message, 'Stackr API request failed.');
  await until(() => finished(f).length === 3, 'All essential query outcomes are recorded.');
  assert.equal(finished(f).find(event => event.phase === 'manifest_latest_change').outcome, 'error');
  assert.equal(finished(f).filter(event => event.outcome === 'success').length, 2);
  assert.equal(phases(f).length, 6);
  assert.ok(!JSON.stringify(phases(f)).includes('fixture dependency failure'));
});

test('manifest disconnect preserves the parent cancellation signal in all three phase contexts', async (t) => {
  const f = await fixture(t, (_request, hold) => hold());
  const request = f.request();
  await until(() => f.requests.length === 3, 'All three queries are in flight.');
  request.req.destroy();
  await until(() => finished(f).length === 3, 'All phase reads settle after disconnect.');
  assert.ok(f.requests.every(item => item.signal.aborted));
  assert.ok(finished(f).every(event => event.outcome === 'cancelled'));
  assert.equal(new Set(f.requests.map(item => item.context.catalogueReadSignal)).size, 1);
  assert.equal(phases(f).length, 6);
});

test('simultaneous identical manifests keep phase and cancellation context isolated', async (t) => {
  let firstTrace;
  const f = await fixture(t, (request, hold) => {
    firstTrace ??= request.context.traceId;
    return request.context.traceId === firstTrace ? hold() : undefined;
  });
  const first = f.request();
  await until(() => f.requests.length === 3, 'First manifest queries started.');
  const second = f.request();
  assertManifest(await second.result);
  first.req.destroy();
  await until(() => finished(f).length === 6, 'Both manifest outcomes recorded.');
  const traces = [...new Set(finished(f).map(event => event.trace_id))];
  assert.equal(traces.length, 2);
  for (const traceId of traces) {
    const records = phases(f).filter(event => event.trace_id === traceId);
    assert.equal(records.length, 6);
    assert.deepEqual(records.filter(event => event.outcome !== 'started').map(event => event.phase).sort(), expectedPhases);
    assert.ok(records.filter(event => event.outcome !== 'started').every(event => event.outcome === (traceId === firstTrace ? 'cancelled' : 'success')));
  }
});

test('non-manifest SDK reads have no phase labels and unknown labels are never logged', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/v1/languages').result).status, 200);
  assert.equal(phases(f).length, 0);
  const sdkSpans = f.events.filter(event => event.event === 'stackr_trace_span');
  assert.equal(sdkSpans.length, 1);
  assert.equal(Object.hasOwn(sdkSpans[0], 'phase'), false);
  assert.equal(await trace.observeCatalogueManifestRead('untrusted-fixture-label', async () => 42), 42);
  assert.equal(phases(f).length, 0);
});

test('phase and SDK telemetry failures cannot change a successful manifest', async (t) => {
  const f = await fixture(t, undefined, { failingLogger: true });
  assertManifest(await f.request().result);
  assert.equal(f.loggingFailures, 9, 'Six phase events and three SDK spans attempted logging.');
  const failure = { code: 'fixture_original_error' };
  await assert.rejects(trace.observeCatalogueManifestRead('manifest_versions', async () => { throw failure; }), error => error === failure);
  assert.equal(f.loggingFailures, 11, 'Failed telemetry cannot replace the original read error either.');
});

test('phase correlation accepts only canonical UUID request metadata without changing HTTP request IDs', async (t) => {
  const f = await fixture(t);
  const requestId = 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF';
  const first = await f.request('/v1/catalog/manifest', { 'x-request-id': requestId }).result;
  assert.equal(first.headers['x-request-id'], requestId);
  assert.ok(phases(f).every(event => event.request_id === requestId.toLowerCase()));
  f.events.length = 0;
  const unsafe = 'fixture-unsafe-correlation';
  const second = await f.request('/v1/catalog/manifest', { 'x-request-id': unsafe }).result;
  assert.equal(second.headers['x-request-id'], unsafe);
  const telemetry = f.events.filter(event => ['stackr_catalogue_manifest_read', 'stackr_trace_span'].includes(event.event));
  assert.equal(telemetry.length, 9);
  assert.ok(telemetry.every(event => !Object.hasOwn(event, 'request_id')));
  assert.ok(!JSON.stringify(telemetry).includes(unsafe));
});
