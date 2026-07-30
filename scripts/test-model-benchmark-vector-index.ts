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
import {
  STACKR_MODEL_MEASUREMENT_EVIDENCE_VERSION,
  sha256CanonicalJson,
  validateModelMeasurementEvidence,
  type ModelMeasurementEvidenceFile,
} from '../lib/modelBenchmarkEvidence';

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

const READY_DATASET_SHA = 'c'.repeat(64);
const READY_IMPLEMENTATION_SHA = 'd'.repeat(64);

function validMeasurementEvidence(): ModelMeasurementEvidenceFile {
  const modelArtifactSha256 = '1'.repeat(64);
  const preprocessingSha256 = '2'.repeat(64);
  return {
    schemaVersion: STACKR_MODEL_MEASUREMENT_EVIDENCE_VERSION,
    benchmarkVersion: 'stackr-model-benchmark-v1.0.0',
    datasetVersion: 'stackr-ready-model-benchmark-fixture',
    datasetManifestSha256: READY_DATASET_SHA,
    benchmarkImplementationSha256: READY_IMPLEMENTATION_SHA,
    sourceCommitHash: '3'.repeat(40),
    generatedAt: '2026-07-30T00:00:00.000Z',
    evaluationIsolation: {
      modelSelectionAndFinalTestSeparated: true,
      queryImagesAreExcludedFromIndexedReferences: true,
    },
    runs: [
      {
        runId: 'dino-ios-latency',
        modelId: 'dinov2_vits14',
        modelArtifactSha256,
        preprocessingSha256,
        target: 'ios',
        hardware: 'iPhone fixture',
        operatingSystem: 'iOS fixture',
        runtime: 'ORT fixture',
        measurements: { iosLatencyMs: completeDinoMeasurements.iosLatencyMs },
        sampleCounts: { iosLatencyMs: 100 },
      },
      {
        runId: 'dino-android-latency',
        modelId: 'dinov2_vits14',
        modelArtifactSha256,
        preprocessingSha256,
        target: 'android',
        hardware: 'Android fixture',
        operatingSystem: 'Android fixture',
        runtime: 'ORT fixture',
        measurements: { androidLatencyMs: completeDinoMeasurements.androidLatencyMs },
        sampleCounts: { androidLatencyMs: 100 },
      },
      {
        runId: 'dino-server-resource',
        modelId: 'dinov2_vits14',
        modelArtifactSha256,
        preprocessingSha256,
        target: 'server_cpu',
        hardware: 'Server fixture',
        operatingSystem: 'Linux fixture',
        runtime: 'ONNX Runtime fixture',
        measurements: {
          modelSizeBytes: completeDinoMeasurements.modelSizeBytes,
          serverCpuLatencyMs: completeDinoMeasurements.serverCpuLatencyMs,
          peakMemoryMb: completeDinoMeasurements.peakMemoryMb,
        },
        sampleCounts: { modelSizeBytes: 1, serverCpuLatencyMs: 100, peakMemoryMb: 100 },
        onnxExportStatus: 'compatible',
      },
      {
        runId: 'dino-retrieval-quality',
        modelId: 'dinov2_vits14',
        modelArtifactSha256,
        preprocessingSha256,
        target: 'retrieval',
        hardware: 'Evaluation fixture',
        operatingSystem: 'Linux fixture',
        runtime: 'Benchmark fixture',
        measurements: {
          cleanImageTop1: completeDinoMeasurements.cleanImageTop1,
          cleanImageTop5: completeDinoMeasurements.cleanImageTop5,
          realCameraTop1: completeDinoMeasurements.realCameraTop1,
          realCameraTop5: completeDinoMeasurements.realCameraTop5,
          foreignLanguageTop1: completeDinoMeasurements.foreignLanguageTop1,
          croppedCardTop1: completeDinoMeasurements.croppedCardTop1,
          sleevedCardTop1: completeDinoMeasurements.sleevedCardTop1,
          glareBlurTop1: completeDinoMeasurements.glareBlurTop1,
          sameArtworkTop1: completeDinoMeasurements.sameArtworkTop1,
          quantizedTop1Delta: completeDinoMeasurements.quantizedTop1Delta,
        },
        sampleCounts: {
          cleanImageTop1: 100,
          cleanImageTop5: 100,
          realCameraTop1: 100,
          realCameraTop5: 100,
          foreignLanguageTop1: 100,
          croppedCardTop1: 100,
          sleevedCardTop1: 100,
          glareBlurTop1: 100,
          sameArtworkTop1: 100,
          quantizedTop1Delta: 100,
        },
        quantisationStatus: 'accepted',
      },
    ],
  };
}

function validatedMeasurementEvidence() {
  const payload = validMeasurementEvidence();
  return validateModelMeasurementEvidence({
    payload,
    evidenceSha256: sha256CanonicalJson(payload),
    expectedDatasetVersion: payload.datasetVersion,
    expectedDatasetManifestSha256: READY_DATASET_SHA,
    expectedBenchmarkImplementationSha256: READY_IMPLEMENTATION_SHA,
    knownModelIds: createModelCandidates().map((candidate) => candidate.modelId),
  });
}

function buildReadyBenchmarkRun() {
  const evidence = validatedMeasurementEvidence();
  assert.equal(evidence.accepted, true, evidence.blockers.join(', '));
  return buildModelBenchmarkRun({
    summary: readySummary(),
    datasetManifestSha256: READY_DATASET_SHA,
    sourceCommitHash: '4'.repeat(40),
    sourceTreeDirty: false,
    generatedAt: '2026-07-28T00:00:00.000Z',
    measurementOverrides: evidence.measurementOverrides,
    measurementEvidence: {
      path: 'fixture/model-measurement-evidence.json',
      sha256: evidence.evidenceSha256,
      schemaVersion: evidence.schemaVersion,
      acceptedRunCount: evidence.acceptedRunCount,
      acceptedModelIds: evidence.acceptedModelIds,
      blockers: evidence.blockers,
    },
    evaluationIsolation: {
      sourceLeakageExists: false,
      physicalCardSessionLeakageExists: false,
      ...evidence.evaluationIsolation,
      notes: ['fixture'],
    },
  });
}

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
  assert.ok(run.blockers.includes('measurement_evidence_not_accepted'));
  assert.ok(run.blockers.includes('model_selection_and_final_test_not_separated'));
  assert.ok(run.blockers.includes('query_images_not_excluded_from_indexed_references'));
  assert.equal(run.leakageReport.modelSelectionAndFinalTestSeparated, false);
  assert.equal(run.leakageReport.queryImagesAreExcludedFromIndexedReferences, false);
}

function assertWeightedSelectionOnlyWhenMeasured() {
  const run = buildReadyBenchmarkRun();

  assert.equal(run.status, 'complete', run.blockers.join(', '));
  assert.equal(run.selectedModelId, 'dinov2_vits14');
  assert.equal(run.selectedEmbeddingDimensions, 384);
  assert.equal(run.blockers.length, 0);

  const selectedDecision = run.candidateDecisions.find((decision) => decision.modelId === 'dinov2_vits14');
  assert.equal(selectedDecision?.decision, 'selected');
  assert.equal(selectedDecision?.rank, 1);
  assert.ok((selectedDecision?.weightedScore ?? 0) > 0);
}

function assertMeasurementEvidenceFailsClosed() {
  const missingIsolation = validMeasurementEvidence();
  missingIsolation.evaluationIsolation.queryImagesAreExcludedFromIndexedReferences = false;
  const isolationResult = validateModelMeasurementEvidence({
    payload: missingIsolation,
    evidenceSha256: sha256CanonicalJson(missingIsolation),
    expectedDatasetVersion: missingIsolation.datasetVersion,
    expectedDatasetManifestSha256: READY_DATASET_SHA,
    expectedBenchmarkImplementationSha256: READY_IMPLEMENTATION_SHA,
    knownModelIds: createModelCandidates().map((candidate) => candidate.modelId),
  });
  assert.equal(isolationResult.accepted, false);
  assert.ok(isolationResult.blockers.includes('query_images_not_excluded_from_indexed_references'));
  assert.deepEqual(isolationResult.measurementOverrides, {});

  const tamperedDataset = validMeasurementEvidence();
  const checksumResult = validateModelMeasurementEvidence({
    payload: tamperedDataset,
    evidenceSha256: sha256CanonicalJson(tamperedDataset),
    expectedDatasetVersion: tamperedDataset.datasetVersion,
    expectedDatasetManifestSha256: '9'.repeat(64),
    expectedBenchmarkImplementationSha256: READY_IMPLEMENTATION_SHA,
    knownModelIds: createModelCandidates().map((candidate) => candidate.modelId),
  });
  assert.equal(checksumResult.accepted, false);
  assert.ok(checksumResult.blockers.includes('measurement_evidence_dataset_checksum_mismatch'));

  const duplicateMetric = validMeasurementEvidence();
  duplicateMetric.runs[1].measurements.cleanImageTop1 = 0.5;
  duplicateMetric.runs[1].sampleCounts.cleanImageTop1 = 10;
  duplicateMetric.runs[3].measurements.cleanImageTop1 = 0.9;
  const duplicateResult = validateModelMeasurementEvidence({
    payload: duplicateMetric,
    evidenceSha256: sha256CanonicalJson(duplicateMetric),
    expectedDatasetVersion: duplicateMetric.datasetVersion,
    expectedDatasetManifestSha256: READY_DATASET_SHA,
    expectedBenchmarkImplementationSha256: READY_IMPLEMENTATION_SHA,
    knownModelIds: createModelCandidates().map((candidate) => candidate.modelId),
  });
  assert.equal(duplicateResult.accepted, false);
  assert.ok(duplicateResult.blockers.some((blocker) => blocker.includes('duplicate_metric_cleanImageTop1')));
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

  const readyRun = buildReadyBenchmarkRun();
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
  assert.match(sql, /ml\.card_embedding_vector_table_sql[\s\S]+security invoker\s+set search_path = ''/);
  assert.match(sql, /using hnsw \(embedding vector_cosine_ops\)/);
  assert.match(sql, /create or replace function ml\.activate_embedding_index_version/);
  assert.match(sql, /ml\.activate_embedding_index_version[\s\S]+security invoker\s+set search_path = ''/);
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
assertMeasurementEvidenceFailsClosed();
assertRegenerationPlanIsGated();
assertMigrationStructure();

console.log('Stage 6 model benchmark and vector-index gate tests passed.');
