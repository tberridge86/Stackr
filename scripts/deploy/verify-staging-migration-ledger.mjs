import {
  DEFAULT_STAGING_LEDGER_MANIFEST,
  loadStagingMigrationLedger,
  orderedRemoteStatementLedgerSha256,
  orderedVersionNameMd5,
  verifyGate0RemoteStatementContract,
} from './staging-migration-ledger.mjs';

const manifestPath = process.argv
  .find((argument) => argument.startsWith('--manifest='))
  ?.slice('--manifest='.length) ?? DEFAULT_STAGING_LEDGER_MANIFEST;
const phase = process.argv
  .find((argument) => argument.startsWith('--phase='))
  ?.slice('--phase='.length) ?? 'local';
const dbUrlEnvironment = process.argv
  .find((argument) => argument.startsWith('--db-url-env='))
  ?.slice('--db-url-env='.length) ?? 'STACKR_SOURCE_DB_URL';
const requireResolvableProvenance = process.argv.includes(
  '--require-resolvable-provenance',
);
const requirePending = process.argv.includes('--require-pending');

if (!['local', 'pre-apply', 'post-apply'].includes(phase)) {
  throw new Error(`invalid_staging_ledger_verification_phase:${phase}`);
}

const ledger = loadStagingMigrationLedger(manifestPath, {
  requireResolvableProvenance,
  requirePending,
});
const result = {
  ok: true,
  phase,
  projectRef: ledger.manifest.projectRef,
  localEntryCount: ledger.entries.length,
  expectedAppliedCount: ledger.appliedEntries.length,
  pendingCount: ledger.pendingEntries.length,
  appliedOrderedVersionNameMd5: orderedVersionNameMd5(ledger.appliedEntries),
  expectedAppliedRemoteStatementLedgerSha256:
    ledger.manifest.expectedAppliedRemoteStatementLedgerSha256,
  gate0MigrationVersion: ledger.manifest.gate0MigrationVersion,
  expectedGate0RemoteStatementsSha256:
    ledger.manifest.expectedGate0RemoteStatementsSha256,
  requireResolvableProvenance,
  errors: [],
};

if (phase !== 'local') {
  if (process.env.SUPABASE_PROJECT_REF !== ledger.manifest.projectRef) {
    result.errors.push('staging_ledger_project_ref_mismatch');
  }
  const dbUrl = process.env[dbUrlEnvironment];
  if (!dbUrl) result.errors.push(`missing_staging_ledger_database_url:${dbUrlEnvironment}`);

  if (result.errors.length === 0) {
    const { createVerifiedSupabasePostgresClient } = await import(
      './verified-supabase-postgres.mjs'
    );
    const client = createVerifiedSupabasePostgresClient(
      dbUrl,
      `stackr-staging-ledger-${phase}`,
      { statement_timeout: 30_000, query_timeout: 35_000 },
    );
    let connected = false;
    let readOnlyTransactionOpen = false;
    try {
      await client.connect();
      connected = true;
      await client.query('begin read only');
      readOnlyTransactionOpen = true;
      const remoteResult = await client.query(`
        select
          version,
          name,
          cardinality(statements)::int as statement_count,
          encode(
            extensions.digest(array_to_json(statements)::text, 'sha256'),
            'hex'
          ) as "remoteStatementsSha256",
          encode(
            extensions.digest(statements[1], 'sha256'),
            'hex'
          ) as "firstStatementSha256"
        from supabase_migrations.schema_migrations
        order by version
      `);
      await client.query('rollback');
      readOnlyTransactionOpen = false;

      const preApplyStates = phase === 'pre-apply'
        ? [ledger.appliedEntries, ledger.entries]
        : [ledger.entries];
      const expectedEntries = preApplyStates.find(
        (entries) => entries.length === remoteResult.rows.length,
      ) ?? preApplyStates[0];
      result.remoteEntryCount = remoteResult.rows.length;
      result.expectedRemoteEntryCounts = preApplyStates.map((entries) => entries.length);
      result.remoteOrderedVersionNameMd5 = orderedVersionNameMd5(remoteResult.rows);
      result.expectedRemoteOrderedVersionNameMd5 = orderedVersionNameMd5(expectedEntries);
      result.remoteState = remoteResult.rows.length === ledger.appliedEntries.length
        ? 'gate0-pending'
        : remoteResult.rows.length === ledger.entries.length
        ? 'gate0-applied'
        : 'drifted';
      result.applyRequired = result.remoteState === 'gate0-pending';

      if (requirePending && result.remoteState !== 'gate0-pending') {
        result.errors.push('staging_gate0_migration_not_exactly_pending');
      }

      if (!preApplyStates.some((entries) => entries.length === remoteResult.rows.length)) {
        result.errors.push('staging_remote_migration_count_drift');
      }
      const comparisonCount = Math.min(remoteResult.rows.length, expectedEntries.length);
      for (let index = 0; index < comparisonCount; index += 1) {
        const remote = remoteResult.rows[index];
        const expected = expectedEntries[index];
        if (remote.version !== expected.version || remote.name !== expected.name) {
          result.errors.push(`staging_remote_migration_key_drift:${index}:${expected.version}`);
          continue;
        }
        if (!Number.isInteger(remote.statement_count) || remote.statement_count <= 0) {
          result.errors.push(`staging_remote_migration_statements_missing:${expected.version}`);
        }
      }

      if (remoteResult.rows.length >= ledger.appliedEntries.length) {
        const remoteAppliedStatementLedgerSha256 = orderedRemoteStatementLedgerSha256(
          remoteResult.rows.slice(0, ledger.appliedEntries.length),
        );
        result.remoteAppliedStatementLedgerSha256 = remoteAppliedStatementLedgerSha256;
        result.expectedAppliedRemoteStatementLedgerSha256 =
          ledger.manifest.expectedAppliedRemoteStatementLedgerSha256;
        if (remoteAppliedStatementLedgerSha256
          !== ledger.manifest.expectedAppliedRemoteStatementLedgerSha256) {
          result.errors.push('staging_remote_statement_ledger_hash_drift');
        }
      }
      if (result.remoteState === 'gate0-applied') {
        const gate0Row = remoteResult.rows.at(-1);
        result.gate0RemoteStatementsSha256 = gate0Row?.remoteStatementsSha256;
        result.gate0RemoteFirstStatementSha256 = gate0Row?.firstStatementSha256;
        result.errors.push(...verifyGate0RemoteStatementContract(
          gate0Row,
          ledger.pendingEntries[0],
          ledger.manifest,
        ));
      }
    } catch (error) {
      result.errors.push(`staging_remote_ledger_query_failed:${safeErrorCode(error)}`);
    } finally {
      if (readOnlyTransactionOpen) {
        try {
          await client.query('rollback');
          readOnlyTransactionOpen = false;
        } catch (error) {
          result.errors.push(
            `staging_remote_ledger_rollback_failed:${safeErrorCode(error)}`,
          );
        }
      }
      if (connected) {
        try {
          await client.end();
        } catch (error) {
          result.errors.push(
            `staging_remote_ledger_connection_cleanup_failed:${safeErrorCode(error)}`,
          );
        }
      }
    }
  }
}

function safeErrorCode(error) {
  const code = String(error?.code ?? 'unknown');
  return /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'unknown';
}

result.ok = result.errors.length === 0;
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
