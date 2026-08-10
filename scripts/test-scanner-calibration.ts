import assert from 'node:assert/strict';
import {
  evaluateScannerReleaseReadiness,
  getAutoCaptureThresholds,
  getDefaultScannerThresholdSet,
  getScanQualityCalibration,
  summarizeBenchmarkObservations,
  type ScannerBenchmarkObservation,
} from '../lib/scannerCalibration';

function observation(
  scannerVariant: ScannerBenchmarkObservation['scannerVariant'],
  index: number,
  overrides: Partial<ScannerBenchmarkObservation> = {}
): ScannerBenchmarkObservation {
  const correctId = `card-${index}`;
  return {
    scannerVariant,
    language: index % 2 === 0 ? 'en' : 'ja',
    era: index < 30 ? 'modern' : 'vintage',
    lighting: index % 3 === 0 ? 'low_light' : 'normal',
    itemType: 'raw_card',
    captureType: index % 4 === 0 ? 'sleeved' : 'raw',
    sleeveStatus: index % 4 === 0 ? 'sleeve' : 'none',
    correctStackrCardId: correctId,
    predictedStackrCardId: correctId,
    topCandidateIds: [correctId, `alt-${index}`, `other-${index}`, `four-${index}`, `five-${index}`],
    confidence: 0.92,
    noMatch: false,
    incorrectConfidentMatch: false,
    firstAttemptSuccess: true,
    cameraReadyMs: scannerVariant === 'candidate' ? 380 : 520,
    captureMs: scannerVariant === 'candidate' ? 120 : 180,
    cropMs: scannerVariant === 'candidate' ? 90 : 130,
    firstCandidateMs: scannerVariant === 'candidate' ? 620 : 900,
    finalResultMs: scannerVariant === 'candidate' ? 900 : 1100,
    totalScanMs: scannerVariant === 'candidate' ? 900 : 1100,
    correctionRequired: false,
    rescanCount: 0,
    remoteRequestCount: scannerVariant === 'candidate' ? 0 : 1,
    failureCategory: null,
    duplicateAdded: false,
    crash: false,
    ...overrides,
  };
}

const thresholdSet = getDefaultScannerThresholdSet();
assert.equal(thresholdSet.version, 'stackr-scanner-calibration-v1');
assert.equal(getAutoCaptureThresholds(thresholdSet).duplicateCooldownMs, 2500);
assert.equal(getScanQualityCalibration(thresholdSet, 'high-end').minFocusScore, 0.48);
assert.equal(getScanQualityCalibration(thresholdSet, 'unknown').deviceProfile, 'balanced');

const baselineRows = Array.from({ length: 70 }, (_, index) => observation('production_baseline', index, {
  firstAttemptSuccess: index < 56,
  totalScanMs: index < 66 ? 1200 : 2400,
}));
const candidateRows = Array.from({ length: 70 }, (_, index) => observation('candidate', index, {
  firstAttemptSuccess: index < 63,
  totalScanMs: index < 66 ? 950 : 1800,
}));

const baseline = summarizeBenchmarkObservations(baselineRows);
const candidate = summarizeBenchmarkObservations(candidateRows);
const readiness = evaluateScannerReleaseReadiness(baseline, candidate);

assert.equal(baseline.sampleSize, 70);
assert.equal(baseline.topFiveAccuracy, 100);
assert.equal(candidate.medianFirstCandidateMs, 620);
assert.equal(candidate.firstAttemptSuccessRate, 90);
assert.equal(candidate.noMatchRate, 0);
assert.equal(candidate.incorrectConfidentMatchRate, 0);
assert.equal(candidate.remoteRequestRate, 0);
assert.equal(readiness.readyForNextRollout, true);
assert.equal(readiness.recommendation, 'proceed');

const riskyCandidate = summarizeBenchmarkObservations(
  candidateRows.map((row, index) => index < 10
    ? {
        ...row,
        predictedStackrCardId: `wrong-${index}`,
        topCandidateIds: [`wrong-${index}`],
        incorrectConfidentMatch: true,
        duplicateAdded: index === 0,
      }
    : row)
);
const blocked = evaluateScannerReleaseReadiness(baseline, riskyCandidate);
assert.equal(blocked.readyForNextRollout, false);
assert.equal(blocked.recommendation, 'rollback');

const tinyBaseline = summarizeBenchmarkObservations(baselineRows.slice(0, 5));
const tinyCandidate = summarizeBenchmarkObservations(candidateRows.slice(0, 5));
const insufficient = evaluateScannerReleaseReadiness(tinyBaseline, tinyCandidate);
assert.equal(insufficient.readyForNextRollout, false);
assert.equal(insufficient.gates.some((gate) => gate.status === 'insufficient_data'), true);

console.log('scanner calibration gate checks passed');
