import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';

/** Web keeps touch perspective and a neutral reflection; no WebGL dependency. */
function NeutralReflection({ x, y, width, height }: CardFoilSurfaceProps) {
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: -x.value * width * 0.35 }, { translateY: y.value * height * 0.35 },
    { rotate: '-28deg' },
  ] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient colors={['transparent', 'rgba(255,255,255,0.075)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
export default function CardFoilSurface(props: CardFoilSurfaceProps) {
  return props.source === 'catalogue' ? <NeutralReflection {...props} /> : null;
}
