import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Quiet light behind the artwork, with room for the card's shadow and tilt. */
export function CardInspectionStage({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const id = `stage${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.stage, style]}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 100 140" preserveAspectRatio="none" style={StyleSheet.absoluteFill} aria-hidden>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="32%" rx="70%" ry="70%">
            <Stop stopColor="#526988" />
            <Stop offset="0.7" stopColor="#2C3D59" />
            <Stop offset="1" stopColor="#142033" />
          </RadialGradient>
          <RadialGradient id={`${id}floor`}>
            <Stop stopColor="#AFC5E5" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#AFC5E5" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="140" fill={`url(#${id})`} />
        <Ellipse cx="50" cy="132" rx="44" ry="12" fill={`url(#${id}floor)`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ stage: { padding: 24, paddingBottom: 36, alignItems: 'center', borderRadius: 28, overflow: 'hidden', backgroundColor: '#101827' } });
