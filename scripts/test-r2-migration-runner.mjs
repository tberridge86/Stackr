import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { assertHostedRunner, assertRunnerProject, migrationDiskCapacity, PRODUCTION_REF, runR2MigrationRunner, runnerConfiguration } from './run-r2-catalogue-migration.mjs';
import { migrateCatalogueAssets } from './lib/r2-catalogue-migration.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const body = Buffer.from('the unchanged original');
const timestamp = '2026-10-24T12:00:00.000Z';
const id = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const env = {
  SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
  SUPABASE_DB_URL: `postgresql://postgres:fixture@db.${PRODUCTION_REF}.supabase.co/postgres`,
  RAILWAY_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f',
  RAILWAY_PROJECT_ID: 'd205637b-5376-41aa-9169-1015ba88fec3', RAILWAY_VOLUME_MOUNT_PATH: '/data',
  STACKR_R2_BUCKET: 'stackr-catalogue-r2', STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example.com/assets',
};
const options = { sourceBucket: 'stackr-catalogue-public', destinationBucket: env.STACKR_R2_BUCKET,
  publicBaseUrl: env.STACKR_R2_PUBLIC_BASE_URL, maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000 };
const asset = (index) => ({ id: id(index), asset_id: `stable:card-${index}`, asset_type: 'card_image',
  source_id: 'approved-source', variant_id: `variant-${index}`, original_source_url: 'https://source.example.com/card.png',
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-23T00:00:00.000Z', storage_provider: 'supabase_storage',
  storage_bucket: options.sourceBucket, storage_key: `old/card-${index}.png`, storage_path: `old/card-${index}.png`,
  archival_storage_key: null, url: `https://old.example.com/card-${index}.png`, cache_control: null,
  mime_type: 'image/png', byte_size: body.length, sha256: sha(body), content_sha256: sha(body), derivative_list: [] });
const executeArgs = (runId, maxBatches = 3, resume = false) => ['--mode=execute', `--expected-ref=${PRODUCTION_REF}`,
  `--run-id=${runId}`, `--max-batches=${maxBatches}`, ...(resume ? ['--resume=true'] : [])];
const parseArgs = (argv) => Object.fromEntries(argv.map((arg) => { const at = arg.indexOf('='); return [arg.slice(2, at), arg.slice(at + 1)]; }));
async function json(filename) { return JSON.parse(await readFile(filename, 'utf8')); }
async function save(filename, value) { await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }

async function fixture(t, pages, fault = null) {
  const parent = path.resolve('tmp');
  await mkdir(parent, { recursive: true });
  const volumeRoot = await mkdtemp(path.join(parent, 'r2-runner-test-'));
  t.after(async () => { // Only remove the exact unique test directory inside the known scratch parent.
    assert.equal(path.dirname(volumeRoot), parent);
    await rm(volumeRoot, { recursive: true, force: true });
  });
  const calls = [];
  let page = 0;
  let next = 1;
  let active = false;
  const runCli = async (argv) => {
    assert.equal(active, false, 'only one child invocation may run at a time'); active = true;
    try {
      const args = parseArgs(argv); calls.push(args);
      const childOptions = { ...options, ...(Number(args.concurrency) > 1 ? { concurrency: Number(args.concurrency) } : {}) };
      assert.equal(args['expected-ref'], PRODUCTION_REF);
      assert.equal(args.limit, '25');
      assert.equal(args['max-object-bytes'], String(options.maxObjectBytes));
      assert.equal(args['max-batch-bytes'], String(options.maxBatchBytes));
      assert.equal(args['object-timeout-ms'], String(options.objectTimeoutMs));
      const intent = args.inventory.replace('.inventory.json', '.intent.json');
      assert.equal((await json(intent)).afterId, args['after-id'] ?? null, 'durable intent precedes child I/O');
      const names = await readdir(path.dirname(intent));
      assert(!names.includes(path.basename(intent.replace('.intent.json', '.checkpoint.json'))), 'cursor is not checkpointed early');
      if (args.mode === 'inventory') {
        assert(page < pages.length, 'runner exceeded supplied bounded pages');
        const assets = Array.from({ length: pages[page++] }, () => asset(next++));
        const afterId = args['after-id'] ?? null;
        const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', createdAt: timestamp,
          expectedRef: PRODUCTION_REF, sourceOrigin: env.SUPABASE_URL, options: childOptions, limit: 25, afterId,
          nextAfterId: assets.at(-1)?.id ?? afterId, exhausted: assets.length < 25, assets };
        if (fault === 'cursor') inventory.nextAfterId = id(9999);
        await save(args.inventory, inventory);
        const inventorySha256 = sha(await readFile(args.inventory));
        const digestPath = `${args.inventory}.sha256.json`;
        await save(digestPath, { inventoryFile: path.basename(args.inventory), inventorySha256 });
        return { exitCode: 0, signal: null, result: { status: 'inventory', assetCount: assets.length, assetBytesRead: 0,
          inventoryPath: args.inventory, digestPath, inventorySha256: fault === 'digest' ? '0'.repeat(64) : inventorySha256,
          nextAfterId: inventory.nextAfterId, exhausted: inventory.exhausted } };
      }
      assert.equal(args.mode, 'execute');
      const inventory = await json(args.inventory);
      assert.equal(args['approved-inventory-sha256'], sha(await readFile(args.inventory)), 'execute receives the exact local bytes digest');
      const records = [{ event: 'migration_preflight', inventorySha256: args['approved-inventory-sha256'], inventory }];
      const objects = new Map();
      const result = await migrateCatalogueAssets({ ...childOptions, assets: inventory.assets, execute: true,
        readSource: async () => body,
        destinationStorage: { id: 's3_compatible', catalogueStorage: true, catalogueBucket: options.destinationBucket,
          publicUrl: (bucket, key) => `${options.publicBaseUrl}/${key}`,
          async putObject(object) { assert.equal(object.upsert, false); objects.set(object.key, Buffer.from(object.body)); },
          async getObject(bucket, key) { assert.equal(bucket, options.destinationBucket); return objects.get(key); } },
        fetchImpl: async (url) => new Response(objects.get(url.slice(options.publicBaseUrl.length + 1)),
          { headers: { 'content-type': 'image/png', 'content-length': String(body.length) } }),
        journal: async (record) => records.push(structuredClone(record)),
        publish: async (plan) => {
          const before = inventory.assets.find((row) => row.id === plan.rowId);
          records.push({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId,
            before: structuredClone(before), after: { ...before, ...plan.patch, updated_at: timestamp } });
          return { applied: true, updatedAt: timestamp };
        } });
      assert.equal(result.status, 'complete', 'test fixture runs actual migration publication logic');
      if (fault === 'journal') records.pop();
      let bytes = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
      if (fault === 'truncated') bytes = bytes.trimEnd();
      if (fault === 'maximum-journal') bytes += ' '.repeat(32 * 1024 * 1024 - Buffer.byteLength(bytes) - 1) + '\n';
      await writeFile(args.journal, bytes, { flag: 'wx' });
      if (fault === 'oversized-journal') await truncate(args.journal, 32 * 1024 * 1024 + 1);
      if (fault === 'crash') throw Object.assign(new Error('private connection detail'), { code: 'TEST_CRASH' });
      if (fault === 'duplicate-receipt') result.results[1] = structuredClone(result.results[0]);
      if (fault === 'receipt') result.results[0].receipt.updatedAt = '2026-10-25T00:00:00.000Z';
      if (fault === 'stopped' || fault === 'ambiguous') {
        result.status = 'stopped';
        result.results[0].status = fault === 'ambiguous' ? 'publication_requires_reconciliation' : 'failed';
        return { exitCode: 1, signal: null, result };
      }
      return { exitCode: 0, signal: null, result };
    } finally { active = false; }
  };
  return { volumeRoot, calls, runCli, directory: (runId) => path.join(volumeRoot, 'r2-catalogue-migration', runId),
    run: (runId = 'test', maxBatches = 3, resume = false, overrideEnv = env, readCapacity = async () => ({ admitted: true }), concurrency = 1) => runR2MigrationRunner({
      argv: [...executeArgs(runId, maxBatches, resume), `--concurrency=${concurrency}`], env: overrideEnv, volumeRoot, assertHost: async () => {}, runCli, readCapacity }) };
}

test('default invocation is a no-op without credentials, filesystem or child access', async () => {
  const result = await runR2MigrationRunner({ argv: [], env: {}, volumeRoot: 'DO-NOT-CREATE',
    assertHost: async () => { throw new Error('host access'); }, runCli: async () => { throw new Error('remote access'); } });
  assert.equal(result.status, 'plan'); assert.equal(result.writes, false);
});

test('execute requires production pin, explicit bounded batches and fixed page size', () => {
  for (const argv of [ ['--mode=execute'], ['--mode=execute', `--expected-ref=${PRODUCTION_REF}`],
    ['--expected-ref=anotherprojectref1234'], ['--max-batches=0'], ['--max-batches=10001'], ['--max-batches=1.5'],
    ['--concurrency=0'], ['--concurrency=9'], ['--concurrency=1.5'], ['--concurrency=no'],
    ['--limit=50'], ['--run-id=../escape'], ['--resume=guess'], ['--mode=execute', '--mode=execute'] ]) {
    assert.throws(() => runnerConfiguration(argv));
  }
  assert.equal(runnerConfiguration(executeArgs('valid', 1)).batchSize, 25);
  assert.throws(() => assertRunnerProject({ ...env, SUPABASE_URL: 'https://other.supabase.co' }), /url_pin_mismatch/);
  assert.throws(() => assertRunnerProject({ ...env, SUPABASE_DB_URL: 'postgresql://postgres@db.other.supabase.co/postgres' }), /project_pin_mismatch/);
  assert.throws(() => assertRunnerProject({ ...env, SUPABASE_DB_URL: `https://postgres@db.${PRODUCTION_REF}.supabase.co/postgres` }), /project_pin_mismatch/);
  assertRunnerProject({ ...env, SUPABASE_DB_URL: `postgresql://postgres.${PRODUCTION_REF}:fixture@aws-1.pooler.supabase.com/postgres` });
});

test('host guard requires the pinned Railway service, environment and real writable /data mount', async () => {
  const host = { platform: 'linux', resolvePath: async () => '/data',
    readMounts: async () => '101 20 8:0 / /data rw,relatime - ext4 /dev/volume rw\n' };
  await assertHostedRunner(env, host);
  for (const [changed, seam] of [ [{ ...env, RAILWAY_VOLUME_MOUNT_PATH: '/tmp' }, host],
    [{ ...env, RAILWAY_SERVICE_ID: id(44) }, host], [{ ...env, RAILWAY_PROJECT_ID: id(44) }, host],
    [env, { ...host, platform: 'win32' }], [env, { ...host, resolvePath: async () => '/elsewhere' }],
    [env, { ...host, readMounts: async () => '101 20 8:0 / /data ro - ext4 /dev/volume ro\n' }],
    [env, { ...host, readMounts: async () => '101 20 8:0 / / rw - ext4 /dev/volume rw\n' }] ]) {
    await assert.rejects(() => assertHostedRunner(changed, seam));
  }
});

test('sequential pages use exact digest and advance only complete durable publication receipts', async (t) => {
  const f = await fixture(t, [25, 2]);
  const result = await f.run();
  assert.equal(result.status, 'traversal_complete'); assert.equal(result.publishedAssets, 27); assert.equal(result.completedBatches, 2);
  assert.deepEqual(f.calls.map((args) => args.mode), ['inventory', 'execute', 'inventory', 'execute']);
  assert.equal(f.calls[2]['after-id'], id(25));
  const first = await json(path.join(f.directory('test'), 'batch-000001.checkpoint.json'));
  const second = await json(path.join(f.directory('test'), 'batch-000002.checkpoint.json'));
  assert.equal(first.nextAfterId, id(25)); assert.equal(second.afterId, id(25));
  assert.match(first.journalSha256, /^[a-f0-9]{64}$/); assert.match(first.resultSha256, /^[a-f0-9]{64}$/);
  assert(!(await readdir(f.directory('test'))).includes('runner.lock'));
});

test('a full page requires another inventory; empty exhaustion performs no execute', async (t) => {
  const f = await fixture(t, [25, 0]); const result = await f.run();
  assert.equal(result.status, 'traversal_complete'); assert.equal(result.publishedAssets, 25);
  assert.deepEqual(f.calls.map((args) => args.mode), ['inventory', 'execute', 'inventory']);
  assert.equal(result.nextAfterId, id(25));
});

test('explicit bound stops cleanly and explicit resume verifies the chain before the next cursor', async (t) => {
  const f = await fixture(t, [25, 1]);
  const bounded = await f.run('test', 1); assert.equal(bounded.status, 'bounded'); assert.equal(f.calls.length, 2);
  await assert.rejects(() => f.run('test', 1), /runner_run_already_exists/);
  const complete = await f.run('test', 1, true);
  assert.equal(complete.status, 'traversal_complete'); assert.equal(complete.publishedAssets, 26);
  assert.equal(f.calls[2]['after-id'], id(25));
  const resumed = await f.run('test', 1, true);
  assert.equal(resumed.batchesThisInvocation, 0); assert.equal(f.calls.length, 4);
});

for (const [fault, code] of [['digest', 'digest_or_result_mismatch'], ['cursor', 'cursor_or_exhaustion_mismatch']]) {
  test(`invalid inventory ${fault} is blocked before any execute`, async (t) => {
    const f = await fixture(t, [1], fault);
    await assert.rejects(() => f.run(), new RegExp(code)); assert.equal(f.calls.length, 1);
    assert(!(await readdir(f.directory('test'))).some((name) => name.endsWith('.checkpoint.json')));
  });
}

test('inventory overflow is blocked before any execute', async (t) => {
  const f = await fixture(t, [26]); await assert.rejects(() => f.run(), /bounds_mismatch/); assert.equal(f.calls.length, 1);
});

for (const fault of ['stopped', 'ambiguous', 'journal', 'truncated', 'receipt', 'duplicate-receipt', 'oversized-journal', 'crash']) {
  test(`${fault} never advances or blindly retries an uncertain page`, async (t) => {
    const f = await fixture(t, [25, 1], fault);
    await assert.rejects(() => f.run()); assert.equal(f.calls.length, 2);
    const names = await readdir(f.directory('test'));
    assert(names.includes('runner.lock')); assert(names.includes('batch-000001.intent.json'));
    assert(!names.some((name) => name.endsWith('.checkpoint.json')));
    assert(!names.some((name) => name.startsWith('batch-000002')));
    await assert.rejects(() => f.run('test', 3, true), /runner_lock_requires_reconciliation/);
    assert.equal(f.calls.length, 2);
    const error = await readFile(path.join(f.directory('test'), 'batch-000001.error.json'), 'utf8');
    assert(!error.includes('private connection detail')); assert.equal(JSON.parse(error).requiresReconciliation, true);
  });
}

test('stale checkpoint cannot skip a cursor on resume', async (t) => {
  const f = await fixture(t, [25, 1]); await f.run('test', 1);
  const filename = path.join(f.directory('test'), 'batch-000001.checkpoint.json');
  const checkpoint = await json(filename); checkpoint.nextAfterId = id(9999);
  await writeFile(filename, `${JSON.stringify(checkpoint)}\n`);
  await assert.rejects(() => f.run('test', 1, true), /runner_stale_checkpoint/); assert.equal(f.calls.length, 2);
});

test('uncheckpointed intent blocks resumption even without a crash lock', async (t) => {
  const f = await fixture(t, [25, 1]); await f.run('test', 1);
  await save(path.join(f.directory('test'), 'batch-000002.intent.json'), { uncertain: true });
  await assert.rejects(() => f.run('test', 1, true), /incomplete_run_requires_reconciliation/); assert.equal(f.calls.length, 2);
});

test('changed destination config blocks resume before child access', async (t) => {
  const f = await fixture(t, [25, 1]); await f.run('test', 1);
  await assert.rejects(() => f.run('test', 1, true, { ...env, STACKR_R2_BUCKET: 'another-bucket' }), /resume_target_mismatch/);
  assert.equal(f.calls.length, 2);
});
// The largest accepted journal must remain loadable by the 32 MiB rollback reader.
test('rollback-sized journal boundary is accepted and coverage remains explicitly unverified', async (t) => {
  const f = await fixture(t, [1], 'maximum-journal');
  const result = await f.run();
  assert.equal(result.status, 'traversal_complete');
  assert.equal(result.verificationRequired, 'global_remaining_source_inventory');
});
test('disk admission uses exact available BigInt bytes and free inodes with fixed reserve', async () => {
  const required = 640n * 1024n * 1024n;
  const probe = async (bavail, ffree = 72n) => migrationDiskCapacity('/fixture', async (directory, options) => {
    assert.equal(directory, '/fixture'); assert.deepEqual(options, { bigint: true });
    return { bavail, bsize: 1n, ffree, bfree: required * 100n };
  });
  assert.equal((await probe(required)).admitted, true);
  assert.equal((await probe(required - 1n)).admitted, false);
  assert.equal((await probe(required, 71n)).admitted, false);
  assert.equal((await probe(2n ** 60n)).availableBytes, (2n ** 60n).toString());
  await assert.rejects(() => migrationDiskCapacity('/fixture', async () => { throw new Error('private'); }), /capacity_probe_failed/);
  for (const info of [{ bavail: 1, bsize: 1n, ffree: 100n }, { bavail: 1n, bsize: 0n, ffree: 100n },
    { bavail: 1n, bsize: 1n }, { bavail: -1n, bsize: 1n, ffree: 100n }]) {
    await assert.rejects(() => migrationDiskCapacity('/fixture', async () => info), /capacity_probe_failed/);
  }
});
test('capacity pause before first intent starts no child and leaves a clean resumable run', async t => {
  const f = await fixture(t, [2]);
  const pause = await f.run('capacity', 3, false, env, async () => ({ admitted: false }));
  assert.equal(pause.status, 'capacity_paused'); assert.equal(pause.nextAfterId, null);
  assert.equal(pause.publishedAssets, 0); assert.equal(pause.checkpointSha256, null);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await readdir(f.directory('capacity')), ['run.json']);
  assert.equal((await f.run('capacity', 3, true)).publishedAssets, 2);
});
test('capacity loss after a checkpoint pauses without advancing or creating next intent', async t => {
  const f = await fixture(t, [25, 2]); let admission = 0;
  const result = await f.run('between', 3, false, env, async () => ({ admitted: admission++ === 0 }));
  assert.equal(result.status, 'capacity_paused'); assert.equal(result.nextAfterId, id(25));
  assert.equal(result.publishedAssets, 25); assert.equal(f.calls.length, 2);
  const checkpointPath = path.join(f.directory('between'), 'batch-000001.checkpoint.json');
  const checkpoint = await readFile(checkpointPath);
  assert.equal(sha(checkpoint), result.checkpointSha256);
  assert(!(await readdir(f.directory('between'))).some(name => name.includes('000002') || name === 'runner.lock'));
  const resumed = await f.run('between', 3, true);
  assert.equal(resumed.publishedAssets, 27); assert.equal(f.calls[2]['after-id'], id(25));
  assert.deepEqual(await readFile(checkpointPath), checkpoint);
});
test('unknown capacity fails closed and retains reconciliation lock without child calls', async t => {
  const f = await fixture(t, [2]);
  await assert.rejects(() => f.run('probe-error', 3, false, env, async () => { throw new Error('probe'); }), /probe/);
  assert.equal(f.calls.length, 0);
  assert((await readdir(f.directory('probe-error'))).includes('runner.lock'));
});

test('legacy 30-second manifest refuses resume without rewriting old evidence', async t => {
  const f = await fixture(t, [25, 2]);
  await f.run('legacy-deadline', 1);
  const manifestPath = path.join(f.directory('legacy-deadline'), 'run.json');
  const oldManifest = await json(manifestPath);
  oldManifest.options.objectTimeoutMs = 30000;
  const oldBytes = Buffer.from(JSON.stringify(oldManifest) + '\n');
  await writeFile(manifestPath, oldBytes);
  const checkpointPath = path.join(f.directory('legacy-deadline'), 'batch-000001.checkpoint.json');
  const checkpointBytes = await readFile(checkpointPath);
  await assert.rejects(() => f.run('legacy-deadline', 1, true), /runner_resume_target_mismatch/);
  assert.equal(f.calls.length, 2, 'no new inventory or execute under a mismatched deadline');
  assert.deepEqual(await readFile(manifestPath), oldBytes);
  assert.deepEqual(await readFile(checkpointPath), checkpointBytes);
  assert((await readdir(f.directory('legacy-deadline'))).includes('runner.lock'));
});

test('parallel concurrency is pinned through inventory, execution, checkpoint and resume', async (t) => {
  const f = await fixture(t, [25, 1]);
  const first = await f.run('parallel', 1, false, env, undefined, 8);
  assert.equal(first.publishedAssets, 25);
  assert(f.calls.every(args => args.concurrency === '8'));
  const manifest = await json(path.join(f.directory('parallel'), 'run.json'));
  assert.equal(manifest.options.concurrency, 8);
  const second = await f.run('parallel', 1, true, env, undefined, 8);
  assert.equal(second.publishedAssets, 26);
  assert.equal(second.status, 'traversal_complete');
});

test('changing concurrency cannot resume an existing run', async (t) => {
  const f = await fixture(t, [25]);
  await f.run('pinned', 1, false, env, undefined, 4);
  const before = await readFile(path.join(f.directory('pinned'), 'run.json'));
  const calls = f.calls.length;
  await assert.rejects(() => f.run('pinned', 1, true, env, undefined, 8), /resume_target_mismatch/);
  assert.equal(f.calls.length, calls);
  assert.deepEqual(await readFile(path.join(f.directory('pinned'), 'run.json')), before);
});
