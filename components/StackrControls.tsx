import { StackrLoadingIndicator } from './StackrLoadingIndicator';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleProp,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { stackrControlTokens } from '../lib/stackrSizing';

export { stackrControlTokens } from '../lib/stackrSizing';

type IconName = keyof typeof Ionicons.glyphMap;

export type StackrButtonVariant = 'primary' | 'secondary' | 'ghost' | 'utility' | 'destructive';

export function StackrButton({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: StackrButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const isDestructive = variant === 'destructive';
  const fg = disabled
    ? theme.colors.textSoft
    : isPrimary
      ? '#FFFFFF'
      : isDestructive
        ? theme.colors.semantic.error
        : variant === 'utility'
          ? theme.colors.text
          : theme.colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading || !onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading || !onPress, busy: loading }}
      aria-disabled={disabled || loading || !onPress}
      aria-busy={loading}
      style={[
        {
          minHeight: isPrimary ? stackrControlTokens.primaryHeight : isGhost ? stackrControlTokens.minTapTarget : stackrControlTokens.secondaryHeight,
          minWidth: stackrControlTokens.minTapTarget,
          maxWidth: '100%',
          flexShrink: 1,
          borderRadius: isGhost ? stackrControlTokens.utilityRadius : stackrControlTokens.radius,
          paddingHorizontal: isGhost ? 10 : stackrControlTokens.horizontalPadding,
          paddingVertical: 10,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: stackrControlTokens.iconTextGap,
          backgroundColor: disabled
            ? theme.colors.surface
            : isPrimary
              ? theme.colors.primary
              : isGhost
                ? 'transparent'
                : isDestructive
                  ? theme.colors.semantic.destructiveSurface
                  : theme.colors.card,
          borderWidth: isPrimary || isGhost ? 0 : 1,
          borderColor: isDestructive ? theme.colors.semantic.destructiveBorder : theme.colors.border,
          opacity: disabled ? 0.72 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <StackrLoadingIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={isPrimary ? 21 : 19} color={fg} />
      ) : null}
      <Text style={[{ color: fg, flexShrink: 1, fontSize: isPrimary ? 16 : 15, lineHeight: 20, fontWeight: '900', textAlign: 'center' }, textStyle]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function StackrIconButton({
  icon,
  onPress,
  label,
  selected = false,
  disabled = false,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || !onPress }}
      aria-pressed={selected}
      aria-disabled={disabled || !onPress}
      style={[
        {
          width: stackrControlTokens.iconButtonSize,
          height: stackrControlTokens.iconButtonSize,
          borderRadius: stackrControlTokens.utilityRadius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.card,
          borderWidth: 1,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          opacity: disabled ? 0.58 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={22} color={selected ? theme.colors.primary : theme.colors.text} />
    </TouchableOpacity>
  );
}

export function StackrChip({
  label,
  selected = false,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || !onPress }}
      aria-pressed={selected}
      aria-disabled={disabled || !onPress}
      style={[
        {
          minHeight: stackrControlTokens.minTapTarget,
          minWidth: stackrControlTokens.minTapTarget,
          maxWidth: '100%',
          flexShrink: 1,
          borderRadius: 999,
          paddingHorizontal: 13,
          paddingVertical: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.card,
          borderWidth: 1,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          opacity: disabled ? 0.58 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

