import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const migrationNames = readdirSync(new URL('../supabase/migrations', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .sort();

assert.equal(migrationNames.length, 76, 'Prompt 7 must preserve the reconciled 76-migration chain');

for (const retainedMigration of [
  '20260728110000_curated_corocoro_mew_promos.sql',
  '20260728173530_stackr_api_gateway_controls.sql',
  '20260728182743_stackr_quality_performance_observability.sql',
  '20260728202949_stackr_application_migration_provider_retirement.sql',
  '20260728203300_stackr_release_activation_controls.sql',
  '20260729055239_critical_security_containment.sql',
  '20260730080047_reconcile_catalogue_seed_encoding_and_finish_taxonomy.sql',
]) {
  assert.ok(migrationNames.includes(retainedMigration), `${retainedMigration} must remain in the chain`);
}

for (const foldedMigration of [
  '20260728213516_pokemon_tcg_catalogue_import_support.sql',
  '20260729055009_catalogue_production_release_controls.sql',
  '20260729064011_legacy_production_migration_preflight.sql',
]) {
  assert.ok(!migrationNames.includes(foldedMigration), `${foldedMigration} must not duplicate folded safeguards`);
}

const rewards = read('supabase/migrations/20260528114500_server_side_coin_awards.sql');
assert.match(rewards, /alter table public\.achievement_coin_rewards enable row level security/i);
assert.match(rewards, /create policy "Authenticated users can read achievement coin rewards"/i);

const inventory = read('supabase/migrations/20260627120000_inventory_movements_and_binder_schema_repair.sql');
assert.match(inventory, /binder_id\s+uuid(?:\s+null)?\s+references public\.binders\(id\)/i);
assert.doesNotMatch(inventory, /binder_id\s+text(?:\s+null)?\s+references public\.binders\(id\)/i);

const ownedMembership = read('supabase/migrations/20260702120000_owned_card_membership_model.sql');
assert.match(ownedMembership, /con\.contype = 'u'/i);
assert.match(
  ownedMembership,
  /array\['user_id', 'card_id', 'set_id', 'variant'\]/i,
  'owned-card migration must remove obsolete four-column uniqueness by column signature',
);
assert.match(ownedMembership, /where con\.conindid = ind\.indexrelid/i);
assert.match(
  ownedMembership,
  /user_card_variants_owned_identity_uidx[\s\S]*user_id, card_id, set_id, variant, condition, grade_company, grade/i,
);

for (const trigramMigration of [
  'supabase/migrations/20260714120000_performance_pricing_indexes.sql',
  'supabase/migrations/20260719110000_fast_global_search_indexes.sql',
  'supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql',
]) {
  const sql = read(trigramMigration);
  assert.match(sql, /create extension if not exists pg_trgm with schema extensions/i);
  assert.match(sql, /set local search_path = "\$user", public, extensions/i);
}

const minty = read('supabase/migrations/20260715143000_minty_insight_platform.sql');
for (const column of [
  'stackr_card_id',
  'product_key',
  'language',
  'raw_or_graded',
  'grader',
  'grade',
  'target_price_gbp',
  'active',
  'updated_at',
]) {
  assert.match(minty, new RegExp(`add column if not exists ${column}\\b`, 'i'));
}

const canonical = read('supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql');
assert.match(canonical, /variant_group in \([^)]*'promo'/i);
assert.match(canonical, /'promo',\s*'Promo',\s*'other'/i);

const taxonomyReconciliation = read(
  'supabase/migrations/20260730080047_reconcile_catalogue_seed_encoding_and_finish_taxonomy.sql',
);
assert.match(taxonomyReconciliation, /where code = 'promo'/i);
assert.match(taxonomyReconciliation, /finish_group = 'other'/i);
assert.match(taxonomyReconciliation, /finish_group in \([^)]*'other'/i);
assert.doesNotMatch(taxonomyReconciliation, /finish_group in \([^)]*'promo'/i);

const ingestion = read('supabase/migrations/20260727213835_stackr_data_ingestion_reconciliation.sql');
assert.match(ingestion, /drop index if exists ingest\.raw_source_records_identity_uidx/i);
assert.match(ingestion, /raw_source_records_run_identity_uidx/i);
assert.match(ingestion, /raw_source_records_history_idx/i);
assert.match(ingestion, /'ultra_rare'/i);
assert.match(ingestion, /'mega_hyper_rare'/i);

const curatedPromos = read('supabase/migrations/20260728110000_curated_corocoro_mew_promos.sql');
assert.match(curatedPromos, /alter table if exists public\.pokemon_sets[\s\S]*add column if not exists raw_data jsonb/i);

const release = read('supabase/migrations/20260728203300_stackr_release_activation_controls.sql');
assert.match(release, /create unique index if not exists catalogue_versions_single_active_idx/i);
assert.match(release, /catalog\.catalogue_activation_readiness\(\s*p_catalogue_version_id uuid/i);
assert.match(release, /candidate_status_must_be_draft/i);
assert.match(release, /candidate_does_not_start_at_next_mobile_change/i);
assert.match(release, /candidate_range_assigned_to_another_version/i);
assert.match(release, /request_id is required/i);
assert.match(release, /rollback reason is required/i);
assert.match(release, /pg_advisory_xact_lock/i);
assert.match(release, /Rollback must use forward-only compensating change sequences/i);
assert.doesNotMatch(release, /candidate\.status not in \('draft', 'published', 'deprecated', 'rolled_back'\)/i);

const critical = read('supabase/migrations/20260729055239_critical_security_containment.sql');
assert.match(critical, /Expected public\.binders\.id to be uuid/i);
assert.match(critical, /inventory_movements\.binder_id \(%\) must match binders\.id \(%\)/i);
assert.match(critical, /Created by 20260729055239 critical security containment/i);
for (const view of [
  'catalogue_health',
  'japanese_catalogue_health',
  'tcg_card_printings',
  'tcg_set_cover_images',
]) {
  assert.match(critical, new RegExp(`'${view}'`, 'i'));
}
assert.match(critical, /security_invoker = true/i);
for (const policy of [
  'resolved catalogue images public read',
  'catalogue image check summary public read',
  'published catalogue prices public read',
  'catalogue price check summary public read',
  'catalogue sync summary public read',
]) {
  assert.match(critical, new RegExp(policy, 'i'));
}

const criticalRollback = read('supabase/manual/rollback_20260729055239_critical_security_containment.sql');
assert.match(criticalRollback, /Security boundaries in this migration are deliberately forward-only/i);
assert.match(criticalRollback, /Rollback blocked: price_alerts contains data/i);
assert.match(criticalRollback, /Rollback blocked: inventory_movements contains data/i);
assert.doesNotMatch(criticalRollback, /set public = true/i);
assert.doesNotMatch(criticalRollback, /Allow public read access to card scans/i);

const productionWorkflow = read('.github/workflows/deploy-production.yml');
assert.match(productionWorkflow, /rollback_catalogue_version_id/);
assert.match(productionWorkflow, /--id="\$ROLLBACK_CATALOGUE_VERSION_ID"/);
assert.doesNotMatch(productionWorkflow, /PREVIOUS_CATALOGUE_VERSION_ID/);

const rollbackRunbook = read('deploy/rollback-runbook.md');
assert.match(rollbackRunbook, /validated-draft-compensating-catalogue-version-uuid/i);
assert.match(rollbackRunbook, /Never\s+pass an old deprecated or rolled-back catalogue version/i);

const matrix = read('docs/stackr-api/prompt-7-migration-differences.csv');
const matrixRows = matrix.trim().split(/\r?\n/);
assert.equal(matrixRows.length, 10, 'difference matrix must contain one header plus nine decisions');

const rehearsalEvidence = JSON.parse(
  read('deploy/evidence/production-backup-migration-rehearsal-2026-07-30.json'),
);
assert.equal(rehearsalEvidence.productionMutationPerformed, false);
assert.equal(rehearsalEvidence.productionCommandExecutedDuringRehearsal, false);
assert.equal(rehearsalEvidence.paidResourceCreated, false);
assert.equal(rehearsalEvidence.restore.restorePassed, true);
assert.equal(rehearsalEvidence.migrationRehearsal.migrationCount, 76);
assert.equal(rehearsalEvidence.migrationRehearsal.ledgerCountAfter, 76);
assert.equal(rehearsalEvidence.migrationRehearsal.followUpPendingMigrationCount, 0);
assert.equal(rehearsalEvidence.postMigrationValidation.invalidConstraintCount, 0);
assert.equal(rehearsalEvidence.postMigrationValidation.promoVariantGroup, 'promo');
assert.equal(rehearsalEvidence.postMigrationValidation.promoFinishGroup, 'other');
for (const correction of rehearsalEvidence.compatibilityCorrections) {
  const sql = read(`supabase/migrations/${correction.migration}`).replace(/\r\n/g, '\n');
  const hash = createHash('sha256').update(sql).digest('hex');
  assert.equal(hash, correction.lfSha256, `rehearsal hash drift: ${correction.migration}`);
}

console.log('Prompt 7 migration-chain reconciliation contract passed.');
