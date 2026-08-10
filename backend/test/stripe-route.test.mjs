import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

const supabaseSecretEnv = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const stripeSecretEnv = ['STRIPE', 'SECRET', 'KEY'].join('_');

process.env.SUPABASE_URL = 'https://stripe-route-test.supabase.co';
process.env[supabaseSecretEnv] = ['stripe', 'route', 'test', 'secret'].join('-');

async function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/stripe', router);

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

test('Stripe routes boot without a secret and fail dependent endpoints closed', async () => {
  delete process.env[stripeSecretEnv];
  const { default: router } = await import('../routes/stripe.js?stripe-missing');
  const app = await startApp(router);

  try {
    const requests = [
      ['POST', '/api/stripe/create-connect-account'],
      ['GET', '/api/stripe/account-status?userId=test-user'],
      ['POST', '/api/stripe/create-account-link'],
      ['POST', '/api/stripe/create-payment-intent'],
      ['POST', '/api/stripe/create-trade-cash-payment-intent'],
    ];

    for (const [method, path] of requests) {
      const response = await fetch(`${app.baseUrl}${path}`, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
      });
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.deepEqual(await response.json(), {
        error: 'Payments are temporarily unavailable.',
      });
    }

    for (const path of ['/api/stripe/onboarding-complete', '/api/stripe/onboarding-refresh']) {
      const response = await fetch(`${app.baseUrl}${path}`);
      assert.equal(response.status, 200, `GET ${path}`);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    }
  } finally {
    await app.close();
  }
});

test('a configured Stripe route continues to its normal request validation', async () => {
  process.env[stripeSecretEnv] = ['sk', 'test', 'stripe', 'route', 'configured'].join('_');
  const { default: router } = await import('../routes/stripe.js?stripe-configured');
  const app = await startApp(router);

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-connect-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'userId and email are required',
    });
  } finally {
    await app.close();
  }
});
