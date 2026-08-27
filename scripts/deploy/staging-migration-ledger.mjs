import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGING_LEDGER_SCHEMA_VERSION = 'stackr-staging-migration-ledger-v1.0.0';
export const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
export const DEFAULT_STAGING_LEDGER_MANIFEST = 'supabase/staging-migrations/manifest.json';
export const EXCLUDED_SYNTHETIC_FIXTURE =
  'supabase/staging-migrations/20260729191851_staging_critical_security_fixture.sql';

export const repositoryRoot = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);

export function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function singleStatementRemoteSha256(value) {
  const source = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
  return rawSha256(JSON.stringify([source]));
}

export function verifyGate0RemoteStatementContract(remoteRow, gate0Entry, manifest) {
  const errors = [];
  if (!remoteRow
    || remoteRow.version !== gate0Entry.version
    || remoteRow.name !== gate0Entry.name) {
    return ['staging_gate0_remote_migration_key_drift'];
  }
  if (remoteRow.statement_count !== 1) {
    errors.push('staging_gate0_remote_statement_count_drift');
  }
  if (remoteRow.firstStatementSha256 !== gate0Entry.sourceSha256) {
    errors.push('staging_gate0_remote_raw_statement_hash_drift');
  }
  if (remoteRow.remoteStatementsSha256
    !== manifest.expectedGate0RemoteStatementsSha256) {
    errors.push('staging_gate0_remote_statement_array_hash_drift');
  }
  return errors;
}

export function orderedVersionNameMd5(entries) {
  return createHash('md5')
    .update(entries.map((entry) => `${entry.version}|${entry.name}`).join('\n'))
    .digest('hex');
}

export function orderedRemoteStatementLedgerSha256(entries) {
  return createHash('sha256')
    .update(entries.map((entry) => (
      `${entry.version}|${entry.name}|${entry.remoteStatementsSha256}`
    )).join('\n'))
    .digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveRepositoryFile(relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'ledger_source_required');
  assert(relativePath === relativePath.replaceAll('\\', '/'), 'ledger_source_must_use_posix_separators');
  const candidate = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, candidate);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'ledger_source_outside_repository');
  const real = realpathSync(candidate);
  const realRelative = path.relative(repositoryRoot, real);
  assert(realRelative && !realRelative.startsWith('..') && !path.isAbsolute(realRelative), 'ledger_source_symlink_escape');
  return real;
}

function validateProvenance(entry, requireResolvableProvenance) {
  const provenance = entry.provenance;
  assert(provenance && typeof provenance === 'object', `staging_ledger_provenance_missing:${entry.version}`);

  if (entry.state === 'pending') {
    assert(
      provenance.kind === 'supabase-cli-generated-forward-migration'
        && provenance.cliVersion === '2.110.0',
      `invalid_pending_migration_provenance:${entry.version}`,
    );
    return;
  }

  if (provenance.kind === 'live-staging-ledger-reconstruction') {
    assert(
      provenance.projectRef === STAGING_PROJECT_REF,
      `invalid_live_ledger_provenance_project:${entry.version}`,
    );
    assert(
      Number.isFinite(Date.parse(provenance.capturedAt)),
      `invalid_live_ledger_provenance_time:${entry.version}`,
    );
    assert(
      entry.source.startsWith('supabase/staging-migrations/overrides/'),
      `invalid_live_ledger_provenance_source:${entry.version}`,
    );
    return;
  }

  assert(
    ['merged-main', 'historical-staging-override', 'historical-staging-exception']
      .includes(provenance.kind),
    `invalid_staging_ledger_provenance_kind:${entry.version}`,
  );
  assert(
    /^[0-9a-f]{40}$/.test(provenance.commit ?? ''),
    `invalid_staging_ledger_provenance_commit:${entry.version}`,
  );
  if (requireResolvableProvenance) {
    try {
      execFileSync(
        'git',
        ['cat-file', '-e', `${provenance.commit}^{commit}`],
        { cwd: repositoryRoot, stdio: 'ignore' },
      );
    } catch {
      throw new Error(`unresolvable_staging_ledger_provenance_commit:${entry.version}`);
    }
  }
}

export function loadStagingMigrationLedger(
  manifestPath = DEFAULT_STAGING_LEDGER_MANIFEST,
  { requireResolvableProvenance = false } = {},
) {
  const absoluteManifestPath = path.resolve(repositoryRoot, manifestPath);
  const manifestRelative = path.relative(repositoryRoot, absoluteManifestPath);
  assert(
    manifestRelative && !manifestRelative.startsWith('..') && !path.isAbsolute(manifestRelative),
    'ledger_manifest_outside_repository',
  );

  const manifest = JSON.parse(readFileSync(absoluteManifestPath, 'utf8'));
  assert(manifest.schemaVersion === STAGING_LEDGER_SCHEMA_VERSION, 'invalid_staging_ledger_schema_version');
  assert(manifest.environment === 'staging', 'invalid_staging_ledger_environment');
  assert(manifest.projectRef === STAGING_PROJECT_REF, 'invalid_staging_ledger_project_ref');
  assert(Array.isArray(manifest.entries) && manifest.entries.length > 0, 'staging_ledger_entries_required');
  assert(
    Array.isArray(manifest.excludedFixtures)
      && manifest.excludedFixtures.includes(EXCLUDED_SYNTHETIC_FIXTURE),
    'synthetic_fixture_exclusion_missing',
  );

  const seenVersions = new Set();
  let pendingSeen = false;
  let previousVersion = '';
  const resolvedEntries = manifest.entries.map((entry) => {
    assert(/^\d{14}$/.test(entry.version), `invalid_staging_ledger_version:${entry.version}`);
    assert(/^[a-z0-9_]+$/.test(entry.name), `invalid_staging_ledger_name:${entry.version}`);
    assert(['applied', 'pending'].includes(entry.state), `invalid_staging_ledger_state:${entry.version}`);
    assert(!seenVersions.has(entry.version), `duplicate_staging_ledger_version:${entry.version}`);
    assert(entry.version > previousVersion, `unordered_staging_ledger_version:${entry.version}`);
    if (entry.state === 'pending') pendingSeen = true;
    if (entry.state === 'applied' && pendingSeen) {
      throw new Error(`applied_migration_after_pending_entry:${entry.version}`);
    }

    const file = `${entry.version}_${entry.name}.sql`;
    assert(entry.file === file, `staging_ledger_file_key_mismatch:${entry.version}`);
    assert(entry.source !== EXCLUDED_SYNTHETIC_FIXTURE, 'synthetic_fixture_in_active_staging_ledger');
    validateProvenance(entry, requireResolvableProvenance);
    const sourcePath = resolveRepositoryFile(entry.source);
    const source = readFileSync(sourcePath);
    const sourceSha256 = rawSha256(source);
    assert(sourceSha256 === entry.sha256, `staging_ledger_source_hash_drift:${entry.version}`);

    seenVersions.add(entry.version);
    previousVersion = entry.version;
    return { ...entry, sourcePath, sourceSha256 };
  });

  const appliedEntries = resolvedEntries.filter((entry) => entry.state === 'applied');
  const pendingEntries = resolvedEntries.filter((entry) => entry.state === 'pending');
  assert(
    appliedEntries.length === manifest.expectedAppliedCount,
    'staging_ledger_applied_count_drift',
  );
  assert(
    orderedVersionNameMd5(appliedEntries) === manifest.expectedAppliedOrderedVersionNameMd5,
    'staging_ledger_applied_order_hash_drift',
  );
  assert(
    /^[0-9a-f]{64}$/.test(manifest.expectedAppliedRemoteStatementLedgerSha256 ?? ''),
    'staging_ledger_remote_statement_hash_missing',
  );
  assert(
    appliedEntries.slice(0, manifest.expectedCommonCount).length === manifest.expectedCommonCount,
    'staging_ledger_common_count_drift',
  );
  assert(
    orderedVersionNameMd5(appliedEntries.slice(0, manifest.expectedCommonCount))
      === manifest.expectedCommonOrderedVersionNameMd5,
    'staging_ledger_common_order_hash_drift',
  );
  assert(pendingEntries.length === 1, 'staging_ledger_requires_exactly_one_pending_migration');
  assert(
    pendingEntries[0].version === manifest.gate0MigrationVersion,
    'staging_ledger_gate0_version_drift',
  );
  assert(
    /^[0-9a-f]{64}$/.test(manifest.expectedGate0RemoteStatementsSha256 ?? ''),
    'staging_ledger_gate0_remote_statement_hash_missing',
  );
  assert(
    singleStatementRemoteSha256(readFileSync(pendingEntries[0].sourcePath))
      === manifest.expectedGate0RemoteStatementsSha256,
    'staging_ledger_gate0_remote_statement_hash_drift',
  );
  assert(
    manifest.expectedMaterializedCount === resolvedEntries.length,
    'staging_ledger_materialized_count_drift',
  );
  assert(
    orderedVersionNameMd5(resolvedEntries)
      === manifest.expectedMaterializedOrderedVersionNameMd5,
    'staging_ledger_materialized_order_hash_drift',
  );

  return {
    absoluteManifestPath,
    manifest,
    entries: resolvedEntries,
    appliedEntries,
    pendingEntries,
  };
}
