import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SensorType, useAnimatedReaction, useAnimatedSensor, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { boundedCardTilt, relativeCardTilt } from '../lib/cardPreviewMotion';
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
    onMoveShouldSetPanResponder: (_, g) => enabled && g.numberActiveTouches === 1 && Math.abs(g.dx) + Math.abs(g.dy) > 10,
    onPanResponderGrant: () => { void stackrHaptics.selection(); },
    onPanResponderMove: (_, g) => { dragX.value = boundedCardTilt(g.dx / 120); dragY.value = boundedCardTilt(-g.dy / 160); },
    onPanResponderRelease: () => { dragX.value = withSpring(0); dragY.value = withSpring(0); },
    onPanResponderTerminate: () => { dragX.value = withSpring(0); dragY.value = withSpring(0); },
    onPanResponderTerminationRequest: () => true,
  }), [enabled, dragX, dragY]);
  const motionStyle = useAnimatedStyle(() => ({ transform: [
    { perspective: 1000 },
    { rotateX: `${enabled ? boundedCardTilt(sensorY.value + dragY.value) * 9 : 0}deg` },
    { rotateY: `${enabled ? boundedCardTilt(sensorX.value + dragX.value) * 12 : 0}deg` },
  ] }));
  const shineStyle = useAnimatedStyle(() => {
    const x = boundedCardTilt(sensorX.value + dragX.value), y = boundedCardTilt(sensorY.value + dragY.value);
    return { opacity: enabled ? Math.min(0.28, (Math.abs(x) + Math.abs(y)) * 0.18) : 0,
      transform: [{ translateX: x * 90 }, { translateY: y * 60 }, { rotate: '-25deg' }] };
  });
  return <View style={styles.frame} {...responder.panHandlers}>
    {enabled && Platform.OS !== 'web' ? <NativeCardTilt x={sensorX} y={sensorY} /> : null}
    <Animated.View style={[styles.card, motionStyle]}>
      {children}
      {foil ? <View pointerEvents="none" style={styles.foilMask}>
        <Animated.View style={[styles.shine, shineStyle]}>
          <LinearGradient colors={['transparent', '#80F2ED', '#D4B0FF', '#FFF7C2', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View> : null}
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ frame: { flex: 1 }, card: { flex: 1 }, foilMask: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 16 }, shine: { position: 'absolute', left: '-30%', top: '-30%', width: '160%', height: '160%' } });
