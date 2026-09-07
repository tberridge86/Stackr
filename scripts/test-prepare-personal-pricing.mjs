import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REQUIRED_BINDER_MIGRATIONS,
  REQUIRED_MIGRATIONS,
  assertProductionDatabaseUrl,
  parseArguments,
  preparePersonalPricing,
  validateMigrationSources,
} from './deploy/prepare-personal-pricing.mjs';

assert.equal(validateMigrationSources().size, 6);
const workflow = readFileSync('.github/workflows/prepare-personal-pricing.yml', 'utf8');
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/, 'preparation must be main-only');
assert.match(workflow, /inputs\.confirmation == 'PREPARE PERSONAL PRICING'/, 'preparation needs an explicit typed confirmation');
assert.match(workflow, /environment:\s+production/, 'preparation must use production environment protection');
assert.match(workflow, /SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.SUPABASE_PROJECT_REF\s*\}\}/,
  'the database URL normalizer requires the protected project identity as well as its connection URL');
assert.match(workflow, /timeout-minutes:\s*30/, 'preparation must have a bounded execution window');
assert.match(workflow, /cancel-in-progress: false/, 'production preparation must stay serialized');
assert.match(workflow, /Verify a current physical backup and create logical recovery dumps/,
  'backup wording must distinguish an existing physical backup from generated logical dumps');
assert.match(workflow, /supabase@2\.110\.0 backups list/, 'a current physical backup must be checked');
assert.match(workflow, /supabase@2\.110\.0 db dump/, 'logical recovery dumps must be made before apply');
assert.match(workflow, /if: always\(\)\s+shell: bash\s+run: rm -rf "\$RUNNER_TEMP\/personal-pricing-backup"/,
  'ephemeral logical backup files must always be removed from the runner');
assert.match(workflow, /--apply="\$\{\{ inputs\.apply_migrations \}\}"/,
  'apply must be an explicit workflow input');
assert.doesNotMatch(workflow, /supabase@2\.110\.0 db push/, 'the bounded workflow must not run a global migration push');
const preparationStep = workflow.match(/      - name: Verify or apply the six reviewed personal-pricing migrations\n([\s\S]*?)(?=\n      - |$)/)?.[1];
assert(preparationStep, 'the preparation step must exist');
assert.match(preparationStep, /shell: bash/, 'the migration pipeline must use explicit bash failure handling');
const preparationRun = preparationStep.match(/        run: \|\n([\s\S]*)/)?.[1]
  .replace(/^          /gm, '').replace('${{ inputs.apply_migrations }}', 'true');
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
console.log('Personal pricing preparation tests passed.');
