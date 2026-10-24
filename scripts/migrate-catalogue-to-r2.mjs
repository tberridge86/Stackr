#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCatalogueObjectStorageAdapter } from '../backend/lib/objectStorage.js';
import { createVerifiedSupabasePostgresClient, stripPostgresTlsParameters } from './deploy/verified-supabase-postgres.mjs';
import { migrateCatalogueAssets, planCatalogueAssetMigration, validateCatalogueMigrationJournal } from './lib/r2-catalogue-migration.mjs';

const SOURCE_BUCKET = 'stackr-catalogue-public';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const POINTER_FIELDS = new Set(['storage_provider', 'storage_bucket', 'storage_key', 'storage_path', 'url',
  'content_sha256', 'sha256', 'byte_size', 'derivative_list', 'cache_control', 'archival_storage_key']);
const MAX_INVENTORY_BYTES = 4 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;

function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function number(value, fallback, maximum, code) {
  const parsed = Number(value ?? fallback);
  check(Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum, code);
  return parsed;
}

export function migrationConfiguration(argv, env) {
  const allowed = new Set(['mode', 'expected-ref', 'source-bucket', 'inventory', 'approved-inventory-sha256', 'journal',
    'limit', 'after-id', 'max-object-bytes', 'max-batch-bytes', 'object-timeout-ms', 'rollback-journal', 'approved-journal-sha256']);
  const args = {};
  for (const raw of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/.exec(raw);
    check(match && allowed.has(match[1]) && !Object.hasOwn(args, match[1]), 'unknown_or_duplicate_argument');
    args[match[1]] = match[2];
  }
  const mode = args.mode ?? 'inventory';
  check(['inventory', 'execute', 'rollback'].includes(mode), 'unsupported_mode');
  const expectedRef = args['expected-ref'];
  check(/^[a-z0-9]{20}$/.test(expectedRef ?? ''), 'explicit_expected_ref_required');
  const origin = `https://${expectedRef}.supabase.co`;
  check([origin, `${origin}/`].includes(env.SUPABASE_URL), 'supabase_url_pin_mismatch');
  let database;
  try { database = new URL(env.SUPABASE_DB_URL); } catch { check(false, 'database_url_required'); }
  let username;
  try { username = decodeURIComponent(database.username); } catch { check(false, 'invalid_database_identity'); }
  const direct = database.hostname === `db.${expectedRef}.supabase.co` && ['postgres', `postgres.${expectedRef}`].includes(username);
  const pooled = database.hostname.endsWith('.pooler.supabase.com') && username === `postgres.${expectedRef}`;
  check((direct || pooled) && database.pathname === '/postgres' && !database.hash, 'database_project_pin_mismatch');
  const databaseUrl = stripPostgresTlsParameters(database.toString());
  check((args['source-bucket'] ?? SOURCE_BUCKET) === SOURCE_BUCKET, 'source_bucket_not_public_catalogue');
  const destinationBucket = env.STACKR_R2_BUCKET;
  check(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(destinationBucket ?? ''), 'destination_bucket_required');
  const publicBaseUrl = String(env.STACKR_R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  const limit = number(args.limit, 25, 50, 'invalid_metadata_page_limit');
  const afterId = args['after-id'] ?? null;
  check(afterId === null || UUID.test(afterId), 'invalid_after_id');
  check(typeof args.inventory === 'string', 'inventory_path_required');
  return { mode, expectedRef, origin, databaseUrl, sourceBucket: SOURCE_BUCKET, destinationBucket, publicBaseUrl,
    limit, afterId, inventoryPath: path.resolve(args.inventory), journalPath: args.journal ? path.resolve(args.journal) : null,
    approvedDigest: args['approved-inventory-sha256'],
    rollbackJournal: args['rollback-journal'] ? path.resolve(args['rollback-journal']) : null,
    approvedJournalDigest: args['approved-journal-sha256'],
    maxAssets: limit,
    maxObjectBytes: number(args['max-object-bytes'], 12 * 1024 * 1024, 12 * 1024 * 1024, 'invalid_object_limit'),
    maxBatchBytes: number(args['max-batch-bytes'], 250 * 1024 * 1024, 1024 * 1024 * 1024, 'invalid_batch_limit'),
    objectTimeoutMs: number(args['object-timeout-ms'], 30_000, 120_000, 'invalid_object_timeout') };
}

function migrationOptions(config) {
  return Object.fromEntries(['sourceBucket', 'destinationBucket', 'publicBaseUrl', 'maxAssets', 'maxObjectBytes',
    'maxBatchBytes', 'objectTimeoutMs'].map((key) => [key, config[key]]));
}

async function syncDirectory(directory) {
  // Linux Railway volumes need the new directory entry persisted as well as file contents.
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function writeMigrationInventory(filename, inventory) {
  const bytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`);
  check(bytes.length <= MAX_INVENTORY_BYTES, 'inventory_metadata_too_large');
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  const inventorySha256 = sha256(bytes);
  const digestPath = `${filename}.sha256.json`;
  const digestHandle = await open(digestPath, 'wx', 0o600);
  try {
    await digestHandle.writeFile(`${JSON.stringify({ inventoryFile: path.basename(filename), inventorySha256 })}\n`);
    await digestHandle.sync();
  } finally { await digestHandle.close(); }
  await syncDirectory(path.dirname(filename));
  return { inventoryPath: filename, inventorySha256, digestPath };
}

export async function readMigrationInventory(filename, approvedDigest) {
  check(/^[a-f0-9]{64}$/.test(approvedDigest ?? ''), 'approved_inventory_digest_required');
  check((await stat(filename)).size <= MAX_INVENTORY_BYTES, 'inventory_metadata_too_large');
  const bytes = await readFile(filename);
  check(bytes.length <= MAX_INVENTORY_BYTES && sha256(bytes) === approvedDigest, 'approved_inventory_digest_mismatch');
  return JSON.parse(bytes.toString('utf8'));
}

export async function openDurableMigrationJournal(filename, env, openHandle = open) {
  check(UUID.test(env.RAILWAY_SERVICE_ID ?? '') && UUID.test(env.RAILWAY_ENVIRONMENT_ID ?? ''), 'railway_execution_required');
  check(path.isAbsolute(env.RAILWAY_VOLUME_MOUNT_PATH ?? '') && filename, 'railway_durable_journal_required');
  const volume = await realpath(env.RAILWAY_VOLUME_MOUNT_PATH);
  const directory = await realpath(path.dirname(filename));
  const relative = path.relative(volume, directory);
  check(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)), 'journal_outside_railway_volume');
  const handle = await openHandle(path.join(directory, path.basename(filename)), 'ax', 0o600);
  try { await syncDirectory(directory); } catch (error) { await handle.close(); throw error; }
  let pending = Promise.resolve();
  let writtenBytes = 0;
  return {
    append(record) {
      pending = pending.then(async () => {
        const line = `${JSON.stringify(record)}\n`;
        const byteLength = Buffer.byteLength(line);
        check(writtenBytes + byteLength <= MAX_JOURNAL_BYTES, 'journal_too_large');
        writtenBytes += byteLength;
        await handle.writeFile(line);
        await handle.sync();
      });
      return pending;
    },
    async close() { try { await pending; } finally { await handle.close(); } },
  };
}

export function createPublicSupabaseReader(config, fetchImpl = globalThis.fetch) {
  return async (descriptor, { maxBytes, signal }) => {
    check(descriptor.provider === 'supabase_storage' && descriptor.bucket === SOURCE_BUCKET, 'unexpected_public_source');
    check(typeof descriptor.key === 'string' && descriptor.key.length > 0 && !/[\\\u0000-\u001f?#%]/.test(descriptor.key)
      && descriptor.key.split('/').every((part) => part && part !== '.' && part !== '..'), 'unsafe_source_key');
    check(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= config.maxObjectBytes, 'invalid_source_byte_limit');
    const url = `${config.origin}/storage/v1/object/public/${SOURCE_BUCKET}/${descriptor.key.split('/').map(encodeURIComponent).join('/')}`;
    const deadline = AbortSignal.timeout(config.objectTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const response = await fetchImpl(url, { redirect: 'error', signal: combined, cache: 'no-store' });
    try {
      check(response.ok && !response.redirected && (!response.url || response.url === url), 'source_public_read_failed');
      const length = response.headers.get('content-length');
      check(length === null || (Number.isSafeInteger(Number(length)) && Number(length) > 0 && Number(length) <= maxBytes), 'source_object_too_large');
      check(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === descriptor.mimeType, 'source_mime_mismatch');
      check(response.body?.getReader, 'source_body_missing');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          check(size <= maxBytes, 'source_object_too_large');
          chunks.push(Buffer.from(next.value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      check(size > 0, 'empty_source_object');
      return Buffer.concat(chunks, size);
    } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
  };
}

export async function assertPublicMigrationBucket(db) {
  const result = await db.query('select id, public from storage.buckets where id = $1', [SOURCE_BUCKET]);
  check(result.rows.length === 1 && result.rows[0].id === SOURCE_BUCKET && result.rows[0].public === true, 'source_bucket_not_public');
}

export async function inventoryCatalogueRows(db, config) {
  const result = await db.query(`select to_jsonb(a) as asset from catalog.assets a
    where a.storage_provider = 'supabase_storage' and a.storage_bucket = $1
      and a.rights_status = 'approved' and a.permission_status = 'approved'
      and a.asset_visibility = 'public_catalogue' and a.publicly_servable
      and a.retention_status = 'active' and a.deleted_at is null and a.deprecated_at is null
      and ($2::uuid is null or a.id > $2::uuid)
    order by a.id limit $3`, [SOURCE_BUCKET, config.afterId, config.limit]);
  const assets = result.rows.map((row) => row.asset);
  check(assets.length <= config.limit && assets.length <= 50, 'metadata_page_overflow');
  let previous = config.afterId;
  for (const asset of assets) {
    check(UUID.test(asset?.id ?? '') && (!previous || asset.id > previous), 'metadata_cursor_not_increasing');
    planCatalogueAssetMigration(asset, migrationOptions(config));
    previous = asset.id;
  }
  return assets;
}

export function createPgMigrationPublisher(db, assets, journal, config, verifiedObjects = new Map(), committedOperations = new Map()) {
  const expected = new Map(assets.map((asset) => [asset.id, structuredClone(asset)]));
  return async (plan) => {
    const before = expected.get(plan.rowId);
    check(before && plan.guard?.id === plan.rowId && plan.assetId === before.asset_id, 'publication_identity_mismatch');
    check(Object.entries(plan.guard).every(([key, value]) => same(before[key], value)), 'publication_guard_mismatch');
    check(Object.entries(plan.before).every(([key, value]) => POINTER_FIELDS.has(key) && same(before[key] ?? null, value)), 'publication_before_mismatch');
    if (plan.snapshotHash) check(plan.snapshotHash === sha256(JSON.stringify(canonical(before))), 'publication_snapshot_mismatch');
    const entries = Object.entries(plan.patch ?? {});
    check(entries.length > 0 && entries.every(([key]) => POINTER_FIELDS.has(key)), 'unapproved_publication_column');
    const rollback = String(plan.operationId).endsWith(':rollback');
    if (rollback) {
      const committed = committedOperations.get(plan.operationId.slice(0, -':rollback'.length));
      check(committed && same(before, committed.after) && same(plan.patch, committed.restore), 'rollback_not_bound_to_committed_operation');
    } else {
      check(Array.isArray(plan.objects) && plan.objects.length > 0
        && plan.objects.every((object) => same(verifiedObjects.get(`${plan.rowId}:${object.role}`), object)), 'publication_objects_not_durably_verified');
      const original = plan.objects.find((object) => object.role === 'original');
      check(original && plan.patch.storage_key === original.key && plan.patch.storage_path === original.key
        && plan.patch.url === original.url && plan.patch.byte_size === original.byteSize
        && plan.patch.sha256 === original.sha256 && plan.patch.content_sha256 === original.sha256, 'publication_original_mismatch');
      check(Array.isArray(plan.patch.derivative_list) && plan.patch.derivative_list.length === plan.objects.length - 1
        && plan.patch.derivative_list.every((derivative) => {
          const object = plan.objects.find((candidate) => candidate.role === derivative.role);
          return object && derivative.storageProvider === 's3_compatible' && derivative.storageBucket === config.destinationBucket
            && derivative.storageKey === object.key && derivative.url === object.url && derivative.deliveryUrl === object.url
            && derivative.contentSha256 === object.sha256 && derivative.byteSize === object.byteSize;
        }), 'publication_derivative_mismatch');
    }
    check(rollback
      ? plan.patch.storage_provider === 'supabase_storage' && plan.patch.storage_bucket === SOURCE_BUCKET
      : plan.patch.storage_provider === 's3_compatible' && plan.patch.storage_bucket === config.destinationBucket
        && typeof plan.patch.url === 'string' && plan.patch.url.startsWith(`${config.publicBaseUrl}/`), 'publication_destination_mismatch');
    const values = entries.map(([key, value]) => key === 'derivative_list' ? JSON.stringify(value) : value);
    const assignments = entries.map(([key], index) => `${key} = $${index + 2}${key === 'derivative_list' ? '::jsonb' : ''}`).join(', ');
    const guardIndex = values.length + 2;
    await db.query('begin');
    let committed = false;
    try {
      const result = await db.query(`update catalog.assets a set ${assignments}
        where a.id = $1::uuid and to_jsonb(a) = $${guardIndex}::jsonb
        returning to_jsonb(a) as asset`, [plan.rowId, ...values, JSON.stringify(before)]);
      if (result.rows.length === 0) { await db.query('rollback'); return { applied: false }; }
      check(result.rows.length === 1, 'publication_row_count_mismatch');
      const after = result.rows[0].asset;
      check(typeof after.updated_at === 'string' && Number.isFinite(Date.parse(after.updated_at)), 'publication_timestamp_missing');
      check(Object.entries(before).every(([key, value]) => key === 'updated_at' || POINTER_FIELDS.has(key) || same(after[key], value)), 'publication_changed_identity');
      check(entries.every(([key, value]) => same(after[key], value)), 'publication_patch_mismatch');
      await db.query('commit');
      committed = true;
      expected.set(plan.rowId, structuredClone(after));
      if (!rollback) committedOperations.set(plan.operationId, { after: structuredClone(after), restore: structuredClone(plan.before) });
      await journal({ event: 'database_cas_committed', operationId: plan.operationId, rowId: plan.rowId, before, after });
      return { applied: true, updatedAt: after.updated_at };
    } catch (error) {
      if (!committed) await db.query('rollback').catch(() => {});
      throw error;
    }
  };
}


export async function readRollbackJournal(filename, approvedDigest) {
  check(filename && /^[a-f0-9]{64}$/.test(approvedDigest ?? ''), 'approved_journal_digest_required');
  const maximum = MAX_JOURNAL_BYTES;
  check((await stat(filename)).size <= maximum, 'journal_too_large');
  const bytes = await readFile(filename);
  check(bytes.length <= maximum && sha256(bytes) === approvedDigest, 'approved_journal_digest_mismatch');
  const text = bytes.toString('utf8');
  check(text.endsWith('\n'), 'journal_requires_reconciliation');
  return text.trimEnd().split('\n').map(line => JSON.parse(line));
}

export async function rollbackCatalogueR2Migration(config, { env, createDb, openJournal, loadInventory }) {
  check(UUID.test(env.RAILWAY_SERVICE_ID ?? '') && UUID.test(env.RAILWAY_ENVIRONMENT_ID ?? ''), 'railway_execution_required');
  check(config.journalPath && config.journalPath !== config.rollbackJournal, 'new_rollback_journal_required');
  const inventory = await loadInventory(config.inventoryPath, config.approvedDigest);
  check(inventory.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory'
    && inventory.expectedRef === config.expectedRef && inventory.sourceOrigin === config.origin
    && same(inventory.options, migrationOptions(config)) && inventory.limit === config.limit
    && inventory.afterId === config.afterId, 'inventory_target_or_bounds_mismatch');
  check(Array.isArray(inventory.assets) && inventory.assets.length > 0 && inventory.assets.length <= config.limit
    && new Set(inventory.assets.map(asset => asset.id)).size === inventory.assets.length
    && inventory.assets.every(asset => UUID.test(asset.id)), 'invalid_inventory_rows');
  const records = await readRollbackJournal(config.rollbackJournal, config.approvedJournalDigest);
  const operations = validateCatalogueMigrationJournal(records, inventory, config.approvedDigest);
  const journal = await openJournal(config.journalPath, env);
  let db;
  try {
    await journal.append({ event: 'rollback_preflight', sourceJournalSha256: config.approvedJournalDigest,
      inventorySha256: config.approvedDigest, operations: operations.map(item => item.receipt.operationId) });
    db = createDb(config.databaseUrl);
    await db.connect();
    await assertPublicMigrationBucket(db);
    const current = await db.query('select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id',
      [operations.map(item => item.after.id)]);
    const currentById = new Map(current.rows.map(row => [row.asset.id, row.asset]));
    check(current.rows.length === operations.length
      && operations.every(item => same(currentById.get(item.after.id), item.after)), 'rollback_database_snapshot_changed');
    const committed = new Map(operations.map(item => [item.receipt.operationId,
      { after: item.after, restore: item.receipt.before }]));
    const publish = createPgMigrationPublisher(db, operations.map(item => item.after),
      record => journal.append(record), config, new Map(), committed);
    for (const item of operations) {
      await journal.append({ event: 'rollback_pending', plan: item.plan });
      const result = await publish(item.plan);
      check(result.applied === true, 'rollback_conflict_requires_reconciliation');
      await journal.append({ event: 'rollback_complete', operationId: item.plan.operationId, updatedAt: result.updatedAt });
    }
    return { status: 'rolled_back', assetCount: operations.length, sourceObjectsDeleted: 0 };
  } finally {
    try { if (db) await db.end(); } finally { await journal.close(); }
  }
}

export async function runCatalogueR2Migration({ argv = process.argv.slice(2), env = process.env,
  createDb = (url) => createVerifiedSupabasePostgresClient(url, 'stackr-r2-catalogue-migration', {
    connectionTimeoutMillis: 15_000, statement_timeout: 30_000, query_timeout: 45_000,
  }), createStorage = () => createCatalogueObjectStorageAdapter({ env }), fetchImpl = globalThis.fetch,
  openJournal = openDurableMigrationJournal, saveInventory = writeMigrationInventory,
  loadInventory = readMigrationInventory, migrate = migrateCatalogueAssets } = {}) {
  const config = migrationConfiguration(argv, env);
  const options = migrationOptions(config);
  if (config.mode === 'rollback') {
    return rollbackCatalogueR2Migration(config, { env, createDb, openJournal, loadInventory });
  }
  // Validate destination and byte limits before opening a database or creating any object reader.
  await migrateCatalogueAssets({ ...options, assets: [], execute: false });
  let inventory;
  let storage;
  let journal;
  const verifiedObjects = new Map();
  const appendJournal = async (record) => {
    await journal.append(record);
    if (record.event === 'object_verified') verifiedObjects.set(`${record.rowId}:${record.object.role}`, structuredClone(record.object));
  };
  if (config.mode === 'execute') {
    check(UUID.test(env.RAILWAY_SERVICE_ID ?? '') && UUID.test(env.RAILWAY_ENVIRONMENT_ID ?? ''), 'railway_execution_required');
    check(config.journalPath && path.isAbsolute(env.RAILWAY_VOLUME_MOUNT_PATH ?? ''), 'railway_durable_journal_required');
    check(/^[a-f0-9]{64}$/.test(config.approvedDigest ?? ''), 'approved_inventory_digest_required');
    inventory = await loadInventory(config.inventoryPath, config.approvedDigest);
    check(inventory.schemaVersion === 1 && inventory.kind === 'stackr-r2-catalogue-inventory'
      && inventory.expectedRef === config.expectedRef && inventory.sourceOrigin === config.origin
      && same(inventory.options, options) && inventory.limit === config.limit && inventory.afterId === config.afterId,
    'inventory_target_or_bounds_mismatch');
    check(Array.isArray(inventory.assets) && inventory.assets.length > 0 && inventory.assets.length <= config.limit
      && new Set(inventory.assets.map((asset) => asset.id)).size === inventory.assets.length, 'invalid_inventory_rows');
    for (const asset of inventory.assets) { check(UUID.test(asset.id), 'invalid_inventory_identity'); planCatalogueAssetMigration(asset, options); }
    check(String(env.STACKR_R2_ACCESS_KEY_ID ?? '').trim() && String(env.STACKR_R2_SECRET_ACCESS_KEY ?? '').trim(), 'r2_credentials_required');
    storage = createStorage();
    check(storage?.id === 's3_compatible' && storage.catalogueStorage === true && storage.catalogueBucket === config.destinationBucket
      && storage.publicUrl(config.destinationBucket, 'preflight') === `${config.publicBaseUrl}/preflight`, 'configured_r2_required');
    journal = await openJournal(config.journalPath, env);
    try {
      await appendJournal({ event: 'migration_preflight', inventorySha256: config.approvedDigest, inventory,
        railwayServiceId: env.RAILWAY_SERVICE_ID, railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID });
    } catch (error) { await journal.close().catch(() => {}); throw error; }
  }
  let db;
  try {
    db = createDb(config.databaseUrl);
    await db.connect();
    await assertPublicMigrationBucket(db);
    if (config.mode === 'inventory') {
      const assets = await inventoryCatalogueRows(db, config);
      const document = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', createdAt: new Date().toISOString(),
        expectedRef: config.expectedRef, sourceOrigin: config.origin, options, limit: config.limit, afterId: config.afterId,
        nextAfterId: assets.at(-1)?.id ?? config.afterId, exhausted: assets.length < config.limit, assets };
      const saved = await saveInventory(config.inventoryPath, document);
      return { status: 'inventory', assetCount: assets.length, assetBytesRead: 0, ...saved, nextAfterId: document.nextAfterId, exhausted: document.exhausted };
    }
    const current = await db.query('select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id', [inventory.assets.map((asset) => asset.id)]);
    const currentById = new Map(current.rows.map((row) => [row.asset.id, row.asset]));
    check(current.rows.length === inventory.assets.length && inventory.assets.every((asset) => same(currentById.get(asset.id), asset)), 'inventory_database_snapshot_changed');
    const readPublic = createPublicSupabaseReader(config, fetchImpl);
    return await migrate({ ...options, execute: true, assets: inventory.assets, destinationStorage: storage,
      readSource: (object, readOptions) => object.provider === 's3_compatible'
        ? storage.getObject(object.bucket, object.key, readOptions) : readPublic(object, readOptions),
      fetchImpl, journal: appendJournal,
      publish: createPgMigrationPublisher(db, inventory.assets, appendJournal, config, verifiedObjects) });
  } finally {
    try { if (db) await db.end(); }
    finally { if (journal) await journal.close(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCatalogueR2Migration().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!['inventory', 'complete', 'rolled_back'].includes(result.status)) process.exitCode = 1;
  }).catch((error) => {
    // Codes only: database errors may contain connection information or source URLs.
    console.error(JSON.stringify({ ok: false, code: error.code ?? 'migration_preflight_or_operation_failed' }));
    process.exitCode = 1;
  });
}
