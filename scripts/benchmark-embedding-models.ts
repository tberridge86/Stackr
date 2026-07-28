import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  STACKR_MODEL_BENCHMARK_VERSION,
  buildModelBenchmarkRun,
  type HardNegativeDatasetSummary,
  type ModelBenchmarkRun,
} from '../lib/modelBenchmarkV1';

const HARD_NEGATIVE_PATH = 'ml/data_manifests/hard-negative-groups.json';
const REPORT_JSON_PATH = 'ml/reports/model-benchmark-v1.json';
const REPORT_HTML_PATH = 'ml/reports/model-benchmark-v1.html';
const REGISTRY_PATH = 'ml/models/embedding-model-registry-v1.json';

type HardNegativePayload = {
  summary: HardNegativeDatasetSummary;
};

function sha256File(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function tryGit(args: string[], fallback: string) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function readSummary(): HardNegativeDatasetSummary | null {
  if (!existsSync(HARD_NEGATIVE_PATH)) return null;
  const payload = JSON.parse(readFileSync(HARD_NEGATIVE_PATH, 'utf8')) as HardNegativePayload;
  return payload.summary ?? null;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeJson(filePath: string, payload: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeRegistry(run: ModelBenchmarkRun) {
  const registry = {
    registryVersion: 'stackr-embedding-model-registry-v1.0.0',
    generatedAt: run.generatedAt,
    benchmarkVersion: run.benchmarkVersion,
    selectedModelId: run.selectedModelId,
    selectedEmbeddingDimensions: run.selectedEmbeddingDimensions,
    activationStatus: 'not_active',
    activationReason: run.selectionReason,
    models: run.candidates.map((candidate) => ({
      modelId: candidate.modelId,
      displayName: candidate.displayName,
      family: candidate.family,
      source: candidate.source,
      license: candidate.license,
      input: candidate.input,
      embeddingDimensions: candidate.embeddingDimensions,
      parameterCount: candidate.parameterCount,
      deploymentTargets: candidate.deploymentTargets,
      preprocessing: candidate.preprocessing,
      normalisation: candidate.normalisation,
      onnxExportStatus: candidate.onnxExportStatus,
      quantisationStatus: candidate.quantisationStatus,
      productionEligible: candidate.productionEligible,
      selectionStatus: candidate.selectionStatus,
      stackrMeasurements: candidate.stackrMeasurements,
      upstreamReported: candidate.upstreamReported,
    })),
  };
  writeJson(REGISTRY_PATH, registry);
}

function writeHtmlReport(run: ModelBenchmarkRun) {
  const decisionRows = run.candidateDecisions.map((decision) => [
    '<tr>',
    `<td>${escapeHtml(decision.displayName)}</td>`,
    `<td>${escapeHtml(decision.decision)}</td>`,
    `<td>${decision.weightedScore === null ? 'missing' : escapeHtml(decision.weightedScore.toFixed(4))}</td>`,
    `<td>${escapeHtml(decision.blockers.join(', ') || 'none')}</td>`,
    `<td>${escapeHtml(decision.missingMetrics.join(', ') || 'none')}</td>`,
    '</tr>',
  ].join('')).join('');

  const coverageRows = run.dataCoverage.languageDistribution.map((entry) =>
    `<tr><td>${escapeHtml(entry.key)}</td><td>${escapeHtml(entry.count)}</td></tr>`
  ).join('');

  const blockers = run.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('');
  const criteria = run.acceptanceCriteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stackr Model Benchmark V1</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #1b1d24; background: #fafafa; }
    h1, h2 { margin: 0 0 10px; }
    .panel { border: 1px solid #d7dce4; background: #fff; border-radius: 8px; padding: 16px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e6e9ee; padding: 9px; text-align: left; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: #4b5563; }
    code { background: #eef2f7; border-radius: 5px; padding: 2px 5px; }
    .status { font-weight: 800; color: #b45309; }
  </style>
</head>
<body>
  <h1>Stackr Model Benchmark V1</h1>
  <div class="panel">
    <p>Status: <span class="status">${escapeHtml(run.status)}</span></p>
    <p>Benchmark version: <code>${escapeHtml(run.benchmarkVersion)}</code></p>
    <p>Dataset version: <code>${escapeHtml(run.datasetVersion ?? 'none')}</code></p>
    <p>Source commit: <code>${escapeHtml(run.sourceCommitHash)}</code></p>
    <p>Selected model: <code>${escapeHtml(run.selectedModelId ?? 'none')}</code></p>
    <p>${escapeHtml(run.selectionReason)}</p>
  </div>
  <div class="panel">
    <h2>Blocking Evidence</h2>
    <ul>${blockers || '<li>None</li>'}</ul>
  </div>
  <div class="panel">
    <h2>Language Coverage</h2>
    <p>Missing: <code>${escapeHtml(run.dataCoverage.missingLanguages.join(', ') || 'none')}</code></p>
    <table><thead><tr><th>Language</th><th>Rows</th></tr></thead><tbody>${coverageRows}</tbody></table>
  </div>
  <div class="panel">
    <h2>Candidate Decisions</h2>
    <table>
      <thead><tr><th>Model</th><th>Decision</th><th>Score</th><th>Blockers</th><th>Missing metrics</th></tr></thead>
      <tbody>${decisionRows}</tbody>
    </table>
  </div>
  <div class="panel">
    <h2>Acceptance Criteria</h2>
    <ul>${criteria}</ul>
  </div>
  <script id="stackr-model-benchmark-v1" type="application/json">${escapeHtml(JSON.stringify(run))}</script>
</body>
</html>
`;
  mkdirSync(path.dirname(REPORT_HTML_PATH), { recursive: true });
  writeFileSync(REPORT_HTML_PATH, html, 'utf8');
}

const summary = readSummary();
const run = buildModelBenchmarkRun({
  summary,
  datasetManifestSha256: existsSync(HARD_NEGATIVE_PATH) ? sha256File(HARD_NEGATIVE_PATH) : '0'.repeat(64),
  sourceCommitHash: tryGit(['rev-parse', 'HEAD'], 'unknown'),
  sourceTreeDirty: tryGit(['status', '--short'], '').length > 0,
});

writeJson(REPORT_JSON_PATH, run);
writeRegistry(run);
writeHtmlReport(run);

console.log(JSON.stringify({
  benchmarkVersion: STACKR_MODEL_BENCHMARK_VERSION,
  status: run.status,
  selectedModelId: run.selectedModelId,
  selectedEmbeddingDimensions: run.selectedEmbeddingDimensions,
  blockers: run.blockers,
  reportJson: REPORT_JSON_PATH,
  reportHtml: REPORT_HTML_PATH,
  registry: REGISTRY_PATH,
}, null, 2));
