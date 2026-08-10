import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import type { BinderPagePocketResult, BinderPocketStatus } from '../../lib/binderPageScan';
import { getBinderPageScanSession, updateBinderPageScanSession } from '../../lib/binderPageScanStore';
import { fetchBinders, invalidateBinderCaches, type BinderRecord } from '../../lib/binders';
import { logScanLearningEvent } from '../../lib/scanLearning';
import { getScannerClientContext } from '../../lib/scannerClientContext';
import {
  buildScannerAnalyticsMetadata,
  getScannerFeatureFlags,
} from '../../lib/scannerAnalytics';
import { supabase } from '../../lib/supabase';

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
  const session = useMemo(() => getBinderPageScanSession(scanSessionId), [scanSessionId]);
  const [pockets, setPockets] = useState<BinderPagePocketResult[]>(session?.pockets ?? []);
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(
    typeof params.binderId === 'string' ? params.binderId : session?.binderId ?? null
  );
  const [destinationPage, setDestinationPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [selectedPocketIndex, setSelectedPocketIndex] = useState<number | null>(null);
  const scannerClientContext = useMemo(() => getScannerClientContext(), []);
  const scannerFeatureFlags = useMemo(() => getScannerFeatureFlags(), []);

  useEffect(() => {
    fetchBinders()
      .then((rows) => {
        setBinders(rows);
        if (!selectedBinderId && rows[0]?.id) setSelectedBinderId(rows[0].id);
      })
      .catch((error) => {
        console.log('Binder page result binders failed:', error);
      });
  }, [selectedBinderId]);

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

  const updatePockets = (updater: (current: BinderPagePocketResult[]) => BinderPagePocketResult[]) => {
    setPockets((current) => {
      const next = updater(current);
      if (scanSessionId) {
        updateBinderPageScanSession(scanSessionId, (stored) => ({
          ...stored,
          pockets: next,
        }));
      }
      return next;
    });
  };

  const updatePocket = (index: number, patch: Partial<BinderPagePocketResult>) => {
    updatePockets((current) => current.map((pocket) => (
      pocket.index === index ? { ...pocket, ...patch } : pocket
    )));
  };

  const cycleCandidate = (direction: 1 | -1) => {
    if (!selectedPocket || selectedPocket.candidates.length < 2) return;
    const nextIndex = (
      selectedPocket.selectedCandidateIndex + direction + selectedPocket.candidates.length
    ) % selectedPocket.candidates.length;
    updatePocket(selectedPocket.index, {
      selectedCandidateIndex: nextIndex,
      status: 'possible_match',
      source: 'manual',
    });
  };

  const confirmSelectedPocket = () => {
    if (!selectedPocket || !selectedCandidate) return;
    updatePocket(selectedPocket.index, {
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

  const markSelectedEmpty = () => {
    if (!selectedPocket) return;
    updatePocket(selectedPocket.index, {
      status: 'empty',
      selectedCandidateIndex: 0,
      candidates: [],
      source: 'manual',
      notes: [...selectedPocket.notes, 'user-marked-empty'],
    });
  };

  const rescanSelectedPocket = () => {
    if (!selectedPocket) return;
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
    if (!selectedBinderId) {
      Alert.alert('Choose a binder', 'Select the destination binder before saving the page.');
      return;
    }

    const confirmed = pockets
      .filter((pocket) => pocket.status === 'confirmed')
      .map((pocket) => ({ pocket, candidate: getSelectedCandidate(pocket) }))
      .filter((entry): entry is { pocket: BinderPagePocketResult; candidate: NonNullable<ReturnType<typeof getSelectedCandidate>> } => Boolean(entry.candidate));

    if (!confirmed.length) {
      Alert.alert('No confirmed pockets', 'Confirm at least one pocket before saving.');
      return;
    }

    setSaving(true);
    try {
      const databaseStartedAt = Date.now();
      const { data: existingRows, error: existingError } = await supabase
        .from('binder_cards')
        .select('card_id, set_id')
        .eq('binder_id', selectedBinderId);
      if (existingError) throw existingError;

      const existingKeys = new Set((existingRows ?? []).map((row: any) => `${row.set_id}:${row.card_id}`));
      const newEntries = confirmed.filter(({ candidate }) => !existingKeys.has(`${candidate.set_id}:${candidate.id}`));

      if (!newEntries.length) {
        if (scanSessionId) {
          await logScanLearningEvent({
            scanSessionId,
            eventType: 'duplicate_prevented',
            scanMode: 'manual',
            routeContext: {
              screen: 'binder-page-result',
              intent: 'binder_page',
              binderId: selectedBinderId,
              layout: gridLayout,
              confirmedCount: confirmed.length,
              skippedDuplicateCount: confirmed.length,
              statuses: countPocketStatuses(pockets),
              analytics: buildBinderPageAnalytics(Date.now() - databaseStartedAt, {
                duplicatePrevention: true,
              }),
            },
            candidates: buildPocketLearningCandidates(pockets),
            outcome: 'all_confirmed_cards_already_saved',
          });
        }
        Alert.alert('Already in binder', 'All confirmed cards already exist in this binder.');
        return;
      }

      const rows = newEntries.map(({ pocket, candidate }) => ({
        binder_id: selectedBinderId,
        card_id: candidate.id,
        set_id: candidate.set_id,
        owned: true,
        owned_quantity: 1,
        notes: `Binder page ${destinationPage}, pocket ${pocket.row + 1}-${pocket.column + 1}`,
        card_name: candidate.name,
        card_number: candidate.number ?? null,
        image_url: candidate.image_small ?? candidate.image_large ?? null,
        set_name: candidate.set_name ?? null,
        slot_order: (destinationPage - 1) * 25 + pocket.index,
      }));

      const { error } = await supabase
        .from('binder_cards')
        .upsert(rows, {
          onConflict: 'binder_id,card_id',
          ignoreDuplicates: false,
        });
      if (error) throw error;

      const databaseSaveMs = Date.now() - databaseStartedAt;
      const duplicateCount = confirmed.length - newEntries.length;
      if (scanSessionId && duplicateCount > 0) {
        await logScanLearningEvent({
          scanSessionId,
          eventType: 'duplicate_prevented',
          scanMode: 'manual',
          routeContext: {
            screen: 'binder-page-result',
            intent: 'binder_page',
            binderId: selectedBinderId,
            layout: gridLayout,
            confirmedCount: confirmed.length,
            savedCount: rows.length,
            skippedDuplicateCount: duplicateCount,
            statuses: countPocketStatuses(pockets),
            analytics: buildBinderPageAnalytics(databaseSaveMs, {
              duplicatePrevention: true,
            }),
          },
          candidates: buildPocketLearningCandidates(pockets),
          outcome: 'some_confirmed_cards_already_saved',
        });
      }

      if (scanSessionId) {
        await logScanLearningEvent({
          scanSessionId,
          eventType: 'added_to_binder',
          scanMode: 'manual',
          routeContext: {
            screen: 'binder-page-result',
            intent: 'binder_page',
            binderId: selectedBinderId,
            layout: gridLayout,
            confirmedCount: confirmed.length,
            savedCount: rows.length,
            skippedDuplicateCount: duplicateCount,
            statuses: countPocketStatuses(pockets),
            analytics: buildBinderPageAnalytics(databaseSaveMs, {
              duplicatePrevention: duplicateCount > 0,
            }),
          },
          candidates: buildPocketLearningCandidates(pockets),
          outcome: 'binder_page_saved',
        });
      }

      invalidateBinderCaches(selectedBinderId);
      Alert.alert('Binder updated', `${rows.length} confirmed card${rows.length === 1 ? '' : 's'} saved.`, [
        {
          text: 'View binder',
          onPress: () => router.replace({
            pathname: '/binder/[id]',
            params: { id: selectedBinderId },
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
            binderId: selectedBinderId,
            layout: gridLayout,
            statuses: countPocketStatuses(pockets),
            analytics: buildBinderPageAnalytics(null, { errorCategory: 'database' }),
          },
          candidates: buildPocketLearningCandidates(pockets),
          outcome: 'save_failed',
          notes: error?.message ?? 'Could not save binder page.',
        });
      }
      Alert.alert('Could not save page', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Binder page</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>This scan session is no longer available.</Text>
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
          <StackrBackButton onPress={() => router.back()} />
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
                {binders.map((binder) => {
                  const active = selectedBinderId === binder.id;
                  return (
                    <TouchableOpacity
                      key={binder.id}
                      onPress={() => setSelectedBinderId(binder.id)}
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
                <TouchableOpacity onPress={() => setDestinationPage((page) => Math.max(1, page - 1))} style={[styles.stepperButton, { borderColor: theme.colors.border }]}>
                  <Ionicons name="remove" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.pageNumber, { color: theme.colors.text }]}>{destinationPage}</Text>
                <TouchableOpacity onPress={() => setDestinationPage((page) => Math.min(999, page + 1))} style={[styles.stepperButton, { borderColor: theme.colors.border }]}>
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
                onPress={() => setSelectedPocketIndex(pocket.index)}
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
                      <TouchableOpacity onPress={() => cycleCandidate(-1)} style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Prev</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => cycleCandidate(1)} style={[styles.smallButton, { borderColor: theme.colors.border }]}>
                        <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={confirmSelectedPocket} disabled={!selectedCandidate} style={[styles.actionButton, !selectedCandidate && styles.disabled, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.actionButtonText}>Confirm pocket</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={markSelectedEmpty} style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}>
                <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Mark empty</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={rescanSelectedPocket} style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}>
                <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Rescan pocket</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.replace({ pathname: '/(tabs)/search', params: selectedCandidate?.name ? { q: selectedCandidate.name } : undefined } as any)}
                style={[styles.actionButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 }]}
              >
                <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Tap to correct</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={saveConfirmed}
          disabled={saving}
          style={[styles.saveButton, { backgroundColor: theme.colors.primary, opacity: saving ? 0.65 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Confirm all high-confidence matches</Text>}
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
