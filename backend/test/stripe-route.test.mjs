import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

const supabaseSecretEnv = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const stripeSecretEnv = ['STRIPE', 'SECRET', 'KEY'].join('_');
const paymentsEnabledEnv = ['STACKR', 'LIVE', 'PAYMENTS', 'ENABLED'].join('_');

process.env.SUPABASE_URL = 'https://stripe-route-test.supabase.co';
process.env[supabaseSecretEnv] = ['stripe', 'route', 'test', 'secret'].join('-');

function routeMiddleware(router, path) {
  const layer = router.stack.find((candidate) => candidate.route?.path === path);
  assert.ok(layer, `missing route ${path}`);
  return layer.route.stack.map((candidate) => candidate.handle);
}

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

test('Stripe operational routes are disabled by default', async () => {
  delete process.env[stripeSecretEnv];
  delete process.env[paymentsEnabledEnv];
  const { default: router } = await import('../routes/stripe.js?payments-disabled');
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
        error: 'Payments are disabled for this release.',
        code: 'payments_disabled',
        requestId: null,
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

test('a Railway environment variable alone cannot unlock Stripe operations', async () => {
  process.env[paymentsEnabledEnv] = 'true';
  process.env[stripeSecretEnv] = ['sk', 'test', 'stripe', 'route', 'configured'].join('_');
  const { default: router } = await import('../routes/stripe.js?payments-code-locked');
  const app = await startApp(router);

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-connect-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'Payments are disabled for this release.',
      code: 'payments_disabled',
      requestId: null,
    });
  } finally {
    delete process.env[paymentsEnabledEnv];
    await app.close();
  }
});

test('Stripe operational routes retain authentication and identity checks behind the code lock', async () => {
  process.env[paymentsEnabledEnv] = 'true';
  process.env[stripeSecretEnv] = ['sk', 'test', 'stripe', 'route', 'guard-order'].join('_');
  const { default: router } = await import('../routes/stripe.js?payments-guard-order');

  try {
    for (const path of [
      '/create-connect-account',
      '/account-status',
      '/create-account-link',
      '/create-payment-intent',
      '/create-trade-cash-payment-intent',
    ]) {
      const middleware = routeMiddleware(router, path);
      assert.deepEqual(
        middleware.slice(0, 3).map((handler) => handler.name),
        ['requireReleaseFeature', 'requireAuthenticatedUser', 'requireStripeConfigured'],
        path,
      );
      assert.match(
        middleware.at(-1).toString(),
        /requireMatchingAuthenticatedUser/,
        `${path} must bind caller identity to the authenticated user`,
      );
    }
  } finally {
    delete process.env[paymentsEnabledEnv];
  }
});
