import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRollbackSafeMigrationSql } from './migration-transaction-safety.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const stagingEvidencePath = 'deploy/evidence/binder-artwork-read-staging-2026-09-06.json';
const productionBaselinePath = 'deploy/evidence/binder-artwork-read-production-baseline-2026-09-06.json';
const PRODUCTION_BASELINE_SHA256 = '792577ee4a2ac5a854182ee6dec25c78b3d4106710a5ec4c16959a5e0b7233fe';
const migrationDirectory = 'supabase/migrations';
const productionLockName = 'stackr.binder_artwork_read_preparation.v1';
const functionSignature = 'api.card_image_manifest_for_identities(uuid[],uuid[],uuid,uuid,integer)';
const EXPECTED_STAGE_FUNCTION_DEFINITION_MD5 = '5481adc1ec8be45d278e0d72a046c252';

export const REQUIRED_MIGRATIONS = Object.freeze([
  Object.freeze({
    filename: '20260906062835_index_asset_printing_identity.sql',
    version: '20260906062835',
    name: 'index_asset_printing_identity',
    sha256: '80e0898fdcb8b8cb678fe784e9ed260c67bc5457a98fd2f13a24728abb74ee94',
  }),
  Object.freeze({
    filename: '20260906062838_expose_bounded_card_image_identity_read.sql',
    version: '20260906062838',
    name: 'expose_bounded_card_image_identity_read',
    sha256: '4e4b17ae7b84e4e87e1ac3dd1914e524874f512ef3af9dc73cbecbc85bd469c4',
  }),
]);

function canonicalLf(value) {
  return String(value).replace(/\r\n/g, '\n');
}

export function sha256CanonicalLf(value) {
  return createHash('sha256').update(canonicalLf(value), 'utf8').digest('hex');
}

function readRepositoryFile(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

function requireMatch(value, pattern, code) {
  if (!pattern.test(value)) throw new Error(code);
}

function migrationSource(migration) {
  return canonicalLf(readRepositoryFile(`${migrationDirectory}/${migration.filename}`));
}

function assertIndexDefinitions(sql) {
  for (const pattern of [
    /create\s+index\s+(?:if\s+not\s+exists\s+)?assets_printing_identity_lookup_idx\s+on\s+catalog\.assets(?:\s+using\s+\w+)?\s*\(\s*printing_id\s*\)\s+include\s*\(\s*id\s*\)\s+where\s*\(?\s*printing_id\s+is\s+not\s+null\s*\)?/i,
    /create\s+index\s+(?:if\s+not\s+exists\s+)?catalogue_version_assets_variant_identity_idx\s+on\s+catalog\.catalogue_version_assets(?:\s+using\s+\w+)?\s*\(\s*variant_id\s*\)\s+include\s*\(\s*catalogue_version_id\s*,\s*asset_id\s*\)\s+where\s*\(?\s*variant_id\s+is\s+not\s+null\s*\)?/i,
    /create\s+index\s+(?:if\s+not\s+exists\s+)?catalogue_version_assets_printing_identity_idx\s+on\s+catalog\.catalogue_version_assets(?:\s+using\s+\w+)?\s*\(\s*printing_id\s*\)\s+include\s*\(\s*catalogue_version_id\s*,\s*asset_id\s*\)\s+where\s*\(?\s*printing_id\s+is\s+not\s+null\s*\)?/i,
  ]) requireMatch(sql, pattern, 'index_migration_definition_mismatch');
}

function assertIndexMigrationContract(sql) {
  requireMatch(sql, /set\s+lock_timeout\s*=\s*'1s'/i, 'index_migration_definition_mismatch');
  requireMatch(sql, /set\s+statement_timeout\s*=\s*'60s'/i, 'index_migration_definition_mismatch');
  assertIndexDefinitions(sql);
}

function assertFunctionDefinition(sql) {
  for (const pattern of [
    /create\s+or\s+replace\s+function\s+api\.card_image_manifest_for_identities\s*\(\s*p_variant_ids\s+uuid\[\]/i,
    /returns\s+setof\s+api\.asset_manifest/i,
    /language\s+plpgsql\s+stable\s+security\s+invoker\s+set\s+search_path\s+(?:=|to)\s*''/i,
    /cardinality\(p_variant_ids\)\s*>\s*100\s+or\s+cardinality\(p_printing_ids\)\s*>\s*100/i,
    /p_limit\s+is\s+null\s+or\s+p_limit\s*<\s*1\s+or\s+p_limit\s*>\s*1000/i,
    /from\s+api\.asset_manifest\s+m/i,
    /m\.asset_type\s*=\s*'card_image'/i,
    /\(m\.variant_id\s*=\s*any\(p_variant_ids\)\s+or\s+m\.printing_id\s*=\s*any\(p_printing_ids\)\)/i,
  ]) requireMatch(sql, pattern, 'rpc_migration_definition_mismatch');
}

function assertFunctionMigrationContract(sql) {
  assertFunctionDefinition(sql);
  requireMatch(sql, /revoke\s+all\s+on\s+function\s+api\.card_image_manifest_for_identities[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/i, 'rpc_migration_definition_mismatch');
  requireMatch(sql, /grant\s+execute\s+on\s+function\s+api\.card_image_manifest_for_identities[\s\S]*?to\s+service_role/i, 'rpc_migration_definition_mismatch');
}

export function validateRequiredMigrationSources() {
  const sources = new Map();
  for (const migration of REQUIRED_MIGRATIONS) {
    const sql = migrationSource(migration);
    if (sha256CanonicalLf(sql) !== migration.sha256) {
      throw new Error(`migration_checksum_mismatch:${migration.filename}`);
    }
    assertRollbackSafeMigrationSql(sql);
    if (migration.version === '20260906062835') assertIndexMigrationContract(sql);
    else assertFunctionMigrationContract(sql);
    sources.set(migration.version, sql);
  }
  return sources;
}

function readReleaseManifest() {
  const manifest = JSON.parse(readRepositoryFile('deploy/release-manifest.json'));
  const productionProjectRef = manifest?.components?.database?.projectRef;
  const stagingProjectRef = manifest?.components?.database?.stagingProjectRef;
  if (!/^[a-z]{20}$/.test(productionProjectRef ?? '')
    || !/^[a-z]{20}$/.test(stagingProjectRef ?? '')
    || productionProjectRef === stagingProjectRef) {
    throw new Error('release_manifest_database_identity_mismatch');
  }
  if (manifest?.releaseGates?.migrationHistoryAligned !== true
    || manifest?.releaseGates?.storageBackupVerified !== true) {
    throw new Error('release_manifest_baseline_or_backup_gate_missing');
  }
  return { productionProjectRef, stagingProjectRef };
}

export function validateStagingEvidence(expectedEvidenceSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedEvidenceSha256 ?? '')) {
    throw new Error('expected_staging_evidence_sha256_required');
  }
  const raw = readRepositoryFile(stagingEvidencePath);
  const evidenceSha256 = sha256CanonicalLf(raw);
  if (evidenceSha256 !== expectedEvidenceSha256) {
    throw new Error('staging_evidence_checksum_mismatch');
  }
  const evidence = JSON.parse(raw);
  const { productionProjectRef, stagingProjectRef } = readReleaseManifest();
  if (evidence?.schemaVersion !== 1
    || evidence?.stagingProjectRef !== stagingProjectRef
    || evidence?.productionProjectRef !== productionProjectRef
    || evidence?.equivalencePassed !== true
    || evidence?.planPassed !== true
    || evidence?.productionApplied !== false
    || !Array.isArray(evidence?.sampleResults)
    || evidence.sampleResults.length < 1) {
    throw new Error('staging_evidence_contract_mismatch');
  }
  for (const migration of REQUIRED_MIGRATIONS) {
    if (evidence?.migrationSha256?.[migration.filename] !== migration.sha256) {
      throw new Error(`staging_evidence_migration_checksum_mismatch:${migration.filename}`);
    }
  }
  const expectedLanguages = new Set(['en', 'ja', 'zh-cn', 'zh-tw']);
  const actualLanguages = new Set(evidence.sampleResults.map((sample) => sample?.language));
  if (evidence.sampleResults.length !== expectedLanguages.size
    || actualLanguages.size !== expectedLanguages.size
    || [...expectedLanguages].some((language) => !actualLanguages.has(language))) {
    throw new Error('staging_evidence_language_coverage_mismatch');
  }
  for (const sample of evidence.sampleResults) {
    if (!Number.isInteger(sample?.expectedRows) || !Number.isInteger(sample?.actualRows)
      || sample.expectedRows < 1 || sample.actualRows < 1
      || !Number.isInteger(sample?.variantCount) || sample.variantCount < 1
      || !Number.isInteger(sample?.printingCount) || sample.printingCount < 1
      || !Number.isFinite(sample?.rpcExecutionMs) || sample.rpcExecutionMs <= 0
      || sample.expectedRows !== sample.actualRows || sample.missingRows !== 0 || sample.extraRows !== 0) {
      throw new Error('staging_evidence_sample_equivalence_mismatch');
    }
  }
  if (evidence?.permissions?.securityInvoker !== true
    || evidence?.permissions?.emptySearchPath !== true
    || evidence?.permissions?.anonymousExecute !== false
    || evidence?.permissions?.authenticatedExecute !== false
    || evidence?.permissions?.serviceRoleExecute !== true
    || evidence?.validation?.paginationFullDtoDifferences !== 0
    || evidence?.validation?.invalidCasesRejected !== 7) {
    throw new Error('staging_evidence_permission_or_pagination_mismatch');
  }
  return { evidenceSha256, productionProjectRef, stagingProjectRef };
}

export function assertProductionDatabaseUrl(dbUrl, productionProjectRef) {
  let parsed;
  try {
    parsed = new URL(String(dbUrl));
  } catch {
    throw new Error('production_database_url_invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || decodeURIComponent(parsed.username) !== `postgres.${productionProjectRef}`) {
    throw new Error('production_database_url_project_ref_mismatch');
  }
}

function migrationKey({ version, name }) {
  return `${version}_${name}`;
}

function readProductionBaseline() {
  const raw = readRepositoryFile(productionBaselinePath);
  if (sha256CanonicalLf(raw) !== PRODUCTION_BASELINE_SHA256) {
    throw new Error('production_migration_baseline_checksum_mismatch');
  }
  const baseline = JSON.parse(raw);
  const { productionProjectRef } = readReleaseManifest();
  if (baseline?.schemaVersion !== 1 || baseline?.projectRef !== productionProjectRef
    || baseline?.rowCount !== 122 || !Array.isArray(baseline?.rows)
    || baseline.rows.length !== baseline.rowCount) {
    throw new Error('production_migration_baseline_contract_mismatch');
  }
  const keys = baseline.rows.map(migrationKey);
  if (keys.some((key) => !/^\d{14}_[A-Za-z0-9_]+$/.test(key))
    || new Set(keys).size !== keys.length
    || JSON.stringify(keys) !== JSON.stringify([...keys].sort())) {
    throw new Error('production_migration_baseline_rows_invalid');
  }
  return baseline.rows;
}

export function assessMigrationHistory(remoteRows) {
  if (!Array.isArray(remoteRows)) throw new Error('migration_history_result_invalid');
  const remoteKeys = remoteRows.map(migrationKey);
  const targetKeys = REQUIRED_MIGRATIONS.map(migrationKey);
  const presentTargets = targetKeys.filter((key) => remoteKeys.includes(key));
  if (new Set(remoteKeys).size !== remoteKeys.length
    || JSON.stringify(remoteKeys) !== JSON.stringify([...remoteKeys].sort())
    || JSON.stringify(remoteKeys.filter((key) => !targetKeys.includes(key)))
      !== JSON.stringify(readProductionBaseline().map(migrationKey))) {
    throw new Error('production_migration_history_not_exact_baseline');
  }
  if (presentTargets.length !== 0 && presentTargets.length !== targetKeys.length) {
    throw new Error('production_migration_history_partial_target_state');
  }
  return {
    pending: REQUIRED_MIGRATIONS.filter((migration) => !presentTargets.includes(migrationKey(migration))),
    applied: REQUIRED_MIGRATIONS.filter((migration) => presentTargets.includes(migrationKey(migration))),
  };
}

async function assertMigrationHistorySchema(client) {
  const result = await client.query(`
    select a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) as type_name
    from pg_catalog.pg_attribute a
    where a.attrelid = 'supabase_migrations.schema_migrations'::regclass
      and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  `);
  const columns = new Map(result.rows.map((row) => [row.attname, row.type_name]));
  if (columns.get('version') !== 'text' || columns.get('name') !== 'text'
    || columns.get('statements') !== 'text[]') {
    throw new Error('migration_history_schema_mismatch');
  }
}

async function postApplyContract(client) {
  const result = await client.query(`
    with expected_indexes(index_name, relation_name, predicate_column, included_columns, include_definition) as (
      values
        ('assets_printing_identity_lookup_idx'::text, 'catalog.assets'::text, 'printing_id'::text, 2::int, 'id'::text),
        ('catalogue_version_assets_variant_identity_idx'::text, 'catalog.catalogue_version_assets'::text, 'variant_id'::text, 3::int, 'catalogue_version_id, asset_id'::text),
        ('catalogue_version_assets_printing_identity_idx'::text, 'catalog.catalogue_version_assets'::text, 'printing_id'::text, 3::int, 'catalogue_version_id, asset_id'::text)
    ), index_contract as (
      select bool_and(
        idx.indexrelid is not null
        and idx.indisvalid and idx.indisready and idx.indislive and not idx.indisunique
        and method.amname = 'btree'
        and idx.indnkeyatts = 1 and idx.indnatts = expected_indexes.included_columns
        and idx.indexprs is null and not idx.indnullsnotdistinct
        and pg_catalog.pg_get_indexdef(idx.indexrelid) ~
          ('^CREATE INDEX ' || expected_indexes.index_name || ' ON ' || expected_indexes.relation_name
            || ' USING btree \\(' || expected_indexes.predicate_column
            || '\\) INCLUDE \\(' || expected_indexes.include_definition || '\\) WHERE \\('
            || expected_indexes.predicate_column || ' IS NOT NULL\\)$')
      ) as indexes_exact
      from expected_indexes
      left join pg_catalog.pg_class index_rel on index_rel.relname = expected_indexes.index_name
      left join pg_catalog.pg_index idx on idx.indexrelid = index_rel.oid
      left join pg_catalog.pg_am method on method.oid = index_rel.relam
    ), function_contract as (
      select
        p.oid is not null as rpc_exists,
        not p.prosecdef as security_invoker,
        coalesce(p.proconfig @> array['search_path=""'], false) as empty_search_path,
        p.provolatile = 's' as stable,
        md5(pg_catalog.pg_get_functiondef(p.oid)) as definition_md5,
        md5(pg_catalog.pg_get_viewdef('api.asset_manifest'::regclass, true)) as manifest_definition_md5,
        (select c.reloptions @> array['security_invoker=true']
         from pg_catalog.pg_class c where c.oid = 'api.asset_manifest'::regclass) as manifest_security_invoker,
        not has_function_privilege('anon', p.oid, 'EXECUTE')
          and not has_function_privilege('authenticated', p.oid, 'EXECUTE') as public_client_effective_denied,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as backend_effective_allowed,
        not exists (
          select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_denied,
        not exists (
          select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where role.rolname in ('anon', 'authenticated') and acl.privilege_type = 'EXECUTE'
        ) as anon_and_authenticated_denied,
        exists (
          select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where role.rolname = 'service_role' and acl.privilege_type = 'EXECUTE'
        ) as service_role_allowed
      from (select to_regprocedure($1) as oid) target
      left join pg_catalog.pg_proc p on p.oid = target.oid
    )
    select index_contract.indexes_exact, function_contract.*
    from index_contract cross join function_contract
  `, [functionSignature]);
  const expected = {
    indexes_exact: true,
    rpc_exists: true,
    security_invoker: true,
    empty_search_path: true,
    stable: true,
    public_denied: true,
    anon_and_authenticated_denied: true,
    service_role_allowed: true,
    definition_md5: EXPECTED_STAGE_FUNCTION_DEFINITION_MD5,
    manifest_definition_md5: 'd7b6a320951b70ec3969c2612cc7ebfa',
    manifest_security_invoker: true,
    public_client_effective_denied: true,
    backend_effective_allowed: true,
  };
  const contract = result.rows[0] ?? {};
  for (const [key, value] of Object.entries(expected)) {
    if (contract[key] !== value) throw new Error('post_apply_schema_or_security_contract_mismatch');
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`invalid_argument:${argument}`);
    values.set(match[1], match[2]);
  }
  const allowed = new Set(['db-url', 'project-ref', 'expected-evidence-sha256', 'apply']);
  for (const key of values.keys()) if (!allowed.has(key)) throw new Error(`unknown_argument:${key}`);
  return {
    dbUrl: values.get('db-url') ?? '',
    projectRef: values.get('project-ref') ?? '',
    evidenceSha256: values.get('expected-evidence-sha256') ?? '',
    apply: values.get('apply') === 'true',
  };
}

function nonsecretResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function prepareBinderArtworkRead({ dbUrl, projectRef, evidenceSha256, apply }, createClient = createVerifiedSupabasePostgresClient) {
  const sources = validateRequiredMigrationSources();
  const evidence = validateStagingEvidence(evidenceSha256);
  if (projectRef !== evidence.productionProjectRef) throw new Error('production_project_ref_mismatch');
  if (!dbUrl) throw new Error('production_database_url_required');
  assertProductionDatabaseUrl(dbUrl, evidence.productionProjectRef);
  const client = createClient(dbUrl, 'stackr_binder_artwork_read_preparation');
  await client.connect();
  try {
    await client.query('begin');
    try {
      await client.query("set local lock_timeout = '1s'");
      await client.query("set local statement_timeout = '60s'");
      await client.query("set local idle_in_transaction_session_timeout = '60s'");
      await client.query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))", [productionLockName]);
      await assertMigrationHistorySchema(client);
      const history = await client.query(`
        select version, name from supabase_migrations.schema_migrations order by version, name
      `);
      const state = assessMigrationHistory(history.rows);
      if (state.applied.length) await postApplyContract(client);
      if (state.pending.length && !apply) {
        await client.query('rollback');
        return {
          ok: true, mode: 'verify_only', evidenceSha256: evidence.evidenceSha256,
          expectedFunctionDefinitionMd5: EXPECTED_STAGE_FUNCTION_DEFINITION_MD5,
          migrationSha256: Object.fromEntries(REQUIRED_MIGRATIONS.map((migration) => [migration.filename, migration.sha256])),
          pendingMigrations: state.pending.map((migration) => migration.filename),
          appliedMigrations: state.applied.map((migration) => migration.filename),
        };
      }
      for (const migration of state.pending) {
        await client.query(sources.get(migration.version));
        await client.query(`
          insert into supabase_migrations.schema_migrations (version, name, statements)
          values ($1, $2, $3::text[])
        `, [migration.version, migration.name, [sources.get(migration.version)]]);
      }
      await postApplyContract(client);
      await client.query('commit');
      return {
        ok: true, mode: apply ? 'applied' : 'already_applied', evidenceSha256: evidence.evidenceSha256,
        expectedFunctionDefinitionMd5: EXPECTED_STAGE_FUNCTION_DEFINITION_MD5,
        migrationSha256: Object.fromEntries(REQUIRED_MIGRATIONS.map((migration) => [migration.filename, migration.sha256])),
        pendingMigrations: state.pending.map((migration) => migration.filename),
        appliedMigrations: state.applied.map((migration) => migration.filename),
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  const result = await prepareBinderArtworkRead(argumentsValue);
  nonsecretResult(result);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`binder_artwork_read_preparation_failed:${error.message}\n`);
    process.exitCode = 1;
  });
}
