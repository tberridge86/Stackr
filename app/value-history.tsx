import { StackrFunctionalIcon } from '../components/StackrFunctionalIcon';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StackrLoadingIndicator as ActivityIndicator } from '../components/StackrLoadingIndicator';
import {
  GestureResponderEvent,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { isKnownAuthDenial, useAuth } from '../components/auth-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrPageTitle } from '../components/StackrScreen';
import { attachLiveTcgdexCardReferences, getPokemonSetLogoUrl } from '../lib/pokemonTcg';
import { getPreferredSetDisplayName } from '../lib/pokemonDisplayNames';
import { stackrIcons } from '../lib/stackrIcons';
import { stackrTabContentPadding } from '../lib/stackrSizing';
import { tabularNumberStyle, typeScale } from '../lib/typography';
import { fetchStackrCardRows } from '../lib/stackrDomainAdapter';
import { hydrateCardReferenceRowMapWithLiveTcgdexReferences } from '../lib/scanCardReferenceHydration';
import { stackrApiClient } from '../lib/stackrApiV1';
import {
  collectionValueHistory, marketValueHistory, savedCollectionValueHistory, withValueHistoryDeadline,
  VALUE_HISTORY_PREVIEW_TIMEOUT_MS, VALUE_HISTORY_READ_TIMEOUT_MS,
  type ValueHistoryMover, type ValueHistoryPoint, type ValueHistoryPreview, type ValueHistoryRange,
} from '../lib/valueHistoryRead';
import { getHomeCollectionCacheKey, parseHomeCollectionCache } from '../lib/homeCollectionCache';

type RangeKey = ValueHistoryRange;
type MoverDisplayMode = 'money' | 'percent';
type AsyncStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'single' | 'unchanged' | 'error';
type HistoryPoint = ValueHistoryPoint;
type ChartCoord = HistoryPoint & { x: number; y: number };
type CardPreview = ValueHistoryPreview;
type Mover = ValueHistoryMover;

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7D', label: '7D', days: 7 },
  { key: '30D', label: '30D', days: 30 },
  { key: '6M', label: '6 Months', days: 183 },
  { key: '12M', label: '12 Months', days: 365 },
];

const MONEY_PREFIX = '\u00A3';
const MOVER_DISPLAY_LIMIT = 10;
const MOVER_VISIBLE_LIMIT = 5;


const formatMoney = (value: number, fallback = `${MONEY_PREFIX}0.00`) => {
  if (!Number.isFinite(value)) return fallback;
  const abs = Math.abs(value);
  return `${MONEY_PREFIX}${abs.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatSignedMoney = (value: number) =>
  `${value >= 0 ? '+' : '-'}${formatMoney(Math.abs(value))}`;

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const formatSnapshotDate = (value?: string | null) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};


const toDayKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().split('T')[0];
};

async function fetchPreviews(cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  const previews = new Map<string, CardPreview>();
  if (!ids.length) return previews;

  const cardsById = await hydrateCardReferenceRowMapWithLiveTcgdexReferences(
    await fetchStackrCardRows(ids), attachLiveTcgdexCardReferences,
  );
  for (const id of ids) {
    const card = cardsById.get(id);
    if (!card) continue;
    const raw = card.raw_data as any;

    previews.set(id, {
      name: card.name ?? raw?.name ?? id,
      setId: card.set_id ?? raw?.set?.id ?? null,
      setName: getPreferredSetDisplayName({
        id: card.set_id ?? raw?.set?.id ?? null,
        sourceId: raw?.set?.tcgdex_id ?? raw?.set?.source_id ?? card.set_id ?? null,
        setCode: raw?.set?.set_code ?? raw?.set?.tcgdex_id ?? card.set_id ?? null,
        language: card.language ?? raw?.language ?? raw?.set?.language ?? null,
        region: card.region ?? raw?.region ?? raw?.set?.region ?? null,
        localName: raw?.set?.local_name ?? raw?.set?.name ?? null,
        englishDisplayName: raw?.set?.english_display_name ?? raw?.set?.englishDisplayName ?? null,
        canonicalName: raw?.set?.name ?? null,
        fallbackName: card.set_id ?? null,
        raw: raw?.set ?? raw,
      }),
      imageUrl: card.image_small ?? card.image_large ?? raw?.images?.small ?? raw?.images?.large ?? null,
    });
  }

  return previews;
}

function getChartPath(points: HistoryPoint[], width: number, height: number) {
  const values = points.map((point) => point.value);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;
  const dataRange = dataMax - dataMin;
  const averageValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const minimumVisibleRange = Math.max(0.5, Math.abs(averageValue) * 0.003);
  const visibleRange = Math.max(dataRange, minimumVisibleRange);
  const midpoint = (dataMax + dataMin) / 2;
  const domainPad = Math.max(visibleRange * 0.07, 0.12);
  const min = dataMin - domainPad;
  const max = dataMax + domainPad;
  const domainMin = dataRange > 0 ? min : midpoint - visibleRange / 2 - domainPad;
  const domainMax = dataRange > 0 ? max : midpoint + visibleRange / 2 + domainPad;
  const domainRange = Math.max(0.5, domainMax - domainMin);
  const padX = 12;
  const padTop = 12;
  const padBottom = 18;
  const graphWidth = width - padX * 2;
  const graphHeight = height - padTop - padBottom;
  const coords = points.map((point, index): ChartCoord => {
    const x = padX + (points.length <= 1 ? graphWidth / 2 : (index / (points.length - 1)) * graphWidth);
    const y = padTop + (1 - ((point.value - domainMin) / domainRange)) * graphHeight;
    return { ...point, x, y };
  });
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1] ?? { x: padX, y: height - padBottom };
  const first = coords[0] ?? { x: padX, y: height - padBottom };
  const baseline = height - padBottom + 2;
  const fillPath = `${linePath} L ${last.x.toFixed(1)} ${baseline.toFixed(1)} L ${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
  return { linePath, fillPath, last, coords, padTop, padBottom };
}

function getSparkMarkerPath(x: number, y: number, size = 10) {
  const inner = size * 0.28;
  return [
    `M ${x.toFixed(1)} ${(y - size).toFixed(1)}`,
    `L ${(x + inner).toFixed(1)} ${(y - inner).toFixed(1)}`,
    `L ${(x + size).toFixed(1)} ${y.toFixed(1)}`,
    `L ${(x + inner).toFixed(1)} ${(y + inner).toFixed(1)}`,
    `L ${x.toFixed(1)} ${(y + size).toFixed(1)}`,
    `L ${(x - inner).toFixed(1)} ${(y + inner).toFixed(1)}`,
    `L ${(x - size).toFixed(1)} ${y.toFixed(1)}`,
    `L ${(x - inner).toFixed(1)} ${(y - inner).toFixed(1)}`,
    'Z',
  ].join(' ');
}

function ValueHistoryChart({
  points,
}: {
  points: HistoryPoint[];
}) {
  const { width } = useWindowDimensions();
  const [trackedIndex, setTrackedIndex] = useState<number | null>(null);
  const chartWidth = Math.min(width - 56, 420);
  const chartHeight = 188;
  const { linePath, fillPath, last, coords, padTop, padBottom } = useMemo(
    () => getChartPath(points.length ? points : [{ day: toDayKey(new Date()), value: 0 }], chartWidth, chartHeight),
    [chartHeight, chartWidth, points]
  );
  const stroke = '#4B22A2';
  const trackedPoint = trackedIndex == null ? last : coords[trackedIndex] ?? last;
  const trackerLeft = Math.max(8, Math.min(chartWidth - 116, trackedPoint.x - 54));

  const updateTrackedPoint = useCallback((event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    coords.forEach((point, index) => {
      const distance = Math.abs(point.x - x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setTrackedIndex(nearestIndex);
  }, [coords]);

  return (
    <View
      style={[styles.chartWrap, { width: chartWidth }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={updateTrackedPoint}
      onResponderMove={updateTrackedPoint}
      onResponderRelease={updateTrackedPoint}
    >
      <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Defs>
          <SvgLinearGradient id="valueHistoryFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7B56C8" stopOpacity="0.34" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={`M 12 ${padTop.toFixed(1)} L ${(chartWidth - 12).toFixed(1)} ${padTop.toFixed(1)}`} stroke="rgba(75,34,162,0.10)" strokeWidth={1} />
        <Path d={`M 12 ${(chartHeight - padBottom).toFixed(1)} L ${(chartWidth - 12).toFixed(1)} ${(chartHeight - padBottom).toFixed(1)}`} stroke="rgba(75,34,162,0.14)" strokeWidth={1} />
        <Path d={fillPath} fill="url(#valueHistoryFill)" />
        <Path d={linePath} fill="none" stroke="rgba(75,34,162,0.20)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={linePath} fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth={5.2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={linePath} fill="none" stroke={stroke} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        {trackedPoint ? (
          <Path
            d={`M ${trackedPoint.x.toFixed(1)} ${padTop.toFixed(1)} L ${trackedPoint.x.toFixed(1)} ${(chartHeight - padBottom).toFixed(1)}`}
            fill="none"
            stroke="rgba(75,34,162,0.34)"
            strokeWidth={1.2}
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
        ) : null}
        <Path d={getSparkMarkerPath(last.x, last.y, 16)} fill="rgba(255,255,255,0.36)" />
        <Path d={getSparkMarkerPath(last.x, last.y, 12)} fill="rgba(111,69,184,0.42)" />
        <Path d={getSparkMarkerPath(last.x, last.y, 6.8)} fill="#FFFFFF" stroke="#4B22A2" strokeWidth={1.4} />
        {trackedPoint && trackedPoint !== last ? (
          <>
            <Path d={getSparkMarkerPath(trackedPoint.x, trackedPoint.y, 8.8)} fill="rgba(111,69,184,0.24)" />
            <Path d={getSparkMarkerPath(trackedPoint.x, trackedPoint.y, 5.2)} fill="#FFFFFF" stroke="#4B22A2" strokeWidth={1.1} />
          </>
        ) : null}
      </Svg>
      {trackedPoint ? (
        <View pointerEvents="none" style={[styles.chartTrackerBubble, { left: trackerLeft }]}>
          <Text style={styles.chartTrackerValue}>{formatMoney(trackedPoint.value)}</Text>
          <Text style={styles.chartTrackerDate}>
            {formatSnapshotDate(trackedPoint.day)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const getMoverMoneyValue = (item: Mover, personal = false) =>
  personal ? item.impact ?? item.change : item.change;

const getMoverSortValue = (item: Mover, mode: MoverDisplayMode, personal = false) =>
  mode === 'percent' ? item.percentChange : getMoverMoneyValue(item, personal);

const getMoverAbsSortValue = (item: Mover, mode: MoverDisplayMode, personal = false) =>
  Math.abs(getMoverSortValue(item, mode, personal));

const getTopMovers = (
  items: Mover[],
  direction: 'up' | 'down',
  mode: MoverDisplayMode,
  personal = false
) => {
  const positive = direction === 'up';
  return items
    .filter((item) => {
      const value = getMoverSortValue(item, mode, personal);
      return positive ? value > 0 : value < 0;
    })
    .sort((a, b) => {
      const aValue = getMoverSortValue(a, mode, personal);
      const bValue = getMoverSortValue(b, mode, personal);
      return positive ? bValue - aValue : aValue - bValue;
    })
    .slice(0, MOVER_DISPLAY_LIMIT);
};

function MoverDisplayToggle({
  value,
  onChange,
}: {
  value: MoverDisplayMode;
  onChange: (value: MoverDisplayMode) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.displayToggle, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      {(['money', 'percent'] as MoverDisplayMode[]).map((mode) => {
        const active = mode === value;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => onChange(mode)}
            activeOpacity={0.82}
            style={[
              styles.displayToggleButton,
              { backgroundColor: active ? theme.colors.primary + '12' : 'transparent', borderColor: active ? theme.colors.primary : 'transparent' },
            ]}
          >
            <Text style={[styles.displayToggleText, { color: active ? theme.colors.primary : theme.colors.textSoft }]}>
              {mode === 'money' ? '\u00A3 value' : '% change'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StackrAssetIcon({
  source,
  label,
  size = 48,
}: {
  source: any;
  label: string;
  size?: number;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.assetIconFrame,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: theme.colors.primary + '10',
          borderColor: theme.colors.primary + '20',
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <StackrFunctionalIcon
        source={source}
        resizeMode="contain"
        style={{ width: size * 0.76, height: size * 0.76 }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

function MoverCard({
  item,
  rank,
  direction,
  displayMode,
  personal = false,
}: {
  item: Mover;
  rank: number;
  direction: 'up' | 'down';
  displayMode: MoverDisplayMode;
  personal?: boolean;
}) {
  const { theme } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const useStackedMetrics = width < 480 || fontScale >= 1.25;
  const positive = direction === 'up';
  const color = positive ? '#10B981' : '#EF4444';
  const displayedChange = getMoverMoneyValue(item, personal);
  const primaryValue = displayMode === 'money' ? formatSignedMoney(displayedChange) : formatPercent(item.percentChange);
  const secondaryValue = displayMode === 'money' ? formatPercent(item.percentChange) : formatSignedMoney(displayedChange);
  const movementLabel = personal ? 'Collection impact' : 'Market movement';
  const primaryLabel = displayMode === 'money' ? movementLabel : '% movement';
  const secondaryLabel = displayMode === 'money' ? '% change' : movementLabel;
  const currentValue = formatMoney(item.latestPrice);
  const inferredSetId = item.setId ?? (item.cardId.includes('-') ? item.cardId.split('-')[0] : null);
  const setLogoUrl = useMemo(
    () => (inferredSetId ? getPokemonSetLogoUrl(inferredSetId) : undefined),
    [inferredSetId]
  );
  const ownershipText = personal && item.quantity && item.quantity > 1 ? `x${item.quantity} owned` : null;
  const openCardDetails = useCallback(() => {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: item.cardId,
      },
    });
  }, [item.cardId]);

  return (
    <TouchableOpacity
      onPress={openCardDetails}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name} card details`}
      style={[
        styles.moverCard,
        {
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.cardImageFrame,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="contain" />
        ) : (
          <Ionicons name="albums-outline" size={18} color={theme.colors.textSoft} />
        )}
      </View>

      <View style={styles.moverRowCopy}>
        <View style={styles.moverTitleRow}>
          {rank <= 10 ? (
            <View style={[styles.rankPill, { borderColor: `${theme.colors.primary}24`, backgroundColor: `${theme.colors.primary}12` }]}>
              <Text style={[styles.rankText, { color: theme.colors.primary }]}>TOP {rank}</Text>
            </View>
          ) : null}
          {ownershipText ? (
            <Text style={[styles.moverOwnedPill, { color, backgroundColor: `${color}10` }]}>
              {ownershipText}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.moverTitle, { color: theme.colors.text }]}
        >
          {item.name}
        </Text>
        {setLogoUrl ? (
          <Image source={{ uri: setLogoUrl }} style={styles.moverSetLogo} resizeMode="contain" />
        ) : (
          <Text style={[styles.moverSetFallback, { color: theme.colors.textSoft }]}>
            {item.setName ?? 'Pokemon TCG'}
          </Text>
        )}
        <Text style={[styles.moverComparisonBasis, { color: theme.colors.textSoft }]}>
          Stored estimate comparison: {formatMoney(item.previousPrice)} ({formatSnapshotDate(item.previousSnapshotAt)}) → {formatMoney(item.latestPrice)} ({formatSnapshotDate(item.snapshotAt)})
        </Text>
        <Text style={[styles.moverComparisonBasis, { color: theme.colors.textSoft }]}>
          Confidence: {item.confidence.label.replace(/_/g, ' ')}. Estimate calculation dates; source freshness is unavailable here.
        </Text>
        <View style={[styles.moverValueGrid, useStackedMetrics ? styles.moverValueGridStacked : null]}>
          <View style={[styles.moverValueMetric, useStackedMetrics ? styles.moverValueMetricStacked : null]}>
            <Text style={[styles.moverValueLabel, { color: theme.colors.textSoft }]}>Current estimate</Text>
            <Text style={[styles.moverPrice, { color: theme.colors.text }]}>{currentValue}</Text>
          </View>
          <View style={[styles.moverValueMetric, useStackedMetrics ? styles.moverValueMetricStacked : null]}>
            <Text style={[styles.moverValueLabel, { color: theme.colors.textSoft }]}>{primaryLabel}</Text>
            <Text style={[styles.moverDelta, { color }]}>{primaryValue}</Text>
          </View>
          <View style={[styles.moverValueMetric, useStackedMetrics ? styles.moverValueMetricStacked : null]}>
            <Text style={[styles.moverValueLabel, { color: theme.colors.textSoft }]}>{secondaryLabel}</Text>
            <View style={styles.moverPercentRow}>
              <Ionicons name={positive ? 'arrow-up' : 'arrow-down'} size={10} color={color} />
              <Text style={[styles.moverPercent, { color }]}>{secondaryValue}</Text>
            </View>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

function MoverColumn({
  title,
  items,
  direction,
  displayMode,
  personal = false,
}: {
  title: string;
  items: Mover[];
  direction: 'up' | 'down';
  displayMode: MoverDisplayMode;
  personal?: boolean;
}) {
  const { theme } = useTheme();
  const positive = direction === 'up';
  const color = positive ? '#10B981' : '#EF4444';
  const visibleItems = items.slice(0, MOVER_VISIBLE_LIMIT);

  return (
    <View
      style={[
        styles.moverColumn,
        {
          borderColor: positive ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)',
        },
      ]}
    >
      <View style={styles.moverColumnHeader}>
        <Ionicons name={positive ? 'trending-up-outline' : 'trending-down-outline'} size={16} color={color} />
        <Text style={[styles.moverColumnTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {items.length ? (
        <View style={styles.moverRail}>
          {visibleItems.map((item, index) => (
            <MoverCard
              key={`${personal ? 'personal' : 'general'}-${direction}-${item.cardId}`}
              item={item}
              rank={index + 1}
              direction={direction}
              displayMode={displayMode}
              personal={personal}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.moverColumnEmpty, { color: theme.colors.textSoft }]}>
          No {positive ? 'risers' : 'fallers'} in this snapshot.
        </Text>
      )}
    </View>
  );
}

function SectionCard({
  eyebrow,
  title,
  subtitle,
  children,
  variant = 'card',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: 'card' | 'open';
}) {
  const { theme } = useTheme();
  const open = variant === 'open';
  return (
    <View
      style={[
        styles.sectionCard,
        open ? styles.sectionCardOpen : null,
        {
          backgroundColor: open ? 'transparent' : theme.colors.card,
          borderColor: open ? 'transparent' : theme.colors.border,
        },
      ]}
    >
      {eyebrow ? <Text style={[styles.cardEyebrow, { color: theme.colors.primary }]}>{eyebrow}</Text> : null}
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.colors.textSoft }]}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function EmptyMovers({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.emptyMovers, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <StackrAssetIcon source={stackrIcons.marketMovers} label="Market movement" size={34} />
      <Text style={[styles.emptyText, { color: theme.colors.textSoft }]}>{message}</Text>
    </View>
  );
}

type ValueHistoryState = {
  scope: string;
  market: ReturnType<typeof marketValueHistory> & { loaded: boolean; loading: boolean; error: string | null; previewError: string | null };
  collection: ReturnType<typeof collectionValueHistory> & {
    loaded: boolean; loading: boolean; error: string | null; fromSavedCache: boolean; preparationPending: boolean;
  };
};
function emptyValueHistoryState(scope: string): ValueHistoryState {
  return { scope,
    market: { movers: [], trackedCards: 0, calculatedAt: null, loaded: false, loading: true, error: null, previewError: null },
    collection: { total: null, pointsByRange: { '7D': [], '30D': [], '6M': [], '12M': [] }, coverage: '',
      calculatedAt: null, historyAvailable: false, loaded: false, loading: true, error: null,
      fromSavedCache: false, preparationPending: false },
  };
}

export default function ValueHistoryScreen() {
  const { theme } = useTheme();
  const { user, loading: authLoading, error: authError, cachedReadSession, refreshAuth } = useAuth();
  const userId = user?.id ?? null;
  const scope = JSON.stringify([userId, cachedReadSession?.epoch ?? null, authLoading, authError]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const deniedScope = useRef<string | null>(null);
  const [state, setState] = useState(() => emptyValueHistoryState(scope));
  const [range, setRange] = useState<RangeKey>('7D');
  const [moverDisplayMode, setMoverDisplayMode] = useState<MoverDisplayMode>('money');
  const [refreshingScope, setRefreshingScope] = useState<string | null>(null);
  // Mask the old account in the transition render, before effect cleanup runs.
  const visible = state.scope === scope ? state : emptyValueHistoryState(scope);
  const { market, collection } = visible;
  const generalMovers = market.movers;
  const trackedMarketCount = market.loaded ? market.trackedCards : null;
  const generalLoading = market.loading;
  const collectionLoading = collection.loading;
  const generalError = market.error;
  const collectionError = collection.error;
  const currentCollectionValue = collection.total;
  const collectionCoverage = collection.coverage;
  const refreshing = refreshingScope === scope;
  const activePoints = collection.pointsByRange[range];
  const first = activePoints[0]?.value ?? 0;
  const latest = activePoints[activePoints.length - 1]?.value ?? currentCollectionValue ?? 0;
  const change = latest - first;
  const percent = first > 0 ? (change / first) * 100 : 0;
  const positive = change >= 0;
  const generalRisers = useMemo(
    () => getTopMovers(generalMovers, 'up', moverDisplayMode),
    [generalMovers, moverDisplayMode]
  );
  const generalLosers = useMemo(
    () => getTopMovers(generalMovers, 'down', moverDisplayMode),
    [generalMovers, moverDisplayMode]
  );
  const latestMarketLead = useMemo(
    () => [...generalRisers, ...generalLosers].sort((a, b) => getMoverAbsSortValue(b, moverDisplayMode) - getMoverAbsSortValue(a, moverDisplayMode))[0] ?? null,
    [generalLosers, generalRisers, moverDisplayMode]
  );
  const latestMarketDirection = latestMarketLead?.change ?? 0;
  const generalMarketStatus: AsyncStatus = generalLoading && !market.loaded ? 'loading'
    : generalRisers.length || generalLosers.length ? 'ready' : generalError ? 'error' : 'empty';
  const historyStatus: AsyncStatus = collectionLoading && !collection.loaded ? 'loading'
    : activePoints.length === 0 ? collectionError ? 'error' : 'empty'
      : activePoints.length === 1 ? 'single' : Math.abs(change) < 0.01 ? 'unchanged' : 'ready';
  const historyStateCopy = historyStatus === 'empty'
    ? 'History appears after two comparable stored valuation estimates.'
    : historyStatus === 'single' ? 'One stored observation found in this range. A second is needed for a trend.'
      : historyStatus === 'unchanged' ? 'Your collection value is unchanged across this range.' : null;

  const loadMarketScreen = useCallback(async (isRefresh = false) => {
    const request = ++generation.current;
    const isCurrent = () => generation.current === request && currentScope.current === scope;
    if (authLoading) return;
    if (isRefresh && deniedScope.current === scope) {
      await refreshAuth();
      return;
    }
    if (authError || !userId) {
      setState({ ...emptyValueHistoryState(scope),
        market: { ...emptyValueHistoryState(scope).market, loading: false,
          error: authError ? 'Sign-in could not be verified. Retry sign-in to read stored market data.' : 'Sign in to read stored market data.' },
        collection: { ...emptyValueHistoryState(scope).collection, loading: false,
          error: authError ? 'Sign-in could not be verified. Retry sign-in to read your collection.' : 'Sign in to read your collection history.' },
      });
      if (isRefresh && authError) await refreshAuth();
      return;
    }
    setRefreshingScope(isRefresh ? scope : null);
    setState((previous) => {
      const next = previous.scope === scope ? previous : emptyValueHistoryState(scope);
      return { ...next, market: { ...next.market, loading: true, error: null, previewError: null },
        collection: { ...next.collection, loading: true, error: null } };
    });
    const publish = (update: (previous: ValueHistoryState) => ValueHistoryState) => {
      if (isCurrent()) setState((previous) => previous.scope === scope ? update(previous) : previous);
    };
    const handleDenial = (error: unknown) => {
      if (!isKnownAuthDenial(error)) return false;
      if (isCurrent()) {
        deniedScope.current = scope;
        generation.current += 1;
        const cleared = emptyValueHistoryState(scope);
        const message = 'Stored pricing access could not be verified. Retry sign-in to continue.';
        setState({ ...cleared, market: { ...cleared.market, loading: false, error: message },
          collection: { ...cleared.collection, loading: false, error: message } });
        setRefreshingScope(null);
      }
      return true;
    };
    let authoritativeCollectionSettled = false;
    let collectionPreparationPending = false;
    // The same owner's Home cache can provide labelled saved history while a
    // prepared-summary route is absent or slow. Fresh results always win.
    void withValueHistoryDeadline(() => AsyncStorage.getItem(getHomeCollectionCacheKey(userId)), VALUE_HISTORY_PREVIEW_TIMEOUT_MS)
      .then((raw) => {
        if (!raw || !isCurrent() || authoritativeCollectionSettled) return;
        const saved = savedCollectionValueHistory(parseHomeCollectionCache(raw, userId));
        if (!saved) return;
        publish((previous) => ({ ...previous, collection: { ...previous.collection, ...saved, loaded: true, loading: false,
          fromSavedCache: true, preparationPending: collectionPreparationPending } }));
      }).catch(() => {});
    const loadGeneralMarket = async () => {
      try {
        const response = await withValueHistoryDeadline(
          () => stackrApiClient.marketMovers({ productType: 'raw_card', currency: 'GBP', limit: 100 }), VALUE_HISTORY_READ_TIMEOUT_MS);
        if (!isCurrent()) return;
        const result = marketValueHistory(response.data.movers);
        publish((previous) => ({ ...previous, market: { ...result, loaded: true, loading: false, error: null, previewError: null } }));
        // Optional names/artwork must never hold the paired factual estimates.
        const candidates = [
          ...getTopMovers(result.movers, 'up', 'money'), ...getTopMovers(result.movers, 'down', 'money'),
          ...getTopMovers(result.movers, 'up', 'percent'), ...getTopMovers(result.movers, 'down', 'percent'),
        ];
        if (candidates.length) {
          void withValueHistoryDeadline(() => fetchPreviews(candidates.map((item) => item.cardId)), VALUE_HISTORY_PREVIEW_TIMEOUT_MS)
            .then((previews) => publish((previous) => ({ ...previous, market: { ...previous.market,
              movers: previous.market.movers.map((item) => ({ ...item, ...previews.get(item.cardId) })), previewError: null } })))
            .catch(() => publish((previous) => ({ ...previous, market: { ...previous.market,
              previewError: 'Some card names or pictures could not be loaded. Retry stored data to try again.' } })));
        }
      } catch (error) {
        if (handleDenial(error)) return;
        publish((previous) => ({ ...previous, market: { ...previous.market,
          loading: false, error: 'Stored market data is temporarily unavailable. Any earlier results remain visible.' } }));
      }
    };
    const loadCollection = async () => {
      try {
        // This existing GET requests preparation of a stored summary if needed;
        // it does not set the provider-refresh flag. Never use the refresh POST.
        const response = await withValueHistoryDeadline(() => stackrApiClient.collectionValuation(), VALUE_HISTORY_READ_TIMEOUT_MS);
        if (!isCurrent()) return;
        const result = collectionValueHistory(response.data);
        if (!response.data.summary) {
          // A queued generation has no current valuation to supersede the
          // owner's explicitly labelled, validated saved observations.
          collectionPreparationPending = true;
          publish((previous) => ({ ...previous, collection: previous.collection.fromSavedCache
            ? { ...previous.collection, loading: false, error: null, preparationPending: true }
            : { ...result, loaded: true, loading: false, error: null, fromSavedCache: false, preparationPending: true } }));
          return;
        }
        authoritativeCollectionSettled = true;
        publish((previous) => ({ ...previous, collection: { ...result, loaded: true, loading: false, error: null,
          fromSavedCache: false, preparationPending: false } }));
      } catch (error) {
        if (handleDenial(error)) return;
        publish((previous) => ({ ...previous, collection: { ...previous.collection, loading: false,
          error: (error as { status?: number })?.status === 404
            ? 'Current collection valuation is unavailable on this server. Saved history, when available, remains visible.'
            : 'Your collection valuation is temporarily unavailable. Any earlier results remain visible.' } }));
      }
    };
    await Promise.all([loadGeneralMarket(), loadCollection()]);
    if (isCurrent()) setRefreshingScope(null);
  }, [scope, authLoading, authError, userId, refreshAuth]);

  useEffect(() => {
    void loadMarketScreen();
    return () => { generation.current += 1; };
  }, [loadMarketScreen]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <View style={styles.topBar}>
        <StackrBackButton onPress={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMarketScreen(true)} tintColor={theme.colors.primary} />}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.heroCardInner}>
            <View style={styles.heroCopy}>
              <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>MARKET MOVEMENT</Text>
              <StackrPageTitle title="Value History" accentText="History" />
              <Text style={[styles.headerSubtitle, { color: theme.colors.textSoft }]}>
                Track the cards and collections moving your value.
              </Text>
            </View>
            <StackrAssetIcon source={stackrIcons.marketMovers} label="Market movement chart" size={44} />
          </View>
          <View style={styles.heroMiniRow}>
            <View style={[styles.heroMiniPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.heroMiniLabel, { color: theme.colors.textSoft }]}>Stored market sample</Text>
              <Text numeric style={[styles.heroMiniValue, { color: theme.colors.text }]}>{trackedMarketCount ?? '--'}</Text>
            </View>
            <View style={[styles.heroMiniPill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.heroMiniLabel, { color: theme.colors.textSoft }]}>Collection range</Text>
              <Text style={[styles.heroMiniValue, { color: theme.colors.text }]}>{range}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.pulseCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.heroTopRow}>
            <StackrAssetIcon source={stackrIcons.marketMovers} label="Market pulse" size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.heroLabel, { color: theme.colors.textSoft }]}>Market Pulse</Text>
              <Text style={[styles.heroValue, { color: theme.colors.text }]}>
                {generalRisers.length || generalLosers.length
                  ? moverDisplayMode === 'money' ? 'Top value movers' : 'Top percentage movers'
                  : 'Watching prices'}
              </Text>
              <Text
                style={[
                  styles.heroChange,
                  { color: latestMarketLead ? latestMarketDirection < 0 ? '#EF4444' : '#10B981' : theme.colors.textSoft },
                ]}
              >
                {latestMarketLead
                  ? `${latestMarketLead.name} ${latestMarketDirection >= 0 ? 'up' : 'down'} ${moverDisplayMode === 'money' ? formatSignedMoney(getMoverMoneyValue(latestMarketLead)) : formatPercent(latestMarketLead.percentChange)}`
                  : generalError ?? (generalLoading && !market.loaded
                    ? 'Reading stored market estimates…'
                    : trackedMarketCount != null && trackedMarketCount > 0
                      ? 'No meaningful movement between the comparable stored estimates.'
                      : 'No comparable stored market estimates are available.')}
              </Text>
              {market.calculatedAt ? (
                <Text style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>
                  Latest estimate calculated {formatSnapshotDate(market.calculatedAt)}. This reads stored data; provider freshness is unavailable here.
                </Text>
              ) : null}
              <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => loadMarketScreen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Retry stored market value history"
                  style={[styles.refreshMarketButton, { borderColor: `${theme.colors.primary}24`, backgroundColor: `${theme.colors.primary}10` }]}
                >
                  <Text style={[styles.refreshMarketText, { color: theme.colors.primary }]}>Retry stored data</Text>
                  <Ionicons name="refresh" size={14} color={theme.colors.primary} />
                </TouchableOpacity>
            </View>
          </View>
        </View>

        <>
            <SectionCard
              eyebrow="GENERAL MARKET"
              title="General market"
              subtitle={`Swipe through risers and fallers by ${moverDisplayMode === 'money' ? 'cash movement' : 'percentage movement'}.`}
              variant="open"
            >
              <MoverDisplayToggle value={moverDisplayMode} onChange={setMoverDisplayMode} />
              {generalMarketStatus === 'loading' ? (
                <View style={styles.inlineLoading}><ActivityIndicator color={theme.colors.primary} /></View>
              ) : generalMarketStatus === 'ready' ? (
                <View style={styles.moverColumns}>
                  <MoverColumn title="Risers" items={generalRisers} direction="up" displayMode={moverDisplayMode} />
                  <MoverColumn title="Fallers" items={generalLosers} direction="down" displayMode={moverDisplayMode} />
                </View>
              ) : (
                <EmptyMovers message={generalError ?? (trackedMarketCount != null && trackedMarketCount > 0
                  ? 'No meaningful movement between the comparable stored estimates.'
                  : 'No comparable stored market estimates are available. Movement needs two observations for the same price identity.')} />
              )}
              {generalError && generalMarketStatus === 'ready' ? (
                <Text accessibilityRole="alert" style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>{generalError}</Text>
              ) : null}
              {market.previewError ? (
                <Text style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>{market.previewError}</Text>
              ) : null}
            </SectionCard>

            <SectionCard
              eyebrow="YOUR COLLECTION"
              title="Collection movers"
              subtitle="Individual card movement requires comparable estimates for each exact owned identity."
              variant="open"
            >
              {collectionLoading && !collection.loaded ? (
                <View style={styles.inlineLoading}><ActivityIndicator color={theme.colors.primary} /></View>
              ) : (
                <EmptyMovers message={collectionError ?? (collection.historyAvailable
                  ? 'Your comparable collection history is shown below. Individual card movers are unavailable because this valuation contains no per-card history.'
                  : 'Individual collection movers are unavailable. They need stored history for each exact owned card; a collection subtotal cannot establish it.')} />
              )}
            </SectionCard>

            <SectionCard
              eyebrow="YOUR VALUE"
              title="Collection history"
              subtitle="Stored estimate subtotal. Coverage and saved-data status are shown below."
            >
              <Text style={[styles.historyValue, { color: theme.colors.text }]}>
                {currentCollectionValue == null ? '--' : formatMoney(currentCollectionValue)}
              </Text>
              {historyStatus === 'ready' ? (
                <Text style={[styles.historyChange, { color: positive ? '#10B981' : '#EF4444' }]}>
                  {formatSignedMoney(change)} ({formatPercent(percent)}) over {RANGES.find((item) => item.key === range)?.label}
                </Text>
              ) : null}
              {historyStateCopy ? (
                <Text style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>{historyStateCopy}</Text>
              ) : null}
              {collectionCoverage ? (
                <Text style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>{collectionCoverage}</Text>
              ) : null}
              {collection.fromSavedCache && collection.preparationPending ? (
                <Text style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>
                  Your current collection valuation is being prepared. Saved history remains visible.
                </Text>
              ) : null}
              {collectionError ? (
                <Text accessibilityRole="alert" style={[styles.historyStateCopy, { color: theme.colors.textSoft }]}>{collectionError}</Text>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => loadMarketScreen(true)}
                accessibilityRole="button"
                accessibilityLabel="Retry collection value history"
                style={[styles.refreshMarketButton, { borderColor: `${theme.colors.primary}24`, backgroundColor: `${theme.colors.primary}10` }]}
              >
                <Text style={[styles.refreshMarketText, { color: theme.colors.primary }]}>Retry collection history</Text>
                <Ionicons name="refresh" size={14} color={theme.colors.primary} />
              </TouchableOpacity>

              <View style={styles.rangeRow}>
                {RANGES.map((item) => {
                  const active = item.key === range;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => setRange(item.key)}
                      activeOpacity={0.82}
                      style={[
                        styles.rangeButton,
                        {
                          backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.rangeText, { color: active ? theme.colors.primary : theme.colors.text }]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {historyStatus === 'loading' ? (
                <View style={styles.inlineLoading}><ActivityIndicator color={theme.colors.primary} /></View>
              ) : historyStatus !== 'ready' && historyStatus !== 'unchanged' ? (
                <EmptyMovers message={collectionError ?? 'Price history is building. It appears after two comparable stored valuation estimates.'} />
              ) : (
                <ValueHistoryChart points={activePoints} />
              )}
            </SectionCard>
        </>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: stackrTabContentPadding.standard,
  },
  topBar: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  heroCard: {
    position: 'relative',
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    marginBottom: 9,
    overflow: 'hidden',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroMiniRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  heroMiniPill: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  heroMiniLabel: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
  },
  heroMiniValue: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    fontSize: 16,
    lineHeight: 20,
    marginTop: 2,
  },
  pulseCard: {
    position: 'relative',
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroLabel: {
    ...typeScale.caption,
    fontSize: 11,
    lineHeight: 14,
  },
  heroValue: {
    ...typeScale.sectionTitle,
    marginTop: 3,
  },
  heroChange: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 3,
  },
  refreshMarketButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    marginTop: 9,
  },
  refreshMarketText: {
    ...typeScale.buttonSecondary,
    fontSize: 12,
    lineHeight: 15,
  },
  assetIconFrame: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.05,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#1B2A4B',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sectionCardOpen: {
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 2,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardEyebrow: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.7,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    marginTop: 3,
  },
  sectionSubtitle: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  sectionBody: {
    marginTop: 7,
  },
  displayToggle: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
    gap: 4,
    marginBottom: 8,
  },
  displayToggleButton: {
    minWidth: 76,
    minHeight: 30,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  displayToggleText: {
    ...typeScale.buttonSecondary,
    ...tabularNumberStyle,
    fontSize: 11.5,
    lineHeight: 14,
  },
  moverColumns: {
    gap: 16,
    alignItems: 'stretch',
  },
  moverColumn: {
    width: '100%',
    minWidth: 0,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  moverColumnHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  moverColumnTitle: {
    flex: 1,
    ...typeScale.cardTitle,
    fontSize: 14,
    lineHeight: 18,
  },
  moverColumnEmpty: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 14,
    paddingVertical: 12,
    textAlign: 'center',
  },
  moverRail: {
    gap: 0,
  },
  moverCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  rankPill: {
    minWidth: 42,
    minHeight: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  rankText: {
    ...typeScale.caption,
    ...tabularNumberStyle,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  moverOwnedPill: {
    ...typeScale.micro,
    ...tabularNumberStyle,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  cardImageFrame: {
    width: 64,
    height: 90,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 3,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  moverRowCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  moverTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  moverTitle: {
    width: '100%',
    ...typeScale.cardTitle,
    fontSize: 16.5,
    lineHeight: 20,
    textAlign: 'left',
  },
  moverSetLogo: {
    width: 82,
    height: 20,
    flexShrink: 0,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  moverSetFallback: {
    width: '100%',
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'left',
    marginTop: 4,
  },
  moverComparisonBasis: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 6,
  },
  moverValueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  moverValueGridStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  moverValueMetric: {
    flexGrow: 1,
    flexBasis: 76,
    minWidth: 72,
  },
  moverValueMetricStacked: {
    flexGrow: 0,
    flexBasis: 'auto',
    minWidth: 0,
    width: '100%',
  },
  moverValueLabel: {
    ...typeScale.caption,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  moverDelta: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    fontSize: 14,
    lineHeight: 18,
  },
  moverPrice: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    fontSize: 17,
    lineHeight: 21,
    marginTop: 0,
  },
  moverPercentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 18,
  },
  moverPercent: {
    ...typeScale.caption,
    ...tabularNumberStyle,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '900',
  },
  emptyMovers: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    ...typeScale.support,
    textAlign: 'center',
  },
  loadingCard: {
    minHeight: 128,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  loadingText: {
    ...typeScale.support,
    marginTop: 10,
    textAlign: 'center',
  },
  inlineLoading: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyValue: {
    ...typeScale.heroValue,
    ...tabularNumberStyle,
    fontSize: 32,
    lineHeight: 36,
  },
  historyChange: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
  },
  historyStateCopy: {
    ...typeScale.support,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  rangeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rangeText: {
    ...typeScale.buttonSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 188,
    marginTop: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(123,86,200,0.22)',
    backgroundColor: 'rgba(123,86,200,0.08)',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#4B22A2',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  chartTrackerBubble: {
    position: 'absolute',
    top: 10,
    width: 108,
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(45,20,102,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(191,167,255,0.42)',
    alignItems: 'center',
    shadowColor: '#35187A',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  chartTrackerValue: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
  },
  chartTrackerDate: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    lineHeight: 12,
    marginTop: 1,
  },
});
