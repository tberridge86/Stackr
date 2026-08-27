import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

const supabaseSecretEnv = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const stripeSecretEnv = ['STRIPE', 'SECRET', 'KEY'].join('_');
const paymentsEnabledEnv = ['STACKR', 'LIVE', 'PAYMENTS', 'ENABLED'].join('_');

process.env.SUPABASE_URL = 'https://stripe-route-test.supabase.co';
process.env[supabaseSecretEnv] = ['stripe', 'route', 'test', 'secret'].join('-');

function installSupabaseUserResponse(user) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL
      ? String(input)
      : String(input?.url ?? '');
    if (url.startsWith(`${process.env.SUPABASE_URL}/auth/v1/user`)) {
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
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

test('enabling Stripe operations does not bypass bearer authentication', async () => {
  process.env[paymentsEnabledEnv] = 'true';
  process.env[stripeSecretEnv] = ['sk', 'test', 'stripe', 'route', 'configured'].join('_');
  const { default: router } = await import('../routes/stripe.js?payments-auth-required');
  const app = await startApp(router);

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-connect-account`, {
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
    delete process.env[paymentsEnabledEnv];
    await app.close();
  }
});

test('Stripe money movement rejects an authenticated caller supplying another buyer id', async () => {
  process.env[paymentsEnabledEnv] = 'true';
  process.env[stripeSecretEnv] = ['sk', 'test', 'stripe', 'route', 'identity'].join('_');
  const restoreFetch = installSupabaseUserResponse({
    id: 'signed-in-buyer',
    email: 'buyer@example.com',
  });
  const { default: router } = await import('../routes/stripe.js?payments-identity-match');
  const app = await startApp(router);

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-access-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        listingId: 'listing-1',
        buyerId: 'different-buyer',
      }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'buyerId does not match the signed-in account.',
      code: 'identity_mismatch',
      requestId: null,
    });
  } finally {
    delete process.env[paymentsEnabledEnv];
    restoreFetch();
    await app.close();
  }
});
