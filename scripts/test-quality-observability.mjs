import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OBSERVABILITY_DASHBOARD_KEYS,
  assembleProtectedDashboard,
  createBoundedOperationalEventSink,
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

let releaseFirst;
const recorded = [];
const sink = createBoundedOperationalEventSink(async (event) => {
  recorded.push(event.requestId);
  if (event.requestId === 'first') await new Promise((resolve) => { releaseFirst = resolve; });
}, { maxPending: 2 });
assert.equal(sink.enqueue({ requestId: 'first' }), true);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(sink.pendingCount, 1, 'one slow telemetry write may be active');
assert.equal(sink.enqueue({ requestId: 'second' }), true);
assert.equal(sink.enqueue({ requestId: 'third' }), false, 'a telemetry burst is shed instead of creating an unbounded backend queue');
releaseFirst();
await sink.whenIdle();
assert.deepEqual(recorded, ['first', 'second'], 'telemetry writes remain single-flight and preserve accepted event order');

const recovered = [];
const rejectingSink = createBoundedOperationalEventSink(async (event) => {
  if (event.requestId === 'rejected') throw new Error('telemetry storage unavailable');
  recovered.push(event.requestId);
}, { maxPending: 1 });
assert.equal(rejectingSink.enqueue({ requestId: 'rejected' }), true, 'a recorder failure is accepted as best-effort work');
await rejectingSink.whenIdle();
assert.equal(rejectingSink.pendingCount, 0, 'a rejected recorder write releases the active queue slot');
assert.equal(rejectingSink.enqueue({ requestId: 'recovered' }), true, 'the sink accepts a subsequent event after becoming idle');
await rejectingSink.whenIdle();
assert.deepEqual(recovered, ['recovered'], 'the queue drains normally after a recorder rejection');

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
