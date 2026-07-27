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
  fetchJapaneseCatalogueHealth,
  type JapaneseCatalogueHealthRow,
  type JapaneseCatalogueHealthSummary,
} from '../../lib/japaneseCatalogue';

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-GB').format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not synced';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getLanguageLabel(language: string | null | undefined) {
  if (language === 'ja') return 'Japanese';
  if (language === 'en') return 'English';
  return String(language || 'Unknown').toUpperCase();
}

function getStatusTone(status: string) {
  if (status === 'Complete') return '#16A34A';
  if (status === 'Sync failed') return '#DC2626';
  if (status.includes('incomplete')) return '#F59E0B';
  return '#6938F5';
}

function getCompletionPercent(row: JapaneseCatalogueHealthRow) {
  const total = Number(row.cards_stored ?? 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(row.cards_with_resolved_images ?? 0) / total) * 100));
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={[styles.statValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textSoft }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function StatusPill({ label, count }: { label: string; count: number }) {
  const { theme } = useTheme();
  const color = getStatusTone(label);
  return (
    <View style={[styles.statusPill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusPillText, { color: theme.colors.text }]} numberOfLines={1}>
        {label} {count}
      </Text>
    </View>
  );
}

function CatalogueHealthCard({ row }: { row: JapaneseCatalogueHealthRow }) {
  const { theme } = useTheme();
  const statusColor = getStatusTone(row.current_status);
  const percent = getCompletionPercent(row);
  const setsStored = row.language === 'ja' ? row.japanese_sets_stored : row.english_sets_stored;
  const missingPrices = Number(row.cards_without_provider_mappings ?? 0) + Number(row.cards_with_no_pricing_support ?? 0);
  return (
    <View style={[styles.setCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.setHeader}>
        <View style={styles.setTitleWrap}>
          <Text style={[styles.setTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {getLanguageLabel(row.language)} catalogue
          </Text>
          <Text style={[styles.setMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
            {[row.region, `Last sync ${formatDate(row.last_successful_sync)}`, `Repair ${formatDate(row.last_repair_run)}`].filter(Boolean).join(' - ')}
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: `${statusColor}55`, backgroundColor: `${statusColor}12` }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]} numberOfLines={1}>
            {row.current_status}
          </Text>
        </View>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${percent}%` }]} />
      </View>

      <View style={styles.setMetrics}>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(setsStored)} sets
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_stored)} cards
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_with_resolved_images)} images resolved
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_using_secondary_images)} secondary images
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_missing_images)} images missing
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_with_current_prices)} current prices
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.cards_with_stale_prices)} stale prices
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(missingPrices)} without reliable prices
        </Text>
        <Text style={[styles.metricText, { color: theme.colors.textSoft }]}>
          {formatNumber(row.duplicate_records)} duplicates
        </Text>
      </View>
    </View>
  );
}

export default function AdminJapaneseCatalogueScreen() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const [rows, setRows] = useState<JapaneseCatalogueHealthRow[]>([]);
  const [summary, setSummary] = useState<JapaneseCatalogueHealthSummary | null>(null);
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
      const health = await fetchJapaneseCatalogueHealth();
      setRows(health.rows);
      setSummary(health.summary);
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

  const sortedStatuses = Object.entries(summary?.statuses ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <StackrScreen variant="form" contentStyle={stylesWithTheme.screenContent}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <View style={styles.header}>
        <StackrBackButton onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <StackrPageTitle title="TCGdex Catalogue" accentText="Catalogue" />
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
            English and Japanese image, pricing and sync coverage.
          </Text>
        </View>
      </View>

      {!isAdmin ? (
        <StackrPermissionState
          title="Admin only"
          body="Your profile needs the admin role to view catalogue coverage."
        />
      ) : loading ? (
        <StackrLoadingState label="Loading catalogue health..." style={styles.loadingState} />
      ) : error ? (
        <StackrErrorState
          title="Catalogue health could not load"
          body={error}
          actionLabel="Retry"
          onAction={() => load(true)}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.summaryGrid}>
            <StatCard label="English sets" value={formatNumber(summary?.englishSets)} icon="albums-outline" />
            <StatCard label="Japanese sets" value={formatNumber(summary?.japaneseSets)} icon="albums-outline" />
            <StatCard label="Stored cards" value={formatNumber(summary?.cardsStored)} icon="copy-outline" />
            <StatCard label="Missing images" value={formatNumber(summary?.cardsMissingImages)} icon="image-outline" />
            <StatCard label="Resolved images" value={formatNumber(summary?.cardsWithResolvedImages)} icon="image-outline" />
            <StatCard label="Secondary images" value={formatNumber(summary?.cardsUsingSecondaryImages)} icon="git-branch-outline" />
            <StatCard label="Current prices" value={formatNumber(summary?.cardsWithCurrentPrices)} icon="pricetag-outline" />
            <StatCard label="Stale prices" value={formatNumber(summary?.cardsWithStalePrices)} icon="time-outline" />
            <StatCard label="No reliable price" value={formatNumber(summary?.cardsMissingPrices)} icon="alert-circle-outline" />
            <StatCard label="Provider failures" value={formatNumber(summary?.providerFailures)} icon="warning-outline" />
            <StatCard label="Duplicates" value={formatNumber(summary?.duplicateRecords)} icon="copy-outline" />
          </View>

          {rows.length === 0 ? (
            <StackrStateBlock
              tone="warning"
              icon="construct-outline"
              title="No catalogue rows yet"
              body="Run the TCGdex catalogue migration, then sync English or Japanese sets before the health report can prove coverage."
            />
          ) : null}

          {sortedStatuses.length ? (
            <View style={[styles.statusPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Status mix</Text>
              <View style={styles.statusWrap}>
                {sortedStatuses.map(([label, count]) => (
                  <StatusPill key={label} label={label} count={count} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Languages</Text>
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => load(true)}
              style={[styles.refreshButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <Ionicons name="refresh" size={17} color={theme.colors.primary} />
              <Text style={[styles.refreshText, { color: theme.colors.primary }]}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {rows.map((row) => (
            <CatalogueHealthCard key={`${row.language}:${row.region ?? ''}`} row={row} />
          ))}
        </ScrollView>
      )}
    </StackrScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  loadingState: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    gap: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 102,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    minHeight: 112,
    justifyContent: 'space-between',
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  statusPanel: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  statusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    minHeight: 32,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
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
    lineHeight: 15,
    fontWeight: '900',
  },
  setCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  setTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  setTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  setMeta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  statusBadge: {
    maxWidth: 150,
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  setMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
});
