import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCatalogueMigrationRollback, migrateCatalogueAssets } from './lib/r2-catalogue-migration.mjs';
import {
  createPgMigrationPublisher, createPublicSupabaseReader, inventoryCatalogueRows, migrationConfiguration,
  openDurableMigrationJournal, readMigrationInventory, runCatalogueR2Migration, writeMigrationInventory,
} from './migrate-catalogue-to-r2.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('synthetic-byte-preservation-fixture');
const ref = 'a'.repeat(20);
const rowId = '10000000-0000-4000-8000-000000000001';
const tempParent = await realpath(tmpdir());
const root = await mkdtemp(path.join(tempParent, 'stackr-r2-cli-'));
const volume = path.join(root, 'volume');
await mkdir(volume);
const env = {
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_DB_URL: `postgresql://postgres.${ref}:example-only@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`,
  STACKR_R2_BUCKET: 'stackr-approved-art', STACKR_R2_PUBLIC_BASE_URL: 'https://assets.example.invalid',
  STACKR_R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  STACKR_R2_ACCESS_KEY_ID: 'example-access', STACKR_R2_SECRET_ACCESS_KEY: 'example-secret',
  RAILWAY_SERVICE_ID: '20000000-0000-4000-8000-000000000001',
  RAILWAY_ENVIRONMENT_ID: '30000000-0000-4000-8000-000000000001', RAILWAY_VOLUME_MOUNT_PATH: volume,
};
const asset = {
  id: rowId, asset_id: 'artwork-recovered:exact:opaque-identity', asset_type: 'card_image',
  source_id: '40000000-0000-4000-8000-000000000001', variant_id: '50000000-0000-4000-8000-000000000001',
  updated_at: '2026-10-23T00:00:00.000Z', rights_status: 'approved', permission_status: 'approved',
  asset_visibility: 'public_catalogue', publicly_servable: true, retention_status: 'active',
  deleted_at: null, deprecated_at: null, storage_provider: 'supabase_storage', storage_bucket: 'stackr-catalogue-public',
  storage_key: 'approved/exact source.png', storage_path: 'approved/exact source.png',
  url: `https://${ref}.supabase.co/storage/v1/object/public/stackr-catalogue-public/approved/exact%20source.png`,
  content_sha256: hash(bytes), sha256: hash(bytes), byte_size: bytes.length, mime_type: 'image/png',
  derivative_list: [], cache_control: 'public, max-age=300', archival_storage_key: null,
  source_attribution: 'Approved fixture source', width: 1, height: 1,
};
const inventoryPath = path.join(root, 'inventory.json');
const inventoryArgs = [`--expected-ref=${ref}`, `--inventory=${inventoryPath}`];
const config = migrationConfiguration(inventoryArgs, env);

function fakeDb(rows = [asset], { publicBucket = true, beforeUpdate } = {}) {
  const state = new Map(rows.map((row) => [row.id, structuredClone(row)]));
  const queries = [];
  let connectCount = 0;
  let endCount = 0;
  let timestamp = 1;
  let transaction;
  return {
    state, queries,
    get connectCount() { return connectCount; }, get endCount() { return endCount; },
    async connect() { connectCount++; }, async end() { endCount++; },
    async query(sql, parameters = []) {
      queries.push({ sql, parameters });
      if (sql === 'begin') { transaction = structuredClone(state); return { rows: [] }; }
      if (sql === 'rollback') {
        if (transaction) { state.clear(); for (const [id, row] of transaction) state.set(id, row); }
        transaction = null; return { rows: [] };
      }
      if (sql === 'commit') { transaction = null; return { rows: [] }; }
      if (sql.includes('from storage.buckets')) return { rows: [{ id: 'stackr-catalogue-public', public: publicBucket }] };
      if (sql.includes('where a.id = any')) return { rows: parameters[0].filter((id) => state.has(id)).map((id) => ({ asset: structuredClone(state.get(id)) })) };
      if (sql.startsWith('select to_jsonb(a)')) {
        const candidates = [...state.values()].filter((row) => !parameters[1] || row.id > parameters[1]).sort((a, b) => a.id.localeCompare(b.id));
        return { rows: candidates.slice(0, parameters[2]).map((row) => ({ asset: structuredClone(row) })) };
      }
      if (sql.startsWith('update catalog.assets')) {
        assert.match(sql, /where a\.id = \$1::uuid and to_jsonb\(a\) = \$\d+::jsonb/);
        await beforeUpdate?.(state);
        const row = state.get(parameters[0]);
        if (JSON.stringify(row) !== JSON.stringify(JSON.parse(parameters.at(-1)))) return { rows: [] };
        for (const [, name, index, json] of sql.matchAll(/([a-z_]+) = \$(\d+)(::jsonb)?/g)) {
          if (name === 'id') continue;
          row[name] = json ? JSON.parse(parameters[Number(index) - 1]) : parameters[Number(index) - 1];
        }
        row.updated_at = `2026-10-23T00:00:${String(timestamp++).padStart(2, '0')}.000Z`;
        return { rows: [{ asset: structuredClone(row) }] };
      }
      throw new Error('Unexpected fixture SQL');
    },
  };
}

function fakeStorage() {
  const objects = new Map();
  const operations = [];
  return { id: 's3_compatible', catalogueStorage: true, catalogueBucket: env.STACKR_R2_BUCKET, objects, operations,
    publicUrl(bucket, key) { return bucket === this.catalogueBucket ? `${env.STACKR_R2_PUBLIC_BASE_URL}/${key}` : null; },
    async putObject(input) {
      operations.push('put');
      assert.equal(input.upsert, false);
      if (objects.has(input.key)) throw Object.assign(new Error('duplicate'), { status: 412 });
      objects.set(input.key, Buffer.from(input.body));
    },
    async getObject(bucket, key, { maxBytes }) {
      operations.push('get');
      assert.equal(bucket, this.catalogueBucket);
      const body = objects.get(key);
      assert.ok(body && body.length <= maxBytes);
      return body;
    },
  };
}

function fetchFor(storage, calls) {
  return async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined, 'public object requests must carry no credentials');
    assert.ok(options.signal instanceof AbortSignal);
    const body = url.startsWith(`${env.SUPABASE_URL}/storage/v1/object/public/stackr-catalogue-public/`)
      ? bytes : storage.objects.get(new URL(url).pathname.slice(1));
    assert.ok(body, 'only source or copied CDN object is read');
    return new Response(body, { headers: { 'content-type': 'image/png', 'content-length': String(body.length) } });
  };
}

try {
  assert.equal(config.mode, 'inventory');
  assert.equal(config.limit, 25);
  assert.equal(config.concurrency, 1);
  assert.equal(migrationConfiguration([...inventoryArgs, '--concurrency=8'], env).concurrency, 8);
  for (const value of ['0', '9', '1.5', 'NaN']) assert.throws(() => migrationConfiguration([...inventoryArgs, '--concurrency=' + value], env), /invalid_concurrency/);
  assert.equal(migrationConfiguration([...inventoryArgs, '--mode=rollback'], env).mode, 'rollback');
  await assert.rejects(() => runCatalogueR2Migration({ argv: [...inventoryArgs, '--mode=rollback'], env,
    createDb: () => { throw new Error('rollback must validate its journal before DB'); },
  }), /new_rollback_journal_required/);
  assert.equal(migrationConfiguration([...inventoryArgs, '--limit=50'], env).limit, 50);
  for (const argv of [
    [...inventoryArgs, '--limit=51'], [...inventoryArgs, '--limit=0'], [...inventoryArgs, '--mode=unsupported'],
    [...inventoryArgs, '--source-bucket=card-scans'], [...inventoryArgs, '--after-id=not-an-id'],
    [...inventoryArgs, '--mode=execute', '--mode=inventory'],
  ]) assert.throws(() => migrationConfiguration(argv, env));
  for (const patch of [
    { SUPABASE_URL: `https://${'b'.repeat(20)}.supabase.co` },
    { SUPABASE_DB_URL: `postgresql://postgres.${ref}extra:x@aws-0-eu-west-2.pooler.supabase.com/postgres` },
    { SUPABASE_DB_URL: `postgresql://postgres:x@db.${'b'.repeat(20)}.supabase.co/postgres` },
    { SUPABASE_DB_URL: `${env.SUPABASE_DB_URL}?host=localhost` },
  ]) assert.throws(() => migrationConfiguration(inventoryArgs, { ...env, ...patch }));

  const inventoryDb = fakeDb();
  let factoryCalls = 0;
  let sourceReads = 0;
  const inventoryResult = await runCatalogueR2Migration({ argv: inventoryArgs, env, createDb: () => inventoryDb,
    createStorage: () => { factoryCalls++; throw new Error('inventory must not open R2'); },
    fetchImpl: async () => { sourceReads++; throw new Error('inventory must not read assets'); } });
  assert.equal(inventoryResult.status, 'inventory');
  assert.equal(inventoryResult.assetCount, 1);
  assert.equal(factoryCalls + sourceReads, 0);
  assert.ok(inventoryDb.queries.every((query) => query.sql.startsWith('select ')), 'inventory only reads metadata');
  const metadataQuery = inventoryDb.queries.find((query) => query.sql.includes('limit $3'));
  assert.deepEqual(metadataQuery.parameters, ['stackr-catalogue-public', null, 25]);
  assert.equal(inventoryDb.endCount, 1);
  const inventoryBytes = await readFile(inventoryPath);
  assert.equal(inventoryResult.inventorySha256, hash(inventoryBytes));
  assert.equal(JSON.parse(await readFile(inventoryResult.digestPath, 'utf8')).inventorySha256, inventoryResult.inventorySha256);
  const inventory = await readMigrationInventory(inventoryPath, inventoryResult.inventorySha256);
  assert.equal(inventory.assets[0].asset_id, asset.asset_id, 'opaque identity is unchanged');
  await assert.rejects(() => readMigrationInventory(inventoryPath, '0'.repeat(64)), /digest_mismatch/);
  await assert.rejects(() => writeMigrationInventory(inventoryPath, inventory), /EEXIST/);

  const nextId = '10000000-0000-4000-8000-000000000002';
  const second = { ...asset, id: nextId };
  const bounded = await inventoryCatalogueRows(fakeDb([asset, second]), { ...config, limit: 1 });
  assert.equal(bounded.length, 1);
  assert.deepEqual((await inventoryCatalogueRows(fakeDb([asset, second]), { ...config, afterId: rowId })).map((row) => row.id), [nextId]);
  await assert.rejects(() => inventoryCatalogueRows({ query: async () => ({ rows: [{ asset: second }, { asset }] }) }, config), /cursor_not_increasing/);
  await assert.rejects(() => inventoryCatalogueRows({ query: async () => ({ rows: Array.from({ length: 26 }, () => ({ asset })) }) }, config), /page_overflow/);

  const executeArgs = [...inventoryArgs, '--mode=execute', `--approved-inventory-sha256=${inventoryResult.inventorySha256}`, `--journal=${path.join(volume, 'execute.jsonl')}`];
  const untouched = { connects: 0, creates: 0, reads: 0, writes: 0 };
  for (const [patch, code] of [
    [{ RAILWAY_SERVICE_ID: undefined }, 'railway_execution_required'],
    [{ RAILWAY_ENVIRONMENT_ID: undefined }, 'railway_execution_required'],
    [{ RAILWAY_VOLUME_MOUNT_PATH: undefined }, 'railway_durable_journal_required'],
    [{ STACKR_R2_ACCESS_KEY_ID: '' }, 'r2_credentials_required'],
    [{ STACKR_R2_SECRET_ACCESS_KEY: '' }, 'r2_credentials_required'],
    [{ STACKR_R2_PUBLIC_BASE_URL: 'http://localhost' }, 'unsafe_public_base_url'],
    [{ STACKR_R2_BUCKET: 'different-bucket' }, 'inventory_target_or_bounds_mismatch'],
  ]) await assert.rejects(() => runCatalogueR2Migration({ argv: executeArgs, env: { ...env, ...patch },
    createDb: () => { untouched.connects++; throw new Error('unexpected DB'); },
    createStorage: () => { untouched.creates++; throw new Error('unexpected R2'); },
    fetchImpl: async () => { untouched.reads++; }, migrate: async () => { untouched.writes++; } }), { code });
  assert.deepEqual(untouched, { connects: 0, creates: 0, reads: 0, writes: 0 });

  const privateDb = fakeDb([asset], { publicBucket: false });
  await assert.rejects(() => runCatalogueR2Migration({ argv: inventoryArgs, env, createDb: () => privateDb,
    saveInventory: async () => { throw new Error('private bucket must not produce approved inventory'); },
  }), { code: 'source_bucket_not_public' });
  assert.equal(privateDb.queries.length, 1, 'public bucket validation precedes catalogue metadata reads');
  assert.equal(privateDb.endCount, 1);

  await assert.rejects(() => openDurableMigrationJournal(path.join(root, 'outside.jsonl'), env), /outside_railway_volume/);
  let closes = 0;
  await assert.rejects(() => runCatalogueR2Migration({ argv: executeArgs, env,
    createStorage: fakeStorage,
    openJournal: async () => ({ append: async () => { throw new Error('journal_sync_failed'); }, close: async () => { closes++; } }),
    createDb: () => { throw new Error('preflight journal must finish before DB'); },
  }), /journal_sync_failed/);
  assert.equal(closes, 1, 'preflight failure closes its journal');

  const writeMethods = [];
  const simulated = await openDurableMigrationJournal(path.join(volume, 'simulated.jsonl'), env, async () => ({
    write: async () => { throw new Error('unsafe single write must not be used'); },
    writeFile: async () => { writeMethods.push('complete-write'); }, sync: async () => { writeMethods.push('sync'); },
    close: async () => { writeMethods.push('close'); },
  }));
  await simulated.append({ event: 'durable-intent' });
  await simulated.close();
  assert.deepEqual(writeMethods, ['complete-write', 'sync', 'close']);

  for (const failure of ['write', 'sync']) {
    const calls = [];
    const failingJournal = await openDurableMigrationJournal(path.join(volume, `failing-${failure}.jsonl`), env, async () => ({
      writeFile: async () => { calls.push('write'); if (failure === 'write') throw new Error('simulated_partial_write'); },
      sync: async () => { calls.push('sync'); if (failure === 'sync') throw new Error('simulated_sync_failure'); },
      close: async () => { calls.push('close'); },
    }));
    await assert.rejects(() => failingJournal.append({ event: 'must-not-acknowledge' }), /simulated_/);
    await assert.rejects(() => failingJournal.append({ event: 'must-not-continue' }), /simulated_/);
    await assert.rejects(() => failingJournal.close(), /simulated_/);
    assert.deepEqual(calls, failure === 'write' ? ['write', 'close'] : ['write', 'sync', 'close']);
  }


  const cappedWrites = [];
  const capped = await openDurableMigrationJournal(path.join(volume, 'capped.jsonl'), env, async () => ({
    writeFile: async line => { cappedWrites.push(Buffer.byteLength(line)); },
    sync: async () => {}, close: async () => {},
  }));
  const chunk = { data: '\u00e9'.repeat((16 * 1024 * 1024 - 12) / 2) };
  await capped.append(chunk);
  await capped.append(chunk);
  assert.deepEqual(cappedWrites, [16 * 1024 * 1024, 16 * 1024 * 1024]);
  await assert.rejects(() => capped.append({}), /journal_too_large/);
  await assert.rejects(() => capped.append({}), /journal_too_large/);
  await assert.rejects(() => capped.close(), /journal_too_large/);
  assert.equal(cappedWrites.length, 2, 'journal cap rejects before disk write and cannot continue');

  await assert.rejects(() => runCatalogueR2Migration({ argv: [...executeArgs, '--concurrency=8'], env,
    createDb: () => { throw new Error('mismatched concurrency must fail before DB'); },
  }), /inventory_target_or_bounds_mismatch/);
  const parallelInventory = path.join(root, 'parallel-inventory.json');
  const parallelArgs = [`--expected-ref=${ref}`, `--inventory=${parallelInventory}`, '--concurrency=8'];
  const parallelMeta = await runCatalogueR2Migration({ argv: parallelArgs, env, createDb: () => fakeDb() });
  assert.equal(JSON.parse(await readFile(parallelInventory, 'utf8')).options.concurrency, 8);
  const parallelStorage = fakeStorage();
  const parallelExecution = await runCatalogueR2Migration({ argv: [...parallelArgs, '--mode=execute',
    `--approved-inventory-sha256=${parallelMeta.inventorySha256}`, `--journal=${path.join(volume, 'parallel.jsonl')}`],
    env, createDb: () => fakeDb(), createStorage: () => parallelStorage, fetchImpl: fetchFor(parallelStorage, []) });
  assert.equal(parallelExecution.status, 'complete');
  assert.equal(parallelExecution.results[0].status, 'published');
  const storage = fakeStorage();
  const fetchCalls = [];
  const executeDb = fakeDb();
  const execution = await runCatalogueR2Migration({ argv: executeArgs, env, createDb: () => executeDb,
    createStorage: () => storage, fetchImpl: fetchFor(storage, fetchCalls) });
  assert.equal(execution.status, 'complete');
  assert.equal(execution.results[0].status, 'published');
  const published = executeDb.state.get(rowId);
  assert.equal(published.storage_provider, 's3_compatible');
  for (const field of ['id', 'asset_id', 'source_id', 'variant_id', 'source_attribution', 'rights_status', 'permission_status']) assert.equal(published[field], asset[field]);
  assert.ok(fetchCalls[0].endsWith('/approved/exact%20source.png'));
  const records = (await readFile(path.join(volume, 'execute.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records[0].event, 'migration_preflight');
  assert.deepEqual(records[0].inventory.assets[0], asset);
  assert.ok(records.findIndex((record) => record.event === 'object_verified') < records.findIndex((record) => record.event === 'database_cas_committed'));
  const committedRecord = records.find((record) => record.event === 'database_cas_committed');
  assert.deepEqual(committedRecord.before, asset);
  assert.deepEqual(committedRecord.after, published);
  await assert.rejects(() => openDurableMigrationJournal(path.join(volume, 'execute.jsonl'), env), /EEXIST/);

  const staleStorage = fakeStorage();
  const staleDb = fakeDb([{ ...asset, source_attribution: 'Changed concurrently' }]);
  await assert.rejects(() => runCatalogueR2Migration({ argv: executeArgs.map((arg) => arg.startsWith('--journal=') ? `--journal=${path.join(volume, 'stale.jsonl')}` : arg),
    env, createDb: () => staleDb, createStorage: () => staleStorage, fetchImpl: async () => { throw new Error('stale inventory must not read assets'); } }), /snapshot_changed/);
  assert.equal(staleStorage.operations.length, 0);

  const rollbackDb = fakeDb();
  const rollbackStorage = fakeStorage();
  const verified = new Map();
  const journal = async (record) => { if (record.event === 'object_verified') verified.set(`${record.rowId}:${record.object.role}`, structuredClone(record.object)); };
  const publisher = createPgMigrationPublisher(rollbackDb, [asset], journal, config, verified);
  const options = inventory.options;
  const migrated = await migrateCatalogueAssets({ ...options, assets: [asset], execute: true, destinationStorage: rollbackStorage,
    readSource: async () => bytes, fetchImpl: fetchFor(rollbackStorage, []), journal, publish: publisher });
  assert.equal(migrated.status, 'complete');
  const rollback = createCatalogueMigrationRollback(migrated.results[0].receipt);
  const invalid = { ...rollback, patch: { ...rollback.patch, variant_id: 'changed' } };
  await assert.rejects(() => publisher(invalid), /unapproved_publication_column/);
  const rolledBack = await publisher(rollback);
  assert.equal(rolledBack.applied, true);
  assert.equal(rollbackDb.state.get(rowId).storage_key, asset.storage_key);
  assert.equal(rollbackDb.state.get(rowId).asset_id, asset.asset_id);
  await assert.rejects(() => publisher(rollback), /guard_mismatch|before_mismatch|committed_operation/);
  const freshPublisher = createPgMigrationPublisher(fakeDb([published]), [published], async () => {}, config);
  await assert.rejects(() => freshPublisher(rollback), /committed_operation/, 'unbound receipt replay cannot publish');

  const conflictDb = fakeDb([asset], { beforeUpdate: async (state) => { state.get(rowId).source_attribution = 'Concurrent identity metadata'; } });
  const conflictPublisher = createPgMigrationPublisher(conflictDb, [asset], async () => {}, config, verified);
  assert.deepEqual(await conflictPublisher(migrated.results[0].receipt), { applied: false }, 'full JSON row CAS catches changes beyond the compact guard');
  assert.ok(conflictDb.queries.some((query) => query.sql === 'rollback'));

  const source = createPublicSupabaseReader(config, async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  await assert.rejects(() => source({ provider: 'supabase_storage', bucket: 'card-scans', key: 'x', mimeType: 'image/png' }, { maxBytes: 1 }), /unexpected_public_source/);
  await assert.rejects(() => source({ provider: 'supabase_storage', bucket: 'stackr-catalogue-public', key: 'x', mimeType: 'image/png' }, { maxBytes: 1 }), /too_large/);
  for (const key of ['../x', '/x', 'x%2fy', 'x?token', 'x\\y']) await assert.rejects(() => source({ provider: 'supabase_storage', bucket: 'stackr-catalogue-public', key, mimeType: 'image/png' }, { maxBytes: bytes.length }), /unsafe_source_key/);
  console.log('R2 migration CLI passes: metadata-only bounded inventory, exact approvals, Railway journal preflight, streamed reads, verified CAS publication and guarded rollback. No live resources used.');
} finally {
  const resolved = await realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('stackr-r2-cli-'));
  await rm(resolved, { recursive: true, force: true });
}
