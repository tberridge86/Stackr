import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  decodeStoragePack,
  encodeStoragePack,
  inventoryManifestSha256,
  selectRestoreSample,
  storageRecoveryPackInternals,
} from './storage-recovery-pack.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_SECRET = process.env.SUPABASE_STAGING_SECRET_KEY;
const TARGET_SECRET = process.env.SUPABASE_RESTORE_SECRET_KEY;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL ?? process.env.SUPABASE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL ?? process.env.SUPABASE_RESTORE_DB_URL;
const EVIDENCE_DIR = process.env.STACKR_RECOVERY_EVIDENCE_DIR ?? process.cwd();
const SOURCE_URL = `https://${SOURCE_PROJECT_REF}.supabase.co`;
const TARGET_URL = `https://${TARGET_PROJECT_REF}.supabase.co`;
const backupDir = path.join(EVIDENCE_DIR, 'storage-backup');
const TARGET_FILE_SIZE_CEILING_BYTES = Number(
  process.env.STACKR_RECOVERY_TARGET_MAX_FILE_SIZE_BYTES ?? 50 * 1024 * 1024,
);
const TARGET_BUCKET_DELETE_ATTEMPTS = Number(
  process.env.STACKR_RECOVERY_BUCKET_DELETE_ATTEMPTS ?? 30,
);
const TARGET_BUCKET_DELETE_RETRY_MS = Number(
  process.env.STACKR_RECOVERY_BUCKET_DELETE_RETRY_MS ?? 2_000,
);
const STORAGE_TRANSFER_CONCURRENCY = Number(
  process.env.STACKR_RECOVERY_STORAGE_CONCURRENCY ?? 64,
);
const STORAGE_RETRY_ATTEMPTS = Number(
  process.env.STACKR_RECOVERY_STORAGE_RETRY_ATTEMPTS ?? 4,
);
const STORAGE_PACK_MAX_BYTES = Number(
  process.env.STACKR_RECOVERY_STORAGE_PACK_MAX_BYTES ?? 40 * 1024 * 1024,
);
const STORAGE_PACK_TRANSFER_CONCURRENCY = Number(
  process.env.STACKR_RECOVERY_STORAGE_PACK_CONCURRENCY ?? 3,
);
const STORAGE_RESTORE_SAMPLE_SIZE = Number(
  process.env.STACKR_RECOVERY_STORAGE_SAMPLE_SIZE ?? 512,
);
const RECOVERY_PACK_BUCKET = 'stackr-recovery-packs';

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_REF: SOURCE_PROJECT_REF,
  SUPABASE_RESTORE_PROJECT_REF: TARGET_PROJECT_REF,
  SUPABASE_STAGING_SECRET_KEY: SOURCE_SECRET,
  SUPABASE_RESTORE_SECRET_KEY: TARGET_SECRET,
  SUPABASE_DB_URL: SOURCE_DB_URL,
  SUPABASE_RESTORE_DB_URL: TARGET_DB_URL,
})) {
  if (!value) throw new Error(`missing_required_environment_variable:${name}`);
}
if (SOURCE_PROJECT_REF === TARGET_PROJECT_REF) throw new Error('source_and_restore_project_refs_match');
if (!SOURCE_DB_URL.includes(SOURCE_PROJECT_REF)) throw new Error('source_database_url_project_mismatch');
if (!TARGET_DB_URL.includes(TARGET_PROJECT_REF)) throw new Error('restore_database_url_project_mismatch');
if (!Number.isInteger(STORAGE_TRANSFER_CONCURRENCY)
  || STORAGE_TRANSFER_CONCURRENCY < 1
  || STORAGE_TRANSFER_CONCURRENCY > 96) {
  throw new Error('invalid_storage_transfer_concurrency');
}
if (!Number.isInteger(STORAGE_RETRY_ATTEMPTS)
  || STORAGE_RETRY_ATTEMPTS < 1
  || STORAGE_RETRY_ATTEMPTS > 6) {
  throw new Error('invalid_storage_retry_attempts');
}
if (!Number.isInteger(STORAGE_PACK_MAX_BYTES)
  || STORAGE_PACK_MAX_BYTES < 1024 * 1024
  || STORAGE_PACK_MAX_BYTES > TARGET_FILE_SIZE_CEILING_BYTES) {
  throw new Error('invalid_storage_pack_max_bytes');
}
if (!Number.isInteger(STORAGE_PACK_TRANSFER_CONCURRENCY)
  || STORAGE_PACK_TRANSFER_CONCURRENCY < 1
  || STORAGE_PACK_TRANSFER_CONCURRENCY > 8) {
  throw new Error('invalid_storage_pack_transfer_concurrency');
}
if (!Number.isInteger(STORAGE_RESTORE_SAMPLE_SIZE)
  || STORAGE_RESTORE_SAMPLE_SIZE < 1
  || STORAGE_RESTORE_SAMPLE_SIZE > 10_000) {
  throw new Error('invalid_storage_restore_sample_size');
}

const source = createClient(SOURCE_URL, SOURCE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const target = createClient(TARGET_URL, TARGET_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function expectNoError(operation, context) {
  const result = await operation;
  if (result.error) throw new Error(`${context}:${result.error.message}`);
  return result.data;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryStorageOperation(operation) {
  let lastError;
  for (let attempt = 1; attempt <= STORAGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < STORAGE_RETRY_ATTEMPTS) {
        console.warn(JSON.stringify({ phase: 'retry_storage_operation', attempt }));
        await wait(250 * (2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items, label, operation, concurrency = STORAGE_TRANSFER_CONCURRENCY) {
  const output = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  let failure = null;

  async function worker() {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        output[index] = await operation(items[index], index);
        completed += 1;
        if (label && (completed % 1_000 === 0 || completed === items.length)) {
          console.log(JSON.stringify({ phase: label, completed, total: items.length }));
        }
      } catch (error) {
        failure ??= error;
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failure) throw failure;
  return output;
}

async function emptyAndDeleteTargetBucket(bucketId) {
  await expectNoError(target.storage.emptyBucket(bucketId), `empty_restore_bucket:${bucketId}`);
  for (let attempt = 1; attempt <= TARGET_BUCKET_DELETE_ATTEMPTS; attempt += 1) {
    const result = await target.storage.deleteBucket(bucketId);
    if (!result.error) return;
    if (!/not empty/i.test(result.error.message)) {
      throw new Error(`delete_restore_bucket:${bucketId}:${result.error.message}`);
    }
    if (attempt < TARGET_BUCKET_DELETE_ATTEMPTS) await wait(TARGET_BUCKET_DELETE_RETRY_MS);
  }
  throw new Error(`delete_restore_bucket:${bucketId}:bucket_did_not_become_empty`);
}

async function sourceInventory() {
  const database = createVerifiedSupabasePostgresClient(
    SOURCE_DB_URL,
    'stackr-storage-recovery-inventory',
  );
  await database.connect();
  try {
    const [buckets, objects] = await Promise.all([
      database.query(`
        select id, name, public, file_size_limit::text, allowed_mime_types, type::text
        from storage.buckets
        order by id
      `),
      database.query(`
        select bucket_id, name, metadata, user_metadata
        from storage.objects
        order by bucket_id, name
      `),
    ]);
    return { buckets: buckets.rows, objects: objects.rows };
  } finally {
    await database.end();
  }
}

async function clearTargetStorage() {
  const buckets = await expectNoError(
    target.storage.listBuckets({ limit: 1000, offset: 0 }),
    'list_restore_buckets',
  );
  for (const bucket of buckets) {
    await emptyAndDeleteTargetBucket(bucket.id);
  }
  const remaining = await expectNoError(
    target.storage.listBuckets({ limit: 1000, offset: 0 }),
    'verify_restore_buckets_cleared',
  );
  return remaining.length === 0;
}

function bucketOptions(bucket) {
  const sourceLimit = bucket.file_size_limit ? Number(bucket.file_size_limit) : null;
  return {
    public: Boolean(bucket.public),
    ...(sourceLimit ? { fileSizeLimit: Math.min(sourceLimit, TARGET_FILE_SIZE_CEILING_BYTES) } : {}),
    ...(bucket.allowed_mime_types ? { allowedMimeTypes: bucket.allowed_mime_types } : {}),
  };
}

function comparableBucketPolicy(bucket) {
  return {
    id: bucket.id,
    name: bucket.name,
    public: Boolean(bucket.public),
    allowedMimeTypes: bucket.allowed_mime_types ?? null,
  };
}

function uploadOptions(object) {
  const metadata = object.metadata ?? {};
  const cacheControl = typeof metadata.cacheControl === 'string'
    ? metadata.cacheControl.replace(/^max-age=/, '')
    : undefined;
  return {
    contentType: metadata.mimetype ?? 'application/octet-stream',
    ...(cacheControl ? { cacheControl } : {}),
    upsert: true,
  };
}

function estimatedPackedRecordBytes(object) {
  const byteSize = Number(object.metadata?.size ?? 0);
  const metadataBytes = Buffer.byteLength(storageRecoveryPackInternals.stableJson({
    bucketId: object.bucket_id,
    name: object.name,
    metadata: object.metadata ?? null,
    userMetadata: object.user_metadata ?? null,
    byteSize,
    sha256: '0'.repeat(64),
  }));
  return 8 + metadataBytes + Math.max(byteSize, 0);
}

function storagePackGroups(objects) {
  const groups = [];
  let current = [];
  let estimatedBytes = storageRecoveryPackInternals.PACK_MAGIC.length;
  for (const object of objects) {
    const recordBytes = estimatedPackedRecordBytes(object);
    if (current.length && estimatedBytes + recordBytes > STORAGE_PACK_MAX_BYTES) {
      groups.push(current);
      current = [];
      estimatedBytes = storageRecoveryPackInternals.PACK_MAGIC.length;
    }
    current.push(object);
    estimatedBytes += recordBytes;
  }
  if (current.length) groups.push(current);
  return groups;
}

async function downloadSourceObject(object) {
  const sourceBlob = await retryStorageOperation(
    () => expectNoError(
      source.storage.from(object.bucket_id).download(object.name),
      `download_source_object:${object.bucket_id}:${object.name}`,
    ),
  );
  const bytes = Buffer.from(await sourceBlob.arrayBuffer());
  const expectedMimeType = object.metadata?.mimetype ?? 'application/octet-stream';
  return {
    ...object,
    bytes,
    byteSize: bytes.length,
    sha256: digest(bytes),
    sourceMimeTypeMismatch: sourceBlob.type !== expectedMimeType,
  };
}

async function processStoragePack(records, packIndex, restoreSampleKeys) {
  const packName = `packs/${String(packIndex).padStart(6, '0')}.stackrpack`;
  const packPath = path.join(backupDir, `${String(packIndex).padStart(6, '0')}.stackrpack`);
  const packBytes = encodeStoragePack(records);
  if (packBytes.length > TARGET_FILE_SIZE_CEILING_BYTES) {
    throw new Error(`storage_pack_exceeds_restore_limit:${packName}:${packBytes.length}`);
  }
  await writeFile(packPath, packBytes);
  try {
    const backupBytes = await readFile(packPath);
    const packSha256 = digest(backupBytes);
    await retryStorageOperation(
      () => expectNoError(
        target.storage.from(RECOVERY_PACK_BUCKET).upload(packName, backupBytes, {
          contentType: 'application/vnd.stackr.storage-pack',
          cacheControl: '0',
          upsert: true,
        }),
        `upload_storage_pack:${packName}`,
      ),
    );
    const restoredBlob = await retryStorageOperation(
      () => expectNoError(
        target.storage.from(RECOVERY_PACK_BUCKET).download(packName),
        `download_storage_pack:${packName}`,
      ),
    );
    const restoredPackBytes = Buffer.from(await restoredBlob.arrayBuffer());
    const restoredRecords = decodeStoragePack(restoredPackBytes);
    const restoredByIdentity = new Map(restoredRecords.map((record) => [
      storageRecoveryPackInternals.objectIdentity(record),
      record,
    ]));
    let recordMismatchCount = 0;
    for (const record of records) {
      const restored = restoredByIdentity.get(storageRecoveryPackInternals.objectIdentity(record));
      if (!restored || restored.sha256 !== record.sha256 || restored.byteSize !== record.byteSize) {
        recordMismatchCount += 1;
      }
    }
    const selectedRecords = restoredRecords.filter((record) => (
      restoreSampleKeys.has(storageRecoveryPackInternals.objectIdentity(record))
    ));
    const sampleResults = await mapWithConcurrency(
      selectedRecords,
      null,
      async (record) => {
        await retryStorageOperation(
          () => expectNoError(
            target.storage.from(record.bucket_id).upload(
              record.name,
              record.bytes,
              uploadOptions(record),
            ),
            `upload_sample_object:${record.bucket_id}:${record.name}`,
          ),
        );
        const restoredObjectBlob = await retryStorageOperation(
          () => expectNoError(
            target.storage.from(record.bucket_id).download(record.name),
            `download_sample_object:${record.bucket_id}:${record.name}`,
          ),
        );
        const restoredObjectBytes = Buffer.from(await restoredObjectBlob.arrayBuffer());
        const expectedMimeType = record.metadata?.mimetype ?? 'application/octet-stream';
        return {
          ...record,
          bytes: undefined,
          checksumMismatch: digest(restoredObjectBytes) !== record.sha256,
          mimeTypeMismatch: restoredObjectBlob.type !== expectedMimeType,
        };
      },
      8,
    );
    return {
      packIndex,
      packName,
      objectCount: records.length,
      byteSize: packBytes.length,
      sha256: packSha256,
      checksumMismatch: digest(restoredPackBytes) !== packSha256,
      recordMismatchCount,
      objects: records.map(({ bytes, ...record }) => record),
      sampleResults,
    };
  } finally {
    rmSync(packPath, { force: true });
  }
}

mkdirSync(backupDir, { recursive: true });
let targetCleanupVerified = false;
try {
  const inventory = await sourceInventory();
  const bucketById = new Map(inventory.buckets.map((bucket) => [bucket.id, bucket]));
  for (const object of inventory.objects) {
    if (!bucketById.has(object.bucket_id)) throw new Error(`storage_object_bucket_missing:${object.bucket_id}`);
  }

  if (!await clearTargetStorage()) throw new Error('restore_storage_cleanup_failed');
  for (const bucket of inventory.buckets) {
    await expectNoError(
      target.storage.createBucket(bucket.id, bucketOptions(bucket)),
      `create_restore_bucket:${bucket.id}`,
    );
  }
  await expectNoError(
    target.storage.createBucket(RECOVERY_PACK_BUCKET, {
      public: false,
      fileSizeLimit: TARGET_FILE_SIZE_CEILING_BYTES,
      allowedMimeTypes: ['application/vnd.stackr.storage-pack'],
    }),
    `create_restore_bucket:${RECOVERY_PACK_BUCKET}`,
  );

  const groups = storagePackGroups(inventory.objects);
  const restoreSample = selectRestoreSample(
    inventory.objects,
    inventory.buckets,
    Math.min(STORAGE_RESTORE_SAMPLE_SIZE, inventory.objects.length),
  );
  const restoreSampleKeys = new Set(restoreSample.map(storageRecoveryPackInternals.objectIdentity));
  const packResults = new Array(groups.length);
  const pendingTransfers = [];
  let downloadedObjectCount = 0;
  for (let packIndex = 0; packIndex < groups.length; packIndex += 1) {
    const records = await mapWithConcurrency(groups[packIndex], null, downloadSourceObject);
    downloadedObjectCount += records.length;
    if (downloadedObjectCount % 5_000 < records.length || downloadedObjectCount === inventory.objects.length) {
      console.log(JSON.stringify({
        phase: 'download_source_storage_objects',
        completed: downloadedObjectCount,
        total: inventory.objects.length,
      }));
    }
    pendingTransfers.push(processStoragePack(records, packIndex, restoreSampleKeys)
      .then((result) => {
        packResults[packIndex] = result;
        const completedPacks = packResults.filter(Boolean).length;
        if (completedPacks % 25 === 0 || completedPacks === groups.length) {
          console.log(JSON.stringify({
            phase: 'upload_download_verify_storage_packs',
            completed: completedPacks,
            total: groups.length,
          }));
        }
      }));
    if (pendingTransfers.length >= STORAGE_PACK_TRANSFER_CONCURRENCY) {
      await Promise.all(pendingTransfers.splice(0, pendingTransfers.length));
    }
  }
  await Promise.all(pendingTransfers);

  const backedUpObjects = packResults.flatMap((result) => result.objects);
  const restoredSampleObjects = packResults.flatMap((result) => result.sampleResults);
  if (backedUpObjects.length !== inventory.objects.length) throw new Error('packed_storage_inventory_count_mismatch');
  if (restoredSampleObjects.length !== restoreSample.length) throw new Error('restored_storage_sample_count_mismatch');

  const allRestoredBuckets = await expectNoError(
    target.storage.listBuckets({ limit: 1000, offset: 0 }),
    'list_restored_buckets',
  );
  const restoredBuckets = allRestoredBuckets.filter((bucket) => bucket.id !== RECOVERY_PACK_BUCKET);
  const sourceBucketSummary = inventory.buckets.map(comparableBucketPolicy);
  const restoredBucketSummary = restoredBuckets.map(comparableBucketPolicy).sort((a, b) => a.id.localeCompare(b.id));
  const bucketPolicyMatches = JSON.stringify(sourceBucketSummary) === JSON.stringify(restoredBucketSummary);
  const restoredBucketById = new Map(restoredBuckets.map((bucket) => [bucket.id, bucket]));
  let bucketLimitDowngradeCount = 0;
  let fileSizeLimitCompatible = true;
  for (const bucket of inventory.buckets) {
    const sourceLimit = bucket.file_size_limit == null ? null : Number(bucket.file_size_limit);
    const restoredLimitRaw = restoredBucketById.get(bucket.id)?.file_size_limit;
    const restoredLimit = restoredLimitRaw == null ? null : Number(restoredLimitRaw);
    const largestObject = backedUpObjects
      .filter((object) => object.bucket_id === bucket.id)
      .reduce((largest, object) => Math.max(largest, object.byteSize), 0);
    if (sourceLimit != null && restoredLimit != null && restoredLimit < sourceLimit) bucketLimitDowngradeCount += 1;
    if (restoredLimit != null && restoredLimit < largestObject) fileSizeLimitCompatible = false;
  }

  const checksumMismatchCount = restoredSampleObjects
    .filter((result) => result.checksumMismatch).length;
  const mimeTypeMismatchCount = restoredSampleObjects
    .filter((result) => result.mimeTypeMismatch).length;
  const sourceMimeTypeMismatchCount = backedUpObjects
    .filter((result) => result.sourceMimeTypeMismatch).length;
  const packChecksumMismatchCount = packResults
    .filter((result) => result.checksumMismatch).length;
  const packRecordMismatchCount = packResults
    .reduce((total, result) => total + result.recordMismatchCount, 0);

  const publicObjectCount = backedUpObjects.filter((object) => bucketById.get(object.bucket_id).public).length;
  const privateObjectCount = backedUpObjects.length - publicObjectCount;
  const bucketAccessChecks = [];
  for (const bucket of inventory.buckets) {
    const sample = restoredSampleObjects.find((object) => object.bucket_id === bucket.id);
    if (!sample) continue;
    const publicUrl = target.storage.from(bucket.id).getPublicUrl(sample.name).data.publicUrl;
    const anonymousResponse = await retryStorageOperation(async () => {
      const response = await fetch(publicUrl, { redirect: 'manual' });
      if (response.status >= 500) throw new Error(`anonymous_storage_check_failed:${bucket.id}`);
      return response;
    });
    bucketAccessChecks.push({
      bucketId: bucket.id,
      expectedPublic: Boolean(bucket.public),
      anonymousStatus: anonymousResponse.status,
      passed: bucket.public ? anonymousResponse.ok : !anonymousResponse.ok,
    });
  }
  const publicBucketAccessExpectedCount = bucketAccessChecks
    .filter((check) => check.expectedPublic).length;
  const publicBucketReadVerifiedCount = bucketAccessChecks
    .filter((check) => check.expectedPublic && check.passed).length;
  const privateBucketAccessExpectedCount = bucketAccessChecks
    .filter((check) => !check.expectedPublic).length;
  const privateBucketReadDeniedCount = bucketAccessChecks
    .filter((check) => !check.expectedPublic && check.passed).length;
  targetCleanupVerified = await clearTargetStorage();
  const evidence = {
    schemaVersion: 'stackr-storage-restore-evidence-v2.2.0',
    verifiedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    restoreProjectRef: TARGET_PROJECT_REF,
    restoreMode: 'full_packed_backup_with_stratified_object_rehydration',
    sourceBucketCount: inventory.buckets.length,
    sourceInventoryObjectCount: inventory.objects.length,
    backedUpObjectCount: backedUpObjects.length,
    restoredBucketCount: restoredBuckets.length,
    restoredObjectCount: restoredSampleObjects.length,
    restoredSampleObjectCount: restoredSampleObjects.length,
    restoredSampleCoveragePercent: Number((restoredSampleObjects.length / backedUpObjects.length * 100).toFixed(4)),
    restoredSampleStrategy: 'all_private_plus_bucket_edges_size_extremes_mime_representatives_and_deterministic_hash_rank',
    publicObjectCount,
    privateObjectCount,
    accessCheckScope: 'one_restored_object_per_non_empty_bucket',
    bucketAccessChecks,
    publicBucketAccessExpectedCount,
    publicBucketReadVerifiedCount,
    privateBucketAccessExpectedCount,
    privateBucketReadDeniedCount,
    bucketPolicyMatches,
    fileSizeLimitCompatible,
    bucketLimitDowngradeCount,
    restoreTargetFileSizeCeilingBytes: TARGET_FILE_SIZE_CEILING_BYTES,
    storageTransferConcurrency: STORAGE_TRANSFER_CONCURRENCY,
    storagePackTransferConcurrency: STORAGE_PACK_TRANSFER_CONCURRENCY,
    storagePackMaxBytes: STORAGE_PACK_MAX_BYTES,
    storageRetryAttempts: STORAGE_RETRY_ATTEMPTS,
    backupPackCount: packResults.length,
    backupPackByteSize: packResults.reduce((total, result) => total + result.byteSize, 0),
    sourceObjectByteSize: backedUpObjects.reduce((total, object) => total + object.byteSize, 0),
    packChecksumMismatchCount,
    packRecordMismatchCount,
    sourceMimeTypeMismatchCount,
    checksumMismatchCount,
    mimeTypeMismatchCount,
    targetCleanupVerified,
    fullInventoryMetadataSha256: inventoryManifestSha256(inventory.objects),
    backupPackManifestSha256: digest(Buffer.from(JSON.stringify(packResults.map((result) => ({
      packName: result.packName,
      objectCount: result.objectCount,
      byteSize: result.byteSize,
      sha256: result.sha256,
    }))))),
    backupManifestSha256: digest(Buffer.from(JSON.stringify(backedUpObjects.map((object) => ({
      bucketId: object.bucket_id,
      name: object.name,
      byteSize: object.byteSize,
      sha256: object.sha256,
    }))))),
    ok: bucketPolicyMatches
      && fileSizeLimitCompatible
      && backedUpObjects.length === inventory.objects.length
      && packChecksumMismatchCount === 0
      && packRecordMismatchCount === 0
      && sourceMimeTypeMismatchCount === 0
      && restoredSampleObjects.length === restoreSample.length
      && checksumMismatchCount === 0
      && mimeTypeMismatchCount === 0
      && publicBucketReadVerifiedCount === publicBucketAccessExpectedCount
      && privateBucketReadDeniedCount === privateBucketAccessExpectedCount
      && targetCleanupVerified,
  };
  writeFileSync(
    path.join(EVIDENCE_DIR, 'storage-restore-evidence.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  if (!targetCleanupVerified) await clearTargetStorage().catch(() => false);
  rmSync(backupDir, { recursive: true, force: true });
}
