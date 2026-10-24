#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertHostedRunner } from './run-r2-catalogue-migration.mjs';
import { migrationConfiguration } from './migrate-catalogue-to-r2.mjs';
import { createVerifiedSupabasePostgresClient } from './deploy/verified-supabase-postgres.mjs';
import { createCatalogueMigrationRollback, planCatalogueAssetMigration } from './lib/r2-catalogue-migration.mjs';

const RUN_ID = 'production-bulk-20261024';
const DIRECTORY = '/data/r2-catalogue-migration/' + RUN_ID;
const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const OPTIONS = { sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-public',
  publicBaseUrl: 'https://assets.stackrtcg.com', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000 };
const LIMITS = { 'intent.json': 65536, 'inventory.json': 4194304, 'inventory-result.json': 33554432,
  'inventory.json.sha256.json': 4096, 'events.jsonl': 33554432, 'execute-result.json': 33554432,
  'checkpoint.json': 65536, 'error.json': 65536 };
const CACHE = 'public, max-age=31536000, immutable';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const prefix = sequence => 'batch-' + String(sequence).padStart(6, '0') + '.';
function keys(value, expected, code) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...expected].sort()), code);
}
function json(bytes) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }

export function assertBulkInspectionUid(runtime = process) {
  check(typeof runtime.getuid === 'function' && typeof runtime.geteuid === 'function'
    && runtime.getuid() === 1000 && runtime.geteuid() === 1000, 'bulk_inspection_unprivileged_uid_required');
}

/** Nonblocking open rejects FIFOs/devices after stat; no links or unbounded reads. */
export async function readBulkInspectionFile(filename, maximum, retain = true) {
  check(Number.isSafeInteger(maximum) && maximum > 0, 'bulk_inspection_invalid_read_bound');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    check(before.isFile() && before.size <= maximum, 'bulk_inspection_invalid_evidence_file');
    const digest = createHash('sha256');
    const chunks = [];
    let size = 0;
    const chunk = Buffer.alloc(Math.min(65536, maximum + 1));
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, maximum - size + 1), null);
      if (!bytesRead) break;
      size += bytesRead;
      check(size <= maximum, 'bulk_inspection_evidence_overflow');
      digest.update(chunk.subarray(0, bytesRead));
      if (retain) chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    const after = await handle.stat();
    check(size === before.size && after.size === before.size && after.ino === before.ino
      && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'bulk_inspection_evidence_changed');
    return { bytes: size, sha256: digest.digest('hex'), ...(retain ? { content: Buffer.concat(chunks, size) } : {}) };
  } finally { await handle.close(); }
}

async function snapshot(directory, maxBatches) {
  check(await realpath(directory) === directory, 'bulk_inspection_symlink_directory');
  const entries = [];
  for await (const entry of await opendir(directory)) {
    entries.push(entry);
    check(entries.length <= 2 + maxBatches * 8, 'bulk_inspection_file_bound_exceeded');
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    check(entry.isFile(), 'bulk_inspection_nonregular_evidence');
    const match = /^batch-(\d{6})\.(.+)$/.exec(entry.name);
    const maximum = entry.name === 'run.json' || entry.name === 'runner.lock' ? 65536
      : match && Number(match[1]) >= 1 && Number(match[1]) <= maxBatches && LIMITS[match[2]];
    check(maximum, 'bulk_inspection_unexpected_evidence_file');
    const file = await readBulkInspectionFile(path.join(directory, entry.name), maximum, false);
    files.push({ name: entry.name, bytes: file.bytes, sha256: file.sha256 });
  }
  return { files, sha256: hash(JSON.stringify(files)) };
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
  const patch = { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list, cache_control: CACHE };
  if (asset.archival_storage_key) patch.archival_storage_key = original.key;
  return patch;
}

function checkedObject(object, asset, descriptor) {
  keys(object, ['role', 'index', 'bucket', 'key', 'url', 'mimeType', 'byteSize', 'sha256'], 'bulk_inspection_object_shape');
  check(descriptor && object.role === descriptor.role && object.index === descriptor.index
    && object.mimeType === descriptor.mimeType && object.bucket === OPTIONS.destinationBucket
    && SHA.test(object.sha256 ?? '') && Number.isSafeInteger(object.byteSize) && object.byteSize > 0
    && object.byteSize <= OPTIONS.maxObjectBytes && (!descriptor.sha256 || descriptor.sha256 === object.sha256)
    && (descriptor.byteSize === null || descriptor.byteSize === object.byteSize), 'bulk_inspection_object_identity');
  const key = 'public/' + asset.asset_type + '/' + asset.id + '/' + hash(asset.asset_id)
    + '/' + object.sha256 + '/' + object.role + '.' + EXT[object.mimeType];
  check(object.key === key && object.url === OPTIONS.publicBaseUrl + '/' + key, 'bulk_inspection_object_destination');
}

/** Strict sequential state machine, including exactly one possible interrupted row. */
export function validateBulkJournal(bytes, inventory, inventorySha256) {
  if (bytes.length === 0) return { completed: [], pending: null, committed: null, processedBytes: 0 };
  check(bytes.at(-1) === 10, 'bulk_inspection_journal_truncated');
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).slice(0, -1).split('\n');
  check(lines.length <= 5000 && lines.every(line => line.length > 0), 'bulk_inspection_journal_record_bound');
  const records = lines.map(line => JSON.parse(line));
  check(same(records[0], { event: 'migration_preflight', inventorySha256, inventory,
    railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT }), 'bulk_inspection_preflight_mismatch');
  const plans = inventory.assets.map(row => planCatalogueAssetMigration(row, OPTIONS));
  const completed = [];
  let verified = []; let pendingObject = null; let pending = null; let committed = null; let processedBytes = 0;
  for (const record of records.slice(1)) {
    const asset = inventory.assets[completed.length];
    const plan = plans[completed.length];
    check(asset, 'bulk_inspection_extra_journal_activity');
    if (record.event === 'object_pending') {
      keys(record, ['event', 'rowId', 'object'], 'bulk_inspection_object_record_shape');
      check(!pending && !committed && !pendingObject && record.rowId === asset.id
        && verified.length < plan.objects.length, 'bulk_inspection_object_order');
      checkedObject(record.object, asset, plan.objects[verified.length]);
      pendingObject = record.object;
      processedBytes += pendingObject.byteSize;
      check(processedBytes <= OPTIONS.maxBatchBytes, 'bulk_inspection_byte_budget');
    } else if (record.event === 'object_verified') {
      keys(record, ['event', 'rowId', 'object'], 'bulk_inspection_object_record_shape');
      check(!pending && !committed && pendingObject && record.rowId === asset.id
        && typeof record.object?.reused === 'boolean'
        && same(record.object, { ...pendingObject, reused: record.object.reused }), 'bulk_inspection_object_verification');
      verified.push(record.object); pendingObject = null;
    } else if (record.event === 'publication_pending') {
      keys(record, ['event', 'plan'], 'bulk_inspection_publication_record_shape');
      check(!pending && !committed && !pendingObject && verified.length === plan.objects.length, 'bulk_inspection_publication_order');
      const patch = expectedPatch(asset, verified);
      check(same(record.plan, { ...plan, objects: verified, patch,
        operationId: fingerprint({ rowId: asset.id, snapshotHash: plan.snapshotHash, patch }) }), 'bulk_inspection_publication_plan');
      pending = record.plan;
    } else if (record.event === 'database_cas_committed') {
      keys(record, ['event', 'operationId', 'rowId', 'before', 'after'], 'bulk_inspection_commit_record_shape');
      check(pending && !committed && record.rowId === asset.id && record.operationId === pending.operationId
        && same(record.before, asset) && typeof record.after?.updated_at === 'string'
        && Number.isFinite(Date.parse(record.after.updated_at))
        && same(record.after, { ...asset, ...pending.patch, updated_at: record.after.updated_at }), 'bulk_inspection_commit_mismatch');
      committed = record;
    } else if (record.event === 'publication_complete') {
      keys(record, ['event', 'receipt'], 'bulk_inspection_receipt_record_shape');
      check(pending && committed && same(record.receipt,
        { ...pending, updatedAt: committed.after.updated_at, status: 'published' }), 'bulk_inspection_receipt_mismatch');
      createCatalogueMigrationRollback(record.receipt);
      completed.push({ before: asset, after: committed.after, receipt: record.receipt });
      verified = []; pending = null; committed = null;
    } else check(false, 'bulk_inspection_unknown_journal_event');
  }
  return { completed, pending, committed, processedBytes };
}

function checkExecution(execution, state, inventory, requiredComplete) {
  keys(execution, ['exitCode', 'signal', 'result'], 'bulk_inspection_execution_shape');
  const result = execution.result;
  keys(result, ['status', 'processedBytes', 'results', 'remaining'], 'bulk_inspection_result_shape');
  check(execution.signal === null && Array.isArray(result.results) && result.processedBytes === state.processedBytes,
    'bulk_inspection_execution_mismatch');
  for (let index = 0; index < state.completed.length; index++) {
    const operation = state.completed[index];
    check(same(result.results[index], { rowId: operation.before.id, status: 'published', receipt: operation.receipt }),
      'bulk_inspection_execution_receipt_mismatch');
  }
  if (result.status === 'complete') {
    check(execution.exitCode === 0 && !state.pending && state.completed.length === inventory.assets.length
      && result.results.length === state.completed.length && result.remaining === 0, 'bulk_inspection_execution_incomplete');
  } else {
    check(!requiredComplete && execution.exitCode === 1 && result.status === 'stopped'
      && result.results.length === state.completed.length + 1
      && result.remaining === inventory.assets.length - result.results.length, 'bulk_inspection_stopped_result');
    const failed = result.results.at(-1);
    const allowed = ['rowId', 'status', 'code', ...(failed?.plan ? ['plan'] : []), ...(failed?.updatedAt ? ['updatedAt'] : [])];
    keys(failed, allowed, 'bulk_inspection_failed_result_shape');
    check(failed.rowId === inventory.assets[state.completed.length]?.id
      && ['failed', 'publication_requires_reconciliation'].includes(failed.status)
      && /^[a-z][a-z0-9_]{0,127}$/.test(failed.code ?? '')
      && (!failed.plan || same(failed.plan, state.pending))
      && (!failed.updatedAt || failed.updatedAt === state.committed?.after.updated_at), 'bulk_inspection_failed_result_mismatch');
  }
}

/** Evidence only: caller must separately prove old deployment and child retirement. */
export async function inspectBulkRun({ mode = 'hash', expectedEvidenceSha256, maxBatches = 100, env = process.env,
  directory = DIRECTORY, assertHost = assertHostedRunner, assertUid = assertBulkInspectionUid,
  createDb = url => createVerifiedSupabasePostgresClient(url, 'stackr-r2-bulk-inspection',
    { connectionTimeoutMillis: 15000, statement_timeout: 30000, query_timeout: 45000 }) } = {}) {
  check(['hash', 'verify'].includes(mode), 'bulk_inspection_invalid_mode');
  check(Number.isSafeInteger(maxBatches) && maxBatches >= 1 && maxBatches <= 100, 'bulk_inspection_batch_bound');
  if (mode === 'verify') check(SHA.test(expectedEvidenceSha256 ?? ''), 'bulk_inspection_approved_digest_required');
  assertUid(); await assertHost(env);
  const observed = await snapshot(directory, maxBatches);
  if (mode === 'verify') check(observed.sha256 === expectedEvidenceSha256, 'bulk_inspection_approved_digest_mismatch');
  const known = new Map(observed.files.map(file => [file.name, file]));
  async function bytes(name) {
    const file = known.get(name); check(file, 'bulk_inspection_missing_evidence');
    const maximum = ['run.json', 'runner.lock'].includes(name) ? 65536 : LIMITS[name.replace(/^batch-\d{6}\./, '')];
    const read = await readBulkInspectionFile(path.join(directory, name), maximum);
    check(read.bytes === file.bytes && read.sha256 === file.sha256, 'bulk_inspection_evidence_changed');
    return read.content;
  }
  const document = async name => json(await bytes(name));
  const manifest = await document('run.json');
  check(same(manifest, { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId: RUN_ID, expectedRef: REF,
    railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT, options: OPTIONS, limit: 25 }), 'bulk_inspection_manifest_mismatch');
  const lock = await document('runner.lock');
  keys(lock, ['schemaVersion', 'processId', 'startedAt'], 'bulk_inspection_lock_shape');
  check(lock.schemaVersion === 1 && Number.isSafeInteger(lock.processId) && lock.processId > 0
    && typeof lock.startedAt === 'string' && Number.isFinite(Date.parse(lock.startedAt)), 'bulk_inspection_lock_invalid');
  const sequences = [...new Set(observed.files.filter(file => file.name.startsWith('batch-')).map(file => Number(file.name.slice(6, 12))))].sort((a, b) => a - b);
  const manifestSha256 = known.get('run.json').sha256;
  let previousCheckpointSha256 = null; let afterId = null; let exhausted = false;
  let completedBatches = 0; let completedRows = 0; let inventoriedRows = 0; let committedRows = 0; let fullRowsMatched = 0;
  let tail = null; let db;
  const recoveredPublications = [];
  try {
    if (mode === 'verify') {
      const config = migrationConfiguration(['--mode=inventory', '--expected-ref=' + REF,
        '--inventory=' + path.join(directory, 'unused.json'), '--limit=25', '--object-timeout-ms=120000'], env);
      check(config.destinationBucket === OPTIONS.destinationBucket && config.publicBaseUrl === OPTIONS.publicBaseUrl,
        'bulk_inspection_destination_mismatch');
      db = createDb(config.databaseUrl); await db.connect();
      await db.query('begin isolation level repeatable read read only');
    }
    // Retain and query only one batch of full rows at a time.
    for (const sequence of sequences) {
      check(sequence === completedBatches + 1 && !exhausted && !tail, 'bulk_inspection_noncontiguous_batches');
      const base = prefix(sequence);
      const has = suffix => known.has(base + suffix);
      const suffixes = observed.files.filter(file => file.name.startsWith(base)).map(file => file.name.slice(base.length));
      const checkpointed = has('checkpoint.json');
      const intent = await document(base + 'intent.json');
      check(same(intent, { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256 }), 'bulk_inspection_intent_mismatch');
      if (has('error.json')) {
        const error = await document(base + 'error.json');
        keys(error, ['status', 'code', 'sequence', 'afterId', 'requiresReconciliation'], 'bulk_inspection_error_shape');
        check(!checkpointed && error.status === 'blocked' && error.requiresReconciliation === true
          && error.sequence === sequence && error.afterId === afterId && /^[a-z][a-z0-9_]{0,127}$/.test(error.code ?? ''), 'bulk_inspection_error_mismatch');
      }
      if (!has('inventory.json')) {
        check(!checkpointed && suffixes.every(name => ['intent.json', 'error.json'].includes(name)), 'bulk_inspection_inventory_missing');
        tail = { sequence, stage: 'intent_only', inventoriedRows: 0 }; continue;
      }
      const inventoryBytes = await bytes(base + 'inventory.json');
      const inventorySha256 = hash(inventoryBytes);
      const inventory = json(inventoryBytes);
      check(inventory.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory' && inventory.expectedRef === REF
        && inventory.sourceOrigin === 'https://' + REF + '.supabase.co' && same(inventory.options, OPTIONS)
        && inventory.limit === 25 && inventory.afterId === afterId && Array.isArray(inventory.assets) && inventory.assets.length <= 25,
      'bulk_inspection_inventory_mismatch');
      let cursor = afterId;
      for (const row of inventory.assets) {
        check(UUID.test(row?.id ?? '') && (!cursor || row.id > cursor), 'bulk_inspection_inventory_order');
        planCatalogueAssetMigration(row, OPTIONS); cursor = row.id;
      }
      check(inventory.nextAfterId === cursor && inventory.exhausted === (inventory.assets.length < 25), 'bulk_inspection_cursor_mismatch');
      inventoriedRows += inventory.assets.length;
      if (has('inventory.json.sha256.json')) {
        check(same(await document(base + 'inventory.json.sha256.json'), { inventoryFile: base + 'inventory.json', inventorySha256 }),
          'bulk_inspection_digest_mismatch');
      }
      if (has('inventory-result.json')) {
        const advertised = await document(base + 'inventory-result.json');
        check(has('inventory.json.sha256.json') && advertised.exitCode === 0 && advertised.signal === null
          && same(advertised.result, { status: 'inventory', assetCount: inventory.assets.length, assetBytesRead: 0,
            inventorySha256, inventoryPath: path.posix.join(DIRECTORY, base + 'inventory.json'),
            digestPath: path.posix.join(DIRECTORY, base + 'inventory.json.sha256.json'), nextAfterId: cursor, exhausted: inventory.exhausted }),
        'bulk_inspection_inventory_receipt_mismatch');
      }
      check(!(checkpointed || has('events.jsonl') || has('execute-result.json')) || has('inventory-result.json'), 'bulk_inspection_inventory_receipt_missing');
      check(!has('execute-result.json') || has('events.jsonl'), 'bulk_inspection_execution_journal_missing');
      const state = has('events.jsonl') ? validateBulkJournal(await bytes(base + 'events.jsonl'), inventory, inventorySha256)
        : { completed: [], pending: null, committed: null, processedBytes: 0 };
      if (has('execute-result.json')) checkExecution(await document(base + 'execute-result.json'), state, inventory, checkpointed);
      if (checkpointed) {
        check(!has('error.json') && (inventory.assets.length === 0
          ? !has('events.jsonl') && !has('execute-result.json')
          : has('execute-result.json') && state.completed.length === inventory.assets.length), 'bulk_inspection_checkpoint_incomplete');
        const expected = { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256,
          intentSha256: known.get(base + 'intent.json').sha256, inventorySha256,
          inventoryResultSha256: known.get(base + 'inventory-result.json').sha256,
          digestSha256: known.get(base + 'inventory.json.sha256.json').sha256,
          assetCount: inventory.assets.length, nextAfterId: cursor, exhausted: inventory.exhausted,
          ...(inventory.assets.length ? { resultSha256: known.get(base + 'execute-result.json').sha256,
            journalSha256: known.get(base + 'events.jsonl').sha256 } : {}), totalPublished: completedRows + inventory.assets.length };
        check(same(await document(base + 'checkpoint.json'), expected), 'bulk_inspection_checkpoint_mismatch');
        completedBatches++; completedRows += inventory.assets.length;
        previousCheckpointSha256 = known.get(base + 'checkpoint.json').sha256;
        afterId = cursor; exhausted = inventory.exhausted;
      } else tail = { sequence, stage: state.committed ? 'database_cas_committed'
        : state.pending ? 'publication_pending' : has('events.jsonl') ? 'journal_boundary' : 'inventory_only',
      inventoriedRows: inventory.assets.length, completedReceipts: state.completed.length,
      ...(state.pending ? { pendingRowId: state.pending.rowId, pendingOperationId: state.pending.operationId } : {}) };
      committedRows += state.completed.length + (state.committed ? 1 : 0);
      if (db && inventory.assets.length) {
        const query = await db.query('select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id',
          [inventory.assets.map(row => row.id)]);
        const current = new Map(query.rows.map(row => [row.asset?.id, row.asset]));
        check(query.rows.length === inventory.assets.length && current.size === inventory.assets.length, 'bulk_inspection_database_count_mismatch');
        const expected = new Map(state.completed.map(operation => [operation.before.id, operation.after]));
        if (state.committed) expected.set(state.committed.rowId, state.committed.after);
        for (const before of inventory.assets) {
          const actual = current.get(before.id);
          if (state.pending?.rowId === before.id && !state.committed) {
            if (same(actual, before)) recoveredPublications.push({ rowId: before.id, operationId: state.pending.operationId, state: 'exact_before' });
            else {
              check(typeof actual?.updated_at === 'string' && Number.isFinite(Date.parse(actual.updated_at))
                && same(actual, { ...before, ...state.pending.patch, updated_at: actual.updated_at }), 'bulk_inspection_pending_database_drift');
              const receipt = { ...state.pending, updatedAt: actual.updated_at, status: 'published' };
              createCatalogueMigrationRollback(receipt);
              recoveredPublications.push({ rowId: before.id, operationId: state.pending.operationId,
                state: 'exact_planned_after', timestampSource: 'live_database', observedFullRowSha256: fingerprint(actual), receipt });
            }
          } else check(same(actual, expected.get(before.id) ?? before), 'bulk_inspection_database_drift');
          fullRowsMatched++;
        }
      }
    }
    check((await snapshot(directory, maxBatches)).sha256 === observed.sha256, 'bulk_inspection_evidence_changed');
    if (db) await db.query('commit');
  } catch (error) { if (db) await db.query('rollback').catch(() => {}); throw error; }
  finally { if (db) await db.end(); }
  return { schemaVersion: 1, kind: 'stackr-r2-bulk-run-inspection', runId: RUN_ID, mode,
    evidenceSha256: observed.sha256, files: observed.files, maxBatches, completedBatches, completedRows,
    inventoriedRows, journalCommittedRows: committedRows, fullRowsMatched, databaseVerified: mode === 'verify',
    tail, recoveredPublications, originalLockPreserved: true, sourceObjectsDeleted: 0,
    workerRetirementVerified: false, authorizesResume: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--(mode|expected-evidence-sha256|max-batches)=(.+)$/.exec(raw);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('bulk_inspection_invalid_arguments');
    args[match[1]] = match[2];
  }
  inspectBulkRun({ mode: args.mode ?? 'hash', expectedEvidenceSha256: args['expected-evidence-sha256'],
    maxBatches: args['max-batches'] === undefined ? 100 : Number(args['max-batches']) })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(JSON.stringify({ ok: false,
      code: /^[a-z][a-z0-9_]{0,127}$/.test(error?.code ?? '') ? error.code : 'bulk_inspection_failed' })); process.exitCode = 1; });
}

