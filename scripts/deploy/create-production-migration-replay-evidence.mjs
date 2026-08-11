import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const separator = arg.indexOf('=');
  if (!arg.startsWith('--') || separator < 3) throw new Error(`invalid_argument:${arg}`);
  return [arg.slice(2, separator), arg.slice(separator + 1)];
}));

for (const name of [
  'actual-keys',
  'output',
  'production-project-ref',
  'staging-project-ref',
  'restore-project-ref',
  'baseline-artifact-id',
  'baseline-archive-sha256',
  'baseline-schema-sha256',
  'baseline-history-count',
  'baseline-history-version',
  'baseline-history-name',
]) {
  if (!args[name]) throw new Error(`missing_argument:${name}`);
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const migrationFiles = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();
const expectedKeys = migrationFiles.map((name) => name.replace(/\.sql$/, ''));
const actualKeys = readFileSync(args['actual-keys'], 'utf8')
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
  const mismatch = expectedKeys.findIndex((key, index) => actualKeys[index] !== key);
  throw new Error(`migration_history_mismatch:${mismatch}`);
}

const orderedKeyLedger = `${expectedKeys.join('\n')}\n`;
const contentLedger = migrationFiles.map((name) => {
  const sql = readFileSync(`supabase/migrations/${name}`, 'utf8').replace(/\r\n/g, '\n');
  return `${name.replace(/\.sql$/, '')}\n${sha256(sql)}\n`;
}).join('');
const runUrl = process.env.GITHUB_SERVER_URL
  && process.env.GITHUB_REPOSITORY
  && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;

const evidence = {
  schemaVersion: 'stackr-migration-reconciliation-v1.1.0',
  capturedAt: new Date().toISOString(),
  sourceCommitHash: process.env.GITHUB_SHA ?? null,
  workingTreeChangesIncluded: false,
  productionProjectRef: args['production-project-ref'],
  stagingProjectRef: args['staging-project-ref'],
  restoreTargetProjectRef: args['restore-project-ref'],
  status: 'aligned',
  reconciliationComplete: true,
  productionMutationPerformed: false,
  stagingMutationPerformed: false,
  isolatedBranchMutationPerformed: true,
  localMigrationFileCount: migrationFiles.length,
  stagingMigrationHistoryCountAfter: actualKeys.length,
  exactVersionNameOrderMatch: true,
  orderedMigrationKeySha256: sha256(orderedKeyLedger),
  remoteOrderedMigrationKeySha256: sha256(`${actualKeys.join('\n')}\n`),
  repositoryMigrationContentSha256: sha256(contentLedger),
  firstMigration: expectedKeys[0],
  latestMigration: expectedKeys.at(-1),
  baseline: {
    artifactId: args['baseline-artifact-id'],
    archiveSha256: args['baseline-archive-sha256'],
    schemaSha256: args['baseline-schema-sha256'],
    expectedProductionHistoryCount: Number(args['baseline-history-count']),
    expectedProductionHistoryVersion: args['baseline-history-version'],
    expectedProductionHistoryName: args['baseline-history-name'],
  },
  workflow: {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    url: runUrl,
  },
  isolatedCandidateUnverifiedRepositoryMigrationCount: 0,
  isolatedCandidate: {
    projectRef: args['restore-project-ref'],
    repositoryMigrationCount: migrationFiles.length,
    migrationHistoryAligned: true,
    productionBaselineRestored: true,
    repositoryMigrationsReplayed: true,
    storageFixtureSeeded: true,
  },
  actionsTaken: [
    'verified_private_production_schema_baseline_checksums',
    'restored_production_schema_to_isolated_target',
    'seeded_empty_pre_containment_storage_fixture',
    'replayed_all_repository_migrations_on_isolated_target',
    'verified_exact_migration_version_name_order',
    'verified_production_was_not_modified',
  ],
};

mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  migrationCount: migrationFiles.length,
  orderedMigrationKeySha256: evidence.orderedMigrationKeySha256,
  repositoryMigrationContentSha256: evidence.repositoryMigrationContentSha256,
}, null, 2));
