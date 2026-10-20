import { readFile } from 'node:fs/promises';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const component = argument('component');
const deploymentId = argument('deployment');
const verifyOnly = process.argv.includes('--verify-only');
const verifiedBeforePath = argument('verified-before');
const serviceVariableByComponent = {
  backend: 'RAILWAY_BACKEND_SERVICE_ID',
  recognition: 'RAILWAY_RECOGNITION_SERVICE_ID',
};
const serviceVariable = serviceVariableByComponent[component];
if (!serviceVariable) throw new Error('Railway rollback supports only backend or recognition deployments.');

const expectedServiceId = String(process.env[serviceVariable] ?? '').trim();
const expectedEnvironmentId = String(process.env.RAILWAY_ENVIRONMENT_ID ?? '').trim();
const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
if (!deploymentId) throw new Error('Missing --deployment=<railway-deployment-id>.');
if (!expectedServiceId) throw new Error(`${serviceVariable} is required.`);
if (!expectedEnvironmentId) throw new Error('RAILWAY_ENVIRONMENT_ID is required.');
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
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Railway API request failed with status ${response.status}.`);
  }
  return payload.data;
}

const STAGING_BACKEND_SERVICE_ID = '66641988-1846-4775-bcc4-5d1f6985db91';
const STAGING_ENVIRONMENT_ID = '88986bd6-970f-4bfe-9cea-15aada4d466c';
const STAGING_SUPABASE_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const MAX_PREDEPLOY_RECEIPT_AGE_MS = 20 * 60 * 1000;
const MAX_RECEIPT_FUTURE_SKEW_MS = 60 * 1000;

async function verifyStagingBackendPredeployReceipt(path, deployment) {
  if (!path) throw new Error('A verified pre-deploy receipt is required for a crashed staging backend rollback target.');
  if (component !== 'backend' || expectedServiceId !== STAGING_BACKEND_SERVICE_ID || expectedEnvironmentId !== STAGING_ENVIRONMENT_ID) {
    throw new Error('Verified pre-deploy receipts are valid only for the protected staging backend rollback path.');
  }

  let receipt;
  try {
    receipt = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('The verified pre-deploy receipt is unreadable.');
  }

  const observedAt = Date.parse(receipt?.observedAt);
  const age = Date.now() - observedAt;
  if (!Number.isFinite(observedAt) || age > MAX_PREDEPLOY_RECEIPT_AGE_MS || age < -MAX_RECEIPT_FUTURE_SKEW_MS) {
    throw new Error('The verified pre-deploy receipt is stale or has an invalid timestamp.');
  }

  const receiptDeployment = receipt?.deployment;
  const health = receipt?.health;
  const runtime = health;
  const expectedSource = String(runtime?.gitCommit ?? '');
  const matches = receipt?.schemaVersion === 'stackr-staging-backend-predeploy-health-v1'
    && receiptDeployment?.id === deployment.id
    && receiptDeployment?.serviceId === STAGING_BACKEND_SERVICE_ID
    && receiptDeployment?.environmentId === STAGING_ENVIRONMENT_ID
    && receiptDeployment?.status === 'SUCCESS'
    && health?.status === 200
    && health?.ok === true
    && runtime?.deploymentId === deployment.id
    && runtime?.railwayEnvironment === 'staging'
    && runtime?.supabaseProjectRef === STAGING_SUPABASE_PROJECT_REF
    && runtime?.gitCommitSource === 'bundled_workflow_sha'
    && /^[0-9a-f]{12}$/i.test(expectedSource);
  if (!matches) throw new Error('The verified pre-deploy receipt does not match the crashed staging backend target.');
}

const current = await graphql(
  'query deployment($id: String!) { deployment(id: $id) { id status canRollback serviceId environmentId } }',
  { id: deploymentId },
);
const deployment = current.deployment;
if (!deployment) throw new Error('The selected Railway deployment was not found.');
if (deployment.serviceId !== expectedServiceId) {
  throw new Error(`The selected Railway deployment is not a ${component} deployment.`);
}
if (deployment.environmentId !== expectedEnvironmentId) {
  throw new Error('The selected Railway deployment belongs to a different environment.');
}
// Railway marks an otherwise successful deployment REMOVED after a later
// deployment supersedes it. A CRASHED staging backend is also recoverable only
// when the exact target was observed healthy immediately before replacement.
if (!['SUCCESS', 'REMOVED', 'CRASHED'].includes(deployment.status)) {
  throw new Error('The selected Railway deployment is not a known-good successful or superseded deployment.');
}
if (!deployment.canRollback) throw new Error('The selected Railway deployment is not rollback-eligible.');
if (deployment.status === 'CRASHED') await verifyStagingBackendPredeployReceipt(verifiedBeforePath, deployment);

if (verifyOnly) {
  console.log(JSON.stringify({
    ok: true,
    verified: true,
    component,
    deploymentId: deployment.id,
    status: deployment.status,
  }, null, 2));
} else {
  const result = await graphql(
    'mutation deploymentRollback($id: String!) { deploymentRollback(id: $id) }',
    { id: deploymentId },
  );
  if (result.deploymentRollback !== true) throw new Error('Railway did not confirm the rollback.');
  console.log(JSON.stringify({ ok: true, component, deploymentRollback: true }, null, 2));
}
