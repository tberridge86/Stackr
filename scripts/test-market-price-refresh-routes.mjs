import assert from 'node:assert/strict';
import express from 'express';
import createV1Router from '../backend/routes/v1.js';

const variantId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const requests = [];
const pricingService = {
  async snapshotHistory(ids, query) {
    requests.push({ type: 'history', ids, query });
    return { snapshots: [], limit: 338, rangeDays: 7, bucketMinutes: 30 };
  },
  async requestSnapshotRefresh(id, input, requestedBy) {
    requests.push({ type: 'single', id, input, requestedBy });
    return { variantId: id, status: 'queued', queuedAt: '2026-09-05T12:00:00.000Z', earliestRefreshAt: '2026-09-05T12:00:00.000Z', providerRefreshPending: true, quoteScope: 'exact_variant' };
  },
  async requestSnapshotRefreshBatch(ids, input, requestedBy) {
    requests.push({ type: 'batch', ids, input, requestedBy });
    return {
      items: [{ variantId: ids[0], status: 'already_queued', queuedAt: '2026-09-05T12:00:00.000Z', earliestRefreshAt: '2026-09-05T12:00:00.000Z', providerRefreshPending: true, quoteScope: 'exact_variant' }],
      summary: { queued: 0, already_queued: 1, cooldown: 0 },
    };
  },
};

const app = express();
app.use(express.json());
app.use('/v1', createV1Router({
  service: {},
  pricingService,
  getAuthenticatedUserId: async (req) => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    return userId;
  },
}));
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/v1`;

try {
  const history = await fetch(`${baseUrl}/market/price-snapshots?variantIds=${variantId}&rangeDays=7`);
  assert.equal(history.status, 200);
  assert.match(history.headers.get('cache-control') ?? '', /max-age=30/);
  assert.equal((await history.json()).data.bucketMinutes, 30);

  const single = await fetch(`${baseUrl}/cards/${variantId}/price-refresh`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ productType: 'raw_card', currency: 'GBP' }),
  });
  assert.equal(single.status, 202);
  assert.equal(single.headers.get('cache-control'), 'no-store');

  const batch = await fetch(`${baseUrl}/market/price-refresh`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantIds: [variantId], productType: 'raw_card', currency: 'GBP' }),
  });
  assert.equal(batch.status, 200, 'an already queued refresh is not a new quote or a new queue entry');
  assert.equal((await batch.json()).data.summary.already_queued, 1);

  assert.deepEqual(requests.map((request) => request.type), ['history', 'single', 'batch']);
  assert.equal(requests[1].requestedBy, userId);
  assert.deepEqual(requests[2].ids, [variantId]);
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

console.log('market price refresh route tests passed');
