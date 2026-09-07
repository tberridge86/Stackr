import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { runGatewayPrivacySmoke } from './deploy/gateway-privacy-smoke.mjs';

const variantId = '046ba06b-01c6-44e1-94b5-48e786c3e7a4';
let privateErrors = true;
const server = createServer((request, response) => {
  const requestId = `gateway-${request.url.length}`;
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
  response.statusCode = 401;
  response.setHeader('cache-control', privateErrors ? 'private, no-store' : 'public, max-age=60');
  response.setHeader('vary', privateErrors ? 'Authorization' : 'Origin');
  response.end(JSON.stringify({ error: { code: 'authentication_required', requestId }, meta: { apiVersion: '1' } }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
  const result = await runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.status), [200, 200, 401, 401, 401]);
  privateErrors = false;
  await assert.rejects(
    runGatewayPrivacySmoke({ gatewayUrl, variantId, allowHttp: true }),
    /private cache controls/,
  );
  await assert.rejects(runGatewayPrivacySmoke({ gatewayUrl, variantId: 'not-a-uuid', allowHttp: true }), /canonical UUID/);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('Gateway privacy smoke tests passed.');
