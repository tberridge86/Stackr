import React from 'react';
import { Image, ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { useTheme } from './theme-context';

const backdropSource = require('../assets/rev2/01-brand/backdrops/BACKDROP.png');

export function StackrBackdrop({
  opacity,
  style,
  source = backdropSource,
}: {
  opacity?: number;
  style?: StyleProp<ImageStyle>;
  source?: ImageSourcePropType;
}) {
  const { isDark } = useTheme();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
