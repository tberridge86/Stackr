import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type IconName = keyof typeof Ionicons.glyphMap;

export type HomeBinderSummary = {
  id: string;
  name: string;
  coverImageUrl: string | null;
  color: string | null;
  owned: number;
  total: number;
  missing: number;
  duplicateCount: number;
  value: number;
  completionPercent: number;
};

export type HomeDuplicateItem = {
  cardId: string;
  setId: string | null;
  name: string;
  setName: string;
  imageUrl: string | null;
  extraQuantity: number;
  estimatedValue: number;
};

export type HomeDuplicateSummary = {
  count: number;
  estimatedValue: number;
  items: HomeDuplicateItem[];
};

export type HomeCardPreview = {
  cardId: string;
  setId: string | null;
  name: string;
  setName: string;
  number?: string | null;
  rarity?: string | null;
  imageUrl: string | null;
  estimatedValue?: number | null;
};

export type HomeActivityItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  createdAt: string;
  valueChange?: number | null;
  isPositive?: boolean | null;
  icon?: IconName;
  cardId?: string | null;
  setId?: string | null;
};

const cardShadow = {
  shadowColor: '#1B2A4B',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 7 },
  elevation: 4,
};

const formatMoney = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '--';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}\u00A3${abs.toFixed(abs >= 1000 ? 0 : 2)}`;
};

const formatRelativeTime = (value: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function SkeletonLine({ width, height = 12 }: { width: number | `${number}%`; height?: number }) {
  return <View style={[styles.skeletonLine, { width, height }]} />;
}

function EmptyMessage({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.emptyBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: `${theme.colors.primary}18` }]}>
        <Ionicons name={icon} size={24} color={theme.colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: theme.colors.textSoft }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.82} style={[styles.inlineButton, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.inlineButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HomeSectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.colors.textSoft }]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.76} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, { color: theme.colors.primary }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HomeActionTile({
  icon,
  title,
  subtitle,
  meta,
  primary = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  meta?: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const bg = primary ? theme.colors.primary : theme.colors.card;
  const textColor = primary ? '#FFFFFF' : theme.colors.text;
  const softColor = primary ? 'rgba(255,255,255,0.74)' : theme.colors.textSoft;
  const iconBg = primary ? 'rgba(255,255,255,0.17)' : `${theme.colors.primary}14`;
  const iconColor = primary ? '#FFFFFF' : theme.colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[
        styles.actionTile,
        {
          backgroundColor: bg,
          borderColor: primary ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.actionTitle, { color: textColor }]} numberOfLines={1}>{title}</Text>
      <Text style={[styles.actionSubtitle, { color: softColor }]} numberOfLines={2}>{subtitle}</Text>
      {meta ? <Text style={[styles.actionMeta, { color: softColor }]} numberOfLines={1}>{meta}</Text> : null}
    </TouchableOpacity>
  );
}

export function HomeActionsRow({
  ownedCount,
  listingCount,
  onScan,
  onBinders,
  onTrade,
}: {
  ownedCount: number;
  listingCount: number;
  onScan: () => void;
  onBinders: () => void;
  onTrade: () => void;
}) {
  return (
    <View style={styles.actionsRow}>
      <HomeActionTile
        icon="scan-outline"
        title="Scan"
        subtitle="Add, identify or value"
        meta="Fast capture"
        primary
        onPress={onScan}
      />
      <HomeActionTile
        icon="albums-outline"
        title="Binders"
        subtitle="Track sets and gaps"
        meta={ownedCount > 0 ? `${ownedCount} owned` : 'Build progress'}
        onPress={onBinders}
      />
      <HomeActionTile
        icon="swap-horizontal-outline"
        title="Trade"
        subtitle="Compare and protect"
        meta={listingCount > 0 ? `${listingCount} live` : 'Find swaps'}
        onPress={onTrade}
      />
    </View>
  );
}

function StatPill({ label, value, tone = 'purple' }: { label: string; value: string; tone?: 'purple' | 'green' | 'gold' }) {
  const { theme } = useTheme();
  const color = tone === 'green' ? '#10B981' : tone === 'gold' ? theme.colors.secondary : theme.colors.primary;
  return (
    <View style={[styles.statPill, { backgroundColor: `${color}12`, borderColor: `${color}36` }]}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textSoft }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function ContinueBinderCard({
  binder,
  isLoading,
  error,
  onView,
  onScan,
  onCreate,
}: {
  binder: HomeBinderSummary | null;
  isLoading: boolean;
  error?: string | null;
  onView: (binderId: string) => void;
  onScan: (binderId: string) => void;
  onCreate: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title="Continue Binder" subtitle="Pick up the set you are closest to finishing" />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          <View style={styles.binderSkeleton}>
            <View style={[styles.binderCoverSkeleton, { backgroundColor: theme.colors.surface }]} />
            <View style={{ flex: 1 }}>
              <SkeletonLine width="74%" height={18} />
              <SkeletonLine width="52%" />
              <SkeletonLine width="92%" height={10} />
              <View style={styles.statRow}>
                <SkeletonLine width="30%" height={34} />
                <SkeletonLine width="30%" height={34} />
                <SkeletonLine width="30%" height={34} />
              </View>
            </View>
          </View>
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not load binder progress" subtitle={error} />
        ) : binder ? (
          <>
            <TouchableOpacity onPress={() => onView(binder.id)} activeOpacity={0.86} style={styles.binderMain}>
              <View style={[styles.binderCover, { backgroundColor: binder.color ?? theme.colors.primary }]}>
                {binder.coverImageUrl ? (
                  <Image source={{ uri: binder.coverImageUrl }} style={styles.binderCoverImage} resizeMode="contain" />
                ) : (
                  <Ionicons name="albums-outline" size={34} color="#FFFFFF" />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.binderName, { color: theme.colors.text }]} numberOfLines={1}>{binder.name}</Text>
                <Text style={[styles.binderMeta, { color: theme.colors.textSoft }]}>
                  {binder.owned} / {binder.total} owned
                </Text>
                <View
                  accessible
                  accessibilityLabel={`${binder.name} is ${binder.completionPercent} percent complete`}
                  style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}
                >
                  <View style={[styles.progressFill, { width: `${binder.completionPercent}%`, backgroundColor: binder.completionPercent >= 100 ? '#10B981' : theme.colors.primary }]} />
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.statRow}>
              <StatPill label="Complete" value={`${binder.completionPercent}%`} tone={binder.completionPercent >= 100 ? 'green' : 'purple'} />
              <StatPill label="Missing" value={`${binder.missing}`} tone="gold" />
              <StatPill label="Value" value={formatMoney(binder.value)} tone="green" />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => onView(binder.id)} activeOpacity={0.82} style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.primaryButtonText}>View Binder</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onScan(binder.id)} activeOpacity={0.82} style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <Ionicons name="scan-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: theme.colors.primary }]}>Scan to Binder</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <EmptyMessage
            icon="albums-outline"
            title="Start your first binder"
            subtitle="Track a set, scan cards and watch your progress grow."
            actionLabel="Create Binder"
            onAction={onCreate}
          />
        )}
      </View>
    </View>
  );
}

export function TradeableDuplicatesCard({
  summary,
  isLoading,
  error,
  matchCount,
  onAction,
}: {
  summary: HomeDuplicateSummary;
  isLoading: boolean;
  error?: string | null;
  matchCount: number;
  onAction: () => void;
}) {
  const { theme } = useTheme();
  const hasDuplicates = summary.count > 0;

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title="Tradeable Duplicates" subtitle="Turn extras into trade or sale opportunities" actionLabel="Build Trade" onAction={onAction} />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          <>
            <SkeletonLine width="60%" height={22} />
            <SkeletonLine width="46%" />
            <SkeletonLine width="100%" height={54} />
          </>
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not load duplicates" subtitle={error} />
        ) : hasDuplicates ? (
          <>
            <View style={styles.duplicateHero}>
              <View>
                <Text style={[styles.bigMetric, { color: theme.colors.text }]}>{summary.count}</Text>
                <Text style={[styles.metricCopy, { color: theme.colors.textSoft }]}>extra cards ready to move</Text>
              </View>
              <View style={[styles.valueBadge, { backgroundColor: `${theme.colors.primary}12`, borderColor: `${theme.colors.primary}30` }]}>
                <Text style={[styles.valueBadgeLabel, { color: theme.colors.textSoft }]}>Est. value</Text>
                <Text style={[styles.valueBadgeText, { color: theme.colors.primary }]}>{formatMoney(summary.estimatedValue)}</Text>
              </View>
            </View>

            {summary.items.slice(0, 3).map((item) => (
              <View key={`${item.setId ?? 'set'}:${item.cardId}`} style={[styles.duplicateRow, { borderColor: theme.colors.border }]}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.rowCardImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.rowCardImage, styles.rowCardPlaceholder, { backgroundColor: theme.colors.surface }]}>
                    <Ionicons name="albums-outline" size={18} color={theme.colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.rowSub, { color: theme.colors.textSoft }]} numberOfLines={1}>{item.setName}</Text>
                </View>
                <Text style={[styles.rowStrong, { color: theme.colors.primary }]}>x{item.extraQuantity}</Text>
              </View>
            ))}

            {matchCount > 0 ? (
              <View style={[styles.opportunityNote, { backgroundColor: `${theme.colors.primary}10` }]}>
                <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.opportunityText, { color: theme.colors.text }]}>
                  {matchCount} wanted-card match{matchCount === 1 ? '' : 'es'} live in Trade.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <EmptyMessage
            icon="copy-outline"
            title="No tradeable duplicates yet"
            subtitle="Duplicates will appear here when you own extra copies."
          />
        )}
      </View>
    </View>
  );
}

export function ChaseOrMissingSection({
  mode,
  binderName,
  items,
  isLoading,
  error,
  onViewAll,
  onItemPress,
  onEmptyAction,
}: {
  mode: 'chase' | 'missing';
  binderName?: string | null;
  items: HomeCardPreview[];
  isLoading: boolean;
  error?: string | null;
  onViewAll: () => void;
  onItemPress: (item: HomeCardPreview) => void;
  onEmptyAction: () => void;
}) {
  const { theme } = useTheme();
  const title = mode === 'chase' ? 'Your Chase List' : `Missing${binderName ? ` from ${binderName}` : ' Cards'}`;
  const subtitle = mode === 'chase'
    ? `${items.length || 0} card${items.length === 1 ? '' : 's'} you are hunting`
    : 'A clear next goal for your binder';

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title={title} subtitle={subtitle} actionLabel="View all" onAction={onViewAll} />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          <View style={styles.previewRail}>
            {[0, 1, 2].map((index) => (
              <View key={index} style={[styles.previewSkeleton, { backgroundColor: theme.colors.surface }]} />
            ))}
          </View>
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title={mode === 'chase' ? 'Could not load chase cards' : 'Could not load missing cards'} subtitle={error} />
        ) : items.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRail}>
            {items.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={`${item.setId ?? 'set'}:${item.cardId}`}
                onPress={() => onItemPress(item)}
                activeOpacity={0.84}
                style={[styles.previewCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.previewImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.previewImage, styles.previewPlaceholder]}>
                    <Ionicons name="albums-outline" size={25} color={theme.colors.primary} />
                  </View>
                )}
                <Text style={[styles.previewTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.previewSub, { color: theme.colors.textSoft }]} numberOfLines={1}>
                  {item.number ? `#${item.number}` : item.setName}
                </Text>
                <Text style={[styles.previewValue, { color: theme.colors.primary }]} numberOfLines={1}>
                  {item.estimatedValue != null ? formatMoney(item.estimatedValue) : item.rarity ?? 'View'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <EmptyMessage
            icon={mode === 'chase' ? 'heart-outline' : 'search-outline'}
            title={mode === 'chase' ? 'No chase cards yet' : 'No missing cards found'}
            subtitle={mode === 'chase' ? 'Mark wanted cards so Stackr can help you hunt them down.' : 'Open a binder to choose your next card.'}
            actionLabel={mode === 'chase' ? 'Open Trade' : 'View Binders'}
            onAction={onEmptyAction}
          />
        )}
      </View>
    </View>
  );
}

export function RecentActivitySection({
  items,
  isLoading,
  error,
  onRetry,
  onItemPress,
}: {
  items: HomeActivityItem[];
  isLoading: boolean;
  error?: string | null;
  onRetry: () => void;
  onItemPress: (item: HomeActivityItem) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title="Recent Activity" subtitle="Your latest collection moves" />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          [0, 1, 2].map((index) => (
            <View key={index} style={styles.activitySkeletonRow}>
              <View style={[styles.activityIcon, { backgroundColor: theme.colors.surface }]} />
              <View style={{ flex: 1 }}>
                <SkeletonLine width="72%" height={14} />
                <SkeletonLine width="48%" height={10} />
              </View>
            </View>
          ))
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not refresh recent activity" subtitle={error} actionLabel="Retry" onAction={onRetry} />
        ) : items.length > 0 ? (
          items.slice(0, 5).map((item, index) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onItemPress(item)}
              activeOpacity={0.78}
              style={[styles.activityRow, { borderBottomColor: theme.colors.border, borderBottomWidth: index === items.length - 1 ? 0 : 1 }]}
            >
              <View style={[styles.activityIcon, { backgroundColor: `${theme.colors.primary}13` }]}>
                <Ionicons name={item.icon ?? 'sparkles-outline'} size={18} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.activityTitle, { color: theme.colors.text }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.activitySub, { color: theme.colors.textSoft }]} numberOfLines={1}>
                  {item.subtitle ? `${item.subtitle} - ${formatRelativeTime(item.createdAt)}` : formatRelativeTime(item.createdAt)}
                </Text>
              </View>
              {item.valueChange != null ? (
                <Text style={[styles.activityValue, { color: item.isPositive === false ? '#D97706' : '#10B981' }]}>
                  {item.valueChange > 0 ? '+' : ''}{formatMoney(item.valueChange)}
                </Text>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
              )}
            </TouchableOpacity>
          ))
        ) : (
          <EmptyMessage
            icon="time-outline"
            title="No activity yet"
            subtitle="Your scans, trades and binder updates will appear here."
            actionLabel="Scan a Card"
            onAction={() => onItemPress({
              id: 'scan-empty',
              title: 'Scan a Card',
              createdAt: new Date().toISOString(),
              icon: 'scan-outline',
            })}
          />
        )}
      </View>
    </View>
  );
}

export function TradeProtectionSummaryCard({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const tiers = [
    { label: 'Everyday Trades', range: '\u00A30.01-\u00A320', color: theme.colors.primary },
    { label: 'Serious Trades', range: '\u00A320-\u00A3250', color: theme.colors.secondary },
    { label: 'Grail Trades', range: '\u00A3250+', color: '#10B981' },
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel="Protected trading, matched to value. View protection tiers."
      style={[styles.protectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
    >
      <View style={styles.protectionHeader}>
        <View style={[styles.protectionIcon, { backgroundColor: `${theme.colors.primary}14` }]}>
          <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.protectionTitle, { color: theme.colors.text }]}>Protected trading, matched to value</Text>
          <Text style={[styles.protectionCopy, { color: theme.colors.textSoft }]}>Stackr helps choose the right protection level for every trade.</Text>
        </View>
      </View>
      <View style={styles.tierRow}>
        {tiers.map((tier) => (
          <View key={tier.label} style={[styles.tierPill, { backgroundColor: `${tier.color}10`, borderColor: `${tier.color}34` }]}>
            <Text style={[styles.tierRange, { color: tier.color }]} numberOfLines={1}>{tier.range}</Text>
            <Text style={[styles.tierLabel, { color: theme.colors.textSoft }]} numberOfLines={1}>{tier.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.protectionAction}>
        <Text style={[styles.sectionActionText, { color: theme.colors.primary }]}>View protection tiers</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
    lineHeight: 17,
  },
  sectionAction: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  actionTile: {
    flex: 1,
    minHeight: 142,
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    ...cardShadow,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  actionSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 5,
  },
  actionMeta: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 'auto',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    ...cardShadow,
  },
  skeletonLine: {
    borderRadius: 999,
    backgroundColor: 'rgba(121,112,169,0.18)',
    marginBottom: 10,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    padding: 18,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyCopy: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    textAlign: 'center',
  },
  inlineButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  binderSkeleton: {
    flexDirection: 'row',
    gap: 12,
  },
  binderCoverSkeleton: {
    width: 78,
    height: 104,
    borderRadius: 16,
  },
  binderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  binderCover: {
    width: 78,
    height: 104,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  binderCoverImage: {
    width: '86%',
    height: '86%',
  },
  binderName: {
    fontSize: 18,
    fontWeight: '900',
  },
  binderMeta: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statPill: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  duplicateHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  bigMetric: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricCopy: {
    fontSize: 12,
    fontWeight: '800',
  },
  valueBadge: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'flex-end',
  },
  valueBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  valueBadgeText: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  duplicateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  rowCardImage: {
    width: 38,
    height: 46,
    borderRadius: 10,
  },
  rowCardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  rowSub: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  rowStrong: {
    fontSize: 14,
    fontWeight: '900',
  },
  opportunityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
  },
  opportunityText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  previewRail: {
    gap: 10,
    paddingRight: 6,
  },
  previewSkeleton: {
    width: 116,
    height: 172,
    borderRadius: 18,
  },
  previewCard: {
    width: 118,
    borderWidth: 1,
    borderRadius: 18,
    padding: 9,
  },
  previewImage: {
    width: '100%',
    height: 112,
    marginBottom: 8,
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  previewSub: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  previewValue: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 5,
  },
  activitySkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  activitySub: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  activityValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  protectionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    marginBottom: 24,
    ...cardShadow,
  },
  protectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  protectionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  protectionCopy: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  tierRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  tierPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  tierRange: {
    fontSize: 11,
    fontWeight: '900',
  },
  tierLabel: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 3,
  },
  protectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 13,
    alignSelf: 'flex-start',
  },
});
