import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackButton } from '../../components/StackrBackButton';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import {
  benchmarkNativeCardFrameAnalyserFixtures,
  getCardVisionRuntimeInfo,
  runNativeCardFrameAnalyserFixtureTests,
  runOnnxRuntimeControlledSessionCheck,
  type CardFrameAnalyserBenchmarkReport,
  type CardFrameAnalyserFixtureTestReport,
  type OnnxRuntimeSessionHealthCheck,
  type StackrCardVisionRuntimeInfo,
} from '../../lib/stackrCardVision';

function formatValue(value: unknown) {
  if (value == null || value === '') return '--';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function MetricRow({ label, value }: { label: string; value: unknown }) {
  const { theme } = useTheme();

  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', flex: 1 }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', flex: 1.2, textAlign: 'right' }}>
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
      marginBottom: 14,
    }}>
      <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function CardVisionDiagnosticsScreen() {
  const { theme } = useTheme();
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const [runtimeInfo, setRuntimeInfo] = useState<StackrCardVisionRuntimeInfo | null>(null);
  const [onnxSession, setOnnxSession] = useState<OnnxRuntimeSessionHealthCheck | null>(null);
  const [analyserFixtures, setAnalyserFixtures] = useState<CardFrameAnalyserFixtureTestReport | null>(null);
  const [analyserBenchmark, setAnalyserBenchmark] = useState<CardFrameAnalyserBenchmarkReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setRuntimeInfo(getCardVisionRuntimeInfo());
      setOnnxSession(await runOnnxRuntimeControlledSessionCheck());
      setAnalyserFixtures(runNativeCardFrameAnalyserFixtureTests());
      setAnalyserBenchmark(benchmarkNativeCardFrameAnalyserFixtures(120));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isDev) void refresh();
  }, [isDev]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
              Card vision runtime
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
              Development-only native recognition foundation check.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void refresh()}
            disabled={!isDev || refreshing}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              opacity: !isDev || refreshing ? 0.55 : 1,
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
              Card vision diagnostics are hidden outside development builds.
            </Text>
          </Section>
        ) : (
          <>
            <Section title="Native Module">
              <MetricRow label="Platform" value={runtimeInfo?.platform} />
              <MetricRow label="Module version" value={runtimeInfo?.moduleVersion} />
              <MetricRow label="ONNX Runtime" value={runtimeInfo?.onnxRuntimeAvailable} />
              <MetricRow label="Camera frame access" value={runtimeInfo?.cameraFrameAccessAvailable} />
              <MetricRow label="Native image processing" value={runtimeInfo?.nativeImageProcessingAvailable} />
              <MetricRow label="OpenCV" value={runtimeInfo?.opencvAvailable} />
              <MetricRow label="OpenCV version" value={runtimeInfo?.opencvVersion} />
              <MetricRow label="Error" value={runtimeInfo?.error} />
            </Section>

            <Section title="Native Details">
              <MetricRow label="ONNX detail" value={runtimeInfo?.onnxRuntimeDetail} />
              <MetricRow label="Frame detail" value={runtimeInfo?.cameraFrameAccessDetail} />
              <MetricRow label="Image detail" value={runtimeInfo?.nativeImageProcessingDetail} />
            </Section>

            <Section title="ONNX Session">
              <MetricRow label="Status" value={onnxSession?.status} />
              <MetricRow label="Duration" value={onnxSession ? `${onnxSession.durationMs}ms` : null} />
              <MetricRow label="Model URI" value={onnxSession?.modelUri} />
              <MetricRow label="Message" value={onnxSession?.message} />
            </Section>

            <Section title="Frame Analyser Fixtures">
              <MetricRow label="Status" value={analyserFixtures?.status} />
              <MetricRow label="Config version" value={analyserFixtures?.configVersion} />
              <MetricRow label="Fixtures" value={analyserFixtures?.fixtureCount} />
              <MetricRow label="Passed" value={analyserFixtures?.passedCount} />
              <MetricRow label="Failed" value={analyserFixtures?.failedCount} />
              <MetricRow label="Message" value={analyserFixtures?.message} />
            </Section>

            <Section title="Frame Analyser Benchmark">
              <MetricRow label="Status" value={analyserBenchmark?.status} />
              <MetricRow label="Config version" value={analyserBenchmark?.configVersion} />
              <MetricRow label="Fixtures" value={analyserBenchmark?.fixtureCount} />
              <MetricRow label="Median" value={analyserBenchmark ? `${analyserBenchmark.medianMs}ms` : null} />
              <MetricRow label="P95" value={analyserBenchmark ? `${analyserBenchmark.p95Ms}ms` : null} />
              <MetricRow label="Max" value={analyserBenchmark ? `${analyserBenchmark.maxMs}ms` : null} />
              <MetricRow label="Message" value={analyserBenchmark?.message} />
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
