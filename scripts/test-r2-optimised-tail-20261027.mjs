import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createOptimisedTailInspector, inspectOptimisedTail20261027,
  readOptimisedRunExpectations20261027 } from './inspect-r2-optimised-tail-20261027.mjs';

const CORE_SHA = 'd05fdae0f9d7280b70f03aad681eb2b01e6b31b7d4c11acab31745c4ed14b922';
const corePath = process.env.STACKR_DIAGNOSTIC_TEST_CORE ?? new URL('./lib/r2-catalogue-migration.mjs', import.meta.url);
const coreBytes = await readFile(corePath);
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(coreBytes), CORE_SHA, 'Tests require the exact production-pinned pure core');
const core = await import('data:text/javascript;base64,' + coreBytes.toString('base64'));
const inspectorBytes = await readFile(new URL('./inspect-r2-optimised-tail-20261027.mjs', import.meta.url));
const inspectorText = inspectorBytes.toString('utf8');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const encode = value => Buffer.from(JSON.stringify(value));
const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const CURRENT = 'production-optimised-20261026b';
const OLD = 'production-resumed-20261026a';
const ROOT = '/data/r2-catalogue-migration/';
const CACHE = 'public, max-age=31536000, immutable';
const ENV = { RAILWAY_SERVICE_ID: SERVICE, RAILWAY_ENVIRONMENT_ID: ENVIRONMENT, RAILWAY_PROJECT_ID: PROJECT };
const OPTIONS = { sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-public',
  publicBaseUrl: 'https://assets.stackrtcg.com', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000, concurrency: 8 };
const SOURCE_PINS = {
  'run-r2-catalogue-migration.mjs': '015b6b36f19840c367be96a5a8a18605e4ad36fe2d813e7ff574f10e4a1adadc',
  'inspect-r2-bulk-run.mjs': '72b5c6765e03d74d98aef38b21f0148627f7ec437298f23661c83320e453e7d3',
  'migrate-catalogue-to-r2.mjs': '757abcbc4347d186ce481746f4d704c63228f3b7644df9890f56e73b0a8f13dd',
  'lib/r2-catalogue-migration.mjs': CORE_SHA,
  'deploy/verified-supabase-postgres.mjs': '8e2bf4f392a465fad9bd6669dba5b68fb081a6ca9489b5b4d3b75ac5e5327cb7',
};
const PREFIX = number => 'batch-' + String(number).padStart(6, '0') + '.';
const SECRET = 'DO_NOT_LOG_PRIVATE_METADATA_OR_PROVIDER_TOKEN_12345';
function asset(number, derivativeCount = 1) {
  return { id: '00000000-0000-4000-8000-' + number.toString(16).padStart(12, '0'),
    asset_id: SECRET + '-' + number, asset_type: 'card', updated_at: '2026-10-26T08:00:00.000Z',
    source_id: null, variant_id: null, rights_status: 'approved', permission_status: 'approved',
    asset_visibility: 'public_catalogue', publicly_servable: true, retention_status: 'active',
    deleted_at: null, deprecated_at: null, storage_provider: 'supabase_storage',
    storage_bucket: OPTIONS.sourceBucket, storage_key: SECRET + '/original', storage_path: SECRET + '/original',
    url: 'https://' + REF + '.supabase.co/storage/v1/object/public/' + OPTIONS.sourceBucket + '/' + SECRET,
    content_sha256: hash('data'), sha256: hash('data'), byte_size: 4, mime_type: 'image/webp',
    cache_control: null, archival_storage_key: null, metadata: { secret: SECRET },
    derivative_list: Array.from({ length: derivativeCount }, (_, index) => ({ role: 'grid' + index,
      mimeType: 'image/webp', storageKey: SECRET + '/grid' + index, byteSize: 4,
      contentSha256: hash('data'), metadata: { secret: SECRET } })),
  };
}
function object(row, descriptor) {
  const key = 'public/' + row.asset_type + '/' + row.id + '/' + hash(row.asset_id)
    + '/' + hash('data') + '/' + descriptor.role + '.webp';
  return { role: descriptor.role, index: descriptor.index, bucket: OPTIONS.destinationBucket, key,
    url: OPTIONS.publicBaseUrl + '/' + key, mimeType: 'image/webp', byteSize: 4, sha256: hash('data') };
}
function prepared(row, plan, objects) {
  const original = objects[0];
  const patch = { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list: row.derivative_list.map((derivative, index) => ({ ...derivative,
      storageProvider: 's3_compatible', storageBucket: objects[index + 1].bucket, storageKey: objects[index + 1].key,
      contentSha256: objects[index + 1].sha256, byteSize: objects[index + 1].byteSize,
      cacheControl: CACHE, url: objects[index + 1].url, deliveryUrl: objects[index + 1].url })), cache_control: CACHE };
  return { ...plan, objects, patch, operationId: fingerprint({ rowId: row.id, snapshotHash: plan.snapshotHash, patch }) };
}
function fixture(runId = CURRENT) {
  const files = new Map(); const directory = ROOT + runId;
  const manifest = { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId, expectedRef: REF,
    railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT, options: OPTIONS, limit: 25 };
  files.set('run.json', encode(manifest));
  files.set('runner.lock', encode({ schemaVersion: 1, processId: 25, startedAt: '2026-10-26T08:55:00.000Z' }));
  let lastId = null; let lastCheckpointSha = null; let publishedTotal = 0;
  function batch(sequence, { count = 25, receipts = count, ambiguous = null, derivativeCount = 1,
    complete = false, sensitiveCode = false, historicalSuccessor = false } = {}) {
    const start = (sequence - 1) * 25 + 1; const rows = Array.from({ length: count }, (_, index) => asset(start + index, derivativeCount));
    if (historicalSuccessor) { assert.equal(count, 1); rows[0].id = '62db634c-943e-4570-a606-d1039746a477'; }
    const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', expectedRef: REF,
      sourceOrigin: 'https://' + REF + '.supabase.co', options: OPTIONS, limit: 25, afterId: lastId,
      nextAfterId: rows.at(-1)?.id ?? lastId, exhausted: count < 25, assets: rows };
    const prefix = PREFIX(sequence); const manifestSha256 = hash(files.get('run.json'));
    files.set(prefix + 'intent.json', encode({ schemaVersion: 1, manifestSha256, sequence,
      afterId: lastId, previousCheckpointSha256: lastCheckpointSha }));
    files.set(prefix + 'inventory.json', encode(inventory));
    const inventorySha256 = hash(files.get(prefix + 'inventory.json'));
    files.set(prefix + 'inventory.json.sha256.json', encode({ inventoryFile: prefix + 'inventory.json', inventorySha256 }));
    files.set(prefix + 'inventory-result.json', encode({ exitCode: 0, signal: null, result: { status: 'inventory',
      assetCount: rows.length, assetBytesRead: 0, inventorySha256, inventoryPath: directory + '/' + prefix + 'inventory.json',
      digestPath: directory + '/' + prefix + 'inventory.json.sha256.json', nextAfterId: inventory.nextAfterId, exhausted: inventory.exhausted } }));
    const journal = [{ event: 'migration_preflight', inventorySha256, inventory,
      railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT }];
    const results = []; let objectCount = 0;
    for (let offset = 0; offset < rows.length; offset += 8) {
      if (offset > receipts || (offset === receipts && !ambiguous)) break;
      const window = rows.slice(offset, offset + 8);
      const plans = window.map(row => core.planCatalogueAssetMigration(row, OPTIONS));
      const preparedPlans = window.map((row, index) => {
        const objects = plans[index].objects.map(descriptor => {
          const pending = object(row, descriptor); objectCount++;
          journal.push({ event: 'object_pending', rowId: row.id, object: pending });
          const verified = { ...pending, reused: false };
          journal.push({ event: 'object_verified', rowId: row.id, object: verified });
          return verified;
        });
        return prepared(row, plans[index], objects);
      });
      for (let index = 0; index < window.length; index++) {
        const row = window[index]; const plan = preparedPlans[index]; const globalIndex = offset + index;
        if (globalIndex < receipts || (globalIndex === receipts && ambiguous)) {
          journal.push({ event: 'publication_pending', plan });
          const after = { ...row, ...plan.patch, updated_at: '2026-10-26T21:33:10.000Z' };
          if (globalIndex < receipts || ambiguous === 'commit') journal.push({ event: 'database_cas_committed',
            operationId: plan.operationId, rowId: row.id, before: row, after });
          if (globalIndex < receipts) {
            const receipt = { ...plan, updatedAt: after.updated_at, status: 'published' };
            journal.push({ event: 'publication_complete', receipt });
            results.push({ rowId: row.id, status: 'published', receipt }); continue;
          }
        }
        results.push({ rowId: row.id,
          status: globalIndex === receipts && ambiguous ? 'publication_requires_reconciliation' : 'failed',
          code: sensitiveCode ? SECRET : 'publication_window_stopped',
          transfers: plan.objects.map(entry => ({ role: entry.role, index: entry.index, status: 'verified', stage: 'verified', object: entry })) });
      }
      if (results.length > receipts) break;
    }
    const processedBytes = objectCount * 4;
    const phaseMetrics = { concurrency: 8, elapsedMs: 1,
      ...Object.fromEntries(['source', 'put', 'r2Read', 'cdn', 'journal', 'publish'].map(phase => [phase,
        { count: phase === 'publish' ? receipts : phase === 'journal' ? 2 * objectCount + 2 * receipts : objectCount, elapsedMs: 1 }])) };
    const execute = { exitCode: complete ? 0 : 1, signal: null, result: { status: complete ? 'complete' : 'stopped',
      processedBytes, results, remaining: count - results.length, phaseMetrics } };
    files.set(prefix + 'events.jsonl', Buffer.from(journal.map(record => JSON.stringify(record)).join('\n') + '\n'));
    files.set(prefix + 'execute-result.json', encode(execute));
    if (complete) {
      publishedTotal += rows.length;
      const checkpoint = { schemaVersion: 1, manifestSha256, sequence, afterId: lastId, previousCheckpointSha256: lastCheckpointSha,
        intentSha256: hash(files.get(prefix + 'intent.json')), inventorySha256,
        inventoryResultSha256: hash(files.get(prefix + 'inventory-result.json')), digestSha256: hash(files.get(prefix + 'inventory.json.sha256.json')),
        assetCount: rows.length, nextAfterId: inventory.nextAfterId, exhausted: inventory.exhausted,
        resultSha256: hash(files.get(prefix + 'execute-result.json')), journalSha256: hash(files.get(prefix + 'events.jsonl')),
        totalPublished: publishedTotal };
      files.set(prefix + 'checkpoint.json', encode(checkpoint)); lastId = inventory.nextAfterId; lastCheckpointSha = hash(files.get(prefix + 'checkpoint.json'));
    }
    return { rows, inventory, journal, execute };
  }
  const activity = { reads: 0, lists: 0, sourceChecks: 0 };
  const deps = {
    assertBulkInspectionUid() {}, assertRunnerProject() {}, async assertHostedRunner() {},
    async verifySourceFiles() { activity.sourceChecks++; return Object.entries(SOURCE_PINS).map(([name, sha256]) => ({ name, bytes: 1, sha256 })); },
    async realpath(path) { return path; },
    async list(path) { assert.equal(path, directory); activity.lists++; return [...files.keys()].map(name => ({ name, regular: true })); },
    async readBulkInspectionFile(path, maximum, retain = true) {
      assert.ok(path.startsWith(directory + '/')); const bytes = files.get(path.slice(directory.length + 1));
      assert.ok(bytes, 'only fixture evidence paths may be read'); assert.ok(bytes.length <= maximum); activity.reads++;
      return { bytes: bytes.length, sha256: hash(bytes), ...(retain ? { content: bytes } : {}) };
    },
    planCatalogueAssetMigration: core.planCatalogueAssetMigration,
    validateCatalogueMigrationJournal: core.validateCatalogueMigrationJournal,
    createCatalogueMigrationRollback: core.createCatalogueMigrationRollback,
    createDb() { assert.fail('DB is forbidden'); }, fetch() { assert.fail('network is forbidden'); },
    runR2MigrationRunner() { assert.fail('runner is forbidden'); }, writeFile() { assert.fail('writes are forbidden'); },
  };
  return { files, batch, deps, activity, runId, inspect: () => createOptimisedTailInspector(deps)({ runId, env: ENV }) };
}

test('production-pinned core validates complete checkpoint and interrupted tail without mutations or leakage', async () => {
  const f = fixture(); f.batch(1, { complete: true }); const tail = f.batch(2, { count: 3, receipts: 1, ambiguous: 'pending', sensitiveCode: true });
  const before = [...f.files].map(([name, bytes]) => [name, hash(bytes)]);
  const result = await f.inspect();
  assert.equal(result.summary.completedBatches, 1); assert.equal(result.summary.tail.assetCount, 3);
  assert.equal(result.summary.tail.publishedAssets, 1); assert.equal(result.summary.tail.executionResultCount, 3);
  assert.equal(result.summary.tail.stage, 'publication_pending_before_required');
  assert.equal(result.summary.databaseQueried, false); assert.equal(result.summary.networkRequested, false);
  assert.equal(result.summary.evidenceModified, false); assert.equal(result.summary.resumeAuthorized, false);
  const rows = result.events.filter(event => event.event === 'r2_tail_diagnostic_row');
  assert.deepEqual(rows.map(row => row.status), ['published_receipt', 'publication_pending_outcome_unknown', 'no_publication_record']);
  assert.equal(rows[1].journalExpectedSnapshotSha256, null); assert.equal(rows[1].recordedCommitSnapshotSha256, null);
  assert.equal(rows[0].beforeSnapshotSha256, fingerprint(tail.rows[0]));
  assert.equal(rows[1].failure.code, 'unrecognized_code'); assert.equal(rows[1].failure.codeSha256, hash(SECRET));
  const serialized = result.events.map(event => JSON.stringify(event));
  assert.ok(!serialized.join('\n').includes(SECRET));
  assert.ok(serialized.every(line => Buffer.byteLength(line + '\n') <= 8192));
  const footer = result.events.at(-1);
  assert.equal(footer.eventCount, result.events.length);
  assert.equal(footer.precedingEventsSha256, hash(serialized.slice(0, -1).join('\n') + '\n'));
  assert.deepEqual([...f.files].map(([name, bytes]) => [name, hash(bytes)]), before);
  assert.equal(f.activity.lists, 2); assert.equal(f.activity.sourceChecks, 2);
});

test('committed-without-receipt remains uncertain and reports its independent recorded after hash', async () => {
  const f = fixture(); const batch = f.batch(1, { count: 3, receipts: 1, ambiguous: 'commit' });
  const result = await f.inspect(); const row = result.events.find(event => event.event === 'r2_tail_diagnostic_row' && event.inventoryIndex === 1);
  assert.equal(result.summary.tail.stage, 'commit_without_receipt'); assert.equal(row.status, 'commit_without_receipt');
  assert.equal(row.journalExpectedSnapshotSha256, null); assert.equal(row.receiptSha256, null);
  assert.equal(row.recordedCommitSnapshotSha256, fingerprint(batch.journal.filter(event => event.event === 'database_cas_committed').at(-1).after));
});

test('execution file and runtime result value hashes use distinct documented byte domains', async () => {
  const f = fixture(); const batch = f.batch(1, { count: 3, receipts: 1, ambiguous: 'pending' });
  const key = PREFIX(1) + 'execute-result.json';
  const prettyEnvelope = Buffer.from(JSON.stringify(batch.execute, null, 2) + '\n');
  f.files.set(key, prettyEnvelope);
  const result = await f.inspect(); const tail = result.summary.tail;
  const runtimeBytes = Buffer.from(JSON.stringify(batch.execute.result));
  assert.equal(tail.executionResultSha256, hash(prettyEnvelope));
  assert.equal(tail.executionResultValueSha256, hash(runtimeBytes));
  assert.notEqual(tail.executionResultValueSha256, tail.executionResultSha256);
  assert.notEqual(tail.executionResultValueSha256, fingerprint(batch.execute.result), 'runtime hash must not canonical-sort keys');
  const fileRecord = result.events.find(event => event.event === 'r2_tail_diagnostic_files').files.find(file => file.name === key);
  assert.equal(fileRecord.sha256, tail.executionResultSha256);
  // Formatting changes the file identity, while preserving the runtime value identity.
  f.files.set(key, encode(batch.execute));
  const compact = await f.inspect();
  assert.notEqual(compact.summary.tail.executionResultSha256, tail.executionResultSha256);
  assert.equal(compact.summary.tail.executionResultValueSha256, tail.executionResultValueSha256);
  // No hash is invented when no execution result was durably recorded.
  f.files.delete(key); f.files.delete(PREFIX(1) + 'events.jsonl');
  const inventoryOnly = await f.inspect();
  assert.equal(inventoryOnly.summary.tail.executionResultSha256, null);
  assert.equal(inventoryOnly.summary.tail.executionResultValueSha256, null);
});

test('private expectations cover every validated batch without changing diagnostic events or leaking snapshots', async () => {
  const f = fixture(); const first = f.batch(1, { complete: true });
  const last = f.batch(2, { count: 3, receipts: 1, ambiguous: 'pending' });
  const diagnostic = await f.inspect();
  assert.deepEqual(Object.keys(diagnostic).sort(), ['events', 'summary']);
  const result = await readOptimisedRunExpectations20261027({ runId: CURRENT, env: ENV, dependencies: f.deps });
  assert.deepEqual(result.events, diagnostic.events); assert.deepEqual(result.summary, diagnostic.summary);
  assert.equal(result.rowExpectations.length, 28); assert.equal(result.rowExpectations.filter(row => row.published).length, 26);
  assert.equal(result.rowExpectations[0].beforeSnapshotSha256, fingerprint(first.rows[0]));
  const firstCommit = first.journal.find(record => record.event === 'database_cas_committed');
  assert.equal(result.rowExpectations[0].expectedSnapshotSha256, fingerprint(firstCommit.after));
  assert.equal(result.rowExpectations[0].receiptSha256,
    fingerprint(first.journal.find(record => record.event === 'publication_complete').receipt));
  const pending = result.rowExpectations[26];
  assert.equal(pending.journalState, 'publication_pending_outcome_unknown');
  assert.equal(pending.expectedSnapshotSha256, null); assert.equal(pending.recordedCommitSnapshotSha256, null);
  assert.equal(result.rowExpectations[27].expectedSnapshotSha256, fingerprint(last.rows[2]));
  assert.equal(result.rowExpectations[27].published, false);
  assert.equal(result.publicSamples.length, 4); assert.equal(result.publicSamples[0].rowId, first.rows[0].id);
  assert.equal(result.publicSamples.at(-1).rowId, last.rows[0].id);
  assert.ok(result.publicSamples.every(sample => sample.verifiedRecorded === true && sample.liveVerified === false));
  assert.equal(result.historicalSuccessorReceipt, null);
  assert.ok(!JSON.stringify(result).includes(SECRET));
  assert.ok(result.rowExpectations.every(row => !Object.hasOwn(row, 'before') && !Object.hasOwn(row, 'after')));
  assert.ok(!JSON.stringify(result.events).includes('rowExpectations'));
});

test('private expectations preserve ambiguous commit evidence and still reject final snapshot drift', async () => {
  const f = fixture(); const batch = f.batch(1, { count: 3, receipts: 1, ambiguous: 'commit' });
  const result = await readOptimisedRunExpectations20261027({ runId: CURRENT, env: ENV, dependencies: f.deps });
  const row = result.rowExpectations[1];
  assert.equal(row.published, false); assert.equal(row.journalState, 'commit_without_receipt');
  assert.equal(row.expectedSnapshotSha256, null); assert.equal(row.receiptSha256, null);
  assert.equal(row.recordedCommitSnapshotSha256,
    fingerprint(batch.journal.filter(record => record.event === 'database_cas_committed').at(-1).after));
  const originalList = f.deps.list; f.activity.lists = 0;
  f.deps.list = async path => {
    if (f.activity.lists === 1) f.files.set('runner.lock', encode({ schemaVersion: 1, processId: 99, startedAt: '2026-10-26T08:55:00Z' }));
    return originalList(path);
  };
  await assert.rejects(readOptimisedRunExpectations20261027({ runId: CURRENT, env: ENV, dependencies: f.deps }),
    error => error.code === 'cutover_snapshot_changed');
});

test('only the pinned historical row in the optimized run yields bounded successor receipt evidence', async () => {
  for (const runId of [CURRENT, OLD]) {
    const f = fixture(runId); const batch = f.batch(1, { count: 1, receipts: 1, complete: true, historicalSuccessor: true, derivativeCount: 16 });
    const result = await readOptimisedRunExpectations20261027({ runId, env: ENV, dependencies: f.deps });
    if (runId === OLD) { assert.equal(result.historicalSuccessorReceipt, null); continue; }
    const proof = result.historicalSuccessorReceipt;
    assert.equal(proof.rowId, '62db634c-943e-4570-a606-d1039746a477'); assert.equal(proof.sequence, 1);
    assert.equal(proof.beforeSnapshotSha256, fingerprint(batch.rows[0]));
    assert.equal(proof.afterSnapshotSha256, fingerprint(batch.journal.find(record => record.event === 'database_cas_committed').after));
    const receipt = batch.journal.find(record => record.event === 'publication_complete').receipt;
    assert.equal(proof.operationId, receipt.operationId); assert.equal(proof.receiptSha256, fingerprint(receipt));
    assert.equal(proof.objects.length, 17); assert.equal(proof.databaseCompared, false);
    assert.ok(proof.objects.every(object => object.liveVerified === false && object.verifiedRecorded === true));
    assert.ok(!JSON.stringify(result.events).includes('historicalSuccessorReceipt'));
    assert.ok(!JSON.stringify(result).includes(SECRET));
    await assert.rejects(readOptimisedRunExpectations20261027({ runId, env: ENV, dependencies: f.deps,
      historicalRowId: batch.rows[0].id }), error => error.code === 'cutover_invalid_shape');
  }
});

test('both exact run IDs are accepted, arbitrary run/mode/host rejected before evidence reads', async () => {
  for (const runId of [CURRENT, OLD]) { const f = fixture(runId); assert.equal((await f.inspect()).summary.runId, runId); }
  const f = fixture(); const inspect = createOptimisedTailInspector(f.deps);
  for (const options of [{ runId: '../other', env: ENV }, { runId: CURRENT, env: ENV, mode: 'reconcile' },
    { runId: CURRENT, env: { ...ENV, RAILWAY_SERVICE_ID: 'other' } }]) await assert.rejects(inspect(options));
  assert.equal(f.activity.reads, 0);
});

test('evidence directory links, nonregular entries, oversized/unexpected filenames are rejected', async () => {
  for (const mutate of [
    f => { f.deps.realpath = async () => '/elsewhere'; },
    f => { f.deps.list = async () => [{ name: 'run.json', regular: false }]; },
    f => { f.files.set('../../credentials', Buffer.from('private')); },
    f => { f.deps.readBulkInspectionFile = async () => ({ bytes: 65537, sha256: 'a'.repeat(64) }); },
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.inspect()); }
});

test('truncated, reordered and forged publication evidence fails closed using real validators', async () => {
  for (const mutate of [
    f => { const key = PREFIX(1) + 'events.jsonl'; f.files.set(key, f.files.get(key).subarray(0, -1)); },
    f => { const key = PREFIX(1) + 'events.jsonl'; const records = f.files.get(key).toString().trimEnd().split('\n').map(JSON.parse);
      records.reverse(); f.files.set(key, Buffer.from(records.map(JSON.stringify).join('\n') + '\n')); },
    f => { const key = PREFIX(1) + 'events.jsonl'; const records = f.files.get(key).toString().trimEnd().split('\n').map(JSON.parse);
      records.find(event => event.event === 'publication_complete').receipt.patch.url = 'https://evil.example/' + SECRET;
      f.files.set(key, Buffer.from(records.map(JSON.stringify).join('\n') + '\n')); },
  ]) { const f = fixture(); f.batch(1, { count: 3, receipts: 1, ambiguous: 'pending' }); mutate(f); await assert.rejects(f.inspect()); }
});

test('checkpoint chain digest tampering and snapshot drift are rejected', async () => {
  const f = fixture(); f.batch(1, { complete: true });
  const key = PREFIX(1) + 'checkpoint.json'; const checkpoint = JSON.parse(f.files.get(key)); checkpoint.resultSha256 = 'a'.repeat(64); f.files.set(key, encode(checkpoint));
  await assert.rejects(f.inspect(), error => error.code === 'cutover_checkpoint');
  const g = fixture(); const originalList = g.deps.list;
  g.deps.list = async path => { if (g.activity.lists === 1) g.files.set('runner.lock', encode({ schemaVersion: 1, processId: 99, startedAt: '2026-10-26T08:55:00Z' })); return originalList(path); };
  await assert.rejects(g.inspect(), error => error.code === 'cutover_snapshot_changed');
});

test('source pin change is rejected and maximum derivative fixture stays within event/line limits', async () => {
  const bad = fixture(); const original = bad.deps.verifySourceFiles;
  bad.deps.verifySourceFiles = async () => (await original()).map((file, index) => index ? file : { ...file, sha256: 'a'.repeat(64) });
  await assert.rejects(bad.inspect(), error => error.code === 'cutover_source_mismatch');
  const f = fixture(); f.batch(1, { count: 25, receipts: 16, ambiguous: 'pending', derivativeCount: 16 });
  const result = await f.inspect();
  assert.equal(result.summary.tail.assetCount, 25); assert.equal(result.summary.tail.executionResultCount, 24);
  assert.equal(result.summary.tail.publishedAssets, 16); assert.ok(result.events.length <= 181);
  assert.ok(result.events.every(event => Buffer.byteLength(JSON.stringify(event) + '\n') <= 8192));
  assert.ok(!JSON.stringify(result).includes(SECRET));
});

test('module exposes no CLI/deploy/mutation/network mode and default runtime rejects privileged UID', async () => {
  assert.equal((inspectorText.match(/\bimport\(/g) ?? []).length, 1);
  assert.ok(inspectorText.includes("await import('data:text/javascript;base64,' + coreBytes.toString('base64'))"));
  assert.ok(!/\b(?:fetch|connect|query|writeFile|unlink|mkdir|spawn|runR2MigrationRunner)\s*\(/.test(inspectorText));
  assert.ok(!inspectorText.includes('node:child_process'));
  assert.ok(!inspectorText.includes('process.argv')); assert.ok(!inspectorText.includes('console.'));
  const opens = [...inspectorText.matchAll(/await open\(([^\n]+)/g)]; assert.equal(opens.length, 2);
  assert.ok(opens.every(match => match[1].includes('constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK')));
  if (typeof process.getuid === 'function' && process.getuid() !== 1000) {
    await assert.rejects(inspectOptimisedTail20261027({ runId: CURRENT, env: ENV }), error => error.code === 'cutover_unprivileged_uid_required');
  }
});
