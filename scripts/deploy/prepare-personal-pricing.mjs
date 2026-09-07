import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRollbackSafeMigrationSql } from './migration-transaction-safety.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const productionRef = 'oakdbbzdqwurpjnoqhmu';
const lockName = 'stackr.personal_pricing_preparation.v1';

export const REQUIRED_MIGRATIONS = Object.freeze([
  ['20260903120000_deduplicate_pending_price_refreshes.sql', '943e42323c9157ecef7d34d9845fc05da29387b17054e16dbe8057473c0f25b1'],
  ['20260903210000_verified_sold_provenance.sql', '8e24e6e81fdf862ee9132ccce32ec12e4bb4bf282ec7719bcb7d3dbd98c7ecf4'],
  ['20260904123000_poketrace_sold_evidence_provider.sql', '077b168e1799e442ab3e839321aac7a784138690cdd237ed0f403a8ec0a8ab9c'],
  ['20260904130000_market_price_snapshot_history_buckets.sql', 'bb67e708ed588cad507e484f7521f3a8e973edd6309126165db087080c7109f4'],
  ['20260904131000_exact_variant_price_refresh_queue.sql', 'f15be062593e77365ac90b03ffd0be46ca513096918726137130ece76dae4c05'],
  ['20260906063316_personal_pricing_privacy_boundary.sql', '70d68487f20e5867afafc12759c2e8b3c448b0e529b862bdbebc6330e11f3ca3'],
].map(([filename, sha256]) => Object.freeze({ filename, version: filename.slice(0, 14), name: filename.slice(15, -4), sha256 })));

// The pricing release assumes the bounded binder artwork read was recorded on
// production. A migration count alone cannot prove that prerequisite: another
// unrelated migration could produce the same count.
export const REQUIRED_BINDER_MIGRATIONS = Object.freeze([
  Object.freeze({ version: '20260906062835', name: 'index_asset_printing_identity' }),
  Object.freeze({ version: '20260906062838', name: 'expose_bounded_card_image_identity_read' }),
]);

function source(migration) { return readFileSync(resolve(root, 'supabase/migrations', migration.filename), 'utf8').replace(/\r\n/g, '\n'); }
function digest(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

export function validateMigrationSources() {
  const sources = new Map();
  for (const migration of REQUIRED_MIGRATIONS) {
    const sql = source(migration);
    if (digest(sql) !== migration.sha256) throw new Error(`migration_checksum_mismatch:${migration.filename}`);
    assertRollbackSafeMigrationSql(sql);
    sources.set(migration.version, sql);
  }
  return sources;
}

export function assertProductionDatabaseUrl(dbUrl) {
  let parsed;
  try { parsed = new URL(String(dbUrl)); } catch { throw new Error('production_database_url_invalid'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || decodeURIComponent(parsed.username) !== `postgres.${productionRef}`) {
    throw new Error('production_database_url_project_ref_mismatch');
  }
}

export function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = typeof argument === 'string' && !/[\r\n]/.test(argument) && /^--(db-url|owner-email|apply)=(.*)$/.exec(argument);
    if (!match) throw new Error('invalid_argument');
    if (values.has(match[1])) throw new Error('duplicate_argument');
    values.set(match[1], match[2]);
  }
  if (values.has('apply') && !['true', 'false'].includes(values.get('apply'))) throw new Error('invalid_apply_argument');
  return { dbUrl: values.get('db-url') ?? '', ownerEmail: values.get('owner-email') ?? '', apply: values.get('apply') === 'true' };
}

function migrationState(rows) {
  if (!Array.isArray(rows)) throw new Error('migration_history_result_invalid');
  const applied = new Set(rows.map((row) => `${row.version}_${row.name}`));
  if (applied.size !== rows.length) throw new Error('production_migration_history_duplicate');
  const binderPrerequisites = REQUIRED_BINDER_MIGRATIONS.map((migration) => `${migration.version}_${migration.name}`);
  if (binderPrerequisites.some((key) => !applied.has(key))) {
    throw new Error('binder_migration_prerequisite_missing');
  }
  const target = REQUIRED_MIGRATIONS.map((migration) => `${migration.version}_${migration.name}`);
  const present = target.filter((key) => applied.has(key));
  if (present.length > 0 && present.length !== target.length) throw new Error('personal_pricing_migration_state_partial');
  if (![122, 124, 128, 130].includes(rows.length)) throw new Error('production_migration_count_unexpected');
  return { pending: REQUIRED_MIGRATIONS.filter((migration) => !applied.has(`${migration.version}_${migration.name}`)), applied: REQUIRED_MIGRATIONS.filter((migration) => applied.has(`${migration.version}_${migration.name}`)) };
}

export async function preparePersonalPricing({ dbUrl, ownerEmail, apply = false }, createClient = createVerifiedSupabasePostgresClient) {
  const sources = validateMigrationSources();
  if (!dbUrl) throw new Error('production_database_url_required');
  assertProductionDatabaseUrl(dbUrl);
  if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) throw new Error('owner_email_required');
  const client = createClient(dbUrl, 'stackr_personal_pricing_preparation');
  await client.connect();
  try {
    await client.query(apply ? 'begin' : 'begin read only');
    try {
      await client.query("set local lock_timeout = '1s'");
      await client.query("set local statement_timeout = '30s'");
      await client.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1))', [lockName]);
      const history = await client.query('select version, name from supabase_migrations.schema_migrations order by version, name');
      const state = migrationState(history.rows);
      const owner = await client.query('select id from auth.users where lower(email) = lower($1) limit 2', [ownerEmail]);
      if (owner.rows.length !== 1) throw new Error('pricing_owner_account_not_unique');
      const snapshots = await client.query(`
        select lower(coalesce(primary_source, price_source, '')) as source, count(*)::int as count
        from public.market_price_snapshots
        where user_id is null
        group by 1
        order by 1
      `);
      const sourceLabelledTcgdex = snapshots.rows.find((row) => String(row.source).includes('tcgdex'))?.count ?? 0;
      if (apply && state.pending.length) {
        for (const migration of state.pending) {
          const sql = sources.get(migration.version);
          await client.query(sql);
          await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3::text[])', [migration.version, migration.name, [sql]]);
        }
        await client.query('commit');
      } else await client.query('rollback');
      return {
        ok: true,
        mode: apply && state.pending.length ? 'applied' : apply ? 'already_applied' : 'read_only_preparation',
        ownerId: String(owner.rows[0].id),
        migrationHistoryCount: history.rows.length,
        pendingMigrations: state.pending.map((migration) => migration.filename),
        appliedMigrations: state.applied.map((migration) => migration.filename),
        sourceLabelledTcgdexSnapshotCount: Number(sourceLabelledTcgdex),
        migrationSha256: Object.fromEntries(REQUIRED_MIGRATIONS.map((migration) => [migration.filename, migration.sha256])),
      };
    } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
  } finally { await client.end(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  preparePersonalPricing(parseArguments(process.argv.slice(2))).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`personal_pricing_preparation_failed:${error.message}\n`); process.exitCode = 1;
  });
}
