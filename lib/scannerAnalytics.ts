import {
  CARD_LOCALISATION_ENABLED,
  CAPTURE_GEOMETRY_V2_ENABLED,
  SCAN_AUTO_CAPTURE_V2_ENABLED,
  SCAN_BINDER_PAGE_V2_ENABLED,
  SCAN_LOCAL_OCR_MATCHER_ENABLED,
  SCAN_QUALITY_ENABLED,
  SCAN_XIMILAR_FALLBACK_ENABLED,
} from './config';
import { getRecognitionFeatureFlags } from './recognition/featureFlags';
import type { ScanIdentifyDiagnostics } from './cardSight';
import { SCANNER_CALIBRATION_VERSION } from './scannerCalibration';
import type { ScannerClientContext } from './scannerClientContext';

export const SCANNER_ANALYTICS_SCHEMA_VERSION = 'scanner-analytics-v1';
export const SCANNER_RULESET_VERSION = `stackr-scan-ruleset-2026-07-20:${SCANNER_CALIBRATION_VERSION}`;

export type ScannerFeatureFlags = {
  captureGeometryV2: boolean;
  cardLocalisation: boolean;
  scanQuality: boolean;
  autoCaptureV2: boolean;
  localOcrMatcher: boolean;
  ximilarFallback: boolean;
  binderPageV2: boolean;
  stackrApiEnabled: boolean;
  onDeviceEmbeddingEnabled: boolean;
  stackrRecognitionPrimary: boolean;
  imageFallbackEnabled: boolean;
  ximilarEmergencyFallback: boolean;
  scanFeedbackEnabled: boolean;
};

export type ScannerTimingMetrics = {
  camera_initialisation_ms: number | null;
  first_card_detection_ms: number | null;
  quality_gate_ms: number | null;
  stable_capture_ms: number | null;
  photo_capture_ms: number | null;
  perspective_crop_ms: number | null;
  ocr_ms: number | null;
  local_candidate_match_ms: number | null;
  remote_request_ms: number | null;
  database_save_ms: number | null;
  total_scan_ms: number | null;
};

export type ScannerAnalyticsMetadata = {
  schemaVersion: typeof SCANNER_ANALYTICS_SCHEMA_VERSION;
  rulesetVersion: typeof SCANNER_RULESET_VERSION;
  timings: ScannerTimingMetrics;
  scanIntent: string | null;
  scanMode: string | null;
  language: string | null;
  matchSource: 'local' | 'remote' | 'hybrid' | 'manual' | 'none' | 'unknown';
  confidence: number | null;
  alternatives: number;
  qualityFailureReasons: string[];
  manualCorrection: boolean;
  rescan: boolean;
  cancellation: boolean;
  duplicatePrevention: boolean;
  remoteEndpoint: string | null;
  errorCategory: string | null;
  thresholdVersion: string | null;
  featureFlags: ScannerFeatureFlags;
  featureVariant: 'rev2' | 'legacy';
  client: ScannerClientContext;
};

export type ScannerAnalyticsEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  scan_mode: string | null;
  route_context: any;
  frame_metrics: any;
  ocr_preview: string | null;
  candidate_count: number | null;
  candidates: any;
  selected_card_id: string | null;
  selected_set_id: string | null;
  selected_card_name: string | null;
  outcome: string | null;
  notes: string | null;
  client_version: string | null;
};

export type ScannerMetricBreakdown = {
  key: string;
  attempts: number;
  successRate: number;
  correctionRate: number;
  medianMs: number | null;
};

export type ScannerFeatureComparison = ScannerMetricBreakdown & {
  remoteFallbackRate: number;
};

export type ScannerAnalyticsDashboard = {
  windowDays: number;
  eventCount: number;
  attemptCount: number;
  medianScanMs: number | null;
  p95ScanMs: number | null;
  localMatchPercentage: number;
  remoteFallbackPercentage: number;
  firstAttemptSuccessPercentage: number;
  correctionRate: number;
  rescanRate: number;
  failureRate: number;
  ximilarRequestCount: number;
  estimatedXimilarUsage: string;
  accuracyByLanguage: ScannerMetricBreakdown[];
  accuracyByDeviceTier: ScannerMetricBreakdown[];
  accuracyByScanMode: ScannerMetricBreakdown[];
  featureComparisons: ScannerFeatureComparison[];
  latestErrors: ScannerAnalyticsEventRow[];
};

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function cleanNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function getProviderRows(row: ScannerAnalyticsEventRow) {
  const providers = row.route_context?.recognitionDiagnostics?.providers;
  return Array.isArray(providers) ? providers : [];
}

function getRemoteProviderRows(row: ScannerAnalyticsEventRow) {
  return getProviderRows(row).filter((provider) => {
    const providerName = String(provider?.provider ?? '').toLowerCase();
    const stage = String(provider?.stage ?? '').toLowerCase();
    return providerName.includes('ximilar')
      || stage.includes('remote')
      || stage.includes('fallback')
      || stage.includes('visual');
  });
}

export function getScannerFeatureFlags(): ScannerFeatureFlags {
  const recognitionFlags = getRecognitionFeatureFlags();
  return {
    captureGeometryV2: CAPTURE_GEOMETRY_V2_ENABLED,
    cardLocalisation: CARD_LOCALISATION_ENABLED,
    scanQuality: SCAN_QUALITY_ENABLED,
    autoCaptureV2: SCAN_AUTO_CAPTURE_V2_ENABLED,
    localOcrMatcher: SCAN_LOCAL_OCR_MATCHER_ENABLED,
    ximilarFallback: SCAN_XIMILAR_FALLBACK_ENABLED,
    binderPageV2: SCAN_BINDER_PAGE_V2_ENABLED,
    stackrApiEnabled: recognitionFlags.stackrApiEnabled,
    onDeviceEmbeddingEnabled: recognitionFlags.onDeviceEmbeddingEnabled,
    stackrRecognitionPrimary: recognitionFlags.stackrRecognitionPrimary,
    imageFallbackEnabled: recognitionFlags.imageFallbackEnabled,
    ximilarEmergencyFallback: recognitionFlags.ximilarEmergencyFallback,
    scanFeedbackEnabled: recognitionFlags.scanFeedbackEnabled,
  };
}

export function getScannerFeatureVariant(flags: ScannerFeatureFlags = getScannerFeatureFlags()) {
  return flags.captureGeometryV2
    || flags.cardLocalisation
    || flags.scanQuality
    || flags.autoCaptureV2
    || flags.localOcrMatcher
    || flags.binderPageV2
    || flags.stackrApiEnabled
    || flags.onDeviceEmbeddingEnabled
    || flags.stackrRecognitionPrimary
    ? 'rev2' as const
    : 'legacy' as const;
}

export function getRemoteRequestMs(diagnostics?: ScanIdentifyDiagnostics | null) {
  if (!diagnostics?.providers?.length) return null;
  const total = diagnostics.providers.reduce((sum, provider) => {
    const providerName = String(provider.provider ?? '').toLowerCase();
    const stage = String(provider.stage ?? '').toLowerCase();
    const remote = providerName.includes('ximilar')
      || stage.includes('remote')
      || stage.includes('fallback')
      || stage.includes('visual');
    return remote ? sum + Math.max(0, Number(provider.durationMs) || 0) : sum;
  }, 0);
  return total || null;
}

export function getRemoteEndpointUsed(diagnostics?: ScanIdentifyDiagnostics | null) {
  const provider = diagnostics?.providers?.find((entry) => String(entry.provider ?? '').toLowerCase().includes('ximilar'));
  const signals = provider?.signals as any;
  return signals?.endpoint ?? signals?.requestedEndpoint ?? signals?.recognitionReason ?? provider?.stage ?? null;
}

export function getMatchSource(input: {
  localStatus?: string | null;
  diagnostics?: ScanIdentifyDiagnostics | null;
  candidateCount?: number | null;
  manual?: boolean;
}) {
  if (input.manual) return 'manual' as const;
  const hasLocal = Boolean(input.localStatus && input.localStatus !== 'none');
  const hasRemote = Boolean(getRemoteRequestMs(input.diagnostics));
  if (hasLocal && hasRemote) return 'hybrid' as const;
  if (hasLocal) return 'local' as const;
  if (hasRemote) return 'remote' as const;
  if (!input.candidateCount) return 'none' as const;
  return 'unknown' as const;
}

export function classifyScannerErrorCategory(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (!message) return null;
  if (lower.includes('permission')) return 'camera_permission';
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) return 'network';
  if (lower.includes('camera') || lower.includes('native')) return 'camera_runtime';
  if (lower.includes('image') || lower.includes('base64') || lower.includes('crop')) return 'image_processing';
  if (lower.includes('supabase') || lower.includes('database')) return 'database';
  return 'unknown';
}

export function buildScannerAnalyticsMetadata(input: {
  timings: Partial<ScannerTimingMetrics>;
  scanIntent?: string | null;
  scanMode?: string | null;
  language?: string | null;
  matchSource?: ScannerAnalyticsMetadata['matchSource'];
  confidence?: number | null;
  alternatives?: number | null;
  qualityFailureReasons?: string[] | null;
  manualCorrection?: boolean | null;
  rescan?: boolean | null;
  cancellation?: boolean | null;
  duplicatePrevention?: boolean | null;
  remoteEndpoint?: string | null;
  errorCategory?: string | null;
  thresholdVersion?: string | null;
  client: ScannerClientContext;
  featureFlags?: ScannerFeatureFlags;
}): ScannerAnalyticsMetadata {
  const featureFlags = input.featureFlags ?? getScannerFeatureFlags();
  return {
    schemaVersion: SCANNER_ANALYTICS_SCHEMA_VERSION,
    rulesetVersion: SCANNER_RULESET_VERSION,
    timings: {
      camera_initialisation_ms: cleanNumber(input.timings.camera_initialisation_ms),
      first_card_detection_ms: cleanNumber(input.timings.first_card_detection_ms),
      quality_gate_ms: cleanNumber(input.timings.quality_gate_ms),
      stable_capture_ms: cleanNumber(input.timings.stable_capture_ms),
      photo_capture_ms: cleanNumber(input.timings.photo_capture_ms),
      perspective_crop_ms: cleanNumber(input.timings.perspective_crop_ms),
      ocr_ms: cleanNumber(input.timings.ocr_ms),
      local_candidate_match_ms: cleanNumber(input.timings.local_candidate_match_ms),
      remote_request_ms: cleanNumber(input.timings.remote_request_ms),
      database_save_ms: cleanNumber(input.timings.database_save_ms),
      total_scan_ms: cleanNumber(input.timings.total_scan_ms),
    },
    scanIntent: input.scanIntent ?? null,
    scanMode: input.scanMode ?? null,
    language: input.language ?? null,
    matchSource: input.matchSource ?? 'unknown',
    confidence: cleanNumber(input.confidence),
    alternatives: Math.max(0, Math.round(Number(input.alternatives ?? 0) || 0)),
    qualityFailureReasons: (input.qualityFailureReasons ?? []).slice(0, 8).map(String),
    manualCorrection: Boolean(input.manualCorrection),
    rescan: Boolean(input.rescan),
    cancellation: Boolean(input.cancellation),
    duplicatePrevention: Boolean(input.duplicatePrevention),
    remoteEndpoint: input.remoteEndpoint ?? null,
    errorCategory: input.errorCategory ?? null,
    thresholdVersion: input.thresholdVersion ?? SCANNER_CALIBRATION_VERSION,
    featureFlags,
    featureVariant: getScannerFeatureVariant(featureFlags),
    client: input.client,
  };
}

export function getAnalyticsFromRow(row: ScannerAnalyticsEventRow): ScannerAnalyticsMetadata | null {
  const analytics = row.route_context?.analytics;
  if (analytics?.schemaVersion === SCANNER_ANALYTICS_SCHEMA_VERSION) return analytics as ScannerAnalyticsMetadata;
  return null;
}

function rowTiming(row: ScannerAnalyticsEventRow, key: keyof ScannerTimingMetrics) {
  return cleanNumber(getAnalyticsFromRow(row)?.timings?.[key] ?? row.route_context?.timings?.[key]);
}

function rowLanguage(row: ScannerAnalyticsEventRow) {
  return getAnalyticsFromRow(row)?.language
    ?? row.route_context?.localOcr?.language
    ?? row.route_context?.language
    ?? 'unknown';
}

function rowDeviceTier(row: ScannerAnalyticsEventRow) {
  return getAnalyticsFromRow(row)?.client?.deviceTier ?? 'unknown';
}

function rowScanMode(row: ScannerAnalyticsEventRow) {
  return getAnalyticsFromRow(row)?.scanMode ?? row.scan_mode ?? 'unknown';
}

function rowFeatureVariant(row: ScannerAnalyticsEventRow) {
  return getAnalyticsFromRow(row)?.featureVariant ?? 'legacy';
}

function rowMatchSource(row: ScannerAnalyticsEventRow) {
  return getAnalyticsFromRow(row)?.matchSource ?? (getRemoteProviderRows(row).length ? 'remote' : 'unknown');
}

function isSuccessfulAttempt(row: ScannerAnalyticsEventRow) {
  return row.outcome === 'candidates_returned' || row.outcome === 'inventory_callback';
}

function isFailureAttempt(row: ScannerAnalyticsEventRow) {
  return row.outcome === 'failed' || row.outcome === 'no_match' || row.outcome === 'quality_rejected';
}

function summarizeBreakdown(rows: ScannerAnalyticsEventRow[], keyGetter: (row: ScannerAnalyticsEventRow) => string): ScannerMetricBreakdown[] {
  const groups = new Map<string, ScannerAnalyticsEventRow[]>();
  for (const row of rows) {
    const key = keyGetter(row) || 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries())
    .map(([key, groupRows]) => {
      const timings = groupRows.map((row) => rowTiming(row, 'total_scan_ms')).filter((value): value is number => value != null);
      const corrections = groupRows.filter((row) => row.event_type === 'match_incorrect' || row.event_type === 'none_correct').length;
      return {
        key,
        attempts: groupRows.length,
        successRate: percent(groupRows.filter(isSuccessfulAttempt).length, groupRows.length),
        correctionRate: percent(corrections, groupRows.length),
        medianMs: percentile(timings, 50),
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.key.localeCompare(b.key));
}

export function summarizeScannerAnalyticsRows(
  rows: ScannerAnalyticsEventRow[],
  windowDays = 14
): ScannerAnalyticsDashboard {
  const attempts = rows.filter((row) => row.event_type === 'attempt');
  const timings = attempts.map((row) => rowTiming(row, 'total_scan_ms')).filter((value): value is number => value != null);
  const corrections = rows.filter((row) => row.event_type === 'match_incorrect' || row.event_type === 'none_correct');
  const rescans = rows.filter((row) => row.event_type === 'rescan' || getAnalyticsFromRow(row)?.rescan);
  const failures = attempts.filter(isFailureAttempt);
  const firstAttempts = attempts.filter((row) => !getAnalyticsFromRow(row)?.rescan);
  const remoteFallbackAttempts = attempts.filter((row) => {
    const matchSource = rowMatchSource(row);
    return matchSource === 'remote' || matchSource === 'hybrid';
  });
  const localAttempts = attempts.filter((row) => rowMatchSource(row) === 'local');
  const ximilarRequestCount = rows.reduce((sum, row) => {
    const analytics = getAnalyticsFromRow(row);
    if (analytics?.remoteEndpoint || row.route_context?.remoteEndpoint) return sum + 1;
    return sum + getRemoteProviderRows(row).filter((provider) => String(provider?.provider ?? '').toLowerCase().includes('ximilar')).length;
  }, 0);

  const featureComparisons = summarizeBreakdown(attempts, rowFeatureVariant).map((entry) => {
    const groupRows = attempts.filter((row) => rowFeatureVariant(row) === entry.key);
    const remoteRows = groupRows.filter((row) => ['remote', 'hybrid'].includes(rowMatchSource(row)));
    return {
      ...entry,
      remoteFallbackRate: percent(remoteRows.length, groupRows.length),
    };
  });

  return {
    windowDays,
    eventCount: rows.length,
    attemptCount: attempts.length,
    medianScanMs: percentile(timings, 50),
    p95ScanMs: percentile(timings, 95),
    localMatchPercentage: percent(localAttempts.length, attempts.length),
    remoteFallbackPercentage: percent(remoteFallbackAttempts.length, attempts.length),
    firstAttemptSuccessPercentage: percent(firstAttempts.filter(isSuccessfulAttempt).length, firstAttempts.length),
    correctionRate: percent(corrections.length, attempts.length),
    rescanRate: percent(rescans.length, attempts.length),
    failureRate: percent(failures.length, attempts.length),
    ximilarRequestCount,
    estimatedXimilarUsage: `${ximilarRequestCount} request${ximilarRequestCount === 1 ? '' : 's'}`,
    accuracyByLanguage: summarizeBreakdown(attempts, rowLanguage),
    accuracyByDeviceTier: summarizeBreakdown(attempts, rowDeviceTier),
    accuracyByScanMode: summarizeBreakdown(attempts, rowScanMode),
    featureComparisons,
    latestErrors: rows
      .filter((row) => isFailureAttempt(row) || Boolean(getAnalyticsFromRow(row)?.errorCategory))
      .slice(0, 10),
  };
}

export async function fetchScannerAnalyticsDashboard(windowDays = 14) {
  const { supabase } = await import('./supabase');
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('scan_learning_events')
    .select('id, created_at, event_type, scan_mode, route_context, frame_metrics, ocr_preview, candidate_count, candidates, selected_card_id, selected_set_id, selected_card_name, outcome, notes, client_version')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw error;
  return summarizeScannerAnalyticsRows((data ?? []) as ScannerAnalyticsEventRow[], windowDays);
}
