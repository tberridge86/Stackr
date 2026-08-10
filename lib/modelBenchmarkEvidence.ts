import { createHash } from 'node:crypto';
import {
  STACKR_MODEL_BENCHMARK_VERSION,
  type BenchmarkMetricKey,
  type ModelMeasurementOverrides,
  type OnnxCompatibility,
  type QuantisationStatus,
  type StackrModelMeasurements,
} from './modelBenchmarkV1';

export const STACKR_MODEL_MEASUREMENT_EVIDENCE_VERSION =
  'stackr-model-measurement-evidence-v1.0.0';

const METRIC_KEYS = [
  'modelSizeBytes',
  'iosLatencyMs',
  'androidLatencyMs',
  'serverCpuLatencyMs',
  'peakMemoryMb',
  'cleanImageTop1',
  'cleanImageTop5',
  'realCameraTop1',
  'realCameraTop5',
  'foreignLanguageTop1',
  'croppedCardTop1',
  'sleevedCardTop1',
  'glareBlurTop1',
  'sameArtworkTop1',
  'quantizedTop1Delta',
] as const satisfies readonly BenchmarkMetricKey[];

const METRIC_KEY_SET = new Set<string>(METRIC_KEYS);
const POSITIVE_METRICS = new Set<BenchmarkMetricKey>([
  'modelSizeBytes',
  'iosLatencyMs',
  'androidLatencyMs',
  'serverCpuLatencyMs',
  'peakMemoryMb',
]);
const ACCURACY_METRICS = new Set<BenchmarkMetricKey>([
  'cleanImageTop1',
  'cleanImageTop5',
  'realCameraTop1',
  'realCameraTop5',
  'foreignLanguageTop1',
  'croppedCardTop1',
  'sleevedCardTop1',
  'glareBlurTop1',
  'sameArtworkTop1',
]);
const ONNX_STATUSES = new Set<OnnxCompatibility>([
  'compatible',
  'blocked',
  'not_tested',
  'unsupported',
]);
const QUANTISATION_STATUSES = new Set<QuantisationStatus>([
  'accepted',
  'rejected',
  'not_tested',
  'blocked',
]);

export type ModelMeasurementTarget = 'ios' | 'android' | 'server_cpu' | 'retrieval';

export type ModelMeasurementEvidenceRun = {
  runId: string;
  modelId: string;
  modelArtifactSha256: string;
  preprocessingSha256: string;
  target: ModelMeasurementTarget;
  hardware: string;
  operatingSystem: string;
  runtime: string;
  measurements: Partial<StackrModelMeasurements>;
  sampleCounts: Partial<Record<BenchmarkMetricKey, number>>;
  onnxExportStatus?: OnnxCompatibility;
  quantisationStatus?: QuantisationStatus;
};

export type ModelMeasurementEvidenceFile = {
  schemaVersion: typeof STACKR_MODEL_MEASUREMENT_EVIDENCE_VERSION;
  benchmarkVersion: typeof STACKR_MODEL_BENCHMARK_VERSION;
  datasetVersion: string;
  datasetManifestSha256: string;
  benchmarkImplementationSha256: string;
  sourceCommitHash: string;
  generatedAt: string;
  evaluationIsolation: {
    modelSelectionAndFinalTestSeparated: boolean;
    queryImagesAreExcludedFromIndexedReferences: boolean;
  };
  runs: ModelMeasurementEvidenceRun[];
};

export type ModelMeasurementEvidenceValidation = {
  accepted: boolean;
  schemaVersion: string | null;
  evidenceSha256: string;
  sourceCommitHash: string | null;
  acceptedRunCount: number;
  acceptedModelIds: string[];
  blockers: string[];
  evaluationIsolation: {
    modelSelectionAndFinalTestSeparated: boolean;
    queryImagesAreExcludedFromIndexedReferences: boolean;
  };
  measurementOverrides: ModelMeasurementOverrides;
};

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isCommitHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function metricValueIsValid(metric: BenchmarkMetricKey, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (POSITIVE_METRICS.has(metric)) return value > 0;
  if (ACCURACY_METRICS.has(metric)) return value >= 0 && value <= 1;
  return metric === 'quantizedTop1Delta' && value >= -1 && value <= 1;
}

function targetAllowsMetric(target: ModelMeasurementTarget, metric: BenchmarkMetricKey) {
  if (metric === 'iosLatencyMs') return target === 'ios';
  if (metric === 'androidLatencyMs') return target === 'android';
  if (metric === 'serverCpuLatencyMs') return target === 'server_cpu';
  return true;
}

export function sha256CanonicalJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validateModelMeasurementEvidence(input: {
  payload: unknown;
  evidenceSha256: string;
  expectedDatasetVersion: string;
  expectedDatasetManifestSha256: string;
  expectedBenchmarkImplementationSha256: string;
  knownModelIds: string[];
}): ModelMeasurementEvidenceValidation {
  const payload = input.payload as Partial<ModelMeasurementEvidenceFile> | null;
  const blockers: string[] = [];
  const knownModelIds = new Set(input.knownModelIds);
  const runIds = new Set<string>();
  const artifactsByModel = new Map<string, string>();
  const preprocessingByModel = new Map<string, string>();
  const metricsByModel = new Map<string, Set<BenchmarkMetricKey>>();
  const statusesByModel = new Map<string, { onnx?: OnnxCompatibility; quantisation?: QuantisationStatus }>();

  if (!payload || typeof payload !== 'object') blockers.push('measurement_evidence_not_an_object');
  if (payload?.schemaVersion !== STACKR_MODEL_MEASUREMENT_EVIDENCE_VERSION) {
    blockers.push('measurement_evidence_schema_version_mismatch');
  }
  if (payload?.benchmarkVersion !== STACKR_MODEL_BENCHMARK_VERSION) {
    blockers.push('measurement_evidence_benchmark_version_mismatch');
  }
  if (payload?.datasetVersion !== input.expectedDatasetVersion) {
    blockers.push('measurement_evidence_dataset_version_mismatch');
  }
  if (payload?.datasetManifestSha256 !== input.expectedDatasetManifestSha256) {
    blockers.push('measurement_evidence_dataset_checksum_mismatch');
  }
  if (payload?.benchmarkImplementationSha256 !== input.expectedBenchmarkImplementationSha256) {
    blockers.push('measurement_evidence_implementation_checksum_mismatch');
  }
  if (!isSha256(payload?.datasetManifestSha256)) blockers.push('measurement_evidence_invalid_dataset_checksum');
  if (!isSha256(payload?.benchmarkImplementationSha256)) blockers.push('measurement_evidence_invalid_implementation_checksum');
  if (!isCommitHash(payload?.sourceCommitHash)) blockers.push('measurement_evidence_invalid_source_commit');
  if (!Number.isFinite(Date.parse(String(payload?.generatedAt ?? '')))) {
    blockers.push('measurement_evidence_invalid_generated_at');
  }
  if (!payload?.evaluationIsolation?.modelSelectionAndFinalTestSeparated) {
    blockers.push('model_selection_and_final_test_not_separated');
  }
  if (!payload?.evaluationIsolation?.queryImagesAreExcludedFromIndexedReferences) {
    blockers.push('query_images_not_excluded_from_indexed_references');
  }
  if (!Array.isArray(payload?.runs) || payload.runs.length === 0) {
    blockers.push('measurement_evidence_runs_missing');
  }

  for (const [index, run] of (payload?.runs ?? []).entries()) {
    const prefix = `measurement_run_${index}`;
    if (!isNonEmptyString(run.runId) || runIds.has(run.runId)) blockers.push(`${prefix}_invalid_or_duplicate_id`);
    else runIds.add(run.runId);
    if (!knownModelIds.has(run.modelId)) blockers.push(`${prefix}_unknown_model`);
    if (!isSha256(run.modelArtifactSha256)) blockers.push(`${prefix}_invalid_model_checksum`);
    if (!isSha256(run.preprocessingSha256)) blockers.push(`${prefix}_invalid_preprocessing_checksum`);
    if (!['ios', 'android', 'server_cpu', 'retrieval'].includes(run.target)) blockers.push(`${prefix}_invalid_target`);
    for (const [label, value] of [
      ['hardware', run.hardware],
      ['operating_system', run.operatingSystem],
      ['runtime', run.runtime],
    ] as const) {
      if (!isNonEmptyString(value)) blockers.push(`${prefix}_missing_${label}`);
    }

    const previousArtifact = artifactsByModel.get(run.modelId);
    if (previousArtifact && previousArtifact !== run.modelArtifactSha256) blockers.push(`${prefix}_model_checksum_conflict`);
    else artifactsByModel.set(run.modelId, run.modelArtifactSha256);
    const previousPreprocessing = preprocessingByModel.get(run.modelId);
    if (previousPreprocessing && previousPreprocessing !== run.preprocessingSha256) {
      blockers.push(`${prefix}_preprocessing_checksum_conflict`);
    } else preprocessingByModel.set(run.modelId, run.preprocessingSha256);

    const unknownMetrics = Object.keys(run.measurements ?? {}).filter((key) => !METRIC_KEY_SET.has(key));
    if (unknownMetrics.length > 0) blockers.push(`${prefix}_unknown_metrics`);
    const seenMetrics = metricsByModel.get(run.modelId) ?? new Set<BenchmarkMetricKey>();
    for (const [metric, value] of Object.entries(run.measurements ?? {}) as Array<[BenchmarkMetricKey, unknown]>) {
      if (!METRIC_KEY_SET.has(metric)) continue;
      if (seenMetrics.has(metric)) blockers.push(`${prefix}_duplicate_metric_${metric}`);
      seenMetrics.add(metric);
      if (!metricValueIsValid(metric, value)) blockers.push(`${prefix}_invalid_metric_${metric}`);
      if (!targetAllowsMetric(run.target, metric)) blockers.push(`${prefix}_wrong_target_${metric}`);
      const sampleCount = run.sampleCounts?.[metric];
      if (!Number.isInteger(sampleCount) || Number(sampleCount) <= 0) {
        blockers.push(`${prefix}_invalid_sample_count_${metric}`);
      }
    }
    metricsByModel.set(run.modelId, seenMetrics);

    const statuses = statusesByModel.get(run.modelId) ?? {};
    if (run.onnxExportStatus !== undefined) {
      if (!ONNX_STATUSES.has(run.onnxExportStatus)) blockers.push(`${prefix}_invalid_onnx_status`);
      if (statuses.onnx && statuses.onnx !== run.onnxExportStatus) blockers.push(`${prefix}_onnx_status_conflict`);
      statuses.onnx = run.onnxExportStatus;
    }
    if (run.quantisationStatus !== undefined) {
      if (!QUANTISATION_STATUSES.has(run.quantisationStatus)) blockers.push(`${prefix}_invalid_quantisation_status`);
      if (statuses.quantisation && statuses.quantisation !== run.quantisationStatus) {
        blockers.push(`${prefix}_quantisation_status_conflict`);
      }
      statuses.quantisation = run.quantisationStatus;
    }
    statusesByModel.set(run.modelId, statuses);
  }

  const accepted = blockers.length === 0;
  const measurementOverrides: ModelMeasurementOverrides = {};
  if (accepted) {
    for (const run of payload?.runs ?? []) {
      const current = measurementOverrides[run.modelId] ?? {};
      measurementOverrides[run.modelId] = {
        ...current,
        ...run.measurements,
        ...(run.onnxExportStatus ? { onnxExportStatus: run.onnxExportStatus } : {}),
        ...(run.quantisationStatus ? { quantisationStatus: run.quantisationStatus } : {}),
      };
    }
  }

  return {
    accepted,
    schemaVersion: typeof payload?.schemaVersion === 'string' ? payload.schemaVersion : null,
    evidenceSha256: input.evidenceSha256,
    sourceCommitHash: isCommitHash(payload?.sourceCommitHash) ? payload.sourceCommitHash : null,
    acceptedRunCount: accepted ? payload?.runs?.length ?? 0 : 0,
    acceptedModelIds: accepted ? [...new Set((payload?.runs ?? []).map((run) => run.modelId))].sort() : [],
    blockers,
    evaluationIsolation: accepted
      ? {
          modelSelectionAndFinalTestSeparated: true,
          queryImagesAreExcludedFromIndexedReferences: true,
        }
      : {
          modelSelectionAndFinalTestSeparated: false,
          queryImagesAreExcludedFromIndexedReferences: false,
        },
    measurementOverrides,
  };
}
