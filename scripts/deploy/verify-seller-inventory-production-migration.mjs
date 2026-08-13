import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const EXPECTED_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const EXPECTED_BEFORE = Object.freeze({
  count: 105,
  version: '20260813093320',
  name: 'atomic_seller_inventory_batches',
});
const EXPECTED_AFTER = Object.freeze({
  count: 106,
  version: '20260813135412',
  name: 'premium_seller_access_boundary',
});
const PUBLIC_FUNCTION = 'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const INTERNAL_FUNCTION = 'private.commit_seller_inventory_batch_impl(text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const TARGET_MIGRATION = '20260813135412_premium_seller_access_boundary';
const TARGET_MIGRATION_SHA256 = 'b106db75951d1c1600f640cd1e64ac80a02fe77355a2323221a8a94974e0ead0';

function repositoryMigrationKeys() {
  return readdirSync('supabase/migrations')
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => name.slice(0, -4));
}

function digestKeys(keys) {
  return createHash('sha256').update(`${keys.join('\n')}\n`).digest('hex');
}

function targetMigrationSha256() {
  const contents = readFileSync(`supabase/migrations/${TARGET_MIGRATION}.sql`, 'utf8')
    .replace(/\r\n/g, '\n');
  return createHash('sha256').update(contents).digest('hex');
}

function expectedState() {
  if (process.argv.includes('--before')) return EXPECTED_BEFORE;
  if (process.argv.includes('--after')) return EXPECTED_AFTER;
  throw new Error('verification_phase_required');
}

function exactContract(contract, expected) {
  return contract && Object.entries(expected).every(([key, value]) => contract[key] === value);
}

async function verifyBefore(client, errors) {
  const result = await client.query(`
    select
      to_regprocedure($1) is not null as public_function_exists,
      to_regclass('private.seller_inventory_batch_commits') is not null as receipt_table_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'inventory_movements'
          and column_name = 'inventory_item_id'
      ) as movement_column_exists,
      to_regclass('public.inventory_movements_user_item_idx') is not null as movement_index_exists,
      to_regclass('private.premium_seller_runtime_control') is not null as runtime_control_exists,
      to_regprocedure($2) is not null as internal_function_exists,
      coalesce((select not p.prosecdef from pg_proc p where p.oid = to_regprocedure($1)), false)
        as public_function_is_invoker,
      has_table_privilege('authenticated', 'public.seller_inventory_items', 'INSERT')
        as authenticated_can_insert_inventory
  `, [PUBLIC_FUNCTION, INTERNAL_FUNCTION]);
  if (!exactContract(result.rows[0], {
    public_function_exists: true,
    receipt_table_exists: true,
    movement_column_exists: true,
    movement_index_exists: true,
    runtime_control_exists: false,
    internal_function_exists: false,
    public_function_is_invoker: true,
    authenticated_can_insert_inventory: true,
  })) errors.push('premium_seller_pre_state_mismatch');
}

async function verifyAfter(client, errors) {
  const result = await client.query(`
    with public_function as (
      select
        p.prosecdef as security_definer,
        owner.rolname as owner_name,
        coalesce(p.proconfig @> array['search_path=""'], false) as empty_search_path,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
        has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
      from pg_proc p
      join pg_roles owner on owner.oid = p.proowner
      where p.oid = $1::regprocedure
    ), internal_function as (
      select
        not p.prosecdef as security_invoker,
        owner.rolname as owner_name,
        coalesce(p.proconfig @> array['search_path=""'], false) as empty_search_path,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
        has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
      from pg_proc p
      join pg_roles owner on owner.oid = p.proowner
      where p.oid = $2::regprocedure
    ), seller_policies as (
      select
        count(*)::int as policy_count,
        count(*) filter (where policy.polcmd = 'r')::int as read_policy_count
      from pg_policy policy
      join pg_class table_rel on table_rel.oid = policy.polrelid
      join pg_namespace table_schema on table_schema.oid = table_rel.relnamespace
      where table_schema.nspname = 'public'
        and table_rel.relname in (
          'seller_inventory_items',
          'inventory_movements',
          'seller_sale_transactions',
          'seller_sale_transaction_items'
        )
    )
    select
      public_function.security_definer,
      public_function.owner_name as public_owner_name,
      public_function.empty_search_path,
      public_function.authenticated_can_execute,
      public_function.anon_can_execute,
      public_function.public_can_execute,
      public_function.service_can_execute,
      internal_function.security_invoker as internal_security_invoker,
      internal_function.owner_name as internal_owner_name,
      internal_function.empty_search_path as internal_empty_search_path,
      internal_function.authenticated_can_execute as authenticated_can_execute_internal,
      internal_function.anon_can_execute as anon_can_execute_internal,
      internal_function.public_can_execute as public_can_execute_internal,
      internal_function.service_can_execute as service_can_execute_internal,
      (select relrowsecurity from pg_class where oid = 'private.premium_seller_runtime_control'::regclass)
        as runtime_rls_enabled,
      (select bool_and(table_rel.relrowsecurity)
       from pg_class table_rel
       join pg_namespace table_schema on table_schema.oid = table_rel.relnamespace
       where table_schema.nspname = 'public'
         and table_rel.relname in (
           'seller_inventory_items',
           'inventory_movements',
           'seller_sale_transactions',
           'seller_sale_transaction_items'
         )) as seller_tables_rls_enabled,
      (select relrowsecurity from pg_class where oid = 'private.seller_inventory_batch_commits'::regclass)
        as receipt_rls_enabled,
      (select not writes_enabled from private.premium_seller_runtime_control where singleton)
        as disabled_by_default,
      not has_table_privilege('authenticated', 'private.premium_seller_runtime_control', 'SELECT')
        as runtime_authenticated_cannot_select,
      not has_table_privilege('service_role', 'private.premium_seller_runtime_control', 'SELECT')
        as runtime_service_cannot_select,
      has_table_privilege('authenticated', 'public.seller_inventory_items', 'SELECT')
        as authenticated_can_read_inventory,
      not has_table_privilege('authenticated', 'public.seller_inventory_items', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'TRUNCATE')
        as authenticated_cannot_mutate_inventory,
      has_table_privilege('authenticated', 'public.inventory_movements', 'SELECT')
        as authenticated_can_read_movements,
      not has_table_privilege('authenticated', 'public.inventory_movements', 'INSERT')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'DELETE')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'TRUNCATE')
        as authenticated_cannot_mutate_movements,
      has_table_privilege('authenticated', 'public.seller_sale_transactions', 'SELECT')
        as authenticated_can_read_sales,
      not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'TRUNCATE')
        as authenticated_cannot_mutate_sales,
      has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'SELECT')
        as authenticated_can_read_sale_items,
      not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'TRUNCATE')
        as authenticated_cannot_mutate_sale_items,
      has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'SELECT')
        as authenticated_can_read_receipts,
      not has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'INSERT')
        as authenticated_cannot_insert_receipts,
      exists (
        select 1 from pg_policy policy
        where policy.polrelid = 'private.seller_inventory_batch_commits'::regclass
          and policy.polcmd = 'r'
      ) as receipt_select_policy_exists,
      not exists (
        select 1 from pg_policy policy
        where policy.polrelid = 'private.seller_inventory_batch_commits'::regclass
          and policy.polcmd <> 'r'
      ) as receipt_has_no_write_policy,
      not has_sequence_privilege('authenticated', 'public.seller_sale_transaction_items_id_seq', 'USAGE')
        as authenticated_cannot_use_sale_sequence,
      has_table_privilege('authenticated', 'public.user_card_flags', 'INSERT')
        and has_table_privilege('authenticated', 'public.user_card_flags', 'UPDATE')
        and has_table_privilege('authenticated', 'public.user_card_flags', 'DELETE')
        as casual_listing_writes_unchanged,
      seller_policies.policy_count = 4 and seller_policies.read_policy_count = 4
        as seller_policies_are_read_only,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'inventory_movements'
          and column_name = 'inventory_item_id'
      ) as inventory_item_id_exists,
      to_regclass('public.inventory_movements_user_item_idx') is not null as movement_index_exists
    from public_function
    cross join internal_function
    cross join seller_policies
  `, [PUBLIC_FUNCTION, INTERNAL_FUNCTION]);

  const contract = result.rows[0] ?? null;
  const expected = {
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
    runtime_rls_enabled: true,
    seller_tables_rls_enabled: true,
    receipt_rls_enabled: true,
    disabled_by_default: true,
    runtime_authenticated_cannot_select: true,
    runtime_service_cannot_select: true,
    authenticated_can_read_inventory: true,
    authenticated_cannot_mutate_inventory: true,
    authenticated_can_read_movements: true,
    authenticated_cannot_mutate_movements: true,
    authenticated_can_read_sales: true,
    authenticated_cannot_mutate_sales: true,
    authenticated_can_read_sale_items: true,
    authenticated_cannot_mutate_sale_items: true,
    authenticated_can_read_receipts: true,
    authenticated_cannot_insert_receipts: true,
    receipt_select_policy_exists: true,
    receipt_has_no_write_policy: true,
    authenticated_cannot_use_sale_sequence: true,
    casual_listing_writes_unchanged: true,
    seller_policies_are_read_only: true,
    inventory_item_id_exists: true,
    movement_index_exists: true,
  };
  if (!exactContract(contract, expected)) errors.push('premium_seller_contract_mismatch');

  await client.query('begin read only');
  try {
    await client.query("select set_config('request.jwt.claims', '{}', true)");
    try {
      await client.query(`select public.commit_seller_inventory_batch(
        'production-verification-unauthenticated', '[]'::jsonb, '[]'::jsonb,
        '[]'::jsonb, null::jsonb, '[]'::jsonb
      )`);
      errors.push('unauthenticated_rpc_was_not_rejected');
    } catch (error) {
      if (error?.message !== 'seller_inventory_authentication_required') {
        errors.push('unexpected_unauthenticated_rpc_result');
      }
    }
  } finally {
    await client.query('rollback');
  }

  await client.query('begin read only');
  try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({
      sub: '00000000-0000-0000-0000-000000000001',
      role: 'authenticated',
      app_metadata: { stackr_premium_seller: true },
    })]);
    try {
      await client.query(`select public.commit_seller_inventory_batch(
        'seller-batch:00000000-0000-0000-0000-000000000002:production-verification',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null::jsonb, '[]'::jsonb
      )`);
      errors.push('request_identity_mismatch_was_not_rejected');
    } catch (error) {
      if (error?.message !== 'seller_inventory_request_identity_mismatch') {
        errors.push('unexpected_request_identity_guard_result');
      }
    }
  } finally {
    await client.query('rollback');
  }
  return contract;
}

async function main() {
  const expected = expectedState();
  const connectionString = String(process.env.STACKR_SOURCE_DB_URL ?? '').trim();
  const parsed = new URL(connectionString);
  if (decodeURIComponent(parsed.username) !== `postgres.${EXPECTED_PROJECT_REF}`) {
    throw new Error('production_database_url_guard_mismatch');
  }

  const client = new pg.Client({ connectionString, application_name: 'stackr_premium_seller_migration_verifier' });
  await client.connect();
  try {
    const history = await client.query(`
      select version, name
      from supabase_migrations.schema_migrations
      order by version, name
    `);
    const latest = history.rows.at(-1) ?? {};
    const localKeys = repositoryMigrationKeys();
    const remoteKeys = history.rows.map(({ version, name }) => `${version}_${name}`);
    const expectedKeys = expected === EXPECTED_AFTER ? localKeys : localKeys.slice(0, -1);
    const errors = [];
    if (localKeys.length !== EXPECTED_AFTER.count || localKeys.at(-1) !== TARGET_MIGRATION) {
      errors.push('repository_migration_contract_mismatch');
    }
    if (targetMigrationSha256() !== TARGET_MIGRATION_SHA256) errors.push('target_migration_checksum_mismatch');
    if (history.rowCount !== expected.count) errors.push('migration_count_mismatch');
    if (JSON.stringify(remoteKeys) !== JSON.stringify(expectedKeys)) errors.push('migration_history_prefix_mismatch');
    if (latest.version !== expected.version || latest.name !== expected.name) errors.push('latest_migration_mismatch');

    let contract = null;
    if (expected === EXPECTED_BEFORE) await verifyBefore(client, errors);
    else contract = await verifyAfter(client, errors);

    console.log(JSON.stringify({
      ok: errors.length === 0,
      phase: expected === EXPECTED_AFTER ? 'after' : 'before',
      migrationCount: history.rowCount,
      latestMigration: `${latest.version ?? ''}_${latest.name ?? ''}`,
      migrationHistorySha256: digestKeys(remoteKeys),
      targetMigrationSha256: targetMigrationSha256(),
      contract,
      errors,
    }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seller_inventory_production_migration_verification_failed:${error.message}`);
  process.exitCode = 1;
});
