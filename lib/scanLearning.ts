import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getScannerClientContext } from './scannerClientContext';

type ScanLearningEventType =
  | 'attempt'
  | 'candidate_selected'
  | 'match_incorrect'
  | 'none_correct'
  | 'manual_search'
  | 'added_to_binder'
  | 'rescan'
  | 'cancellation'
  | 'duplicate_prevented';

type ScanLearningCandidate = {
  id?: string | null;
  name?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  number?: string | null;
  provider?: string | null;
  confidence?: number | null;
  visualSimilarity?: number | null;
  finalScore?: number | null;
};

type ScanLearningInput = {
  scanSessionId: string;
  eventType: ScanLearningEventType;
  scanMode?: string | null;
  routeContext?: Record<string, unknown>;
  frameMetrics?: Record<string, unknown>;
  ocrPreview?: string | null;
  candidates?: ScanLearningCandidate[];
  incorrectCandidateId?: string | null;
  correctCardId?: string | null;
  candidateConfidences?: Record<string, number | null> | null;
  visualFeatureConsent?: boolean | null;
  anonymizedVisualFeatures?: Record<string, unknown> | null;
  labelVerificationStatus?: 'user_reported' | 'queued_for_review' | 'verified' | 'rejected' | null;
  feedbackReviewStatus?: 'queued' | 'reviewed' | 'dismissed' | null;
  selectedCardId?: string | null;
  selectedSetId?: string | null;
  selectedCardName?: string | null;
  outcome?: string | null;
  notes?: string | null;
};

const SCAN_LEARNING_QUEUE_KEY = 'stackr.scanLearning.offlineQueue.v1';
const MAX_QUEUED_SCAN_EVENTS = 50;

function compactCandidate(candidate: ScanLearningCandidate) {
  return {
    id: candidate.id ?? null,
    name: candidate.name ?? null,
    set_id: candidate.set_id ?? null,
    set_name: candidate.set_name ?? null,
    number: candidate.number ?? null,
    provider: candidate.provider ?? null,
    confidence: candidate.confidence ?? null,
    visualSimilarity: candidate.visualSimilarity ?? null,
    finalScore: candidate.finalScore ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildCandidateConfidences(candidates: ScanLearningCandidate[]) {
  return Object.fromEntries(
    candidates
      .filter((candidate) => candidate.id)
      .map((candidate) => [
        String(candidate.id),
        candidate.confidence ?? candidate.finalScore ?? candidate.visualSimilarity ?? null,
      ])
  );
}

function buildRecognitionFeedback(input: ScanLearningInput, candidates: ScanLearningCandidate[]) {
  const routeCorrection = asRecord(input.routeContext?.correction);
  const hasCorrectionContext = Boolean(routeCorrection)
    || input.eventType === 'match_incorrect'
    || input.eventType === 'none_correct'
    || input.correctCardId
    || input.incorrectCandidateId;
  if (!hasCorrectionContext) return null;

  const predictedId = String(
    input.incorrectCandidateId
    ?? routeCorrection?.predictedStackrCardId
    ?? (input.eventType === 'match_incorrect' ? input.selectedCardId : '')
    ?? ''
  ).trim() || null;
  const correctId = String(
    input.correctCardId
    ?? routeCorrection?.correctStackrCardId
    ?? (input.eventType === 'candidate_selected' && predictedId ? input.selectedCardId : '')
    ?? ''
  ).trim() || null;

  return {
    incorrectCandidateId: predictedId,
    correctCardId: correctId,
    candidateConfidences: input.candidateConfidences ?? buildCandidateConfidences(candidates),
    visualFeatureConsent: Boolean(input.visualFeatureConsent),
    anonymizedVisualFeatures: input.visualFeatureConsent ? input.anonymizedVisualFeatures ?? null : null,
    labelVerificationStatus: input.labelVerificationStatus ?? 'user_reported',
    reviewStatus: input.feedbackReviewStatus ?? 'queued',
    rawImageTrainingConsent: false,
    sourceEventType: input.eventType,
  };
}

function buildPayload(input: ScanLearningInput, userId: string | null) {
  const candidates = (input.candidates ?? []).slice(0, 5).map(compactCandidate);
  const client = getScannerClientContext();
  const recognitionFeedback = buildRecognitionFeedback(input, candidates);
  return {
    user_id: userId,
    scan_session_id: input.scanSessionId,
    event_type: input.eventType,
    scan_mode: input.scanMode ?? null,
    route_context: {
      client,
      ...(input.routeContext ?? {}),
      ...(recognitionFeedback ? { recognitionFeedback } : {}),
    },
    frame_metrics: input.frameMetrics ?? {},
    ocr_preview: input.ocrPreview?.slice(0, 500) ?? null,
    candidate_count: candidates.length,
    candidates,
    selected_card_id: input.selectedCardId ?? null,
    selected_set_id: input.selectedSetId ?? null,
    selected_card_name: input.selectedCardName ?? null,
    outcome: input.outcome ?? null,
    notes: input.notes ?? null,
    client_version: client.appVersion,
  };
}

async function queueScanLearningEvent(
  payload: ReturnType<typeof buildPayload>,
  reason: string
) {
  try {
    const raw = await AsyncStorage.getItem(SCAN_LEARNING_QUEUE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const queue = Array.isArray(existing) ? existing : [];
    queue.push({
      queued_at: new Date().toISOString(),
      reason,
      payload,
    });
    await AsyncStorage.setItem(
      SCAN_LEARNING_QUEUE_KEY,
      JSON.stringify(queue.slice(-MAX_QUEUED_SCAN_EVENTS))
    );
  } catch (error) {
    console.log('[scan-learning] local queue unavailable', error instanceof Error ? error.message : String(error));
  }
}

export async function logScanLearningEvent(input: ScanLearningInput) {
  let payload: ReturnType<typeof buildPayload> | null = buildPayload(input, null);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    payload = buildPayload(input, user?.id ?? null);

    if (!user) {
      await queueScanLearningEvent(payload, 'no_user');
      return;
    }

    let { error } = await supabase
      .from('scan_learning_events')
      .insert(payload);

    if (error && input.eventType === 'match_incorrect') {
      const fallbackPayload = {
        ...payload,
        event_type: 'none_correct',
        outcome: input.outcome ?? 'match_incorrect',
        route_context: {
          ...payload.route_context,
          original_event_type: 'match_incorrect',
        },
      };
      const fallback = await supabase
        .from('scan_learning_events')
        .insert(fallbackPayload);
      error = fallback.error;
    }

    if (error) {
      console.log('[scan-learning] insert skipped', error.message);
      await queueScanLearningEvent(payload, error.message);
    }
  } catch (error) {
    console.log('[scan-learning] unavailable', error instanceof Error ? error.message : String(error));
    if (payload) {
      await queueScanLearningEvent(payload, 'exception');
    }
  }
}
