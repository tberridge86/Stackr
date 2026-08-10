import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  STACKR_EMBEDDING_V0_MODEL_VERSION,
  buildEmbeddingV0TrainingRun,
  type EmbeddingV0TrainingRun,
  type PilotDatasetSummary,
} from '../lib/embeddingV0Training';

const DATASET_MANIFEST_PATH = 'ml/data_manifests/pilot-dataset.parquet';
const HARD_NEGATIVE_PATH = 'ml/data_manifests/hard-negative-groups.json';
const MODEL_DIR = 'ml/models/stackr-embedding-v0';
const REPORT_PATH = 'ml/reports/embedding-v0-training-report.html';

type HardNegativePayload = {
  summary: PilotDatasetSummary;
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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureDirs() {
  [
    MODEL_DIR,
    path.join(MODEL_DIR, 'checkpoints'),
    path.join(MODEL_DIR, 'plots'),
    path.dirname(REPORT_PATH),
  ].forEach((dir) => mkdirSync(dir, { recursive: true }));
}

function readPilotSummary() {
  if (!existsSync(HARD_NEGATIVE_PATH)) return null;
  const payload = JSON.parse(readFileSync(HARD_NEGATIVE_PATH, 'utf8')) as HardNegativePayload;
  return payload.summary ?? null;
}

function assertDatasetManifestLooksLikeParquet() {
  if (!existsSync(DATASET_MANIFEST_PATH)) {
    throw new Error(`${DATASET_MANIFEST_PATH} is missing.`);
  }
  const buffer = readFileSync(DATASET_MANIFEST_PATH);
  const startsWithParquet = buffer.subarray(0, 4).toString('utf8') === 'PAR1';
  const endsWithParquet = buffer.subarray(buffer.length - 4).toString('utf8') === 'PAR1';
  if (!startsWithParquet || !endsWithParquet) {
    throw new Error(`${DATASET_MANIFEST_PATH} does not look like a Parquet file.`);
  }
}

function dependencyLockPayload() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageLockSha256 = existsSync('package-lock.json') ? sha256File('package-lock.json') : null;
  return {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    packageLockPath: packageLockSha256 ? 'package-lock.json' : null,
    packageLockSha256,
    dependencies: packageJson.dependencies ?? {},
    devDependencies: packageJson.devDependencies ?? {},
  };
}

function writeJson(filePath: string, payload: unknown) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeModelCard(run: EmbeddingV0TrainingRun) {
  const blockers = run.blockers.length ? run.blockers.map((blocker) => `- ${blocker}`).join('\n') : '- None';
  const baselineSummary = run.baselines.map((baseline) =>
    `- ${baseline.label}: ${baseline.status}; objective=${baseline.objective}; pretrained=${baseline.pretrainedInitialisation.used ? 'yes' : 'no'}`
  ).join('\n');

  const markdown = `# Stackr Embedding Model V0

## Model Version

${STACKR_EMBEDDING_V0_MODEL_VERSION}

## Intended Use

Internal research for Pokemon card visual retrieval experiments using approved Stackr recognition training data. The intended output is a 128-dimensional L2-normalised embedding for candidate retrieval.

## Unsupported Use

This artifact must not be used for production recognition, grading, price estimation, identity forcing, user moderation, or any workflow that transmits user photos without explicit consent.

## Training Data

Dataset manifest: \`${DATASET_MANIFEST_PATH}\`

Dataset version: \`${run.datasetVersion ?? 'unknown'}\`

Dataset manifest SHA-256: \`${run.datasetManifestSha256}\`

Current run status: \`${run.status}\`

## Provenance

The pilot dataset metadata records zero approved training-pixel sources at this run. No external pretrained weights were used because model-weight provenance has not been reviewed for this task.

Source commit hash: \`${run.sourceCommitHash}\`

Source tree dirty during artifact generation: \`${run.sourceTreeDirty}\`

## Compared Baselines

${baselineSummary}

## Metrics

Training and retrieval metrics are intentionally null because the run was blocked before image pixels could be loaded.

Required metrics retained in the metrics schema:

- training loss
- validation retrieval accuracy
- top-1
- top-3
- mean reciprocal rank
- hard-negative accuracy
- language accuracy
- same-art reprint accuracy
- exact-variant accuracy
- embedding-distance distributions
- model size
- desktop inference time

## Limitations

${blockers}

## Known Failure Modes

- No trained embedding weights exist for this version.
- Clean reference metadata alone cannot demonstrate phone-camera recognition performance.
- OCR-only or collector-number-only matches remain insufficient for automatic exact identity.
- Hard-negative families that lack approved image pairs cannot be measured.

## Model Licence

No model weights are released for this blocked V0 run. Future weights must carry an explicit licence tied to approved training data and reviewed initialisation provenance.
`;

  writeFileSync(path.join(MODEL_DIR, 'model-card.md'), markdown, 'utf8');
}

function writeHtmlReport(run: EmbeddingV0TrainingRun) {
  const rows = run.baselines.map((baseline) => `
    <tr>
      <td>${escapeHtml(baseline.label)}</td>
      <td>${escapeHtml(baseline.status)}</td>
      <td>${escapeHtml(baseline.objective)}</td>
      <td>${baseline.hardNegativeSampling ? 'yes' : 'no'}</td>
      <td>${baseline.pretrainedInitialisation.used ? 'yes' : 'no'}</td>
    </tr>
  `).join('');
  const blockers = run.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stackr Embedding V0 Training Report</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #171321; background: #fbfaff; }
    h1, h2 { margin-bottom: 8px; }
    .panel { border: 1px solid #ded8f7; background: #fff; border-radius: 8px; padding: 16px; margin: 16px 0; }
    code { background: #f0ebff; padding: 2px 5px; border-radius: 5px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e7e2f8; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #4d2cc7; font-size: 12px; text-transform: uppercase; }
    .blocked { color: #b45309; font-weight: 800; }
  </style>
</head>
<body>
  <h1>Stackr Embedding V0 Training Report</h1>
  <div class="panel">
    <p>Status: <span class="blocked">${escapeHtml(run.status)}</span></p>
    <p>Dataset hash: <code>${escapeHtml(run.datasetManifestSha256)}</code></p>
    <p>Source commit: <code>${escapeHtml(run.sourceCommitHash)}</code></p>
    <p>Dirty tree: <code>${escapeHtml(run.sourceTreeDirty)}</code></p>
  </div>
  <div class="panel">
    <h2>Blocking Evidence</h2>
    <ul>${blockers || '<li>None</li>'}</ul>
  </div>
  <div class="panel">
    <h2>Baseline Comparison Plan</h2>
    <table>
      <thead>
        <tr><th>Baseline</th><th>Status</th><th>Objective</th><th>Hard negatives</th><th>Pretrained</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <script id="embedding-v0-run" type="application/json">${escapeHtml(JSON.stringify(run))}</script>
</body>
</html>
`;
  writeFileSync(REPORT_PATH, html, 'utf8');
}

function writePlots(run: EmbeddingV0TrainingRun) {
  const plotPayload = {
    title: 'Embedding distance distributions',
    status: run.status,
    reason: run.selectionReason,
    distributions: {
      positivePairs: [],
      negativePairs: [],
      hardNegativePairs: [],
    },
  };
  writeJson(path.join(MODEL_DIR, 'plots', 'embedding-distance-distributions.json'), plotPayload);
  writeFileSync(
    path.join(MODEL_DIR, 'plots', 'embedding-distance-distributions.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Embedding V0 Distance Distributions</title></head><body><h1>Embedding V0 Distance Distributions</h1><p>No distance plot was generated because training was blocked before approved image pixels were loaded.</p><pre>${escapeHtml(JSON.stringify(plotPayload, null, 2))}</pre></body></html>\n`,
    'utf8'
  );
}

function main() {
  assertDatasetManifestLooksLikeParquet();
  ensureDirs();

  const summary = readPilotSummary();
  const sourceCommitHash = tryGit(['rev-parse', 'HEAD'], 'unknown');
  const sourceTreeDirty = tryGit(['status', '--short'], '').length > 0;
  const run = buildEmbeddingV0TrainingRun({
    summary,
    datasetManifestSha256: sha256File(DATASET_MANIFEST_PATH),
    sourceCommitHash,
    sourceTreeDirty,
  });

  writeJson(path.join(MODEL_DIR, 'training-config.json'), run.config);
  writeJson(path.join(MODEL_DIR, 'metrics.json'), run);
  writeJson(path.join(MODEL_DIR, 'dependency-lock.json'), dependencyLockPayload());
  writeJson(path.join(MODEL_DIR, 'checkpoints', 'checkpoint-blocked.json'), {
    modelVersion: STACKR_EMBEDDING_V0_MODEL_VERSION,
    status: run.status,
    containsWeights: false,
    reason: run.selectionReason,
    blockers: run.blockers,
    datasetManifestSha256: run.datasetManifestSha256,
    sourceCommitHash: run.sourceCommitHash,
  });
  writeModelCard(run);
  writeHtmlReport(run);
  writePlots(run);

  console.log(JSON.stringify({
    status: run.status,
    blockers: run.blockers,
    selectedBaseline: run.selectedBaseline,
    reportPath: REPORT_PATH,
    modelDir: MODEL_DIR,
  }, null, 2));
}

main();
