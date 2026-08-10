import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import { RECOGNITION_FEEDBACK_API_URL } from '../../lib/config';
import { supabase } from '../../lib/supabase';

type FeedbackRow = {
  id: string;
  created_at: string;
  anonymous_scan_id: string;
  feedback_action: string;
  predicted_identity: Record<string, any> | null;
  corrected_identity: Record<string, any> | null;
  reviewed_identity: Record<string, any> | null;
  review_status: string;
  user_label_status: string;
  image_upload_status: string;
  top_candidate_scores: Record<string, any>[];
  capture_quality: Record<string, any> | null;
  ocr_evidence_summary: Record<string, any> | null;
  model_version: string | null;
  catalogue_version: string | null;
  device_class: string | null;
  physical_card_session_id: string | null;
  rectified_image_storage_path: string | null;
  reviewer_notes: string | null;
};

type IdentityFields = {
  stackrCardId: string;
  cardName: string;
  setId: string;
  collectorNumber: string;
  language: string;
  variant: string;
};

const emptyIdentity: IdentityFields = {
  stackrCardId: '',
  cardName: '',
  setId: '',
  collectorNumber: '',
  language: '',
  variant: '',
};

function identityToFields(identity?: Record<string, any> | null): IdentityFields {
  return {
    stackrCardId: String(identity?.stackrCardId ?? ''),
    cardName: String(identity?.cardName ?? ''),
    setId: String(identity?.setId ?? ''),
    collectorNumber: String(identity?.collectorNumber ?? ''),
    language: String(identity?.language ?? ''),
    variant: String(identity?.variant ?? ''),
  };
}

function fieldsToIdentity(fields: IdentityFields) {
  return {
    stackrCardId: fields.stackrCardId.trim() || null,
    cardName: fields.cardName.trim() || null,
    setId: fields.setId.trim() || null,
    collectorNumber: fields.collectorNumber.trim() || null,
    language: fields.language.trim().toLowerCase() || null,
    variant: fields.variant.trim() || null,
  };
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={theme.colors.textSoft}
        style={{
          minHeight: 42,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          color: theme.colors.text,
          paddingHorizontal: 12,
          fontSize: 13,
          fontWeight: '800',
        }}
      />
    </View>
  );
}

function identityTitle(identity?: Record<string, any> | null) {
  return String(identity?.cardName ?? identity?.stackrCardId ?? 'Unlabelled card');
}

function identitySubtitle(identity?: Record<string, any> | null) {
  return [
    identity?.setId,
    identity?.collectorNumber ? `No. ${identity.collectorNumber}` : null,
    identity?.language,
    identity?.variant,
  ].filter(Boolean).join(' - ') || 'No identity detail';
}

export default function RecognitionFeedbackReviewScreen() {
  const { theme } = useTheme();
  const { profile, loading: profileLoading } = useProfile();
  const isAdmin = profile?.role === 'admin';
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [identityFields, setIdentityFields] = useState<IdentityFields>(emptyIdentity);
  const [physicalCardSessionId, setPhysicalCardSessionId] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );

  async function authHeader() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in is required.');
    return `Bearer ${token}`;
  }

  const loadQueue = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const authorization = await authHeader();
      const response = await fetch(`${RECOGNITION_FEEDBACK_API_URL}/review-queue?limit=50`, {
        headers: { Authorization: authorization },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Could not load recognition feedback.');
      setItems(payload.items ?? []);
      setSelectedId((current) => current ?? payload.items?.[0]?.id ?? null);
    } catch (error: any) {
      Alert.alert('Review queue unavailable', error?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedItem) {
      setIdentityFields(emptyIdentity);
      setPhysicalCardSessionId('');
      setReviewerNotes('');
      return;
    }
    setIdentityFields(identityToFields(selectedItem.corrected_identity ?? selectedItem.predicted_identity));
    setPhysicalCardSessionId(selectedItem.physical_card_session_id ?? '');
    setReviewerNotes(selectedItem.reviewer_notes ?? '');
  }, [selectedItem]);

  async function submitDecision(decision: string) {
    if (!selectedItem) return;
    try {
      setSaving(true);
      const authorization = await authHeader();
      const response = await fetch(`${RECOGNITION_FEEDBACK_API_URL}/review-queue/${encodeURIComponent(selectedItem.id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: {
            decision,
            reviewedIdentity: fieldsToIdentity(identityFields),
            physicalCardSessionId,
            reviewerNotes,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Could not save review decision.');
      setItems((current) => current.filter((item) => item.id !== selectedItem.id));
      setSelectedId(null);
    } catch (error: any) {
      Alert.alert('Decision not saved', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
              Recognition feedback
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              Internal review before any correction enters training data.
            </Text>
          </View>
          <TouchableOpacity
            onPress={loadQueue}
            disabled={loading || !isAdmin}
            accessibilityRole="button"
            accessibilityLabel="Refresh recognition feedback queue"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="refresh" size={20} color={theme.colors.primary} />}
          </TouchableOpacity>
        </View>

        {profileLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : !isAdmin ? (
          <View style={{ borderRadius: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Admin only</Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 6 }}>
              Your profile needs the admin role to review recognition feedback.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ gap: 10, marginBottom: 16 }}>
              {items.map((item) => {
                const selected = selectedItem?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedId(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Review ${item.feedback_action} feedback`}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? `${theme.colors.primary}12` : theme.colors.card,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
                      {identityTitle(item.corrected_identity ?? item.predicted_identity)}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 3 }}>
                      {item.feedback_action} - {item.image_upload_status} - {item.created_at.slice(0, 10)}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                      {identitySubtitle(item.corrected_identity ?? item.predicted_identity)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {!loading && items.length === 0 ? (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                  No queued recognition feedback.
                </Text>
              ) : null}
            </View>

            {selectedItem ? (
              <View style={{ borderRadius: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 12 }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                  Review decision
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17 }}>
                  Approve only when the rectified card image, candidate evidence and label agree.
                </Text>
                <Field label="Stackr card ID" value={identityFields.stackrCardId} onChangeText={(value) => setIdentityFields((current) => ({ ...current, stackrCardId: value }))} />
                <Field label="Card name" value={identityFields.cardName} onChangeText={(value) => setIdentityFields((current) => ({ ...current, cardName: value }))} />
                <Field label="Set ID" value={identityFields.setId} onChangeText={(value) => setIdentityFields((current) => ({ ...current, setId: value }))} />
                <Field label="Collector number" value={identityFields.collectorNumber} onChangeText={(value) => setIdentityFields((current) => ({ ...current, collectorNumber: value }))} />
                <Field label="Language" value={identityFields.language} onChangeText={(value) => setIdentityFields((current) => ({ ...current, language: value }))} />
                <Field label="Variant" value={identityFields.variant} onChangeText={(value) => setIdentityFields((current) => ({ ...current, variant: value }))} />
                <Field label="Physical card session" value={physicalCardSessionId} onChangeText={setPhysicalCardSessionId} />
                <Field label="Reviewer notes" value={reviewerNotes} onChangeText={setReviewerNotes} />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    ['approve_identity', 'Approve identity'],
                    ['change_identity', 'Change identity'],
                    ['mark_ambiguous', 'Ambiguous'],
                    ['reject_poor_image', 'Poor image'],
                    ['group_physical_card', 'Group card'],
                  ].map(([decision, label]) => (
                    <TouchableOpacity
                      key={decision}
                      onPress={() => submitDecision(decision)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      style={{
                        minHeight: 42,
                        minWidth: 130,
                        flexGrow: 1,
                        borderRadius: 12,
                        backgroundColor: decision === 'approve_identity' ? theme.colors.primary : theme.colors.surface,
                        borderWidth: decision === 'approve_identity' ? 0 : 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 12,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: decision === 'approve_identity' ? '#FFFFFF' : theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 16 }}>
                  Export approved examples with `npm run export:recognition-feedback-dataset`. The export creates a candidate dataset manifest only; it does not deploy a model.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
