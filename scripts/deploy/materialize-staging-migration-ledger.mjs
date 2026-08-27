import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_STAGING_LEDGER_MANIFEST,
  loadStagingMigrationLedger,
  orderedVersionNameMd5,
  repositoryRoot,
} from './staging-migration-ledger.mjs';

const manifestPath = process.argv
  .find((argument) => argument.startsWith('--manifest='))
  ?.slice('--manifest='.length) ?? DEFAULT_STAGING_LEDGER_MANIFEST;
const outputArgument = process.argv
  .find((argument) => argument.startsWith('--output='))
  ?.slice('--output='.length);

if (!outputArgument) throw new Error('staging_ledger_output_required');
const outputRoot = path.resolve(outputArgument);
if (outputRoot === repositoryRoot || repositoryRoot.startsWith(`${outputRoot}${path.sep}`)) {
  throw new Error('unsafe_staging_ledger_output_path');
}

const ledger = loadStagingMigrationLedger(manifestPath);
const supabaseOutput = path.join(outputRoot, 'supabase');
const migrationsOutput = path.join(supabaseOutput, 'migrations');
mkdirSync(outputRoot);
mkdirSync(supabaseOutput);
mkdirSync(migrationsOutput);

copyFileSync(path.join(repositoryRoot, 'supabase/config.toml'), path.join(supabaseOutput, 'config.toml'));
for (const entry of ledger.entries) {
  copyFileSync(entry.sourcePath, path.join(migrationsOutput, entry.file));
}

const attestation = {
  schemaVersion: 'stackr-materialized-staging-ledger-v1.0.0',
  projectRef: ledger.manifest.projectRef,
  manifest: path.relative(repositoryRoot, ledger.absoluteManifestPath).replaceAll(path.sep, '/'),
  entryCount: ledger.entries.length,
  appliedCount: ledger.appliedEntries.length,
  pendingCount: ledger.pendingEntries.length,
  appliedRemoteStatementLedgerSha256:
    ledger.manifest.expectedAppliedRemoteStatementLedgerSha256,
  gate0RemoteStatementsSha256:
    ledger.manifest.expectedGate0RemoteStatementsSha256,
  orderedVersionNameMd5: orderedVersionNameMd5(ledger.entries),
  gate0MigrationVersion: ledger.manifest.gate0MigrationVersion,
};
writeFileSync(
  path.join(outputRoot, '.stackr-ledger-attestation.json'),
  `${JSON.stringify(attestation, null, 2)}\n`,
  { flag: 'wx' },
);

console.log(JSON.stringify({ ok: true, outputRoot, ...attestation }, null, 2));
