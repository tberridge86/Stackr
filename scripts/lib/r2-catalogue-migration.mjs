import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

const MIB = 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const POINTER_FIELDS = ['storage_provider', 'storage_bucket', 'storage_key', 'storage_path', 'url',
  'content_sha256', 'sha256', 'byte_size', 'derivative_list', 'cache_control', 'archival_storage_key'];
const GUARD_FIELDS = ['id', 'asset_id', 'updated_at', 'source_id', 'variant_id', 'asset_type',
  'rights_status', 'permission_status', 'asset_visibility', 'publicly_servable', 'retention_status',
  'deleted_at', 'deprecated_at', ...POINTER_FIELDS];

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function check(value, code) { if (!value) fail(code); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function fingerprint(value) { return digest(JSON.stringify(canonical(value))); }
function selected(row, fields) { return Object.fromEntries(fields.filter((key) => Object.hasOwn(row, key)).map((key) => [key, structuredClone(row[key])])); }
function integer(value, minimum, maximum, code) { check(Number.isSafeInteger(value) && value >= minimum && value <= maximum, code); return value; }
function identifier(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function publicAssetId(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 4096
    && !/\p{Cc}/u.test(value);
}
function keyIsSafe(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024
    && !/[\\\u0000-\u001f?#%]/.test(value) && !value.startsWith('/')
    && value.split('/').every((part) => part && part !== '.' && part !== '..');
}

function cdnBase(value) {
  let url;
  try { url = new URL(value); } catch { fail('unsafe_public_base_url'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && !url.port
    && !isIP(url.hostname.replace(/^\[|\]$/g, '')) && url.hostname.includes('.')
    && !/(?:^|\.)(?:localhost|local|internal|supabase\.co|r2\.cloudflarestorage\.com)$/.test(url.hostname)
    && !/%|\\/.test(url.pathname), 'unsafe_public_base_url');
  return url.toString().replace(/\/+$/, '');
}

function config(input) {
  return {
    sourceBucket: input.sourceBucket,
    destinationBucket: input.destinationBucket,
    publicBaseUrl: cdnBase(input.publicBaseUrl),
    maxAssets: integer(input.maxAssets ?? 50, 1, 50, 'invalid_asset_limit'),
    maxObjectBytes: integer(input.maxObjectBytes ?? 12 * MIB, 1, 12 * MIB, 'invalid_object_limit'),
    maxBatchBytes: integer(input.maxBatchBytes ?? 250 * MIB, 1, 1024 * MIB, 'invalid_batch_limit'),
    objectTimeoutMs: integer(input.objectTimeoutMs ?? 30_000, 1, 120_000, 'invalid_object_timeout'),
    concurrency: integer(input.concurrency ?? 1, 1, 8, 'invalid_concurrency'),
  };
}

function objectDescriptor(row, derivative, index, options) {
  const original = derivative === null;
  const provider = original ? row.storage_provider : derivative.storageProvider ?? derivative.storage_provider ?? row.storage_provider;
  const bucket = original ? row.storage_bucket : derivative.storageBucket ?? derivative.storage_bucket ?? row.storage_bucket;
  const key = original ? row.storage_key : derivative.storageKey ?? derivative.storage_key ?? derivative.key;
  const mimeType = original ? row.mime_type : derivative.mimeType ?? derivative.mime_type;
  const role = original ? 'original' : derivative.role;
  const byteSize = original ? row.byte_size : derivative.byteSize ?? derivative.byte_size;
  const hashes = (original ? [row.content_sha256, row.sha256] : [derivative.contentSha256, derivative.content_sha256, derivative.sha256])
    .filter((hash) => hash != null && hash !== '');
  check(identifier(role) && (original || role !== 'original'), 'invalid_object_role');
  check(keyIsSafe(key), 'unsafe_source_key');
  check(Object.hasOwn(EXTENSIONS, mimeType), 'unsupported_mime_type');
  check((provider === 'supabase_storage' && bucket === options.sourceBucket)
    || (!original && provider === 's3_compatible' && bucket === options.destinationBucket), 'unexpected_source_location');
  check(hashes.every((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)), 'invalid_source_hash');
  check(new Set(hashes).size <= 1, 'conflicting_source_hashes');
  if (byteSize != null) integer(byteSize, 1, options.maxObjectBytes, 'source_object_too_large');
  return { provider, bucket, key, role, index, mimeType, byteSize: byteSize ?? null, sha256: hashes[0] ?? null };
}

/** Metadata only. The caller pins the database and public source bucket before calling. */
export function planCatalogueAssetMigration(asset, input) {
  const options = config(input);
  check(typeof options.sourceBucket === 'string' && options.sourceBucket.length > 0, 'missing_source_bucket');
  check(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.destinationBucket ?? ''), 'invalid_destination_bucket');
  check(identifier(asset?.id) && publicAssetId(asset.asset_id) && identifier(asset.asset_type), 'missing_asset_identity');
  check(asset.rights_status === 'approved' && asset.permission_status === 'approved'
    && asset.asset_visibility === 'public_catalogue' && asset.publicly_servable === true
    && asset.retention_status === 'active' && asset.deleted_at === null && asset.deprecated_at === null,
  'asset_not_public_approved_active');
  check(typeof asset.updated_at === 'string' && Number.isFinite(Date.parse(asset.updated_at)), 'missing_concurrency_guard');
  check(asset.storage_provider === 'supabase_storage', 'original_not_supabase');
  check(!asset.archival_storage_key || asset.archival_storage_key === asset.storage_key, 'separate_archival_object_requires_inventory');
  check(Array.isArray(asset.derivative_list) && asset.derivative_list.length <= 16, 'invalid_derivative_list');
  const objects = [objectDescriptor(asset, null, -1, options),
    ...asset.derivative_list.map((derivative, index) => objectDescriptor(asset, derivative, index, options))];
  check(new Set(objects.map((object) => object.role)).size === objects.length, 'duplicate_object_role');
  return {
    assetId: asset.asset_id, rowId: asset.id, snapshotHash: fingerprint(asset),
    guard: selected(asset, GUARD_FIELDS),
    before: Object.fromEntries(POINTER_FIELDS.map((key) => [key, structuredClone(asset[key] ?? null)])), objects,
    knownBytes: objects.reduce((sum, object) => sum + (object.byteSize ?? 0), 0),
  };
}

function cancellation(signal) { if (signal?.aborted) fail('cancelled'); }

// Concurrent transfers drain even adapters that ignore abort before returning.
// The default serial mode retains its historical deadline behavior.
async function bounded(operation, signal, drain = false) {
  cancellation(signal);
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = () => reject(Object.assign(new Error('cancelled_or_deadline'), { code: 'cancelled_or_deadline' })); });
  signal.addEventListener('abort', rejectAbort, { once: true });
  const pending = Promise.resolve().then(() => { cancellation(signal); return operation(); });
  try { return await Promise.race([pending, aborted]); }
  finally {
    signal.removeEventListener('abort', rejectAbort);
    if (drain) await pending.catch(() => {});
  }
}

async function measured(metrics, phase, operation) {
  if (!metrics) return operation();
  const start = performance.now();
  metrics[phase].count++;
  try { return await operation(); }
  finally { metrics[phase].elapsedMs += performance.now() - start; }
}

function checkedBytes(value, maximum, descriptor) {
  check(Buffer.isBuffer(value) || value instanceof Uint8Array, 'invalid_object_body');
  const bytes = Buffer.from(value);
  check(bytes.length > 0 && bytes.length <= maximum, 'object_byte_limit_exceeded');
  if (descriptor.byteSize != null) check(bytes.length === descriptor.byteSize, 'object_size_mismatch');
  if (descriptor.sha256) check(digest(bytes) === descriptor.sha256, 'object_hash_mismatch');
  return bytes;
}

async function publicBytes(url, expected, fetchImpl, signal, drain) {
  const response = await bounded(() => fetchImpl(url, { signal, redirect: 'error', cache: 'no-store' }), signal, drain);
  try {
    check(response.ok && !response.redirected && (!response.url || response.url === url), 'cdn_response_not_public_object');
    check(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === expected.mimeType, 'cdn_mime_mismatch');
    const declared = response.headers.get('content-length');
    if (declared !== null) check(Number(declared) === expected.byteSize, 'cdn_size_mismatch');
    check(response.body && typeof response.body.getReader === 'function', 'cdn_body_missing');
    const reader = response.body.getReader();
    let cancelledRead;
    const abortRead = () => { cancelledRead ??= reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abortRead, { once: true });
    if (signal.aborted) abortRead();
    const hash = createHash('sha256');
    let size = 0;
    try {
      while (true) {
        const chunk = await bounded(() => reader.read(), signal, drain);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        check(size <= expected.byteSize, 'cdn_byte_limit_exceeded');
        hash.update(chunk.value);
      }
    } finally {
      signal.removeEventListener('abort', abortRead);
      await (cancelledRead ?? reader.cancel().catch(() => {}));
    }
    check(size === expected.byteSize && hash.digest('hex') === expected.sha256, 'cdn_hash_or_size_mismatch');
  } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
}

async function copyObject(asset, object, input, options, budget) {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
    input.transferDeadline?.();
  }, options.objectTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  let reservation;
  try {
    reservation = budget.reserve ? await budget.reserve(object, signal) : null;
    const remaining = reservation?.bytes ?? options.maxBatchBytes - budget.used;
    check(remaining > 0 && (object.byteSize == null || object.byteSize <= remaining), 'batch_byte_limit_exceeded');
    const maxBytes = Math.min(options.maxObjectBytes, remaining);
    const reader = input.readSource ?? ((descriptor, readOptions) => {
      const storage = descriptor.provider === 's3_compatible' ? input.destinationStorage : input.sourceStorage;
      return storage.getObject(descriptor.bucket, descriptor.key, readOptions);
    });
    const sourceBody = await measured(input.phaseMetrics, 'source',
      () => bounded(() => reader(object, { maxBytes, signal }), signal, options.concurrency > 1));
    // Bytes already read still consume the parallel batch allowance if their
    // identity/checksum fails. Never make that allowance available a second time.
    if (reservation && (Buffer.isBuffer(sourceBody) || sourceBody instanceof Uint8Array)
      && sourceBody.byteLength > 0 && sourceBody.byteLength <= maxBytes) budget.settle(reservation, sourceBody.byteLength);
    const body = checkedBytes(sourceBody, maxBytes, object);
    if (reservation) budget.settle(reservation, body.length);
    else budget.used += body.length; // Includes resumed objects.
    const sha256 = digest(body);
    // Public identifiers are opaque text, not filesystem paths (legacy IDs include
    // colons and may contain Unicode). Preserve the ID in metadata and hash it here.
    const key = `public/${asset.asset_type}/${asset.id}/${digest(asset.asset_id)}/${sha256}/${object.role}.${EXTENSIONS[object.mimeType]}`;
    const url = `${options.publicBaseUrl}/${key}`;
    check(input.destinationStorage.publicUrl(options.destinationBucket, key) === url, 'unexpected_public_object_url');
    const verified = { role: object.role, index: object.index, bucket: options.destinationBucket, key, url,
      mimeType: object.mimeType, byteSize: body.length, sha256 };
    input.transferProgress?.(object, { stage: 'prepared', object: verified });
    // Durable intent exists even if the process dies immediately after PUT.
    await bounded(() => input.journal({ event: 'object_pending', rowId: asset.id, object: verified }), signal, options.concurrency > 1);
    input.transferProgress?.(object, { stage: 'pending', object: verified });
    let reused = false;
    try {
      await measured(input.phaseMetrics, 'put', () => bounded(() => input.destinationStorage.putObject({ bucket: options.destinationBucket, key,
        body, contentType: object.mimeType, cacheControl: CACHE_CONTROL, upsert: false, signal }), signal, options.concurrency > 1));
    } catch (error) {
      if (![409, 412].includes(error.status)) throw error;
      reused = true;
    }
    checkedBytes(await measured(input.phaseMetrics, 'r2Read', () => bounded(() => input.destinationStorage.getObject(options.destinationBucket, key,
      { maxBytes: body.length, signal }), signal, options.concurrency > 1)), body.length, verified);
    await measured(input.phaseMetrics, 'cdn', () => publicBytes(url, verified, input.fetchImpl ?? globalThis.fetch, signal, options.concurrency > 1));
    cancellation(signal);
    await bounded(() => input.journal({ event: 'object_verified', rowId: asset.id, object: { ...verified, reused } }), signal, options.concurrency > 1);
    input.transferProgress?.(object, { stage: 'verified', object: { ...verified, reused } });
    return { ...verified, reused };
  } catch (error) {
    // Stop peers before releasing a failed read's reservation to waiting jobs.
    input.transferFailure?.(error);
    throw error;
  } finally {
    if (reservation) budget.settle(reservation, 0);
    clearTimeout(timer);
  }
}

function publicationPlan(asset, plan, objects) {
  const original = objects[0];
  const derivatives = asset.derivative_list.map((derivative, index) => {
    const object = objects[index + 1];
    const result = { ...derivative, storageProvider: 's3_compatible', storageBucket: object.bucket,
      storageKey: object.key, contentSha256: object.sha256, byteSize: object.byteSize,
      cacheControl: CACHE_CONTROL, url: object.url, deliveryUrl: object.url };
    const aliases = { storage_provider: 's3_compatible', storage_bucket: object.bucket, storage_key: object.key,
      storage_path: object.key, key: object.key, path: object.key, content_sha256: object.sha256,
      sha256: object.sha256, byte_size: object.byteSize, delivery_url: object.url };
    for (const [key, value] of Object.entries(aliases)) if (Object.hasOwn(derivative, key)) result[key] = value;
    return result;
  });
  const patch = { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list: derivatives, cache_control: CACHE_CONTROL };
  if (asset.archival_storage_key) patch.archival_storage_key = original.key;
  return { ...plan, objects, patch, operationId: fingerprint({ rowId: asset.id, snapshotHash: plan.snapshotHash, patch }) };
}

// Known lengths are reserved for the entire window before any read. Unknown
// lengths reserve a full object allowance, or the final remaining allowance when
// no other unknown read holds capacity. This may serialize reads near the batch
// limit, but cannot spend the same allowance concurrently or reject a read merely
// because another unknown read temporarily reserved its unused capacity.
function windowByteBudget(budget, entries, options) {
  const known = new Map();
  const waiters = new Set();
  let reserved = 0;
  let unknownReserved = 0;
  for (const entry of entries) for (const object of entry.plan.objects) {
    if (object.byteSize != null) {
      known.set(object, { bytes: object.byteSize, unknown: false, settled: false });
      reserved += object.byteSize;
    }
  }
  check(budget.used + reserved <= options.maxBatchBytes, 'batch_byte_limit_exceeded');
  const wake = () => { for (const resolve of waiters) resolve(); waiters.clear(); };
  return {
    async reserve(object, signal) {
      cancellation(signal);
      if (known.has(object)) return known.get(object);
      while (true) {
        cancellation(signal);
        const available = options.maxBatchBytes - budget.used - reserved;
        if (available >= options.maxObjectBytes || unknownReserved === 0) {
          check(available > 0, 'batch_byte_limit_exceeded');
          const bytes = Math.min(options.maxObjectBytes, available);
          reserved += bytes;
          unknownReserved += bytes;
          return { bytes, unknown: true, settled: false };
        }
        await new Promise((resolve) => {
          const finish = () => { waiters.delete(finish); signal.removeEventListener('abort', finish); resolve(); };
          waiters.add(finish);
          signal.addEventListener('abort', finish, { once: true });
          if (signal.aborted) finish();
        });
      }
    },
    settle(token, actual) {
      if (token.settled) return;
      token.settled = true;
      reserved -= token.bytes;
      if (token.unknown) unknownReserved -= token.bytes;
      budget.used += actual;
      wake();
    },
  };
}

async function migrateConcurrent(input, options) {
  const started = performance.now();
  const phaseMetrics = { concurrency: options.concurrency, elapsedMs: 0,
    ...Object.fromEntries(['source', 'put', 'r2Read', 'cdn', 'journal', 'publish'].map(phase => [phase, { count: 0, elapsedMs: 0 }])) };
  const results = [];
  const budget = { used: 0 };
  // Durability callbacks are serialized even for injected adapters. A rejected
  // append poisons the chain, preventing subsequent writes after journal failure.
  let journalTail = Promise.resolve();
  const journal = record => {
    journalTail = journalTail.then(() => measured(phaseMetrics, 'journal', () => input.journal(record)));
    return journalTail;
  };
  const finish = status => {
    phaseMetrics.elapsedMs = performance.now() - started;
    for (const metric of Object.values(phaseMetrics)) if (metric && typeof metric === 'object') {
      metric.elapsedMs = Math.round(metric.elapsedMs * 1000) / 1000;
    }
    phaseMetrics.elapsedMs = Math.round(phaseMetrics.elapsedMs * 1000) / 1000;
    return { status, processedBytes: budget.used, results,
      remaining: input.assets.length - results.length, phaseMetrics };
  };
  const stoppedEntry = (entry, code, extra = {}) => ({ rowId: entry.source?.id ?? null,
    status: 'failed', code, ...(entry.prepared ? { plan: entry.prepared } : {}),
    transfers: entry.transfers ?? [], ...extra });

  for (let offset = 0; offset < input.assets.length; offset += options.concurrency) {
    const entries = input.assets.slice(offset, offset + options.concurrency).map(source => ({ source }));
    let windowError;
    let byteBudget;
    try {
      cancellation(input.signal);
      for (const entry of entries) {
        entry.asset = structuredClone(entry.source);
        try { entry.plan = planCatalogueAssetMigration(entry.asset, options); }
        catch (error) { entry.error = error; throw error; }
        entry.transfers = entry.plan.objects.map(object => ({ role: object.role, index: object.index, status: 'not_started' }));
        entry.objects = new Array(entry.plan.objects.length).fill(null);
      }
      byteBudget = windowByteBudget(budget, entries, options);
    } catch (error) { windowError = error; }

    if (!windowError) {
      const stop = new AbortController();
      const signal = input.signal ? AbortSignal.any([input.signal, stop.signal]) : stop.signal;
      const tasks = entries.flatMap(entry => entry.plan.objects.map((object, index) => ({ entry, object, index })));
      let next = 0;
      const worker = async () => {
        while (!signal.aborted && next < tasks.length) {
          const { entry, object, index } = tasks[next++];
          const evidence = entry.transfers[index];
          evidence.status = 'running';
          try {
            entry.objects[index] = await copyObject(entry.asset, object, { ...input, signal, journal, phaseMetrics,
              transferDeadline: () => stop.abort(),
              transferFailure: error => { windowError ??= error; stop.abort(); },
              transferProgress: (_object, progress) => {
                Object.assign(evidence, progress);
                if (progress.stage === 'verified') evidence.status = 'verified';
              } }, options, byteBudget);
          } catch (error) {
            evidence.status = 'failed';
            evidence.code = error.code ?? 'operation_failed';
            entry.error ??= error;
            windowError ??= error;
            stop.abort();
          }
        }
      };
      // Workers catch transfer errors and bounded() drains the underlying adapter.
      // Do not publish or return until every started operation and append settles.
      await Promise.all(Array.from({ length: Math.min(options.concurrency, tasks.length) }, worker));
      await journalTail.catch(() => {});
      if (signal.aborted && !windowError) windowError = Object.assign(new Error('cancelled'), { code: 'cancelled' });
      for (const entry of entries) if (entry.objects.every(Boolean)) {
        entry.prepared = publicationPlan(entry.asset, entry.plan, entry.objects);
      }
    }
    if (windowError) {
      for (const entry of entries) results.push(stoppedEntry(entry,
        entry.error?.code ?? windowError.code ?? 'operation_failed'));
      return finish('stopped');
    }

    // The complete window has passed source, R2 and public CDN checks. Only this
    // ordered publication segment may now write SQL or publication journal events.
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      let publicationStarted = false;
      let published;
      try {
        cancellation(input.signal);
        await journal({ event: 'publication_pending', plan: structuredClone(entry.prepared) });
        cancellation(input.signal);
        publicationStarted = true;
        published = await measured(phaseMetrics, 'publish', () => input.publish(structuredClone(entry.prepared)));
        check(published?.applied === true, published?.applied === false ? 'publication_conflict' : 'publication_outcome_unknown');
        check(typeof published.updatedAt === 'string' && Number.isFinite(Date.parse(published.updatedAt)), 'publication_receipt_missing');
        const receipt = { ...entry.prepared, updatedAt: published.updatedAt, status: 'published' };
        await journal({ event: 'publication_complete', receipt: structuredClone(receipt) });
        results.push({ rowId: entry.asset.id, status: 'published', receipt });
      } catch (error) {
        const outcomeUnknown = publicationStarted && published?.applied !== false;
        results.push(stoppedEntry(entry, error.code ?? 'operation_failed', {
          status: outcomeUnknown ? 'publication_requires_reconciliation' : 'failed',
          ...(published?.updatedAt ? { updatedAt: published.updatedAt } : {}),
        }));
        for (const later of entries.slice(index + 1)) results.push(stoppedEntry(later, 'publication_window_stopped'));
        return finish('stopped');
      }
    }
  }
  return finish('complete');
}

/**
 * Bounded, copy-only migration. No I/O occurs unless execute === true.
 * journal(record) must durably acknowledge each record. publish(plan) MUST atomically
 * compare every plan.guard field (including JSON pointers), update only plan.patch,
 * and return { applied: true, updatedAt } or { applied: false }. It must not upsert.
 * Pins, credentials, candidate queries and an approved inventory belong to the CLI.
 * Retry only by re-reading current database rows: immutable keys make copy retries
 * safe, while stale rows fail CAS. No object deletion is part of this contract.
 */
export async function migrateCatalogueAssets(input) {
  const options = config(input);
  check(Array.isArray(input.assets) && input.assets.length <= options.maxAssets, 'batch_asset_limit_exceeded');
  check(new Set(input.assets.map((asset) => asset.id)).size === input.assets.length, 'duplicate_asset_row');
  if (input.execute === true) {
    check(input.destinationStorage?.id === 's3_compatible' && input.destinationStorage?.catalogueStorage === true
      && input.destinationStorage.catalogueBucket === options.destinationBucket, 'destination_not_configured_r2');
    check(typeof input.journal === 'function' && typeof input.publish === 'function', 'missing_publication_callbacks');
    check(typeof input.readSource === 'function' || typeof input.sourceStorage?.getObject === 'function', 'missing_source_reader');
  }
  if (input.execute === true && options.concurrency > 1) return migrateConcurrent(input, options);
  const results = [];
  const budget = { used: 0 };
  for (const sourceAsset of input.assets) {
    let asset;
    let prepared;
    let published;
    let publicationStarted = false;
    try {
      cancellation(input.signal);
      asset = structuredClone(sourceAsset);
      const plan = planCatalogueAssetMigration(asset, options);
      check(plan.knownBytes <= options.maxBatchBytes - budget.used, 'batch_byte_limit_exceeded');
      if (input.execute !== true) {
        budget.used += plan.knownBytes;
        results.push({ rowId: asset.id, status: 'planned', plan });
        continue;
      }
      const objects = [];
      for (const object of plan.objects) objects.push(await copyObject(asset, object, input, options, budget));
      prepared = publicationPlan(asset, plan, objects);
      cancellation(input.signal);
      await input.journal({ event: 'publication_pending', plan: structuredClone(prepared) });
      cancellation(input.signal);
      publicationStarted = true;
      published = await input.publish(structuredClone(prepared));
      check(published?.applied === true, published?.applied === false ? 'publication_conflict' : 'publication_outcome_unknown');
      check(typeof published.updatedAt === 'string' && Number.isFinite(Date.parse(published.updatedAt)), 'publication_receipt_missing');
      const receipt = { ...prepared, updatedAt: published.updatedAt, status: 'published' };
      await input.journal({ event: 'publication_complete', receipt: structuredClone(receipt) });
      results.push({ rowId: asset.id, status: 'published', receipt });
    } catch (error) {
      const outcomeUnknown = publicationStarted && published?.applied !== false;
      results.push({ rowId: sourceAsset?.id ?? null,
        status: outcomeUnknown ? 'publication_requires_reconciliation' : 'failed',
        code: error.code ?? 'operation_failed',
        ...(prepared ? { plan: prepared } : {}),
        ...(published?.updatedAt ? { updatedAt: published.updatedAt } : {}),
      });
      return { status: 'stopped', processedBytes: budget.used, results, remaining: input.assets.length - results.length };
    }
  }
  return { status: input.execute === true ? 'complete' : 'inventory', processedBytes: budget.used, results, remaining: 0 };
}

/** Restore pointers only through the same atomic CAS callback; never delete R2/source objects. */
export function createCatalogueMigrationRollback(receipt) {
  check(receipt?.status === 'published' && typeof receipt.updatedAt === 'string'
    && Number.isFinite(Date.parse(receipt.updatedAt)) && receipt.patch && receipt.before
    && identifier(receipt.rowId) && publicAssetId(receipt.assetId)
    && receipt.rowId === receipt.guard?.id && receipt.assetId === receipt.guard?.asset_id,
  'invalid_rollback_receipt');
  for (const values of [receipt.before, receipt.patch]) {
    check(typeof values === 'object' && !Array.isArray(values)
      && Object.keys(values).length > 0 && Object.keys(values).every((key) => POINTER_FIELDS.includes(key)),
    'rollback_contains_non_pointer_fields');
  }
  check(POINTER_FIELDS.every((key) => Object.hasOwn(receipt.before, key)), 'incomplete_rollback_before_image');
  check(receipt.before.storage_provider === 'supabase_storage' && receipt.patch.storage_provider === 's3_compatible',
    'invalid_rollback_providers');
  check(receipt.operationId === fingerprint({ rowId: receipt.rowId, snapshotHash: receipt.snapshotHash, patch: receipt.patch }),
    'invalid_rollback_operation');
  check(POINTER_FIELDS.every((key) => fingerprint(receipt.before[key]) === fingerprint(receipt.guard[key] ?? null)),
    'rollback_before_image_mismatch');
  return {
    rowId: receipt.rowId, assetId: receipt.assetId, operationId: `${receipt.operationId}:rollback`,
    guard: { ...structuredClone(receipt.guard), ...structuredClone(receipt.patch), updated_at: receipt.updatedAt },
    before: structuredClone(receipt.patch), patch: structuredClone(receipt.before),
  };
}


/** Reconstruct rollback authority only from a complete, digest-verified forward journal. */
export function validateCatalogueMigrationJournal(records, inventory, inventorySha256) {
  check(Array.isArray(records) && records.length > 0 && records.length <= 5000, 'invalid_journal_records');
  const first = records[0];
  check(first.event === 'migration_preflight' && first.inventorySha256 === inventorySha256
    && fingerprint(first.inventory) === fingerprint(inventory), 'journal_inventory_mismatch');
  check(Array.isArray(inventory.assets) && inventory.assets.length > 0 && inventory.assets.length <= 50,
    'invalid_journal_inventory');
  const beforeById = new Map(inventory.assets.map(asset => [asset.id, asset]));
  check(beforeById.size === inventory.assets.length, 'duplicate_journal_inventory_row');
  const completed = [];
  const seen = new Set();
  let pending = null;
  let committed = null;
  for (const record of records.slice(1)) {
    if (record.event === 'object_pending' || record.event === 'object_verified') {
      check(!pending && beforeById.has(record.rowId) && !seen.has(record.rowId), 'journal_object_order_invalid');
      continue;
    }
    if (record.event === 'publication_pending') {
      check(!pending && beforeById.has(record.plan?.rowId) && !seen.has(record.plan.rowId), 'journal_publication_order_invalid');
      const originalPlan = planCatalogueAssetMigration(beforeById.get(record.plan.rowId), inventory.options);
      check(record.plan.assetId === originalPlan.assetId && record.plan.snapshotHash === originalPlan.snapshotHash
        && fingerprint(record.plan.guard) === fingerprint(originalPlan.guard)
        && fingerprint(record.plan.before) === fingerprint(originalPlan.before), 'journal_plan_inventory_mismatch');
      pending = record.plan;
      continue;
    }
    if (record.event === 'database_cas_committed') {
      check(pending && !committed && record.operationId === pending.operationId
        && record.rowId === pending.rowId, 'journal_commit_order_invalid');
      const original = beforeById.get(record.rowId);
      check(fingerprint(record.before) === fingerprint(original)
        && pending.snapshotHash === fingerprint(original), 'journal_before_image_mismatch');
      check(record.after && typeof record.after.updated_at === 'string'
        && Number.isFinite(Date.parse(record.after.updated_at)), 'journal_after_image_invalid');
      const expectedAfter = { ...original, ...pending.patch, updated_at: record.after.updated_at };
      check(fingerprint(record.after) === fingerprint(expectedAfter), 'journal_after_image_mismatch');
      committed = record;
      continue;
    }
    if (record.event === 'publication_complete') {
      check(pending && committed && record.receipt?.status === 'published'
        && fingerprint(record.receipt) === fingerprint({ ...pending, updatedAt: committed.after.updated_at, status: 'published' }),
      'journal_receipt_mismatch');
      const plan = createCatalogueMigrationRollback(record.receipt);
      check(Object.entries(plan.guard).every(([key, value]) => fingerprint(committed.after[key]) === fingerprint(value)),
        'journal_rollback_guard_mismatch');
      completed.push({ receipt: record.receipt, before: committed.before, after: committed.after, plan });
      seen.add(pending.rowId);
      pending = null;
      committed = null;
      continue;
    }
    fail('unknown_journal_event');
  }
  check(!pending && !committed && completed.length === inventory.assets.length, 'journal_requires_reconciliation');
  return completed.reverse();
}
