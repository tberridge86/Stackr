import { createHash } from 'node:crypto';

export const STACKR_MODEL_BENCHMARK_VERSION = 'stackr-model-benchmark-v1.0.0';
export const STACKR_EMBEDDING_INDEX_COMMAND_VERSION = 'stackr-embedding-index-command-v1.0.0';

export const SUPPORTED_RECOGNITION_LANGUAGES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'] as const;

export type StackrRecognitionLanguage = typeof SUPPORTED_RECOGNITION_LANGUAGES[number];

export type HardNegativeDatasetSummary = {
  datasetVersion: string;
  generatedAt?: string;
  rowCount: number;
  classCount: number;
  sourceImageCount: number;
  sourceReferenceRowCount?: number;
  syntheticViewRowCount: number;
  realPhoneCaptureSourceCount: number;
  realPhoneTestSourceCount?: number;
  approvedTrainingPixelSourceCount: number;
  languageDistribution: Array<{ key: string; count: number }>;
  splitDistribution: Array<{ key: string; count: number }>;
  duplicateAnalysis: {
    sourceLeakageExists: boolean;
    physicalCardSessionLeakageExists?: boolean;
  };
  hardNegativeCoverage: {
    represented: number;
    blocked: number;
    total: number;
  };
  limitations: string[];
};

export type ModelLicenseStatus = 'production_allowed' | 'research_only' | 'needs_review' | 'rejected';
export type ModelFamily = 'mobileclip' | 'dino' | 'clip' | 'stackr_metric_learning' | 'non_neural_visual';
export type ModelSelectionStatus = 'candidate' | 'blocked' | 'selected';

export type BenchmarkMetricValue = number | null;

export type StackrModelMeasurements = {
  modelSizeBytes: BenchmarkMetricValue;
  iosLatencyMs: BenchmarkMetricValue;
  androidLatencyMs: BenchmarkMetricValue;
  serverCpuLatencyMs: BenchmarkMetricValue;
  peakMemoryMb: BenchmarkMetricValue;
  cleanImageTop1: BenchmarkMetricValue;
  cleanImageTop5: BenchmarkMetricValue;
  realCameraTop1: BenchmarkMetricValue;
  realCameraTop5: BenchmarkMetricValue;
  foreignLanguageTop1: BenchmarkMetricValue;
  croppedCardTop1: BenchmarkMetricValue;
  sleevedCardTop1: BenchmarkMetricValue;
  glareBlurTop1: BenchmarkMetricValue;
  sameArtworkTop1: BenchmarkMetricValue;
  quantizedTop1Delta: BenchmarkMetricValue;
};

export type BenchmarkMetricKey = keyof StackrModelMeasurements;

export type OnnxCompatibility = 'compatible' | 'blocked' | 'not_tested' | 'unsupported';
export type QuantisationStatus = 'accepted' | 'rejected' | 'not_tested' | 'blocked';

export type ModelCandidate = {
  modelId: string;
  displayName: string;
  family: ModelFamily;
  source: {
    name: string;
    url: string;
    revision: string | null;
  };
  license: {
    name: string;
    url: string;
    status: ModelLicenseStatus;
    notes: string;
  };
  input: {
    width: number | null;
    height: number | null;
    channels: 3;
    notes: string;
  };
  embeddingDimensions: number | null;
  parameterCount: number | null;
  deploymentTargets: Array<'mobile' | 'server'>;
  preprocessing: Record<string, unknown>;
  normalisation: Record<string, unknown>;
  upstreamReported: {
    modelSizeBytes: number | null;
    iosLatencyMs: number | null;
    androidLatencyMs: number | null;
    serverCpuLatencyMs: number | null;
    peakMemoryMb: number | null;
    notes: string;
  };
  stackrMeasurements: StackrModelMeasurements;
  onnxExportStatus: OnnxCompatibility;
  quantisationStatus: QuantisationStatus;
  productionEligible: boolean;
  selectionStatus: ModelSelectionStatus;
};

export type CandidateDecision = {
  modelId: string;
  displayName: string;
  productionEligible: boolean;
  blockers: string[];
  missingMetrics: BenchmarkMetricKey[];
  weightedScore: number | null;
  rank: number | null;
  decision: 'blocked' | 'not_selected' | 'selected';
};

export type ModelBenchmarkRun = {
  benchmarkVersion: typeof STACKR_MODEL_BENCHMARK_VERSION;
  status: 'blocked' | 'ready_to_measure' | 'complete';
  generatedAt: string;
  datasetVersion: string | null;
  datasetManifestSha256: string;
  sourceCommitHash: string;
  sourceTreeDirty: boolean;
  supportedLanguages: StackrRecognitionLanguage[];
  dataCoverage: {
    rowCount: number;
    classCount: number;
    sourceImageCount: number;
    syntheticViewRowCount: number;
    realPhoneCaptureSourceCount: number;
    realPhoneTestSourceCount: number;
    approvedTrainingPixelSourceCount: number;
    languageDistribution: Array<{ key: string; count: number }>;
    missingLanguages: StackrRecognitionLanguage[];
    hardNegativeCoverage: HardNegativeDatasetSummary['hardNegativeCoverage'];
  };
  leakageReport: {
    sourceLeakageExists: boolean;
    physicalCardSessionLeakageExists: boolean;
    modelSelectionAndFinalTestSeparated: boolean;
    queryImagesAreExcludedFromIndexedReferences: boolean;
    notes: string[];
  };
  selectionWeights: Record<BenchmarkMetricKey, number>;
  candidates: ModelCandidate[];
  candidateDecisions: CandidateDecision[];
  selectedModelId: string | null;
  selectedEmbeddingDimensions: number | null;
  selectionReason: string;
  blockers: string[];
  acceptanceCriteria: string[];
};

export type ModelMeasurementOverrides = Partial<Record<string, Partial<StackrModelMeasurements> & {
  onnxExportStatus?: OnnxCompatibility;
  quantisationStatus?: QuantisationStatus;
  productionEligible?: boolean;
}>>;

export type EmbeddingIndexRegenerationScope =
  | { scopeType: 'card'; scopeValue: string }
  | { scopeType: 'set'; scopeValue: string }
  | { scopeType: 'language'; scopeValue: string }
  | { scopeType: 'full'; scopeValue: null };

export type EmbeddingIndexRegenerationPlan = {
  commandVersion: typeof STACKR_EMBEDDING_INDEX_COMMAND_VERSION;
  status: 'blocked' | 'ready';
  generatedAt: string;
  scope: EmbeddingIndexRegenerationScope;
  modelId: string | null;
  indexVersion: string | null;
  jobKey: string;
  shouldActivate: boolean;
  blockedReasons: string[];
  steps: string[];
};

export const STACKR_MODEL_SELECTION_WEIGHTS: Record<BenchmarkMetricKey, number> = {
  modelSizeBytes: 0.03,
  iosLatencyMs: 0.06,
  androidLatencyMs: 0.06,
  serverCpuLatencyMs: 0.03,
  peakMemoryMb: 0.03,
  cleanImageTop1: 0.06,
  cleanImageTop5: 0.04,
  realCameraTop1: 0.16,
  realCameraTop5: 0.08,
  foreignLanguageTop1: 0.12,
  croppedCardTop1: 0.08,
  sleevedCardTop1: 0.08,
  glareBlurTop1: 0.08,
  sameArtworkTop1: 0.14,
  quantizedTop1Delta: 0.05,
};

const REQUIRED_PRODUCTION_METRICS = Object.keys(STACKR_MODEL_SELECTION_WEIGHTS) as BenchmarkMetricKey[];
const LOWER_IS_BETTER = new Set<BenchmarkMetricKey>([
  'modelSizeBytes',
  'iosLatencyMs',
  'androidLatencyMs',
  'serverCpuLatencyMs',
  'peakMemoryMb',
]);

const TARGETS: Partial<Record<BenchmarkMetricKey, number>> = {
  modelSizeBytes: 60_000_000,
  iosLatencyMs: 30,
  androidLatencyMs: 55,
  serverCpuLatencyMs: 90,
  peakMemoryMb: 256,
};

export function emptyStackrModelMeasurements(): StackrModelMeasurements {
  return {
    modelSizeBytes: null,
    iosLatencyMs: null,
    androidLatencyMs: null,
    serverCpuLatencyMs: null,
    peakMemoryMb: null,
    cleanImageTop1: null,
    cleanImageTop5: null,
    realCameraTop1: null,
    realCameraTop5: null,
    foreignLanguageTop1: null,
    croppedCardTop1: null,
    sleevedCardTop1: null,
    glareBlurTop1: null,
    sameArtworkTop1: null,
    quantizedTop1Delta: null,
  };
}

function withOverrides(candidate: ModelCandidate, overrides?: ModelMeasurementOverrides): ModelCandidate {
  const override = overrides?.[candidate.modelId];
  if (!override) return candidate;
  const {
    onnxExportStatus,
    quantisationStatus,
    productionEligible,
    ...measurementOverrides
  } = override;

  return {
    ...candidate,
    stackrMeasurements: {
      ...candidate.stackrMeasurements,
      ...measurementOverrides,
    },
    onnxExportStatus: onnxExportStatus ?? candidate.onnxExportStatus,
    quantisationStatus: quantisationStatus ?? candidate.quantisationStatus,
    productionEligible: productionEligible ?? candidate.productionEligible,
  };
}

export function createModelCandidates(overrides?: ModelMeasurementOverrides): ModelCandidate[] {
  const candidates: ModelCandidate[] = [
    {
      modelId: 'mobileclip2_s0',
      displayName: 'Apple MobileCLIP2-S0',
      family: 'mobileclip',
      source: {
        name: 'Apple ml-mobileclip / Apple MobileCLIP2-S0',
        url: 'https://github.com/apple/ml-mobileclip',
        revision: null,
      },
      license: {
        name: 'Apple ML Research Model License',
        url: 'https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS',
        status: 'research_only',
        notes: 'Apple code is MIT, but published MobileCLIP model weights are governed by Apple ML Research terms and are not approved here for Stackr production service use.',
      },
      input: {
        width: 224,
        height: 224,
        channels: 3,
        notes: 'Square CLIP-style image input; final Stackr crop policy still requires measurement.',
      },
      embeddingDimensions: null,
      parameterCount: 11_400_000,
      deploymentTargets: ['mobile', 'server'],
      preprocessing: {
        status: 'not_verified_in_stackr',
      },
      normalisation: {
        l2Normalised: true,
        status: 'not_verified_in_stackr',
      },
      upstreamReported: {
        modelSizeBytes: null,
        iosLatencyMs: 1.5,
        androidLatencyMs: null,
        serverCpuLatencyMs: null,
        peakMemoryMb: null,
        notes: 'Latency is upstream-reported for the image encoder, not measured by Stackr.',
      },
      stackrMeasurements: emptyStackrModelMeasurements(),
      onnxExportStatus: 'not_tested',
      quantisationStatus: 'not_tested',
      productionEligible: false,
      selectionStatus: 'blocked',
    },
    {
      modelId: 'mobileclip2_s2',
      displayName: 'Apple MobileCLIP2-S2',
      family: 'mobileclip',
      source: {
        name: 'Apple ml-mobileclip / Apple MobileCLIP2-S2',
        url: 'https://github.com/apple/ml-mobileclip',
        revision: null,
      },
      license: {
        name: 'Apple ML Research Model License',
        url: 'https://raw.githubusercontent.com/apple/ml-mobileclip/main/LICENSE_MODELS',
        status: 'research_only',
        notes: 'Included for benchmark comparison only; published weights are not production-approved for Stackr.',
      },
      input: {
        width: 224,
        height: 224,
        channels: 3,
        notes: 'Square CLIP-style image input; final Stackr crop policy still requires measurement.',
      },
      embeddingDimensions: null,
      parameterCount: 35_700_000,
      deploymentTargets: ['mobile', 'server'],
      preprocessing: {
        status: 'not_verified_in_stackr',
      },
      normalisation: {
        l2Normalised: true,
        status: 'not_verified_in_stackr',
      },
      upstreamReported: {
        modelSizeBytes: null,
        iosLatencyMs: 3.6,
        androidLatencyMs: null,
        serverCpuLatencyMs: null,
        peakMemoryMb: null,
        notes: 'Latency is upstream-reported for the image encoder, not measured by Stackr.',
      },
      stackrMeasurements: emptyStackrModelMeasurements(),
      onnxExportStatus: 'not_tested',
      quantisationStatus: 'not_tested',
      productionEligible: false,
      selectionStatus: 'blocked',
    },
    {
      modelId: 'dinov2_vits14',
      displayName: 'Meta DINOv2 ViT-S/14',
      family: 'dino',
      source: {
        name: 'facebookresearch/dinov2',
        url: 'https://github.com/facebookresearch/dinov2',
        revision: null,
      },
      license: {
        name: 'Apache License 2.0',
        url: 'https://raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE',
        status: 'production_allowed',
        notes: 'Production eligibility still requires Stackr-specific measurement, ONNX export validation and quantisation validation.',
      },
      input: {
        width: 224,
        height: 224,
        channels: 3,
        notes: 'DINOv2 ViT-S uses patch size 14; 224x224 produces a class token plus patch tokens.',
      },
      embeddingDimensions: 384,
      parameterCount: 21_000_000,
      deploymentTargets: ['server'],
      preprocessing: {
        status: 'not_verified_in_stackr',
      },
      normalisation: {
        l2Normalised: true,
        status: 'not_verified_in_stackr',
      },
      upstreamReported: {
        modelSizeBytes: null,
        iosLatencyMs: null,
        androidLatencyMs: null,
        serverCpuLatencyMs: null,
        peakMemoryMb: null,
        notes: 'No Stackr device or CPU latency has been measured yet.',
      },
      stackrMeasurements: emptyStackrModelMeasurements(),
      onnxExportStatus: 'not_tested',
      quantisationStatus: 'not_tested',
      productionEligible: true,
      selectionStatus: 'candidate',
    },
    {
      modelId: 'clip_vit_base_patch32_current_pack',
      displayName: 'Current Stackr CLIP reference-pack baseline',
      family: 'clip',
      source: {
        name: 'Existing Stackr scanner-pack baseline',
        url: 'backend/data/scanner-packs/en-clip-base-v1/manifest.json',
        revision: null,
      },
      license: {
        name: 'Needs review',
        url: '',
        status: 'needs_review',
        notes: 'Retained as the existing fallback/reference comparison. It must not define the new permanent Stackr index without licence and benchmark review.',
      },
      input: {
        width: 224,
        height: 224,
        channels: 3,
        notes: 'Existing pack metadata must be reconciled before production selection.',
      },
      embeddingDimensions: 512,
      parameterCount: null,
      deploymentTargets: ['server'],
      preprocessing: {
        status: 'existing_pack_needs_review',
      },
      normalisation: {
        l2Normalised: true,
        status: 'existing_pack_needs_review',
      },
      upstreamReported: {
        modelSizeBytes: null,
        iosLatencyMs: null,
        androidLatencyMs: null,
        serverCpuLatencyMs: null,
        peakMemoryMb: null,
        notes: 'Existing Stackr pack exists, but Stage 6 requires a reproducible benchmark before activation.',
      },
      stackrMeasurements: emptyStackrModelMeasurements(),
      onnxExportStatus: 'not_tested',
      quantisationStatus: 'not_tested',
      productionEligible: false,
      selectionStatus: 'blocked',
    },
    {
      modelId: 'stackr_embedding_v0_blocked',
      displayName: 'Stackr embedding V0 blocked training plan',
      family: 'stackr_metric_learning',
      source: {
        name: 'Stackr local embedding V0 guard',
        url: 'ml/models/stackr-embedding-v0/metrics.json',
        revision: null,
      },
      license: {
        name: 'Internal blocked artifact',
        url: '',
        status: 'rejected',
        notes: 'No approved training pixels or real phone captures exist, and no weights were produced.',
      },
      input: {
        width: 224,
        height: 320,
        channels: 3,
        notes: 'Portrait full-card training plan only; blocked before training.',
      },
      embeddingDimensions: 128,
      parameterCount: null,
      deploymentTargets: ['mobile', 'server'],
      preprocessing: {
        preservesFullCardRatio: true,
      },
      normalisation: {
        l2Normalised: true,
      },
      upstreamReported: {
        modelSizeBytes: null,
        iosLatencyMs: null,
        androidLatencyMs: null,
        serverCpuLatencyMs: null,
        peakMemoryMb: null,
        notes: 'Blocked local plan with no model weights.',
      },
      stackrMeasurements: emptyStackrModelMeasurements(),
      onnxExportStatus: 'blocked',
      quantisationStatus: 'blocked',
      productionEligible: false,
      selectionStatus: 'blocked',
    },
  ];

  return candidates.map((candidate) => withOverrides(candidate, overrides));
}

export function getMissingLanguages(summary: HardNegativeDatasetSummary): StackrRecognitionLanguage[] {
  const present = new Set(summary.languageDistribution.map((entry) => entry.key));
  return SUPPORTED_RECOGNITION_LANGUAGES.filter((language) => !present.has(language));
}

export function getDatasetBlockers(summary: HardNegativeDatasetSummary | null): string[] {
  if (!summary) return ['pilot_dataset_missing'];

  const blockers: string[] = [];
  if (summary.rowCount <= 0 || summary.classCount <= 0) blockers.push('pilot_dataset_empty');
  if (summary.approvedTrainingPixelSourceCount <= 0) blockers.push('no_approved_training_pixels');
  if (summary.realPhoneCaptureSourceCount <= 0 && (summary.realPhoneTestSourceCount ?? 0) <= 0) {
    blockers.push('no_real_phone_test_captures');
  }
  if (summary.duplicateAnalysis.sourceLeakageExists) blockers.push('source_leakage_detected');
  if (summary.duplicateAnalysis.physicalCardSessionLeakageExists) blockers.push('physical_card_session_leakage_detected');
  for (const split of ['train', 'validation', 'test']) {
    if (!summary.splitDistribution.some((entry) => entry.key === split && entry.count > 0)) {
      blockers.push(`missing_${split}_split`);
    }
  }
  for (const language of getMissingLanguages(summary)) {
    blockers.push(`missing_${language}_benchmark_coverage`);
  }
  if (summary.hardNegativeCoverage.represented <= 0) blockers.push('no_represented_hard_negative_groups');
  return blockers;
}

export function getMissingMetrics(candidate: ModelCandidate): BenchmarkMetricKey[] {
  return REQUIRED_PRODUCTION_METRICS.filter((metric) => candidate.stackrMeasurements[metric] === null);
}

function scoreMetric(metric: BenchmarkMetricKey, value: number): number {
  if (LOWER_IS_BETTER.has(metric)) {
    const target = TARGETS[metric] ?? 1;
    return 1 / (1 + Math.max(value, 0) / target);
  }
  if (metric === 'quantizedTop1Delta') {
    return Math.max(0, 1 - Math.abs(value) / 0.08);
  }
  return Math.max(0, Math.min(1, value));
}

export function scoreModelCandidate(candidate: ModelCandidate): number | null {
  const missing = getMissingMetrics(candidate);
  if (missing.length > 0) return null;
  if (!candidate.productionEligible) return null;
  if (candidate.license.status !== 'production_allowed') return null;
  if (candidate.onnxExportStatus !== 'compatible') return null;
  if (candidate.quantisationStatus !== 'accepted') return null;

  return REQUIRED_PRODUCTION_METRICS.reduce((total, metric) => {
    const value = candidate.stackrMeasurements[metric];
    if (value === null) return total;
    return total + (STACKR_MODEL_SELECTION_WEIGHTS[metric] * scoreMetric(metric, value));
  }, 0);
}

export function getCandidateBlockers(candidate: ModelCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.productionEligible) blockers.push('model_not_production_eligible');
  if (candidate.license.status !== 'production_allowed') blockers.push(`license_${candidate.license.status}`);
  if (candidate.embeddingDimensions === null) blockers.push('embedding_dimension_unknown');
  if (candidate.onnxExportStatus !== 'compatible') blockers.push(`onnx_${candidate.onnxExportStatus}`);
  if (candidate.quantisationStatus !== 'accepted') blockers.push(`quantisation_${candidate.quantisationStatus}`);
  const missingMetrics = getMissingMetrics(candidate);
  if (missingMetrics.length > 0) blockers.push('required_stackr_measurements_missing');
  return blockers;
}

function buildCandidateDecisions(candidates: ModelCandidate[]): CandidateDecision[] {
  const decisions: CandidateDecision[] = candidates.map((candidate) => ({
    modelId: candidate.modelId,
    displayName: candidate.displayName,
    productionEligible: candidate.productionEligible,
    blockers: getCandidateBlockers(candidate),
    missingMetrics: getMissingMetrics(candidate),
    weightedScore: scoreModelCandidate(candidate),
    rank: null,
    decision: 'blocked',
  }));

  const ranked = decisions
    .filter((decision) => decision.weightedScore !== null && decision.blockers.length === 0)
    .sort((a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0));

  ranked.forEach((decision, index) => {
    decision.rank = index + 1;
    decision.decision = index === 0 ? 'selected' : 'not_selected';
  });

  return decisions;
}

export function buildModelBenchmarkRun(input: {
  summary: HardNegativeDatasetSummary | null;
  datasetManifestSha256: string;
  sourceCommitHash: string;
  sourceTreeDirty: boolean;
  generatedAt?: string;
  measurementOverrides?: ModelMeasurementOverrides;
}): ModelBenchmarkRun {
  const candidates = createModelCandidates(input.measurementOverrides);
  const datasetBlockers = getDatasetBlockers(input.summary);
  const candidateDecisions = buildCandidateDecisions(candidates);
  const selectedDecision = candidateDecisions.find((decision) => decision.decision === 'selected') ?? null;
  const selectedCandidate = selectedDecision
    ? candidates.find((candidate) => candidate.modelId === selectedDecision.modelId) ?? null
    : null;

  const modelBlockers = selectedDecision
    ? []
    : ['no_production_model_selected_by_weighted_benchmark'];
  const blockers = [...datasetBlockers, ...modelBlockers];
  const status = blockers.length > 0 ? 'blocked' : 'complete';

  return {
    benchmarkVersion: STACKR_MODEL_BENCHMARK_VERSION,
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    datasetVersion: input.summary?.datasetVersion ?? null,
    datasetManifestSha256: input.datasetManifestSha256,
    sourceCommitHash: input.sourceCommitHash,
    sourceTreeDirty: input.sourceTreeDirty,
    supportedLanguages: [...SUPPORTED_RECOGNITION_LANGUAGES],
    dataCoverage: {
      rowCount: input.summary?.rowCount ?? 0,
      classCount: input.summary?.classCount ?? 0,
      sourceImageCount: input.summary?.sourceImageCount ?? 0,
      syntheticViewRowCount: input.summary?.syntheticViewRowCount ?? 0,
      realPhoneCaptureSourceCount: input.summary?.realPhoneCaptureSourceCount ?? 0,
      realPhoneTestSourceCount: input.summary?.realPhoneTestSourceCount ?? 0,
      approvedTrainingPixelSourceCount: input.summary?.approvedTrainingPixelSourceCount ?? 0,
      languageDistribution: input.summary?.languageDistribution ?? [],
      missingLanguages: input.summary ? getMissingLanguages(input.summary) : [...SUPPORTED_RECOGNITION_LANGUAGES],
      hardNegativeCoverage: input.summary?.hardNegativeCoverage ?? { represented: 0, blocked: 0, total: 0 },
    },
    leakageReport: {
      sourceLeakageExists: input.summary?.duplicateAnalysis.sourceLeakageExists ?? false,
      physicalCardSessionLeakageExists: input.summary?.duplicateAnalysis.physicalCardSessionLeakageExists ?? false,
      modelSelectionAndFinalTestSeparated: false,
      queryImagesAreExcludedFromIndexedReferences: false,
      notes: [
        'The current pilot manifest records split metadata but does not yet provide approved real-phone captures for a protected final test.',
        'Synthetic augmentations may supplement benchmark coverage but cannot be counted as real-camera validation.',
      ],
    },
    selectionWeights: { ...STACKR_MODEL_SELECTION_WEIGHTS },
    candidates,
    candidateDecisions,
    selectedModelId: selectedCandidate?.modelId ?? null,
    selectedEmbeddingDimensions: selectedCandidate?.embeddingDimensions ?? null,
    selectionReason: selectedCandidate
      ? `Selected by weighted benchmark score ${selectedDecision?.weightedScore?.toFixed(4)}.`
      : 'No active model selected: required Stackr measurements, legal production eligibility, ONNX compatibility, quantisation acceptance and dataset coverage are incomplete.',
    blockers,
    acceptanceCriteria: [
      'At least one production-eligible model has complete Stackr-measured metrics for mobile, server and retrieval quality.',
      'Model-selection and protected final-test splits are separated by physical card session.',
      'Query images are not also indexed as reference images for the same evaluation.',
      'English, Japanese, Simplified Chinese, Traditional Chinese and Korean benchmark cases are represented.',
      'The selected model has verified ONNX or ORT export, checksum, preprocessing and normalisation metadata.',
      'The quantised variant does not exceed the accepted retrieval-quality loss threshold.',
      'A complete embedding index is validated before atomic activation.',
    ],
  };
}

export function buildEmbeddingIndexRegenerationPlan(input: {
  benchmarkRun: ModelBenchmarkRun;
  scope: EmbeddingIndexRegenerationScope;
  generatedAt?: string;
  modelId?: string | null;
  indexVersion?: string | null;
  shouldActivate?: boolean;
}): EmbeddingIndexRegenerationPlan {
  const modelId = input.modelId ?? input.benchmarkRun.selectedModelId;
  const indexVersion = input.indexVersion ?? (
    modelId ? `${modelId}-${input.benchmarkRun.benchmarkVersion}` : null
  );
  const blockedReasons: string[] = [];

  if (!modelId) blockedReasons.push('no_selected_model');
  if (!input.benchmarkRun.selectedEmbeddingDimensions) blockedReasons.push('no_selected_embedding_dimension');
  if (input.benchmarkRun.status !== 'complete') blockedReasons.push('benchmark_not_complete');
  if (input.shouldActivate) blockedReasons.push('activation_requires_validated_complete_index');
  if (input.scope.scopeType !== 'full' && !input.scope.scopeValue) {
    blockedReasons.push('scope_value_required');
  }

  const jobKeyPayload = [
    STACKR_EMBEDDING_INDEX_COMMAND_VERSION,
    modelId ?? 'no-model',
    indexVersion ?? 'no-index',
    input.scope.scopeType,
    input.scope.scopeValue ?? 'all',
  ].join('|');

  return {
    commandVersion: STACKR_EMBEDDING_INDEX_COMMAND_VERSION,
    status: blockedReasons.length ? 'blocked' : 'ready',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    scope: input.scope,
    modelId,
    indexVersion,
    jobKey: createHash('sha256').update(jobKeyPayload).digest('hex'),
    shouldActivate: Boolean(input.shouldActivate),
    blockedReasons,
    steps: [
      'Load selected model registry entry and verify checksum, licence, preprocessing and embedding dimensions.',
      'Enumerate authorised catalogue reference assets for the requested scope.',
      'Skip already completed embeddings whose source image checksum and preprocessing checksum match.',
      'Generate missing embeddings into the inactive dimension-specific vector table.',
      'Build or refresh the HNSW index for that inactive index version.',
      'Run completeness and nearest-neighbour health checks with over-fetch before metadata reranking.',
      'Activate only through ml.activate_embedding_index_version after validation passes.',
    ],
  };
}
