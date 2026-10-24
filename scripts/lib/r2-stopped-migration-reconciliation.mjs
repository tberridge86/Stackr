import { Buffer, isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createCatalogueMigrationRollback, planCatalogueAssetMigration } from './r2-catalogue-migration.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const CACHE = 'public, max-age=31536000, immutable';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const OBJECT_KEYS = ['role', 'index', 'bucket', 'key', 'url', 'mimeType', 'byteSize', 'sha256'];
function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function fingerprint(value) { return hash(JSON.stringify(canonical(value))); }
function keys(value, expected, code) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...expected].sort()), code);
}
function decoded(bytes, approved, maximum, code) {
  check((Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.byteLength > 0
    && bytes.byteLength <= maximum && SHA.test(approved ?? '') && hash(bytes) === approved && isUtf8(bytes), code);
  return Buffer.from(bytes).toString('utf8');
}
function parsed(text, code) { try { return JSON.parse(text); } catch { check(false, code); } }

function expectedPatch(asset, objects) {
  const original = objects[0];
  const derivative_list = asset.derivative_list.map((derivative, index) => {
    const object = objects[index + 1];
    const next = { ...derivative, storageProvider: 's3_compatible', storageBucket: object.bucket,
      storageKey: object.key, contentSha256: object.sha256, byteSize: object.byteSize,
      cacheControl: CACHE, url: object.url, deliveryUrl: object.url };
    const aliases = { storage_provider: 's3_compatible', storage_bucket: object.bucket, storage_key: object.key,
      storage_path: object.key, key: object.key, path: object.key, content_sha256: object.sha256,
      sha256: object.sha256, byte_size: object.byteSize, delivery_url: object.url };
    for (const [key, value] of Object.entries(aliases)) if (Object.hasOwn(derivative, key)) next[key] = value;
    return next;
  });
  const patch = { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list, cache_control: CACHE };
  if (asset.archival_storage_key) patch.archival_storage_key = original.key;
  return patch;
}

function checkedObject(object, asset, descriptor, options) {
  keys(object, OBJECT_KEYS, 'stopped_object_shape_invalid');
  check(descriptor && object.role === descriptor.role && object.index === descriptor.index
    && object.mimeType === descriptor.mimeType && object.bucket === options.destinationBucket
    && SHA.test(object.sha256 ?? '') && Number.isSafeInteger(object.byteSize) && object.byteSize > 0
    && object.byteSize <= options.maxObjectBytes && (!descriptor.sha256 || descriptor.sha256 === object.sha256)
    && (descriptor.byteSize === null || descriptor.byteSize === object.byteSize), 'stopped_object_identity_mismatch');
  const key = 'public/' + asset.asset_type + '/' + asset.id + '/' + hash(asset.asset_id)
    + '/' + object.sha256 + '/' + object.role + '.' + EXT[object.mimeType];
  check(object.key === key && object.url === options.publicBaseUrl + '/' + key, 'stopped_object_destination_mismatch');
}

/**
 * Read-only reconciliation evidence for the original 25-row, 30-second CLI batch.
 * Digests bind WHOLE original files. Never substitute a prefix inventory/journal.
 * This accepts only a known object-copy deadline before failed-row publication.
 * It does NOT attest current DB state, authorize execution, modify a lock, or make
 * the old run resumable. Compare every returned after/before row in one read-only
 * DB snapshot first. Returned rollback plans remain bound to original receipts.
 */
export function validateStoppedCatalogueMigrationJournal({ inventoryBytes, inventorySha256,
  journalBytes, journalSha256, executionBytes, executionSha256, expectedFailure }) {
  const inventory = parsed(decoded(inventoryBytes, inventorySha256, 4 * 1024 * 1024, 'stopped_inventory_digest_invalid'), 'stopped_inventory_json_invalid');
  const journalText = decoded(journalBytes, journalSha256, 32 * 1024 * 1024, 'stopped_journal_digest_invalid');
  const execution = parsed(decoded(executionBytes, executionSha256, 32 * 1024 * 1024, 'stopped_execution_digest_invalid'), 'stopped_execution_json_invalid');
  check(journalText.endsWith('\n'), 'stopped_journal_truncated');
  const lines = journalText.slice(0, -1).split('\n');
  check(lines.length > 0 && lines.length <= 5000 && lines.every((line) => line.trim().length > 0), 'stopped_journal_records_invalid');
  const records = lines.map((line) => parsed(line, 'stopped_journal_json_invalid'));
  check(inventory?.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory'
    && inventory.expectedRef === 'oakdbbzdqwurpjnoqhmu'
    && inventory.sourceOrigin === 'https://oakdbbzdqwurpjnoqhmu.supabase.co'
    && inventory.limit === 25 && inventory.options?.maxAssets === 25
    && inventory.options.sourceBucket === 'stackr-catalogue-public'
    && inventory.options.objectTimeoutMs === 30000
    && inventory.options.maxBatchBytes <= 250 * 1024 * 1024
    && inventory.options.maxObjectBytes <= 12 * 1024 * 1024
    && Array.isArray(inventory.assets) && inventory.assets.length === 25, 'stopped_inventory_scope_invalid');
  check(inventory.afterId === null || UUID.test(inventory.afterId ?? ''), 'stopped_inventory_cursor_invalid');
  let prior = inventory.afterId;
  const plans = inventory.assets.map((asset) => {
    check(UUID.test(asset?.id ?? '') && (!prior || asset.id > prior), 'stopped_inventory_order_invalid');
    prior = asset.id;
    return planCatalogueAssetMigration(asset, inventory.options);
  });
  check(inventory.nextAfterId === prior && inventory.exhausted === false, 'stopped_inventory_cursor_invalid');
  check(Number.isSafeInteger(expectedFailure?.publishedCount) && expectedFailure.publishedCount >= 0
    && expectedFailure.publishedCount < inventory.assets.length && expectedFailure.code === 'cancelled_or_deadline'
    && UUID.test(expectedFailure.rowId ?? '')
    && inventory.assets[expectedFailure.publishedCount].id === expectedFailure.rowId, 'stopped_expected_failure_invalid');
  keys(execution, ['exitCode', 'signal', 'result'], 'stopped_execution_shape_invalid');
  check(execution.exitCode === 1 && execution.signal === null, 'stopped_execution_outcome_ambiguous');
  const result = execution.result;
  keys(result, ['status', 'processedBytes', 'results', 'remaining'], 'stopped_result_shape_invalid');
  const publishedCount = expectedFailure.publishedCount;
  check(result.status === 'stopped' && Array.isArray(result.results)
    && result.results.length === publishedCount + 1
    && result.remaining === inventory.assets.length - result.results.length
    && Number.isSafeInteger(result.processedBytes) && result.processedBytes >= 0
    && result.processedBytes <= inventory.options.maxBatchBytes, 'stopped_result_bounds_invalid');
  for (let index = 0; index < publishedCount; index += 1) {
    keys(result.results[index], ['rowId', 'status', 'receipt'], 'stopped_result_prefix_invalid');
    check(result.results[index].rowId === inventory.assets[index].id && result.results[index].status === 'published', 'stopped_result_prefix_invalid');
  }
  const failed = result.results[publishedCount];
  keys(failed, ['rowId', 'status', 'code'], 'stopped_failed_publication_ambiguous');
  check(failed.rowId === expectedFailure.rowId && failed.status === 'failed'
    && failed.code === expectedFailure.code, 'stopped_failed_publication_ambiguous');
  const first = records[0];
  check(first?.event === 'migration_preflight' && first.inventorySha256 === inventorySha256
    && same(first.inventory, inventory)
    && first.railwayServiceId === 'b5410607-a591-420e-a506-fe184ce7455b'
    && first.railwayEnvironmentId === 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', 'stopped_preflight_mismatch');

  const publishedOperations = [];
  let verified = [];
  let pendingObject = null;
  let pendingPublication = null;
  let committed = null;
  let processedBytes = 0;
  for (const record of records.slice(1)) {
    check(record && typeof record === 'object' && !Array.isArray(record), 'stopped_record_invalid');
    const index = publishedOperations.length;
    const asset = inventory.assets[index];
    const plan = plans[index];
    check(index <= publishedCount && asset, 'stopped_unattempted_row_activity');
    if (record.event === 'object_pending') {
      keys(record, ['event', 'rowId', 'object'], 'stopped_object_record_invalid');
      check(!pendingPublication && !committed && !pendingObject && record.rowId === asset.id
        && verified.length < plan.objects.length, 'stopped_object_order_invalid');
      checkedObject(record.object, asset, plan.objects[verified.length], inventory.options);
      pendingObject = record.object;
      processedBytes += pendingObject.byteSize;
      check(processedBytes <= inventory.options.maxBatchBytes, 'stopped_byte_budget_invalid');
    } else if (record.event === 'object_verified') {
      keys(record, ['event', 'rowId', 'object'], 'stopped_object_record_invalid');
      check(!pendingPublication && !committed && pendingObject && record.rowId === asset.id
        && typeof record.object?.reused === 'boolean'
        && same(record.object, { ...pendingObject, reused: record.object.reused }), 'stopped_object_verification_mismatch');
      verified.push(record.object);
      pendingObject = null;
    } else if (record.event === 'publication_pending') {
      keys(record, ['event', 'plan'], 'stopped_publication_record_invalid');
      check(index < publishedCount && !pendingPublication && !committed && !pendingObject
        && verified.length === plan.objects.length, 'stopped_publication_requires_reconciliation');
      const patch = expectedPatch(asset, verified);
      const expected = { ...plan, objects: verified, patch,
        operationId: fingerprint({ rowId: asset.id, snapshotHash: plan.snapshotHash, patch }) };
      check(same(record.plan, expected), 'stopped_publication_plan_mismatch');
      pendingPublication = record.plan;
    } else if (record.event === 'database_cas_committed') {
      keys(record, ['event', 'operationId', 'rowId', 'before', 'after'], 'stopped_commit_record_invalid');
      check(pendingPublication && !committed && record.rowId === asset.id
        && record.operationId === pendingPublication.operationId && same(record.before, asset)
        && typeof record.after?.updated_at === 'string' && Number.isFinite(Date.parse(record.after.updated_at))
        && same(record.after, { ...asset, ...pendingPublication.patch, updated_at: record.after.updated_at }), 'stopped_commit_mismatch');
      committed = record;
    } else if (record.event === 'publication_complete') {
      keys(record, ['event', 'receipt'], 'stopped_receipt_record_invalid');
      check(pendingPublication && committed
        && same(record.receipt, { ...pendingPublication, updatedAt: committed.after.updated_at, status: 'published' })
        && same(record.receipt, result.results[index].receipt), 'stopped_receipt_mismatch');
      const rollback = createCatalogueMigrationRollback(record.receipt);
      check(Object.entries(rollback.guard).every(([key, value]) => same(committed.after[key], value)), 'stopped_rollback_guard_mismatch');
      publishedOperations.push({ receipt: record.receipt, before: committed.before, after: committed.after, plan: rollback });
      verified = [];
      pendingPublication = null;
      committed = null;
    } else check(false, 'stopped_unknown_journal_event');
  }
  check(publishedOperations.length === publishedCount && !pendingPublication && !committed
    && verified.length < plans[publishedCount].objects.length
    && processedBytes === result.processedBytes, 'stopped_terminal_boundary_invalid');
  return { inventory, publishedOperations, failedRow: inventory.assets[publishedCount],
    remainingRows: inventory.assets.slice(publishedCount + 1), verifiedTailObjects: verified,
    pendingTailObject: pendingObject, hashes: { inventorySha256, journalSha256, executionSha256 } };
}
