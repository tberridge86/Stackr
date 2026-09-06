import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { useTheme } from './theme-context';

const backdropSource = require('../assets/rev2/01-brand/backdrops/BACKDROP.png');
const PAGE_BACKDROP_BLEED = 96;

export function StackrBackdrop({
  opacity,
  style,
  source = backdropSource,
  variant = 'default',
}: {
  opacity?: number;
  style?: StyleProp<ImageStyle>;
  source?: ImageSourcePropType;
  /** Approved Home-only quiet palette. Existing screen defaults are unchanged. */
  variant?: 'default' | 'home';
}) {
  const { isDark } = useTheme();

  if (variant === 'home') {
    return (
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={isDark ? ['#140B2D', '#241150', '#07145F'] : ['#FFFFFF', '#F7F3FF', '#EEE7FF']}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={[StyleSheet.absoluteFillObject, opacity === undefined ? null : { opacity }]}
        />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          top: -PAGE_BACKDROP_BLEED,
          bottom: -PAGE_BACKDROP_BLEED,
        },
      ]}
    >
      <Image
        source={source}
        resizeMode="cover"
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: opacity ?? (isDark ? 0.18 : 1) },
          style,
        ]}
      />
    </View>
  );
}

export function StackrHeroBackdrop({
  opacity,
  style,
  wash = true,
}: {
  opacity?: number;
  style?: StyleProp<ImageStyle>;
  wash?: boolean;
}) {
  const { isDark } = useTheme();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={backdropSource}
        resizeMode="cover"
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: opacity ?? (isDark ? 0.22 : 1) },
          style,
        ]}
      />
      {wash ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(16,10,36,0.44)' : 'rgba(255,255,255,0.12)' }]} />
      ) : null}
    </View>
  );
}
