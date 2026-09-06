import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const fetchMock = `--import=${pathToFileURL(path.resolve('scripts/test-fixtures/mock-railway-live-backend-discovery-fetch.mjs')).href}`;
const adapter = path.resolve('scripts/test-fixtures/mock-railway-live-backend-discovery.mjs');
function run(extra = {}) {
  const temp = mkdtempSync(path.join(tmpdir(), 'stackr-live-discovery-'));
  const envPath = path.join(temp, 'github-env');
  const outputPath = path.join(temp, 'github-output');
  const result = spawnSync(process.execPath, [
    'scripts/deploy/discover-live-railway-backend.mjs',
    '--project=11111111-1111-4111-8111-111111111111', '--environment=22222222-2222-4222-8222-222222222222', '--service=33333333-3333-4333-8333-333333333333',
    '--health-url=https://backend.example.test/health', `--github-env=${envPath}`, `--github-output=${outputPath}`,
  ], {
    cwd: process.cwd(), encoding: 'utf8',
    env: {
      ...process.env, ...extra, NODE_OPTIONS: [process.env.NODE_OPTIONS, fetchMock].filter(Boolean).join(' '),
      RAILWAY_API_TOKEN: 'test', RAILWAY_LOGS_ADAPTER: adapter,
    },
  });
  return { result, temp, envPath, outputPath };
}

const DEPLOYMENT_ID = '44444444-4444-4444-8444-444444444444';
const successful = run();
assert.equal(successful.result.status, 0, successful.result.stderr || successful.result.stdout);
assert.match(successful.result.stdout, new RegExp(`"rollbackDeploymentId": "${DEPLOYMENT_ID}"`));
assert.match(readFileSync(successful.envPath, 'utf8'), new RegExp(`PREVIOUS_BACKEND_DEPLOYMENT_ID=${DEPLOYMENT_ID}`));
assert.match(readFileSync(successful.outputPath, 'utf8'), new RegExp(`rollback_deployment_id=${DEPLOYMENT_ID}`));
rmSync(successful.temp, { recursive: true, force: true });

const modern = run({ MOCK_RAILWAY_HEALTH_DEPLOYMENT_ID: DEPLOYMENT_ID });
assert.equal(modern.result.status, 0, modern.result.stderr || modern.result.stdout);
rmSync(modern.temp, { recursive: true, force: true });

for (const [name, env, pattern] of [
  ['wrong project membership', { MOCK_RAILWAY_PROJECT_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /project identity/],
  ['wrong project environment membership', { MOCK_RAILWAY_PROJECT_ENVIRONMENT_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /unambiguous member/],
  ['wrong project service membership', { MOCK_RAILWAY_PROJECT_SERVICE_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /unambiguous member/],
  ['missing live service instance', { MOCK_RAILWAY_NO_SERVICE_INSTANCE: 'true' }, /service instance identity/],
  ['non-success live deployment', { MOCK_RAILWAY_LIVE_STATUS: 'BUILDING' }, /one successful live backend deployment/],
  ['unhealthy backend health', { MOCK_RAILWAY_HEALTH_OK: 'false' }, /healthy Stackr API/],
  ['wrong health service', { MOCK_RAILWAY_HEALTH_SERVICE: 'other-api' }, /healthy Stackr API/],
  ['wrong health environment', { MOCK_RAILWAY_HEALTH_ENVIRONMENT: 'staging' }, /not attested as production/],
  ['missing request id', { MOCK_RAILWAY_MISSING_REQUEST_ID: 'true' }, /preserve the discovery request ID/],
  ['missing Railway request id', { MOCK_RAILWAY_MISSING_EDGE_REQUEST_ID: 'true' }, /valid request ID/],
  ['health HTTP failure', { MOCK_RAILWAY_HEALTH_STATUS: '503' }, /healthy Stackr API/],
  ['invalid commit', { MOCK_RAILWAY_HEALTH_COMMIT: 'UPPERCASE' }, /lowercase hexadecimal/],
  ['different health commits', { MOCK_RAILWAY_SECOND_HEALTH_COMMIT: 'a03fc5f51dd0' }, /different git commits/],
  ['mismatched health deployments', { MOCK_RAILWAY_HEALTH_DEPLOYMENT_ID: DEPLOYMENT_ID, MOCK_RAILWAY_SECOND_HEALTH_DEPLOYMENT_ID: '55555555-5555-4555-8555-555555555555' }, /did not match Railway/],
  ['wrong deployment service', { MOCK_RAILWAY_DEPLOYMENT_SERVICE_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /expected service and environment/],
  ['wrong deployment environment', { MOCK_RAILWAY_DEPLOYMENT_ENVIRONMENT_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /expected service and environment/],
  ['ineligible deployment', { MOCK_RAILWAY_CAN_ROLLBACK: 'false' }, /rollback-eligible success/],
  ['deployment stopped during discovery', { MOCK_RAILWAY_DEPLOYMENT_STATUS: 'REMOVED' }, /rollback-eligible success/],
  ['mismatched health deployment', { MOCK_RAILWAY_HEALTH_DEPLOYMENT_ID: '55555555-5555-4555-8555-555555555555' }, /did not match Railway/],
  ['ambiguous log binding', { MOCK_RAILWAY_LOG_REQUEST_IDS: 'irrelevant' }, /could not uniquely bind/],
  ['malformed log binding', { MOCK_RAILWAY_MALFORMED_LOG: 'true' }, /could not uniquely bind/],
  ['duplicate log binding', { MOCK_RAILWAY_DUPLICATE_LOG: 'true' }, /could not uniquely bind/],
  ['wrong logged request method', { MOCK_RAILWAY_LOG_METHOD: 'POST' }, /could not uniquely bind/],
  ['wrong logged health route', { MOCK_RAILWAY_LOG_PATH: '/v1/health' }, /could not uniquely bind/],
  ['unsuccessful logged health response', { MOCK_RAILWAY_LOG_STATUS: '500' }, /could not uniquely bind/],
  ['wrong log deployment binding', { MOCK_RAILWAY_LOG_DEPLOYMENT_ID: '55555555-5555-4555-8555-555555555555' }, /did not bind the health responses/],
]) {
  const execution = run(env);
  assert.notEqual(execution.result.status, 0, name);
  assert.match(execution.result.stderr, pattern, name);
  assert.equal(existsSync(execution.envPath), false, `${name}: must not write environment output`);
  assert.equal(existsSync(execution.outputPath), false, `${name}: must not write step output`);
  rmSync(execution.temp, { recursive: true, force: true });
}

const helper = readFileSync('scripts/deploy/discover-live-railway-backend.mjs', 'utf8');
assert.match(helper, /serviceInstance\(serviceId: \$serviceId, environmentId: \$environmentId\)/);
assert.match(helper, /'logs',[\s\S]*'--http',[\s\S]*'--request-id', requestId/);
assert.match(helper, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
assert.match(helper, /PREVIOUS_BACKEND_DEPLOYMENT_ID=/);
assert.doesNotMatch(helper, /deploymentRollback\(/);
console.log('Railway live backend discovery tests passed.');
