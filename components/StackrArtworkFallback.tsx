import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { useTheme } from './theme-context';

type ArtworkFallbackDensity = 'compact' | 'standard';

type SharedFallbackProps = {
  density?: ArtworkFallbackDensity;
  style?: StyleProp<ViewStyle>;
};

type CardArtworkFallbackProps = SharedFallbackProps & {
  name?: string | null;
  setName?: string | null;
  number?: string | null;
  language?: string | null;
};

const clean = (value?: string | number | null) => String(value ?? '').trim();

const languageLabel = (language?: string | null) => clean(language).toUpperCase();

export function StackrCardArtworkFallback({
  name,
  setName,
  number,
  language,
  density = 'standard',
  style,
}: CardArtworkFallbackProps) {
  const { theme } = useTheme();
  const compact = density === 'compact';
  const title = clean(name) || 'Card';
  const meta = [clean(setName), number ? `#${clean(number)}` : '', languageLabel(language)]
    .filter(Boolean)
    .join(' · ');

  return (
    <LinearGradient
      colors={['#FFFFFF', theme.colors.surface, '#EEE7FF']}
      start={{ x: 0.08, y: 0 }}
      end={{ x: 0.92, y: 1 }}
      style={[styles.fill, styles.cardBackdrop, style]}
    >
      <View style={[styles.glow, styles.glowTop, { backgroundColor: `${theme.colors.primary}16` }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: `${theme.colors.secondary}20` }]} />
      <View style={[styles.cardSilhouette, { borderColor: `${theme.colors.primary}42` }]}>
        <Ionicons
          name="albums-outline"
          size={compact ? 16 : 26}
          color={theme.colors.primary}
        />
        {!compact ? (
          <Text style={[styles.cardStatus, { color: theme.colors.primary }]} numberOfLines={1}>
            IMAGE COMING SOON
          </Text>
        ) : null}
      </View>
      <View style={compact ? styles.compactCopy : styles.standardCopy}>
        <Text
          style={[
            compact ? styles.compactTitle : styles.standardTitle,
            { color: theme.colors.text },
          ]}
          numberOfLines={compact ? 1 : 2}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
        >
          {title}
        </Text>
        {!compact && meta ? (
          <Text style={[styles.meta, { color: theme.colors.textSoft }]} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="sparkles"
        size={compact ? 8 : 13}
        color={theme.colors.secondary}
        style={styles.sparkle}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBackdrop: {
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  glow: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  glowTop: {
    top: -30,
    right: -24,
  },
  glowBottom: {
    bottom: -42,
    left: -28,
  },
  cardSilhouette: {
    width: '58%',
    maxWidth: 74,
    aspectRatio: 0.72,
    borderRadius: 9,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    shadowColor: '#6136F5',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardStatus: {
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.35,
    textAlign: 'center',
  },
  standardCopy: {
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
    gap: 2,
  },
  compactCopy: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    alignItems: 'center',
  },
  standardTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  compactTitle: {
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: '900',
    textAlign: 'center',
  },
  meta: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  sparkle: {
    position: 'absolute',
    top: 7,
    right: 7,
  },
  setBackdrop: {
    padding: 5,
  },
  setMark: {
    width: '92%',
    height: '86%',
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  setName: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  setNameCompact: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
    textAlign: 'center',
  },
  setStatus: {
    fontSize: 6.5,
    lineHeight: 8,
    fontWeight: '800',
    letterSpacing: 0.22,
    textAlign: 'center',
  },
  setStatusCompact: {
    maxWidth: '100%',
    fontSize: 5.5,
    lineHeight: 6.5,
    fontWeight: '800',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  setEnglishSupplement: {
    maxWidth: '100%',
    fontSize: 6,
    lineHeight: 7,
    fontWeight: '800',
    textAlign: 'center',
  },
  setStar: {
    position: 'absolute',
    top: 5,
    right: 6,
  },
  identityMark: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityMarkText: {
    maxWidth: '100%',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  identityMarkLanguage: {
    position: 'absolute',
    right: 2,
    bottom: 0,
    fontSize: 4.5,
    lineHeight: 5,
    fontWeight: '900',
  },
  identityMarkCode: {
    position: 'absolute',
    left: 2,
    bottom: 0,
    maxWidth: '70%',
    fontSize: 4.8,
    lineHeight: 5.5,
    fontWeight: '900',
  },
  identityBadge: {
    alignItems: 'flex-start',
    gap: 2,
  },
  identityBadgeEnglish: {
    maxWidth: '100%',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
  },
});
