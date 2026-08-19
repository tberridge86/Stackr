import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

const supabaseSecretEnv = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const stripeSecretEnv = ['STRIPE', 'SECRET', 'KEY'].join('_');

process.env.SUPABASE_URL = 'https://stripe-route-test.supabase.co';
process.env[supabaseSecretEnv] = ['stripe', 'route', 'test', 'secret'].join('-');

async function startApp(router) {
  const app = express();
  app.use((req, res, next) => {
    req.stackrRequestId = String(req.headers['x-request-id'] ?? 'stripe-route-test-request');
    res.setHeader('X-Request-Id', req.stackrRequestId);
    next();
  });
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

function authenticatedSupabase({
  user = { id: 'buyer-1', email: 'buyer@example.com' },
  from,
} = {}) {
  return {
    auth: {
      getUser: async (token) => token === 'valid-token'
        ? { data: { user }, error: null }
        : { data: { user: null }, error: new Error('invalid token') },
    },
    from: from ?? (() => {
      throw new Error('Database should not be called by this test.');
    }),
  };
}

function fakeStripe() {
  const calls = {
    paymentIntentCreates: [],
    paymentIntentCancels: [],
    accountCreates: [],
    accountLinkCreates: [],
  };
  const intents = new Map();
  let sequence = 0;

  return {
    calls,
    accounts: {
      create: async (payload, options) => {
        calls.accountCreates.push({ payload, options });
        return { id: 'acct_created' };
      },
      retrieve: async (id) => ({
        id,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    },
    accountLinks: {
      create: async (payload, options) => {
        calls.accountLinkCreates.push({ payload, options });
        return { url: 'https://connect.stripe.test/onboarding' };
      },
    },
    paymentIntents: {
      create: async (payload, options) => {
        sequence += 1;
        const intent = {
          id: `pi_${sequence}`,
          client_secret: `secret_${sequence}`,
          status: 'requires_payment_method',
          metadata: payload.metadata ?? {},
        };
        calls.paymentIntentCreates.push({ payload, options, intent });
        intents.set(intent.id, intent);
        return intent;
      },
      retrieve: async (id) => intents.get(id) ?? {
        id,
        client_secret: `secret_${id}`,
        status: 'requires_payment_method',
        metadata: {},
      },
      cancel: async (id) => {
        calls.paymentIntentCancels.push(id);
        const current = intents.get(id);
        if (current) current.status = 'canceled';
        return current ?? { id, status: 'canceled' };
      },
    },
  };
}

function listingDatabase({ listing, reserveSucceeds = true }) {
  return (table) => {
    assert.equal(table, 'user_card_flags');
    const state = {
      operation: 'select',
      payload: null,
      filters: [],
    };
    const builder = {
      select() {
        return builder;
      },
      update(payload) {
        state.operation = 'update';
        state.payload = payload;
        return builder;
      },
      eq(column, value) {
        state.filters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        if (state.operation === 'update') {
          const guardedActive = state.filters.some(([column, value]) => (
            column === 'listing_status' && value === 'active'
          ));
          if (reserveSucceeds && guardedActive && listing.listing_status === 'active') {
            Object.assign(listing, state.payload);
            return {
              data: {
                id: listing.id,
                listing_status: listing.listing_status,
                payment_intent_id: listing.payment_intent_id,
              },
              error: null,
            };
          }
          listing.listing_status = 'reserved';
          listing.payment_intent_id = 'pi_other_buyer';
          return { data: null, error: null };
        }
        return { data: { ...listing }, error: null };
      },
    };
    return builder;
  };
}

async function configuredModule() {
  process.env[stripeSecretEnv] = 'sk_test_stackr_route_tests';
  return import(`../routes/stripe.js?configured-${Date.now()}-${Math.random()}`);
}

test('Stripe routes boot without a secret and fail dependent endpoints closed', async () => {
  delete process.env[stripeSecretEnv];
  const { default: router } = await import(`../routes/stripe.js?stripe-missing-${Date.now()}`);
  const app = await startApp(router);

  try {
    const requests = [
      ['POST', '/api/stripe/create-connect-account'],
      ['GET', '/api/stripe/account-status'],
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

test('configured payment routes require a validated Supabase access token', async () => {
  const { createStripeRouter } = await configuredModule();
  const app = await startApp(createStripeRouter({
    stripeClient: fakeStripe(),
    supabaseClient: authenticatedSupabase(),
    logger: { warn: () => {}, error: () => {} },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/account-status`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'authentication_required');
    assert.equal(body.requestId, 'stripe-route-test-request');
  } finally {
    await app.close();
  }
});

test('client-supplied user ids cannot impersonate another account', async () => {
  const { createStripeRouter } = await configuredModule();
  const stripe = fakeStripe();
  let databaseCalls = 0;
  const app = await startApp(createStripeRouter({
    stripeClient: stripe,
    supabaseClient: authenticatedSupabase({
      from: () => {
        databaseCalls += 1;
        throw new Error('Database should not be reached after identity mismatch.');
      },
    }),
    logger: { warn: () => {}, error: () => {} },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ listingId: 'listing-1', buyerId: 'another-user' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'identity_mismatch');
    assert.equal(databaseCalls, 0);
    assert.equal(stripe.calls.paymentIntentCreates.length, 0);
  } finally {
    await app.close();
  }
});

test('buyers cannot purchase their own listing', async () => {
  const { createStripeRouter } = await configuredModule();
  const stripe = fakeStripe();
  const listing = {
    id: 'listing-1',
    user_id: 'buyer-1',
    listing_status: 'active',
    asking_price: 12.5,
    profiles: { stripe_account_id: 'acct_seller' },
  };
  const app = await startApp(createStripeRouter({
    stripeClient: stripe,
    supabaseClient: authenticatedSupabase({ from: listingDatabase({ listing }) }),
    logger: { warn: () => {}, error: () => {} },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ listingId: listing.id }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'self_purchase_not_allowed');
    assert.equal(stripe.calls.paymentIntentCreates.length, 0);
  } finally {
    await app.close();
  }
});

test('a listing is reserved conditionally and Stripe receives a deterministic idempotency key', async () => {
  const { createStripeRouter, buildStripeIdempotencyKey } = await configuredModule();
  const stripe = fakeStripe();
  const listing = {
    id: 'listing-success',
    user_id: 'seller-1',
    listing_status: 'active',
    asking_price: 19.99,
    profiles: { stripe_account_id: 'acct_seller' },
  };
  const app = await startApp(createStripeRouter({
    stripeClient: stripe,
    supabaseClient: authenticatedSupabase({ from: listingDatabase({ listing }) }),
    platformFeePercent: 0.05,
    logger: { warn: () => {}, error: () => {} },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
        'x-request-id': 'buy-listing-success',
      },
      body: JSON.stringify({ listingId: listing.id }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.paymentIntentId, 'pi_1');
    assert.equal(body.listingId, listing.id);
    assert.equal(body.idempotentReplay, false);
    assert.equal(listing.listing_status, 'reserved');
    assert.equal(listing.payment_intent_id, 'pi_1');

    const createCall = stripe.calls.paymentIntentCreates[0];
    assert.equal(createCall.payload.amount, 1999);
    assert.equal(createCall.payload.application_fee_amount, 100);
    assert.equal(createCall.payload.metadata.buyerId, 'buyer-1');
    assert.equal(
      createCall.options.idempotencyKey,
      buildStripeIdempotencyKey('market-purchase', listing.id, 'buyer-1', 1999),
    );
  } finally {
    await app.close();
  }
});

test('a losing concurrent buyer has its unused PaymentIntent cancelled', async () => {
  const { createStripeRouter } = await configuredModule();
  const stripe = fakeStripe();
  const listing = {
    id: 'listing-race',
    user_id: 'seller-1',
    listing_status: 'active',
    asking_price: 25,
    profiles: { stripe_account_id: 'acct_seller' },
  };
  const app = await startApp(createStripeRouter({
    stripeClient: stripe,
    supabaseClient: authenticatedSupabase({
      from: listingDatabase({ listing, reserveSucceeds: false }),
    }),
    logger: { warn: () => {}, error: () => {} },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ listingId: listing.id }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'listing_reservation_conflict');
    assert.deepEqual(stripe.calls.paymentIntentCancels, ['pi_1']);
  } finally {
    await app.close();
  }
});

test('internal database errors are logged but not exposed to payment clients', async () => {
  const { createStripeRouter } = await configuredModule();
  const errors = [];
  const failingFrom = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: null, error: new Error('secret database diagnostic') }),
    };
    return builder;
  };
  const app = await startApp(createStripeRouter({
    stripeClient: fakeStripe(),
    supabaseClient: authenticatedSupabase({ from: failingFrom }),
    logger: { warn: () => {}, error: (entry) => errors.push(entry) },
  }));

  try {
    const response = await fetch(`${app.baseUrl}/api/stripe/account-status`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.code, 'payment_request_failed');
    assert.equal(JSON.stringify(body).includes('secret database diagnostic'), false);
    assert.equal(JSON.stringify(errors).includes('secret database diagnostic'), true);
  } finally {
    await app.close();
  }
});

test('payment amount, fee, currency and idempotency helpers fail closed', async () => {
  const {
    amountToMinorUnits,
    buildStripeIdempotencyKey,
    calculatePlatformFee,
    normalisePaymentCurrency,
  } = await configuredModule();

  assert.equal(amountToMinorUnits('12.34'), 1234);
  assert.equal(calculatePlatformFee(1234, 0.05), 62);
  assert.equal(normalisePaymentCurrency('GBP'), 'gbp');
  assert.equal(
    buildStripeIdempotencyKey('purchase', 'listing-1', 'buyer-1'),
    buildStripeIdempotencyKey('purchase', 'listing-1', 'buyer-1'),
  );
  assert.notEqual(
    buildStripeIdempotencyKey('purchase', 'listing-1', 'buyer-1'),
    buildStripeIdempotencyKey('purchase', 'listing-1', 'buyer-2'),
  );
  assert.throws(() => amountToMinorUnits(0), /greater than zero/);
  assert.throws(() => calculatePlatformFee(100, 1), /temporarily unavailable/);
  assert.throws(() => normalisePaymentCurrency('usd'), /Only GBP/);
});
