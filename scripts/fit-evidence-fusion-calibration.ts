import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  BLOCKED_EVIDENCE_FUSION_CALIBRATION,
  EVIDENCE_FUSION_FEATURE_KEYS,
  extractEvidenceFusionFeatures,
  type EvidenceFusionCalibrationManifest,
  type EvidenceFusionCandidate,
  type EvidenceFusionFeatureKey,
  type EvidenceFusionFeatureVector,
} from '../lib/recognition/evidenceFusion';
import type { CaptureQuality, OcrEvidence } from '../lib/recognition/types';

const VALIDATION_ROWS_PATH = 'ml/data_manifests/evidence-fusion-validation.jsonl';
const CALIBRATION_OUTPUT_PATH = 'assets/models/card_identity/evidence-fusion-calibration.json';
const REPORT_JSON_PATH = 'ml/reports/evidence-fusion-calibration.json';
const REPORT_HTML_PATH = 'ml/reports/evidence-fusion-calibration.html';
const MAX_FALSE_ACCEPT_RATE = 0.005;

type CalibrationRow = {
  scanId: string;
  candidate: EvidenceFusionCandidate;
  secondCandidate?: EvidenceFusionCandidate | null;
  ocrEvidence?: OcrEvidence | null;
  captureQuality?: CaptureQuality | null;
  frameAgreement?: number | null;
  correct: boolean;
  language?: string | null;
  variant?: string | null;
};

type ScoredRow = {
  row: CalibrationRow;
  features: EvidenceFusionFeatureVector;
  label: 0 | 1;
};

function sha256File(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function readRows(): CalibrationRow[] {
  if (!existsSync(VALIDATION_ROWS_PATH)) return [];
  return readFileSync(VALIDATION_ROWS_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CalibrationRow);
}

function toScoredRows(rows: CalibrationRow[]): ScoredRow[] {
  return rows.map((row) => ({
    row,
    label: row.correct ? 1 : 0,
    features: extractEvidenceFusionFeatures({
      candidate: row.candidate,
      secondCandidate: row.secondCandidate ?? null,
      ocrEvidence: row.ocrEvidence ?? null,
      captureQuality: row.captureQuality ?? null,
      frameAgreement: row.frameAgreement ?? null,
    }),
  }));
}

function logisticScore(
  features: EvidenceFusionFeatureVector,
  weights: Record<EvidenceFusionFeatureKey, number>,
  intercept: number
) {
  let logit = intercept;
  for (const key of EVIDENCE_FUSION_FEATURE_KEYS) {
    logit += weights[key] * features[key];
  }
  return sigmoid(logit);
}

function fitLogistic(rows: ScoredRow[]) {
  const weights = Object.fromEntries(EVIDENCE_FUSION_FEATURE_KEYS.map((key) => [key, 0])) as Record<EvidenceFusionFeatureKey, number>;
  let intercept = 0;
  const learningRate = 0.05;
  const l2 = 0.001;

  for (let epoch = 0; epoch < 600; epoch += 1) {
    let interceptGradient = 0;
    const gradients = Object.fromEntries(EVIDENCE_FUSION_FEATURE_KEYS.map((key) => [key, 0])) as Record<EvidenceFusionFeatureKey, number>;
    for (const row of rows) {
      const prediction = logisticScore(row.features, weights, intercept);
      const error = prediction - row.label;
      interceptGradient += error;
      for (const key of EVIDENCE_FUSION_FEATURE_KEYS) {
        gradients[key] += error * row.features[key] + l2 * weights[key];
      }
    }
    intercept -= learningRate * interceptGradient / rows.length;
    for (const key of EVIDENCE_FUSION_FEATURE_KEYS) {
      weights[key] -= learningRate * gradients[key] / rows.length;
    }
  }

  return { weights, intercept };
}

function fitIsotonic(rows: ScoredRow[]) {
  const sorted = [...rows].sort((left, right) => left.features.visualSimilarity - right.features.visualSimilarity);
  const blocks: Array<{ weight: number; sum: number; minScore: number; maxScore: number }> = sorted.map((row) => ({
    weight: 1,
    sum: row.label,
    minScore: row.features.visualSimilarity,
    maxScore: row.features.visualSimilarity,
  }));

  for (let index = 0; index < blocks.length - 1;) {
    const current = blocks[index];
    const next = blocks[index + 1];
    if (current.sum / current.weight <= next.sum / next.weight) {
      index += 1;
      continue;
    }
    blocks.splice(index, 2, {
      weight: current.weight + next.weight,
      sum: current.sum + next.sum,
      minScore: current.minScore,
      maxScore: next.maxScore,
    });
    index = Math.max(0, index - 1);
  }

  return {
    thresholds: blocks.map((block) => block.minScore),
    probabilities: blocks.map((block) => block.sum / block.weight),
  };
}

function brier(rows: ScoredRow[], score: (row: ScoredRow) => number) {
  return rows.reduce((sum, row) => {
    const error = score(row) - row.label;
    return sum + error * error;
  }, 0) / Math.max(1, rows.length);
}

function isotonicScore(row: ScoredRow, model: { thresholds: number[]; probabilities: number[] }) {
  let probability = model.probabilities[0] ?? 0;
  for (let index = 0; index < model.thresholds.length; index += 1) {
    if (row.features.visualSimilarity >= model.thresholds[index]) {
      probability = model.probabilities[index] ?? probability;
    }
  }
  return probability;
}

function reliability(rows: ScoredRow[], score: (row: ScoredRow) => number) {
  const bands = Array.from({ length: 10 }, (_, index) => ({
    confidenceMin: index / 10,
    confidenceMax: (index + 1) / 10,
    predictedSum: 0,
    correctCount: 0,
    count: 0,
  }));
  for (const row of rows) {
    const prediction = score(row);
    const index = Math.min(9, Math.max(0, Math.floor(prediction * 10)));
    bands[index].predictedSum += prediction;
    bands[index].correctCount += row.label;
    bands[index].count += 1;
  }
  return bands.map((band) => ({
    confidenceMin: band.confidenceMin,
    confidenceMax: band.confidenceMax,
    predictedMean: band.count ? band.predictedSum / band.count : 0,
    observedAccuracy: band.count ? band.correctCount / band.count : 0,
    count: band.count,
  }));
}

function chooseAcceptedThreshold(rows: ScoredRow[], score: (row: ScoredRow) => number) {
  const candidates = [...rows]
    .map((row) => score(row))
    .sort((left, right) => right - left);
  let selected: number | null = null;
  for (const threshold of candidates) {
    const accepted = rows.filter((row) => score(row) >= threshold);
    if (accepted.length === 0) continue;
    const falseAccepts = accepted.filter((row) => row.label === 0).length;
    const falseAcceptRate = falseAccepts / accepted.length;
    if (falseAcceptRate <= MAX_FALSE_ACCEPT_RATE) {
      selected = threshold;
    } else {
      break;
    }
  }
  return selected;
}

function precisionBands(rows: ScoredRow[], score: (row: ScoredRow) => number) {
  return reliability(rows, score).map((band) => ({
    band: `${band.confidenceMin.toFixed(1)}-${band.confidenceMax.toFixed(1)}`,
    precision: band.count ? band.observedAccuracy : null,
    count: band.count,
  }));
}

function groupPrecision(rows: ScoredRow[], score: (row: ScoredRow) => number, field: 'language' | 'variant') {
  const groups: Record<string, { precision: number | null; count: number }> = {};
  for (const row of rows) {
    const key = String(row.row[field] ?? row.row.candidate[field] ?? 'unknown');
    const group = groups[key] ?? { precision: 0, count: 0 };
    group.precision = (group.precision ?? 0) + (score(row) >= 0.5 ? row.label : 0);
    group.count += 1;
    groups[key] = group;
  }
  for (const key of Object.keys(groups)) {
    groups[key].precision = groups[key].count ? (groups[key].precision ?? 0) / groups[key].count : null;
  }
  return groups;
}

function blockedManifest(): EvidenceFusionCalibrationManifest {
  return {
    ...BLOCKED_EVIDENCE_FUSION_CALIBRATION,
    generatedAt: new Date().toISOString(),
  };
}

function writeBlockedReport() {
  const manifest = blockedManifest();
  const report = {
    status: 'blocked',
    generatedAt: manifest.generatedAt,
    calibration: manifest,
    validationRows: 0,
    blockers: [
      ...manifest.blockers,
      `missing ${VALIDATION_ROWS_PATH}`,
    ],
    exitCriteria: {
      confidenceCorrelatesWithObservedCorrectness: false,
      scannerCanAbstain: true,
      automaticAcceptanceThresholdsBackedByValidationData: false,
    },
  };
  writeFileSync(CALIBRATION_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_HTML_PATH, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Evidence Fusion Calibration</title></head>
<body>
  <h1>Evidence Fusion Calibration</h1>
  <p>Status: <strong>blocked</strong></p>
  <p>No reviewed validation prediction rows were available at <code>${VALIDATION_ROWS_PATH}</code>, so no confidence model or acceptance threshold was fitted.</p>
  <ul>
    <li>Reliability diagram: unavailable</li>
    <li>False-accept rate: unavailable</li>
    <li>False-reject rate: unavailable</li>
    <li>Accepted coverage: unavailable</li>
    <li>Precision by confidence band: unavailable</li>
    <li>Results by language and variant: unavailable</li>
  </ul>
</body>
</html>
`);
  console.log(JSON.stringify({ ok: true, status: 'blocked', reportJson: REPORT_JSON_PATH }, null, 2));
}

function writeReadyReport(rows: ScoredRow[]) {
  const logistic = fitLogistic(rows);
  const isotonic = fitIsotonic(rows);
  const logisticBrier = brier(rows, (row) => logisticScore(row.features, logistic.weights, logistic.intercept));
  const isotonicBrier = brier(rows, (row) => isotonicScore(row, isotonic));
  const method = isotonicBrier < logisticBrier ? 'isotonic' : 'logistic';
  const score = method === 'isotonic'
    ? (row: ScoredRow) => isotonicScore(row, isotonic)
    : (row: ScoredRow) => logisticScore(row.features, logistic.weights, logistic.intercept);
  const acceptedThreshold = chooseAcceptedThreshold(rows, score);
  const reviewThreshold = Math.min(0.5, acceptedThreshold ?? 0.5);
  const accepted = rows.filter((row) => acceptedThreshold != null && score(row) >= acceptedThreshold);
  const falseAcceptRate = accepted.length
    ? accepted.filter((row) => row.label === 0).length / accepted.length
    : null;
  const rejected = rows.filter((row) => score(row) < reviewThreshold);
  const falseRejectRate = rejected.length
    ? rejected.filter((row) => row.label === 1).length / rejected.length
    : null;

  const manifest: EvidenceFusionCalibrationManifest = {
    schemaVersion: 'stackr-evidence-fusion-calibration-v1.0.0',
    status: 'ready',
    version: `stackr-evidence-fusion-calibration-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    method,
    trainedOnDatasetVersion: 'evidence-fusion-validation-jsonl-v1',
    validationDatasetSha256: sha256File(VALIDATION_ROWS_PATH),
    featureKeys: [...EVIDENCE_FUSION_FEATURE_KEYS],
    logistic: method === 'logistic'
      ? { intercept: logistic.intercept, weights: logistic.weights }
      : null,
    isotonic: method === 'isotonic' ? isotonic : null,
    thresholds: {
      acceptedMinProbability: acceptedThreshold,
      reviewMinProbability: reviewThreshold,
      maxFalseAcceptRate: MAX_FALSE_ACCEPT_RATE,
      minVisualSimilarityForAccept: 0.9,
      minTopOneTopTwoMarginForAccept: 0.08,
      minCaptureQualityForAccept: 0.8,
    },
    metrics: {
      reliabilityDiagram: reliability(rows, score),
      falseAcceptRate,
      falseRejectRate,
      acceptedCoverage: rows.length ? accepted.length / rows.length : null,
      precisionByConfidenceBand: precisionBands(rows, score),
      byLanguage: groupPrecision(rows, score, 'language'),
      byVariant: groupPrecision(rows, score, 'variant'),
    },
    blockers: [],
  };

  writeFileSync(CALIBRATION_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify({ status: 'ready', calibration: manifest, validationRows: rows.length }, null, 2)}\n`);
  writeFileSync(REPORT_HTML_PATH, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Evidence Fusion Calibration</title></head>
<body>
  <h1>Evidence Fusion Calibration</h1>
  <p>Status: <strong>ready</strong></p>
  <p>Selected method: ${method}. Logistic Brier: ${logisticBrier.toFixed(6)}. Isotonic Brier: ${isotonicBrier.toFixed(6)}.</p>
  <p>Accepted threshold: ${acceptedThreshold ?? 'unavailable'}.</p>
  <pre>${JSON.stringify(manifest.metrics, null, 2)}</pre>
</body>
</html>
`);
  console.log(JSON.stringify({ ok: true, status: 'ready', method, reportJson: REPORT_JSON_PATH }, null, 2));
}

mkdirSync('assets/models/card_identity', { recursive: true });
mkdirSync('ml/reports', { recursive: true });

const rows = readRows();
if (rows.length < 100) {
  writeBlockedReport();
} else {
  writeReadyReport(toScoredRows(rows));
}
