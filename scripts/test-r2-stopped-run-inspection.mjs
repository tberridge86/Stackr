import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectStoppedRun, assertInspectionUid, readInspectionFile } from './inspect-r2-stopped-run.mjs';
import { migrateCatalogueAssets } from './lib/r2-catalogue-migration.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const target = '/data/r2-catalogue-migration/production-20261024';
const ref = 'oakdbbzdqwurpjnoqhmu';
const failedId = '0083f64b-ad1a-43d3-ad97-efbc20396649';
const env = { RAILWAY_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', SUPABASE_URL: 'https://' + ref + '.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:fixture@db.' + ref + '.supabase.co/postgres',
  STACKR_R2_BUCKET: 'stackr-catalogue-public', STACKR_R2_PUBLIC_BASE_URL: 'https://assets.stackrtcg.com' };
const options = { sourceBucket: env.STACKR_R2_BUCKET, destinationBucket: env.STACKR_R2_BUCKET,
  publicBaseUrl: env.STACKR_R2_PUBLIC_BASE_URL, maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 30000 };
const bytes = Buffer.from('exact preserved fixture artwork');
const rowId = index => index === 112 ? failedId
  : (index < 112 ? '00000000' : '00900000') + '-0000-4000-8000-' + String(index).padStart(12, '0');
const asset = index => ({ id: rowId(index), asset_id: 'fixture-' + index, asset_type: 'card_image',
  source_id: 'fixture-source', variant_id: 'fixture-variant-' + index,
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-24T00:00:00Z', storage_provider: 'supabase_storage',
  storage_bucket: env.STACKR_R2_BUCKET, storage_key: 'old/' + index + '.png', storage_path: 'old/' + index + '.png',
  url: 'https://source.example/old/' + index + '.png', mime_type: 'image/png',
  content_sha256: hash(bytes), sha256: hash(bytes), byte_size: bytes.length,
  cache_control: null, archival_storage_key: null,
  derivative_list: [{ role: 'detail-page', storageProvider: 'supabase_storage', storageBucket: env.STACKR_R2_BUCKET,
    storageKey: 'old/detail-' + index + '.png', mimeType: 'image/png', byteSize: bytes.length, contentSha256: hash(bytes) }],
});
const root = await mkdtemp(path.join(tmpdir(), 'r2-stopped-inspection-'));
const directory = path.join(root, 'production-20261024');
await mkdir(directory);
async function save(name, value) {
  const content = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  await writeFile(path.join(directory, name), content);
  return hash(content);
}
const expectedRows = new Map();
try {
  const manifest = { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId: 'production-20261024',
    expectedRef: ref, railwayServiceId: env.RAILWAY_SERVICE_ID, railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID,
    options, limit: 25 };
  const manifestSha256 = await save('run.json', manifest);
  await save('runner.lock', { schemaVersion: 1, processId: 77, startedAt: '2026-10-24T00:00:00Z' });
  let previousCheckpointSha256 = null; let afterId = null;
  for (let sequence = 1; sequence <= 5; sequence++) {
    const base = 'batch-' + String(sequence).padStart(6, '0') + '.';
    const assets = Array.from({ length: 25 }, (_, index) => asset((sequence - 1) * 25 + index + 1));
    for (const row of assets) expectedRows.set(row.id, row);
    const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', expectedRef: ref,
      sourceOrigin: env.SUPABASE_URL, options, limit: 25, afterId, nextAfterId: assets.at(-1).id,
      exhausted: false, assets };
    const intentSha256 = await save(base + 'intent.json', { schemaVersion: 1, manifestSha256, sequence, afterId, previousCheckpointSha256 });
    const inventorySha256 = await save(base + 'inventory.json', inventory);
    const digestSha256 = await save(base + 'inventory.json.sha256.json', { inventoryFile: base + 'inventory.json', inventorySha256 });
    const inventoryResultSha256 = await save(base + 'inventory-result.json', { exitCode: 0, signal: null,
      result: { status: 'inventory', assetCount: 25, assetBytesRead: 0, inventorySha256,
        inventoryPath: target + '/' + base + 'inventory.json', digestPath: target + '/' + base + 'inventory.json.sha256.json',
        nextAfterId: inventory.nextAfterId, exhausted: false } });
    const journal = [{ event: 'migration_preflight', inventorySha256, inventory,
      railwayServiceId: env.RAILWAY_SERVICE_ID, railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID }];
    const result = await migrateCatalogueAssets({ ...options, assets, execute: true,
      readSource: async () => bytes,
      destinationStorage: { id: 's3_compatible', catalogueStorage: true, catalogueBucket: options.destinationBucket,
        publicUrl: (bucket, key) => options.publicBaseUrl + '/' + key,
        async putObject(input) {
          if (input.key.includes('/' + failedId + '/') && input.key.endsWith('/detail-page.png')) {
            throw Object.assign(new Error('fixture deadline'), { code: 'cancelled_or_deadline' });
          }
        },
        async getObject() { return bytes; } },
      fetchImpl: async () => new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': String(bytes.length) } }),
      journal: async record => journal.push(structuredClone(record)),
      publish: async plan => {
        const before = assets.find(row => row.id === plan.rowId);
        const after = { ...before, ...plan.patch, updated_at: '2026-10-24T01:00:00Z' };
        expectedRows.set(after.id, after);
        journal.push({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId, before, after });
        return { applied: true, updatedAt: after.updated_at };
      } });
    const journalBytes = Buffer.from(journal.map(row => JSON.stringify(row)).join('\n') + '\n');
    await writeFile(path.join(directory, base + 'events.jsonl'), journalBytes);
    const resultSha256 = await save(base + 'execute-result.json', { exitCode: sequence === 5 ? 1 : 0, signal: null, result });
    if (sequence === 5) {
      assert.equal(result.status, 'stopped');
      await save(base + 'error.json', { status: 'blocked', code: 'runner_execution_incomplete', sequence, afterId, requiresReconciliation: true });
    } else {
      previousCheckpointSha256 = await save(base + 'checkpoint.json', { schemaVersion: 1, manifestSha256, sequence, afterId,
        previousCheckpointSha256, intentSha256, inventorySha256, inventoryResultSha256, digestSha256,
        assetCount: 25, nextAfterId: inventory.nextAfterId, exhausted: false, resultSha256,
        journalSha256: hash(journalBytes), totalPublished: sequence * 25 });
      afterId = inventory.nextAfterId;
    }
  }
  const beforeFiles = new Map();
  for (const name of await readdir(directory)) beforeFiles.set(name, hash(await readFile(path.join(directory, name))));
  let connects = 0; let drift = false; let wrongCount = false; const queries = [];
  const createDb = () => ({
    async connect() { connects++; }, async end() {},
    async query(sql, parameters) {
      queries.push(sql);
      if (sql.startsWith('select ')) {
        assert.equal(parameters[0].length, 125);
        let rows = [...expectedRows.values()].map(row => ({ asset: structuredClone(row) }));
        if (drift) rows[0].asset.source_id = 'unexpected drift';
        if (wrongCount) rows.pop();
        return { rows };
      }
      assert(['begin isolation level repeatable read read only', 'commit', 'rollback'].includes(sql));
      return { rows: [] };
    },
  });
  const input = { directory, env, assertHost: async () => {}, assertUid: () => {}, createDb };
  assertInspectionUid({ getuid: () => 1000, geteuid: () => 1000 });
  for (const runtime of [{}, { getuid: () => 0, geteuid: () => 1000 },
    { getuid: () => 1000, geteuid: () => 0 }]) {
    assert.throws(() => assertInspectionUid(runtime), /unprivileged_uid_required/);
  }
  const boundedFile = path.join(root, 'bounded.txt');
  await writeFile(boundedFile, 'abcd');
  assert.equal((await readInspectionFile(boundedFile, 4)).content.toString(), 'abcd');
  await assert.rejects(() => readInspectionFile(boundedFile, 3), /invalid_evidence_file/);
  if (process.platform !== 'win32') {
    const linkedFile = path.join(root, 'linked.txt');
    await symlink(boundedFile, linkedFile);
    await assert.rejects(() => readInspectionFile(linkedFile, 4), error => error.code === 'ELOOP');
  }
  const report = await inspectStoppedRun(input);
  assert.equal(report.databaseVerified, false); assert.equal(connects, 0);
  assert.equal(report.files.length, 37); assert.equal(report.authorizesResume, false);
  await assert.rejects(() => inspectStoppedRun({ ...input, mode: 'verify' }), /approved_digest_required/);
  await assert.rejects(() => inspectStoppedRun({ ...input, mode: 'verify', expectedEvidenceSha256: 'f'.repeat(64) }), /approved_digest_mismatch/);
  assert.equal(connects, 0);
  const verify = { ...input, mode: 'verify', expectedEvidenceSha256: report.evidenceSha256 };
  const verified = await inspectStoppedRun(verify);
  assert.equal(verified.fullRowsMatched, 125);
  assert.equal(verified.pointerProof, '111_exact_committed_after_rows_and_14_exact_original_rows');
  assert.deepEqual(queries, ['begin isolation level repeatable read read only',
    'select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id', 'commit']);
  drift = true;
  await assert.rejects(() => inspectStoppedRun(verify), /database_drift/);
  drift = false; wrongCount = true;
  await assert.rejects(() => inspectStoppedRun(verify), /database_count_mismatch/);
  wrongCount = false;
  const checkpoint = path.join(directory, 'batch-000004.checkpoint.json');
  const checkpointBytes = await readFile(checkpoint);
  const tampered = JSON.parse(checkpointBytes); tampered.totalPublished = 101;
  await writeFile(checkpoint, JSON.stringify(tampered));
  await assert.rejects(() => inspectStoppedRun(input), /checkpoint_mismatch/);
  await writeFile(checkpoint, checkpointBytes);
  assert.deepEqual((await readdir(directory)).sort(), [...beforeFiles.keys()].sort());
  for (const [name, digest] of beforeFiles) assert.equal(hash(await readFile(path.join(directory, name))), digest);
  assert(!JSON.stringify(verified).includes('fixture-source'));
  assert(!JSON.stringify(verified).includes('postgresql'));
  console.log('PASS stopped-run inspection: four completed chains, strict failed tail, reviewed digest, 125 read-only full-row comparisons, drift/count failures, immutable evidence');
} finally {
  assert.equal(path.dirname(root), await import('node:fs/promises').then(m => m.realpath(tmpdir())));
  await rm(root, { recursive: true, force: true });
}
