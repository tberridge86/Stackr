import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  StyleSheet,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { stackrFonts, typeScale } from '../lib/typography';
import { stackrActionIconSizes } from '../lib/stackrSizing';

type SafeEdge = 'top' | 'right' | 'bottom' | 'left';
type StackrScreenVariant = 'tab' | 'form' | 'detail';

const SCREEN_EDGES: Record<StackrScreenVariant, SafeEdge[]> = {
  tab: ['top', 'left', 'right'],
  form: ['top', 'bottom', 'left', 'right'],
  detail: ['top', 'left', 'right'],
};

export function StackrScreen({
  children,
  variant = 'tab',
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  variant?: StackrScreenVariant;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <SafeAreaView
      edges={SCREEN_EDGES[variant]}
      style={[styles.screen, { backgroundColor: theme.colors.bg }, style]}
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

type StackrPageTitleProps = TextProps & {
  title: string;
  accentText?: string;
  style?: StyleProp<TextStyle>;
};

export function StackrPageTitle({
  title,
  accentText,
  style,
  ...props
}: StackrPageTitleProps) {
  const { theme } = useTheme();
  const layoutStyle = { ...(StyleSheet.flatten(style) as TextStyle | undefined) };
  delete layoutStyle.color;
  delete layoutStyle.fontSize;
  delete layoutStyle.lineHeight;
  delete layoutStyle.fontFamily;
  delete layoutStyle.fontWeight;
  delete layoutStyle.letterSpacing;

  const titleChars = Array.from(title);
  const accentChars = accentText && title.endsWith(accentText) ? Array.from(accentText) : [];
  const earliestAccentStart = Math.min(
    Math.max(1, Math.floor(titleChars.length * 0.75)),
    Math.max(1, titleChars.length - 1)
  );
  const requestedAccentStart = accentChars.length
    ? titleChars.length - accentChars.length
    : titleChars.length;
  const accentStart = requestedAccentStart >= earliestAccentStart
    ? requestedAccentStart
    : earliestAccentStart;
  const prefix = titleChars.slice(0, accentStart).join('');
  const accent = titleChars.slice(accentStart).join('');

  return (
    <Text
      {...props}
      accessibilityRole="header"
      accessibilityLabel={title}
      variant="pageTitle"
      style={[
        styles.pageTitle,
        { color: theme.colors.text },
        layoutStyle,
      ]}
    >
      {prefix}
      {accent ? (
        <Text style={[styles.pageTitleAccent, { color: theme.colors.primary }]}>
          {accent}
        </Text>
      ) : null}
    </Text>
  );
}

export function StackrPageHeader({
  title,
  accentText,
  subtitle,
  rightAccessory,
  style,
}: {
  title: string;
  accentText?: string;
  subtitle?: string;
  rightAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.pageHeader, style]}>
      <View style={styles.pageHeaderCopy}>
        <StackrPageTitle title={title} accentText={accentText} />
        {subtitle ? (
          <Text style={[styles.pageSubtitle, { color: theme.colors.textSoft }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAccessory ? <View style={styles.pageHeaderAccessory}>{rightAccessory}</View> : null}
    </View>
  );
}

function StackrCardActionIconBase({
  source,
  frameSize = stackrActionIconSizes.defaultFrame,
  artworkSize = stackrActionIconSizes.defaultArtwork,
  style,
  imageStyle,
  accessibilityLabel,
}: {
  source: ImageSourcePropType;
  frameSize?: number;
  artworkSize?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={[
        styles.cardActionIcon,
        { width: frameSize, height: frameSize },
        style,
      ]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Image
        source={source}
        resizeMode="contain"
        style={[
          {
            width: artworkSize,
            height: artworkSize,
          },
          imageStyle,
        ]}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

export const StackrCardActionIcon = React.memo(StackrCardActionIconBase);

export function PokemonArtworkGlow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.pokemonGlowFrame, style]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.pokemonGlowOuter,
          {
            backgroundColor: theme.dark ? 'rgba(123,86,200,0.10)' : 'rgba(105,56,245,0.12)',
          },
        ]}
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.pokemonGlowInner,
          {
            backgroundColor: theme.dark ? 'rgba(123,86,200,0.08)' : 'rgba(105,56,245,0.10)',
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  pageHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  pageHeaderAccessory: {
    flexShrink: 0,
  },
  pageTitle: {
    ...typeScale.pageTitle,
    fontFamily: stackrFonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  pageTitleAccent: {
    fontFamily: stackrFonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  pageSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  cardActionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pokemonGlowFrame: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  pokemonGlowOuter: {
    position: 'absolute',
    width: '78%',
    height: '70%',
    borderRadius: 999,
    transform: [{ scaleX: 1.12 }],
  },
  pokemonGlowInner: {
    position: 'absolute',
    width: '56%',
    height: '50%',
    borderRadius: 999,
    transform: [{ scaleX: 1.08 }],
  },
});
