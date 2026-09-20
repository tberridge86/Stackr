import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, SensorType, useAnimatedReaction, useAnimatedSensor, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { boundedCardTilt, calibratedCardSensor, cardDragTilt, cardInspectionMotionEnabled, type CardSensorOrigin } from '../lib/cardPreviewMotion';
import { useCardMotionPreference } from '../lib/cardMotionPreference';

export type CardPreviewLight = { x: SharedValue<number>; y: SharedValue<number> };

function NativeCardTilt({ x, y, resetKey }: CardPreviewLight & { resetKey: number }) {
  const { sensor } = useAnimatedSensor(SensorType.ROTATION, { interval: 16, adjustToInterfaceOrientation: true });
  const origin = useSharedValue<CardSensorOrigin | null>(null);
  useEffect(() => { origin.value = null; x.value = 0; y.value = 0; }, [origin, resetKey, x, y]);
  useAnimatedReaction(() => sensor.value, (reading) => {
    if (!reading.qw && !reading.qx && !reading.qy && !reading.qz) return;
    const next = calibratedCardSensor(reading, origin.value);
    if (!next) return;
    origin.value = next.origin;
    x.value = withTiming(next.x, { duration: 85 });
    y.value = withTiming(next.y, { duration: 85 });
  });
  // useAnimatedSensor unregisters the native subscription on unmount.
  return null;
}

/** One motion engine, mounted only by the enlarged catalogue inspector. */
export function InteractiveCardPreview({ children, active = true, resetKey = 0, renderMaterial, onMotionPreference }: {
  children: React.ReactNode;
  active?: boolean;
  resetKey?: number;
  renderMaterial?: (light: CardPreviewLight) => React.ReactNode;
  onMotionPreference?: (reduced: boolean) => void;
}) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [systemReduceMotion, setReduceMotion] = useState(true);
  const motionPreference = useCardMotionPreference();
  const reduceMotion = systemReduceMotion || motionPreference.reduced || !motionPreference.loaded;
  const sensorX = useSharedValue(0); const sensorY = useSharedValue(0);
  const dragX = useSharedValue(0); const dragY = useSharedValue(0);
  const enabled = cardInspectionMotionEnabled(active, foreground, reduceMotion);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => { onMotionPreference?.(reduceMotion); }, [onMotionPreference, reduceMotion]);
  useEffect(() => {
    for (const value of [sensorX, sensorY, dragX, dragY]) { cancelAnimation(value); value.value = 0; }
    return () => { for (const value of [sensorX, sensorY, dragX, dragY]) cancelAnimation(value); };
  }, [enabled, resetKey, sensorX, sensorY, dragX, dragY]);
  const responder = useMemo(() => {
    const release = () => {
      dragX.value = withSpring(0, { damping: 22, stiffness: 180, overshootClamping: true });
      dragY.value = withSpring(0, { damping: 22, stiffness: 180, overshootClamping: true });
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => enabled && g.numberActiveTouches === 1 && Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderMove: (_, g) => { const drag = cardDragTilt(g.dx, g.dy); dragX.value = drag.x; dragY.value = drag.y; },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => true,
    });
  }, [enabled, dragX, dragY]);
  const x = useDerivedValue(() => enabled ? boundedCardTilt(sensorX.value + dragX.value) : 0);
  const y = useDerivedValue(() => enabled ? boundedCardTilt(sensorY.value + dragY.value) : 0);
  const motionStyle = useAnimatedStyle(() => ({ transform: [
    { perspective: 1000 }, { rotateX: `${y.value * 10}deg` }, { rotateY: `${x.value * 13}deg` },
  ] }));
  return <View style={styles.frame}>
    {enabled && Platform.OS !== 'web' ? <NativeCardTilt x={sensorX} y={sensorY} resetKey={resetKey} /> : null}
    <Animated.View style={[styles.card, motionStyle]} {...responder.panHandlers}>
      <View style={styles.surface}>{children}
        {enabled && renderMaterial ? renderMaterial({ x, y }) : null}
      </View>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, position: 'relative', overflow: 'visible' },
  card: { flex: 1, shadowColor: '#211337', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
  surface: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: 'transparent' },
});
