import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove } from '@react-navigation/native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useAppMode } from '../../components/app-mode-context';
import { useTheme } from '../../components/theme-context';
import { fetchBinders, type BinderRecord } from '../../lib/binders';
import {
  addOwnedCardBatchToBinder,
  createCollectionBatchRequestKey,
  isCollectionBatchReconciliationRequired,
} from '../../lib/collectionBatch';
import {
  commitSellerInventoryBatch,
  loadVerifiedSellerInventorySnapshot,
  type SellerInventoryBatchResult,
} from '../../lib/inventory';
import {
  isSellerInventoryCommitAccountChanged,
  isSellerInventoryCommitReconciliationRequired,
  assertSellerInventoryPostCommitState,
  SellerInventoryCommitReconciliationRequiredError,
} from '../../lib/sellerBatchCommit';
import { isVerifiedSellerSessionIdentity } from '../../lib/sellerCache';
import {
  MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS,
  MOBILE_UX_MIN_TOUCH_TARGET,
  deriveSellerSweepUxState,
} from '../../lib/mobileFlowUx';
import {
  SELLER_SWEEP_INVENTORY_CONDITIONS,
  type SellerSweepInventoryBatchProposal,
  type SellerSweepInventoryCondition,
} from '../../lib/sellerSweepBatchPlanner';
import {
  createSellerSweepReviewHandoff,
  createSellerSweepReviewExport,
  getSellerSweepReviewIssues,
} from '../../lib/sellerSweepReviewHandoff';
import {
  assertSellerSweepCommitResult,
  createSellerSweepCommitJournalEntry,
  parseSellerSweepCommitJournal,
  sellerSweepCommitJournalKey,
  serializeSellerSweepCommitJournal,
  type SellerSweepCommitJournalEntry,
} from '../../lib/sellerSweepCommitJournal';
import { supabase } from '../../lib/supabase';
import {
  clearSweepScanSession,
  confirmSweepScanItem,
  createSweepScanSession,
  getSweepScanSession,
  getSweepScanSummary,
  hydrateSweepScanSession,
  removeSweepScanItem,
  selectSweepScanCandidate,
  setSweepScanItemQuantity,
  type SweepScanItem,
  type SweepScanSession,
} from '../../lib/sweepScanSession';

function selectedCandidate(item: SweepScanItem) {
  return item.candidates[item.selectedCandidateIndex] ?? item.candidates[0] ?? null;
}

function confidenceLabel(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Needs review';
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(percent)}% match`;
}

function sellerCommitFailureMessage(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  if (message.includes('premium_seller_mode_disabled')) {
    return 'Premium Seller writes are currently paused. This reviewed batch was not applied.';
  }
  if (message.includes('premium_seller_entitlement_required')
    || message.includes('Premium Seller Mode is not available')) {
    return 'This account is not currently entitled to Premium Seller writes.';
  }
  if (message.includes('seller_inventory_snapshot_conflict')) {
    return 'Live inventory changed after this batch was prepared. Refresh and review it again.';
  }
  if (message.includes('seller_inventory_idempotency_conflict')) {
    return 'This request ID is already bound to a different batch. No new changes were applied.';
  }
  return message || 'The reviewed batch was not applied. Refresh live inventory and try again.';
}

const RAW_SELLER_SWEEP_CONDITIONS = SELLER_SWEEP_INVENTORY_CONDITIONS
  .filter((condition) => condition !== 'Sealed');

export default function SweepScanResultScreen() {
  const { theme } = useTheme();
  const { mode: appMode } = useAppMode();
  const isSellerMode = appMode === 'seller';
  const params = useLocalSearchParams<{ sweepSessionId?: string; binderId?: string }>();
  const sweepSessionId = typeof params.sweepSessionId === 'string' ? params.sweepSessionId : null;
  const requestedBinderId = typeof params.binderId === 'string' ? params.binderId : null;
  const [session, setSession] = useState<SweepScanSession | null>(() => getSweepScanSession(sweepSessionId));
  const [loading, setLoading] = useState(!session);
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(requestedBinderId);
  const [saving, setSaving] = useState(false);
  const [collectionSaveReconciliationRequired, setCollectionSaveReconciliationRequired] = useState(false);
  const collectionSaveInFlightRef = useRef(false);
  const [sellerConditions, setSellerConditions] = useState<
    Record<string, SellerSweepInventoryCondition | null>
  >({});
  const [sellerIdentityReviews, setSellerIdentityReviews] = useState<Record<string, boolean>>({});
  const [sellerProposal, setSellerProposal] = useState<SellerSweepInventoryBatchProposal | null>(null);
  const [sellerPreparing, setSellerPreparing] = useState(false);
  const [sellerCommitting, setSellerCommitting] = useState(false);
  const [sellerJournalRestoring, setSellerJournalRestoring] = useState(false);
  const [sellerJournalError, setSellerJournalError] = useState<string | null>(null);
  const [sellerJournal, setSellerJournal] = useState<SellerSweepCommitJournalEntry | null>(null);
  const [sellerJournalCheckedSessionId, setSellerJournalCheckedSessionId] = useState<string | null>(null);
  const [sellerCommittedResult, setSellerCommittedResult] = useState<SellerInventoryBatchResult | null>(null);
  const [sellerPreparedForUserId, setSellerPreparedForUserId] = useState<string | null>(null);
  const [sellerExitApproved, setSellerExitApproved] = useState(false);
  const sellerReviewVersionRef = useRef(0);
  const sellerProposalReviewVersionRef = useRef<number | null>(null);
  const activeSweepSessionId = session?.scanSessionId ?? null;

  useEffect(() => {
    let cancelled = false;
    void hydrateSweepScanSession(sweepSessionId).then((restored) => {
      if (!cancelled) {
        setSession(restored);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sweepSessionId]);

  useEffect(() => {
    if (!isSellerMode || !activeSweepSessionId) {
      setSellerJournal(null);
      setSellerJournalCheckedSessionId(null);
      setSellerJournalError(null);
      setSellerCommittedResult(null);
      setSellerPreparedForUserId(null);
      setSellerProposal(null);
      setSellerConditions({});
      setSellerIdentityReviews({});
      setSellerJournalRestoring(false);
      return;
    }

    let cancelled = false;
    setSellerJournalRestoring(true);
    setSellerJournalError(null);
    void (async () => {
      try {
        const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
        ]);
        if (sessionError) throw sessionError;
        if (userError) throw userError;
        if (!isVerifiedSellerSessionIdentity(sessionData.session?.user?.id, userData.user?.id)) {
          throw new Error('Sign in again before recovering this Seller Sweep batch.');
        }
        const userId = userData.user!.id;
        const key = sellerSweepCommitJournalKey(userId, activeSweepSessionId);
        const entry = parseSellerSweepCommitJournal(
          await AsyncStorage.getItem(key),
          { userId, sourceSessionId: activeSweepSessionId },
        );
        if (cancelled || !entry) return;
        setSellerJournal(entry);
        setSellerProposal(entry.proposal);
        setSellerPreparedForUserId(entry.userId);
        sellerProposalReviewVersionRef.current = null;
        setSellerCommittedResult(
          entry.state === 'committed' ? entry.result : null,
        );
      } catch (error: any) {
        if (!cancelled) {
          setSellerJournalError(
            error?.message ?? 'The saved Seller Sweep recovery record could not be verified.',
          );
        }
      } finally {
        if (!cancelled) {
          setSellerJournalCheckedSessionId(activeSweepSessionId);
          setSellerJournalRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSweepSessionId, isSellerMode]);

  useEffect(() => {
    if (!isSellerMode || !sellerPreparedForUserId) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user?.id === sellerPreparedForUserId) return;
      sellerReviewVersionRef.current += 1;
      sellerProposalReviewVersionRef.current = null;
      setSellerProposal(null);
      setSellerPreparedForUserId(null);
      setSellerJournal(null);
      setSellerCommittedResult(null);
      setSellerConditions({});
      setSellerIdentityReviews({});
      setSellerJournalError(
        'Seller account changed. Reopen this sweep under the original account to recover its saved request.',
      );
    });
    return () => subscription.unsubscribe();
  }, [isSellerMode, sellerPreparedForUserId]);

  useEffect(() => {
    if (isSellerMode) {
      setBinders([]);
      setSelectedBinderId(null);
      return;
    }
    let cancelled = false;
    void fetchBinders().then((rows) => {
      if (cancelled) return;
      setBinders(rows);
      setSelectedBinderId((current) => current ?? rows[0]?.id ?? null);
    }).catch((error) => {
      console.log('Sweep result binder load failed:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [isSellerMode]);

  const summary = useMemo(() => getSweepScanSummary(session), [session]);
  const confirmedItems = useMemo(
    () => session?.items.filter((item) => item.status === 'confirmed' && selectedCandidate(item)) ?? [],
    [session]
  );
  const sellerReviewIssues = useMemo(
    () => session && isSellerMode
      ? getSellerSweepReviewIssues({
          session,
          conditions: sellerConditions,
          identityReviews: sellerIdentityReviews,
        })
      : [],
    [isSellerMode, sellerConditions, sellerIdentityReviews, session]
  );
  const sellerProposalCopies = useMemo(
    () => sellerProposal?.movements.reduce((sum, movement) => sum + movement.quantity, 0) ?? 0,
    [sellerProposal]
  );
  const sellerNeedsReconciliation = Boolean(
    sellerJournal && sellerJournal.state !== 'committed',
  );
  const sellerJournalUnchecked = Boolean(
    isSellerMode
    && activeSweepSessionId
    && sellerJournalCheckedSessionId !== activeSweepSessionId,
  );
  const sellerReviewLocked = sellerCommitting
    || sellerJournalRestoring
    || sellerJournalUnchecked
    || Boolean(sellerJournalError)
    || sellerNeedsReconciliation
    || Boolean(sellerCommittedResult);
  const sellerReviewHasChanges = Object.keys(sellerConditions).length > 0
    || Object.keys(sellerIdentityReviews).length > 0;
  const sellerUx = useMemo(() => deriveSellerSweepUxState({
    preparing: sellerPreparing,
    committing: sellerCommitting,
    journalRestoring: sellerJournalRestoring,
    journalUnchecked: sellerJournalUnchecked,
    journalError: Boolean(sellerJournalError),
    reconciliationRequired: sellerNeedsReconciliation,
    committed: Boolean(sellerCommittedResult),
    proposalReady: Boolean(sellerProposal),
    reviewIssueCount: sellerReviewIssues.length,
    reviewHasChanges: sellerReviewHasChanges,
  }), [
    sellerCommittedResult,
    sellerCommitting,
    sellerJournalError,
    sellerJournalRestoring,
    sellerJournalUnchecked,
    sellerNeedsReconciliation,
    sellerPreparing,
    sellerProposal,
    sellerReviewHasChanges,
    sellerReviewIssues.length,
  ]);

  usePreventRemove(
    isSellerMode && !sellerExitApproved && sellerUx.exitGuard !== 'none',
    () => {
      if (sellerUx.exitGuard === 'block') {
        Alert.alert(sellerUx.exitTitle, sellerUx.exitMessage, [{ text: 'Stay here' }]);
        return;
      }
      Alert.alert(sellerUx.exitTitle, sellerUx.exitMessage, [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'Leave to inventory',
          style: 'destructive',
          onPress: () => setSellerExitApproved(true),
        },
      ]);
    },
  );

  useEffect(() => {
    if (!sellerExitApproved) return;
    router.replace('/(tabs)/inventory' as any);
  }, [sellerExitApproved]);

  const refresh = (next: SweepScanSession | null, resetIdentityItemId?: string) => {
    if (sellerReviewLocked) return;
    if (next) {
      sellerReviewVersionRef.current += 1;
      setSession(next);
      setSellerProposal(null);
      if (resetIdentityItemId) {
        setSellerIdentityReviews((current) => {
          const nextReviews = { ...current };
          delete nextReviews[resetIdentityItemId];
          return nextReviews;
        });
      }
    }
  };

  const confirmSellerIdentity = (itemId: string) => {
    if (sellerReviewLocked) return;
    sellerReviewVersionRef.current += 1;
    setSellerIdentityReviews((current) => ({ ...current, [itemId]: true }));
    setSellerProposal(null);
  };

  const chooseSellerCondition = (itemId: string, condition: SellerSweepInventoryCondition) => {
    if (sellerReviewLocked) return;
    sellerReviewVersionRef.current += 1;
    setSellerConditions((current) => ({ ...current, [itemId]: condition }));
    setSellerProposal(null);
  };

  const scanMore = () => {
    if (sellerCommitting || sellerJournalRestoring || sellerJournalUnchecked || sellerNeedsReconciliation || sellerJournalError) {
      Alert.alert(
        'Finish seller recovery first',
        sellerJournalError
          ?? 'This batch may already be saved. Verify the existing request before scanning another batch.',
      );
      return;
    }
    if (sellerCommittedResult && sellerJournal && session) {
      clearSweepScanSession(session.scanSessionId);
      void AsyncStorage.removeItem(
        sellerSweepCommitJournalKey(sellerJournal.userId, sellerJournal.sourceSessionId),
      ).catch((error) => console.log('Seller Sweep journal cleanup failed', error));
      const next = createSweepScanSession({ binderId: null });
      router.replace({
        pathname: '/scan',
        params: {
          intent: 'sweep_collection',
          mode: 'market',
          scanMode: 'auto',
          sweepSessionId: next.scanSessionId,
        },
      } as any);
      return;
    }
    const active = session ?? createSweepScanSession({ binderId: selectedBinderId });
    router.replace({
      pathname: '/scan',
      params: {
        intent: 'sweep_collection',
        mode: 'market',
        scanMode: 'auto',
        sweepSessionId: active.scanSessionId,
        ...(selectedBinderId ? { binderId: selectedBinderId } : {}),
      },
    } as any);
  };

  const saveConfirmed = async () => {
    if (collectionSaveInFlightRef.current || collectionSaveReconciliationRequired) return;
    if (!session || !selectedBinderId) {
      Alert.alert('Choose a binder', 'Select where these cards should be added.');
      return;
    }
    if (!confirmedItems.length) {
      Alert.alert('Review needed', 'Confirm at least one match before adding cards.');
      return;
    }

    const cards = confirmedItems.flatMap((item) => {
      const candidate = selectedCandidate(item);
      if (!candidate?.id || !candidate.set_id) return [];
      return [{
        cardId: candidate.id,
        setId: candidate.set_id,
        language: candidate.language ?? null,
        quantity: item.quantity,
        cardName: candidate.name,
        cardNumber: candidate.number ?? null,
        imageUrl: candidate.image_large ?? candidate.image_small ?? null,
        setName: candidate.set_name ?? null,
        notes: 'Added with Stackr Sweep Scan',
      }];
    });
    const requestKey = createCollectionBatchRequestKey({
      sourceSessionId: session.scanSessionId,
      binderId: selectedBinderId,
      cards,
    });
    collectionSaveInFlightRef.current = true;
    setSaving(true);
    try {
      const result = await addOwnedCardBatchToBinder(
        selectedBinderId,
        cards,
        { requestKey },
      );

      Alert.alert(
        'Collection updated',
        `${result.copiesAdded} card${result.copiesAdded === 1 ? '' : 's'} added across ${result.distinctCards} match${result.distinctCards === 1 ? '' : 'es'}.`,
        [
          {
            text: 'Scan more',
            onPress: () => {
              clearSweepScanSession(session.scanSessionId);
              const next = createSweepScanSession({ binderId: selectedBinderId });
              router.replace({
                pathname: '/scan',
                params: {
                  intent: 'sweep_collection',
                  mode: 'market',
                  scanMode: 'auto',
                  sweepSessionId: next.scanSessionId,
                  binderId: selectedBinderId,
                },
              } as any);
            },
          },
          {
            text: 'View binder',
            onPress: () => {
              clearSweepScanSession(session.scanSessionId);
              router.replace({ pathname: '/binder/[id]', params: { id: selectedBinderId } } as any);
            },
          },
        ]
      );
    } catch (error: any) {
      if (isCollectionBatchReconciliationRequired(error)) {
        setCollectionSaveReconciliationRequired(true);
      }
      Alert.alert(
        isCollectionBatchReconciliationRequired(error) ? 'Verify binder before retrying' : 'Could not add cards',
        error?.message ?? 'Please try again.',
      );
    } finally {
      collectionSaveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const prepareSellerBatch = async () => {
    if (!session) return;
    if (sellerReviewLocked) {
      Alert.alert(
        'Seller batch is locked',
        sellerJournalError
          ?? 'Finish verifying the existing seller request before preparing another batch.',
      );
      return;
    }
    if (sellerReviewIssues.length) {
      Alert.alert('Seller review incomplete', sellerReviewIssues[0].message);
      return;
    }

    setSellerPreparing(true);
    const reviewVersion = sellerReviewVersionRef.current;
    const reviewedConditions = { ...sellerConditions };
    const reviewedIdentities = { ...sellerIdentityReviews };
    try {
      const verifiedInventory = await loadVerifiedSellerInventorySnapshot();
      if (sellerReviewVersionRef.current !== reviewVersion) {
        throw new Error('The review changed while the batch was being prepared. Check it once more and retry.');
      }
      const requestId = `seller:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
      const proposal = createSellerSweepReviewHandoff({
        session,
        conditions: reviewedConditions,
        identityReviews: reviewedIdentities,
        expectedItems: verifiedInventory.items,
        requestId,
        timestamp: new Date().toISOString(),
      });
      setSellerPreparedForUserId(verifiedInventory.userId);
      setSellerProposal(proposal);
      sellerProposalReviewVersionRef.current = reviewVersion;
    } catch (error: any) {
      Alert.alert('Could not prepare batch', error?.message ?? 'Review the batch and try again.');
    } finally {
      setSellerPreparing(false);
    }
  };

  const exportSellerBatch = async () => {
    if (!session || !sellerProposal) return;
    try {
      await Share.share({
        title: 'Stackr Seller Sweep batch',
        message: JSON.stringify(createSellerSweepReviewExport({
          sourceSessionId: session.scanSessionId,
          exportedAt: new Date().toISOString(),
          proposal: sellerProposal,
        }), null, 2),
      });
    } catch (error: any) {
      Alert.alert('Could not export batch', error?.message ?? 'Please try again.');
    }
  };

  const persistSellerJournal = async (entry: SellerSweepCommitJournalEntry) => {
    const key = sellerSweepCommitJournalKey(entry.userId, entry.sourceSessionId);
    const body = serializeSellerSweepCommitJournal(entry);
    await AsyncStorage.setItem(key, body);
    const restored = parseSellerSweepCommitJournal(
      await AsyncStorage.getItem(key),
      { userId: entry.userId, sourceSessionId: entry.sourceSessionId },
    );
    if (!restored || serializeSellerSweepCommitJournal(restored) !== body) {
      throw new Error('Seller Sweep recovery record could not be verified after saving.');
    }
    setSellerJournal(restored);
    return restored;
  };

  const verifiedSellerUserId = async () => {
    const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);
    if (sessionError) throw sessionError;
    if (userError) throw userError;
    if (!isVerifiedSellerSessionIdentity(sessionData.session?.user?.id, userData.user?.id)) {
      throw new Error('Seller account could not be verified. Sign in again before saving.');
    }
    return userData.user!.id;
  };

  const commitSellerBatch = async () => {
    if (!session || !sellerProposal || sellerCommitting || sellerCommittedResult) return;
    if (sellerJournalRestoring || sellerJournalUnchecked) return;
    if (sellerJournalError) {
      Alert.alert('Recovery record needs attention', sellerJournalError);
      return;
    }
    if (!sellerJournal
      && sellerProposalReviewVersionRef.current !== sellerReviewVersionRef.current) {
      Alert.alert('Review changed', 'Prepare the Seller Sweep batch again before saving.');
      setSellerProposal(null);
      return;
    }

    setSellerCommitting(true);
    let activeJournal = sellerJournal;
    try {
      const userId = await verifiedSellerUserId();
      if (sellerPreparedForUserId !== userId) {
        throw new Error('Seller account changed after this batch was prepared.');
      }
      if (activeJournal) {
        if (activeJournal.userId !== userId
          || activeJournal.sourceSessionId !== session.scanSessionId
          || JSON.stringify(activeJournal.proposal) !== JSON.stringify(sellerProposal)) {
          throw new Error('The saved Seller Sweep request does not match this account or scan session.');
        }
      } else {
        const now = new Date().toISOString();
        activeJournal = createSellerSweepCommitJournalEntry({
          userId,
          sourceSessionId: session.scanSessionId,
          state: 'pending',
          proposal: sellerProposal,
          result: null,
          createdAt: now,
        });
        activeJournal = await persistSellerJournal(activeJournal);
      }

      let committed: Awaited<ReturnType<typeof commitSellerInventoryBatch>>;
      try {
        committed = await commitSellerInventoryBatch({
          expectedUserId: activeJournal.userId,
          expectedItems: sellerProposal.expectedItems,
          items: sellerProposal.items,
          movements: sellerProposal.movements,
          sale: sellerProposal.sale,
          binderDeltas: sellerProposal.binderDeltas,
          requestId: sellerProposal.requestId,
        });
      } catch (error) {
        if (isSellerInventoryCommitReconciliationRequired(error)) {
          const unconfirmed = createSellerSweepCommitJournalEntry({
            ...activeJournal,
            state: 'unconfirmed',
            result: null,
            updatedAt: new Date().toISOString(),
          });
          setSellerJournal(unconfirmed);
          try {
            await persistSellerJournal(unconfirmed);
          } catch (journalError) {
            console.log('Seller Sweep unconfirmed journal update failed', journalError);
          }
          Alert.alert(
            'Save status needs verification',
            'The batch may have been saved. Keep this request locked and use Verify saved batch when connected.',
          );
          return;
        }
        if (isSellerInventoryCommitAccountChanged(error)) {
          await AsyncStorage.removeItem(
            sellerSweepCommitJournalKey(activeJournal.userId, activeJournal.sourceSessionId),
          );
          setSellerJournal(null);
          setSellerProposal(null);
          setSellerPreparedForUserId(null);
          Alert.alert(
            'Seller account changed',
            'No save was sent for the changed account. Reopen Seller Mode and prepare the batch again.',
          );
          return;
        }

        await AsyncStorage.removeItem(
          sellerSweepCommitJournalKey(activeJournal.userId, activeJournal.sourceSessionId),
        );
        setSellerJournal(null);
        setSellerProposal(null);
        setSellerPreparedForUserId(null);
        Alert.alert('Seller batch not saved', sellerCommitFailureMessage(error));
        return;
      }

      try {
        if (committed.userId !== activeJournal.userId) {
          throw new SellerInventoryCommitReconciliationRequiredError(
            committed.result.requestId,
            'committed_identity_unverified',
          );
        }
        assertSellerSweepCommitResult(sellerProposal, committed.result, activeJournal.userId);
      } catch {
        const unconfirmed = createSellerSweepCommitJournalEntry({
          ...activeJournal,
          state: 'unconfirmed',
          result: null,
          updatedAt: new Date().toISOString(),
        });
        setSellerJournal(unconfirmed);
        try {
          await persistSellerJournal(unconfirmed);
        } catch (journalError) {
          console.log('Seller Sweep receipt mismatch journal update failed', journalError);
        }
        Alert.alert(
          'Receipt needs verification',
          'The server responded, but its receipt did not match the reviewed batch. Further saves remain locked.',
        );
        return;
      }

      const needsRefresh = createSellerSweepCommitJournalEntry({
        ...activeJournal,
        state: 'committed_needs_refresh',
        result: committed.result,
        updatedAt: new Date().toISOString(),
      });
      setSellerJournal(needsRefresh);
      try {
        await persistSellerJournal(needsRefresh);
      } catch (error) {
        console.log('Seller Sweep committed journal update failed', error);
      }

      try {
        const refreshedInventory = await loadVerifiedSellerInventorySnapshot();
        if (refreshedInventory.userId !== committed.userId) {
          throw new SellerInventoryCommitReconciliationRequiredError(
            committed.result.requestId,
            'committed_identity_unverified',
          );
        }
        assertSellerInventoryPostCommitState({
          requestId: committed.result.requestId,
          expectedItems: sellerProposal.items,
          liveItems: refreshedInventory.items,
        });
      } catch {
        Alert.alert(
          'Inventory saved - refresh needed',
          'The atomic save completed, but live inventory could not be proven equal to the reviewed proposal. Use Verify saved batch before starting another sweep.',
        );
        return;
      }

      const completedJournal = createSellerSweepCommitJournalEntry({
        ...needsRefresh,
        state: 'committed',
        result: committed.result,
        updatedAt: new Date().toISOString(),
      });
      try {
        await persistSellerJournal(completedJournal);
      } catch {
        setSellerJournal(needsRefresh);
        Alert.alert(
          'Inventory saved - recovery record pending',
          'The save completed, but the local recovery record could not be finalized. Verify the saved batch before continuing.',
        );
        return;
      }
      setSellerCommittedResult(committed.result);

      const finish = (destination: 'inventory' | 'scan') => {
        clearSweepScanSession(session.scanSessionId);
        void AsyncStorage.removeItem(
          sellerSweepCommitJournalKey(completedJournal.userId, completedJournal.sourceSessionId),
        ).catch((error) => console.log('Seller Sweep journal cleanup failed', error));
        if (destination === 'inventory') {
          router.replace('/(tabs)/inventory' as any);
          return;
        }
        const next = createSweepScanSession({ binderId: null });
        router.replace({
          pathname: '/scan',
          params: {
            intent: 'sweep_collection',
            mode: 'market',
            scanMode: 'auto',
            sweepSessionId: next.scanSessionId,
          },
        } as any);
      };
      Alert.alert(
        committed.result.replayed ? 'Saved batch verified' : 'Inventory updated',
        `${sellerProposalCopies} copies were committed atomically with ${committed.result.movementCount} movement record${committed.result.movementCount === 1 ? '' : 's'}.`,
        [
          { text: 'Scan another', onPress: () => finish('scan') },
          { text: 'View inventory', onPress: () => finish('inventory') },
        ],
      );
    } catch (error: any) {
      setSellerJournalError(error?.message ?? 'Seller Sweep could not verify its recovery state.');
      Alert.alert(
        'Seller save paused',
        error?.message ?? 'The batch was not sent because its recovery state could not be verified.',
      );
    } finally {
      setSellerCommitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            style={[styles.emptyText, { color: theme.colors.textSoft }]}
            accessibilityLiveRegion="polite"
          >
            Loading your scan batch...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <StackrBackButton onPress={() => router.back()} style={[styles.headerBackButton, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.headerBackButton[1]]} />
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Sweep scan</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>This scan batch is no longer available.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <StackrBackButton
          onPress={scanMore}
          accessibilityLabel={isSellerMode ? 'Return to Seller Sweep scanner' : 'Return to sweep scanner'}
          style={[styles.headerBackButton, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.headerBackButton[1]]}
        />
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Sweep review</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]} numberOfLines={1}>
            {summary.totalCopies} cards, {summary.distinctCards} matches
          </Text>
        </View>
        <TouchableOpacity
          onPress={scanMore}
          style={[styles.scanMoreButton, { borderColor: theme.colors.border }, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.scanMoreButton[1]]}
          accessibilityRole="button"
          accessibilityLabel="Continue scanning cards"
          accessibilityHint={isSellerMode
            ? 'Returns to this Seller Sweep session unless a saved request still needs verification.'
            : 'Returns to the camera without clearing this batch.'}
        >
          <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.scanMoreText, { color: theme.colors.primary }]}>Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isSellerMode && styles.sellerContent]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.summaryBand, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryNumber, { color: theme.colors.text }]}>{summary.totalCopies}</Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSoft }]}>Cards</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryNumber, { color: '#10B981' }]}>{summary.confirmedCopies}</Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSoft }]}>Ready</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryNumber, { color: summary.reviewItems ? '#F59E0B' : theme.colors.text }]}>
              {summary.reviewItems + summary.unresolvedItems}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSoft }]}>Check</Text>
          </View>
        </View>

        {isSellerMode ? (
          <View
            style={[styles.sellerGateCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            accessibilityRole="summary"
            accessibilityLabel={sellerUx.statusAnnouncement}
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="shield-checkmark-outline" size={23} color={theme.colors.primary} />
            <View style={styles.sellerGateCopy}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Seller batch review</Text>
              <Text style={[styles.sellerGateText, { color: theme.colors.textSoft }]}>
                {sellerUx.statusAnnouncement}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add to binder</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.binderRow}>
              {binders.map((binder) => {
                const selected = binder.id === selectedBinderId;
                return (
                  <TouchableOpacity
                    key={binder.id}
                    onPress={() => setSelectedBinderId(binder.id)}
                    style={[
                      styles.binderChip,
                      { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.card },
                      MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.binderChip[1],
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Add cards to ${binder.name}`}
                  >
                    <View style={[styles.binderDot, { backgroundColor: binder.color || theme.colors.primary }]} />
                    <Text style={[styles.binderChipText, { color: theme.colors.text }]} numberOfLines={1}>
                      {binder.name}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={17} color={theme.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Scanned cards</Text>
          <Text style={[styles.sectionMeta, { color: theme.colors.textSoft }]}>{session.items.length} entries</Text>
        </View>

        {session.items.map((item) => {
          const candidate = selectedCandidate(item);
          const imageUri = candidate?.image_small ?? candidate?.image_large ?? item.captureUris[0] ?? null;
          const needsReview = item.status !== 'confirmed';
          const hasExactSellerIdentity = Boolean(
            candidate?.id?.trim()
            && candidate?.name?.trim()
            && candidate?.set_id?.trim()
            && candidate?.language?.trim()
            && candidate?.variant_code?.trim()
          );
          return (
            <View key={item.id} style={[styles.resultRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.cardImage} resizeMode="contain" />
              ) : (
                <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                  <Ionicons name="help-outline" size={24} color={theme.colors.textSoft} />
                </View>
              )}

              <View style={styles.resultBody}>
                <View style={styles.resultTitleRow}>
                  <View style={styles.resultTitleCopy}>
                    <Text style={[styles.cardName, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {candidate?.name ?? 'Unresolved card'}
                    </Text>
                    <Text style={[styles.cardMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
                      {candidate ? `${candidate.set_name ?? 'Unknown set'} - No. ${candidate.number ?? '?'}` : 'Scan this card again'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: needsReview ? '#FEF3C7' : '#D1FAE5' }]}>
                    <Text style={[styles.statusText, { color: needsReview ? '#92400E' : '#065F46' }]}>
                      {item.status === 'confirmed' ? 'Ready' : item.status === 'review' ? 'Review' : 'No match'}
                    </Text>
                  </View>
                </View>

                {candidate ? (
                  <>
                    <Text style={[styles.confidenceText, { color: theme.colors.textSoft }]}>
                      {confidenceLabel(candidate.confidence)}
                      {item.candidates.length > 1 ? ` - ${item.selectedCandidateIndex + 1} of ${item.candidates.length}` : ''}
                    </Text>
                    {isSellerMode ? (
                      <Text style={[styles.exactIdentityText, { color: theme.colors.textSoft }]} numberOfLines={1}>
                        {candidate.language && candidate.variant_code
                          ? `${candidate.language.toUpperCase()} - ${candidate.variant_code}`
                          : 'Exact language or variant missing'}
                      </Text>
                    ) : null}
                  </>
                ) : null}

                {isSellerMode && item.status === 'confirmed' ? (
                  <View style={styles.sellerItemReview}>
                    <TouchableOpacity
                      onPress={() => confirmSellerIdentity(item.id)}
                      disabled={sellerReviewLocked || !hasExactSellerIdentity || Boolean(sellerIdentityReviews[item.id])}
                      style={[
                        styles.identityReviewButton,
                        {
                          borderColor: sellerIdentityReviews[item.id] ? '#10B981' : theme.colors.border,
                          backgroundColor: sellerIdentityReviews[item.id] ? '#D1FAE5' : theme.colors.surface,
                        },
                        (sellerReviewLocked || !hasExactSellerIdentity) && styles.disabled,
                        MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.identityReviewButton[1],
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: Boolean(sellerIdentityReviews[item.id]),
                        disabled: sellerReviewLocked || !hasExactSellerIdentity || Boolean(sellerIdentityReviews[item.id]),
                      }}
                      accessibilityLabel={`Confirm exact identity for ${candidate?.name ?? 'card'}`}
                      accessibilityHint={hasExactSellerIdentity
                        ? 'Confirms this exact language and printing before it can enter seller inventory.'
                        : 'Exact language and variant metadata are missing, so this card cannot be confirmed.'}
                    >
                      <Ionicons
                        name={sellerIdentityReviews[item.id] ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={sellerIdentityReviews[item.id] ? '#047857' : theme.colors.textSoft}
                      />
                      <Text style={[
                        styles.identityReviewText,
                        { color: sellerIdentityReviews[item.id] ? '#047857' : theme.colors.text },
                      ]}>
                        {sellerIdentityReviews[item.id] ? 'Exact identity checked' : 'Confirm exact identity'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.conditionReview}>
                      <Text style={[styles.conditionLabel, { color: theme.colors.text }]}>Condition</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.conditionRow}
                      >
                        {RAW_SELLER_SWEEP_CONDITIONS.map((condition) => {
                          const selected = sellerConditions[item.id] === condition;
                          return (
                            <TouchableOpacity
                              key={condition}
                              onPress={() => chooseSellerCondition(item.id, condition)}
                              disabled={sellerReviewLocked}
                              style={[
                                styles.conditionChip,
                                {
                                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                                  backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                },
                                sellerReviewLocked && styles.disabled,
                                MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.conditionChip[1],
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected, disabled: sellerReviewLocked }}
                              accessibilityLabel={`Set ${candidate?.name ?? 'card'} condition to ${condition}`}
                            >
                              <Text style={[styles.conditionChipText, { color: selected ? '#FFFFFF' : theme.colors.text }]}>
                                {condition}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                ) : null}

                <View style={styles.itemActions}>
                  {item.candidates.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => refresh(selectSweepScanCandidate(
                        session.scanSessionId,
                        item.id,
                        (item.selectedCandidateIndex + 1) % item.candidates.length
                      ), item.id)}
                      disabled={isSellerMode && sellerReviewLocked}
                      style={[styles.iconAction, { borderColor: theme.colors.border }, isSellerMode && sellerReviewLocked && styles.disabled, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.iconAction[1]]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isSellerMode && sellerReviewLocked }}
                      accessibilityLabel={`Show next possible match for ${candidate?.name ?? 'this scan'}`}
                    >
                      <Ionicons name="swap-horizontal" size={18} color={theme.colors.primary} />
                    </TouchableOpacity>
                  ) : null}

                  {item.status === 'review' && candidate ? (
                    <TouchableOpacity
                      onPress={() => refresh(confirmSweepScanItem(session.scanSessionId, item.id))}
                      disabled={isSellerMode && sellerReviewLocked}
                      style={[styles.confirmButton, { backgroundColor: theme.colors.primary }, isSellerMode && sellerReviewLocked && styles.disabled, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.confirmButton[1]]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isSellerMode && sellerReviewLocked }}
                      accessibilityLabel={`Confirm ${candidate.name}`}
                    >
                      <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                      <Text style={styles.confirmText}>Confirm</Text>
                    </TouchableOpacity>
                  ) : null}

                  {item.status !== 'unresolved' ? (
                    <View style={[styles.quantityStepper, { borderColor: theme.colors.border }]}>
                      <TouchableOpacity
                        onPress={() => refresh(setSweepScanItemQuantity(session.scanSessionId, item.id, item.quantity - 1))}
                        disabled={isSellerMode && sellerReviewLocked}
                        style={[styles.stepButton, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.quantityStepButton[1]]}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSellerMode && sellerReviewLocked }}
                        accessibilityLabel={`Decrease ${candidate?.name ?? 'card'} quantity, currently ${item.quantity}`}
                      >
                        <Ionicons name="remove" size={17} color={theme.colors.text} />
                      </TouchableOpacity>
                      <Text
                        style={[styles.quantityText, { color: theme.colors.text }]}
                        accessibilityLabel={`${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}`}
                      >
                        {item.quantity}
                      </Text>
                      <TouchableOpacity
                        onPress={() => refresh(setSweepScanItemQuantity(session.scanSessionId, item.id, item.quantity + 1))}
                        disabled={isSellerMode && sellerReviewLocked}
                        style={[styles.stepButton, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.quantityStepButton[1]]}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSellerMode && sellerReviewLocked }}
                        accessibilityLabel={`Increase ${candidate?.name ?? 'card'} quantity, currently ${item.quantity}`}
                      >
                        <Ionicons name="add" size={17} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => refresh(removeSweepScanItem(session.scanSessionId, item.id))}
                    disabled={isSellerMode && sellerReviewLocked}
                    style={[styles.iconAction, { borderColor: theme.colors.border }, isSellerMode && sellerReviewLocked && styles.disabled, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.iconAction[1]]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSellerMode && sellerReviewLocked }}
                    accessibilityLabel={`Remove ${candidate?.name ?? 'unresolved card'} from this scan batch`}
                  >
                    <Ionicons name="trash-outline" size={17} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        {!session.items.length ? (
          <View style={styles.emptyState}>
            <Ionicons name="camera-outline" size={34} color={theme.colors.textSoft} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No cards in this batch</Text>
            <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>Return to the camera and sweep over your cards.</Text>
          </View>
        ) : null}

        {isSellerMode && sellerProposal ? (
          <View style={[styles.handoffCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.handoffTitleRow}>
              <Ionicons name="document-text-outline" size={23} color="#10B981" />
              <View style={styles.handoffTitleCopy}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  {sellerCommittedResult
                    ? 'Seller batch saved'
                    : sellerNeedsReconciliation
                      ? 'Seller batch needs verification'
                      : 'Atomic batch plan ready'}
                </Text>
                <Text style={[styles.sellerGateText, { color: theme.colors.textSoft }]}>
                  {sellerProposalCopies} copies, {sellerProposal.movements.length} reviewed movements
                </Text>
              </View>
            </View>
            <Text style={[styles.handoffWarning, { color: theme.colors.textSoft }]}>
              {sellerCommittedResult
                ? 'The server receipt succeeded and the fresh live inventory exactly matched this reviewed proposal. This scan cannot be submitted twice.'
                : sellerNeedsReconciliation
                  ? 'Do not prepare another request. Verification safely reuses this exact request ID and payload.'
                  : 'Nothing changes until Save atomically succeeds. A recovery record is written first so a lost connection cannot create a duplicate retry.'}
            </Text>
            <TouchableOpacity
              onPress={exportSellerBatch}
              style={[styles.exportButton, { borderColor: theme.colors.primary }, MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.exportButton[1]]}
              accessibilityRole="button"
              accessibilityLabel="Export seller batch JSON"
            >
              <Ionicons name="share-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.exportButtonText, { color: theme.colors.primary }]}>Export redacted summary</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={commitSellerBatch}
              disabled={sellerUx.commitAction.disabled}
              style={[
                styles.commitDisabledButton,
                {
                  borderColor: sellerCommittedResult ? '#10B981' : theme.colors.primary,
                  backgroundColor: sellerCommittedResult ? '#D1FAE5' : theme.colors.primary,
                },
                sellerUx.commitAction.disabled && !sellerCommittedResult && styles.disabled,
                MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.commitButton[1],
              ]}
              accessibilityRole="button"
              accessibilityState={{
                disabled: sellerUx.commitAction.disabled,
                busy: sellerUx.commitAction.busy,
              }}
              accessibilityLabel={sellerUx.commitAction.label}
              accessibilityHint={sellerUx.commitAction.hint}
            >
              {sellerCommitting || sellerJournalRestoring || sellerJournalUnchecked
                ? <ActivityIndicator color="#FFFFFF" />
                : <Ionicons
                    name={sellerCommittedResult ? 'checkmark-circle' : sellerNeedsReconciliation ? 'refresh-circle-outline' : 'shield-checkmark-outline'}
                    size={18}
                    color={sellerCommittedResult ? '#047857' : '#FFFFFF'}
                  />}
              <Text style={[styles.commitDisabledText, { color: sellerCommittedResult ? '#047857' : '#FFFFFF' }]}>
                {sellerUx.commitAction.label}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderColor: theme.colors.border, backgroundColor: theme.colors.bg }]}>
        {isSellerMode ? (
          <>
            <TouchableOpacity
              onPress={prepareSellerBatch}
              disabled={sellerUx.prepareAction.disabled}
              style={[
                styles.saveButton,
                { backgroundColor: theme.colors.primary },
                sellerUx.prepareAction.disabled && styles.disabled,
                MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.prepareButton[1],
              ]}
              accessibilityRole="button"
              accessibilityState={{
                disabled: sellerUx.prepareAction.disabled,
                busy: sellerUx.prepareAction.busy,
              }}
              accessibilityLabel={sellerUx.prepareAction.label}
              accessibilityHint={sellerUx.prepareAction.hint}
            >
              {sellerPreparing
                ? <ActivityIndicator color="#FFFFFF" />
                : <Ionicons name={sellerProposal ? 'checkmark-circle-outline' : 'documents-outline'} size={21} color="#FFFFFF" />}
              <Text style={styles.saveText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {sellerUx.prepareAction.label}
              </Text>
            </TouchableOpacity>
            <Text
              style={[styles.reviewReminder, { color: theme.colors.textSoft }]}
              numberOfLines={2}
              accessibilityLiveRegion="polite"
            >
              {sellerJournalError
                ? sellerJournalError
                : sellerCommittedResult
                  ? 'Saved atomically and verified against live inventory.'
                  : sellerNeedsReconciliation
                    ? 'Use Verify saved batch above. Do not create a new request.'
                    : sellerProposal
                      ? 'Plan ready. Save atomically above or export the redacted summary.'
                : sellerReviewIssues.length
                  ? `${sellerReviewIssues.length} check${sellerReviewIssues.length === 1 ? '' : 's'} remaining: ${sellerReviewIssues[0].message}`
                  : 'All exact identities and conditions are ready to plan.'}
            </Text>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={saveConfirmed}
              disabled={saving || collectionSaveReconciliationRequired || !selectedBinderId || !confirmedItems.length}
              style={[
                styles.saveButton,
                { backgroundColor: theme.colors.primary },
                (saving || collectionSaveReconciliationRequired || !selectedBinderId || !confirmedItems.length) && styles.disabled,
                MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.prepareButton[1],
              ]}
              accessibilityRole="button"
              accessibilityState={{
                disabled: saving || collectionSaveReconciliationRequired || !selectedBinderId || !confirmedItems.length,
                busy: saving,
              }}
              accessibilityLabel={`Add ${summary.confirmedCopies} confirmed cards to collection`}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="albums-outline" size={21} color="#FFFFFF" />}
              <Text style={styles.saveText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {saving
                  ? 'Adding cards...'
                  : collectionSaveReconciliationRequired
                    ? 'Verify binder before retrying'
                    : `Add ${summary.confirmedCopies} to collection`}
              </Text>
            </TouchableOpacity>
            {summary.reviewItems + summary.unresolvedItems > 0 ? (
              <Text style={[styles.reviewReminder, { color: theme.colors.textSoft }]}>
                {summary.reviewItems + summary.unresolvedItems} scan{summary.reviewItems + summary.unresolvedItems === 1 ? '' : 's'} still need checking
              </Text>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBackButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.headerBackButton[0],
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  scanMoreButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.scanMoreButton[0],
    minWidth: 72,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  scanMoreText: { fontSize: 14, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  sellerContent: { paddingBottom: 170 },
  summaryBand: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryMetric: { flex: 1, alignItems: 'center' },
  summaryNumber: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 40 },
  sectionHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionMeta: { fontSize: 12 },
  binderRow: { gap: 8, paddingRight: 12 },
  binderChip: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.binderChip[0],
    maxWidth: 220,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  binderDot: { width: 10, height: 10, borderRadius: 5 },
  binderChipText: { maxWidth: 150, fontSize: 13, fontWeight: '700' },
  sellerGateCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sellerGateCopy: { flex: 1, minWidth: 0 },
  sellerGateText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  resultRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    gap: 12,
  },
  cardImage: { width: 72, height: 100, borderRadius: 6, backgroundColor: 'rgba(128,128,128,0.08)' },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  resultBody: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
  resultTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  resultTitleCopy: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '800' },
  cardMeta: { fontSize: 12, marginTop: 3 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  confidenceText: { fontSize: 11, marginTop: 5 },
  exactIdentityText: { fontSize: 10, marginTop: 2, fontWeight: '700' },
  sellerItemReview: { marginTop: 8, gap: 8 },
  identityReviewButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.identityReviewButton[0],
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  identityReviewText: { fontSize: 11, fontWeight: '800' },
  conditionReview: { marginTop: 8, gap: 5 },
  conditionLabel: { fontSize: 11, fontWeight: '800' },
  conditionRow: { gap: 6, paddingRight: 8 },
  conditionChip: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.conditionChip[0],
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionChipText: { fontSize: 10, fontWeight: '800' },
  itemActions: {
    marginTop: 8,
    minHeight: MOBILE_UX_MIN_TOUCH_TARGET,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  iconAction: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.iconAction[0],
    borderWidth: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.confirmButton[0],
    paddingHorizontal: 10,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  quantityStepper: {
    minHeight: MOBILE_UX_MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.quantityStepButton[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: { minWidth: 20, textAlign: 'center', fontSize: 13, fontWeight: '800' },
  emptyState: { paddingVertical: 56, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  handoffCard: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 10 },
  handoffTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  handoffTitleCopy: { flex: 1, minWidth: 0 },
  handoffWarning: { fontSize: 12, lineHeight: 17 },
  exportButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.exportButton[0],
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  exportButtonText: { fontSize: 13, fontWeight: '900' },
  commitDisabledButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.commitButton[0],
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  commitDisabledText: { fontSize: 12, fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  saveButton: {
    ...MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS.sellerSweep.prepareButton[0],
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  reviewReminder: { marginTop: 7, fontSize: 11, textAlign: 'center' },
  disabled: { opacity: 0.45 },
});
