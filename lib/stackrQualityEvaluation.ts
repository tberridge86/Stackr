export const STACKR_QUALITY_SCHEMA_VERSION = 'stackr-quality-evaluation-v1.0.0';
export const STACKR_RELEASE_GATE_VERSION = 'stackr-release-gates-v1.0.0';

export const QUALITY_LANGUAGES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'] as const;
export const QUALITY_CAPTURE_CONDITIONS = [
  'clean',
  'glare',
  'blur',
  'perspective_distortion',
  'partial_crop',
  'duplicate_artwork',
] as const;

export type QualityLanguage = typeof QUALITY_LANGUAGES[number];
export type QualitySplit = 'model_selection' | 'final_test' | 'no_match_test';
export type QualitySourceKind = 'real_capture' | 'synthetic_supplement';
export type QualityItemType = 'raw_card' | 'sleeved_card' | 'binder_capture' | 'slab';
export type QualityCaptureCondition = typeof QUALITY_CAPTURE_CONDITIONS[number];
export type QualityGateStatus = 'pass' | 'fail' | 'insufficient_data' | 'not_applicable';

export type GoldTestCase = {
  caseId: string;
  imageId: string;
  physicalCardId: string;
  captureSessionId: string;
  split: QualitySplit;
  sourceKind: QualitySourceKind;
  authorizedForEvaluation: boolean;
  labelStatus: 'reviewed' | 'verified';
  expectedMatch: boolean;
  canonicalCardId: string | null;
  variantId: string | null;
  finishCode: string | null;
  language: QualityLanguage;
  era: 'modern' | 'vintage' | 'unknown';
  itemType: QualityItemType;
  captureConditions: QualityCaptureCondition[];
  finishClass: 'normal' | 'parallel' | 'unknown';
  valueTier: 'common' | 'high_value' | 'unknown';
  artworkGroupId: string | null;
};

export type QualityEvidencePolicy = {
  policyVersion: string;
  approved: boolean;
  approvedBy: string | null;
  minimumMetricDenominators: Partial<Record<QualityGateKey, number>>;
};

export type GoldTestSetManifest = {
  schemaVersion: typeof STACKR_QUALITY_SCHEMA_VERSION;
  datasetKey: string;
  status: 'draft' | 'locked';
  generatedAt: string;
  evidencePolicy: QualityEvidencePolicy;
  cases: GoldTestCase[];
  limitations: string[];
};

export type RecognitionCandidate = {
  canonicalCardId: string | null;
  variantId: string | null;
  finishCode: string | null;
};

export type QualityObservation = {
  caseId: string;
  candidates: RecognitionCandidate[];
  matchStatus: 'exact' | 'probable' | 'ambiguous' | 'no_match' | 'rejected' | 'error';
  autoConfirmed: boolean;
  confidence: number | null;
  calibratedThreshold: number | null;
  manualCorrection: boolean;
  ximilarFallbackUsed: boolean;
  imageUploadUsed: boolean;
  totalLatencyMs: number | null;
  modelVersion: string | null;
  indexVersion: string | null;
};

export type PerformanceRouteClass =
  | 'catalogue_read'
  | 'structured_search'
  | 'recognition_embedding'
  | 'image_fallback';

export type PerformanceObservation = {
  routeClass: PerformanceRouteClass;
  durationMs: number;
  cacheStatus?: 'HIT' | 'MISS' | 'STALE' | 'BYPASS' | 'NONE';
  warm?: boolean;
  statusCode: number;
};

export type RatioMetric = {
  value: number | null;
  numerator: number;
  denominator: number;
  unit: 'ratio';
};

export type LatencyMetric = {
  value: number | null;
  sampleCount: number;
  unit: 'ms';
};

export type QualityMetricKey =
  | 'top1Accuracy'
  | 'top3Accuracy'
  | 'top5Accuracy'
  | 'autoConfirmPrecision'
  | 'ambiguousResultRate'
  | 'falseAcceptRate'
  | 'noMatchAccuracy'
  | 'variantAccuracy'
  | 'finishAccuracy'
  | 'manualCorrectionRate'
  | 'ximilarFallbackRate'
  | 'resolvedWithoutImageUploadRate';

export type QualityGateKey =
  | 'cached_catalogue_p95_ms'
  | 'structured_search_p95_ms'
  | 'recognition_embedding_p95_ms'
  | 'warm_image_fallback_p95_ms'
  | 'auto_confirm_precision'
  | 'real_world_top5_accuracy'
  | 'auto_confirm_below_threshold';

export type ReleaseGate = {
  key: QualityGateKey;
  label: string;
  targetOperator: 'lte' | 'gte' | 'zero';
  targetValue: number;
  actualValue: number | null;
  unit: 'ms' | 'ratio' | 'count';
  evidenceCount: number;
  status: QualityGateStatus;
  reason: string;
};

export type QualityEvidenceCounts = {
  physicalCards: number;
  variants: number;
  images: number;
  captureSessions: number;
  realImages: number;
  syntheticImages: number;
  finalTestImages: number;
  noMatchImages: number;
};

export type LeakageReport = {
  physicalCardLeakage: boolean;
  captureSessionLeakage: boolean;
  leakedPhysicalCardIds: string[];
  leakedCaptureSessionIds: string[];
};

export type StrataCoverage = {
  required: Record<string, number>;
  missing: string[];
};

export type StackrQualityReport = {
  schemaVersion: typeof STACKR_QUALITY_SCHEMA_VERSION;
  releaseGateVersion: typeof STACKR_RELEASE_GATE_VERSION;
  datasetKey: string;
  generatedAt: string;
  claimStatus: 'blocked' | 'internal_only' | 'release_candidate';
  evidencePolicy: QualityEvidencePolicy;
  evidenceCounts: QualityEvidenceCounts;
  observationCoverage: {
    eligibleFinalCases: number;
    observedFinalCases: number;
    missingFinalCases: number;
  };
  leakage: LeakageReport;
  strataCoverage: StrataCoverage;
  metrics: Record<QualityMetricKey, RatioMetric> & {
    scanLatencyP50Ms: LatencyMetric;
    scanLatencyP95Ms: LatencyMetric;
    scanLatencyP99Ms: LatencyMetric;
  };
  performance: Record<QualityGateKey, LatencyMetric | RatioMetric | { value: number | null; sampleCount: number; unit: 'count' }>;
  releaseGates: ReleaseGate[];
  breakdowns: {
    top5ByLanguage: Record<QualityLanguage, RatioMetric>;
    top5ByItemType: Record<QualityItemType, RatioMetric>;
    top5ByCaptureCondition: Record<QualityCaptureCondition, RatioMetric>;
  };
  modelVersions: string[];
  indexVersions: string[];
  limitations: string[];
};

export const STACKR_RELEASE_TARGETS: Readonly<Record<QualityGateKey, {
  label: string;
  operator: 'lte' | 'gte' | 'zero';
  value: number;
  unit: 'ms' | 'ratio' | 'count';
}>> = Object.freeze({
  cached_catalogue_p95_ms: {
    label: 'Cached catalogue p95', operator: 'lte', value: 150, unit: 'ms',
  },
  structured_search_p95_ms: {
    label: 'Structured search p95', operator: 'lte', value: 300, unit: 'ms',
  },
  recognition_embedding_p95_ms: {
    label: 'Embedding recognition lookup p95', operator: 'lte', value: 350, unit: 'ms',
  },
  warm_image_fallback_p95_ms: {
    label: 'Warm image fallback p95', operator: 'lte', value: 1200, unit: 'ms',
  },
  auto_confirm_precision: {
    label: 'Auto-confirm precision', operator: 'gte', value: 0.995, unit: 'ratio',
  },
  real_world_top5_accuracy: {
    label: 'Real-world top-five accuracy', operator: 'gte', value: 0.98, unit: 'ratio',
  },
  auto_confirm_below_threshold: {
    label: 'Auto-confirms below calibrated threshold', operator: 'zero', value: 0, unit: 'count',
  },
});

function uniqueCount(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

function ratio(numerator: number, denominator: number): RatioMetric {
  return {
    value: denominator > 0 ? numerator / denominator : null,
    numerator,
    denominator,
    unit: 'ratio',
  };
}

function percentile(values: number[], quantile: number): number | null {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!clean.length) return null;
  return clean[Math.max(0, Math.min(clean.length - 1, Math.ceil(clean.length * quantile) - 1))];
}

function latency(values: number[], quantile: number): LatencyMetric {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0);
  return { value: percentile(clean, quantile), sampleCount: clean.length, unit: 'ms' };
}

function mapByCase(observations: QualityObservation[]) {
  const result = new Map<string, QualityObservation>();
  for (const observation of observations) {
    if (result.has(observation.caseId)) throw new Error(`Duplicate quality observation for case ${observation.caseId}.`);
    result.set(observation.caseId, observation);
  }
  return result;
}

function leakageFor(cases: GoldTestCase[]): LeakageReport {
  const physical = new Map<string, Set<QualitySplit>>();
  const sessions = new Map<string, Set<QualitySplit>>();
  for (const row of cases) {
    physical.set(row.physicalCardId, new Set([...(physical.get(row.physicalCardId) ?? []), row.split]));
    sessions.set(row.captureSessionId, new Set([...(sessions.get(row.captureSessionId) ?? []), row.split]));
  }
  const leakedPhysicalCardIds = [...physical].filter(([, splits]) => splits.size > 1).map(([id]) => id).sort();
  const leakedCaptureSessionIds = [...sessions].filter(([, splits]) => splits.size > 1).map(([id]) => id).sort();
  return {
    physicalCardLeakage: leakedPhysicalCardIds.length > 0,
    captureSessionLeakage: leakedCaptureSessionIds.length > 0,
    leakedPhysicalCardIds,
    leakedCaptureSessionIds,
  };
}

function evidenceCounts(cases: GoldTestCase[]): QualityEvidenceCounts {
  return {
    physicalCards: uniqueCount(cases.map((row) => row.physicalCardId)),
    variants: uniqueCount(cases.map((row) => row.variantId)),
    images: uniqueCount(cases.map((row) => row.imageId)),
    captureSessions: uniqueCount(cases.map((row) => row.captureSessionId)),
    realImages: cases.filter((row) => row.sourceKind === 'real_capture').length,
    syntheticImages: cases.filter((row) => row.sourceKind === 'synthetic_supplement').length,
    finalTestImages: cases.filter((row) => row.split === 'final_test').length,
    noMatchImages: cases.filter((row) => row.split === 'no_match_test').length,
  };
}

function countStrata(cases: GoldTestCase[]): StrataCoverage {
  const required: Record<string, number> = {};
  for (const language of QUALITY_LANGUAGES) required[`language:${language}`] = cases.filter((row) => row.language === language).length;
  for (const era of ['modern', 'vintage'] as const) required[`era:${era}`] = cases.filter((row) => row.era === era).length;
  for (const itemType of ['raw_card', 'sleeved_card', 'binder_capture', 'slab'] as const) {
    required[`item_type:${itemType}`] = cases.filter((row) => row.itemType === itemType).length;
  }
  for (const condition of ['glare', 'blur', 'perspective_distortion', 'partial_crop', 'duplicate_artwork'] as const) {
    required[`condition:${condition}`] = cases.filter((row) => row.captureConditions.includes(condition)).length;
  }
  for (const finish of ['normal', 'parallel'] as const) required[`finish:${finish}`] = cases.filter((row) => row.finishClass === finish).length;
  for (const tier of ['common', 'high_value'] as const) required[`value:${tier}`] = cases.filter((row) => row.valueTier === tier).length;
  return { required, missing: Object.entries(required).filter(([, count]) => count === 0).map(([key]) => key) };
}

function isCardCorrect(row: GoldTestCase, observation: QualityObservation | undefined, rankLimit = 1) {
  if (!observation || !row.expectedMatch || !row.canonicalCardId) return false;
  return observation.candidates.slice(0, rankLimit).some((candidate) => candidate.canonicalCardId === row.canonicalCardId);
}

function summarizeTopN(rows: GoldTestCase[], observations: Map<string, QualityObservation>, rank: number) {
  const eligible = rows.filter((row) => row.expectedMatch && row.canonicalCardId && observations.has(row.caseId));
  return ratio(eligible.filter((row) => isCardCorrect(row, observations.get(row.caseId), rank)).length, eligible.length);
}

function breakdown<T extends string>(
  values: readonly T[],
  rows: GoldTestCase[],
  observations: Map<string, QualityObservation>,
  predicate: (row: GoldTestCase, value: T) => boolean,
): Record<T, RatioMetric> {
  return Object.fromEntries(values.map((value) => [value, summarizeTopN(rows.filter((row) => predicate(row, value)), observations, 5)])) as Record<T, RatioMetric>;
}

function latencyForPerformance(rows: PerformanceObservation[], predicate: (row: PerformanceObservation) => boolean) {
  return latency(rows.filter((row) => predicate(row) && row.statusCode >= 200 && row.statusCode < 400).map((row) => row.durationMs), 0.95);
}

function gate(
  key: QualityGateKey,
  actualValue: number | null,
  evidenceCount: number,
  evidenceApproved: boolean,
  minimumEvidence: number | undefined,
): ReleaseGate {
  const target = STACKR_RELEASE_TARGETS[key];
  const enoughEvidence = evidenceApproved && minimumEvidence != null && evidenceCount >= minimumEvidence;
  const meetsTarget = actualValue != null && (
    target.operator === 'lte' ? actualValue <= target.value
      : target.operator === 'gte' ? actualValue >= target.value
        : actualValue === 0
  );
  let status: QualityGateStatus;
  let reason: string;
  if (actualValue == null || evidenceCount === 0) {
    status = 'insufficient_data';
    reason = 'No eligible evidence was recorded for this gate.';
  } else if (!meetsTarget) {
    status = 'fail';
    reason = `Measured value missed the immutable ${STACKR_RELEASE_GATE_VERSION} target.`;
  } else if (!enoughEvidence) {
    status = 'insufficient_data';
    reason = minimumEvidence == null
      ? 'No approved minimum evidence denominator exists, so this result cannot support a release claim.'
      : `Evidence policy requires at least ${minimumEvidence} eligible observations.`;
  } else {
    status = 'pass';
    reason = 'Measured value met the target with an approved evidence denominator.';
  }
  return {
    key,
    label: target.label,
    targetOperator: target.operator,
    targetValue: target.value,
    actualValue,
    unit: target.unit,
    evidenceCount,
    status,
    reason,
  };
}

export function evaluateStackrQuality(input: {
  manifest: GoldTestSetManifest;
  observations: QualityObservation[];
  performance: PerformanceObservation[];
  generatedAt?: string;
}): StackrQualityReport {
  if (input.manifest.schemaVersion !== STACKR_QUALITY_SCHEMA_VERSION) throw new Error('Unsupported Stackr quality manifest version.');
  const caseIds = new Set<string>();
  const imageIds = new Set<string>();
  for (const row of input.manifest.cases) {
    if (caseIds.has(row.caseId)) throw new Error(`Duplicate gold case ID ${row.caseId}.`);
    if (imageIds.has(row.imageId)) throw new Error(`Duplicate gold image ID ${row.imageId}.`);
    if (!row.physicalCardId || !row.captureSessionId) throw new Error(`Gold case ${row.caseId} is missing leakage-control IDs.`);
    caseIds.add(row.caseId);
    imageIds.add(row.imageId);
  }
  const unknownObservation = input.observations.find((row) => !caseIds.has(row.caseId));
  if (unknownObservation) throw new Error(`Quality observation references unknown gold case ${unknownObservation.caseId}.`);

  const eligibleCases = input.manifest.cases.filter((row) => row.authorizedForEvaluation && ['reviewed', 'verified'].includes(row.labelStatus));
  const finalCases = eligibleCases.filter((row) => row.split === 'final_test' || row.split === 'no_match_test');
  const realFinalCases = finalCases.filter((row) => row.sourceKind === 'real_capture');
  const observations = mapByCase(input.observations);
  const leakage = leakageFor(eligibleCases);
  const counts = evidenceCounts(eligibleCases);
  const strataCoverage = countStrata(realFinalCases);

  const matchable = finalCases.filter((row) => row.expectedMatch && observations.has(row.caseId));
  const noMatch = finalCases.filter((row) => !row.expectedMatch && observations.has(row.caseId));
  const observed = finalCases.filter((row) => observations.has(row.caseId));
  const missingObservations = finalCases.filter((row) => !observations.has(row.caseId)).length;
  const autoConfirmed = observed.filter((row) => observations.get(row.caseId)?.autoConfirmed);
  const variantRows = matchable.filter((row) => row.variantId);
  const finishRows = matchable.filter((row) => row.finishCode);
  const realMatchable = realFinalCases.filter((row) => row.expectedMatch && observations.has(row.caseId));

  const top1Accuracy = summarizeTopN(finalCases, observations, 1);
  const top3Accuracy = summarizeTopN(finalCases, observations, 3);
  const top5Accuracy = summarizeTopN(finalCases, observations, 5);
  const autoConfirmPrecision = ratio(
    autoConfirmed.filter((row) => row.expectedMatch && isCardCorrect(row, observations.get(row.caseId), 1)).length,
    autoConfirmed.length,
  );
  const ambiguousResultRate = ratio(observed.filter((row) => observations.get(row.caseId)?.matchStatus === 'ambiguous').length, observed.length);
  const falseAcceptRate = ratio(noMatch.filter((row) => observations.get(row.caseId)?.autoConfirmed).length, noMatch.length);
  const noMatchAccuracy = ratio(noMatch.filter((row) => observations.get(row.caseId)?.matchStatus === 'no_match').length, noMatch.length);
  const variantAccuracy = ratio(
    variantRows.filter((row) => observations.get(row.caseId)?.candidates[0]?.variantId === row.variantId).length,
    variantRows.length,
  );
  const finishAccuracy = ratio(
    finishRows.filter((row) => observations.get(row.caseId)?.candidates[0]?.finishCode === row.finishCode).length,
    finishRows.length,
  );
  const manualCorrectionRate = ratio(observed.filter((row) => observations.get(row.caseId)?.manualCorrection).length, observed.length);
  const ximilarFallbackRate = ratio(observed.filter((row) => observations.get(row.caseId)?.ximilarFallbackUsed).length, observed.length);
  const resolvedWithoutImageUploadRate = ratio(observed.filter((row) => !observations.get(row.caseId)?.imageUploadUsed).length, observed.length);
  const scanLatencies = observed.map((row) => observations.get(row.caseId)?.totalLatencyMs).filter((value): value is number => value != null);

  const cachedCatalogue = latencyForPerformance(input.performance, (row) => row.routeClass === 'catalogue_read' && row.cacheStatus === 'HIT');
  const structuredSearch = latencyForPerformance(input.performance, (row) => row.routeClass === 'structured_search');
  const recognitionEmbedding = latencyForPerformance(input.performance, (row) => row.routeClass === 'recognition_embedding');
  const warmImageFallback = latencyForPerformance(input.performance, (row) => row.routeClass === 'image_fallback' && row.warm === true);
  const realWorldTop5 = summarizeTopN(realMatchable, observations, 5);
  const belowThreshold = observed.filter((row) => {
    const observation = observations.get(row.caseId);
    return Boolean(observation?.autoConfirmed
      && (observation.confidence == null
        || observation.calibratedThreshold == null
        || observation.confidence < observation.calibratedThreshold));
  }).length;

  const policy = input.manifest.evidencePolicy;
  const evidenceApproved = policy.approved
    && input.manifest.status === 'locked'
    && !leakage.physicalCardLeakage
    && !leakage.captureSessionLeakage
    && counts.realImages > 0
    && missingObservations === 0;
  const releaseGates = [
    gate('cached_catalogue_p95_ms', cachedCatalogue.value, cachedCatalogue.sampleCount, evidenceApproved, policy.minimumMetricDenominators.cached_catalogue_p95_ms),
    gate('structured_search_p95_ms', structuredSearch.value, structuredSearch.sampleCount, evidenceApproved, policy.minimumMetricDenominators.structured_search_p95_ms),
    gate('recognition_embedding_p95_ms', recognitionEmbedding.value, recognitionEmbedding.sampleCount, evidenceApproved, policy.minimumMetricDenominators.recognition_embedding_p95_ms),
    gate('warm_image_fallback_p95_ms', warmImageFallback.value, warmImageFallback.sampleCount, evidenceApproved, policy.minimumMetricDenominators.warm_image_fallback_p95_ms),
    gate('auto_confirm_precision', autoConfirmPrecision.value, autoConfirmPrecision.denominator, evidenceApproved, policy.minimumMetricDenominators.auto_confirm_precision),
    gate('real_world_top5_accuracy', realWorldTop5.value, realWorldTop5.denominator, evidenceApproved, policy.minimumMetricDenominators.real_world_top5_accuracy),
    gate('auto_confirm_below_threshold', observed.length ? belowThreshold : null, observed.length, evidenceApproved, policy.minimumMetricDenominators.auto_confirm_below_threshold),
  ];

  const limitations = [...input.manifest.limitations];
  if (!policy.approved) limitations.push('Evidence policy is not approved; metrics cannot support production claims.');
  if (counts.realImages === 0) limitations.push('No authorised real captures are present.');
  if (counts.syntheticImages > 0) limitations.push('Synthetic supplements are reported separately and do not count as real-world validation.');
  if (strataCoverage.missing.length) limitations.push(`Missing real final-test strata: ${strataCoverage.missing.join(', ')}.`);
  if (leakage.physicalCardLeakage) limitations.push('Physical-card leakage exists across evaluation splits.');
  if (leakage.captureSessionLeakage) limitations.push('Capture-session leakage exists across evaluation splits.');
  if (missingObservations) limitations.push(`${missingObservations} eligible final-test cases have no observation.`);

  const allPass = releaseGates.every((row) => row.status === 'pass');
  const anyMeasured = releaseGates.some((row) => row.actualValue != null);
  const claimStatus = allPass && evidenceApproved && strataCoverage.missing.length === 0
    ? 'release_candidate'
    : anyMeasured ? 'internal_only' : 'blocked';

  return {
    schemaVersion: STACKR_QUALITY_SCHEMA_VERSION,
    releaseGateVersion: STACKR_RELEASE_GATE_VERSION,
    datasetKey: input.manifest.datasetKey,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    claimStatus,
    evidencePolicy: policy,
    evidenceCounts: counts,
    observationCoverage: {
      eligibleFinalCases: finalCases.length,
      observedFinalCases: observed.length,
      missingFinalCases: missingObservations,
    },
    leakage,
    strataCoverage,
    metrics: {
      top1Accuracy,
      top3Accuracy,
      top5Accuracy,
      autoConfirmPrecision,
      ambiguousResultRate,
      falseAcceptRate,
      noMatchAccuracy,
      variantAccuracy,
      finishAccuracy,
      manualCorrectionRate,
      ximilarFallbackRate,
      resolvedWithoutImageUploadRate,
      scanLatencyP50Ms: latency(scanLatencies, 0.5),
      scanLatencyP95Ms: latency(scanLatencies, 0.95),
      scanLatencyP99Ms: latency(scanLatencies, 0.99),
    },
    performance: {
      cached_catalogue_p95_ms: cachedCatalogue,
      structured_search_p95_ms: structuredSearch,
      recognition_embedding_p95_ms: recognitionEmbedding,
      warm_image_fallback_p95_ms: warmImageFallback,
      auto_confirm_precision: autoConfirmPrecision,
      real_world_top5_accuracy: realWorldTop5,
      auto_confirm_below_threshold: { value: observed.length ? belowThreshold : null, sampleCount: observed.length, unit: 'count' },
    },
    releaseGates,
    breakdowns: {
      top5ByLanguage: breakdown(QUALITY_LANGUAGES, finalCases, observations, (row, value) => row.language === value),
      top5ByItemType: breakdown(['raw_card', 'sleeved_card', 'binder_capture', 'slab'] as const, finalCases, observations, (row, value) => row.itemType === value),
      top5ByCaptureCondition: breakdown(QUALITY_CAPTURE_CONDITIONS, finalCases, observations, (row, value) => row.captureConditions.includes(value)),
    },
    modelVersions: [...new Set(input.observations.map((row) => row.modelVersion).filter((value): value is string => Boolean(value)))].sort(),
    indexVersions: [...new Set(input.observations.map((row) => row.indexVersion).filter((value): value is string => Boolean(value)))].sort(),
    limitations: [...new Set(limitations)],
  };
}
