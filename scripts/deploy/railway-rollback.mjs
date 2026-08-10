const deploymentId = process.argv.find((value) => value.startsWith('--deployment='))?.slice(13);
const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
if (!deploymentId) throw new Error('Missing --deployment=<railway-deployment-id>.');
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
  'query deployment($id: String!) { deployment(id: $id) { id status canRollback } }',
  { id: deploymentId },
);
if (!current.deployment?.canRollback) throw new Error('The selected Railway deployment is not rollback-eligible.');

const result = await graphql(
  'mutation deploymentRollback($id: String!) { deploymentRollback(id: $id) { id status } }',
  { id: deploymentId },
);
console.log(JSON.stringify({ ok: true, deployment: result.deploymentRollback }, null, 2));
