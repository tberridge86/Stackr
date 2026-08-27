import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import legacyTradeMutationRoutes from '../routes/legacyTradeMutations.js';

async function startApp() {
  const app = express();
  let downstreamMutationAttempts = 0;

  app.use(express.json());
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] ?? null;
    req.stackrRequestId = requestId;
    if (requestId) res.setHeader('X-Request-Id', requestId);
    next();
  });
  app.use('/api/trade', legacyTradeMutationRoutes);
  app.post('/api/trade/:action', (_req, res) => {
    downstreamMutationAttempts += 1;
    res.status(500).json({ error: 'mutation canary reached' });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    downstreamMutationAttempts: () => downstreamMutationAttempts,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('legacy sent and received mutations are terminal 410 routes', async () => {
  const app = await startApp();
  const cases = [
    { path: 'sent', headers: {}, requestId: null },
    { path: 'received', headers: {}, requestId: null },
    {
      path: 'sent',
      headers: { authorization: 'Bearer forged-token', 'x-request-id': 'forged-sent' },
      requestId: 'forged-sent',
    },
    {
      path: 'received',
      headers: { authorization: 'Bearer forged-token', 'x-request-id': 'forged-received' },
      requestId: 'forged-received',
    },
  ];

  try {
    for (const { path, headers, requestId } of cases) {
      const response = await fetch(`${app.baseUrl}/api/trade/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          trade_id: 'trade-owned-by-someone-else',
          user_id: 'forged-participant-id',
        }),
      });

      assert.equal(response.status, 410, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-request-id'), requestId);
      assert.deepEqual(await response.json(), {
        error: 'This legacy trade mutation route has been retired.',
        code: 'legacy_trade_mutation_retired',
        requestId,
      });
    }

    assert.equal(
      app.downstreamMutationAttempts(),
      0,
      'retired requests must never reach a downstream service-role mutation handler',
    );
  } finally {
    await app.close();
  }
});

test('the retired router exposes only the two legacy POST actions', () => {
  const routes = legacyTradeMutationRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
      handler: layer.route.stack[0]?.handle?.name,
    }));

  assert.deepEqual(routes, [
    { path: '/sent', methods: ['post'], handler: 'legacyTradeMutationRetired' },
    { path: '/received', methods: ['post'], handler: 'legacyTradeMutationRetired' },
  ]);
});

test('the backend mounts the retired router instead of privileged inline mutations', () => {
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(
    serverSource,
    /import legacyTradeMutationRoutes from '\.\/routes\/legacyTradeMutations\.js';/,
  );
  assert.match(serverSource, /app\.use\('\/api\/trade', legacyTradeMutationRoutes\);/);
  assert.doesNotMatch(serverSource, /app\.post\('\/api\/trade\/(?:sent|received)'/);
});
