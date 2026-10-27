// Read-only completed-run receipt inspection. Does not resume or certify live database/public retrieval.
// Derived from the reviewed recovered-A inspector; journal/checkpoint validators are unchanged.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';

const RUN_IDS = Object.freeze(['production-recovered-20261027b']);
const ACCEPTANCE_SHA = 'bd06069c8ee2670a0d9c763df80b40f6b42a11f6ce67e16ec3ad7e703a219327';
const CERTIFICATE_SHA = '11a6eaf278ab4f45e99097a6e40a636a9016cffa1fc024a6a9b04a81eca0bfb2';
const ROOT = '/data/r2-catalogue-migration';
const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const SOURCE_COMMIT = '6dfe188166df76b41d44801ab66970b0a3881ae5';
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_BATCHES = 135;
const TERMINAL_EXECUTION_RESULT_SHA = '6a18551d52189e8b29bac59162037cff42a9283b122a9d2bf4df738bf13d359a';
const MAX_FILES = MAX_BATCHES * 8 + 2;
const OPTIONS = Object.freeze({ sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-public',
  publicBaseUrl: 'https://assets.stackrtcg.com', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000, concurrency: 8 });
const LIMITS = { 'intent.json': 65536, 'inventory.json': 4194304, 'inventory-result.json': 33554432,
  'inventory.json.sha256.json': 4096, 'events.jsonl': 33554432, 'execute-result.json': 33554432,
  'checkpoint.json': 65536, 'error.json': 65536 };
const SOURCE_HASHES = Object.freeze({
  'run-r2-catalogue-migration.mjs': '015b6b36f19840c367be96a5a8a18605e4ad36fe2d813e7ff574f10e4a1adadc',
  'inspect-r2-bulk-run.mjs': '72b5c6765e03d74d98aef38b21f0148627f7ec437298f23661c83320e453e7d3',
  'migrate-catalogue-to-r2.mjs': '757abcbc4347d186ce481746f4d704c63228f3b7644df9890f56e73b0a8f13dd',
  'lib/r2-catalogue-migration.mjs': 'd05fdae0f9d7280b70f03aad681eb2b01e6b31b7d4c11acab31745c4ed14b922',
  'deploy/verified-supabase-postgres.mjs': '8e2bf4f392a465fad9bd6669dba5b68fb081a6ca9489b5b4d3b75ac5e5327cb7',
});
const PHASES = ['source', 'put', 'r2Read', 'cdn', 'journal', 'publish'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const CACHE = 'public, max-age=31536000, immutable';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = sequence => 'batch-' + String(sequence).padStart(6, '0') + '.';
function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const finite = value => Number.isFinite(value) && value >= 0;
function shape(value, required, optional = []) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'cutover_invalid_shape');
}
function bound(name) {
  if (name === 'run.json' || name === 'runner.lock') return 65536;
  const match = /^batch-(\d{6})\.(.+)$/.exec(name);
  check(match && Number(match[1]) >= 1 && Number(match[1]) <= MAX_BATCHES && Object.hasOwn(LIMITS, match[2]), 'cutover_unexpected_file');
  return LIMITS[match[2]];
}

// Only O_RDONLY opens are available in this module. Reject links, devices,
// growth during reads, changed metadata, and files exceeding their fixed bounds.
async function readBounded(filename, maximum, retain = true) {
  check(Number.isSafeInteger(maximum) && maximum > 0, 'cutover_invalid_read_bound');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    check(before.isFile() && before.size <= maximum, 'cutover_invalid_evidence_file');
    const digest = createHash('sha256'); const chunks = []; let size = 0;
    const chunk = Buffer.alloc(Math.min(65536, maximum + 1));
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, maximum - size + 1), null);
      if (!bytesRead) break;
      size += bytesRead; check(size <= maximum, 'cutover_evidence_overflow');
      digest.update(chunk.subarray(0, bytesRead));
      if (retain) chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    const after = await handle.stat();
    check(size === before.size && after.size === before.size && after.ino === before.ino
      && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'cutover_evidence_changed');
    return { bytes: size, sha256: digest.digest('hex'), ...(retain ? { content: Buffer.concat(chunks, size) } : {}) };
  } finally { await handle.close(); }
}
function assertUid() {
  check(typeof process.getuid === 'function' && typeof process.geteuid === 'function'
    && process.getuid() === 1000 && process.geteuid() === 1000, 'cutover_unprivileged_uid_required');
}
function assertProject(env) {
  const origin = 'https://' + REF + '.supabase.co';
  check([origin, origin + '/'].includes(env.SUPABASE_URL), 'cutover_supabase_url_pin_mismatch');
  let database; let username;
  try { database = new URL(env.SUPABASE_DB_URL); username = decodeURIComponent(database.username); }
  catch { check(false, 'cutover_database_identity_required'); }
  const direct = database.hostname === 'db.' + REF + '.supabase.co' && ['postgres', 'postgres.' + REF].includes(username);
  const pooled = database.hostname.endsWith('.pooler.supabase.com') && username === 'postgres.' + REF;
  check(['postgres:', 'postgresql:'].includes(database.protocol) && (direct || pooled)
    && database.pathname === '/postgres' && !database.hash, 'cutover_database_project_pin_mismatch');
}
async function readMountInfo() {
  const handle = await open('/proc/self/mountinfo', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    check((await handle.stat()).isFile(), 'cutover_mountinfo_file_required');
    const chunks = []; let size = 0; const chunk = Buffer.alloc(65536);
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, 1048576 - size + 1), null);
      if (!bytesRead) break;
      size += bytesRead; check(size <= 1048576, 'cutover_mountinfo_bound');
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally { await handle.close(); }
}
async function assertHost(env) {
  check(process.platform === 'linux' && env.RAILWAY_SERVICE_ID === SERVICE
    && env.RAILWAY_ENVIRONMENT_ID === ENVIRONMENT && env.RAILWAY_PROJECT_ID === PROJECT, 'cutover_host_mismatch');
  check(env.RAILWAY_VOLUME_MOUNT_PATH === '/data' && await realpath('/data') === '/data', 'cutover_data_volume_required');
  const mounted = (await readMountInfo()).split('\n').some(line => {
    const fields = line.split(' ');
    return fields.length > 6 && fields[4] === '/data' && fields[5].split(',').includes('rw') && line.includes(' - ');
  });
  check(mounted, 'cutover_data_mount_required');
}
async function runtimeDependencies() {
  assertUid();
  let coreBytes;
  const scripts = path.resolve(process.cwd(), 'scripts');
  async function verifySourceFiles() {
    check(await realpath(scripts) === scripts, 'cutover_source_directory_link');
    const files = [];
    for (const [name, expected] of Object.entries(SOURCE_HASHES)) {
      const filename = path.resolve(scripts, name);
      check(await realpath(filename) === filename, 'cutover_source_file_link');
      const value = await readBounded(filename, 262144, name === 'lib/r2-catalogue-migration.mjs');
      check(value.bytes > 0 && value.sha256 === expected, 'cutover_source_mismatch');
      files.push({ name, bytes: value.bytes, sha256: value.sha256 });
      if (value.content) coreBytes = value.content;
    }
    return files;
  }
  // Verify bytes before importing. The pinned core imports only Node builtins;
  // importing runner/helper/CLI modules would unnecessarily expose mutating code.
  await verifySourceFiles();
  const core = await import('data:text/javascript;base64,' + coreBytes.toString('base64'));
  return {
    assertBulkInspectionUid: assertUid, assertRunnerProject: assertProject, assertHostedRunner: assertHost,
    verifySourceFiles, realpath, readBulkInspectionFile: readBounded,
    planCatalogueAssetMigration: core.planCatalogueAssetMigration,
    validateCatalogueMigrationJournal: core.validateCatalogueMigrationJournal,
    createCatalogueMigrationRollback: core.createCatalogueMigrationRollback,
    async list(directory) {
      const entries = [];
      for await (const entry of await opendir(directory)) {
        check(entries.length < MAX_FILES, 'cutover_file_bound');
        entries.push({ name: entry.name, regular: entry.isFile() });
      }
      return entries;
    },
  };
}

async function snapshot(deps, DIRECTORY) {
  check(await deps.realpath(ROOT) === ROOT && await deps.realpath(DIRECTORY) === DIRECTORY, 'cutover_symlink_directory');
  const entries = await deps.list(DIRECTORY);
  check(Array.isArray(entries) && entries.length > 0 && entries.length <= MAX_FILES
    && entries.every(entry => entry.regular === true)
    && new Set(entries.map(entry => entry.name)).size === entries.length, 'cutover_invalid_files');
  const files = []; let totalBytes = 0;
  for (const name of entries.map(entry => entry.name).sort()) {
    const maximum = bound(name);
    const file = await deps.readBulkInspectionFile(DIRECTORY + '/' + name, maximum, false);
    check(Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= maximum
      && (file.bytes > 0 || name.endsWith('.events.jsonl')) && SHA.test(file.sha256 ?? ''), 'cutover_invalid_file');
    files.push({ name, bytes: file.bytes, sha256: file.sha256 });
    totalBytes += file.bytes; check(totalBytes <= 5 * 1024 ** 3, 'cutover_total_bytes_exceeded');
  }
  return files;
}
async function acceptanceEvidence(deps) {
  const filename = ROOT + '/' + RUN_IDS[0] + '.acceptance.json';
  check(await deps.realpath(ROOT) === ROOT && await deps.realpath(filename) === filename, 'cutover_acceptance_link');
  const file = await deps.readBulkInspectionFile(filename, 65536, true);
  check(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 65536
    && Buffer.isBuffer(file.content) && file.content.length === file.bytes
    && hash(file.content) === ACCEPTANCE_SHA && file.sha256 === ACCEPTANCE_SHA, 'cutover_acceptance_mismatch');
  const value = json(file.content);
  check(value.schemaVersion === 1 && value.kind === 'stackr-r2-linked-continuation' && value.runId === RUN_IDS[0]
    && same(value.parentRunIds, ['production-recovered-20261027a'])
    && value.certificateSha256 === CERTIFICATE_SHA && hash(JSON.stringify(value.certificate)) === CERTIFICATE_SHA
    && value.confirmedGlobalBaseline === 58734 && value.eligibleTotal === 62098 && value.newRunStartsFromNull === true
    && value.parentEvidencePreserved === true && value.sourceObjectsDeleted === 0, 'cutover_acceptance_invalid');
  return { receiptSha256: ACCEPTANCE_SHA, certificateSha256: CERTIFICATE_SHA, bytes: file.bytes,
    parentRunIds: value.parentRunIds, confirmedGlobalBaseline: 58734, eligibleTotal: 62098,
    newRunStartsFromNull: true, parentEvidencePreserved: true };
}
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
  return { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list, cache_control: CACHE,
    ...(asset.archival_storage_key ? { archival_storage_key: original.key } : {}) };
}
function objectIdentity(object, asset, descriptor, reused = false) {
  shape(object, ['role', 'index', 'bucket', 'key', 'url', 'mimeType', 'byteSize', 'sha256'], reused ? ['reused'] : []);
  check(descriptor && object.role === descriptor.role && object.index === descriptor.index
    && object.mimeType === descriptor.mimeType && object.bucket === OPTIONS.destinationBucket
    && SHA.test(object.sha256 ?? '') && Number.isSafeInteger(object.byteSize)
    && object.byteSize > 0 && object.byteSize <= OPTIONS.maxObjectBytes
    && (!descriptor.sha256 || descriptor.sha256 === object.sha256)
    && (descriptor.byteSize === null || descriptor.byteSize === object.byteSize), 'cutover_object_identity');
  const key = 'public/' + asset.asset_type + '/' + asset.id + '/' + hash(asset.asset_id)
    + '/' + object.sha256 + '/' + object.role + '.' + EXT[object.mimeType];
  check(object.key === key && object.url === OPTIONS.publicBaseUrl + '/' + key, 'cutover_object_location');
  if (reused) check(typeof object.reused === 'boolean', 'cutover_object_reused');
}
// Complete journals use the unchanged core validator as an additional check.
// Prefixes use a strict parser; no fabricated receipt or altered inventory is
// passed to the original validator to make an incomplete journal succeed.
function journalState(bytes, inventory, inventorySha256, deps) {
  const plans = new Map(inventory.assets.map(asset => [asset.id, deps.planCatalogueAssetMigration(asset, OPTIONS)]));
  const assets = new Map(inventory.assets.map(asset => [asset.id, asset]));
  const pending = new Map(); const verified = new Map(); const operations = [];
  let publication = null; let committed = null; let records = [];
  if (bytes.length) {
    check(bytes.at(-1) === 10, 'cutover_journal_truncated');
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).slice(0, -1).split('\n');
    check(lines.length <= 5000 && lines.every(line => line.length > 0), 'cutover_journal_bound');
    records = lines.map(line => JSON.parse(line));
    check(same(records[0], { event: 'migration_preflight', inventorySha256, inventory,
      railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT }), 'cutover_journal_preflight');
  }
  const preparedPlan = rowId => {
    const plan = plans.get(rowId); const asset = assets.get(rowId);
    check(plan && asset, 'cutover_publication_identity');
    const objects = plan.objects.map(descriptor => verified.get(rowId + ':' + descriptor.role));
    check(objects.every(Boolean), 'cutover_publication_unverified');
    const patch = expectedPatch(asset, objects);
    return { ...plan, objects, patch, operationId: fingerprint({ rowId, snapshotHash: plan.snapshotHash, patch }) };
  };
  for (const record of records.slice(1)) {
    if (record.event === 'object_pending' || record.event === 'object_verified') {
      shape(record, ['event', 'rowId', 'object']);
      const index = inventory.assets.findIndex(asset => asset.id === record.rowId);
      const descriptor = plans.get(record.rowId)?.objects.find(value => value.role === record.object?.role);
      check(!publication && operations.length % 8 === 0 && index >= operations.length
        && index < Math.min(operations.length + 8, inventory.assets.length) && descriptor, 'cutover_object_order');
      const identity = record.rowId + ':' + descriptor.role;
      if (record.event === 'object_pending') {
        check(!pending.has(identity), 'cutover_duplicate_object');
        objectIdentity(record.object, assets.get(record.rowId), descriptor);
        pending.set(identity, record.object);
        check([...pending.values()].reduce((sum, value) => sum + value.byteSize, 0) <= OPTIONS.maxBatchBytes, 'cutover_batch_bytes');
      } else {
        check(pending.has(identity) && !verified.has(identity) && typeof record.object?.reused === 'boolean'
          && same(record.object, { ...pending.get(identity), reused: record.object.reused }), 'cutover_object_verification');
        verified.set(identity, record.object);
      }
    } else if (record.event === 'publication_pending') {
      shape(record, ['event', 'plan']);
      const rowId = inventory.assets[operations.length]?.id;
      check(!publication && !committed && record.plan?.rowId === rowId, 'cutover_publication_order');
      const windowStart = Math.floor(operations.length / 8) * 8;
      for (const asset of inventory.assets.slice(windowStart, windowStart + 8)) {
        check(plans.get(asset.id).objects.every(object => verified.has(asset.id + ':' + object.role)), 'cutover_window_not_verified');
      }
      check(same(record.plan, preparedPlan(rowId)), 'cutover_publication_plan');
      publication = record.plan;
    } else if (record.event === 'database_cas_committed') {
      shape(record, ['event', 'operationId', 'rowId', 'before', 'after']);
      check(publication && !committed && record.rowId === publication.rowId && record.operationId === publication.operationId
        && same(record.before, assets.get(record.rowId)) && typeof record.after?.updated_at === 'string'
        && Number.isFinite(Date.parse(record.after.updated_at))
        && same(record.after, { ...record.before, ...publication.patch, updated_at: record.after.updated_at }), 'cutover_commit');
      committed = record;
    } else if (record.event === 'publication_complete') {
      shape(record, ['event', 'receipt']);
      check(publication && committed && same(record.receipt,
        { ...publication, updatedAt: committed.after.updated_at, status: 'published' }), 'cutover_receipt');
      deps.createCatalogueMigrationRollback(record.receipt);
      operations.push({ before: committed.before, after: committed.after, receipt: record.receipt });
      publication = null; committed = null;
    } else check(false, 'cutover_unknown_journal_event');
  }
  const complete = operations.length === inventory.assets.length && !publication;
  if (complete && inventory.assets.length) {
    const original = deps.validateCatalogueMigrationJournal(records, inventory, inventorySha256).reverse();
    check(same(original.map(item => ({ before: item.before, after: item.after, receipt: item.receipt })), operations),
      'cutover_original_validator_disagrees');
  }
  return { records, plans, pending, verified, operations, publication, committed, preparedPlan, complete,
    expectedRows: inventory.assets.map((asset, index) => index < operations.length ? operations[index].after : asset),
    processedBytes: [...pending.values()].reduce((sum, object) => sum + object.byteSize, 0) };
}
function metrics(result, objects, assets, complete) {
  shape(result.phaseMetrics, ['concurrency', 'elapsedMs', ...PHASES]);
  check(result.phaseMetrics.concurrency === 8 && finite(result.phaseMetrics.elapsedMs), 'cutover_metrics');
  for (const phase of PHASES) {
    const value = result.phaseMetrics[phase]; shape(value, ['count', 'elapsedMs']);
    check(Number.isSafeInteger(value.count) && value.count >= 0 && value.count <= 5000 && finite(value.elapsedMs), 'cutover_metrics');
    if (complete) check(value.count === (phase === 'publish' ? assets : phase === 'journal' ? 2 * objects + 2 * assets : objects), 'cutover_metrics_count');
  }
}
function executionState(execution, inventory, state, completeRequired) {
  shape(execution, ['exitCode', 'signal', 'result']);
  const result = execution.result; shape(result, ['status', 'processedBytes', 'results', 'remaining', 'phaseMetrics']);
  check(Number.isSafeInteger(result.processedBytes) && result.processedBytes >= state.processedBytes
    && result.processedBytes <= OPTIONS.maxBatchBytes && Array.isArray(result.results)
    && result.results.length <= inventory.assets.length && result.remaining === inventory.assets.length - result.results.length, 'cutover_execution');
  const complete = result.status === 'complete';
  check(complete || (!completeRequired && result.status === 'stopped'), 'cutover_execution_status');
  check(execution.exitCode === (complete ? 0 : 1) && execution.signal === null, 'cutover_execution_exit');
  if (complete) check(state.complete && result.remaining === 0 && result.processedBytes === state.processedBytes, 'cutover_execution_complete');
  check(result.results.length >= state.operations.length, 'cutover_execution_receipt_count');
  for (let index = 0; index < result.results.length; index++) {
    const item = result.results[index]; const asset = inventory.assets[index];
    if (index < state.operations.length) {
      check(same(item, { rowId: asset.id, status: 'published', receipt: state.operations[index].receipt }), 'cutover_execution_receipt');
      continue;
    }
    shape(item, ['rowId', 'status', 'code', 'transfers'], ['plan', 'updatedAt']);
    check(item.rowId === asset.id && ['failed', 'publication_requires_reconciliation'].includes(item.status)
      && typeof item.code === 'string' && item.code.length <= 4096
      && Array.isArray(item.transfers) && item.transfers.length === state.plans.get(asset.id).objects.length, 'cutover_execution_failure');
    if (Object.hasOwn(item, 'plan')) check(same(item.plan, state.preparedPlan(asset.id)), 'cutover_execution_plan');
    if (Object.hasOwn(item, 'updatedAt')) check(typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)), 'cutover_execution_timestamp');
    for (const [objectIndex, transfer] of item.transfers.entries()) {
      shape(transfer, ['role', 'index', 'status'], ['stage', 'object', 'code']);
      const descriptor = state.plans.get(asset.id).objects[objectIndex];
      check(transfer.role === descriptor.role && transfer.index === descriptor.index
        && ['not_started', 'running', 'failed', 'verified'].includes(transfer.status), 'cutover_execution_transfer');
      if (Object.hasOwn(transfer, 'stage')) check(['prepared', 'pending', 'verified'].includes(transfer.stage), 'cutover_execution_stage');
      if (Object.hasOwn(transfer, 'object')) objectIdentity(transfer.object, asset, descriptor, Object.hasOwn(transfer.object, 'reused'));
      if (transfer.status === 'verified' || transfer.stage === 'verified') check(same(transfer.object,
        state.verified.get(asset.id + ':' + descriptor.role)), 'cutover_execution_unverified');
      if (Object.hasOwn(transfer, 'code')) check(typeof transfer.code === 'string' && transfer.code.length <= 4096, 'cutover_execution_code');
    }
  }
  metrics(result, state.pending.size, inventory.assets.length, complete);
}

// An arbitrary provider exception is private input, even if it looks like an
// identifier. Only these source-defined failure codes may be logged verbatim.
const KNOWN_CODES = new Set(['operation_failed', 'cancelled', 'cancelled_or_deadline',
  'batch_byte_limit_exceeded', 'object_byte_limit_exceeded', 'object_hash_mismatch', 'object_size_mismatch',
  'cdn_body_missing', 'cdn_byte_limit_exceeded', 'cdn_hash_or_size_mismatch', 'cdn_mime_mismatch',
  'cdn_response_not_public_object', 'cdn_size_mismatch', 'unexpected_public_object_url',
  'publication_conflict', 'publication_outcome_unknown', 'publication_receipt_missing', 'publication_window_stopped',
  'source_object_too_large', 'source_public_read_failed', 'source_mime_mismatch', 'source_body_missing',
  'empty_source_object', 'unsafe_source_key', 'unexpected_public_source', 'destination_not_configured_r2', 'runner_execution_incomplete',
  'runner_capacity_not_admitted', 'runner_cli_failed', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
  'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ENOSPC', 'EIO', 'EROFS', '57014', '53300', '08006', '40001']);
function safeCode(value) {
  if (value === undefined || value === null) return null;
  check(typeof value === 'string' && value.length <= 4096, 'cutover_code_bound');
  return { code: KNOWN_CODES.has(value) ? value : 'unrecognized_code', codeSha256: hash(value) };
}
function withoutUpdatedAt(value) { const copy = { ...value }; delete copy.updated_at; return copy; }
// Public source metadata is emitted only for this explicit content-addressed
// layout. Arbitrary legacy keys can contain private metadata and stay redacted.
function publicSourceFailure(descriptor) {
  if (!descriptor || descriptor.provider !== 'supabase_storage' || descriptor.bucket !== OPTIONS.sourceBucket
    || !SHA.test(descriptor.sha256 ?? '') || !Number.isSafeInteger(descriptor.byteSize)
    || descriptor.byteSize < 1 || descriptor.byteSize > OPTIONS.maxObjectBytes) return null;
  const parts = typeof descriptor.key === 'string' ? descriptor.key.split('/') : [];
  if (parts.length !== 6 || parts[0] !== 'public' || parts[1] !== 'card_image'
    || parts[2] !== descriptor.sha256.slice(0, 2) || parts[3] !== descriptor.sha256.slice(2, 4)
    || parts[4] !== descriptor.sha256 || parts[5] !== descriptor.role + '.' + EXT[descriptor.mimeType]) return null;
  return { provider: descriptor.provider, bucket: descriptor.bucket, key: descriptor.key,
    url: 'https://' + REF + '.supabase.co/storage/v1/object/public/' + descriptor.bucket + '/' + descriptor.key,
    mimeType: descriptor.mimeType, byteSize: descriptor.byteSize, sha256: descriptor.sha256,
    liveVerified: false };
}
function tailEvidence(runId, sequence, inventory, state, execution) {
  const events = [];
  for (const [index, asset] of inventory.assets.entries()) {
    const operation = state.operations[index];
    const publication = state.publication?.rowId === asset.id ? state.publication : null;
    const commit = state.committed?.rowId === asset.id ? state.committed : null;
    const outcome = execution?.result.results[index];
    const status = operation ? 'published_receipt' : commit ? 'commit_without_receipt'
      : publication ? 'publication_pending_outcome_unknown' : 'no_publication_record';
    // Expected snapshots are journal expectations only. No current DB rows are read.
    const expected = operation ? operation.after : !publication ? asset : null;
    const preparedAfter = operation?.after ?? (publication ? { ...asset, ...publication.patch } : null);
    const failures = (outcome?.transfers ?? []).filter(value => value.status === 'failed').map(value => ({
      role: value.role, index: value.index, stage: value.stage ?? null, ...safeCode(value.code),
    }));
    events.push({ event: 'r2_tail_diagnostic_row', runId, sequence, inventoryIndex: index, rowId: asset.id, status,
      beforeSnapshotSha256: fingerprint(asset), journalExpectedSnapshotSha256: expected ? fingerprint(expected) : null,
      recordedCommitSnapshotSha256: commit ? fingerprint(commit.after) : null,
      preparedAfterWithoutUpdatedAtSha256: preparedAfter ? fingerprint(withoutUpdatedAt(preparedAfter)) : null,
      operationId: operation?.receipt.operationId ?? publication?.operationId ?? null,
      receiptSha256: operation ? fingerprint(operation.receipt) : null,
      executionStatus: outcome?.status ?? 'not_reported', failure: safeCode(outcome?.code), transferFailures: failures,
      databaseCompared: false,
    });
    const objects = state.plans.get(asset.id).objects.map(descriptor => {
      const identity = asset.id + ':' + descriptor.role;
      const pending = state.pending.get(identity); const verified = state.verified.get(identity);
      const object = verified ?? pending;
      const failure = (outcome?.transfers ?? []).find(value => value.role === descriptor.role && value.status === 'failed');
      return { role: descriptor.role, index: descriptor.index, pendingRecorded: Boolean(pending), verifiedRecorded: Boolean(verified),
        ...(object ? { bucket: object.bucket, key: object.key, url: object.url, mimeType: object.mimeType,
          byteSize: object.byteSize, sha256: object.sha256 } : {}),
        ...(failure ? { failedSource: publicSourceFailure(descriptor) } : {}), liveVerified: false };
    });
    for (let offset = 0; offset < objects.length; offset += 4) events.push({
      event: 'r2_tail_diagnostic_objects', runId, sequence, rowId: asset.id,
      objectOffset: offset, totalObjects: objects.length, objects: objects.slice(offset, offset + 4),
    });
  }
  return events;
}
const DEPENDENCIES = ['assertBulkInspectionUid', 'assertRunnerProject', 'assertHostedRunner', 'verifySourceFiles',
  'realpath', 'list', 'readBulkInspectionFile', 'planCatalogueAssetMigration', 'validateCatalogueMigrationJournal',
  'createCatalogueMigrationRollback'];
function checkDependencies(dependencies) {
  for (const name of DEPENDENCIES) check(typeof dependencies?.[name] === 'function', 'cutover_dependencies_required');
}
function createRecoveredTailInspector(dependencies) {
  checkDependencies(dependencies);
  return options => inspectRecoveredTail20261027({ ...options, dependencies });
}

function rowExpectation(asset, inventoryIndex, sequence, state) {
  const operation = state.operations[inventoryIndex];
  const publication = state.publication?.rowId === asset.id ? state.publication : null;
  const commit = state.committed?.rowId === asset.id ? state.committed : null;
  const expected = operation ? operation.after : !publication ? asset : null;
  return { rowId: asset.id, sequence, inventoryIndex,
    beforeSnapshotSha256: state.plans.get(asset.id).snapshotHash,
    expectedSnapshotSha256: expected ? fingerprint(expected) : null,
    published: Boolean(operation), journalState: operation ? 'published_receipt' : commit ? 'commit_without_receipt'
      : publication ? 'publication_pending_outcome_unknown' : 'no_publication_record',
    operationId: operation?.receipt.operationId ?? publication?.operationId ?? null,
    receiptSha256: operation ? fingerprint(operation.receipt) : null,
    recordedCommitSnapshotSha256: commit ? fingerprint(commit.after) : null };
}
function publicObjectEvidence(object) {
  return { role: object.role, index: object.index, bucket: object.bucket, key: object.key,
    url: object.url, mimeType: object.mimeType, byteSize: object.byteSize, sha256: object.sha256,
    verifiedRecorded: true, liveVerified: false };
}
/**
 * Inspect immutable evidence for exactly one allowlisted run. No database,
 * network, process launch, lock removal, or evidence mutation path exists.
 * Output is not a reconciliation result and never authorizes a restart.
 */
async function inspectRecoveredTail20261027(options = {}) {
  return inspectRunEvidence(options, false);
}
/**
 * Return bounded, private in-memory expectations for a separately reviewed
 * read-only reconciler. Never log this result wholesale. No raw row snapshots,
 * arbitrary selector, callback, SQL, or network capability is added here.
 * Hashes describe recorded evidence; they do not establish current DB state.
 */
async function readRecoveredRunExpectations20261027(options = {}) {
  return inspectRunEvidence(options, true);
}
async function inspectRunEvidence(options, collectExpectations) {
  shape(options, ['runId'], ['env', 'dependencies']);
  const { runId, env = process.env, dependencies } = options;
  check(RUN_IDS.includes(runId), 'cutover_run_not_allowed');
  check(env && typeof env === 'object', 'cutover_environment_required');
  check(env.RAILWAY_SERVICE_ID === SERVICE && env.RAILWAY_ENVIRONMENT_ID === ENVIRONMENT
    && env.RAILWAY_PROJECT_ID === PROJECT, 'cutover_host_mismatch');
  const RUN_ID = runId; const DIRECTORY = ROOT + '/' + RUN_ID;
  const deps = dependencies ?? await runtimeDependencies(); checkDependencies(deps);
  deps.assertBulkInspectionUid(); deps.assertRunnerProject(env); await deps.assertHostedRunner(env);
  const sourceFiles = await deps.verifySourceFiles();
  check(Array.isArray(sourceFiles) && sourceFiles.length === Object.keys(SOURCE_HASHES).length
    && sourceFiles.every(file => typeof file.name === 'string' && Object.hasOwn(SOURCE_HASHES, file.name)
      && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 262144 && file.sha256 === SOURCE_HASHES[file.name])
    && new Set(sourceFiles.map(file => file.name)).size === sourceFiles.length, 'cutover_source_mismatch');
  const acceptance = await acceptanceEvidence(deps);
  const files = await snapshot(deps, DIRECTORY); const known = new Map(files.map(file => [file.name, file]));
  const evidenceSha256 = hash(JSON.stringify(files));
  async function read(name) {
    const expected = known.get(name); check(expected, 'cutover_required_file_missing');
    const file = await deps.readBulkInspectionFile(DIRECTORY + '/' + name, bound(name));
    check(file.bytes === expected.bytes && file.sha256 === expected.sha256 && Buffer.isBuffer(file.content)
      && hash(file.content) === file.sha256, 'cutover_evidence_changed');
    return file.content;
  }
  const document = async name => json(await read(name));
  const manifest = await document('run.json');
  check(same(manifest, { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId: RUN_ID, expectedRef: REF,
    railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT, options: OPTIONS, limit: 25 }), 'cutover_manifest');
  // The frozen runner removes this lock only after all batch checkpoints are durable.
  check(!known.has('runner.lock'), 'closeout_lock_present');
  const checkpoints = files.filter(file => file.name.endsWith('.checkpoint.json'));
  check(checkpoints.length <= MAX_BATCHES && same(checkpoints.map(file => file.name),
    Array.from({ length: checkpoints.length }, (_, index) => prefix(index + 1) + 'checkpoint.json')), 'cutover_checkpoint_gap');
  const suffixesBySequence = new Map();
  for (const file of files) if (file.name.startsWith('batch-')) {
    const sequence = Number(file.name.slice(6, 12));
    if (!suffixesBySequence.has(sequence)) suffixesBySequence.set(sequence, []);
    suffixesBySequence.get(sequence).push(file.name.slice(13));
  }
  const batchSequences = [...suffixesBySequence.keys()];
  check(batchSequences.every(sequence => sequence <= checkpoints.length + 1), 'cutover_multiple_tails');
  const hasTail = batchSequences.includes(checkpoints.length + 1);
  let afterId = null; let previousCheckpointSha256 = null; let totalPublished = 0; let objects = 0;
  let exhausted = false; let latestCheckpoint = null; let tail = null; let tailRows = [];
  const rowExpectations = []; let firstPublished = null; let lastPublished = null;
  let historicalSuccessorReceipt = null;

    for (let sequence = 1; sequence <= checkpoints.length + (hasTail ? 1 : 0); sequence++) {
      check(!exhausted, 'cutover_after_exhaustion');
      const complete = sequence <= checkpoints.length; const name = prefix(sequence);
      const suffixes = suffixesBySequence.get(sequence);
      check(known.has(name + 'intent.json') && same(await document(name + 'intent.json'),
        { schemaVersion: 1, manifestSha256: known.get('run.json').sha256, sequence, afterId, previousCheckpointSha256 }), 'cutover_intent');
      if (!known.has(name + 'inventory.json')) {
        check(!complete && same(suffixes, ['intent.json']), 'cutover_intent_only_tail');
        tail = { sequence, stage: 'intent_only', inventoryPresent: false, publishedAssets: 0, untouchedAssets: 0,
          pendingObjects: 0, verifiedObjects: 0, pendingPublication: null, executionPresent: false, errorPresent: false };
        continue;
      }
      const inventory = await document(name + 'inventory.json');
      shape(inventory, ['schemaVersion', 'kind', 'expectedRef', 'sourceOrigin', 'options', 'limit', 'afterId',
        'nextAfterId', 'exhausted', 'assets'], ['createdAt']);
      check(inventory.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory' && inventory.expectedRef === REF
        && inventory.sourceOrigin === 'https://' + REF + '.supabase.co' && same(inventory.options, OPTIONS)
        && inventory.limit === 25 && inventory.afterId === afterId && Array.isArray(inventory.assets)
        && inventory.assets.length <= 25 && inventory.exhausted === (inventory.assets.length < 25), 'cutover_inventory');
      if (Object.hasOwn(inventory, 'createdAt')) check(typeof inventory.createdAt === 'string'
        && Number.isFinite(Date.parse(inventory.createdAt)), 'cutover_inventory_timestamp');
      let cursor = afterId;
      for (const asset of inventory.assets) {
        check(UUID.test(asset?.id ?? '') && (!cursor || asset.id > cursor), 'cutover_cursor');
        deps.planCatalogueAssetMigration(asset, OPTIONS); cursor = asset.id;
      }
      check(inventory.nextAfterId === cursor, 'cutover_cursor');
      const inventorySha256 = known.get(name + 'inventory.json').sha256;
      const digestPresent = known.has(name + 'inventory.json.sha256.json');
      const inventoryResultPresent = known.has(name + 'inventory-result.json');
      const journalPresent = known.has(name + 'events.jsonl');
      const executionPresent = known.has(name + 'execute-result.json');
      const errorPresent = known.has(name + 'error.json');
      check((!inventoryResultPresent || digestPresent) && (!(journalPresent || executionPresent) || (digestPresent && inventoryResultPresent))
        && (!executionPresent || journalPresent), 'cutover_tail_file_order');
      if (digestPresent) check(same(await document(name + 'inventory.json.sha256.json'),
        { inventoryFile: name + 'inventory.json', inventorySha256 }), 'cutover_inventory_digest');
      if (inventoryResultPresent) check(same(await document(name + 'inventory-result.json'), { exitCode: 0, signal: null, result: {
        status: 'inventory', assetCount: inventory.assets.length, assetBytesRead: 0, inventorySha256,
        inventoryPath: DIRECTORY + '/' + name + 'inventory.json', digestPath: DIRECTORY + '/' + name + 'inventory.json.sha256.json',
        nextAfterId: cursor, exhausted: inventory.exhausted } }), 'cutover_inventory_result');
      check(!journalPresent || inventory.assets.length > 0, 'cutover_empty_execution');
      const state = journalState(journalPresent ? await read(name + 'events.jsonl') : Buffer.alloc(0), inventory, inventorySha256, deps);
      objects += state.pending.size;
      const execution = executionPresent ? await document(name + 'execute-result.json') : null;
      if (execution) executionState(execution, inventory, state, complete);
      let runnerError = null;
      if (errorPresent) {
        const error = await document(name + 'error.json'); shape(error, ['status', 'code', 'sequence', 'afterId', 'requiresReconciliation']);
        check(!complete && error.status === 'blocked' && /^[a-z][a-z0-9_]{0,127}$/.test(error.code)
          && error.sequence === sequence && error.afterId === afterId && error.requiresReconciliation === true, 'cutover_runner_error');
        runnerError = safeCode(error.code);
      }
      if (complete) {
        const required = ['intent.json', 'inventory.json', 'inventory-result.json', 'inventory.json.sha256.json', 'checkpoint.json',
          ...(inventory.assets.length ? ['events.jsonl', 'execute-result.json'] : [])].sort();
        check(same(suffixes, required) && digestPresent && inventoryResultPresent && state.complete && !state.committed,
          'cutover_checkpoint_files');
        const expected = { schemaVersion: 1, manifestSha256: known.get('run.json').sha256, sequence, afterId,
          previousCheckpointSha256, intentSha256: known.get(name + 'intent.json').sha256, inventorySha256,
          inventoryResultSha256: known.get(name + 'inventory-result.json').sha256,
          digestSha256: known.get(name + 'inventory.json.sha256.json').sha256, assetCount: inventory.assets.length,
          nextAfterId: cursor, exhausted: inventory.exhausted,
          ...(inventory.assets.length ? { resultSha256: known.get(name + 'execute-result.json').sha256,
            journalSha256: known.get(name + 'events.jsonl').sha256 } : {}),
          totalPublished: totalPublished + inventory.assets.length };
        check(same(await document(name + 'checkpoint.json'), expected), 'cutover_checkpoint');
        totalPublished += inventory.assets.length;
        previousCheckpointSha256 = known.get(name + 'checkpoint.json').sha256; afterId = cursor; exhausted = inventory.exhausted;
        latestCheckpoint = { sequence, totalPublished, nextAfterId: cursor, sha256: previousCheckpointSha256, exhausted };
      } else {
        check(!suffixes.includes('checkpoint.json'), 'cutover_tail_checkpoint');
        const pendingPublication = state.publication ? { rowId: state.publication.rowId, operationId: state.publication.operationId,
          planSha256: fingerprint(state.publication), beforeSha256: fingerprint(inventory.assets[state.operations.length]),
          commitPresent: Boolean(state.committed) } : null;
        tail = { sequence, stage: state.committed ? 'commit_without_receipt' : state.publication ? 'publication_pending_before_required'
          : state.complete ? 'all_receipts_await_checkpoint' : journalPresent ? 'journal_prefix' : 'inventory_only',
          inventoryPresent: true, assetCount: inventory.assets.length, publishedAssets: state.operations.length,
          untouchedAssets: inventory.assets.length - state.operations.length, pendingObjects: state.pending.size,
          verifiedObjects: state.verified.size, pendingPublication, executionPresent, errorPresent };
        tailRows = tailEvidence(RUN_ID, sequence, inventory, state, execution);
        tail.runnerError = runnerError;
        tail.executionStatus = execution?.result.status ?? null;
        tail.executionResultCount = execution?.result.results.length ?? null;
        tail.inventorySha256 = inventorySha256;
        tail.journalSha256 = known.get(name + 'events.jsonl')?.sha256 ?? null;
        // File identity hashes the persisted envelope and formatting. Runtime
        // migration_invocation_complete hashes only compact JSON.stringify(result).
        tail.executionResultSha256 = known.get(name + 'execute-result.json')?.sha256 ?? null;
        tail.executionResultValueSha256 = execution ? hash(JSON.stringify(execution.result)) : null;
      }
      if (collectExpectations) {
        check(rowExpectations.length + inventory.assets.length <= 250000, 'cutover_expectation_row_bound');
        for (const [index, asset] of inventory.assets.entries()) {
          const expectation = rowExpectation(asset, index, sequence, state);
          rowExpectations.push(expectation);
          const operation = state.operations[index];
          if (operation) {
            const published = { rowId: asset.id, sequence, receiptSha256: expectation.receiptSha256,
              objects: operation.receipt.objects };
            firstPublished ??= published; lastPublished = published;

          }
        }
      }
    }

  check(checkpoints.length === 135 && !tail && exhausted && totalPublished === 3364, 'closeout_traversal_incomplete');
  const terminalExecution = await document(prefix(135) + 'execute-result.json');
  const terminalExecutionResultValueSha256 = hash(JSON.stringify(terminalExecution.result));
  check(terminalExecutionResultValueSha256 === TERMINAL_EXECUTION_RESULT_SHA, 'closeout_terminal_execution_mismatch');
  const finalFiles = await snapshot(deps, DIRECTORY);
  check(same(files, finalFiles), 'cutover_snapshot_changed');
  check(same(acceptance, await acceptanceEvidence(deps)), 'cutover_acceptance_changed');
  check(same(sourceFiles, await deps.verifySourceFiles()), 'cutover_source_changed');
  const tailPublishedAssets = tail?.publishedAssets ?? 0;
  const summary = { schemaVersion: 1, kind: 'stackr-r2-tail-diagnostic', status: 'diagnostic', runId: RUN_ID,
    sourceCommit: SOURCE_COMMIT, evidenceSha256, acceptance, fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), sourceFiles,
    lockPresent: false, lock: null,
    terminalExecutionResultValueSha256, checkpointCount: checkpoints.length, completedBatches: checkpoints.length, latestCheckpoint,
    checkpointSha256: previousCheckpointSha256, checkpointPublishedAssets: totalPublished, tailPublishedAssets,
    journalPublishedAssets: totalPublished + tailPublishedAssets, tail, checkpointPublicationCursor: afterId, objects,
    journalAndCheckpointValidationPassed: true, databaseQueried: false, networkRequested: false,
    evidenceModified: false, runnerStarted: false, sourceObjectsDeleted: 0, reconciled: false,
    resumeAuthorized: false, globalCoverageVerified: false };
  const selectedFiles = files.filter(file => ['run.json', 'runner.lock'].includes(file.name)
    || (checkpoints.length > 0 && file.name.startsWith(prefix(checkpoints.length)))
    || (hasTail && file.name.startsWith(prefix(checkpoints.length + 1))));
  const events = [{ event: 'r2_tail_diagnostic_summary', ...summary },
    { event: 'r2_tail_diagnostic_files', runId: RUN_ID, evidenceSha256, files: selectedFiles }, ...tailRows];
  check(events.length <= 180, 'cutover_output_event_bound');
  let outputBytes = 0;
  const eventsDigest = createHash('sha256');
  for (const event of events) {
    const line = JSON.stringify(event); const bytes = Buffer.byteLength(line + '\n');
    check(bytes <= 8192, 'cutover_output_line_bound'); outputBytes += bytes; eventsDigest.update(line + '\n');
  }
  check(outputBytes <= 1048576, 'cutover_output_total_bound');
  events.push({ event: 'r2_tail_diagnostic_complete', runId: RUN_ID, evidenceSha256,
    eventCount: events.length + 1, precedingEventsSha256: eventsDigest.digest('hex'),
    databaseQueried: false, networkRequested: false, evidenceModified: false, runnerStarted: false,
    reconciled: false, resumeAuthorized: false });
  if (!collectExpectations) return { summary, events };
  const publicSamples = [];
  for (const publication of [firstPublished, lastPublished]) {
    if (!publication) continue;
    for (const object of [publication.objects[0], publication.objects.find(value => value.role !== 'original')]) {
      if (object && !publicSamples.some(sample => sample.key === object.key)) publicSamples.push({
        runId: RUN_ID, rowId: publication.rowId, sequence: publication.sequence,
        receiptSha256: publication.receiptSha256, ...publicObjectEvidence(object) });
    }
  }
  check(publicSamples.length <= 4, 'cutover_public_sample_bound');
  return { summary, events, rowExpectations, publicSamples, historicalSuccessorReceipt };
}


/** Fixed completed-run reader. The final receipt is derived from existing durable
 * checkpoints, not a claimed preexisting final-receipt file. Database counts and
 * fresh GET verification must be attached separately by the release owner. */
export async function inspectCompletedB20261027(options = {}) {
  shape(options, [], ['env', 'dependencies']);
  const result = await inspectRunEvidence({ ...options, runId: RUN_IDS[0] }, true);
  const s = result.summary;
  check(s.latestCheckpoint?.exhausted === true && s.checkpointPublishedAssets === 3364
    && s.journalPublishedAssets === 3364 && s.completedBatches === 135 && s.tail === null
    && result.rowExpectations.length === 3364 && result.rowExpectations.every(row => row.published)
    && new Set(result.rowExpectations.map(row => row.rowId)).size === 3364, 'closeout_publications_incomplete');
  const certificate = { schemaVersion: 1, kind: 'stackr-r2-completed-run-receipt',
    status: 'recorded_traversal_verified', runId: RUN_IDS[0], sourceCommit: SOURCE_COMMIT,
    deploymentId: '21e9065e-040e-407e-96f7-c3b88b859704',
    acceptance: s.acceptance, evidenceSha256: s.evidenceSha256, fileCount: s.fileCount,
    totalBytes: s.totalBytes, sourceFiles: s.sourceFiles, completedBatches: s.completedBatches,
    publishedAssets: s.journalPublishedAssets, objects: s.objects, terminalCheckpoint: s.latestCheckpoint,
    terminalExecutionResultValueSha256: s.terminalExecutionResultValueSha256,
    publicationExpectationsSha256: fingerprint(result.rowExpectations),
    inheritedBaseline: 58734, resultingEligibleTotal: 62098,
    freshBaselineRowsCompared: false, lockPresent: false, pendingPublication: null,
    journalAndCheckpointValidationPassed: true, recordedTraversalVerified: true,
    databaseQueried: false, networkRequested: false, evidenceModified: false,
    runnerStarted: false, resumeAuthorized: false, sourceObjectsDeleted: 0,
    eligibleCoverageVerified: false, publicRetrievalVerified: false, completionVerified: false,
    allCatalogueImagesCovered: false };
  const certificateSha256 = hash(JSON.stringify(certificate));
  const events = [{ event: 'r2_completed_b_receipt', certificate, certificateSha256 },
    { event: 'r2_completed_b_public_samples', runId: RUN_IDS[0], certificateSha256,
      selection: 'original and first derivative from first and last publications',
      objects: result.publicSamples }];
  check(result.publicSamples.length > 0 && result.publicSamples.length <= 4, 'closeout_samples_required');
  const preceding = events.map(event => JSON.stringify(event) + '\n');
  check(preceding.every(line => Buffer.byteLength(line) <= 8192), 'closeout_output_bound');
  events.push({ event: 'r2_completed_b_receipt_complete', runId: RUN_IDS[0], certificateSha256,
    eventCount: 3, precedingEventsSha256: hash(preceding.join('')), evidenceModified: false,
    runnerStarted: false, completionVerified: false });
  return { certificate, certificateSha256, publicSamples: result.publicSamples, events };
}
