import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from './Text';
import { useTheme } from './theme-context';
import {
  PokeTraceCardPriceResult,
  PokeTraceHistoryPeriod,
  PokeTraceHistoryPoint,
  fetchPokeTraceCardPrice,
  fetchPokeTracePriceHistory,
} from '../lib/pricing';

type SourceKey = 'ebay' | 'tcgplayer' | 'cardmarket';

type Props = {
  cardName: string;
  setName?: string | null;
  number?: string | null;
  rawCondition?: string | null;
  gradingCompany?: string | null;
  grade?: string | number | null;
  summaryOnly?: boolean;
};

const PERIODS: PokeTraceHistoryPeriod[] = ['7d', '30d', '90d'];

const SOURCE_COPY: Record<SourceKey, { label: string; color: string }> = {
  ebay: { label: 'eBay sold', color: '#20C997' },
  tcgplayer: { label: 'TCGPlayer', color: '#F5B941' },
  cardmarket: { label: 'CardMarket', color: '#7C8CFF' },
};

const formatCurrency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `£${value.toFixed(2)}` : '--';

const formatPercent = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const normalizeConditionTier = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getRawTier = (price: PokeTraceCardPriceResult | null, rawCondition?: string | null) => {
  const requested = normalizeConditionTier(rawCondition);
  if (requested && price?.conditionOptions?.includes(requested)) return requested;
  return price?.conditionOptions?.includes('NEAR_MINT') ? 'NEAR_MINT' : price?.conditionOptions?.[0] ?? 'NEAR_MINT';
};

const getChartValue = (point: PokeTraceHistoryPoint) => point.value ?? point.avg;

function buildLinePath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function MiniMarketChart({
  history,
  width,
  height,
}: {
  history: PokeTraceHistoryPoint[];
  width: number;
  height: number;
}) {
  const geometry = useMemo(() => {
    const rows = history.filter((row) => getChartValue(row) != null);
    const values = rows.map((row) => getChartValue(row) as number);
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const padX = 18;
    const padTop = 16;
    const padBottom = 24;
    const chartWidth = Math.max(1, width - padX * 2);
    const chartHeight = Math.max(1, height - padTop - padBottom);

    const sourceOrder: SourceKey[] = ['ebay', 'tcgplayer', 'cardmarket'];
    const series = sourceOrder
      .map((source) => {
        const sourceRows = rows.filter((row) => row.source === source || (source === 'cardmarket' && row.source.startsWith('cardmarket')));
        const points = sourceRows.map((row, index) => ({
          x: padX + (sourceRows.length <= 1 ? 0 : (index / (sourceRows.length - 1)) * chartWidth),
          y: padTop + ((max - (getChartValue(row) as number)) / range) * chartHeight,
        }));
        return { source, points };
      })
      .filter((item) => item.points.length >= 2);

    return {
      min,
      max,
      series,
      baseline: padTop + ((max - min) / range) * chartHeight,
      chartBottom: padTop + chartHeight,
    };
  }, [height, history, width]);

  if (!geometry) {
    return (
      <View style={[styles.chartEmpty, { height }]}>
        <Text style={styles.chartEmptyText}>History appears after PokeTrace has enough rows for this tier.</Text>
      </View>
    );
  }

  return (
    <View style={{ height, width: '100%' }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="insightFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#20C997" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#20C997" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((position) => (
          <Line
            key={position}
            x1={14}
            x2={width - 14}
            y1={height * position}
            y2={height * position}
            stroke="rgba(148, 163, 184, 0.18)"
            strokeWidth={1}
          />
        ))}
        {geometry.series.map(({ source, points }, index) => {
          const color = SOURCE_COPY[source].color;
          const linePath = buildLinePath(points);
          const first = points[0];
          const last = points[points.length - 1];
          const fillPath = index === 0
            ? `${linePath} L ${last.x.toFixed(1)} ${geometry.chartBottom.toFixed(1)} L ${first.x.toFixed(1)} ${geometry.chartBottom.toFixed(1)} Z`
            : '';
          return (
            <React.Fragment key={source}>
              {fillPath ? <Path d={fillPath} fill="url(#insightFill)" /> : null}
              <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.chartScale}>
        <Text style={styles.chartScaleText}>{formatCurrency(geometry.max)}</Text>
        <Text style={styles.chartScaleText}>{formatCurrency(geometry.min)}</Text>
      </View>
    </View>
  );
}

export default function PokeTraceMarketInsights({
  cardName,
  setName,
  number,
  rawCondition,
  gradingCompany,
  grade,
  summaryOnly = false,
}: Props) {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [period, setPeriod] = useState<PokeTraceHistoryPeriod>('30d');
  const [price, setPrice] = useState<PokeTraceCardPriceResult | null>(null);
  const [history, setHistory] = useState<PokeTraceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isGradedMode = Boolean(gradingCompany && grade);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const trimmedName = cardName.trim();
      if (!trimmedName) {
        setPrice(null);
        setHistory([]);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const current = await fetchPokeTraceCardPrice({
          identifier: trimmedName,
          setName: setName ?? null,
          number: number ?? null,
          market: 'US',
          gradingCompany,
          grade,
        });
        if (!mounted) return;
        setPrice(current);

        if (summaryOnly) {
          setHistory([]);
          return;
        }

        const tier = current?.graded_tier ?? getRawTier(current, rawCondition);
        const rows = current?.providerCardId
          ? await fetchPokeTracePriceHistory(current.providerCardId, tier, period)
          : [];
        if (!mounted) return;
        setHistory(rows);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [cardName, grade, gradingCompany, number, period, rawCondition, setName, summaryOnly]);

  const depthRows = useMemo(() => {
    const rows = [
      {
        key: 'ebay',
        label: isGradedMode ? `${gradingCompany} ${grade}` : 'eBay sold',
        value: isGradedMode ? price?.graded_average ?? null : price?.ebay_average ?? null,
        low: isGradedMode ? price?.graded_low ?? null : price?.ebay_low ?? null,
        high: isGradedMode ? price?.graded_high ?? null : price?.ebay_high ?? null,
        count: isGradedMode ? price?.graded_count ?? 0 : price?.ebay_count ?? 0,
        color: SOURCE_COPY.ebay.color,
      },
      {
        key: 'tcgplayer',
        label: 'TCGPlayer NM',
        value: price?.tcg_mid ?? null,
        low: price?.tcg_low ?? null,
        high: null,
        count: null,
        color: SOURCE_COPY.tcgplayer.color,
      },
      {
        key: 'cardmarket',
        label: 'CardMarket',
        value: price?.cardmarket_trend ?? null,
        low: null,
        high: null,
        count: null,
        color: SOURCE_COPY.cardmarket.color,
      },
    ];
    return rows.filter((row) => row.value != null || row.low != null || row.high != null);
  }, [grade, gradingCompany, isGradedMode, price]);

  const priceValues = depthRows.flatMap((row) => [row.value, row.low, row.high]).filter((value): value is number => typeof value === 'number');
  const low = priceValues.length ? Math.min(...priceValues) : null;
  const high = priceValues.length ? Math.max(...priceValues) : null;
  const firstHistory = history.find((row) => getChartValue(row) != null);
  const lastHistory = [...history].reverse().find((row) => getChartValue(row) != null);
  const change = firstHistory && lastHistory && getChartValue(firstHistory)
    ? (((getChartValue(lastHistory) as number) - (getChartValue(firstHistory) as number)) / (getChartValue(firstHistory) as number)) * 100
    : null;
  const chartWidth = Math.max(280, Math.min(screenWidth - 62, 720));

  if (summaryOnly) {
    const primaryLabel = isGradedMode ? `${gradingCompany} ${grade}` : 'PokeTrace market';
    const primaryValue = isGradedMode ? price?.graded_average ?? null : price?.ebay_average ?? null;
    const primaryLow = isGradedMode ? price?.graded_low ?? null : price?.ebay_low ?? null;
    const primaryHigh = isGradedMode ? price?.graded_high ?? null : price?.ebay_high ?? null;
    const primaryCount = isGradedMode ? price?.graded_count ?? 0 : price?.ebay_count ?? 0;

    return (
      <View style={[styles.summaryPanel, { backgroundColor: theme.colors.primary + '10', borderColor: theme.colors.primary + '35' }]}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>Primary price</Text>
            <Text style={[styles.title, { color: theme.colors.text }]}>PokeTrace {primaryLabel}</Text>
          </View>
          {loading && <ActivityIndicator size="small" color={theme.colors.primary} />}
        </View>

        {error ? (
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>PokeTrace pricing is unavailable right now.</Text>
        ) : (
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryMain, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>Average</Text>
              <Text style={{ color: theme.colors.primary, fontSize: 24, fontWeight: '900', marginTop: 2 }}>
                {formatCurrency(primaryValue)}
              </Text>
            </View>
            <View style={[styles.summarySide, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>Range</Text>
              <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900', marginTop: 4 }}>
                {formatCurrency(primaryLow)} - {formatCurrency(primaryHigh)}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 4 }}>
                {primaryCount ? `${primaryCount}+ sales` : 'Volume --'}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>Market insights</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>Price movement</Text>
        </View>
        <View style={styles.periodRow}>
          {PERIODS.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setPeriod(item)}
              style={[
                styles.periodButton,
                {
                  backgroundColor: period === item ? theme.colors.primary : theme.colors.surface,
                  borderColor: period === item ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Text style={{ color: period === item ? '#FFFFFF' : theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                {item.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Loading market history...</Text>
        </View>
      ) : error ? (
        <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Market history is unavailable right now.</Text>
      ) : (
        <>
          <View style={styles.statGrid}>
            <View style={[styles.statCell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textSoft }]}>Range</Text>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>{formatCurrency(low)} - {formatCurrency(high)}</Text>
            </View>
            <View style={[styles.statCell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textSoft }]}>Volume</Text>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {isGradedMode
                  ? price?.graded_count ? `${price.graded_count}+` : '--'
                  : price?.ebay_count ? `${price.ebay_count}+` : '--'}
              </Text>
            </View>
            <View style={[styles.statCell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.statLabel, { color: theme.colors.textSoft }]}>Change</Text>
              <Text style={[styles.statValue, { color: change != null && change < 0 ? '#EF4444' : '#20C997' }]}>{formatPercent(change)}</Text>
            </View>
          </View>

          <MiniMarketChart history={history} width={chartWidth} height={170} />

          <View style={styles.legendRow}>
            {(['ebay', 'tcgplayer', 'cardmarket'] as SourceKey[]).map((source) => (
              <View key={source} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SOURCE_COPY[source].color }]} />
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>{SOURCE_COPY[source].label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.depthRows}>
            {depthRows.map((row) => (
              <View key={row.key} style={[styles.depthRow, { borderColor: theme.colors.border }]}>
                <View style={styles.depthLabelWrap}>
                  <View style={[styles.legendDot, { backgroundColor: row.color }]} />
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 12 }}>{row.label}</Text>
                </View>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>{formatCurrency(row.value)}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 11 }}>
                  {row.low != null || row.high != null ? `${formatCurrency(row.low)} - ${formatCurrency(row.high)}` : row.count ? `${row.count} sales` : '--'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
  },
  summaryPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryMain: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  summarySide: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
  },
  periodButton: {
    minWidth: 38,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 10,
    padding: 9,
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '900',
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
  },
  chartScale: {
    position: 'absolute',
    right: 4,
    top: 8,
    bottom: 16,
    justifyContent: 'space-between',
  },
  chartScaleText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  depthRows: {
    gap: 7,
  },
  depthRow: {
    minHeight: 44,
    borderTopWidth: 1,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  depthLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1.1,
  },
});
