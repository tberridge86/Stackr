import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { getCardRectificationRecord } from '../../lib/cardRectificationStore';
import {
  buildLocalOnDeviceComparisonSnapshot,
  runLocalOnDeviceV1Inference,
  type LocalOnDeviceComparisonSnapshot,
} from '../../lib/recognition/localOnDeviceInference';
import { createRecognitionRequest } from '../../lib/recognition/orchestratorCore';

function formatValue(value: unknown) {
  if (value == null || value === '') return '--';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function MetricRow({ label, value }: { label: string; value: unknown }) {
  const { theme } = useTheme();

  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', flex: 1 }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', flex: 1.35, textAlign: 'right' }}>
        {formatValue(value)}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginTop: 14,
    }}>
      <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function LocalInferenceComparisonScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const record = useMemo(
    () => getCardRectificationRecord(typeof params.scanId === 'string' ? params.scanId : null),
    [params.scanId]
  );
  const recognitionCrop = record?.result?.recognitionCrop ?? null;
  const [snapshot, setSnapshot] = useState<LocalOnDeviceComparisonSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDev || !recognitionCrop?.uri) return;
    setRefreshing(true);
    try {
      const request = createRecognitionRequest({
        anonymousScanId: record?.scanId ? `local-inference-${record.scanId}` : undefined,
        cards: [{
          id: `${record?.scanId ?? 'latest'}:recognition-crop`,
          uri: recognitionCrop.uri,
          width: recognitionCrop.width,
          height: recognitionCrop.height,
          sourceRole: recognitionCrop.role,
        }],
      });
      const result = await runLocalOnDeviceV1Inference(request);
      setSnapshot(buildLocalOnDeviceComparisonSnapshot(result));
    } finally {
      setRefreshing(false);
    }
  }, [isDev, recognitionCrop, record?.scanId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
              Local inference
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
              Development-only on-device recognition comparison.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void refresh()}
            disabled={!isDev || refreshing || !recognitionCrop?.uri}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: !isDev || refreshing || !recognitionCrop?.uri ? 0.55 : 1,
            }}
          >
            {refreshing ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={theme.colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {!isDev ? (
          <Section title="Unavailable">
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Local inference comparison is hidden outside development builds.
            </Text>
          </Section>
        ) : !recognitionCrop ? (
          <Section title="No Scan Image">
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Capture and rectify a card first, then return to this screen.
            </Text>
          </Section>
        ) : (
          <>
            <View style={{
              width: '100%',
              aspectRatio: recognitionCrop.width / Math.max(1, recognitionCrop.height),
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}>
              <Image source={{ uri: recognitionCrop.uri }} style={{ width: '100%', height: '100%' }} resizeMode="stretch" />
            </View>

            <Section title="Versions">
              <MetricRow label="Status" value={snapshot?.status} />
              <MetricRow label="Model" value={snapshot?.modelVersion} />
              <MetricRow label="Catalogue" value={snapshot?.catalogueVersion} />
              <MetricRow label="Message" value={snapshot?.message} />
            </Section>

            <Section title="Timings">
              <MetricRow label="Rectification" value={snapshot?.timings.rectificationMs == null ? null : `${snapshot.timings.rectificationMs}ms`} />
              <MetricRow label="Preprocessing" value={snapshot?.timings.preprocessingMs == null ? null : `${snapshot.timings.preprocessingMs}ms`} />
              <MetricRow label="Model load" value={snapshot?.timings.modelLoadMs == null ? null : `${snapshot.timings.modelLoadMs}ms`} />
              <MetricRow label="Warmup" value={snapshot?.timings.warmupMs == null ? null : `${snapshot.timings.warmupMs}ms`} />
              <MetricRow label="Inference" value={snapshot?.timings.inferenceMs == null ? null : `${snapshot.timings.inferenceMs}ms`} />
              <MetricRow label="Search" value={snapshot?.timings.searchMs == null ? null : `${snapshot.timings.searchMs}ms`} />
              <MetricRow label="Total" value={snapshot ? `${snapshot.timings.totalMs}ms` : null} />
            </Section>

            <Section title="Top Candidates">
              {snapshot?.topCandidates.length ? snapshot.topCandidates.map((candidate) => (
                <MetricRow
                  key={`${candidate.rank}:${candidate.canonicalCardId}`}
                  label={`#${candidate.rank}`}
                  value={`${candidate.canonicalCardId} · ${candidate.similarity.toFixed(4)}`}
                />
              )) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
                  No local candidates are available.
                </Text>
              )}
            </Section>

            <Section title="OCR Evidence">
              <MetricRow label="Language" value={snapshot?.ocrEvidence?.language} />
              <MetricRow label="Name hint" value={snapshot?.ocrEvidence?.nameHint} />
              <MetricRow label="Set" value={snapshot?.ocrEvidence?.setId ?? snapshot?.ocrEvidence?.setCode} />
              <MetricRow label="Printed number" value={snapshot?.ocrEvidence?.printedNumber?.raw ?? snapshot?.ocrEvidence?.printedNumber?.number} />
              <MetricRow label="Warnings" value={snapshot?.ocrEvidence?.warnings} />
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
