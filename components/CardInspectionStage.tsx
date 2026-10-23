import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

export const CARD_INSPECTION_STAGE_INSETS = { horizontal: 24, top: 24, bottom: 36 } as const;

/** Stackr's navy stage, off-white type and single existing brand-purple accent. */
export const CARD_SHOWCASE_COLORS = {
  background: '#070C18', stage: '#0C1427', text: '#FAF9FC', muted: '#A7B3CA',
  accent: '#6938F5', accentText: '#D1C2FF', border: 'rgba(167,179,202,0.16)',
} as const;

/** Quiet light behind the artwork, with room for the card's shadow and tilt. */
export function CardInspectionStage({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const id = `stage${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.stage, style]}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 100 140" preserveAspectRatio="none" style={StyleSheet.absoluteFill} aria-hidden>
        <Defs>
          <RadialGradient id={id} cx="43%" cy="28%" rx="76%" ry="74%">
            <Stop stopColor="#283754" />
            <Stop offset="0.55" stopColor="#13213B" />
            <Stop offset="1" stopColor={CARD_SHOWCASE_COLORS.background} />
          </RadialGradient>
          <RadialGradient id={`${id}floor`}>
            <Stop stopColor={CARD_SHOWCASE_COLORS.accent} stopOpacity="0.24" />
            <Stop offset="1" stopColor={CARD_SHOWCASE_COLORS.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}rim`}>
            <Stop stopColor="#E7ECFF" stopOpacity="0.13" />
            <Stop offset="1" stopColor="#E7ECFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="140" fill={`url(#${id})`} />
        <Ellipse cx="6" cy="25" rx="48" ry="68" fill={`url(#${id}rim)`} />
        <Ellipse cx="50" cy="132" rx="44" ry="9" fill={`url(#${id}floor)`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ stage: {
  paddingHorizontal: CARD_INSPECTION_STAGE_INSETS.horizontal,
  paddingTop: CARD_INSPECTION_STAGE_INSETS.top,
  paddingBottom: CARD_INSPECTION_STAGE_INSETS.bottom,
  alignItems: 'center', borderRadius: 28, overflow: 'hidden', backgroundColor: CARD_SHOWCASE_COLORS.stage,
} });
