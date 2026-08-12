import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf('=');
  if (!argument.startsWith('--') || separator < 3) {
    throw new Error(`invalid_audit_argument:${argument}`);
  }
  return [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const NO_OP_TRANSFER_POLICY =
  'verify_allowlisted_production_catalogue_already_matches_without_mutation';

for (const name of ['storage', 'database', 'output', 'promotion-outcome']) {
  if (!args[name]) throw new Error(`missing_audit_argument:${name}`);
}
if (!['success', 'failure', 'cancelled', 'skipped'].includes(args['promotion-outcome'])) {
  throw new Error('invalid_catalogue_promotion_outcome');
}

function readEvidence(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function requiredBoolean(record, property, context) {
  if (typeof record?.[property] !== 'boolean') {
    throw new Error(`invalid_${context}_boolean:${property}`);
  }
  return record[property];
}

function requiredNonnegativeInteger(record, property, context) {
  const value = record?.[property];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid_${context}_count:${property}`);
  }
  return value;
}

function requiredString(record, property, context) {
  if (typeof record?.[property] !== 'string' || record[property].length === 0) {
    throw new Error(`invalid_${context}_string:${property}`);
  }
  return record[property];
}

function storageAudit(evidence) {
  if (!evidence) return { evidencePresent: false };
  if (evidence.schemaVersion !== 'stackr-production-catalogue-storage-promotion-v1.0.0') {
    throw new Error('invalid_storage_promotion_evidence_version');
  }
  return {
    evidencePresent: true,
    ok: requiredBoolean(evidence, 'ok', 'storage_evidence'),
    sourceObjectCount:
      requiredNonnegativeInteger(evidence, 'sourceObjectCount', 'storage_evidence'),
    targetObjectCountBefore:
      requiredNonnegativeInteger(evidence, 'targetObjectCountBefore', 'storage_evidence'),
    copiedObjectCount:
      requiredNonnegativeInteger(evidence, 'copiedObjectCount', 'storage_evidence'),
    copiedByteSize: requiredNonnegativeInteger(evidence, 'copiedByteSize', 'storage_evidence'),
    copiedContentHashVerifiedCount: requiredNonnegativeInteger(
      evidence,
      'copiedContentHashVerifiedCount',
      'storage_evidence',
    ),
    targetObjectCountAfter:
      requiredNonnegativeInteger(evidence, 'targetObjectCountAfter', 'storage_evidence'),
    verifiedSourceObjectCount:
      requiredNonnegativeInteger(evidence, 'verifiedSourceObjectCount', 'storage_evidence'),
    existingProductionObjectsRetained:
      requiredBoolean(evidence, 'existingProductionObjectsRetained', 'storage_evidence'),
    providerRequestsPerformed:
      requiredBoolean(evidence, 'providerRequestsPerformed', 'storage_evidence'),
  };
}

function databaseAudit(evidence) {
  if (!evidence) return { evidencePresent: false };
  if (evidence.schemaVersion !== 'stackr-production-catalogue-data-promotion-evidence-v1.4.0') {
    throw new Error('invalid_database_promotion_evidence_version');
  }
  if (!Array.isArray(evidence.tables)) throw new Error('invalid_database_evidence_tables');
  const tables = evidence.tables;
  for (const table of tables) {
    for (const property of [
      'targetPreCommitVerified',
      'transferSkippedAsAlreadyCurrent',
      'commitMatched',
      'postCommitObservationMatched',
    ]) requiredBoolean(table, property, 'database_table_evidence');
  }
  const selectedTableCount = requiredNonnegativeInteger(
    evidence,
    'selectedTableCount',
    'database_evidence',
  );
  if (tables.length !== selectedTableCount) {
    throw new Error('database_evidence_table_count_mismatch');
  }
  const transferPolicy = requiredString(evidence, 'transferPolicy', 'database_evidence');
  if (transferPolicy !== NO_OP_TRANSFER_POLICY) {
    throw new Error('invalid_database_evidence_transfer_policy');
  }
  return {
    evidencePresent: true,
    targetAlreadyMatched:
      requiredBoolean(evidence, 'targetAlreadyMatched', 'database_evidence'),
    productionMutationPerformed:
      requiredBoolean(evidence, 'productionMutationPerformed', 'database_evidence'),
    targetTransactionCommitted:
      requiredBoolean(evidence, 'targetTransactionCommitted', 'database_evidence'),
    targetCommitVerified:
      requiredBoolean(evidence, 'targetCommitVerified', 'database_evidence'),
    transferPolicy,
    selectedTableCount,
    sourceRowCount:
      requiredNonnegativeInteger(evidence, 'sourceRowCount', 'database_evidence'),
    matchedSourceRowCount:
      requiredNonnegativeInteger(evidence, 'matchedSourceRowCount', 'database_evidence'),
    productionAssetUrlRewriteCount: requiredNonnegativeInteger(
      evidence.catalogueRelease,
      'productionAssetUrlRewriteCount',
      'database_release_evidence',
    ),
    productionAssetTimestampReuseCount: requiredNonnegativeInteger(
      evidence.catalogueRelease,
      'productionAssetTimestampReuseCount',
      'database_release_evidence',
    ),
    verifiedTableCount: tables.filter((table) => table.targetPreCommitVerified === true).length,
    skippedCurrentTableCount:
      tables.filter((table) => table.transferSkippedAsAlreadyCurrent === true).length,
    commitMatchedTableCount: tables.filter((table) => table.commitMatched === true).length,
    postCommitObservationMatchedTableCount:
      tables.filter((table) => table.postCommitObservationMatched === true).length,
  };
}

const storageEvidence = readEvidence(args.storage);
const databaseEvidence = readEvidence(args.database);
if (args['promotion-outcome'] === 'success' && (!storageEvidence || !databaseEvidence)) {
  throw new Error('successful_catalogue_promotion_evidence_missing');
}

const audit = {
  schemaVersion: 'stackr-production-catalogue-promotion-public-audit-v1.0.0',
  capturedAt: new Date().toISOString(),
  sourceCommitHash: process.env.GITHUB_SHA ?? null,
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  promotionStepOutcome: args['promotion-outcome'],
  classification: 'public_non_secret_aggregate_only',
  rawRowsIncluded: false,
  credentialsIncluded: false,
  detailedSchemaMetadataIncluded: false,
  storage: storageAudit(storageEvidence),
  database: databaseAudit(databaseEvidence),
};

if (args['promotion-outcome'] === 'success') {
  const storage = audit.storage;
  const database = audit.database;
  const storageNoOpVerified = storage.evidencePresent
    && storage.ok
    && storage.sourceObjectCount === storage.targetObjectCountBefore
    && storage.sourceObjectCount === storage.targetObjectCountAfter
    && storage.sourceObjectCount === storage.verifiedSourceObjectCount
    && storage.copiedObjectCount === 0
    && storage.copiedByteSize === 0
    && storage.copiedContentHashVerifiedCount === 0
    && storage.existingProductionObjectsRetained
    && !storage.providerRequestsPerformed;
  if (!storageNoOpVerified) throw new Error('successful_storage_no_op_not_verified');

  const databaseNoOpVerified = database.evidencePresent
    && database.targetAlreadyMatched
    && !database.productionMutationPerformed
    && database.targetTransactionCommitted
    && database.targetCommitVerified
    && database.transferPolicy === NO_OP_TRANSFER_POLICY
    && database.selectedTableCount > 0
    && database.sourceRowCount > 0
    && database.sourceRowCount === database.matchedSourceRowCount
    && database.verifiedTableCount === database.selectedTableCount
    && database.skippedCurrentTableCount === database.selectedTableCount
    && database.commitMatchedTableCount === database.selectedTableCount
    && database.postCommitObservationMatchedTableCount === database.selectedTableCount
    && database.productionAssetUrlRewriteCount
      === database.productionAssetTimestampReuseCount;
  if (!databaseNoOpVerified) throw new Error('successful_database_no_op_not_verified');
}

mkdirSync(path.dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  ok: true,
  classification: audit.classification,
  promotionStepOutcome: audit.promotionStepOutcome,
  storageEvidencePresent: audit.storage.evidencePresent,
  databaseEvidencePresent: audit.database.evidencePresent,
})}\n`);
