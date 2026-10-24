import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { migrateCatalogueAssets } from './lib/r2-catalogue-migration.mjs';
import { validateStoppedCatalogueMigrationJournal } from './lib/r2-stopped-migration-reconciliation.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const body = Buffer.from('unchanged approved source artwork');
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const options = { sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-r2',
  publicBaseUrl: 'https://cdn.example.com/assets', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 30000 };
const asset = (n) => ({ id: id(n), asset_id: 'tcgdex:ja:physical-' + n, asset_type: 'card_image',
  source_id: 'approved-source', variant_id: n === 3 ? null : id(n + 100),
  original_source_url: 'https://source.example.com/' + n, source_attribution: 'Verified source ???',
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-23T01:00:00.000Z', storage_provider: 'supabase_storage',
  storage_bucket: options.sourceBucket, storage_key: 'old/' + n + '.png', storage_path: 'old/' + n + '.png',
  archival_storage_key: 'old/' + n + '.png', url: 'https://old.example.com/' + n + '.png',
  cache_control: null, mime_type: 'image/png', byte_size: body.length, sha256: sha(body), content_sha256: sha(body),
  derivative_list: ['card-grid', 'search-result', 'detail-page'].map((role) => ({
    role, storageProvider: 'supabase_storage', storageBucket: options.sourceBucket,
    storageKey: 'old/' + n + '-' + role + '.webp', storage_key: 'old/' + n + '-' + role + '.webp',
    key: 'old/' + n + '-' + role + '.webp', path: 'old/' + n + '-' + role + '.webp',
    mimeType: 'image/webp', byteSize: body.length, contentSha256: sha(body), width: 240, height: 336,
    url: 'https://old.example.com/' + n + '-' + role + '.webp',
    delivery_url: 'https://old.example.com/' + n + '-' + role + '.webp',
  })) });
const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', createdAt: '2026-10-24T01:00:00Z',
  expectedRef: 'oakdbbzdqwurpjnoqhmu', sourceOrigin: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  options, limit: 25, afterId: id(0), nextAfterId: id(25), exhausted: false,
  assets: Array.from({ length: 25 }, (_, index) => asset(index + 1)) };
const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2) + '\n');
const records = [{ event: 'migration_preflight', inventorySha256: sha(inventoryBytes), inventory,
  railwayServiceId: 'b5410607-a591-420e-a506-fe184ce7455b',
  railwayEnvironmentId: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f' }];
const objects = new Map();
const result = await migrateCatalogueAssets({ ...options, assets: inventory.assets, execute: true,
  readSource: async () => body,
  destinationStorage: { id: 's3_compatible', catalogueStorage: true, catalogueBucket: options.destinationBucket,
    publicUrl: (bucket, key) => options.publicBaseUrl + '/' + key,
    async putObject(value) {
      if (value.key.includes('/' + id(12) + '/') && value.key.endsWith('/detail-page.webp')) {
        throw Object.assign(new Error('test deadline'), { code: 'cancelled_or_deadline' });
      }
      objects.set(value.key, { body: Buffer.from(value.body), mimeType: value.contentType });
      if (value.key.includes('/' + id(2) + '/') && value.key.endsWith('/card-grid.webp')) {
        throw Object.assign(new Error('immutable object already exists'), { status: 412 });
      }
    },
    async getObject(bucket, key) { assert.equal(bucket, options.destinationBucket); return objects.get(key).body; } },
  fetchImpl: async (url) => {
    const object = objects.get(url.slice(options.publicBaseUrl.length + 1));
    return new Response(object.body, { headers: { 'content-type': object.mimeType, 'content-length': String(body.length) } });
  },
  journal: async (record) => records.push(structuredClone(record)),
  publish: async (plan) => {
    const before = inventory.assets.find((row) => row.id === plan.rowId);
    const after = { ...before, ...plan.patch, updated_at: '2026-10-24T02:00:00.000Z' };
    records.push({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId,
      before: structuredClone(before), after: structuredClone(after) });
    return { applied: true, updatedAt: after.updated_at };
  } });
assert.equal(result.status, 'stopped');
assert.equal(result.results.length, 12);
assert.equal(result.results.at(-1).status, 'failed');
assert.equal(result.results.at(-1).code, 'cancelled_or_deadline');
const execution = { exitCode: 1, signal: null, result };
function input({ changeInventory, changeJournal, changeExecution, changeExpected } = {}) {
  const i = structuredClone(inventory);
  const j = structuredClone(records);
  const e = structuredClone(execution);
  const expectedFailure = { publishedCount: 11, rowId: id(12), code: 'cancelled_or_deadline' };
  changeInventory?.(i); changeJournal?.(j); changeExecution?.(e); changeExpected?.(expectedFailure);
  const ib = Buffer.from(JSON.stringify(i, null, 2) + '\n');
  const jb = Buffer.from(j.map((record) => JSON.stringify(record)).join('\n') + '\n');
  const eb = Buffer.from(JSON.stringify(e, null, 2) + '\n');
  return { inventoryBytes: ib, inventorySha256: sha(ib), journalBytes: jb, journalSha256: sha(jb),
    executionBytes: eb, executionSha256: sha(eb), expectedFailure };
}
function rejects(change) { assert.throws(() => validateStoppedCatalogueMigrationJournal(input(change))); }

test('actual core output validates 11 full receipts and untouched tail without synthetic authority', () => {
  const source = input();
  const original = Buffer.from(source.journalBytes);
  const reconciled = validateStoppedCatalogueMigrationJournal(source);
  assert.equal(reconciled.inventory.assets.length, 25);
  assert.equal(reconciled.publishedOperations.length, 11);
  assert.deepEqual(reconciled.publishedOperations.map((row) => row.before.id), inventory.assets.slice(0, 11).map((row) => row.id));
  assert.deepEqual(reconciled.failedRow, inventory.assets[11]);
  assert.deepEqual(reconciled.remainingRows, inventory.assets.slice(12));
  assert.deepEqual(reconciled.verifiedTailObjects.map((o) => o.role), ['original', 'card-grid', 'search-result']);
  assert.equal(reconciled.pendingTailObject.role, 'detail-page');
  assert.deepEqual(source.journalBytes, original, 'input evidence remains unchanged');
  for (const operation of reconciled.publishedOperations) {
    assert.equal(operation.plan.operationId, operation.receipt.operationId + ':rollback');
    assert.equal(operation.plan.patch.storage_key, operation.before.storage_key);
    for (const [key, value] of Object.entries(operation.plan.guard)) assert.deepEqual(operation.after[key], value);
  }
  assert.equal(reconciled.publishedOperations[1].receipt.objects[1].reused, true);
  assert.deepEqual(reconciled.hashes, { inventorySha256: source.inventorySha256,
    journalSha256: source.journalSha256, executionSha256: source.executionSha256 });
});

test('whole-file approved digests are mandatory for each evidence file', () => {
  for (const field of ['inventorySha256', 'journalSha256', 'executionSha256']) {
    const value = input(); value[field] = '0'.repeat(64);
    assert.throws(() => validateStoppedCatalogueMigrationJournal(value), /digest_invalid/);
  }
  const value = input(); value.journalBytes[20] ^= 1;
  assert.throws(() => validateStoppedCatalogueMigrationJournal(value), /digest_invalid/);
});

test('a truncated final record or discarded pending object is rejected', () => {
  const value = input(); value.journalBytes = value.journalBytes.subarray(0, -1);
  value.journalSha256 = sha(value.journalBytes);
  assert.throws(() => validateStoppedCatalogueMigrationJournal(value), /truncated/);
  rejects({ changeJournal: (j) => j.pop() });
});

const mutations = [
  ['synthetic shortened inventory', { changeInventory: (i) => { i.assets = i.assets.slice(0, 12); } }],
  ['changed full preflight', { changeJournal: (j) => { j[0].inventory.assets[0].source_id = 'different'; } }],
  ['wrong project', { changeInventory: (i) => { i.expectedRef = 'anotherproject'; } }],
  ['wrong old timeout', { changeInventory: (i) => { i.options.objectTimeoutMs = 60000; } }],
  ['wrong expected failed row', { changeExpected: (v) => { v.rowId = id(13); } }],
  ['incorrect prefix count', { changeExpected: (v) => { v.publishedCount = 10; } }],
  ['unknown failure category', { changeExpected: (v) => { v.code = 'operation_failed'; } }],
  ['ambiguous exit', { changeExecution: (e) => { e.signal = 'SIGTERM'; } }],
  ['success exit with stopped result', { changeExecution: (e) => { e.exitCode = 0; } }],
  ['ambiguous failed publication status', { changeExecution: (e) => { e.result.results[11].status = 'publication_requires_reconciliation'; } }],
  ['failed row publication plan', { changeExecution: (e) => { e.result.results[11].plan = {}; } }],
  ['failed row receipt timestamp', { changeExecution: (e) => { e.result.results[11].updatedAt = '2026-10-24T03:00:00Z'; } }],
  ['incorrect unattempted count', { changeExecution: (e) => { e.result.remaining = 14; } }],
  ['incorrect byte budget', { changeExecution: (e) => { e.result.processedBytes += 1; } }],
  ['reordered result prefix', { changeExecution: (e) => { [e.result.results[0], e.result.results[1]] = [e.result.results[1], e.result.results[0]]; } }],
  ['mismatched execution receipt', { changeExecution: (e) => { e.result.results[0].receipt.updatedAt = '2026-10-24T04:00:00Z'; } }],
  ['missing publication intent', { changeJournal: (j) => j.splice(j.findIndex((r) => r.event === 'publication_pending'), 1) }],
  ['missing commit receipt', { changeJournal: (j) => j.splice(j.findIndex((r) => r.event === 'database_cas_committed'), 1) }],
  ['duplicate complete receipt', { changeJournal: (j) => j.push(structuredClone(j.find((r) => r.event === 'publication_complete'))) }],
  ['changed full before row', { changeJournal: (j) => { j.find((r) => r.event === 'database_cas_committed').before.variant_id = null; } }],
  ['changed full after identity', { changeJournal: (j) => { j.find((r) => r.event === 'database_cas_committed').after.source_id = 'changed'; } }],
  ['extra full after column', { changeJournal: (j) => { j.find((r) => r.event === 'database_cas_committed').after.extra = true; } }],
  ['unverified publication object', { changeJournal: (j) => j.splice(j.findIndex((r) => r.event === 'object_verified'), 1) }],
  ['duplicate pending object', { changeJournal: (j) => j.splice(2, 0, structuredClone(j[1])) }],
  ['altered object hash', { changeJournal: (j) => { j[1].object.sha256 = '0'.repeat(64); } }],
  ['altered destination key', { changeJournal: (j) => { j[1].object.key += '-changed'; } }],
  ['altered verified size', { changeJournal: (j) => { j[2].object.byteSize += 1; } }],
  ['unapproved prepared patch', { changeJournal: (j) => { j.find((r) => r.event === 'publication_pending').plan.patch.derivative_list[0].width = 999; } }],
  ['failed row publication attempt', { changeJournal: (j) => j.push({ event: 'publication_pending', plan: {} }) }],
  ['failed row database commit', { changeJournal: (j) => j.push({ event: 'database_cas_committed', rowId: id(12), operationId: '0'.repeat(64), before: {}, after: {} }) }],
  ['unattempted row activity', { changeJournal: (j) => j.push({ event: 'object_pending', rowId: id(13), object: {} }) }],
  ['unknown journal event', { changeJournal: (j) => j.push({ event: 'failure_was_repaired' }) }],
];
for (const [name, change] of mutations) test(name + ' fails closed even with recomputed file hashes', () => rejects(change));
