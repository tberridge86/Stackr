import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { boundedCardTilt, cardMotionIntensity } from '../lib/cardPreviewMotion';
import type { CardPreviewLight } from './InteractiveCardPreview';

/** Neutral presentation light only: no foil, texture, pattern or printing inference. */
export function CardStudioLight({ x, y, width, height }: CardPreviewLight & { width: number; height: number }) {
  const reflection = useAnimatedStyle(() => ({
    opacity: 0.28 + cardMotionIntensity(x.value, y.value) * 0.24,
    transform: [
      { translateX: boundedCardTilt(x.value) * width * 0.58 },
      { translateY: boundedCardTilt(y.value) * height * 0.18 },
      { rotate: '-24deg' },
    ],
  }));
  return <View pointerEvents="none" accessible={false} testID="card-studio-light"
    style={[StyleSheet.absoluteFill, { borderRadius: width * 0.045, overflow: 'hidden' }]}>
    <Animated.View style={[{ position: 'absolute', width: width * 2.4, height: height * 2,
      left: -width * 0.7, top: -height * 0.5 }, reflection]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.04)',
        'rgba(255,255,255,0.34)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
        locations={[0, 0.37, 0.5, 0.63, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <View style={[StyleSheet.absoluteFill, { borderRadius: width * 0.045, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }]} />
  </View>;
}
