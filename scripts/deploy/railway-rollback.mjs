function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const component = argument('component');
const deploymentId = argument('deployment');
const verifyOnly = process.argv.includes('--verify-only');
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
if (deployment.status !== 'SUCCESS') {
  throw new Error('The selected Railway deployment is not a known-good successful deployment.');
}
if (!deployment.canRollback) throw new Error('The selected Railway deployment is not rollback-eligible.');

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
