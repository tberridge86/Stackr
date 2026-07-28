import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildEmbeddingIndexRegenerationPlan,
  buildModelBenchmarkRun,
  createModelCandidates,
  getDatasetBlockers,
  getMissingLanguages,
  type HardNegativeDatasetSummary,
  type StackrModelMeasurements,
} from '../lib/modelBenchmarkV1';

const HARD_NEGATIVE_PATH = 'ml/data_manifests/hard-negative-groups.json';
const MIGRATION_PATH = 'supabase/migrations/20260728064400_embedding_model_registry_and_index_gates.sql';

type HardNegativePayload = {
  summary: HardNegativeDatasetSummary;
};

function currentSummary() {
  return (JSON.parse(readFileSync(HARD_NEGATIVE_PATH, 'utf8')) as HardNegativePayload).summary;
}

function readySummary(overrides: Partial<HardNegativeDatasetSummary> = {}): HardNegativeDatasetSummary {
  return {
    datasetVersion: 'stackr-ready-model-benchmark-fixture',
    rowCount: 500,
    classCount: 100,
    sourceImageCount: 200,
    sourceReferenceRowCount: 200,
    syntheticViewRowCount: 100,
    realPhoneCaptureSourceCount: 160,
    realPhoneTestSourceCount: 80,
    approvedTrainingPixelSourceCount: 200,
    languageDistribution: [
      { key: 'en', count: 100 },
      { key: 'ja', count: 100 },
      { key: 'zh-Hans', count: 100 },
      { key: 'zh-Hant', count: 100 },
      { key: 'ko', count: 100 },
    ],
    splitDistribution: [
      { key: 'train', count: 300 },
      { key: 'validation', count: 100 },
      { key: 'test', count: 100 },
    ],
    duplicateAnalysis: {
      sourceLeakageExists: false,
      physicalCardSessionLeakageExists: false,
    },
    hardNegativeCoverage: {
      represented: 10,
      blocked: 0,
      total: 10,
    },
    limitations: [],
    ...overrides,
  };
}

const completeDinoMeasurements: StackrModelMeasurements = {
  modelSizeBytes: 88_000_000,
  iosLatencyMs: 28,
  androidLatencyMs: 48,
  serverCpuLatencyMs: 66,
  peakMemoryMb: 196,
  cleanImageTop1: 0.93,
  cleanImageTop5: 0.98,
  realCameraTop1: 0.88,
  realCameraTop5: 0.96,
  foreignLanguageTop1: 0.84,
  croppedCardTop1: 0.86,
  sleevedCardTop1: 0.82,
  glareBlurTop1: 0.74,
  sameArtworkTop1: 0.78,
  quantizedTop1Delta: -0.015,
};

function assertCandidatesIncludeRequiredFamilies() {
  const candidates = createModelCandidates();
  const ids = candidates.map((candidate) => candidate.modelId);
  assert.ok(ids.includes('mobileclip2_s0'), 'MobileCLIP2-S0 benchmark candidate is missing');
  assert.ok(ids.includes('mobileclip2_s2'), 'MobileCLIP2-S2 benchmark candidate is missing');
  assert.ok(ids.includes('dinov2_vits14'), 'DINOv2 ViT-S/14 benchmark candidate is missing');

  const mobileClip = candidates.find((candidate) => candidate.modelId === 'mobileclip2_s0');
  assert.equal(mobileClip?.license.status, 'research_only');
  assert.equal(mobileClip?.productionEligible, false);

  const dino = candidates.find((candidate) => candidate.modelId === 'dinov2_vits14');
  assert.equal(dino?.license.status, 'production_allowed');
  assert.equal(dino?.embeddingDimensions, 384);
  assert.equal(dino?.productionEligible, true);
}

function assertCurrentDatasetBlocksSelection() {
  const summary = currentSummary();
  const blockers = getDatasetBlockers(summary);
  assert.ok(blockers.includes('no_approved_training_pixels'));
  assert.ok(blockers.includes('no_real_phone_test_captures'));
  assert.ok(blockers.includes('missing_zh-Hans_benchmark_coverage'));
  assert.ok(blockers.includes('missing_ko_benchmark_coverage'));
  assert.deepEqual(getMissingLanguages(summary), ['zh-Hans', 'ko']);

  const run = buildModelBenchmarkRun({
    summary,
    datasetManifestSha256: 'a'.repeat(64),
    sourceCommitHash: 'b'.repeat(40),
    sourceTreeDirty: true,
    generatedAt: '2026-07-28T00:00:00.000Z',
  });

  assert.equal(run.status, 'blocked');
  assert.equal(run.selectedModelId, null);
  assert.equal(run.selectedEmbeddingDimensions, null);
  assert.ok(run.blockers.includes('no_production_model_selected_by_weighted_benchmark'));
  assert.equal(run.leakageReport.modelSelectionAndFinalTestSeparated, false);
  assert.equal(run.leakageReport.queryImagesAreExcludedFromIndexedReferences, false);
}

function assertWeightedSelectionOnlyWhenMeasured() {
  const run = buildModelBenchmarkRun({
    summary: readySummary(),
    datasetManifestSha256: 'c'.repeat(64),
    sourceCommitHash: 'd'.repeat(40),
    sourceTreeDirty: false,
    generatedAt: '2026-07-28T00:00:00.000Z',
    measurementOverrides: {
      dinov2_vits14: {
        ...completeDinoMeasurements,
        onnxExportStatus: 'compatible',
        quantisationStatus: 'accepted',
      },
    },
  });

  assert.equal(run.status, 'complete');
  assert.equal(run.selectedModelId, 'dinov2_vits14');
  assert.equal(run.selectedEmbeddingDimensions, 384);
  assert.equal(run.blockers.length, 0);

  const selectedDecision = run.candidateDecisions.find((decision) => decision.modelId === 'dinov2_vits14');
  assert.equal(selectedDecision?.decision, 'selected');
  assert.equal(selectedDecision?.rank, 1);
  assert.ok((selectedDecision?.weightedScore ?? 0) > 0);
}

function assertRegenerationPlanIsGated() {
  const blockedRun = buildModelBenchmarkRun({
    summary: currentSummary(),
    datasetManifestSha256: 'e'.repeat(64),
    sourceCommitHash: 'f'.repeat(40),
    sourceTreeDirty: false,
  });

  const blockedPlan = buildEmbeddingIndexRegenerationPlan({
    benchmarkRun: blockedRun,
    scope: { scopeType: 'full', scopeValue: null },
  });
  assert.equal(blockedPlan.status, 'blocked');
  assert.ok(blockedPlan.blockedReasons.includes('no_selected_model'));
  assert.ok(blockedPlan.blockedReasons.includes('benchmark_not_complete'));
  assert.match(blockedPlan.jobKey, /^[0-9a-f]{64}$/);

  const readyRun = buildModelBenchmarkRun({
    summary: readySummary(),
    datasetManifestSha256: '1'.repeat(64),
    sourceCommitHash: '2'.repeat(40),
    sourceTreeDirty: false,
    measurementOverrides: {
      dinov2_vits14: {
        ...completeDinoMeasurements,
        onnxExportStatus: 'compatible',
        quantisationStatus: 'accepted',
      },
    },
  });
  const readyPlan = buildEmbeddingIndexRegenerationPlan({
    benchmarkRun: readyRun,
    scope: { scopeType: 'language', scopeValue: 'ja' },
  });
  assert.equal(readyPlan.status, 'ready');
  assert.equal(readyPlan.modelId, 'dinov2_vits14');
}

function assertMigrationStructure() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const table of [
    'ml.embedding_models',
    'ml.embedding_benchmark_runs',
    'ml.embedding_benchmark_results',
    'ml.embedding_index_versions',
    'ml.embedding_generation_jobs',
    'ml.embedding_activation_events',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${table.replace('.', '\\.')}`), `missing ${table}`);
    assert.match(sql, new RegExp(`alter table ${table.replace('.', '\\.')} enable row level security`), `missing RLS for ${table}`);
  }

  assert.match(sql, /create or replace function ml\.card_embedding_vector_table_sql\(p_model_id text\)/);
  assert.match(sql, /using hnsw \(embedding vector_cosine_ops\)/);
  assert.match(sql, /create or replace function ml\.activate_embedding_index_version/);
  assert.match(sql, /index_not_validated/);
  assert.match(sql, /model_not_production_allowed/);
  assert.match(sql, /index_incomplete/);
  assert.match(sql, /insert into ml\.embedding_models/);
  assert.match(sql, /'mobileclip2_s0'[\s\S]*'research_only'/);
  assert.match(sql, /'dinov2_vits14'[\s\S]*'production_allowed'[\s\S]*'candidate'/);
  assert.match(sql, /grant select, insert, update, delete on table[\s\S]*to service_role;/);
  assert.match(sql, /revoke all on table[\s\S]*from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on table[\s\S]*to anon/);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on table[\s\S]*to authenticated/);
}

assertCandidatesIncludeRequiredFamilies();
assertCurrentDatasetBlocksSelection();
assertWeightedSelectionOnlyWhenMeasured();
assertRegenerationPlanIsGated();
assertMigrationStructure();

console.log('Stage 6 model benchmark and vector-index gate tests passed.');
