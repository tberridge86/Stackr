import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createStripeWebhookHandler } from '../routes/stripeWebhook.js';

async function startApp(handler, { preserveRawBody = true } = {}) {
  const app = express();
  app.use((req, res, next) => {
    req.stackrRequestId = String(req.headers['x-request-id'] ?? 'webhook-test-request');
    res.setHeader('X-Request-Id', req.stackrRequestId);
    next();
  });
  app.use(express.json({
    verify(req, _res, buffer) {
      if (preserveRawBody) req.stackrRawBody = Buffer.from(buffer);
    },
  }));
  app.post('/api/stripe/webhook', handler);

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

function paymentEvent(overrides = {}) {
  return {
    id: 'evt_stackr_001',
    type: 'payment_intent.succeeded',
    created: 1_787_113_200,
    livemode: false,
    data: {
      object: {
        id: 'pi_stackr_001',
        status: 'succeeded',
        metadata: {
          listingId: 'listing-1',
          buyerId: '00000000-0000-0000-0000-000000000001',
          sellerId: '00000000-0000-0000-0000-000000000002',
          type: 'market_purchase',
          ignoredKey: 'must-not-cross-the-boundary',
        },
      },
    },
    ...overrides,
  };
}

function stripeVerifier({ event = paymentEvent(), error = null, assertions = () => {} } = {}) {
  return {
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        assertions(rawBody, signature, secret);
        if (error) throw error;
        return event;
      },
    },
  };
}

function reconciliationSupabase({ data = null, error = null } = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return { data, error };
    },
  };
}

async function postWebhook(app, body, headers = {}) {
  return fetch(`${app.baseUrl}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });
}

test('webhook fails closed when its signing secret is not configured', async () => {
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier(),
    supabaseClient: reconciliationSupabase(),
    webhookSecret: '',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}', { 'stripe-signature': 'test-signature' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'stripe_webhook_unavailable');
  } finally {
    await app.close();
  }
});

test('webhook requires Stripe-Signature before verification', async () => {
  let verificationCalls = 0;
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier({ assertions: () => { verificationCalls += 1; } }),
    supabaseClient: reconciliationSupabase(),
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'stripe_signature_required');
    assert.equal(verificationCalls, 0);
  } finally {
    await app.close();
  }
});

test('webhook verifies the exact preserved bytes and rejects invalid signatures', async () => {
  const warnings = [];
  const body = JSON.stringify({ id: 'evt_invalid_signature', amount: 1999 });
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier({
      error: new Error('signature mismatch'),
      assertions(rawBody, signature, secret) {
        assert.equal(Buffer.isBuffer(rawBody), true);
        assert.equal(rawBody.toString('utf8'), body);
        assert.equal(signature, 'invalid-signature');
        assert.equal(secret, 'whsec_test');
      },
    }),
    supabaseClient: reconciliationSupabase(),
    webhookSecret: 'whsec_test',
    logger: { warn: (entry) => warnings.push(entry), error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, body, { 'stripe-signature': 'invalid-signature' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'invalid_stripe_signature');
    assert.equal(warnings.length, 1);
    assert.equal(JSON.stringify(warnings).includes(body), false, 'raw webhook bodies must never be logged');
    assert.equal(JSON.stringify(warnings).includes('invalid-signature'), false, 'signatures must never be logged');
  } finally {
    await app.close();
  }
});

test('unsupported signed events are acknowledged without touching settlement state', async () => {
  const supabase = reconciliationSupabase();
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier({
      event: paymentEvent({ id: 'evt_account_001', type: 'account.updated' }),
    }),
    supabaseClient: supabase,
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}', { 'stripe-signature': 'valid-signature' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.received, true);
    assert.equal(body.ignored, true);
    assert.equal(body.eventType, 'account.updated');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await app.close();
  }
});

test('verified PaymentIntent events cross only the bounded reconciliation contract', async () => {
  const reconciliation = {
    eventId: 'evt_stackr_001',
    outcome: 'processed',
    transactionId: '00000000-0000-0000-0000-000000000099',
    replayed: false,
  };
  const supabase = reconciliationSupabase({ data: reconciliation });
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier(),
    supabaseClient: supabase,
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}', {
      'stripe-signature': 'valid-signature',
      'x-request-id': 'stripe-delivery-001',
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.reconciliation, reconciliation);
    assert.equal(body.requestId, 'stripe-delivery-001');

    assert.equal(supabase.calls.length, 1);
    const call = supabase.calls[0];
    assert.equal(call.name, 'reconcile_stripe_payment_event');
    assert.equal(call.args.p_event_id, 'evt_stackr_001');
    assert.equal(call.args.p_event_type, 'payment_intent.succeeded');
    assert.equal(call.args.p_payment_intent_id, 'pi_stackr_001');
    assert.equal(call.args.p_payment_status, 'succeeded');
    assert.equal(call.args.p_livemode, false);
    assert.deepEqual(call.args.p_metadata, {
      listingId: 'listing-1',
      buyerId: '00000000-0000-0000-0000-000000000001',
      sellerId: '00000000-0000-0000-0000-000000000002',
      type: 'market_purchase',
    });
    assert.equal('ignoredKey' in call.args.p_metadata, false);
  } finally {
    await app.close();
  }
});

test('duplicate-event results are acknowledged as successful replays', async () => {
  const supabase = reconciliationSupabase({
    data: {
      eventId: 'evt_stackr_001',
      outcome: 'processed',
      transactionId: '00000000-0000-0000-0000-000000000099',
      replayed: true,
    },
  });
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier(),
    supabaseClient: supabase,
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}', { 'stripe-signature': 'valid-signature' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reconciliation.replayed, true);
  } finally {
    await app.close();
  }
});

test('database reconciliation failures return 500 for provider retry without leaking diagnostics', async () => {
  const errors = [];
  const supabase = reconciliationSupabase({ error: new Error('private ledger connection failed') });
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier(),
    supabaseClient: supabase,
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: (entry) => errors.push(entry) },
  });
  const app = await startApp(handler);
  try {
    const response = await postWebhook(app, '{}', { 'stripe-signature': 'valid-signature' });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.code, 'stripe_reconciliation_failed');
    assert.equal(JSON.stringify(body).includes('private ledger connection failed'), false);
    assert.equal(JSON.stringify(errors).includes('private ledger connection failed'), true);
  } finally {
    await app.close();
  }
});

test('missing raw bytes is treated as server misconfiguration, not as an unverifiable event', async () => {
  const handler = createStripeWebhookHandler({
    stripeClient: stripeVerifier(),
    supabaseClient: reconciliationSupabase(),
    webhookSecret: 'whsec_test',
    logger: { warn: () => {}, error: () => {} },
  });
  const app = await startApp(handler, { preserveRawBody: false });
  try {
    const response = await postWebhook(app, '{}', { 'stripe-signature': 'valid-signature' });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).code, 'stripe_webhook_misconfigured');
  } finally {
    await app.close();
  }
});
