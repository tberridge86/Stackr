import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { Stack, router, useLocalSearchParams, usePathname } from 'expo-router';
import { decode as decodeJpeg } from 'jpeg-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Polygon } from 'react-native-svg';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { identifyCardsDetailed, type IdentifiedCard, type ScanIdentifyDiagnostics } from '../../lib/recognition/orchestrator';
import { getRecognitionFeatureFlags } from '../../lib/recognition/featureFlags';
import { warmLocalOnDeviceV1 } from '../../lib/recognition/localOnDeviceInference';
import {
  getLocalQuickScanGuidance,
  mapScannerCaptureStateToLocalQuickScanState,
  normaliseLocalQuickScanReason,
  shouldShowLocalQuickScanOfflineIndicator,
} from '../../lib/localQuickScanExperience';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import {
  captureRectToManipulatorCrop,
  createCapturedFrame,
  expandCropRect,
  getCropFromPreviewRect,
  type CapturedFrame,
  type CaptureRect,
} from '../../lib/captureGeometry';
import {
  CARD_LOCALISATION_ENABLED,
  CARD_LOCALISATION_SAFETY_MARGIN,
  CARD_LOCALISATION_SAMPLE_FPS,
  CAPTURE_GEOMETRY_V2_ENABLED,
  SCAN_AUTO_CAPTURE_V2_ENABLED,
  SCAN_BINDER_PAGE_REMOTE_CONCURRENCY,
  SCAN_BINDER_PAGE_V2_ENABLED,
  SCAN_LOCAL_OCR_MATCHER_ENABLED,
  SCAN_QUALITY_DEVICE_PROFILE,
  SCAN_QUALITY_DIAGNOSTICS_ENABLED,
  SCAN_QUALITY_ENABLED,
} from '../../lib/config';
import {
  getCardLocalisationGuidance,
  localiseCardFromJpegBase64,
  perspectiveCorrectCardJpegBase64,
  smoothCardLocalisation,
  type CardLocalisationResult,
} from '../../lib/cardLocalisation';
import {
  evaluateScanQuality,
  type ScanQualityResult,
} from '../../lib/scanQuality';
import {
  fetchActiveScannerThresholdSet,
  getAutoCaptureThresholds,
  getDefaultScannerThresholdSet,
  getScanQualityCalibration,
  type ScannerThresholdSet,
} from '../../lib/scannerCalibration';
import {
  extractLocalOcrSignals,
  matchLocalOcrCandidates,
  type LocalOcrCandidateMatch,
  type LocalOcrMatchResult,
  type LocalOcrRegionRole,
  type LocalOcrRegionText,
} from '../../lib/localOcrCardMatcher';
import {
  evaluateStableAutoCapture,
  transitionScannerCaptureState,
  type ScannerCaptureState,
} from '../../lib/scanAutoCaptureState';
import { saveScanAttemptDiagnostics } from '../../lib/scanDiagnostics';
import { logScanLearningEvent } from '../../lib/scanLearning';
import {
  SCANNER_RECOGNITION_PIPELINE_VERSION,
  rankScannerCandidates,
  validateScannerFrame,
} from '../../lib/scannerRecognitionPipeline';
import { getScannerClientContext } from '../../lib/scannerClientContext';
import {
  buildScannerAnalyticsMetadata,
  classifyScannerErrorCategory,
  getMatchSource,
  getRemoteEndpointUsed,
  getRemoteRequestMs,
  getScannerFeatureFlags,
  type ScannerTimingMetrics,
} from '../../lib/scannerAnalytics';
import {
  BINDER_PAGE_LAYOUTS,
  BINDER_PAGE_LAYOUT_STORAGE_KEY,
  DEFAULT_BINDER_PAGE_LAYOUT,
  assessBinderPocketImage,
  createBinderPageGridCells,
  getBinderPocketStatusFromCandidates,
  markDuplicatePocketCandidates,
  normalizeBinderPageLayout,
  runWithConcurrency,
  type BinderPageLayout,
  type BinderPagePocketResult,
  type BinderPocketCandidate,
} from '../../lib/binderPageScan';
import { saveBinderPageScanSession, updateBinderPageScanSession } from '../../lib/binderPageScanStore';
import {
  getScanIntentConfig,
  isBinderScanIntent,
  isListingScanIntent,
  resolveScanIntent,
} from '../../lib/scanIntent';
import { isPremiumSellerInventoryScan } from '../../lib/sellerScanAccess';
import { scanStore } from '../../lib/scanStore';
import { supabase } from '../../lib/supabase';
import { stackrApiClient } from '../../lib/stackrApiV1';
import { fetchStackrCardRows } from '../../lib/stackrDomainAdapter';
import { hydrateScanCardRowsWithLiveTcgdexReferences } from '../../lib/scanCardReferenceHydration';
import { attachLiveTcgdexCardReferences } from '../../lib/pokemonTcg';
import {
  serializeScanCardsForNavigation,
  toScanResultNavigationCard as toResultCard,
  type ScanResultNavigationCard as ScanResultCard,
} from '../../lib/scanNavigationSerialization';
import {
  getPersistentStackrCatalogueCache,
  stackrCachedCardToIdentifiedCard,
  syncStackrCatalogueInBackground,
} from '../../lib/stackrCatalogueCache';

const CARD_ASPECT_RATIO = 0.716;
const MAX_RESULT_CARDS = 3;
const FRAME_CHECK_WIDTH = 180;
const LOCALISATION_FRAME_CHECK_WIDTH = 320;
const LOCALISATION_OUTPUT_WIDTH = 720;
const AUTO_FRAME_CHECK_INTERVAL_MS = 1350;
const DEFAULT_SCANNER_THRESHOLD_SET = getDefaultScannerThresholdSet();
const SCAN_FRAME_SIDE_INSET = 28;
const SCAN_FRAME_SIDE_INSET_COMPACT = 22;
const OPTIMUM_SCAN_FRAME_WIDTH_RATIO = 0.78;
const OPTIMUM_SCAN_FRAME_MIN_WIDTH = 238;
const LOCAL_QUICK_SCAN_FRAME_WIDTH_RATIO = 0.86;
const LOCAL_QUICK_SCAN_FRAME_MIN_WIDTH = 264;
const BINDER_PAGE_FRAME_WIDTH_RATIO = 0.84;
const BINDER_PAGE_FRAME_MAX_WIDTH = 360;
const BINDER_PAGE_OUTPUT_WIDTH = 1500;
const BINDER_PAGE_POCKET_OUTPUT_WIDTH = 520;
const SCAN_CROP_PADDING_RATIO = 0.12;
const OCR_REGION_SPECS: TargetedOcrRegionSpec[] = [
  { role: 'name', x: 0.035, y: 0.018, width: 0.72, height: 0.13, resizeWidth: 760 },
  { role: 'hp', x: 0.66, y: 0.018, width: 0.31, height: 0.12, resizeWidth: 420 },
  { role: 'collector-number', x: 0.015, y: 0.84, width: 0.46, height: 0.14, resizeWidth: 620 },
  { role: 'set-code', x: 0.015, y: 0.76, width: 0.5, height: 0.2, resizeWidth: 660 },
  { role: 'copyright', x: 0.36, y: 0.84, width: 0.62, height: 0.14, resizeWidth: 760 },
];

function getLocalisationSampleIntervalMs() {
  const fps = Number.isFinite(CARD_LOCALISATION_SAMPLE_FPS)
    ? Math.max(1, Math.min(8, CARD_LOCALISATION_SAMPLE_FPS))
    : 4;
  return Math.max(160, Math.round(1000 / fps));
}

type DiagnosticLogPayload = Record<string, unknown>;

type ScanMode = 'auto' | 'manual';

type CapturedPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

type RecognitionImage = {
  uri: string;
  width?: number;
  height?: number;
  base64?: string | null;
  role: string;
  localisation?: CardLocalisationResult | null;
};

type TargetedOcrRegionSpec = {
  role: LocalOcrRegionRole;
  x: number;
  y: number;
  width: number;
  height: number;
  resizeWidth: number;
};

type TargetedOcrResult = {
  sourceRole: string;
  regions: LocalOcrRegionText[];
  text: string;
};

type BinderPagePocketImage = {
  cell: {
    index: number;
    row: number;
    column: number;
    crop: CaptureRect;
  };
  uri: string;
  width?: number;
  height?: number;
  base64?: string | null;
};

type FrameAssessment = {
  ready: boolean;
  message: string;
  reason: string;
  score: number;
  brightness: number;
  contrast: number;
  edgeDensity: number;
  glareRatio: number;
};

type ScanRouteParams = {
  intent?: string | string[];
  mode?: string | string[];
  flow?: string | string[];
  type?: string | string[];
  reason?: string | string[];
  scanMode?: string | string[];
  q?: string | string[];
  binderId?: string | string[];
  layout?: string | string[];
  parentSessionId?: string | string[];
  replacePocketIndex?: string | string[];
};

function logCameraDiagnostic(event: string, payload: DiagnosticLogPayload = {}) {
  console.log('[scan-camera]', event, payload);
}

function getParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function getMountErrorMessage(error: unknown) {
  if (!error) return 'Unknown native mount error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;

  const maybeError = error as {
    message?: unknown;
    code?: unknown;
    nativeEvent?: {
      message?: unknown;
      code?: unknown;
    };
  };
  const nativeMessage = maybeError.nativeEvent?.message;
  const message = maybeError.message;
  const nativeCode = maybeError.nativeEvent?.code;
  const code = maybeError.code;

  return [
    typeof nativeCode === 'string' ? nativeCode : typeof code === 'string' ? code : null,
    typeof nativeMessage === 'string' ? nativeMessage : typeof message === 'string' ? message : null,
  ].filter(Boolean).join(': ') || JSON.stringify(error);
}

function compactNumber(value?: string | null) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function estimateBase64Bytes(base64?: string | null) {
  const cleanBase64 = stripBase64ImagePrefix(base64 ?? '');
  return cleanBase64 ? Math.round(cleanBase64.length * 0.75) : null;
}

function buildFrameAssessment(overrides: Partial<FrameAssessment>): FrameAssessment {
  return {
    ready: false,
    message: 'Centre one card. Keep other cards in the dim area.',
    reason: 'waiting',
    score: 0,
    brightness: 0,
    contrast: 0,
    edgeDensity: 0,
    glareRatio: 0,
    ...overrides,
  };
}

function getLuma(data: Uint8Array, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function assessFrameImage(base64?: string | null): FrameAssessment {
  const cleanBase64 = stripBase64ImagePrefix(base64 ?? '');
  if (!cleanBase64) {
    return buildFrameAssessment({
      message: 'Centre one card. Keep other cards in the dim area.',
      reason: 'empty-image',
    });
  }

  try {
    const image = decodeJpeg(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
    const { width, height, data } = image;
    if (!width || !height || !data?.length) {
      return buildFrameAssessment({
        message: 'Centre one card. Keep other cards in the dim area.',
        reason: 'unreadable-image',
      });
    }

    const step = Math.max(1, Math.floor(Math.min(width, height) / 90));
    let count = 0;
    let sum = 0;
    let sumSq = 0;
    let glarePixels = 0;
    let darkPixels = 0;
    let edgePixels = 0;

    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const luma = getLuma(data, width, x, y);
        const right = getLuma(data, width, x + step, y);
        const down = getLuma(data, width, x, y + step);
        const gradient = Math.abs(luma - right) + Math.abs(luma - down);

        count += 1;
        sum += luma;
        sumSq += luma * luma;
        if (luma > 238) glarePixels += 1;
        if (luma < 36) darkPixels += 1;
        if (gradient > 54) edgePixels += 1;
      }
    }

    const brightness = count ? sum / count : 0;
    const variance = count ? Math.max(0, sumSq / count - brightness * brightness) : 0;
    const contrast = Math.sqrt(variance);
    const edgeDensity = count ? edgePixels / count : 0;
    const glareRatio = count ? glarePixels / count : 0;
    const darkRatio = count ? darkPixels / count : 0;
    const detailScore = Math.min(1, edgeDensity / 0.09);
    const contrastScore = Math.min(1, contrast / 44);
    const lightPenalty = brightness < 62 ? 0.24 : brightness > 226 ? 0.18 : 0;
    const glarePenalty = glareRatio > 0.2 ? 0.18 : 0;
    const score = Math.max(0, Math.min(1, detailScore * 0.58 + contrastScore * 0.42 - lightPenalty - glarePenalty));

    if (brightness < 48 || darkRatio > 0.46) {
      return buildFrameAssessment({
        message: 'Too dark. Add light or turn on the torch.',
        reason: 'too-dark',
        score,
        brightness,
        contrast,
        edgeDensity,
        glareRatio,
      });
    }

    if (glareRatio > 0.28 || (brightness > 224 && contrast < 35)) {
      return buildFrameAssessment({
        message: 'Glare detected. Tilt the card slightly.',
        reason: 'glare',
        score,
        brightness,
        contrast,
        edgeDensity,
        glareRatio,
      });
    }

    if (contrast < 16 || edgeDensity < 0.026) {
      return buildFrameAssessment({
        message: 'Centre one card. Keep other cards in the dim area.',
        reason: 'no-card-detail',
        score,
        brightness,
        contrast,
        edgeDensity,
        glareRatio,
      });
    }

    if (edgeDensity > 0.32 && contrast > 82 && glareRatio < 0.12) {
      return buildFrameAssessment({
        message: 'Move back until every card edge sits inside the window.',
        reason: 'too-close',
        score,
        brightness,
        contrast,
        edgeDensity,
        glareRatio,
      });
    }

    if (edgeDensity < 0.046 || score < 0.56) {
      return buildFrameAssessment({
        message: 'Move closer until the card matches the purple window.',
        reason: 'too-far',
        score,
        brightness,
        contrast,
        edgeDensity,
        glareRatio,
      });
    }

    return buildFrameAssessment({
      ready: true,
      message: 'Card found. Hold steady...',
      reason: 'ready',
      score,
      brightness,
      contrast,
      edgeDensity,
      glareRatio,
    });
  } catch {
    return buildFrameAssessment({
      message: 'Centre one card. Keep other cards in the dim area.',
      reason: 'decode-failed',
    });
  }
}

function getIdentifiedName(card?: IdentifiedCard | null) {
  const raw = card?.raw as any;
  return card?.name
    ?? raw?.name
    ?? raw?.card?.name
    ?? raw?.cards?.[0]?.name
    ?? raw?.matches?.[0]?.name
    ?? null;
}

function getIdentifiedNumber(card?: IdentifiedCard | null) {
  const raw = card?.raw as any;
  return card?.number
    ?? raw?.number
    ?? raw?.card?.number
    ?? raw?.cards?.[0]?.number
    ?? raw?.matches?.[0]?.number
    ?? null;
}

function getIdentifiedSetName(card?: IdentifiedCard | null) {
  const raw = card?.raw as any;
  return card?.set_name
    ?? raw?.set_name
    ?? raw?.setName
    ?? raw?.set
    ?? raw?.card?.set_name
    ?? raw?.card?.setName
    ?? raw?.card?.set?.name
    ?? raw?.cards?.[0]?.set?.name
    ?? raw?.matches?.[0]?.set?.name
    ?? null;
}

function getIdentifiedSetId(card?: IdentifiedCard | null) {
  const raw = card?.raw as any;
  return card?.set_id
    ?? raw?.set_id
    ?? raw?.setId
    ?? raw?.card?.set_id
    ?? raw?.card?.setId
    ?? raw?.card?.set?.id
    ?? raw?.cards?.[0]?.set?.id
    ?? raw?.matches?.[0]?.set?.id
    ?? null;
}

function buildIdentifySearchQuery(card?: IdentifiedCard | null) {
  const name = getIdentifiedName(card);
  const setName = getIdentifiedSetName(card);
  const number = getIdentifiedNumber(card);
  return [name, setName, number ? `#${number}` : null].filter(Boolean).join(' ').trim();
}

function buildOcrSearchQuery(text?: string | null) {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2 && !/^(hp|basic|stage|weakness|resistance|retreat)$/i.test(line))
    .slice(0, 8)
    .join(' ')
    .slice(0, 220);
}

function readScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return score > 1 ? score / 100 : score;
}

function getScanSignals(card?: IdentifiedCard | null) {
  const raw = card?.raw as any;
  const visualSimilarity = readScore(
    raw?.similarity
    ?? raw?.visualSimilarity
    ?? raw?.signals?.visualSimilarity
    ?? raw?.score?.visualEmbedding
    ?? raw?.score?.artworkSimilarity
  );
  const finalScore = readScore(
    raw?.finalScore
    ?? raw?.signals?.finalScore
    ?? raw?.score?.finalScore
  );
  const confidence = readScore(card?.confidence ?? raw?.confidence ?? raw?.score?.finalScore);

  return {
    scan_provider: card?.provider ?? null,
    scan_confidence: confidence != null ? Math.round(confidence * 100) : null,
    scan_visual_similarity: visualSimilarity,
    scan_final_score: finalScore,
  };
}

function localOcrCandidateToIdentifiedCard(candidate: LocalOcrCandidateMatch): IdentifiedCard {
  const card = candidate.card;
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    set_id: card.set_id,
    set_name: card.set_name,
    image_small: card.image_small,
    image_large: card.image_small,
    rarity: card.rarity,
    confidence: candidate.confidence,
    provider: 'local-ocr',
    raw: {
      localOcr: true,
      reasons: candidate.reasons,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      ambiguousVariant: candidate.ambiguousVariant,
      visualSimilarity: candidate.visualSimilarity ?? null,
      finalScore: candidate.confidence,
      set: {
        id: card.set_id,
        name: card.set_name,
        printedTotal: card.set_printed_total,
        releaseDate: card.release_date,
      },
    },
  };
}

function getIdentifiedCandidateKey(card: IdentifiedCard) {
  return [
    card.id,
    card.name?.toLowerCase(),
    card.set_id?.toLowerCase(),
    card.number?.toLowerCase(),
  ].filter(Boolean).join('|');
}

function rankIdentifiedCardsWithPipeline(
  identified: IdentifiedCard[],
  ocrSignals?: LocalOcrMatchResult['signals'] | null
) {
  if (identified.length <= 1) return identified;

  const ranked = rankScannerCandidates({
    ocrSignals: ocrSignals ?? null,
    candidates: identified.map((card) => {
      const raw = card.raw as any;
      return {
        id: card.id ?? null,
        name: card.name ?? null,
        setId: card.set_id ?? null,
        setName: card.set_name ?? null,
        collectorNumber: card.number ?? null,
        language: raw?.language ?? raw?.card?.language ?? ocrSignals?.language ?? null,
        provider: card.provider ?? null,
        confidence: card.confidence ?? null,
        reasons: Array.isArray(raw?.reasons) ? raw.reasons.map(String) : null,
        evidence: {
          providerScore: card.confidence ?? null,
          artworkEmbedding: readScore(
            raw?.similarity
            ?? raw?.visualSimilarity
            ?? raw?.signals?.visualSimilarity
            ?? raw?.score?.visualEmbedding
            ?? raw?.score?.artworkSimilarity
          ),
        },
      };
    }),
  });
  const rankByKey = new Map(ranked.map((candidate, index) => [
    [
      candidate.id,
      candidate.name?.toLowerCase(),
      candidate.setId?.toLowerCase(),
      candidate.collectorNumber?.toLowerCase(),
    ].filter(Boolean).join('|'),
    { index, candidate },
  ]));

  return [...identified]
    .sort((a, b) => (
      (rankByKey.get(getIdentifiedCandidateKey(a))?.index ?? 999)
      - (rankByKey.get(getIdentifiedCandidateKey(b))?.index ?? 999)
    ))
    .map((card) => {
      const rankedCandidate = rankByKey.get(getIdentifiedCandidateKey(card))?.candidate;
      if (!rankedCandidate) return card;
      return {
        ...card,
        raw: {
          ...((card.raw as any) ?? {}),
          scannerPipelineRank: {
            version: SCANNER_RECOGNITION_PIPELINE_VERSION,
            score: rankedCandidate.score,
            confidence: rankedCandidate.confidence,
            reasons: rankedCandidate.rankReasons,
            evidence: rankedCandidate.evidenceBreakdown,
          },
        },
      };
    });
}

function buildLocalOcrDiagnostics(
  result: LocalOcrMatchResult | null,
  imageCount: number
): ScanIdentifyDiagnostics | null {
  if (!result) return null;
  const top = result.bestMatch;
  return {
    totalMs: result.durationMs,
    imageCount,
    candidateCount: result.candidates.length,
    providers: [{
      provider: 'local-ocr',
      stage: 'targeted_ocr_catalogue_match',
      ok: result.status !== 'disabled' && result.status !== 'no-text',
      durationMs: result.durationMs,
      decision: result.status,
      candidateCount: result.candidates.length,
      accepted: result.status === 'strong',
      topCandidate: top ? {
        provider: 'local-ocr',
        id: top.card.id,
        name: top.card.name,
        number: top.card.number,
        set_id: top.card.set_id,
        set_name: top.card.set_name,
        confidence: top.confidence,
        visualSimilarity: top.visualSimilarity ?? null,
        finalScore: top.confidence,
        accepted: result.status === 'strong',
        rejectionReason: result.status === 'strong' ? null : result.status,
        reasons: top.reasons,
      } : null,
      candidates: result.candidates.slice(0, 8).map((candidate) => ({
        provider: 'local-ocr',
        id: candidate.card.id,
        name: candidate.card.name,
        number: candidate.card.number,
        set_id: candidate.card.set_id,
        set_name: candidate.card.set_name,
        confidence: candidate.confidence,
        visualSimilarity: candidate.visualSimilarity ?? null,
        finalScore: candidate.confidence,
        accepted: result.status === 'strong' && candidate.card.id === top?.card.id,
        rejectionReason: candidate.ambiguousVariant ? 'ambiguous-variant' : null,
        reasons: candidate.reasons,
      })),
      signals: {
        language: result.signals.language,
        printedNumber: result.signals.printedNumber,
        setCode: result.signals.setCode,
        releaseYear: result.signals.releaseYear,
        hp: result.signals.hp,
        notes: result.notes,
      },
    }],
    notes: [
      `local-ocr:${result.status}`,
      ...result.notes,
    ],
  };
}

function attachScanSignals(card: ScanResultCard, identified: IdentifiedCard[]): ScanResultCard {
  const source = identified.find((item) => item.id && item.id === card.id)
    ?? identified.find((item) => {
      const nameMatch = item.name && item.name.toLowerCase() === card.name.toLowerCase();
      const numberMatch = item.number && compactNumber(item.number) === compactNumber(card.number);
      return Boolean(nameMatch && numberMatch);
    })
    ?? null;

  if (!source) return card;
  return {
    ...card,
    ...getScanSignals(source),
  };
}

function buildLearningCandidates(cards: (IdentifiedCard | ScanResultCard)[]) {
  return cards.map((card) => {
    const identified = card as IdentifiedCard;
    const result = card as ScanResultCard;
    const signals = 'provider' in card ? getScanSignals(identified) : {
      scan_provider: result.scan_provider ?? null,
      scan_confidence: result.scan_confidence ?? null,
      scan_visual_similarity: result.scan_visual_similarity ?? null,
      scan_final_score: result.scan_final_score ?? null,
    };

    return {
      id: card.id ?? null,
      name: card.name ?? null,
      set_id: ('set_id' in card ? card.set_id : identified.set_id) ?? null,
      set_name: ('set_name' in card ? card.set_name : identified.set_name) ?? null,
      number: card.number ?? null,
      provider: signals.scan_provider ?? null,
      confidence: signals.scan_confidence ?? null,
      visualSimilarity: signals.scan_visual_similarity ?? null,
      finalScore: signals.scan_final_score ?? null,
    };
  });
}

function compactFrameMetrics(assessment?: FrameAssessment | null) {
  return assessment ? {
    ready: assessment.ready,
    reason: assessment.reason,
    score: Number(assessment.score.toFixed(3)),
    brightness: Number(assessment.brightness.toFixed(1)),
    contrast: Number(assessment.contrast.toFixed(1)),
    edgeDensity: Number(assessment.edgeDensity.toFixed(3)),
    glareRatio: Number(assessment.glareRatio.toFixed(3)),
  } : {};
}

function compactScanQualityDiagnostics(quality?: ScanQualityResult | null) {
  if (!quality) return null;
  return {
    passed: quality.passed,
    instruction: quality.instruction,
    focusScore: quality.focusScore,
    glareScore: quality.glareScore,
    exposureScore: quality.exposureScore,
    framingScore: quality.framingScore,
    stabilityScore: quality.stabilityScore,
    obstructionScore: quality.obstructionScore,
    perspectiveScore: quality.perspectiveScore,
    sleeveReflectionScore: quality.sleeveReflectionScore,
    failures: quality.failures.map((failure) => ({
      code: failure.code,
      instruction: failure.instruction,
      score: failure.score,
      mandatory: failure.mandatory,
    })),
    metrics: quality.metrics,
  };
}

function frameAssessmentFromScanQuality(quality: ScanQualityResult): FrameAssessment {
  const score = Math.min(
    quality.focusScore,
    quality.glareScore,
    quality.exposureScore,
    quality.framingScore,
    quality.stabilityScore,
    quality.obstructionScore,
    quality.perspectiveScore,
    quality.sleeveReflectionScore
  );
  const failure = quality.failures[0] ?? null;

  return buildFrameAssessment({
    ready: quality.passed,
    message: quality.instructionText,
    reason: String(failure?.code ?? (quality.passed ? 'ready' : quality.instruction ?? 'quality-failed')),
    score: quality.passed ? 1 : score,
    brightness: quality.metrics.brightness,
    contrast: quality.metrics.contrast,
    edgeDensity: quality.metrics.edgeDensity,
    glareRatio: quality.metrics.glareRatio,
  });
}

function compactLocalisationDiagnostics(localisation?: CardLocalisationResult | null) {
  if (!localisation) return null;
  return {
    status: localisation.status,
    score: localisation.confidence.score,
    reasons: localisation.confidence.reasons,
    frameCoverage: localisation.confidence.frameCoverage,
    aspectRatio: localisation.confidence.aspectRatio,
    edgeCompleteness: localisation.confidence.edgeCompleteness,
    cornersDetected: localisation.confidence.cornersDetected,
    cornerSource: localisation.confidence.cornerSource,
    requiresManualAdjustment: localisation.requiresManualAdjustment,
    crop: localisation.crop ?? null,
    transformMatrix: localisation.transformMatrix ?? null,
  };
}

function getLocalisationTone(localisation?: CardLocalisationResult | null) {
  if (!localisation) return null;
  if (localisation.status === 'confident') return '#22C55E';
  if (localisation.status === 'uncertain') return '#FBBF24';
  return '#A78BFA';
}

function localisationQuadToFramePolygon(
  localisation: CardLocalisationResult | null | undefined,
  frame: { top: number; left: number; width: number; height: number }
) {
  if (!localisation?.quadrilateral || !localisation.imageSize.width || !localisation.imageSize.height) return '';
  const map = (point: { x: number; y: number }) => {
    const x = frame.left + (point.x / localisation.imageSize.width) * frame.width;
    const y = frame.top + (point.y / localisation.imageSize.height) * frame.height;
    return `${Number(x.toFixed(1))},${Number(y.toFixed(1))}`;
  };
  return [
    map(localisation.quadrilateral.topLeft),
    map(localisation.quadrilateral.topRight),
    map(localisation.quadrilateral.bottomRight),
    map(localisation.quadrilateral.bottomLeft),
  ].join(' ');
}

function getGuidanceIcon(reason?: string | null, ready?: boolean, capturing?: boolean) {
  if (capturing) return 'sync-outline';
  if (ready) return 'checkmark-circle-outline';
  if (reason === 'too-dark' || reason === 'improve-lighting') return 'moon-outline';
  if (reason === 'glare' || reason === 'reduce-glare' || reason === 'overexposed' || reason === 'sleeve-reflection') return 'sunny-outline';
  if (reason === 'too-close') return 'contract-outline';
  if (reason === 'too-far' || reason === 'move-closer') return 'expand-outline';
  if (reason === 'hold-steady') return 'hand-left-outline';
  if (reason === 'tap-to-focus') return 'radio-button-on-outline';
  return 'scan-outline';
}

function getGuidanceLabelForState(state: ScannerCaptureState, scanMode: ScanMode) {
  switch (state) {
    case 'INITIALISING':
      return 'Warming up';
    case 'CARD_FOUND':
      return 'Card found';
    case 'QUALITY_CHECK':
      return 'Quality check';
    case 'HOLD_STEADY':
      return 'Hold steady';
    case 'CAPTURING':
      return 'Capturing';
    case 'CAPTURED':
      return 'Captured';
    case 'IDENTIFYING':
      return 'Identifying';
    case 'CONFIRMING':
      return 'Confirm match';
    case 'ERROR':
      return 'Try again';
    case 'SEARCHING':
    default:
      return scanMode === 'auto' ? 'Auto scan' : 'Manual capture';
  }
}

function buildResultCandidateDiagnostics(cards: ScanResultCard[]) {
  return cards.slice(0, MAX_RESULT_CARDS).map((card) => ({
    id: card.id,
    name: card.name,
    number: card.number,
    set_id: card.set_id,
    set_name: card.set_name,
    provider: card.scan_provider ?? null,
    confidence: card.scan_confidence ?? null,
    visualSimilarity: card.scan_visual_similarity ?? null,
    finalScore: card.scan_final_score ?? null,
  }));
}

function sortBestMatches(rows: any[], identified?: IdentifiedCard | null) {
  const identifiedNumber = compactNumber(getIdentifiedNumber(identified));
  const identifiedSetId = String(getIdentifiedSetId(identified) ?? '');

  return [...rows].sort((a, b) => {
    const aExactSet = identifiedSetId && a.set_id === identifiedSetId ? 1 : 0;
    const bExactSet = identifiedSetId && b.set_id === identifiedSetId ? 1 : 0;
    if (aExactSet !== bExactSet) return bExactSet - aExactSet;

    const aExactNumber = identifiedNumber && compactNumber(a.number) === identifiedNumber ? 1 : 0;
    const bExactNumber = identifiedNumber && compactNumber(b.number) === identifiedNumber ? 1 : 0;
    if (aExactNumber !== bExactNumber) return bExactNumber - aExactNumber;

    return 0;
  });
}

function identifiedToSearchFallback(card: IdentifiedCard): any | null {
  if (!card.id || !card.name) return null;
  return {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    rarity: card.rarity ?? '',
    set_id: card.set_id ?? '',
    set_name: card.set_name ?? '',
    image_small: card.image_small ?? card.image_large ?? '',
    image_large: card.image_large ?? card.image_small ?? null,
    raw_data: {
      images: {
        small: card.image_small ?? null,
        large: card.image_large ?? null,
      },
      set: {
        id: card.set_id ?? '',
        name: card.set_name ?? '',
      },
      rarity: card.rarity ?? null,
    },
  };
}

function getOcrSourceImage(images: RecognitionImage[]) {
  return images.find((image) => image.role === 'localised-card-crop')
    ?? images.find((image) => image.role === 'target-crop')
    ?? images[0]
    ?? null;
}

function getOcrRegionCrop(image: RecognitionImage, spec: TargetedOcrRegionSpec) {
  const width = Number(image.width);
  const height = Number(image.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const originX = Math.max(0, Math.round(width * spec.x));
  const originY = Math.max(0, Math.round(height * spec.y));
  const cropWidth = Math.max(1, Math.min(width - originX, Math.round(width * spec.width)));
  const cropHeight = Math.max(1, Math.min(height - originY, Math.round(height * spec.height)));
  return {
    originX,
    originY,
    width: cropWidth,
    height: cropHeight,
  };
}

function combineOcrRegions(regions: LocalOcrRegionText[]) {
  return Array.from(new Set(
    regions
      .flatMap((region) => region.text.split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean)
  )).join('\n');
}

function buildLocalOcrSearchQuery(result?: LocalOcrMatchResult | null) {
  if (!result) return '';
  const signals = result.signals;
  const printed = signals.printedNumber
    ? `${signals.printedNumber.normalisedNumber}${signals.printedNumber.normalisedDenominator ? `/${signals.printedNumber.normalisedDenominator}` : ''}`
    : '';
  return [
    signals.nameText,
    signals.setCode,
    printed,
    signals.releaseYear ? String(signals.releaseYear) : '',
  ].filter(Boolean).join(' ').trim().slice(0, 220);
}

function mergeIdentifiedCards(primary: IdentifiedCard[], secondary: IdentifiedCard[]) {
  const seen = new Set<string>();
  const merged: IdentifiedCard[] = [];
  for (const card of [...primary, ...secondary]) {
    const key = card.id
      ? `id:${card.id}`
      : [card.name, card.set_id, card.set_name, card.number].filter(Boolean).join('|').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(card);
  }
  return merged;
}

function mergeIdentifyDiagnostics(
  localDiagnostics: ScanIdentifyDiagnostics | null,
  remoteDiagnostics: ScanIdentifyDiagnostics | null,
  imageCount: number
): ScanIdentifyDiagnostics | null {
  if (!localDiagnostics) return remoteDiagnostics;
  if (!remoteDiagnostics) return localDiagnostics;
  return {
    totalMs: localDiagnostics.totalMs + remoteDiagnostics.totalMs,
    imageCount,
    candidateCount: localDiagnostics.candidateCount + remoteDiagnostics.candidateCount,
    providers: [
      ...localDiagnostics.providers,
      ...remoteDiagnostics.providers,
    ],
    notes: [
      ...(localDiagnostics.notes ?? []),
      ...(remoteDiagnostics.notes ?? []),
    ],
  };
}

function buildLegacyPhotoCrop(
  frame: { top: number; left: number; width: number; height: number },
  viewport: { width: number; height: number },
  photo: { width?: number; height?: number },
  paddingRatio = SCAN_CROP_PADDING_RATIO
) {
  const photoWidth = Number(photo.width);
  const photoHeight = Number(photo.height);
  if (!Number.isFinite(photoWidth) || !Number.isFinite(photoHeight) || photoWidth <= 0 || photoHeight <= 0) {
    return null;
  }

  const scale = Math.max(viewport.width / photoWidth, viewport.height / photoHeight);
  const displayedWidth = photoWidth * scale;
  const displayedHeight = photoHeight * scale;
  const offsetX = Math.max(0, (displayedWidth - viewport.width) / 2);
  const offsetY = Math.max(0, (displayedHeight - viewport.height) / 2);

  const originX = (frame.left + offsetX) / scale;
  const originY = (frame.top + offsetY) / scale;
  const cropWidth = frame.width / scale;
  const cropHeight = frame.height / scale;
  const padding = Math.min(cropWidth, cropHeight) * paddingRatio;

  const paddedX = Math.max(0, originX - padding);
  const paddedY = Math.max(0, originY - padding);
  const paddedRight = Math.min(photoWidth, originX + cropWidth + padding);
  const paddedBottom = Math.min(photoHeight, originY + cropHeight + padding);

  const width = Math.max(1, paddedRight - paddedX);
  const height = Math.max(1, paddedBottom - paddedY);

  return {
    originX: Math.round(paddedX),
    originY: Math.round(paddedY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function expandPhotoCrop(
  crop: { originX: number; originY: number; width: number; height: number } | null,
  photo: { width?: number; height?: number },
  expansionRatio: number
) {
  if (!crop) return null;
  const photoWidth = Number(photo.width);
  const photoHeight = Number(photo.height);
  if (!Number.isFinite(photoWidth) || !Number.isFinite(photoHeight) || photoWidth <= 0 || photoHeight <= 0) {
    return crop;
  }

  const expansion = Math.min(crop.width, crop.height) * expansionRatio;
  const originX = Math.max(0, crop.originX - expansion);
  const originY = Math.max(0, crop.originY - expansion);
  const right = Math.min(photoWidth, crop.originX + crop.width + expansion);
  const bottom = Math.min(photoHeight, crop.originY + crop.height + expansion);

  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.max(1, Math.round(right - originX)),
    height: Math.max(1, Math.round(bottom - originY)),
  };
}

export default function ScanScreen() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const params = useLocalSearchParams<ScanRouteParams>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const routeInstanceId = useRef(`scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const scannerMountedAt = useRef(Date.now());
  const cameraInitialisationMsRef = useRef<number | null>(null);
  const firstCardDetectionMsRef = useRef<number | null>(null);
  const stableCaptureStartedAtRef = useRef<number | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const renderCount = useRef(0);
  const autoCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReadyFrames = useRef(0);
  const autoCheckBusy = useRef(false);
  const lastAutoCaptureAt = useRef(0);
  const frameAssessmentRef = useRef<FrameAssessment | null>(null);
  const localisationRef = useRef<CardLocalisationResult | null>(null);
  const scanQualityRef = useRef<ScanQualityResult | null>(null);
  const scannerStateRef = useRef<ScannerCaptureState>('INITIALISING');
  const appStateRef = useRef(AppState.currentState);
  const captureInFlightRef = useRef(false);
  const navigatingAwayRef = useRef(false);
  renderCount.current += 1;

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [permissionRequesting, setPermissionRequesting] = useState(false);
  const [scannerState, setScannerStateValue] = useState<ScannerCaptureState>('INITIALISING');
  const [acceptedPreviewUri, setAcceptedPreviewUri] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const returnReason = getParamValue(params.reason);
  const requestedScanMode = getParamValue(params.scanMode);
  const returnedFromRejectedMatches = returnReason === 'none_correct';
  const initialScanMode: ScanMode = requestedScanMode === 'manual' || returnedFromRejectedMatches ? 'manual' : 'auto';
  const initialQuery = getParamValue(params.q) ?? '';
  const [scanMode, setScanMode] = useState<ScanMode>(initialScanMode);
  const [binderPageLayout, setBinderPageLayout] = useState<BinderPageLayout>(DEFAULT_BINDER_PAGE_LAYOUT);
  const [binderPageProgress, setBinderPageProgress] = useState<{ processed: number; total: number } | null>(null);
  const [scanMessage, setScanMessage] = useState(
    returnedFromRejectedMatches
      ? 'No worries. Centre the right card and scan again.'
      : initialScanMode === 'manual'
        ? 'Manual mode. Centre one card in the window, then tap scan.'
        : 'Centre one card. Keep other cards in the dim area.'
  );
  const [frameAssessment, setFrameAssessment] = useState<FrameAssessment | null>(null);
  const [localisationResult, setLocalisationResult] = useState<CardLocalisationResult | null>(null);
  const [scanQualityResult, setScanQualityResult] = useState<ScanQualityResult | null>(null);
  const [lastQuery, setLastQuery] = useState(initialQuery);
  const [inlineManualSearchOpen, setInlineManualSearchOpen] = useState(false);
  const [inlineManualSearchQuery, setInlineManualSearchQuery] = useState(initialQuery);
  const [inlineManualSearchResults, setInlineManualSearchResults] = useState<ScanResultCard[]>([]);
  const [inlineManualSearchLoading, setInlineManualSearchLoading] = useState(false);
  const [scannerThresholdSet, setScannerThresholdSet] = useState<ScannerThresholdSet>(DEFAULT_SCANNER_THRESHOLD_SET);
  const scannerClientContext = useMemo(() => getScannerClientContext(), []);
  const scannerFeatureFlags = useMemo(() => getScannerFeatureFlags(), []);
  const recognitionFeatureFlags = useMemo(() => getRecognitionFeatureFlags(), []);
  const inlineManualSearchRequestRef = useRef(0);
  const autoCaptureThresholds = useMemo(() => getAutoCaptureThresholds(scannerThresholdSet), [scannerThresholdSet]);
  const autoCaptureReadyFrames = useMemo(
    () => Math.max(1, Math.round(autoCaptureThresholds.requiredStableFrames)),
    [autoCaptureThresholds.requiredStableFrames]
  );
  const autoScanCooldownMs = autoCaptureThresholds.duplicateCooldownMs;
  const scanQualityCalibration = useMemo(
    () => getScanQualityCalibration(scannerThresholdSet, SCAN_QUALITY_DEVICE_PROFILE),
    [scannerThresholdSet]
  );

  useEffect(() => {
    if (
      !recognitionFeatureFlags.localRecognitionEnabled
      && !recognitionFeatureFlags.localRecognitionShadowMode
      && !recognitionFeatureFlags.onDeviceEmbeddingEnabled
    ) {
      return;
    }

    let cancelled = false;
    void warmLocalOnDeviceV1().then((result) => {
      if (cancelled || result.status === 'ready') return;
      logCameraDiagnostic('local recognition warmup skipped', {
        status: result.status,
        code: result.error.code,
        modelVersion: result.modelVersion,
        catalogueVersion: result.catalogueVersion,
      });
    }).catch((error) => {
      if (!cancelled) {
        logCameraDiagnostic('local recognition warmup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    recognitionFeatureFlags.localRecognitionEnabled,
    recognitionFeatureFlags.localRecognitionShadowMode,
    recognitionFeatureFlags.onDeviceEmbeddingEnabled,
  ]);

  useEffect(() => {
    if (!recognitionFeatureFlags.stackrApiEnabled) return;

    let cancelled = false;
    void syncStackrCatalogueInBackground({ client: stackrApiClient }).then((result) => {
      if (cancelled || result.status !== 'sync_failed') return;
      logCameraDiagnostic('stackr catalogue background sync failed', {
        error: result.error,
      });
    }).catch((error) => {
      if (!cancelled) {
        logCameraDiagnostic('stackr catalogue background sync failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [recognitionFeatureFlags.stackrApiEnabled]);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveScannerThresholdSet().then((thresholdSet) => {
      if (!cancelled) setScannerThresholdSet(thresholdSet);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setScannerState = useCallback((event: Parameters<typeof transitionScannerCaptureState>[1]) => {
    setScannerStateValue((current) => {
      const next = transitionScannerCaptureState(current, event);
      scannerStateRef.current = next;
      return next;
    });
  }, []);

  const setScannerStateDirect = useCallback((next: ScannerCaptureState) => {
    scannerStateRef.current = next;
    setScannerStateValue(next);
  }, []);

  const applyFrameAssessment = useCallback((assessment: FrameAssessment | null) => {
    frameAssessmentRef.current = assessment;
    setFrameAssessment(assessment);
  }, []);

  const applyLocalisationResult = useCallback((localisation: CardLocalisationResult | null) => {
    localisationRef.current = localisation;
    setLocalisationResult(localisation);
  }, []);

  const applyScanQualityResult = useCallback((quality: ScanQualityResult | null) => {
    scanQualityRef.current = quality;
    setScanQualityResult(quality);
  }, []);

  const permissionStatus = permission?.status ?? 'loading';
  const permissionGranted = Boolean(permission?.granted);
  const shouldRenderCamera = permissionGranted;
  const captureBusy = scannerState === 'CAPTURING'
    || scannerState === 'CAPTURED'
    || scannerState === 'IDENTIFYING'
    || scannerState === 'CONFIRMING';
  const binderId = getParamValue(params.binderId) ?? null;
  const parentBinderPageSessionId = getParamValue(params.parentSessionId) ?? null;
  const replaceBinderPocketIndex = Number(getParamValue(params.replacePocketIndex));
  const shouldReplaceBinderPocket = Boolean(parentBinderPageSessionId)
    && Number.isInteger(replaceBinderPocketIndex)
    && replaceBinderPocketIndex >= 0;
  const flow = getParamValue(params.flow);
  const scanIntent = useMemo(() => resolveScanIntent({
    intent: params.intent,
    mode: params.mode,
    flow: params.flow,
    type: params.type,
    binderId: params.binderId,
  }), [params.binderId, params.flow, params.intent, params.mode, params.type]);
  const scanIntentConfig = getScanIntentConfig(scanIntent);
  const mode = getParamValue(params.mode) ?? scanIntentConfig.legacyMode;
  const isListingFlow = isListingScanIntent(scanIntent) || mode === 'listing' || flow === 'listing';
  const isBinderPageScan = isBinderScanIntent(scanIntent);
  const isInventoryFlow = !isListingFlow && isPremiumSellerInventoryScan({ mode, flow });
  const localQuickScanExperienceEnabled = recognitionFeatureFlags.localRecognitionEnabled && !isBinderPageScan;
  const inlineManualSearchEnabled = localQuickScanExperienceEnabled && !isInventoryFlow;

  const frame = useMemo(() => {
    const topControls = insets.top + (isBinderPageScan ? 138 : 110);
    const bottomControls = insets.bottom + (isBinderPageScan ? 218 : 174);
    const availableHeight = Math.max(240, height - topControls - bottomControls);
    const sideInset = width < 380 ? SCAN_FRAME_SIDE_INSET_COMPACT : SCAN_FRAME_SIDE_INSET;
    const availableWidth = Math.max(220, width - sideInset * 2);
    const targetFrameWidth = isBinderPageScan && binderPageLayout > 1
      ? Math.min(width * BINDER_PAGE_FRAME_WIDTH_RATIO, BINDER_PAGE_FRAME_MAX_WIDTH)
      : Math.max(
          localQuickScanExperienceEnabled ? LOCAL_QUICK_SCAN_FRAME_MIN_WIDTH : OPTIMUM_SCAN_FRAME_MIN_WIDTH,
          width * (localQuickScanExperienceEnabled ? LOCAL_QUICK_SCAN_FRAME_WIDTH_RATIO : OPTIMUM_SCAN_FRAME_WIDTH_RATIO)
        );
    const frameWidth = Math.min(availableWidth, availableHeight * CARD_ASPECT_RATIO, targetFrameWidth);
    const frameHeight = frameWidth / CARD_ASPECT_RATIO;
    const top = topControls + Math.max(0, (availableHeight - frameHeight) / 2);
    const left = (width - frameWidth) / 2;
    return {
      top,
      left,
      width: frameWidth,
      height: frameHeight,
    };
  }, [binderPageLayout, height, insets.bottom, insets.top, isBinderPageScan, localQuickScanExperienceEnabled, width]);

  const frameTone = frameAssessment?.ready
    ? '#22C55E'
    : frameAssessment
      ? '#FBBF24'
      : theme.colors.primary;
  const localisationTone = getLocalisationTone(localisationResult);
  const guideLocked = scannerState === 'HOLD_STEADY' || scannerState === 'CAPTURING' || scannerState === 'CAPTURED';
  const activeFrameTone = guideLocked ? theme.colors.primary : localisationTone ?? frameTone;
  const localisationPolygon = useMemo(
    () => localisationQuadToFramePolygon(localisationResult, frame),
    [frame, localisationResult]
  );
  const binderGridLines = useMemo(() => (
    isBinderPageScan && binderPageLayout > 1
      ? Array.from({ length: binderPageLayout - 1 }, (_, index) => (index + 1) / binderPageLayout)
      : []
  ), [binderPageLayout, isBinderPageScan]);
  const guidanceReason = frameAssessment?.reason ?? null;
  const guidanceReady = Boolean(frameAssessment?.ready);
  const guidanceTone = captureBusy
    ? '#A78BFA'
    : guidanceReady
      ? '#22C55E'
      : guidanceReason === 'too-dark'
        || guidanceReason === 'glare'
        || guidanceReason === 'too-close'
        || guidanceReason === 'improve-lighting'
        || guidanceReason === 'reduce-glare'
        || guidanceReason === 'overexposed'
        || guidanceReason === 'sleeve-reflection'
        ? '#F59E0B'
        : '#A78BFA';
  const guidanceLabel = getGuidanceLabelForState(scannerState, scanMode);
  const guidanceIcon = getGuidanceIcon(guidanceReason, guidanceReady, captureBusy);
  const localQuickScanState = useMemo(() => mapScannerCaptureStateToLocalQuickScanState({
    scannerState,
    cameraReady,
    guidanceReady,
    guidanceReason,
  }), [cameraReady, guidanceReady, guidanceReason, scannerState]);
  const localQuickScanGuidance = useMemo(() => getLocalQuickScanGuidance({
    state: localQuickScanState,
    reasonCode: normaliseLocalQuickScanReason(guidanceReason),
    userMessage: scanMessage,
    showOfflineIndicator: shouldShowLocalQuickScanOfflineIndicator({
      featureFlags: recognitionFeatureFlags,
      networkAvailable: null,
    }),
  }), [guidanceReason, localQuickScanState, recognitionFeatureFlags, scanMessage]);
  const localQuickScanToneColor = localQuickScanGuidance.tone === 'success' || localQuickScanGuidance.tone === 'ready'
    ? '#22C55E'
    : localQuickScanGuidance.tone === 'attention'
      ? '#F59E0B'
      : localQuickScanGuidance.tone === 'error'
        ? '#EF4444'
        : localQuickScanGuidance.tone === 'busy'
          ? '#A78BFA'
          : theme.colors.primary;
  const activeGuidanceTone = localQuickScanExperienceEnabled ? localQuickScanToneColor : guidanceTone;
  const activeGuidanceLabel = localQuickScanExperienceEnabled ? localQuickScanGuidance.title : guidanceLabel;
  const activeGuidanceMessage = localQuickScanExperienceEnabled ? localQuickScanGuidance.message : scanMessage;
  const activeGuidanceIcon = localQuickScanExperienceEnabled ? localQuickScanGuidance.icon : guidanceIcon;
  const activeGuidanceAccessibilityLabel = localQuickScanExperienceEnabled
    ? localQuickScanGuidance.accessibilityLabel
    : `${guidanceLabel}. ${scanMessage}`;
  const activeStatusText = inlineManualSearchOpen
    ? 'Manual search'
    : localQuickScanExperienceEnabled
    ? localQuickScanGuidance.showOfflineIndicator
      ? 'Offline scan'
      : localQuickScanGuidance.title
    : captureBusy
      ? binderPageProgress
        ? `Page ${binderPageProgress.processed}/${binderPageProgress.total}`
        : scannerState === 'IDENTIFYING' ? 'Identifying' : 'Scanning'
      : cameraReady
        ? isBinderPageScan ? `${binderPageLayout}x${binderPageLayout} page` : scanMode === 'auto' ? 'Auto scan' : 'Manual capture'
        : permissionGranted ? 'Warming up' : 'Camera needed';

  const routeParams = useMemo(() => {
    const entries = Object.entries(params ?? {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(',') : value,
    ]);
    return Object.fromEntries(entries);
  }, [params]);

  useEffect(() => {
    const currentRouteInstanceId = routeInstanceId.current;
    logCameraDiagnostic('route mounted', {
      routeInstanceId: currentRouteInstanceId,
      pathname,
      params: routeParams,
    });

    return () => {
      logCameraDiagnostic('route unmounted', {
        routeInstanceId: currentRouteInstanceId,
        pathname,
      });
    };
  }, [pathname, routeParams]);

  useEffect(() => {
    if (!isBinderPageScan) return;
    const routeLayout = getParamValue(params.layout);
    if (routeLayout) {
      const normalizedLayout = normalizeBinderPageLayout(routeLayout);
      setBinderPageLayout(normalizedLayout);
      AsyncStorage.setItem(BINDER_PAGE_LAYOUT_STORAGE_KEY, String(normalizedLayout)).catch((error) => {
        logCameraDiagnostic('binder page route layout save failed', {
          routeInstanceId: routeInstanceId.current,
          layout: normalizedLayout,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    }

    let cancelled = false;
    AsyncStorage.getItem(BINDER_PAGE_LAYOUT_STORAGE_KEY)
      .then((value) => {
        if (!cancelled && value) setBinderPageLayout(normalizeBinderPageLayout(value));
      })
      .catch((error) => {
        logCameraDiagnostic('binder page layout load failed', {
          routeInstanceId: routeInstanceId.current,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isBinderPageScan, params.layout]);

  const setRememberedBinderPageLayout = useCallback((layout: BinderPageLayout) => {
    setBinderPageLayout(layout);
    AsyncStorage.setItem(BINDER_PAGE_LAYOUT_STORAGE_KEY, String(layout)).catch((error) => {
      logCameraDiagnostic('binder page layout save failed', {
        routeInstanceId: routeInstanceId.current,
        layout,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);

  useEffect(() => () => {
    if (autoCheckTimer.current) {
      clearTimeout(autoCheckTimer.current);
      autoCheckTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!permission) return;

    logCameraDiagnostic('permission loaded', {
      routeInstanceId: routeInstanceId.current,
      status: permission.status,
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      expires: permission.expires,
    });
  }, [permission]);

  useEffect(() => {
    if (!shouldRenderCamera) return;

    logCameraDiagnostic('CameraView rendered', {
      routeInstanceId: routeInstanceId.current,
      facing,
      renderCount: renderCount.current,
    });
  }, [facing, shouldRenderCamera]);

  const handleRequestPermission = useCallback(async () => {
    setPermissionRequesting(true);
    setMountError(null);
    setCameraReady(false);

    try {
      const result = await requestPermission();
      logCameraDiagnostic('permission requested', {
        routeInstanceId: routeInstanceId.current,
        status: result.status,
        granted: result.granted,
        canAskAgain: result.canAskAgain,
        expires: result.expires,
      });
    } finally {
      setPermissionRequesting(false);
    }
  }, [requestPermission]);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setMountError(null);
    if (cameraInitialisationMsRef.current == null) {
      cameraInitialisationMsRef.current = Date.now() - scannerMountedAt.current;
    }
    setScannerState({ type: 'camera_ready' });
    logCameraDiagnostic('camera ready', {
      routeInstanceId: routeInstanceId.current,
      facing,
      cameraInitialisationMs: cameraInitialisationMsRef.current,
    });
  }, [facing, setScannerState]);

  const handleMountError = useCallback((error: unknown) => {
    const message = getMountErrorMessage(error);
    setCameraReady(false);
    setMountError(message);
    setScannerState({ type: 'error' });
    setScanMessage('Camera preview hit a native error. Try reopening the scanner.');
    logCameraDiagnostic('mount error', {
      routeInstanceId: routeInstanceId.current,
      facing,
      error: message,
      rawError: error,
    });
  }, [facing, setScannerState]);

  const switchCamera = useCallback(() => {
    setCameraReady(false);
    setMountError(null);
    setAcceptedPreviewUri(null);
    setScannerState({ type: 'camera_paused' });
    setTorchEnabled(false);
    setFacing((current) => current === 'back' ? 'front' : 'back');
  }, [setScannerState]);

  const runOcrFallback = useCallback(async (imageUri: string) => {
    try {
      const result = await TextRecognition.recognize(imageUri);
      const text = result?.text?.trim() ?? '';
      if (text) {
        logCameraDiagnostic('ocr fallback text found', {
          routeInstanceId: routeInstanceId.current,
          preview: text.slice(0, 160),
        });
      }
      return text;
    } catch (error) {
      logCameraDiagnostic('ocr fallback unavailable', {
        routeInstanceId: routeInstanceId.current,
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }, []);

  const runTargetedCardOcr = useCallback(async (image: RecognitionImage | null): Promise<TargetedOcrResult> => {
    if (!image) return { sourceRole: 'none', regions: [], text: '' };

    const regions = await Promise.all(OCR_REGION_SPECS.map(async (spec) => {
      try {
        const crop = getOcrRegionCrop(image, spec);
        if (!crop) return { role: spec.role, text: '' };

        const cropped = await ImageManipulator.manipulateAsync(
          image.uri,
          [
            { crop },
            { resize: { width: spec.resizeWidth } },
          ],
          {
            compress: 0.86,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: false,
          }
        );
        const text = await runOcrFallback(cropped.uri);
        return { role: spec.role, text };
      } catch (error) {
        logCameraDiagnostic('targeted ocr region failed', {
          routeInstanceId: routeInstanceId.current,
          role: spec.role,
          error: error instanceof Error ? error.message : String(error),
        });
        return { role: spec.role, text: '' };
      }
    }));

    const usefulRegions = regions.filter((region) => region.text.trim());
    const text = combineOcrRegions(usefulRegions);
    const signals = extractLocalOcrSignals(usefulRegions);
    logCameraDiagnostic('targeted ocr complete', {
      routeInstanceId: routeInstanceId.current,
      sourceRole: image.role,
      regionCount: usefulRegions.length,
      language: signals.language,
      printedNumber: signals.printedNumber,
      setCode: signals.setCode,
      preview: text.slice(0, 180),
    });

    return {
      sourceRole: image.role,
      regions: usefulRegions,
      text,
    };
  }, [runOcrFallback]);

  const resolveMatches = useCallback(async (identified: IdentifiedCard[], ocrText: string) => {
    const primary = identified[0] ?? null;
    const identifiedRank = new Map(
      identified
        .map((card, index) => [card.id, index] as const)
        .filter(([id]) => Boolean(id?.trim()))
    );
    const queries = [
      ...identified.map(buildIdentifySearchQuery),
      ...identified.map((card) => getIdentifiedName(card) ?? ''),
    ]
      .map((query) => query.trim())
      .filter((query, index, all) => query.length >= 2 && all.indexOf(query) === index);

    const rowsById = new Map<string, any>();
    const identifiedIds = identified
      .map((card) => card.id)
      .filter((id): id is string => Boolean(id?.trim()));

    if (identifiedIds.length) {
      try {
        const references = [...new Set(identifiedIds)].slice(0, MAX_RESULT_CARDS);
        const rows = await fetchStackrCardRows(references);
        for (const reference of references) {
          const row = rows.get(reference);
          if (row?.id) rowsById.set(reference, row);
        }
      } catch (error) {
        logCameraDiagnostic('identified id lookup failed', {
          routeInstanceId: routeInstanceId.current,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (rowsById.size > 0 && identifiedRank.size > 0) {
      const hydratedRows = await hydrateScanCardRowsWithLiveTcgdexReferences(
        [...rowsById.values()], attachLiveTcgdexCardReferences,
      );
      return hydratedRows
        .sort((a, b) => (identifiedRank.get(a.id) ?? 999) - (identifiedRank.get(b.id) ?? 999))
        .slice(0, MAX_RESULT_CARDS)
        .map(toResultCard)
        .map((card) => attachScanSignals(card, identified));
    }

    for (const query of queries) {
      const rows = await searchLocalPokemonCards<any>(query, {
        language: 'all',
        limit: MAX_RESULT_CARDS,
        select: 'id, name, language, number, rarity, set_id, image_small, image_large, raw_data',
      });
      for (const row of rows ?? []) {
        if (row?.id) rowsById.set(row.id, row);
      }
      if (rowsById.size >= MAX_RESULT_CARDS) break;
    }

    if (rowsById.size === 0) {
      for (const card of identified) {
        const fallback = identifiedToSearchFallback(card);
        if (fallback?.id) rowsById.set(fallback.id, fallback);
      }
    }

    if (rowsById.size === 0 && ocrText && identified.length === 0) {
      const ocrQuery = buildOcrSearchQuery(ocrText);
      if (ocrQuery) {
        try {
          const rows = await searchLocalPokemonCards<any>(ocrQuery, {
            language: 'all',
            limit: MAX_RESULT_CARDS,
            select: 'id, name, language, number, rarity, set_id, image_small, image_large, raw_data',
          });
          for (const row of rows ?? []) {
            if (row?.id) rowsById.set(row.id, row);
          }
        } catch (error) {
          logCameraDiagnostic('ocr-only lookup failed', {
            routeInstanceId: routeInstanceId.current,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logCameraDiagnostic('ocr-only lookup attempted', {
        routeInstanceId: routeInstanceId.current,
        matchedRows: rowsById.size,
        preview: ocrQuery.slice(0, 120),
      });
    }

    return sortBestMatches([...rowsById.values()], primary)
      .slice(0, MAX_RESULT_CARDS)
      .map(toResultCard)
      .map((card) => attachScanSignals(card, identified));
  }, []);

  const stopAutoScanner = useCallback(() => {
    autoReadyFrames.current = 0;
    autoCheckBusy.current = false;
    if (autoCheckTimer.current) {
      clearTimeout(autoCheckTimer.current);
      autoCheckTimer.current = null;
    }
  }, []);

  const buildScannerLifecycleAnalytics = useCallback((options: {
    matchSource?: 'local' | 'remote' | 'hybrid' | 'manual' | 'none' | 'unknown';
    rescan?: boolean;
    cancellation?: boolean;
    duplicatePrevention?: boolean;
    errorCategory?: string | null;
  } = {}) => {
    return buildScannerAnalyticsMetadata({
      timings: {
        camera_initialisation_ms: cameraInitialisationMsRef.current,
        first_card_detection_ms: firstCardDetectionMsRef.current,
        quality_gate_ms: null,
        stable_capture_ms: null,
        photo_capture_ms: null,
        perspective_crop_ms: null,
        ocr_ms: null,
        local_candidate_match_ms: null,
        remote_request_ms: null,
        database_save_ms: null,
        total_scan_ms: Date.now() - scannerMountedAt.current,
      },
      scanIntent,
      scanMode,
      language: null,
      matchSource: options.matchSource ?? 'none',
      confidence: null,
      alternatives: 0,
      qualityFailureReasons: scanQualityRef.current?.failures?.map((failure) => String(failure.code)) ?? [],
      manualCorrection: false,
      rescan: options.rescan ?? false,
      cancellation: options.cancellation ?? false,
      duplicatePrevention: options.duplicatePrevention ?? false,
      remoteEndpoint: null,
      errorCategory: options.errorCategory ?? null,
      client: scannerClientContext,
      featureFlags: scannerFeatureFlags,
    });
  }, [scanIntent, scanMode, scannerClientContext, scannerFeatureFlags]);

  const logScannerLifecycleEvent = useCallback((
    eventType: 'manual_search' | 'rescan' | 'cancellation' | 'duplicate_prevented',
    outcome: string,
    routeContext: Record<string, unknown> = {}
  ) => {
    void logScanLearningEvent({
      scanSessionId: routeInstanceId.current,
      eventType,
      scanMode,
      routeContext: {
        mode,
        intent: scanIntent,
        flow,
        binderId,
        pathname,
        ...routeContext,
        analytics: buildScannerLifecycleAnalytics({
          matchSource: eventType === 'manual_search' ? 'manual' : 'none',
          rescan: eventType === 'rescan',
          cancellation: eventType === 'cancellation',
          duplicatePrevention: eventType === 'duplicate_prevented',
        }),
      },
      frameMetrics: compactFrameMetrics(frameAssessmentRef.current),
      outcome,
    });
  }, [binderId, buildScannerLifecycleAnalytics, flow, mode, pathname, scanIntent, scanMode]);

  useEffect(() => {
    if (!isBinderPageScan) return;
    stopAutoScanner();
    setScanMode('manual');
    if (captureBusy) return;
    setScanMessage(binderPageLayout === 1
      ? 'Centre one pocket card, then capture.'
      : `Line up the ${binderPageLayout}x${binderPageLayout} pocket area inside the guide.`
    );
    setScannerState({ type: 'search' });
  }, [binderPageLayout, captureBusy, isBinderPageScan, setScannerState, stopAutoScanner]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      const isActive = nextState === 'active';
      appStateRef.current = nextState;
      setAppActive(isActive);

      if (wasActive && !isActive) {
        stopAutoScanner();
        setScannerState({ type: 'camera_paused' });
        logCameraDiagnostic('app backgrounded; scanner paused', {
          routeInstanceId: routeInstanceId.current,
          nextState,
        });
        return;
      }

      if (!wasActive && isActive && permissionGranted && cameraReady && !mountError && !navigatingAwayRef.current) {
        setScannerState({ type: 'search' });
        setScanMessage(scanMode === 'auto'
          ? 'Centre one card. Keep other cards in the dim area.'
          : 'Manual mode. Centre one card in the window, then tap scan.'
        );
      }
    });

    return () => subscription.remove();
  }, [cameraReady, mountError, permissionGranted, scanMode, setScannerState, stopAutoScanner]);

  const closeScanner = useCallback(() => {
    logScannerLifecycleEvent('cancellation', 'closed_scanner', { source: 'close-button' });
    navigatingAwayRef.current = true;
    stopAutoScanner();
    scanStore.clear();

    if (binderId) {
      router.replace({
        pathname: '/binder/[id]',
        params: { id: binderId },
      } as any);
      return;
    }

    if (isListingFlow) {
      router.replace('/listing/new' as any);
      return;
    }

    if (isInventoryFlow) {
      router.replace('/(tabs)/inventory' as any);
      return;
    }

    if (mode === 'binder') {
      router.replace('/(tabs)/binder' as any);
      return;
    }

    router.replace('/(tabs)' as any);
  }, [binderId, isInventoryFlow, isListingFlow, logScannerLifecycleEvent, mode, stopAutoScanner]);

  const runInlineManualSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    const requestId = inlineManualSearchRequestRef.current + 1;
    inlineManualSearchRequestRef.current = requestId;

    if (trimmed.length < 2) {
      setInlineManualSearchResults([]);
      setInlineManualSearchLoading(false);
      return;
    }

    setInlineManualSearchLoading(true);
    try {
      const rows = await searchLocalPokemonCards<any>(trimmed, {
        language: 'all',
        limit: MAX_RESULT_CARDS,
        select: 'id, name, language, number, rarity, set_id, image_small, image_large, raw_data',
      });
      if (inlineManualSearchRequestRef.current !== requestId) return;
      setInlineManualSearchResults((rows ?? []).slice(0, MAX_RESULT_CARDS).map(toResultCard));
    } catch (error) {
      if (inlineManualSearchRequestRef.current !== requestId) return;
      setInlineManualSearchResults([]);
      logCameraDiagnostic('inline manual search failed', {
        routeInstanceId: routeInstanceId.current,
        query: trimmed.slice(0, 80),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (inlineManualSearchRequestRef.current === requestId) {
        setInlineManualSearchLoading(false);
      }
    }
  }, []);

  const closeInlineManualSearch = useCallback(() => {
    setInlineManualSearchOpen(false);
    setInlineManualSearchResults([]);
    setInlineManualSearchLoading(false);
    inlineManualSearchRequestRef.current += 1;
    if (scanMode === 'auto' && cameraReady && permissionGranted && !captureBusy && !mountError) {
      setScannerState({ type: 'search' });
    }
  }, [cameraReady, captureBusy, mountError, permissionGranted, scanMode, setScannerState]);

  const handleInlineManualSearchSelect = useCallback((card: ScanResultCard) => {
    setLastQuery(`${card.name} ${card.set_name} ${card.number}`.trim());
    navigatingAwayRef.current = true;
    stopAutoScanner();
    router.replace({
      pathname: '/scan/result',
      params: {
        cardsJson: serializeScanCardsForNavigation([card]),
        scanSessionId: routeInstanceId.current,
        mode,
        intent: scanIntent,
        ...(flow ? { flow } : {}),
        ...(binderId ? { binderId } : {}),
        type: scanIntentConfig.itemType,
        q: `${card.name} ${card.set_name} ${card.number}`.trim(),
      },
    });
  }, [binderId, flow, mode, scanIntent, scanIntentConfig.itemType, stopAutoScanner]);

  useEffect(() => {
    if (!inlineManualSearchOpen) return;
    const timer = setTimeout(() => {
      void runInlineManualSearch(inlineManualSearchQuery);
    }, 220);
    return () => clearTimeout(timer);
  }, [inlineManualSearchOpen, inlineManualSearchQuery, runInlineManualSearch]);

  const openManualSearch = useCallback(() => {
    logScannerLifecycleEvent('manual_search', 'manual_search_opened', { source: 'scanner' });
    if (inlineManualSearchEnabled) {
      stopAutoScanner();
      setInlineManualSearchOpen(true);
      setInlineManualSearchQuery(lastQuery);
      setScannerState({ type: 'search' });
      return;
    }

    navigatingAwayRef.current = true;
    stopAutoScanner();
    if (isListingFlow) {
      router.replace({
        pathname: '/listing/new',
        params: {
          listingAction: 'manual',
          type: scanIntentConfig.itemType,
          ...(lastQuery ? { q: lastQuery } : {}),
        },
      } as any);
      return;
    }

    router.replace({
      pathname: '/(tabs)/search',
      params: lastQuery ? { q: lastQuery } : undefined,
    } as any);
  }, [
    inlineManualSearchEnabled,
    isListingFlow,
    lastQuery,
    logScannerLifecycleEvent,
    scanIntentConfig.itemType,
    setScannerState,
    stopAutoScanner,
  ]);

  const createScanCapturedFrame = useCallback((photo: CapturedPhoto): CapturedFrame | null => {
    if (!CAPTURE_GEOMETRY_V2_ENABLED) return null;

    try {
      const capturedFrame = createCapturedFrame({
        originalUri: photo.uri,
        pixelWidth: photo.width,
        pixelHeight: photo.height,
        orientation: width >= height ? 'landscapeLeft' : 'portrait',
        rotationDegrees: 0,
        mirrored: facing === 'front',
        previewWidth: width,
        previewHeight: height,
        previewResizeMode: 'cover',
        safeAreaInsets: insets,
        detectedCardPreviewRect: {
          x: frame.left,
          y: frame.top,
          width: frame.width,
          height: frame.height,
        },
        scanSessionId: routeInstanceId.current,
      });

      logCameraDiagnostic('captured frame created', {
        routeInstanceId: routeInstanceId.current,
        scanSessionId: capturedFrame.scanSessionId,
        photo: { width: capturedFrame.pixelWidth, height: capturedFrame.pixelHeight },
        preview: capturedFrame.previewDimensions,
        resizeMode: capturedFrame.previewResizeMode,
        mirrored: capturedFrame.mirrored,
        cardQuad: capturedFrame.detectedCardQuadrilateral,
      });

      return capturedFrame;
    } catch (error) {
      logCameraDiagnostic('captured frame creation failed', {
        routeInstanceId: routeInstanceId.current,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [facing, frame.height, frame.left, frame.top, frame.width, height, insets, width]);

  const getPhotoCropFromGeometry = useCallback((
    photo: CapturedPhoto,
    capturedFrame: CapturedFrame | null | undefined,
    paddingRatio = SCAN_CROP_PADDING_RATIO
  ) => {
    if (CAPTURE_GEOMETRY_V2_ENABLED && capturedFrame) {
      const geometryCrop = getCropFromPreviewRect(capturedFrame, {
        x: frame.left,
        y: frame.top,
        width: frame.width,
        height: frame.height,
      }, paddingRatio);
      return geometryCrop ? captureRectToManipulatorCrop(geometryCrop) : null;
    }

    return buildLegacyPhotoCrop(frame, { width, height }, photo, paddingRatio);
  }, [frame, height, width]);

  const prepareLocalisedRecognitionImage = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null
  ): Promise<RecognitionImage | null> => {
    if (!CARD_LOCALISATION_ENABLED || !capturedFrame) return null;

    try {
      const photoCrop = getPhotoCropFromGeometry(photo, capturedFrame, CARD_LOCALISATION_SAFETY_MARGIN);
      const actions: any[] = [];
      if (photoCrop) actions.push({ crop: photoCrop });
      actions.push({ resize: { width: 900 } });

      const workingImage = await ImageManipulator.manipulateAsync(photo.uri, actions, {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!workingImage.base64) return null;

      const localisation = localiseCardFromJpegBase64(workingImage.base64, {
        expectedAspectRatio: CARD_ASPECT_RATIO,
        guideRect: {
          x: 0,
          y: 0,
          width: workingImage.width ?? 1,
          height: workingImage.height ?? 1,
        },
        minFrameCoverage: 0.055,
        maxFrameCoverage: 0.94,
        safetyMarginRatio: CARD_LOCALISATION_SAFETY_MARGIN,
      });

      logCameraDiagnostic('capture localisation', {
        routeInstanceId: routeInstanceId.current,
        localisation: compactLocalisationDiagnostics(localisation),
      });

      if (localisation.status !== 'confident' || !localisation.quadrilateral) {
        return null;
      }

      const corrected = perspectiveCorrectCardJpegBase64(workingImage.base64, localisation.quadrilateral, {
        expectedAspectRatio: CARD_ASPECT_RATIO,
        outputWidth: LOCALISATION_OUTPUT_WIDTH,
        safetyMarginRatio: CARD_LOCALISATION_SAFETY_MARGIN,
        quality: 84,
      });
      const cacheRoot = FileSystem.cacheDirectory;
      if (!cacheRoot) return null;
      const safeSessionId = routeInstanceId.current.replace(/[^a-zA-Z0-9_-]/g, '-');
      const uri = `${cacheRoot}stackr-localised-${safeSessionId}-${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(uri, corrected.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return {
        uri,
        width: corrected.width,
        height: corrected.height,
        base64: corrected.base64,
        role: 'localised-card-crop',
        localisation: {
          ...localisation,
          quadrilateral: corrected.quadrilateral,
          transformMatrix: corrected.transformMatrix,
        },
      };
    } catch (error) {
      logCameraDiagnostic('capture localisation failed', {
        routeInstanceId: routeInstanceId.current,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [getPhotoCropFromGeometry]);

  const preparePhotosForRecognition = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null
  ): Promise<RecognitionImage[]> => {
    const photoCrop = getPhotoCropFromGeometry(photo, capturedFrame);
    const wideCrop = CAPTURE_GEOMETRY_V2_ENABLED && capturedFrame && photoCrop
      ? (() => {
          const expanded = expandCropRect(
            { x: photoCrop.originX, y: photoCrop.originY, width: photoCrop.width, height: photoCrop.height },
            { width: Number(photo.width) || 1, height: Number(photo.height) || 1 },
            0.72
          );
          return expanded ? captureRectToManipulatorCrop(expanded) : null;
        })()
      : expandPhotoCrop(photoCrop, photo, 0.72);
    const specs: { role: string; actions: any[]; compress: number }[] = [];

    if (photoCrop) {
      specs.push({
        role: 'target-crop',
        actions: [{ crop: photoCrop }, { resize: { width: 960 } }],
        compress: 0.76,
      });
    }

    if (wideCrop) {
      specs.push({
        role: 'wide-safety-crop',
        actions: [{ crop: wideCrop }, { resize: { width: 1040 } }],
        compress: 0.72,
      });
    }

    specs.push({
      role: 'full-frame',
      actions: [{ resize: { width: 1180 } }],
      compress: 0.68,
    });

    const prepared: RecognitionImage[] = [];
    const localisedImage = await prepareLocalisedRecognitionImage(photo, capturedFrame);
    if (localisedImage) prepared.push(localisedImage);

    for (const spec of specs) {
      try {
        const manipulated = await ImageManipulator.manipulateAsync(photo.uri, spec.actions, {
          compress: spec.compress,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        });
        prepared.push({ ...manipulated, role: spec.role });
      } catch (error) {
        logCameraDiagnostic('recognition image variant failed', {
          routeInstanceId: routeInstanceId.current,
          role: spec.role,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!prepared.length) {
      const fallback = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 960 } }],
        {
          compress: 0.68,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      prepared.push({ ...fallback, role: 'fallback-full-frame' });
    }

    logCameraDiagnostic('photos prepared for recognition', {
      routeInstanceId: routeInstanceId.current,
      scanSessionId: capturedFrame?.scanSessionId ?? routeInstanceId.current,
      geometryV2: CAPTURE_GEOMETRY_V2_ENABLED && Boolean(capturedFrame),
      original: { width: photo.width, height: photo.height },
      targetCrop: photoCrop,
      wideCrop,
      variants: prepared.map((item) => ({
        role: item.role,
        width: item.width,
        height: item.height,
        bytesApprox: estimateBase64Bytes(item.base64),
      })),
    });

    return prepared;
  }, [getPhotoCropFromGeometry, prepareLocalisedRecognitionImage]);

  const preparePhotoForFrameCheck = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null,
    options: { paddingRatio?: number; width?: number; compress?: number } = {}
  ) => {
    const photoCrop = getPhotoCropFromGeometry(photo, capturedFrame, options.paddingRatio ?? SCAN_CROP_PADDING_RATIO);
    const actions: any[] = [];
    if (photoCrop) actions.push({ crop: photoCrop });
    actions.push({ resize: { width: options.width ?? FRAME_CHECK_WIDTH } });

    return ImageManipulator.manipulateAsync(photo.uri, actions, {
      compress: options.compress ?? 0.42,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
  }, [getPhotoCropFromGeometry]);

  const evaluateCapturedPhotoQuality = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null
  ) => {
    if (!SCAN_QUALITY_ENABLED) {
      applyScanQualityResult(null);
      return {
        quality: null as ScanQualityResult | null,
        localisation: localisationRef.current,
      };
    }

    const previousLocalisation = localisationRef.current;
    const preview = await preparePhotoForFrameCheck(photo, capturedFrame, {
      paddingRatio: 0,
      width: LOCALISATION_FRAME_CHECK_WIDTH,
      compress: 0.5,
    });
    const localisation = CARD_LOCALISATION_ENABLED && preview.base64
      ? localiseCardFromJpegBase64(preview.base64, {
          expectedAspectRatio: CARD_ASPECT_RATIO,
          guideRect: { x: 0, y: 0, width: preview.width ?? 1, height: preview.height ?? 1 },
          minFrameCoverage: 0.08,
          maxFrameCoverage: 0.82,
          safetyMarginRatio: CARD_LOCALISATION_SAFETY_MARGIN,
        })
      : null;
    const quality = evaluateScanQuality(preview.base64 ?? '', {
      localisation,
      previousLocalisation,
      calibration: scanQualityCalibration,
    });
    const assessment = frameAssessmentFromScanQuality(quality);

    applyLocalisationResult(localisation);
    applyScanQualityResult(quality);
    applyFrameAssessment(assessment);

    logCameraDiagnostic('capture quality assessment', {
      routeInstanceId: routeInstanceId.current,
      passed: quality.passed,
      instruction: quality.instruction,
      failures: quality.failures.map((failure) => failure.code),
      scores: {
        focus: quality.focusScore,
        glare: quality.glareScore,
        exposure: quality.exposureScore,
        framing: quality.framingScore,
        stability: quality.stabilityScore,
        obstruction: quality.obstructionScore,
        perspective: quality.perspectiveScore,
      },
      localisation: compactLocalisationDiagnostics(localisation),
    });

    return {
      quality,
      localisation,
    };
  }, [applyFrameAssessment, applyLocalisationResult, applyScanQualityResult, preparePhotoForFrameCheck, scanQualityCalibration]);

  const toBinderPocketCandidate = useCallback((card: ScanResultCard): BinderPocketCandidate => ({
    id: card.id,
    name: card.name,
    number: card.number,
    set_id: card.set_id,
    set_name: card.set_name,
    image_small: card.image_small,
    image_large: card.image_large,
    confidence: card.scan_confidence ?? (
      card.scan_final_score != null
        ? Math.round(card.scan_final_score * 100)
        : null
    ),
  }), []);

  const lookupStackrCachedIdentities = useCallback(async (
    localOcrMatch?: LocalOcrMatchResult | null
  ): Promise<IdentifiedCard[]> => {
    if (!recognitionFeatureFlags.stackrApiEnabled || !localOcrMatch?.signals.printedNumber) {
      return [];
    }

    try {
      const cache = await getPersistentStackrCatalogueCache();
      if (!cache) return [];
      const printedNumber = localOcrMatch.signals.printedNumber.normalisedNumber
        || String(localOcrMatch.signals.printedNumber.number);
      const matches = await cache.findExactIdentities({
        game: 'pokemon',
        languageCode: localOcrMatch.signals.language === 'unknown' ? null : localOcrMatch.signals.language,
        setCode: localOcrMatch.signals.setCode,
        collectorNumber: printedNumber,
        limit: MAX_RESULT_CARDS,
      });
      return matches.map(stackrCachedCardToIdentifiedCard) as IdentifiedCard[];
    } catch (error) {
      logCameraDiagnostic('stackr local catalogue lookup failed', {
        routeInstanceId: routeInstanceId.current,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }, [recognitionFeatureFlags.stackrApiEnabled]);

  const prepareBinderPagePocketImages = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null
  ): Promise<{ pageUri: string | null; pockets: BinderPagePocketImage[] }> => {
    const photoCrop = getPhotoCropFromGeometry(photo, capturedFrame, 0.018);
    const pageActions: any[] = [];
    if (photoCrop) pageActions.push({ crop: photoCrop });
    pageActions.push({ resize: { width: BINDER_PAGE_OUTPUT_WIDTH } });

    const pageImage = await ImageManipulator.manipulateAsync(photo.uri, pageActions, {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    });

    const cells = createBinderPageGridCells(binderPageLayout, {
      width: pageImage.width ?? BINDER_PAGE_OUTPUT_WIDTH,
      height: pageImage.height ?? Math.round(BINDER_PAGE_OUTPUT_WIDTH / CARD_ASPECT_RATIO),
    });

    const pockets = await Promise.all(cells.map(async (cell): Promise<BinderPagePocketImage> => {
      const crop = await ImageManipulator.manipulateAsync(
        pageImage.uri,
        [
          { crop: captureRectToManipulatorCrop(cell.crop) },
          { resize: { width: BINDER_PAGE_POCKET_OUTPUT_WIDTH } },
        ],
        {
          compress: 0.76,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      return {
        cell,
        uri: crop.uri,
        width: crop.width,
        height: crop.height,
        base64: crop.base64,
      };
    }));

    logCameraDiagnostic('binder page pocket crops prepared', {
      routeInstanceId: routeInstanceId.current,
      layout: binderPageLayout,
      page: { width: pageImage.width, height: pageImage.height },
      pocketCount: pockets.length,
    });

    return { pageUri: pageImage.uri, pockets };
  }, [binderPageLayout, getPhotoCropFromGeometry]);

  const identifyBinderPagePocket = useCallback(async (
    pocket: BinderPagePocketImage,
    useRemoteFallback: boolean
  ): Promise<BinderPagePocketResult> => {
    const quality = assessBinderPocketImage(pocket.base64);
    const baseResult: BinderPagePocketResult = {
      index: pocket.cell.index,
      row: pocket.cell.row,
      column: pocket.cell.column,
      status: quality.status === 'usable' ? 'unresolved' : quality.status,
      cropUri: pocket.uri,
      candidates: [],
      selectedCandidateIndex: 0,
      quality,
      source: quality.status === 'usable' ? 'none' : 'quality',
      notes: [quality.reason],
    };

    if (quality.status !== 'usable' || !pocket.base64) return baseResult;

    const recognitionImage: RecognitionImage = {
      uri: pocket.uri,
      width: pocket.width,
      height: pocket.height,
      base64: pocket.base64,
      role: 'binder-pocket-crop',
    };

    const targetedOcr = await runTargetedCardOcr(recognitionImage);
    let localOcrMatch: LocalOcrMatchResult | null = null;
    let localIdentified: IdentifiedCard[] = [];

    if (SCAN_LOCAL_OCR_MATCHER_ENABLED && targetedOcr.regions.length > 0) {
      localOcrMatch = await matchLocalOcrCandidates(targetedOcr.regions, {
        maxCandidates: MAX_RESULT_CARDS,
        scanImageBase64: pocket.base64,
        strongConfidence: scannerThresholdSet.thresholds.recognition.localAutoConfirmConfidence,
      });
      localIdentified = localOcrMatch.candidates
        .slice(0, MAX_RESULT_CARDS)
        .map(localOcrCandidateToIdentifiedCard);
      localIdentified = mergeIdentifiedCards(
        await lookupStackrCachedIdentities(localOcrMatch),
        localIdentified
      ).slice(0, MAX_RESULT_CARDS);

      if (localOcrMatch.status === 'strong' && localIdentified.length) {
        const cards = await resolveMatches(localIdentified, targetedOcr.text);
        const candidates = cards.map(toBinderPocketCandidate);
        return {
          ...baseResult,
          status: getBinderPocketStatusFromCandidates(quality, candidates),
          candidates,
          source: 'local',
          notes: [
            ...baseResult.notes,
            `local-ocr:${localOcrMatch.status}`,
            ...localOcrMatch.notes,
          ],
        };
      }
    }

    if (!useRemoteFallback) {
      const candidates = localIdentified.length
        ? (await resolveMatches(localIdentified, targetedOcr.text)).map(toBinderPocketCandidate)
        : [];
      return {
        ...baseResult,
        status: getBinderPocketStatusFromCandidates(quality, candidates),
        candidates,
        source: candidates.length ? 'local' : 'none',
        notes: [
          ...baseResult.notes,
          localOcrMatch ? `local-ocr:${localOcrMatch.status}` : 'local-ocr:no-text',
        ],
      };
    }

    try {
      const detailed = await identifyCardsDetailed([pocket.base64], binderId ?? undefined, {
        ocrText: targetedOcr.text,
        language: localOcrMatch?.signals.language === 'unknown' ? null : localOcrMatch?.signals.language,
        printedNumber: localOcrMatch?.signals.printedNumber?.number && localOcrMatch.signals.printedNumber.denominator
          ? {
              number: localOcrMatch.signals.printedNumber.number,
              total: localOcrMatch.signals.printedNumber.denominator,
            }
          : null,
        localConfidence: localOcrMatch?.confidence ?? null,
        localStatus: localOcrMatch?.status ?? null,
        ambiguousVariants: Boolean(localOcrMatch?.status === 'ambiguous'),
        scanSessionId: `${routeInstanceId.current}:pocket-${pocket.cell.index}`,
        itemType: 'raw_card',
        rectifiedImageUri: pocket.uri,
      });
      const cards = await resolveMatches(detailed.cards, targetedOcr.text);
      const candidates = cards.map(toBinderPocketCandidate);
      return {
        ...baseResult,
        status: getBinderPocketStatusFromCandidates(quality, candidates),
        candidates,
        source: 'remote',
        notes: [
          ...baseResult.notes,
          localOcrMatch ? `local-ocr:${localOcrMatch.status}` : 'local-ocr:no-text',
          `remote:${detailed.diagnostics.candidateCount}`,
        ],
      };
    } catch (error) {
      return {
        ...baseResult,
        status: 'unresolved',
        source: 'remote',
        notes: [
          ...baseResult.notes,
          error instanceof Error ? error.message : String(error),
        ],
      };
    }
  }, [
    binderId,
    resolveMatches,
    lookupStackrCachedIdentities,
    runTargetedCardOcr,
    scannerThresholdSet.thresholds.recognition.localAutoConfirmConfidence,
    toBinderPocketCandidate,
  ]);

  const processBinderPageCapture = useCallback(async (
    photo: CapturedPhoto,
    capturedFrame?: CapturedFrame | null,
    captureMs?: number | null,
    attemptStartedAt?: number | null
  ) => {
    const startedAt = Date.now();
    const analyticsStartedAt = attemptStartedAt ?? startedAt;
    let perspectiveCropMs: number | null = null;
    let localCandidateMatchMs: number | null = null;
    let remoteRequestMs: number | null = null;
    setBinderPageProgress(null);
    setScannerState({ type: 'identify_start' });
    setScanMessage(`Splitting ${binderPageLayout}x${binderPageLayout} binder page...`);

    const cropStartedAt = Date.now();
    const { pageUri, pockets } = await prepareBinderPagePocketImages(photo, capturedFrame);
    perspectiveCropMs = Date.now() - cropStartedAt;
    const initialResults = pockets.map((pocket): BinderPagePocketResult => {
      const quality = assessBinderPocketImage(pocket.base64);
      return {
        index: pocket.cell.index,
        row: pocket.cell.row,
        column: pocket.cell.column,
        status: quality.status === 'usable' ? 'unresolved' : quality.status,
        cropUri: pocket.uri,
        candidates: [],
        selectedCandidateIndex: 0,
        quality,
        source: quality.status === 'usable' ? 'none' : 'quality',
        notes: [quality.reason],
      };
    });
    const workable = pockets.filter((pocket, index) => initialResults[index]?.status === 'unresolved');
    const localResults: BinderPagePocketResult[] = [];
    let processed = 0;
    setBinderPageProgress({ processed, total: pockets.length });
    setScanMessage(`Checking ${workable.length} occupied pocket${workable.length === 1 ? '' : 's'} locally...`);

    const localByIndex = new Map<number, BinderPagePocketResult>();
    const localStartedAt = Date.now();
    for (const pocket of workable) {
      const result = await identifyBinderPagePocket(pocket, false);
      localByIndex.set(pocket.cell.index, result);
      localResults.push(result);
      processed += 1;
      setBinderPageProgress({ processed, total: pockets.length });
      setScanMessage(`Binder page ${processed}/${pockets.length} pockets checked...`);
    }
    localCandidateMatchMs = Date.now() - localStartedAt;

    const unresolved = workable.filter((pocket) => {
      const result = localByIndex.get(pocket.cell.index);
      return !result?.candidates.length || result.status === 'unresolved' || result.status === 'possible_match';
    });

    if (unresolved.length) {
      setScanMessage(`Matching ${unresolved.length} uncertain pocket${unresolved.length === 1 ? '' : 's'}...`);
    }

    const remoteStartedAt = Date.now();
    const remoteResults = await runWithConcurrency(
      unresolved,
      Math.max(1, Math.min(4, Math.floor(SCAN_BINDER_PAGE_REMOTE_CONCURRENCY) || 2)),
      async (pocket) => {
        const result = await identifyBinderPagePocket(pocket, true);
        processed += 1;
        setBinderPageProgress({ processed: Math.min(pockets.length, processed), total: pockets.length });
        return result;
      }
    );
    remoteRequestMs = unresolved.length ? Date.now() - remoteStartedAt : null;

    const remoteByIndex = new Map(remoteResults.map((result) => [result.index, result]));
    const merged = initialResults.map((initial) => {
      const remote = remoteByIndex.get(initial.index);
      if (remote?.candidates.length || remote?.status !== 'unresolved') return remote ?? initial;
      const local = localByIndex.get(initial.index);
      return local ?? initial;
    });
    const finalPockets = markDuplicatePocketCandidates(merged);
    const duplicatePrevention = finalPockets.some((pocket) => pocket.status === 'duplicate_candidate');
    const bestConfidence = finalPockets
      .flatMap((pocket) => pocket.candidates)
      .map((candidate) => Number(candidate.confidence))
      .filter((confidence) => Number.isFinite(confidence))
      .sort((a, b) => b - a)[0] ?? null;
    const pocketStatuses = finalPockets.reduce<Record<string, number>>((acc, pocket) => {
      acc[pocket.status] = (acc[pocket.status] ?? 0) + 1;
      return acc;
    }, {});
    const qualityFailureReasons = Array.from(new Set(finalPockets
      .map((pocket) => pocket.quality?.status)
      .filter((status) => Boolean(status && status !== 'usable'))
      .map(String)));
    const hasRemote = finalPockets.some((pocket) => pocket.source === 'remote');
    const hasLocal = finalPockets.some((pocket) => pocket.source === 'local');
    const binderPageAnalytics = buildScannerAnalyticsMetadata({
      timings: {
        camera_initialisation_ms: cameraInitialisationMsRef.current,
        first_card_detection_ms: firstCardDetectionMsRef.current,
        quality_gate_ms: null,
        stable_capture_ms: null,
        photo_capture_ms: captureMs ?? null,
        perspective_crop_ms: perspectiveCropMs,
        ocr_ms: null,
        local_candidate_match_ms: localCandidateMatchMs,
        remote_request_ms: remoteRequestMs,
        database_save_ms: null,
        total_scan_ms: Date.now() - analyticsStartedAt,
      },
      scanIntent,
      scanMode,
      language: null,
      matchSource: hasRemote && hasLocal ? 'hybrid' : hasRemote ? 'remote' : hasLocal ? 'local' : 'none',
      confidence: bestConfidence,
      alternatives: finalPockets.reduce((sum, pocket) => sum + pocket.candidates.length, 0),
      qualityFailureReasons,
      manualCorrection: false,
      rescan: shouldReplaceBinderPocket,
      cancellation: false,
      duplicatePrevention,
      remoteEndpoint: hasRemote ? 'tcg_id' : null,
      errorCategory: null,
      client: scannerClientContext,
      featureFlags: scannerFeatureFlags,
    });

    if (shouldReplaceBinderPocket && parentBinderPageSessionId) {
      const replacement = finalPockets[0];
      if (replacement) {
        const updatedParent = updateBinderPageScanSession(parentBinderPageSessionId, (stored) => {
          const nextPockets = stored.pockets.map((pocket) => {
            const cleanedStatus = pocket.status === 'duplicate_candidate'
              ? getBinderPocketStatusFromCandidates(pocket.quality, pocket.candidates)
              : pocket.status;
            const cleanedNotes = pocket.notes.filter((note) => note !== 'same-card-already-seen-on-page');
            if (pocket.index !== replaceBinderPocketIndex) {
              return { ...pocket, status: cleanedStatus, notes: cleanedNotes };
            }

            return {
              ...replacement,
              index: pocket.index,
              row: pocket.row,
              column: pocket.column,
              notes: [...replacement.notes, 'rescanned-pocket'],
            };
          });

          return {
            ...stored,
            binderId: binderId ?? stored.binderId,
            pageUri: stored.pageUri ?? pageUri,
            processingMs: stored.processingMs + (Date.now() - startedAt),
            pockets: markDuplicatePocketCandidates(nextPockets),
          };
        });

        if (updatedParent) {
          await logScanLearningEvent({
            scanSessionId: parentBinderPageSessionId,
            eventType: 'attempt',
            scanMode,
            routeContext: {
              mode,
              intent: scanIntent,
              flow,
              binderId,
              source: 'binder-page-pocket-rescan',
              layout: 1,
              replacePocketIndex: replaceBinderPocketIndex,
              replacementStatus: replacement.status,
              analytics: {
                ...binderPageAnalytics,
                rescan: true,
              },
            },
            candidates: replacement.candidates.slice(0, 1).map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              set_id: candidate.set_id ?? null,
              set_name: candidate.set_name ?? null,
              number: candidate.number ?? null,
              provider: replacement.source,
              confidence: candidate.confidence ?? null,
              visualSimilarity: null,
              finalScore: null,
            })),
            outcome: replacement.candidates.length ? 'candidates_returned' : 'no_match',
          });
          setScannerState({ type: 'confirm' });
          navigatingAwayRef.current = true;
          stopAutoScanner();
          router.replace({
            pathname: '/scan/binder-page-result',
            params: {
              scanSessionId: parentBinderPageSessionId,
              layout: updatedParent.layout,
              ...(updatedParent.binderId ? { binderId: updatedParent.binderId } : {}),
            },
          } as any);
          return;
        }
      }
    }

    saveBinderPageScanSession({
      scanSessionId: routeInstanceId.current,
      binderId,
      layout: binderPageLayout,
      capturedAt: new Date().toISOString(),
      originalUri: photo.uri,
      pageUri,
      processingMs: Date.now() - startedAt,
      pockets: finalPockets,
    });

    await logScanLearningEvent({
      scanSessionId: routeInstanceId.current,
      eventType: 'attempt',
      scanMode,
      routeContext: {
        mode,
        intent: scanIntent,
        flow,
        binderId,
        source: 'binder-page',
        layout: binderPageLayout,
        pocketCount: finalPockets.length,
        statuses: pocketStatuses,
        analytics: binderPageAnalytics,
      },
      candidates: finalPockets.flatMap((pocket) => pocket.candidates.slice(0, 1).map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        set_id: candidate.set_id ?? null,
        set_name: candidate.set_name ?? null,
        number: candidate.number ?? null,
        provider: pocket.source,
        confidence: candidate.confidence ?? null,
        visualSimilarity: null,
        finalScore: null,
      }))),
      outcome: finalPockets.some((pocket) => pocket.candidates.length) ? 'candidates_returned' : 'no_match',
    });

    setScannerState({ type: 'confirm' });
    navigatingAwayRef.current = true;
    stopAutoScanner();
    router.replace({
      pathname: '/scan/binder-page-result',
      params: {
        scanSessionId: routeInstanceId.current,
        layout: binderPageLayout,
        ...(binderId ? { binderId } : {}),
      },
    } as any);
  }, [
    binderId,
    binderPageLayout,
    flow,
    identifyBinderPagePocket,
    mode,
    parentBinderPageSessionId,
    prepareBinderPagePocketImages,
    replaceBinderPocketIndex,
    scanIntent,
    scanMode,
    scannerClientContext,
    scannerFeatureFlags,
    setScannerState,
    shouldReplaceBinderPocket,
    stopAutoScanner,
  ]);

  const handleCapture = useCallback(async (source: 'manual' | 'auto' = 'manual', capturedPhoto?: CapturedPhoto) => {
    if (!cameraReady || navigatingAwayRef.current) return;
    if (captureInFlightRef.current) {
      logScannerLifecycleEvent('duplicate_prevented', 'duplicate_capture_blocked', { source });
      return;
    }

    const camera = cameraRef.current;
    if (!camera) {
      setScanMessage('Camera is not ready yet.');
      return;
    }

    captureInFlightRef.current = true;
    setScannerState({ type: 'capture_start' });
    setAcceptedPreviewUri(null);
    setScanMessage('Capturing card...');
    setMountError(null);

    const attemptStartedAt = Date.now();
    const timings: Record<string, number | null> = {
      captureMs: null,
      qualityMs: null,
      recognitionImageMs: null,
      identifyMs: null,
      ocrMs: null,
      localOcrMatchMs: null,
      localCatalogueLookupMs: null,
      resolveMatchesMs: null,
      learningLogMs: null,
      totalMs: null,
    };
    let diagnosticsSaved = false;
    let photoForDiagnostics: CapturedPhoto | null = null;
    let captureFrameForDiagnostics: CapturedFrame | null = null;
    let recognitionImageForDiagnostics: RecognitionImage | null = null;
    let qualityForDiagnostics: ScanQualityResult | null = null;
    let identifyDiagnostics: ScanIdentifyDiagnostics | null = null;
    let cardsForDiagnostics: ScanResultCard[] = [];
    let localOcrMatchForAnalytics: LocalOcrMatchResult | null = null;

    const buildAttemptAnalytics = (
      outcome: string,
      options: {
        candidateCount?: number | null;
        confidence?: number | null;
        language?: string | null;
        errorCategory?: string | null;
        quality?: ScanQualityResult | null;
        diagnostics?: ScanIdentifyDiagnostics | null;
        manualCorrection?: boolean;
        rescan?: boolean;
        duplicatePrevention?: boolean;
      } = {}
    ) => {
      const diagnostics = options.diagnostics ?? identifyDiagnostics;
      const quality = options.quality ?? qualityForDiagnostics ?? scanQualityRef.current;
      const timingMetrics: ScannerTimingMetrics = {
        camera_initialisation_ms: cameraInitialisationMsRef.current,
        first_card_detection_ms: firstCardDetectionMsRef.current,
        quality_gate_ms: timings.qualityMs,
        stable_capture_ms: source === 'auto' && stableCaptureStartedAtRef.current != null
          ? Date.now() - stableCaptureStartedAtRef.current
          : null,
        photo_capture_ms: timings.captureMs,
        perspective_crop_ms: timings.recognitionImageMs,
        ocr_ms: timings.ocrMs,
        local_candidate_match_ms: (timings.localOcrMatchMs ?? 0) + (timings.localCatalogueLookupMs ?? 0) || null,
        remote_request_ms: getRemoteRequestMs(diagnostics),
        database_save_ms: null,
        total_scan_ms: Date.now() - attemptStartedAt,
      };

      return buildScannerAnalyticsMetadata({
        timings: timingMetrics,
        scanIntent,
        scanMode,
        language: options.language
          ?? localOcrMatchForAnalytics?.signals.language
          ?? (cardsForDiagnostics[0] as any)?.language
          ?? null,
        matchSource: getMatchSource({
          localStatus: localOcrMatchForAnalytics?.status,
          diagnostics,
          candidateCount: options.candidateCount,
        }),
        confidence: options.confidence
          ?? cardsForDiagnostics[0]?.scan_confidence
          ?? localOcrMatchForAnalytics?.confidence
          ?? null,
        alternatives: options.candidateCount ?? cardsForDiagnostics.length,
        qualityFailureReasons: quality?.failures?.map((failure) => String(failure.code)) ?? [],
        manualCorrection: options.manualCorrection ?? false,
        rescan: options.rescan ?? Boolean(returnReason),
        cancellation: false,
        duplicatePrevention: options.duplicatePrevention ?? false,
        remoteEndpoint: getRemoteEndpointUsed(diagnostics),
        errorCategory: options.errorCategory ?? null,
        thresholdVersion: scannerThresholdSet.version,
        client: scannerClientContext,
        featureFlags: scannerFeatureFlags,
      });
    };

    const saveDiagnostics = (
      outcome: 'candidates_returned' | 'no_match' | 'inventory_callback' | 'failed' | 'quality_rejected',
      notes: string[] = []
    ) => {
      if (diagnosticsSaved) return;
      diagnosticsSaved = true;
      timings.totalMs = Date.now() - attemptStartedAt;
      const diagnosticCrop = photoForDiagnostics
        ? getPhotoCropFromGeometry(photoForDiagnostics, captureFrameForDiagnostics)
        : null;
      saveScanAttemptDiagnostics({
        scanSessionId: routeInstanceId.current,
        createdAt: new Date().toISOString(),
        source,
        mode,
        intent: scanIntent,
        flow: flow ?? null,
        binderId,
        pathname,
        outcome,
        timings,
        image: {
          originalWidth: photoForDiagnostics?.width ?? null,
          originalHeight: photoForDiagnostics?.height ?? null,
          crop: diagnosticCrop,
          captureFrame: captureFrameForDiagnostics
            ? {
                scanSessionId: captureFrameForDiagnostics.scanSessionId,
                capturedAt: captureFrameForDiagnostics.capturedAt,
                originalUri: captureFrameForDiagnostics.originalUri,
                pixelWidth: captureFrameForDiagnostics.pixelWidth,
                pixelHeight: captureFrameForDiagnostics.pixelHeight,
                orientation: captureFrameForDiagnostics.orientation,
                rotationDegrees: captureFrameForDiagnostics.rotationDegrees,
                mirrored: captureFrameForDiagnostics.mirrored,
                previewDimensions: captureFrameForDiagnostics.previewDimensions,
                previewResizeMode: captureFrameForDiagnostics.previewResizeMode,
                detectedCardQuadrilateral: captureFrameForDiagnostics.detectedCardQuadrilateral,
              }
            : null,
          localisation: compactLocalisationDiagnostics(recognitionImageForDiagnostics?.localisation ?? localisationRef.current),
          quality: compactScanQualityDiagnostics(qualityForDiagnostics ?? scanQualityRef.current),
          recognitionWidth: recognitionImageForDiagnostics?.width ?? null,
          recognitionHeight: recognitionImageForDiagnostics?.height ?? null,
          recognitionBytesApprox: estimateBase64Bytes(recognitionImageForDiagnostics?.base64),
        },
        frameMetrics: compactFrameMetrics(frameAssessmentRef.current),
        providers: identifyDiagnostics?.providers ?? [],
        candidates: buildResultCandidateDiagnostics(cardsForDiagnostics),
        shadowMode: identifyDiagnostics?.shadowMode ?? null,
        notes: [
          ...(identifyDiagnostics?.notes ?? []),
          ...notes,
        ],
      });
    };

    try {
      if (source === 'manual') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const captureStartedAt = Date.now();
      const photo = capturedPhoto ?? await camera.takePictureAsync({
        quality: 0.7,
        base64: false,
        exif: false,
      });
      timings.captureMs = capturedPhoto ? 0 : Date.now() - captureStartedAt;
      photoForDiagnostics = photo;
      const capturedFrame = createScanCapturedFrame(photo);
      captureFrameForDiagnostics = capturedFrame;

      if (isBinderPageScan && SCAN_BINDER_PAGE_V2_ENABLED) {
        await processBinderPageCapture(photo, capturedFrame, timings.captureMs, attemptStartedAt);
        return;
      }

      setScanMessage('Checking image quality...');
      setScannerState({ type: 'quality_check' });
      const qualityStartedAt = Date.now();
      const { quality, localisation } = await evaluateCapturedPhotoQuality(photo, capturedFrame);
      timings.qualityMs = Date.now() - qualityStartedAt;
      qualityForDiagnostics = quality;
      const frameValidation = validateScannerFrame({ quality, localisation });

      if (SCAN_QUALITY_ENABLED && quality && (!quality.passed || !frameValidation.canContinue)) {
        const isNoTradingCard = frameValidation.rejectionReason === 'no_trading_card';
        const message = frameValidation.message ?? quality.instructionText;
        setScanMessage(message);
        saveDiagnostics('quality_rejected', [
          `pipeline:${SCANNER_RECOGNITION_PIPELINE_VERSION}`,
          `frame-validation:${frameValidation.rejectionReason ?? 'quality'}`,
          ...frameValidation.evidence,
          ...quality.failures.map((failure) => `${failure.code}:${failure.score}`),
        ]);
        await logScanLearningEvent({
          scanSessionId: routeInstanceId.current,
          eventType: 'attempt',
          scanMode,
          routeContext: {
            mode,
            intent: scanIntent,
            flow,
            binderId,
            source,
            pathname,
            recognitionPipeline: {
              version: SCANNER_RECOGNITION_PIPELINE_VERSION,
              frameValidation,
            },
            analytics: buildAttemptAnalytics('quality_rejected', {
              candidateCount: 0,
              quality,
              errorCategory: frameValidation.rejectionReason ?? 'quality_gate',
            }),
          },
          frameMetrics: compactFrameMetrics(frameAssessmentRef.current),
          outcome: 'quality_rejected',
          notes: [
            `frame-validation:${frameValidation.rejectionReason ?? 'quality'}`,
            ...frameValidation.evidence,
            ...quality.failures.map((failure) => `${failure.code}:${failure.score}`),
          ].join(', '),
        });
        setScannerState({ type: 'search' });
        Alert.alert(
          isNoTradingCard ? 'No trading card detected' : 'Scan needs a clearer photo',
          message,
          [
            {
              text: 'Try again',
              style: 'cancel',
              onPress: () => logScannerLifecycleEvent('rescan', 'retry_requested', { source: 'quality-alert' }),
            },
            { text: isListingFlow ? 'Add manually' : 'Search manually', onPress: openManualSearch },
          ]
        );
        return;
      }

      setScanMessage('Preparing scan...');
      const recognitionImageStartedAt = Date.now();
      const recognitionImages = await preparePhotosForRecognition(photo, capturedFrame);
      timings.recognitionImageMs = Date.now() - recognitionImageStartedAt;
      recognitionImageForDiagnostics = recognitionImages[0] ?? null;
      const resultRectifiedImage = recognitionImages.find((image) => image.role === 'localised-card-crop')
        ?? recognitionImages.find((image) => image.role === 'target-crop')
        ?? recognitionImages[0]
        ?? null;
      setAcceptedPreviewUri(resultRectifiedImage?.uri ?? photo.uri);
      setScannerState({ type: 'captured' });

      const base64Images = recognitionImages
        .map((image) => image.base64 ?? '')
        .filter((base64) => base64.trim().length > 0);
      if (!base64Images.length) throw new Error('Camera did not return image data.');

      setScannerState({ type: 'identify_start' });
      const ocrStartedAt = Date.now();
      setScanMessage('Reading card text...');
      const ocrSourceImage = getOcrSourceImage(recognitionImages);
      const targetedOcr = await runTargetedCardOcr(ocrSourceImage);
      timings.ocrMs = Date.now() - ocrStartedAt;
      const ocrText = targetedOcr.text;

      let localOcrMatch: LocalOcrMatchResult | null = null;
      let localOcrDiagnostics: ScanIdentifyDiagnostics | null = null;
      let localIdentified: IdentifiedCard[] = [];
      if (SCAN_LOCAL_OCR_MATCHER_ENABLED && targetedOcr.regions.length > 0) {
        const localStartedAt = Date.now();
        setScanMessage('Checking local catalogue...');
        localOcrMatch = await matchLocalOcrCandidates(targetedOcr.regions, {
          maxCandidates: MAX_RESULT_CARDS,
          scanImageBase64: ocrSourceImage?.base64 ?? base64Images[0] ?? null,
          strongConfidence: scannerThresholdSet.thresholds.recognition.localAutoConfirmConfidence,
        });
        localOcrMatchForAnalytics = localOcrMatch;
        timings.localOcrMatchMs = Date.now() - localStartedAt;
        localOcrDiagnostics = buildLocalOcrDiagnostics(localOcrMatch, recognitionImages.length);
        localIdentified = localOcrMatch.candidates
          .slice(0, MAX_RESULT_CARDS)
          .map(localOcrCandidateToIdentifiedCard);
        const cachedLookupStartedAt = Date.now();
        const cachedIdentified = await lookupStackrCachedIdentities(localOcrMatch);
        timings.localCatalogueLookupMs = Date.now() - cachedLookupStartedAt;
        localIdentified = mergeIdentifiedCards(cachedIdentified, localIdentified).slice(0, MAX_RESULT_CARDS);

        logCameraDiagnostic('local ocr match complete', {
          routeInstanceId: routeInstanceId.current,
          status: localOcrMatch.status,
          confidence: localOcrMatch.confidence,
          best: localOcrMatch.bestMatch?.card.name ?? null,
          reasons: localOcrMatch.bestMatch?.reasons ?? [],
          candidates: localOcrMatch.candidates.length,
          cachedCandidates: cachedIdentified.length,
        });
      }

      let identified: IdentifiedCard[] = [];
      if (localOcrMatch?.status === 'strong' && localIdentified.length) {
        identified = localIdentified;
        timings.identifyMs = 0;
        identifyDiagnostics = localOcrDiagnostics;
        setScanMessage('Local match found.');
      } else {
        const identifyStartedAt = Date.now();
        let remoteDiagnostics: ScanIdentifyDiagnostics | null = null;
        try {
          setScanMessage('Matching artwork...');
          const localPrintedNumber = localOcrMatch?.signals.printedNumber;
          const detailedResult = await identifyCardsDetailed(base64Images, binderId ?? undefined, {
            ocrText,
            language: localOcrMatch?.signals.language === 'unknown' ? null : localOcrMatch?.signals.language,
            printedNumber: localPrintedNumber?.number && localPrintedNumber.denominator
              ? { number: localPrintedNumber.number, total: localPrintedNumber.denominator }
              : null,
            setId: localOcrMatch?.bestMatch?.card.set_id ?? null,
            localConfidence: localOcrMatch?.confidence ?? null,
            localStatus: localOcrMatch?.status ?? null,
            ambiguousVariants: Boolean(
              localOcrMatch?.status === 'ambiguous'
              || localOcrMatch?.candidates.some((candidate) => candidate.ambiguousVariant)
            ),
            scanSessionId: routeInstanceId.current,
            itemType: scanIntentConfig.itemType,
            isSlab: scanIntent === 'graded_slab',
            rectifiedImageUri: resultRectifiedImage?.uri ?? ocrSourceImage?.uri ?? null,
          });
          timings.identifyMs = Date.now() - identifyStartedAt;
          identified = detailedResult.cards;
          remoteDiagnostics = detailedResult.diagnostics;
        } catch (error) {
          timings.identifyMs = Date.now() - identifyStartedAt;
          logCameraDiagnostic('remote identify failed', {
            routeInstanceId: routeInstanceId.current,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const useAmbiguousLocalCandidates = !isInventoryFlow && localIdentified.length > 0;
        identified = mergeIdentifiedCards(
          identified,
          useAmbiguousLocalCandidates ? localIdentified : []
        ).slice(0, MAX_RESULT_CARDS);
        identified = rankIdentifiedCardsWithPipeline(identified, localOcrMatch?.signals ?? null).slice(0, MAX_RESULT_CARDS);
        identifyDiagnostics = mergeIdentifyDiagnostics(localOcrDiagnostics, remoteDiagnostics, recognitionImages.length);
      }

      const identifiedQuery = buildIdentifySearchQuery(identified[0]);
      if (identifiedQuery) setLastQuery(identifiedQuery);

      const localOcrQuery = buildLocalOcrSearchQuery(localOcrMatch);
      const ocrQuery = localOcrQuery || buildOcrSearchQuery(ocrText);
      if (!identifiedQuery && ocrQuery) setLastQuery(ocrQuery);
      const resultQuery = identifiedQuery || ocrQuery || lastQuery;

      const resolveStartedAt = Date.now();
      const cards = await resolveMatches(identified, ocrText);
      timings.resolveMatchesMs = Date.now() - resolveStartedAt;
      cardsForDiagnostics = cards;
      const learningStartedAt = Date.now();
      await logScanLearningEvent({
        scanSessionId: routeInstanceId.current,
        eventType: 'attempt',
        scanMode,
        routeContext: {
          mode,
          intent: scanIntent,
          flow,
          binderId,
          source,
          pathname,
          recognitionPipeline: {
            version: SCANNER_RECOGNITION_PIPELINE_VERSION,
            stages: [
              'quality_validation',
              'image_correction',
              'candidate_retrieval',
              'candidate_ranking',
              'confirmation',
            ],
            frameValidation: {
              canContinue: true,
              rejectionReason: null,
            },
          },
          localOcr: localOcrMatch ? {
            status: localOcrMatch.status,
            confidence: localOcrMatch.confidence,
            language: localOcrMatch.signals.language,
            printedNumber: localOcrMatch.signals.printedNumber,
            setCode: localOcrMatch.signals.setCode,
            best: localOcrMatch.bestMatch ? {
              id: localOcrMatch.bestMatch.card.id,
              name: localOcrMatch.bestMatch.card.name,
              set_id: localOcrMatch.bestMatch.card.set_id,
              number: localOcrMatch.bestMatch.card.number,
              reasons: localOcrMatch.bestMatch.reasons,
              ambiguousVariant: localOcrMatch.bestMatch.ambiguousVariant,
            } : null,
          } : null,
          recognitionDiagnostics: identifyDiagnostics ? {
            totalMs: identifyDiagnostics.totalMs,
            providers: identifyDiagnostics.providers.map((provider) => ({
              provider: provider.provider,
              stage: provider.stage,
              ok: provider.ok,
              durationMs: provider.durationMs,
              decision: provider.decision,
              candidateCount: provider.candidateCount,
              accepted: provider.accepted ?? false,
              topCandidate: provider.topCandidate?.name ?? null,
              topVisualSimilarity: provider.topCandidate?.visualSimilarity ?? null,
              topFinalScore: provider.topCandidate?.finalScore ?? null,
              error: provider.error ?? null,
            })),
            shadowMode: identifyDiagnostics.shadowMode ? {
              category: identifyDiagnostics.shadowMode.agreement.disagreementCategory,
              localOutcome: identifyDiagnostics.shadowMode.local.outcome,
              visibleOutcome: identifyDiagnostics.shadowMode.visible.outcome,
              localTopCandidates: identifyDiagnostics.shadowMode.local.topCandidates.slice(0, 3),
              visibleTopCandidate: identifyDiagnostics.shadowMode.visible.topCandidates[0] ?? null,
              timings: {
                localTotalMs: identifyDiagnostics.shadowMode.local.timings.totalMs,
                visibleTotalMs: identifyDiagnostics.shadowMode.visible.timings.totalMs,
              },
            } : null,
          } : null,
          analytics: buildAttemptAnalytics(cards.length ? 'candidates_returned' : 'no_match', {
            candidateCount: cards.length || identified.length,
            confidence: cards[0]?.scan_confidence ?? localOcrMatch?.confidence ?? null,
            language: localOcrMatch?.signals.language ?? cards[0]?.language ?? null,
            diagnostics: identifyDiagnostics,
          }),
        },
        frameMetrics: compactFrameMetrics(frameAssessmentRef.current),
        ocrPreview: ocrText,
        candidates: buildLearningCandidates(cards.length ? cards : identified),
        outcome: cards.length ? 'candidates_returned' : 'no_match',
      });
      timings.learningLogMs = Date.now() - learningStartedAt;
      const resolvedCard = cards[0] ?? identified[0] ?? null;

      if (isInventoryFlow) {
        saveDiagnostics('inventory_callback');
        await scanStore.triggerCallback(base64Images[0] ?? '', resolvedCard);
        navigatingAwayRef.current = true;
        stopAutoScanner();
        router.back();
        return;
      }

      if (!cards.length) {
        saveDiagnostics('no_match');
        setScannerState({ type: 'error' });
        setScanMessage('I could not identify this one. Try again or search manually.');
        Alert.alert(
          'Could not identify card',
          'Try another scan in brighter light, or search manually.',
          [
            {
              text: 'Try again',
              style: 'cancel',
              onPress: () => {
                logScannerLifecycleEvent('rescan', 'retry_requested', { source: 'no-match-alert' });
                setAcceptedPreviewUri(null);
                setScannerState({ type: 'search' });
              },
            },
            { text: isListingFlow ? 'Add manually' : 'Search manually', onPress: openManualSearch },
          ]
        );
        return;
      }

      setScanMessage(cards.length === 1 ? 'Card found.' : `${cards.length} possible matches found.`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      saveDiagnostics('candidates_returned');
      setScannerState({ type: 'confirm' });
      navigatingAwayRef.current = true;
      stopAutoScanner();
      router.replace({
        pathname: '/scan/result',
        params: {
          cardsJson: serializeScanCardsForNavigation(cards),
          scanSessionId: routeInstanceId.current,
          mode,
          intent: scanIntent,
          ...(resultQuery ? { q: resultQuery } : {}),
          ...(flow ? { flow } : {}),
          ...(binderId ? { binderId } : {}),
          type: scanIntentConfig.itemType,
          ...(resultRectifiedImage?.uri ? { rectifiedImageUri: resultRectifiedImage.uri } : {}),
          ...(resultRectifiedImage?.width ? { rectifiedImageWidth: String(resultRectifiedImage.width) } : {}),
          ...(resultRectifiedImage?.height ? { rectifiedImageHeight: String(resultRectifiedImage.height) } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while scanning.';
      setScanMessage('Scan failed. Try again or search manually.');
      saveDiagnostics('failed', [message]);
      const errorCategory = classifyScannerErrorCategory(error);
      await logScanLearningEvent({
        scanSessionId: routeInstanceId.current,
        eventType: 'attempt',
        scanMode,
        routeContext: {
          mode,
          intent: scanIntent,
          flow,
          binderId,
          source,
          pathname,
          analytics: buildAttemptAnalytics('failed', {
            candidateCount: cardsForDiagnostics.length,
            errorCategory,
            diagnostics: identifyDiagnostics,
          }),
        },
        frameMetrics: compactFrameMetrics(frameAssessmentRef.current),
        candidates: buildLearningCandidates(cardsForDiagnostics),
        outcome: 'failed',
        notes: message,
      });
      setScannerState({ type: 'error' });
      logCameraDiagnostic('capture failed', {
        routeInstanceId: routeInstanceId.current,
        error: message,
        errorCategory,
      });
      Alert.alert('Scan failed', message, [
        {
          text: 'Try again',
          style: 'cancel',
          onPress: () => {
            logScannerLifecycleEvent('rescan', 'retry_requested', { source: 'error-alert' });
            setAcceptedPreviewUri(null);
            setScannerState({ type: 'search' });
          },
        },
        { text: isListingFlow ? 'Add manually' : 'Search manually', onPress: openManualSearch },
      ]);
    } finally {
      captureInFlightRef.current = false;
      if (source === 'auto') lastAutoCaptureAt.current = Date.now();
    }
  }, [
    binderId,
    cameraReady,
    createScanCapturedFrame,
    evaluateCapturedPhotoQuality,
    getPhotoCropFromGeometry,
    isBinderPageScan,
    isInventoryFlow,
    isListingFlow,
    lookupStackrCachedIdentities,
    logScannerLifecycleEvent,
    mode,
    openManualSearch,
    pathname,
    processBinderPageCapture,
    preparePhotosForRecognition,
    resolveMatches,
    returnReason,
    runTargetedCardOcr,
    scanIntent,
    scanIntentConfig.itemType,
    scanMode,
    scannerClientContext,
    scannerFeatureFlags,
    scannerThresholdSet.thresholds.recognition.localAutoConfirmConfidence,
    scannerThresholdSet.version,
    setScannerState,
    stopAutoScanner,
    flow,
    lastQuery,
  ]);

  const setScanModePreference = useCallback((next: ScanMode) => {
    stopAutoScanner();
    applyFrameAssessment(null);
    applyLocalisationResult(null);
    applyScanQualityResult(null);
    setAcceptedPreviewUri(null);
    setScannerState({ type: 'search' });
    setScanMode((current) => {
      if (current === next) return current;
      setScanMessage(next === 'auto'
        ? 'Centre one card. Keep other cards in the dim area.'
        : 'Manual mode. Centre one card in the window, then tap scan.'
      );
      return next;
    });
  }, [applyFrameAssessment, applyLocalisationResult, applyScanQualityResult, setScannerState, stopAutoScanner]);

  const runAutoFrameCheck = useCallback(async () => {
    if (
      scanMode !== 'auto'
      || !permissionGranted
      || !cameraReady
      || !appActive
      || captureBusy
      || captureInFlightRef.current
      || navigatingAwayRef.current
      || mountError
      || inlineManualSearchOpen
      || autoCheckBusy.current
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastAutoCaptureAt.current < autoScanCooldownMs) return;

    const camera = cameraRef.current;
    if (!camera) return;

    autoCheckBusy.current = true;
    try {
      const photo = await camera.takePictureAsync({
        quality: 0.46,
        base64: false,
        exif: false,
      });
      const capturedFrame = createScanCapturedFrame(photo);
      const preview = await preparePhotoForFrameCheck(photo, capturedFrame, CARD_LOCALISATION_ENABLED
        ? { paddingRatio: 0, width: LOCALISATION_FRAME_CHECK_WIDTH, compress: 0.48 }
        : undefined
      );
      const previousLocalisation = localisationRef.current;
      const rawLocalisation = CARD_LOCALISATION_ENABLED && preview.base64
        ? localiseCardFromJpegBase64(preview.base64, {
            expectedAspectRatio: CARD_ASPECT_RATIO,
            guideRect: { x: 0, y: 0, width: preview.width ?? 1, height: preview.height ?? 1 },
            minFrameCoverage: 0.08,
            maxFrameCoverage: 0.82,
            safetyMarginRatio: CARD_LOCALISATION_SAFETY_MARGIN,
          })
        : null;
      const localisation = CARD_LOCALISATION_ENABLED && rawLocalisation
        ? smoothCardLocalisation(
            previousLocalisation,
            rawLocalisation
          )
        : null;
      applyLocalisationResult(localisation);

      const quality = SCAN_QUALITY_ENABLED
        ? evaluateScanQuality(preview.base64 ?? '', {
            localisation,
            previousLocalisation,
            calibration: scanQualityCalibration,
          })
        : null;
      applyScanQualityResult(quality);

      const assessment = quality
        ? frameAssessmentFromScanQuality(quality)
        : assessFrameImage(preview.base64 ?? '');
      applyFrameAssessment(assessment);

      logCameraDiagnostic('auto frame assessment', {
        routeInstanceId: routeInstanceId.current,
        state: scannerStateRef.current,
        ready: assessment.ready,
        reason: assessment.reason,
        score: Number(assessment.score.toFixed(3)),
        brightness: Number(assessment.brightness.toFixed(1)),
        contrast: Number(assessment.contrast.toFixed(1)),
        edgeDensity: Number(assessment.edgeDensity.toFixed(3)),
        glareRatio: Number(assessment.glareRatio.toFixed(3)),
        quality: compactScanQualityDiagnostics(quality),
        localisation: compactLocalisationDiagnostics(localisation),
      });

      const detectedCard = Boolean(
        localisation?.status === 'confident'
        || localisation?.status === 'uncertain'
        || assessment.ready
      );
      if (detectedCard && firstCardDetectionMsRef.current == null) {
        firstCardDetectionMsRef.current = Date.now() - scannerMountedAt.current;
      }

      if (SCAN_AUTO_CAPTURE_V2_ENABLED) {
        const hasValidQuadrilateral = Boolean(localisation?.status === 'confident' && localisation.quadrilateral);
        const qualityPassed = assessment.ready
          && (!SCAN_QUALITY_ENABLED || Boolean(quality?.passed))
          && (!CARD_LOCALISATION_ENABLED || hasValidQuadrilateral);
        const decision = evaluateStableAutoCapture({
          mode: scanMode,
          state: scannerStateRef.current,
          hasValidQuadrilateral,
          qualityPassed,
          currentStableFrames: autoReadyFrames.current,
          requiredStableFrames: autoCaptureReadyFrames,
          captureInProgress: captureInFlightRef.current || captureBusy,
          nowMs: now,
          lastCaptureAtMs: lastAutoCaptureAt.current,
          cooldownMs: autoScanCooldownMs,
        });

        autoReadyFrames.current = decision.stableFrames;
        setScannerStateDirect(decision.nextState);

        if (decision.reason === 'quality') {
          stableCaptureStartedAtRef.current = null;
          setScanMessage(assessment.message);
          return;
        }

        if (decision.reason === 'searching') {
          stableCaptureStartedAtRef.current = null;
          setScanMessage('Centre one card. Keep other cards in the dim area.');
          return;
        }

        if (decision.reason === 'hold-steady') {
          if (stableCaptureStartedAtRef.current == null) stableCaptureStartedAtRef.current = Date.now();
          setScanMessage('Hold steady.');
          return;
        }

        if (!decision.shouldCapture) {
          return;
        }

        if (stableCaptureStartedAtRef.current == null) stableCaptureStartedAtRef.current = Date.now();
        setScanMessage('Hold steady.');
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setScanMessage('Card locked. Scanning...');
        await handleCapture('auto');
        return;
      }

      if (!assessment.ready) {
        autoReadyFrames.current = 0;
        setScanMessage(assessment.message);
        return;
      }

      if (!SCAN_QUALITY_ENABLED && CARD_LOCALISATION_ENABLED && localisation?.status !== 'confident') {
        autoReadyFrames.current = 0;
        setScanMessage(getCardLocalisationGuidance(localisation));
        return;
      }

      autoReadyFrames.current += 1;
      const requiredReadyFrames = assessment.score >= autoCaptureThresholds.highConfidenceSingleFrameScore
        ? 1
        : autoCaptureReadyFrames;
      if (autoReadyFrames.current < requiredReadyFrames) {
        setScanMessage('Good position. Hold steady...');
        return;
      }

      autoReadyFrames.current = 0;
      setScanMessage('Card locked. Scanning...');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await handleCapture('auto', photo);
    } catch (error) {
      autoReadyFrames.current = 0;
      applyLocalisationResult(null);
      applyScanQualityResult(null);
      applyFrameAssessment(buildFrameAssessment({
        message: 'Centre one card. Keep other cards in the dim area.',
        reason: 'frame-check-failed',
      }));
      setScanMessage('Centre one card. Keep other cards in the dim area.');
      logCameraDiagnostic('auto frame check failed', {
        routeInstanceId: routeInstanceId.current,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      autoCheckBusy.current = false;
    }
  }, [
    cameraReady,
    appActive,
    autoCaptureReadyFrames,
    autoCaptureThresholds.highConfidenceSingleFrameScore,
    autoScanCooldownMs,
    captureBusy,
    applyFrameAssessment,
    applyLocalisationResult,
    applyScanQualityResult,
    createScanCapturedFrame,
    handleCapture,
    inlineManualSearchOpen,
    mountError,
    permissionGranted,
    preparePhotoForFrameCheck,
    scanMode,
    scanQualityCalibration,
    setScannerStateDirect,
  ]);

  useEffect(() => {
    if (autoCheckTimer.current) {
      clearTimeout(autoCheckTimer.current);
      autoCheckTimer.current = null;
    }

    autoReadyFrames.current = 0;

    if (scanMode !== 'auto') {
      if (!captureBusy) {
        setScanMessage(returnedFromRejectedMatches
          ? 'No worries. Centre the right card and scan again.'
          : 'Manual mode. Centre one card in the window, then tap scan.'
        );
        if (appActive && cameraReady && permissionGranted && !mountError) setScannerState({ type: 'search' });
      }
      return;
    }

    if (!appActive) return;

    if (!permissionGranted) return;

    if (!cameraReady) {
      setScanMessage('Camera warming up...');
      setScannerState({ type: 'camera_paused' });
      return;
    }

    if (captureBusy || mountError) return;

    let cancelled = false;
    const sampleIntervalMs = CARD_LOCALISATION_ENABLED
      ? getLocalisationSampleIntervalMs()
      : AUTO_FRAME_CHECK_INTERVAL_MS;
    const schedule = (delay = 650) => {
      autoCheckTimer.current = setTimeout(async () => {
        if (cancelled || navigatingAwayRef.current) return;
        await runAutoFrameCheck();
        if (!cancelled && !navigatingAwayRef.current) schedule(sampleIntervalMs);
      }, delay);
    };

    setScanMessage('Centre one card. Keep other cards in the dim area.');
    setScannerState({ type: 'search' });
    schedule();

    return () => {
      cancelled = true;
      if (autoCheckTimer.current) {
        clearTimeout(autoCheckTimer.current);
        autoCheckTimer.current = null;
      }
    };
  }, [
    appActive,
    cameraReady,
    captureBusy,
    mountError,
    permissionGranted,
    returnedFromRejectedMatches,
    runAutoFrameCheck,
    scanMode,
    setScannerState,
  ]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {shouldRenderCamera ? (
        <CameraView
          key={facing}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          active={appActive && shouldRenderCamera && !navigatingAwayRef.current}
          enableTorch={torchEnabled && facing === 'back'}
          animateShutter={false}
          onCameraReady={handleCameraReady}
          onMountError={handleMountError}
        />
      ) : null}

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.mask, { top: 0, left: 0, right: 0, height: frame.top }]} />
        <View style={[styles.mask, { top: frame.top + frame.height, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.mask, { top: frame.top, left: 0, width: frame.left, height: frame.height }]} />
        <View style={[styles.mask, { top: frame.top, right: 0, width: Math.max(0, width - frame.left - frame.width), height: frame.height }]} />
        <View
          style={[
            styles.frameHalo,
            {
              top: frame.top - 8,
              left: frame.left - 8,
              width: frame.width + 16,
              height: frame.height + 16,
            },
          ]}
        />
        <View
          style={[
            styles.cardFrame,
            guideLocked && styles.cardFrameLocked,
            {
              top: frame.top,
              left: frame.left,
              width: frame.width,
              height: frame.height,
              borderColor: activeFrameTone,
            },
          ]}
        />
        {localisationPolygon ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Polygon
              points={localisationPolygon}
              fill={localisationResult?.status === 'confident' ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.08)'}
              stroke={activeFrameTone}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
        {binderGridLines.map((ratio) => (
          <View
            key={`binder-v-${ratio}`}
            style={[
              styles.binderGridLine,
              {
                top: frame.top,
                left: frame.left + frame.width * ratio,
                height: frame.height,
                width: 1,
              },
            ]}
          />
        ))}
        {binderGridLines.map((ratio) => (
          <View
            key={`binder-h-${ratio}`}
            style={[
              styles.binderGridLine,
              {
                top: frame.top + frame.height * ratio,
                left: frame.left,
                width: frame.width,
                height: 1,
              },
            ]}
          />
        ))}
        <View style={[styles.corner, styles.cornerTopLeft, { top: frame.top - 1, left: frame.left - 1, borderColor: activeFrameTone }]} />
        <View style={[styles.corner, styles.cornerTopRight, { top: frame.top - 1, left: frame.left + frame.width - 29, borderColor: activeFrameTone }]} />
        <View style={[styles.corner, styles.cornerBottomLeft, { top: frame.top + frame.height - 29, left: frame.left - 1, borderColor: activeFrameTone }]} />
        <View style={[styles.corner, styles.cornerBottomRight, { top: frame.top + frame.height - 29, left: frame.left + frame.width - 29, borderColor: activeFrameTone }]} />
      </View>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={closeScanner}
            style={styles.iconButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.statusPill}>
            <View style={[styles.readyDot, { backgroundColor: cameraReady ? '#22C55E' : '#FBBF24' }]} />
            <Text style={styles.statusText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {activeStatusText}
            </Text>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              onPress={() => setTorchEnabled((current) => !current)}
              disabled={!permissionGranted || facing !== 'back'}
              style={[styles.iconButton, (!permissionGranted || facing !== 'back') && styles.disabledButton]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Toggle torch"
            >
              <Ionicons name={torchEnabled ? 'flash' : 'flash-outline'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={switchCamera}
              disabled={!permissionGranted}
              style={[styles.iconButton, !permissionGranted && styles.disabledButton]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Switch camera"
            >
              <Ionicons name="camera-reverse-outline" size={23} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[styles.instructionWrap, { top: Math.max(insets.top + 86, frame.top - 64) }]}
          accessibilityRole="text"
          accessibilityLabel={activeGuidanceAccessibilityLabel}
        >
          <View style={styles.instructionPill}>
            <View style={[styles.guidanceIcon, { backgroundColor: `${activeGuidanceTone}24` }]}>
              <Ionicons name={activeGuidanceIcon as any} size={18} color={activeGuidanceTone} />
            </View>
            <View style={styles.guidanceCopy}>
              <Text style={styles.guidanceLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {activeGuidanceLabel}
              </Text>
              <Text style={styles.instructionText} maxFontSizeMultiplier={1.35}>
                {activeGuidanceMessage}
              </Text>
            </View>
          </View>
        </View>

        {SCAN_QUALITY_DIAGNOSTICS_ENABLED && scanQualityResult ? (
          <View pointerEvents="none" style={[styles.qualityDiagnostics, { top: frame.top + frame.height + 10 }]}>
            <Text style={styles.qualityDiagnosticsText}>
              {`Q ${scanQualityResult.passed ? 'pass' : 'fail'} | F ${scanQualityResult.focusScore} G ${scanQualityResult.glareScore} L ${scanQualityResult.exposureScore}`}
            </Text>
            <Text style={styles.qualityDiagnosticsText}>
              {`Frame ${scanQualityResult.framingScore} Stable ${scanQualityResult.stabilityScore} Obstruct ${scanQualityResult.obstructionScore}`}
            </Text>
            <Text style={styles.qualityDiagnosticsText}>
              {`Geo ${scanQualityResult.metrics.cardCoverage} ${scanQualityResult.metrics.cornersVisible ? 'corners' : 'no-corners'} | ${scanQualityResult.failures.map((failure) => failure.code).join(', ') || 'ready'}`}
            </Text>
          </View>
        ) : null}

        {acceptedPreviewUri && (scannerState === 'CAPTURED' || scannerState === 'IDENTIFYING' || scannerState === 'CONFIRMING') ? (
          <View pointerEvents="none" style={styles.acceptedPreviewWrap}>
            <Text style={styles.acceptedPreviewLabel}>
              {scannerState === 'IDENTIFYING' ? 'Identifying this card' : 'Captured crop'}
            </Text>
            <Image source={{ uri: acceptedPreviewUri }} style={styles.acceptedPreviewImage} resizeMode="contain" />
          </View>
        ) : null}

        {!permissionGranted ? (
          <View style={styles.permissionCard}>
            <Ionicons name="camera-outline" size={30} color={theme.colors.primary} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              Stackr needs camera permission to scan cards.
            </Text>
            <Pressable
              onPress={handleRequestPermission}
              disabled={permissionRequesting}
              style={[styles.permissionButton, permissionRequesting && styles.disabledButton]}
              accessibilityRole="button"
              accessibilityLabel="Enable camera access"
            >
              <Text style={styles.permissionButtonText}>
                {permissionRequesting ? 'Requesting...' : 'Enable camera'}
              </Text>
            </Pressable>
            <Text style={styles.permissionStatus}>Status: {permissionStatus}</Text>
          </View>
        ) : null}

        {mountError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Camera issue</Text>
            <Text style={styles.errorBody}>{mountError}</Text>
          </View>
        ) : null}

        {inlineManualSearchOpen ? (
          <View style={[styles.inlineManualSearchPanel, { bottom: Math.max(148, insets.bottom + 128) }]}>
            <View style={styles.inlineManualSearchHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.inlineManualSearchTitle}>Manual search</Text>
                <Text style={styles.inlineManualSearchSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                  Search without restarting the camera.
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeInlineManualSearch}
                style={styles.inlineManualSearchClose}
                accessibilityRole="button"
                accessibilityLabel="Close manual search"
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.inlineManualSearchInputWrap}>
              <Ionicons name="search-outline" size={18} color="#DDD6FE" />
              <TextInput
                value={inlineManualSearchQuery}
                onChangeText={setInlineManualSearchQuery}
                placeholder="Card name, set, or number"
                placeholderTextColor="rgba(221,214,254,0.58)"
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.inlineManualSearchInput}
                accessibilityLabel="Manual card search"
                returnKeyType="search"
                onSubmitEditing={() => runInlineManualSearch(inlineManualSearchQuery)}
              />
              {inlineManualSearchLoading ? <ActivityIndicator size="small" color="#DDD6FE" /> : null}
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.inlineManualSearchResults}
              contentContainerStyle={{ gap: 8 }}
            >
              {inlineManualSearchResults.map((card) => (
                <TouchableOpacity
                  key={card.id}
                  onPress={() => handleInlineManualSearchSelect(card)}
                  style={styles.inlineManualSearchResult}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${card.name}, ${card.set_name}, number ${card.number}`}
                >
                  {card.image_small ? (
                    <Image source={{ uri: card.image_small }} style={styles.inlineManualSearchThumb} resizeMode="contain" />
                  ) : (
                    <View style={styles.inlineManualSearchThumb} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.inlineManualSearchResultTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {card.name}
                    </Text>
                    <Text style={styles.inlineManualSearchResultMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {card.set_name} - No. {card.number || 'unknown'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#DDD6FE" />
                </TouchableOpacity>
              ))}
              {!inlineManualSearchLoading && inlineManualSearchQuery.trim().length >= 2 && inlineManualSearchResults.length === 0 ? (
                <Text style={styles.inlineManualSearchEmpty}>
                  No local matches yet.
                </Text>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.bottomPanel, { paddingBottom: Math.max(18, insets.bottom + 10) }]}>
          {isBinderPageScan ? (
            <View style={styles.layoutSelector}>
              <Text style={styles.layoutSelectorLabel}>Binder page layout</Text>
              <View style={styles.layoutChipRow}>
                {BINDER_PAGE_LAYOUTS.map((layout) => {
                  const active = binderPageLayout === layout;
                  return (
                    <TouchableOpacity
                      key={layout}
                      onPress={() => setRememberedBinderPageLayout(layout)}
                      activeOpacity={0.82}
                      style={[styles.layoutChip, active && styles.layoutChipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${layout} by ${layout} binder page layout`}
                    >
                      <Text style={[styles.layoutChipText, active && styles.layoutChipTextActive]}>
                        {layout}x{layout}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!isBinderPageScan ? (
            <View style={styles.modeToggle}>
              <TouchableOpacity
                onPress={() => setScanModePreference('auto')}
                activeOpacity={0.82}
                style={[styles.modeSegment, scanMode === 'auto' && styles.modeSegmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: scanMode === 'auto' }}
                accessibilityLabel="Use auto scan"
              >
                <Ionicons name="sparkles-outline" size={17} color={scanMode === 'auto' ? '#FFFFFF' : '#DDD6FE'} />
                <Text
                  style={[styles.modeSegmentText, scanMode === 'auto' && styles.modeSegmentTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  Auto scan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScanModePreference('manual')}
                activeOpacity={0.82}
                style={[styles.modeSegment, scanMode === 'manual' && styles.modeSegmentActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: scanMode === 'manual' }}
                accessibilityLabel="Use manual capture"
              >
                <Ionicons name="hand-left-outline" size={17} color={scanMode === 'manual' ? '#FFFFFF' : '#DDD6FE'} />
                <Text
                  style={[styles.modeSegmentText, scanMode === 'manual' && styles.modeSegmentTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  Manual capture
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.bottomControls}>
            <TouchableOpacity
              onPress={openManualSearch}
              style={styles.secondaryAction}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={isListingFlow ? 'Add manually' : 'Search manually without scanning'}
              accessibilityHint={localQuickScanExperienceEnabled ? 'Keeps the scan context so you can choose a card manually.' : undefined}
            >
              <Ionicons name="search-outline" size={20} color="#FFFFFF" />
              <Text style={styles.secondaryActionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>
                {isListingFlow ? 'Add manually' : 'Manual search'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleCapture('manual')}
              disabled={!cameraReady || captureBusy || !permissionGranted}
              activeOpacity={0.82}
              style={[
                styles.captureButton,
                (!cameraReady || captureBusy || !permissionGranted) && styles.captureDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Capture card"
              accessibilityHint="Takes a full-resolution photo of the centred card."
            >
              {captureBusy ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <View style={[styles.captureInner, { backgroundColor: theme.colors.primary }]} />
              )}
            </TouchableOpacity>

            <View style={styles.modeNote}>
              <Text style={styles.modeNoteTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                {isBinderPageScan ? 'Page' : scanMode === 'auto' ? 'Hover' : 'Tap'}
              </Text>
              <Text style={styles.modeNoteText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
                {isBinderPageScan
                  ? 'Each pocket is checked separately'
                  : scanMode === 'auto' ? 'Scans the centred card' : 'Capture the centred card'}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(18,10,46,0.74)',
  },
  frameHalo: {
    position: 'absolute',
    borderWidth: 8,
    borderRadius: 26,
    borderColor: 'rgba(105,56,245,0.2)',
  },
  cardFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  cardFrameLocked: {
    borderWidth: 3,
    backgroundColor: 'rgba(124,58,237,0.1)',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.65,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  binderGridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.46)',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#FFFFFF',
  },
  cornerTopLeft: {
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTopRight: {
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBottomLeft: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBottomRight: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    minHeight: 42,
    flex: 1,
    maxWidth: 190,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  instructionWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  instructionPill: {
    maxWidth: 360,
    minHeight: 54,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guidanceIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  guidanceLabel: {
    color: '#DDD6FE',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 1,
  },
  qualityDiagnostics: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.36)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  qualityDiagnosticsText: {
    color: '#DDD6FE',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  acceptedPreviewWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 170,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.42)',
    padding: 10,
    alignItems: 'center',
  },
  acceptedPreviewLabel: {
    color: '#DDD6FE',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  acceptedPreviewImage: {
    width: 112,
    height: 156,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  permissionCard: {
    marginHorizontal: 20,
    marginTop: 126,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    padding: 18,
    alignItems: 'center',
  },
  permissionTitle: {
    color: '#061A4A',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    marginTop: 10,
  },
  permissionBody: {
    color: '#6F6792',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  permissionButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#6D28D9',
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  permissionStatus: {
    color: '#8177A6',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  errorCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 156,
    borderRadius: 18,
    backgroundColor: 'rgba(127,29,29,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.45)',
    padding: 14,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  errorBody: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  inlineManualSearchPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxHeight: 318,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 12,
    gap: 10,
  },
  inlineManualSearchHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineManualSearchTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  inlineManualSearchSubtitle: {
    color: '#DDD6FE',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  inlineManualSearchClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineManualSearchInputWrap: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineManualSearchInput: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    paddingVertical: 9,
  },
  inlineManualSearchResults: {
    maxHeight: 190,
  },
  inlineManualSearchResult: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineManualSearchThumb: {
    width: 32,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  inlineManualSearchResultTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  inlineManualSearchResultMeta: {
    color: '#DDD6FE',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  inlineManualSearchEmpty: {
    color: '#DDD6FE',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 8,
  },
  bottomPanel: {
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 12,
  },
  layoutSelector: {
    gap: 8,
  },
  layoutSelectorLabel: {
    color: '#DDD6FE',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  layoutChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  layoutChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutChipActive: {
    backgroundColor: 'rgba(124,58,237,0.9)',
    borderColor: 'rgba(255,255,255,0.24)',
  },
  layoutChipText: {
    color: '#DDD6FE',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  layoutChipTextActive: {
    color: '#FFFFFF',
  },
  modeToggle: {
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  modeSegment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeSegmentActive: {
    backgroundColor: 'rgba(124,58,237,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  modeSegmentText: {
    color: '#DDD6FE',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  modeSegmentTextActive: {
    color: '#FFFFFF',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  captureDisabled: {
    opacity: 0.58,
  },
  captureInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  secondaryAction: {
    width: 104,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  secondaryActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  modeNote: {
    width: 104,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modeNoteTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  modeNoteText: {
    color: '#DDD6FE',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.54,
  },
});
