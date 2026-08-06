import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Client } = pg;
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

async function sourceInventory() {
  const database = new Client({
    connectionString: SOURCE_DB_URL,
    application_name: 'stackr-storage-recovery-inventory',
  });
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
    await expectNoError(target.storage.emptyBucket(bucket.id), `empty_restore_bucket:${bucket.id}`);
    await expectNoError(target.storage.deleteBucket(bucket.id), `delete_restore_bucket:${bucket.id}`);
  }
  const remaining = await expectNoError(
    target.storage.listBuckets({ limit: 1000, offset: 0 }),
    'verify_restore_buckets_cleared',
  );
  return remaining.length === 0;
}

function bucketOptions(bucket) {
  return {
    public: Boolean(bucket.public),
    ...(bucket.file_size_limit ? { fileSizeLimit: Number(bucket.file_size_limit) } : {}),
    ...(bucket.allowed_mime_types ? { allowedMimeTypes: bucket.allowed_mime_types } : {}),
  };
}

function comparableBucket(bucket) {
  return {
    id: bucket.id,
    name: bucket.name,
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit == null ? null : Number(bucket.file_size_limit),
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
    upsert: false,
  };
}

mkdirSync(backupDir, { recursive: true });
let targetCleanupVerified = false;
try {
  const inventory = await sourceInventory();
  const bucketById = new Map(inventory.buckets.map((bucket) => [bucket.id, bucket]));
  for (const object of inventory.objects) {
    if (!bucketById.has(object.bucket_id)) throw new Error(`storage_object_bucket_missing:${object.bucket_id}`);
  }

  const backedUpObjects = [];
  for (const [index, object] of inventory.objects.entries()) {
    const blob = await expectNoError(
      source.storage.from(object.bucket_id).download(object.name),
      `download_source_object:${object.bucket_id}:${object.name}`,
    );
    const bytes = Buffer.from(await blob.arrayBuffer());
    const backupPath = path.join(backupDir, `${String(index).padStart(6, '0')}.bin`);
    writeFileSync(backupPath, bytes);
    backedUpObjects.push({
      ...object,
      backupPath,
      byteSize: bytes.length,
      sha256: digest(bytes),
    });
  }

  if (!await clearTargetStorage()) throw new Error('restore_storage_cleanup_failed');
  for (const bucket of inventory.buckets) {
    await expectNoError(
      target.storage.createBucket(bucket.id, bucketOptions(bucket)),
      `create_restore_bucket:${bucket.id}`,
    );
  }
  for (const object of backedUpObjects) {
    await expectNoError(
      target.storage.from(object.bucket_id).upload(
        object.name,
        readFileSync(object.backupPath),
        uploadOptions(object),
      ),
      `upload_restore_object:${object.bucket_id}:${object.name}`,
    );
  }

  const restoredBuckets = await expectNoError(
    target.storage.listBuckets({ limit: 1000, offset: 0 }),
    'list_restored_buckets',
  );
  const sourceBucketSummary = inventory.buckets.map(comparableBucket);
  const restoredBucketSummary = restoredBuckets.map(comparableBucket).sort((a, b) => a.id.localeCompare(b.id));
  const bucketConfigurationMatches = JSON.stringify(sourceBucketSummary) === JSON.stringify(restoredBucketSummary);

  let checksumMismatchCount = 0;
  let mimeTypeMismatchCount = 0;
  let publicReadVerifiedCount = 0;
  let privateReadDeniedCount = 0;
  for (const object of backedUpObjects) {
    const restoredBlob = await expectNoError(
      target.storage.from(object.bucket_id).download(object.name),
      `download_restored_object:${object.bucket_id}:${object.name}`,
    );
    const restoredBytes = Buffer.from(await restoredBlob.arrayBuffer());
    if (digest(restoredBytes) !== object.sha256) checksumMismatchCount += 1;
    const expectedMimeType = object.metadata?.mimetype ?? 'application/octet-stream';
    if (restoredBlob.type !== expectedMimeType) mimeTypeMismatchCount += 1;

    const publicUrl = target.storage.from(object.bucket_id).getPublicUrl(object.name).data.publicUrl;
    const anonymousResponse = await fetch(publicUrl, { redirect: 'manual' });
    if (bucketById.get(object.bucket_id).public) {
      if (anonymousResponse.ok) publicReadVerifiedCount += 1;
    } else if (!anonymousResponse.ok) {
      privateReadDeniedCount += 1;
    }
  }

  const publicObjectCount = backedUpObjects.filter((object) => bucketById.get(object.bucket_id).public).length;
  const privateObjectCount = backedUpObjects.length - publicObjectCount;
  targetCleanupVerified = await clearTargetStorage();
  const evidence = {
    schemaVersion: 'stackr-storage-restore-evidence-v2.0.0',
    verifiedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    restoreProjectRef: TARGET_PROJECT_REF,
    sourceBucketCount: inventory.buckets.length,
    backedUpObjectCount: backedUpObjects.length,
    restoredBucketCount: restoredBuckets.length,
    restoredObjectCount: backedUpObjects.length,
    publicObjectCount,
    privateObjectCount,
    publicReadVerifiedCount,
    privateReadDeniedCount,
    bucketConfigurationMatches,
    checksumMismatchCount,
    mimeTypeMismatchCount,
    targetCleanupVerified,
    backupManifestSha256: digest(Buffer.from(JSON.stringify(backedUpObjects.map((object) => ({
      bucketId: object.bucket_id,
      name: object.name,
      byteSize: object.byteSize,
      sha256: object.sha256,
    }))))),
    ok: bucketConfigurationMatches
      && checksumMismatchCount === 0
      && mimeTypeMismatchCount === 0
      && publicReadVerifiedCount === publicObjectCount
      && privateReadDeniedCount === privateObjectCount
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
