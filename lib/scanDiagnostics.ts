import type { ScanIdentifyProviderDiagnostic } from './cardSight';
import type { RecognitionShadowModeSnapshot } from './recognition/types';

export type ScanAttemptCandidateDiagnostic = {
  id?: string | null;
  name?: string | null;
  number?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  provider?: string | null;
  confidence?: number | null;
  visualSimilarity?: number | null;
  finalScore?: number | null;
};

export type ScanAttemptDiagnostics = {
  scanSessionId: string;
  createdAt: string;
  source: 'manual' | 'auto';
  mode?: string | null;
  intent?: string | null;
  flow?: string | null;
  binderId?: string | null;
  pathname?: string | null;
  outcome: 'candidates_returned' | 'no_match' | 'inventory_callback' | 'failed' | 'quality_rejected';
  timings: Record<string, number | null>;
  image: {
    originalWidth?: number | null;
    originalHeight?: number | null;
    crop?: Record<string, number> | null;
    captureFrame?: Record<string, unknown> | null;
    localisation?: Record<string, unknown> | null;
    quality?: Record<string, unknown> | null;
    recognitionWidth?: number | null;
    recognitionHeight?: number | null;
    recognitionBytesApprox?: number | null;
  };
  frameMetrics?: Record<string, unknown>;
  providers: ScanIdentifyProviderDiagnostic[];
  candidates: ScanAttemptCandidateDiagnostic[];
  notes?: string[];
  shadowMode?: RecognitionShadowModeSnapshot | null;
};

const MAX_STORED_DIAGNOSTICS = 12;
const diagnosticsBySession = new Map<string, ScanAttemptDiagnostics>();

function shouldLogDiagnostics() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function trimStoredDiagnostics() {
  while (diagnosticsBySession.size > MAX_STORED_DIAGNOSTICS) {
    const oldestKey = diagnosticsBySession.keys().next().value;
    if (!oldestKey) break;
    diagnosticsBySession.delete(oldestKey);
  }
}

export function saveScanAttemptDiagnostics(diagnostics: ScanAttemptDiagnostics) {
  diagnosticsBySession.set(diagnostics.scanSessionId, diagnostics);
  trimStoredDiagnostics();

  if (shouldLogDiagnostics()) {
    console.log('[scan-diagnostics]', {
      scanSessionId: diagnostics.scanSessionId,
      outcome: diagnostics.outcome,
      timings: diagnostics.timings,
      providers: diagnostics.providers.map((provider) => ({
        provider: provider.provider,
        stage: provider.stage,
        ok: provider.ok,
        durationMs: provider.durationMs,
        decision: provider.decision,
        candidateCount: provider.candidateCount,
        topCandidate: provider.topCandidate?.name ?? null,
        error: provider.error ?? null,
      })),
      candidates: diagnostics.candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        provider: candidate.provider,
        confidence: candidate.confidence,
        visualSimilarity: candidate.visualSimilarity,
        finalScore: candidate.finalScore,
      })),
      shadowMode: diagnostics.shadowMode
        ? {
            category: diagnostics.shadowMode.agreement.disagreementCategory,
            localOutcome: diagnostics.shadowMode.local.outcome,
            visibleOutcome: diagnostics.shadowMode.visible.outcome,
            localCandidates: diagnostics.shadowMode.local.topCandidates.length,
          }
        : null,
    });
  }
}

export function getScanAttemptDiagnostics(scanSessionId?: string | null) {
  if (!scanSessionId) return null;
  return diagnosticsBySession.get(scanSessionId) ?? null;
}
