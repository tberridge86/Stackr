globalThis.fetch = async (_url, options = {}) => {
  const body = JSON.parse(String(options.body ?? '{}'));
  const query = String(body.query ?? '');

  if (query.includes('query deployment')) {
    return new Response(JSON.stringify({
      data: {
        deployment: {
          id: body.variables?.id ?? null,
          status: 'SUCCESS',
          canRollback: true,
          serviceId: process.env.MOCK_RAILWAY_SERVICE_ID ?? null,
          environmentId: process.env.MOCK_RAILWAY_ENVIRONMENT_ID ?? null,
        },
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (query.includes('mutation deploymentRollback')) {
    if (process.env.MOCK_RAILWAY_ALLOW_MUTATION !== 'true') {
      throw new Error('Unexpected Railway rollback mutation.');
    }
    return new Response(JSON.stringify({ data: { deploymentRollback: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  throw new Error('Unexpected Railway GraphQL operation.');
};
