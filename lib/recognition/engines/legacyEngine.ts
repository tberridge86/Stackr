import {
  identifyCardsDetailed as identifyCardsWithLegacyEngine,
  type IdentifiedCard,
  type IdentifyCardsDetailedResult,
  type ScanIdentifyDiagnostics,
  type ScanIdentifyHints,
} from '../../cardSight';
import { clampConfidence, createAnonymousScanId, createScannerDiagnostics } from '../events';
import {
  type CatalogueManifest,
  type ModelManifest,
  type RecognitionCandidate,
  type RecognitionEngine,
  type RecognitionRequest,
  type RecognitionResult,
} from '../types';

export type {
  IdentifiedCard,
  IdentifyCardsDetailedResult,
  ScanIdentifyDiagnostics,
  ScanIdentifyHints,
};

export const EXISTING_LEGACY_MODEL_MANIFEST: ModelManifest = {
  id: 'existing-legacy-engine',
  engineId: 'existing_legacy_engine',
  name: 'Existing Stackr hybrid recognition route',
  version: 'existing-legacy-engine:2026-07-26',
  createdAt: '2026-07-26',
  runtime: 'legacy_backend',
  input: 'resized_scan_images',
  weightsSource: 'Existing backend/provider chain',
  license: null,
};

export const EXISTING_LEGACY_CATALOGUE_MANIFEST: CatalogueManifest = {
  id: 'existing-stackr-catalogue',
  name: 'Existing Stackr scanner catalogue',
  version: 'existing-stackr-catalogue:2026-07-26',
  createdAt: '2026-07-26',
  languages: ['en', 'ja', 'zh-tw'],
  sources: [
    'pokemon_cards',
    'card_clip_embeddings',
    'scanner-pack:en-clip-base-v1',
    'legacy-provider-fallbacks',
  ],
  schemaVersion: 'legacy-supabase-scanner-schema',
  cardCount: null,
};

function confidenceFromLegacy(card: IdentifiedCard) {
  return clampConfidence(card.confidence ?? (card as any).finalScore ?? (card as any).visualSimilarity ?? null);
}

export function identifiedCardToRecognitionCandidate(
  card: IdentifiedCard,
  index = 0
): RecognitionCandidate {
  return {
    identity: {
      id: card.id ?? null,
      name: card.name ?? 'Unknown card',
      number: card.number ?? null,
      setId: card.set_id ?? null,
      setName: card.set_name ?? null,
      language: (card.raw as any)?.language ?? null,
      imageSmall: card.image_small ?? null,
      imageLarge: card.image_large ?? null,
      rarity: card.rarity ?? null,
    },
    confidence: confidenceFromLegacy(card),
    evidence: {
      providerScore: confidenceFromLegacy(card),
      visual: {
        similarity: (card.raw as any)?.visualSimilarity ?? (card.raw as any)?.similarity ?? null,
        finalScore: (card.raw as any)?.finalScore ?? null,
        marginToSecond: index === 0 ? null : undefined,
        modelVersion: EXISTING_LEGACY_MODEL_MANIFEST.version,
      },
      reasons: [card.provider ? `provider:${card.provider}` : 'provider:legacy'],
    },
    engineId: 'existing_legacy_engine',
    requiresReview: true,
    raw: card,
  };
}

export function recognitionCandidateToIdentifiedCard(candidate: RecognitionCandidate): IdentifiedCard {
  const raw = candidate.raw && typeof candidate.raw === 'object' ? candidate.raw as IdentifiedCard : null;
  return {
    id: candidate.identity.id ?? raw?.id ?? null,
    name: candidate.identity.name ?? raw?.name ?? null,
    number: candidate.identity.number ?? raw?.number ?? null,
    set_id: candidate.identity.setId ?? raw?.set_id ?? null,
    set_name: candidate.identity.setName ?? raw?.set_name ?? null,
    image_small: candidate.identity.imageSmall ?? raw?.image_small ?? null,
    image_large: candidate.identity.imageLarge ?? raw?.image_large ?? null,
    rarity: candidate.identity.rarity ?? raw?.rarity ?? null,
    marketValue: raw?.marketValue ?? null,
    isDuplicate: raw?.isDuplicate,
    confidence: candidate.confidence,
    raw: raw?.raw ?? candidate.raw,
    provider: raw?.provider ?? candidate.engineId,
  };
}

export function buildLegacyRecognitionRequest(
  images: string[],
  binderId?: string,
  hints?: ScanIdentifyHints
): RecognitionRequest {
  const anonymousScanId = hints?.scanSessionId ?? createAnonymousScanId();
  return {
    anonymousScanId,
    requestedAt: new Date().toISOString(),
    cards: images.map((base64, index) => ({
      id: `${anonymousScanId}:image-${index}`,
      base64,
      sourceRole: index === 0 ? 'primary' : 'alternate',
    })),
    binderId: binderId ?? null,
    scanMode: null,
    itemType: hints?.itemType ?? null,
    isSlab: hints?.isSlab ?? null,
    ocrEvidence: {
      rawText: hints?.ocrText ?? null,
      language: hints?.language ?? null,
      nameHint: hints?.nameHint ?? null,
      printedNumber: hints?.printedNumber
        ? {
            number: hints.printedNumber.number,
            total: hints.printedNumber.total,
          }
        : null,
      setId: hints?.setId ?? null,
    },
    legacyContext: {
      images,
      hints,
    },
  };
}

export function recognitionResultToLegacyIdentifyResult(
  result: RecognitionResult,
  fallbackDiagnostics?: ScanIdentifyDiagnostics | null
): IdentifyCardsDetailedResult {
  const cards = result.candidates.map(recognitionCandidateToIdentifiedCard);
  const legacyDiagnostics = result.diagnostics.legacyDiagnostics as ScanIdentifyDiagnostics | undefined;
  const shadowMode = result.diagnostics.shadowMode ?? legacyDiagnostics?.shadowMode ?? null;
  return {
    cards,
    diagnostics: legacyDiagnostics ? {
      ...legacyDiagnostics,
      shadowMode,
    } : fallbackDiagnostics ? {
      ...fallbackDiagnostics,
      shadowMode,
    } : {
      totalMs: result.diagnostics.totalDurationMs,
      imageCount: result.candidates.length ? result.candidates.length : (result.diagnostics.events[0]?.candidateCount ?? 0),
      candidateCount: cards.length,
      providers: [],
      notes: result.diagnostics.notes ?? [],
      shadowMode,
    },
  };
}

export const existingLegacyEngine: RecognitionEngine = {
  id: 'existing_legacy_engine',
  modelManifest: EXISTING_LEGACY_MODEL_MANIFEST,
  catalogueManifest: EXISTING_LEGACY_CATALOGUE_MANIFEST,
  async recognize(request: RecognitionRequest): Promise<RecognitionResult> {
    const startedAt = Date.now();
    const images = request.legacyContext?.images ?? request.cards
      .map((card) => card.base64)
      .filter((base64): base64 is string => Boolean(base64));
    const hints = request.legacyContext?.hints as ScanIdentifyHints | undefined;
    const legacyResult = await identifyCardsWithLegacyEngine(images, request.binderId ?? undefined, hints);
    const candidates = legacyResult.cards.map(identifiedCardToRecognitionCandidate);

    return {
      outcome: candidates.length ? 'review_required' : 'rescan_required',
      engineId: 'existing_legacy_engine',
      candidates,
      acceptedCandidate: null,
      diagnostics: createScannerDiagnostics({
        anonymousScanId: request.anonymousScanId,
        startedAt: request.requestedAt,
        finishedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - startedAt,
        engineId: 'existing_legacy_engine',
        modelManifest: EXISTING_LEGACY_MODEL_MANIFEST,
        catalogueManifest: EXISTING_LEGACY_CATALOGUE_MANIFEST,
        notes: legacyResult.diagnostics.notes ?? [],
        legacyDiagnostics: legacyResult.diagnostics,
      }),
      error: candidates.length ? null : {
        code: 'NO_LEGACY_MATCH',
        message: 'The existing recognition route did not return a card candidate.',
        retriable: true,
      },
    };
  },
};
