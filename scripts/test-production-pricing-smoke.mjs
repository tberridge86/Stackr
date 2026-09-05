import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { runProductionPricingSmoke } from './deploy/production-pricing-smoke.mjs';

const variantId = '0442aacc-93e4-40a5-8bac-3d226d10db08';
const expectedCommit = 'f87d89d803813d8a5eddee4142edd0736f081e7d';
const expectedDeploymentId = '9f706115-9344-4bb5-b102-fd675ee0b9d9';
const originKey = 'test-only-origin-key';
const requests = [];
let gatewayCacheState = 'BYPASS';
let healthCommit = expectedCommit.slice(0, 12);

const server = createServer((request, response) => {
  requests.push({
    path: request.url,
    originKey: request.headers['x-stackr-origin-key'] ?? null,
    authorization: request.headers.authorization ?? null,
  });
  const requestId = `smoke-${requests.length}`;
  response.setHeader('content-type', 'application/json');
  response.setHeader('x-request-id', requestId);

  if (request.headers.authorization === 'Bearer smoke-cache-bypass' && request.url !== '/v1/health') {
    response.setHeader('x-stackr-cache', gatewayCacheState);
    response.setHeader('cache-control', gatewayCacheState === 'BYPASS' ? 'no-store' : 'public, max-age=60');
  }

  if (request.url === '/health') {
    response.end(JSON.stringify({
      ok: true,
      runtime: {
        gitCommit: healthCommit,
        gitCommitSource: 'bundled_workflow_sha',
        deploymentId: expectedDeploymentId,
        railwayEnvironment: 'production',
      },
    }));
    return;
  }

  let data = null;
  if (request.url === '/v1/health') data = { ok: true };
  if (request.url?.startsWith(`/v1/cards/${variantId}/price?`)) data = { variantId, availability: 'unavailable' };
  if (request.url?.startsWith(`/v1/cards/${variantId}/price-history?`)) data = { variantId, observations: [] };
  if (request.url?.startsWith('/v1/market/movers?')) data = { movers: [] };
  if (!data) {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  response.end(JSON.stringify({ data, meta: { apiVersion: '1', requestId } }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const result = await runProductionPricingSmoke({
    backendUrl: baseUrl,
    gatewayUrl: baseUrl,
    variantId,
    backendOriginKey: originKey,
    expectedBackendCommit: expectedCommit,
    expectedBackendDeploymentId: expectedDeploymentId,
    allowHttp: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 9);
  assert.deepEqual(result.checks.map((check) => check.name), [
    'direct_backend_runtime_health',
    'direct_backend_health',
    'direct_backend_exact_price',
    'direct_backend_price_history',
    'direct_backend_movers',
    'public_gateway_health',
    'public_gateway_exact_price',
    'public_gateway_price_history',
    'public_gateway_movers',
  ]);
  assert.equal(requests[0].originKey, null);
  assert.ok(requests.slice(1, 5).every((request) => request.originKey === originKey));
  assert.ok(requests.slice(5).every((request) => request.originKey === null));
  assert.ok(requests.slice(1, 5).every((request) => request.authorization === null));
  assert.equal(requests[5].authorization, 'Bearer smoke-cache-bypass');
  assert.ok(requests.slice(6).every((request) => request.authorization === 'Bearer smoke-cache-bypass'));

  gatewayCacheState = 'HIT';
  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId,
      backendOriginKey: originKey,
      expectedBackendCommit: expectedCommit,
      expectedBackendDeploymentId: expectedDeploymentId,
      allowHttp: true,
    }),
    /gateway cache bypass/,
  );
  gatewayCacheState = 'BYPASS';

  healthCommit = '0'.repeat(12);
  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId,
      backendOriginKey: originKey,
      expectedBackendCommit: expectedCommit,
      expectedBackendDeploymentId: expectedDeploymentId,
      allowHttp: true,
    }),
    /expected Git SHA/,
  );
  healthCommit = expectedCommit.slice(0, 12);

  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId,
      backendOriginKey: '',
      expectedBackendCommit: expectedCommit,
      expectedBackendDeploymentId: expectedDeploymentId,
      allowHttp: true,
    }),
    /backend origin key is required/,
  );
  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId: 'not-a-uuid',
      backendOriginKey: originKey,
      expectedBackendCommit: expectedCommit,
      expectedBackendDeploymentId: expectedDeploymentId,
      allowHttp: true,
    }),
    /canonical UUID/,
  );
  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId,
      backendOriginKey: originKey,
      expectedBackendCommit: 'not-a-full-sha',
      expectedBackendDeploymentId: expectedDeploymentId,
      allowHttp: true,
    }),
    /full 40-character Git SHA/,
  );
  await assert.rejects(
    runProductionPricingSmoke({
      backendUrl: baseUrl,
      gatewayUrl: baseUrl,
      variantId,
      backendOriginKey: originKey,
      expectedBackendCommit: expectedCommit,
      expectedBackendDeploymentId: '0f706115-9344-4bb5-b102-fd675ee0b9d9',
      allowHttp: true,
    }),
    /expected Railway deployment/,
  );
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log('Production pricing smoke tests passed.');
