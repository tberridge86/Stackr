import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { numericTextStyle, tabularNumberStyle, typeScale } from '../lib/typography';
import type { MintyEvidenceSource, MintyInsight, MintyInsightFeedback } from '../lib/mintyInsights';
import type { CollectionPricingState } from '../lib/collectionPricingState';

type CurrencyCode = 'GBP' | 'USD' | 'EUR';
type TrendRange = '7D' | '30D';

export type ValueTrackerCardProps = {
  totalValue: number | null;
  currency?: CurrencyCode;
  percentageChange?: number;
  absoluteChange?: number;
  changePeriodLabel?: string;
  trendData?: number[];
  trendRange?: TrendRange;
  onTrendRangeChange?: (range: TrendRange) => void;
  ownedCount?: number;
  pricingState?: CollectionPricingState;
  pricingCoverageLabel?: string | null;
  pricingWarning?: string | null;
  mintyInsight?: MintyInsight | null;
  mintyInsightUpdating?: boolean;
  mintyInsightError?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onPress?: () => void;
  onMintyAction?: (insight: MintyInsight) => void;
  onMintyInsightFeedback?: (feedback: MintyInsightFeedback, insight: MintyInsight) => void;
  onMintySettingsPress?: () => void;
};

type ValueTrackerActionProps = {
  onEmptyAction?: () => void;
  onRetry?: () => void;
};

const CARD_WIDTH = 104;
const CARD_HEIGHT = 56;
const MINTY_REV2_SOURCE = require('../assets/rev2/03-ui-illustrations/mascot/Stackrrev2_mascot-cutout.png');
const currencyLocale: Record<CurrencyCode, string> = {
  GBP: 'en-GB',
  USD: 'en-US',
  EUR: 'en-IE',
};

const formatCurrency = (value: number, currency: CurrencyCode) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const wholeValue = Math.abs(safeValue) >= 1000;

  return new Intl.NumberFormat(currencyLocale[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: wholeValue ? 0 : 2,
    maximumFractionDigits: wholeValue ? 0 : 2,
  }).format(safeValue);
};

const formatSignedCurrency = (value: number, currency: CurrencyCode) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const prefix = safeValue > 0 ? '+' : '';
  return `${prefix}${formatCurrency(safeValue, currency)}`;
};

const formatSignedPercent = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const prefix = safeValue > 0 ? '+' : '';
  return `${prefix}${safeValue.toFixed(1)}%`;
};

const formatPlainPercentRange = (range: [number, number]) =>
  `${formatSignedPercent(range[0])} to ${formatSignedPercent(range[1])}`;

const stripConfidenceCopy = (value?: string | null) =>
  String(value ?? '')
    .replace(/\s*Confidence:\s*(Very High|High|Moderate|Medium|Low|Very Low)\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const getPrimaryActionLabel = (insight: MintyInsight) =>
  insight.action_label
    ?? insight.recommended_actions?.find((action) => action.primary)?.label
    ?? insight.recommended_actions?.[0]?.label
    ?? insight.recommendation_label
    ?? 'Open recommendation';

const formatMintyRefreshTime = (value?: string | null) => {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return 'Data refreshed: just now';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60 * 1000) return 'Data refreshed: just now';
  if (diffMs < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return `Data refreshed: ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
    return `Data refreshed: ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return `Data refreshed: ${new Date(timestamp).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const evidenceSourceLabel = (source?: MintyEvidenceSource) => {
  if (source === 'market') return 'Market';
  if (source === 'personal') return 'Personal';
  if (source === 'behaviour') return 'Behaviour';
  if (source === 'fallback') return 'Fallback';
  return 'Collection';
};

const getFiniteTrend = (trendData?: number[]) =>
  (trendData ?? []).filter((value) => Number.isFinite(value));

const getChangeDirection = (absoluteChange: number, percentageChange: number) => {
  if (absoluteChange < 0 || (absoluteChange === 0 && percentageChange < 0)) return -1;
  if (absoluteChange > 0 || (absoluteChange === 0 && percentageChange > 0)) return 1;
  return 0;
};

function alignTrendWithDirection(values: number[], direction: number) {
  if (values.length < 2 || direction === 0) return values;
  const chartDirection = values[values.length - 1] - values[0];
  if ((direction < 0 && chartDirection > 0) || (direction > 0 && chartDirection < 0)) {
    return [...values].reverse();
  }
  return values;
}

function buildDisplayTrend(values: number[], absoluteChange: number, percentageChange: number) {
  const direction = getChangeDirection(absoluteChange, percentageChange);
  return values.length >= 2 ? alignTrendWithDirection(values, direction) : [];
}

function getSmoothLinePath(points: { x: number; y: number }[]) {
  if (points.length <= 2) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' ');
  }

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    const controlDistance = (point.x - previous.x) * 0.42;
    const c1x = previous.x + controlDistance;
    const c1y = previous.y;
    const c2x = point.x - controlDistance;
    const c2y = point.y;
    return `${path} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, '');
}

function getSparklinePath(values: number[], width: number, height: number) {
  const data = values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = max === min;
  const range = Math.max(1, max - min);
  const padX = 8;
  const padTop = 8;
  const padBottom = 12;
  const graphWidth = width - padX * 2;
  const graphHeight = height - padTop - padBottom;

  const points = data.map((value, index) => {
    const x = padX + (data.length <= 1 ? 0 : (index / (data.length - 1)) * graphWidth);
    const y = flat
      ? padTop + graphHeight / 2
      : padTop + ((max - value) / range) * graphHeight;
    return { x, y };
  });

  const linePath = getSmoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = height - padBottom + 2;
  const fillPath = `${linePath} L ${last.x.toFixed(1)} ${baseline.toFixed(1)} L ${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;

  const lastPoint = last;

  return { linePath, fillPath, lastPoint };
}

function SkeletonBar({ width, height }: { width: DimensionValue; height: number }) {
  return (
    <View
      style={[
        styles.skeletonBar,
        {
          width,
          height,
        },
      ]}
    />
  );
}

function ValueMovement({
  icon,
  amount,
  percentage,
  accentColor,
  metaColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  amount: string;
  percentage: string;
  accentColor: string;
  metaColor: string;
}) {
  return (
    <View style={styles.valueMovement}>
      <View style={styles.valueMovementIcon}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <View style={styles.valueMovementStack}>
        <Text numeric style={[styles.vaultChangeText, { color: accentColor }]} numberOfLines={1}>
          {amount}
        </Text>
        <Text style={[styles.vaultChangeMeta, { color: metaColor }]} numberOfLines={1}>
          {percentage}
        </Text>
      </View>
    </View>
  );
}

export function ValueTrackerCard({
  totalValue,
  currency = 'GBP',
  percentageChange,
  absoluteChange,
  changePeriodLabel = '7D',
  trendData,
  trendRange = '7D',
  onTrendRangeChange,
  ownedCount,
  pricingState,
  pricingCoverageLabel,
  pricingWarning,
  mintyInsight,
  mintyInsightUpdating = false,
  mintyInsightError = null,
  isLoading = false,
  error = null,
  onPress,
  onEmptyAction,
  onRetry,
  onMintyAction,
  onMintyInsightFeedback,
  onMintySettingsPress,
}: ValueTrackerCardProps & ValueTrackerActionProps) {
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const isCompactLayout = screenWidth < 360;
  const chartWidth = isCompactLayout
    ? Math.max(190, Math.min(screenWidth - 96, 260))
    : 108;
  const chartHeight = isCompactLayout ? 46 : 40;
  const values = useMemo(() => getFiniteTrend(trendData), [trendData]);
  const derivedAbsoluteChange = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const derivedPercent = values.length >= 2 && values[0] !== 0
    ? (derivedAbsoluteChange / values[0]) * 100
    : 0;
  const displayChange = Number.isFinite(absoluteChange ?? NaN) ? absoluteChange! : derivedAbsoluteChange;
  const displayPercent = Number.isFinite(percentageChange ?? NaN) ? percentageChange! : derivedPercent;
  const signalDirection = getChangeDirection(displayChange, displayPercent);
  const signalWord = signalDirection > 0 ? 'up or holding steady' : signalDirection < 0 ? 'down a little' : 'mostly steady';
  const changeIcon = signalDirection > 0 ? 'arrow-up' : signalDirection < 0 ? 'arrow-down' : 'remove';
  const changeColor = '#6938F5';
  const changeBackground = '#F7F3FF';
  const hasValue = totalValue != null && Number.isFinite(totalValue);
  const hasTrackedCards = (ownedCount ?? 0) > 0;
  const isEmpty = !isLoading && !hasTrackedCards && pricingState !== 'unavailable';
  const isUnavailable = !isLoading && hasTrackedCards && !hasValue;
  const displayTrend = useMemo(
    () => buildDisplayTrend(values, displayChange, displayPercent),
    [displayChange, displayPercent, values]
  );
  const marketRefresh = React.useRef(new Animated.Value(1)).current;
  const hasAnimatedMarketRefresh = React.useRef(false);
  const [mintyInsightOpen, setMintyInsightOpen] = React.useState(false);
  const fallbackMintyGeneratedAt = React.useMemo(() => new Date().toISOString(), []);
  const marketRefreshKey = useMemo(
    () => [
      Math.round((totalValue != null && Number.isFinite(totalValue) ? totalValue : 0) * 100),
      Math.round((Number.isFinite(displayChange) ? displayChange : 0) * 100),
      Math.round((Number.isFinite(displayPercent) ? displayPercent : 0) * 10),
      displayTrend.map((value) => Math.round(value * 100)).join(','),
      isLoading ? 'loading' : error ? 'error' : 'ready',
    ].join('|'),
    [displayChange, displayPercent, displayTrend, error, isLoading, totalValue]
  );
  const chartPath = useMemo(() => getSparklinePath(displayTrend, chartWidth, chartHeight), [chartHeight, chartWidth, displayTrend]);
  const marketRefreshTranslateY = marketRefresh.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });
  const chartStroke = '#6938F5';
  const accessibilityChange = `${formatSignedCurrency(displayChange, currency)}, ${formatSignedPercent(displayPercent)} over ${changePeriodLabel}`;
  const interactive = Boolean(onPress) && !isLoading && !isEmpty;
  const hasTrendSignal = displayTrend.length >= 2;
  const showTrendPanel = hasValue && hasTrendSignal && !isLoading;
  const trackedFallbackCopy = hasTrendSignal
    ? `Your tracked collection is ${signalWord}. I will focus on the cards you own, the cards you want, and binder gaps before broader market noise.`
    : 'Your cards are tracked, but there are not yet two comparable stored valuation snapshots. I will not infer movement until the history is real.';
  const fallbackInsight: MintyInsight = {
    id: 'collection-market-fallback',
    title: 'Collection check-in',
    body: ownedCount && ownedCount > 0
      ? trackedFallbackCopy
      : 'Start adding owned or wanted cards and I can make this advice specific to your collection goals.',
    action_label: ownedCount && ownedCount > 0 ? 'Review collection' : 'Discover cards',
    explanation: ownedCount && ownedCount > 0
      ? trackedFallbackCopy
      : 'Start adding owned or wanted cards and I can make this advice specific to your collection goals.',
    evidence: [
      {
        type: 'neutral',
        label: ownedCount && ownedCount > 0 ? 'Collection signal' : 'Getting started',
        evidence: ownedCount && ownedCount > 0
          ? `${ownedCount} owned card${ownedCount === 1 ? '' : 's'} are available for Minty to compare.`
          : 'No owned, watched, or chase cards are linked yet.',
        source: ownedCount && ownedCount > 0 ? 'collection' : 'fallback',
      },
    ],
    data_refreshed_at: fallbackMintyGeneratedAt,
    insight_category: 'collection_discovery',
    source_context: ownedCount && ownedCount > 0 ? 'collection' : 'fallback',
    confidence: Math.abs(displayPercent) < 1 ? 'Low' : 'Medium',
    confidence_score: Math.abs(displayPercent) < 1 ? 32 : 56,
    personalisation_reason: ownedCount && ownedCount > 0
      ? hasTrendSignal
        ? `Based on ${ownedCount} owned card${ownedCount === 1 ? '' : 's'} and current value movement.`
        : `Based on ${ownedCount} owned card${ownedCount === 1 ? '' : 's'}; movement is withheld until comparable history exists.`
      : 'No collection behaviour has been linked yet.',
    related_user_goal: 'watching_market',
    related_cards: [],
    related_products: [],
    recommended_route: 'hold_and_watch',
    user_feedback_options: ['useful', 'not_relevant', 'show_less', 'hide'],
    privacy_level: ownedCount && ownedCount > 0 ? 'personalised' : 'general',
    tags: ['owned', 'market-watch'],
    scoring: {
      relevance_to_owned_cards: ownedCount && ownedCount > 0 ? 70 : 0,
      relevance_to_chase_list: 0,
      relevance_to_recent_views: 0,
      relevance_to_purchase_history: 0,
      market_movement_strength: Math.min(100, Math.round(Math.abs(displayPercent) * 12)),
      confidence_score: Math.abs(displayPercent) < 1 ? 32 : 56,
      potential_user_value: 48,
      freshness: hasTrendSignal ? 68 : 0,
      actionability: 44,
    },
  };
  const displayInsight = mintyInsight ?? fallbackInsight;
  const displayExplanation = stripConfidenceCopy(displayInsight.explanation ?? displayInsight.body) || displayInsight.title;
  const displayActionLabel = getPrimaryActionLabel(displayInsight);
  const mintyRefreshLabel = formatMintyRefreshTime(displayInsight.data_refreshed_at ?? displayInsight.generated_at);
  const evidenceSignals = displayInsight.evidence?.length
    ? displayInsight.evidence
    : [
        ...(displayInsight.supporting_signals ?? []),
        ...(displayInsight.opportunities ?? []),
        ...(displayInsight.risks ?? []),
      ].slice(0, 4).map((signal) => ({
        ...signal,
        source: 'market' as const,
      }));
  const confidenceColor = displayInsight.confidence === 'High'
    ? '#0E9F6E'
    : displayInsight.confidence === 'Medium'
      ? '#A15C07'
      : '#7A3CFF';
  const showInsightRow = !isLoading && !error;
  const relatedSignals = [...displayInsight.related_cards, ...displayInsight.related_products].filter(Boolean);
  const mintySourceLabel = mintyInsightUpdating
    ? 'Updating'
    : displayInsight.is_api_backed
      ? 'Fresh read'
      : mintyInsightError
        ? 'Quick read'
        : null;
  const forecastLine = displayInsight.forecast
    ? [
      displayInsight.forecast.horizonLabel ? `Timeframe: ${displayInsight.forecast.horizonLabel}.` : null,
      displayInsight.forecast.catalysts.length ? `What could move it: ${displayInsight.forecast.catalysts[0]}.` : null,
      displayInsight.forecast.estimatedImpactPctRange
        ? `Rough guide: ${formatPlainPercentRange(displayInsight.forecast.estimatedImpactPctRange)}.`
        : null,
      displayInsight.forecast.caveat,
    ].filter(Boolean).join(' ')
    : null;

  React.useEffect(() => {
    if (!hasAnimatedMarketRefresh.current) {
      hasAnimatedMarketRefresh.current = true;
      marketRefresh.setValue(1);
      return;
    }

    marketRefresh.setValue(0.72);
    Animated.spring(marketRefresh, {
      toValue: 1,
      friction: 9,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [marketRefresh, marketRefreshKey]);

  const renderState = () => {
    if (isLoading) {
      return (
        <View style={styles.vaultStateContent}>
          <View style={{ flex: 1, gap: 10 }}>
            <SkeletonBar width="68%" height={16} />
            <SkeletonBar width="92%" height={42} />
            <SkeletonBar width="56%" height={30} />
          </View>
          <View style={styles.vaultLoadingChart}>
            <ActivityIndicator color="#6938F5" />
          </View>
        </View>
      );
    }

    if (error && !hasValue) {
      return (
        <View style={styles.vaultMessageContent}>
          <View style={styles.vaultMessageIcon}>
            <Ionicons name="cloud-offline-outline" size={22} color="#6938F5" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.vaultMessageTitle, { color: theme.colors.text }]}>Value unavailable right now</Text>
            <Text style={[styles.vaultMessageCopy, { color: theme.colors.textSoft }]} numberOfLines={2}>
              {error || 'We could not refresh market prices.'}
            </Text>
          </View>
          {onRetry ? (
            <TouchableOpacity onPress={onRetry} activeOpacity={0.82} style={styles.vaultStateButton}>
              <Ionicons name="refresh" size={15} color="#FFFFFF" />
              <Text style={styles.vaultStateButtonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (isEmpty) {
      return (
        <View style={styles.vaultMessageContent}>
          <View style={styles.vaultMessageIcon}>
            <Ionicons name="scan-outline" size={22} color="#6938F5" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.vaultMessageTitle, { color: theme.colors.text }]}>Start tracking your collection</Text>
            <Text style={[styles.vaultMessageCopy, { color: theme.colors.textSoft }]} numberOfLines={2}>
              Scan cards to build your live market value.
            </Text>
          </View>
          {onEmptyAction ? (
            <TouchableOpacity onPress={onEmptyAction} activeOpacity={0.82} style={styles.vaultStateButton}>
              <Ionicons name="camera" size={15} color="#FFFFFF" />
              <Text style={styles.vaultStateButtonText}>Scan Card</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (isUnavailable) {
      return (
        <View style={styles.vaultMessageContent}>
          <View style={styles.vaultMessageIcon}>
            <Ionicons name="analytics-outline" size={22} color="#6938F5" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.vaultMessageTitle, { color: theme.colors.text }]}>No stored market estimate yet</Text>
            <Text style={[styles.vaultMessageCopy, { color: theme.colors.textSoft }]} numberOfLines={2}>
              {pricingWarning || 'Your cards are tracked. Stored market estimates are not available yet.'}
            </Text>
          </View>
          {onRetry ? (
            <TouchableOpacity onPress={onRetry} activeOpacity={0.82} style={styles.vaultStateButton}>
              <Ionicons name="refresh" size={15} color="#FFFFFF" />
              <Text style={styles.vaultStateButtonText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <View style={[styles.vaultValueMainRow, isCompactLayout && styles.vaultValueMainRowCompact]}>
        <View style={styles.vaultValueColumn}>
          <Text
            numeric
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.62}
            style={[
              styles.vaultValueText,
              {
                color: theme.colors.text,
                fontSize: isCompactLayout ? 34 : 38,
                lineHeight: isCompactLayout ? 39 : 44,
              },
            ]}
          >
            {formatCurrency(totalValue ?? 0, currency)}
          </Text>
          <Text style={[styles.vaultKnownValueLabel, { color: theme.colors.textSoft }]}>
            {pricingState === 'partial' ? 'Known subtotal' : 'Stored market estimate'}
          </Text>
          {showTrendPanel ? (
            <View style={[styles.vaultChangeBadge, isCompactLayout && styles.vaultChangeBadgeCompact, { backgroundColor: changeBackground }]}>
              <ValueMovement
                icon={changeIcon}
                amount={`${formatSignedCurrency(displayChange, currency)} ${changePeriodLabel}`}
                percentage={`${formatSignedPercent(displayPercent)} ${changePeriodLabel}`}
                accentColor={changeColor}
                metaColor={theme.colors.textSoft}
              />
            </View>
          ) : null}
          {pricingWarning ? (
            <Text style={[styles.vaultPricingWarning, { color: theme.colors.textSoft }]} numberOfLines={2}>
              {pricingWarning}
            </Text>
          ) : null}
        </View>

        {showTrendPanel ? (
          <View
            style={[
              styles.vaultChartPanel,
              isCompactLayout && styles.vaultChartPanelCompact,
              {
                width: isCompactLayout ? '100%' : chartWidth + 16,
                height: chartHeight + 10,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
              <Defs>
                <SvgLinearGradient id="portfolioChartFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={chartStroke} stopOpacity="0.18" />
                  <Stop offset="1" stopColor={chartStroke} stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Path d={chartPath.fillPath} fill="url(#portfolioChartFill)" />
              <Path
                d={chartPath.linePath}
                fill="none"
                stroke={chartStroke}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : (
          <View style={[styles.vaultHistoryBuilding, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="pulse-outline" size={15} color="#6938F5" />
            <Text style={[styles.vaultHistoryBuildingText, { color: theme.colors.textSoft }]}>History building</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={!interactive}
        onPress={interactive ? onPress : undefined}
        accessibilityRole={interactive ? 'button' : undefined}
        accessibilityLabel={
          hasValue
            ? `Known collection value ${formatCurrency(totalValue ?? 0, currency)}.${showTrendPanel ? ` ${accessibilityChange}.` : ' Price history is building.'}`
            : undefined
        }
        style={styles.vaultTouchable}
      >
        <View
          style={[
            styles.vaultCard,
            {
              backgroundColor: isDark ? theme.colors.card : '#FFFFFF',
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.vaultTopRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.vaultEyebrow, { color: theme.colors.textSoft }]}>Collection Value</Text>
              <Text style={[styles.vaultSourceText, { color: theme.colors.textSoft }]}>
                {pricingCoverageLabel || (ownedCount ? `${ownedCount} card${ownedCount === 1 ? '' : 's'} tracked` : 'No cards tracked')}
              </Text>
            </View>
            {showTrendPanel ? (
              <View style={[styles.vaultTrendToggle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  {(['7D', '30D'] as TrendRange[]).map((range) => {
                    const active = trendRange === range;
                    return (
                      <TouchableOpacity
                        key={range}
                        activeOpacity={0.82}
                        onPress={(event) => {
                          event.stopPropagation();
                          onTrendRangeChange?.(range);
                        }}
                        disabled={!onTrendRangeChange}
                        style={[styles.vaultTrendToggleButton, active && styles.vaultTrendToggleButtonActive]}
                      >
                        <Text style={[styles.vaultTrendToggleText, { color: active ? theme.colors.primary : theme.colors.textSoft }]}>{range}</Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            ) : null}
            {interactive ? (
              <View style={styles.vaultTopAction}>
                <Text variant="buttonSecondary" style={styles.vaultTopActionText}>
                  History
                </Text>
                <Ionicons name="arrow-forward" size={14} color="#6938F5" />
              </View>
            ) : null}
          </View>

          <Animated.View style={{ opacity: marketRefresh, transform: [{ translateY: marketRefreshTranslateY }] }}>
            {renderState()}
          </Animated.View>
        </View>
        {showInsightRow ? (
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={(event) => {
              event.stopPropagation();
              setMintyInsightOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open Minty advice. ${displayInsight.title}`}
            accessibilityHint="Opens the full Minty recommendation and supporting signals."
            style={[styles.vaultInsightRow, isCompactLayout && styles.vaultInsightRowCompact, { backgroundColor: theme.colors.card, borderColor: `${theme.colors.primary}24` }]}
          >
            <View style={styles.vaultInsightIcon}>
              <Image source={MINTY_REV2_SOURCE} style={styles.vaultInsightMascot} resizeMode="contain" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.vaultInsightTitleRow}>
                <Text style={[styles.vaultInsightLabel, { color: theme.colors.text }]}>Minty Insight</Text>
                <View style={[styles.vaultConfidencePill, { backgroundColor: `${confidenceColor}14`, borderColor: `${confidenceColor}44` }]}>
                  <Text style={[styles.vaultConfidenceText, { color: confidenceColor }]}>{displayInsight.confidence}</Text>
                </View>
                {mintySourceLabel ? (
                  <View style={[styles.vaultConfidencePill, { backgroundColor: `${theme.colors.primary}0F`, borderColor: `${theme.colors.primary}24` }]}>
                    <Text style={[styles.vaultConfidenceText, { color: theme.colors.primary }]}>{mintySourceLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.vaultInsightHeadline, { color: theme.colors.text }]} numberOfLines={1}>
                {displayInsight.title}
              </Text>
              <Text style={[styles.vaultInsightCopy, { color: theme.colors.textSoft }]} numberOfLines={2}>
                {displayExplanation}
              </Text>
              <View style={styles.vaultInsightReadRow}>
                <Text style={[styles.vaultInsightReadText, { color: theme.colors.primary }]} numberOfLines={1}>
                  Action: {displayActionLabel}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={theme.colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      <Modal visible={mintyInsightOpen} transparent animationType="fade" onRequestClose={() => setMintyInsightOpen(false)}>
        <View style={styles.mintyModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMintyInsightOpen(false)} />
          <View style={[styles.mintyModalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mintyModalContent}>
              <View style={styles.mintyModalHeader}>
                <View style={styles.mintyModalMascotWrap}>
                  <Image source={MINTY_REV2_SOURCE} style={styles.mintyModalMascot} resizeMode="contain" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.vaultInsightTitleRow}>
                    <Text style={[styles.vaultInsightLabel, { color: theme.colors.text }]}>Minty Insight</Text>
                    <View style={[styles.vaultConfidencePill, { backgroundColor: `${confidenceColor}14`, borderColor: `${confidenceColor}44` }]}>
                      <Text style={[styles.vaultConfidenceText, { color: confidenceColor }]}>{displayInsight.confidence}</Text>
                    </View>
                  </View>
                  <Text style={[styles.mintyModalTitle, { color: theme.colors.text }]}>{displayInsight.title}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() => setMintyInsightOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close Minty insight"
                  style={[styles.mintyModalClose, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                >
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.mintyModalBody, { color: theme.colors.textSoft }]}>
                {displayExplanation}
              </Text>

              <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>Recommended action</Text>
                <Text style={[styles.mintyActionCopy, { color: theme.colors.textSoft }]}>
                  {displayActionLabel}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.84}
                  onPress={() => {
                    setMintyInsightOpen(false);
                    onMintyAction?.(displayInsight);
                  }}
                  style={styles.mintyPrimaryAction}
                  accessibilityRole="button"
                  accessibilityLabel={displayActionLabel}
                >
                  <Text style={styles.mintyPrimaryActionText} numberOfLines={1}>{displayActionLabel}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>Evidence</Text>
                {evidenceSignals.length ? (
                  evidenceSignals.slice(0, 4).map((item) => (
                    <View key={`${item.label}:${item.evidence}`} style={styles.mintyEvidenceItem}>
                      <View style={styles.mintyEvidenceLabelRow}>
                        <Text style={[styles.mintyEvidenceLabel, { color: theme.colors.text }]} numberOfLines={1}>{item.label}</Text>
                        <Text style={[styles.mintyEvidenceSource, { color: theme.colors.primary }]} numberOfLines={1}>
                          {evidenceSourceLabel(item.source)}
                        </Text>
                      </View>
                      <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                        {item.evidence}
                        {item.confidenceLabel ? ` Confidence: ${item.confidenceLabel}.` : ''}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                    Minty is using collection context only until more market signals are available.
                  </Text>
                )}
              </View>

              <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>Confidence and freshness</Text>
                <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                  Confidence: {displayInsight.confidence}. {mintyRefreshLabel}.
                </Text>
              </View>

              {!displayInsight.evidence?.length && displayInsight.opportunities?.length ? (
                <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>What looks good</Text>
                  {displayInsight.opportunities.slice(0, 3).map((item) => (
                    <Text key={`${item.label}:${item.evidence}`} style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                      {item.label}: {item.evidence} Confidence: {item.confidenceLabel}.
                    </Text>
                  ))}
                </View>
              ) : null}

              {!displayInsight.evidence?.length && displayInsight.risks?.length ? (
                <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>What to be careful about</Text>
                  {displayInsight.risks.slice(0, 3).map((item) => (
                    <Text key={`${item.label}:${item.evidence}`} style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                      {item.label}: {item.evidence} Confidence: {item.confidenceLabel}.
                    </Text>
                  ))}
                </View>
              ) : null}

              {forecastLine ? (
                <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>What could move it</Text>
                  <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>{forecastLine}</Text>
                </View>
              ) : null}

              <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>Why this matters</Text>
                <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                  {displayInsight.why_minty_picked_this?.length
                    ? displayInsight.why_minty_picked_this.join(' ')
                    : displayInsight.personalisation_reason}
                </Text>
              </View>

              {displayInsight.price_outlook ? (
                <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>What may happen next</Text>
                  <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                    {displayInsight.price_outlook.label}. Confidence: {displayInsight.price_outlook.confidenceLabel}.
                  </Text>
                </View>
              ) : null}

              {displayInsight.data_limitations?.length ? (
                <View style={[styles.mintyModalInfoBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.mintyModalSectionTitle, { color: theme.colors.text }]}>What Minty is less sure about</Text>
                  <Text style={[styles.mintyModalMeta, { color: theme.colors.textSoft }]}>
                    {displayInsight.data_limitations.join(' ')}
                  </Text>
                </View>
              ) : null}

              {relatedSignals.length ? (
                <View style={styles.mintyRelatedWrap}>
                  {relatedSignals.slice(0, 6).map((item) => (
                    <View key={item} style={[styles.mintyRelatedChip, { backgroundColor: `${theme.colors.primary}10`, borderColor: `${theme.colors.primary}24` }]}>
                      <Text style={[styles.mintyRelatedChipText, { color: theme.colors.primary }]} numberOfLines={1}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.mintyModalActions}>
                {onMintySettingsPress ? (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => {
                      setMintyInsightOpen(false);
                      onMintySettingsPress();
                    }}
                    style={[styles.mintySecondaryAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                  >
                    <Ionicons name="options-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.mintySecondaryActionText, { color: theme.colors.primary }]}>Tune Minty</Text>
                  </TouchableOpacity>
                ) : null}
                {onMintyInsightFeedback ? (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => onMintyInsightFeedback('useful', displayInsight)}
                    style={[styles.mintySecondaryAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                  >
                    <Ionicons name="thumbs-up-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.mintySecondaryActionText, { color: theme.colors.primary }]}>Useful</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  vaultTouchable: {
    borderRadius: 24,
    marginBottom: 12,
  },
  vaultCard: {
    minHeight: 140,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#6136F5',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  vaultTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  vaultEyebrow: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  vaultSourceText: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '600',
  },
  vaultTrendToggle: {
    flexDirection: 'row',
    minHeight: 44,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
  },
  vaultTrendToggleButton: {
    minWidth: 38,
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  vaultTrendToggleButtonActive: {
    backgroundColor: '#6938F512',
    borderWidth: 1,
    borderColor: '#6938F5',
  },
  vaultTrendToggleText: {
    ...typeScale.micro,
    ...tabularNumberStyle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  vaultStateContent: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  vaultLoadingChart: {
    width: 96,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#F7F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultMessageContent: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vaultMessageIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#F1ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultMessageTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  vaultMessageCopy: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
    fontWeight: '600',
  },
  vaultStateButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#6938F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  vaultStateButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  vaultValueMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vaultValueMainRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  vaultValueColumn: {
    flex: 1,
    minWidth: 0,
  },
  vaultValueText: {
    ...typeScale.heroValue,
    ...tabularNumberStyle,
    fontWeight: '900',
  },
  vaultKnownValueLabel: {
    ...typeScale.micro,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  vaultPricingWarning: {
    ...typeScale.micro,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  vaultChangeBadge: {
    alignSelf: 'flex-start',
    minHeight: 32,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8E1FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  vaultChangeBadgeCompact: {
    borderRadius: 16,
  },
  valueMovement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueMovementIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueMovementStack: {
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultChangeText: {
    ...tabularNumberStyle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  vaultChangeMeta: {
    ...tabularNumberStyle,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  vaultChartPanel: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vaultChartPanelCompact: {
    alignSelf: 'stretch',
  },
  vaultHistoryBuilding: {
    width: 108,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  vaultHistoryBuildingText: {
    ...typeScale.micro,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  vaultInsightRow: {
    minHeight: 64,
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    shadowColor: '#6136F5',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  vaultInsightRowCompact: {
    padding: 12,
    gap: 9,
  },
  vaultInsightIcon: {
    width: 58,
    height: 58,
    borderRadius: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#6136F5',
    shadowOpacity: 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  vaultInsightMascot: {
    width: 72,
    height: 72,
  },
  vaultInsightTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  vaultInsightLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  vaultConfidencePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  vaultConfidenceText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vaultInsightCopy: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 1,
  },
  vaultInsightHeadline: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  vaultInsightReadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 5,
  },
  vaultInsightReadText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  mintyModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(28,32,52,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  mintyModalCard: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '86%',
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#6136F5',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  mintyModalContent: {
    padding: 16,
    paddingBottom: 18,
  },
  mintyModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mintyModalMascotWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  mintyModalMascot: {
    width: 88,
    height: 88,
  },
  mintyModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mintyModalTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  mintyModalBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 16,
  },
  mintyModalInfoBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    marginTop: 12,
  },
  mintyModalSectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 5,
  },
  mintyModalMeta: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  mintyActionCopy: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    marginBottom: 10,
  },
  mintyPrimaryAction: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#6938F5',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  mintyPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    maxWidth: '86%',
  },
  mintyEvidenceItem: {
    gap: 3,
    marginTop: 8,
  },
  mintyEvidenceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mintyEvidenceLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  mintyEvidenceSource: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  mintyRelatedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  mintyRelatedChip: {
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  mintyRelatedChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  mintyModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  mintySecondaryAction: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mintySecondaryActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  vaultTopAction: {
    minHeight: 44,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vaultTopActionText: {
    color: '#6938F5',
    fontWeight: '900',
    fontSize: 12,
  },
  touchable: {
    borderRadius: 24,
    marginBottom: 10,
  },
  card: {
    minHeight: 258,
    borderRadius: 24,
    padding: 14,
    overflow: 'hidden',
    shadowColor: '#351078',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  diagonalGlow: {
    position: 'absolute',
    right: -44,
    top: -32,
    width: 168,
    height: 214,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.13)',
    transform: [{ rotate: '24deg' }],
  },
  sideHighlight: {
    position: 'absolute',
    right: -28,
    top: 36,
    width: 158,
    height: 96,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    transform: [{ rotate: '-7deg' }],
  },
  innerRule: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 50,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  topSheen: {
    position: 'absolute',
    left: -28,
    right: -28,
    top: -54,
    height: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '-7deg' }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 34,
  },
  eyebrow: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.84)',
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  sourceText: {
    ...typeScale.support,
    color: 'rgba(255,255,255,0.58)',
    marginTop: 2,
  },
  trendPanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: CARD_WIDTH + 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.105)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingTop: 6,
    paddingHorizontal: 7,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  trendToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    minHeight: 20,
    borderRadius: 999,
    padding: 2,
    marginBottom: 2,
    backgroundColor: 'rgba(38,14,92,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  trendToggleButton: {
    minWidth: 34,
    minHeight: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  trendToggleButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  trendToggleText: {
    ...typeScale.micro,
    ...tabularNumberStyle,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '700',
  },
  trendToggleTextActive: {
    color: '#4B22A2',
  },
  valueContent: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  valueText: {
    ...typeScale.heroValue,
    ...tabularNumberStyle,
    color: '#FFFFFF',
    width: '58%',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
  },
  changeBadge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.19)',
  },
  changeText: {
    ...numericTextStyle,
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  insightPanel: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  insightPanelExpanded: {
    minHeight: 164,
  },
  insightMinty: {
    width: 72,
    height: 92,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
    shadowOpacity: 0.24,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
  },
  insightMintyHalo: {
    position: 'absolute',
    top: 5,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    opacity: 0.72,
  },
  insightMintyImage: {
    width: 84,
    height: 84,
    marginTop: -4,
  },
  insightTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  insightLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 20,
  },
  insightLabel: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '600',
    letterSpacing: 0.35,
    flexShrink: 1,
  },
  confidencePill: {
    minHeight: 18,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confidenceText: {
    ...typeScale.micro,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  insightTuneButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  insightTitle: {
    ...typeScale.cardTitle,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 3,
  },
  insightCopy: {
    ...typeScale.support,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  insightExpandButton: {
    alignSelf: 'flex-start',
    minHeight: 23,
    borderRadius: 999,
    paddingHorizontal: 8,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  insightExpandText: {
    ...typeScale.micro,
    color: 'rgba(255,255,255,0.80)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '800',
  },
  insightDetails: {
    marginTop: 5,
  },
  insightReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  insightReason: {
    ...typeScale.micro,
    flex: 1,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
  },
  insightFeedbackPrompt: {
    ...typeScale.micro,
    color: 'rgba(255,255,255,0.66)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '800',
    marginTop: 7,
  },
  insightFeedbackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  insightFeedbackChip: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  insightFeedbackText: {
    ...typeScale.micro,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '800',
  },
  footerCue: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 9,
  },
  footerCueText: {
    ...typeScale.buttonSecondary,
    color: 'rgba(255,255,255,0.74)',
  },
  sparklineWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 15,
    backgroundColor: 'rgba(48,18,112,0.10)',
    overflow: 'hidden',
  },
  stateContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginTop: 22,
  },
  skeletonBar: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  loadingSparkline: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    backgroundColor: 'rgba(48,18,112,0.21)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
  },
  messageIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageTitle: {
    ...typeScale.cardTitle,
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: 0,
  },
  messageCopy: {
    ...typeScale.support,
    color: 'rgba(255,255,255,0.68)',
    marginTop: 4,
  },
  stateButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stateButtonText: {
    ...typeScale.buttonPrimary,
    color: '#4B22A2',
    fontSize: 12,
  },
});
