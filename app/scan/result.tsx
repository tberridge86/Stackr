import { useTheme } from '../../components/theme-context';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
  Image,
} from 'react-native';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrCardIdentity } from '../../components/StackrCardIdentity';
import { StackrCardActionIcon } from '../../components/StackrScreen';
import { useProfile } from '../../components/profile-context';
import { useTrade } from '../../components/trade-context';
import { useAppMode } from '../../components/app-mode-context';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import {
  PremiumCard,
  ProgressBadge,
  TrustBadge,
} from '../../components/PremiumUI';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchBinders } from '../../lib/binders';
import { fetchStackrPrice } from '../../lib/stackrDomainAdapter';
import { selectTcgdexReferencePersistenceImage } from '../../lib/tcgdexReferencePersistence';
import { hydrateScanCardRowsWithLiveTcgdexReferences } from '../../lib/scanCardReferenceHydration';
import { attachLiveTcgdexCardReferences } from '../../lib/pokemonTcg';
import { getScanAttemptDiagnostics } from '../../lib/scanDiagnostics';
import { logScanLearningEvent } from '../../lib/scanLearning';
import { getScannerClientContext } from '../../lib/scannerClientContext';
import {
  buildScannerAnalyticsMetadata,
  getScannerFeatureFlags,
  SCANNER_RULESET_VERSION,
  type ScannerTimingMetrics,
} from '../../lib/scannerAnalytics';
import { getRecognitionFeatureFlags } from '../../lib/recognition/featureFlags';
import {
  buildLocalQuickScanCandidateSummaries,
  getDiscreetConfidenceStatus,
  getLocalQuickScanCandidateDifferenceLabels,
} from '../../lib/localQuickScanExperience';
import {
  createDeviceRecognitionFeedbackRecord,
  explainRecognitionFeedbackImageUpload,
  saveRecognitionFeedbackRecord,
  uploadRecognitionFeedbackRecord,
} from '../../lib/recognitionFeedbackLoop';
import {
  grantRecognitionFeedbackImageConsent,
  type RecognitionFeedbackAction,
  type RecognitionFeedbackRecord,
} from '../../lib/recognitionFeedbackCore';
import {
  buildShadowModePilotRecordFromDiagnostics,
  submitShadowModePilotRecord,
} from '../../lib/recognitionShadowModePilot';
import {
  getScanIntentConfig,
  isListingScanRequest,
  isListingScanIntent,
  resolveScanIntent,
} from '../../lib/scanIntent';
import { stackrIcons } from '../../lib/stackrIcons';
import type { ScanEditionHint } from '../../types/scan';

type TCGCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total?: number | null;
  series: string;
  rarity: string;
  image_small: string;
  image_large?: string | null;
  raw_data?: any;
  external_ids?: Record<string, unknown> | null;
  language?: string | null;
  release_date: string;
  editionHint?: '1st_edition' | 'unlimited' | 'shadowless' | null;
  scan_provider?: string | null;
  scan_confidence?: number | null;
  scan_visual_similarity?: number | null;
  scan_final_score?: number | null;
};

const EDITION_LABELS: Record<NonNullable<TCGCard['editionHint']>, string> = {
  '1st_edition': '1st Edition',
  unlimited: 'Unlimited',
  shadowless: 'Shadowless',
};

type TcgPriceVariant = {
  key: string;
  label: string;
  priceUsd: number;
  editionHint?: ScanEditionHint | null;
};

const TCG_VARIANT_LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  unlimited: 'Unlimited',
  unlimitedHolofoil: 'Unlimited Holo',
  '1stEditionNormal': '1st Edition Normal',
  '1stEditionHolofoil': '1st Edition Holo',
};

function getTcgVariantLabel(key: string) {
  return TCG_VARIANT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function getEditionHintForVariantKey(key?: string | null): ScanEditionHint | null {
  if (!key) return null;
  if (key.startsWith('1stEdition')) return '1st_edition';
  if (key.startsWith('unlimited')) return 'unlimited';
  return null;
}

function getPriceValueFromVariant(value: any) {
  const price = value?.market ?? value?.mid ?? value?.low;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}

function buildTcgVariantOptions(card: any): TcgPriceVariant[] {
  const prices = card?.tcgplayer?.prices ?? {};
  return Object.entries(prices)
    .map(([key, value]) => {
      const priceUsd = getPriceValueFromVariant(value);
      if (priceUsd == null) return null;
      return {
        key,
        label: getTcgVariantLabel(key),
        priceUsd,
        editionHint: getEditionHintForVariantKey(key),
      };
    })
    .filter(Boolean) as TcgPriceVariant[];
}

function getMatchConfidence(card?: TCGCard | null) {
  if (!card) return null;
  const score = card.scan_confidence
    ?? (card.scan_final_score != null ? Math.round(card.scan_final_score * 100) : null)
    ?? (card.scan_visual_similarity != null ? Math.round(card.scan_visual_similarity * 100) : null);
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.max(0, Math.min(99, Math.round(score)))
    : null;
}

function buildLearningCandidates(cards: TCGCard[]) {
  return cards.slice(0, 5).map((card) => ({
    id: card.id,
    name: card.name,
    set_id: card.set_id,
    set_name: card.set_name,
    number: card.number,
    provider: card.scan_provider ?? null,
    confidence: getMatchConfidence(card),
    visualSimilarity: card.scan_visual_similarity ?? null,
    finalScore: card.scan_final_score ?? null,
  }));
}

function getDiagnosticRemoteRequestMs(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>) {
  return (diagnostics?.providers ?? []).reduce((sum, provider: any) => {
    const providerName = String(provider?.provider ?? '').toLowerCase();
    const stage = String(provider?.stage ?? '').toLowerCase();
    const remote = providerName.includes('ximilar')
      || stage.includes('remote')
      || stage.includes('fallback')
      || stage.includes('visual');
    return remote ? sum + Math.max(0, Number(provider?.durationMs) || 0) : sum;
  }, 0) || null;
}

function getDiagnosticRemoteEndpoint(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>) {
  const provider = (diagnostics?.providers ?? []).find((entry: any) => String(entry?.provider ?? '').toLowerCase().includes('ximilar'));
  const signals = (provider as any)?.signals;
  return signals?.endpoint ?? signals?.requestedEndpoint ?? signals?.recognitionReason ?? (provider as any)?.stage ?? null;
}

function getDiagnosticQualityFailureReasons(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>) {
  const failures = (diagnostics?.image?.quality as any)?.failures;
  return Array.isArray(failures)
    ? failures.map((failure) => String(failure?.code ?? failure?.instruction ?? 'quality')).slice(0, 8)
    : [];
}

function getDiagnosticOcrValues(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>) {
  const localProvider = (diagnostics?.providers ?? []).find((provider: any) => String(provider?.provider ?? '').toLowerCase().includes('local-ocr'));
  return (localProvider as any)?.signals ?? null;
}

function getDiagnosticLanguage(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>) {
  const signals = getDiagnosticOcrValues(diagnostics) as any;
  const language = signals?.language;
  return typeof language === 'string' && language !== 'unknown' ? language : null;
}

function getDiagnosticMatchReasons(diagnostics: ReturnType<typeof getScanAttemptDiagnostics>, card?: TCGCard | null) {
  if (!card) return [];
  for (const provider of diagnostics?.providers ?? []) {
    const candidates = Array.isArray((provider as any)?.candidates) ? (provider as any).candidates : [];
    const match = candidates.find((candidate: any) => candidate?.id === card.id);
    if (Array.isArray(match?.reasons)) return match.reasons.map(String).slice(0, 10);
  }
  return diagnostics?.candidates
    ?.filter((candidate) => candidate.id === card.id)
    .map((candidate) => `${candidate.provider ?? 'unknown'}:${candidate.confidence ?? 'no-confidence'}`)
    .slice(0, 10) ?? [];
}

function getDiagnosticTimings(
  diagnostics: ReturnType<typeof getScanAttemptDiagnostics>,
  databaseSaveMs: number | null = null
): ScannerTimingMetrics {
  return {
    camera_initialisation_ms: null,
    first_card_detection_ms: null,
    quality_gate_ms: diagnostics?.timings?.qualityMs ?? null,
    stable_capture_ms: null,
    photo_capture_ms: diagnostics?.timings?.captureMs ?? null,
    perspective_crop_ms: diagnostics?.timings?.recognitionImageMs ?? null,
    ocr_ms: diagnostics?.timings?.ocrMs ?? null,
    local_candidate_match_ms: diagnostics?.timings?.localOcrMatchMs ?? null,
    remote_request_ms: getDiagnosticRemoteRequestMs(diagnostics),
    database_save_ms: databaseSaveMs,
    total_scan_ms: diagnostics?.timings?.totalMs ?? null,
  };
}

function ResultStatusPill({
  label,
  tone = 'purple',
}: {
  label: string;
  tone?: 'purple' | 'gold' | 'green';
}) {
  const { theme } = useTheme();
  const color = tone === 'green'
    ? '#10B981'
    : tone === 'gold'
      ? theme.colors.secondary
      : theme.colors.primary;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 6,
        backgroundColor: color + '13',
        borderWidth: 1,
        borderColor: color + '35',
      }}
    >
      <Text style={{ color, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>
        {label}
      </Text>
    </View>
  );
}

function pickDefaultVariantKey(options: TcgPriceVariant[], editionHint?: TCGCard['editionHint']) {
  if (!options.length) return null;
  if (editionHint === '1st_edition') {
    return options.find((option) => option.key === '1stEditionHolofoil')?.key
      ?? options.find((option) => option.key === '1stEditionNormal')?.key
      ?? options[0].key;
  }
  if (editionHint === 'unlimited') {
    return options.find((option) => option.key === 'unlimitedHolofoil')?.key
      ?? options.find((option) => option.key === 'unlimited')?.key
      ?? options.find((option) => option.key === 'holofoil')?.key
      ?? options.find((option) => option.key === 'normal')?.key
      ?? options[0].key;
  }
  return options.find((option) => option.key === 'holofoil')?.key
    ?? options.find((option) => option.key === 'normal')?.key
    ?? options[0].key;
}

function formatTcgGbp(priceUsd?: number | null) {
  if (priceUsd == null || Number.isNaN(priceUsd)) return '--';
  return `£${priceUsd.toFixed(2)}`;
}

type BinderOption = {
  id: string;
  name: string;
  color: string;
  cover_key: string | null;
};

export default function ScanResultRoute() {
  const params = useLocalSearchParams<{
    intent?: string | string[];
    mode?: string | string[];
    flow?: string | string[];
    type?: string | string[];
    binderId?: string | string[];
  }>();
  const { hydrated, premiumSellerAccess } = useAppMode();
  const requestedListingMode = isListingScanRequest(params);

  if (requestedListingMode && !hydrated) return null;
  if (requestedListingMode && !premiumSellerAccess.allowed) {
    return <Redirect href="/(tabs)/market" />;
  }
  return <ScanResultScreen />;
}

function ScanResultScreen() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { isWanted, toggleWishlistCard } = useTrade();
  const params = useLocalSearchParams<{
    imageUrl?: string;
    cardName?: string;
    cardsJson?: string;
    intent?: string;
    mode?: string;
    flow?: string;
    type?: string;
    q?: string;
    binderId?: string;
    scanSessionId?: string;
    rectifiedImageUri?: string;
    rectifiedImageWidth?: string;
    rectifiedImageHeight?: string;
  }>();

  const serializedCards = useMemo<TCGCard[]>(() => {
    if (!params.cardsJson) return [];
    try {
      const parsed = JSON.parse(params.cardsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [params.cardsJson]);
  const [cards, setCards] = useState<TCGCard[]>(serializedCards);
  const incomingMode = typeof params.mode === 'string' ? params.mode : undefined;
  const incomingFlow = typeof params.flow === 'string' ? params.flow : undefined;
  const incomingQuery = typeof params.q === 'string' ? params.q : undefined;
  const incomingBinderId = typeof params.binderId === 'string' ? params.binderId : null;
  const incomingRectifiedImageUri = typeof params.rectifiedImageUri === 'string' ? params.rectifiedImageUri : null;
  const incomingRectifiedImageWidth = Number(params.rectifiedImageWidth);
  const incomingRectifiedImageHeight = Number(params.rectifiedImageHeight);
  const scanIntent = resolveScanIntent({
    intent: params.intent,
    mode: incomingMode,
    flow: incomingFlow,
    type: params.type,
    binderId: incomingBinderId,
  });
  const scanIntentConfig = getScanIntentConfig(scanIntent);
  const isListingMode = isListingScanIntent(scanIntent) || incomingMode === 'listing' || incomingFlow === 'listing';
  const scanSessionId = typeof params.scanSessionId === 'string' ? params.scanSessionId : `scan-result-${Date.now()}`;
  const scanDiagnostics = useMemo(() => getScanAttemptDiagnostics(scanSessionId), [scanSessionId]);
  const scannerClientContext = useMemo(() => getScannerClientContext(), []);
  const scannerFeatureFlags = useMemo(() => getScannerFeatureFlags(), []);
  const recognitionFeatureFlags = useMemo(() => getRecognitionFeatureFlags(), []);
  const localQuickScanExperienceEnabled = recognitionFeatureFlags.localRecognitionEnabled;
  const internalShadowModePilotEnabled = recognitionFeatureFlags.localRecognitionShadowMode
    && profile?.role === 'admin';
  const localQuickScanCandidateSummaries = useMemo(() => buildLocalQuickScanCandidateSummaries({
    candidates: cards,
    outcome: 'review_required',
    limit: 3,
  }), [cards]);
  const localQuickScanDifferences = useMemo(
    () => getLocalQuickScanCandidateDifferenceLabels(cards),
    [cards]
  );

  const getEditionLabel = (card?: TCGCard | null) =>
    card?.editionHint ? EDITION_LABELS[card.editionHint] : null;

  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(
    serializedCards.length === 1 ? serializedCards[0] : null
  );
  const [binders, setBinders] = useState<BinderOption[]>([]);
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null);
  const [ebayPrice, setEbayPrice] = useState<{
    low: number | null;
    average: number | null;
    high: number | null;
  } | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [tcgPrice, setTcgPrice] = useState<number | null>(null);
  const [tcgPriceSource, setTcgPriceSource] = useState<string | null>(null);
  const [tcgVariants, setTcgVariants] = useState<TcgPriceVariant[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const [tcgLoading, setTcgLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [chaseSaving, setChaseSaving] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [rejectedPrediction, setRejectedPrediction] = useState<TCGCard | null>(null);
  useEffect(() => {
    let disposed = false;
    setCards(serializedCards);

    void hydrateScanCardRowsWithLiveTcgdexReferences(
      serializedCards,
      attachLiveTcgdexCardReferences,
    ).then((hydratedCards) => {
      if (disposed) return;
      // The hydrator defines a non-enumerable overlay only after exact live
      // identity validation. `cardsJson` remains the sanitized source of truth.
      setCards(hydratedCards);
      setSelectedCard((current) => {
        if (!current) return hydratedCards.length === 1 ? hydratedCards[0] ?? null : null;
        return hydratedCards.find((card) => card.id === current.id) ?? current;
      });
    }).catch(() => {
      // A provider lookup failure must not make the serialized result unusable.
    });

    return () => { disposed = true; };
  }, [serializedCards]);
  const selectedIsChase = selectedCard ? isWanted(selectedCard.id, selectedCard.set_id) : false;
  const selectedMatchConfidence = selectedCard ? getMatchConfidence(selectedCard) : null;
  const selectedLocalQuickScanStatus = localQuickScanExperienceEnabled
    ? getDiscreetConfidenceStatus({
        outcome: 'review_required',
        confidence: selectedMatchConfidence == null ? null : selectedMatchConfidence / 100,
        candidateCount: cards.length,
      })
    : null;
  const selectedTcgVariant = useMemo(
    () => tcgVariants.find((variant) => variant.key === selectedVariantKey) ?? null,
    [selectedVariantKey, tcgVariants]
  );

  const buildResultAnalytics = (
    options: {
      card?: TCGCard | null;
      databaseSaveMs?: number | null;
      manualCorrection?: boolean;
      rescan?: boolean;
      matchSource?: 'local' | 'remote' | 'hybrid' | 'manual' | 'none' | 'unknown';
      errorCategory?: string | null;
      alternatives?: number | null;
    } = {}
  ) => buildScannerAnalyticsMetadata({
    timings: getDiagnosticTimings(scanDiagnostics, options.databaseSaveMs ?? null),
    scanIntent,
    scanMode: incomingMode ?? null,
    language: options.card?.language ?? getDiagnosticLanguage(scanDiagnostics),
    matchSource: options.matchSource ?? (getDiagnosticRemoteRequestMs(scanDiagnostics) ? 'hybrid' : 'manual'),
    confidence: getMatchConfidence(options.card ?? selectedCard),
    alternatives: options.alternatives ?? cards.length,
    qualityFailureReasons: getDiagnosticQualityFailureReasons(scanDiagnostics),
    manualCorrection: options.manualCorrection ?? false,
    rescan: options.rescan ?? false,
    cancellation: false,
    duplicatePrevention: false,
    remoteEndpoint: getDiagnosticRemoteEndpoint(scanDiagnostics),
    errorCategory: options.errorCategory ?? null,
    client: scannerClientContext,
    featureFlags: scannerFeatureFlags,
  });

  const buildCorrectionContext = (predicted?: TCGCard | null, correct?: TCGCard | null) => ({
    predictedStackrCardId: predicted?.id ?? null,
    predictedSetId: predicted?.set_id ?? null,
    predictedCardName: predicted?.name ?? null,
    correctStackrCardId: correct?.id ?? null,
    correctSetId: correct?.set_id ?? null,
    correctCardName: correct?.name ?? null,
    predictionConfidence: getMatchConfidence(predicted),
    ocrValues: getDiagnosticOcrValues(scanDiagnostics),
    matchReasons: getDiagnosticMatchReasons(scanDiagnostics, predicted),
    scanMode: incomingMode ?? null,
    qualityScores: scanDiagnostics?.image?.quality ?? null,
    rulesetVersion: SCANNER_RULESET_VERSION,
    rawImageTrainingConsent: false,
  });

  const logResultFeedback = async (
    eventType: 'candidate_selected' | 'match_incorrect' | 'none_correct' | 'manual_search' | 'added_to_binder' | 'rescan',
    card?: TCGCard | null,
    notes?: string,
    routeContext?: Record<string, unknown>
  ) => {
    await logScanLearningEvent({
      scanSessionId,
      eventType,
      scanMode: null,
      routeContext: {
        screen: 'scan-result',
        intent: scanIntent,
        mode: incomingMode ?? null,
        flow: incomingFlow ?? null,
        binderId: incomingBinderId,
        ...routeContext,
      },
      candidates: buildLearningCandidates(cards),
      selectedCardId: card?.id ?? null,
      selectedSetId: card?.set_id ?? null,
      selectedCardName: card?.name ?? null,
      outcome: eventType,
      notes: notes ?? null,
    });
  };

  const cardToFeedbackIdentity = (card?: TCGCard | null) => card ? {
    stackrCardId: card.id,
    cardName: card.name,
    setId: card.set_id,
    collectorNumber: card.number,
    language: card.language ?? card.raw_data?.language ?? null,
    variant: selectedTcgVariant?.key ?? card.editionHint ?? card.rarity ?? null,
  } : null;

  const submitShadowPilotOutcome = async (
    action: RecognitionFeedbackAction | 'added_to_collection' | 'manual_search' | 'rescan',
    confirmedCard: TCGCard | null,
    source: 'scan_result' | 'feedback_panel' | 'manual_search' | 'collection_add'
  ) => {
    if (!internalShadowModePilotEnabled) return;
    const confirmedIdentity = cardToFeedbackIdentity(confirmedCard);
    const record = buildShadowModePilotRecordFromDiagnostics({
      diagnostics: scanDiagnostics,
      confirmedIdentity,
      userOutcome: {
        action,
        confirmedIdentity,
        confirmedAt: new Date().toISOString(),
        source,
      },
      appContext: {
        scanIntent,
        mode: incomingMode ?? null,
        flow: incomingFlow ?? null,
        listingMode: isListingMode,
        candidateCount: cards.length,
        client: scannerClientContext,
      },
    });
    if (!record) return;

    try {
      await submitShadowModePilotRecord(record);
    } catch (error) {
      console.warn(
        'Shadow-mode pilot record failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const getFeedbackVersions = () => {
    const providers = scanDiagnostics?.providers ?? [];
    const modelVersion = providers
      .map((provider: any) => provider?.modelVersion ?? provider?.signals?.modelVersion ?? provider?.topCandidate?.modelVersion)
      .find(Boolean) ?? null;
    const catalogueVersion = providers
      .map((provider: any) => provider?.catalogueVersion ?? provider?.signals?.catalogueVersion)
      .find(Boolean) ?? null;
    return {
      modelVersion: modelVersion ? String(modelVersion) : null,
      catalogueVersion: catalogueVersion ? String(catalogueVersion) : null,
    };
  };

  const buildFeedbackRecord = (
    action: RecognitionFeedbackAction,
    options: {
      predicted?: TCGCard | null;
      corrected?: TCGCard | null;
      correctedVariant?: string | null;
      missingCardDescription?: string | null;
    } = {}
  ) => {
    const versions = getFeedbackVersions();
    return createDeviceRecognitionFeedbackRecord({
      anonymousScanId: scanSessionId,
      action,
      predictedIdentity: cardToFeedbackIdentity(options.predicted ?? cards[0] ?? selectedCard),
      correctedIdentity: cardToFeedbackIdentity(options.corrected ?? null),
      correctedVariant: options.correctedVariant ?? null,
      missingCardDescription: options.missingCardDescription ?? null,
      topCandidateScores: cards.slice(0, 5).map((card, index) => ({
        canonicalCardId: card.id,
        rank: index + 1,
        confidence: getMatchConfidence(card),
        visualSimilarity: card.scan_visual_similarity ?? null,
        finalScore: card.scan_final_score ?? null,
        setId: card.set_id,
        collectorNumber: card.number,
      })),
      captureQuality: (scanDiagnostics?.image?.quality as Record<string, unknown>) ?? {},
      ocrEvidenceSummary: (getDiagnosticOcrValues(scanDiagnostics) as Record<string, unknown>) ?? {},
      modelVersion: versions.modelVersion,
      catalogueVersion: versions.catalogueVersion,
      physicalCardSessionId: scanSessionId,
      rectifiedImageUri: incomingRectifiedImageUri,
      rectifiedImageWidth: Number.isFinite(incomingRectifiedImageWidth) ? incomingRectifiedImageWidth : null,
      rectifiedImageHeight: Number.isFinite(incomingRectifiedImageHeight) ? incomingRectifiedImageHeight : null,
    });
  };

  const promptImageContribution = (record: RecognitionFeedbackRecord) => {
    if (!incomingRectifiedImageUri) return;
    const explanation = explainRecognitionFeedbackImageUpload();
    Alert.alert(
      explanation.title,
      explanation.body.join('\n\n'),
      [
        { text: explanation.declineLabel, style: 'cancel' },
        {
          text: explanation.uploadLabel,
          onPress: async () => {
            try {
              const consented = grantRecognitionFeedbackImageConsent(record);
              await saveRecognitionFeedbackRecord(consented);
              await uploadRecognitionFeedbackRecord(consented);
              Alert.alert('Thanks', 'The rectified card crop was queued for internal review.');
            } catch (error: any) {
              Alert.alert('Saved locally', error?.message ?? 'The image could not be uploaded right now.');
            }
          },
        },
      ]
    );
  };

  const saveRecognitionFeedback = async (
    action: RecognitionFeedbackAction,
    options: {
      predicted?: TCGCard | null;
      corrected?: TCGCard | null;
      correctedVariant?: string | null;
      missingCardDescription?: string | null;
      promptForImage?: boolean;
      silent?: boolean;
    } = {}
  ) => {
    try {
      setFeedbackSaving(true);
      const record = buildFeedbackRecord(action, options);
      await saveRecognitionFeedbackRecord(record);
      await submitShadowPilotOutcome(
        action,
        options.corrected ?? (
          action === 'confirm_result' || action === 'variant_correction'
            ? options.predicted ?? selectedCard
            : null
        ),
        'feedback_panel'
      );
      if (options.promptForImage) {
        promptImageContribution(record);
      } else if (!options.silent) {
        Alert.alert('Feedback saved', 'Thanks. This correction will stay review-gated before it can affect training.');
      }
    } catch (error: any) {
      Alert.alert('Could not save feedback', error?.message ?? 'Please try again.');
    } finally {
      setFeedbackSaving(false);
    }
  };

  useEffect(() => {
    if (isListingMode) {
      setBinders([]);
      setSelectedBinderId(null);
      return;
    }

    fetchBinders().then((data) => {
      setBinders(
        data.map((b) => ({
          id: b.id,
          name: b.name,
          color: b.color,
          cover_key: b.cover_key ?? null,
        }))
      );
      if (incomingBinderId && data.some((binder) => binder.id === incomingBinderId)) {
        setSelectedBinderId(incomingBinderId);
      }
    });
  }, [incomingBinderId, isListingMode]);

  useEffect(() => {
    setSelectedVariantKey(null);
    setTcgVariants([]);
  }, [selectedCard?.id]);

  useEffect(() => {
    if (!selectedCard) return;

    const run = async () => {
      try {
        setEbayLoading(true);
        setTcgLoading(true);
        setEbayPrice(null);
        setTcgPrice(null);
        setTcgPriceSource(null);

        const result = await fetchStackrPrice(selectedCard.id, {
          productType: 'raw_card',
          currency: 'GBP',
        });
        if (!result) return;
        const { price, resolved } = result;
        setEbayPrice({
          low: price.estimates.low,
          average: price.estimates.central,
          high: price.estimates.high,
        });
        setTcgPrice(price.estimates.central);
        setTcgPriceSource(`Stackr market - ${price.status.replace(/_/g, ' ')}`);

        const variants = resolved.card.variants.map((variant) => ({
          key: variant.variantCode,
          label: variant.variantLabel ?? variant.variantCode,
          priceUsd: price.estimates.central ?? 0,
          editionHint: getEditionHintForVariantKey(variant.variantCode),
        }));
        setTcgVariants(variants);

        const nextVariantKey = selectedVariantKey && variants.some((variant) => variant.key === selectedVariantKey)
          ? selectedVariantKey
          : resolved.card.variants.find((variant) => variant.variantId === resolved.variantId)?.variantCode
            ?? pickDefaultVariantKey(variants, selectedCard.editionHint);
        if (nextVariantKey !== selectedVariantKey) setSelectedVariantKey(nextVariantKey);
      } catch (error) {
        console.log('Stackr market lookup failed:', error);
        setEbayPrice(null);
        setTcgPrice(null);
        setTcgPriceSource(null);
      } finally {
        setEbayLoading(false);
        setTcgLoading(false);
      }
    };

    run();
  }, [selectedCard, selectedTcgVariant?.label, selectedTcgVariant?.editionHint, selectedVariantKey]);

  const handleAddToBinder = async () => {
    if (!selectedBinderId || !selectedCard || adding || added) return;

    try {
      setAdding(true);
      const databaseStartedAt = Date.now();
      const { data: existingBinderCard, error: existingBinderCardError } = await supabase
        .from('binder_cards')
        .select('image_url')
        .eq('binder_id', selectedBinderId)
        .eq('card_id', selectedCard.id)
        .maybeSingle();
      if (existingBinderCardError) throw existingBinderCardError;
      const persistedImageUrl = selectTcgdexReferencePersistenceImage(
        selectedCard.image_small,
        existingBinderCard?.image_url ?? null,
      );

        const { error } = await supabase
          .from('binder_cards')
          .upsert(
          {
            binder_id: selectedBinderId,
            card_id: selectedCard.id,
            set_id: selectedCard.set_id,
            owned: true,
            notes: '',
            card_name: selectedCard.name,
            card_number: selectedCard.number,
            ...(persistedImageUrl ? { image_url: persistedImageUrl } : {}),
            set_name: selectedCard.set_name,
          },
          {
            onConflict: 'binder_id,card_id',
            ignoreDuplicates: false,
          }
        );

      if (error) throw error;

      if (selectedTcgVariant?.key) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error: variantError } = await supabase
            .from('user_card_variants')
            .upsert(
              {
                user_id: user.id,
                card_id: selectedCard.id,
                set_id: selectedCard.set_id,
                variant: selectedTcgVariant.key,
                quantity: 1,
              },
              { onConflict: 'user_id,card_id,set_id,variant', ignoreDuplicates: true }
            );
          if (variantError) throw variantError;
        }
      }

      const databaseSaveMs = Date.now() - databaseStartedAt;
      setAdded(true);
      await logResultFeedback('added_to_binder', selectedCard, undefined, {
        analytics: buildResultAnalytics({
          card: selectedCard,
          databaseSaveMs,
          matchSource: 'manual',
        }),
      });
      await submitShadowPilotOutcome('added_to_collection', selectedCard, 'collection_add');
      Alert.alert('✅ Added!', `${selectedCard.name} has been added to your binder.`, [{ text: 'OK' }]);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add card.');
    } finally {
      setAdding(false);
    }
  };

  const openManualFallback = () => {
    const predicted = rejectedPrediction ?? selectedCard ?? cards[0] ?? null;
    void logResultFeedback('manual_search', predicted, 'User opened manual search from scan result.', {
      correction: buildCorrectionContext(predicted, null),
      analytics: buildResultAnalytics({
        card: predicted,
        manualCorrection: Boolean(predicted),
        matchSource: 'manual',
      }),
    });
    void submitShadowPilotOutcome('manual_search', null, 'manual_search');

    if (isListingMode) {
      router.replace({
        pathname: '/listing/new',
        params: {
          listingAction: 'manual',
          type: scanIntentConfig.itemType,
          ...(incomingQuery ? { q: incomingQuery } : {}),
        },
      } as any);
      return;
    }

    router.replace('/(tabs)/search' as any);
  };

  const handleSelectForListing = async () => {
    if (!selectedCard || adding) return;

    try {
      setAdding(true);
      await logResultFeedback(
        'candidate_selected',
        selectedCard,
        'User selected the scan match for a listing.',
        {
          listingAction: 'selected_for_listing',
          analytics: buildResultAnalytics({
            card: selectedCard,
            matchSource: 'manual',
          }),
        }
      );
      await submitShadowPilotOutcome('added_to_collection', selectedCard, 'scan_result');

      const editionHint = selectedTcgVariant?.editionHint ?? selectedCard.editionHint ?? null;
      router.replace({
        pathname: '/listing/new',
        params: {
          cardId: selectedCard.id,
          setId: selectedCard.set_id,
          type: scanIntentConfig.itemType,
          ...(editionHint ? { editionHint } : {}),
        },
      } as any);
    } finally {
      setAdding(false);
    }
  };

  const handleNoneCorrect = async () => {
    const predicted = rejectedPrediction ?? selectedCard ?? cards[0] ?? null;
    await logResultFeedback('none_correct', null, 'User rejected all scan candidates.', {
      correction: buildCorrectionContext(predicted, null),
      analytics: buildResultAnalytics({
        card: predicted,
        manualCorrection: true,
        matchSource: 'manual',
      }),
    });
    await saveRecognitionFeedback('missing_card', {
      predicted,
      missingCardDescription: incomingQuery ?? predicted?.name ?? null,
      silent: true,
    });
    router.replace({
      pathname: '/scan',
      params: {
        reason: 'none_correct',
        scanMode: 'manual',
        intent: scanIntent,
        ...(incomingMode ? { mode: incomingMode } : {}),
        ...(incomingFlow ? { flow: incomingFlow } : {}),
        ...(incomingQuery ? { q: incomingQuery } : {}),
        ...(incomingBinderId ? { binderId: incomingBinderId } : {}),
        type: scanIntentConfig.itemType,
      },
    } as any);
  };

  const handleIncorrectMatch = async () => {
    if (!selectedCard) return;

    const candidateRank = cards.findIndex((card) => card.id === selectedCard.id);
    setRejectedPrediction(selectedCard);
    await logResultFeedback(
      'match_incorrect',
      selectedCard,
      'User marked the selected scan match as incorrect.',
      {
        feedbackAction: 'selected_match_incorrect',
        rejectedCardId: selectedCard.id,
        rejectedSetId: selectedCard.set_id,
        rejectedCardName: selectedCard.name,
        rejectedConfidence: getMatchConfidence(selectedCard),
        candidateRank: candidateRank >= 0 ? candidateRank + 1 : null,
        correction: buildCorrectionContext(selectedCard, null),
        analytics: buildResultAnalytics({
          card: selectedCard,
          manualCorrection: true,
          matchSource: 'manual',
        }),
      }
    );
    await saveRecognitionFeedback('manual_correction', {
      predicted: selectedCard,
      corrected: null,
      silent: true,
    });

    Alert.alert(
      'Correction saved',
      'Stackr will use this to improve future scan matches.',
      [
        cards.length > 1
          ? { text: 'Choose another match', onPress: () => setSelectedCard(null) }
          : { text: isListingMode ? 'Add manually' : 'Search manually', onPress: openManualFallback },
        { text: 'Stay here', style: 'cancel' },
      ]
    );
  };

  const handleToggleChase = async () => {
    if (!selectedCard || chaseSaving) return;

    try {
      setChaseSaving(true);
      await toggleWishlistCard(selectedCard.id, selectedCard.set_id);
    } catch (error: any) {
      Alert.alert('Could not update Chase', error?.message ?? 'Please try again.');
    } finally {
      setChaseSaving(false);
    }
  };

  const handleManualCorrectionFeedback = async () => {
    const predicted = rejectedPrediction ?? selectedCard ?? cards[0] ?? null;
    await saveRecognitionFeedback('manual_correction', {
      predicted,
      silent: true,
    });
    openManualFallback();
  };

  const handleConfirmRecognitionFeedback = async () => {
    if (!selectedCard) return;
    await saveRecognitionFeedback('confirm_result', {
      predicted: selectedCard,
      corrected: selectedCard,
      promptForImage: Boolean(incomingRectifiedImageUri),
    });
  };

  const handleVariantCorrectionFeedback = async () => {
    if (!selectedCard) return;
    const variant = selectedTcgVariant?.key
      ?? selectedCard.editionHint
      ?? selectedCard.rarity
      ?? null;
    await saveRecognitionFeedback('variant_correction', {
      predicted: selectedCard,
      corrected: selectedCard,
      correctedVariant: variant,
      promptForImage: Boolean(incomingRectifiedImageUri),
    });
  };

  const handleMissingCardFeedback = async () => {
    await saveRecognitionFeedback('missing_card', {
      predicted: selectedCard ?? cards[0] ?? null,
      missingCardDescription: incomingQuery ?? selectedCard?.name ?? cards[0]?.name ?? null,
      promptForImage: Boolean(incomingRectifiedImageUri),
    });
  };

  const handleBadScanFeedback = async () => {
    await saveRecognitionFeedback('bad_scan', {
      predicted: selectedCard ?? cards[0] ?? null,
      promptForImage: Boolean(incomingRectifiedImageUri),
    });
  };

  const handleScanAnother = () => {
    void logResultFeedback('rescan', selectedCard, 'User started another scan from scan result.', {
      analytics: buildResultAnalytics({
        card: selectedCard,
        matchSource: 'manual',
        rescan: true,
      }),
    });
    void submitShadowPilotOutcome('rescan', null, 'scan_result');
    router.replace({
      pathname: '/scan',
      params: {
        mode: incomingMode ?? (isListingMode ? 'listing' : 'market'),
        intent: scanIntent,
        ...(incomingFlow ? { flow: incomingFlow } : {}),
        ...(incomingQuery ? { q: incomingQuery } : {}),
        ...(incomingBinderId ? { binderId: incomingBinderId } : {}),
        type: scanIntentConfig.itemType,
      },
    } as any);
  };

  // ===============================
  // RENDER CARD OPTION
  // ===============================

  const renderCardOption = ({ item }: { item: TCGCard }) => {
    const selected = selectedCard?.id === item.id;

    return (
      <TouchableOpacity
        onPress={() => {
          const predicted = rejectedPrediction;
          const isCorrection = Boolean(predicted && predicted.id !== item.id);
          setSelectedCard(item);
          setAdded(false);
          if (isCorrection) setRejectedPrediction(null);
          void logResultFeedback(
            'candidate_selected',
            item,
            isCorrection ? 'User selected a corrected scan match.' : undefined,
            {
              ...(isCorrection ? { correction: buildCorrectionContext(predicted, item) } : {}),
              analytics: buildResultAnalytics({
                card: item,
                manualCorrection: isCorrection,
                matchSource: 'manual',
              }),
            }
          );
          if (cards.length > 1) {
            void saveRecognitionFeedback('choose_candidate', {
              predicted: predicted ?? cards[0] ?? null,
              corrected: item,
              silent: true,
            });
          }
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Select ${item.name}, ${item.set_name}, number ${item.number}`}
      >
        <PremiumCard selected={selected} style={{ marginBottom: 8, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 52, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
              {item.image_small ? (
                <EditionAwareCardImage
                  uri={item.image_small}
                  cardId={item.id}
                  rawData={item.raw_data}
                  editionHint={item.editionHint}
                  sourceSize="small"
                  style={{ width: '100%', height: '100%', borderRadius: 8 }}
                  resizeMode="contain"
                />
              ) : null}
              <RaritySymbol
                rarity={item.rarity}
                size={12}
                style={RARITY_SYMBOL_CARD_OVERLAY}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
                {selected ? <TrustBadge label="Selected" icon="checkmark-circle-outline" tone="green" /> : null}
              </View>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3, fontWeight: '700' }}>
                {item.set_name} - #{item.number}{getEditionLabel(item) ? ` - ${getEditionLabel(item)}` : ''}
              </Text>
              {localQuickScanExperienceEnabled ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {(localQuickScanDifferences[item.id] ?? []).slice(0, 3).map((label) => (
                    <TrustBadge key={`${item.id}-${label}`} label={label} icon="layers-outline" tone="neutral" />
                  ))}
                </View>
              ) : null}
              <Text style={{ color: theme.colors.textSoft, fontSize: 10, marginTop: 2 }}>
                {item.release_date}
              </Text>
            </View>
          </View>
        </PremiumCard>
      </TouchableOpacity>
    );
  };

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 60 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
              Scan result
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
              {isListingMode ? scanIntentConfig.resultHelp : 'Confirm the match, value, and destination.'}
            </Text>
          </View>
        </View>

        <PremiumCard style={{ marginBottom: 2, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <StackrCardActionIcon
              source={cards.length === 1 ? stackrIcons.scanCard : stackrIcons.searchCard}
              frameSize={48}
              artworkSize={38}
              accessibilityLabel={cards.length === 1 ? 'Scan result' : 'Scan match choices'}
              style={{
                borderRadius: 16,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text variant="pageTitle" style={{ color: theme.colors.text, fontSize: 22, lineHeight: 27 }}>
                {cards.length === 1 ? scanIntentConfig.resultTitle : `${cards.length} matches`}
              </Text>
              <Text variant="support" style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, marginTop: 3 }}>
                {cards.length === 1
                  ? isListingMode
                    ? scanIntentConfig.resultHelp
                    : 'Review the details before saving it.'
                  : 'Choose the version that matches your physical card.'}
              </Text>
            </View>
          </View>

          {selectedCard ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <ResultStatusPill
              label={selectedLocalQuickScanStatus
                ? selectedLocalQuickScanStatus.confidenceLabel
                : selectedMatchConfidence != null
                  ? `${selectedMatchConfidence}% confidence`
                  : 'Review match'}
              tone={selectedLocalQuickScanStatus?.confidenceStatus === 'ready' || (!selectedLocalQuickScanStatus && (selectedMatchConfidence ?? 0) >= 82) ? 'green' : 'purple'}
            />
            {getEditionLabel(selectedCard) ? <TrustBadge label={getEditionLabel(selectedCard) ?? ''} icon="layers-outline" tone="purple" /> : null}
            <TouchableOpacity
              onPress={handleIncorrectMatch}
              style={{
                alignSelf: 'flex-start',
                minHeight: 28,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 6,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>
                This match is not correct
              </Text>
            </TouchableOpacity>
          </View>
          ) : null}
        </PremiumCard>

        {/* If multiple results — show list to pick from */}
        {typeof __DEV__ !== 'undefined' && __DEV__ && scanDiagnostics ? (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/scan/diagnostics',
              params: { scanSessionId },
            } as any)}
            style={{
              marginTop: 10,
              minHeight: 42,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
              View recognition diagnostics
            </Text>
          </TouchableOpacity>
        ) : null}

        {cards.length > 1 && (
          <PremiumCard style={{ marginTop: 16, marginBottom: 16 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 12 }}>
              {localQuickScanExperienceEnabled
                ? `Review ${localQuickScanCandidateSummaries.length} closest matches`
                : 'Likely matches'}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 12, lineHeight: 17, marginTop: -6, marginBottom: 12 }}>
              Pick the exact printing, or tell Stackr none of these are right.
            </Text>

            <FlatList
              data={cards}
              keyExtractor={(item) => item.id}
              renderItem={renderCardOption}
              scrollEnabled={false}
            />
            <TouchableOpacity
              onPress={handleNoneCorrect}
              style={{
                marginTop: 4,
                minHeight: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
                None of these are right
              </Text>
            </TouchableOpacity>
          </PremiumCard>
        )}

        {/* Selected card details */}
        {selectedCard && (
          <>
            {/* Card image */}
            <PremiumCard style={{ alignItems: 'center', marginTop: 16, marginBottom: 16, paddingVertical: 18 }}>
              <View style={{ padding: 8, borderRadius: 22, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
                <EditionAwareCardImage
                  uri={selectedCard.image_large ?? selectedCard.image_small}
                  cardId={selectedCard.id}
                  rawData={selectedCard.raw_data}
                  editionHint={selectedTcgVariant?.editionHint ?? selectedCard.editionHint}
                  sourceSize="large"
                  style={{ width: 220, height: 308, borderRadius: 16 }}
                  resizeMode="contain"
                />
                <RaritySymbol
                  rarity={selectedCard.rarity}
                  size={18}
                  style={RARITY_SYMBOL_CARD_OVERLAY}
                />
              </View>
              <View style={{ marginTop: 14, width: '100%' }}>
                {selectedLocalQuickScanStatus ? (
                  <ResultStatusPill
                    label={selectedLocalQuickScanStatus.confidenceLabel}
                    tone={selectedLocalQuickScanStatus.confidenceStatus === 'ready' ? 'green' : 'purple'}
                  />
                ) : selectedMatchConfidence != null ? (
                  <ProgressBadge value={selectedMatchConfidence} label="Match confidence" />
                ) : (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>
                    Review this match before saving.
                  </Text>
                )}
              </View>
            </PremiumCard>

            {/* Card info */}
            <PremiumCard style={{ marginBottom: 14 }}>
              <StackrCardIdentity
                name={selectedCard.name}
                setName={selectedCard.set_name}
                number={selectedCard.number}
                edition={getEditionLabel(selectedCard)}
                size="compact"
                style={{ marginBottom: 8 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                <TrustBadge label={`No. ${selectedCard.number}`} icon="pricetag-outline" tone="purple" />
                <TrustBadge label={selectedCard.release_date || 'Release unknown'} icon="calendar-outline" tone="neutral" />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => router.push(
                    `/card/${selectedCard.id}?setId=${selectedCard.set_id}${selectedTcgVariant?.editionHint ?? selectedCard.editionHint ? `&editionHint=${selectedTcgVariant?.editionHint ?? selectedCard.editionHint}` : ''}`
                  )}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }} numberOfLines={1}>
                    Card details
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleToggleChase}
                  disabled={chaseSaving}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    backgroundColor: selectedIsChase ? theme.colors.primary + '14' : theme.colors.surface,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 7,
                    borderWidth: 1,
                    borderColor: selectedIsChase ? theme.colors.primary : theme.colors.border,
                    opacity: chaseSaving ? 0.65 : 1,
                  }}
                >
                  {chaseSaving ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Image source={stackrIcons.chase} style={{ width: 20, height: 20 }} resizeMode="contain" />
                  )}
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                    {selectedIsChase ? 'Remove Chase' : 'Add to Chase'}
                  </Text>
                </TouchableOpacity>
              </View>
            </PremiumCard>

            <PremiumCard style={{ marginBottom: 14 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900', marginBottom: 4 }}>
                Recognition feedback
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginBottom: 12 }}>
                Corrections stay review-gated. Card images upload only if you opt in.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleConfirmRecognitionFeedback}
                  disabled={feedbackSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm recognition result"
                  style={{
                    flexGrow: 1,
                    minWidth: 132,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    opacity: feedbackSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    Confirm result
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleManualCorrectionFeedback}
                  disabled={feedbackSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Manually correct the card"
                  style={{
                    flexGrow: 1,
                    minWidth: 132,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    opacity: feedbackSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    Manual correction
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleVariantCorrectionFeedback}
                  disabled={feedbackSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Correct the card variant"
                  style={{
                    flexGrow: 1,
                    minWidth: 132,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    opacity: feedbackSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    Correct variant
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleMissingCardFeedback}
                  disabled={feedbackSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Report that the card is missing"
                  style={{
                    flexGrow: 1,
                    minWidth: 132,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    opacity: feedbackSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    Missing card
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleBadScanFeedback}
                  disabled={feedbackSaving}
                  accessibilityRole="button"
                  accessibilityLabel="Report a bad scan"
                  style={{
                    flexGrow: 1,
                    minWidth: 132,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    opacity: feedbackSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    Bad scan
                  </Text>
                </TouchableOpacity>
              </View>
            </PremiumCard>

            {/* Provider-neutral Stackr market range */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900', marginBottom: 3 }}>
                Market range
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 }}>
                STACKR MARKET - GBP
              </Text>

              {ebayLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    Fetching live prices...
                  </Text>
                </View>
              ) : ebayPrice ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Low</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                      {ebayPrice.low != null ? `£${ebayPrice.low.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                    <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                      {ebayPrice.average != null ? `£${ebayPrice.average.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                      {ebayPrice.high != null ? `£${ebayPrice.high.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  Market evidence is not yet available
                </Text>
              )}
            </View>

            {/* Provider-neutral Stackr central estimate */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900', marginBottom: 3 }}>
                Central estimate
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 }}>
                STACKR MARKET - GBP{getEditionLabel(selectedCard) ? ` - ${getEditionLabel(selectedCard)}` : ''}
              </Text>

              {tcgVariants.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                  style={{ marginBottom: 10 }}
                >
                  {tcgVariants.map((variant) => {
                    const selected = selectedVariantKey === variant.key;
                    return (
                      <TouchableOpacity
                        key={variant.key}
                        onPress={() => setSelectedVariantKey(variant.key)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 12,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>
                          {variant.label}
                        </Text>
                        <Text style={{ color: selected ? 'rgba(255,255,255,0.8)' : theme.colors.textSoft, fontWeight: '800', fontSize: 10, marginTop: 2, textAlign: 'center' }}>
                          {formatTcgGbp(variant.priceUsd)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {tcgLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    Fetching market evidence...
                  </Text>
                </View>
              ) : tcgPrice ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, lineHeight: 23 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                    £{tcgPrice.toFixed(2)}
                  </Text>
                  {tcgPriceSource && (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                      {tcgPriceSource}
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  Market evidence is not yet available
                </Text>
              )}
            </View>

            <PokeTraceMarketInsights
              cardName={selectedCard.name}
              setName={selectedCard.set_name}
              number={selectedCard.number}
              language={selectedCard.language ?? selectedCard.raw_data?.language ?? null}
            />

            {/* Listing or binder action */}
            {isListingMode ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 18, padding: 16,
                borderWidth: 1, borderColor: theme.colors.border,
                marginBottom: 14,
              }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8 }}>
                  {scanIntent === 'graded_slab' ? 'Select slab card' : 'Select for listing'}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                  {scanIntent === 'graded_slab'
                    ? 'Use this enclosed card for the slab listing, then add grader, grade, certification and slab photos.'
                    : 'Use this exact card printing in the listing, then continue with condition, value and evidence.'}
                </Text>
                <TouchableOpacity
                  onPress={handleSelectForListing}
                  disabled={adding}
                  accessibilityRole="button"
                  accessibilityLabel={scanIntent === 'graded_slab' ? 'Select this card for slab listing' : 'Select this card for listing'}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 14, paddingVertical: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: adding ? 0.6 : 1,
                  }}
                >
                  {adding ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                      Select this card
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : !added ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 18, padding: 16,
                borderWidth: 1, borderColor: theme.colors.border,
                marginBottom: 14,
              }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 }}>
                  Add to Binder
                </Text>

                {binders.length === 0 ? (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    No binders found. Create a binder first.
                  </Text>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                      style={{ marginBottom: 12 }}
                    >
                      {binders.map((binder) => {
                        const selected = selectedBinderId === binder.id;
                        return (
                          <TouchableOpacity
                            key={binder.id}
                            onPress={() => setSelectedBinderId(binder.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`Select binder ${binder.name}`}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10,
                              borderRadius: 12,
                              backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                              borderWidth: 1,
                              borderColor: selected ? theme.colors.primary : theme.colors.border,
                            }}
                          >
                            <Text style={{
                              color: selected ? '#FFFFFF' : theme.colors.text,
                              fontWeight: '900', fontSize: 13,
                            }}>
                              {binder.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      onPress={handleAddToBinder}
                      disabled={!selectedBinderId || adding}
                      accessibilityRole="button"
                      accessibilityLabel={selectedBinderId ? 'Add selected card to binder' : 'Select a binder first'}
                      style={{
                        backgroundColor: selectedBinderId
                          ? theme.colors.primary
                          : theme.colors.textSoft,
                        borderRadius: 14, paddingVertical: 14,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: adding ? 0.6 : 1,
                      }}
                    >
                      {adding ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                          {selectedBinderId ? `Add to Binder` : 'Select a binder first'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <PremiumCard selected style={{ marginBottom: 14, alignItems: 'center' }}>
                <TrustBadge label="Added to Binder" icon="checkmark-circle-outline" tone="green" />
                <Text style={{ color: '#065F46', fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 4 }}>
                  Collection updated
                </Text>
                <Text style={{ color: '#065F46', fontSize: 13, textAlign: 'center' }}>
                  {selectedCard.name} is now saved and ready to track.
                </Text>
              </PremiumCard>
            )}

            {/* Scan another */}
            <TouchableOpacity
              onPress={handleScanAnother}
              style={{
                borderRadius: 14, paddingVertical: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                Scan another card
              </Text>
            </TouchableOpacity>
          </>
        )}
        {!selectedCard && (
          <PremiumCard style={{ marginTop: 16, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 18 }}>
            <StackrCardActionIcon
              source={stackrIcons.searchCard}
              frameSize={64}
              artworkSize={50}
              accessibilityLabel="Choose a match"
              style={{
                borderRadius: 22,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                marginBottom: 14,
              }}
            />
            <Text variant="sectionTitleCompact" style={{ color: theme.colors.text, fontSize: 18, textAlign: 'center' }}>
              Choose a match
            </Text>
            <Text variant="support" style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 7 }}>
              {isListingMode
                ? 'Select the card version that matches your scan to use it in the listing.'
                : 'Select the card version that matches your scan to unlock pricing and binder actions.'}
            </Text>
          </PremiumCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
