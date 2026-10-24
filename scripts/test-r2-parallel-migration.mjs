import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { migrateCatalogueAssets, validateCatalogueMigrationJournal } from './lib/r2-catalogue-migration.mjs';
import { S3CompatibleObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const base = 'https://assets.example.invalid';
const sourceBucket = 'stackr-catalogue-public';
const destinationBucket = 'stackr-catalogue-r2';
const options = { sourceBucket, destinationBucket, publicBaseUrl: base };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function until(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setImmediate(resolve));
  }
}
const error = code => Object.assign(new Error(code), { code });
function fixture({ count = 4, derivatives = 1, concurrency = 3, body = Buffer.from('body'), unknown = [], hooks = {}, ...bounds } = {}) {
  const sources = new Map();
  const objects = new Map();
  const events = [];
  const assets = Array.from({ length: count }, (_, index) => {
    const id = `row-${index + 1}`;
    const key = `old/${id}/original.png`;
    sources.set(key, body);
    return { id, asset_id: `opaque:${id}`, asset_type: 'card_image', updated_at: '2026-10-24T00:00:00Z',
      rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
      publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
      storage_provider: 'supabase_storage', storage_bucket: sourceBucket, storage_key: key,
      storage_path: key, url: `https://old.example.invalid/${key}`, archival_storage_key: null,
      mime_type: 'image/png', byte_size: unknown.includes(index) ? null : body.length,
      sha256: sha(body), content_sha256: sha(body), cache_control: null,
      derivative_list: Array.from({ length: derivatives }, (_, derivative) => {
        const derivativeKey = `old/${id}/derivative-${derivative}.png`;
        sources.set(derivativeKey, body);
        return { role: `derivative-${derivative}`, storageProvider: 'supabase_storage', storageBucket: sourceBucket,
          storageKey: derivativeKey, mimeType: 'image/png', byteSize: body.length, contentSha256: sha(body) };
      }),
    };
  });
  const input = { ...options, concurrency, ...bounds, assets, execute: true,
    async readSource(descriptor, readOptions) {
      events.push({ kind: 'source', descriptor, readOptions });
      await hooks.source?.(descriptor, readOptions);
      const value = sources.get(descriptor.key);
      if (value.length > readOptions.maxBytes) throw error('source_object_too_large');
      return value;
    },
    destinationStorage: { id: 's3_compatible', catalogueStorage: true, catalogueBucket: destinationBucket,
      publicUrl: (bucket, key) => bucket === destinationBucket ? `${base}/${key}` : null,
      async putObject(value) {
        events.push({ kind: 'put', value });
        assert.equal(value.upsert, false);
        await hooks.put?.(value);
        if (objects.has(value.key)) throw Object.assign(error('exists'), { status: 412 });
        objects.set(value.key, Buffer.from(value.body));
      },
      async getObject(bucket, key, readOptions) {
        events.push({ kind: 'r2Read', key, readOptions });
        await hooks.r2Read?.(bucket, key, readOptions);
        return hooks.r2Body?.(key) ?? objects.get(key);
      },
    },
    async fetchImpl(url, fetchOptions) {
      events.push({ kind: 'cdn', url });
      assert.equal(fetchOptions.redirect, 'error');
      await hooks.cdn?.(url, fetchOptions);
      const value = hooks.cdnBody?.(url) ?? objects.get(url.slice(base.length + 1));
      return new Response(value, { headers: { 'content-type': 'image/png', 'content-length': String(value.length) } });
    },
    async journal(record) {
      events.push({ kind: record.event, record: structuredClone(record) });
      await hooks.journal?.(record);
    },
    async publish(plan) {
      events.push({ kind: 'publish', plan });
      return await hooks.publish?.(plan) ?? { applied: true, updatedAt: '2026-10-24T01:00:00Z' };
    },
  };
  return { input, assets, sources, objects, events };
}
const of = (fixture, kind) => fixture.events.filter(event => event.kind === kind);

// Gate the first window while other workers finish: work overlaps, the cap is
// global across originals and derivatives, and SQL waits for every CDN check.
{
  const first = deferred();
  let active = 0; let peak = 0;
  const f = fixture({ count: 5, derivatives: 2, concurrency: 3, hooks: {
    async source(descriptor) {
      active++; peak = Math.max(peak, active);
      if (descriptor.key === 'old/row-1/original.png') await first.promise;
    },
    journal(record) { if (record.event === 'object_verified') active--; },
  } });
  const promise = migrateCatalogueAssets(f.input);
  await until(() => of(f, 'object_verified').length === 8, 'other workers finish while first transfer is gated');
  assert.equal(of(f, 'publish').length, 0);
  assert.ok(of(f, 'source').every(event => !event.descriptor.key.includes('row-4')), 'asset window is bounded');
  first.resolve();
  const result = await promise;
  assert.equal(result.status, 'complete');
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(of(f, 'publish').map(event => event.plan.rowId), f.assets.map(asset => asset.id));
  const firstPublication = f.events.findIndex(event => event.kind === 'publication_pending');
  assert.equal(f.events.slice(0, firstPublication).filter(event => event.kind === 'object_verified').length, 9);
  let pending = false;
  for (const event of f.events) {
    if (event.kind === 'publication_pending') pending = true;
    if (event.kind.startsWith('object_')) assert.equal(pending, false, 'object journal writes cannot interleave publication blocks');
    if (event.kind === 'publication_complete') pending = false;
  }
  for (const phase of ['source', 'put', 'r2Read', 'cdn']) assert.equal(result.phaseMetrics[phase].count, 15);
  assert.equal(result.phaseMetrics.publish.count, 5);
  assert.equal(result.phaseMetrics.journal.count, 40);
  assert.equal(result.phaseMetrics.concurrency, 3);
  assert.ok(result.phaseMetrics.elapsedMs >= 0);
  for (const phase of ['source', 'put', 'r2Read', 'cdn', 'journal', 'publish']) assert.ok(result.phaseMetrics[phase].elapsedMs >= 0);
}

// The upper supported cap is enforced before later assets enter the window.
{
  const gate = deferred();
  const f = fixture({ count: 9, derivatives: 0, concurrency: 8, hooks: { source: () => gate.promise } });
  const promise = migrateCatalogueAssets(f.input);
  await until(() => of(f, 'source').length === 8, 'eight transfers overlap');
  assert.equal(of(f, 'publish').length, 0);
  gate.resolve();
  const result = await promise;
  assert.equal(result.status, 'complete');
  assert.equal(result.phaseMetrics.concurrency, 8);
  assert.equal(result.results.length, 9);
}

// Concurrency validation precedes I/O; default behavior remains serial and has
// precisely the historical top-level result keys.
for (const concurrency of [0, 9, 1.5, '2', NaN]) {
  const f = fixture({ concurrency });
  await assert.rejects(() => migrateCatalogueAssets(f.input), { code: 'invalid_concurrency' });
  assert.equal(f.events.length, 0);
}
{
  const f = fixture({ count: 2, derivatives: 1 });
  delete f.input.concurrency;
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'complete');
  assert.deepEqual(Object.keys(result), ['status', 'processedBytes', 'results', 'remaining']);
  assert.deepEqual(f.events.map(event => event.kind), Array.from({ length: 2 }, () => [
    'source', 'object_pending', 'put', 'r2Read', 'cdn', 'object_verified',
    'source', 'object_pending', 'put', 'r2Read', 'cdn', 'object_verified',
    'publication_pending', 'publish', 'publication_complete',
  ]).flat());
}

// All completed parallel journal records remain valid rollback authority; their
// object order can vary, while the database commit/receipt order stays serial.
{
  const f = fixture({ count: 4 });
  const inventory = { options: { ...options, concurrency: 3 }, assets: f.assets };
  const digest = 'a'.repeat(64);
  const records = [{ event: 'migration_preflight', inventorySha256: digest, inventory }];
  f.input.journal = async record => records.push(structuredClone(record));
  f.input.publish = async plan => {
    const before = f.assets.find(asset => asset.id === plan.rowId);
    const after = { ...before, ...plan.patch, updated_at: '2026-10-24T01:00:00Z' };
    records.push({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId, before, after });
    return { applied: true, updatedAt: after.updated_at };
  };
  assert.equal((await migrateCatalogueAssets(f.input)).status, 'complete');
  assert.deepEqual(validateCatalogueMigrationJournal(records, inventory, digest).map(item => item.receipt.rowId), f.assets.map(asset => asset.id).reverse());
}

// Failure aborts the window and drains adapters that intentionally ignore abort.
// Every active-window asset and every object has explicit evidence in results.
for (const failure of ['checksum', 'source', 'r2Checksum', 'cdnChecksum', 'journal']) {
  const latePut = deferred();
  let putEntered = false;
  const f = fixture({ count: 4, derivatives: 0, concurrency: 3, hooks: {
    async source(descriptor) {
      if (descriptor.key.includes('row-1')) {
        await until(() => putEntered, 'another immutable put starts before failure');
        if (failure === 'source') throw error('source_unavailable');
      }
    },
    async put(value) {
      if (value.key.includes('/row-2/')) { putEntered = true; await latePut.promise; }
    },
    r2Body(key) { if (failure === 'r2Checksum' && key.includes('/row-1/')) return Buffer.from('oops'); },
    cdnBody(url) { if (failure === 'cdnChecksum' && url.includes('/row-1/')) return Buffer.from('oops'); },
    journal(record) {
      if (failure === 'journal' && record.event === 'object_verified' && record.rowId === 'row-1') throw error('journal_sync_failed');
    },
  } });
  if (failure === 'checksum') f.sources.set('old/row-1/original.png', Buffer.from('oops'));
  let settled = false;
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => putEntered, 'held put starts');
  await until(() => f.events.some(event => event.kind === 'source' && event.descriptor.key.includes('row-1')), 'failing source starts');
  // Wait for peer abort, proving the first failure has actually been observed.
  const held = of(f, 'put').find(event => event.value.key.includes('/row-2/'));
  await until(() => held.value.signal.aborted, 'failure cancels peers');
  assert.equal(settled, false, 'migration drains the late immutable put');
  latePut.resolve();
  const result = await promise;
  assert.equal(result.status, 'stopped');
  assert.equal(result.remaining, 1);
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every(row => row.status === 'failed' && row.transfers.length === 1));
  assert.equal(of(f, 'publication_pending').length, 0);
  assert.equal(of(f, 'publish').length, 0);
  assert.ok(result.results[1].transfers[0].object?.key, 'late immutable key remains in stop evidence');
  assert.equal(result.results[1].transfers[0].stage, 'pending');
  const count = f.events.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.events.length, count, 'no detached adapter or journal actions after return');
}

// A journal append that ignores abort must finish before returning or closing.
{
  const append = deferred();
  const controller = new AbortController();
  let entered = false; let settled = false;
  const f = fixture({ count: 3, derivatives: 0, hooks: { async journal(record) {
    if (record.event === 'object_pending' && !entered) { entered = true; await append.promise; }
  } } });
  f.input.signal = controller.signal;
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => entered, 'durable append starts');
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  append.resolve();
  const result = await promise;
  assert.equal(result.status, 'stopped');
  assert.equal(of(f, 'put').length, 0);
  assert.equal(of(f, 'publish').length, 0);
}

for (const phase of ['source', 'put', 'r2Read', 'cdn']) {
  const gate = deferred(); const controller = new AbortController();
  let entered = false; let settled = false;
  const hooks = { [phase]: async () => { entered = true; await gate.promise; } };
  const f = fixture({ count: 2, derivatives: 0, concurrency: 2, hooks });
  f.input.signal = controller.signal;
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => entered, 'phase starts before cancellation');
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, `${phase} drains`);
  gate.resolve();
  const result = await promise;
  assert.equal(result.status, 'stopped');
  assert.equal(of(f, 'publish').length, 0);
  const count = f.events.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.events.length, count);
}

// A blocked CDN stream read is actively cancelled, and asynchronous stream
// cleanup must settle before the caller may close its journal.
{
  const cleanup = deferred(); const controller = new AbortController();
  let reads = 0; let cancels = 0; let settled = false;
  const f = fixture({ count: 2, derivatives: 0, concurrency: 2 });
  f.input.signal = controller.signal;
  f.input.fetchImpl = async () => {
    reads++;
    return new Response(new ReadableStream({ cancel() { cancels++; return cleanup.promise; } }),
      { headers: { 'content-type': 'image/png', 'content-length': '4' } });
  };
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => reads === 2, 'both CDN reads start');
  // Allow both fetch continuations to acquire their stream readers.
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await until(() => cancels === 2, 'abort cancels blocked stream readers');
  assert.equal(settled, false);
  cleanup.resolve();
  assert.equal((await promise).status, 'stopped');
  assert.equal(of(f, 'publish').length, 0);
}

// Deadline cancellation has the same draining contract.
{
  const put = deferred(); let entered = false; let settled = false;
  const f = fixture({ count: 2, derivatives: 0, concurrency: 2, objectTimeoutMs: 25,
    hooks: { async put() { entered = true; await put.promise; } } });
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => entered, 'put starts');
  await until(() => of(f, 'put').some(event => event.value.signal.aborted), 'deadline fires');
  assert.equal(settled, false);
  put.resolve();
  assert.equal((await promise).status, 'stopped');
  assert.equal(of(f, 'publish').length, 0);
}

// Known metadata is reserved before any reads. Unknown reads cannot concurrently
// spend the remaining bytes; released unused capacity becomes available safely.
{
  const f = fixture({ count: 3, derivatives: 0, maxBatchBytes: 11 });
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'stopped');
  assert.equal(result.results[0].code, 'batch_byte_limit_exceeded');
  assert.equal(of(f, 'source').length, 0);
}
{
  const read = deferred(); let unknownEntered = false;
  const f = fixture({ count: 3, derivatives: 0, concurrency: 3, unknown: [1, 2], maxObjectBytes: 10, maxBatchBytes: 12,
    hooks: { async source(descriptor) {
      if (descriptor.key.includes('row-2')) { unknownEntered = true; await read.promise; }
    } } });
  const promise = migrateCatalogueAssets(f.input);
  await until(() => unknownEntered, 'first unknown read starts');
  assert.equal(of(f, 'source').length, 2, 'other unknown waits for reserved capacity');
  read.resolve();
  const result = await promise;
  assert.equal(result.status, 'complete');
  assert.equal(result.processedBytes, 12);
  assert.deepEqual(of(f, 'source').map(event => event.readOptions.maxBytes), [4, 8, 4]);
}
{
  const f = fixture({ count: 4, derivatives: 0, concurrency: 2, unknown: [0, 1, 2, 3], maxObjectBytes: 4, maxBatchBytes: 11 });
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'stopped');
  assert.equal(result.processedBytes, 8);
  assert.ok(of(f, 'source').every(event => event.readOptions.maxBytes <= 4));
  assert.equal(of(f, 'publish').length, 2, 'earlier verified window stays published');
  assert.equal(result.results.length, 4);
}

// A SQL conflict or ambiguous publication stops the prepared window in order;
// later verified assets retain their plans and no second publish is attempted.
for (const outcome of ['conflict', 'unknown', 'pendingJournal', 'completeJournal']) {
  const f = fixture({ count: 4, derivatives: 0, hooks: {
    publish() { return outcome === 'conflict' ? { applied: false } : outcome === 'unknown' ? null
      : { applied: true, updatedAt: '2026-10-24T01:00:00Z' }; },
    journal(record) {
      if (outcome === 'pendingJournal' && record.event === 'publication_pending') throw error('intent_sync_failed');
      if (outcome === 'completeJournal' && record.event === 'publication_complete') throw error('receipt_sync_failed');
    },
  } });
  // Override fixture's convenient default when an unknown outcome is intentional.
  if (outcome === 'unknown') f.input.publish = async plan => { f.events.push({ kind: 'publish', plan }); return null; };
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'stopped');
  assert.equal(of(f, 'publish').length, outcome === 'pendingJournal' ? 0 : 1);
  assert.equal(result.remaining, 1);
  assert.equal(result.results[0].status, ['conflict', 'pendingJournal'].includes(outcome) ? 'failed' : 'publication_requires_reconciliation');
  assert.equal(result.results[1].code, 'publication_window_stopped');
  assert.ok(result.results.every(row => row.plan && row.transfers.every(transfer => transfer.status === 'verified')));
}

// An already-started SQL CAS must settle and retain its durable success receipt
// during cancellation; the remaining prepared assets must never be published.
{
  const gate = deferred(); const controller = new AbortController();
  let entered = false; let settled = false;
  const f = fixture({ count: 3, derivatives: 0, hooks: { async publish() {
    entered = true; await gate.promise;
    return { applied: true, updatedAt: '2026-10-24T01:00:00Z' };
  } } });
  f.input.signal = controller.signal;
  const promise = migrateCatalogueAssets(f.input).then(value => { settled = true; return value; });
  await until(() => entered, 'SQL publication starts');
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  gate.resolve();
  const result = await promise;
  assert.equal(result.status, 'stopped');
  assert.equal(result.results[0].status, 'published');
  assert.equal(of(f, 'publication_complete').length, 1);
  assert.equal(of(f, 'publish').length, 1);
  assert.equal(result.results[1].code, 'cancelled');
  assert.equal(result.results[2].code, 'publication_window_stopped');
}

// The actual signed S3 adapter propagates caller cancellation into fetch for both
// immutable writes and checksum reads while retaining its own timeout.
{
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (_url, request) => {
      calls.push(request);
      return request.method === 'PUT' ? new Response(null, { status: 200 })
        : new Response('body', { headers: { 'content-length': '4' } });
    };
    const storage = new S3CompatibleObjectStorageAdapter({ endpoint: 'https://s3.example.invalid',
      accessKeyId: 'test-only', secretAccessKey: 'test-only', uploadTimeoutMs: 1000 });
    const controller = new AbortController();
    await storage.putObject({ bucket: destinationBucket, key: 'a.png', body: Buffer.from('body'), contentType: 'image/png',
      upsert: false, signal: controller.signal });
    await storage.getObject(destinationBucket, 'a.png', { maxBytes: 4, signal: controller.signal });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.signal instanceof AbortSignal && !call.signal.aborted));
    controller.abort();
    assert.ok(calls.every(call => call.signal.aborted));
  } finally { globalThis.fetch = previousFetch; }
}
console.log('PASS bounded parallel transfers, ordered verified publication, legacy serial results, rollback journals, failures/cancellation drain, budgets, metrics and S3 abort propagation');