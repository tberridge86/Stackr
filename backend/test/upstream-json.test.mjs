import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchJsonWithPolicy,
  parseRetryAfterMs,
  UpstreamHttpError,
} from '../lib/upstreamJson.js';

function response(body, status = 200, headers = {}) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('upstream requests honour Retry-After and recover from a 429', async () => {
  const calls = [];
  const sleeps = [];
  const result = await fetchJsonWithPolicy('https://provider.invalid/cards', {
    provider: 'test-provider',
    fetchImpl: async (_url, options) => {
      calls.push(options);
      return calls.length === 1
        ? response({ error: 'rate limited' }, 429, { 'retry-after': '2' })
        : response({ data: ['ok'] });
    },
    sleepImpl: async (ms) => sleeps.push(ms),
    random: () => 0,
  });

  assert.deepEqual(result.value, { data: ['ok'] });
  assert.equal(result.attempts, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [2000]);
});

test('204 responses are successful empty results', async () => {
  const result = await fetchJsonWithPolicy('https://provider.invalid/missing', {
    provider: 'test-provider',
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(result.status, 204);
  assert.equal(result.value, null);
});

test('terminal 4xx responses fail without retrying', async () => {
  let calls = 0;
  await assert.rejects(
    fetchJsonWithPolicy('https://provider.invalid/cards/not-found', {
      provider: 'test-provider',
      fetchImpl: async () => {
        calls += 1;
        return response({ error: 'not found' }, 404);
      },
      sleepImpl: async () => assert.fail('404 must not be retried'),
    }),
    (error) => error instanceof UpstreamHttpError
      && error.status === 404
      && error.retryable === false
      && error.code === 'upstream_http_error',
  );
  assert.equal(calls, 1);
});

test('invalid JSON fails closed with a bounded diagnostic', async () => {
  await assert.rejects(
    fetchJsonWithPolicy('https://provider.invalid/bad-json', {
      provider: 'test-provider',
      fetchImpl: async () => new Response('{broken', { status: 200 }),
    }),
    (error) => error instanceof UpstreamHttpError
      && error.code === 'upstream_invalid_json'
      && error.responseBody === '{broken',
  );
});

test('Retry-After supports seconds and HTTP dates', () => {
  assert.equal(parseRetryAfterMs('1.5', 0), 1500);
  assert.equal(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 1000), 4000);
  assert.equal(parseRetryAfterMs('invalid', 0), null);
});
