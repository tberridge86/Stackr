import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import { SHADOW_MODE_PILOT_API_URL } from '../../lib/config';
import { supabase } from '../../lib/supabase';

type ShadowCandidate = {
  rank: number;
  canonicalCardId: string | null;
  cardName: string | null;
  setId: string | null;
  collectorNumber: string | null;
  language: string | null;
  variant: string | null;
  confidence: number | null;
  visualSimilarity: number | null;
};

type ShadowEngineResult = {
  outcome: string;
  engineId: string;
  topCandidates: ShadowCandidate[];
  confidence: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  modelVersion: string | null;
  catalogueVersion: string | null;
  timings?: Record<string, number | null>;
};

type ShadowModeRow = {
  id: string;
  created_at: string;
  anonymous_scan_id: string;
  visible_engine_result: ShadowEngineResult;
  local_engine_result: ShadowEngineResult;
  top_three_local_candidates: ShadowCandidate[];
  user_confirmed_identity: Record<string, any> | null;
  user_feedback_action: string | null;
  disagreement_category: string;
  review_status: string;
  reviewer_notes: string | null;
  capture_quality_failure_reasons: string[];
  device_class: string | null;
  timings: Record<string, any>;
};

const DISAGREEMENT_CATEGORIES = [
  'pending_manual_review',
  'current_provider_correct_local_wrong',
  'local_correct_current_provider_wrong',
  'both_wrong',
  'both_correct',
  'exact_identity_agreement_variant_disagreement',
  'language_disagreement',
  'catalogue_missing',
  'capture_quality_failure',
  'local_unavailable',
  'visible_unavailable',
];

function identityTitle(identity?: Record<string, any> | null) {
  return String(identity?.cardName ?? identity?.stackrCardId ?? 'Unconfirmed');
}

function candidateTitle(candidate?: ShadowCandidate | null) {
  return String(candidate?.cardName ?? candidate?.canonicalCardId ?? 'No candidate');
}

function candidateSubtitle(candidate?: ShadowCandidate | null) {
  if (!candidate) return 'No candidate evidence';
  return [
    candidate.setId,
    candidate.collectorNumber ? `No. ${candidate.collectorNumber}` : null,
    candidate.language,
    candidate.variant,
    candidate.confidence != null ? `${Math.round(candidate.confidence * 100)}%` : null,
  ].filter(Boolean).join(' - ');
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.primary : theme.colors.card,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: selected ? '#fff' : theme.colors.text, fontSize: 11, fontWeight: '900' }}>
        {label.replace(/_/g, ' ')}
      </Text>
    </TouchableOpacity>
  );
}

function CandidateRow({ candidate }: { candidate: ShadowCandidate }) {
  const { theme } = useTheme();
  return (
    <View style={{
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10,
      gap: 3,
      backgroundColor: theme.colors.card,
    }}>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
        #{candidate.rank} {candidateTitle(candidate)}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
        {candidateSubtitle(candidate)}
      </Text>
    </View>
  );
}

export default function ShadowModePilotDashboard() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { profile, loading: profileLoading } = useProfile();
  const isAdmin = profile?.role === 'admin';
  const [items, setItems] = useState<ShadowModeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'pending_review' | 'all'>('pending_review');
  const [category, setCategory] = useState('all');
  const [reviewCategory, setReviewCategory] = useState('pending_manual_review');
  const [notes, setNotes] = useState('');
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );
  const summary = useMemo(() => {
    const counts = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.disagreement_category] = (acc[item.disagreement_category] ?? 0) + 1;
      return acc;
    }, {});
    return counts;
  }, [items]);
  const compact = width < 760;

  async function authHeader() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in is required.');
    return `Bearer ${token}`;
  }

  const loadItems = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const authorization = await authHeader();
      const params = new URLSearchParams({
        status,
        limit: '80',
      });
      if (category !== 'all') params.set('category', category);
      const response = await fetch(`${SHADOW_MODE_PILOT_API_URL}/disagreements?${params.toString()}`, {
        headers: { Authorization: authorization },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Could not load shadow-mode pilot records.');
      setItems(payload.items ?? []);
      setSelectedId((current) => current ?? payload.items?.[0]?.id ?? null);
    } catch (error: any) {
      Alert.alert('Shadow pilot unavailable', error?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [category, isAdmin, status]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!selectedItem) {
      setReviewCategory('pending_manual_review');
      setNotes('');
      return;
    }
    setReviewCategory(selectedItem.disagreement_category);
    setNotes(selectedItem.reviewer_notes ?? '');
  }, [selectedItem]);

  async function saveReview(reviewStatus: 'reviewed' | 'ignored') {
    if (!selectedItem) return;
    try {
      setSaving(true);
      const authorization = await authHeader();
      const response = await fetch(`${SHADOW_MODE_PILOT_API_URL}/disagreements/${encodeURIComponent(selectedItem.id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewStatus,
          disagreementCategory: reviewCategory,
          reviewerNotes: notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Could not save review.');
      setItems((current) => current.filter((item) => item.id !== selectedItem.id));
      setSelectedId(null);
    } catch (error: any) {
      Alert.alert('Review not saved', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 20 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackButton onPress={() => router.back()} />
        <Text style={{ marginTop: 24, color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
          Internal access only
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 25, fontWeight: '900' }}>
              Shadow Pilot
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
              {items.length} records loaded
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void loadItems()}
            style={{ borderRadius: 999, backgroundColor: theme.colors.card, padding: 12 }}
            accessibilityLabel="Refresh shadow pilot records"
          >
            <Ionicons name="refresh" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <CategoryChip label="pending_review" selected={status === 'pending_review'} onPress={() => setStatus('pending_review')} />
          <CategoryChip label="all" selected={status === 'all'} onPress={() => setStatus('all')} />
          {DISAGREEMENT_CATEGORIES.map((entry) => (
            <CategoryChip
              key={entry}
              label={`${entry} ${summary[entry] ?? 0}`}
              selected={category === entry}
              onPress={() => setCategory(category === entry ? 'all' : entry)}
            />
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <View style={{ flexDirection: compact ? 'column' : 'row', gap: 12, alignItems: 'stretch' }}>
            <View style={{ width: compact ? '100%' : 230, gap: 8 }}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: item.id === selectedItem?.id ? theme.colors.primary : theme.colors.border,
                    backgroundColor: theme.colors.card,
                    padding: 12,
                    gap: 5,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                    {item.disagreement_category.replace(/_/g, ' ')}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                    {item.user_feedback_action ?? 'no action'} - {item.created_at.slice(0, 10)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              padding: 14,
              gap: 12,
            }}>
              {!selectedItem ? (
                <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>No record selected.</Text>
              ) : (
                <>
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                      {selectedItem.anonymous_scan_id}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                      {selectedItem.device_class ?? 'unknown device'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, gap: 7 }}>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>Visible result</Text>
                      <CandidateRow candidate={selectedItem.visible_engine_result.topCandidates?.[0] ?? {
                        rank: 1,
                        canonicalCardId: null,
                        cardName: selectedItem.visible_engine_result.errorCode ?? 'No candidate',
                        setId: null,
                        collectorNumber: null,
                        language: null,
                        variant: null,
                        confidence: null,
                        visualSimilarity: null,
                      }} />
                    </View>
                    <View style={{ flex: 1, gap: 7 }}>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>Confirmed by tester</Text>
                      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 10 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                          {identityTitle(selectedItem.user_confirmed_identity)}
                        </Text>
                        <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                          {selectedItem.user_feedback_action ?? 'no tester action'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: 7 }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>Local top three</Text>
                    {(selectedItem.top_three_local_candidates ?? []).length ? (
                      selectedItem.top_three_local_candidates.map((candidate) => (
                        <CandidateRow key={`${candidate.rank}:${candidate.canonicalCardId ?? candidate.cardName}`} candidate={candidate} />
                      ))
                    ) : (
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>
                        {selectedItem.local_engine_result.errorCode ?? 'No local candidates'}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DISAGREEMENT_CATEGORIES.map((entry) => (
                      <CategoryChip
                        key={entry}
                        label={entry}
                        selected={reviewCategory === entry}
                        onPress={() => setReviewCategory(entry)}
                      />
                    ))}
                  </View>

                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    placeholder="Reviewer notes"
                    placeholderTextColor={theme.colors.textSoft}
                    style={{
                      minHeight: 86,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      padding: 12,
                      color: theme.colors.text,
                      textAlignVertical: 'top',
                    }}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      disabled={saving}
                      onPress={() => void saveReview('reviewed')}
                      style={{ flex: 1, borderRadius: 14, backgroundColor: theme.colors.primary, padding: 13, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '900' }}>Mark reviewed</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={saving}
                      onPress={() => void saveReview('ignored')}
                      style={{ flex: 1, borderRadius: 14, backgroundColor: theme.colors.surface, padding: 13, alignItems: 'center' }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Ignore</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
