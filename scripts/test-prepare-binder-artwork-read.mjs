import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  REQUIRED_MIGRATIONS,
  assessMigrationHistory,
  assertProductionDatabaseUrl,
  prepareBinderArtworkRead,
  sha256CanonicalLf,
  validateRequiredMigrationSources,
  validateStagingEvidence,
} from './deploy/prepare-binder-artwork-read.mjs';

const evidenceRaw = readFileSync('deploy/evidence/binder-artwork-read-staging-2026-09-06.json', 'utf8');
const evidenceDigest = sha256CanonicalLf(evidenceRaw);

const sources = validateRequiredMigrationSources();
assert.equal(sources.size, 2, 'both exact migration sources must pass the additive/security contract');
assert.equal(validateStagingEvidence(evidenceDigest).productionProjectRef, 'oakdbbzdqwurpjnoqhmu');
assert.throws(() => validateStagingEvidence('0'.repeat(64)), /staging_evidence_checksum_mismatch/);
assert.doesNotThrow(() => assertProductionDatabaseUrl(
  'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  'oakdbbzdqwurpjnoqhmu',
));
assert.throws(
  () => assertProductionDatabaseUrl('postgresql://postgres.lmwfhvexfcoyeuoyrlco:x@example.supabase.co/postgres', 'oakdbbzdqwurpjnoqhmu'),
  /production_database_url_project_ref_mismatch/,
);

const workflow = readFileSync('.github/workflows/prepare-binder-artwork-read.yml', 'utf8');
assert.match(workflow, /permissions:\s+contents: read\s+actions: read/,
  'the reviewer-rule inspection requires explicit read-only Actions access');
assert.match(workflow, /environment:\s+production/);
assert.match(workflow, /stackr-production-deployment/);
assert.match(workflow, /production_environment_required_reviewer_protection_missing/);
assert.match(workflow, /gh api --method GET "repos\/\$GITHUB_REPOSITORY\/environments\/production"/);
assert.match(workflow, /supabase@2\.110\.0 backups list/);
assert.match(workflow, /supabase@2\.110\.0 db dump/);
assert.match(workflow, /verify-backup\.mjs/);
assert.doesNotMatch(workflow, /supabase@2\.110\.0 db push/);
const hereDocProbe = execFileSync(process.execPath, [
  '--input-type=module', '-', 'deploy/evidence/binder-artwork-read-staging-2026-09-06.json',
], {
  input: "import { readFileSync } from 'node:fs'; process.stdout.write(JSON.parse(readFileSync(process.argv[2], 'utf8')).stagingProjectRef);",
  encoding: 'utf8',
});
assert.equal(hereDocProbe, 'lmwfhvexfcoyeuoyrlco', 'workflow here-doc must receive the file path as argv[2]');

// This is a frozen production snapshot, deliberately not an assertion that staging-only files are live.
const productionBaseline = JSON.parse(readFileSync(
  'deploy/evidence/binder-artwork-read-production-baseline-2026-09-06.json', 'utf8',
));
const repositoryRows = productionBaseline.rows;
const targetKeys = new Set(REQUIRED_MIGRATIONS.map(({ version, name }) => `${version}_${name}`));
const preApplyRows = repositoryRows.filter(({ version, name }) => !targetKeys.has(`${version}_${name}`));
const pending = assessMigrationHistory(preApplyRows);
assert.deepEqual(pending.pending.map(({ version }) => version), ['20260906062835', '20260906062838']);
assert.equal(pending.applied.length, 0);
const repeated = assessMigrationHistory([...repositoryRows, ...REQUIRED_MIGRATIONS]);
assert.equal(repeated.pending.length, 0, 'a fully recorded repeat must not reapply migrations');
assert.equal(repeated.applied.length, 2);
assert.throws(
  () => assessMigrationHistory([...preApplyRows, { version: '99999999999999', name: 'unexpected' }]),
  /production_migration_history_not_exact_baseline/,
);

const postApplyRow = {
  indexes_exact: true,
  rpc_exists: true,
  security_invoker: true,
  empty_search_path: true,
  stable: true,
  public_denied: true,
  anon_and_authenticated_denied: true,
  service_role_allowed: true,
  definition_md5: '5481adc1ec8be45d278e0d72a046c252',
  manifest_definition_md5: 'd7b6a320951b70ec3969c2612cc7ebfa',
  manifest_security_invoker: true,
  public_client_effective_denied: true,
  backend_effective_allowed: true,
};

function mockClient(historyRows, { failWhen = null, postApplyOverrides = {} } = {}) {
  const queries = [];
  const client = {
    queries,
    async connect() { queries.push('connect'); },
    async end() { queries.push('end'); },
    async query(text) {
      const normalized = String(text).replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (failWhen && normalized.includes(failWhen)) throw new Error('forced_transaction_failure');
      if (normalized.includes('pg_catalog.pg_attribute')) {
        return { rows: [
          { attname: 'version', type_name: 'text' },
          { attname: 'name', type_name: 'text' },
          { attname: 'statements', type_name: 'text[]' },
        ] };
      }
      if (normalized.includes('select version, name from supabase_migrations.schema_migrations')) {
        return { rows: historyRows };
      }
      if (normalized.includes('with expected_indexes')) return { rows: [{ ...postApplyRow, ...postApplyOverrides }] };
      return { rows: [] };
    },
  };
  return client;
}

const invocation = {
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  projectRef: 'oakdbbzdqwurpjnoqhmu',
  evidenceSha256: evidenceDigest,
};
const verifyClient = mockClient(preApplyRows);
const verifyOnly = await prepareBinderArtworkRead({ ...invocation, apply: false }, () => verifyClient);
assert.equal(verifyOnly.mode, 'verify_only');
assert.equal(verifyClient.queries.some((query) => query.startsWith('insert into supabase_migrations')), false);
assert.equal(verifyClient.queries.at(-2), 'rollback');

const applyClient = mockClient(preApplyRows);
const applied = await prepareBinderArtworkRead({ ...invocation, apply: true }, () => applyClient);
assert.equal(applied.mode, 'applied');
assert.equal(applyClient.queries.filter((query) => query.startsWith('insert into supabase_migrations')).length, 2);
assert.equal(applyClient.queries.includes('commit'), true);

const failureClient = mockClient(preApplyRows, { failWhen: 'insert into supabase_migrations' });
await assert.rejects(
  prepareBinderArtworkRead({ ...invocation, apply: true }, () => failureClient),
  /forced_transaction_failure/,
);
assert.equal(failureClient.queries.includes('rollback'), true, 'failed apply must roll back its transaction');
for (const postApplyOverrides of [
  { indexes_exact: false },
  { definition_md5: 'unexpected' },
  { manifest_definition_md5: 'unexpected' },
  { manifest_security_invoker: false },
  { public_client_effective_denied: false },
  { backend_effective_allowed: false },
]) {
  const unsafeClient = mockClient(preApplyRows, { postApplyOverrides });
  await assert.rejects(
    prepareBinderArtworkRead({ ...invocation, apply: true }, () => unsafeClient),
    /post_apply_schema_or_security_contract_mismatch/,
  );
  assert.equal(unsafeClient.queries.includes('rollback'), true);
  assert.equal(unsafeClient.queries.includes('commit'), false);
}
assert.throws(
  () => assessMigrationHistory([...preApplyRows, preApplyRows.at(-1)]),
  /production_migration_history_not_exact_baseline/,
);
assert.throws(
  () => assessMigrationHistory(preApplyRows.slice(1)),
  /production_migration_history_not_exact_baseline/,
);
assert.throws(
  () => assessMigrationHistory([preApplyRows[1], preApplyRows[0], ...preApplyRows.slice(2)]),
  /production_migration_history_not_exact_baseline/,
);
assert.throws(
  () => assessMigrationHistory([...preApplyRows, REQUIRED_MIGRATIONS[0]]),
  /production_migration_history_partial_target_state/,
);
assert.throws(
  () => assessMigrationHistory([...preApplyRows, { version: '20260906062835', name: 'wrong_target_name' }]),
  /production_migration_history_not_exact_baseline/,
);

console.log(JSON.stringify({
  ok: true,
  migrationSha256: Object.fromEntries(REQUIRED_MIGRATIONS.map(({ filename, sha256 }) => [filename, sha256])),
  stagingEvidenceSha256: evidenceDigest,
}, null, 2));
