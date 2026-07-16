import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type IconName = keyof typeof Ionicons.glyphMap;

export const stackrControlTokens = {
  minTapTarget: 44,
  primaryHeight: 52,
  secondaryHeight: 46,
  utilityHeight: 44,
  radius: 16,
  utilityRadius: 14,
  iconSize: 22,
  iconButtonSize: 44,
  horizontalPadding: 18,
  iconTextGap: 8,
} as const;

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
        ? '#C2410C'
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
      style={[
        {
          minHeight: isPrimary ? stackrControlTokens.primaryHeight : isGhost ? stackrControlTokens.minTapTarget : stackrControlTokens.secondaryHeight,
          borderRadius: isGhost ? stackrControlTokens.utilityRadius : stackrControlTokens.radius,
          paddingHorizontal: isGhost ? 10 : stackrControlTokens.horizontalPadding,
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
                  ? '#FFF7ED'
                  : theme.colors.card,
          borderWidth: isPrimary || isGhost ? 0 : 1,
          borderColor: isDestructive ? '#FDBA74' : theme.colors.border,
          opacity: disabled ? 0.72 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={isPrimary ? 21 : 19} color={fg} />
      ) : null}
      <Text style={[{ color: fg, fontSize: isPrimary ? 16 : 15, lineHeight: 20, fontWeight: '900' }, textStyle]} numberOfLines={1}>
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
      accessibilityState={{ selected, disabled }}
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
      accessibilityState={{ selected, disabled }}
      style={[
        {
          minHeight: stackrControlTokens.minTapTarget,
          borderRadius: 999,
          paddingHorizontal: 13,
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
      <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' }} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

