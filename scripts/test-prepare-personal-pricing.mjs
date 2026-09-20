import assert from 'node:assert/strict';
import './test-production-backup-list.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REQUIRED_BINDER_MIGRATIONS,
  REQUIRED_MIGRATIONS,
  CATALOGUE_PRICING_MIGRATION,
  PRICING_REPAIR_MIGRATION,
  assertProductionDatabaseUrl,
  parseArguments,
  preparePersonalPricing,
  validateMigrationSources,
} from './deploy/prepare-personal-pricing.mjs';

assert.equal(validateMigrationSources().size, 6);
assert.equal(validateMigrationSources('catalogue').size, 1);
assert.equal(validateMigrationSources('pricing-repair').size, 1);
const workflow = readFileSync('.github/workflows/prepare-personal-pricing.yml', 'utf8');
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/, 'preparation must be main-only');
assert.match(workflow, /inputs\.scope == 'personal' && inputs\.confirmation == 'PREPARE PERSONAL PRICING'/, 'personal preparation needs an explicit typed confirmation');
assert.match(workflow, /inputs\.scope == 'catalogue' && inputs\.confirmation == 'PREPARE CATALOGUE PRICING'/, 'catalogue preparation needs a separate explicit typed confirmation');
assert.match(workflow, /inputs\.scope == 'pricing-repair' && inputs\.confirmation == 'PREPARE PRICING REPAIR'/, 'pricing repair needs a separate explicit typed confirmation');
assert.match(workflow, /environment:\s+production/, 'preparation must use production environment protection');
assert.match(workflow, /SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.SUPABASE_PROJECT_REF\s*\}\}/,
  'the database URL normalizer requires the protected project identity as well as its connection URL');
assert.match(workflow, /timeout-minutes:\s*30/, 'preparation must have a bounded execution window');
assert.match(workflow, /cancel-in-progress: false/, 'production preparation must stay serialized');
assert.match(workflow, /Verify a current physical backup and create logical recovery dumps/,
  'backup wording must distinguish an existing physical backup from generated logical dumps');
assert.match(workflow, /node scripts\/deploy\/list-production-backups.mjs --output="\$RUNNER_TEMP\/personal-pricing-backup\/physical.json"/,
  'physical backup listing uses the fixed production target and reports bounded authentication failures');
assert.match(workflow, /SUPABASE_BACKUP_FALLBACK_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  'fallback is limited to the existing protected credential');
assert.match(workflow, /supabase@2\.110\.0 db dump/, 'logical recovery dumps must be made before apply');
assert.match(workflow, /if: always\(\)\s+shell: bash\s+run: rm -rf "\$RUNNER_TEMP\/personal-pricing-backup"/,
  'ephemeral logical backup files must always be removed from the runner');
assert.match(workflow, /--apply="\$\{\{ inputs\.apply_migrations \}\}"/,
  'apply must be an explicit workflow input');
assert.match(workflow, /--scope="\$\{\{ inputs\.scope \}\}"/,
  'the applied scope must be explicit rather than inferred from a database state');
assert.doesNotMatch(workflow, /supabase@2\.110\.0 db push/, 'the bounded workflow must not run a global migration push');
const preparationStep = workflow.match(/      - name: Verify or apply the reviewed pricing migration scope\r?\n([\s\S]*?)(?=\r?\n      - |$)/)?.[1];
assert(preparationStep, 'the preparation step must exist');
assert.match(preparationStep, /shell: bash/, 'the migration pipeline must use explicit bash failure handling');
const preparationRun = preparationStep.match(/        run: \|\r?\n([\s\S]*)/)?.[1]
  .replace(/^          /gm, '').replace('${{ inputs.apply_migrations }}', 'true').replace('${{ inputs.scope }}', 'catalogue').replace('${{ inputs.rehearse_migrations }}', 'false');
assert(preparationRun, 'the preparation command must exist');
if (process.platform !== 'win32') {
  const runnerTemp = mkdtempSync(join(tmpdir(), 'stackr-pricing-workflow-test-'));
  try {
    // Run the actual workflow script under GitHub's unspecified-shell flags.
    // Stub only node: no credentials or database access are used. A successful
    // tee must never mask a failed migration or permit the next step to run.
    for (const exitCode of [0, 23]) {
      const execution = spawnSync('bash', ['--noprofile', '--norc', '-e', '-c',
        `node() { return ${exitCode}; }\n${preparationRun}\nprintf 'preparation-complete'\n`,
      ], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: runnerTemp,
        STACKR_SOURCE_DB_URL: 'test-only-unused', PRICING_OWNER_EMAIL: 'owner@example.invalid' } });
      assert.ifError(execution.error);
      assert.equal(execution.status, exitCode, 'the workflow must preserve the migration exit status through tee');
      assert.equal(execution.stdout.includes('preparation-complete'), exitCode === 0,
        'a failed migration must stop the workflow before success handling');
    }
  } finally { rmSync(runnerTemp, { recursive: true, force: true }); }
}
assert.throws(() => assertProductionDatabaseUrl('postgresql://postgres.invalid:x@example.com/postgres'), /project_ref/);
assert.deepEqual(parseArguments(['--db-url=postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', '--owner-email=tberridge86@gmail.com']).ownerEmail, 'tberridge86@gmail.com');
assert.equal(parseArguments(['--apply=true']).apply, true);
assert.equal(parseArguments(['--rehearse=true']).rehearse, true);
assert.throws(() => parseArguments(['--rehearse=maybe']), /invalid_rehearse_argument/);
assert.throws(() => parseArguments(['--rehearse=true', '--apply=true']), /mutually_exclusive/);
assert.equal(parseArguments(['--scope=catalogue']).scope, 'catalogue');
assert.equal(parseArguments(['--scope=pricing-repair']).scope, 'pricing-repair');
assert.throws(() => parseArguments(['--scope=all']), /invalid_scope_argument/);

const history = [
  ...Array.from({ length: 122 }, (_, index) => ({ version: String(index).padStart(14, '0'), name: `baseline_${index}` })),
  ...REQUIRED_BINDER_MIGRATIONS,
];
const queries = [];
const client = { async connect() {}, async end() {}, async query(sql) {
  queries.push(String(sql));
  if (String(sql).includes('schema_migrations')) return { rows: history };
  if (String(sql).includes('auth.users')) return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] };
  if (String(sql).includes('market_price_snapshots')) return { rows: [{ source: 'tcgdex', count: 405 }] };
  return { rows: [] };
} };
const result = await preparePersonalPricing({ dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', ownerEmail: 'tberridge86@gmail.com' }, () => client);
assert.equal(result.mode, 'read_only_preparation');
assert.equal(result.pendingMigrations.length, 6);
assert.equal(result.initialPendingMigrations.length, 6);
assert.deepEqual(result.newlyAppliedMigrations, []);
assert.equal(result.sourceLabelledTcgdexSnapshotCount, 405);
assert.equal(queries.some((query) => /insert|update|delete|create|alter/i.test(query)), false);
assert.equal(REQUIRED_MIGRATIONS.length, 6);
const historyWithoutBinderPrerequisite = history.filter(({ version, name }) => (
  `${version}_${name}` !== '20260906062838_expose_bounded_card_image_identity_read'
));
const missingBinderClient = {
  ...client,
  async query(sql) {
    if (String(sql).includes('schema_migrations')) return { rows: historyWithoutBinderPrerequisite };
    return client.query(sql);
  },
};
await assert.rejects(
  preparePersonalPricing({ dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', ownerEmail: 'tberridge86@gmail.com' }, () => missingBinderClient),
  /binder_migration_prerequisite_missing/,
);
const duplicateHistoryClient = {
  ...client,
  async query(sql) {
    if (String(sql).includes('schema_migrations')) return { rows: [...history, history[0]] };
    return client.query(sql);
  },
};
await assert.rejects(
  preparePersonalPricing({ dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', ownerEmail: 'tberridge86@gmail.com' }, () => duplicateHistoryClient),
  /production_migration_history_duplicate/,
);
const applyQueries = [];
const applyClient = { ...client, async query(sql) {
  applyQueries.push(String(sql));
  if (String(sql).includes('schema_migrations') && String(sql).startsWith('select')) return { rows: history };
  if (String(sql).includes('auth.users')) return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] };
  if (String(sql).includes('market_price_snapshots')) return { rows: [{ source: 'tcgdex', count: 405 }] };
  return { rows: [] };
} };
const applied = await preparePersonalPricing({ dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', ownerEmail: 'tberridge86@gmail.com', apply: true }, () => applyClient);
assert.equal(applied.mode, 'applied');
assert.equal(applyQueries.filter((query) => query.startsWith('insert into supabase_migrations')).length, 6);
assert.equal(applyQueries.includes('commit'), true);
assert.deepEqual(applied.initialPendingMigrations, REQUIRED_MIGRATIONS.map(({ filename }) => filename));
assert.deepEqual(applied.newlyAppliedMigrations, REQUIRED_MIGRATIONS.map(({ filename }) => filename));
assert.deepEqual(applied.appliedMigrations, REQUIRED_MIGRATIONS.map(({ filename }) => filename));
assert.deepEqual(applied.pendingMigrations, []);
assert.equal(applied.migrationHistoryCount, history.length + REQUIRED_MIGRATIONS.length);

const catalogueQueries = [];
const catalogueClient = { async connect() {}, async end() {}, async query(sql) {
  catalogueQueries.push(String(sql));
  if (String(sql).includes('schema_migrations')) return { rows: [...history, ...REQUIRED_MIGRATIONS] };
  if (String(sql).includes('expected_tables')) return { rows: [{ tables_present: true, tables_private: true, functions_private_to_service: true }] };
  return { rows: [] };
} };
const catalogue = await preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  scope: 'catalogue',
}, () => catalogueClient);
assert.equal(catalogue.mode, 'read_only_preparation');
assert.equal(catalogue.ownerId, null, 'catalogue preparation must not inspect a personal account');
assert.deepEqual(catalogue.pendingMigrations, [CATALOGUE_PRICING_MIGRATION.filename]);
assert.equal(catalogueQueries.some((query) => /auth\.users|market_price_snapshots/i.test(query)), false);
assert.equal(catalogueQueries.includes('begin read only'), true, 'catalogue preflight is read-only');

const catalogueApplyQueries = [];
const catalogueApplyClient = { ...catalogueClient, async query(sql) {
  catalogueApplyQueries.push(String(sql));
  if (String(sql).includes('where version = $1')) return { rows: [CATALOGUE_PRICING_MIGRATION] };
  if (String(sql).includes('schema_migrations') && String(sql).startsWith('select')) return { rows: [...history, ...REQUIRED_MIGRATIONS] };
  if (String(sql).includes('expected_tables')) return { rows: [{ tables_present: true, tables_private: true, functions_private_to_service: true }] };
  return { rows: [] };
} };
const catalogueApplied = await preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'catalogue', apply: true,
}, () => catalogueApplyClient);
assert.equal(catalogueApplied.mode, 'applied');
assert.deepEqual(catalogueApplied.newlyAppliedMigrations, [CATALOGUE_PRICING_MIGRATION.filename]);
assert.equal(catalogueApplyQueries.filter((query) => query.startsWith('insert into supabase_migrations')).length, 1,
  'catalogue scope records exactly its single reviewed migration');
assert(catalogueApplyQueries.findIndex(query => query.includes('expected_tables')) < catalogueApplyQueries.indexOf('commit'), 'contract verification must happen before commit');
const rehearsalQueries = [];
const rehearsalClient = { ...catalogueApplyClient, async query(sql) {
  rehearsalQueries.push(String(sql));
  if (String(sql).includes('as valuation_table')) return { rows: [{ valuation_table: null }] };
  return catalogueApplyClient.query(sql);
} };
const rehearsed = await preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'catalogue', rehearse: true,
}, () => rehearsalClient);
assert.equal(rehearsed.mode, 'rehearsed_rolled_back');
assert.deepEqual(rehearsed.rehearsedMigrations, [CATALOGUE_PRICING_MIGRATION.filename]);
assert.deepEqual(rehearsed.newlyAppliedMigrations, []);
assert.deepEqual(rehearsed.pendingMigrations, [CATALOGUE_PRICING_MIGRATION.filename]);
assert.equal(rehearsed.migrationHistoryCount, history.length + REQUIRED_MIGRATIONS.length);
assert(!rehearsalQueries.includes('commit'), 'a successful rehearsal must never commit');
assert(rehearsalQueries.indexOf('rollback') > rehearsalQueries.findIndex(query => query.includes('expected_tables')));
assert(rehearsalQueries.findIndex(query => query.includes('as valuation_table')) > rehearsalQueries.indexOf('rollback'));
await assert.rejects(preparePersonalPricing({ scope: 'catalogue', apply: true, rehearse: true }, () => {
  throw new Error('must not connect');
}), /mutually_exclusive/);
for (const residue of ['ledger', 'schema']) {
  let rolledBack = false;
  const dirtyRollback = { ...rehearsalClient, async query(sql) {
    if (sql === 'rollback') rolledBack = true;
    if (rolledBack && residue === 'ledger' && String(sql).includes('order by version')) return { rows: [...history, ...REQUIRED_MIGRATIONS, CATALOGUE_PRICING_MIGRATION] };
    if (rolledBack && residue === 'schema' && String(sql).includes('as valuation_table')) return { rows: [{ valuation_table: 'collection_valuation_generations' }] };
    return rehearsalClient.query(sql);
  } };
  await assert.rejects(preparePersonalPricing({
    dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'catalogue', rehearse: true,
  }, () => dirtyRollback), /rehearsal_(ledger|schema)_not_restored/);
}
for (const failure of ['tables_private', 'functions_private_to_service', 'ledger']) {
  const calls = [];
  const failing = { ...catalogueApplyClient, async query(sql) {
    calls.push(String(sql));
    if (String(sql).includes('expected_tables') && failure !== 'ledger') return { rows: [{ tables_present: true, tables_private: failure !== 'tables_private', functions_private_to_service: failure !== 'functions_private_to_service' }] };
    if (String(sql).includes('where version = $1') && failure === 'ledger') return { rows: [] };
    return catalogueApplyClient.query(sql);
  } };
  await assert.rejects(preparePersonalPricing({ dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'catalogue', apply: true }, () => failing), /contract_mismatch|ledger_mismatch/);
  assert(!calls.includes('commit'), `${failure} must never commit`);
  assert(calls.includes('rollback'), `${failure} must roll back`);
}

const pricingRepairHistory = [...history, ...REQUIRED_MIGRATIONS, CATALOGUE_PRICING_MIGRATION];
const repairFunction = { definition: 'CREATE FUNCTION api.published_price_catalogue_revision() RETURNS jsonb LANGUAGE sql AS $$ select old $$;', definition_hash: 'old-function-hash' };
const pricingRepairQueries = [];
const pricingRepairClient = { async connect() {}, async end() {}, async query(sql) {
  const text = String(sql); pricingRepairQueries.push(text);
  if (text.includes('where version = $1')) return { rows: [PRICING_REPAIR_MIGRATION] };
  if (text.includes('no_full_card_projection')) return { rows: [{ function_present: true, service_can_execute: true, authenticated_cannot_execute: true, anon_cannot_execute: true, metadata_backed: true, no_full_card_projection: true }] };
  if (text.includes('pg_get_functiondef')) return { rows: [repairFunction] };
  if (text.includes('as valuation_table')) return { rows: [{ valuation_table: 'collection_valuation_generations' }] };
  if (text.includes('schema_migrations') && text.startsWith('select')) return { rows: pricingRepairHistory };
  return { rows: [] };
} };
const pricingRepair = await preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'pricing-repair', apply: true,
}, () => pricingRepairClient);
assert.equal(pricingRepair.mode, 'applied');
assert.deepEqual(pricingRepair.newlyAppliedMigrations, [PRICING_REPAIR_MIGRATION.filename]);
assert.equal(pricingRepairQueries.filter((query) => query.startsWith('insert into supabase_migrations')).length, 1,
  'pricing repair records only its reviewed additive migration');
assert(pricingRepairQueries.findIndex(query => query.includes('no_full_card_projection')) < pricingRepairQueries.indexOf('commit'),
  'pricing repair verifies the revised private function before commit');
const pricingRepairRehearsal = await preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'pricing-repair', rehearse: true,
}, () => pricingRepairClient);
assert.equal(pricingRepairRehearsal.mode, 'rehearsed_rolled_back');
assert.deepEqual(pricingRepairRehearsal.rehearsedMigrations, [PRICING_REPAIR_MIGRATION.filename]);
assert(pricingRepairQueries.some(query => query.includes('pg_get_functiondef')), 'rehearsal records the original function definition before applying the repair');
assert(pricingRepairQueries.some(query => query.includes("as valuation_table")), 'rehearsal verifies the existing valuation schema survives rollback');
await assert.rejects(preparePersonalPricing({
  dbUrl: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:placeholder@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', scope: 'pricing-repair',
}, () => ({ ...pricingRepairClient, async query(sql) {
  if (String(sql).includes('schema_migrations') && String(sql).startsWith('select')) return { rows: pricingRepairHistory.filter((row) => row !== CATALOGUE_PRICING_MIGRATION) };
  return pricingRepairClient.query(sql);
} })), /pricing_repair_migration_prerequisite_missing/);
console.log('Personal pricing preparation tests passed.');
