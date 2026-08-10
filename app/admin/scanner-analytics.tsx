import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrPageTitle, StackrScreen } from '../../components/StackrScreen';
import { StackrErrorState, StackrLoadingState, StackrPermissionState, StackrStateBlock } from '../../components/StackrStates';
import { Text } from '../../components/Text';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import {
  fetchScannerAnalyticsDashboard,
  type ScannerAnalyticsDashboard,
  type ScannerFeatureComparison,
  type ScannerMetricBreakdown,
} from '../../lib/scannerAnalytics';

function formatMs(value: number | null | undefined) {
  if (value == null) return 'No data';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
  return `${value}ms`;
}

function formatPercent(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1).replace('.0', '')}%`;
}

function StatCard({
  label,
  value,
  icon,
  tone = '#6938F5',
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${tone}14`, borderColor: `${tone}35` }]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <Text style={[styles.statValue, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.colors.textSoft }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function BreakdownPanel({
  title,
  rows,
}: {
  title: string;
  rows: ScannerMetricBreakdown[];
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      {rows.length ? rows.map((row) => (
        <View key={row.key} style={[styles.breakdownRow, { borderColor: theme.colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.breakdownKey, { color: theme.colors.text }]} numberOfLines={1}>
              {row.key}
            </Text>
            <Text style={[styles.breakdownMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
              {row.attempts} attempts - median {formatMs(row.medianMs)}
            </Text>
          </View>
          <View style={styles.breakdownStats}>
            <Text style={[styles.breakdownNumber, { color: theme.colors.primary }]}>{formatPercent(row.successRate)}</Text>
            <Text style={[styles.breakdownCaption, { color: theme.colors.textSoft }]}>success</Text>
          </View>
          <View style={styles.breakdownStats}>
            <Text style={[styles.breakdownNumber, { color: '#F59E0B' }]}>{formatPercent(row.correctionRate)}</Text>
            <Text style={[styles.breakdownCaption, { color: theme.colors.textSoft }]}>corrected</Text>
          </View>
        </View>
      )) : (
        <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>No events in this window.</Text>
      )}
    </View>
  );
}

function FeatureComparisonPanel({ rows }: { rows: ScannerFeatureComparison[] }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Feature flag comparison</Text>
      {rows.length ? rows.map((row) => (
        <View key={row.key} style={[styles.breakdownRow, { borderColor: theme.colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.breakdownKey, { color: theme.colors.text }]} numberOfLines={1}>
              {row.key === 'rev2' ? 'Rev 2 scanner' : 'Legacy scanner'}
            </Text>
            <Text style={[styles.breakdownMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
              {row.attempts} attempts - median {formatMs(row.medianMs)}
            </Text>
          </View>
          <View style={styles.breakdownStats}>
            <Text style={[styles.breakdownNumber, { color: theme.colors.primary }]}>{formatPercent(row.successRate)}</Text>
            <Text style={[styles.breakdownCaption, { color: theme.colors.textSoft }]}>success</Text>
          </View>
          <View style={styles.breakdownStats}>
            <Text style={[styles.breakdownNumber, { color: '#0EA5E9' }]}>{formatPercent(row.remoteFallbackRate)}</Text>
            <Text style={[styles.breakdownCaption, { color: theme.colors.textSoft }]}>remote</Text>
          </View>
        </View>
      )) : (
        <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>No comparable scanner events yet.</Text>
      )}
    </View>
  );
}

function ErrorPanel({ dashboard }: { dashboard: ScannerAnalyticsDashboard }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Latest failures</Text>
      {dashboard.latestErrors.length ? dashboard.latestErrors.map((row) => {
        const analytics = row.route_context?.analytics;
        return (
          <View key={row.id} style={[styles.errorRow, { borderColor: theme.colors.border }]}>
            <View style={[styles.errorIcon, { backgroundColor: '#EF444414', borderColor: '#EF444433' }]}>
              <Ionicons name="warning-outline" size={16} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.errorTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {row.outcome ?? row.event_type}
              </Text>
              <Text style={[styles.breakdownMeta, { color: theme.colors.textSoft }]} numberOfLines={2}>
                {[analytics?.errorCategory, row.route_context?.source, row.notes].filter(Boolean).join(' - ') || 'No detail captured'}
              </Text>
            </View>
          </View>
        );
      }) : (
        <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>No recent scanner failures.</Text>
      )}
    </View>
  );
}

export default function AdminScannerAnalyticsScreen() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const [dashboard, setDashboard] = useState<ScannerAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = profile?.role === 'admin';
  const stylesWithTheme = useMemo(() => styles, []);

  const load = useCallback(async (refresh = false) => {
    if (!isAdmin) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const next = await fetchScannerAnalyticsDashboard(14);
      setDashboard(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StackrScreen variant="form" contentStyle={stylesWithTheme.screenContent}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <View style={styles.header}>
        <StackrBackButton onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <StackrPageTitle title="Scanner Analytics" accentText="Analytics" />
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
            Real scan timings, fallback rates and correction signals.
          </Text>
        </View>
      </View>

      {!isAdmin ? (
        <StackrPermissionState
          title="Admin only"
          body="Your profile needs the admin role to view scanner analytics."
        />
      ) : loading ? (
        <StackrLoadingState label="Loading scanner analytics..." style={styles.loadingState} />
      ) : error ? (
        <StackrErrorState
          title="Scanner analytics could not load"
          body={error}
          actionLabel="Retry"
          onAction={() => load(true)}
        />
      ) : dashboard ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          {dashboard.eventCount === 0 ? (
            <StackrStateBlock
              tone="warning"
              icon="analytics-outline"
              title="No scanner events yet"
              body="Run real scans after applying the analytics migration. This screen does not use synthetic success data."
            />
          ) : null}

          <View style={styles.summaryGrid}>
            <StatCard label="Median scan" value={formatMs(dashboard.medianScanMs)} icon="speedometer-outline" />
            <StatCard label="95th percentile" value={formatMs(dashboard.p95ScanMs)} icon="timer-outline" />
            <StatCard label="Local match" value={formatPercent(dashboard.localMatchPercentage)} icon="phone-portrait-outline" tone="#10B981" />
            <StatCard label="Remote fallback" value={formatPercent(dashboard.remoteFallbackPercentage)} icon="cloud-outline" tone="#0EA5E9" />
            <StatCard label="First attempt success" value={formatPercent(dashboard.firstAttemptSuccessPercentage)} icon="checkmark-circle-outline" tone="#10B981" />
            <StatCard label="Correction rate" value={formatPercent(dashboard.correctionRate)} icon="create-outline" tone="#F59E0B" />
            <StatCard label="Rescan rate" value={formatPercent(dashboard.rescanRate)} icon="refresh-outline" tone="#A855F7" />
            <StatCard label="Failure rate" value={formatPercent(dashboard.failureRate)} icon="alert-circle-outline" tone="#EF4444" />
            <StatCard label="Ximilar usage" value={dashboard.estimatedXimilarUsage} icon="cloud-upload-outline" tone="#0EA5E9" />
          </View>

          <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>14-day sample</Text>
                <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>
                  {dashboard.attemptCount} attempts from {dashboard.eventCount} total scanner events.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => load(true)}
                style={[styles.refreshButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                <Ionicons name="refresh" size={17} color={theme.colors.primary} />
                <Text style={[styles.refreshText, { color: theme.colors.primary }]}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FeatureComparisonPanel rows={dashboard.featureComparisons} />
          <BreakdownPanel title="Language accuracy signal" rows={dashboard.accuracyByLanguage} />
          <BreakdownPanel title="Device tier accuracy signal" rows={dashboard.accuracyByDeviceTier} />
          <BreakdownPanel title="Scan mode accuracy signal" rows={dashboard.accuracyByScanMode} />
          <ErrorPanel dashboard={dashboard} />
        </ScrollView>
      ) : null}
    </StackrScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  loadingState: {
    marginTop: 24,
  },
  scrollContent: {
    paddingBottom: 36,
    gap: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '31.4%',
    minWidth: 104,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  refreshButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '900',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: 8,
  },
  breakdownKey: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  breakdownMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  breakdownStats: {
    width: 66,
    alignItems: 'flex-end',
  },
  breakdownNumber: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  breakdownCaption: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: 8,
  },
  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
});
