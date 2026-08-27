import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

const supabaseSecretEnv = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const shippingEnabledEnv = ['STACKR', 'LIVE', 'SHIPPING', 'ENABLED'].join('_');

process.env.SUPABASE_URL = 'https://shippo-route-test.supabase.co';
process.env[supabaseSecretEnv] = ['shippo', 'route', 'test', 'secret'].join('-');

async function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/shippo', router);

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('Shippo operational routes are disabled by default', async () => {
  delete process.env[shippingEnabledEnv];
  const { default: router } = await import('../routes/shippo.js?shipping-disabled');
  const app = await startApp(router);

  try {
    for (const [method, path] of [
      ['GET', '/api/shippo/status'],
      ['POST', '/api/shippo/rates'],
      ['POST', '/api/shippo/labels'],
      ['GET', '/api/shippo/track/royalmail/test-number'],
    ]) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
      });
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.deepEqual(await response.json(), {
        error: 'Shipping is disabled for this release.',
        code: 'shipping_disabled',
        requestId: null,
      });
    }
  } finally {
    await app.close();
  }
});

test('enabling Shippo operations does not bypass bearer authentication', async () => {
  process.env[shippingEnabledEnv] = 'true';
  const { default: router } = await import('../routes/shippo.js?shipping-auth-required');
  const app = await startApp(router);

  try {
    const response = await fetch(`${app.baseUrl}/api/shippo/labels`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: 'Sign in is required for this request.',
      code: 'authentication_required',
      requestId: null,
    });
  } finally {
    delete process.env[shippingEnabledEnv];
    await app.close();
  }
});
