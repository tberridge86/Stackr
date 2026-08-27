function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const component = argument('component');
const deploymentId = argument('deployment');
if (component !== 'recognition') {
  throw new Error('Railway catalogue-api rollback is source-locked while commerce containment is active.');
}

const expectedServiceId = String(process.env.RAILWAY_RECOGNITION_SERVICE_ID ?? '').trim();
const expectedEnvironmentId = String(process.env.RAILWAY_ENVIRONMENT_ID ?? '').trim();
const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
if (!deploymentId) throw new Error('Missing --deployment=<railway-deployment-id>.');
if (!expectedServiceId) throw new Error('RAILWAY_RECOGNITION_SERVICE_ID is required.');
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
  throw new Error('The selected Railway deployment is not a recognition deployment.');
}
if (deployment.environmentId !== expectedEnvironmentId) {
  throw new Error('The selected Railway deployment belongs to a different environment.');
}
if (!deployment.canRollback) throw new Error('The selected Railway deployment is not rollback-eligible.');

const result = await graphql(
  'mutation deploymentRollback($id: String!) { deploymentRollback(id: $id) }',
  { id: deploymentId },
);
if (result.deploymentRollback !== true) throw new Error('Railway did not confirm the rollback.');
console.log(JSON.stringify({ ok: true, deploymentRollback: true }, null, 2));
