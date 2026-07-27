import type { RecognitionFeedbackAction } from './recognitionFeedbackCore';
import type {
  RecognitionCandidate,
  RecognitionResult,
  RecognitionShadowModeCandidate,
  RecognitionShadowModeDisagreementCategory,
  RecognitionShadowModeEngineResult,
  RecognitionShadowModeSnapshot,
} from './recognition/types';

export const SHADOW_MODE_PILOT_SCHEMA_VERSION = 'stackr-shadow-mode-pilot-v1.0.0';

export type ShadowModePilotIdentity = {
  stackrCardId: string | null;
  cardName: string | null;
  setId: string | null;
  collectorNumber: string | null;
  language: string | null;
  variant: string | null;
};

export type ShadowModePilotUserOutcome = {
  action: RecognitionFeedbackAction | 'added_to_collection' | 'manual_search' | 'rescan';
  confirmedIdentity: ShadowModePilotIdentity | null;
  confirmedAt: string;
  source: 'scan_result' | 'feedback_panel' | 'manual_search' | 'collection_add';
};

export type ShadowModePilotRecord = {
  schemaVersion: typeof SHADOW_MODE_PILOT_SCHEMA_VERSION;
  localRecordId: string;
  anonymousScanId: string;
  createdAt: string;
  rawImageRecorded: false;
  shadowSnapshot: RecognitionShadowModeSnapshot;
  userOutcome: ShadowModePilotUserOutcome;
  disagreementCategory: RecognitionShadowModeDisagreementCategory;
  captureQuality: Record<string, unknown>;
  ocrEvidenceSummary: Record<string, unknown>;
  deviceClass: string | null;
  appContext: Record<string, unknown>;
};

type CardLike = {
  id?: string | null;
  name?: string | null;
  set_id?: string | null;
  setId?: string | null;
  number?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  editionHint?: string | null;
  rarity?: string | null;
  variant?: string | null;
  raw_data?: Record<string, unknown> | null;
};

function clean(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function normalise(value: unknown): string | null {
  return clean(value)?.toLowerCase().replace(/\s+/g, ' ') ?? null;
}

function normaliseNumber(value: unknown): string | null {
  const text = normalise(value);
  if (!text) return null;
  return text.replace(/^0+(\d)/, '$1');
}

function identityKey(identity: ShadowModePilotIdentity | RecognitionShadowModeCandidate | null | undefined) {
  if (!identity) return null;
  const id = normalise('stackrCardId' in identity ? identity.stackrCardId : identity.canonicalCardId);
  if (id) return `id:${id}`;
  const setId = normalise(identity.setId);
  const collectorNumber = normaliseNumber(identity.collectorNumber);
  const cardName = normalise(identity.cardName);
  if (setId && collectorNumber && cardName) return `printed:${setId}:${collectorNumber}:${cardName}`;
  if (setId && collectorNumber) return `printed:${setId}:${collectorNumber}`;
  return null;
}

function variantKey(identity: ShadowModePilotIdentity | RecognitionShadowModeCandidate | null | undefined) {
  return normalise(identity?.variant);
}

function languageKey(identity: ShadowModePilotIdentity | RecognitionShadowModeCandidate | null | undefined) {
  return normalise(identity?.language);
}

function identitiesMatch(
  left: ShadowModePilotIdentity | RecognitionShadowModeCandidate | null | undefined,
  right: ShadowModePilotIdentity | RecognitionShadowModeCandidate | null | undefined
) {
  const leftKey = identityKey(left);
  const rightKey = identityKey(right);
  if (!leftKey || !rightKey) return null;
  return leftKey === rightKey;
}

function optionalAgreement(left: string | null, right: string | null) {
  if (!left || !right) return null;
  return left === right;
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function rawVariant(candidate: RecognitionCandidate) {
  const raw = candidate.raw && typeof candidate.raw === 'object' ? candidate.raw as Record<string, any> : null;
  return clean(raw?.variantResolution?.variantId)
    ?? clean(raw?.variantResolution?.label)
    ?? clean(raw?.variant)
    ?? clean(raw?.parallel)
    ?? null;
}

export function cardLikeToShadowIdentity(card?: CardLike | null): ShadowModePilotIdentity | null {
  if (!card) return null;
  return {
    stackrCardId: clean(card.id),
    cardName: clean(card.name),
    setId: clean(card.set_id ?? card.setId),
    collectorNumber: clean(card.number ?? card.collectorNumber),
    language: clean(card.language ?? card.raw_data?.language),
    variant: clean(card.variant ?? card.editionHint ?? card.rarity),
  };
}

export function recognitionCandidateToShadowCandidate(
  candidate: RecognitionCandidate,
  index: number
): RecognitionShadowModeCandidate {
  return {
    rank: index + 1,
    canonicalCardId: clean(candidate.identity.id),
    cardName: clean(candidate.identity.name),
    setId: clean(candidate.identity.setId),
    setName: clean(candidate.identity.setName),
    collectorNumber: clean(candidate.identity.number),
    language: clean(candidate.identity.language),
    variant: rawVariant(candidate),
    confidence: asNumber(candidate.confidence),
    visualSimilarity: asNumber(candidate.evidence.visual?.similarity),
    marginToSecond: asNumber(candidate.evidence.visual?.marginToSecond),
  };
}

export function recognitionResultToShadowEngineResult(
  result: RecognitionResult,
  durationMs?: number | null
): RecognitionShadowModeEngineResult {
  const topCandidates = result.candidates
    .slice(0, 3)
    .map(recognitionCandidateToShadowCandidate);
  const localInferenceNote = (result.diagnostics.notes ?? [])
    .map((note) => /^localInference=(.+)$/i.exec(note)?.[1] ?? null)
    .find(Boolean);
  const parsedLocalInference = (() => {
    if (!localInferenceNote) return null;
    try {
      return JSON.parse(localInferenceNote) as { timings?: Record<string, unknown> };
    } catch {
      return null;
    }
  })();

  return {
    engineId: result.engineId,
    outcome: result.outcome,
    topCandidates,
    confidence: topCandidates[0]?.confidence ?? null,
    errorCode: result.error?.code ?? null,
    errorMessage: result.error?.message ?? null,
    modelVersion: result.diagnostics.modelVersion ?? null,
    catalogueVersion: result.diagnostics.catalogueVersion ?? null,
    timings: {
      totalMs: durationMs ?? result.diagnostics.totalDurationMs ?? null,
      inferenceMs: asNumber(parsedLocalInference?.timings?.inferenceMs),
      searchMs: asNumber(parsedLocalInference?.timings?.searchMs),
      providerMs: result.engineId === 'existing_legacy_engine' ? result.diagnostics.totalDurationMs : null,
    },
  };
}

export function classifyShadowModeDisagreement(input: {
  snapshot: RecognitionShadowModeSnapshot;
  confirmedIdentity?: ShadowModePilotIdentity | null;
  qualityFailureReasons?: string[];
}): {
  category: RecognitionShadowModeDisagreementCategory;
  reasons: string[];
} {
  const reasons: string[] = [];
  const visibleTop = input.snapshot.visible.topCandidates[0] ?? null;
  const localTop = input.snapshot.local.topCandidates[0] ?? null;
  const confirmed = input.confirmedIdentity ?? null;
  const qualityFailures = input.qualityFailureReasons ?? [];

  if (qualityFailures.length > 0) {
    return { category: 'capture_quality_failure', reasons: qualityFailures };
  }
  if (input.snapshot.local.errorCode?.includes('CATALOGUE') || input.snapshot.local.catalogueVersion?.includes('blocked')) {
    return { category: 'catalogue_missing', reasons: ['local_catalogue_unavailable'] };
  }
  if (!localTop) {
    return {
      category: 'local_unavailable',
      reasons: [input.snapshot.local.errorCode ?? 'local_returned_no_candidates'],
    };
  }
  if (!visibleTop) {
    return {
      category: 'visible_unavailable',
      reasons: [input.snapshot.visible.errorCode ?? 'visible_engine_returned_no_candidates'],
    };
  }

  const topIdentityAgreement = identitiesMatch(visibleTop, localTop);
  const languageAgreement = optionalAgreement(languageKey(visibleTop), languageKey(localTop));
  const variantAgreement = optionalAgreement(variantKey(visibleTop), variantKey(localTop));

  if (languageAgreement === false) {
    return { category: 'language_disagreement', reasons: ['top_one_language_disagreement'] };
  }
  if (topIdentityAgreement && variantAgreement === false) {
    return {
      category: 'exact_identity_agreement_variant_disagreement',
      reasons: ['same_identity_different_variant'],
    };
  }
  if (!confirmed) {
    reasons.push('awaiting_user_confirmed_identity');
    return { category: 'pending_manual_review', reasons };
  }

  const visibleCorrect = identitiesMatch(visibleTop, confirmed);
  const localCorrect = identitiesMatch(localTop, confirmed);

  if (visibleCorrect === true && localCorrect === true) {
    return { category: 'both_correct', reasons: ['visible_and_local_match_confirmed_identity'] };
  }
  if (visibleCorrect === true && localCorrect === false) {
    return { category: 'current_provider_correct_local_wrong', reasons: ['visible_matches_confirmed_identity'] };
  }
  if (visibleCorrect === false && localCorrect === true) {
    return { category: 'local_correct_current_provider_wrong', reasons: ['local_matches_confirmed_identity'] };
  }
  if (visibleCorrect === false && localCorrect === false) {
    return { category: 'both_wrong', reasons: ['neither_top_one_matches_confirmed_identity'] };
  }

  return { category: 'pending_manual_review', reasons: ['insufficient_identity_fields_for_exact_comparison'] };
}

export function buildRecognitionShadowModeSnapshot(input: {
  anonymousScanId: string;
  visibleResult: RecognitionResult;
  localResult: RecognitionResult;
  localRunDurationMs?: number | null;
  createdAt?: string;
}): RecognitionShadowModeSnapshot {
  const visible = recognitionResultToShadowEngineResult(input.visibleResult);
  const local = recognitionResultToShadowEngineResult(input.localResult, input.localRunDurationMs ?? null);
  const topOneIdentityAgreement = identitiesMatch(visible.topCandidates[0], local.topCandidates[0]);
  const topThreeLocalContainsVisible = visible.topCandidates[0]
    ? local.topCandidates.some((candidate) => identitiesMatch(candidate, visible.topCandidates[0]) === true)
    : null;
  const variantAgreement = optionalAgreement(
    variantKey(visible.topCandidates[0]),
    variantKey(local.topCandidates[0])
  );
  const languageAgreement = optionalAgreement(
    languageKey(visible.topCandidates[0]),
    languageKey(local.topCandidates[0])
  );
  const baseSnapshot: RecognitionShadowModeSnapshot = {
    schemaVersion: SHADOW_MODE_PILOT_SCHEMA_VERSION,
    enabled: true,
    anonymousScanId: input.anonymousScanId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    rawImageRecorded: false,
    visible,
    local,
    agreement: {
      topOneIdentityAgreement,
      topThreeLocalContainsVisible,
      variantAgreement,
      languageAgreement,
      disagreementCategory: 'pending_manual_review',
      reasons: [],
    },
  };
  const classified = classifyShadowModeDisagreement({ snapshot: baseSnapshot });
  return {
    ...baseSnapshot,
    agreement: {
      ...baseSnapshot.agreement,
      disagreementCategory: classified.category,
      reasons: classified.reasons,
    },
  };
}

export function getShadowModeSnapshotFromDiagnostics(
  diagnostics?: { shadowMode?: RecognitionShadowModeSnapshot | null } | null
): RecognitionShadowModeSnapshot | null {
  return diagnostics?.shadowMode ?? null;
}

export function createShadowModePilotRecord(input: {
  shadowSnapshot: RecognitionShadowModeSnapshot;
  userOutcome: ShadowModePilotUserOutcome;
  captureQuality?: Record<string, unknown> | null;
  ocrEvidenceSummary?: Record<string, unknown> | null;
  deviceClass?: string | null;
  appContext?: Record<string, unknown> | null;
  createdAt?: string;
}): ShadowModePilotRecord {
  const quality = input.captureQuality ?? {};
  const qualityFailureReasons = Array.isArray((quality as any).failures)
    ? (quality as any).failures.map((failure: any) => String(failure?.code ?? failure)).filter(Boolean)
    : [];
  const classified = classifyShadowModeDisagreement({
    snapshot: input.shadowSnapshot,
    confirmedIdentity: input.userOutcome.confirmedIdentity,
    qualityFailureReasons,
  });
  const createdAt = input.createdAt ?? new Date().toISOString();
  const action = input.userOutcome.action;
  return {
    schemaVersion: SHADOW_MODE_PILOT_SCHEMA_VERSION,
    localRecordId: `shadow_${input.shadowSnapshot.anonymousScanId}_${action}_${createdAt}`,
    anonymousScanId: input.shadowSnapshot.anonymousScanId,
    createdAt,
    rawImageRecorded: false,
    shadowSnapshot: {
      ...input.shadowSnapshot,
      rawImageRecorded: false,
      agreement: {
        ...input.shadowSnapshot.agreement,
        disagreementCategory: classified.category,
        reasons: classified.reasons,
      },
    },
    userOutcome: input.userOutcome,
    disagreementCategory: classified.category,
    captureQuality: quality,
    ocrEvidenceSummary: input.ocrEvidenceSummary ?? {},
    deviceClass: input.deviceClass ?? null,
    appContext: input.appContext ?? {},
  };
}
