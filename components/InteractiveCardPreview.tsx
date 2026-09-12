import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SensorType, useAnimatedReaction, useAnimatedSensor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { boundedCardTilt, cardFloatOffset, cardMotionIntensity, relativeCardTilt } from '../lib/cardPreviewMotion';
import { stackrHaptics } from '../lib/haptics';

function NativeCardTilt({ x, y }: { x: SharedValue<number>; y: SharedValue<number> }) {
  const { sensor } = useAnimatedSensor(SensorType.ROTATION, { interval: 32, adjustToInterfaceOrientation: true });
  const origin = useSharedValue<{ pitch: number; roll: number } | null>(null);
  useAnimatedReaction(() => sensor.value, (reading) => {
    // Availability is set after registration without a React render. Gate on a
    // real reading instead of capturing the hook's initial false flag forever.
    if (!Number.isFinite(reading.pitch) || !Number.isFinite(reading.roll)) return;
    if (!reading.qw && !reading.qx && !reading.qy && !reading.qz) return;
    if (!origin.value) { origin.value = { pitch: reading.pitch, roll: reading.roll }; return; }
    x.value = relativeCardTilt(reading.roll, origin.value.roll);
    y.value = relativeCardTilt(reading.pitch, origin.value.pitch);
  });
  return null;
}

/** Mounted only around an enlarged card. Images and ownership controls stay intact. */
export function InteractiveCardPreview({ children, active = true, foil = false }: {
  children: React.ReactNode; active?: boolean; foil?: boolean;
}) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  const sensorX = useSharedValue(0); const sensorY = useSharedValue(0);
  const dragX = useSharedValue(0); const dragY = useSharedValue(0);
  const enabled = active && focused && foreground && !reduceMotion;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => { if (!enabled) { sensorX.value = 0; sensorY.value = 0; dragX.value = 0; dragY.value = 0; } }, [enabled, sensorX, sensorY, dragX, dragY]);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => enabled && g.numberActiveTouches === 1 && Math.abs(g.dx) + Math.abs(g.dy) > 12,
    onPanResponderGrant: () => { void stackrHaptics.selection(); },
    onPanResponderMove: (_, g) => { dragX.value = boundedCardTilt(g.dx / 96); dragY.value = boundedCardTilt(-g.dy / 128); },
    onPanResponderRelease: () => { dragX.value = withSpring(0, { damping: 14, stiffness: 220 }); dragY.value = withSpring(0, { damping: 14, stiffness: 220 }); },
    onPanResponderTerminate: () => { dragX.value = withSpring(0, { damping: 14, stiffness: 220 }); dragY.value = withSpring(0, { damping: 14, stiffness: 220 }); },
    onPanResponderTerminationRequest: () => true,
  }), [enabled, dragX, dragY]);
  const motionStyle = useAnimatedStyle(() => {
    const x = enabled ? boundedCardTilt(sensorX.value + dragX.value) : 0;
    const y = enabled ? boundedCardTilt(sensorY.value + dragY.value) : 0;
    const intensity = cardMotionIntensity(x, y);
    return { transform: [
      { perspective: 850 },
      { translateX: cardFloatOffset(x, 7) },
      { translateY: cardFloatOffset(y, 5) },
      { scale: 1 + intensity * 0.018 },
      { rotateX: `${y * 13}deg` },
      { rotateY: `${x * 16}deg` },
    ] };
  });
  const shineStyle = useAnimatedStyle(() => {
    const x = boundedCardTilt(sensorX.value + dragX.value), y = boundedCardTilt(sensorY.value + dragY.value);
    const intensity = enabled ? cardMotionIntensity(x, y) : 0;
    return { opacity: intensity * 0.42,
      transform: [{ translateX: cardFloatOffset(x, 112) }, { translateY: cardFloatOffset(y, 80) }, { rotate: `${-25 + x * 14 - y * 8}deg` }, { scale: 1 + intensity * 0.12 }] };
  });
  return <View style={styles.frame}>
    {enabled && Platform.OS !== 'web' ? <NativeCardTilt x={sensorX} y={sensorY} /> : null}
    <Animated.View style={[styles.card, motionStyle]} {...responder.panHandlers}>
      {children}
      {foil ? <View pointerEvents="none" style={styles.foilMask}>
        <Animated.View style={[styles.shine, shineStyle]}>
          <LinearGradient colors={['transparent', 'rgba(101, 245, 234, 0.88)', 'rgba(218, 177, 255, 0.92)', 'rgba(255, 245, 186, 0.9)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View> : null}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, position: 'relative', overflow: 'visible' },
  card: { flex: 1, overflow: 'visible', shadowColor: '#07111F', shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  foilMask: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 16 },
  shine: { position: 'absolute', left: '-30%', top: '-30%', width: '160%', height: '160%' },
});
