import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

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
  try {
    const response = await fetch(url, {
      headers: { 'X-Request-Id': randomUUID() },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    let body = null;
    if (contentType.includes('application/json')) body = await response.json();
    else await response.arrayBuffer();
    const durationMs = performance.now() - startedAt;
    return {
      ok: response.ok && (body?.error == null),
      status: response.status,
      durationMs,
    };
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
    path: '/v1/assets/manifest?limit=20',
    thresholdMs: boundedInteger('assets-p95-ms', 300, 50, 5_000),
  },
];

const results = [];
for (const scenario of scenarios) {
  const url = `${gateway}${scenario.path}`;
  for (let index = 0; index < warmups; index += 1) {
    const warmup = await timedRequest(url, timeoutMs);
    if (!warmup.ok) throw new Error(`${scenario.id}_warmup_failed_with_${warmup.status}`);
  }

  const durations = [];
  const statuses = new Set();
  for (let index = 0; index < samples; index += 1) {
    const sample = await timedRequest(url, timeoutMs);
    statuses.add(sample.status);
    if (!sample.ok) throw new Error(`${scenario.id}_sample_failed_with_${sample.status}`);
    durations.push(sample.durationMs);
  }

  const p50Ms = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  results.push({
    id: scenario.id,
    path: scenario.path,
    samples,
    statuses: [...statuses].sort(),
    thresholdP95Ms: scenario.thresholdMs,
    p50Ms: Number(p50Ms.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    passed: p95Ms <= scenario.thresholdMs,
  });
}

const report = {
  ok: results.every((result) => result.passed),
  gateway,
  measuredAt: new Date().toISOString(),
  warmups,
  samples,
  results,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
