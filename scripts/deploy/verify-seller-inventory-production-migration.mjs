import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const EXPECTED_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const EXPECTED_BEFORE = Object.freeze({
  count: 104,
  version: '20260811165000',
  name: 'repair_owned_card_membership_legacy_identity',
});
const EXPECTED_AFTER = Object.freeze({
  count: 105,
  version: '20260813093320',
  name: 'atomic_seller_inventory_batches',
});
const FUNCTION_SIGNATURE = 'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const TARGET_MIGRATION = '20260813093320_atomic_seller_inventory_batches';
const TARGET_MIGRATION_SHA256 = '8e4ea98ef3d5f5e7882a8ad3edf98b68b9d2af65638c1541a0d91e1c353199e1';

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

async function main() {
  const expected = expectedState();
  const connectionString = String(process.env.STACKR_SOURCE_DB_URL ?? '').trim();
  const parsed = new URL(connectionString);
  if (decodeURIComponent(parsed.username) !== `postgres.${EXPECTED_PROJECT_REF}`) {
    throw new Error('production_database_url_guard_mismatch');
  }

  const client = new pg.Client({ connectionString, application_name: 'stackr_seller_migration_verifier' });
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
    if (targetMigrationSha256() !== TARGET_MIGRATION_SHA256) {
      errors.push('target_migration_checksum_mismatch');
    }
    if (history.rowCount !== expected.count) errors.push('migration_count_mismatch');
    if (JSON.stringify(remoteKeys) !== JSON.stringify(expectedKeys)) {
      errors.push('migration_history_prefix_mismatch');
    }
    if (latest.version !== expected.version || latest.name !== expected.name) {
      errors.push('latest_migration_mismatch');
    }

    let contract = null;
    if (expected === EXPECTED_BEFORE) {
      const targetObjects = await client.query(`
        select
          to_regprocedure($1) is not null as function_exists,
          to_regclass('private.seller_inventory_batch_commits') is not null as receipt_table_exists,
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = 'inventory_movements'
              and column_name = 'inventory_item_id'
          ) as movement_column_exists,
          to_regclass('public.inventory_movements_user_item_idx') is not null as movement_index_exists
      `, [FUNCTION_SIGNATURE]);
      const objects = targetObjects.rows[0];
      if (!objects || Object.values(objects).some(Boolean)) {
        errors.push('partial_target_migration_state_detected');
      }
    }
    if (expected === EXPECTED_AFTER) {
      const result = await client.query(`
        with function_contract as (
          select
            not p.prosecdef as security_invoker,
            p.proconfig,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
            has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
          from pg_proc p
          where p.oid = $1::regprocedure
        ), receipt_contract as (
          select
            c.oid,
            c.relrowsecurity as rls_enabled,
            has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
            has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_can_insert,
            has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
            has_table_privilege('anon', c.oid, 'INSERT') as anon_can_insert
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'private' and c.relname = 'seller_inventory_batch_commits'
        )
        select
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = 'inventory_movements'
              and column_name = 'inventory_item_id'
          ) as inventory_item_id_exists,
          f.security_invoker,
          coalesce(f.proconfig @> array['search_path=\"\"'], false) as empty_search_path,
          f.authenticated_can_execute,
          f.anon_can_execute,
          f.public_can_execute,
          r.rls_enabled
          ,r.authenticated_can_select
          ,r.authenticated_can_insert
          ,r.anon_can_select
          ,r.anon_can_insert
          ,exists (
            select 1 from pg_policy policy
            where policy.polrelid = r.oid and policy.polcmd = 'r'
          ) as receipt_select_policy_exists
          ,exists (
            select 1 from pg_policy policy
            where policy.polrelid = r.oid and policy.polcmd = 'a'
          ) as receipt_insert_policy_exists
          ,exists (
            select 1
            from pg_indexes
            where schemaname = 'public'
              and tablename = 'inventory_movements'
              and indexname = 'inventory_movements_user_item_idx'
          ) as movement_index_exists
        from function_contract f
        cross join receipt_contract r
      `, [FUNCTION_SIGNATURE]);
      contract = result.rows[0] ?? null;
      if (!contract) errors.push('seller_inventory_contract_missing');
      if (contract && Object.entries({
        inventory_item_id_exists: true,
        security_invoker: true,
        empty_search_path: true,
        authenticated_can_execute: true,
        anon_can_execute: false,
        public_can_execute: false,
        rls_enabled: true,
        authenticated_can_select: true,
        authenticated_can_insert: true,
        anon_can_select: false,
        anon_can_insert: false,
        receipt_select_policy_exists: true,
        receipt_insert_policy_exists: true,
        movement_index_exists: true,
      }).some(([key, value]) => contract[key] !== value)) {
        errors.push('seller_inventory_contract_mismatch');
      }

      await client.query('begin read only');
      try {
        await client.query("select set_config('request.jwt.claim.sub', '', true)");
        try {
          await client.query(`select ${FUNCTION_SIGNATURE.split('(')[0]}(
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
    }

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
