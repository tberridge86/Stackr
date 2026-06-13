import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Text } from './Text';
import { useTheme } from './theme-context';

type CurrencyCode = 'GBP' | 'USD' | 'EUR';

export type ValueTrackerCardProps = {
  totalValue: number;
  currency?: CurrencyCode;
  percentageChange?: number;
  absoluteChange?: number;
  changePeriodLabel?: string;
  trendData?: number[];
  isLoading?: boolean;
  error?: string | null;
  onPress?: () => void;
};

type ValueTrackerActionProps = {
  onEmptyAction?: () => void;
  onRetry?: () => void;
};

const CARD_WIDTH = 132;
const CARD_HEIGHT = 92;

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

function buildDisplayTrend(
  values: number[],
  totalValue: number,
  absoluteChange: number,
  percentageChange: number
) {
  const direction = getChangeDirection(absoluteChange, percentageChange);

  if (values.length >= 2) return alignTrendWithDirection(values, direction);
  if (values.length === 1) return [values[0], values[0]];
  if (!Number.isFinite(totalValue) || totalValue <= 0) return [];

  const count = 6;
  const previousValue = Number.isFinite(absoluteChange) && absoluteChange !== 0
    ? Math.max(0, totalValue - absoluteChange)
    : totalValue * (direction < 0 ? 1.03 : direction > 0 ? 0.97 : 1);

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const baseline = previousValue + (totalValue - previousValue) * progress;
    const wiggle = Math.sin(index * 1.7) * totalValue * 0.003;
    const value = index === count - 1 || direction === 0 ? baseline : baseline + wiggle;
    return Number(Math.max(0, value).toFixed(2));
  });
}

function getSparklinePath(values: number[], width: number, height: number) {
  const data = values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = max === min;
  const range = Math.max(1, max - min);
  const padX = 8;
  const padTop = 10;
  const padBottom = 16;
  const graphWidth = width - padX * 2;
  const graphHeight = height - padTop - padBottom;

  const points = data.map((value, index) => {
    const x = padX + (data.length <= 1 ? 0 : (index / (data.length - 1)) * graphWidth);
    const y = flat
      ? padTop + graphHeight / 2
      : padTop + ((max - value) / range) * graphHeight;
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = height - padBottom + 2;
  const fillPath = `${linePath} L ${last.x.toFixed(1)} ${baseline.toFixed(1)} L ${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;

  return { linePath, fillPath };
}

function MiniSparkline({
  values,
  positive,
}: {
  values: number[];
  positive: boolean;
}) {
  const { linePath, fillPath } = useMemo(
    () => getSparklinePath(values, CARD_WIDTH, CARD_HEIGHT),
    [values]
  );
  const strokeColor = positive ? '#6EE7B7' : '#FCA5A5';

  return (
    <View pointerEvents="none" style={styles.sparklineWrap}>
      <Svg width={CARD_WIDTH} height={CARD_HEIGHT} viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}>
        <Defs>
          <SvgLinearGradient id="valueTrackerFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={strokeColor} stopOpacity="0.28" />
            <Stop offset="1" stopColor={strokeColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d="M 8 76 L 124 76" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <Path d={fillPath} fill="url(#valueTrackerFill)" />
        <Path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
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

export function ValueTrackerCard({
  totalValue,
  currency = 'GBP',
  percentageChange,
  absoluteChange,
  changePeriodLabel = '7D',
  trendData,
  isLoading = false,
  error = null,
  onPress,
  onEmptyAction,
  onRetry,
}: ValueTrackerCardProps & ValueTrackerActionProps) {
  const { isDark } = useTheme();
  const values = useMemo(() => getFiniteTrend(trendData), [trendData]);
  const derivedAbsoluteChange = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const derivedPercent = values.length >= 2 && values[0] !== 0
    ? (derivedAbsoluteChange / values[0]) * 100
    : 0;
  const displayChange = Number.isFinite(absoluteChange ?? NaN) ? absoluteChange! : derivedAbsoluteChange;
  const displayPercent = Number.isFinite(percentageChange ?? NaN) ? percentageChange! : derivedPercent;
  const isPositive = displayChange >= 0;
  const hasValue = Number.isFinite(totalValue) && totalValue > 0;
  const isEmpty = !isLoading && !error && !hasValue;
  const displayTrend = useMemo(
    () => buildDisplayTrend(values, totalValue, displayChange, displayPercent),
    [displayChange, displayPercent, totalValue, values]
  );
  const gradient = (isDark
    ? ['#261052', '#4A23A8', '#7B4DFF']
    : ['#5732D8', '#7148F5', '#A565FF']) as [string, string, string];
  const accessibilityChange = `${formatSignedCurrency(displayChange, currency)}, ${formatSignedPercent(displayPercent)} over ${changePeriodLabel}`;
  const interactive = Boolean(onPress) && !isLoading && !error && !isEmpty;

  const renderState = () => {
    if (isLoading) {
      return (
        <View style={styles.stateContent}>
          <View style={{ flex: 1 }}>
            <SkeletonBar width="68%" height={16} />
            <SkeletonBar width="92%" height={42} />
            <SkeletonBar width="56%" height={30} />
          </View>
          <View style={styles.loadingSparkline}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.messageContent}>
          <View style={styles.messageIcon}>
            <Ionicons name="cloud-offline-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.messageTitle}>Value unavailable right now</Text>
            <Text style={styles.messageCopy} numberOfLines={2}>
              {error || 'We could not refresh market prices.'}
            </Text>
          </View>
          {onRetry ? (
            <TouchableOpacity onPress={onRetry} activeOpacity={0.82} style={styles.stateButton}>
              <Ionicons name="refresh" size={15} color="#3C197E" />
              <Text style={styles.stateButtonText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    if (isEmpty) {
      return (
        <View style={styles.messageContent}>
          <View style={styles.messageIcon}>
            <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.messageTitle}>Start tracking your collection</Text>
            <Text style={styles.messageCopy} numberOfLines={2}>
              Scan cards to build your live market value.
            </Text>
          </View>
          {onEmptyAction ? (
            <TouchableOpacity onPress={onEmptyAction} activeOpacity={0.82} style={styles.stateButton}>
              <Ionicons name="camera" size={15} color="#3C197E" />
              <Text style={styles.stateButtonText}>Scan a Card</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.valueContent}>
        <View style={styles.valueColumn}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={styles.valueText}
          >
            {formatCurrency(totalValue, currency)}
          </Text>
          <View style={[styles.changeBadge, { backgroundColor: isPositive ? 'rgba(16,185,129,0.18)' : 'rgba(248,113,113,0.18)' }]}>
            <Ionicons
              name={isPositive ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={isPositive ? '#7CF3C7' : '#FCA5A5'}
            />
            <Text style={[styles.changeText, { color: isPositive ? '#B9FFE3' : '#FFD1D1' }]} numberOfLines={1}>
              {formatSignedCurrency(displayChange, currency)} ({formatSignedPercent(displayPercent)})
            </Text>
          </View>
          <Text style={styles.periodText}>{changePeriodLabel}</Text>
        </View>

        <MiniSparkline values={displayTrend} positive={isPositive} />
      </View>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={!interactive}
      onPress={interactive ? onPress : undefined}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={
        hasValue
          ? `Total collection value ${formatCurrency(totalValue, currency)}. ${accessibilityChange}.`
          : undefined
      }
      style={styles.touchable}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View pointerEvents="none" style={styles.diagonalGlow} />
        <View pointerEvents="none" style={styles.topSheen} />

        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>Total Collection Value</Text>
            <Text style={styles.sourceText}>TCG market tracker</Text>
          </View>
          <View style={styles.actionIcon}>
            <Ionicons
              name={error ? 'refresh-outline' : isEmpty ? 'camera-outline' : 'information-circle-outline'}
              size={20}
              color="#FFFFFF"
            />
          </View>
        </View>

        {renderState()}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: 24,
    marginBottom: 10,
  },
  card: {
    minHeight: 190,
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
    shadowColor: '#2A105F',
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  diagonalGlow: {
    position: 'absolute',
    right: -44,
    top: -32,
    width: 180,
    height: 240,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '24deg' }],
  },
  topSheen: {
    position: 'absolute',
    left: -28,
    right: -28,
    top: -54,
    height: 92,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '-7deg' }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  sourceText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 22,
  },
  valueColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  valueText: {
    color: '#FFFFFF',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
    letterSpacing: 0,
  },
  changeBadge: {
    alignSelf: 'flex-start',
    minHeight: 34,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  changeText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  periodText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
  },
  sparklineWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    backgroundColor: 'rgba(20,10,54,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
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
    backgroundColor: 'rgba(20,10,54,0.20)',
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  messageCopy: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 17,
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
    color: '#3C197E',
    fontSize: 12,
    fontWeight: '900',
  },
});
