import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  comparableObject,
  objectIdentity,
  storageObjectPathHash,
  verifyRetainedProductionObjects,
} from './catalogue-storage-verification.mjs';

const { Client } = pg;
const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const SOURCE_SECRET = process.env.SUPABASE_STAGING_SECRET_KEY;
const TARGET_SECRET = process.env.SUPABASE_PRODUCTION_SECRET_KEY;
const EVIDENCE_PATH = process.env.STACKR_STORAGE_PROMOTION_EVIDENCE_PATH;
const CONFIRMATION = process.env.STACKR_TRANSFER_CONFIRMATION;
const BUCKET = 'stackr-catalogue-public';
const CONCURRENCY = Number(process.env.STACKR_STORAGE_PROMOTION_CONCURRENCY ?? 32);
const RETRY_ATTEMPTS = Number(process.env.STACKR_STORAGE_PROMOTION_RETRY_ATTEMPTS ?? 4);
const PROMOTION_MODE = process.env.STACKR_STORAGE_PROMOTION_MODE ?? 'copy';
const COMPENSATION_SIGNAL = process.env.STACKR_STORAGE_PROMOTION_COMPENSATE_FAILURE;
const COMPENSATION_FAILURE_SIGNAL = 'PRE_DATABASE_COMMIT_FAILURE';

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
if (!['copy', 'compensate'].includes(PROMOTION_MODE)) {
  throw new Error('invalid_storage_promotion_mode');
}
if (PROMOTION_MODE === 'compensate' && COMPENSATION_SIGNAL !== COMPENSATION_FAILURE_SIGNAL) {
  throw new Error('production_storage_compensation_failure_signal_missing');
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) await wait(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function expectData(operation, context) {
  const result = await operation;
  if (result.error) throw new Error(`${context}:${result.error.message}`);
  return result.data;
}

async function storageInventory(connectionString, applicationName) {
  const database = new Client({ connectionString, application_name: applicationName });
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
    // A promotion must never replace a production object that appeared after
    // the inventory was captured. A duplicate is therefore a safe failure.
    upsert: false,
  };
}

function writeEvidence(evidence) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

async function catalogueStorageReferenceCounts(connectionString, applicationName) {
  const database = new Client({ connectionString, application_name: applicationName });
  await database.connect();
  try {
    const result = await database.query(`
      select storage_key, count(*)::integer as reference_count
      from catalog.assets
      where storage_provider = 'supabase_storage'
        and storage_bucket = $1
        and storage_key is not null
      group by storage_key
    `, [BUCKET]);
    return new Map(result.rows.map((row) => [row.storage_key, Number(row.reference_count)]));
  } finally {
    await database.end();
  }
}

async function catalogueStorageReferenceCount(connectionString, applicationName, storageKey) {
  const database = new Client({ connectionString, application_name: applicationName });
  await database.connect();
  try {
    const result = await database.query(`
      select count(*)::integer as reference_count
      from catalog.assets
      where storage_provider = 'supabase_storage'
        and storage_bucket = $1
        and storage_key = $2
    `, [BUCKET, storageKey]);
    return Number(result.rows[0].reference_count);
  } finally {
    await database.end();
  }
}

async function sha256OfTargetObject(name) {
  const blob = await retry(() => expectData(
    targetStorage.storage.from(BUCKET).download(name),
    `download_production_object_for_compensation:${name}`,
  ));
  return createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
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

async function compensateCopiedObjects() {
  if (!existsSync(EVIDENCE_PATH)) throw new Error('production_storage_compensation_journal_missing');
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
  if (evidence.schemaVersion !== 'stackr-production-catalogue-storage-promotion-v1.1.0') {
    throw new Error('production_storage_compensation_journal_schema_invalid');
  }
  if (evidence.promotionMode !== 'copy'
    || evidence.sourceProjectRef !== SOURCE_PROJECT_REF
    || evidence.targetProjectRef !== TARGET_PROJECT_REF
    || evidence.bucket !== BUCKET
    || !Array.isArray(evidence.copiedObjects)) {
    throw new Error('production_storage_compensation_journal_identity_invalid');
  }

  const targetInventory = await storageInventory(
    TARGET_DB_URL,
    'stackr-production-storage-target-compensation',
  );
  const targetByName = new Map(targetInventory.objects.map((object) => [object.name, object]));
  const compensation = {
    requestedAt: new Date().toISOString(),
    failureSignal: COMPENSATION_SIGNAL,
    candidateCount: evidence.copiedObjects.length,
    deletedObjects: [],
    retainedObjects: [],
  };
  const seenNames = new Set();

  for (const copied of evidence.copiedObjects) {
    const invalidJournalEntry = !copied?.createdByThisRun
      || typeof copied.name !== 'string'
      || typeof copied.sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(copied.sha256)
      || storageObjectPathHash(copied.name) !== copied.sha256
      || !Number.isInteger(copied.preCopyDatabaseReferenceCount)
      || copied.preCopyDatabaseReferenceCount !== 0
      || seenNames.has(copied.name);
    if (invalidJournalEntry) {
      compensation.retainedObjects.push({ name: copied?.name ?? null, reason: 'journal_entry_not_safe_to_compensate' });
      continue;
    }
    seenNames.add(copied.name);
    const currentReferenceCount = await catalogueStorageReferenceCount(
      TARGET_DB_URL,
      'stackr-production-storage-target-compensation-reference',
      copied.name,
    );
    if (currentReferenceCount !== 0) {
      compensation.retainedObjects.push({ name: copied.name, reason: 'currently_referenced_by_catalogue' });
      continue;
    }
    if (!targetByName.has(copied.name)) {
      compensation.retainedObjects.push({ name: copied.name, reason: 'object_already_absent' });
      continue;
    }
    const currentHash = await sha256OfTargetObject(copied.name);
    if (currentHash !== copied.sha256) {
      compensation.retainedObjects.push({ name: copied.name, reason: 'object_hash_no_longer_matches_journal' });
      continue;
    }
    await retry(() => expectData(
      targetStorage.storage.from(BUCKET).remove([copied.name]),
      `remove_compensated_production_object:${copied.name}`,
    ));
    compensation.deletedObjects.push({ name: copied.name, sha256: copied.sha256 });
  }

  evidence.compensation = compensation;
  evidence.status = 'compensation_complete';
  evidence.verifiedAt = new Date().toISOString();
  evidence.ok = compensation.retainedObjects.length === 0;
  writeEvidence(evidence);
  process.stdout.write(`${JSON.stringify({
    mode: PROMOTION_MODE,
    deletedObjectCount: compensation.deletedObjects.length,
    retainedObjectCount: compensation.retainedObjects.length,
    ok: evidence.ok,
  })}\n`);
}

async function copyCatalogueObjects() {
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

  const referenceCountsBefore = await catalogueStorageReferenceCounts(
    TARGET_DB_URL,
    'stackr-production-storage-target-before-references',
  );
  const evidence = {
    schemaVersion: 'stackr-production-catalogue-storage-promotion-v1.1.0',
    promotionMode: 'copy',
    status: 'copying',
    startedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: TARGET_PROJECT_REF,
    bucket: BUCKET,
    sourceObjectCount: sourceInventory.objects.length,
    sourceByteSize: sourceInventory.objects.reduce(
      (total, object) => total + Number(object.metadata?.size ?? 0),
      0,
    ),
    targetObjectCountBefore: targetInventoryBefore.objects.length,
    sourceInventorySha256: inventorySha256(sourceInventory.objects),
    copiedObjects: [],
    existingProductionObjectsRetained: true,
    providerRequestsPerformed: false,
    ok: false,
  };
  writeEvidence(evidence);

  try {
    await mapWithConcurrency(missing, async (object) => {
      const blob = await retry(() => expectData(
        sourceStorage.storage.from(BUCKET).download(object.name),
        `download_source_object:${object.name}`,
      ));
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (bytes.length !== Number(object.metadata?.size ?? bytes.length)) {
        throw new Error(`source_storage_size_mismatch:${object.name}`);
      }
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      if (storageObjectPathHash(object.name) !== contentHash) {
        throw new Error(`source_storage_content_hash_mismatch:${object.name}`);
      }
      await retry(() => expectData(
        targetStorage.storage.from(BUCKET).upload(object.name, bytes, uploadOptions(object)),
        `upload_production_object:${object.name}`,
      ));
      evidence.copiedObjects.push({
        name: object.name,
        bytes: bytes.length,
        sha256: contentHash,
        preCopyDatabaseReferenceCount: referenceCountsBefore.get(object.name) ?? 0,
        createdByThisRun: true,
        copiedAt: new Date().toISOString(),
      });
      writeEvidence(evidence);
      return object.name;
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

    // Existing production objects never pass merely because their metadata
    // resembles staging.  Download every retained object and prove its byte
    // length and digest against the content-addressed key and source inventory.
    const missingNames = new Set(missing.map((object) => object.name));
    const retainedVerification = await verifyRetainedProductionObjects({
      sourceObjects: sourceInventory.objects.filter((object) => !missingNames.has(object.name)),
      targetByName: targetAfterByName,
      downloadTargetObject: (name) => retry(() => expectData(
        targetStorage.storage.from(BUCKET).download(name),
        `download_retained_production_object:${name}`,
      )),
      concurrency: CONCURRENCY,
    });

    evidence.status = 'copy_complete';
    evidence.verifiedAt = new Date().toISOString();
    evidence.copiedObjectCount = evidence.copiedObjects.length;
    evidence.copiedByteSize = evidence.copiedObjects.reduce((total, object) => total + object.bytes, 0);
    evidence.copiedContentHashVerifiedCount = evidence.copiedObjects.length;
    evidence.targetObjectCountAfter = targetInventoryAfter.objects.length;
    evidence.inventoryMatchedSourceObjectCount = sourceInventory.objects.length - missingAfter.length;
    evidence.existingProductionObjectsContentHashVerified = true;
    evidence.retainedProductionObjectCount = retainedVerification.retainedObjectCount;
    evidence.retainedProductionByteSize = retainedVerification.retainedByteSize;
    evidence.retainedProductionContentHashVerifiedCount = retainedVerification.retainedContentHashVerifiedCount;
    if (evidence.retainedProductionContentHashVerifiedCount !== evidence.retainedProductionObjectCount) {
      throw new Error('retained_production_object_verification_count_mismatch');
    }
    evidence.ok = true;
    writeEvidence(evidence);
    process.stdout.write(`${JSON.stringify({
      mode: PROMOTION_MODE,
      copiedObjectCount: evidence.copiedObjectCount,
      inventoryMatchedSourceObjectCount: evidence.inventoryMatchedSourceObjectCount,
      ok: evidence.ok,
    })}\n`);
  } catch (error) {
    evidence.status = 'copy_failed';
    evidence.failedAt = new Date().toISOString();
    evidence.failure = error instanceof Error ? error.message : String(error);
    writeEvidence(evidence);
    throw error;
  }
}

if (PROMOTION_MODE === 'compensate') {
  await compensateCopiedObjects();
} else {
  await copyCatalogueObjects();
}
