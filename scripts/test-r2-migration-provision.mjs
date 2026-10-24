import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { migrationConfiguration } from './migrate-catalogue-to-r2.mjs';

const workflow = await readFile(new URL('../.github/workflows/deploy-r2-migration.yml', import.meta.url), 'utf8');
function step(name) {
  const marker = '      - name: ' + name + '\n';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'missing step: ' + name);
  const end = workflow.indexOf('\n      - ', start + marker.length);
  const section = workflow.slice(start + marker.length, end < 0 ? undefined : end);
  const run = section.indexOf('        run: |\n');
  assert.ok(run >= 0, 'missing literal run block: ' + name);
  return { section, run: section.slice(run + '        run: |\n'.length).split('\n')
    .map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n').trimEnd() };
}
function inlineNode(source) {
  const match = /node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE(?:\n|$)/.exec(source);
  assert.ok(match, 'expected exactly scoped inline Node guard');
  return match[1].replace(/^import [^\n]+;\n/gm, '');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const target = {
  RAILWAY_PROJECT_ID: 'd205637b-5376-41aa-9169-1015ba88fec3',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f',
  RAILWAY_MIGRATION_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
};
for (const [key, value] of Object.entries(target)) assert.ok(workflow.includes('      ' + key + ': ' + value + '\n'));
assert.match(workflow, /\n    environment: production\n/);
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && inputs\.confirmation == 'PROVISION R2 MIGRATION WORKER'/);
assert.match(workflow, /group: stackr-production-deployment\n  cancel-in-progress: false/);
assert.match(workflow, /permissions:\n  contents: read\n/);
const exact = step('Require the exact current main revision').run;
for (const invariant of [
  '[[ "$EXPECTED_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]]', 'test "$EXPECTED_MAIN_SHA" = "$GITHUB_SHA"',
  'test "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA"',
  'test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN_SHA"',
]) assert.ok(exact.includes(invariant), 'exact-main guard is required');
const configure = step('Configure protected server credentials without triggering a deployment');
for (const key of ['RAILWAY_API_TOKEN', 'SUPABASE_DB_URL', 'STACKR_R2_ACCESS_KEY_ID', 'STACKR_R2_SECRET_ACCESS_KEY']) {
  assert.ok(configure.section.includes('          ' + key + ': $' + '{{ secrets.' + key + ' }}\n'), 'secret mapping: ' + key);
}
assert.ok(configure.section.includes('          SUPABASE_URL: $' + '{{ vars.STACKR_SUPABASE_URL }}\n'));
assert.match(configure.run, /variable set "\$variable" --stdin --skip-deploys/);
assert.match(configure.run, /--service "\$RAILWAY_MIGRATION_SERVICE_ID" > \/dev\/null 2>&1/);
assert.doesNotMatch(configure.run, /RAILWAY_RUN_UID=/, 'provisioning must not enable root execution');
const deploy = step('Deploy the disabled worker to the dedicated service').run;
assert.match(deploy, /@railway\/cli@5\.30\.1 up "\$RUNNER_TEMP\/stackr-r2-source" --path-as-root --ci/);
for (const selector of ['--project "$RAILWAY_PROJECT_ID"', '--environment "$RAILWAY_ENVIRONMENT_ID"',
  '--service "$RAILWAY_MIGRATION_SERVICE_ID"']) assert.ok(deploy.includes(selector));
assert.doesNotMatch(deploy, /--new|deployment redeploy|migrate-catalogue-to-r2/);
const tests = step('Verify migration, journal rollback and bounded runner').run;
for (const filename of ['test-r2-catalogue-migration.mjs', 'test-r2-catalogue-migration-cli.mjs',
  'test-r2-catalogue-rollback.mjs', 'test-r2-migration-runner.mjs', 'test-r2-migration-provision.mjs']) {
  assert.ok(tests.includes('node scripts/' + filename), 'release-critical guard suites are required');
}
const stage = step('Stage only the exact reviewed worker source').run;
assert.ok(stage.includes('git archive "$EXPECTED_MAIN_SHA" --'));
assert.ok(stage.includes('scripts/run-r2-catalogue-migration.mjs'));
assert.doesNotMatch(stage.split('git archive')[1].split('| tar')[0], /railway\.json|node_modules|\.env/);

const preflight = new AsyncFunction('assert', 'process', 'fetch', 'console', 'AbortSignal',
  inlineNode(step('Require disabled one-shot service settings and the attached volume').run));
const base = {
  migrationVariables: {},
  service: { id: target.RAILWAY_MIGRATION_SERVICE_ID, projectId: target.RAILWAY_PROJECT_ID, repoTriggers: { edges: [] } },
  serviceInstance: {
    serviceId: target.RAILWAY_MIGRATION_SERVICE_ID, environmentId: target.RAILWAY_ENVIRONMENT_ID,
    startCommand: 'node -e "console.log(\'R2 migration disabled; explicit reviewed command required\')"',
    restartPolicyType: 'NEVER', rootDirectory: '/', buildCommand: null, healthcheckPath: null,
    numReplicas: 1, activeDeployments: [], cronSchedule: null, preDeployCommand: null,
    railwayConfigFile: null, dockerfilePath: null, source: null,
  },
  environment: { id: target.RAILWAY_ENVIRONMENT_ID, projectId: target.RAILWAY_PROJECT_ID,
    volumeInstances: { pageInfo: { hasNextPage: false }, edges: [{ node: {
      serviceId: target.RAILWAY_MIGRATION_SERVICE_ID, environmentId: target.RAILWAY_ENVIRONMENT_ID,
      mountPath: '/data', deletedAt: null, isPendingDeletion: false,
    } }] } },
};
let checked = 0;
async function guardCase(mutate, expected = false) {
  const data = structuredClone(base);
  const outcome = { ok: true, errors: null };
  mutate(data, outcome);
  const processMock = { env: { ...target, RAILWAY_API_TOKEN: 'test' } };
  const messages = [];
  await preflight(assert, processMock, async (url, options) => {
    assert.equal(url, 'https://backboard.railway.com/graphql/v2');
    assert.equal(options.headers.authorization, 'Bearer test');
    const request = JSON.parse(options.body);
    assert.match(request.query, /^\s*query migrationProvisioning/);
    assert.deepEqual(request.variables, { projectId: target.RAILWAY_PROJECT_ID,
      serviceId: target.RAILWAY_MIGRATION_SERVICE_ID, environmentId: target.RAILWAY_ENVIRONMENT_ID });
    return { ok: outcome.ok, json: async () => ({ data, ...(outcome.errors ? { errors: outcome.errors } : {}) }) };
  }, { log: (value) => messages.push(value), error: (value) => messages.push(value) }, AbortSignal);
  assert.equal(processMock.exitCode === 1, !expected);
  assert.doesNotMatch(messages.join('\n'), /test|provider-sensitive-error|fixture-database-password/);
  checked += 1;
}
await guardCase(() => {}, true);
await guardCase((data) => { data.serviceInstance.startCommand = null; }, true);
await guardCase((data) => { data.serviceInstance.preDeployCommand = []; }, true);
await guardCase((data) => { data.migrationVariables.RAILWAY_RUN_UID = '1000'; }, true);
for (const mutate of [
  (data) => { data.service.projectId = 'another-project'; },
  (data) => { data.serviceInstance.serviceId = 'another-service'; },
  (data) => { data.serviceInstance.environmentId = 'another-environment'; },
  (data) => { data.serviceInstance.startCommand = 'node scripts/run-r2-catalogue-migration.mjs --mode=execute'; },
  (data) => { data.serviceInstance.restartPolicyType = 'ALWAYS'; },
  (data) => { data.serviceInstance.activeDeployments = [{ id: 'still-running' }]; },
  (data) => { delete data.serviceInstance.activeDeployments; },
  (data) => { data.serviceInstance.cronSchedule = '* * * * *'; },
  (data) => { data.serviceInstance.preDeployCommand = ['node mutate.mjs']; },
  (data) => { delete data.serviceInstance.preDeployCommand; },
  (data) => { data.serviceInstance.railwayConfigFile = 'railway.json'; },
  (data) => { data.serviceInstance.rootDirectory = '/backend'; },
  (data) => { data.serviceInstance.buildCommand = 'node mutate.mjs'; },
  (data) => { data.serviceInstance.healthcheckPath = '/health'; },
  (data) => { data.serviceInstance.numReplicas = 2; },
  (data) => { data.serviceInstance.source = { repo: 'user/repo', image: null }; },
  (data) => { data.serviceInstance.source = { repo: null, image: 'nginx' }; },
  (data) => { data.service.repoTriggers.edges = [{ node: { id: 'autodeploy' } }]; },
  (data) => { data.environment.volumeInstances.edges = []; },
  (data) => { data.environment.volumeInstances.edges[0].node.mountPath = '/tmp'; },
  (data) => { data.environment.volumeInstances.edges[0].node.isPendingDeletion = true; },
  (data) => { data.environment.volumeInstances.edges[0].node.deletedAt = '2026-10-24'; },
  (data) => { data.environment.volumeInstances.pageInfo.hasNextPage = true; },
  (data) => { data.migrationVariables.RAILWAY_RUN_UID = '0'; },
  (data) => { data.migrationVariables = null; },
  (data, outcome) => { outcome.errors = [{ message: 'provider-sensitive-error' }]; },
  (data, outcome) => { outcome.ok = false; },
]) await guardCase(mutate);

const configureGuard = new AsyncFunction('migrationConfiguration', 'process', 'console', inlineNode(configure.run));
const validEnvironment = {
  SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:fixture-database-password@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  STACKR_R2_BUCKET: 'stackr-approved-art', STACKR_R2_PUBLIC_BASE_URL: 'https://assets.example.invalid',
};
for (const [override, succeeds] of [
  [{}, true], [{ SUPABASE_DB_URL: undefined }, false],
  [{ SUPABASE_DB_URL: 'postgresql://postgres.otherproject:fixture-database-password@aws-0-eu-west-2.pooler.supabase.com:6543/postgres' }, false],
  [{ SUPABASE_URL: 'https://another-project.supabase.co' }, false],
]) {
  const processMock = { env: { ...validEnvironment, ...override } };
  const messages = [];
  await configureGuard(migrationConfiguration, processMock, { error: (message) => messages.push(message) });
  assert.equal(processMock.exitCode === 1, !succeeds);
  assert.doesNotMatch(messages.join('\n'), /fixture-database-password|postgresql:\/\//);
  checked += 1;
}
console.log('R2 worker provisioning: exact source/target, protected secret mapping, disabled deployment, and ' + checked
  + ' offline configuration guards passed without network or database calls.');
