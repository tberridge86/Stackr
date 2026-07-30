import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('supabase/config.toml', 'utf8');
const seed = readFileSync('supabase/seed.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260728203300_stackr_release_activation_controls.sql', 'utf8');
const rollback = readFileSync('supabase/manual/rollback_20260728203300_stackr_release_activation_controls.sql', 'utf8');
const inventoryMovementMigration = readFileSync(
  'supabase/migrations/20260627120000_inventory_movements_and_binder_schema_repair.sql',
  'utf8',
);
const mintyInsightMigration = readFileSync(
  'supabase/migrations/20260715143000_minty_insight_platform.sql',
  'utf8',
);
const curatedPromoMigration = readFileSync(
  'supabase/migrations/20260728110000_curated_corocoro_mew_promos.sql',
  'utf8',
);

assert.match(config, /schemas = \["public", "api", "graphql_public"\]/);
assert.doesNotMatch(config, /schemas\s*=\s*\[[^\]]*"(?:ingest|ml|audit|market|catalog)"/);
assert.match(config, /major_version = 17/);
assert.match(config, /sql_paths = \["\.\/seed\.sql"\]/);

for (const code of ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko']) assert.match(seed, new RegExp(`'${code}'`));
for (const code of ['normal', 'holo', 'reverse_holo', 'first_edition', 'unlimited', 'promo', 'stamped', 'poke_ball', 'master_ball']) {
  assert.match(seed, new RegExp(`'${code}'`));
}
assert.doesNotMatch(seed, /auth\.users|profiles|binder_cards|price_observations|raw_source_records/i);

for (const signature of [
  'catalog.activate_catalogue_version',
  'catalog.rollback_catalogue_version',
  'ml.rollback_embedding_index_version',
  'audit.release_activation_events',
]) assert.match(migration, new RegExp(signature.replace('.', '\\.')));
assert.match(migration, /grant execute on function catalog\.activate_catalogue_version[^;]+to service_role/s);
assert.match(migration, /revoke all on function ml\.rollback_embedding_index_version[^;]+from public, anon, authenticated/s);
assert.match(rollback, /drop function if exists catalog\.activate_catalogue_version/);
assert.match(rollback, /drop table if exists audit\.release_activation_events/);
assert.match(inventoryMovementMigration, /binder_id uuid null references public\.binders\(id\)/);
assert.doesNotMatch(inventoryMovementMigration, /binder_id text null references public\.binders\(id\)/);
assert.match(mintyInsightMigration, /add column if not exists active boolean not null default true/);
assert.match(mintyInsightMigration, /target_price_gbp = coalesce\(alerts\.target_price_gbp, alerts\.target_price\)/);
assert.match(mintyInsightMigration, /cards\.id = alerts\.card_id/);
assert.match(mintyInsightMigration, /check \(direction in \('below', 'above', 'movement'\)\)/);
assert.match(curatedPromoMigration, /alter table public\.pokemon_sets\s+add column if not exists raw_data jsonb/);

console.log('Stage 13 database deployment contract tests passed.');
