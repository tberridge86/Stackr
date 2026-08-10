import {
  RECOGNITION_ARCHITECTURE_VERSION,
  type CaptureQuality,
  type CaptureQualityFailureReason,
  type CatalogueManifest,
  type ModelManifest,
  type RecognitionCandidate,
  type RecognitionEngineId,
  type RecognitionEvent,
  type RecognitionOutcome,
  type RecognitionProcessingStage,
  type ScannerDiagnostics,
} from './types';

export function createAnonymousScanId(prefix = 'scan') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function clampConfidence(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 1) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

export function getTopOneTopTwoMargin(candidates: RecognitionCandidate[]) {
  if (candidates.length < 2) return null;
  const sorted = [...candidates]
    .map((candidate) => clampConfidence(candidate.confidence))
    .sort((a, b) => b - a);
  return Number((sorted[0] - sorted[1]).toFixed(4));
}

export function getTopConfidence(candidates: RecognitionCandidate[]) {
  const top = candidates
    .map((candidate) => clampConfidence(candidate.confidence))
    .sort((a, b) => b - a)[0];
  return top == null ? null : Number(top.toFixed(4));
}

export function getQualityFailureReasons(
  quality?: CaptureQuality | null,
  fallback: CaptureQualityFailureReason[] = []
) {
  const reasons = quality?.failureReasons?.length ? quality.failureReasons : fallback;
  return [...new Set(reasons)];
}

export function buildRecognitionEvent(input: {
  anonymousScanId: string;
  stage: RecognitionProcessingStage;
  durationMs: number;
  resultState: RecognitionOutcome | 'not_started' | 'failed';
  engineId?: RecognitionEngineId | null;
  modelManifest?: ModelManifest | null;
  catalogueManifest?: CatalogueManifest | null;
  candidates?: RecognitionCandidate[];
  quality?: CaptureQuality | null;
  qualityFailureReasons?: CaptureQualityFailureReason[];
  errorCode?: string | null;
}): RecognitionEvent {
  const candidates = input.candidates ?? [];
  return {
    anonymousScanId: input.anonymousScanId,
    stage: input.stage,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    resultState: input.resultState,
    engineId: input.engineId ?? null,
    modelVersion: input.modelManifest?.version ?? null,
    catalogueVersion: input.catalogueManifest?.version ?? null,
    confidence: getTopConfidence(candidates),
    topOneTopTwoMargin: getTopOneTopTwoMargin(candidates),
    qualityFailureReasons: getQualityFailureReasons(input.quality, input.qualityFailureReasons ?? []),
    candidateCount: candidates.length,
    errorCode: input.errorCode ?? null,
  };
}

export function createScannerDiagnostics(input: {
  anonymousScanId: string;
  startedAt?: string;
  finishedAt?: string | null;
  totalDurationMs?: number;
  events?: RecognitionEvent[];
  engineId?: RecognitionEngineId | null;
  modelManifest?: ModelManifest | null;
  catalogueManifest?: CatalogueManifest | null;
  notes?: string[];
  legacyDiagnostics?: unknown;
}): ScannerDiagnostics {
  return {
    architectureVersion: RECOGNITION_ARCHITECTURE_VERSION,
    anonymousScanId: input.anonymousScanId,
    startedAt: input.startedAt ?? new Date().toISOString(),
    finishedAt: input.finishedAt ?? null,
    totalDurationMs: Math.max(0, Math.round(input.totalDurationMs ?? 0)),
    events: input.events ?? [],
    engineId: input.engineId ?? null,
    modelVersion: input.modelManifest?.version ?? null,
    catalogueVersion: input.catalogueManifest?.version ?? null,
    notes: input.notes ?? [],
    legacyDiagnostics: input.legacyDiagnostics,
  };
}

