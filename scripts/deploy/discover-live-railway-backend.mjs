import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function required(value, label) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requiredUuid(value, label) {
  const id = required(value, label);
  if (!UUID_PATTERN.test(id)) throw new Error(`${label} must be a lowercase canonical UUID.`);
  return id;
}

function validHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('The backend health URL must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('The backend health URL must be a credential-free HTTPS URL.');
  }
  if (parsed.pathname !== '/health' || parsed.search || parsed.hash) {
    throw new Error('The backend health URL must be the direct /health endpoint without query or fragment data.');
  }
  return parsed;
}

const projectId = requiredUuid(argument('project') ?? process.env.RAILWAY_PROJECT_ID, 'RAILWAY_PROJECT_ID');
const environmentId = requiredUuid(argument('environment') ?? process.env.RAILWAY_ENVIRONMENT_ID, 'RAILWAY_ENVIRONMENT_ID');
const serviceId = requiredUuid(argument('service') ?? process.env.RAILWAY_BACKEND_SERVICE_ID, 'RAILWAY_BACKEND_SERVICE_ID');
const healthUrl = validHttpsUrl(required(argument('health-url') ?? process.env.STACKR_BACKEND_HEALTH_URL, 'STACKR_BACKEND_HEALTH_URL'));
const githubEnv = argument('github-env');
const githubOutput = argument('github-output');
const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
if (!token) throw new Error('RAILWAY_API_TOKEN or RAILWAY_TOKEN is required.');

const endpoint = 'https://backboard.railway.com/graphql/v2';
const headers = {
  'content-type': 'application/json',
  ...(process.env.RAILWAY_API_TOKEN
    ? { authorization: `Bearer ${token}` }
    : { 'project-access-token': token }),
};

async function graphql(query, variables) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Railway API request failed with status ${response.status}.`);
  }
  return payload.data;
}

function ids(connection) {
  return (connection?.edges ?? []).map((edge) => edge?.node?.id).filter(Boolean);
}

function healthRequestUrl(requestId) {
  const url = new URL(healthUrl);
  url.searchParams.set('_stackr_rollback_discovery', requestId);
  return url;
}

async function attestHealth(index) {
  const requestId = `stackr-rollback-discovery-${index}-${randomUUID()}`;
  const response = await fetch(healthRequestUrl(requestId), {
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
    headers: {
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The backend health endpoint did not return JSON.');
  }
  if (response.status !== 200 || payload?.ok !== true || payload?.service !== 'stackr-api') {
    throw new Error('The backend health endpoint did not attest a healthy Stackr API.');
  }
  if (response.headers.get('x-request-id') !== requestId) {
    throw new Error('The backend health endpoint did not preserve the discovery request ID.');
  }
  const railwayRequestId = String(response.headers.get('x-railway-request-id') ?? '').trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(railwayRequestId)) {
    throw new Error('Railway did not attach a valid request ID to the backend health response.');
  }
  const runtime = payload.runtime;
  if (runtime?.railwayEnvironment !== 'production') {
    throw new Error('The backend health endpoint is not attested as production.');
  }
  if (!/^[0-9a-f]{12}$/.test(String(runtime?.gitCommit ?? ''))) {
    throw new Error('The backend health endpoint did not attest a 12-character lowercase hexadecimal git commit.');
  }
  return {
    requestId,
    railwayRequestId,
    gitCommit: runtime.gitCommit,
    deploymentId: runtime.deploymentId ?? null,
  };
}

function readHttpLogs(requestId) {
  const adapter = String(process.env.RAILWAY_LOGS_ADAPTER ?? '').trim();
  const executable = adapter
    ? process.execPath
    : (process.env.RAILWAY_LOGS_EXECUTABLE || (process.platform === 'win32' ? 'npx.cmd' : 'npx'));
  const args = adapter
    ? [path.resolve(adapter)]
    : ['--yes', '@railway/cli@5.30.1'];
  args.push(
    'logs',
    '--http',
    '--project', projectId,
    '--environment', environmentId,
    '--service', serviceId,
    '--request-id', requestId,
    '--lines', '20',
    '--json',
  );
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Railway deployment-log lookup failed while binding the live backend.');
  }
  return String(result.stdout ?? '');
}

function deploymentFromHttpLogs(output, requestId) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  const matching = records.filter((record) => record?.requestId === requestId);
  if (matching.length !== 1) return null;
  const [record] = matching;
  const status = Number(record.httpStatus);
  const loggedPath = String(record.path ?? '').split('?')[0];
  if (record.method !== 'GET'
    || status !== 200
    || loggedPath !== healthUrl.pathname
    || !UUID_PATTERN.test(String(record.deploymentId ?? ''))) return null;
  return record.deploymentId;
}

async function waitForLogBinding(healthAttestations) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const deploymentIds = healthAttestations.map(({ railwayRequestId }) => (
      deploymentFromHttpLogs(readHttpLogs(railwayRequestId), railwayRequestId)
    ));
    if (deploymentIds.every(Boolean) && new Set(deploymentIds).size === 1) return deploymentIds[0];
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Railway logs could not uniquely bind both health requests to the live backend deployment.');
}

const live = await graphql(
  'query liveBackend($projectId: String!, $serviceId: String!, $environmentId: String!) { project(id: $projectId) { id environments { edges { node { id } } } services { edges { node { id } } } } serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { serviceId environmentId latestDeployment { id status } } }',
  { projectId, serviceId, environmentId },
);
if (live.project?.id !== projectId) throw new Error('Railway project identity did not match the expected project.');
if (ids(live.project.environments).filter((id) => id === environmentId).length !== 1) {
  throw new Error('Railway environment is not an unambiguous member of the expected project.');
}
if (ids(live.project.services).filter((id) => id === serviceId).length !== 1) {
  throw new Error('Railway service is not an unambiguous member of the expected project.');
}
if (live.serviceInstance?.serviceId !== serviceId || live.serviceInstance?.environmentId !== environmentId) {
  throw new Error('Railway service instance identity did not match the expected service and environment.');
}
const latestDeployment = live.serviceInstance?.latestDeployment;
if (!UUID_PATTERN.test(String(latestDeployment?.id ?? '')) || latestDeployment.status !== 'SUCCESS') {
  throw new Error('Railway did not report one successful live backend deployment.');
}

const healthAttestations = [await attestHealth(1), await attestHealth(2)];
if (new Set(healthAttestations.map(({ railwayRequestId }) => railwayRequestId)).size !== 2) {
  throw new Error('Railway did not assign distinct IDs to the two backend health requests.');
}
if (new Set(healthAttestations.map(({ gitCommit }) => gitCommit)).size !== 1) {
  throw new Error('The two backend health requests attested different git commits.');
}
for (const { deploymentId } of healthAttestations) {
  if (deploymentId != null && deploymentId !== latestDeployment.id) {
    throw new Error('The backend health deployment attestation did not match Railway\'s live deployment.');
  }
}
const loggedDeploymentId = await waitForLogBinding(healthAttestations);
if (loggedDeploymentId !== latestDeployment.id) {
  throw new Error('Railway HTTP logs did not bind the health responses to the latest live deployment.');
}

const current = await graphql(
  'query deployment($id: String!) { deployment(id: $id) { id status canRollback serviceId environmentId } }',
  { id: latestDeployment.id },
);
const deployment = current.deployment;
if (!deployment || deployment.id !== latestDeployment.id) throw new Error('The live Railway deployment could not be resolved exactly.');
if (deployment.serviceId !== serviceId || deployment.environmentId !== environmentId) {
  throw new Error('The live Railway deployment does not belong to the expected service and environment.');
}
if (deployment.status !== 'SUCCESS' || deployment.canRollback !== true) {
  throw new Error('The live Railway deployment is not a rollback-eligible success.');
}

if (githubEnv) {
  appendFileSync(githubEnv, `PREVIOUS_BACKEND_DEPLOYMENT_ID=${deployment.id}\nSTACKR_LIVE_BACKEND_ROLLBACK_DEPLOYMENT_ID=${deployment.id}\n`);
}
if (githubOutput) appendFileSync(githubOutput, `rollback_deployment_id=${deployment.id}\n`);
console.log(JSON.stringify({
  ok: true,
  projectId,
  environmentId,
  serviceId,
  rollbackDeploymentId: deployment.id,
  healthGitCommit: healthAttestations[0].gitCommit,
  attestationSource: 'railway_http_request_logs',
  railwayRequestIds: healthAttestations.map(({ railwayRequestId }) => railwayRequestId),
}, null, 2));
