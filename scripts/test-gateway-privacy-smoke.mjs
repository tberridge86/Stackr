import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { runGatewayPrivacySmoke } from './deploy/gateway-privacy-smoke.mjs';

const variantId = '046ba06b-01c6-44e1-94b5-48e786c3e7a4';
let privateErrors = true;
let providerResponses = [];
let providerCalls = 0;
const server = createServer((request, response) => {
  const requestId = `gateway-${request.url.length}-${providerCalls}`;
  response.setHeader('content-type', 'application/json');
  response.setHeader('x-request-id', requestId);
  if (request.url === '/v1/health') {
    response.end(JSON.stringify({ data: { status: 'ok' }, meta: { apiVersion: '1', requestId } }));
    return;
  }
  if (request.url === '/v1/ready') {
    response.end(JSON.stringify({ data: { status: 'ready' }, meta: { apiVersion: '1', requestId } }));
    return;
  }
  if (request.url.endsWith('/provider-price-refresh')) {
    assert.equal(request.method, 'POST');
    providerCalls += 1;
    const next = providerResponses.shift() ?? { status: 401, code: 'authentication_required' };
    response.statusCode = next.status;
    response.setHeader('cache-control', next.cacheControl ?? (next.status === 401 && privateErrors ? 'private, no-store' : 'no-store'));
    response.setHeader('vary', next.vary ?? (next.status === 401 && privateErrors ? 'Authorization' : 'Origin'));
    response.end(JSON.stringify({ error: { code: next.code, requestId }, meta: { apiVersion: '1' } }));
    return;
  }
  response.statusCode = 401;
  response.setHeader('cache-control', privateErrors ? 'private, no-store' : 'public, max-age=60');
  response.setHeader('vary', privateErrors ? 'Authorization' : 'Origin');
  response.end(JSON.stringify({ error: { code: 'authentication_required', requestId }, meta: { apiVersion: '1' } }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
  const sleeps = [];
  providerResponses = [{ status: 404, code: 'route_not_found' }, { status: 401, code: 'authentication_required' }];
  providerCalls = 0;
  const result = await runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true, sleep: async (delay) => sleeps.push(delay) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.status), [200, 200, 401, 401, 401, 401]);
  assert.deepEqual(sleeps, [1000], 'only a transient old-route 404 is retried');
  assert.equal(providerCalls, 2);

  providerResponses = [{ status: 404, code: 'route_not_found' }, { status: 404, code: 'route_not_found' }, { status: 404, code: 'route_not_found' }, { status: 404, code: 'route_not_found' }, { status: 404, code: 'route_not_found' }, { status: 404, code: 'route_not_found' }];
  providerCalls = 0;
  const persistentSleeps = [];
  await assert.rejects(
    runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true, sleep: async (delay) => persistentSleeps.push(delay) }),
    /anonymous_provider_refresh.*"status":404.*"code":"route_not_found"/,
  );
  assert.deepEqual(persistentSleeps, [1000, 2000, 4000, 8000, 12000]);
  assert.equal(providerCalls, 6, 'a propagation retry remains bounded to 30 seconds total');

  providerResponses = [{ status: 200, code: 'unexpected_success' }];
  providerCalls = 0;
  await assert.rejects(runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true, sleep: async () => { throw new Error('must not sleep'); } }), /"status":200/);
  assert.equal(providerCalls, 1, 'a successful anonymous response never retries');

  providerResponses = [{ status: 401, code: 'authentication_required', cacheControl: 'public, max-age=60', vary: 'Origin' }];
  providerCalls = 0;
  await assert.rejects(runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true, sleep: async () => { throw new Error('must not sleep'); } }), /private cache controls.*"cacheControl":"public, max-age=60"/);
  assert.equal(providerCalls, 1, 'a privacy header failure never retries');

  await assert.rejects(runGatewayPrivacySmoke({ gatewayUrl, variantId: 'not-a-uuid', allowHttp: true }), /canonical UUID/);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('Gateway privacy smoke tests passed.');
