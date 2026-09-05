import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrPageTitle } from '../components/StackrScreen';
import { fetchBinderCards, fetchBinders, type BinderCardRecord, type BinderRecord } from '../lib/binders';
import { getPokemonSetLogoUrl } from '../lib/pokemonTcg';
import { getPreferredSetDisplayName } from '../lib/pokemonDisplayNames';
import { stackrIcons } from '../lib/stackrIcons';
import { stackrTabContentPadding } from '../lib/stackrSizing';
import { tabularNumberStyle, typeScale } from '../lib/typography';
import { fetchStackrCardRows } from '../lib/stackrDomainAdapter';
import { stackrApiClient } from '../lib/stackrApiV1';
import { loadCollectionPrices } from '../lib/collectionPricingApi';
import { summariseCollectionPricing } from '../lib/collectionPricingState';
import { fetchOwnedCardRows } from '../lib/ownership';

type RangeKey = '7D' | '30D' | '6M' | '12M';
type MoverDisplayMode = 'money' | 'percent';
type AsyncStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'single' | 'unchanged' | 'error';
type HistoryPoint = { day: string; value: number };
type ChartCoord = HistoryPoint & { x: number; y: number };
type CardPreview = { name: string; setId: string | null; setName: string | null; imageUrl: string | null };
type Mover = {
  cardId: string;
  name: string;
  setId: string | null;
  setName: string | null;
  imageUrl: string | null;
  latestPrice: number;
  previousPrice: number;
  change: number;
  percentChange: number;
  quantity?: number;
  impact?: number;
  snapshotAt?: string | null;
};
type OwnedCardUnit = {
  key: string;
  card: BinderCardRecord | null;
  cardId: string;
  setId: string;
  ids: string[];
  quantity: number;
  variant: string | null;
  condition: string | null;
  gradeCompany: string | null;
  grade: string | null;
  productType: 'raw_card' | 'graded_card';
  identityExact: boolean;
};

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7D', label: '7D', days: 7 },
  { key: '30D', label: '30D', days: 30 },
  { key: '6M', label: '6 Months', days: 183 },
  { key: '12M', label: '12 Months', days: 365 },
];

const MONEY_PREFIX = '\u00A3';
const MEANINGFUL_CHANGE_GBP = 0.1;
const MEANINGFUL_CHANGE_PERCENT = 0.5;
const MOVER_DISPLAY_LIMIT = 10;
const MOVER_VISIBLE_LIMIT = 5;


const formatMoney = (value: number, fallback = `${MONEY_PREFIX}0.00`) => {
  if (!Number.isFinite(value)) return fallback;
  const abs = Math.abs(value);
  return `${MONEY_PREFIX}${abs.toLocaleString('en-GB', {
    minimumFractionDigits: abs >= 1000 ? 0 : 2,
    maximumFractionDigits: abs >= 1000 ? 0 : 2,
  })}`;
};

const formatSignedMoney = (value: number) =>
  `${value >= 0 ? '+' : '-'}${formatMoney(Math.abs(value))}`;

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;


const toDayKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().split('T')[0];
};

const getSnapshotValue = (row: any): number | null => {
  const value = row?.tcgdex_price ?? row?.tcg_mid ?? row?.tcg_low ?? row?.ebay_average ?? row?.cardmarket_trend;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getOwnedQuantity = (card: BinderCardRecord) =>
  card.owned === false ? 0 : Math.max(1, Number(card.owned_quantity ?? 1));

const getCardIds = (card: BinderCardRecord) =>
  [...new Set([card.card_id, card.api_card_id].filter(Boolean))] as string[];

function groupLatestTwoSnapshots(rows: any[]) {
  const grouped = new Map<string, any[]>();

  for (const row of rows) {
    const price = getSnapshotValue(row);
    if (!row?.card_id || !row?.snapshot_at || price == null) continue;

    const existing = grouped.get(row.card_id) ?? [];
    const rowDay = String(row.snapshot_at).split('T')[0];
    if (existing.some((item) => String(item.snapshot_at).split('T')[0] === rowDay)) continue;
    if (existing.length < 2) existing.push(row);
    grouped.set(row.card_id, existing);
  }

  return grouped;
}

function buildMoverFromSnapshots(
  cardId: string,
  snapshots: any[],
  preview?: CardPreview | null,
  quantity = 1
): Mover | null {
  const latest = snapshots[0];
  const previous = snapshots[1];
  const latestPrice = getSnapshotValue(latest);
  const previousPrice = getSnapshotValue(previous);
  if (latestPrice == null || previousPrice == null || previousPrice <= 0) return null;

  const change = latestPrice - previousPrice;
  const percentChange = (change / previousPrice) * 100;
  if (
    Math.abs(change) < MEANINGFUL_CHANGE_GBP &&
    Math.abs(percentChange) < MEANINGFUL_CHANGE_PERCENT
  ) {
    return null;
  }

  return {
    cardId,
    name: preview?.name ?? cardId,
    setId: preview?.setId ?? null,
    setName: preview?.setName ?? null,
    imageUrl: preview?.imageUrl ?? null,
    latestPrice,
    previousPrice,
    change,
    percentChange,
    quantity,
    impact: change * quantity,
    snapshotAt: latest?.snapshot_at ?? null,
  };
}

async function fetchPreviews(cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  const previews = new Map<string, CardPreview>();
  if (!ids.length) return previews;

  const cardsById = await fetchStackrCardRows(ids);
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

async function executeMarketSnapshotRowsQuery({
  since,
  before,
  ascending = false,
  limit = 12000,
}: {
  since: string;
  before?: string | null;
  ascending?: boolean;
  limit?: number;
}): Promise<any[]> {
  const lowerBound = Date.parse(since);
  const upperBound = before ? Date.parse(before) : Number.POSITIVE_INFINITY;
  const withinWindow = (value?: string | null) => {
    const timestamp = value ? Date.parse(value) : NaN;
    return Number.isFinite(timestamp) && timestamp >= lowerBound && timestamp < upperBound;
  };

  // marketMovers exposes two stored valuation estimates. Do not substitute a
  // current /price response here: it is one estimate, not price history.
  const response = await stackrApiClient.marketMovers({ productType: 'raw_card', currency: 'GBP', limit: Math.min(limit, 100) });
  const rows = response.data.movers.flatMap((mover) => {
    const cardId = mover.variantId;
    if (!cardId) return [];
    const points = [
      { card_id: cardId, tcg_mid: mover.currentEstimate, snapshot_at: mover.calculatedAt },
      { card_id: cardId, tcg_mid: mover.previousEstimate, snapshot_at: mover.previousCalculatedAt },
    ];
    return points.filter((point) => point.tcg_mid != null && withinWindow(point.snapshot_at));
  });
  return rows.sort((a, b) => ascending
    ? String(a.snapshot_at).localeCompare(String(b.snapshot_at))
    : String(b.snapshot_at).localeCompare(String(a.snapshot_at))).slice(0, limit);
}

async function fetchMarketSnapshotRows({
  since,
  before,
  limit = 12000,
}: {
  since: string;
  before?: string | null;
  limit?: number;
}): Promise<any[]> {
  return executeMarketSnapshotRowsQuery({ since, before, limit });
}

async function fetchGeneralMarketSnapshotRows(since: string): Promise<any[]> {
  const latestRows = await fetchMarketSnapshotRows({ since });
  const latestDay = latestRows[0]?.snapshot_at ? String(latestRows[0].snapshot_at).split('T')[0] : null;
  const latestDayStart = latestDay ? `${latestDay}T00:00:00.000Z` : null;
  const comparisonRows = latestDayStart
    ? await fetchMarketSnapshotRows({ since, before: latestDayStart })
    : [];

  if (comparisonRows.length) {
    return [...latestRows, ...comparisonRows];
  }

  const oldestLoadedAt = latestRows[latestRows.length - 1]?.snapshot_at ?? null;
  if (!oldestLoadedAt) return latestRows;

  const fallbackRows = await fetchMarketSnapshotRows({ since, before: oldestLoadedAt, limit: 6000 });
  return [...latestRows, ...fallbackRows];
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
            {new Date(`${trackedPoint.day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
      <Image
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
  const positive = direction === 'up';
  const color = positive ? '#10B981' : '#EF4444';
  const displayedChange = getMoverMoneyValue(item, personal);
  const primaryValue = displayMode === 'money' ? formatSignedMoney(displayedChange) : formatPercent(item.percentChange);
  const secondaryValue = displayMode === 'money' ? formatPercent(item.percentChange) : formatSignedMoney(displayedChange);
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
            <Text style={[styles.moverOwnedPill, { color, backgroundColor: `${color}10` }]} numberOfLines={1}>
              {ownershipText}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.moverTitle, { color: theme.colors.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {item.name}
        </Text>
        {setLogoUrl ? (
          <Image source={{ uri: setLogoUrl }} style={styles.moverSetLogo} resizeMode="contain" />
        ) : (
          <Text style={[styles.moverSetFallback, { color: theme.colors.textSoft }]} numberOfLines={1}>
            {item.setName ?? 'Pokemon TCG'}
          </Text>
        )}
      </View>

      <View style={styles.moverValueStack}>
        <Text style={[styles.moverPrice, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
          {currentValue}
        </Text>
        <Text style={[styles.moverDelta, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
          {primaryValue}
        </Text>
        <View style={styles.moverPercentRow}>
          <Ionicons name={positive ? 'arrow-up' : 'arrow-down'} size={10} color={color} />
          <Text style={[styles.moverPercent, { color }]} numberOfLines={1}>
            {secondaryValue}
          </Text>
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

export default function ValueHistoryScreen() {
  const { theme } = useTheme();
  const [range, setRange] = useState<RangeKey>('7D');
  const [pointsByRange, setPointsByRange] = useState<Record<RangeKey, HistoryPoint[]>>({
    '7D': [],
    '30D': [],
    '6M': [],
    '12M': [],
  });
  const [moverDisplayMode, setMoverDisplayMode] = useState<MoverDisplayMode>('money');
  const [generalMovers, setGeneralMovers] = useState<Mover[]>([]);
  const [personalMovers, setPersonalMovers] = useState<Mover[]>([]);
  const [trackedMarketCount, setTrackedMarketCount] = useState(0);
  const [generalLoading, setGeneralLoading] = useState(true);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [currentCollectionValue, setCurrentCollectionValue] = useState<number | null>(null);
  const [collectionCoverage, setCollectionCoverage] = useState<string | null>(null);

  const activePoints = pointsByRange[range];
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
  const personalRisers = useMemo(
    () => getTopMovers(personalMovers, 'up', moverDisplayMode, true),
    [moverDisplayMode, personalMovers]
  );
  const personalLosers = useMemo(
    () => getTopMovers(personalMovers, 'down', moverDisplayMode, true),
    [moverDisplayMode, personalMovers]
  );
  const latestMarketLead = useMemo(
    () => [...generalRisers, ...generalLosers].sort((a, b) => getMoverAbsSortValue(b, moverDisplayMode) - getMoverAbsSortValue(a, moverDisplayMode))[0] ?? null,
    [generalLosers, generalRisers, moverDisplayMode]
  );
  const latestMarketDirection = latestMarketLead?.change ?? 0;
  const generalMarketStatus: AsyncStatus = generalLoading
    ? 'loading'
    : generalError
      ? 'error'
      : generalRisers.length || generalLosers.length
        ? 'ready'
        : 'empty';
  const personalMarketStatus: AsyncStatus = collectionLoading
    ? 'loading'
    : collectionError
      ? 'error'
      : personalRisers.length || personalLosers.length
        ? 'ready'
        : 'empty';
  const historyStatus: AsyncStatus = collectionLoading
    ? 'loading'
    : collectionError
      ? 'error'
      : activePoints.length === 0
        ? 'empty'
        : activePoints.length === 1
          ? 'single'
          : Math.abs(change) < 0.01
            ? 'unchanged'
            : 'ready';
  const historyStateCopy = historyStatus === 'empty'
    ? collectionCoverage ?? 'Price history is building. It appears after two comparable stored valuation estimates.'
    : historyStatus === 'single'
      ? 'One snapshot found. More are needed for a trend.'
      : historyStatus === 'unchanged'
        ? 'Your collection value is unchanged across this range.'
        : null;

  const loadMarketScreen = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setGeneralLoading(!isRefresh);
    setCollectionLoading(!isRefresh);
    setGeneralError(null);
    setCollectionError(null);

    const loadGeneralMarket = async () => {
      const marketSince = new Date();
      marketSince.setDate(marketSince.getDate() - 21);
      try {
        const marketRows = await fetchGeneralMarketSnapshotRows(marketSince.toISOString());

        const groupedMarket = groupLatestTwoSnapshots(marketRows);
        const marketCardIds = [...groupedMarket.keys()];
        setTrackedMarketCount(marketCardIds.length);
        const rawGeneralMovers = marketCardIds
          .map((cardId) => buildMoverFromSnapshots(cardId, groupedMarket.get(cardId) ?? [], null, 1))
          .filter((item): item is Mover => Boolean(item));
        const rawGeneralCandidates = [
          ...getTopMovers(rawGeneralMovers, 'up', 'money'),
          ...getTopMovers(rawGeneralMovers, 'down', 'money'),
          ...getTopMovers(rawGeneralMovers, 'up', 'percent'),
          ...getTopMovers(rawGeneralMovers, 'down', 'percent'),
        ].filter((item, index, list) => list.findIndex((candidate) => candidate.cardId === item.cardId) === index);
        const marketPreviewMap = await fetchPreviews(rawGeneralCandidates.map((item) => item.cardId));
        setGeneralMovers(rawGeneralCandidates.map((item) => {
          const preview = marketPreviewMap.get(item.cardId);
          return preview ? { ...item, name: preview.name, setId: preview.setId, setName: preview.setName, imageUrl: preview.imageUrl } : item;
        }));
      } catch (err) {
        console.log('General market load failed', err);
        setGeneralMovers([]);
        setTrackedMarketCount(0);
        setGeneralError('General market data is temporarily unavailable.');
      } finally {
        setGeneralLoading(false);
      }
    };

    const loadCollection = async () => {
      try {
        const [binders, canonicalOwnedRows] = await Promise.all([
          fetchBinders(),
          fetchOwnedCardRows().catch((error) => {
            console.log('Canonical collection ownership load failed', error);
            return [];
          }),
        ]);
        const cardResults = await Promise.allSettled(binders.map((binder) => fetchBinderCards(binder.id)));
        const cards = cardResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
        const bindersById = new Map<string, BinderRecord>(binders.map((binder) => [binder.id, binder]));
        const cardsByIdentity = new Map<string, BinderCardRecord[]>();
        for (const card of cards) {
          const identity = `${card.set_id ?? ''}:${card.card_id}`;
          cardsByIdentity.set(identity, [...(cardsByIdentity.get(identity) ?? []), card]);
        }
        const unanimousDefault = (
          matchingBinders: BinderRecord[],
          read: (binder: BinderRecord) => string | null | undefined,
        ) => {
          const values = [...new Set(matchingBinders
            .map((binder) => String(read(binder) ?? '').trim())
            .filter(Boolean))];
          return values.length === 1 ? values[0] : null;
        };
        const canonicalIdentities = new Set(canonicalOwnedRows.map((row) => `${row.set_id}:${row.card_id}`));
        const ownedUnits: OwnedCardUnit[] = canonicalOwnedRows.map((row) => {
          const identity = `${row.set_id}:${row.card_id}`;
          const matchingCards = cardsByIdentity.get(identity) ?? [];
          const card = matchingCards[0] ?? null;
          const matchingBinders = [...new Map(matchingCards
            .map((candidate) => bindersById.get(candidate.binder_id))
            .filter((binder): binder is BinderRecord => Boolean(binder))
            .map((binder) => [binder.id, binder])).values()];
          const explicitCondition = String(row.condition ?? '').trim() || null;
          const explicitGradeCompany = String(row.grade_company ?? '').trim() || null;
          const explicitGrade = String(row.grade ?? '').trim() || null;
          const binderModes = [...new Set(matchingBinders.map((binder) => (
            binder.card_mode === 'graded' ? 'graded' : 'raw'
          )))];
          const hasExplicitGradeIdentity = Boolean(explicitGradeCompany || explicitGrade);
          const binderMode = binderModes.length === 1 ? binderModes[0] : null;
          const productType = hasExplicitGradeIdentity || binderMode === 'graded'
            ? 'graded_card' as const
            : 'raw_card' as const;
          const gradeCompany = explicitGradeCompany
            ?? (productType === 'graded_card'
              ? unanimousDefault(matchingBinders, (binder) => binder.default_grade_company)
              : null);
          const grade = explicitGrade
            ?? (productType === 'graded_card'
              ? unanimousDefault(matchingBinders, (binder) => binder.default_grade)
              : null);
          const condition = explicitCondition
            ?? (productType === 'raw_card'
              ? unanimousDefault(matchingBinders, (binder) => binder.default_condition)
              : null);
          return {
            key: [identity, row.variant, row.condition ?? '', row.grade_company ?? '', row.grade ?? ''].join(':'),
            card,
            cardId: row.card_id,
            setId: row.set_id,
            ids: [...new Set([card?.api_card_id, row.card_id].filter((value): value is string => Boolean(value)))],
            quantity: Math.max(0, Number(row.quantity ?? 1)),
            variant: row.variant || null,
            condition,
            gradeCompany,
            grade,
            productType,
            identityExact: binderModes.length <= 1 || hasExplicitGradeIdentity,
          };
        });
        const legacyIdentities = new Set<string>();
        for (const card of cards) {
          const identity = `${card.set_id ?? ''}:${card.card_id}`;
          const quantity = getOwnedQuantity(card);
          if (!quantity || canonicalIdentities.has(identity) || legacyIdentities.has(identity)) continue;
          legacyIdentities.add(identity);
          const binder = bindersById.get(card.binder_id) ?? null;
          const gradeCompany = card.grade_company || binder?.default_grade_company || null;
          const grade = card.grade || binder?.default_grade || null;
          const productType = gradeCompany || grade || binder?.card_mode === 'graded'
            ? 'graded_card' as const
            : 'raw_card' as const;
          ownedUnits.push({
            key: `legacy:${identity}:${card.condition ?? ''}:${card.grade_company ?? ''}:${card.grade ?? ''}`,
            card,
            cardId: card.card_id,
            setId: card.set_id,
            ids: getCardIds(card),
            quantity,
            variant: binder?.edition ?? null,
            condition: card.condition || binder?.default_condition || null,
            gradeCompany,
            grade,
            productType,
            identityExact: true,
          });
        }
        const prices = await loadCollectionPrices(ownedUnits.map((unit) => ({
          key: unit.key,
          references: unit.identityExact ? unit.ids : [],
          quantity: unit.quantity,
          language: unit.card?.language,
          setId: unit.card?.api_set_id ?? unit.setId,
          variantCode: unit.variant,
          productType: unit.productType,
          condition: unit.condition,
          grader: unit.gradeCompany,
          grade: unit.grade,
        })));
        const summary = summariseCollectionPricing(prices.map((price) => ({
          quantity: price.quantity,
          centralValue: price.central,
          evidenceStatus: price.status,
          freshness: price.freshness,
          calculatedAt: price.calculatedAt,
          staleAfter: price.staleAfter,
        })));
        setCurrentCollectionValue(summary.total);
        setCollectionCoverage(summary.total == null
          ? 'No stored collection estimates are available yet.'
          : summary.unpricedUnits > 0
            ? `Known value covers ${summary.pricedUnits} of ${summary.totalUnits} cards. Price history is building.`
            : 'Price history is building. It appears after two comparable stored valuation estimates.');
        // /price is a current estimate and /price-history is sale/asking evidence.
        // Neither can truthfully make a collection valuation chart by themselves.
        setPointsByRange({ '7D': [], '30D': [], '6M': [], '12M': [] });
        setPersonalMovers([]);
      } catch (err) {
        console.log('Collection pricing load failed', err);
        setCollectionError('Your collection prices are temporarily unavailable.');
      } finally {
        setCollectionLoading(false);
      }
    };

    await Promise.all([loadGeneralMarket(), loadCollection()]);
    if (isRefresh) {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMarketScreen();
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
              <Text style={[styles.heroMiniLabel, { color: theme.colors.textSoft }]}>Market cards</Text>
              <Text numeric style={[styles.heroMiniValue, { color: theme.colors.text }]}>{trackedMarketCount || '--'}</Text>
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
                  : trackedMarketCount > 0
                    ? `${trackedMarketCount} cards checked. Waiting for a second refresh.`
                    : 'No market price refreshes found'}
              </Text>
              {!latestMarketLead ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => loadMarketScreen(true)}
                  style={[styles.refreshMarketButton, { borderColor: `${theme.colors.primary}24`, backgroundColor: `${theme.colors.primary}10` }]}
                >
                  <Text style={[styles.refreshMarketText, { color: theme.colors.primary }]}>Refresh Market Data</Text>
                  <Ionicons name="refresh" size={14} color={theme.colors.primary} />
                </TouchableOpacity>
              ) : null}
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
                <EmptyMovers message={generalError ?? (trackedMarketCount > 0 ? 'No meaningful movers in the latest stored estimates.' : 'No market-wide valuation estimates yet.')} />
              )}
            </SectionCard>

            <SectionCard
              eyebrow="YOUR COLLECTION"
              title="Collection movers"
              subtitle="Building from comparable stored estimates. A single refresh is never presented as movement."
              variant="open"
            >
              <MoverDisplayToggle value={moverDisplayMode} onChange={setMoverDisplayMode} />
              {personalMarketStatus === 'loading' ? (
                <View style={styles.inlineLoading}><ActivityIndicator color={theme.colors.primary} /></View>
              ) : personalMarketStatus === 'ready' ? (
                <View style={styles.moverColumns}>
                  <MoverColumn title="Risers" items={personalRisers} direction="up" displayMode={moverDisplayMode} personal />
                  <MoverColumn title="Fallers" items={personalLosers} direction="down" displayMode={moverDisplayMode} personal />
                </View>
              ) : (
                <EmptyMovers message={collectionError ?? 'Collection movers will appear after two comparable stored estimates.'} />
              )}
            </SectionCard>

            <SectionCard
              eyebrow="YOUR VALUE"
              title="Collection history"
              subtitle="A separate trend view for your owned cards."
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
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
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
    maxWidth: 82,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    overflow: 'hidden',
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
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
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
  moverValueStack: {
    width: 82,
    minHeight: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  moverDelta: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  moverPrice: {
    ...typeScale.numericStrong,
    ...tabularNumberStyle,
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 21,
    marginTop: 0,
  },
  moverPercentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
