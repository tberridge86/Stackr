import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stackrBrand } from '../lib/stackrBrand';
import {
  STACKR_FLOW_LAYOUT_TOKENS,
  getStackrFlowLayoutMetrics,
  resolveStackrFlowProgress,
  type StackrFlowProgressInput,
} from '../lib/stackrFlowLayoutCore';
import { Text } from './Text';
import { useTheme } from './theme-context';

export type StackrFlowStatusTone = 'neutral' | 'info' | 'warning' | 'error' | 'success';

export type StackrFlowStatus = {
  tone: StackrFlowStatusTone;
  title: string;
  message: string;
  live?: boolean;
};

const STATUS_ICONS: Record<StackrFlowStatusTone, keyof typeof Ionicons.glyphMap> = {
  neutral: 'information-circle-outline',
  info: 'sync-circle-outline',
  warning: 'warning-outline',
  error: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
};

function statusColours(tone: StackrFlowStatusTone, theme: ReturnType<typeof useTheme>['theme']) {
  if (tone === 'success') return { foreground: '#047857', background: '#ECFDF5', border: '#A7F3D0' };
  if (tone === 'warning') return { foreground: '#9A3412', background: '#FFF7ED', border: '#FED7AA' };
  if (tone === 'error') return { foreground: '#B91C1C', background: '#FEF2F2', border: '#FECACA' };
  if (tone === 'info') return { foreground: theme.colors.primary, background: theme.colors.surface, border: theme.colors.border };
  return { foreground: theme.colors.textSoft, background: theme.colors.card, border: theme.colors.border };
}

export function StackrFlowProgress({ progress }: { progress: StackrFlowProgressInput }) {
  const { theme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const model = useMemo(() => resolveStackrFlowProgress(progress), [progress]);
  const animatedValue = useRef(new Animated.Value(model.value ?? 0.36)).current;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const nextValue = model.value ?? 0.36;
    if (reduceMotion || model.mode === 'indeterminate') {
      animatedValue.setValue(nextValue);
      return;
    }
    Animated.timing(animatedValue, {
      toValue: nextValue,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, model.mode, model.value, reduceMotion]);

  const width = animatedValue.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const valueText = model.mode === 'indeterminate' ? 'In progress' : `${model.percent}%`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={model.accessibilityText}
      accessibilityValue={model.percent == null
        ? { text: progress.statusText || 'In progress' }
        : { min: 0, max: 100, now: model.percent, text: progress.statusText }}
      style={styles.progressRegion}
    >
      <View style={styles.progressLabelRow}>
        <Text style={[styles.progressLabel, { color: theme.colors.textSoft }]} numberOfLines={1}>
          {progress.label}
        </Text>
        <Text style={[styles.progressValue, { color: theme.colors.text }]} numberOfLines={1}>
          {valueText}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width,
              backgroundColor: model.mode === 'indeterminate' ? theme.colors.textSoft : theme.colors.primary,
            },
          ]}
        />
      </View>
      {progress.statusText ? (
        <Text style={[styles.progressStatus, { color: theme.colors.textSoft }]} accessibilityElementsHidden>
          {progress.statusText}
        </Text>
      ) : null}
    </View>
  );
}

export function StackrFlowStatusBanner({ status }: { status: StackrFlowStatus }) {
  const { theme } = useTheme();
  const colours = statusColours(status.tone, theme);

  return (
    <View
      accessible
      accessibilityRole={status.tone === 'error' || status.tone === 'warning' ? 'alert' : 'summary'}
      accessibilityLabel={`${status.title}. ${status.message}`}
      accessibilityLiveRegion={status.live ? 'polite' : 'none'}
      style={[styles.statusBanner, { backgroundColor: colours.background, borderColor: colours.border }]}
    >
      <Ionicons name={STATUS_ICONS[status.tone]} size={21} color={colours.foreground} />
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, { color: colours.foreground }]}>{status.title}</Text>
        <Text style={[styles.statusMessage, { color: colours.foreground }]}>{status.message}</Text>
      </View>
    </View>
  );
}

export function StackrFlowHeader({
  title,
  subtitle,
  leftAccessory,
  rightAccessory,
  progress,
  status,
  children,
  style,
}: {
  title: string;
  subtitle: string;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  progress?: StackrFlowProgressInput;
  status?: StackrFlowStatus;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const metrics = getStackrFlowLayoutMetrics(width);

  return (
    <View
      style={[
        styles.headerShell,
        { paddingHorizontal: metrics.horizontalPadding, maxWidth: STACKR_FLOW_LAYOUT_TOKENS.maxContentWidth },
        style,
      ]}
    >
      <View style={styles.brandRow}>
        <View style={styles.brandSide}>{leftAccessory}</View>
        <Image
          source={stackrBrand.wordmark}
          resizeMode="contain"
          style={styles.logo}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Stackr logo"
        />
        <View style={styles.brandSide} />
      </View>
      <View style={[styles.titleRow, metrics.stackHeaderActions && rightAccessory ? styles.titleRowCompact : null]}>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>{subtitle}</Text>
        </View>
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>
      {progress ? <StackrFlowProgress progress={progress} /> : null}
      {status ? <StackrFlowStatusBanner status={status} /> : null}
      {children}
    </View>
  );
}

export function StackrFlowActionArea({
  children,
  docked = false,
  compact = false,
  style,
}: {
  children: React.ReactNode;
  docked?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.actionArea,
        docked ? styles.actionAreaDocked : null,
        compact ? styles.actionAreaCompact : null,
        style,
        {
          paddingBottom: compact ? 8 : Math.max(12, insets.bottom),
          backgroundColor: theme.colors.bg,
          borderColor: theme.colors.border,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    width: '100%',
    alignSelf: 'center',
    paddingTop: 4,
    paddingBottom: 12,
  },
  brandRow: {
    minHeight: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  brandSide: {
    position: 'absolute',
    left: 0,
    top: 0,
    minWidth: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget,
    minHeight: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logo: {
    width: STACKR_FLOW_LAYOUT_TOKENS.logoWidth,
    height: STACKR_FLOW_LAYOUT_TOKENS.logoHeight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleRowCompact: {
    flexDirection: 'column',
  },
  titleCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  rightAccessory: { flexShrink: 0, minHeight: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget, justifyContent: 'center' },
  progressRegion: { marginTop: 12 },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressLabel: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  progressValue: { fontSize: 12, lineHeight: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  progressTrack: {
    height: STACKR_FLOW_LAYOUT_TOKENS.progressHeight,
    borderRadius: STACKR_FLOW_LAYOUT_TOKENS.progressRadius,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', borderRadius: STACKR_FLOW_LAYOUT_TOKENS.progressRadius },
  progressStatus: { marginTop: 5, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  statusBanner: {
    minHeight: STACKR_FLOW_LAYOUT_TOKENS.minimumTouchTarget,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 12,
  },
  statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  statusMessage: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  actionArea: {
    width: '100%',
    maxWidth: STACKR_FLOW_LAYOUT_TOKENS.maxContentWidth,
    alignSelf: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: STACKR_FLOW_LAYOUT_TOKENS.phonePadding,
    paddingTop: 12,
  },
  actionAreaDocked: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  actionAreaCompact: { paddingTop: 8 },
});
