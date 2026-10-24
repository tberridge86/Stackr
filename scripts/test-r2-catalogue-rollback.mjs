import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  migrateCatalogueAssets, validateCatalogueMigrationJournal,
} from './lib/r2-catalogue-migration.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const body = Buffer.from('unchanged original bytes');
const grid = Buffer.from('unchanged grid bytes');
const base = 'https://cdn.example.com/assets';
const sourceBucket = 'stackr-catalogue-public';
const destinationBucket = 'stackr-catalogue-r2';
const asset = {
  id: '11111111-1111-4111-8111-111111111111', asset_id: 'stable-asset-1', asset_type: 'card_image',
  source_id: 'approved-source', variant_id: 'stable-variant',
  original_source_url: 'https://upstream.example.com/art.png', source_attribution: 'Original source',
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-23T01:00:00Z', storage_provider: 'supabase_storage',
  storage_bucket: sourceBucket, storage_key: 'old/original.png', storage_path: 'old/original.png',
  archival_storage_key: 'old/original.png', url: 'https://old.example.com/original.png',
  mime_type: 'image/png', byte_size: body.length, sha256: sha(body), content_sha256: sha(body),
  derivative_list: [{ role: 'card-grid', storageProvider: 'supabase_storage', storageBucket: sourceBucket,
    storageKey: 'old/grid.webp', storage_key: 'old/grid.webp', mimeType: 'image/webp', width: 240, height: 336,
    byteSize: grid.length, contentSha256: sha(grid), url: 'https://old.example.com/grid.webp',
    delivery_url: 'https://old.example.com/grid.webp' }],
};
const configuration = { sourceBucket, destinationBucket, publicBaseUrl: base };

function fixture(overrides = {}) {
  const events = [];
  const objects = new Map();
  const sources = new Map([['old/original.png', body], ['old/grid.webp', grid]]);
  const input = {
    ...configuration, assets: [structuredClone(asset)], execute: true,
    sourceStorage: { async getObject(bucket, key, options) {
      events.push({ kind: 'source', bucket, key, options });
      assert.equal(bucket, sourceBucket);
      return sources.get(key);
    } },
    destinationStorage: {
      id: 's3_compatible', catalogueStorage: true, catalogueBucket: destinationBucket,
      publicUrl: (bucket, key) => bucket === destinationBucket ? `${base}/${key}` : null,
      async putObject(inputObject) {
        events.push({ kind: 'put', key: inputObject.key });
        assert.equal(inputObject.upsert, false);
        assert.equal(inputObject.bucket, destinationBucket);
        if (objects.has(inputObject.key)) throw Object.assign(new Error('exists'), { status: 412 });
        objects.set(inputObject.key, { body: Buffer.from(inputObject.body), mimeType: inputObject.contentType });
      },
      async getObject(bucket, key, options) {
        events.push({ kind: 'destination_get', key, options });
        assert.equal(bucket, destinationBucket);
        return objects.get(key)?.body;
      },
    },
    async fetchImpl(url, options) {
      events.push({ kind: 'cdn', url });
      assert.equal(options.redirect, 'error');
      const value = objects.get(url.slice(base.length + 1));
      return new Response(value.body, { headers: { 'content-type': value.mimeType, 'content-length': String(value.body.length) } });
    },
    async journal(record) { events.push({ kind: 'journal', record: structuredClone(record) }); },
    async publish(plan) {
      events.push({ kind: 'publish', plan: structuredClone(plan) });
      return { applied: true, updatedAt: '2026-10-23T02:00:00Z' };
    },
    ...overrides,
  };
  return { input, events, objects, sources };
}

const secondAsset = { ...asset, id: '22222222-2222-4222-8222-222222222222', asset_id: 'stable-asset-2' };
const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory',
  expectedRef: 'oakdbbzdqwurpjnoqhmu', sourceOrigin: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  options: { ...configuration, maxAssets: 25, maxObjectBytes: 12582912, maxBatchBytes: 262144000, objectTimeoutMs: 30000 },
  limit: 25, afterId: null, assets: [asset, secondAsset] };
const inventoryDigest = 'a'.repeat(64);
const records = [{ event: 'migration_preflight', inventorySha256: inventoryDigest, inventory }];
const f = fixture({ assets: inventory.assets,
  journal: async record => records.push(structuredClone(record)),
  publish: async plan => {
    const original = inventory.assets.find(item => item.id === plan.rowId);
    const after = { ...original, ...plan.patch, updated_at: '2026-10-23T02:00:00Z' };
    records.push({ event: 'database_cas_committed', operationId: plan.operationId,
      rowId: original.id, before: structuredClone(original), after });
    return { applied: true, updatedAt: after.updated_at };
  },
});
assert.equal((await migrateCatalogueAssets(f.input)).status, 'complete');
const operations = validateCatalogueMigrationJournal(records, inventory, inventoryDigest);
assert.equal(operations.length, 2);
assert.deepEqual(operations.map(item => item.after.id), [secondAsset.id, asset.id]);
assert.equal(operations[0].plan.patch.storage_key, asset.storage_key);
for (const mutate of [
  r => r.pop(),
  r => r.splice(r.findIndex(x => x.event === 'database_cas_committed'), 1),
  r => r.push(r.at(-1)),
  r => { r[0].inventorySha256 = 'b'.repeat(64); },
  r => { r.find(x => x.event === 'database_cas_committed').before.variant_id = 'changed'; },
  r => { r.find(x => x.event === 'database_cas_committed').after.source_id = 'changed'; },
  r => { r.find(x => x.event === 'publication_complete').receipt.before.storage_key = 'other'; },
  r => r.push({ event: 'unexpected' }),
]) {
  const altered = structuredClone(records); mutate(altered);
  assert.throws(() => validateCatalogueMigrationJournal(altered, inventory, inventoryDigest));
}

// Isolate only external DB/storage constructors; test the actual CLI source with injected I/O.
let cli = await readFile(new URL('./migrate-catalogue-to-r2.mjs', import.meta.url), 'utf8');
cli = cli.replace("import { createCatalogueObjectStorageAdapter } from '../backend/lib/objectStorage.js';",
  "const createCatalogueObjectStorageAdapter = () => { throw new Error('unexpected_storage'); };");
cli = cli.replace("import { createVerifiedSupabasePostgresClient, stripPostgresTlsParameters } from './deploy/verified-supabase-postgres.mjs';",
  "const createVerifiedSupabasePostgresClient = () => { throw new Error('unexpected_database'); }; const stripPostgresTlsParameters = value => value;");
cli = cli.replace("'./lib/r2-catalogue-migration.mjs'", JSON.stringify(new URL('./lib/r2-catalogue-migration.mjs', import.meta.url).href));
const { readRollbackJournal, rollbackCatalogueR2Migration, runCatalogueR2Migration } = await import('data:text/javascript;base64,' + Buffer.from(cli).toString('base64'));
const directory = await mkdtemp(path.join(tmpdir(), 'stackr-rollback-test-'));
try {
  const source = path.join(directory, 'forward.jsonl');
  const bytes = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(source, bytes);
  assert.deepEqual(await readRollbackJournal(source, sha(bytes)), records);
  await assert.rejects(() => readRollbackJournal(source, 'b'.repeat(64)), /digest_mismatch/);
  await writeFile(source, bytes.trimEnd());
  await assert.rejects(() => readRollbackJournal(source, sha(bytes.trimEnd())), /requires_reconciliation/);
  await writeFile(source, bytes);
  const config = { ...inventory.options, mode: 'rollback', expectedRef: inventory.expectedRef,
    origin: inventory.sourceOrigin, databaseUrl: 'fixture', limit: 25, afterId: null,
    inventoryPath: 'fixture', approvedDigest: inventoryDigest, rollbackJournal: source,
    approvedJournalDigest: sha(bytes), journalPath: path.join(directory, 'rollback.jsonl') };
  const env = { RAILWAY_SERVICE_ID: '12345678-1234-4123-8123-123456789abc', RAILWAY_ENVIRONMENT_ID: '12345678-1234-4123-8123-123456789abd' };
  async function replay({ drift = false, conflict = false, failReceipt = false } = {}) {
    let updates = 0; const log = []; 
    const db = {
      async connect() {}, async end() {},
      async query(sql, args) {
        if (sql.startsWith('select id, public')) return { rows: [{ id: sourceBucket, public: true }] };
        if (sql.startsWith('select to_jsonb')) return { rows: operations.map(item => ({ asset: { ...item.after, ...(drift ? { source_id: 'changed' } : {}) } })) };
        if (sql.startsWith('update')) {
          updates++;
          const operation = operations[updates - 1];
          assert.equal(args[0], operation.after.id, 'reverse rollback order');
          assert.deepEqual(JSON.parse(args.at(-1)), operation.after, 'SQL CAS uses full durable after-image');
          if (conflict) return { rows: [] };
          return { rows: [{ asset: { ...operation.after, ...operation.plan.patch, updated_at: '2026-10-24T02:00:00Z' } }] };
        }
        return { rows: [] };
      },
    };
    const promise = rollbackCatalogueR2Migration(config, { env, createDb: () => db,
      loadInventory: async () => inventory, openJournal: async () => ({
        async append(record) {
          log.push(record);
          if (failReceipt && record.event === 'database_cas_committed') throw new Error('journal_disk_failure');
        }, async close() {},
      }) });
    if (drift) { await assert.rejects(promise, /snapshot_changed/); assert.equal(updates, 0); }
    else if (conflict) { await assert.rejects(promise, /requires_reconciliation/); assert.equal(updates, 1); }
    else if (failReceipt) { await assert.rejects(promise, /journal_disk_failure/); assert.equal(updates, 1); assert(!log.some(r => r.event === 'rollback_complete')); }
    else { assert.equal((await promise).status, 'rolled_back'); assert.equal(updates, 2); assert.equal(log.at(-1).event, 'rollback_complete'); }
  }
  const argv = ['--mode=rollback', '--expected-ref=oakdbbzdqwurpjnoqhmu', '--inventory=fixture',
    '--approved-inventory-sha256=' + inventoryDigest, '--rollback-journal=' + source,
    '--approved-journal-sha256=' + sha(bytes), '--journal=' + config.journalPath];
  const pinnedEnv = { ...env, SUPABASE_URL: inventory.sourceOrigin,
    SUPABASE_DB_URL: 'postgresql://postgres:fixture@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres',
    STACKR_R2_BUCKET: destinationBucket, STACKR_R2_PUBLIC_BASE_URL: base };
  await assert.rejects(() => runCatalogueR2Migration({ argv, env: { ...pinnedEnv, SUPABASE_URL: 'https://wrong.supabase.co' } }), /pin_mismatch/);
  await assert.rejects(() => runCatalogueR2Migration({ argv: argv.filter(arg => !arg.startsWith('--approved-inventory-sha256=')), env: pinnedEnv }), /approved_inventory_digest_required/);
  await assert.rejects(() => runCatalogueR2Migration({ argv: argv.filter(arg => !arg.startsWith('--approved-journal-sha256=')), env: pinnedEnv,
    loadInventory: async () => inventory }), /approved_journal_digest_required/);
  await assert.rejects(() => runCatalogueR2Migration({ argv, env: pinnedEnv,
    loadInventory: async () => ({ ...inventory, assets: Array.from({ length: 26 }, (_, i) => ({ ...asset, id: String(i + 1).padStart(8, '0') + '-1111-4111-8111-111111111111' })) }) }), /invalid_inventory_rows/);
  await replay(); await replay({ drift: true }); await replay({ conflict: true }); await replay({ failReceipt: true });
} finally { await rm(directory, { recursive: true, force: true }); }
console.log('PASS durable rollback journal validation, digest/truncation, full-row CAS, drift/conflict and ambiguous receipt failure');
