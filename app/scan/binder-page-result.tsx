import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import type { BinderPagePocketResult, BinderPocketStatus } from '../../lib/binderPageScan';
import {
  loadBinderPageScanSession,
  markBinderPageScanSessionSaved,
  updateBinderPageScanSession,
} from '../../lib/binderPageScanStore';
import { fetchBinders, invalidateBinderCaches, type BinderRecord } from '../../lib/binders';
import {
  addOwnedCardBatchToBinder,
  createCollectionBatchRequestKey,
  persistVerifiedCollectionBatchRecoveryIntent,
} from '../../lib/collectionBatch';
import { logScanLearningEvent } from '../../lib/scanLearning';
import { getScannerClientContext } from '../../lib/scannerClientContext';
import {
  buildScannerAnalyticsMetadata,
  getScannerFeatureFlags,
} from '../../lib/scannerAnalytics';
import { supabase } from '../../lib/supabase';
import { fetchPokemonTcgApiCardsByQuery } from '../../lib/pokemonTcg';

const STATUS_LABELS: Record<BinderPocketStatus, string> = {
  confirmed: 'Confirmed',
  possible_match: 'Possible match',
  empty: 'Empty',
  glare_detected: 'Glare detected',
  obscured: 'Obscured',
  duplicate_candidate: 'Duplicate candidate',
  rescan_required: 'Rescan required',
  unresolved: 'Unresolved',
};

function getStatusColor(status: BinderPocketStatus) {
  if (status === 'confirmed') return '#10B981';
  if (status === 'possible_match') return '#7C3AED';
  if (status === 'duplicate_candidate') return '#F59E0B';
  if (status === 'empty') return '#8B86A8';
  return '#EF4444';
}

function getSelectedCandidate(pocket: BinderPagePocketResult) {
  return pocket.candidates[pocket.selectedCandidateIndex] ?? pocket.candidates[0] ?? null;
}

function buildPocketLearningCandidates(pockets: BinderPagePocketResult[]) {
  return pockets
    .flatMap((pocket) => {
      const candidate = getSelectedCandidate(pocket);
      return candidate ? [{
        id: candidate.id,
        name: candidate.name,
        set_id: candidate.set_id ?? null,
        set_name: candidate.set_name ?? null,
        number: candidate.number ?? null,
        provider: pocket.source,
        confidence: candidate.confidence ?? null,
        visualSimilarity: null,
        finalScore: null,
      }] : [];
    })
    .slice(0, 5);
}

function countPocketStatuses(pockets: BinderPagePocketResult[]) {
  return pockets.reduce<Record<string, number>>((acc, pocket) => {
    acc[pocket.status] = (acc[pocket.status] ?? 0) + 1;
    return acc;
  }, {});
}

function getBestPocketConfidence(pockets: BinderPagePocketResult[]) {
  return pockets
    .flatMap((pocket) => pocket.candidates)
    .map((candidate) => Number(candidate.confidence))
    .filter((confidence) => Number.isFinite(confidence))
    .sort((a, b) => b - a)[0] ?? null;
}

export default function BinderPageScanResultScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ scanSessionId?: string; binderId?: string; layout?: string }>();
  const { width: viewportWidth } = useWindowDimensions();
  const scanSessionId = typeof params.scanSessionId === 'string' ? params.scanSessionId : null;
  const [session, setSession] = useState<Awaited<ReturnType<typeof loadBinderPageScanSession>>>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionReloadToken, setSessionReloadToken] = useState(0);
  const [pockets, setPockets] = useState<BinderPagePocketResult[]>([]);
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [bindersLoading, setBindersLoading] = useState(true);
  const [bindersError, setBindersError] = useState<string | null>(null);
  const [bindersReloadToken, setBindersReloadToken] = useState(0);
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(
    typeof params.binderId === 'string' ? params.binderId : null
  );
  const [destinationPage, setDestinationPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const sessionRef = useRef<Awaited<ReturnType<typeof loadBinderPageScanSession>>>(null);
  const pocketsRef = useRef<BinderPagePocketResult[]>([]);
  // Review edits are durable before rendering. Saving waits for this barrier so
  // a just-confirmed pocket cannot be omitted from the collection intent.
  const pendingPocketMutationRef = useRef<Promise<void>>(Promise.resolve());
  const pocketMutationSequenceRef = useRef(0);
  const pocketMutationFailuresRef = useRef<{
    sequence: number;
    error: Error;
    affectedPocketIndices: number[];
  }[]>([]);
  const sessionLoadRequestRef = useRef(0);
  const bindersLoadRequestRef = useRef(0);
  const [selectedPocketIndex, setSelectedPocketIndex] = useState<number | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionQuery, setCorrectionQuery] = useState('');
  const [correctionResults, setCorrectionResults] = useState<BinderPagePocketResult['candidates']>([]);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionPocketIndex, setCorrectionPocketIndex] = useState<number | null>(null);
  const correctionRequestRef = useRef(0);
  const correctionApplyInFlightRef = useRef(false);
  const scannerClientContext = useMemo(() => getScannerClientContext(), []);
  const scannerFeatureFlags = useMemo(() => getScannerFeatureFlags(), []);

  useEffect(() => {
    let active = true;
    const requestId = ++sessionLoadRequestRef.current;
    sessionRef.current = null;
    pocketsRef.current = [];
    pendingPocketMutationRef.current = Promise.resolve();
    pocketMutationSequenceRef.current = 0;
    pocketMutationFailuresRef.current = [];
    setSession(null);
    setPockets([]);
    const hydrate = async () => {
      setSessionLoading(true);
      setSessionError(null);
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const ownerUserId = authSession?.user.id;
        if (!ownerUserId) throw new Error('Sign in to resume this binder page review.');
        const restored = await loadBinderPageScanSession(scanSessionId, ownerUserId);
        if (!restored) throw new Error('This binder page review is no longer available.');
        if (!active || requestId !== sessionLoadRequestRef.current) return;
        sessionRef.current = restored;
        pocketsRef.current = restored.pockets;
        setSession(restored);
        setPockets(restored.pockets);
        if (typeof params.binderId !== 'string' && restored.binderId) setSelectedBinderId(restored.binderId);
      } catch (error) {
        if (!active || requestId !== sessionLoadRequestRef.current) return;
        sessionRef.current = null;
        pocketsRef.current = [];
        setSession(null);
        setPockets([]);
        setSessionError(error instanceof Error ? error.message : 'Could not load this binder page review. Try again.');
      } finally {
        if (active && requestId === sessionLoadRequestRef.current) setSessionLoading(false);
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [params.binderId, scanSessionId, sessionReloadToken]);

  useEffect(() => {
    let active = true;
    const requestId = ++bindersLoadRequestRef.current;
    setBindersLoading(true);
    setBindersError(null);
    fetchBinders()
      .then((rows) => {
        if (!active || requestId !== bindersLoadRequestRef.current) return;
        setBinders(rows);
        if (!rows.length) {
          setBindersError('No binders are available. Create a binder before saving this review.');
        }
        setSelectedBinderId((current) => (
          current && rows.some((binder) => binder.id === current) ? current : rows[0]?.id ?? null
        ));
      })
      .catch((error) => {
        console.log('Binder page result binders failed:', error);
        if (active && requestId === bindersLoadRequestRef.current) setBindersError('Your binders could not load. Retry before saving this review.');
      })
      .finally(() => {
        if (active && requestId === bindersLoadRequestRef.current) setBindersLoading(false);
      });
    return () => {
      active = false;
      if (bindersLoadRequestRef.current === requestId) bindersLoadRequestRef.current += 1;
    };
  }, [bindersReloadToken]);

  useEffect(() => () => {
    correctionRequestRef.current += 1;
    correctionApplyInFlightRef.current = false;
  }, []);

  const selectedPocket = selectedPocketIndex == null ? null : pockets[selectedPocketIndex] ?? null;
  const selectedCandidate = selectedPocket ? getSelectedCandidate(selectedPocket) : null;
  const gridLayout = session?.layout ?? 3;
  const pocketWidth = useMemo(() => {
    const contentWidth = Math.max(280, viewportWidth - 32);
    return Math.max(58, Math.floor((contentWidth - 8 * (gridLayout - 1)) / gridLayout));
  }, [gridLayout, viewportWidth]);
  const confirmedCount = pockets.filter((pocket) => pocket.status === 'confirmed').length;
  const possibleCount = pockets.filter((pocket) => pocket.status === 'possible_match').length;
  const problemCount = pockets.filter((pocket) => (
    pocket.status !== 'confirmed'
    && pocket.status !== 'possible_match'
    && pocket.status !== 'empty'
  )).length;
  const selectedBinder = binders.find((binder) => binder.id === selectedBinderId) ?? null;
  const destinationReady = !bindersLoading && !bindersError && selectedBinder !== null;

  const buildBinderPageAnalytics = (
    databaseSaveMs: number | null = null,
    options: {
      rescan?: boolean;
      duplicatePrevention?: boolean;
      manualCorrection?: boolean;
      errorCategory?: string | null;
    } = {}
  ) => {
    const hasRemote = pockets.some((pocket) => pocket.source === 'remote');
    const hasLocal = pockets.some((pocket) => pocket.source === 'local');
    const qualityFailureReasons = Array.from(new Set(pockets
      .map((pocket) => pocket.quality?.status)
      .filter((status) => Boolean(status && status !== 'usable'))
      .map(String)));
    return buildScannerAnalyticsMetadata({
      timings: {
        camera_initialisation_ms: null,
        first_card_detection_ms: null,
        quality_gate_ms: null,
        stable_capture_ms: null,
        photo_capture_ms: null,
        perspective_crop_ms: session?.processingMs ?? null,
        ocr_ms: null,
        local_candidate_match_ms: null,
        remote_request_ms: null,
        database_save_ms: databaseSaveMs,
        total_scan_ms: session?.processingMs ?? null,
      },
      scanIntent: 'binder_page',
      scanMode: 'manual',
      language: null,
      matchSource: hasRemote && hasLocal ? 'hybrid' : hasRemote ? 'remote' : hasLocal ? 'local' : 'manual',
      confidence: getBestPocketConfidence(pockets),
      alternatives: pockets.reduce((sum, pocket) => sum + pocket.candidates.length, 0),
      qualityFailureReasons,
      manualCorrection: options.manualCorrection ?? false,
      rescan: options.rescan ?? false,
      cancellation: false,
      duplicatePrevention: options.duplicatePrevention ?? false,
      remoteEndpoint: hasRemote ? 'tcg_id' : null,
      errorCategory: options.errorCategory ?? null,
      client: scannerClientContext,
      featureFlags: scannerFeatureFlags,
    });
  };

  const updatePockets = async (
    updater: (current: BinderPagePocketResult[]) => BinderPagePocketResult[],
    targetPocketIndices: number[],
    allowCorrectionApply = false,
  ) => {
    if (saveInFlightRef.current) {
      throw new Error('Saving confirmed cards. Wait for this save to finish before changing the review.');
    }
    if (!allowCorrectionApply && (correctionOpen || correctionApplyInFlightRef.current)) {
      throw new Error('Finish or cancel the card correction before changing another pocket.');
    }
    const currentSession = sessionRef.current;
    if (!scanSessionId || !currentSession || currentSession.scanSessionId !== scanSessionId) {
      throw new Error('This binder page review is no longer available.');
    }
    const sessionRequestId = sessionLoadRequestRef.current;
    const mutationSequence = ++pocketMutationSequenceRef.current;
    const affectedPocketIndices = Array.from(new Set(targetPocketIndices));
    const mutation = pendingPocketMutationRef.current.then(async () => {
      const persisted = await updateBinderPageScanSession(scanSessionId, currentSession.ownerUserId, (stored) => ({
        ...stored,
        pockets: updater(stored.pockets),
      }));
      if (!persisted) throw new Error('This binder page review is no longer available.');
      if (sessionRequestId !== sessionLoadRequestRef.current) return;
      // The intended pocket is captured before storage runs. This lets an
      // idempotent retry repair either a read or index-write failure, while an
      // unrelated pocket can never make that failure invisible.
      if (!saveInFlightRef.current && affectedPocketIndices.length > 0) {
        const affectedIndices = new Set(affectedPocketIndices);
        pocketMutationFailuresRef.current = pocketMutationFailuresRef.current.filter((failure) => (
          failure.affectedPocketIndices.length === 0
          || !failure.affectedPocketIndices.every((index) => affectedIndices.has(index))
        ));
      }
      sessionRef.current = persisted;
      pocketsRef.current = persisted.pockets;
      setSession(persisted);
      setPockets(persisted.pockets);
    });
    // Later edits continue after a rejected write, but Save records that failure
    // and refuses to create an intent until the review has been retried.
    pendingPocketMutationRef.current = mutation.then(
      () => undefined,
      (error) => {
        if (sessionRequestId !== sessionLoadRequestRef.current) return;
        pocketMutationFailuresRef.current.push({
          sequence: mutationSequence,
          error: error instanceof Error ? error : new Error('Could not save binder page review.'),
          affectedPocketIndices,
        });
      },
    );
    return mutation;
  };

  const updatePocket = (index: number, patch: Partial<BinderPagePocketResult>, allowCorrectionApply = false) => updatePockets((current) => current.map((pocket) => (
    pocket.index === index ? { ...pocket, ...patch } : pocket
  )), [index], allowCorrectionApply);

  const cycleCandidate = async (direction: 1 | -1) => {
    if (!selectedPocket || selectedPocket.candidates.length < 2) return;
    const nextIndex = (
      selectedPocket.selectedCandidateIndex + direction + selectedPocket.candidates.length
    ) % selectedPocket.candidates.length;
    await updatePocket(selectedPocket.index, {
      selectedCandidateIndex: nextIndex,
      status: 'possible_match',
      source: 'manual',
    });
  };

  const openCorrection = () => {
    if (saveInFlightRef.current) return;
    if (!selectedPocket) return;
    correctionRequestRef.current += 1;
    setCorrectionLoading(false);
    setCorrectionQuery(selectedCandidate?.name ?? '');
    setCorrectionResults([]);
    setCorrectionError(null);
    setCorrectionPocketIndex(selectedPocket.index);
    setCorrectionOpen(true);
  };

  const closeCorrection = () => {
    if (correctionApplyInFlightRef.current) return;
    correctionRequestRef.current += 1;
    setCorrectionOpen(false);
    setCorrectionPocketIndex(null);
    setCorrectionQuery('');
    setCorrectionResults([]);
    setCorrectionError(null);
    setCorrectionLoading(false);
  };

  const updateCorrectionQuery = (value: string) => {
    correctionRequestRef.current += 1;
    setCorrectionQuery(value);
    setCorrectionResults([]);
    setCorrectionError(null);
    setCorrectionLoading(false);
  };

  const searchCorrectionCandidates = async () => {
    if (correctionApplyInFlightRef.current) return;
    const query = correctionQuery.trim();
    if (query.length < 2) {
      setCorrectionError('Enter at least two characters to search the catalogue.');
      return;
    }
    const requestId = ++correctionRequestRef.current;
    setCorrectionLoading(true);
    setCorrectionError(null);
    try {
      const cards = await fetchPokemonTcgApiCardsByQuery(query, { limit: 12 });
      if (requestId !== correctionRequestRef.current) return;
      setCorrectionResults(cards.map((card) => ({
        id: card.id,
        name: card.name,
        language: card.language ?? null,
        number: card.number ?? null,
        set_id: card.set?.id ?? null,
        set_name: card.set?.name ?? null,
        image_small: card.images?.small ?? null,
        image_large: card.images?.large ?? null,
        confidence: null,
      })).filter((card) => Boolean(card.set_id)));
    } catch (error) {
      if (requestId !== correctionRequestRef.current) return;
      setCorrectionError(error instanceof Error ? error.message : 'Catalogue search could not be completed.');
    } finally {
      if (requestId === correctionRequestRef.current) setCorrectionLoading(false);
    }
  };

  const selectCorrectionCandidate = async (candidate: BinderPagePocketResult['candidates'][number]) => {
    if (correctionApplyInFlightRef.current) return;
    if (!selectedPocket || correctionPocketIndex === null || selectedPocket.index !== correctionPocketIndex) {
      throw new Error('Choose the pocket again before applying this correction.');
    }
    correctionApplyInFlightRef.current = true;
    try {
      await updatePocket(correctionPocketIndex, {
        candidates: [candidate],
        selectedCandidateIndex: 0,
        status: 'possible_match',
        source: 'manual',
        notes: [...selectedPocket.notes, 'manual-correction'],
      }, true);
      correctionApplyInFlightRef.current = false;
      closeCorrection();
    } finally {
      correctionApplyInFlightRef.current = false;
    }
  };

  const confirmSelectedPocket = async () => {
    if (!selectedPocket || !selectedCandidate) return;
    await updatePocket(selectedPocket.index, {
      status: 'confirmed',
      source: selectedPocket.source === 'none' ? 'manual' : selectedPocket.source,
    });
    if (scanSessionId) {
      void logScanLearningEvent({
        scanSessionId,
        eventType: 'candidate_selected',
        scanMode: 'manual',
        routeContext: {
          screen: 'binder-page-result',
          intent: 'binder_page',
          layout: gridLayout,
          pocketIndex: selectedPocket.index,
          row: selectedPocket.row,
          column: selectedPocket.column,
          statuses: countPocketStatuses(pockets),
          analytics: buildBinderPageAnalytics(null, { manualCorrection: true }),
        },
        candidates: buildPocketLearningCandidates([selectedPocket]),
        selectedCardId: selectedCandidate.id,
        selectedSetId: selectedCandidate.set_id ?? null,
        selectedCardName: selectedCandidate.name,
        outcome: 'pocket_confirmed',
      });
    }
  };

  const markSelectedEmpty = async () => {
    if (!selectedPocket) return;
    await updatePocket(selectedPocket.index, {
      status: 'empty',
      selectedCandidateIndex: 0,
      candidates: [],
      source: 'manual',
      notes: [...selectedPocket.notes, 'user-marked-empty'],
    });
  };

  const rescanSelectedPocket = () => {
    if (!selectedPocket) return;
    if (saveInFlightRef.current) {
      Alert.alert('Saving confirmed cards', 'Wait for this save to finish before rescanning a pocket.');
      return;
    }
    if (correctionOpen || correctionApplyInFlightRef.current) {
      Alert.alert('Finish the correction first', 'Finish or cancel the card correction before rescanning this pocket.');
      return;
    }
    if (scanSessionId) {
      void logScanLearningEvent({
        scanSessionId,
        eventType: 'rescan',
        scanMode: 'manual',
        routeContext: {
          screen: 'binder-page-result',
          intent: 'binder_page',
          layout: gridLayout,
          pocketIndex: selectedPocket.index,
          row: selectedPocket.row,
          column: selectedPocket.column,
          analytics: buildBinderPageAnalytics(null, { rescan: true }),
        },
        candidates: buildPocketLearningCandidates([selectedPocket]),
        selectedCardId: selectedCandidate?.id ?? null,
        selectedSetId: selectedCandidate?.set_id ?? null,
        selectedCardName: selectedCandidate?.name ?? null,
        outcome: 'pocket_rescan_requested',
      });
    }
    router.replace({
      pathname: '/scan',
      params: {
        intent: 'binder_page',
        mode: 'binder',
        scanMode: 'manual',
        layout: '1',
        ...(scanSessionId ? { parentSessionId: scanSessionId } : {}),
        replacePocketIndex: String(selectedPocket.index),
        ...(selectedBinderId ? { binderId: selectedBinderId } : {}),
      },
    } as any);
  };

  const saveConfirmed = async () => {
    if (correctionOpen || correctionApplyInFlightRef.current) {
      Alert.alert('Finish the correction first', 'Finish or cancel the card correction before saving this review.');
      return;
    }
    if (bindersLoading || bindersError || !selectedBinder) {
      Alert.alert('Binder list unavailable', 'Retry loading your binders before saving this review.');
      return;
    }
    const binderId = selectedBinder.id;
    const page = destinationPage;
    const saveMutationSequence = pocketMutationSequenceRef.current;
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      // Finish every edit that began before Save was pressed, then create the
      // collection intent from that verified persisted review rather than a
      // render that may still be one interaction behind.
      await pendingPocketMutationRef.current;
      const pendingFailure = pocketMutationFailuresRef.current.find((failure) => failure.sequence <= saveMutationSequence);
      if (pendingFailure) throw pendingFailure.error;
      const currentSession = sessionRef.current;
      const persistedPockets = pocketsRef.current;
      const confirmed = persistedPockets
        .filter((pocket) => pocket.status === 'confirmed')
        .map((pocket) => ({ pocket, candidate: getSelectedCandidate(pocket) }))
        .filter((entry): entry is { pocket: BinderPagePocketResult; candidate: NonNullable<ReturnType<typeof getSelectedCandidate>> } => Boolean(entry.candidate));
      if (!confirmed.length) throw new Error('Confirm at least one pocket before saving.');
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (
        !currentSession
        || currentSession.scanSessionId !== scanSessionId
        || !authSession?.user.id
        || authSession.user.id !== currentSession.ownerUserId
      ) {
        throw new Error('Sign in with the account that started this binder page review before saving.');
      }
      const databaseStartedAt = Date.now();
      const cards = confirmed.map(({ pocket, candidate }) => ({
        cardId: candidate.id,
        setId: candidate.set_id ?? '',
        language: candidate.language ?? null,
        quantity: 1,
        cardName: candidate.name,
        cardNumber: candidate.number ?? null,
        imageUrl: candidate.image_small ?? candidate.image_large ?? null,
        setName: candidate.set_name ?? null,
        notes: `Binder page ${page}, pocket ${pocket.row + 1}-${pocket.column + 1}`,
        slotOrder: (page - 1) * 25 + pocket.index,
      })).filter((card) => Boolean(card.setId));
      if (!cards.length) throw new Error('Confirmed pockets are missing a set identity. Correct those pockets before saving.');
      const sourceSessionId = scanSessionId ?? currentSession.scanSessionId;
      const requestKey = createCollectionBatchRequestKey({
        sourceSessionId,
        binderId,
        cards,
      });
      const intent = await persistVerifiedCollectionBatchRecoveryIntent({
        sourceSessionId,
        binderId,
        cards,
        requestKey,
      });
      const saved = await addOwnedCardBatchToBinder(intent.binderId, [...intent.cards], { requestKey: intent.requestKey });
      const databaseSaveMs = Date.now() - databaseStartedAt;

      if (scanSessionId) {
        await logScanLearningEvent({
          scanSessionId,
          eventType: 'added_to_binder',
          scanMode: 'manual',
          routeContext: {
            screen: 'binder-page-result',
            intent: 'binder_page',
            binderId,
            layout: gridLayout,
            confirmedCount: confirmed.length,
            savedCount: saved.copiesAdded,
            distinctCardCount: saved.distinctCards,
            replayed: saved.replayed,
            statuses: countPocketStatuses(persistedPockets),
            analytics: buildBinderPageAnalytics(databaseSaveMs, { duplicatePrevention: saved.replayed }),
          },
          candidates: buildPocketLearningCandidates(persistedPockets),
          outcome: 'binder_page_saved',
        });
      }

      invalidateBinderCaches(binderId);
      if (scanSessionId && currentSession) {
        try {
          await markBinderPageScanSessionSaved(scanSessionId, currentSession.ownerUserId);
        } catch (recoveryError) {
          console.log('Binder page review completion checkpoint failed:', recoveryError);
        }
      }
      Alert.alert('Binder updated', `${saved.copiesAdded} confirmed ${saved.copiesAdded === 1 ? 'copy' : 'copies'} saved.`, [
        {
          text: 'View binder',
          onPress: () => router.replace({
            pathname: '/binder/[id]',
            params: { id: binderId },
          } as any),
        },
      ]);
    } catch (error: any) {
      if (scanSessionId) {
        await logScanLearningEvent({
          scanSessionId,
          eventType: 'added_to_binder',
          scanMode: 'manual',
          routeContext: {
            screen: 'binder-page-result',
            intent: 'binder_page',
            binderId,
            layout: gridLayout,
            statuses: countPocketStatuses(pocketsRef.current),
            analytics: buildBinderPageAnalytics(null, { errorCategory: 'database' }),
          },
          candidates: buildPocketLearningCandidates(pocketsRef.current),
          outcome: 'save_failed',
          notes: error?.message ?? 'Could not save binder page.',
        });
      }
      Alert.alert('Could not save page', error?.message ?? 'Please try again.');
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const leaveReview = () => {
    if (saveInFlightRef.current) {
      Alert.alert('Saving confirmed cards', 'Wait for this save to finish before leaving this review.');
      return;
    }
    router.back();
  };

  if (sessionLoading || !session) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <StackrBackButton onPress={leaveReview} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Binder page</Text>
            {sessionLoading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12, alignSelf: 'flex-start' }} /> : (
              <>
                <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>{sessionError ?? 'This scan session is no longer available.'}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => setSessionReloadToken((value) => value + 1)} style={[styles.retryButton, { borderColor: theme.colors.primary }]}>
                  <Text style={[styles.retryButtonText, { color: theme.colors.primary }]}>Retry review</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <StackrBackButton onPress={leaveReview} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Binder page scan</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
              {session.layout}x{session.layout} page - {confirmedCount} confirmed - {possibleCount} to review
            </Text>
          </View>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.summaryRow}>
            <SummaryStat label="Confirmed" value={confirmedCount} color="#10B981" />
            <SummaryStat label="Review" value={possibleCount} color={theme.colors.primary} />
            <SummaryStat label="Issues" value={problemCount} color="#EF4444" />
          </View>
          <View style={styles.destinationRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.colors.textSoft }]}>Destination binder</Text>
              {bindersError ? (
                <View style={styles.destinationError}>
                  <Text accessibilityRole="alert" style={[styles.destinationErrorText, { color: theme.colors.textSoft }]}>{bindersError}</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setBindersReloadToken((value) => value + 1)} style={[styles.destinationRetry, { borderColor: theme.colors.primary }]}>
                    <Text style={[styles.destinationRetryText, { color: theme.colors.primary }]}>Retry binders</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
                {bindersLoading ? <ActivityIndicator color={theme.colors.primary} /> : binders.map((binder) => {
                  const active = selectedBinderId === binder.id;
                  return (
                    <TouchableOpacity
                      key={binder.id}
                      onPress={() => setSelectedBinderId(binder.id)}
                      disabled={saving}
                      style={[styles.pill, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? `${theme.colors.primary}18` : theme.colors.surface }]}
                    >
                      <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontSize: 12, fontWeight: '900' }} numberOfLines={1}>
                        {binder.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.pageStepper}>
              <Text style={[styles.fieldLabel, { color: theme.colors.textSoft }]}>Page</Text>
              <View style={styles.stepperButtons}>
                <TouchableOpacity disabled={saving} onPress={() => setDestinationPage((page) => Math.max(1, page - 1))} style={[styles.stepperButton, { borderColor: theme.colors.border }]}>
                  <Ionicons name="remove" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.pageNumber, { color: theme.colors.text }]}>{destinationPage}</Text>
                <TouchableOpacity disabled={saving} onPress={() => setDestinationPage((page) => Math.min(999, page + 1))} style={[styles.stepperButton, { borderColor: theme.colors.border }]}>
                  <Ionicons name="add" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {pockets.map((pocket) => {
            const candidate = getSelectedCandidate(pocket);
            const selected = selectedPocketIndex === pocket.index;
            const color = getStatusColor(pocket.status);
            return (
              <TouchableOpacity
                key={pocket.index}
                onPress={() => { if (!saving && !correctionOpen) setSelectedPocketIndex(pocket.index); }}
                disabled={saving}
                activeOpacity={0.82}
                style={[
                  styles.pocketCard,
                  {
                    width: pocketWidth,
                    backgroundColor: theme.colors.card,
                    borderColor: selected ? theme.colors.primary : `${color}66`,
                  },
                ]}
              >
                {candidate?.image_small || pocket.cropUri ? (
                  <Image source={{ uri: candidate?.image_small ?? pocket.cropUri ?? undefined }} style={styles.pocketImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.pocketImage, styles.pocketEmptyImage, { backgroundColor: theme.colors.surface }]}>
                    <Ionicons name="scan-outline" size={18} color={theme.colors.textSoft} />
                  </View>
                )}
                <Text style={[styles.pocketTitle, { color: theme.colors.text }]} numberOfLines={2}>
                  {candidate?.name ?? STATUS_LABELS[pocket.status]}
                </Text>
                <Text style={[styles.pocketStatus, { color }]} numberOfLines={1}>
                  {pocket.row + 1}-{pocket.column + 1} - {STATUS_LABELS[pocket.status]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedPocket ? (
          <View style={[styles.detailCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.detailTitle, { color: theme.colors.text }]}>
              Pocket {selectedPocket.row + 1}-{selectedPocket.column + 1}
            </Text>
            <Text style={[styles.detailSubtitle, { color: getStatusColor(selectedPocket.status) }]}>
              {STATUS_LABELS[selectedPocket.status]}
            </Text>
            {selectedCandidate ? (
              <View style={styles.selectedCandidateRow}>
                <Image source={{ uri: selectedCandidate.image_small ?? selectedCandidate.image_large ?? selectedPocket.cropUri ?? undefined }} style={styles.selectedCandidateImage} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.candidateName, { color: theme.colors.text }]} numberOfLines={2}>{selectedCandidate.name}</Text>
                  <Text style={[styles.candidateMeta, { color: theme.colors.textSoft }]} numberOfLines={2}>
                    {[selectedCandidate.set_name, selectedCandidate.number ? `#${selectedCandidate.number}` : null, selectedCandidate.confidence != null ? `${selectedCandidate.confidence}%` : null].filter(Boolean).join(' - ')}
                  </Text>
                  {selectedPocket.candidates.length > 1 ? (
                    <View style={styles.candidateSwitchRow}>
                      <TouchableOpacity disabled={saving} onPress={() => { void cycleCandidate(-1).catch((error) => Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.')); }} style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Prev</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={saving} onPress={() => { void cycleCandidate(1).catch((error) => Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.')); }} style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
            {correctionOpen ? (
              <View style={[styles.correctionPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <Text style={[styles.correctionTitle, { color: theme.colors.text }]}>Correct pocket {selectedPocket.row + 1}-{selectedPocket.column + 1}</Text>
                <Text style={[styles.correctionHint, { color: theme.colors.textSoft }]}>Search the catalogue, choose the right card, then confirm this pocket.</Text>
                <TextInput
                  value={correctionQuery}
                  onChangeText={updateCorrectionQuery}
                  placeholder="Card name or number"
                  placeholderTextColor={theme.colors.textSoft}
                  style={[styles.correctionInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                  returnKeyType="search"
                  onSubmitEditing={() => { void searchCorrectionCandidates(); }}
                />
                {correctionError ? <Text accessibilityRole="alert" style={[styles.correctionHint, { color: '#EF4444' }]}>{correctionError}</Text> : null}
                <View style={styles.candidateSwitchRow}>
                  <TouchableOpacity accessibilityRole="button" onPress={() => { void searchCorrectionCandidates(); }} disabled={correctionLoading || correctionApplyInFlightRef.current} style={[styles.smallButton, { borderColor: theme.colors.primary }]}>
                    {correctionLoading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Search cards</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={closeCorrection} disabled={correctionApplyInFlightRef.current} style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.smallButtonText, { color: theme.colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                {correctionResults.map((candidate) => (
                  <TouchableOpacity key={`${candidate.set_id}:${candidate.id}`} accessibilityRole="button" disabled={correctionApplyInFlightRef.current} onPress={() => { void selectCorrectionCandidate(candidate).catch((error) => setCorrectionError(error instanceof Error ? error.message : 'Could not apply this correction.')); }} style={[styles.correctionResult, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.smallButtonText, { color: theme.colors.text }]} numberOfLines={1}>{candidate.name}</Text>
                    <Text style={[styles.correctionHint, { color: theme.colors.textSoft }]} numberOfLines={1}>{[candidate.set_name, candidate.number ? `#${candidate.number}` : null].filter(Boolean).join(' · ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => { void confirmSelectedPocket().catch((error) => Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.')); }} disabled={saving || !selectedCandidate || correctionOpen} style={[styles.actionButton, (saving || !selectedCandidate || correctionOpen) && styles.disabled, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.actionButtonText}>Confirm pocket</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { void markSelectedEmpty().catch((error) => Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.')); }} disabled={saving || correctionOpen} style={[styles.actionButton, (saving || correctionOpen) && styles.disabled, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}>
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Mark empty</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={rescanSelectedPocket} disabled={saving || correctionOpen} style={[styles.actionButton, (saving || correctionOpen) && styles.disabled, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}>
                <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Rescan pocket</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openCorrection}
                disabled={saving || correctionOpen}
                style={[styles.actionButton, (saving || correctionOpen) && styles.disabled, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}
              >
                <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Correct match</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={saveConfirmed}
          disabled={saving || !destinationReady || correctionOpen}
          accessibilityState={{ busy: saving, disabled: saving || !destinationReady || correctionOpen }}
          style={[styles.saveButton, { backgroundColor: theme.colors.primary, opacity: saving || !destinationReady || correctionOpen ? 0.65 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save confirmed cards</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 34,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#8177A6',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pill: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageStepper: {
    width: 102,
    gap: 6,
  },
  stepperButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumber: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pocketCard: {
    minHeight: 126,
    borderRadius: 14,
    borderWidth: 1,
    padding: 7,
    gap: 5,
  },
  pocketImage: {
    width: '100%',
    height: 70,
    borderRadius: 9,
  },
  pocketEmptyImage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  pocketStatus: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  detailCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  detailTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  detailSubtitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  selectedCandidateRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  selectedCandidateImage: {
    width: 64,
    height: 88,
    borderRadius: 10,
  },
  candidateName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  candidateMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  candidateSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  destinationError: { marginTop: 8, gap: 8 },
  destinationErrorText: { fontSize: 13, lineHeight: 18 },
  destinationRetry: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
  destinationRetryText: { fontSize: 13, fontWeight: '800' },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  smallButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  correctionPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  correctionTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  correctionHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  correctionInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  correctionResult: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  saveButton: {
    minHeight: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
