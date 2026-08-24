import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const DEFAULT_LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw'];
const DEFAULT_TABLE_CONFIG = 'deploy/production-catalogue-promotion-tables.json';
const PUBLIC_CATALOGUE_BUCKET = 'stackr-catalogue-public';
const TRANSFER_EVIDENCE_SCHEMA = 'stackr-production-catalogue-data-promotion-evidence-v1.1.0';
const STORAGE_EVIDENCE_SCHEMA = 'stackr-production-catalogue-storage-promotion-v1.1.0';
const REPORT_SCHEMA = 'stackr-production-catalogue-promotion-verification-v1.1.0';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function validateProductionPostgresEndpoint(value) {
  try {
    const prepared = normalizePostgresUrl(value, PRODUCTION_PROJECT_REF);
    return Object.freeze({
      normalized: prepared.normalized,
      endpointKind: prepared.endpointKind,
    });
  } catch {
    throw new Error('production_database_url_invalid');
  }
}

function tableNameIsValid(value) {
  return typeof value === 'string'
    && /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(value);
}

function identifierIsValid(value) {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/.test(value);
}

function splitTableName(value) {
  if (!tableNameIsValid(value)) throw new Error('production_promotion_table_name_invalid');
  const [schema, table] = value.split('.');
  return { schema, table };
}

function quoteIdentifier(value) {
  if (!identifierIsValid(value)) throw new Error('production_promotion_identifier_invalid');
  return `"${value}"`;
}

function qualifiedName(value) {
  const { schema, table } = splitTableName(value);
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $bytea: value.toString('base64') };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function digestRows(rows) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(stableJson(row)).update('\n');
  return hash.digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.every((value) => right.includes(value));
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function sequenceStateIsValid(value) {
  return identifierIsValid(value?.column)
    && identifierIsValid(value?.schema)
    && identifierIsValid(value?.sequence)
    && /^-?\d+$/.test(value?.startValue ?? '')
    && /^-?\d+$/.test(value?.lastValue ?? '')
    && typeof value?.isCalled === 'boolean';
}

function dataInvariantIsValid(value) {
  return nonNegativeInteger(value?.invalid_required_metadata_count) === 0
    && nonNegativeInteger(value?.conflicting_shared_object_count) === 0;
}

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

export function readPromotionConfig(configPath = DEFAULT_TABLE_CONFIG) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (config.schemaVersion !== 'stackr-production-catalogue-promotion-v1.0.0'
    || !Array.isArray(config.tables)
    || config.tables.length === 0
    || new Set(config.tables).size !== config.tables.length
    || !config.tables.every(tableNameIsValid)
    || !Array.isArray(config.adoptedMigrations)
    || config.adoptedMigrations.length === 0) {
    throw new Error('production_promotion_config_invalid');
  }
  const migrationVersions = new Set();
  for (const migration of config.adoptedMigrations) {
    if (!/^\d{14}$/.test(migration?.version ?? '')
      || !/^[a-z0-9_]+$/.test(migration?.name ?? '')
      || (migration.statementsSha256 !== undefined
        && !SHA256_PATTERN.test(migration.statementsSha256))
      || migrationVersions.has(migration.version)) {
      throw new Error('production_promotion_adopted_migrations_invalid');
    }
    migrationVersions.add(migration.version);
  }
  return Object.freeze(config);
}

export function requiredLanguages(value = process.env.STACKR_REQUIRED_CATALOGUE_LANGUAGES) {
  const languages = String(value ?? DEFAULT_LANGUAGES.join(','))
    .split(',').map((language) => language.trim()).filter(Boolean);
  if (languages.length !== DEFAULT_LANGUAGES.length
    || new Set(languages).size !== languages.length
    || !DEFAULT_LANGUAGES.every((language) => languages.includes(language))) {
    throw new Error('production_catalogue_languages_invalid');
  }
  return languages.sort();
}

function validateTransferEvidence(transferEvidence, config, languages, releaseLabel) {
  requireCondition(
    transferEvidence?.schemaVersion === TRANSFER_EVIDENCE_SCHEMA,
    'transfer_evidence_schema_invalid',
  );
  requireCondition(
    transferEvidence.sourceProjectRef === STAGING_PROJECT_REF
      && transferEvidence.targetProjectRef === PRODUCTION_PROJECT_REF
      && transferEvidence.productionProjectRef === PRODUCTION_PROJECT_REF,
    'transfer_evidence_project_refs_invalid',
  );
  requireCondition(
    transferEvidence.sourceReadOnly === true
      && transferEvidence.productionMutationPerformed === true
      && transferEvidence.stagingMutationPerformed === false
      && transferEvidence.isolatedCandidateMutationPerformed === false
      && transferEvidence.targetTransactionCommitted === true
      && transferEvidence.preCommitAcceptanceVerified === true
      && transferEvidence.targetCommitVerified === true
      && transferEvidence.targetRollbackVerified === null
      && transferEvidence.transferPolicy
        === 'replace_allowlisted_production_catalogue_tables_with_verified_staging_release_rows',
    'transfer_evidence_commit_invalid',
  );

  const release = transferEvidence.catalogueRelease;
  requireCondition(
    release?.versionLabel === releaseLabel
      && sameSet(release.requiredLanguages, languages)
      && Array.isArray(release.sourceVersionIds)
      && release.sourceVersionIds.length === languages.length
      && new Set(release.sourceVersionIds).size === languages.length
      && release.sourceVersionIds.every((id) => typeof id === 'string' && id.length > 0)
      && SHA256_PATTERN.test(release.releaseVersionSha256 ?? '')
      && release.promotionScope === 'complete_allowlisted_catalogue_snapshot'
      && nonNegativeInteger(release.productionAssetUrlRewriteCount) !== null,
    'transfer_evidence_release_invalid',
  );

  requireCondition(
    Array.isArray(transferEvidence.tables)
      && transferEvidence.tables.length === config.tables.length
      && transferEvidence.selectedTableCount === config.tables.length,
    'transfer_evidence_tables_invalid',
  );
  const tableByName = new Map();
  for (const table of transferEvidence.tables) {
    requireCondition(
      tableNameIsValid(table?.table)
        && config.tables.includes(table.table)
        && !tableByName.has(table.table),
      'transfer_evidence_tables_invalid',
    );
    const primaryKey = table.primaryKey;
    const transferColumns = table.transferColumns;
    requireCondition(
      Array.isArray(primaryKey)
        && primaryKey.length > 0
        && primaryKey.every(identifierIsValid)
        && new Set(primaryKey).size === primaryKey.length
        && Array.isArray(transferColumns)
        && transferColumns.length > 0
        && transferColumns.every(identifierIsValid)
        && new Set(transferColumns).size === transferColumns.length
        && primaryKey.every((column) => transferColumns.includes(column)),
      'transfer_evidence_table_contract_invalid',
    );
    const sourceRowCount = nonNegativeInteger(table.sourceRowCount);
    const matchedSourceRowCount = nonNegativeInteger(table.matchedSourceRowCount);
    const targetRowCountAfterCommit = nonNegativeInteger(table.targetRowCountAfterCommit);
    requireCondition(
      sourceRowCount !== null
        && matchedSourceRowCount === sourceRowCount
        && targetRowCountAfterCommit === sourceRowCount
        && table.preCommitMatched === true
        && table.commitMatched === true
        && SHA256_PATTERN.test(table.expectedFinalSha256 ?? '')
        && table.targetAfterCommitSha256 === table.expectedFinalSha256,
      'transfer_evidence_table_commit_invalid',
    );
    requireCondition(
      Array.isArray(table.targetSequencesDuringRehearsal)
        && Array.isArray(table.targetSequencesAfterCommit)
        && table.targetSequencesAfterCommit.every(sequenceStateIsValid)
        && stableJson(table.targetSequencesDuringRehearsal)
          === stableJson(table.targetSequencesAfterCommit),
      'transfer_evidence_sequence_state_invalid',
    );
    tableByName.set(table.table, {
      table: table.table,
      primaryKey: [...primaryKey],
      transferColumns: [...transferColumns],
      expectedRowCount: targetRowCountAfterCommit,
      expectedSha256: table.targetAfterCommitSha256,
      expectedSequences: table.targetSequencesAfterCommit.map((sequence) => ({ ...sequence })),
    });
  }
  requireCondition(
    config.tables.every((table) => tableByName.has(table))
      && nonNegativeInteger(transferEvidence.sourceRowCount)
        === transferEvidence.tables.reduce((sum, table) => sum + Number(table.sourceRowCount), 0)
      && nonNegativeInteger(transferEvidence.matchedSourceRowCount)
        === transferEvidence.tables.reduce((sum, table) => sum + Number(table.matchedSourceRowCount), 0),
    'transfer_evidence_table_totals_invalid',
  );

  const provenance = transferEvidence.migrationProvenance;
  requireCondition(
    provenance?.configuredCount === config.adoptedMigrations.length
      && nonNegativeInteger(provenance.insertedCount) !== null
      && Number(provenance.insertedCount) <= config.adoptedMigrations.length
      && provenance.targetCommitVerified === true
      && provenance.targetRollbackVerified === null
      && SHA256_PATTERN.test(provenance.sourceMigrationFingerprint ?? '')
      && Array.isArray(provenance.sourceMigrations)
      && provenance.sourceMigrations.length === config.adoptedMigrations.length,
    'transfer_evidence_migration_provenance_invalid',
  );
  const migrationByVersion = new Map();
  for (const migration of provenance.sourceMigrations) {
    const configured = config.adoptedMigrations.find((row) => row.version === migration?.version);
    requireCondition(
      configured
        && configured.name === migration.name
        && !migrationByVersion.has(migration.version)
        && SHA256_PATTERN.test(migration.statementsSha256 ?? '')
        && (configured.statementsSha256 === undefined
          || configured.statementsSha256 === migration.statementsSha256),
      'transfer_evidence_migration_statements_invalid',
    );
    migrationByVersion.set(migration.version, {
      version: migration.version,
      name: migration.name,
      statementsSha256: migration.statementsSha256,
    });
  }
  requireCondition(
    config.adoptedMigrations.every((migration) => migrationByVersion.has(migration.version)),
    'transfer_evidence_migration_provenance_invalid',
  );

  const sharedContract = transferEvidence.sharedStorageObjectSchemaContract;
  requireCondition(
    SHA256_PATTERN.test(sharedContract?.sourceFingerprint ?? '')
      && SHA256_PATTERN.test(sharedContract?.targetBeforeFingerprint ?? '')
      && SHA256_PATTERN.test(sharedContract?.targetTransferFingerprint ?? '')
      && sharedContract.sourceFingerprint === sharedContract.targetTransferFingerprint
      && sharedContract.targetCommitVerified === true
      && sharedContract.targetRollbackVerified === null
      && dataInvariantIsValid(sharedContract.sourceDataInvariant)
      && dataInvariantIsValid(sharedContract.targetDataInvariant),
    'transfer_evidence_shared_storage_contract_invalid',
  );

  return {
    tables: config.tables.map((table) => tableByName.get(table)),
    migrations: config.adoptedMigrations.map((migration) => migrationByVersion.get(migration.version)),
    migrationFingerprint: provenance.sourceMigrationFingerprint,
    releaseVersionIds: [...release.sourceVersionIds],
    releaseVersionSha256: release.releaseVersionSha256,
    sharedStorageObjectContract: {
      expectedFingerprint: sharedContract.targetTransferFingerprint,
      expectedDataInvariant: { ...sharedContract.targetDataInvariant },
    },
  };
}

function validateStoragePromotionEvidence(storageEvidence) {
  requireCondition(
    storageEvidence?.schemaVersion === STORAGE_EVIDENCE_SCHEMA,
    'storage_promotion_evidence_schema_invalid',
  );
  requireCondition(
    storageEvidence.sourceProjectRef === STAGING_PROJECT_REF
      && storageEvidence.targetProjectRef === PRODUCTION_PROJECT_REF,
    'storage_promotion_evidence_project_refs_invalid',
  );
  requireCondition(
    storageEvidence.promotionMode === 'copy'
      && storageEvidence.status === 'copy_complete'
      && storageEvidence.ok === true
      && storageEvidence.bucket === PUBLIC_CATALOGUE_BUCKET
      && storageEvidence.existingProductionObjectsRetained === true
      && storageEvidence.providerRequestsPerformed === false,
    'storage_promotion_evidence_status_invalid',
  );

  const sourceObjectCount = nonNegativeInteger(storageEvidence.sourceObjectCount);
  const sourceByteSize = nonNegativeInteger(storageEvidence.sourceByteSize);
  const targetObjectCountBefore = nonNegativeInteger(storageEvidence.targetObjectCountBefore);
  const targetObjectCountAfter = nonNegativeInteger(storageEvidence.targetObjectCountAfter);
  const copiedObjectCount = nonNegativeInteger(storageEvidence.copiedObjectCount);
  const copiedByteSize = nonNegativeInteger(storageEvidence.copiedByteSize);
  const copiedContentHashVerifiedCount = nonNegativeInteger(
    storageEvidence.copiedContentHashVerifiedCount,
  );
  const retainedProductionObjectCount = nonNegativeInteger(
    storageEvidence.retainedProductionObjectCount,
  );
  const retainedProductionByteSize = nonNegativeInteger(
    storageEvidence.retainedProductionByteSize,
  );
  const retainedProductionContentHashVerifiedCount = nonNegativeInteger(
    storageEvidence.retainedProductionContentHashVerifiedCount,
  );
  const inventoryMatchedSourceObjectCount = nonNegativeInteger(
    storageEvidence.inventoryMatchedSourceObjectCount,
  );
  requireCondition(
    sourceObjectCount !== null
      && sourceByteSize !== null
      && targetObjectCountBefore !== null
      && targetObjectCountAfter !== null
      && copiedObjectCount !== null
      && copiedByteSize !== null
      && copiedContentHashVerifiedCount !== null
      && retainedProductionObjectCount !== null
      && retainedProductionByteSize !== null
      && retainedProductionContentHashVerifiedCount !== null
      && inventoryMatchedSourceObjectCount === sourceObjectCount
      && targetObjectCountAfter >= sourceObjectCount
      && targetObjectCountAfter >= targetObjectCountBefore
      && copiedObjectCount <= sourceObjectCount
      && SHA256_PATTERN.test(storageEvidence.sourceInventorySha256 ?? '')
      && Array.isArray(storageEvidence.copiedObjects)
      && storageEvidence.copiedObjects.length === copiedObjectCount,
    'storage_promotion_evidence_totals_invalid',
  );

  const retainedSourceObjectCount = sourceObjectCount - copiedObjectCount;
  requireCondition(
    retainedProductionObjectCount === retainedSourceObjectCount
      && retainedProductionContentHashVerifiedCount === retainedSourceObjectCount
      && retainedProductionByteSize + copiedByteSize === sourceByteSize,
    'storage_promotion_evidence_retained_totals_invalid',
  );
  requireCondition(
    storageEvidence.existingProductionObjectsContentHashVerified === true,
    'storage_promotion_evidence_retained_objects_unverified',
  );

  const copiedNames = new Set();
  let copiedBytes = 0;
  for (const object of storageEvidence.copiedObjects) {
    const bytes = nonNegativeInteger(object?.bytes);
    const pathSha256 = typeof object?.name === 'string'
      ? object.name.match(/\/([0-9a-f]{64})\/[^/]+$/)?.[1]
      : null;
    requireCondition(
      typeof object?.name === 'string'
        && object.name.length > 0
        && object.name.length <= 1024
        && !copiedNames.has(object.name)
        && bytes !== null
        && SHA256_PATTERN.test(object.sha256 ?? '')
        && pathSha256 === object.sha256
        && nonNegativeInteger(object.preCopyDatabaseReferenceCount) === 0
        && object.createdByThisRun === true,
      'storage_promotion_evidence_objects_invalid',
    );
    copiedNames.add(object.name);
    copiedBytes += bytes;
  }
  requireCondition(
    copiedBytes === copiedByteSize
      && copiedContentHashVerifiedCount === copiedObjectCount,
    'storage_promotion_evidence_copy_verification_invalid',
  );

  return {
    sourceObjectCount,
    sourceByteSize,
    targetObjectCountBefore,
    targetObjectCountAfter,
    copiedObjectCount,
    copiedByteSize,
    retainedSourceObjectCount,
    retainedProductionObjectCount,
    retainedProductionByteSize,
    retainedProductionContentHashVerifiedCount,
    retainedObjectsContentHashVerified: true,
    allSourceObjectsContentHashVerified: true,
    inventoryMatchedSourceObjectCount,
    sourceInventorySha256: storageEvidence.sourceInventorySha256,
  };
}

export function validatePromotionEvidenceInputs({
  transferEvidence,
  storagePromotionEvidence,
  config,
  languages,
  releaseLabel,
}) {
  return {
    transfer: validateTransferEvidence(transferEvidence, config, languages, releaseLabel),
    storage: validateStoragePromotionEvidence(storagePromotionEvidence),
  };
}

function finiteInteger(value) {
  return Number.isInteger(Number(value)) ? Number(value) : null;
}

function releaseDigestRows(versionRows) {
  return versionRows.map((row) => ({
    id: row.id,
    version_key: row.version_key,
    version_label: row.version_label,
    language_code: row.language_code,
    status: row.status,
    coverage_summary: row.coverage_summary,
  }));
}

export function assessProductionCatalogueEvidence({
  tableRows,
  migrationRows,
  versionRows,
  storageRow,
  storageObjectRow,
  sharedStorageContract,
  sharedStorageDataInvariant,
  config,
  languages,
  releaseLabel,
  promotionInputs,
  transferEvidenceSha256,
  storagePromotionEvidenceSha256,
}) {
  const errors = [];
  const expectedTableByName = new Map(
    promotionInputs.transfer.tables.map((table) => [table.table, table]),
  );
  const missingTables = tableRows.filter((row) => !row.exists).map((row) => row.table_name);
  if (missingTables.length) errors.push(`promotion_tables_missing:${missingTables.join(',')}`);

  const tableReconciliation = tableRows.map((row) => {
    const expected = expectedTableByName.get(row.table_name);
    const primaryKeyMatched = row.exists === true && sameArray(row.primary_key, expected?.primaryKey);
    const countMatched = row.exists === true
      && finiteInteger(row.row_count) === expected?.expectedRowCount;
    const digestMatched = row.exists === true && row.sha256 === expected?.expectedSha256;
    const sequenceStateMatched = row.exists === true
      && stableJson(row.sequences) === stableJson(expected?.expectedSequences);
    if (row.exists && !primaryKeyMatched) errors.push(`promotion_table_primary_key_mismatch:${row.table_name}`);
    if (row.exists && !countMatched) errors.push(`promotion_table_count_mismatch:${row.table_name}`);
    if (row.exists && !digestMatched) errors.push(`promotion_table_digest_mismatch:${row.table_name}`);
    if (row.exists && !sequenceStateMatched) errors.push(`promotion_table_sequence_state_mismatch:${row.table_name}`);
    return {
      table: row.table_name,
      exists: row.exists === true,
      rowCount: finiteInteger(row.row_count),
      sha256: row.sha256 ?? null,
      expectedRowCount: expected?.expectedRowCount ?? null,
      expectedSha256: expected?.expectedSha256 ?? null,
      primaryKeyMatched,
      countMatched,
      digestMatched,
      sequenceStateMatched,
      sequences: row.sequences ?? null,
      expectedSequences: expected?.expectedSequences ?? null,
    };
  });

  const migrationsByVersion = new Map(migrationRows.map((row) => [row.version, row]));
  const expectedMigrationByVersion = new Map(
    promotionInputs.transfer.migrations.map((row) => [row.version, row]),
  );
  const migrationReconciliation = config.adoptedMigrations.map((migration) => {
    const actual = migrationsByVersion.get(migration.version);
    const expected = expectedMigrationByVersion.get(migration.version);
    const statementsSha256 = actual ? digestRows([actual.statements]) : null;
    const nameMatched = actual?.name === migration.name;
    const statementsMatched = statementsSha256 === expected?.statementsSha256
      && (migration.statementsSha256 === undefined
        || statementsSha256 === migration.statementsSha256);
    if (!actual || !nameMatched) {
      errors.push(`adopted_migration_missing_or_mismatched:${migration.version}`);
    } else if (!statementsMatched) {
      errors.push(`adopted_migration_statements_mismatch:${migration.version}`);
    }
    return {
      version: migration.version,
      name: migration.name,
      exists: Boolean(actual),
      nameMatched,
      statementsSha256,
      expectedStatementsSha256: expected?.statementsSha256 ?? null,
      statementsMatched,
    };
  });
  if (migrationRows.length !== config.adoptedMigrations.length) {
    errors.push('adopted_migration_count_mismatch');
  }
  const migrationFingerprint = digestRows(migrationRows);
  if (migrationFingerprint !== promotionInputs.transfer.migrationFingerprint) {
    errors.push('adopted_migration_fingerprint_mismatch');
  }

  const eligibleVersions = versionRows.filter((row) => (
    row.status === 'published'
    && row.release_eligible === true
    && row.controlled_staging !== true
  ));
  const byLanguage = new Map(eligibleVersions.map((row) => [row.language_code, row]));
  const missingLanguages = languages.filter((language) => !byLanguage.has(language));
  if (missingLanguages.length) errors.push(`release_languages_missing:${missingLanguages.join(',')}`);
  if (eligibleVersions.length !== languages.length || byLanguage.size !== languages.length) {
    errors.push('release_version_count_mismatch');
  }

  for (const row of eligibleVersions) {
    const counts = [
      'set_count',
      'printing_count',
      'variant_count',
      'asset_count',
      'external_identifier_count',
      'wrong_language_rows',
    ];
    if (counts.some((field) => finiteInteger(row[field]) === null)) {
      errors.push(`release_totals_invalid:${row.language_code}`);
      continue;
    }
    if (Number(row.wrong_language_rows) !== 0
      || Number(row.set_count) <= 0
      || Number(row.summary_sets) !== Number(row.set_count)
      || Number(row.summary_stored_card_records) !== Number(row.printing_count)) {
      errors.push(`release_totals_mismatch:${row.language_code}`);
    }
  }
  const releaseVersionIds = eligibleVersions.map((row) => row.id);
  const releaseVersionSha256 = digestRows(releaseDigestRows(eligibleVersions));
  if (!sameArray(releaseVersionIds, promotionInputs.transfer.releaseVersionIds)) {
    errors.push('release_version_ids_mismatch');
  }
  if (releaseVersionSha256 !== promotionInputs.transfer.releaseVersionSha256) {
    errors.push('release_version_digest_mismatch');
  }

  const storageBackedCount = finiteInteger(storageRow?.storage_backed_count);
  const missingStorageLocationCount = finiteInteger(storageRow?.missing_storage_location_count);
  const publicStorageCount = finiteInteger(storageRow?.public_storage_count);
  const publicUrlMismatchCount = finiteInteger(storageRow?.public_url_mismatch_count);
  if ([storageBackedCount, missingStorageLocationCount, publicStorageCount, publicUrlMismatchCount].includes(null)) {
    errors.push('storage_summary_invalid');
  } else {
    if (storageBackedCount <= 0 || publicStorageCount <= 0) errors.push('storage_catalogue_assets_missing');
    if (publicStorageCount !== storageBackedCount) errors.push('storage_bucket_mismatch');
    if (missingStorageLocationCount !== 0) errors.push('storage_location_missing');
    if (publicUrlMismatchCount !== 0) errors.push('public_storage_url_mismatch');
  }

  const storageObjectFields = [
    'catalogue_storage_key_count',
    'live_storage_object_count',
    'missing_storage_object_count',
    'invalid_expected_size_count',
    'storage_object_size_mismatch_count',
    'invalid_content_hash_count',
    'storage_key_hash_mismatch_count',
    'shared_metadata_conflict_count',
  ];
  const storageObjectCounts = Object.fromEntries(
    storageObjectFields.map((field) => [field, finiteInteger(storageObjectRow?.[field])]),
  );
  if (storageObjectFields.some((field) => storageObjectCounts[field] === null)
    || typeof storageObjectRow?.bucket_exists !== 'boolean'
    || typeof storageObjectRow?.bucket_public !== 'boolean') {
    errors.push('live_storage_object_summary_invalid');
  } else {
    if (!storageObjectRow.bucket_exists || !storageObjectRow.bucket_public) {
      errors.push('live_storage_bucket_invalid');
    }
    if (storageObjectCounts.live_storage_object_count
      !== storageObjectCounts.catalogue_storage_key_count
      || storageObjectCounts.missing_storage_object_count !== 0) {
      errors.push('live_storage_object_missing');
    }
    if (storageObjectCounts.invalid_expected_size_count !== 0
      || storageObjectCounts.storage_object_size_mismatch_count !== 0) {
      errors.push('live_storage_object_size_mismatch');
    }
    if (storageObjectCounts.invalid_content_hash_count !== 0
      || storageObjectCounts.storage_key_hash_mismatch_count !== 0) {
      errors.push('live_storage_object_hash_mismatch');
    }
    if (storageObjectCounts.shared_metadata_conflict_count !== 0) {
      errors.push('live_storage_object_metadata_conflict');
    }
  }

  const sharedStorageContractFingerprint = sharedStorageContract
    ? digestRows([sharedStorageContract])
    : null;
  const expectedSharedStorageContract = promotionInputs.transfer.sharedStorageObjectContract;
  const sharedStoragePrivilegesValid = sharedStorageContract?.serviceRoleExecute === true
    && sharedStorageContract?.publicExecute === false
    && sharedStorageContract?.anonExecute === false
    && sharedStorageContract?.authenticatedExecute === false;
  const sharedStorageContractMatched = sharedStorageContractFingerprint
    === expectedSharedStorageContract.expectedFingerprint;
  const sharedStorageDataInvariantMatched = dataInvariantIsValid(sharedStorageDataInvariant)
    && stableJson(sharedStorageDataInvariant)
      === stableJson(expectedSharedStorageContract.expectedDataInvariant);
  if (!sharedStorageContract) errors.push('shared_storage_object_contract_missing');
  else {
    if (!sharedStoragePrivilegesValid) errors.push('shared_storage_object_contract_privileges_invalid');
    if (!sharedStorageContractMatched) errors.push('shared_storage_object_contract_fingerprint_mismatch');
  }
  if (!sharedStorageDataInvariantMatched) errors.push('shared_storage_object_data_invariant_mismatch');

  return {
    schemaVersion: REPORT_SCHEMA,
    verifiedAt: new Date().toISOString(),
    productionProjectRef: PRODUCTION_PROJECT_REF,
    releaseLabel,
    requiredLanguages: languages,
    inputEvidence: {
      transferEvidenceSha256,
      storagePromotionEvidenceSha256,
      transferSchemaVersion: TRANSFER_EVIDENCE_SCHEMA,
      storagePromotionSchemaVersion: STORAGE_EVIDENCE_SCHEMA,
      stagingProjectRef: STAGING_PROJECT_REF,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      transferRecordedProductionMutation: true,
      transferTargetCommitVerified: true,
      storagePromotionStatus: 'copy_complete',
    },
    tables: tableReconciliation,
    adoptedMigrations: {
      fingerprint: migrationFingerprint,
      expectedFingerprint: promotionInputs.transfer.migrationFingerprint,
      fingerprintMatched: migrationFingerprint === promotionInputs.transfer.migrationFingerprint,
      rows: migrationReconciliation,
    },
    releaseVersions: eligibleVersions.map((row) => ({
      language: row.language_code,
      versionId: row.id,
      versionKey: row.version_key,
      status: row.status,
      totals: {
        sets: finiteInteger(row.set_count),
        printings: finiteInteger(row.printing_count),
        variants: finiteInteger(row.variant_count),
        assets: finiteInteger(row.asset_count),
        externalIdentifiers: finiteInteger(row.external_identifier_count),
      },
      totalsReconciled: !errors.includes(`release_totals_mismatch:${row.language_code}`)
        && !errors.includes(`release_totals_invalid:${row.language_code}`),
    })),
    releaseVersionSha256,
    expectedReleaseVersionSha256: promotionInputs.transfer.releaseVersionSha256,
    storage: {
      storageBackedAssets: storageBackedCount,
      missingBucketOrKey: missingStorageLocationCount,
      publicCatalogueAssets: publicStorageCount,
      publicUrlMismatches: publicUrlMismatchCount,
      liveObjects: {
        bucketExists: storageObjectRow?.bucket_exists ?? null,
        bucketPublic: storageObjectRow?.bucket_public ?? null,
        catalogueStorageKeys: storageObjectCounts.catalogue_storage_key_count,
        liveStorageObjects: storageObjectCounts.live_storage_object_count,
        missingObjects: storageObjectCounts.missing_storage_object_count,
        invalidExpectedSizes: storageObjectCounts.invalid_expected_size_count,
        sizeMismatches: storageObjectCounts.storage_object_size_mismatch_count,
        invalidContentHashes: storageObjectCounts.invalid_content_hash_count,
        storageKeyHashMismatches: storageObjectCounts.storage_key_hash_mismatch_count,
        sharedMetadataConflicts: storageObjectCounts.shared_metadata_conflict_count,
      },
      promotionJournal: promotionInputs.storage,
    },
    sharedStorageObjectContract: {
      currentFingerprint: sharedStorageContractFingerprint,
      expectedFingerprint: expectedSharedStorageContract.expectedFingerprint,
      fingerprintMatched: sharedStorageContractMatched,
      privilegesValid: sharedStoragePrivilegesValid,
      currentDataInvariant: sharedStorageDataInvariant ?? null,
      expectedDataInvariant: expectedSharedStorageContract.expectedDataInvariant,
      dataInvariantMatched: sharedStorageDataInvariantMatched,
    },
    productionModified: false,
    ok: errors.length === 0,
    errors,
  };
}

function writeEvidence(outputPath, evidence) {
  const resolved = path.resolve(outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, resolved);
}

function readEvidenceInput(inputPath, missingCode, unreadableCode, invalidCode) {
  requireCondition(typeof inputPath === 'string' && inputPath.trim().length > 0, missingCode);
  let bytes;
  try {
    bytes = readFileSync(path.resolve(inputPath));
  } catch {
    throw new Error(unreadableCode);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(invalidCode);
  }
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), invalidCode);
  return { value, sha256: sha256(bytes) };
}

async function tablePrimaryKey(client, tableName) {
  const { schema, table } = splitTableName(tableName);
  return (await client.query(`
    select attribute.attname as column_name
    from pg_index index_definition
    join pg_class relation on relation.oid = index_definition.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join unnest(index_definition.indkey) with ordinality as key(attnum, ordinal) on true
    join pg_attribute attribute
      on attribute.attrelid = relation.oid and attribute.attnum = key.attnum
    where namespace.nspname = $1
      and relation.relname = $2
      and index_definition.indisprimary
    order by key.ordinal
  `, [schema, table])).rows.map((row) => row.column_name);
}

async function tableColumns(client, tableName) {
  const { schema, table } = splitTableName(tableName);
  return (await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = $1 and table_name = $2
    order by ordinal_position
  `, [schema, table])).rows.map((row) => row.column_name);
}

async function ownedSequenceStates(client, tableName, columns) {
  const states = [];
  for (const column of columns) {
    const sequence = await client.query(`
      select
        namespace.nspname as schema_name,
        relation.relname as sequence_name,
        sequence_definition.seqstart::text as start_value
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_sequence sequence_definition on sequence_definition.seqrelid = relation.oid
      where relation.oid = pg_get_serial_sequence($1, $2)::regclass
    `, [tableName, column]);
    const sequenceRow = sequence.rows[0];
    if (!sequenceRow) continue;
    const state = (await client.query(
      `select last_value::text as last_value, is_called from ${quoteIdentifier(sequenceRow.schema_name)}.${quoteIdentifier(sequenceRow.sequence_name)}`,
    )).rows[0];
    states.push({
      column,
      schema: sequenceRow.schema_name,
      sequence: sequenceRow.sequence_name,
      startValue: sequenceRow.start_value,
      lastValue: state.last_value,
      isCalled: state.is_called,
    });
  }
  return states;
}

async function querySharedStorageObjectContract(client) {
  const index = await client.query(`
    select pg_get_indexdef(index_class.oid) as definition
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index index_definition on index_definition.indexrelid = index_class.oid
    where index_namespace.nspname = 'catalog'
      and index_class.relname = 'assets_storage_object_idx'
      and index_definition.indrelid = 'catalog.assets'::regclass
      and index_definition.indisvalid
  `);
  const fn = await client.query(`
    select
      procedure.oid,
      pg_get_functiondef(procedure.oid) as definition,
      has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
      coalesce((
        select bool_or(acl.privilege_type = 'EXECUTE')
        from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
        where acl.grantee = 0
      ), false) as public_execute,
      has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'catalog'
      and procedure.proname = 'enforce_shared_asset_storage_object_identity'
      and pg_get_function_identity_arguments(procedure.oid) = ''
  `);
  if (index.rowCount !== 1 || fn.rowCount !== 1) return null;
  const trigger = await client.query(`
    select trigger.tgname as name, pg_get_triggerdef(trigger.oid) as definition
    from pg_trigger trigger
    where trigger.tgrelid = 'catalog.assets'::regclass
      and trigger.tgfoid = $1
      and not trigger.tgisinternal
  `, [fn.rows[0].oid]);
  if (trigger.rowCount !== 1
    || trigger.rows[0].name !== 'enforce_shared_asset_storage_object_identity') return null;
  return {
    indexDefinition: index.rows[0].definition,
    functionDefinition: fn.rows[0].definition,
    triggerName: trigger.rows[0].name,
    triggerDefinition: trigger.rows[0].definition,
    serviceRoleExecute: fn.rows[0].service_role_execute,
    publicExecute: fn.rows[0].public_execute,
    anonExecute: fn.rows[0].anon_execute,
    authenticatedExecute: fn.rows[0].authenticated_execute,
  };
}

async function querySharedStorageDataInvariant(client) {
  return (await client.query(`
    with active_storage_assets as (
      select *
      from catalog.assets
      where storage_key is not null
        and deleted_at is null
    ), invalid_required_metadata as (
      select count(*)::integer as row_count
      from active_storage_assets
      where storage_provider is null
         or storage_bucket is null
         or content_sha256 is null
         or mime_type is null
         or byte_size is null
    ), conflicting_shared_objects as (
      select count(*)::integer as group_count
      from (
        select storage_provider, storage_bucket, storage_key
        from active_storage_assets
        group by storage_provider, storage_bucket, storage_key
        having count(distinct jsonb_build_array(
          asset_type,
          url,
          storage_path,
          content_sha256,
          sha256,
          perceptual_hash,
          mime_type,
          width,
          height,
          byte_size,
          derivative_list,
          cache_control,
          archival_storage_key
        )) > 1
      ) conflicts
    )
    select
      (select row_count from invalid_required_metadata) as invalid_required_metadata_count,
      (select group_count from conflicting_shared_objects) as conflicting_shared_object_count
  `)).rows[0];
}

async function queryLiveStorageObjectReconciliation(client) {
  return (await client.query(`
    with referenced_objects as (
      select
        storage_bucket,
        storage_key,
        min(content_sha256) as expected_sha256,
        min(byte_size) as expected_size,
        count(distinct content_sha256) as content_hash_count,
        count(distinct byte_size) as byte_size_count,
        bool_or(content_sha256 is null or content_sha256 !~ '^[0-9a-f]{64}$') as invalid_content_hash,
        bool_or(byte_size is null or byte_size <= 0) as invalid_expected_size
      from catalog.assets
      where storage_provider = 'supabase_storage'
        and storage_bucket = $1
        and storage_key is not null
      group by storage_bucket, storage_key
    ), reconciled as (
      select
        reference.*,
        object.name as live_name,
        case
          when object.metadata ->> 'size' ~ '^[0-9]+$'
            then (object.metadata ->> 'size')::numeric
          else null
        end as live_size
      from referenced_objects reference
      left join storage.objects object
        on object.bucket_id = reference.storage_bucket
       and object.name = reference.storage_key
    )
    select
      exists(select 1 from storage.buckets where id = $1) as bucket_exists,
      coalesce((select public from storage.buckets where id = $1), false) as bucket_public,
      count(*)::integer as catalogue_storage_key_count,
      count(*) filter (where live_name is not null)::integer as live_storage_object_count,
      count(*) filter (where live_name is null)::integer as missing_storage_object_count,
      count(*) filter (where invalid_expected_size)::integer as invalid_expected_size_count,
      count(*) filter (
        where live_name is not null
          and (live_size is null or live_size is distinct from expected_size::numeric)
      )::integer as storage_object_size_mismatch_count,
      count(*) filter (where invalid_content_hash)::integer as invalid_content_hash_count,
      count(*) filter (
        where not invalid_content_hash
          and storage_key !~ ('/' || expected_sha256 || '/[^/]+$')
      )::integer as storage_key_hash_mismatch_count,
      count(*) filter (
        where content_hash_count <> 1 or byte_size_count <> 1
      )::integer as shared_metadata_conflict_count
    from reconciled
  `, [PUBLIC_CATALOGUE_BUCKET])).rows[0];
}

async function queryTableReconciliation(client, config, transferTables) {
  const existenceRows = (await client.query(`
    select table_name, to_regclass(table_name) is not null as exists
    from unnest($1::text[]) as configured(table_name)
    order by table_name
  `, [config.tables])).rows;
  const existenceByName = new Map(existenceRows.map((row) => [row.table_name, row.exists === true]));
  const transferByName = new Map(transferTables.map((table) => [table.table, table]));
  const observations = [];
  for (const tableName of config.tables) {
    const exists = existenceByName.get(tableName) === true;
    const contract = transferByName.get(tableName);
    if (!exists) {
      observations.push({ table_name: tableName, exists: false, primary_key: [], row_count: null, sha256: null });
      continue;
    }
    const primaryKey = await tablePrimaryKey(client, tableName);
    const columns = await tableColumns(client, tableName);
    const sequences = await ownedSequenceStates(client, tableName, columns);
    if (!sameArray(primaryKey, contract.primaryKey)) {
      observations.push({
        table_name: tableName,
        exists: true,
        primary_key: primaryKey,
        sequences,
        row_count: null,
        sha256: null,
      });
      continue;
    }
    const projection = contract.transferColumns.map(quoteIdentifier).join(', ');
    const order = contract.primaryKey.map(quoteIdentifier).join(', ');
    const rows = (await client.query(
      `select ${projection} from ${qualifiedName(tableName)} order by ${order}`,
    )).rows;
    observations.push({
      table_name: tableName,
      exists: true,
      primary_key: primaryKey,
      sequences,
      row_count: rows.length,
      sha256: digestRows(rows),
    });
  }
  return observations;
}

async function queryEvidence(client, config, releaseLabel, promotionInputs) {
  const tableRows = await queryTableReconciliation(client, config, promotionInputs.transfer.tables);
  const sharedStorageContract = await querySharedStorageObjectContract(client);
  const sharedStorageDataInvariant = await querySharedStorageDataInvariant(client);
  const storageObjectRow = await queryLiveStorageObjectReconciliation(client);
  const migrationRows = (await client.query(`
    select version::text as version, statements, name
    from supabase_migrations.schema_migrations
    where version::text = any($1::text[])
    order by version, name
  `, [config.adoptedMigrations.map((migration) => migration.version)])).rows;
  const versionRows = (await client.query(`
    select
      cv.id::text as id,
      cv.version_key,
      cv.version_label,
      cv.language_code,
      cv.status,
      cv.coverage_summary,
      (cv.coverage_summary ->> 'releaseEligible')::boolean as release_eligible,
      coalesce((cv.coverage_summary ->> 'controlledStagingSnapshot')::boolean, false) as controlled_staging,
      coalesce((cv.coverage_summary ->> 'sets')::integer, -1) as summary_sets,
      coalesce((cv.coverage_summary ->> 'storedCardRecords')::integer, -1) as summary_stored_card_records,
      (select count(*)::integer from catalog.catalogue_version_sets rows where rows.catalogue_version_id = cv.id) as set_count,
      (select count(*)::integer from catalog.catalogue_version_printings rows where rows.catalogue_version_id = cv.id) as printing_count,
      (select count(*)::integer from catalog.catalogue_version_variants rows where rows.catalogue_version_id = cv.id) as variant_count,
      (select count(*)::integer from catalog.catalogue_version_assets rows where rows.catalogue_version_id = cv.id) as asset_count,
      (select count(*)::integer from catalog.catalogue_version_external_identifiers rows where rows.catalogue_version_id = cv.id) as external_identifier_count,
      (
        (select count(*) from catalog.catalogue_version_sets rows where rows.catalogue_version_id = cv.id and rows.language_code <> cv.language_code)
        + (select count(*) from catalog.catalogue_version_printings rows where rows.catalogue_version_id = cv.id and rows.language_code <> cv.language_code)
        + (select count(*) from catalog.catalogue_version_variants rows where rows.catalogue_version_id = cv.id and rows.language_code <> cv.language_code)
        + (select count(*) from catalog.catalogue_version_assets rows where rows.catalogue_version_id = cv.id and rows.language_code <> cv.language_code)
        + (select count(*) from catalog.catalogue_version_external_identifiers rows where rows.catalogue_version_id = cv.id and rows.language_code <> cv.language_code)
      )::integer as wrong_language_rows
    from catalog.catalogue_versions cv
    where cv.version_label = $1
    order by cv.language_code, cv.id
  `, [releaseLabel])).rows;
  const storageRow = (await client.query(`
    select
      count(*) filter (where storage_provider = 'supabase_storage')::integer as storage_backed_count,
      count(*) filter (
        where storage_provider = 'supabase_storage'
          and (nullif(storage_bucket, '') is null or nullif(storage_key, '') is null)
      )::integer as missing_storage_location_count,
      count(*) filter (
        where storage_provider = 'supabase_storage'
          and storage_bucket = $2
      )::integer as public_storage_count,
      count(*) filter (
        where storage_provider = 'supabase_storage'
          and storage_bucket = $2
          and url is distinct from ('https://' || $1 || '.supabase.co/storage/v1/object/public/' || storage_bucket || '/' || storage_key)
      )::integer as public_url_mismatch_count
    from catalog.assets
  `, [PRODUCTION_PROJECT_REF, PUBLIC_CATALOGUE_BUCKET])).rows[0];
  return {
    tableRows,
    migrationRows,
    versionRows,
    storageRow,
    storageObjectRow,
    sharedStorageContract,
    sharedStorageDataInvariant,
  };
}

function safeErrorCode(error) {
  const code = String(error?.message ?? '');
  return /^(?:production_|transfer_evidence_|storage_promotion_evidence_|verification_query_failed)/.test(code)
    ? code
    : 'verification_query_failed';
}

async function main() {
  const outputPath = process.env.STACKR_PRODUCTION_CATALOGUE_EVIDENCE_PATH;
  const releaseLabel = String(process.env.STACKR_CATALOGUE_RELEASE_LABEL ?? '').trim();
  if (!outputPath) throw new Error('production_catalogue_evidence_path_missing');
  let evidence;
  let client = null;
  const inputEvidence = {};
  try {
    if (!releaseLabel || releaseLabel.length > 160 || /[\r\n\u0000]/.test(releaseLabel)) {
      throw new Error('production_catalogue_release_label_invalid');
    }
    const config = readPromotionConfig(process.env.STACKR_TRANSFER_TABLE_CONFIG ?? DEFAULT_TABLE_CONFIG);
    const languages = requiredLanguages();
    const transferInput = readEvidenceInput(
      process.env.STACKR_TRANSFER_EVIDENCE_PATH,
      'transfer_evidence_path_missing',
      'transfer_evidence_unreadable',
      'transfer_evidence_json_invalid',
    );
    inputEvidence.transferEvidenceSha256 = transferInput.sha256;
    const storageInput = readEvidenceInput(
      process.env.STACKR_STORAGE_PROMOTION_EVIDENCE_PATH,
      'storage_promotion_evidence_path_missing',
      'storage_promotion_evidence_unreadable',
      'storage_promotion_evidence_json_invalid',
    );
    inputEvidence.storagePromotionEvidenceSha256 = storageInput.sha256;
    const promotionInputs = validatePromotionEvidenceInputs({
      transferEvidence: transferInput.value,
      storagePromotionEvidence: storageInput.value,
      config,
      languages,
      releaseLabel,
    });
    const database = validateProductionPostgresEndpoint(process.env.SUPABASE_DB_URL);
    client = new pg.Client({
      connectionString: database.normalized,
      application_name: 'stackr_production_catalogue_verifier',
    });
    await client.connect();
    await client.query('begin read only');
    await client.query("set local statement_timeout = '15min'");
    const rows = await queryEvidence(client, config, releaseLabel, promotionInputs);
    evidence = assessProductionCatalogueEvidence({
      ...rows,
      config,
      languages,
      releaseLabel,
      promotionInputs,
      ...inputEvidence,
    });
    await client.query('rollback');
  } catch (error) {
    try { await client?.query('rollback'); } catch { /* no transaction to roll back */ }
    evidence = {
      schemaVersion: REPORT_SCHEMA,
      verifiedAt: new Date().toISOString(),
      productionProjectRef: PRODUCTION_PROJECT_REF,
      releaseLabel,
      inputEvidence,
      productionModified: false,
      ok: false,
      errors: [safeErrorCode(error)],
    };
  } finally {
    await client?.end();
  }
  writeEvidence(outputPath, evidence);
  process.stdout.write(`${JSON.stringify({
    ok: evidence.ok,
    errorCount: evidence.errors.length,
    productionModified: false,
  })}\n`);
  if (!evidence.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('production_catalogue_verification_failed\n');
    process.exitCode = 1;
  });
}
