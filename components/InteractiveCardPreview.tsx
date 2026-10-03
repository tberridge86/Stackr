import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, PanResponder, Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, runOnJS, SensorType, useAnimatedReaction, useAnimatedSensor, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { boundedCardTilt, calibratedCardSensor, cardDragTilt, cardFloatOffset, cardInspectionMotionEnabled, cardMotionIntensity, nextCardFoilHapticState, type CardFoilHapticState, type CardSensorOrigin } from '../lib/cardPreviewMotion';
import { useCardMotionPreference } from '../lib/cardMotionPreference';
import { stackrHaptics } from '../lib/haptics';

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

/** Runs on the UI thread and crosses to JS only for a bounded, deliberate sweep. */
function FoilCrossingHaptics({ x, y, enabled, resetKey }: CardPreviewLight & { enabled: boolean; resetKey: number }) {
  const allowed = useSharedValue(false);
  const generation = useSharedValue(0);
  const currentGeneration = useRef(0);
  const state = useSharedValue<CardFoilHapticState>({ armed: false, above: false, lastTriggeredAt: -Infinity });
  const requestFoilCrossingHaptic = useCallback((token: number) => {
    // AppState is read again on JS arrival: the bridge can beat React's
    // background effect by a frame, but it must never vibrate in that gap.
    const isCurrent = () => token === currentGeneration.current && AppState.currentState === 'active';
    if (!isCurrent()) return;
    void stackrHaptics.cardFoilCrossing(isCurrent);
  }, []);
  useEffect(() => {
    const token = currentGeneration.current + 1;
    currentGeneration.current = token;
    generation.value = token;
    allowed.value = enabled;
    state.value = { armed: false, above: false, lastTriggeredAt: -Infinity };
    return () => { currentGeneration.current += 1; allowed.value = false; };
  }, [allowed, enabled, generation, resetKey, state]);
  useAnimatedReaction(() => ({ x: x.value, y: y.value, allowed: allowed.value, generation: generation.value }), (sample) => {
    if (!sample.allowed) return;
    const next = nextCardFoilHapticState(state.value, sample.x, sample.y, Date.now());
    state.value = next.state;
    if (next.trigger) runOnJS(requestFoilCrossingHaptic)(sample.generation);
  });
  return null;
}

/** One motion engine, mounted only by the enlarged catalogue inspector. */
export function InteractiveCardPreview({ children, active = true, resetKey = 0, renderMaterial, onMotionPreference, foilHaptics = false, motionPaused = false }: {
  children: React.ReactNode;
  active?: boolean;
  resetKey?: number;
  renderMaterial?: (light: CardPreviewLight) => React.ReactNode;
  onMotionPreference?: (reduced: boolean) => void;
  /** Enable the bounded foil-sweep cue only for a loaded, verified foil card. */
  foilHaptics?: boolean;
  /** Suspends sensor, animation, material and haptic work while preserving the setting readout. */
  motionPaused?: boolean;
}) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [systemReduceMotion, setReduceMotion] = useState(true);
  const motionPreference = useCardMotionPreference();
  const reduceMotion = systemReduceMotion || motionPreference.reduced || !motionPreference.loaded;
  const sensorX = useSharedValue(0); const sensorY = useSharedValue(0);
  const dragX = useSharedValue(0); const dragY = useSharedValue(0);
  const enabled = cardInspectionMotionEnabled(active && !motionPaused, foreground, reduceMotion);
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
  const motionStyle = useAnimatedStyle(() => {
    const intensity = cardMotionIntensity(x.value, y.value);
    return {
      shadowOpacity: 0.3 + intensity * 0.14,
      shadowRadius: 18 + intensity * 9,
      shadowOffset: { width: cardFloatOffset(x.value, 9), height: 15 + cardFloatOffset(y.value, 5) },
      transform: [
        { perspective: 1000 }, { translateX: cardFloatOffset(x.value, 1.5) }, { translateY: cardFloatOffset(y.value, 2) },
        { rotateX: `${y.value * 10}deg` }, { rotateY: `${x.value * 13}deg` },
      ],
    };
  });
  return <View style={styles.frame}>
    {enabled && Platform.OS !== 'web' ? <NativeCardTilt x={sensorX} y={sensorY} resetKey={resetKey} /> : null}
    {Platform.OS !== 'web' ? <FoilCrossingHaptics x={sensorX} y={sensorY} enabled={enabled && foilHaptics} resetKey={resetKey} /> : null}
    <Animated.View style={[styles.card, motionStyle]} {...responder.panHandlers}>
      <View style={styles.surface}>{children}
        {enabled && renderMaterial ? renderMaterial({ x, y }) : null}
      </View>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, position: 'relative', overflow: 'visible' },
  card: { flex: 1, shadowColor: '#160D23', shadowOpacity: 0.36, shadowRadius: 22, shadowOffset: { width: 0, height: 17 }, elevation: 10 },
  surface: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: 'transparent' },
});
