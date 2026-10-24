#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import { open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertHostedRunner } from './run-r2-catalogue-migration.mjs';
import { migrationConfiguration } from './migrate-catalogue-to-r2.mjs';
import { createVerifiedSupabasePostgresClient } from './deploy/verified-supabase-postgres.mjs';
import { validateCatalogueMigrationJournal } from './lib/r2-catalogue-migration.mjs';
import { validateStoppedCatalogueMigrationJournal } from './lib/r2-stopped-migration-reconciliation.mjs';

const RUN_ID = 'production-20261024';
const DIRECTORY = '/data/r2-catalogue-migration/' + RUN_ID;
const REF = 'oakdbbzdqwurpjnoqhmu';
const FAILED_ROW = '0083f64b-ad1a-43d3-ad97-efbc20396649';
const SHA = /^[a-f0-9]{64}$/;
const OPTIONS = { sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-public',
  publicBaseUrl: 'https://assets.stackrtcg.com', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 30000 };
function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const prefix = sequence => 'batch-' + String(sequence).padStart(6, '0');
function expectedFiles() {
  const files = new Map([['run.json', 65536], ['runner.lock', 65536]]);
  for (let sequence = 1; sequence <= 5; sequence++) {
    for (const [suffix, maximum] of [['intent.json', 65536], ['inventory.json', 4194304],
      ['inventory-result.json', 33554432], ['inventory.json.sha256.json', 4096],
      ['events.jsonl', 33554432], ['execute-result.json', 33554432],
      [sequence === 5 ? 'error.json' : 'checkpoint.json', 65536]]) {
      files.set(prefix(sequence) + '.' + suffix, maximum);
    }
  }
  return files;
}
export function assertInspectionUid(runtime = process) {
  check(typeof runtime.getuid === 'function' && typeof runtime.geteuid === 'function'
    && runtime.getuid() === 1000 && runtime.geteuid() === 1000, 'inspection_unprivileged_uid_required');
}
export async function readInspectionFile(filename, maximum, retain = true) {
  check(Number.isSafeInteger(maximum) && maximum > 0, 'inspection_invalid_read_bound');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    check(before.isFile() && before.size <= maximum, 'inspection_invalid_evidence_file');
    const digest = createHash('sha256');
    const chunks = [];
    let size = 0;
    const chunk = Buffer.alloc(Math.min(65536, maximum + 1));
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, maximum - size + 1), null);
      if (bytesRead === 0) break;
      size += bytesRead;
      check(size <= maximum, 'inspection_evidence_overflow');
      digest.update(chunk.subarray(0, bytesRead));
      if (retain) chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    const after = await handle.stat();
    check(size === before.size && after.size === before.size
      && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs,
    'inspection_evidence_changed');
    return { bytes: size, sha256: digest.digest('hex'), ...(retain ? { content: Buffer.concat(chunks, size) } : {}) };
  } finally { await handle.close(); }
}
async function snapshot(directory) {
  check(await realpath(directory) === directory, 'inspection_symlink_directory');
  const limits = expectedFiles();
  const names = (await readdir(directory)).sort();
  check(same(names, [...limits.keys()].sort()), 'inspection_unexpected_evidence_files');
  const files = [];
  for (const name of names) {
    const record = await readInspectionFile(path.join(directory, name), limits.get(name), false);
    files.push({ name, bytes: record.bytes, sha256: record.sha256 });
  }
  return { files, sha256: hash(JSON.stringify(files)) };
}

export async function inspectStoppedRun({ mode = 'hash', expectedEvidenceSha256, env = process.env,
  directory = DIRECTORY, assertHost = assertHostedRunner, assertUid = assertInspectionUid,
  createDb = url => createVerifiedSupabasePostgresClient(url, 'stackr-r2-stopped-inspection',
    { connectionTimeoutMillis: 15000, statement_timeout: 30000, query_timeout: 45000 }),
  validateStopped = validateStoppedCatalogueMigrationJournal } = {}) {
  check(['hash', 'verify'].includes(mode), 'inspection_invalid_mode');
  if (mode === 'verify') check(SHA.test(expectedEvidenceSha256 ?? ''), 'inspection_approved_digest_required');
  assertUid();
  await assertHost(env);
  const observed = await snapshot(directory);
  if (mode === 'verify') check(observed.sha256 === expectedEvidenceSha256, 'inspection_approved_digest_mismatch');
  const known = new Map(observed.files.map(file => [file.name, file]));
  async function bytes(name) {
    const file = known.get(name); check(file, 'inspection_unknown_file');
    const value = await readInspectionFile(path.join(directory, name), expectedFiles().get(name));
    check(value.bytes === file.bytes && value.sha256 === file.sha256, 'inspection_evidence_changed');
    return value.content;
  }
  async function json(name) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(name))); }
  const manifest = await json('run.json');
  check(same(manifest, { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId: RUN_ID,
    expectedRef: REF, railwayServiceId: 'b5410607-a591-420e-a506-fe184ce7455b',
    railwayEnvironmentId: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', options: OPTIONS, limit: 25 }),
  'inspection_manifest_mismatch');
  const lock = await json('runner.lock');
  check(lock.schemaVersion === 1 && Number.isSafeInteger(lock.processId) && lock.processId > 0
    && Number.isFinite(Date.parse(lock.startedAt)), 'inspection_lock_invalid');
  const manifestSha256 = known.get('run.json').sha256;
  const expectedRows = new Map();
  let previousCheckpointSha256 = null;
  let afterId = null;
  let stopped;
  for (let sequence = 1; sequence <= 5; sequence++) {
    const base = prefix(sequence) + '.';
    const inventoryBytes = await bytes(base + 'inventory.json');
    const inventory = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inventoryBytes));
    const inventorySha256 = hash(inventoryBytes);
    check(inventory.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory'
      && inventory.expectedRef === REF && inventory.sourceOrigin === 'https://' + REF + '.supabase.co'
      && same(inventory.options, OPTIONS) && inventory.limit === 25 && inventory.afterId === afterId
      && inventory.exhausted === false && Array.isArray(inventory.assets) && inventory.assets.length === 25,
    'inspection_inventory_mismatch');
    let cursor = afterId;
    for (const row of inventory.assets) {
      check(typeof row.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.id)
        && (!cursor || row.id > cursor) && !expectedRows.has(row.id), 'inspection_inventory_identity_mismatch');
      cursor = row.id;
    }
    check(inventory.nextAfterId === cursor, 'inspection_cursor_mismatch');
    const intent = await json(base + 'intent.json');
    check(same(intent, { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256 }),
      'inspection_intent_mismatch');
    const sidecar = await json(base + 'inventory.json.sha256.json');
    const advertised = await json(base + 'inventory-result.json');
    check(sidecar.inventoryFile === base + 'inventory.json' && sidecar.inventorySha256 === inventorySha256
      && advertised.exitCode === 0 && !advertised.signal && advertised.result?.status === 'inventory'
      && advertised.result.inventorySha256 === inventorySha256 && advertised.result.assetCount === 25
      && advertised.result.assetBytesRead === 0 && advertised.result.nextAfterId === cursor
      && advertised.result.exhausted === false
      && advertised.result.inventoryPath === path.posix.join(DIRECTORY, base + 'inventory.json')
      && advertised.result.digestPath === path.posix.join(DIRECTORY, base + 'inventory.json.sha256.json'),
    'inspection_inventory_receipt_mismatch');
    const executionBytes = await bytes(base + 'execute-result.json');
    const execution = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(executionBytes));
    const journalBytes = await bytes(base + 'events.jsonl');
    const journalSha256 = hash(journalBytes);
    if (sequence === 5) {
      stopped = validateStopped({ inventoryBytes, inventorySha256, journalBytes, journalSha256,
        executionBytes, executionSha256: hash(executionBytes),
        expectedFailure: { publishedCount: 11, rowId: FAILED_ROW, code: 'cancelled_or_deadline' } });
      check(stopped.publishedOperations.length === 11 && stopped.failedRow.id === FAILED_ROW
        && stopped.remainingRows.length === 13, 'inspection_stopped_scope_mismatch');
      for (const operation of stopped.publishedOperations) expectedRows.set(operation.after.id, operation.after);
      for (const row of [stopped.failedRow, ...stopped.remainingRows]) expectedRows.set(row.id, row);
      const error = await json(base + 'error.json');
      check(same(error, { status: 'blocked', code: 'runner_execution_incomplete', sequence: 5,
        afterId, requiresReconciliation: true }), 'inspection_stopped_error_mismatch');
      continue;
    }
    check(journalBytes.at(-1) === 10, 'inspection_journal_truncated');
    const records = new TextDecoder('utf-8', { fatal: true }).decode(journalBytes).trimEnd().split('\n').map(line => JSON.parse(line));
    const operations = validateCatalogueMigrationJournal(records, inventory, inventorySha256);
    check(operations.length === 25 && execution.exitCode === 0 && !execution.signal
      && execution.result?.status === 'complete' && execution.result.remaining === 0
      && execution.result.results?.length === 25, 'inspection_completed_batch_mismatch');
    const receipts = new Map(operations.map(operation => [operation.receipt.rowId, operation.receipt]));
    const resultRows = new Set();
    for (const row of execution.result.results) {
      check(row.status === 'published' && !resultRows.has(row.rowId) && receipts.has(row.rowId) && same(row.receipt, receipts.get(row.rowId)),
        'inspection_completed_receipt_mismatch');
      resultRows.add(row.rowId);
    }
    for (const operation of operations) expectedRows.set(operation.after.id, operation.after);
    const expectedCheckpoint = { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256,
      intentSha256: known.get(base + 'intent.json').sha256, inventorySha256,
      inventoryResultSha256: known.get(base + 'inventory-result.json').sha256,
      digestSha256: known.get(base + 'inventory.json.sha256.json').sha256,
      assetCount: 25, nextAfterId: cursor, exhausted: false,
      resultSha256: hash(executionBytes), journalSha256, totalPublished: sequence * 25 };
    check(same(await json(base + 'checkpoint.json'), expectedCheckpoint), 'inspection_checkpoint_mismatch');
    previousCheckpointSha256 = known.get(base + 'checkpoint.json').sha256;
    afterId = cursor;
  }
  check(expectedRows.size === 125, 'inspection_total_rows_mismatch');
  let databaseVerified = false;
  if (mode === 'verify') {
    const config = migrationConfiguration(['--mode=inventory', '--expected-ref=' + REF,
      '--inventory=' + path.join(directory, 'unused.json'), '--limit=25', '--object-timeout-ms=30000'], env);
    check(same(config.destinationBucket, OPTIONS.destinationBucket) && config.publicBaseUrl === OPTIONS.publicBaseUrl,
      'inspection_destination_mismatch');
    let db;
    try {
      db = createDb(config.databaseUrl);
      await db.connect();
      await db.query('begin isolation level repeatable read read only');
      const result = await db.query('select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id',
        [[...expectedRows.keys()]]);
      check(result.rows.length === 125 && new Set(result.rows.map(row => row.asset.id)).size === 125,
        'inspection_database_count_mismatch');
      check(result.rows.every(row => expectedRows.has(row.asset.id) && same(row.asset, expectedRows.get(row.asset.id))),
        'inspection_database_drift');
      await db.query('commit');
      databaseVerified = true;
    } catch (error) {
      if (db) await db.query('rollback').catch(() => {});
      throw error;
    } finally { if (db) await db.end(); }
  }
  check((await snapshot(directory)).sha256 === observed.sha256, 'inspection_evidence_changed');
  return { schemaVersion: 1, kind: 'stackr-r2-stopped-run-inspection', mode,
    evidenceSha256: observed.sha256, files: observed.files,
    completedBatches: 4, completedRows: 100, stoppedPublishedRows: 11, unchangedRows: 14,
    failedRowId: FAILED_ROW, databaseVerified, fullRowsMatched: databaseVerified ? 125 : 0,
    originalLockPreserved: true, sourceObjectsDeleted: 0, pointerProof: databaseVerified
      ? '111_exact_committed_after_rows_and_14_exact_original_rows' : 'not_checked',
    stoppedEvidenceHashes: stopped.hashes, authorizesResume: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--(mode|expected-evidence-sha256)=(.+)$/.exec(raw);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('inspection_invalid_arguments');
    args[match[1]] = match[2];
  }
  inspectStoppedRun({ mode: args.mode ?? 'hash', expectedEvidenceSha256: args['expected-evidence-sha256'] })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(JSON.stringify({ ok: false,
      code: /^[a-z][a-z0-9_]{0,127}$/.test(error?.code ?? '') ? error.code : 'inspection_failed' })); process.exitCode = 1; });
}
