let healthCalls = 0;

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === 'https://backboard.railway.com/graphql/v2') {
    const body = JSON.parse(String(options.body ?? '{}'));
    const query = String(body.query ?? '');
    const variables = body.variables ?? {};
    if (query.includes('query liveBackend')) {
      return new Response(JSON.stringify({ data: {
        project: {
          id: process.env.MOCK_RAILWAY_PROJECT_ID ?? variables.projectId,
          environments: { edges: [{ node: { id: process.env.MOCK_RAILWAY_PROJECT_ENVIRONMENT_ID ?? variables.environmentId } }, ...(process.env.MOCK_RAILWAY_DUPLICATE_PROJECT_ENVIRONMENT === 'true' ? [{ node: { id: variables.environmentId } }] : [])] },
          services: { edges: [{ node: { id: process.env.MOCK_RAILWAY_PROJECT_SERVICE_ID ?? variables.serviceId } }, ...(process.env.MOCK_RAILWAY_DUPLICATE_PROJECT_SERVICE === 'true' ? [{ node: { id: variables.serviceId } }] : [])] },
        },
        serviceInstance: process.env.MOCK_RAILWAY_NO_SERVICE_INSTANCE === 'true' ? null : {
          serviceId: process.env.MOCK_RAILWAY_INSTANCE_SERVICE_ID ?? variables.serviceId,
          environmentId: process.env.MOCK_RAILWAY_INSTANCE_ENVIRONMENT_ID ?? variables.environmentId,
          latestDeployment: {
            id: process.env.MOCK_RAILWAY_LIVE_DEPLOYMENT_ID ?? '44444444-4444-4444-8444-444444444444',
            status: process.env.MOCK_RAILWAY_LIVE_STATUS ?? 'SUCCESS',
          },
        },
      } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (query.includes('query deployment')) {
      return new Response(JSON.stringify({ data: { deployment: {
        id: variables.id,
        status: process.env.MOCK_RAILWAY_DEPLOYMENT_STATUS ?? 'SUCCESS',
        canRollback: process.env.MOCK_RAILWAY_CAN_ROLLBACK !== 'false',
        serviceId: process.env.MOCK_RAILWAY_DEPLOYMENT_SERVICE_ID ?? '33333333-3333-4333-8333-333333333333',
        environmentId: process.env.MOCK_RAILWAY_DEPLOYMENT_ENVIRONMENT_ID ?? '22222222-2222-4222-8222-222222222222',
      } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('Unexpected Railway GraphQL operation.');
  }
  healthCalls += 1;
  const requestId = options.headers?.['x-request-id'];
  const headers = new Headers({ 'content-type': 'application/json' });
  if (process.env.MOCK_RAILWAY_MISSING_REQUEST_ID !== 'true') headers.set('x-request-id', requestId);
  if (process.env.MOCK_RAILWAY_MISSING_EDGE_REQUEST_ID !== 'true') {
    headers.set('x-railway-request-id', `railway-${requestId}`);
  }
  const runtime = {
    railwayEnvironment: process.env.MOCK_RAILWAY_HEALTH_ENVIRONMENT ?? 'production',
    gitCommit: healthCalls === 2
      ? (process.env.MOCK_RAILWAY_SECOND_HEALTH_COMMIT ?? process.env.MOCK_RAILWAY_HEALTH_COMMIT ?? '903fc5f51dd0')
      : (process.env.MOCK_RAILWAY_HEALTH_COMMIT ?? '903fc5f51dd0'),
  };
  const deploymentId = healthCalls === 2
    ? (process.env.MOCK_RAILWAY_SECOND_HEALTH_DEPLOYMENT_ID ?? process.env.MOCK_RAILWAY_HEALTH_DEPLOYMENT_ID)
    : process.env.MOCK_RAILWAY_HEALTH_DEPLOYMENT_ID;
  if (deploymentId) runtime.deploymentId = deploymentId;
  return new Response(JSON.stringify({
    ok: process.env.MOCK_RAILWAY_HEALTH_OK !== 'false',
    service: process.env.MOCK_RAILWAY_HEALTH_SERVICE ?? 'stackr-api',
    runtime,
  }), { status: Number(process.env.MOCK_RAILWAY_HEALTH_STATUS ?? 200), headers });
};
