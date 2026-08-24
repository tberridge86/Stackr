import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

export const PREMIUM_SELLER_PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
export const PREMIUM_SELLER_MIGRATION_VERSION = '20260813135412';
export const PREMIUM_SELLER_MIGRATION_NAME = 'premium_seller_access_boundary';
export const PREMIUM_SELLER_MIGRATION_SHA256 = 'b106db75951d1c1600f640cd1e64ac80a02fe77355a2323221a8a94974e0ead0';

const PUBLIC_FUNCTION = 'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const INTERNAL_FUNCTION = 'private.commit_seller_inventory_batch_impl(text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const MIGRATION_PATH = `supabase/migrations/${PREMIUM_SELLER_MIGRATION_VERSION}_${PREMIUM_SELLER_MIGRATION_NAME}.sql`;
const ATOMIC_MIGRATION_PATH = 'supabase/migrations/20260822223828_atomic_seller_inventory_batches.sql';
const ATOMIC_MIGRATION_SHA256 = '8e4ea98ef3d5f5e7882a8ad3edf98b68b9d2af65638c1541a0d91e1c353199e1';
const ACTIONS = Object.freeze({
  enable_qa: Object.freeze({
    confirmation: 'ENABLE PREMIUM SELLER QA',
    targetEnabled: true,
    successMessage: 'Premium Seller runtime enabled for controlled QA.',
  }),
  disable: Object.freeze({
    confirmation: 'DISABLE PREMIUM SELLER NOW',
    targetEnabled: false,
    successMessage: 'Premium Seller runtime disabled.',
  }),
});

class SafeRuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SafeRuntimeError';
    this.safeCode = code;
  }
}

function fail(code) {
  throw new SafeRuntimeError(code);
}

export function resolvePremiumSellerRuntimeRequest({ action, confirmation }) {
  const normalizedAction = String(action ?? '').trim();
  const contract = ACTIONS[normalizedAction];
  if (!contract) fail('premium_seller_runtime_action_invalid');
  if (String(confirmation ?? '') !== contract.confirmation) {
    fail('premium_seller_runtime_confirmation_mismatch');
  }
  return { action: normalizedAction, ...contract };
}

function normalizedText(value) {
  return String(value).replace(/\r\n/g, '\n').trim();
}

export function loadReviewedPremiumSellerWrapperContract() {
  const migration = readFileSync(MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
  const sha256 = createHash('sha256').update(migration).digest('hex');
  if (sha256 !== PREMIUM_SELLER_MIGRATION_SHA256) {
    fail('premium_seller_migration_checksum_mismatch');
  }

  const functionStart = migration.indexOf('\ncreate function public.commit_seller_inventory_batch(');
  if (functionStart < 0) fail('premium_seller_wrapper_source_missing');
  const functionText = migration.slice(functionStart + 1);
  const sourceStart = functionText.indexOf('\nas $$');
  const sourceEnd = sourceStart < 0 ? -1 : functionText.indexOf('\n$$;', sourceStart + 6);
  if (sourceStart < 0 || sourceEnd < 0) fail('premium_seller_wrapper_source_missing');

  return normalizedText(functionText.slice(sourceStart + '\nas $$'.length, sourceEnd));
}

export function loadReviewedAtomicSellerImplementationContract() {
  const migration = readFileSync(ATOMIC_MIGRATION_PATH, 'utf8').replace(/\r\n/g, '\n');
  const sha256 = createHash('sha256').update(migration).digest('hex');
  if (sha256 !== ATOMIC_MIGRATION_SHA256) {
    fail('atomic_seller_migration_checksum_mismatch');
  }

  const functionStart = migration.indexOf('\ncreate or replace function public.commit_seller_inventory_batch(');
  if (functionStart < 0) fail('atomic_seller_implementation_source_missing');
  const functionText = migration.slice(functionStart + 1);
  const sourceStart = functionText.indexOf('\nas $$');
  const sourceEnd = sourceStart < 0 ? -1 : functionText.indexOf('\n$$;', sourceStart + 6);
  if (sourceStart < 0 || sourceEnd < 0) fail('atomic_seller_implementation_source_missing');

  return normalizedText(functionText.slice(sourceStart + '\nas $$'.length, sourceEnd));
}

export function safePremiumSellerRuntimeFailureCode(error) {
  if (error instanceof SafeRuntimeError) return error.safeCode;
  const knownGuardFailures = new Set([
    'invalid_database_url',
    'invalid_database_url_scheme',
    'invalid_database_url_credentials',
    'unsafe_postgres_connection_parameter:host',
    'unsafe_postgres_connection_parameter:hostaddr',
    'unsafe_postgres_connection_parameter:port',
    'unsafe_postgres_connection_parameter:user',
    'unsafe_postgres_connection_parameter:password',
    'unsafe_postgres_connection_parameter:dbname',
    'unsafe_postgres_connection_parameter:database',
    'unsafe_postgres_connection_parameter:service',
    'unsafe_postgres_connection_parameter:options',
    'database_url_project_mismatch',
    'database_url_role_mismatch',
    'database_url_host_mismatch',
    'database_url_password_missing',
  ]);
  return knownGuardFailures.has(error?.message)
    ? error.message
    : 'premium_seller_runtime_database_operation_failed';
}

function exactContract(actual, expected) {
  return actual && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

export async function assertPremiumSellerMigrationInstalled(client) {
  const result = await client.query(`
    select count(*)::int as matching_migrations
    from supabase_migrations.schema_migrations
    where version = $1 and name = $2
  `, [PREMIUM_SELLER_MIGRATION_VERSION, PREMIUM_SELLER_MIGRATION_NAME]);
  if (result.rows[0]?.matching_migrations !== 1) {
    fail('premium_seller_runtime_migration_missing');
  }
}

async function assertEmergencyDisableContract(client) {
  const result = await client.query(`
    select
      to_regclass('private.premium_seller_runtime_control') is not null as runtime_table_exists,
      coalesce((
        select count(*) = 3
          and count(*) filter (
            where column_name = 'singleton'
              and data_type = 'boolean'
              and is_nullable = 'NO'
          ) = 1
          and count(*) filter (
            where column_name = 'writes_enabled'
              and data_type = 'boolean'
              and is_nullable = 'NO'
          ) = 1
          and count(*) filter (
            where column_name = 'updated_at'
              and data_type = 'timestamp with time zone'
              and is_nullable = 'NO'
          ) = 1
        from information_schema.columns
        where table_schema = 'private'
          and table_name = 'premium_seller_runtime_control'
      ), false) as exact_columns,
      coalesce((
        select count(*) = 1
        from private.premium_seller_runtime_control
        where singleton
      ), false) as exact_singleton
  `);
  if (!exactContract(result.rows[0], {
    runtime_table_exists: true,
    exact_columns: true,
    exact_singleton: true,
  })) {
    fail('premium_seller_emergency_disable_contract_mismatch');
  }
}

export async function assertPremiumSellerRuntimeContract(
  client,
  expectedWrapperSource,
  expectedImplementationSource,
) {
  const result = await client.query(`
    with public_function as (
      select
        p.prosrc as wrapper_source,
        p.prosecdef as security_definer,
        owner.rolname as owner_name,
        coalesce(p.proconfig @> array['search_path=""'], false) as empty_search_path,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
        exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
      from pg_proc p
      join pg_roles owner on owner.oid = p.proowner
      where p.oid = to_regprocedure($1)
    ), internal_function as (
      select
        p.prosrc as implementation_source,
        not p.prosecdef as security_invoker,
        owner.rolname as owner_name,
        coalesce(p.proconfig @> array['search_path=""'], false) as empty_search_path,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
        exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ) as public_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
      from pg_proc p
      join pg_roles owner on owner.oid = p.proowner
      where p.oid = to_regprocedure($2)
    ), runtime_columns as (
      select
        count(*) = 3
          and count(*) filter (
            where column_name = 'singleton'
              and data_type = 'boolean'
              and is_nullable = 'NO'
              and column_default = 'true'
          ) = 1
          and count(*) filter (
            where column_name = 'writes_enabled'
              and data_type = 'boolean'
              and is_nullable = 'NO'
              and column_default = 'false'
          ) = 1
          and count(*) filter (
            where column_name = 'updated_at'
              and data_type = 'timestamp with time zone'
              and is_nullable = 'NO'
              and column_default = 'now()'
          ) = 1 as exact_columns
      from information_schema.columns
      where table_schema = 'private'
        and table_name = 'premium_seller_runtime_control'
    ), runtime_constraints as (
      select
        count(*) = 2
          and count(*) filter (
            where constraint_type = 'PRIMARY KEY'
              and constraint_definition = 'PRIMARY KEY (singleton)'
          ) = 1
          and count(*) filter (
            where constraint_type = 'CHECK'
              and constraint_definition = 'CHECK (singleton)'
          ) = 1 as exact_constraints
      from (
        select
          case constraint_row.contype
            when 'p' then 'PRIMARY KEY'
            when 'c' then 'CHECK'
            else constraint_row.contype::text
          end as constraint_type,
          pg_get_constraintdef(constraint_row.oid) as constraint_definition
        from pg_constraint constraint_row
        where constraint_row.conrelid = 'private.premium_seller_runtime_control'::regclass
      ) constraints
    )
    select
      public_function.wrapper_source,
      public_function.security_definer,
      public_function.owner_name as public_owner_name,
      public_function.empty_search_path,
      public_function.authenticated_can_execute,
      public_function.anon_can_execute,
      public_function.public_can_execute,
      public_function.service_can_execute,
      internal_function.security_invoker as internal_security_invoker,
      internal_function.implementation_source,
      internal_function.owner_name as internal_owner_name,
      internal_function.empty_search_path as internal_empty_search_path,
      internal_function.authenticated_can_execute as authenticated_can_execute_internal,
      internal_function.anon_can_execute as anon_can_execute_internal,
      internal_function.public_can_execute as public_can_execute_internal,
      internal_function.service_can_execute as service_can_execute_internal,
      (select owner.rolname
       from pg_class table_row
       join pg_roles owner on owner.oid = table_row.relowner
       where table_row.oid = 'private.premium_seller_runtime_control'::regclass)
        as runtime_owner_name,
      (select table_row.relrowsecurity
       from pg_class table_row
       where table_row.oid = 'private.premium_seller_runtime_control'::regclass)
        as runtime_rls_enabled,
      runtime_columns.exact_columns as runtime_exact_columns,
      runtime_constraints.exact_constraints as runtime_exact_constraints,
      not exists (
          select 1
          from pg_class runtime_table
          cross join lateral aclexplode(
            coalesce(runtime_table.relacl, acldefault('r', runtime_table.relowner))
          ) acl
          where runtime_table.oid = 'private.premium_seller_runtime_control'::regclass
            and acl.grantee = 0
        )
        and not has_table_privilege('anon', 'private.premium_seller_runtime_control', 'SELECT')
        and not has_table_privilege('anon', 'private.premium_seller_runtime_control', 'INSERT')
        and not has_table_privilege('anon', 'private.premium_seller_runtime_control', 'UPDATE')
        and not has_table_privilege('anon', 'private.premium_seller_runtime_control', 'DELETE')
        and not has_table_privilege('authenticated', 'private.premium_seller_runtime_control', 'SELECT')
        and not has_table_privilege('authenticated', 'private.premium_seller_runtime_control', 'INSERT')
        and not has_table_privilege('authenticated', 'private.premium_seller_runtime_control', 'UPDATE')
        and not has_table_privilege('authenticated', 'private.premium_seller_runtime_control', 'DELETE')
        and not has_table_privilege('service_role', 'private.premium_seller_runtime_control', 'SELECT')
        and not has_table_privilege('service_role', 'private.premium_seller_runtime_control', 'INSERT')
        and not has_table_privilege('service_role', 'private.premium_seller_runtime_control', 'UPDATE')
        and not has_table_privilege('service_role', 'private.premium_seller_runtime_control', 'DELETE')
        as runtime_api_roles_have_no_privileges,
      (select count(*)::int from private.premium_seller_runtime_control) as runtime_row_count,
      (select count(*)::int
       from private.premium_seller_runtime_control
       where singleton) as runtime_singleton_count
    from public_function
    cross join internal_function
    cross join runtime_columns
    cross join runtime_constraints
  `, [PUBLIC_FUNCTION, INTERNAL_FUNCTION]);

  const contract = result.rows[0];
  const wrapperMatches = normalizedText(contract?.wrapper_source) === expectedWrapperSource;
  const implementationMatches = normalizedText(contract?.implementation_source) === expectedImplementationSource;
  if (!wrapperMatches || !implementationMatches || !exactContract(contract, {
    security_definer: true,
    public_owner_name: 'postgres',
    empty_search_path: true,
    authenticated_can_execute: true,
    anon_can_execute: false,
    public_can_execute: false,
    service_can_execute: false,
    internal_security_invoker: true,
    internal_owner_name: 'postgres',
    internal_empty_search_path: true,
    authenticated_can_execute_internal: false,
    anon_can_execute_internal: false,
    public_can_execute_internal: false,
    service_can_execute_internal: false,
    runtime_owner_name: 'postgres',
    runtime_rls_enabled: true,
    runtime_exact_columns: true,
    runtime_exact_constraints: true,
    runtime_api_roles_have_no_privileges: true,
    runtime_row_count: 1,
    runtime_singleton_count: 1,
  })) {
    fail('premium_seller_runtime_contract_mismatch');
  }
}

async function assertSellerLedgersEmpty(client) {
  const result = await client.query(`
    select not exists (
      select 1 from public.seller_inventory_items
      union all
      select 1 from public.inventory_movements
      union all
      select 1 from public.seller_sale_transactions
      union all
      select 1 from public.seller_sale_transaction_items
      union all
      select 1 from private.seller_inventory_batch_commits
    ) as seller_ledgers_empty
  `);
  if (result.rows[0]?.seller_ledgers_empty !== true) {
    fail('premium_seller_qa_enable_requires_empty_ledgers');
  }
}

export async function setPremiumSellerRuntime({ connectionString, request }) {
  const expectedWrapperSource = request.action === 'enable_qa'
    ? loadReviewedPremiumSellerWrapperContract()
    : null;
  const expectedImplementationSource = request.action === 'enable_qa'
    ? loadReviewedAtomicSellerImplementationContract()
    : null;
  const { normalized } = normalizePostgresUrl(
    connectionString,
    PREMIUM_SELLER_PRODUCTION_PROJECT_REF,
  );
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: normalized,
    application_name: 'stackr_premium_seller_runtime_control',
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
  });

  await client.connect();
  let transactionOpen = false;
  try {
    await client.query('begin isolation level serializable');
    transactionOpen = true;
    await client.query("set local lock_timeout = '10s'");
    await client.query("select pg_advisory_xact_lock(hashtext('stackr.premium_seller_runtime_control'))");
    if (request.action === 'enable_qa') {
      await assertPremiumSellerMigrationInstalled(client);
      await assertPremiumSellerRuntimeContract(
        client,
        expectedWrapperSource,
        expectedImplementationSource,
      );
    } else {
      await assertEmergencyDisableContract(client);
    }

    const locked = await client.query(`
      select writes_enabled
      from private.premium_seller_runtime_control
      where singleton
      for update
    `);
    if (locked.rowCount !== 1) fail('premium_seller_runtime_singleton_mismatch');

    if (request.action === 'enable_qa') {
      if (locked.rows[0]?.writes_enabled !== false) {
        fail('premium_seller_qa_enable_requires_disabled_runtime');
      }
      await assertSellerLedgersEmpty(client);
    }

    const updated = await client.query(`
      update private.premium_seller_runtime_control
      set writes_enabled = $1,
          updated_at = clock_timestamp()
      where singleton
      returning writes_enabled
    `, [request.targetEnabled]);
    if (updated.rowCount !== 1 || updated.rows[0]?.writes_enabled !== request.targetEnabled) {
      fail('premium_seller_runtime_update_count_mismatch');
    }

    const readback = await client.query(`
      select count(*)::int as matching_rows
      from private.premium_seller_runtime_control
      where singleton and writes_enabled = $1
    `, [request.targetEnabled]);
    if (readback.rows[0]?.matching_rows !== 1) {
      fail('premium_seller_runtime_readback_mismatch');
    }

    await client.query('commit');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the original safe failure classification.
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const request = resolvePremiumSellerRuntimeRequest({
    action: process.env.STACKR_PREMIUM_SELLER_ACTION,
    confirmation: process.env.STACKR_PREMIUM_SELLER_CONFIRMATION,
  });
  if (process.argv.includes('--validate-request')) {
    console.log('Premium Seller runtime request validated.');
    return;
  }

  await setPremiumSellerRuntime({
    connectionString: process.env.STACKR_SOURCE_DB_URL,
    request,
  });
  console.log(request.successMessage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`premium_seller_runtime_update_failed:${safePremiumSellerRuntimeFailureCode(error)}`);
    process.exitCode = 1;
  });
}
