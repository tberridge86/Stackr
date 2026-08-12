import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { retryStorageOperation } from './storage-operation-retry.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const SOURCE_SECRET = process.env.SUPABASE_STAGING_SECRET_KEY;
const TARGET_SECRET = process.env.SUPABASE_PRODUCTION_SECRET_KEY;
const EVIDENCE_PATH = process.env.STACKR_STORAGE_PROMOTION_EVIDENCE_PATH;
const CONFIRMATION = process.env.STACKR_TRANSFER_CONFIRMATION;
const BUCKET = 'stackr-catalogue-public';
const CONCURRENCY = Number(process.env.STACKR_STORAGE_PROMOTION_CONCURRENCY ?? 8);
const RETRY_ATTEMPTS = Number(process.env.STACKR_STORAGE_PROMOTION_RETRY_ATTEMPTS ?? 6);

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_REF: SOURCE_PROJECT_REF,
  SUPABASE_RESTORE_PROJECT_REF: TARGET_PROJECT_REF,
  STACKR_SOURCE_DB_URL: SOURCE_DB_URL,
  STACKR_RESTORE_DB_URL: TARGET_DB_URL,
  SUPABASE_STAGING_SECRET_KEY: SOURCE_SECRET,
  SUPABASE_PRODUCTION_SECRET_KEY: TARGET_SECRET,
  STACKR_STORAGE_PROMOTION_EVIDENCE_PATH: EVIDENCE_PATH,
})) {
  if (!value) throw new Error(`missing_required_environment_variable:${name}`);
}
if (CONFIRMATION !== 'PROMOTE VERIFIED CATALOGUE TO PRODUCTION') {
  throw new Error('production_storage_promotion_confirmation_missing');
}
if (SOURCE_PROJECT_REF !== 'lmwfhvexfcoyeuoyrlco') {
  throw new Error('production_storage_source_guard_mismatch');
}
if (TARGET_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu') {
  throw new Error('production_storage_target_guard_mismatch');
}
if (SOURCE_PROJECT_REF === TARGET_PROJECT_REF) throw new Error('source_and_target_project_refs_match');
if (!SOURCE_DB_URL.includes(SOURCE_PROJECT_REF)) throw new Error('source_database_url_project_mismatch');
if (!TARGET_DB_URL.includes(TARGET_PROJECT_REF)) throw new Error('target_database_url_project_mismatch');
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 64) {
  throw new Error('invalid_storage_promotion_concurrency');
}
if (!Number.isInteger(RETRY_ATTEMPTS) || RETRY_ATTEMPTS < 1 || RETRY_ATTEMPTS > 6) {
  throw new Error('invalid_storage_promotion_retry_attempts');
}

const boundedFetch = (input, init = {}) => fetch(input, {
  ...init,
  signal: init.signal ?? AbortSignal.timeout(120_000),
});
const sourceStorage = createClient(`https://${SOURCE_PROJECT_REF}.supabase.co`, SOURCE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedFetch },
});
const targetStorage = createClient(`https://${TARGET_PROJECT_REF}.supabase.co`, TARGET_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedFetch },
});

async function retry(operation, options = {}) {
  return retryStorageOperation(operation, {
    attempts: RETRY_ATTEMPTS,
    ...options,
    onRetry: ({ attempt, throttled, abortedUpload, delayMilliseconds }) => {
      process.stdout.write(`${JSON.stringify({
        phase: 'retry_catalogue_storage_operation',
        attempt,
        throttled,
        abortedUpload,
        delayMilliseconds,
      })}\n`);
    },
  });
}

async function expectData(operation, context) {
  const result = await operation;
  if (result.error) {
    const error = new Error(`${context}:${result.error.message}`, { cause: result.error });
    for (const property of ['code', 'status', 'statusCode']) {
      if (result.error[property] != null) error[property] = result.error[property];
    }
    throw error;
  }
  return result.data;
}

async function storageInventory(connectionString, applicationName) {
  const database = createVerifiedSupabasePostgresClient(connectionString, applicationName);
  await database.connect();
  try {
    const bucket = (await database.query(`
      select id, public, file_size_limit::text, allowed_mime_types
      from storage.buckets
      where id = $1
    `, [BUCKET])).rows[0];
    if (!bucket) throw new Error(`${applicationName}_bucket_missing`);
    if (!bucket.public) throw new Error(`${applicationName}_bucket_not_public`);
    const objects = (await database.query(`
      select bucket_id, name, metadata, user_metadata
      from storage.objects
      where bucket_id = $1
      order by name
    `, [BUCKET])).rows;
    return { bucket, objects };
  } finally {
    await database.end();
  }
}

function comparableObject(object) {
  return {
    name: object.name,
    size: Number(object.metadata?.size ?? 0),
    mimetype: object.metadata?.mimetype ?? null,
    etag: String(object.metadata?.eTag ?? '').replaceAll('"', '') || null,
    cacheControl: object.metadata?.cacheControl ?? null,
  };
}

function objectIdentity(object) {
  const comparable = comparableObject(object);
  return `${comparable.name}\0${comparable.size}\0${comparable.mimetype ?? ''}`;
}

function inventorySha256(objects) {
  const hash = createHash('sha256');
  for (const object of objects) hash.update(JSON.stringify(comparableObject(object))).update('\n');
  return hash.digest('hex');
}

function uploadOptions(object) {
  const cacheControl = String(object.metadata?.cacheControl ?? '').replace(/^max-age=/, '');
  return {
    contentType: object.metadata?.mimetype ?? 'application/octet-stream',
    ...(cacheControl ? { cacheControl } : {}),
    upsert: true,
  };
}

async function mapWithConcurrency(items, operation) {
  let cursor = 0;
  let completed = 0;
  let failure = null;
  const results = new Array(items.length);
  async function worker() {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await operation(items[index]);
        completed += 1;
        if (completed % 1_000 === 0 || completed === items.length) {
          process.stdout.write(`${JSON.stringify({
            phase: 'promote_catalogue_storage',
            completed,
            total: items.length,
          })}\n`);
        }
      } catch (error) {
        failure ??= error;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(CONCURRENCY, Math.max(items.length, 1)) },
    () => worker(),
  ));
  if (failure) throw failure;
  return results;
}

const sourceInventory = await storageInventory(
  SOURCE_DB_URL,
  'stackr-production-storage-source',
);
const targetInventoryBefore = await storageInventory(
  TARGET_DB_URL,
  'stackr-production-storage-target-before',
);
const targetByName = new Map(targetInventoryBefore.objects.map((object) => [object.name, object]));
const missing = [];
for (const object of sourceInventory.objects) {
  const existing = targetByName.get(object.name);
  if (!existing) {
    missing.push(object);
  } else if (objectIdentity(existing) !== objectIdentity(object)) {
    throw new Error(`production_storage_object_conflict:${object.name}`);
  }
}

const transferResults = await mapWithConcurrency(missing, async (object) => {
  const blob = await retry(() => expectData(
    sourceStorage.storage.from(BUCKET).download(object.name),
    `download_source_object:${object.name}`,
  ));
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length !== Number(object.metadata?.size ?? bytes.length)) {
    throw new Error(`source_storage_size_mismatch:${object.name}`);
  }
  const pathHash = object.name.match(/\/([0-9a-f]{64})\/[^/]+$/)?.[1] ?? null;
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  if (!pathHash || contentHash !== pathHash) {
    throw new Error(`source_storage_content_hash_mismatch:${object.name}`);
  }
  await retry(() => expectData(
    targetStorage.storage.from(BUCKET).upload(object.name, bytes, uploadOptions(object)),
    `upload_production_object:${object.name}`,
  ), { retryAbortedUploadBadRequest: true });
  return { name: object.name, bytes: bytes.length, contentHashVerified: true };
});

const targetInventoryAfter = await storageInventory(
  TARGET_DB_URL,
  'stackr-production-storage-target-after',
);
const targetAfterByName = new Map(targetInventoryAfter.objects.map((object) => [object.name, object]));
const missingAfter = sourceInventory.objects.filter((object) => (
  objectIdentity(targetAfterByName.get(object.name) ?? {}) !== objectIdentity(object)
));
if (missingAfter.length) throw new Error(`production_storage_verification_failed:${missingAfter.length}`);

const evidence = {
  schemaVersion: 'stackr-production-catalogue-storage-promotion-v1.0.0',
  verifiedAt: new Date().toISOString(),
  sourceProjectRef: SOURCE_PROJECT_REF,
  targetProjectRef: TARGET_PROJECT_REF,
  bucket: BUCKET,
  sourceObjectCount: sourceInventory.objects.length,
  sourceByteSize: sourceInventory.objects.reduce(
    (total, object) => total + Number(object.metadata?.size ?? 0),
    0,
  ),
  targetObjectCountBefore: targetInventoryBefore.objects.length,
  copiedObjectCount: transferResults.length,
  copiedByteSize: transferResults.reduce((total, result) => total + result.bytes, 0),
  copiedContentHashVerifiedCount: transferResults.filter((result) => result.contentHashVerified).length,
  targetObjectCountAfter: targetInventoryAfter.objects.length,
  sourceInventorySha256: inventorySha256(sourceInventory.objects),
  verifiedSourceObjectCount: sourceInventory.objects.length - missingAfter.length,
  existingProductionObjectsRetained: true,
  providerRequestsPerformed: false,
  ok: missingAfter.length === 0,
};
mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(evidence)}\n`);
