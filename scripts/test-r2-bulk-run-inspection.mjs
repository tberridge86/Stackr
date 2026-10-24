import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectBulkRun, assertBulkInspectionUid, readBulkInspectionFile, validateBulkJournal } from './inspect-r2-bulk-run.mjs';
import { migrateCatalogueAssets } from './lib/r2-catalogue-migration.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const target = '/data/r2-catalogue-migration/production-bulk-20261024';
const ref = 'oakdbbzdqwurpjnoqhmu';
const env = { RAILWAY_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', SUPABASE_URL: 'https://' + ref + '.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:fixture@db.' + ref + '.supabase.co/postgres',
  STACKR_R2_BUCKET: 'stackr-catalogue-public', STACKR_R2_PUBLIC_BASE_URL: 'https://assets.stackrtcg.com' };
const options = { sourceBucket: env.STACKR_R2_BUCKET, destinationBucket: env.STACKR_R2_BUCKET,
  publicBaseUrl: env.STACKR_R2_PUBLIC_BASE_URL, maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000 };
const body = Buffer.from('fixture immutable original');
const rowId = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const asset = index => ({ id: rowId(index), asset_id: 'fixture-' + index, asset_type: 'card_image',
  source_id: 'fixture-source', variant_id: 'fixture-variant-' + index,
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-24T00:00:00Z', storage_provider: 'supabase_storage',
  storage_bucket: env.STACKR_R2_BUCKET, storage_key: 'old/' + index + '.png', storage_path: 'old/' + index + '.png',
  url: 'https://source.example/old/' + index + '.png', mime_type: 'image/png',
  content_sha256: hash(body), sha256: hash(body), byte_size: body.length,
  cache_control: null, archival_storage_key: null,
  derivative_list: [{ role: 'detail', storageProvider: 'supabase_storage', storageBucket: env.STACKR_R2_BUCKET,
    storageKey: 'old/detail-' + index + '.png', mimeType: 'image/png', byteSize: body.length, contentSha256: hash(body) }],
});
const root = await mkdtemp(path.join(tmpdir(), 'r2-bulk-inspection-'));
const directory = path.join(root, 'production-bulk-20261024');
await mkdir(directory);
const baseline = new Map();
const expected = new Map();
let reads = 0; let connects = 0; let drift = null; let changedEvidence = false;
const queryLog = [];
const seam = { directory, env, assertUid: () => {}, assertHost: async () => {}, createDb: () => ({
  async connect() { connects++; }, async end() {},
  async query(sql, parameters) {
    queryLog.push(sql);
    if (!sql.startsWith('select ')) return { rows: [] };
    assert.equal(parameters[0].length, 25, 'one bounded batch per DB query'); reads++;
    const rows = parameters[0].map(id => ({ asset: structuredClone(expected.get(id)) }));
    if (drift) drift(rows, parameters[0]);
    if (changedEvidence) await writeFile(path.join(directory, 'runner.lock'), 'changed');
    return { rows };
  },
}) };
async function save(name, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  await writeFile(path.join(directory, name), bytes); return hash(bytes);
}
const base = sequence => 'batch-' + String(sequence).padStart(6, '0') + '.';
const encodeJournal = records => Buffer.from(records.map(row => JSON.stringify(row)).join('\n') + '\n');
async function restore() {
  for (const name of await readdir(directory)) if (!baseline.has(name)) await rm(path.join(directory, name), { force: true });
  for (const [name, bytes] of baseline) await writeFile(path.join(directory, name), bytes);
  for (let index = 1; index <= 50; index++) expected.set(rowId(index), asset(index));
  for (const item of first.records) if (item.event === 'database_cas_committed') expected.set(item.rowId, structuredClone(item.after));
  drift = null; changedEvidence = false;
}
async function tailThrough(event, row = 32) {
  await restore();
  const index = second.records.findIndex(record => record.event === event
    && (record.rowId ?? record.plan?.rowId ?? record.receipt?.rowId) === rowId(row));
  assert.ok(index >= 0);
  const records = second.records.slice(0, index + 1);
  for (const record of records) if (record.event === 'database_cas_committed') expected.set(record.rowId, structuredClone(record.after));
  await writeFile(path.join(directory, base(2) + 'events.jsonl'), encodeJournal(records));
  return records;
}
async function inspect(options = {}) { return inspectBulkRun({ ...seam, ...options }); }
async function verify() {
  const observed = await inspect();
  return inspect({ mode: 'verify', expectedEvidenceSha256: observed.evidenceSha256 });
}
let first; let second;
try {
  const manifestSha256 = await save('run.json', { schemaVersion: 1, kind: 'stackr-r2-sequential-run',
    runId: 'production-bulk-20261024', expectedRef: ref, railwayServiceId: env.RAILWAY_SERVICE_ID,
    railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID, options, limit: 25 });
  await save('runner.lock', { schemaVersion: 1, processId: 77, startedAt: '2026-10-24T00:00:00Z' });
  let previousCheckpointSha256 = null; let afterId = null;
  async function makeBatch(sequence, checkpointed) {
    const name = base(sequence);
    const assets = Array.from({ length: 25 }, (_, index) => asset((sequence - 1) * 25 + index + 1));
    const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', expectedRef: ref,
      createdAt: '2026-10-24T00:00:00Z', sourceOrigin: env.SUPABASE_URL, options, limit: 25,
      afterId, nextAfterId: assets.at(-1).id, exhausted: false, assets };
    const intentSha256 = await save(name + 'intent.json', { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256 });
    const inventorySha256 = await save(name + 'inventory.json', inventory);
    const digestSha256 = await save(name + 'inventory.json.sha256.json', { inventoryFile: name + 'inventory.json', inventorySha256 });
    const inventoryResultSha256 = await save(name + 'inventory-result.json', { exitCode: 0, signal: null,
      result: { status: 'inventory', assetCount: 25, assetBytesRead: 0, inventorySha256,
        inventoryPath: target + '/' + name + 'inventory.json', digestPath: target + '/' + name + 'inventory.json.sha256.json',
        nextAfterId: inventory.nextAfterId, exhausted: false } });
    const records = [{ event: 'migration_preflight', inventorySha256, inventory,
      railwayServiceId: env.RAILWAY_SERVICE_ID, railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID }];
    const result = await migrateCatalogueAssets({ ...options, assets, execute: true,
      readSource: async () => body,
      destinationStorage: { id: 's3_compatible', catalogueStorage: true, catalogueBucket: options.destinationBucket,
        publicUrl: (bucket, key) => options.publicBaseUrl + '/' + key,
        async putObject() {}, async getObject() { return body; } },
      fetchImpl: async () => new Response(body, { headers: { 'content-type': 'image/png', 'content-length': String(body.length) } }),
      journal: async record => records.push(structuredClone(record)),
      publish: async plan => {
        const before = assets.find(row => row.id === plan.rowId);
        const after = { ...before, ...plan.patch, updated_at: '2026-10-24T01:00:00.123456Z' };
        records.push({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId, before, after });
        return { applied: true, updatedAt: after.updated_at };
      } });
    assert.equal(result.status, 'complete');
    const journalBytes = encodeJournal(records);
    if (checkpointed) {
      await writeFile(path.join(directory, name + 'events.jsonl'), journalBytes);
      const resultSha256 = await save(name + 'execute-result.json', { exitCode: 0, signal: null, result });
      previousCheckpointSha256 = await save(name + 'checkpoint.json', { schemaVersion: 1, manifestSha256, sequence, afterId,
        previousCheckpointSha256, intentSha256, inventorySha256, inventoryResultSha256, digestSha256,
        assetCount: 25, nextAfterId: inventory.nextAfterId, exhausted: false, resultSha256,
        journalSha256: hash(journalBytes), totalPublished: sequence * 25 });
      afterId = inventory.nextAfterId;
    }
    return { records, inventory, inventorySha256, result };
  }
  first = await makeBatch(1, true); second = await makeBatch(2, false);
  for (const name of await readdir(directory)) baseline.set(name, await readFile(path.join(directory, name)));
  await restore();
  const inventoryOnly = await inspect();
  assert.equal(inventoryOnly.completedRows, 25); assert.equal(inventoryOnly.tail.stage, 'inventory_only');
  assert.equal(connects, 0); assert.equal(inventoryOnly.authorizesResume, false);
  assert.equal(inventoryOnly.workerRetirementVerified, false); assert.equal(inventoryOnly.originalLockPreserved, true);
  assert.equal((await verify()).fullRowsMatched, 50);
  await assert.rejects(inspect({ mode: 'verify' }), /bulk_inspection_approved_digest_required/);
  await assert.rejects(inspect({ mode: 'verify', expectedEvidenceSha256: '0'.repeat(64) }), /bulk_inspection_approved_digest_mismatch/);
  await assert.rejects(inspect({ maxBatches: 1 }), /bulk_inspection_(unexpected_evidence_file|file_bound_exceeded)/);
  await assert.rejects(inspect({ maxBatches: 101 }), /bulk_inspection_batch_bound/);
  for (const event of ['object_pending', 'object_verified', 'publication_pending', 'database_cas_committed', 'publication_complete']) {
    await tailThrough(event);
    const observed = await verify();
    assert.equal(observed.fullRowsMatched, 50);
    assert.equal(observed.tail.completedReceipts, event === 'publication_complete' ? 7 : 6);
    assert.equal(observed.journalCommittedRows, ['database_cas_committed', 'publication_complete'].includes(event) ? 32 : 31);
    if (event === 'publication_pending') assert.equal(observed.recoveredPublications[0].state, 'exact_before');
  }
  await tailThrough('publication_pending');
  const plannedCommit = second.records.find(row => row.event === 'database_cas_committed' && row.rowId === rowId(32));
  expected.set(rowId(32), structuredClone(plannedCommit.after));
  const recovered = await verify();
  assert.equal(recovered.recoveredPublications[0].state, 'exact_planned_after');
  assert.equal(recovered.recoveredPublications[0].timestampSource, 'live_database');
  assert.equal(recovered.recoveredPublications[0].receipt.updatedAt, plannedCommit.after.updated_at);
  expected.get(rowId(32)).source_id = 'unrelated drift';
  await assert.rejects(verify(), /bulk_inspection_pending_database_drift/);
  await tailThrough('database_cas_committed'); expected.set(rowId(32), asset(32));
  await assert.rejects(verify(), /bulk_inspection_database_drift/);
  await tailThrough('object_verified'); expected.get(rowId(32)).url = 'https://drift.example';
  await assert.rejects(verify(), /bulk_inspection_database_drift/);
  await restore(); drift = rows => rows.splice(0, 1);
  await assert.rejects(verify(), /bulk_inspection_database_count_mismatch/);
  await restore(); drift = rows => { rows[0].asset.permission_status = 'revoked'; };
  await assert.rejects(verify(), /bulk_inspection_database_drift/);
  await restore(); changedEvidence = true;
  await assert.rejects(verify(), /bulk_inspection_evidence_changed/);
  await restore();
  const records = await tailThrough('publication_pending');
  const poisoned = structuredClone(records); poisoned.at(-1).plan.patch.source_id = 'invented identity';
  await writeFile(path.join(directory, base(2) + 'events.jsonl'), encodeJournal(poisoned));
  await assert.rejects(inspect(), /bulk_inspection_publication_plan/);
  await writeFile(path.join(directory, base(2) + 'events.jsonl'), encodeJournal(records).subarray(0, -1));
  await assert.rejects(inspect(), /bulk_inspection_journal_truncated/);
  const wrongObject = structuredClone(records); wrongObject[1].object.key = 'wrong/key';
  assert.throws(() => validateBulkJournal(encodeJournal(wrongObject), second.inventory, second.inventorySha256), /bulk_inspection_object_destination/);
  await restore();
  const checkpoint = JSON.parse(baseline.get(base(1) + 'checkpoint.json')); checkpoint.totalPublished = 24;
  await save(base(1) + 'checkpoint.json', checkpoint);
  await assert.rejects(inspect(), /bulk_inspection_checkpoint_mismatch/);
  await restore();
  await writeFile(path.join(directory, base(2) + 'events.jsonl'), encodeJournal(second.records));
  for (const row of second.records) if (row.event === 'database_cas_committed') expected.set(row.rowId, row.after);
  await save(base(2) + 'execute-result.json', { exitCode: 0, signal: null, result: second.result });
  const allDone = await verify(); assert.equal(allDone.tail.completedReceipts, 25); assert.equal(allDone.journalCommittedRows, 50);
  // A second checkpoint must bind the previous checkpoint, not just its own files.
  const secondCheckpoint = { schemaVersion: 1, manifestSha256, sequence: 2, afterId: rowId(25),
    previousCheckpointSha256: hash(baseline.get(base(1) + 'checkpoint.json')),
    intentSha256: hash(await readFile(path.join(directory, base(2) + 'intent.json'))),
    inventorySha256: second.inventorySha256,
    inventoryResultSha256: hash(await readFile(path.join(directory, base(2) + 'inventory-result.json'))),
    digestSha256: hash(await readFile(path.join(directory, base(2) + 'inventory.json.sha256.json'))),
    assetCount: 25, nextAfterId: rowId(50), exhausted: false,
    resultSha256: hash(await readFile(path.join(directory, base(2) + 'execute-result.json'))),
    journalSha256: hash(encodeJournal(second.records)), totalPublished: 50 };
  const secondCheckpointSha256 = await save(base(2) + 'checkpoint.json', secondCheckpoint);
  assert.equal((await verify()).completedBatches, 2);
  await save(base(2) + 'checkpoint.json', { ...secondCheckpoint, previousCheckpointSha256: '0'.repeat(64) });
  await assert.rejects(inspect(), /bulk_inspection_checkpoint_mismatch/);
  await save(base(2) + 'checkpoint.json', secondCheckpoint);
  const empty = { ...second.inventory, afterId: rowId(50), nextAfterId: rowId(50), exhausted: true, assets: [] };
  const thirdIntentSha256 = await save(base(3) + 'intent.json', { schemaVersion: 1, manifestSha256, sequence: 3,
    afterId: rowId(50), previousCheckpointSha256: secondCheckpointSha256 });
  const emptySha256 = await save(base(3) + 'inventory.json', empty);
  const emptyDigestSha256 = await save(base(3) + 'inventory.json.sha256.json', { inventoryFile: base(3) + 'inventory.json', inventorySha256: emptySha256 });
  const emptyResultSha256 = await save(base(3) + 'inventory-result.json', { exitCode: 0, signal: null,
    result: { status: 'inventory', assetCount: 0, assetBytesRead: 0, inventorySha256: emptySha256,
      inventoryPath: target + '/' + base(3) + 'inventory.json', digestPath: target + '/' + base(3) + 'inventory.json.sha256.json',
      nextAfterId: rowId(50), exhausted: true } });
  await save(base(3) + 'checkpoint.json', { schemaVersion: 1, manifestSha256, sequence: 3, afterId: rowId(50),
    previousCheckpointSha256: secondCheckpointSha256, intentSha256: thirdIntentSha256,
    inventorySha256: emptySha256, inventoryResultSha256: emptyResultSha256, digestSha256: emptyDigestSha256,
    assetCount: 0, nextAfterId: rowId(50), exhausted: true, totalPublished: 50 });
  const terminal = await verify();
  assert.equal(terminal.completedBatches, 3); assert.equal(terminal.completedRows, 50); assert.equal(terminal.tail, null);
  // Failed child result: only a single attempted next row is permitted.
  const stoppedRecords = await tailThrough('object_pending');
  const stoppedState = validateBulkJournal(encodeJournal(stoppedRecords), second.inventory, second.inventorySha256);
  const stopped = { status: 'stopped', processedBytes: stoppedState.processedBytes,
    results: [...stoppedState.completed.map(operation => ({ rowId: operation.before.id, status: 'published', receipt: operation.receipt })),
      { rowId: rowId(32), status: 'failed', code: 'cancelled_or_deadline' }], remaining: 18 };
  await save(base(2) + 'execute-result.json', { exitCode: 1, signal: null, result: stopped });
  assert.equal((await verify()).tail.completedReceipts, 6);
  stopped.results.at(-1).rowId = rowId(33);
  await save(base(2) + 'execute-result.json', { exitCode: 1, signal: null, result: stopped });
  await assert.rejects(inspect(), /bulk_inspection_failed_result_mismatch/);
  await restore();
  for (const suffix of ['inventory.json', 'inventory.json.sha256.json', 'inventory-result.json']) await rm(path.join(directory, base(2) + suffix));
  assert.equal((await verify()).tail.stage, 'intent_only');
  await restore(); await writeFile(path.join(directory, 'unexpected.txt'), 'unexpected');
  await assert.rejects(inspect(), /bulk_inspection_unexpected_evidence_file/);
  await restore(); await rm(path.join(directory, 'runner.lock'));
  await assert.rejects(inspect(), /bulk_inspection_missing_evidence/);
  await restore();
  await assert.rejects(readBulkInspectionFile(path.join(directory, 'run.json'), 1), /bulk_inspection_invalid_evidence_file/);
  assert.throws(() => assertBulkInspectionUid({ getuid: () => 0, geteuid: () => 0 }), /bulk_inspection_unprivileged_uid_required/);
  assertBulkInspectionUid({ getuid: () => 1000, geteuid: () => 1000 });
  if (process.platform !== 'win32') {
    await symlink(path.join(directory, 'run.json'), path.join(directory, 'unexpected.txt'));
    await assert.rejects(inspect(), /bulk_inspection_nonregular_evidence/);
    await assert.rejects(readBulkInspectionFile(path.join(directory, 'unexpected.txt'), 65536));
    await rm(path.join(directory, 'unexpected.txt'));
  }
  await restore();
  for (const [name, bytes] of baseline) assert.deepEqual(await readFile(path.join(directory, name)), bytes);
  assert.ok(reads > 20); assert.ok(queryLog.includes('begin isolation level repeatable read read only'));
  assert.ok(queryLog.includes('rollback')); assert.ok(queryLog.includes('commit'));
  assert.ok(queryLog.every(sql => /^(begin isolation level repeatable read read only|select to_jsonb|commit|rollback)/.test(sql)));
  console.log('bulk inspection passed: checkpoint chain, every interruption boundary, exact before/after DB reconciliation, digest/drift/bounds rejection, preserved evidence');
} finally {
  assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}


