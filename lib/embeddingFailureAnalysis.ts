export const STACKR_EMBEDDING_FAILURE_ANALYSIS_VERSION = 'stackr-embedding-failure-analysis-v1.0.0';

export const EMBEDDING_FAILURE_CATEGORIES = [
  'crop_failure',
  'blur',
  'glare',
  'sleeve',
  'binder_pocket',
  'same_artwork',
  'wrong_language',
  'wrong_set',
  'wrong_collector_number',
  'wrong_variant',
  'promo_stamp',
  'reverse_holo',
  'low_resolution_reference',
  'catalogue_error',
  'ocr_conflict',
  'unknown_card',
  'model_confusion',
] as const;

export type EmbeddingFailureCategory = (typeof EMBEDDING_FAILURE_CATEGORIES)[number];

export const EMBEDDING_DEVELOPMENT_TARGETS = {
  acceptedResultPrecision: 0.99,
  falseAutomaticAcceptRateMax: 0.005,
  top3Retrieval: 0.99,
  exactVariantAccuracyReportedSeparately: true,
  unknownCardsRejectedInsteadOfNearestKnown: true,
} as const;

export type EmbeddingFailureAnalysisBlocker =
  | 'v0_model_blocked'
  | 'v0_checkpoint_has_no_weights'
  | 'no_selected_v0_baseline'
  | 'no_embedding_vectors'
  | 'no_measured_failures'
  | 'no_approved_training_pixels'
  | 'no_real_phone_test_captures'
  | 'protected_test_metrics_missing';

type NullableMetric = number | null;

export type EmbeddingModelMetrics = {
  top1: NullableMetric;
  top3: NullableMetric;
  meanReciprocalRank: NullableMetric;
  acceptedResultPrecision: NullableMetric;
  falseAutomaticAcceptRate: NullableMetric;
  hardNegativeAccuracy: NullableMetric;
  languageAccuracy: NullableMetric;
  sameArtReprintAccuracy: NullableMetric;
  exactVariantAccuracy: NullableMetric;
  unknownRejectAccuracy: NullableMetric;
};

export type EmbeddingV0RunMetrics = {
  status?: string;
  blockers?: string[];
  datasetManifestSha256?: string;
  datasetVersion?: string | null;
  selectedBaseline?: string | null;
  selectionReason?: string;
  protectedTestSet?: {
    available?: boolean;
    rowCount?: number;
    hasRealPhoneCaptures?: boolean;
  };
  baselines?: Array<{
    id: string;
    status?: string;
    metrics?: Record<string, number | null>;
  }>;
};

export type HardNegativePayload = {
  summary: {
    hardNegativeCoverage: {
      represented: number;
      blocked: number;
      total: number;
    };
    limitations?: string[];
  };
  groups: Array<{
    groupId: string;
    type: string;
    status: 'represented' | 'blocked_no_approved_source';
    difficulty: 'hard' | 'near_identical';
    members: Array<{
      sourceImageId: string;
      cardId: string;
      cardName: string;
      setId: string;
      language: string;
      collectorNumber: string;
      variant: string;
    }>;
    reason: string;
    notes: string;
  }>;
};

export type ConfusionGroupReport = {
  groupId: string;
  type: string;
  sourceStatus: 'represented' | 'blocked_no_approved_source';
  measured: false;
  categories: EmbeddingFailureCategory[];
  difficulty: 'hard' | 'near_identical';
  members: HardNegativePayload['groups'][number]['members'];
  miningDecision:
    | 'candidate_when_approved_pixels_exist'
    | 'blocked_until_approved_source_pair_exists';
  protectedTestHandling: 'not_added_to_training_batches';
  reason: string;
  notes: string;
};

export type FailureCategorySummary = Record<EmbeddingFailureCategory, {
  measuredFailureCount: number;
  candidateConfusionGroupCount: number;
}>;

export type EmbeddingFailureAnalysisReport = {
  analysisVersion: typeof STACKR_EMBEDDING_FAILURE_ANALYSIS_VERSION;
  status: 'blocked' | 'complete';
  generatedAt: string;
  blockers: EmbeddingFailureAnalysisBlocker[];
  datasetManifestSha256: string | null;
  datasetVersion: string | null;
  protectedTestSet: {
    sharedEvaluationData: boolean;
    rowCount: number;
    hasRealPhoneCaptures: boolean;
  };
  developmentTargets: typeof EMBEDDING_DEVELOPMENT_TARGETS;
  v0: {
    status: string;
    selectedBaseline: string | null;
    metrics: EmbeddingModelMetrics;
  };
  v1: {
    status: 'not_advanced';
    selectedBaseline: null;
    metrics: EmbeddingModelMetrics;
    reason: string;
  };
  retrievalVersusAcceptance: {
    retrievalMetricsMeasured: boolean;
    acceptedMatchPrecisionMeasured: boolean;
    note: string;
  };
  unknownCardPolicy: {
    evaluated: boolean;
    modelAdvanced: false;
    reason: string;
  };
  failureCategorySummary: FailureCategorySummary;
  measuredFailures: [];
  topNeighbourVisualReports: [];
  confusionGroups: ConfusionGroupReport[];
};

function emptyModelMetrics(): EmbeddingModelMetrics {
  return {
    top1: null,
    top3: null,
    meanReciprocalRank: null,
    acceptedResultPrecision: null,
    falseAutomaticAcceptRate: null,
    hardNegativeAccuracy: null,
    languageAccuracy: null,
    sameArtReprintAccuracy: null,
    exactVariantAccuracy: null,
    unknownRejectAccuracy: null,
  };
}

function emptyFailureCategorySummary(): FailureCategorySummary {
  return EMBEDDING_FAILURE_CATEGORIES.reduce((summary, category) => {
    summary[category] = {
      measuredFailureCount: 0,
      candidateConfusionGroupCount: 0,
    };
    return summary;
  }, {} as FailureCategorySummary);
}

export function categoriesForHardNegativeType(type: string): EmbeddingFailureCategory[] {
  switch (type) {
    case 'identical_artwork_different_set':
      return ['same_artwork', 'wrong_set', 'model_confusion'];
    case 'identical_artwork_different_language':
      return ['same_artwork', 'wrong_language', 'model_confusion'];
    case 'standard_versus_reverse_holo':
      return ['wrong_variant', 'reverse_holo', 'model_confusion'];
    case 'stamped_versus_unstamped':
      return ['wrong_variant', 'promo_stamp', 'model_confusion'];
    case 'first_edition_versus_unlimited':
      return ['wrong_variant', 'model_confusion'];
    case 'promo_versus_set_release':
      return ['promo_stamp', 'wrong_set', 'wrong_variant', 'model_confusion'];
    case 'same_collector_number_different_set':
      return ['wrong_collector_number', 'wrong_set', 'ocr_conflict', 'model_confusion'];
    case 'same_pokemon_different_artwork':
    case 'similar_full_art_layouts':
      return ['model_confusion'];
    case 'poke_ball_versus_master_ball_patterns':
      return ['wrong_variant', 'model_confusion'];
    default:
      return ['model_confusion'];
  }
}

function uniqueCategories(categories: EmbeddingFailureCategory[]) {
  return [...new Set(categories)];
}

export function buildConfusionGroups(payload: HardNegativePayload | null): ConfusionGroupReport[] {
  if (!payload) return [];
  return payload.groups.map((group) => ({
    groupId: group.groupId,
    type: group.type,
    sourceStatus: group.status,
    measured: false,
    categories: uniqueCategories(categoriesForHardNegativeType(group.type)),
    difficulty: group.difficulty,
    members: group.members,
    miningDecision: group.status === 'represented'
      ? 'candidate_when_approved_pixels_exist'
      : 'blocked_until_approved_source_pair_exists',
    protectedTestHandling: 'not_added_to_training_batches',
    reason: group.reason,
    notes: group.notes,
  }));
}

function buildBlockers(v0: EmbeddingV0RunMetrics | null): EmbeddingFailureAnalysisBlocker[] {
  const blockers: EmbeddingFailureAnalysisBlocker[] = [];
  if (!v0 || v0.status === 'blocked') blockers.push('v0_model_blocked');
  if (!v0?.selectedBaseline) blockers.push('no_selected_v0_baseline');
  if (v0?.blockers?.includes('no_approved_training_pixels')) blockers.push('no_approved_training_pixels');
  if (v0?.blockers?.includes('no_real_phone_test_captures')) blockers.push('no_real_phone_test_captures');
  blockers.push('v0_checkpoint_has_no_weights');
  blockers.push('no_embedding_vectors');
  blockers.push('no_measured_failures');
  blockers.push('protected_test_metrics_missing');
  return [...new Set(blockers)];
}

function summarizeCategories(confusionGroups: ConfusionGroupReport[]) {
  const summary = emptyFailureCategorySummary();
  confusionGroups.forEach((group) => {
    group.categories.forEach((category) => {
      summary[category].candidateConfusionGroupCount += 1;
    });
  });
  return summary;
}

export function buildEmbeddingFailureAnalysisReport({
  v0,
  hardNegatives,
  generatedAt = new Date().toISOString(),
}: {
  v0: EmbeddingV0RunMetrics | null;
  hardNegatives: HardNegativePayload | null;
  generatedAt?: string;
}): EmbeddingFailureAnalysisReport {
  const confusionGroups = buildConfusionGroups(hardNegatives);
  const blockers = buildBlockers(v0);
  const protectedTestRowCount = Number(v0?.protectedTestSet?.rowCount ?? 0);

  return {
    analysisVersion: STACKR_EMBEDDING_FAILURE_ANALYSIS_VERSION,
    status: blockers.length ? 'blocked' : 'complete',
    generatedAt,
    blockers,
    datasetManifestSha256: v0?.datasetManifestSha256 ?? null,
    datasetVersion: v0?.datasetVersion ?? null,
    protectedTestSet: {
      sharedEvaluationData: Boolean(v0?.protectedTestSet?.available),
      rowCount: protectedTestRowCount,
      hasRealPhoneCaptures: Boolean(v0?.protectedTestSet?.hasRealPhoneCaptures),
    },
    developmentTargets: EMBEDDING_DEVELOPMENT_TARGETS,
    v0: {
      status: v0?.status ?? 'missing',
      selectedBaseline: v0?.selectedBaseline ?? null,
      metrics: emptyModelMetrics(),
    },
    v1: {
      status: 'not_advanced',
      selectedBaseline: null,
      metrics: emptyModelMetrics(),
      reason: 'V1 was not trained because V0 has no approved-pixel checkpoint or measured nearest-neighbour failures to mine.',
    },
    retrievalVersusAcceptance: {
      retrievalMetricsMeasured: false,
      acceptedMatchPrecisionMeasured: false,
      note: 'Retrieval accuracy and accepted-match precision are intentionally separate, but neither was measured because no embedding vectors exist.',
    },
    unknownCardPolicy: {
      evaluated: false,
      modelAdvanced: false,
      reason: 'Unknown-card rejection was not evaluated; model advancement is blocked until confidently-misidentified unknowns can be measured and rejected.',
    },
    failureCategorySummary: summarizeCategories(confusionGroups),
    measuredFailures: [],
    topNeighbourVisualReports: [],
    confusionGroups,
  };
}
