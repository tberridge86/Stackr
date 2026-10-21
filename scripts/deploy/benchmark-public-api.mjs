import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  BENCHMARK_IDENTITIES,
  validatePublicApiBenchmarkResponse,
} from './public-api-benchmark-contract.mjs';

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}_must_be_an_integer_from_${minimum}_to_${maximum}`);
  }
  return value;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

async function timedRequest(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  let status = null;
  let cacheStatus = null;
  try {
    const response = await fetch(url, {
      headers: { 'X-Request-Id': randomUUID() },
      signal: controller.signal,
    });
    status = response.status;
    cacheStatus = response.headers.get('x-stackr-cache') ?? response.headers.get('cf-cache-status');
    const contentType = response.headers.get('content-type') ?? '';
    let body = null;
    if (contentType.includes('application/json')) body = await response.json();
    else await response.arrayBuffer();
    const durationMs = performance.now() - startedAt;
    return {
      ok: response.ok && (body?.error == null),
      status: response.status,
      durationMs,
      body,
      cacheStatus,
      failureType: !response.ok ? 'http' : body?.error != null ? 'api' : null,
    };
  } catch {
    return { ok: false, status, body: null, cacheStatus,
      durationMs: performance.now() - startedAt,
      failureType: controller.signal.aborted ? 'timeout' : status === null ? 'transport' : 'decode' };
  } finally {
    clearTimeout(timer);
  }
}

const gateway = argument('gateway', process.env.STACKR_GATEWAY_URL)?.replace(/\/$/, '');
if (!gateway || !gateway.startsWith('https://')) throw new Error('secure_gateway_url_required');

const samples = boundedInteger('samples', 20, 5, 100);
const warmups = boundedInteger('warmups', 3, 1, 20);
const timeoutMs = boundedInteger('timeout-ms', 10_000, 1_000, 30_000);
const scenarios = [
  {
    id: 'health',
    path: '/v1/health',
    thresholdMs: boundedInteger('health-p95-ms', 150, 50, 5_000),
  },
  {
    id: 'sets',
    path: '/v1/sets?language=en&limit=20',
    thresholdMs: boundedInteger('catalogue-p95-ms', 150, 50, 5_000),
  },
  {
    id: 'search',
    path: '/v1/search?q=SV2a%20157&language=ja&limit=5',
    thresholdMs: boundedInteger('search-p95-ms', 300, 50, 5_000),
  },
  {
    id: 'assets',
    path: `/v1/assets/manifest?assetType=card_image&variantId=${BENCHMARK_IDENTITIES.asset.variantId}&limit=20`,
    thresholdMs: boundedInteger('assets-p95-ms', 300, 50, 5_000),
  },
];

const results = [];
for (const scenario of scenarios) {
  const durations = [];
  const statuses = new Set();
  const usefulCounts = [];
  const requests = [];
  let failure = null;
  async function observe(phase, index) {
    const sample = await timedRequest(`${gateway}${scenario.path}`, timeoutMs);
    if (sample.status !== null) statuses.add(sample.status);
    const record = { phase, index, status: sample.status,
      durationMs: Number(sample.durationMs.toFixed(2)), cacheStatus: sample.cacheStatus,
      ok: false, failureType: sample.failureType };
    requests.push(record);
    if (!sample.ok) {
      throw new Error(`${scenario.id}_${phase}_failed_with_${sample.status ?? sample.failureType}`);
    }
    try {
      const validation = validatePublicApiBenchmarkResponse(scenario.id, sample.body);
      record.ok = true;
      record.usefulCount = validation.usefulCount;
      if (phase === 'sample') {
        usefulCounts.push(validation.usefulCount);
        durations.push(sample.durationMs);
      }
    } catch (error) {
      record.failureType = 'validation';
      throw error;
    }
  }
  try {
    for (let index = 0; index < warmups; index += 1) await observe('warmup', index);
    for (let index = 0; index < samples; index += 1) await observe('sample', index);
  } catch (error) {
    // Stop this scenario at its first failure without discarding its attempts.
    // Do not serialize response bodies or arbitrary transport exception text.
    const message = error instanceof Error ? error.message.split('\n')[0] : '';
    failure = /^[a-z][a-z0-9_:-]+$/.test(message) ? message : 'benchmark_validation_failed';
  }
  const attemptedSamples = requests.filter((request) => request.phase === 'sample').length;
  const attemptedWarmups = requests.length - attemptedSamples;
  const p95Ms = durations.length ? percentile(durations, 0.95) : null;
  results.push({
    id: scenario.id, path: scenario.path, samples: durations.length,
    requestedSamples: samples, requestedWarmups: warmups,
    attemptedSamples, attemptedWarmups,
    skippedSamples: samples - attemptedSamples, skippedWarmups: warmups - attemptedWarmups,
    successfulRequests: requests.filter((request) => request.ok).length,
    failedRequests: requests.filter((request) => !request.ok).length,
    statuses: [...statuses].sort(), requests,
    // First request is retained, but no shared cache was reset or proven cold.
    firstRequest: requests[0] ?? null,
    expectedIdentityVerified: failure === null && durations.length === samples,
    usefulCountMinimum: usefulCounts.length ? Math.min(...usefulCounts) : null,
    usefulCountMaximum: usefulCounts.length ? Math.max(...usefulCounts) : null,
    thresholdP95Ms: scenario.thresholdMs,
    p50Ms: durations.length ? Number(percentile(durations, 0.5).toFixed(2)) : null,
    p95Ms: p95Ms === null ? null : Number(p95Ms.toFixed(2)),
    maxMs: durations.length ? Number(Math.max(...durations).toFixed(2)) : null,
    passed: failure === null && durations.length === samples && p95Ms <= scenario.thresholdMs,
    ...(failure ? { error: failure } : {}),
  });
}

const report = {
  ok: results.every((result) => result.passed),
  gateway,
  measuredAt: new Date().toISOString(),
  warmups,
  samples,
  timingScope: 'request-through-full-body-decode; successful validated samples only',
  cacheScope: 'first request and repeats; shared cache coldness unverified',
  requestCount: results.reduce((sum, result) => sum + result.requests.length, 0),
  results,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

