import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OBSERVABILITY_DASHBOARD_KEYS,
  assembleProtectedDashboard,
  validateOperationalEvent,
  validateQualityReportPayload,
} from '../backend/lib/qualityObservability.js';
import { childTrace, formatTraceparent, parseTraceparent } from '../backend/lib/traceContext.js';

const now = new Date('2026-07-28T12:00:00.000Z');
const dashboard = assembleProtectedDashboard({
  generatedAt: now.toISOString(),
  dashboards: [{
    dashboard_key: 'api_health',
    status: 'healthy',
    summary: { requestCount: 12 },
    evidence_count: 12,
    limitations: [],
    generated_at: '2026-07-28T11:55:00.000Z',
    expires_at: '2026-07-28T12:10:00.000Z',
  }, {
    dashboard_key: 'pricing_freshness',
    status: 'healthy',
    summary: { freshEstimateCount: 3 },
    evidence_count: 3,
    limitations: [],
    generated_at: '2026-07-28T11:00:00.000Z',
    expires_at: '2026-07-28T11:30:00.000Z',
  }],
  latestQualityRun: null,
  releaseGates: [],
}, now);

assert.equal(dashboard.dashboards.length, OBSERVABILITY_DASHBOARD_KEYS.length);
assert.equal(dashboard.dashboards.find((row) => row.dashboardKey === 'api_health').status, 'healthy');
assert.equal(dashboard.dashboards.find((row) => row.dashboardKey === 'pricing_freshness').status, 'unavailable');
assert.equal(dashboard.dashboards.find((row) => row.dashboardKey === 'scanner_funnel').evidenceCount, 0);

assert.equal(validateOperationalEvent({
  requestId: 'request-test-0001',
  sourceComponent: 'gateway',
  eventType: 'request.completed',
  statusCode: 200,
  metricSummary: { cacheHit: true },
}).sourceComponent, 'gateway');
assert.throws(() => validateOperationalEvent({
  sourceComponent: 'gateway',
  eventType: 'request.completed',
  metricSummary: { imagePath: 'private/object.jpg' },
}), /Sensitive observability field/);
assert.throws(() => validateOperationalEvent({
  sourceComponent: 'gateway',
  eventType: 'request.completed',
  userId: 'not-allowed',
}), /Unsupported operational event field/);

assert.throws(() => validateQualityReportPayload({
  runKey: 'quality:test:0001',
  manifestSha256: 'a'.repeat(64),
  environment: 'test',
  report: { releaseGates: [], rawImagePayload: 'forbidden' },
}), /Sensitive observability field/);
assert.equal(validateQualityReportPayload({
  runKey: 'quality:test:0002',
  manifestSha256: 'b'.repeat(64),
  environment: 'test',
  report: {
    evidenceCounts: { images: 12, realImages: 12 },
    metrics: { resolvedWithoutImageUploadRate: { value: 1, denominator: 12 } },
    releaseGates: [],
  },
}).report.evidenceCounts.images, 12);

const incoming = '00-11111111111111111111111111111111-2222222222222222-01';
assert.equal(parseTraceparent(incoming).traceId, '11111111111111111111111111111111');
const child = childTrace(incoming);
assert.equal(child.traceId, '11111111111111111111111111111111');
assert.notEqual(child.spanId, '2222222222222222');
assert.match(formatTraceparent(child), /^00-11111111111111111111111111111111-[a-f0-9]{16}-01$/);
assert.equal(parseTraceparent('00-00000000000000000000000000000000-2222222222222222-01'), null);

const migration = readFileSync('supabase/migrations/20260728182743_stackr_quality_performance_observability.sql', 'utf8');
assert.match(migration, /security definer[\s\S]*api\.observability_dashboard\(\)/i);
assert.match(migration, /grant execute on function api\.observability_dashboard\(\) to service_role/i);
assert.match(migration, /revoke all on function api\.observability_dashboard\(\) from public, anon, authenticated/i);
assert.doesNotMatch(migration, /grant (?:select|execute)[^;]+ to anon/i);

console.log('Stackr quality observability tests passed.');
