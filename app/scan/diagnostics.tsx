import React, { useMemo } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import { useTheme } from '../../components/theme-context';
import { getScanAttemptDiagnostics } from '../../lib/scanDiagnostics';

function formatValue(value: unknown) {
  if (value == null || value === '') return '--';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
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
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', flex: 1, textAlign: 'right' }}>
        {formatValue(value)}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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

export default function ScanDiagnosticsScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ scanSessionId?: string }>();
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const diagnostics = useMemo(
    () => getScanAttemptDiagnostics(typeof params.scanSessionId === 'string' ? params.scanSessionId : null),
    [params.scanSessionId]
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>
              Recognition diagnostics
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
              Development-only scan timing and candidate decisions.
            </Text>
          </View>
        </View>

        {!isDev ? (
          <Section title="Unavailable">
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Diagnostics are hidden outside development builds.
            </Text>
          </Section>
        ) : !diagnostics ? (
          <Section title="No scan found">
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              Run a scan, open the result, then return here from that result screen.
            </Text>
          </Section>
        ) : (
          <>
            <Section title="Attempt">
              <MetricRow label="Session" value={diagnostics.scanSessionId} />
              <MetricRow label="Outcome" value={diagnostics.outcome} />
              <MetricRow label="Source" value={diagnostics.source} />
              <MetricRow label="Mode" value={diagnostics.mode} />
              <MetricRow label="Created" value={diagnostics.createdAt} />
            </Section>

            <Section title="Timings">
              {Object.entries(diagnostics.timings).map(([key, value]) => (
                <MetricRow key={key} label={key} value={value == null ? null : `${value}ms`} />
              ))}
            </Section>

            <Section title="Image">
              <MetricRow label="Original" value={`${diagnostics.image.originalWidth ?? '--'} x ${diagnostics.image.originalHeight ?? '--'}`} />
              <MetricRow label="Crop" value={diagnostics.image.crop} />
              <MetricRow label="Recognition" value={`${diagnostics.image.recognitionWidth ?? '--'} x ${diagnostics.image.recognitionHeight ?? '--'}`} />
              <MetricRow label="Bytes approx" value={diagnostics.image.recognitionBytesApprox} />
            </Section>

            <Section title="Frame">
              {Object.entries(diagnostics.frameMetrics ?? {}).map(([key, value]) => (
                <MetricRow key={key} label={key} value={value} />
              ))}
            </Section>

            <Section title="Providers">
              {diagnostics.providers.length ? diagnostics.providers.map((provider, index) => (
                <View key={`${provider.provider}-${provider.stage}-${index}`} style={{
                  paddingVertical: 10,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
                    {provider.provider} - {provider.stage}
                  </Text>
                  <MetricRow label="Decision" value={provider.decision} />
                  <MetricRow label="Duration" value={`${provider.durationMs}ms`} />
                  <MetricRow label="Candidates" value={provider.candidateCount} />
                  <MetricRow label="Accepted" value={provider.accepted ?? false} />
                  {provider.error ? <MetricRow label="Error" value={provider.error} /> : null}
                  {(provider.candidates ?? []).slice(0, 5).map((candidate, candidateIndex) => (
                    <View key={`${candidate.id ?? candidate.name}-${candidateIndex}`} style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor: candidate.accepted ? theme.colors.primary : theme.colors.border,
                    }}>
                      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                        {candidate.name ?? 'Unknown card'}
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                        {candidate.set_name ?? '--'} #{candidate.number ?? '--'}
                      </Text>
                      <MetricRow label="Visual" value={candidate.visualSimilarity} />
                      <MetricRow label="Final" value={candidate.finalScore} />
                      <MetricRow label="Accepted" value={candidate.accepted ?? false} />
                      <MetricRow label="Rejected" value={candidate.rejectionReason} />
                    </View>
                  ))}
                </View>
              )) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  No provider diagnostics were recorded.
                </Text>
              )}
            </Section>

            <Section title="Displayed Candidates">
              {diagnostics.candidates.length ? diagnostics.candidates.map((candidate) => (
                <View key={candidate.id ?? candidate.name ?? Math.random()} style={{ paddingVertical: 8 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                    {candidate.name ?? 'Unknown card'}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                    {candidate.set_name ?? '--'} #{candidate.number ?? '--'}
                  </Text>
                  <MetricRow label="Provider" value={candidate.provider} />
                  <MetricRow label="Confidence" value={candidate.confidence} />
                  <MetricRow label="Visual" value={candidate.visualSimilarity} />
                  <MetricRow label="Final" value={candidate.finalScore} />
                </View>
              )) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  No displayed candidates were recorded.
                </Text>
              )}
            </Section>

            {diagnostics.notes?.length ? (
              <Section title="Notes">
                {diagnostics.notes.map((note) => (
                  <Text key={note} style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
                    {note}
                  </Text>
                ))}
              </Section>
            ) : null}

            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
                Back to result
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

