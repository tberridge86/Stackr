import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_SECRET = process.env.SUPABASE_STAGING_SECRET_KEY;
const TARGET_SECRET = process.env.SUPABASE_RESTORE_SECRET_KEY;
const EVIDENCE_DIR = process.env.STACKR_RECOVERY_EVIDENCE_DIR ?? process.cwd();
const SOURCE_URL = `https://${SOURCE_PROJECT_REF}.supabase.co`;
const TARGET_URL = `https://${TARGET_PROJECT_REF}.supabase.co`;

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_REF: SOURCE_PROJECT_REF,
  SUPABASE_RESTORE_PROJECT_REF: TARGET_PROJECT_REF,
  SUPABASE_STAGING_SECRET_KEY: SOURCE_SECRET,
  SUPABASE_RESTORE_SECRET_KEY: TARGET_SECRET,
})) {
  if (!value) throw new Error(`missing_required_environment_variable:${name}`);
}
if (SOURCE_PROJECT_REF === TARGET_PROJECT_REF) throw new Error('source_and_restore_project_refs_match');

const source = createClient(SOURCE_URL, SOURCE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const target = createClient(TARGET_URL, TARGET_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = randomUUID();
const bucketId = `stackr-recovery-${runId}`;
const objectPath = 'private/checksum-fixture.bin';
const objectBytes = Buffer.from(`stackr-storage-recovery-drill:${runId}\n`, 'utf8');
const objectSha256 = createHash('sha256').update(objectBytes).digest('hex');
const backupDir = path.join(EVIDENCE_DIR, 'storage-backup');
const backupObjectPath = path.join(backupDir, 'checksum-fixture.bin');
let sourceCreated = false;
let targetCreated = false;
let anonymousReadDenied = false;
let restoredSha256 = null;
let sourceCleanupVerified = false;
let targetCleanupVerified = false;

async function expectNoError(operation, context) {
  const result = await operation;
  if (result.error) throw new Error(`${context}:${result.error.message}`);
  return result.data;
}

async function cleanupBucket(client, bucket, created) {
  if (!created) return true;
  const removeResult = await client.storage.from(bucket).remove([objectPath]);
  if (removeResult.error) return false;
  const deleteResult = await client.storage.deleteBucket(bucket);
  return !deleteResult.error;
}

mkdirSync(backupDir, { recursive: true });
try {
  const initialSourceBuckets = await expectNoError(source.storage.listBuckets(), 'list_source_buckets');
  if (initialSourceBuckets.length !== 0) {
    throw new Error(`staging_storage_no_longer_empty:${initialSourceBuckets.length}`);
  }

  await expectNoError(source.storage.createBucket(bucketId, {
    public: false,
    fileSizeLimit: 1024,
    allowedMimeTypes: ['application/octet-stream'],
  }), 'create_source_fixture_bucket');
  sourceCreated = true;
  await expectNoError(source.storage.from(bucketId).upload(objectPath, objectBytes, {
    contentType: 'application/octet-stream',
    upsert: false,
  }), 'upload_source_fixture');

  const sourceDownload = await expectNoError(
    source.storage.from(bucketId).download(objectPath),
    'download_source_fixture',
  );
  const backedUpBytes = Buffer.from(await sourceDownload.arrayBuffer());
  if (createHash('sha256').update(backedUpBytes).digest('hex') !== objectSha256) {
    throw new Error('source_backup_checksum_mismatch');
  }
  writeFileSync(backupObjectPath, backedUpBytes);

  await expectNoError(target.storage.createBucket(bucketId, {
    public: false,
    fileSizeLimit: 1024,
    allowedMimeTypes: ['application/octet-stream'],
  }), 'create_restore_fixture_bucket');
  targetCreated = true;
  await expectNoError(target.storage.from(bucketId).upload(objectPath, backedUpBytes, {
    contentType: 'application/octet-stream',
    upsert: false,
  }), 'upload_restore_fixture');

  const targetDownload = await expectNoError(
    target.storage.from(bucketId).download(objectPath),
    'download_restore_fixture',
  );
  restoredSha256 = createHash('sha256')
    .update(Buffer.from(await targetDownload.arrayBuffer()))
    .digest('hex');

  const publicUrl = target.storage.from(bucketId).getPublicUrl(objectPath).data.publicUrl;
  const anonymousResponse = await fetch(publicUrl, { redirect: 'manual' });
  anonymousReadDenied = !anonymousResponse.ok;
  [sourceCleanupVerified, targetCleanupVerified] = await Promise.all([
    cleanupBucket(source, bucketId, sourceCreated),
    cleanupBucket(target, bucketId, targetCreated),
  ]);
  sourceCreated = !sourceCleanupVerified;
  targetCreated = !targetCleanupVerified;
  const evidence = {
    schemaVersion: 'stackr-storage-restore-evidence-v1.0.0',
    verifiedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    restoreProjectRef: TARGET_PROJECT_REF,
    sourceInitialBucketCount: initialSourceBuckets.length,
    fixtureBucketPublic: false,
    backedUpObjectCount: 1,
    restoredObjectCount: 1,
    sourceObjectSha256: objectSha256,
    restoredObjectSha256: restoredSha256,
    checksumMismatchCount: restoredSha256 === objectSha256 ? 0 : 1,
    anonymousReadDenied,
    sourceCleanupVerified,
    targetCleanupVerified,
    ok: restoredSha256 === objectSha256
      && anonymousReadDenied
      && sourceCleanupVerified
      && targetCleanupVerified,
  };
  const manifest = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(path.join(EVIDENCE_DIR, 'storage-restore-evidence.json'), manifest);
  console.log(JSON.stringify({
    ...evidence,
    backupManifestSha256: createHash('sha256').update(manifest).digest('hex'),
  }, null, 2));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  await Promise.allSettled([
    cleanupBucket(source, bucketId, sourceCreated),
    cleanupBucket(target, bucketId, targetCreated),
  ]);
  rmSync(backupDir, { recursive: true, force: true });
}
