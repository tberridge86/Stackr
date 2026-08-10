import {
  SCAN_AUTO_CAPTURE_STABLE_FRAMES,
  SCAN_BINDER_PAGE_REMOTE_CONCURRENCY,
  SCAN_LOCAL_OCR_STRONG_CONFIDENCE,
  SCAN_QUALITY_DEVICE_PROFILE,
} from './config';
import { createScanQualityThresholds, type ScanQualityDeviceProfile, type ScanQualityThresholds } from './scanQuality';

export const SCANNER_CALIBRATION_VERSION = 'stackr-scanner-calibration-v1';

export type ScannerCalibrationStatus = 'draft' | 'internal' | 'uat' | 'production' | 'rolled_back';

export type ScannerRolloutStage =
  | 'internal_testers'
  | 'dev_accounts'
  | 'uat_partners'
  | 'production_small'
  | 'production_wide';

export type AutoCaptureThresholds = {
  requiredStableFrames: number;
  duplicateCooldownMs: number;
  highConfidenceSingleFrameScore: number;
  minStabilityScore: number;
};

export type RecognitionThresholds = {
  localAutoConfirmConfidence: number;
  localTopThreeMinConfidence: number;
  ambiguousVariantMaxGap: number;
  visualSimilarityMin: number;
  visualFinalScoreMin: number;
  fallbackCandidateMinConfidence: number;
  remoteFallbackBelowLocalConfidence: number;
};

export type BinderPageThresholds = {
  autoConfirmConfidence: number;
  possibleMatchConfidence: number;
  maxRemoteConcurrency: number;
};

export type DuplicateDetectionThresholds = {
  exactCardSetMatchConfidence: number;
  visualSimilarityConfidence: number;
  allowSameCardMultiplePockets: boolean;
};

export type ScannerThresholdSet = {
  version: string;
  status: ScannerCalibrationStatus;
  rolloutStage: ScannerRolloutStage;
  updatedAt: string;
  notes: string;
  thresholds: {
    autoCapture: AutoCaptureThresholds;
    scanQualityProfiles: Record<ScanQualityDeviceProfile, ScanQualityThresholds>;
    recognition: RecognitionThresholds;
    binderPage: BinderPageThresholds;
    duplicateDetection: DuplicateDetectionThresholds;
  };
};

export type ScannerBenchmarkObservation = {
  caseKey?: string | null;
  scannerVariant: 'production_baseline' | 'candidate';
  thresholdVersion?: string | null;
  language?: string | null;
  era?: string | null;
  lighting?: string | null;
  itemType?: string | null;
  captureType?: string | null;
  sleeveStatus?: string | null;
  correctStackrCardId?: string | null;
  predictedStackrCardId?: string | null;
  topCandidateIds?: string[] | null;
  confidence?: number | null;
  noMatch?: boolean | null;
  incorrectConfidentMatch?: boolean | null;
  firstAttemptSuccess?: boolean | null;
  cameraReadyMs?: number | null;
  captureMs?: number | null;
  cropMs?: number | null;
  firstCandidateMs?: number | null;
  finalResultMs?: number | null;
  totalScanMs?: number | null;
  correctionRequired?: boolean | null;
  rescanCount?: number | null;
  remoteRequestCount?: number | null;
  failureCategory?: string | null;
  duplicatePrevented?: boolean | null;
  duplicateAdded?: boolean | null;
  crash?: boolean | null;
};

export type ScannerEvidenceSummary = {
  sampleSize: number;
  topOneAccuracy: number;
  topThreeAccuracy: number;
  topFiveAccuracy: number;
  noMatchRate: number;
  incorrectConfidentMatchRate: number;
  firstAttemptSuccessRate: number;
  correctionRate: number;
  rescanRate: number;
  remoteRequestRate: number;
  averageRemoteRequests: number;
  failureRate: number;
  duplicateAdditionRate: number;
  crashRate: number;
  medianCameraReadyMs: number | null;
  medianCaptureMs: number | null;
  medianCropMs: number | null;
  medianFirstCandidateMs: number | null;
  medianFinalResultMs: number | null;
  medianTotalScanMs: number | null;
  p95TotalScanMs: number | null;
};

export type ScannerBenchmarkBreakdown = {
  dimension: 'language' | 'era' | 'lighting' | 'item_type' | 'capture_type' | 'sleeve_status';
  key: string;
  summary: ScannerEvidenceSummary;
};

export type ScannerReleaseGate = {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'insufficient_data';
  baseline: number | null;
  candidate: number | null;
  requirement: string;
};

export type ScannerReleaseReadiness = {
  readyForNextRollout: boolean;
  recommendation: 'proceed' | 'hold' | 'rollback';
  gates: ScannerReleaseGate[];
};

export type ScannerReleaseRequirements = {
  minComparableCases: number;
  maxTopOneRegressionPoints: number;
  maxTopThreeRegressionPoints: number;
  maxTopFiveRegressionPoints: number;
  maxNoMatchRegressionPoints: number;
  maxIncorrectConfidentMatchRegressionPoints: number;
  minFirstAttemptImprovementPoints: number;
  maxP95RegressionRatio: number;
  maxP95RegressionMs: number;
  maxFailureRegressionPoints: number;
};

export const DEFAULT_SCANNER_RELEASE_REQUIREMENTS: ScannerReleaseRequirements = {
  minComparableCases: 60,
  maxTopOneRegressionPoints: 1.5,
  maxTopThreeRegressionPoints: 1,
  maxTopFiveRegressionPoints: 0.5,
  maxNoMatchRegressionPoints: 1,
  maxIncorrectConfidentMatchRegressionPoints: 0.5,
  minFirstAttemptImprovementPoints: 2,
  maxP95RegressionRatio: 1.1,
  maxP95RegressionMs: 1000,
  maxFailureRegressionPoints: 1,
};

function isoNow() {
  return new Date().toISOString();
}

export function getDefaultScannerThresholdSet(): ScannerThresholdSet {
  const requiredStableFrames = Math.max(
    1,
    Number.isFinite(SCAN_AUTO_CAPTURE_STABLE_FRAMES)
      ? Math.round(SCAN_AUTO_CAPTURE_STABLE_FRAMES)
      : 2
  );
  const strongConfidence = Number.isFinite(SCAN_LOCAL_OCR_STRONG_CONFIDENCE)
    ? SCAN_LOCAL_OCR_STRONG_CONFIDENCE
    : 0.84;

  return {
    version: SCANNER_CALIBRATION_VERSION,
    status: 'draft',
    rolloutStage: 'internal_testers',
    updatedAt: isoNow(),
    notes: 'Baseline mirrors the currently deployed Rev 2 scanner thresholds. Tune only from benchmark evidence.',
    thresholds: {
      autoCapture: {
        requiredStableFrames,
        duplicateCooldownMs: 2500,
        highConfidenceSingleFrameScore: 0.74,
        minStabilityScore: 0.58,
      },
      scanQualityProfiles: {
        balanced: createScanQualityThresholds({ deviceProfile: 'balanced' }),
        'low-end': createScanQualityThresholds({ deviceProfile: 'low-end' }),
        'high-end': createScanQualityThresholds({ deviceProfile: 'high-end' }),
      },
      recognition: {
        localAutoConfirmConfidence: strongConfidence,
        localTopThreeMinConfidence: 0.62,
        ambiguousVariantMaxGap: 0.08,
        visualSimilarityMin: 0.72,
        visualFinalScoreMin: 0.76,
        fallbackCandidateMinConfidence: 0.62,
        remoteFallbackBelowLocalConfidence: strongConfidence,
      },
      binderPage: {
        autoConfirmConfidence: 82,
        possibleMatchConfidence: 55,
        maxRemoteConcurrency: Math.max(1, Math.round(SCAN_BINDER_PAGE_REMOTE_CONCURRENCY || 2)),
      },
      duplicateDetection: {
        exactCardSetMatchConfidence: 0.98,
        visualSimilarityConfidence: 0.9,
        allowSameCardMultiplePockets: false,
      },
    },
  };
}

export function getAutoCaptureThresholds(thresholdSet = getDefaultScannerThresholdSet()) {
  return thresholdSet.thresholds.autoCapture;
}

export function getScanQualityCalibration(
  thresholdSet = getDefaultScannerThresholdSet(),
  deviceProfile: string | null | undefined = SCAN_QUALITY_DEVICE_PROFILE
) {
  const profile: ScanQualityDeviceProfile = deviceProfile === 'low-end' || deviceProfile === 'high-end'
    ? deviceProfile
    : 'balanced';
  return {
    deviceProfile: profile,
    ...thresholdSet.thresholds.scanQualityProfiles[profile],
  };
}

function isThresholdSet(value: unknown): value is ScannerThresholdSet {
  const candidate = value as ScannerThresholdSet;
  return Boolean(
    candidate
    && typeof candidate.version === 'string'
    && candidate.thresholds?.autoCapture
    && candidate.thresholds?.recognition
    && candidate.thresholds?.scanQualityProfiles
  );
}

export async function fetchActiveScannerThresholdSet(): Promise<ScannerThresholdSet> {
  const fallback = getDefaultScannerThresholdSet();
  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.rpc('get_active_scanner_threshold_set');
    if (error) return fallback;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.thresholds) return fallback;
    const remoteThresholds = row.thresholds as Partial<ScannerThresholdSet['thresholds']>;
    const thresholdSet: ScannerThresholdSet = {
      ...fallback,
      version: String(row.version ?? fallback.version),
      status: String(row.status ?? fallback.status) as ScannerCalibrationStatus,
      rolloutStage: String(row.rollout_stage ?? fallback.rolloutStage) as ScannerRolloutStage,
      updatedAt: String(row.updated_at ?? fallback.updatedAt),
      thresholds: {
        ...fallback.thresholds,
        ...remoteThresholds,
        autoCapture: {
          ...fallback.thresholds.autoCapture,
          ...(remoteThresholds.autoCapture ?? {}),
        },
        scanQualityProfiles: {
          balanced: {
            ...fallback.thresholds.scanQualityProfiles.balanced,
            ...(remoteThresholds.scanQualityProfiles?.balanced ?? {}),
          },
          'low-end': {
            ...fallback.thresholds.scanQualityProfiles['low-end'],
            ...(remoteThresholds.scanQualityProfiles?.['low-end'] ?? {}),
          },
          'high-end': {
            ...fallback.thresholds.scanQualityProfiles['high-end'],
            ...(remoteThresholds.scanQualityProfiles?.['high-end'] ?? {}),
          },
        },
        recognition: {
          ...fallback.thresholds.recognition,
          ...(remoteThresholds.recognition ?? {}),
        },
        binderPage: {
          ...fallback.thresholds.binderPage,
          ...(remoteThresholds.binderPage ?? {}),
        },
        duplicateDetection: {
          ...fallback.thresholds.duplicateDetection,
          ...(remoteThresholds.duplicateDetection ?? {}),
        },
      },
    };
    return isThresholdSet(thresholdSet) ? thresholdSet : fallback;
  } catch {
    return fallback;
  }
}

function cleanRatio(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function normaliseCandidateIds(ids?: string[] | null, limit = 5) {
  return (ids ?? []).map((id) => String(id)).filter(Boolean).slice(0, limit);
}

function metricTimings(
  rows: ScannerBenchmarkObservation[],
  getter: (row: ScannerBenchmarkObservation) => number | null | undefined
) {
  return rows
    .map((row) => Number(getter(row)))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

function isNoMatch(row: ScannerBenchmarkObservation) {
  return Boolean(
    row.noMatch
    || row.failureCategory === 'no_match'
    || (!row.predictedStackrCardId && !normaliseCandidateIds(row.topCandidateIds).length)
  );
}

function isIncorrectConfidentMatch(row: ScannerBenchmarkObservation) {
  if (row.incorrectConfidentMatch != null) return Boolean(row.incorrectConfidentMatch);
  if (!row.correctStackrCardId || !row.predictedStackrCardId) return false;
  const confidence = Number(row.confidence);
  return Number.isFinite(confidence)
    && confidence >= 0.84
    && String(row.correctStackrCardId) !== String(row.predictedStackrCardId);
}

export function summarizeBenchmarkObservations(
  observations: ScannerBenchmarkObservation[]
): ScannerEvidenceSummary {
  const rows = observations.filter((row) => row.scannerVariant === 'production_baseline' || row.scannerVariant === 'candidate');
  const sampleSize = rows.length;
  const timings = rows
    .map((row) => Number(row.totalScanMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const knownCorrectRows = rows.filter((row) => row.correctStackrCardId);
  const topOneCorrect = knownCorrectRows.filter((row) => (
    String(row.predictedStackrCardId ?? '') === String(row.correctStackrCardId)
  )).length;
  const topThreeCorrect = knownCorrectRows.filter((row) => (
    normaliseCandidateIds(row.topCandidateIds, 3).includes(String(row.correctStackrCardId))
    || String(row.predictedStackrCardId ?? '') === String(row.correctStackrCardId)
  )).length;
  const topFiveCorrect = knownCorrectRows.filter((row) => (
    normaliseCandidateIds(row.topCandidateIds, 5).includes(String(row.correctStackrCardId))
    || String(row.predictedStackrCardId ?? '') === String(row.correctStackrCardId)
  )).length;
  const remoteRequests = rows.reduce((sum, row) => sum + Math.max(0, Number(row.remoteRequestCount ?? 0) || 0), 0);

  return {
    sampleSize,
    topOneAccuracy: cleanRatio(topOneCorrect, knownCorrectRows.length),
    topThreeAccuracy: cleanRatio(topThreeCorrect, knownCorrectRows.length),
    topFiveAccuracy: cleanRatio(topFiveCorrect, knownCorrectRows.length),
    noMatchRate: cleanRatio(rows.filter(isNoMatch).length, sampleSize),
    incorrectConfidentMatchRate: cleanRatio(rows.filter(isIncorrectConfidentMatch).length, sampleSize),
    firstAttemptSuccessRate: cleanRatio(rows.filter((row) => row.firstAttemptSuccess).length, sampleSize),
    correctionRate: cleanRatio(rows.filter((row) => row.correctionRequired).length, sampleSize),
    rescanRate: cleanRatio(rows.filter((row) => Number(row.rescanCount ?? 0) > 0).length, sampleSize),
    remoteRequestRate: cleanRatio(rows.filter((row) => Number(row.remoteRequestCount ?? 0) > 0).length, sampleSize),
    averageRemoteRequests: sampleSize ? Math.round((remoteRequests / sampleSize) * 100) / 100 : 0,
    failureRate: cleanRatio(rows.filter((row) => row.failureCategory).length, sampleSize),
    duplicateAdditionRate: cleanRatio(rows.filter((row) => row.duplicateAdded).length, sampleSize),
    crashRate: cleanRatio(rows.filter((row) => row.crash).length, sampleSize),
    medianCameraReadyMs: percentile(metricTimings(rows, (row) => row.cameraReadyMs), 0.5),
    medianCaptureMs: percentile(metricTimings(rows, (row) => row.captureMs), 0.5),
    medianCropMs: percentile(metricTimings(rows, (row) => row.cropMs), 0.5),
    medianFirstCandidateMs: percentile(metricTimings(rows, (row) => row.firstCandidateMs), 0.5),
    medianFinalResultMs: percentile(metricTimings(rows, (row) => row.finalResultMs), 0.5),
    medianTotalScanMs: percentile(timings, 0.5),
    p95TotalScanMs: percentile(timings, 0.95),
  };
}

function groupByDimension(
  observations: ScannerBenchmarkObservation[],
  dimension: ScannerBenchmarkBreakdown['dimension'],
  getter: (row: ScannerBenchmarkObservation) => string | null | undefined
) {
  const groups = new Map<string, ScannerBenchmarkObservation[]>();
  for (const row of observations) {
    const key = String(getter(row) ?? 'unknown').trim() || 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, groupRows]) => ({
    dimension,
    key,
    summary: summarizeBenchmarkObservations(groupRows),
  }));
}

export function summarizeBenchmarkBreakdowns(
  observations: ScannerBenchmarkObservation[]
): ScannerBenchmarkBreakdown[] {
  return [
    ...groupByDimension(observations, 'language', (row) => row.language),
    ...groupByDimension(observations, 'era', (row) => row.era),
    ...groupByDimension(observations, 'lighting', (row) => row.lighting),
    ...groupByDimension(observations, 'item_type', (row) => row.itemType),
    ...groupByDimension(observations, 'capture_type', (row) => row.captureType),
    ...groupByDimension(observations, 'sleeve_status', (row) => row.sleeveStatus),
  ];
}

function gate(
  key: string,
  label: string,
  status: ScannerReleaseGate['status'],
  baseline: number | null,
  candidate: number | null,
  requirement: string
): ScannerReleaseGate {
  return { key, label, status, baseline, candidate, requirement };
}

function compareHigherIsBetter(
  key: string,
  label: string,
  baseline: number,
  candidate: number,
  allowedRegression: number
) {
  return gate(
    key,
    label,
    candidate + allowedRegression >= baseline ? 'pass' : 'fail',
    baseline,
    candidate,
    `candidate must be no more than ${allowedRegression} points below baseline`
  );
}

function compareLowerOrEqual(
  key: string,
  label: string,
  baseline: number | null,
  candidate: number | null,
  allowedRegression = 0
) {
  if (baseline == null || candidate == null) {
    return gate(
      key,
      label,
      'insufficient_data',
      baseline,
      candidate,
      'baseline and candidate timings must both exist'
    );
  }

  return gate(
    key,
    label,
    candidate <= baseline + allowedRegression ? 'pass' : 'fail',
    baseline,
    candidate,
    `candidate must be less than or equal to baseline${allowedRegression ? ` + ${allowedRegression}` : ''}`
  );
}

export function evaluateScannerReleaseReadiness(
  baseline: ScannerEvidenceSummary,
  candidate: ScannerEvidenceSummary,
  requirements: ScannerReleaseRequirements = DEFAULT_SCANNER_RELEASE_REQUIREMENTS
): ScannerReleaseReadiness {
  const gates: ScannerReleaseGate[] = [];
  const hasEnoughData = baseline.sampleSize >= requirements.minComparableCases
    && candidate.sampleSize >= requirements.minComparableCases;

  if (!hasEnoughData) {
    gates.push(gate(
      'sample_size',
      'Comparable benchmark sample',
      'insufficient_data',
      baseline.sampleSize,
      candidate.sampleSize,
      `at least ${requirements.minComparableCases} baseline and candidate cases`
    ));
  } else {
    gates.push(gate(
      'sample_size',
      'Comparable benchmark sample',
      'pass',
      baseline.sampleSize,
      candidate.sampleSize,
      `at least ${requirements.minComparableCases} baseline and candidate cases`
    ));
  }

  gates.push(compareHigherIsBetter(
    'top_one_accuracy',
    'Top-one accuracy',
    baseline.topOneAccuracy,
    candidate.topOneAccuracy,
    requirements.maxTopOneRegressionPoints
  ));
  gates.push(compareHigherIsBetter(
    'top_three_accuracy',
    'Top-three accuracy',
    baseline.topThreeAccuracy,
    candidate.topThreeAccuracy,
    requirements.maxTopThreeRegressionPoints
  ));
  gates.push(compareHigherIsBetter(
    'top_five_accuracy',
    'Top-five accuracy',
    baseline.topFiveAccuracy,
    candidate.topFiveAccuracy,
    requirements.maxTopFiveRegressionPoints
  ));
  gates.push(gate(
    'first_attempt_success',
    'First-attempt success',
    candidate.firstAttemptSuccessRate >= baseline.firstAttemptSuccessRate + requirements.minFirstAttemptImprovementPoints
      ? 'pass'
      : 'fail',
    baseline.firstAttemptSuccessRate,
    candidate.firstAttemptSuccessRate,
    `candidate must improve by at least ${requirements.minFirstAttemptImprovementPoints} points`
  ));
  gates.push(compareLowerOrEqual(
    'median_total_scan_ms',
    'Median completion time',
    baseline.medianTotalScanMs,
    candidate.medianTotalScanMs
  ));

  const p95Allowed = baseline.p95TotalScanMs == null
    ? null
    : Math.max(
        baseline.p95TotalScanMs * requirements.maxP95RegressionRatio,
        baseline.p95TotalScanMs + requirements.maxP95RegressionMs
      );
  const p95Status: ScannerReleaseGate['status'] = p95Allowed == null || candidate.p95TotalScanMs == null
    ? 'insufficient_data'
    : candidate.p95TotalScanMs <= p95Allowed
      ? 'pass'
      : 'fail';
  gates.push(gate(
    'p95_total_scan_ms',
    '95th percentile completion time',
    p95Status,
    baseline.p95TotalScanMs,
    candidate.p95TotalScanMs,
    `candidate p95 must stay within ${requirements.maxP95RegressionRatio}x or +${requirements.maxP95RegressionMs}ms`
  ));
  gates.push(compareLowerOrEqual('remote_request_rate', 'Remote request rate', baseline.remoteRequestRate, candidate.remoteRequestRate));
  gates.push(compareLowerOrEqual(
    'no_match_rate',
    'No-match rate',
    baseline.noMatchRate,
    candidate.noMatchRate,
    requirements.maxNoMatchRegressionPoints
  ));
  gates.push(compareLowerOrEqual(
    'incorrect_confident_match_rate',
    'Confident wrong matches',
    baseline.incorrectConfidentMatchRate,
    candidate.incorrectConfidentMatchRate,
    requirements.maxIncorrectConfidentMatchRegressionPoints
  ));
  gates.push(compareLowerOrEqual('duplicate_addition_rate', 'Duplicate additions', baseline.duplicateAdditionRate, candidate.duplicateAdditionRate));
  gates.push(compareLowerOrEqual('crash_rate', 'Crash rate', baseline.crashRate, candidate.crashRate));
  gates.push(compareLowerOrEqual(
    'failure_rate',
    'Failure rate',
    baseline.failureRate,
    candidate.failureRate,
    requirements.maxFailureRegressionPoints
  ));

  const hardFailures = gates.filter((entry) => entry.status === 'fail');
  const insufficient = gates.some((entry) => entry.status === 'insufficient_data');
  const readyForNextRollout = !insufficient && hardFailures.length === 0;
  const recommendation: ScannerReleaseReadiness['recommendation'] = readyForNextRollout
    ? 'proceed'
    : hardFailures.some((entry) => ['top_one_accuracy', 'incorrect_confident_match_rate', 'duplicate_addition_rate', 'crash_rate'].includes(entry.key))
      ? 'rollback'
      : 'hold';

  return {
    readyForNextRollout,
    recommendation,
    gates,
  };
}
