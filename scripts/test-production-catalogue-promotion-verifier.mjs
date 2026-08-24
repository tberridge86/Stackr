import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assessProductionCatalogueEvidence,
  digestRows,
  readPromotionConfig,
  requiredLanguages,
  validateProductionPostgresEndpoint,
  validatePromotionEvidenceInputs,
} from './deploy/verify-production-catalogue-promotion.mjs';

const stagingProjectRef = 'lmwfhvexfcoyeuoyrlco';
const productionProjectRef = 'oakdbbzdqwurpjnoqhmu';
const releaseLabel = 'release-test';
const languages = requiredLanguages('zh-tw,en,ja,zh-cn');

const direct = validateProductionPostgresEndpoint(
  `postgresql://postgres:p%40ss@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=require`,
);
assert.equal(direct.endpointKind, 'direct');
assert.doesNotMatch(direct.normalized, /p@ss/);
const pooler = validateProductionPostgresEndpoint(
  `postgres://postgres.${productionProjectRef}:password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=10`,
);
assert.equal(pooler.endpointKind, 'shared_session_pooler');
for (const unsafeUrl of [
  `postgres://postgres.${productionProjectRef}:password@db.${stagingProjectRef}.supabase.co:5432/postgres`,
  `postgres://postgres:password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
  `postgres://postgres:password@db.${productionProjectRef}.supabase.co:6543/postgres`,
  `postgres://postgres:password@db.${productionProjectRef}.supabase.co:5432/not-postgres`,
  `postgres://postgres:password@db.${productionProjectRef}.supabase.co:5432/postgres?password=override`,
]) {
  assert.throws(() => validateProductionPostgresEndpoint(unsafeUrl));
}
assert.deepEqual(languages, ['en', 'ja', 'zh-cn', 'zh-tw']);
assert.throws(() => requiredLanguages('en,ja,zh-cn,ko'));

const config = readPromotionConfig();
const migrationRows = config.adoptedMigrations.map(({ version, name }) => ({
  version,
  statements: [`-- adopted ${version}`],
  name,
}));
const versionRows = languages.map((language, index) => ({
  id: `00000000-0000-0000-0000-00000000000${index + 1}`,
  version_key: `${language}-release`,
  version_label: releaseLabel,
  language_code: language,
  status: 'published',
  coverage_summary: {
    controlledStagingSnapshot: false,
    releaseEligible: true,
    sets: 1,
    storedCardRecords: 2,
  },
  release_eligible: true,
  controlled_staging: false,
  summary_sets: 1,
  summary_stored_card_records: 2,
  set_count: 1,
  printing_count: 2,
  variant_count: 3,
  asset_count: 4,
  external_identifier_count: 5,
  wrong_language_rows: 0,
}));
const releaseDigestRows = versionRows.map((row) => ({
  id: row.id,
  version_key: row.version_key,
  version_label: row.version_label,
  language_code: row.language_code,
  status: row.status,
  coverage_summary: row.coverage_summary,
}));
const sharedStorageContract = {
  indexDefinition: 'CREATE INDEX assets_storage_object_idx ON catalog.assets (storage_key)',
  functionDefinition: 'CREATE FUNCTION catalog.enforce_shared_asset_storage_object_identity() RETURNS trigger',
  triggerName: 'enforce_shared_asset_storage_object_identity',
  triggerDefinition: 'CREATE TRIGGER enforce_shared_asset_storage_object_identity BEFORE INSERT ON catalog.assets',
  serviceRoleExecute: true,
  publicExecute: false,
  anonExecute: false,
  authenticatedExecute: false,
};
const sharedStorageDataInvariant = {
  invalid_required_metadata_count: 0,
  conflicting_shared_object_count: 0,
};
const sharedStorageContractSha256 = digestRows([sharedStorageContract]);
const transferTables = config.tables.map((table) => {
  const tableDigest = digestRows([{ id: table }]);
  return {
    table,
    primaryKey: ['id'],
    transferColumns: ['id'],
    sourceRowCount: 1,
    matchedSourceRowCount: 1,
    targetRowCountAfterCommit: 1,
    expectedFinalSha256: tableDigest,
    targetAfterCommitSha256: tableDigest,
    preCommitMatched: true,
    commitMatched: true,
    targetSequencesDuringRehearsal: [],
    targetSequencesAfterCommit: [],
  };
});
const transferEvidence = {
  schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.1.0',
  sourceProjectRef: stagingProjectRef,
  targetProjectRef: productionProjectRef,
  productionProjectRef,
  sourceReadOnly: true,
  productionMutationPerformed: true,
  stagingMutationPerformed: false,
  isolatedCandidateMutationPerformed: false,
  targetTransactionCommitted: true,
  preCommitAcceptanceVerified: true,
  transferPolicy: 'replace_allowlisted_production_catalogue_tables_with_verified_staging_release_rows',
  targetRollbackVerified: null,
  targetCommitVerified: true,
  catalogueRelease: {
    versionLabel: releaseLabel,
    requiredLanguages: languages,
    sourceVersionIds: versionRows.map((row) => row.id),
    releaseVersionSha256: digestRows(releaseDigestRows),
    promotionScope: 'complete_allowlisted_catalogue_snapshot',
    productionAssetUrlRewriteCount: 4,
  },
  selectedTableCount: transferTables.length,
  sourceRowCount: transferTables.length,
  matchedSourceRowCount: transferTables.length,
  tables: transferTables,
  migrationProvenance: {
    configuredCount: config.adoptedMigrations.length,
    insertedCount: 0,
    sourceMigrationFingerprint: digestRows(migrationRows),
    sourceMigrations: migrationRows.map((row) => ({
      version: row.version,
      name: row.name,
      statementsSha256: digestRows([row.statements]),
    })),
    targetCommitVerified: true,
    targetRollbackVerified: null,
  },
  sharedStorageObjectSchemaContract: {
    sourceFingerprint: sharedStorageContractSha256,
    targetBeforeFingerprint: 'e'.repeat(64),
    targetTransferFingerprint: sharedStorageContractSha256,
    targetCommitVerified: true,
    targetRollbackVerified: null,
    sourceDataInvariant: sharedStorageDataInvariant,
    targetDataInvariant: sharedStorageDataInvariant,
  },
};
const copiedObjectSha256 = 'c'.repeat(64);
const storagePromotionEvidence = {
  schemaVersion: 'stackr-production-catalogue-storage-promotion-v1.1.0',
  promotionMode: 'copy',
  status: 'copy_complete',
  sourceProjectRef: stagingProjectRef,
  targetProjectRef: productionProjectRef,
  bucket: 'stackr-catalogue-public',
  sourceObjectCount: 1,
  sourceByteSize: 5,
  targetObjectCountBefore: 0,
  sourceInventorySha256: 'd'.repeat(64),
  copiedObjects: [{
    name: `catalogue/${copiedObjectSha256}/card.webp`,
    bytes: 5,
    sha256: copiedObjectSha256,
    preCopyDatabaseReferenceCount: 0,
    createdByThisRun: true,
  }],
  existingProductionObjectsRetained: true,
  existingProductionObjectsContentHashVerified: true,
  retainedProductionObjectCount: 0,
  retainedProductionByteSize: 0,
  retainedProductionContentHashVerifiedCount: 0,
  providerRequestsPerformed: false,
  copiedObjectCount: 1,
  copiedByteSize: 5,
  copiedContentHashVerifiedCount: 1,
  targetObjectCountAfter: 1,
  inventoryMatchedSourceObjectCount: 1,
  ok: true,
};

const promotionInputs = validatePromotionEvidenceInputs({
  transferEvidence,
  storagePromotionEvidence,
  config,
  languages,
  releaseLabel,
});
assert.equal(promotionInputs.transfer.tables.length, config.tables.length);
assert.equal(promotionInputs.storage.copiedObjectCount, 1);

const tableRows = transferTables.map((table) => ({
  table_name: table.table,
  exists: true,
  primary_key: table.primaryKey,
  row_count: table.targetRowCountAfterCommit,
  sha256: table.targetAfterCommitSha256,
  sequences: table.targetSequencesAfterCommit,
}));
const assessmentArguments = {
  tableRows,
  migrationRows,
  versionRows,
  storageRow: {
    storage_backed_count: 4,
    missing_storage_location_count: 0,
    public_storage_count: 4,
    public_url_mismatch_count: 0,
  },
  storageObjectRow: {
    bucket_exists: true,
    bucket_public: true,
    catalogue_storage_key_count: 4,
    live_storage_object_count: 4,
    missing_storage_object_count: 0,
    invalid_expected_size_count: 0,
    storage_object_size_mismatch_count: 0,
    invalid_content_hash_count: 0,
    storage_key_hash_mismatch_count: 0,
    shared_metadata_conflict_count: 0,
  },
  sharedStorageContract,
  sharedStorageDataInvariant,
  config,
  languages,
  releaseLabel,
  promotionInputs,
  transferEvidenceSha256: 'a'.repeat(64),
  storagePromotionEvidenceSha256: 'b'.repeat(64),
};
const evidence = assessProductionCatalogueEvidence(assessmentArguments);
assert.equal(evidence.ok, true);
assert.equal(evidence.productionModified, false);
assert.equal(evidence.releaseVersions.length, 4);
assert.equal(evidence.tables.length, config.tables.length);
assert.equal(evidence.adoptedMigrations.fingerprintMatched, true);
assert.equal(evidence.sharedStorageObjectContract.fingerprintMatched, true);
assert.equal(evidence.sharedStorageObjectContract.dataInvariantMatched, true);
assert.equal(evidence.storage.liveObjects.missingObjects, 0);
assert.equal(evidence.inputEvidence.transferEvidenceSha256, 'a'.repeat(64));
assert.equal(evidence.inputEvidence.storagePromotionEvidenceSha256, 'b'.repeat(64));

const digestMismatchEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  tableRows: tableRows.map((row, index) => (
    index === 0 ? { ...row, sha256: 'f'.repeat(64) } : row
  )),
});
assert.equal(digestMismatchEvidence.ok, false);
assert.ok(digestMismatchEvidence.errors.some((error) => error.startsWith('promotion_table_digest_mismatch:')));

const statementMismatchEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  migrationRows: migrationRows.map((row, index) => (
    index === 0 ? { ...row, statements: ['tampered'] } : row
  )),
});
assert.equal(statementMismatchEvidence.ok, false);
assert.ok(statementMismatchEvidence.errors.some((error) => error.startsWith('adopted_migration_statements_mismatch:')));
assert.ok(statementMismatchEvidence.errors.includes('adopted_migration_fingerprint_mismatch'));

const missingStorageObjectEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  storageObjectRow: {
    ...assessmentArguments.storageObjectRow,
    live_storage_object_count: 3,
    missing_storage_object_count: 1,
  },
});
assert.equal(missingStorageObjectEvidence.ok, false);
assert.ok(missingStorageObjectEvidence.errors.includes('live_storage_object_missing'));

const sizeAndHashMismatchEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  storageObjectRow: {
    ...assessmentArguments.storageObjectRow,
    storage_object_size_mismatch_count: 1,
    storage_key_hash_mismatch_count: 1,
  },
});
assert.equal(sizeAndHashMismatchEvidence.ok, false);
assert.ok(sizeAndHashMismatchEvidence.errors.includes('live_storage_object_size_mismatch'));
assert.ok(sizeAndHashMismatchEvidence.errors.includes('live_storage_object_hash_mismatch'));

const sequenceMismatchEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  tableRows: tableRows.map((row, index) => (
    index === 0
      ? {
          ...row,
          sequences: [{
            column: 'id',
            schema: 'catalog',
            sequence: 'unexpected_sequence',
            startValue: '1',
            lastValue: '2',
            isCalled: true,
          }],
        }
      : row
  )),
});
assert.equal(sequenceMismatchEvidence.ok, false);
assert.ok(sequenceMismatchEvidence.errors.some(
  (error) => error.startsWith('promotion_table_sequence_state_mismatch:'),
));

const sharedContractMismatchEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  sharedStorageContract: { ...sharedStorageContract, publicExecute: true },
});
assert.equal(sharedContractMismatchEvidence.ok, false);
assert.ok(sharedContractMismatchEvidence.errors.includes('shared_storage_object_contract_privileges_invalid'));
assert.ok(sharedContractMismatchEvidence.errors.includes('shared_storage_object_contract_fingerprint_mismatch'));

const missingSharedContractEvidence = assessProductionCatalogueEvidence({
  ...assessmentArguments,
  sharedStorageContract: null,
});
assert.equal(missingSharedContractEvidence.ok, false);
assert.ok(missingSharedContractEvidence.errors.includes('shared_storage_object_contract_missing'));

assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence: { ...transferEvidence, productionMutationPerformed: false },
    storagePromotionEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /transfer_evidence_commit_invalid/,
);
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence,
    storagePromotionEvidence: { ...storagePromotionEvidence, targetProjectRef: stagingProjectRef },
    config,
    languages,
    releaseLabel,
  }),
  /storage_promotion_evidence_project_refs_invalid/,
);
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence: {
      ...transferEvidence,
      catalogueRelease: { ...transferEvidence.catalogueRelease, versionLabel: 'different-release' },
    },
    storagePromotionEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /transfer_evidence_release_invalid/,
);
const retainedUnverifiedStorageEvidence = {
  ...storagePromotionEvidence,
  sourceObjectCount: 2,
  sourceByteSize: 10,
  targetObjectCountBefore: 1,
  targetObjectCountAfter: 2,
  inventoryMatchedSourceObjectCount: 2,
  existingProductionObjectsContentHashVerified: false,
  retainedProductionObjectCount: 1,
  retainedProductionByteSize: 5,
  retainedProductionContentHashVerifiedCount: 1,
};
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence,
    storagePromotionEvidence: retainedUnverifiedStorageEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /storage_promotion_evidence_retained_objects_unverified/,
);
assert.doesNotThrow(
  () => validatePromotionEvidenceInputs({
    transferEvidence,
    storagePromotionEvidence: {
      ...retainedUnverifiedStorageEvidence,
      existingProductionObjectsContentHashVerified: true,
    },
    config,
    languages,
    releaseLabel,
  }),
);
for (const [field, value] of [
  ['retainedProductionObjectCount', 0],
  ['retainedProductionByteSize', 4],
  ['retainedProductionContentHashVerifiedCount', 0],
]) {
  assert.throws(
    () => validatePromotionEvidenceInputs({
      transferEvidence,
      storagePromotionEvidence: {
        ...retainedUnverifiedStorageEvidence,
        existingProductionObjectsContentHashVerified: true,
        [field]: value,
      },
      config,
      languages,
      releaseLabel,
    }),
    /storage_promotion_evidence_retained_totals_invalid/,
  );
}
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence: { ...transferEvidence, sharedStorageObjectSchemaContract: undefined },
    storagePromotionEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /transfer_evidence_shared_storage_contract_invalid/,
);
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence: {
      ...transferEvidence,
      sharedStorageObjectSchemaContract: {
        ...transferEvidence.sharedStorageObjectSchemaContract,
        targetTransferFingerprint: 'f'.repeat(64),
      },
    },
    storagePromotionEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /transfer_evidence_shared_storage_contract_invalid/,
);
assert.throws(
  () => validatePromotionEvidenceInputs({
    transferEvidence: {
      ...transferEvidence,
      tables: transferEvidence.tables.map((table, index) => (
        index === 0
          ? {
              ...table,
              targetSequencesAfterCommit: [{
                column: 'id',
                schema: 'catalog',
                sequence: 'tampered_sequence',
                startValue: '1',
                lastValue: '1',
                isCalled: true,
              }],
            }
          : table
      )),
    },
    storagePromotionEvidence,
    config,
    languages,
    releaseLabel,
  }),
  /transfer_evidence_sequence_state_invalid/,
);

const evidenceDirectory = mkdtempSync(path.join(tmpdir(), 'stackr-production-catalogue-verifier-'));
try {
  const transferPath = path.join(evidenceDirectory, 'transfer.json');
  const storagePath = path.join(evidenceDirectory, 'storage.json');
  const evidencePath = path.join(evidenceDirectory, 'evidence.json');
  writeFileSync(transferPath, `${JSON.stringify(transferEvidence)}\n`);
  writeFileSync(storagePath, `${JSON.stringify(storagePromotionEvidence)}\n`);
  const rejected = spawnSync(process.execPath, [
    'scripts/deploy/verify-production-catalogue-promotion.mjs',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPABASE_DB_URL: `postgres://postgres:super-secret@db.${stagingProjectRef}.supabase.co:5432/postgres`,
      STACKR_CATALOGUE_RELEASE_LABEL: releaseLabel,
      STACKR_REQUIRED_CATALOGUE_LANGUAGES: languages.join(','),
      STACKR_TRANSFER_TABLE_CONFIG: 'deploy/production-catalogue-promotion-tables.json',
      STACKR_TRANSFER_EVIDENCE_PATH: transferPath,
      STACKR_STORAGE_PROMOTION_EVIDENCE_PATH: storagePath,
      STACKR_PRODUCTION_CATALOGUE_EVIDENCE_PATH: evidencePath,
    },
    encoding: 'utf8',
  });
  assert.notEqual(rejected.status, 0);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /super-secret/);
  const rejectedEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(rejectedEvidence.ok, false);
  assert.equal(rejectedEvidence.productionModified, false);
  assert.deepEqual(rejectedEvidence.errors, ['production_database_url_invalid']);
  assert.match(rejectedEvidence.inputEvidence.transferEvidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(rejectedEvidence.inputEvidence.storagePromotionEvidenceSha256, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(rejectedEvidence), /super-secret|postgres:/);

  const missingInputEvidencePath = path.join(evidenceDirectory, 'missing-input-evidence.json');
  const missingInputEnvironment = {
    ...process.env,
    STACKR_CATALOGUE_RELEASE_LABEL: releaseLabel,
    STACKR_REQUIRED_CATALOGUE_LANGUAGES: languages.join(','),
    STACKR_TRANSFER_TABLE_CONFIG: 'deploy/production-catalogue-promotion-tables.json',
    STACKR_PRODUCTION_CATALOGUE_EVIDENCE_PATH: missingInputEvidencePath,
  };
  delete missingInputEnvironment.STACKR_TRANSFER_EVIDENCE_PATH;
  delete missingInputEnvironment.STACKR_STORAGE_PROMOTION_EVIDENCE_PATH;
  delete missingInputEnvironment.SUPABASE_DB_URL;
  const missingInput = spawnSync(process.execPath, [
    'scripts/deploy/verify-production-catalogue-promotion.mjs',
  ], {
    cwd: process.cwd(),
    env: missingInputEnvironment,
    encoding: 'utf8',
  });
  assert.notEqual(missingInput.status, 0);
  const missingInputEvidence = JSON.parse(readFileSync(missingInputEvidencePath, 'utf8'));
  assert.deepEqual(missingInputEvidence.errors, ['transfer_evidence_path_missing']);
  assert.equal(missingInputEvidence.productionModified, false);
} finally {
  rmSync(evidenceDirectory, { recursive: true, force: true });
}

const source = readFileSync('scripts/deploy/verify-production-catalogue-promotion.mjs', 'utf8');
assert.match(source, /STACKR_TRANSFER_EVIDENCE_PATH/);
assert.match(source, /STACKR_STORAGE_PROMOTION_EVIDENCE_PATH/);
assert.match(source, /begin read only/);
assert.match(source, /set local statement_timeout/);
assert.match(source, /join storage\.objects/);
assert.match(source, /existingProductionObjectsContentHashVerified/);
assert.match(source, /enforce_shared_asset_storage_object_identity/);
assert.match(source, /pg_get_serial_sequence/);
assert.doesNotMatch(source, /\b(?:insert|update|delete|alter|create|drop)\s+(?:into|table|from|index|function)\b/i);
process.stdout.write('production catalogue verifier tests passed\n');
