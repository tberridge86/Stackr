import assert from 'node:assert/strict';
import {
  buildScannerAnalyticsMetadata,
  summarizeScannerAnalyticsRows,
  type ScannerAnalyticsEventRow,
} from '../lib/scannerAnalytics';
import type { ScannerClientContext } from '../lib/scannerClientContext';

const client: ScannerClientContext = {
  appVersion: 'test',
  platform: 'ios',
  osName: 'iOS',
  osVersion: '18',
  deviceFamily: 'iPhone',
  deviceTier: 'high',
};

const legacyFlags = {
  captureGeometryV2: false,
  cardLocalisation: false,
  scanQuality: false,
  autoCaptureV2: false,
  localOcrMatcher: false,
  ximilarFallback: false,
  binderPageV2: false,
  stackrApiEnabled: false,
  onDeviceEmbeddingEnabled: false,
  stackrRecognitionPrimary: false,
  imageFallbackEnabled: false,
  ximilarEmergencyFallback: false,
  scanFeedbackEnabled: true,
};

const rev2Flags = {
  ...legacyFlags,
  captureGeometryV2: true,
  cardLocalisation: true,
  scanQuality: true,
  localOcrMatcher: true,
};

function row(
  eventType: string,
  outcome: string | null,
  analytics: Record<string, unknown>,
  extra: Partial<ScannerAnalyticsEventRow> = {}
): ScannerAnalyticsEventRow {
  return {
    id: `${eventType}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    event_type: eventType,
    scan_mode: null,
    route_context: { analytics },
    frame_metrics: {},
    ocr_preview: null,
    candidate_count: 0,
    candidates: [],
    selected_card_id: null,
    selected_set_id: null,
    selected_card_name: null,
    outcome,
    notes: null,
    client_version: 'test',
    ...extra,
  };
}

const attemptLocal = buildScannerAnalyticsMetadata({
  timings: { total_scan_ms: 1000 },
  scanIntent: 'quick_collection',
  scanMode: 'auto',
  language: 'en',
  matchSource: 'local',
  confidence: 91,
  alternatives: 1,
  client,
  featureFlags: rev2Flags,
});

const attemptRemote = buildScannerAnalyticsMetadata({
  timings: { total_scan_ms: 2000, remote_request_ms: 700 },
  scanIntent: 'quick_collection',
  scanMode: 'manual',
  language: 'ja',
  matchSource: 'remote',
  confidence: 84,
  alternatives: 2,
  remoteEndpoint: 'tcg_id',
  client: { ...client, deviceTier: 'low' },
  featureFlags: legacyFlags,
});

const attemptHybridFailure = buildScannerAnalyticsMetadata({
  timings: { total_scan_ms: 5000, remote_request_ms: 1200 },
  scanIntent: 'raw_listing',
  scanMode: 'auto',
  language: 'en',
  matchSource: 'hybrid',
  confidence: 45,
  alternatives: 0,
  remoteEndpoint: 'tcg_id',
  errorCategory: 'network',
  client,
  featureFlags: rev2Flags,
});

const correction = buildScannerAnalyticsMetadata({
  timings: {},
  scanIntent: 'quick_collection',
  scanMode: 'manual',
  language: 'ja',
  matchSource: 'manual',
  confidence: 84,
  alternatives: 2,
  manualCorrection: true,
  client,
  featureFlags: rev2Flags,
});

const rescan = buildScannerAnalyticsMetadata({
  timings: {},
  scanIntent: 'quick_collection',
  scanMode: 'manual',
  language: 'ja',
  matchSource: 'none',
  rescan: true,
  client,
  featureFlags: rev2Flags,
});

const dashboard = summarizeScannerAnalyticsRows([
  row('attempt', 'candidates_returned', attemptLocal),
  row('attempt', 'candidates_returned', attemptRemote),
  row('attempt', 'no_match', attemptHybridFailure),
  row('match_incorrect', 'match_incorrect', correction),
  row('rescan', 'retry_requested', rescan),
], 14);

assert.equal(dashboard.attemptCount, 3);
assert.equal(dashboard.eventCount, 5);
assert.equal(dashboard.medianScanMs, 2000);
assert.equal(dashboard.p95ScanMs, 5000);
assert.equal(dashboard.localMatchPercentage, 33.3);
assert.equal(dashboard.remoteFallbackPercentage, 66.7);
assert.equal(dashboard.firstAttemptSuccessPercentage, 66.7);
assert.equal(dashboard.correctionRate, 33.3);
assert.equal(dashboard.rescanRate, 33.3);
assert.equal(dashboard.failureRate, 33.3);
assert.equal(dashboard.ximilarRequestCount, 2);

const languageKeys = dashboard.accuracyByLanguage.map((entry) => entry.key);
assert.deepEqual(languageKeys, ['en', 'ja']);

const variants = Object.fromEntries(dashboard.featureComparisons.map((entry) => [entry.key, entry]));
assert.equal(variants.rev2.attempts, 2);
assert.equal(variants.legacy.attempts, 1);
assert.equal(variants.legacy.remoteFallbackRate, 100);

console.log('scanner analytics summary checks passed');
