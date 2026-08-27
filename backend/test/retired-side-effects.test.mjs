import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import retiredSideEffectRoutes, {
  RETIRED_UNAUTHENTICATED_SIDE_EFFECT_PATHS,
} from '../routes/retiredSideEffects.js';

async function startApp() {
  const app = express();
  let downstreamSideEffectAttempts = 0;

  app.use(express.json());
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] ?? null;
    req.stackrRequestId = requestId;
    if (requestId) res.setHeader('X-Request-Id', requestId);
    next();
  });
  app.use('/api', retiredSideEffectRoutes);
  app.post('/api/*path', (_req, res) => {
    downstreamSideEffectAttempts += 1;
    res.status(500).json({ error: 'side-effect canary reached' });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    downstreamSideEffectAttempts: () => downstreamSideEffectAttempts,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('unauthenticated service-role and webhook side effects are terminal 410 routes', async () => {
  const app = await startApp();

  try {
    for (const [index, path] of RETIRED_UNAUTHENTICATED_SIDE_EFFECT_PATHS.entries()) {
      const requestId = `retired-side-effect-${index}`;
      const response = await fetch(`${app.baseUrl}/api${path}`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer forged-token',
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000001',
          recipientUserId: '00000000-0000-0000-0000-000000000002',
          listingId: '00000000-0000-0000-0000-000000000003',
          reviewedUserId: '00000000-0000-0000-0000-000000000004',
        }),
      });

      assert.equal(response.status, 410, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-request-id'), requestId);
      assert.deepEqual(await response.json(), {
        error: 'This unauthenticated side-effect route has been retired.',
        code: 'unauthenticated_side_effect_retired',
        requestId,
      });
    }

    assert.equal(
      app.downstreamSideEffectAttempts(),
      0,
      'retired requests must never reach push, service-role lookup or webhook handlers',
    );
  } finally {
    await app.close();
  }
});

test('the backend contains no legacy side-effect handlers or duplicate Discord mount', () => {
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const discordSource = readFileSync(new URL('../routes/discord.js', import.meta.url), 'utf8');
  const dormantDiscordTypeScript = new URL('../routes/discord.ts', import.meta.url);

  assert.match(
    serverSource,
    /import retiredSideEffectRoutes from '\.\/routes\/retiredSideEffects\.js';/,
  );
  assert.match(serverSource, /app\.use\('\/api', retiredSideEffectRoutes\);/);
  assert.doesNotMatch(serverSource, /app\.post\('\/api\/notify(?:\/|')/);
  assert.doesNotMatch(serverSource, /async function (?:sendPushNotification|getUserPushToken)\(/);
  assert.equal(
    serverSource.match(/app\.use\('\/api\/discord', discordRoutes\);/g)?.length,
    1,
    'the public bug-report/feedback Discord router should be mounted exactly once',
  );
  assert.doesNotMatch(discordSource, /router\.post\('\/(?:new-trade-listing|new-review)'/);
  assert.doesNotMatch(discordSource, /SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/);
  assert.equal(
    existsSync(dormantDiscordTypeScript),
    false,
    'a dormant TypeScript duplicate must not be able to resurrect retired routes',
  );
});
