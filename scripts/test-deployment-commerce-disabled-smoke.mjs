import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const disabledRoutes = [
  ['POST', '/api/stripe/create-connect-account', 'payments_disabled'],
  ['GET', '/api/stripe/account-status?userId=commerce-disabled-smoke', 'payments_disabled'],
  ['POST', '/api/stripe/create-account-link', 'payments_disabled'],
  ['POST', '/api/stripe/create-payment-intent', 'payments_disabled'],
  ['POST', '/api/stripe/create-trade-cash-payment-intent', 'payments_disabled'],
  ['GET', '/api/stripe/onboarding-complete', 'payments_disabled'],
  ['GET', '/api/stripe/onboarding-refresh', 'payments_disabled'],
  ['GET', '/api/shippo/status', 'shipping_disabled'],
  ['POST', '/api/shippo/rates', 'shipping_disabled'],
  ['POST', '/api/shippo/labels', 'shipping_disabled'],
  ['GET', '/api/shippo/track/smoke/smoke-commerce-disabled', 'shipping_disabled'],
];

const expectedMessages = {
  payments_disabled: 'Payments are disabled for this release.',
  shipping_disabled: 'Shipping is disabled for this release.',
};

function runSmoke(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/deploy/smoke.mjs', ...args], {
      cwd: repoRoot,
      env: process.env,
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
    }, 15_000);

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

test('commerce-disabled deployment smoke proves every Stripe and Shippo route is locked', async (t) => {
  const expectedByRequest = new Map(
    disabledRoutes.map(([method, path, code]) => [`${method} ${path}`, code]),
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
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const expectedCode = expectedByRequest.get(key);
    if (!expectedCode) {
      res.writeHead(404, {
        'content-type': 'application/json',
        'x-request-id': requestId,
      });
      res.end(JSON.stringify({ error: 'unexpected test route', requestId }));
      return;
    }

    const activeFault = fault.target === key ? fault.kind : 'none';
    const responseCode = activeFault === 'wrong-code' ? 'unexpected_disabled_code' : expectedCode;
    const responseRequestId = activeFault === 'body-request-id-mismatch'
      ? `mismatch-${requestId}`
      : requestId;
    const headers = { 'content-type': 'application/json' };
    if (activeFault !== 'missing-request-id-header') headers['x-request-id'] = requestId;
    res.writeHead(activeFault === 'wrong-status' ? 200 : 503, headers);
    res.end(JSON.stringify({
      error: expectedMessages[expectedCode],
      code: responseCode,
      requestId: responseRequestId,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const backendUrl = `http://127.0.0.1:${port}`;

  async function scenario(kind = 'none', target = null, extraArgs = []) {
    requests.length = 0;
    fault = { kind, target };
    return runSmoke([
      `--backend=${backendUrl}`,
      '--require-commerce-disabled',
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
      const commerceChecks = output.checks.filter(({ name }) => name.includes('stripe_') || name.includes('shippo_'));
      assert.equal(commerceChecks.length, disabledRoutes.length);
      for (const check of commerceChecks) {
        assert.equal(check.status, 503, check.name);
        assert.equal(check.ok, true, check.name);
        assert.equal(check.requestIdPropagated, true, check.name);
        assert.equal(check.bodyCheck?.ok, true, check.name);
        assert.equal(check.bodyCheck?.headerRequestId, check.bodyCheck?.bodyRequestId, check.name);
      }
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
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
