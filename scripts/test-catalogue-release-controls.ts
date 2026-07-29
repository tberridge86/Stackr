import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260729055009_catalogue_production_release_controls.sql',
  'utf8',
);
const rollback = readFileSync(
  'supabase/manual/rollback_20260729055009_catalogue_production_release_controls.sql',
  'utf8',
);
const baselineAudit = readFileSync(
  'supabase/manual/production_migration_baseline_audit.sql',
  'utf8',
);

function expectSql(pattern: RegExp, message: string) {
  assert.match(migration, pattern, message);
}

function rejectSql(pattern: RegExp, message: string) {
  assert.doesNotMatch(migration, pattern, message);
}

function assertLegacyViewsAreHardened() {
  for (const view of [
    'catalogue_health',
    'japanese_catalogue_health',
    'tcg_card_printings',
    'tcg_set_cover_images',
  ]) {
    expectSql(new RegExp(`'${view}'`), `missing legacy view hardening for ${view}`);
  }

  expectSql(/security_invoker = true/, 'legacy views must use caller rights');
  expectSql(
    /revoke all privileges on table public\.%I from anon, authenticated/,
    'legacy view write-like privileges must be removed',
  );
  expectSql(
    /resolved catalogue images public read/,
    'resolved image rows need a narrow RLS policy for the cover view',
  );
  expectSql(
    /revoke all privileges on table public\.card_prices from anon, authenticated/,
    'raw price payload columns must not remain table-readable',
  );
  assert.doesNotMatch(
    migration.match(/grant select \([\s\S]*?\) on table public\.card_prices/)?.[0] ?? '',
    /raw_payload|failure_reason|provider_coverage/,
    'public price column grants must exclude raw and internal fields',
  );
}

function assertActivationIsAtomicAndAudited() {
  expectSql(
    /catalogue_versions_single_active_idx[\s\S]*where status = 'published' and deprecated_at is null/,
    'database must enforce one active published catalogue version',
  );
  expectSql(
    /create table if not exists audit\.catalogue_release_events/,
    'release actions need an immutable audit table',
  );
  expectSql(
    /create or replace function catalog\.catalogue_activation_readiness/,
    'missing read-only activation readiness function',
  );
  expectSql(
    /create or replace function catalog\.activate_catalogue_version/,
    'missing atomic activation function',
  );
  expectSql(
    /pg_advisory_xact_lock/,
    'activation must serialize concurrent release attempts',
  );
  expectSql(
    /lock table catalog\.catalogue_change_log in share row exclusive mode/,
    'activation must prevent ingestion from changing the declared range',
  );
  expectSql(
    /unique \(action, request_id\)/,
    'release mutations need idempotent request IDs',
  );
  expectSql(
    /grant execute on function catalog\.activate_catalogue_version\(text, text, text\) to service_role/,
    'activation must be service-only',
  );
  rejectSql(/security definer/i, 'release functions must not elevate caller privileges');
}

function assertRollbackPreservesDeltaMonotonicity() {
  expectSql(
    /create or replace function catalog\.rollback_catalogue_version/,
    'missing catalogue rollback function',
  );
  expectSql(
    /rollback must use forward-only compensating change sequences/,
    'rollback must not move mobile clients backwards in delta history',
  );
  expectSql(
    /status = 'rolled_back'/,
    'failed version must retain historical rolled-back state',
  );
  assert.match(
    rollback,
    /Retained audit evidence after rollback/,
    'rollback must preserve non-empty release audit evidence',
  );
}

function assertBaselineAuditIsReadOnly() {
  assert.match(baselineAudit, /production migration-baseline evidence/i);
  const executableSql = baselineAudit
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(
    executableSql,
    /\b(insert|update|delete|create|alter|drop|truncate|grant|revoke)\b/i,
    'migration baseline audit must remain read-only',
  );
}

assertLegacyViewsAreHardened();
assertActivationIsAtomicAndAudited();
assertRollbackPreservesDeltaMonotonicity();
assertBaselineAuditIsReadOnly();

console.log('Catalogue release-control migration checks passed.');
