import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrPageTitle, StackrScreen } from '../../components/StackrScreen';
import { StackrErrorState, StackrLoadingState, StackrPermissionState } from '../../components/StackrStates';
import { Text } from '../../components/Text';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import {
  stackrApiClient,
  type StackrObservabilityDashboard,
  type StackrObservabilitySnapshot,
  type StackrObservabilityStatus,
} from '../../lib/stackrApiV1';

const STATUS_COLOR: Record<StackrObservabilityStatus, string> = {
  healthy: '#16A34A',
  degraded: '#D97706',
  critical: '#DC2626',
  unavailable: '#64748B',
};

const DASHBOARD_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  api_health: 'pulse-outline',
  ingestion_health: 'cloud-download-outline',
  catalogue_coverage: 'library-outline',
  scanner_funnel: 'scan-outline',
  recognition_quality: 'sparkles-outline',
  pricing_freshness: 'pricetag-outline',
  cost_per_1000_scans: 'calculator-outline',
  provider_dependency: 'git-network-outline',
  model_index_versions: 'layers-outline',
};

function labelFor(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function displayValue(value: unknown) {
  if (value == null) return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3);
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === 'object') return `${Object.keys(value as object).length} values`;
  return String(value);
}

function SnapshotPanel({ snapshot }: { snapshot: StackrObservabilitySnapshot }) {
  const { theme } = useTheme();
  const tone = STATUS_COLOR[snapshot.status];
  const metrics = Object.entries(snapshot.summary).slice(0, 8);
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.panelHeader}>
        <View style={[styles.iconFrame, { backgroundColor: `${tone}14`, borderColor: `${tone}38` }]}>
          <Ionicons name={DASHBOARD_ICON[snapshot.dashboardKey] ?? 'analytics-outline'} size={18} color={tone} />
        </View>
        <View style={styles.panelTitleBlock}>
          <Text style={[styles.panelTitle, { color: theme.colors.text }]}>{labelFor(snapshot.dashboardKey)}</Text>
          <Text style={[styles.panelMeta, { color: theme.colors.textSoft }]}>
            {snapshot.evidenceCount.toLocaleString()} evidence records
          </Text>
        </View>
        <View style={[styles.statusMark, { backgroundColor: tone }]} accessibilityLabel={snapshot.status} />
        <Text style={[styles.statusText, { color: tone }]}>{labelFor(snapshot.status)}</Text>
      </View>
      {metrics.length ? metrics.map(([key, value]) => (
        <View key={key} style={[styles.metricRow, { borderColor: theme.colors.border }]}>
          <Text style={[styles.metricLabel, { color: theme.colors.textSoft }]} numberOfLines={1}>{labelFor(key)}</Text>
          <Text style={[styles.metricValue, { color: theme.colors.text }]} numberOfLines={1}>{displayValue(value)}</Text>
        </View>
      )) : (
        <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>No measured values.</Text>
      )}
      {snapshot.limitations.slice(0, 2).map((limitation) => (
        <View key={limitation} style={styles.limitationRow}>
          <Ionicons name="information-circle-outline" size={15} color={theme.colors.textSoft} />
          <Text style={[styles.limitationText, { color: theme.colors.textSoft }]}>{limitation}</Text>
        </View>
      ))}
    </View>
  );
}

export default function QualityObservabilityScreen() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const [dashboard, setDashboard] = useState<StackrObservabilityDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async (refresh = false) => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const response = refresh
        ? await stackrApiClient.refreshAdminObservabilityDashboard(24)
        : await stackrApiClient.adminObservabilityDashboard();
      setDashboard(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);
  const failedGateCount = useMemo(
    () => dashboard?.releaseGates.filter((gate) => gate.status !== 'pass').length ?? 0,
    [dashboard],
  );

  return (
    <StackrScreen variant="form" contentStyle={styles.screenContent}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <View style={styles.header}>
        <StackrBackButton onPress={() => router.back()} />
        <View style={styles.headerTitle}>
          <StackrPageTitle title="Quality & Health" accentText="Health" />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh quality dashboards"
          disabled={!isAdmin || refreshing}
          onPress={() => void load(true)}
          style={[styles.refreshButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <Ionicons name="refresh" size={19} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {!isAdmin ? (
        <StackrPermissionState title="Admin only" body="Your profile needs the admin role to view quality dashboards." />
      ) : loading ? (
        <StackrLoadingState label="Loading quality dashboards..." />
      ) : error ? (
        <StackrErrorState title="Quality dashboards could not load" body={error} actionLabel="Retry" onAction={() => void load()} />
      ) : dashboard ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.releaseBand, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View>
              <Text style={[styles.releaseLabel, { color: theme.colors.textSoft }]}>Release gates</Text>
              <Text style={[styles.releaseValue, { color: failedGateCount ? '#DC2626' : '#16A34A' }]}>
                {dashboard.releaseGates.length ? `${dashboard.releaseGates.length - failedGateCount}/${dashboard.releaseGates.length} passing` : 'No evaluation'}
              </Text>
            </View>
            <Text style={[styles.generatedAt, { color: theme.colors.textSoft }]}>
              {new Date(dashboard.generatedAt).toLocaleString()}
            </Text>
          </View>
          {dashboard.dashboards.map((snapshot) => <SnapshotPanel key={snapshot.dashboardKey} snapshot={snapshot} />)}
        </ScrollView>
      ) : null}
    </StackrScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  headerTitle: { flex: 1 },
  refreshButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 120, gap: 10 },
  releaseBand: { minHeight: 72, borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  releaseLabel: { fontSize: 12, fontWeight: '700' },
  releaseValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  generatedAt: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  panel: { borderWidth: 1, borderRadius: 8, padding: 14 },
  panelHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  iconFrame: { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  panelTitleBlock: { flex: 1 },
  panelTitle: { fontSize: 15, fontWeight: '800' },
  panelMeta: { fontSize: 11, marginTop: 2 },
  statusMark: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metricRow: { minHeight: 38, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricLabel: { flex: 1, fontSize: 12 },
  metricValue: { maxWidth: '48%', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  emptyText: { paddingVertical: 10, fontSize: 12 },
  limitationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  limitationText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
