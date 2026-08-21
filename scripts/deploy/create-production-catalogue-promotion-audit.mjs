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
const MUTATION_TRANSFER_POLICY =
  'upsert_allowlisted_production_catalogue_rows_preserve_target_only_rows_source_and_asset_storage_identity_project_exact_storage_aliases_and_private_provenance_references';

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
  if (evidence.schemaVersion !== 'stackr-production-catalogue-data-promotion-evidence-v1.7.0') {
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
    const sourceRowCount = requiredNonnegativeInteger(
      table,
      'sourceRowCount',
      'database_table_evidence',
    );
    const retainedRowCount = requiredNonnegativeInteger(
      table,
      'productionTargetOnlyRowCountPreserved',
      'database_table_evidence',
    );
    const observedRowCount = requiredNonnegativeInteger(
      table,
      'targetRowCountDuringRehearsal',
      'database_table_evidence',
    );
    if (observedRowCount !== sourceRowCount + retainedRowCount) {
      throw new Error('database_table_evidence_preserved_row_count_mismatch');
    }
  }
  const selectedTableCount = requiredNonnegativeInteger(
    evidence,
    'selectedTableCount',
    'database_evidence',
  );
  if (tables.length !== selectedTableCount) {
    throw new Error('database_evidence_table_count_mismatch');
  }
  if (evidence.assetIdentityPreservation?.table !== 'catalog.assets'
    || evidence.assetIdentityPreservation?.naturalKey !== 'asset_id') {
    throw new Error('invalid_database_asset_identity_evidence');
  }
  const assetIdentity = {
    sourceCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'sourceCount',
      'database_asset_identity_evidence',
    ),
    canonicalSourceCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'canonicalSourceCount',
      'database_asset_identity_evidence',
    ),
    sourceStorageAliasCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'sourceStorageAliasCount',
      'database_asset_identity_evidence',
    ),
    sourceStableAssetIdCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'sourceStableAssetIdCount',
      'database_asset_identity_evidence',
    ),
    preservedProductionAssetIdCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'preservedProductionAssetIdCount',
      'database_asset_identity_evidence',
    ),
    remappedAssetIdCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'remappedAssetIdCount',
      'database_asset_identity_evidence',
    ),
    storageObjectMatchedAssetCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'storageObjectMatchedAssetCount',
      'database_asset_identity_evidence',
    ),
    preservedProductionStableAssetIdCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'preservedProductionStableAssetIdCount',
      'database_asset_identity_evidence',
    ),
    insertedAssetCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'insertedAssetCount',
      'database_asset_identity_evidence',
    ),
    preservedTargetOnlyAssetCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'preservedTargetOnlyAssetCount',
      'database_asset_identity_evidence',
    ),
    remappedForeignKeyRowCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'remappedForeignKeyRowCount',
      'database_asset_identity_evidence',
    ),
    projectedStorageAliasForeignKeyRowCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'projectedStorageAliasForeignKeyRowCount',
      'database_asset_identity_evidence',
    ),
    projectedStorageAliasForeignKeyValueCount: requiredNonnegativeInteger(
      evidence.assetIdentityPreservation,
      'projectedStorageAliasForeignKeyValueCount',
      'database_asset_identity_evidence',
    ),
  };
  if (assetIdentity.sourceStableAssetIdCount > assetIdentity.sourceCount
    || assetIdentity.canonicalSourceCount + assetIdentity.sourceStorageAliasCount
      !== assetIdentity.sourceCount
    || assetIdentity.preservedProductionAssetIdCount + assetIdentity.insertedAssetCount
      !== assetIdentity.canonicalSourceCount
    || assetIdentity.remappedAssetIdCount > assetIdentity.sourceCount
    || assetIdentity.storageObjectMatchedAssetCount
      > assetIdentity.preservedProductionAssetIdCount
    || assetIdentity.preservedProductionStableAssetIdCount
      > assetIdentity.storageObjectMatchedAssetCount
    || assetIdentity.projectedStorageAliasForeignKeyValueCount
      < assetIdentity.projectedStorageAliasForeignKeyRowCount) {
    throw new Error('database_asset_identity_evidence_count_mismatch');
  }
  const transferPolicy = requiredString(evidence, 'transferPolicy', 'database_evidence');
  if (![NO_OP_TRANSFER_POLICY, MUTATION_TRANSFER_POLICY].includes(transferPolicy)) {
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
    preservedTargetOnlyRowCount: requiredNonnegativeInteger(
      evidence,
      'preservedTargetOnlyRowCount',
      'database_evidence',
    ),
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
    tablePreservedTargetOnlyRowCount: tables.reduce((sum, table) => (
      sum + table.productionTargetOnlyRowCountPreserved
    ), 0),
    assetIdentity,
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
  const storageVerified = storage.evidencePresent
    && storage.ok
    && storage.sourceObjectCount === storage.verifiedSourceObjectCount
    && storage.copiedObjectCount === storage.copiedContentHashVerifiedCount
    && storage.targetObjectCountAfter
      === storage.targetObjectCountBefore + storage.copiedObjectCount
    && storage.existingProductionObjectsRetained
    && !storage.providerRequestsPerformed;
  if (!storageVerified) throw new Error('successful_storage_promotion_not_verified');

  const databaseNoOpVerified = database.evidencePresent
    && database.targetAlreadyMatched
    && !database.productionMutationPerformed
    && database.targetTransactionCommitted
    && database.targetCommitVerified
    && database.transferPolicy === NO_OP_TRANSFER_POLICY
    && database.selectedTableCount > 0
    && database.sourceRowCount > 0
    && database.sourceRowCount === database.matchedSourceRowCount
    && database.preservedTargetOnlyRowCount === database.tablePreservedTargetOnlyRowCount
    && database.verifiedTableCount === database.selectedTableCount
    && database.skippedCurrentTableCount === database.selectedTableCount
    && database.commitMatchedTableCount === database.selectedTableCount
    && database.postCommitObservationMatchedTableCount === database.selectedTableCount
    && database.productionAssetUrlRewriteCount
      === database.productionAssetTimestampReuseCount;
  const databaseMutationVerified = database.evidencePresent
    && !database.targetAlreadyMatched
    && database.productionMutationPerformed
    && database.targetTransactionCommitted
    && database.targetCommitVerified
    && database.transferPolicy === MUTATION_TRANSFER_POLICY
    && database.selectedTableCount > 0
    && database.sourceRowCount > 0
    && database.sourceRowCount === database.matchedSourceRowCount
    && database.preservedTargetOnlyRowCount === database.tablePreservedTargetOnlyRowCount
    && database.verifiedTableCount === database.selectedTableCount
    && database.skippedCurrentTableCount === 0
    && database.commitMatchedTableCount === database.selectedTableCount
    && database.postCommitObservationMatchedTableCount === database.selectedTableCount
    && database.productionAssetUrlRewriteCount
      === database.productionAssetTimestampReuseCount;
  if (!databaseNoOpVerified && !databaseMutationVerified) {
    throw new Error('successful_database_promotion_not_verified');
  }
  audit.verification = {
    storageMutationPerformed: storage.copiedObjectCount > 0,
    databaseMutationPerformed: database.productionMutationPerformed,
    exactPostCommitVerificationPassed: true,
  };
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
