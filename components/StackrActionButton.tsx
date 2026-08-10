import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { stackrGradients } from '../lib/theme';
import { typeScale } from '../lib/typography';
import { StackrButtonPattern } from './StackrEmboss';
import { StackrCardActionIcon } from './StackrScreen';
import { Text } from './Text';
import { useTheme } from './theme-context';

type IconName = keyof typeof Ionicons.glyphMap;

type StackrActionButtonVariant = 'primary' | 'scan' | 'secondary' | 'quiet' | 'destructive' | 'disabled';
type StackrActionButtonSize = 'hero' | 'standard' | 'compact';

type StackrActionButtonProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  imageIcon?: ImageSourcePropType;
  imageStyle?: StyleProp<ImageStyle>;
  onPress: () => void;
  variant?: StackrActionButtonVariant;
  size?: StackrActionButtonSize;
  showArrow?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function StackrActionButton({
  title,
  subtitle,
  icon,
  imageIcon,
  imageStyle,
  onPress,
  variant = 'primary',
  size = 'standard',
  showArrow,
  accessibilityLabel,
  style,
  contentStyle,
  disabled = false,
}: StackrActionButtonProps) {
  const { theme } = useTheme();
  const resolvedVariant = disabled || variant === 'disabled' ? 'disabled' : variant;
  const isPrimary = resolvedVariant === 'primary';
  const isScan = resolvedVariant === 'scan';
  const isQuiet = resolvedVariant === 'quiet';
  const isDestructive = resolvedVariant === 'destructive';
  const isDisabled = resolvedVariant === 'disabled';
  const usesGradient = isPrimary || isScan;
  const resolvedShowArrow = showArrow ?? (isPrimary || (isScan && size === 'hero'));
  const iconFrameSize = size === 'hero' ? 44 : size === 'compact' ? 30 : 38;
  const artworkSize = size === 'hero' ? 34 : size === 'compact' ? 24 : 30;
  const iconSize = size === 'hero' ? 22 : size === 'compact' ? 17 : 20;
  const textColor = usesGradient ? '#FFFFFF' : isDestructive ? '#D1294B' : isDisabled ? theme.colors.textSoft : theme.colors.text;
  const subtitleColor = usesGradient ? 'rgba(255,255,255,0.78)' : isDestructive ? '#A33A4B' : theme.colors.textSoft;
  const iconColor = isDestructive ? '#D1294B' : theme.colors.primary;
  const backgroundColor = isDisabled
    ? theme.colors.surface
    : isDestructive
      ? '#FFF1F5'
      : isQuiet
        ? theme.colors.surface
        : theme.colors.card;
  const borderColor = usesGradient
    ? 'rgba(255,255,255,0.30)'
    : isDestructive
      ? '#FFC2D0'
      : isDisabled
        ? theme.colors.border
        : theme.colors.border;

  const content = (
    <>
      {usesGradient ? <StackrButtonPattern tone="purple" /> : null}
      {imageIcon ? (
        <StackrCardActionIcon
          source={imageIcon}
          frameSize={iconFrameSize}
          artworkSize={artworkSize}
          imageStyle={imageStyle}
        />
      ) : icon ? (
        <View style={[styles.fallbackIcon, usesGradient ? styles.primaryFallbackIcon : styles.secondaryFallbackIcon, { width: iconFrameSize, height: iconFrameSize }]}>
          <Ionicons name={icon} size={iconSize} color={iconColor} />
        </View>
      ) : null}

      <View style={[styles.copy, size === 'compact' && styles.copyCompact]}>
        <Text
          style={[
            styles.title,
            size === 'hero' && styles.titleHero,
            size === 'compact' && styles.titleCompact,
            { color: textColor },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, size === 'compact' && styles.subtitleCompact, { color: subtitleColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.84}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {resolvedShowArrow ? (
        <Ionicons name="arrow-forward" size={size === 'compact' ? 17 : 20} color={usesGradient ? '#FFFFFF' : theme.colors.primary} />
      ) : null}
    </>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      style={[
        styles.shell,
        styles[`${size}Shell`],
        usesGradient ? styles.primaryShell : isDestructive ? styles.destructiveShell : styles.secondaryShell,
        isScan && styles.scanShell,
        isDisabled && styles.disabledShell,
        style,
      ]}
    >
      {usesGradient ? (
        <LinearGradient
          colors={stackrGradients.actionPrimary as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.content, styles[`${size}Content`], styles.primaryContent, { borderColor }, contentStyle]}
        >
          <View pointerEvents="none" style={styles.primaryTopHighlight} />
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.content,
            styles[`${size}Content`],
            styles.secondaryContent,
            isDestructive && styles.destructiveContent,
            { backgroundColor, borderColor },
            contentStyle,
          ]}
        >
          {content}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 18,
  },
  heroShell: {
    minHeight: 72,
    borderRadius: 20,
  },
  standardShell: {
    minHeight: 52,
    borderRadius: 17,
  },
  compactShell: {
    minHeight: 46,
    borderRadius: 16,
  },
  primaryShell: {
    shadowColor: '#6136F5',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  scanShell: {
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  secondaryShell: {
    shadowColor: '#6136F5',
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  destructiveShell: {
    shadowColor: '#D1294B',
    shadowOpacity: 0.08,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  disabledShell: {
    opacity: 0.56,
  },
  content: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroContent: {
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  standardContent: {
    minHeight: 52,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  compactContent: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
    gap: 8,
  },
  primaryContent: {
    justifyContent: 'center',
  },
  secondaryContent: {
    justifyContent: 'center',
  },
  destructiveContent: {
    borderWidth: 1,
  },
  primaryTopHighlight: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  fallbackIcon: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryFallbackIcon: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  secondaryFallbackIcon: {
    backgroundColor: '#F4EEFF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 3,
  },
  copyCompact: {
    gap: 1,
  },
  title: {
    ...typeScale.buttonPrimary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  titleHero: {
    fontSize: 21,
    lineHeight: 25,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 19,
  },
  subtitle: {
    ...typeScale.caption,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
  subtitleCompact: {
    fontSize: 11.5,
    lineHeight: 14,
  },
});
