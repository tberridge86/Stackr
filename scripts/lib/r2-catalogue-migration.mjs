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

// Existing adapters may not support abort yet. A late immutable PUT may finish after
// timeout; the abandoned operation never reaches the database publication callback.
async function bounded(operation, signal) {
  cancellation(signal);
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = () => reject(Object.assign(new Error('cancelled_or_deadline'), { code: 'cancelled_or_deadline' })); });
  signal.addEventListener('abort', rejectAbort, { once: true });
  try { return await Promise.race([Promise.resolve().then(() => { cancellation(signal); return operation(); }), aborted]); }
  finally { signal.removeEventListener('abort', rejectAbort); }
}

function checkedBytes(value, maximum, descriptor) {
  check(Buffer.isBuffer(value) || value instanceof Uint8Array, 'invalid_object_body');
  const bytes = Buffer.from(value);
  check(bytes.length > 0 && bytes.length <= maximum, 'object_byte_limit_exceeded');
  if (descriptor.byteSize != null) check(bytes.length === descriptor.byteSize, 'object_size_mismatch');
  if (descriptor.sha256) check(digest(bytes) === descriptor.sha256, 'object_hash_mismatch');
  return bytes;
}

async function publicBytes(url, expected, fetchImpl, signal) {
  const response = await bounded(() => fetchImpl(url, { signal, redirect: 'error', cache: 'no-store' }), signal);
  try {
    check(response.ok && !response.redirected && (!response.url || response.url === url), 'cdn_response_not_public_object');
    check(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === expected.mimeType, 'cdn_mime_mismatch');
    const declared = response.headers.get('content-length');
    if (declared !== null) check(Number(declared) === expected.byteSize, 'cdn_size_mismatch');
    check(response.body && typeof response.body.getReader === 'function', 'cdn_body_missing');
    const reader = response.body.getReader();
    const hash = createHash('sha256');
    let size = 0;
    try {
      while (true) {
        const chunk = await bounded(() => reader.read(), signal);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        check(size <= expected.byteSize, 'cdn_byte_limit_exceeded');
        hash.update(chunk.value);
      }
    } finally { void reader.cancel().catch(() => {}); }
    check(size === expected.byteSize && hash.digest('hex') === expected.sha256, 'cdn_hash_or_size_mismatch');
  } finally { if (!response.body?.locked) void response.body?.cancel().catch(() => {}); }
}

async function copyObject(asset, object, input, options, budget) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), options.objectTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  try {
    const remaining = options.maxBatchBytes - budget.used;
    check(remaining > 0 && (object.byteSize == null || object.byteSize <= remaining), 'batch_byte_limit_exceeded');
    const maxBytes = Math.min(options.maxObjectBytes, remaining);
    const reader = input.readSource ?? ((descriptor, readOptions) => {
      const storage = descriptor.provider === 's3_compatible' ? input.destinationStorage : input.sourceStorage;
      return storage.getObject(descriptor.bucket, descriptor.key, readOptions);
    });
    const body = checkedBytes(await bounded(() => reader(object, { maxBytes, signal }), signal), maxBytes, object);
    budget.used += body.length; // Budget measures source object bytes, including resumed objects.
    const sha256 = digest(body);
    // Public identifiers are opaque text, not filesystem paths (legacy IDs include
    // colons and may contain Unicode). Preserve the ID in metadata and hash it here.
    const key = `public/${asset.asset_type}/${asset.id}/${digest(asset.asset_id)}/${sha256}/${object.role}.${EXTENSIONS[object.mimeType]}`;
    const url = `${options.publicBaseUrl}/${key}`;
    check(input.destinationStorage.publicUrl(options.destinationBucket, key) === url, 'unexpected_public_object_url');
    const verified = { role: object.role, index: object.index, bucket: options.destinationBucket, key, url,
      mimeType: object.mimeType, byteSize: body.length, sha256 };
    // Durable intent exists even if the process dies immediately after PUT.
    await bounded(() => input.journal({ event: 'object_pending', rowId: asset.id, object: verified }), signal);
    let reused = false;
    try {
      await bounded(() => input.destinationStorage.putObject({ bucket: options.destinationBucket, key,
        body, contentType: object.mimeType, cacheControl: CACHE_CONTROL, upsert: false, signal }), signal);
    } catch (error) {
      if (![409, 412].includes(error.status)) throw error;
      reused = true;
    }
    checkedBytes(await bounded(() => input.destinationStorage.getObject(options.destinationBucket, key,
      { maxBytes: body.length, signal }), signal), body.length, verified);
    await publicBytes(url, verified, input.fetchImpl ?? globalThis.fetch, signal);
    cancellation(signal);
    await bounded(() => input.journal({ event: 'object_verified', rowId: asset.id, object: { ...verified, reused } }), signal);
    return { ...verified, reused };
  } finally { clearTimeout(timer); }
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

/**
 * Sequential, bounded, copy-only migration. No I/O occurs unless execute === true.
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
