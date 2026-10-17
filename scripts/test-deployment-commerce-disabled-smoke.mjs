import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const expectedBackendCommit = '0123456789abcdef0123456789abcdef01234567';
const expectedBackendEnvironment = 'staging';
const expectedBackendSupabaseProjectRef = 'lmwfhvexfcoyeuoyrlco';

const disabledRoutes = [
  ['POST', '/api/stripe/create-connect-account', 503, 'payments_disabled'],
  ['GET', '/api/stripe/account-status?userId=commerce-disabled-smoke', 503, 'payments_disabled'],
  ['POST', '/api/stripe/create-account-link', 503, 'payments_disabled'],
  ['POST', '/api/stripe/create-payment-intent', 503, 'payments_disabled'],
  ['POST', '/api/stripe/create-trade-cash-payment-intent', 503, 'payments_disabled'],
  ['GET', '/api/stripe/onboarding-complete', 503, 'payments_disabled'],
  ['GET', '/api/stripe/onboarding-refresh', 503, 'payments_disabled'],
  ['GET', '/api/shippo/status', 503, 'shipping_disabled'],
  ['POST', '/api/shippo/rates', 503, 'shipping_disabled'],
  ['POST', '/api/shippo/labels', 503, 'shipping_disabled'],
  ['GET', '/api/shippo/track/smoke/smoke-commerce-disabled', 503, 'shipping_disabled'],
  ['POST', '/api/trade/sent', 410, 'legacy_trade_mutation_retired'],
  ['POST', '/api/trade/received', 410, 'legacy_trade_mutation_retired'],
  ['POST', '/api/notify', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/notify/trade-offer', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/notify/trade-status', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/notify/wishlist-match', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/notify/price-alert', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/discord/new-trade-listing', 410, 'unauthenticated_side_effect_retired'],
  ['POST', '/api/discord/new-review', 410, 'unauthenticated_side_effect_retired'],
];

const expectedMessages = {
  payments_disabled: 'Payments are disabled for this release.',
  shipping_disabled: 'Shipping is disabled for this release.',
  legacy_trade_mutation_retired: 'This legacy trade mutation route has been retired.',
  unauthenticated_side_effect_retired: 'This unauthenticated side-effect route has been retired.',
};

function runSmoke(args, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/deploy/smoke.mjs', ...args], {
      cwd: repoRoot,
      env: { ...process.env, STACKR_BACKEND_URL: '', STACKR_GATEWAY_URL: '', STACKR_RECOGNITION_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('deployment smoke test child process timed out'));
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function parseSmokeOutput(result) {
  assert.ok(result.stdout.trim(), result.stderr || 'smoke test did not emit JSON');
  return JSON.parse(result.stdout);
}

test('Gate 0 deployment smoke proves every commerce and unsafe side-effect route is locked', async (t) => {
  const expectedByRequest = new Map(
    disabledRoutes.map(([method, path, status, code]) => [`${method} ${path}`, { status, code }]),
  );
  const requests = [];
  let fault = { kind: 'none', target: null };

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const method = req.method ?? 'GET';
    const requestPath = req.url ?? '/';
    const key = `${method} ${requestPath}`;
    const requestId = String(req.headers['x-request-id'] ?? '');
    requests.push({
      key,
      body: Buffer.concat(chunks).toString('utf8'),
      contentType: req.headers['content-type'] ?? null,
    });

    if (key === 'GET /health') {
      const activeFault = fault.target === key ? fault.kind : 'none';
      const runtime = activeFault === 'missing-runtime'
        ? undefined
        : {
            gitCommit: activeFault === 'wrong-commit' ? 'fedcba987654' : expectedBackendCommit.slice(0, 12),
            railwayEnvironment: activeFault === 'wrong-environment' ? 'production' : expectedBackendEnvironment,
            supabaseProjectRef: activeFault === 'wrong-project' ? 'wrongprojectref000000' : expectedBackendSupabaseProjectRef,
          };
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ ok: true, runtime }));
      return;
    }

    if (key === 'GET /v1/health') {
      res.writeHead(401, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ error: 'gateway_origin_key_required', requestId }));
      return;
    }

    const expected = expectedByRequest.get(key);
    if (!expected) {
      res.writeHead(404, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ error: 'unexpected test route', requestId }));
      return;
    }

    const activeFault = fault.target === key ? fault.kind : 'none';
    const responseCode = activeFault === 'wrong-code' ? 'unexpected_disabled_code' : expected.code;
    const responseRequestId = activeFault === 'body-request-id-mismatch'
      ? `mismatch-${requestId}`
      : requestId;
    const headers = { 'content-type': 'application/json' };
    if (activeFault !== 'missing-request-id-header') headers['x-request-id'] = requestId;
    res.writeHead(activeFault === 'wrong-status' ? 200 : expected.status, headers);
    res.end(JSON.stringify({
      error: expectedMessages[expected.code],
      code: responseCode,
      requestId: responseRequestId,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const backendUrl = `http://127.0.0.1:${port}`;
  const gatewayRequests = [];
  const gatewayServer = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const requestPath = req.url ?? '/';
    const key = `${method} ${requestPath}`;
    const requestId = String(req.headers['x-request-id'] ?? '');
    const origin = String(req.headers.origin ?? '');
    gatewayRequests.push(key);

    if (key === 'OPTIONS /v1/health') {
      res.writeHead(204, {
        'access-control-allow-origin': origin,
        'x-request-id': requestId,
      });
      res.end();
      return;
    }
    if (key === 'GET /v1/health' && origin === 'https://not-stackr.invalid') {
      res.writeHead(403, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ error: 'origin_denied', requestId }));
      return;
    }
    if (key === 'GET /v1/health' || key === 'GET /v1/ready') {
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ ok: true, requestId }));
      return;
    }

    // The Gate 0 safety smoke must never depend on catalogue content.
    res.writeHead(503, {
      'content-type': 'application/json',
      'x-request-id': requestId,
    });
    res.end(JSON.stringify({ error: 'empty_catalogue_fixture', requestId }));
  });
  await new Promise((resolve) => gatewayServer.listen(0, '127.0.0.1', resolve));
  const { port: gatewayPort } = gatewayServer.address();
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

  async function scenario(kind = 'none', target = null, extraArgs = []) {
    requests.length = 0;
    fault = { kind, target };
    return runSmoke([
      `--backend=${backendUrl}`,
      '--require-commerce-disabled',
      `--expected-backend-commit=${expectedBackendCommit}`,
      `--expected-backend-environment=${expectedBackendEnvironment}`,
      `--expected-backend-supabase-project-ref=${expectedBackendSupabaseProjectRef}`,
      ...extraArgs,
    ]);
  }

  try {
    await t.test('passes only when every route returns the exact lock response', async () => {
      const result = await scenario();
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(result.signal, null);
      const output = parseSmokeOutput(result);
      assert.equal(output.ok, true);
      assert.deepEqual(
        requests.map((request) => request.key),
        ['GET /health', ...disabledRoutes.map(([method, path]) => `${method} ${path}`)],
      );
      for (const request of requests.filter(({ key }) => key.startsWith('POST '))) {
        assert.equal(request.contentType, 'application/json');
        assert.equal(request.body, '{}');
      }
      const commerceChecks = output.checks.filter(({ name }) => (
        name.includes('stripe_')
        || name.includes('shippo_')
        || name.includes('legacy_trade_')
        || name.includes('notify_')
        || name.includes('discord_')
      ));
      assert.equal(commerceChecks.length, disabledRoutes.length);
      for (const check of commerceChecks) {
        const expectedRoute = disabledRoutes.find(([, path]) => path === check.path);
        assert.equal(check.status, expectedRoute?.[2], check.name);
        assert.equal(check.ok, true, check.name);
        assert.equal(check.requestIdPropagated, true, check.name);
        assert.equal(check.bodyCheck?.ok, true, check.name);
        assert.equal(check.bodyCheck?.headerRequestId, check.bodyCheck?.bodyRequestId, check.name);
      }
    });

    await t.test('passes the public Gate 0 gateway safety proof with an empty catalogue', async () => {
      requests.length = 0;
      gatewayRequests.length = 0;
      fault = { kind: 'none', target: null };
      const result = await runSmoke([
        `--backend=${backendUrl}`,
        `--gateway=${gatewayUrl}`,
        '--gateway-safety',
        '--require-commerce-disabled',
        `--expected-backend-commit=${expectedBackendCommit}`,
        `--expected-backend-environment=${expectedBackendEnvironment}`,
        `--expected-backend-supabase-project-ref=${expectedBackendSupabaseProjectRef}`,
      ]);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const output = parseSmokeOutput(result);
      assert.equal(output.ok, true);
      assert.deepEqual(gatewayRequests, [
        'GET /v1/health',
        'GET /v1/ready',
        'OPTIONS /v1/health',
        'GET /v1/health',
      ]);
      assert.ok(!gatewayRequests.some((request) => /catalog|sets|cards|assets|search|languages/.test(request)));
      assert.equal(
        output.checks.find(({ name }) => name === 'direct_origin_v1_health_without_gateway_key')?.status,
        401,
      );
      assert.equal(output.checks.find(({ name }) => name === 'cors_allowed_preflight')?.status, 204);
      assert.equal(output.checks.find(({ name }) => name === 'cors_denied_origin')?.status, 403);
    });

    await t.test('fails on an incorrect disabled code', async () => {
      const target = 'POST /api/stripe/create-payment-intent';
      const result = await scenario('wrong-code', target);
      assert.equal(result.status, 1, result.stdout);
      const output = parseSmokeOutput(result);
      const failed = output.checks.find(({ name }) => name === 'stripe_create_payment_intent_disabled');
      assert.equal(output.ok, false);
      assert.equal(failed?.bodyCheck?.expectedCode, 'payments_disabled');
      assert.equal(failed?.bodyCheck?.receivedCode, 'unexpected_disabled_code');
    });

    for (const [faultKind, field] of [
      ['wrong-commit', 'receivedCommit'],
      ['wrong-environment', 'receivedEnvironment'],
      ['wrong-project', 'receivedSupabaseProjectRef'],
      ['missing-runtime', 'receivedCommit'],
    ]) {
      await t.test(`fails closed on backend attestation fault: ${faultKind}`, async () => {
        const result = await scenario(faultKind, 'GET /health');
        assert.equal(result.status, 1, result.stdout);
        const output = parseSmokeOutput(result);
        const failed = output.checks.find(({ name }) => name === 'backend_health');
        assert.equal(failed?.ok, false);
        assert.ok(Object.prototype.hasOwnProperty.call(failed?.bodyCheck ?? {}, field));
      });
    }

    await t.test('fails on any status other than 503', async () => {
      const result = await scenario('wrong-status', 'GET /api/shippo/status');
      assert.equal(result.status, 1, result.stdout);
      const output = parseSmokeOutput(result);
      const failed = output.checks.find(({ name }) => name === 'shippo_status_disabled');
      assert.equal(failed?.status, 200);
      assert.equal(failed?.bodyCheck?.ok, false);
    });

    await t.test('request-id header cannot be waived for commerce lock proof', async () => {
      const result = await scenario(
        'missing-request-id-header',
        'POST /api/shippo/labels',
        ['--allow-missing-request-id'],
      );
      assert.equal(result.status, 1, result.stdout);
      const output = parseSmokeOutput(result);
      const failed = output.checks.find(({ name }) => name === 'shippo_labels_disabled');
      assert.equal(failed?.requestIdPropagated, false);
      assert.equal(failed?.bodyCheck?.headerRequestId, null);
      assert.equal(failed?.bodyCheck?.ok, false);
    });

    await t.test('fails when response body and header request IDs differ', async () => {
      const result = await scenario(
        'body-request-id-mismatch',
        'GET /api/stripe/onboarding-complete',
      );
      assert.equal(result.status, 1, result.stdout);
      const output = parseSmokeOutput(result);
      const failed = output.checks.find(({ name }) => name === 'stripe_onboarding_complete_disabled');
      assert.equal(failed?.requestIdPropagated, true);
      assert.notEqual(failed?.bodyCheck?.headerRequestId, failed?.bodyCheck?.bodyRequestId);
      assert.equal(failed?.bodyCheck?.ok, false);
    });

    await t.test('fails closed when no backend URL is supplied', async () => {
      const result = await runSmoke(['--backend=', '--require-commerce-disabled']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires a backend URL/);
    });
  } finally {
    await new Promise((resolve, reject) => {
      gatewayServer.close((error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('Owner backend fail-fast smoke retains the complete success gate and stops at the first failed check', async (t) => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-owner-testflight-backend.yml', import.meta.url), 'utf8');
  const smokeCommand = workflow.split(/\r?\n/).find(line => line.includes('deploy:smoke --'));
  assert.ok(smokeCommand, 'The existing owner backend lane must retain deployment smoke.');
  for (const flag of ['--silent', '--full-gateway', '--fail-fast', '--require-commerce-disabled',
    '--require-published-catalogue', '--required-catalogue-languages=en,ja,zh-tw,zh-cn,ko', '--allowed-origin=https://stackr.app']) {
    assert.ok(smokeCommand.includes(flag), `Owner backend smoke retains ${flag}`);
  }
  assert.match(workflow, /npm run test:deployment-commerce-disabled-smoke/);
  const setId = '11111111-1111-4111-8111-111111111111';
  const cardId = '22222222-2222-4222-8222-222222222222';
  const assetId = '33333333-3333-4333-8333-333333333333';
  const nextAssetId = '44444444-4444-4444-8444-444444444444';
  const requests = [];
  let fault = null;
  let baseUrl;
  let heldSocketClosed = false;
  const fullOrder = [
    'GET /origin/health',
    ...disabledRoutes.map(([method, path]) => `${method} /origin${path}`),
    'GET /origin/v1/health',
    ...[
      '/v1/health', '/v1/ready', '/v1/catalog/manifest', '/v1/languages', '/v1/sets?limit=1',
      `/v1/sets/${setId}/cards?limit=1`, `/v1/cards/${cardId}`, `/v1/cards/${cardId}/variants`,
      '/v1/search?q=SV2a%20157&limit=1', '/v1/pokemon/pikachu/cards?limit=1',
      '/v1/pokemon/Mr.%20Mime/cards?limit=1', '/v1/pokemon/pikachu/cards?provider=all',
      '/v1/assets/manifest?limit=1', '/v1/assets/manifest?limit=1&cursor=fixture-next',
    ].map(path => `GET /gateway${path}`),
    'GET /image', 'OPTIONS /gateway/v1/health', 'GET /gateway/v1/health',
  ];
  const server = createServer(async (req, res) => {
    const key = `${req.method} ${req.url}`;
    requests.push(key);
    const active = fault?.key === key ? fault.kind : null;
    if (active === 'transport') { req.socket.destroy(); return; }
    const requestId = String(req.headers['x-request-id'] ?? '');
    if (active !== 'request-id') res.setHeader('x-request-id', requestId);
    res.setHeader('content-type', 'application/json');
    if (active === 'held-body') {
      res.writeHead(504); res.flushHeaders(); res.write('{');
      const timer = setInterval(() => res.write(' '), 50);
      req.socket.once('close', () => { heldSocketClosed = true; clearInterval(timer); });
      return;
    }
    if (active === 'status') { res.writeHead(504); res.end('{}'); return; }
    const send = (body, status = 200) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (key === 'GET /origin/health') return send({ ok: true });
    if (key === 'GET /origin/v1/health') return send({}, 401);
    const locked = disabledRoutes.find(([method, path]) => key === `${method} /origin${path}`);
    if (locked) {
      const [, , status, code] = locked;
      return send({ code: active === 'body' ? 'wrong_disabled_code' : code,
        error: expectedMessages[code], requestId }, status);
    }
    if (key === 'GET /image') {
      res.setHeader('content-type', 'image/webp'); res.end(Buffer.from('fixture-image')); return;
    }
    if (key === 'OPTIONS /gateway/v1/health') {
      res.setHeader('access-control-allow-origin', req.headers.origin); res.writeHead(204); res.end(); return;
    }
    if (key === 'GET /gateway/v1/health' && req.headers.origin === 'https://not-stackr.invalid') return send({}, 403);
    if (key === 'GET /gateway/v1/catalog/manifest') {
      const languages = active === 'missing-language' ? ['en', 'ja', 'zh-tw', 'zh-cn'] : ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
      return send({ data: { currentCatalogueVersion: 'fixture', availableLanguageShards: languages.map(languageCode => ({
        languageCode, catalogueVersion: 'fixture', catalogueVersionId: setId,
      })) } });
    }
    if (key === 'GET /gateway/v1/sets?limit=1') return send({ data: { sets: [{ setId }] } });
    if (key === `GET /gateway/v1/sets/${setId}/cards?limit=1`) return send({ data: { cards: [{ cardId }] } });
    if (key === `GET /gateway/v1/cards/${cardId}/variants`) return send({ data: { variants: [{ variantId: assetId }] } });
    if (/^GET \/gateway\/v1\/pokemon\/.+\/cards\?limit=1$/.test(key)) return send({
      data: { cards: [{ cardId, names: { native: key.includes('pikachu') ? 'Pikachu' : 'Mr Mime' } }] },
      meta: { pagination: { limit: 1, nextCursor: null } },
    });
    if (key === 'GET /gateway/v1/pokemon/pikachu/cards?provider=all') return send({ error: { code: 'unsupported_query_parameter' } }, 400);
    if (key.startsWith('GET /gateway/v1/assets/manifest?')) return send({
      data: { assets: [{ assetId: key.includes('cursor=') ? nextAssetId : assetId, deliveryUrl: `${baseUrl}/image` }] },
      meta: { pagination: { nextCursor: 'fixture-next' } },
    });
    if (['GET /gateway/v1/health', 'GET /gateway/v1/ready', 'GET /gateway/v1/languages',
      'GET /gateway/v1/search?q=SV2a%20157&limit=1', `GET /gateway/v1/cards/${cardId}`].includes(key)) return send({ data: {} });
    send({ error: 'unexpected_fixture_route' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const scenario = async (nextFault = null, failFast = true, extraArgs = []) => {
    requests.length = 0;
    fault = nextFault;
    return runSmoke([
      `--backend=${baseUrl}/origin`, `--gateway=${baseUrl}/gateway`, '--recognition=',
      '--full-gateway', '--require-commerce-disabled', '--require-published-catalogue',
      '--required-catalogue-languages=en,ja,zh-tw,zh-cn,ko', '--allowed-origin=https://stackr.app',
      ...(failFast ? ['--fail-fast'] : []), ...extraArgs,
    ], nextFault?.kind === 'held-body' ? 3000 : 15_000);
  };
  try {
    for (const failFast of [true, false]) {
      await t.test(`complete success retains every required and conditional check (fail-fast=${failFast})`, async () => {
        const result = await scenario(null, failFast);
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const output = parseSmokeOutput(result);
        assert.deepEqual(Object.keys(output), ['ok', 'checks']);
        assert.equal(output.ok, true); assert.equal(output.checks.length, 39);
        assert.deepEqual(requests, fullOrder);
        assert.ok(output.checks.every(check => check.ok));
      });
    }
    for (const [kind, key] of [
      ['status', 'GET /origin/health'],
      ['body', 'POST /origin/api/stripe/create-payment-intent'],
      ['transport', 'GET /gateway/v1/ready'],
      ['missing-language', 'GET /gateway/v1/catalog/manifest'],
      ['request-id', 'GET /gateway/v1/languages'],
    ]) {
      await t.test(`fail-fast ${kind} preserves failed partial receipt and sends no later check`, async () => {
        const result = await scenario({ kind, key });
        assert.equal(result.status, 1, result.stderr || result.stdout);
        const output = parseSmokeOutput(result);
        const expectedCount = fullOrder.indexOf(key) + 1;
        assert.equal(output.ok, false);
        assert.deepEqual(Object.keys(output), ['ok', 'checks']);
        assert.equal(output.checks.length, expectedCount);
        assert.deepEqual(requests, fullOrder.slice(0, expectedCount));
        const failed = output.checks.at(-1);
        assert.ok(!failed.ok || !failed.requestIdPropagated);
        assert.ok(output.checks.slice(0, -1).every(check => check.ok));
        if (kind === 'missing-language') assert.deepEqual(failed.bodyCheck.missingLanguageShards, ['ko']);
        if (kind === 'transport') assert.equal(failed.status, null);
      });
    }
    await t.test('default mode still continues after failure and reports every check', async () => {
      const result = await scenario({ kind: 'missing-language', key: 'GET /gateway/v1/catalog/manifest' }, false);
      const output = parseSmokeOutput(result);
      assert.equal(result.status, 1); assert.equal(output.ok, false);
      assert.equal(output.checks.length, 39); assert.deepEqual(requests, fullOrder);
    });
    await t.test('failed status with a held-open body closes its socket and exits promptly', async () => {
      const result = await scenario({ kind: 'held-body', key: 'GET /origin/health' });
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.equal(result.signal, null);
      const output = parseSmokeOutput(result);
      assert.equal(output.ok, false); assert.equal(output.checks.length, 1);
      assert.equal(output.checks[0].status, 504);
      assert.equal(output.checks[0].requestIdPropagated, true);
      assert.deepEqual(requests, ['GET /origin/health']);
      for (let i = 0; !heldSocketClosed && i < 60; i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(heldSocketClosed, true, 'Failed-check transport must close without waiting for garbage collection.');
    });
    await t.test('fail-fast respects the existing optional request-ID waiver', async () => {
      const result = await scenario({ kind: 'request-id', key: 'GET /gateway/v1/languages' }, true, ['--allow-missing-request-id']);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(parseSmokeOutput(result).checks.length, 39);
      assert.deepEqual(requests, fullOrder);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
