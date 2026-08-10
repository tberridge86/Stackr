export const STACKR_EMBEDDING_V0_MODEL_VERSION = 'stackr-embedding-v0.0.0-blocked';
export const STACKR_EMBEDDING_V0_CONFIG_VERSION = 'stackr-embedding-training-config-v1.0.0';
export const STACKR_EMBEDDING_V0_RANDOM_SEED = 12012;

export type PilotDatasetSummary = {
  datasetVersion: string;
  rowCount: number;
  classCount: number;
  sourceImageCount: number;
  syntheticViewRowCount: number;
  realPhoneCaptureSourceCount: number;
  approvedTrainingPixelSourceCount: number;
  splitDistribution: Array<{ key: string; count: number }>;
  duplicateAnalysis: {
    sourceLeakageExists: boolean;
  };
  hardNegativeCoverage: {
    represented: number;
    blocked: number;
    total: number;
  };
  limitations: string[];
};

export type EmbeddingV0TrainingBlocker =
  | 'pilot_dataset_missing'
  | 'pilot_dataset_empty'
  | 'too_few_classes'
  | 'no_approved_training_pixels'
  | 'no_real_phone_test_captures'
  | 'source_leakage_detected'
  | 'missing_train_split'
  | 'missing_validation_split'
  | 'missing_test_split'
  | 'no_represented_hard_negatives';

export type EmbeddingV0BaselineId =
  | 'supervised_contrastive_mobilenetv3_small'
  | 'multi_similarity_mobilenetv3_small'
  | 'non_neural_perceptual_hash_local_features';

export type EmbeddingV0MetricValue = number | null;

export type EmbeddingV0BaselineMetrics = {
  trainingLoss: EmbeddingV0MetricValue;
  validationRetrievalAccuracy: EmbeddingV0MetricValue;
  top1: EmbeddingV0MetricValue;
  top3: EmbeddingV0MetricValue;
  meanReciprocalRank: EmbeddingV0MetricValue;
  hardNegativeAccuracy: EmbeddingV0MetricValue;
  languageAccuracy: EmbeddingV0MetricValue;
  sameArtReprintAccuracy: EmbeddingV0MetricValue;
  exactVariantAccuracy: EmbeddingV0MetricValue;
  positiveDistanceMean: EmbeddingV0MetricValue;
  negativeDistanceMean: EmbeddingV0MetricValue;
  hardNegativeDistanceMean: EmbeddingV0MetricValue;
  modelSizeBytes: EmbeddingV0MetricValue;
  desktopInferenceMsP50: EmbeddingV0MetricValue;
  desktopInferenceMsP95: EmbeddingV0MetricValue;
};

export type EmbeddingV0BaselinePlan = {
  id: EmbeddingV0BaselineId;
  label: string;
  family: 'neural_metric_learning' | 'non_neural_visual';
  architecture: string;
  objective: string;
  hardNegativeSampling: boolean;
  pretrainedInitialisation: {
    used: boolean;
    provenanceReviewed: boolean;
    source: string | null;
    notes: string;
  };
  status: 'blocked' | 'not_started';
  metrics: EmbeddingV0BaselineMetrics;
};

export type EmbeddingV0TrainingConfig = {
  configVersion: typeof STACKR_EMBEDDING_V0_CONFIG_VERSION;
  modelVersion: typeof STACKR_EMBEDDING_V0_MODEL_VERSION;
  randomSeed: typeof STACKR_EMBEDDING_V0_RANDOM_SEED;
  deterministic: boolean;
  input: {
    width: 224;
    height: 320;
    preservesFullCardRatio: true;
    colorSpace: 'rgb';
  };
  embedding: {
    dimensions: 128;
    l2Normalised: true;
  };
  backbone: {
    name: 'MobileNetV3 Small';
    pretrainedWeights: 'none';
    provenanceStatus: 'not_reviewed_for_external_weights';
  };
  optimisation: {
    maxEpochs: number;
    batchSize: number;
    learningRate: number;
    weightDecay: number;
  };
  baselinesCompared: EmbeddingV0BaselineId[];
};

export type EmbeddingV0TrainingRun = {
  status: 'blocked' | 'ready_to_train';
  blockers: EmbeddingV0TrainingBlocker[];
  datasetManifestSha256: string;
  datasetVersion: string | null;
  sourceCommitHash: string;
  sourceTreeDirty: boolean;
  generatedAt: string;
  config: EmbeddingV0TrainingConfig;
  baselines: EmbeddingV0BaselinePlan[];
  selectedBaseline: EmbeddingV0BaselineId | null;
  selectionReason: string;
  protectedTestSet: {
    available: boolean;
    rowCount: number;
    hasRealPhoneCaptures: boolean;
  };
  hardNegativeCoverage: {
    represented: number;
    blocked: number;
    total: number;
  };
};

export function createEmbeddingV0TrainingConfig(): EmbeddingV0TrainingConfig {
  return {
    configVersion: STACKR_EMBEDDING_V0_CONFIG_VERSION,
    modelVersion: STACKR_EMBEDDING_V0_MODEL_VERSION,
    randomSeed: STACKR_EMBEDDING_V0_RANDOM_SEED,
    deterministic: true,
    input: {
      width: 224,
      height: 320,
      preservesFullCardRatio: true,
      colorSpace: 'rgb',
    },
    embedding: {
      dimensions: 128,
      l2Normalised: true,
    },
    backbone: {
      name: 'MobileNetV3 Small',
      pretrainedWeights: 'none',
      provenanceStatus: 'not_reviewed_for_external_weights',
    },
    optimisation: {
      maxEpochs: 80,
      batchSize: 64,
      learningRate: 0.0003,
      weightDecay: 0.00004,
    },
    baselinesCompared: [
      'supervised_contrastive_mobilenetv3_small',
      'multi_similarity_mobilenetv3_small',
      'non_neural_perceptual_hash_local_features',
    ],
  };
}

function emptyMetrics(): EmbeddingV0BaselineMetrics {
  return {
    trainingLoss: null,
    validationRetrievalAccuracy: null,
    top1: null,
    top3: null,
    meanReciprocalRank: null,
    hardNegativeAccuracy: null,
    languageAccuracy: null,
    sameArtReprintAccuracy: null,
    exactVariantAccuracy: null,
    positiveDistanceMean: null,
    negativeDistanceMean: null,
    hardNegativeDistanceMean: null,
    modelSizeBytes: null,
    desktopInferenceMsP50: null,
    desktopInferenceMsP95: null,
  };
}

export function createEmbeddingV0Baselines(status: 'blocked' | 'not_started'): EmbeddingV0BaselinePlan[] {
  return [
    {
      id: 'supervised_contrastive_mobilenetv3_small',
      label: 'A. Supervised contrastive MobileNetV3 Small',
      family: 'neural_metric_learning',
      architecture: 'MobileNetV3 Small backbone, 224x320 portrait input, 128-dimensional L2-normalised embedding head.',
      objective: 'Supervised contrastive metric-learning objective with class-aware batches.',
      hardNegativeSampling: true,
      pretrainedInitialisation: {
        used: false,
        provenanceReviewed: false,
        source: null,
        notes: 'External pretrained weights were not used because model-weight provenance has not been reviewed for this task.',
      },
      status,
      metrics: emptyMetrics(),
    },
    {
      id: 'multi_similarity_mobilenetv3_small',
      label: 'B. Multi-similarity MobileNetV3 Small',
      family: 'neural_metric_learning',
      architecture: 'MobileNetV3 Small backbone, 224x320 portrait input, 128-dimensional L2-normalised embedding head.',
      objective: 'Multi-similarity metric-learning objective with hard-negative mining.',
      hardNegativeSampling: true,
      pretrainedInitialisation: {
        used: false,
        provenanceReviewed: false,
        source: null,
        notes: 'External pretrained weights were not used because model-weight provenance has not been reviewed for this task.',
      },
      status,
      metrics: emptyMetrics(),
    },
    {
      id: 'non_neural_perceptual_hash_local_features',
      label: 'C. Perceptual hash plus local-feature matching',
      family: 'non_neural_visual',
      architecture: 'Portrait-preserving 224x320 preprocessing, perceptual hashes, edge/color histograms and local feature agreement.',
      objective: 'Nearest-neighbour retrieval over non-neural visual descriptors.',
      hardNegativeSampling: true,
      pretrainedInitialisation: {
        used: false,
        provenanceReviewed: true,
        source: null,
        notes: 'No pretrained weights are involved in this baseline.',
      },
      status,
      metrics: emptyMetrics(),
    },
  ];
}

function countSplit(summary: PilotDatasetSummary | null, split: 'train' | 'validation' | 'test') {
  return summary?.splitDistribution.find((row) => row.key === split)?.count ?? 0;
}

export function getEmbeddingV0TrainingBlockers(
  summary: PilotDatasetSummary | null
): EmbeddingV0TrainingBlocker[] {
  if (!summary) return ['pilot_dataset_missing'];

  const blockers: EmbeddingV0TrainingBlocker[] = [];
  if (summary.rowCount <= 0) blockers.push('pilot_dataset_empty');
  if (summary.classCount < 2) blockers.push('too_few_classes');
  if (summary.approvedTrainingPixelSourceCount <= 0) blockers.push('no_approved_training_pixels');
  if (summary.realPhoneCaptureSourceCount <= 0) blockers.push('no_real_phone_test_captures');
  if (summary.duplicateAnalysis.sourceLeakageExists) blockers.push('source_leakage_detected');
  if (countSplit(summary, 'train') <= 0) blockers.push('missing_train_split');
  if (countSplit(summary, 'validation') <= 0) blockers.push('missing_validation_split');
  if (countSplit(summary, 'test') <= 0) blockers.push('missing_test_split');
  if (summary.hardNegativeCoverage.represented <= 0) blockers.push('no_represented_hard_negatives');
  return blockers;
}

export function buildEmbeddingV0TrainingRun({
  summary,
  datasetManifestSha256,
  sourceCommitHash,
  sourceTreeDirty,
  generatedAt = new Date().toISOString(),
}: {
  summary: PilotDatasetSummary | null;
  datasetManifestSha256: string;
  sourceCommitHash: string;
  sourceTreeDirty: boolean;
  generatedAt?: string;
}): EmbeddingV0TrainingRun {
  const blockers = getEmbeddingV0TrainingBlockers(summary);
  const status = blockers.length ? 'blocked' : 'ready_to_train';
  const testRows = countSplit(summary, 'test');
  const baselines = createEmbeddingV0Baselines(status === 'blocked' ? 'blocked' : 'not_started');

  return {
    status,
    blockers,
    datasetManifestSha256,
    datasetVersion: summary?.datasetVersion ?? null,
    sourceCommitHash,
    sourceTreeDirty,
    generatedAt,
    config: createEmbeddingV0TrainingConfig(),
    baselines,
    selectedBaseline: null,
    selectionReason: status === 'blocked'
      ? 'No winning baseline was selected because training and retrieval evaluation were blocked before image pixels could be loaded.'
      : 'Baselines are ready to run once an approved trainer executes the configured comparisons.',
    protectedTestSet: {
      available: testRows > 0 && !summary?.duplicateAnalysis.sourceLeakageExists,
      rowCount: testRows,
      hasRealPhoneCaptures: Boolean(summary && summary.realPhoneCaptureSourceCount > 0),
    },
    hardNegativeCoverage: {
      represented: summary?.hardNegativeCoverage.represented ?? 0,
      blocked: summary?.hardNegativeCoverage.blocked ?? 0,
      total: summary?.hardNegativeCoverage.total ?? 0,
    },
  };
}
