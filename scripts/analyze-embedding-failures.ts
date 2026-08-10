import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EMBEDDING_FAILURE_CATEGORIES,
  STACKR_EMBEDDING_FAILURE_ANALYSIS_VERSION,
  buildEmbeddingFailureAnalysisReport,
  type EmbeddingFailureAnalysisReport,
  type EmbeddingModelMetrics,
  type EmbeddingV0RunMetrics,
  type HardNegativePayload,
} from '../lib/embeddingFailureAnalysis';

const V0_METRICS_PATH = 'ml/models/stackr-embedding-v0/metrics.json';
const HARD_NEGATIVE_PATH = 'ml/data_manifests/hard-negative-groups.json';
const CONFUSION_GROUPS_PATH = 'ml/reports/confusion-groups.json';
const FAILURE_ANALYSIS_PATH = 'ml/reports/failure-analysis.html';
const V0_V1_COMPARISON_PATH = 'ml/reports/v0-v1-comparison.html';

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, payload: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function metricText(value: number | null) {
  if (value == null) return 'not measured';
  return `${(value * 100).toFixed(2)}%`;
}

function metricRows(metrics: EmbeddingModelMetrics) {
  return [
    ['Top-1 retrieval', metrics.top1],
    ['Top-3 retrieval', metrics.top3],
    ['Mean reciprocal rank', metrics.meanReciprocalRank],
    ['Accepted-result precision', metrics.acceptedResultPrecision],
    ['False automatic accept rate', metrics.falseAutomaticAcceptRate],
    ['Hard-negative accuracy', metrics.hardNegativeAccuracy],
    ['Language accuracy', metrics.languageAccuracy],
    ['Same-art reprint accuracy', metrics.sameArtReprintAccuracy],
    ['Exact variant accuracy', metrics.exactVariantAccuracy],
    ['Unknown-card rejection accuracy', metrics.unknownRejectAccuracy],
  ].map(([label, value]) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${metricText(value as number | null)}</td>
    </tr>
  `).join('');
}

function writeFailureAnalysisHtml(report: EmbeddingFailureAnalysisReport) {
  const blockerItems = report.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('');
  const categoryRows = EMBEDDING_FAILURE_CATEGORIES.map((category) => {
    const summary = report.failureCategorySummary[category];
    return `
      <tr>
        <td>${escapeHtml(category)}</td>
        <td>${summary.measuredFailureCount}</td>
        <td>${summary.candidateConfusionGroupCount}</td>
      </tr>
    `;
  }).join('');
  const groupRows = report.confusionGroups.map((group) => `
    <tr>
      <td>${escapeHtml(group.groupId)}</td>
      <td>${escapeHtml(group.type)}</td>
      <td>${escapeHtml(group.categories.join(', '))}</td>
      <td>${escapeHtml(group.miningDecision)}</td>
      <td>${escapeHtml(group.protectedTestHandling)}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stackr Embedding Failure Analysis</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #171321; background: #fbfaff; }
    h1, h2 { margin-bottom: 8px; }
    .panel { border: 1px solid #ded8f7; background: #fff; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .blocked { color: #b45309; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e7e2f8; padding: 9px; text-align: left; vertical-align: top; }
    th { color: #4d2cc7; font-size: 12px; text-transform: uppercase; }
    code { background: #f0ebff; padding: 2px 5px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Stackr Embedding Failure Analysis</h1>
  <div class="panel">
    <p>Analysis version: <code>${escapeHtml(STACKR_EMBEDDING_FAILURE_ANALYSIS_VERSION)}</code></p>
    <p>Status: <span class="blocked">${escapeHtml(report.status)}</span></p>
    <p>Dataset: <code>${escapeHtml(report.datasetVersion)}</code></p>
    <p>Protected test rows: <code>${report.protectedTestSet.rowCount}</code></p>
  </div>
  <div class="panel">
    <h2>Blocking Evidence</h2>
    <ul>${blockerItems || '<li>None</li>'}</ul>
    <p>No top-neighbour visual reports were generated because no embedding vectors or approved image pixels exist for V0.</p>
  </div>
  <div class="panel">
    <h2>Failure Categories</h2>
    <table>
      <thead><tr><th>Category</th><th>Measured failures</th><th>Candidate confusion groups</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </div>
  <div class="panel">
    <h2>Candidate Hard-Negative Mining Groups</h2>
    <table>
      <thead><tr><th>Group</th><th>Type</th><th>Categories</th><th>Mining decision</th><th>Protected test handling</th></tr></thead>
      <tbody>${groupRows}</tbody>
    </table>
  </div>
  <script id="failure-analysis-payload" type="application/json">${escapeHtml(JSON.stringify(report))}</script>
</body>
</html>
`;
  writeFileSync(FAILURE_ANALYSIS_PATH, html, 'utf8');
}

function writeComparisonHtml(report: EmbeddingFailureAnalysisReport) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stackr Embedding V0/V1 Comparison</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #171321; background: #fbfaff; }
    .panel { border: 1px solid #ded8f7; background: #fff; border-radius: 8px; padding: 16px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e7e2f8; padding: 10px; text-align: left; }
    th { color: #4d2cc7; font-size: 12px; text-transform: uppercase; }
    code { background: #f0ebff; padding: 2px 5px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Stackr Embedding V0/V1 Comparison</h1>
  <div class="panel">
    <p>Same protected evaluation data: <code>${report.protectedTestSet.sharedEvaluationData}</code></p>
    <p>Dataset manifest hash: <code>${escapeHtml(report.datasetManifestSha256)}</code></p>
    <p>V1 status: <code>${escapeHtml(report.v1.status)}</code></p>
    <p>${escapeHtml(report.v1.reason)}</p>
  </div>
  <div class="panel">
    <h2>Retrieval Metrics</h2>
    <table>
      <thead><tr><th>Metric</th><th>V0</th><th>V1</th><th>Target</th></tr></thead>
      <tbody>
        <tr><td>Top-1 retrieval</td><td>${metricText(report.v0.metrics.top1)}</td><td>${metricText(report.v1.metrics.top1)}</td><td>reported</td></tr>
        <tr><td>Top-3 retrieval</td><td>${metricText(report.v0.metrics.top3)}</td><td>${metricText(report.v1.metrics.top3)}</td><td>99%</td></tr>
        <tr><td>Mean reciprocal rank</td><td>${metricText(report.v0.metrics.meanReciprocalRank)}</td><td>${metricText(report.v1.metrics.meanReciprocalRank)}</td><td>reported</td></tr>
        <tr><td>Hard-negative accuracy</td><td>${metricText(report.v0.metrics.hardNegativeAccuracy)}</td><td>${metricText(report.v1.metrics.hardNegativeAccuracy)}</td><td>reported separately</td></tr>
      </tbody>
    </table>
  </div>
  <div class="panel">
    <h2>Accepted-Match Precision</h2>
    <table>
      <thead><tr><th>Metric</th><th>V0</th><th>V1</th><th>Target</th></tr></thead>
      <tbody>
        <tr><td>Accepted-result precision</td><td>${metricText(report.v0.metrics.acceptedResultPrecision)}</td><td>${metricText(report.v1.metrics.acceptedResultPrecision)}</td><td>99%</td></tr>
        <tr><td>False automatic accept rate</td><td>${metricText(report.v0.metrics.falseAutomaticAcceptRate)}</td><td>${metricText(report.v1.metrics.falseAutomaticAcceptRate)}</td><td>&lt;0.5%</td></tr>
        <tr><td>Exact variant accuracy</td><td>${metricText(report.v0.metrics.exactVariantAccuracy)}</td><td>${metricText(report.v1.metrics.exactVariantAccuracy)}</td><td>reported separately</td></tr>
        <tr><td>Unknown-card rejection accuracy</td><td>${metricText(report.v0.metrics.unknownRejectAccuracy)}</td><td>${metricText(report.v1.metrics.unknownRejectAccuracy)}</td><td>unknowns rejected</td></tr>
      </tbody>
    </table>
  </div>
  <div class="panel">
    <h2>Conclusion</h2>
    <p>${escapeHtml(report.retrievalVersusAcceptance.note)}</p>
    <p>${escapeHtml(report.unknownCardPolicy.reason)}</p>
  </div>
  <script id="v0-v1-comparison-payload" type="application/json">${escapeHtml(JSON.stringify(report))}</script>
</body>
</html>
`;
  writeFileSync(V0_V1_COMPARISON_PATH, html, 'utf8');
}

function main() {
  const v0 = readJson<EmbeddingV0RunMetrics>(V0_METRICS_PATH);
  const hardNegatives = readJson<HardNegativePayload>(HARD_NEGATIVE_PATH);
  const report = buildEmbeddingFailureAnalysisReport({ v0, hardNegatives });

  writeJson(CONFUSION_GROUPS_PATH, {
    analysisVersion: report.analysisVersion,
    status: report.status,
    generatedAt: report.generatedAt,
    blockers: report.blockers,
    datasetManifestSha256: report.datasetManifestSha256,
    protectedTestSet: report.protectedTestSet,
    confusionGroups: report.confusionGroups,
  });
  writeFailureAnalysisHtml(report);
  writeComparisonHtml(report);

  console.log(JSON.stringify({
    status: report.status,
    blockers: report.blockers,
    measuredFailures: report.measuredFailures.length,
    confusionGroups: report.confusionGroups.length,
    files: [
      CONFUSION_GROUPS_PATH,
      FAILURE_ANALYSIS_PATH,
      V0_V1_COMPARISON_PATH,
    ],
  }, null, 2));
}

main();
