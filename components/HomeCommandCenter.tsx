import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ImageSourcePropType, ImageStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { BinderArtwork } from './BinderArtwork';
import { BinderModeIconBadge } from './BinderModeBadge';
import { StackrImage } from './StackrImage';
import { StackrActionButton } from './StackrActionButton';
import { StackrButtonPattern } from './StackrEmboss';
import { StackrCardActionIcon } from './StackrScreen';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from './RaritySymbol';
import { stackrIcons } from '../lib/stackrIcons';
import { getJapaneseSetLogoSourceForSet } from '../lib/japaneseSetLogos';
import { getPokemonSetLogoUrl } from '../lib/pokemonTcg';
import { numericTextStyle, stackrFonts, tabularNumberStyle, typeScale } from '../lib/typography';
import { getCustomBinderNameArt } from '../lib/customBinderNameArt';
import { stackrGradients } from '../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = keyof typeof Ionicons.glyphMap;

export type HomeBinderSummary = {
  id: string;
  name: string;
  type?: 'official' | 'custom' | null;
  sourceSetId?: string | null;
  sourceSetLanguage?: string | null;
  sourceSetLogoUrl?: string | null;
  sourceSetSymbolUrl?: string | null;
  sourceSetCoverUrl?: string | null;
  customNameArtKey?: string | null;
  cardMode?: 'raw' | 'graded' | null;
  masterSetEnabled?: boolean;
  coverKey: string | null;
  coverImageUrl: string | null;
  color: string | null;
  owned: number;
  total: number;
  missing: number;
  duplicateCount: number;
  value: number;
  valueAvailable?: boolean;
  valueCoverageLabel?: string | null;
  completionPercent: number;
  topValueCards: HomeBinderTopValueCard[];
};

export type HomeBinderTopValueCard = {
  cardId: string;
  setId: string | null;
  name: string;
  imageUrl: string | null;
  estimatedValue: number | null;
};

export type HomeDuplicateItem = {
  cardId: string;
  setId: string | null;
  name: string;
  setName: string;
  imageUrl: string | null;
  extraQuantity: number;
  estimatedValue: number;
  estimatedValueAvailable?: boolean;
};

export type HomeDuplicateSummary = {
  count: number;
  estimatedValue: number;
  estimatedValueAvailable?: boolean;
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

export type HomeChaseListingSuggestion = {
  id: string;
  cardId: string;
  setId: string | null;
  sellerDisplayName?: string | null;
  askingPrice?: number | null;
  condition?: string | null;
  tradeOnly?: boolean | null;
  status?: string | null;
  updatedAt?: string | null;
};

export type HomeActivityType = 'added' | 'removed' | 'duplicate' | 'favorite' | 'trade' | 'value' | 'generic';

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
  imageUrl?: string | null;
  activityType?: HomeActivityType;
};

const cardShadow = {
  shadowColor: '#6136F5',
  shadowOpacity: 0.11,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

const crownRankSource = require('../assets/rev2/09-grading-master-set/mode-icons/crown-rank-subtle-cutout.png') as ImageSourcePropType;
const MINTY_REV2_SOURCE = require('../assets/rev2/03-ui-illustrations/mascot/Stackrrev2_mascot-cutout.png') as ImageSourcePropType;
const tradeTierAssets = {
  bronze: require('../assets/rev2/10-market-trade/protection-tiers/Bronze.png') as ImageSourcePropType,
  silver: require('../assets/rev2/10-market-trade/protection-tiers/silver.png') as ImageSourcePropType,
  gold: require('../assets/rev2/10-market-trade/protection-tiers/gold.png') as ImageSourcePropType,
};
const HOME_HERO_DEEP = '#5226D9';
const HOME_HERO_PRIMARY = '#6938F5';
const HOME_HERO_MID = '#7C3CFF';
const HOME_HERO_LIFT = '#8B55FF';
const HOME_HERO_SOFT = 'rgba(105,56,245,0.10)';
const HOME_HERO_BORDER = 'rgba(105,56,245,0.24)';
const REMOVED_ACTIVITY_COLOR = '#F97316';

export const HOME_TOKENS = {
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
    section: 24,
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 999,
  },
  touch: {
    min: 44,
    comfortable: 48,
    primaryButtonHeight: 52,
    iconButton: 44,
  },
  layout: {
    screenPadding: 20,
    screenPaddingSmall: 16,
    screenPaddingLarge: 24,
    sectionGap: 24,
    cardGap: 16,
    rowGap: 8,
  },
  icons: {
    sm: 16,
    md: 20,
    lg: 24,
    container: 40,
  },
} as const;

const formatMoney = (value: number | null | undefined, fallback = 'Price pending') => {
  if (value == null || !Number.isFinite(value)) return fallback;
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

const activityVisuals: Record<HomeActivityType, { icon: IconName; color: string; label: string; imageIcon?: ImageSourcePropType }> = {
  added: { icon: 'add', color: '#10B981', label: 'Added' },
  removed: { icon: 'remove', color: REMOVED_ACTIVITY_COLOR, label: 'Removed' },
  duplicate: { icon: 'copy', color: '#6F45FF', label: 'Duplicate' },
  favorite: { icon: 'sparkles', color: HOME_HERO_PRIMARY, label: 'Chase', imageIcon: stackrIcons.chase },
  trade: { icon: 'swap-horizontal', color: '#2563EB', label: 'Trade' },
  value: { icon: 'trending-up', color: HOME_HERO_PRIMARY, label: 'Value' },
  generic: { icon: 'sparkles', color: '#6F45FF', label: 'Activity' },
};

const getActivityType = (item: HomeActivityItem): HomeActivityType => {
  if (item.activityType) return item.activityType;
  if (item.icon === 'log-out-outline') return 'removed';
  if (item.icon === 'copy-outline') return 'duplicate';
  if (item.icon === 'heart' || item.icon === 'heart-outline') return 'favorite';
  if (item.icon === 'swap-horizontal-outline') return 'trade';
  if (item.icon === 'trending-up-outline') return 'value';
  if (item.icon === 'scan-outline' || item.icon === 'albums-outline') return item.isPositive === false ? 'removed' : 'added';
  return 'generic';
};

function SkeletonLine({ width, height = 12 }: { width: number | `${number}%`; height?: number }) {
  return <View style={[styles.skeletonLine, { width, height }]} />;
}

function EmptyMessage({
  icon,
  imageIcon,
  imageIconSize,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  imageIcon?: ImageSourcePropType;
  imageIconSize?: number;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.emptyBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View
        style={[
          styles.emptyIcon,
          imageIcon && imageIconSize ? { width: imageIconSize + 10, height: imageIconSize + 10, marginBottom: 8 } : null,
          imageIcon ? styles.transparentIconFrame : { backgroundColor: HOME_HERO_SOFT },
        ]}
      >
        {imageIcon ? (
          <StackrCardActionIcon
            source={imageIcon}
            frameSize={imageIconSize ? imageIconSize + 10 : 42}
            artworkSize={imageIconSize ?? 32}
          />
        ) : (
          <Ionicons name={icon} size={24} color={HOME_HERO_PRIMARY} />
        )}
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: theme.colors.textSoft }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.82} style={[styles.inlineButton, { backgroundColor: HOME_HERO_PRIMARY }]}>
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
  accessory,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  accessory?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.colors.textSoft }]}>{subtitle}</Text> : null}
      </View>
      {accessory}
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.76} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, { color: HOME_HERO_PRIMARY }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={HOME_HERO_PRIMARY} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function HomeActionTile({
  icon,
  imageIcon,
  imageIconSize,
  title,
  subtitle,
  meta,
  valueHistory = false,
  compactSubtitle = false,
  primary = false,
  onPress,
}: {
  icon: IconName;
  imageIcon?: ImageSourcePropType;
  imageIconSize?: number;
  title: string;
  subtitle: string;
  meta?: string;
  valueHistory?: boolean;
  compactSubtitle?: boolean;
  primary?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const bg = primary ? HOME_HERO_PRIMARY : theme.colors.card;
  const textColor = primary ? '#FFFFFF' : theme.colors.text;
  const softColor = primary ? 'rgba(255,255,255,0.74)' : theme.colors.textSoft;
  const iconColor = primary ? '#FFFFFF' : HOME_HERO_PRIMARY;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={[
        styles.actionTile,
        primary ? styles.actionTilePrimary : styles.actionTileSecondary,
        {
          backgroundColor: bg,
          borderColor: primary ? HOME_HERO_MID : theme.colors.border,
        },
      ]}
    >
      <View style={[
        styles.actionIcon,
        primary ? styles.actionIconPrimary : styles.actionIconSecondary,
        valueHistory && styles.actionIconMarket,
      ]}>
        {imageIcon ? (
          <StackrCardActionIcon
            source={imageIcon}
            frameSize={imageIconSize ? imageIconSize + 10 : 44}
            artworkSize={imageIconSize ?? 34}
            imageStyle={valueHistory ? (styles.actionImageIconMarket as ImageStyle) : undefined}
          />
        ) : (
          <Ionicons name={icon} size={primary ? 24 : 22} color={iconColor} />
        )}
      </View>
      <View style={primary ? styles.actionCopyPrimary : styles.actionCopySecondary}>
        <Text
          style={[styles.actionTitle, primary && styles.actionTitlePrimary, { color: textColor }]}
          numberOfLines={2}
          adjustsFontSizeToFit={false}
        >
          {title}
        </Text>
        {valueHistory ? (
          <View style={styles.valueHistoryTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <LinearGradient
              colors={['rgba(105,56,245,0)', HOME_HERO_PRIMARY, HOME_HERO_LIFT]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.valueHistoryTrackLine}
            />
            <View style={styles.valueHistoryTrackSheen} />
            <View style={styles.valueHistorySparkHalo} />
            <Ionicons name="sparkles" size={16} color="#FFFFFF" style={styles.valueHistorySpark} />
          </View>
        ) : (
          <>
            {subtitle ? (
              <Text
                style={[styles.actionSubtitle, compactSubtitle && styles.actionSubtitleCompact, { color: softColor }]}
                numberOfLines={compactSubtitle ? 2 : 2}
                adjustsFontSizeToFit={false}
                minimumFontScale={0.88}
              >
                {subtitle}
              </Text>
            ) : null}
            {meta ? <Text style={[styles.actionMeta, { color: softColor }]} numberOfLines={1}>{meta}</Text> : null}
          </>
        )}
      </View>
      {primary ? <Ionicons name="arrow-forward" size={20} color="#FFFFFF" /> : null}
    </TouchableOpacity>
  );
}

export function HomeActionsRow({
  onBinders,
  onTrade,
  onValueHistory,
  onScan,
  onSearch,
  onBuildTrade,
  onCommunity,
}: {
  ownedCount: number;
  listingCount?: number;
  onBinders: () => void;
  onTrade?: () => void;
  onValueHistory?: () => void;
  onScan?: () => void;
  onSearch?: () => void;
  onBuildTrade?: () => void;
  onCommunity?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.actionsStack}>
      <TouchableOpacity
        onPress={onScan ?? onValueHistory ?? onBinders}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Scan Card. Add or identify a card."
        style={styles.homeScanBarShell}
      >
        <LinearGradient
          colors={theme.gradients.actionPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.homeScanBar}
        >
          <StackrButtonPattern tone="purple" compact />
          <View style={styles.homeScanIconFrame}>
            <StackrCardActionIcon
              source={stackrIcons.scanCard}
              frameSize={52}
              artworkSize={40}
            />
          </View>
          <View style={styles.homeScanCopy}>
            <Text style={styles.homeScanTitle} numberOfLines={1}>Scan Card</Text>
            <Text style={styles.homeScanSubtitle} numberOfLines={1}>Add or identify</Text>
          </View>
          <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
      <View style={styles.secondaryActionsRow}>
        <HomeActionTile
          icon="search-outline"
          imageIcon={stackrIcons.searchCard}
          imageIconSize={34}
          title="Search"
          subtitle="Cards, sets, sealed"
          compactSubtitle
          onPress={onSearch ?? onValueHistory ?? onBinders}
        />
        <HomeActionTile
          icon="swap-horizontal-outline"
          imageIcon={stackrIcons.trade}
          title="Build Trade"
          subtitle="Use duplicates"
          onPress={onBuildTrade ?? onTrade ?? onBinders}
        />
      </View>
      {onCommunity ? (
        <TouchableOpacity
          onPress={onCommunity}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open Community. See what collectors are sharing."
          style={[
            styles.communityUtility,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.communityUtilityIcon}>
            <Image
              source={stackrIcons.social}
              style={styles.communityUtilityImageIcon as ImageStyle}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
          <View style={styles.communityUtilityCopy}>
            <Text style={[styles.communityUtilityTitle, { color: theme.colors.text }]}>Community</Text>
            <Text style={[styles.communityUtilitySubtitle, { color: theme.colors.textSoft }]} numberOfLines={1}>
              See what collectors are sharing
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
        </TouchableOpacity>
      ) : null}
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
  const hasBinder = Boolean(!isLoading && !error && binder);
  const [setLogoFailed, setSetLogoFailed] = React.useState(false);
  const setLogoSource = binder?.type === 'official'
    ? getJapaneseSetLogoSourceForSet({
      id: binder.sourceSetId,
      language: binder.sourceSetLanguage,
      name: binder.name,
      englishDisplayName: binder.name,
    })
    : null;
  const setLogoUrl = binder?.type === 'official' && !setLogoSource
    ? binder.sourceSetLogoUrl
      ?? binder.sourceSetSymbolUrl
      ?? getPokemonSetLogoUrl(binder.sourceSetId, binder.sourceSetLanguage)
    : undefined;
  const customNameArt = binder?.type === 'custom' ? getCustomBinderNameArt(binder.customNameArtKey) : null;
  const showsCompletion = binder?.type === 'official';
  const topValueCards = binder?.topValueCards ?? [];
  const binderDisplayName = binder?.name?.trim().toLowerCase() === 'all my owned hits'
    ? 'Owned Hits'
    : binder?.name ?? '';
  const ownedLabel = binder
    ? `${binder.owned} card${binder.owned === 1 ? '' : 's'} owned`
    : '';
  const binderModeLabel = binder?.cardMode === 'graded' ? 'Graded binder' : 'Custom binder';
  const binderMetaLabel = binder
    ? showsCompletion
      ? `${binder.completionPercent}% complete | ${binder.owned} / ${binder.total} owned`
      : `${ownedLabel} | ${binderModeLabel}`
    : '';
  const compactCountLabel = binder
    ? showsCompletion
      ? `${binder.missing} card${binder.missing === 1 ? '' : 's'} left`
      : ownedLabel
    : '';
  const compactStatusLabel = binder
    ? showsCompletion
      ? `${binder.completionPercent}% complete`
      : binderModeLabel
    : '';
  const rankedCards = [
    { rank: '2ND', card: topValueCards[1], featured: false },
    { rank: 'TOP', card: topValueCards[0], featured: true },
    { rank: '3RD', card: topValueCards[2], featured: false },
  ];

  React.useEffect(() => {
    setSetLogoFailed(false);
  }, [binder?.sourceSetId, binder?.sourceSetLanguage, setLogoSource, setLogoUrl]);

  return (
    <View style={styles.continueBinderSection}>
      <View style={styles.continueBinderShell}>
        <View pointerEvents="none" style={styles.continueEdgeHeading}>
          <Text style={[styles.continueEdgeHeadingText, { color: theme.colors.text }]}>Continue Binder</Text>
        </View>
        <View
          style={[
            styles.card,
            hasBinder && styles.continueBinderCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
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
            <View style={styles.continueHeading}>
              <View style={styles.continueTitleBlock}>
                <Text style={[styles.binderName, { color: theme.colors.text }]} numberOfLines={1}>{binderDisplayName}</Text>
                <Text style={[styles.binderMeta, { color: theme.colors.textSoft }]}>
                  {binderMetaLabel}
                </Text>
              </View>
            </View>

            <View style={[styles.continueGrailPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <TouchableOpacity onPress={() => onView(binder.id)} activeOpacity={0.86} style={styles.binderHeroButton}>
                {binder.cardMode === 'graded' || binder.masterSetEnabled ? (
                  <View pointerEvents="none" style={styles.continueBinderModeBadges}>
                    {binder.cardMode === 'graded' ? <BinderModeIconBadge type="graded" size={36} /> : null}
                    {binder.masterSetEnabled ? <BinderModeIconBadge type="master" size={36} /> : null}
                  </View>
                ) : null}
                <BinderArtwork
                  coverKey={binder.coverKey}
                  sourceSetId={binder.type === 'official' ? binder.sourceSetId : null}
                  sourceSetLanguage={binder.type === 'official' ? binder.sourceSetLanguage : null}
                  setName={binder.type === 'official' ? binder.name : null}
                  fallbackLogoUrl={setLogoUrl}
                  fallbackLogoSource={setLogoSource}
                  fallbackArtSource={customNameArt?.source ?? null}
                  progress={showsCompletion ? binder.completionPercent : 0}
                  width={138}
                  stageHeight={142}
                  plateWidth={112}
                  plateHeight={124}
                  artworkWidth={106}
                  artworkHeight={124}
                  progressWidth={96}
                  progressHeight={4}
                  showProgressBar={showsCompletion}
                  showProgressText={false}
                />
                <View style={[styles.continueProgressDock, customNameArt && styles.continueProgressDockCentered]}>
                  {showsCompletion ? (
                    <LinearGradient
                      colors={[HOME_HERO_LIFT, HOME_HERO_MID, HOME_HERO_PRIMARY]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.continueProgressBadge}
                    >
                      <StackrButtonPattern tone="purple" compact />
                      <Text numeric style={styles.continueProgressBadgeText}>{binder.completionPercent}%</Text>
                    </LinearGradient>
                  ) : null}
                  {customNameArt ? (
                    <Image
                      source={customNameArt.source}
                      style={[
                        styles.continueProgressCustomNameArt,
                        styles.continueProgressCustomNameArtCentered,
                      ] as ImageStyle}
                      resizeMode="contain"
                      accessibilityLabel={`${binderDisplayName} custom binder title art`}
                    />
                  ) : setLogoSource && !setLogoFailed ? (
                    <StackrImage
                      source={setLogoSource}
                      style={styles.continueProgressSetLogo}
                      contentFit="contain"
                      accessibilityLabel={`${binderDisplayName} official set logo`}
                      onError={() => setSetLogoFailed(true)}
                      priority="low"
                      showFallbackIcon={false}
                      placeholderColor="transparent"
                    />
                  ) : setLogoUrl && !setLogoFailed ? (
                    <StackrImage
                      uri={setLogoUrl}
                      style={styles.continueProgressSetLogo}
                      contentFit="contain"
                      accessibilityLabel={`${binderDisplayName} official set logo`}
                      onError={() => setSetLogoFailed(true)}
                      priority="low"
                      showFallbackIcon={false}
                      placeholderColor="transparent"
                    />
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.grailColumn}>
                <View style={styles.grailTitleRow}>
                  <Ionicons name="sparkles" size={13} color={theme.colors.secondary} />
                  <Text style={[styles.grailTitle, { color: theme.colors.textSoft }]}>My Top Grails</Text>
                </View>
                <View style={styles.grailTierRow}>
                  {rankedCards.map((item) => (
                    <View
                      key={item.rank}
                      style={[
                        styles.grailCardSlot,
                        item.featured && styles.grailCardSlotFeatured,
                        {
                          borderColor: item.featured ? `${HOME_HERO_PRIMARY}55` : theme.colors.border,
                          backgroundColor: theme.colors.card,
                        },
                      ]}
                    >
                      {item.featured ? (
                        <Image source={crownRankSource} style={styles.grailCrownRank as ImageStyle} resizeMode="contain" />
                      ) : (
                        <Text style={[styles.grailRank, { color: theme.colors.textSoft }]}>{item.rank}</Text>
                      )}
                      {item.card?.imageUrl ? (
                        item.featured ? (
                          <View style={styles.grailFeaturedImageGlow}>
                            <StackrImage
                              uri={item.card.imageUrl}
                              style={[styles.grailCardImage, styles.grailCardImageFeatured]}
                              contentFit="contain"
                              priority="normal"
                              showFallbackIcon={false}
                            />
                          </View>
                        ) : (
                          <StackrImage
                            uri={item.card.imageUrl}
                            style={styles.grailCardImage}
                            contentFit="contain"
                            priority="low"
                            showFallbackIcon={false}
                          />
                        )
                      ) : (
                        <View style={[styles.grailCardImage, styles.grailCardPlaceholder, item.featured && styles.grailCardImageFeatured]}>
                          <Ionicons name="sparkles-outline" size={18} color={HOME_HERO_PRIMARY} />
                        </View>
                      )}
                      <Text style={[styles.grailValue, { color: item.featured ? HOME_HERO_PRIMARY : theme.colors.text }]} numberOfLines={1}>
                        {item.card?.estimatedValue != null ? formatMoney(item.card.estimatedValue) : '--'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.continueCompactStatRow}>
              <Text style={[styles.continueCompactStatText, { color: theme.colors.text }]} numberOfLines={1}>
                {compactCountLabel}
              </Text>
              <Text style={[styles.continueStatDivider, { color: theme.colors.textSoft }]}>|</Text>
              <Text style={[styles.continueCompactStatText, { color: theme.colors.text }]} numberOfLines={1}>
                {binder.valueAvailable
                  ? `${formatMoney(binder.value)}${binder.valueCoverageLabel ? ' known' : ' est. value'}`
                  : 'Price unavailable'}
              </Text>
              <Text style={[styles.continueStatDivider, { color: theme.colors.textSoft }]}>|</Text>
              <Text style={[styles.continueCompactStatText, { color: HOME_HERO_PRIMARY }]} numberOfLines={1}>
                {compactStatusLabel}
              </Text>
            </View>
            {showsCompletion && binder.missing > 0 ? (
              <Text style={[styles.continueHelperLine, { color: theme.colors.textSoft }]} numberOfLines={1}>
                Almost there - {binder.missing} card{binder.missing === 1 ? '' : 's'} to complete this binder
              </Text>
            ) : null}

            <View style={styles.continueCtaRow}>
              <TouchableOpacity onPress={() => onView(binder.id)} activeOpacity={0.84} style={styles.continuePrimaryCtaShell}>
                <LinearGradient
                  colors={theme.gradients.actionPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.continuePrimaryCta}
                >
                  <StackrButtonPattern tone="purple" />
                  <Text style={styles.continuePrimaryCtaText} numberOfLines={1}>View Binder</Text>
                  <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>
              <StackrActionButton
                title="Scan to Binder"
                imageIcon={stackrIcons.scanCard}
                variant="secondary"
                size="compact"
                showArrow={false}
                onPress={() => onScan(binder.id)}
                accessibilityLabel={`Scan to ${binder.name}`}
                style={{ flex: 1, minHeight: HOME_TOKENS.touch.comfortable }}
              />
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
    </View>
  );
}

function DuplicateResultCard({ item }: { item: HomeDuplicateItem }) {
  const { theme } = useTheme();
  const setLogoSource = item.setId ? getJapaneseSetLogoSourceForSet({ id: item.setId }) : null;
  const setLogoUrl = item.setId && !setLogoSource ? getPokemonSetLogoUrl(item.setId) : undefined;
  const reveal = React.useRef(new Animated.Value(0)).current;
  const translateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  React.useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [item.cardId, item.extraQuantity, item.setId, reveal]);

  return (
    <Animated.View style={{ opacity: reveal, transform: [{ translateY }] }}>
      <View style={[styles.duplicateRailCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={styles.duplicateArtFrame}>
          {item.imageUrl ? (
            <StackrImage
              uri={item.imageUrl}
              style={styles.duplicateArtImage}
              contentFit="contain"
              priority="low"
              showFallbackIcon={false}
            />
          ) : (
            <View style={[styles.duplicateArtImage, styles.rowCardPlaceholder, { backgroundColor: theme.colors.card }]}>
              <Ionicons name="albums-outline" size={24} color={HOME_HERO_PRIMARY} />
            </View>
          )}
          <LinearGradient
            colors={[HOME_HERO_LIFT, HOME_HERO_MID, HOME_HERO_PRIMARY]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.duplicateQuantityBadge}
          >
            <StackrButtonPattern tone="purple" compact />
            <Text numeric style={styles.duplicateQuantityText}>x{item.extraQuantity}</Text>
          </LinearGradient>
        </View>
        <View style={styles.duplicateRailCopy}>
          <Text style={[styles.rowTitle, styles.duplicateRailTitle, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
          {setLogoSource ? (
            <StackrImage
              source={setLogoSource}
              style={styles.duplicateSetLogo}
              contentFit="contain"
              priority="low"
              showFallbackIcon={false}
            />
          ) : setLogoUrl ? (
            <StackrImage
              uri={setLogoUrl}
              style={styles.duplicateSetLogo}
              contentFit="contain"
              priority="low"
              showFallbackIcon={false}
            />
          ) : (
            <Text style={[styles.rowSub, styles.duplicateRailSetText, { color: theme.colors.textSoft }]} numberOfLines={1}>{item.setName}</Text>
          )}
          <Text style={[styles.duplicateRailValue, { color: HOME_HERO_PRIMARY }]} numberOfLines={1}>
            {item.estimatedValueAvailable ? formatMoney(item.estimatedValue) : 'Price unavailable'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function DuplicateSummaryBar({
  count,
  value,
  valueAvailable,
}: {
  count: number;
  value: number;
  valueAvailable?: boolean;
}) {
  return (
    <LinearGradient
      colors={stackrGradients.actionLight}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.duplicateSummaryBar}
    >
      <StackrButtonPattern tone="light" />
      <View style={styles.duplicateSummaryMain}>
        <View style={styles.duplicateSummaryIcon}>
          <Image source={stackrIcons.duplicates} style={styles.duplicateSummaryIconImage as ImageStyle} resizeMode="contain" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.duplicateSummaryTitle} numberOfLines={1}>
            {count} duplicate{count === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
      <View style={styles.duplicateSummaryValuePill}>
        <Text numeric style={styles.duplicateSummaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
          {valueAvailable ? formatMoney(value) : 'Unavailable'}
        </Text>
        <Text style={styles.duplicateSummaryValueLabel}>{valueAvailable ? 'known value' : 'price status'}</Text>
      </View>
    </LinearGradient>
  );
}

function DuplicateArtworkRail({
  items,
}: {
  items: HomeDuplicateItem[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.duplicateRail}
    >
      {items.map((item) => (
        <DuplicateResultCard key={`${item.setId ?? 'set'}:${item.cardId}`} item={item} />
      ))}
    </ScrollView>
  );
}

function DuplicatesHeader({
  count,
  value,
  valueAvailable,
}: {
  count: number;
  value: number;
  valueAvailable?: boolean;
}) {
  return (
    <DuplicateSummaryBar count={count} value={value} valueAvailable={valueAvailable} />
  );
}

function DuplicateViewAllLink({
  onPress,
  inset = false,
}: {
  onPress: () => void;
  inset?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel="View all duplicates"
      style={[styles.duplicateTextLink, inset && styles.duplicateTextLinkInset]}
    >
      <Text style={styles.duplicateTextLinkText}>View all</Text>
      <Ionicons name="chevron-forward" size={14} color={HOME_HERO_PRIMARY} />
    </TouchableOpacity>
  );
}

function DuplicatePremiumBody({
  summary,
  visibleItems,
  insightText,
  matchCount,
}: {
  summary: HomeDuplicateSummary;
  visibleItems: HomeDuplicateItem[];
  insightText: string | null;
  matchCount: number;
}) {
  const { theme } = useTheme();
  return (
    <>
      <DuplicatesHeader
        count={summary.count}
        value={summary.estimatedValue}
        valueAvailable={summary.estimatedValueAvailable}
      />
      <DuplicateArtworkRail items={visibleItems} />

      {insightText ? (
        <View style={[styles.opportunityNote, { backgroundColor: HOME_HERO_SOFT }]}>
          <Ionicons name="sparkles-outline" size={16} color={HOME_HERO_PRIMARY} />
          <Text style={[styles.opportunityText, { color: theme.colors.text }]}>
            {insightText}
          </Text>
        </View>
      ) : null}
    </>
  );
}

export function DuplicatesCard({
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
  const visibleDuplicateItems = summary.items.slice(0, 10);

  return (
      <View style={styles.duplicatesSectionWrap}>
      <View style={styles.duplicatesSectionHeader}>
        <View style={styles.duplicatesTitleBlock}>
          <Text style={[styles.duplicatesSplitTitle, { color: theme.colors.text }]}>Duplicates</Text>
        </View>
      </View>
      <View style={[styles.card, styles.duplicatesCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          <>
            <SkeletonLine width="60%" height={22} />
            <SkeletonLine width="46%" />
            <SkeletonLine width="100%" height={54} />
          </>
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not load duplicates" subtitle={error} />
        ) : hasDuplicates ? (
          <DuplicatePremiumBody
            summary={summary}
            visibleItems={visibleDuplicateItems}
            insightText={null}
            matchCount={matchCount}
          />
        ) : (
          <EmptyMessage
            icon="copy-outline"
            imageIcon={stackrIcons.duplicates}
            imageIconSize={54}
            title="No duplicates yet"
            subtitle="Extra copies will appear here when you own more than one."
          />
        )}
        <DuplicateViewAllLink onPress={onAction} inset />
      </View>
    </View>
  );
}

function OpportunityRow({
  icon,
  imageIcon,
  title,
  subtitle,
  value,
  onPress,
}: {
  icon: IconName;
  imageIcon?: ImageSourcePropType;
  title: string;
  subtitle: string;
  value?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[styles.opportunityRowV2, { borderBottomColor: theme.colors.border }]}
    >
      <View style={styles.opportunityIconV2}>
        {imageIcon ? (
          <Image source={imageIcon} style={styles.opportunityImageIconV2 as ImageStyle} resizeMode="contain" />
        ) : (
          <Ionicons name={icon} size={20} color={HOME_HERO_PRIMARY} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.opportunityTitleV2, { color: theme.colors.text }]} numberOfLines={2}>{title}</Text>
        <Text style={[styles.opportunitySubV2, { color: theme.colors.textSoft }]} numberOfLines={2}>{subtitle}</Text>
      </View>
      {value ? (
        <Text style={styles.opportunityValueV2} numberOfLines={1}>{value}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

export function HomeOpportunitiesSection({
  duplicateSummary,
  chaseCount,
  marketMoverCount,
  isLoading,
  error,
  onDuplicates,
  onChase,
  onMarketMovers,
}: {
  duplicateSummary: HomeDuplicateSummary;
  chaseCount: number;
  marketMoverCount: number;
  isLoading: boolean;
  error?: string | null;
  onDuplicates: () => void;
  onChase: () => void;
  onMarketMovers: () => void;
}) {
  const { theme } = useTheme();
  const rows = [
    duplicateSummary.count > 0
      ? {
          key: 'duplicates',
          icon: 'copy-outline' as IconName,
          imageIcon: stackrIcons.duplicates,
          title: `${duplicateSummary.count} duplicate cop${duplicateSummary.count === 1 ? 'y' : 'ies'} to review`,
          subtitle: 'Sort, trade, or organise your extras',
          value: formatMoney(duplicateSummary.estimatedValue),
          onPress: onDuplicates,
        }
      : null,
    chaseCount > 0
      ? {
          key: 'chase',
          icon: 'heart-outline' as IconName,
          imageIcon: stackrIcons.chase,
          title: `${chaseCount} chase card${chaseCount === 1 ? '' : 's'} tracked`,
          subtitle: 'Watch prices and listing matches',
          value: 'View',
          onPress: onChase,
        }
      : null,
    marketMoverCount > 0
      ? {
          key: 'market',
          icon: 'analytics-outline' as IconName,
          imageIcon: stackrIcons.marketMovers,
          title: `${marketMoverCount} market mover${marketMoverCount === 1 ? '' : 's'} in your collection`,
          subtitle: 'Review cards affecting value',
          value: 'History',
          onPress: onMarketMovers,
        }
      : null,
  ].filter(Boolean) as {
    key: string;
    icon: IconName;
    imageIcon?: ImageSourcePropType;
    title: string;
    subtitle: string;
    value: string;
    onPress: () => void;
  }[];

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title="Opportunities" />
      <View style={[styles.card, styles.opportunitiesCardV2, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          [0, 1, 2].map((index) => (
            <View key={index} style={styles.opportunitySkeletonV2}>
              <View style={[styles.opportunityIconV2, { backgroundColor: theme.colors.surface }]} />
              <View style={{ flex: 1, gap: 7 }}>
                <SkeletonLine width="74%" height={13} />
                <SkeletonLine width="48%" height={9} />
              </View>
            </View>
          ))
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not load opportunities" subtitle={error} />
        ) : rows.length ? (
          rows.map((row, index) => (
            <View key={row.key} style={index === rows.length - 1 ? styles.opportunityLastRowV2 : undefined}>
              <OpportunityRow {...row} />
            </View>
          ))
        ) : (
          <EmptyMessage
            icon="albums-outline"
            title="No opportunities yet"
            subtitle="Add cards to binders or track chase cards to surface trades and market changes."
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
  const isChase = mode === 'chase';
  const title = mode === 'chase' ? 'Your Chase List' : `Missing${binderName ? ` from ${binderName}` : ' Cards'}`;
  const subtitle = mode === 'chase'
    ? `${items.length || 0} card${items.length === 1 ? '' : 's'} you are hunting`
    : 'A clear next goal for your binder';

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader
        title={title}
        subtitle={subtitle}
        actionLabel="View all"
        onAction={onViewAll}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          <View style={[styles.previewRail, isChase && styles.chasePreviewRail]}>
            {[0, 1, 2].map((index) => (
              <View key={index} style={[isChase ? styles.chasePreviewSkeleton : styles.previewSkeleton, { backgroundColor: theme.colors.surface }]} />
            ))}
          </View>
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title={mode === 'chase' ? 'Could not load chase cards' : 'Could not load missing cards'} subtitle={error} />
        ) : items.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.previewRail, isChase && styles.chasePreviewRail]}>
            {items.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={`${item.setId ?? 'set'}:${item.cardId}`}
                onPress={() => onItemPress(item)}
                activeOpacity={0.84}
                style={[
                  isChase ? styles.chasePreviewCard : styles.previewCard,
                  { borderColor: theme.colors.border, backgroundColor: isChase ? '#F1ECFF' : theme.colors.surface },
                ]}
              >
                <View style={[isChase ? styles.chasePreviewImage : styles.previewImage, styles.previewImageFrame, { backgroundColor: theme.colors.surface }]}>
                  {item.imageUrl ? (
                    <StackrImage
                      uri={item.imageUrl}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                      priority="low"
                      showFallbackIcon={false}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.previewPlaceholder]}>
                      <Ionicons name="albums-outline" size={25} color={HOME_HERO_PRIMARY} />
                    </View>
                  )}
                  <RaritySymbol
                    rarity={item.rarity}
                    size={isChase ? 15 : 13}
                    style={RARITY_SYMBOL_CARD_OVERLAY}
                  />
                </View>
                <View style={isChase ? styles.chasePreviewCopy : styles.previewCopy}>
                  <Text style={[isChase ? styles.chasePreviewTitle : styles.previewTitle, { color: theme.colors.text }]} numberOfLines={isChase ? 1 : 2}>{item.name}</Text>
                  <Text style={[isChase ? styles.chasePreviewSub : styles.previewSub, { color: theme.colors.textSoft }]} numberOfLines={1}>
                    {isChase ? item.setName : item.number ? `#${item.number}` : item.setName}
                  </Text>
                  <Text style={[isChase ? styles.chasePreviewAction : styles.previewValue, { color: HOME_HERO_PRIMARY }]} numberOfLines={1}>
                    {isChase ? item.estimatedValue != null ? formatMoney(item.estimatedValue) : 'Value pending' : item.estimatedValue != null ? formatMoney(item.estimatedValue) : 'View'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <EmptyMessage
            icon={mode === 'chase' ? 'heart-outline' : 'search-outline'}
            imageIcon={mode === 'chase' ? stackrIcons.chase : stackrIcons.searchCard}
            title={mode === 'chase' ? 'No chase cards yet' : 'No missing cards found'}
            subtitle={mode === 'chase' ? 'Mark wanted cards so Stackr can help you hunt them down.' : 'Open a binder to choose your next card.'}
            actionLabel={mode === 'chase' ? 'Search cards' : 'View Binders'}
            onAction={onEmptyAction}
          />
        )}
      </View>
    </View>
  );
}

export function ChaseCardsSheet({
  visible,
  items,
  isLoading,
  error,
  selectedCardId,
  listings,
  listingsLoading,
  listingsError,
  onClose,
  onSelectCard,
  onViewCard,
  onViewListing,
  onBrowseMarketplace,
  onAddChase,
  onRetryListings,
}: {
  visible: boolean;
  items: HomeCardPreview[];
  isLoading: boolean;
  error?: string | null;
  selectedCardId?: string | null;
  listings: HomeChaseListingSuggestion[];
  listingsLoading: boolean;
  listingsError?: string | null;
  onClose: () => void;
  onSelectCard: (item: HomeCardPreview) => void;
  onViewCard: (item: HomeCardPreview) => void;
  onViewListing: (listing: HomeChaseListingSuggestion) => void;
  onBrowseMarketplace: () => void;
  onAddChase: () => void;
  onRetryListings: () => void;
}) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedCard = items.find((item) => item.cardId === selectedCardId) ?? items[0] ?? null;
  const selectedSetLogoSource = selectedCard?.setId ? getJapaneseSetLogoSourceForSet({ id: selectedCard.setId }) : null;
  const selectedSetLogoUrl = selectedCard?.setId && !selectedSetLogoSource ? getPokemonSetLogoUrl(selectedCard.setId) : null;
  const cardWidth = Math.min(Math.max(width * 0.76, 244), 330);
  const sheetHeight = Math.min(height * 0.9, height - insets.top - 18);
  const estimatedValues = items
    .map((item) => item.estimatedValue)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const totalEstimated = estimatedValues.reduce((sum, value) => sum + value, 0);

  const renderListingCopy = (listing: HomeChaseListingSuggestion) => {
    const price = listing.askingPrice != null ? `guide price ${formatMoney(listing.askingPrice)}` : listing.tradeOnly ? 'trade proposals' : 'offers open';
    if (listing.sellerDisplayName) {
      return `${listing.sellerDisplayName} has a browse-only listing for ${selectedCard?.name ?? 'this card'} · ${price}.`;
    }
    return `${selectedCard?.name ?? 'This card'} has a browse-only listing · ${price}.`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.chaseSheetBackdrop}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <View
          style={[
            styles.chaseSheet,
            {
              height: sheetHeight,
              backgroundColor: theme.colors.bg,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.chaseSheetHandle} />
          <View style={styles.chaseSheetHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.chaseSheetTitle, { color: theme.colors.text }]}>Chase List</Text>
              <Text style={[styles.chaseSheetSubtitle, { color: theme.colors.textSoft }]}>Track cards you are hunting.</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.78}
              style={[styles.chaseSheetClose, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Close Chase List"
            >
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={[styles.chaseSheetStateCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <ActivityIndicator color={HOME_HERO_PRIMARY} />
              <Text style={[styles.chaseSheetStateTitle, { color: theme.colors.text }]}>Loading chase cards</Text>
              <Text style={[styles.chaseSheetStateCopy, { color: theme.colors.textSoft }]}>Getting your hunt list ready.</Text>
            </View>
          ) : error ? (
            <View style={[styles.chaseSheetStateCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Ionicons name="alert-circle-outline" size={26} color={HOME_HERO_PRIMARY} />
              <Text style={[styles.chaseSheetStateTitle, { color: theme.colors.text }]}>Could not load chase cards</Text>
              <Text style={[styles.chaseSheetStateCopy, { color: theme.colors.textSoft }]}>{error}</Text>
            </View>
          ) : !items.length ? (
            <View style={[styles.chaseSheetStateCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Image source={stackrIcons.chase} style={styles.chaseSheetEmptyIcon as ImageStyle} resizeMode="contain" />
              <Text style={[styles.chaseSheetStateTitle, { color: theme.colors.text }]}>No chase cards yet</Text>
              <Text style={[styles.chaseSheetStateCopy, { color: theme.colors.textSoft }]}>
                Add cards you are hunting to track value and find listings.
              </Text>
              <TouchableOpacity onPress={onAddChase} activeOpacity={0.82} style={styles.chaseSheetPrimaryAction}>
                <Text style={styles.chaseSheetPrimaryActionText}>Search cards</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.chaseSheetScrollContent, { paddingBottom: insets.bottom + 28 }]}
            >
              <View style={[styles.chaseSummaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <View>
                  <Text style={[styles.chaseSummaryValue, { color: theme.colors.text }]}>{items.length}</Text>
                  <Text style={[styles.chaseSummaryLabel, { color: theme.colors.textSoft }]}>chase cards</Text>
                </View>
                <View style={styles.chaseSummaryDivider} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chaseSummaryValue, { color: HOME_HERO_PRIMARY }]}>
                    {estimatedValues.length ? formatMoney(totalEstimated) : 'Unavailable'}
                  </Text>
                  <Text style={[styles.chaseSummaryLabel, { color: theme.colors.textSoft }]}>estimated value</Text>
                </View>
                <View style={styles.chaseSummaryDivider} />
                <View>
                  <Text style={[styles.chaseSummaryValue, { color: theme.colors.text }]}>{listings.length}</Text>
                  <Text style={[styles.chaseSummaryLabel, { color: theme.colors.textSoft }]}>matches</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + 14}
                decelerationRate="fast"
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 14));
                  const nextCard = items[Math.max(0, Math.min(items.length - 1, nextIndex))];
                  if (nextCard) onSelectCard(nextCard);
                }}
                contentContainerStyle={styles.chaseCarouselContent}
              >
                {items.map((item) => {
                  const selected = item.cardId === selectedCard?.cardId;
                  const setLogoSource = item.setId ? getJapaneseSetLogoSourceForSet({ id: item.setId }) : null;
                  const setLogoUrl = item.setId && !setLogoSource ? getPokemonSetLogoUrl(item.setId) : null;
                  return (
                    <TouchableOpacity
                      key={`${item.cardId}:${item.setId ?? 'set'}`}
                      onPress={() => onSelectCard(item)}
                      activeOpacity={0.86}
                      style={[
                        styles.chaseCarouselCard,
                        {
                          width: cardWidth,
                          backgroundColor: theme.colors.card,
                          borderColor: selected ? HOME_HERO_PRIMARY : theme.colors.border,
                        },
                        selected && styles.chaseCarouselCardSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${item.name}`}
                    >
                      {item.imageUrl ? (
                        <StackrImage
                          uri={item.imageUrl}
                          style={styles.chaseCarouselImage}
                          contentFit="contain"
                          priority={selected ? 'normal' : 'low'}
                          showFallbackIcon={false}
                        />
                      ) : (
                        <View style={[styles.chaseCarouselImage, styles.previewPlaceholder]}>
                          <Ionicons name="albums-outline" size={30} color={HOME_HERO_PRIMARY} />
                        </View>
                      )}
                      <View style={styles.chaseCarouselCopy}>
                        <Text style={[styles.chaseCarouselTitle, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
                        <View style={styles.chaseCarouselSetRow}>
                          {setLogoSource ? (
                            <StackrImage
                              source={setLogoSource}
                              style={styles.chaseCarouselSetLogo}
                              contentFit="contain"
                              priority="low"
                              showFallbackIcon={false}
                              placeholderColor="transparent"
                            />
                          ) : setLogoUrl ? (
                            <StackrImage
                              uri={setLogoUrl}
                              style={styles.chaseCarouselSetLogo}
                              contentFit="contain"
                              priority="low"
                              showFallbackIcon={false}
                              placeholderColor="transparent"
                            />
                          ) : (
                            <View style={[styles.chaseSetFallback, { borderColor: theme.colors.border }]}>
                              <Ionicons name="albums-outline" size={14} color={HOME_HERO_PRIMARY} />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.chaseCarouselPrice, { color: HOME_HERO_PRIMARY }]} numberOfLines={1}>
                          {item.estimatedValue != null ? `Est. ${formatMoney(item.estimatedValue)}` : 'Estimated value unavailable'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedCard ? (
                <View style={[styles.chaseDetailPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                  <View style={styles.chaseDetailHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.chaseDetailTitle, { color: theme.colors.text }]} numberOfLines={2}>{selectedCard.name}</Text>
                      <View style={styles.chaseDetailSetRow}>
                        {selectedSetLogoSource ? (
                          <StackrImage
                            source={selectedSetLogoSource}
                            style={styles.chaseDetailSetLogo}
                            contentFit="contain"
                            priority="low"
                            showFallbackIcon={false}
                            placeholderColor="transparent"
                          />
                        ) : selectedSetLogoUrl ? (
                          <StackrImage
                            uri={selectedSetLogoUrl}
                            style={styles.chaseDetailSetLogo}
                            contentFit="contain"
                            priority="low"
                            showFallbackIcon={false}
                            placeholderColor="transparent"
                          />
                        ) : (
                          <View style={[styles.chaseSetFallback, { borderColor: theme.colors.border }]}>
                            <Ionicons name="albums-outline" size={14} color={HOME_HERO_PRIMARY} />
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.chaseDetailValue, { color: HOME_HERO_PRIMARY }]} numberOfLines={1}>
                      {selectedCard.estimatedValue != null ? formatMoney(selectedCard.estimatedValue) : 'Value unavailable'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => onViewCard(selectedCard)} activeOpacity={0.82} style={styles.chaseDetailAction}>
                    <Text style={styles.chaseDetailActionText}>View card</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={[styles.chaseInsightPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <View style={styles.chaseInsightHeader}>
                  <View style={styles.chaseInsightIcon}>
                    <Image source={MINTY_REV2_SOURCE} style={styles.chaseInsightMascot as ImageStyle} resizeMode="contain" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.chaseInsightTitle, { color: theme.colors.text }]}>
                      {listingsLoading ? 'Checking listings' : listingsError ? 'Could not check listings' : listings.length ? 'Minty found matches' : 'No match right now'}
                    </Text>
                    <Text style={[styles.chaseInsightCopy, { color: theme.colors.textSoft }]}>
                      {listingsLoading
                        ? 'Looking for listings that match this chase card.'
                        : listingsError
                          ? 'Try again, or browse The Market yourself.'
                          : listings.length
                            ? 'Compare condition and price before deciding.'
                            : 'This chase card is not listed in The Market right now.'}
                    </Text>
                  </View>
                </View>

                {listingsLoading ? (
                  <View style={styles.chaseInsightLoadingRow}>
                    <ActivityIndicator color={HOME_HERO_PRIMARY} />
                    <Text style={[styles.chaseInsightCopy, { color: theme.colors.textSoft }]}>Checking current listings</Text>
                  </View>
                ) : listingsError ? (
                  <View style={styles.chaseInsightActions}>
                    <TouchableOpacity onPress={onRetryListings} activeOpacity={0.82} style={styles.chaseInsightGhostAction}>
                      <Text style={[styles.chaseInsightGhostActionText, { color: HOME_HERO_PRIMARY }]}>Try again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onBrowseMarketplace} activeOpacity={0.82} style={styles.chaseInsightGhostAction}>
                      <Text style={[styles.chaseInsightGhostActionText, { color: HOME_HERO_PRIMARY }]}>Browse The Market</Text>
                    </TouchableOpacity>
                  </View>
                ) : listings.length ? (
                  <View style={styles.chaseListingStack}>
                    {listings.slice(0, 4).map((listing) => (
                      <TouchableOpacity
                        key={listing.id}
                        onPress={() => onViewListing(listing)}
                        activeOpacity={0.84}
                        style={[styles.chaseListingRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                        accessibilityRole="button"
                        accessibilityLabel="View The Market listing"
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.chaseListingCopy, { color: theme.colors.text }]} numberOfLines={2}>
                            {renderListingCopy(listing)}
                          </Text>
                          <Text style={[styles.chaseListingMeta, { color: theme.colors.textSoft }]} numberOfLines={1}>
                            {[listing.condition, listing.tradeOnly ? 'Trade' : 'Offers'].filter(Boolean).join(' - ')}
                          </Text>
                        </View>
                        <Text style={[styles.chaseListingActionText, { color: HOME_HERO_PRIMARY }]}>View</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TouchableOpacity onPress={onBrowseMarketplace} activeOpacity={0.82} style={styles.chaseInsightGhostAction}>
                    <Text style={[styles.chaseInsightGhostActionText, { color: HOME_HERO_PRIMARY }]}>Browse The Market</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
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
  const [activityExpanded, setActivityExpanded] = React.useState(false);
  const visibleLimit = activityExpanded ? 10 : 2;
  const visibleItems = items.slice(0, visibleLimit);
  const canExpandActivity = items.length > 2;
  const expandedCount = Math.min(items.length, 10);
  const hiddenActivityCount = Math.max(0, expandedCount - 2);
  const firstActivityId = items[0]?.id;

  React.useEffect(() => {
    setActivityExpanded(false);
  }, [items.length, firstActivityId]);

  return (
    <View style={{ marginBottom: 20 }}>
      <HomeSectionHeader title="Recent Activity" subtitle="Your latest collection moves" />
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isLoading ? (
          [0, 1].map((index) => (
            <View key={index} style={styles.activitySkeletonRow}>
              <View style={[styles.activityCardThumb, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
              <View style={{ flex: 1 }}>
                <SkeletonLine width="72%" height={14} />
                <SkeletonLine width="48%" height={10} />
              </View>
            </View>
          ))
        ) : error ? (
          <EmptyMessage icon="alert-circle-outline" title="Could not refresh recent activity" subtitle={error} actionLabel="Retry" onAction={onRetry} />
        ) : visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item, index) => {
              const visual = activityVisuals[getActivityType(item)];
              const timestamp = formatRelativeTime(item.createdAt);

              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => onItemPress(item)}
                  activeOpacity={0.78}
                  style={[
                    styles.activityRow,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth: index === visibleItems.length - 1 && !canExpandActivity ? 0 : 1,
                    },
                  ]}
                >
                  <View style={[styles.activityCardThumb, { backgroundColor: `${visual.color}10`, borderColor: `${visual.color}2B` }]}>
                    {item.imageUrl ? (
                      <StackrImage
                        uri={item.imageUrl}
                        style={styles.activityCardImage}
                        contentFit="contain"
                        priority="low"
                        showFallbackIcon={false}
                      />
                    ) : (
                      <View style={styles.activityImageFallback}>
                        {visual.imageIcon ? (
                          <Image source={visual.imageIcon} style={styles.activityFallbackImage as ImageStyle} resizeMode="contain" />
                        ) : (
                          <Ionicons name={item.icon ?? visual.icon} size={17} color={visual.color} />
                        )}
                      </View>
                    )}
                    <View style={[styles.activityBadge, { backgroundColor: visual.color }]}>
                      {visual.imageIcon ? (
                        <Image source={visual.imageIcon} style={styles.activityBadgeImage as ImageStyle} resizeMode="contain" />
                      ) : (
                        <Ionicons name={visual.icon} size={10} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.activityTitleRow}>
                      <Text style={[styles.activityTitle, { color: theme.colors.text }]} numberOfLines={2}>{item.title}</Text>
                      <Text style={[styles.activityTag, { color: visual.color, backgroundColor: `${visual.color}12` }]} numberOfLines={1}>
                        {visual.label}
                      </Text>
                    </View>
                    <Text style={[styles.activitySub, { color: theme.colors.textSoft }]} numberOfLines={2}>
                      {item.subtitle ? `${item.subtitle} - ${timestamp}` : timestamp}
                    </Text>
                  </View>
                  {item.valueChange != null ? (
                    <Text style={[styles.activityValue, { color: item.isPositive === false ? REMOVED_ACTIVITY_COLOR : '#10B981' }]}>
                      {item.valueChange > 0 ? '+' : ''}{formatMoney(item.valueChange)}
                    </Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
                  )}
                </TouchableOpacity>
              );
            })}
            {canExpandActivity ? (
              <TouchableOpacity
                onPress={() => setActivityExpanded((current) => !current)}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={activityExpanded ? 'Show fewer recent activities' : `Show ${hiddenActivityCount} more recent activities`}
                style={[styles.activityExpandButton, { backgroundColor: HOME_HERO_SOFT, borderColor: HOME_HERO_BORDER }]}
              >
                <Text style={[styles.activityExpandText, { color: HOME_HERO_PRIMARY }]}>
                  {activityExpanded ? 'Show less' : `Show ${hiddenActivityCount} more`}
                </Text>
                <Ionicons name={activityExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={HOME_HERO_PRIMARY} />
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <EmptyMessage
            icon="time-outline"
            title="No activity yet"
            subtitle="Your scans, trades and binder updates will appear here."
          />
        )}
      </View>
    </View>
  );
}

export function TradeProtectionSummaryCard({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const [activeTierIndex, setActiveTierIndex] = React.useState<number | null>(null);
  const tiers = [
    {
      label: 'Bronze',
      range: 'Under \u00A320',
      status: 'Self-Verified',
      method: 'Customer-to-customer trust',
      color: '#A97142',
      source: tradeTierAssets.bronze,
      process: [
        'Both collectors confirm card details, condition and trade terms.',
        'Photos and messages stay attached to the trade record.',
        'Best for low-value swaps where speed and mutual trust matter.',
      ],
    },
    {
      label: 'Silver',
      range: '\u00A320-\u00A3250',
      status: 'AI-Checked',
      method: 'Robo Grade assisted',
      color: '#6E7890',
      source: tradeTierAssets.silver,
      process: [
        'Stackr checks submitted images and listing details for obvious mismatches.',
        'Robo Grade assists with condition confidence before both sides confirm.',
        'Best for mid-value trades that need extra assurance without full manual review.',
      ],
    },
    {
      label: 'Gold',
      range: '\u00A3250+',
      status: 'Fully Verified',
      method: 'AI + human verification',
      color: '#B7791F',
      source: tradeTierAssets.gold,
      process: [
        'AI pre-checks the card, condition signals and trade details.',
        'A human verification step reviews high-value trade evidence.',
        'Best for grails and premium trades where confidence matters most.',
      ],
    },
  ];
  const activeTier = activeTierIndex == null ? null : tiers[activeTierIndex];

  return (
    <View
      style={[styles.protectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
    >
      <View style={styles.protectionHeader}>
        <View style={styles.protectionIcon}>
          <Image source={stackrIcons.protect} style={styles.protectionIconImage as ImageStyle} resizeMode="contain" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.protectionTitle, { color: theme.colors.text }]}>Trade protection, matched to value</Text>
          <Text style={[styles.protectionCopy, { color: theme.colors.textSoft }]}>Clear checks for every trade tier, without slowing down simple swaps.</Text>
        </View>
      </View>
      <View style={styles.tierRow}>
        {tiers.map((tier, index) => (
          <TouchableOpacity
            key={tier.label}
            onPress={() => setActiveTierIndex(index)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`${tier.label} trade protection. ${tier.range}. ${tier.status}. Open process details.`}
            style={[styles.tierPill, { backgroundColor: `${tier.color}0D`, borderColor: `${tier.color}36`, shadowColor: tier.color }]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={[`${tier.color}22`, 'rgba(255,255,255,0.92)', `${tier.color}0F`]}
              locations={[0, 0.46, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tierPillGradient}
            />
            <View pointerEvents="none" style={[styles.tierTopGlow, { backgroundColor: `${tier.color}28`, shadowColor: tier.color }]} />
            <Image source={tier.source} style={styles.tierImage as ImageStyle} resizeMode="contain" />
            <View style={[styles.tierAccent, { backgroundColor: tier.color }]} />
            <Text style={[styles.tierLabel, { color: theme.colors.text }]} numberOfLines={1}>{tier.label}</Text>
            <Text style={[styles.tierRange, { color: tier.color }]} numberOfLines={1}>{tier.range}</Text>
            <Text style={[styles.tierStatus, { color: theme.colors.text }]} numberOfLines={1}>{tier.status}</Text>
            <Text style={[styles.tierSubLabel, { color: theme.colors.textSoft }]} numberOfLines={2}>{tier.method}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel="View trade centre"
        style={styles.protectionAction}
      >
        <Text style={[styles.sectionActionText, { color: HOME_HERO_PRIMARY }]}>View trade centre</Text>
        <Ionicons name="chevron-forward" size={14} color={HOME_HERO_PRIMARY} />
      </TouchableOpacity>

      <Modal
        visible={Boolean(activeTier)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveTierIndex(null)}
      >
        <View style={styles.tierModalBackdrop}>
          <View style={[styles.tierModalCard, { backgroundColor: theme.colors.card, borderColor: activeTier?.color ?? theme.colors.border }]}>
            {activeTier ? (
              <>
                <View style={styles.tierModalHeader}>
                  <View style={styles.tierModalIcon}>
                    <Image source={activeTier.source} style={styles.tierModalImage as ImageStyle} resizeMode="contain" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.tierModalTitle, { color: theme.colors.text }]}>{activeTier.label}</Text>
                    <Text style={[styles.tierModalMeta, { color: activeTier.color }]}>{activeTier.range} | {activeTier.status}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setActiveTierIndex(null)}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel="Close trade protection details"
                    style={[styles.tierModalClose, { backgroundColor: theme.colors.surface }]}
                  >
                    <Ionicons name="close" size={18} color={theme.colors.textSoft} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.tierModalMethod, { color: theme.colors.textSoft }]}>{activeTier.method}</Text>
                <View style={styles.tierModalSteps}>
                  {activeTier.process.map((step, index) => (
                    <View key={step} style={styles.tierModalStep}>
                      <Text numeric style={[styles.tierModalStepNumber, { color: activeTier.color }]}>{index + 1}</Text>
                      <Text style={[styles.tierModalStepText, { color: theme.colors.text }]}>{step}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    position: 'relative',
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
  },
  sectionSubtitle: {
    ...typeScale.support,
    fontSize: 12,
    marginTop: 3,
  },
  sectionAction: {
    minHeight: HOME_TOKENS.touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  sectionActionText: {
    ...typeScale.buttonSecondary,
    fontSize: 12,
  },
  actionsStack: {
    gap: 10,
    marginTop: 0,
    marginBottom: 16,
  },
  homeScanBarShell: {
    borderRadius: HOME_TOKENS.radius.xl,
    overflow: 'hidden',
    ...cardShadow,
  },
  homeScanBar: {
    minHeight: 74,
    borderRadius: HOME_TOKENS.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  homeScanIconFrame: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeScanCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  homeScanTitle: {
    ...typeScale.cardTitle,
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  homeScanSubtitle: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionTile: {
    flex: 1,
    minHeight: HOME_TOKENS.touch.min,
    borderRadius: HOME_TOKENS.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  actionTilePrimary: {
    minHeight: 72,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionTileSecondary: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionIcon: {
    width: HOME_TOKENS.icons.container,
    height: HOME_TOKENS.icons.container,
    borderRadius: HOME_TOKENS.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  actionIconSecondary: {
    backgroundColor: HOME_HERO_SOFT,
  },
  actionImageIconFrame: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconMarket: {
    width: HOME_TOKENS.touch.iconButton,
    height: HOME_TOKENS.touch.iconButton,
    borderRadius: HOME_TOKENS.radius.md,
    backgroundColor: HOME_HERO_PRIMARY,
    overflow: 'hidden',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  actionImageIcon: {
    width: 30,
    height: 30,
  },
  actionImageIconMarket: {
    width: 120,
    height: 120,
    transform: [{ translateY: 1 }],
  },
  actionCopyPrimary: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 4,
  },
  actionCopySecondary: {
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
  },
  actionTitle: {
    ...typeScale.cardTitle,
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
    width: '100%',
  },
  actionTitlePrimary: {
    textAlign: 'left',
    fontSize: 18,
    lineHeight: 23,
  },
  actionSubtitle: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  actionSubtitleCompact: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  actionMeta: {
    ...typeScale.micro,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  communityUtility: {
    minHeight: HOME_TOKENS.touch.min,
    borderRadius: HOME_TOKENS.radius.md,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  communityUtilityIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: HOME_HERO_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityUtilityImageIcon: {
    width: 25,
    height: 25,
  },
  communityUtilityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  communityUtilityTitle: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  communityUtilitySubtitle: {
    ...typeScale.micro,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
  },
  valueHistoryTrack: {
    width: 48,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  valueHistoryTrackLine: {
    position: 'absolute',
    left: 2,
    right: 5,
    height: 4,
    borderRadius: 999,
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.32,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  valueHistoryTrackSheen: {
    position: 'absolute',
    right: 13,
    width: 16,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  valueHistorySparkHalo: {
    position: 'absolute',
    right: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(105,56,245,0.22)',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.40,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  valueHistorySpark: {
    position: 'absolute',
    right: 2,
    textShadowColor: HOME_HERO_PRIMARY,
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  },
  continueBinderSection: {
    marginTop: 0,
    marginBottom: HOME_TOKENS.layout.sectionGap,
  },
  continueBinderShell: {
    position: 'relative',
    overflow: 'visible',
    marginTop: HOME_TOKENS.layout.sectionGap,
  },
  continueEdgeHeading: {
    position: 'absolute',
    top: -40,
    left: 0,
    zIndex: 12,
    elevation: 12,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueEdgeHeadingText: {
    ...typeScale.sectionTitle,
  },
  continueBinderCard: {
    paddingTop: HOME_TOKENS.spacing.lg,
    paddingHorizontal: HOME_TOKENS.spacing.md,
    paddingBottom: HOME_TOKENS.spacing.md,
    overflow: 'visible',
  },
  continueHeading: {
    minHeight: 40,
    marginBottom: HOME_TOKENS.spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: HOME_TOKENS.spacing.sm,
  },
  continueTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  continueSetLogo: {
    width: 104,
    height: 34,
    marginTop: 1,
  },
  continueGrailPanel: {
    borderWidth: 1,
    borderRadius: HOME_TOKENS.radius.lg,
    paddingHorizontal: HOME_TOKENS.spacing.sm,
    paddingVertical: HOME_TOKENS.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.xs,
    overflow: 'visible',
  },
  continueBinderStatsCard: {
    marginTop: 10,
    paddingTop: 0,
  },
  binderMintyLayer: {
    position: 'absolute',
    top: -94,
    left: '74%',
    width: 116,
    height: 116,
    marginLeft: -58,
    zIndex: 8,
    elevation: 8,
  },
  binderMintyShadow: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(27,42,75,0.15)',
    shadowColor: '#1B2A4B',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  binderMintyImage: {
    width: 116,
    height: 116,
  },
  continueMintyBubbleWrap: {
    position: 'absolute',
    top: -35,
    left: '74%',
    width: 150,
    height: 150,
    marginLeft: -79,
    zIndex: 9,
    elevation: 9,
  },
  continueMintyBubbleImage: {
    width: '100%',
    height: '100%',
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
    borderRadius: HOME_TOKENS.radius.lg,
    alignItems: 'center',
    padding: HOME_TOKENS.spacing.lg,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: HOME_TOKENS.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: HOME_TOKENS.spacing.md,
  },
  transparentIconFrame: {
    backgroundColor: 'transparent',
  },
  emptyImageIcon: {
    width: 58,
    height: 58,
  },
  emptyTitle: {
    ...typeScale.cardTitle,
    textAlign: 'center',
  },
  emptyCopy: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 16,
    marginTop: HOME_TOKENS.spacing.xs,
    textAlign: 'center',
  },
  inlineButton: {
    minHeight: HOME_TOKENS.touch.comfortable,
    marginTop: HOME_TOKENS.spacing.md,
    borderRadius: HOME_TOKENS.radius.md,
    paddingHorizontal: HOME_TOKENS.spacing.md,
    paddingVertical: HOME_TOKENS.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButtonText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 12,
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
  binderHeroButton: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 138,
    position: 'relative',
  },
  continueBinderModeBadges: {
    position: 'absolute',
    left: 6,
    top: 7,
    zIndex: 8,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  continueProgressDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
    alignSelf: 'flex-start',
    width: 198,
    minHeight: 30,
    marginTop: -8,
    marginLeft: 21,
  },
  continueProgressDockCentered: {
    alignSelf: 'center',
    justifyContent: 'center',
    width: 138,
    marginLeft: 0,
  },
  continueProgressBadge: {
    minWidth: 42,
    height: 20,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  continueProgressBadgeText: {
    ...numericTextStyle,
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  continueProgressCustomNameArt: {
    width: 112,
    height: 20,
    marginLeft: -24,
  },
  continueProgressCustomNameArtCentered: {
    marginLeft: 0,
  },
  continueProgressSetLogo: {
    width: 112,
    height: 22,
    marginLeft: -20,
  },
  grailColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  grailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 2,
    transform: [{ translateY: -20 }],
  },
  grailTitle: {
    ...typeScale.caption,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grailTierRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  grailCardSlot: {
    width: 48,
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 7,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  grailCardSlotFeatured: {
    width: 58,
    minHeight: 112,
    paddingTop: 23,
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  grailRank: {
    ...typeScale.micro,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  grailCrownRank: {
    position: 'absolute',
    top: -16,
    left: 1,
    width: 54,
    height: 41,
    opacity: 0.82,
    zIndex: 4,
  },
  grailCardImage: {
    width: 37,
    height: 56,
    borderRadius: 7,
  },
  grailCardImageFeatured: {
    width: 42,
    height: 62,
  },
  grailFeaturedImageGlow: {
    width: 42,
    height: 62,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(105,56,245,0.08)',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.36,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  grailCardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(105,56,245,0.08)',
  },
  grailValue: {
    ...numericTextStyle,
    fontSize: 9.5,
    lineHeight: 12,
    marginTop: 5,
    maxWidth: '100%',
  },
  continueCompactStatRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  continueCompactStatText: {
    ...typeScale.caption,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  continueStatDivider: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
  },
  continueHelperLine: {
    ...typeScale.micro,
    fontSize: 10.5,
    lineHeight: 13,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '700',
  },
  continueCtaRow: {
    marginTop: HOME_TOKENS.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.sm,
  },
  continuePrimaryCtaShell: {
    flex: 1,
    minHeight: HOME_TOKENS.touch.primaryButtonHeight,
    borderRadius: HOME_TOKENS.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: HOME_HERO_DEEP,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  continuePrimaryCta: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: HOME_TOKENS.spacing.xs,
    overflow: 'hidden',
  },
  continuePrimaryCtaText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 13,
  },
  continueScanLink: {
    alignSelf: 'center',
    minHeight: 54,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueScanLinkIcon: {
    width: 54,
    height: 54,
  },
  continueScanLinkText: {
    ...typeScale.buttonSecondary,
    color: HOME_HERO_PRIMARY,
    fontSize: 12,
    fontWeight: '900',
  },
  continueMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  continueMetricPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardsLeftPill: {
    backgroundColor: 'rgba(255,209,102,0.13)',
    borderColor: 'rgba(255,209,102,0.42)',
  },
  cardsLeftValue: {
    ...numericTextStyle,
    color: '#C08321',
    fontSize: 22,
    lineHeight: 27,
    minWidth: 26,
    textAlign: 'center',
  },
  continueMetricValue: {
    ...numericTextStyle,
    fontSize: 18,
    lineHeight: 22,
  },
  continueMetricLabel: {
    ...typeScale.caption,
    fontWeight: '500',
  },
  binderName: {
    ...typeScale.sectionTitleCompact,
    fontSize: 18,
  },
  binderMeta: {
    ...typeScale.support,
    fontSize: 12,
    marginTop: 4,
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
    ...numericTextStyle,
    fontSize: 14,
    lineHeight: 18,
  },
  statLabel: {
    ...typeScale.micro,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    shadowColor: HOME_HERO_DEEP,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  primaryButtonText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    shadowColor: HOME_HERO_DEEP,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  secondaryButtonText: {
    ...typeScale.buttonSecondary,
    fontSize: 13,
  },
  continueScanIcon: {
    width: 22,
    height: 22,
  },
  duplicatesSectionWrap: {
    marginBottom: 20,
    position: 'relative',
    overflow: 'visible',
  },
  duplicatesSectionHeader: {
    minHeight: 58,
    marginBottom: 10,
    paddingRight: 78,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  duplicatesTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  duplicatesSplitTitle: {
    ...typeScale.sectionTitle,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
  },
  duplicatesHeaderArtWrap: {
    position: 'absolute',
    right: 112,
    top: -17,
    width: 96,
    height: 96,
    zIndex: 3,
  },
  duplicatesHeaderArt: {
    width: 96,
    height: 96,
  },
  duplicateHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  opportunitiesCardV2: {
    paddingVertical: HOME_TOKENS.spacing.xs,
    paddingHorizontal: HOME_TOKENS.spacing.md,
  },
  opportunityRowV2: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.sm,
    borderBottomWidth: 1,
    paddingVertical: HOME_TOKENS.spacing.sm,
  },
  opportunityLastRowV2: {
    marginBottom: -1,
    overflow: 'hidden',
  },
  opportunityIconV2: {
    width: HOME_TOKENS.icons.container,
    height: HOME_TOKENS.icons.container,
    borderRadius: HOME_TOKENS.radius.md,
    backgroundColor: HOME_HERO_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opportunityImageIconV2: {
    width: 24,
    height: 24,
  },
  opportunityTitleV2: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  opportunitySubV2: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  opportunityValueV2: {
    color: HOME_HERO_PRIMARY,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  opportunitySkeletonV2: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.sm,
    paddingVertical: HOME_TOKENS.spacing.sm,
  },
  duplicatesCard: {
    position: 'relative',
    paddingBottom: 34,
  },
  duplicateSummaryBar: {
    minHeight: 84,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: HOME_HERO_BORDER,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'visible',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  duplicateSummaryMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  duplicateSummaryIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
    marginRight: -3,
  },
  duplicateSummaryIconImage: {
    width: 132,
    height: 132,
  },
  duplicateSummaryTitle: {
    ...typeScale.cardTitle,
    color: '#07145F',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  duplicateSummaryMeta: {
    ...typeScale.micro,
    color: '#716BA8',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  duplicateSummaryValuePill: {
    minWidth: 88,
    maxWidth: 112,
    minHeight: 42,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_HERO_PRIMARY,
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  duplicateSummaryValue: {
    ...numericTextStyle,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  duplicateSummaryValueLabel: {
    ...typeScale.micro,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '900',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  duplicateCountBlock: {
    minWidth: 84,
    minHeight: 86,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 3,
  },
  bigMetric: {
    ...typeScale.display,
    ...tabularNumberStyle,
    fontSize: 42,
    lineHeight: 44,
    fontWeight: '800',
  },
  metricCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  metricCopy: {
    ...typeScale.support,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  valueBadge: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderColor: HOME_HERO_BORDER,
    borderRadius: 19,
    paddingHorizontal: 13,
    paddingVertical: 11,
    alignItems: 'flex-start',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.10,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
  },
  valueBadgeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  valueBadgeLabel: {
    ...typeScale.micro,
    color: '#716BA8',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  valueBadgeText: {
    ...numericTextStyle,
    color: HOME_HERO_PRIMARY,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  valueBadgeMetaPill: {
    marginTop: 5,
    minHeight: 20,
    borderRadius: 999,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: 'rgba(105,56,245,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(105,56,245,0.16)',
  },
  valueBadgeMetaText: {
    ...typeScale.micro,
    color: HOME_HERO_PRIMARY,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '900',
  },
  duplicateRail: {
    gap: 10,
    paddingRight: 8,
    paddingVertical: 3,
  },
  duplicateRailCard: {
    width: 99,
    minHeight: 178,
    borderWidth: 1,
    borderRadius: 18,
    padding: 8,
    overflow: 'hidden',
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  duplicateArtFrame: {
    width: '100%',
    height: 112,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.70)',
  },
  duplicateArtImage: {
    width: 72,
    height: 102,
    borderRadius: 8,
  },
  duplicateQuantityBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    minWidth: 30,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  duplicateQuantityText: {
    ...numericTextStyle,
    color: '#FFFFFF',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '900',
  },
  duplicateRailCopy: {
    minHeight: 54,
    paddingTop: 7,
    alignItems: 'center',
  },
  duplicateRailTitle: {
    width: '100%',
    textAlign: 'center',
  },
  duplicateRailSetText: {
    width: '100%',
    textAlign: 'center',
  },
  duplicateSetLogo: {
    width: 66,
    height: 20,
    marginTop: 3,
    alignSelf: 'center',
  },
  duplicateRailValue: {
    ...numericTextStyle,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  duplicateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  duplicateTextLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  duplicateTextLinkInset: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    marginTop: 0,
  },
  duplicateTextLinkText: {
    ...typeScale.buttonSecondary,
    color: HOME_HERO_PRIMARY,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
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
    ...typeScale.cardTitle,
    fontSize: 13,
  },
  rowSub: {
    ...typeScale.caption,
    fontSize: 11,
    marginTop: 2,
  },
  rowStrong: {
    ...numericTextStyle,
    fontSize: 14,
    lineHeight: 18,
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
    ...typeScale.caption,
    fontSize: 12,
  },
  previewRail: {
    gap: 10,
    paddingRight: 6,
  },
  chasePreviewRail: {
    gap: 12,
    paddingRight: 12,
  },
  previewSkeleton: {
    width: 208,
    height: 106,
    borderRadius: 18,
  },
  chasePreviewSkeleton: {
    width: 126,
    height: 252,
    borderRadius: 18,
  },
  previewCard: {
    width: 208,
    minHeight: 106,
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chasePreviewCard: {
    width: 126,
    minHeight: 252,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 11,
  },
  previewImage: {
    width: 58,
    height: 82,
    borderRadius: 6,
  },
  chasePreviewImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  previewImageFrame: {
    overflow: 'hidden',
  },
  chaseHeaderStage: {
    position: 'relative',
    overflow: 'visible',
  },
  chaseHeaderBadgeWrap: {
    position: 'absolute',
    right: 164,
    bottom: 18,
    width: 208,
    height: 208,
    zIndex: 1,
  },
  chaseHeaderBadgeArt: {
    width: 208,
    height: 208,
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
  },
  chasePreviewCopy: {
    minWidth: 0,
  },
  previewTitle: {
    ...typeScale.cardTitle,
    fontSize: 12,
    lineHeight: 15,
  },
  chasePreviewTitle: {
    ...typeScale.cardTitle,
    fontSize: 15,
    lineHeight: 19,
  },
  previewSub: {
    ...typeScale.micro,
    fontSize: 10,
    marginTop: 2,
  },
  chasePreviewSub: {
    ...typeScale.support,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
  previewValue: {
    ...numericTextStyle,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 5,
  },
  chasePreviewAction: {
    ...typeScale.buttonSecondary,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 7,
  },
  chaseSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 12, 42, 0.38)',
  },
  chaseSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 8,
    overflow: 'hidden',
    shadowColor: '#07145F',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  chaseSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(113,107,168,0.28)',
    marginBottom: 10,
  },
  chaseSheetHeader: {
    minHeight: 58,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chaseSheetTitle: {
    ...typeScale.pageTitle,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
  },
  chaseSheetSubtitle: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 2,
  },
  chaseSheetClose: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chaseSheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 16,
  },
  chaseSheetStateCard: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  chaseSheetStateTitle: {
    ...typeScale.cardTitle,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  chaseSheetStateCopy: {
    ...typeScale.body,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  chaseSheetEmptyIcon: {
    width: 74,
    height: 74,
  },
  chaseSheetPrimaryAction: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_HERO_PRIMARY,
  },
  chaseSheetPrimaryActionText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 14,
  },
  chaseSummaryCard: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chaseSummaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(105,56,245,0.12)',
  },
  chaseSummaryValue: {
    ...numericTextStyle,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  chaseSummaryLabel: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  chaseCarouselContent: {
    paddingRight: 20,
    gap: 14,
  },
  chaseCarouselCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 176,
  },
  chaseCarouselCardSelected: {
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  chaseCarouselImage: {
    width: 92,
    height: 128,
    borderRadius: 12,
  },
  chaseCarouselCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 10,
  },
  chaseCarouselTitle: {
    ...typeScale.cardTitle,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  chaseCarouselSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  chaseCarouselSetLogo: {
    width: 54,
    height: 30,
  },
  chaseSetFallback: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F3FF',
  },
  chaseCarouselMeta: {
    ...typeScale.caption,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
    flex: 1,
  },
  chaseCarouselPrice: {
    ...numericTextStyle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  chaseDetailPanel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  chaseDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  chaseDetailTitle: {
    ...typeScale.cardTitle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  chaseDetailSetRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chaseDetailSetLogo: {
    width: 58,
    height: 28,
  },
  chaseDetailMeta: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    flex: 1,
  },
  chaseDetailValue: {
    ...numericTextStyle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    maxWidth: 112,
  },
  chaseDetailAction: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: HOME_HERO_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chaseDetailActionText: {
    ...typeScale.buttonPrimary,
    color: '#FFFFFF',
    fontSize: 14,
  },
  chaseInsightPanel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  chaseInsightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  chaseInsightIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  chaseInsightMascot: {
    width: 66,
    height: 66,
  },
  chaseInsightTitle: {
    ...typeScale.cardTitle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  chaseInsightCopy: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 2,
  },
  chaseInsightLoadingRow: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(105,56,245,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  chaseInsightActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chaseInsightGhostAction: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F3FF',
  },
  chaseInsightGhostActionText: {
    ...typeScale.buttonSecondary,
    fontSize: 13,
    fontWeight: '900',
  },
  chaseListingStack: {
    gap: 8,
  },
  chaseListingRow: {
    minHeight: 68,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chaseListingCopy: {
    ...typeScale.body,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
  },
  chaseListingMeta: {
    ...typeScale.caption,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  chaseListingActionText: {
    ...typeScale.buttonSecondary,
    fontSize: 13,
    fontWeight: '900',
  },
  activitySkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.sm,
    marginBottom: HOME_TOKENS.spacing.sm,
  },
  activityRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.sm,
    paddingVertical: HOME_TOKENS.spacing.sm,
  },
  activityCardThumb: {
    width: 40,
    height: 56,
    borderRadius: HOME_TOKENS.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  activityCardImage: {
    width: 32,
    height: 46,
    borderRadius: 6,
  },
  activityImageFallback: {
    width: 32,
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  activityFallbackImage: {
    width: 23,
    height: 23,
  },
  activityBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  activityBadgeImage: {
    width: 13,
    height: 13,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: HOME_TOKENS.spacing.xs,
  },
  activityTitle: {
    ...typeScale.cardTitle,
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
    minWidth: 0,
  },
  activityTag: {
    ...typeScale.micro,
    fontSize: 12,
    lineHeight: 16,
    borderRadius: 999,
    paddingHorizontal: HOME_TOKENS.spacing.xs,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  activitySub: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    marginTop: HOME_TOKENS.spacing.xxs,
  },
  activityValue: {
    ...numericTextStyle,
    fontSize: 12,
    lineHeight: 15,
    minWidth: 58,
    textAlign: 'right',
  },
  activityExpandButton: {
    marginTop: HOME_TOKENS.spacing.sm,
    minHeight: HOME_TOKENS.touch.min,
    borderRadius: HOME_TOKENS.radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activityExpandText: {
    ...typeScale.buttonSecondary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  protectionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 15,
    marginBottom: 24,
    overflow: 'visible',
    ...cardShadow,
    shadowColor: HOME_HERO_PRIMARY,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  protectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  protectionIcon: {
    width: '32%',
    minWidth: 92,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  protectionIconImage: {
    width: 97,
    height: 97,
  },
  protectionTitle: {
    ...typeScale.cardTitle,
    fontSize: 16,
  },
  protectionCopy: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  tierRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 36,
    overflow: 'visible',
  },
  tierPill: {
    flex: 1,
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 7,
    paddingTop: 34,
    paddingBottom: 10,
    alignItems: 'center',
    overflow: 'visible',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  tierPillGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 17,
  },
  tierTopGlow: {
    position: 'absolute',
    top: -15,
    width: 54,
    height: 20,
    borderRadius: 999,
    opacity: 0.58,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tierImage: {
    position: 'absolute',
    top: -32,
    width: 64,
    height: 64,
    zIndex: 3,
  },
  tierAccent: {
    width: 22,
    height: 3,
    borderRadius: 999,
    marginBottom: 7,
    opacity: 0.82,
  },
  tierRange: {
    fontFamily: stackrFonts.bold,
    fontWeight: '700',
    letterSpacing: 0,
    fontSize: 10.5,
    lineHeight: 13,
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
  },
  tierLabel: {
    ...typeScale.caption,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
    marginTop: 1,
  },
  tierStatus: {
    ...typeScale.micro,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
    width: '100%',
  },
  tierSubLabel: {
    ...typeScale.micro,
    fontSize: 8.5,
    lineHeight: 10.5,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  protectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 13,
    alignSelf: 'flex-start',
    minHeight: 30,
  },
  tierModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,11,63,0.46)',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierModalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#040B3F',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  tierModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  tierModalIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierModalImage: {
    width: 58,
    height: 58,
  },
  tierModalTitle: {
    ...typeScale.cardTitle,
    fontSize: 18,
    lineHeight: 22,
  },
  tierModalMeta: {
    ...numericTextStyle,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2,
  },
  tierModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierModalMethod: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
  },
  tierModalSteps: {
    gap: 9,
    marginTop: 14,
  },
  tierModalStep: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  tierModalStepNumber: {
    ...numericTextStyle,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    backgroundColor: 'rgba(105,56,245,0.10)',
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '900',
  },
  tierModalStepText: {
    ...typeScale.caption,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
});
