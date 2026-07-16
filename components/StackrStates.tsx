import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, View, ViewStyle } from 'react-native';
import { stackrRadii, stackrSpacing } from '../lib/theme';
import { Text } from './Text';
import { StackrButton } from './StackrControls';
import { useTheme } from './theme-context';

type IconName = keyof typeof Ionicons.glyphMap;
type StateTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const toneIcon: Record<StateTone, IconName> = {
  neutral: 'albums-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'alert-circle-outline',
  error: 'warning-outline',
};

function useToneColor(tone: StateTone) {
  const { theme } = useTheme();
  const semantic = theme.colors.semantic;
  if (tone === 'info') return semantic.information;
  if (tone === 'success') return semantic.success;
  if (tone === 'warning') return semantic.warning;
  if (tone === 'error') return semantic.error;
  return theme.colors.primary;
}

export function StackrStateBlock({
  title,
  body,
  icon,
  tone = 'neutral',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  style,
}: {
  title: string;
  body?: string | null;
  icon?: IconName;
  tone?: StateTone;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const color = useToneColor(tone);

  return (
    <View
      accessibilityRole="summary"
      style={[
        {
          borderRadius: stackrRadii.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          padding: stackrSpacing.xl,
          alignItems: 'center',
          gap: stackrSpacing.sm,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${color}18`,
          borderWidth: 1,
          borderColor: `${color}42`,
        }}
      >
        <Ionicons name={icon ?? toneIcon[tone]} size={23} color={color} />
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {actionLabel || secondaryLabel ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'center' }}>
          {secondaryLabel ? <StackrButton label={secondaryLabel} variant="secondary" onPress={onSecondaryAction} /> : null}
          {actionLabel ? <StackrButton label={actionLabel} variant={tone === 'error' ? 'destructive' : 'primary'} onPress={onAction} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function StackrLoadingState({ label = 'Loading...', style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', padding: stackrSpacing.xl, gap: 10 }, style]}>
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export function StackrEmptyState(props: Omit<React.ComponentProps<typeof StackrStateBlock>, 'tone'>) {
  return <StackrStateBlock tone="neutral" {...props} />;
}

export function StackrErrorState(props: Omit<React.ComponentProps<typeof StackrStateBlock>, 'tone'>) {
  return <StackrStateBlock tone="error" icon={props.icon ?? 'warning-outline'} {...props} />;
}

export function StackrOfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StackrStateBlock
      tone="warning"
      icon="cloud-offline-outline"
      title="You appear to be offline"
      body="Some collection, price and marketplace data may be stale until the connection returns."
      actionLabel={onRetry ? 'Retry' : undefined}
      onAction={onRetry}
    />
  );
}

export function StackrPermissionState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StackrStateBlock
      tone="info"
      icon="lock-closed-outline"
      title={title}
      body={body}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function StackrSkeleton({ height = 96, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityLabel="Loading content"
      style={[
        {
          height,
          borderRadius: stackrRadii.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: 0.82,
        },
        style,
      ]}
    />
  );
}
