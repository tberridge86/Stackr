import { stackrHaptics } from '../lib/haptics';
import { useCardMotionPreference } from '../lib/cardMotionPreference';
import { stackrCardImageSizes } from '../lib/stackrSizing';
import { useIsFocused } from '@react-navigation/native';
import { getCardFinishMetadata, resolveCardFinish, type CardFinishMetadata } from '../lib/cardFinishProfiles';
import { CardFinishOverlay } from './CardFinishOverlay';
import { StackrButton } from './StackrControls';
import React from 'react';
import {
  Pressable,
  AppState,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

const LONG_PRESS_MS = 400;
const LONG_PRESS_MAX_DISTANCE = 10;
const MAX_DETAIL_ROTATION_DEG = 10;
const DETAIL_TILT_DISTANCE = 96;
const CARD_PRESS_SCALE = 0.986;
const CARD_PRESS_TRANSLATE_Y = 1.25;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CardSurfaceTreatment = 'standard' | 'holofoil' | 'reverse_holofoil' | 'textured_rare' | 'slabbed';

type InteractiveCardInspectPressableProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onOpenDetail?: () => void;
  showDetailAction?: boolean;
  hapticOnPress?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
  accessibilityState?: Record<string, boolean | string | number | null | undefined>;
  imageUri?: string | null;
  fullImageUri?: string | null;
  title: string;
  subtitle?: string | null;
  rarity?: string | null;
  variant?: string | null;
  isHolographic?: boolean;
  aspectRatio?: number;
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number };
};

type CardDetailInspectSurfaceProps = CardFinishMetadata & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  title?: string | null;
  rarity?: string | null;
  variant?: string | null;
  finish?: string | null;
  isHolographic?: boolean;
  isSlabbed?: boolean;
  surfaceTreatment?: CardSurfaceTreatment;
  borderRadius?: ViewStyle['borderRadius'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Normalized card metadata; direct variant/finish props take priority. */
  cardMetadata?: unknown;
  /** Preview and off-screen surfaces may explicitly disable interaction. */
  active?: boolean;
  forceReducedMotion?: boolean;
  /** Development comparison only; ignored outside development builds. */
  previewTilt?: readonly [number, number];
};

export function looksLikeHolographicCard(value?: {
  rarity?: string | null;
  variant?: string | null;
  title?: string | null;
  finish?: string | null;
}) {
  return resolveCardFinish(value).profile.coverage !== 'paper';
}

export function getCardSurfaceTreatment(value?: {
  rarity?: string | null;
  variant?: string | null;
  finish?: string | null;
  title?: string | null;
  isHolographic?: boolean;
  isSlabbed?: boolean;
}): CardSurfaceTreatment {
  if (value?.isSlabbed) return 'slabbed';

  const profile = resolveCardFinish(value).profile;
  if (profile.coverage === 'body') return 'reverse_holofoil';
  if (profile.texture !== 'none') return 'textured_rare';
  if (profile.coverage !== 'paper') return 'holofoil';
  return 'standard';
}

export function CardInspectionProvider({ children }: { children: React.ReactNode }) {
  return <View style={styles.providerRoot}>{children}</View>;
}

export function InteractiveCardInspectPressable({
  children,
  onPress,
  onOpenDetail,
  showDetailAction = false,
  title,
  hapticOnPress = true,
  disabled = false,
  style,
  activeOpacity = 0.84,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  hitSlop,
}: InteractiveCardInspectPressableProps) {
  const skipNextPressRef = React.useRef(false);
  const canOpenDetail = Boolean(onOpenDetail && !disabled);
  const systemReducedMotion = useReducedMotion();
  const motionPreference = useCardMotionPreference();
  const reducedMotion = systemReducedMotion || motionPreference.reduced || !motionPreference.loaded;
  const tapProgress = useSharedValue(0);
  const pressedOpacity = Math.max(0.94, Math.min(1, activeOpacity));

  const tapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tapProgress.value, [0, 1], [1, pressedOpacity], Extrapolation.CLAMP),
    transform: reducedMotion
      ? []
      : [
          { translateY: interpolate(tapProgress.value, [0, 1], [0, CARD_PRESS_TRANSLATE_Y], Extrapolation.CLAMP) },
          { scale: interpolate(tapProgress.value, [0, 1], [1, CARD_PRESS_SCALE], Extrapolation.CLAMP) },
        ],
  }));

  const handlePressIn = React.useCallback(() => {
    if (reducedMotion || disabled) return;
    tapProgress.value = withTiming(1, { duration: 80 });
  }, [disabled, reducedMotion, tapProgress]);

  const handlePressOut = React.useCallback(() => {
    if (reducedMotion || disabled) {
      tapProgress.value = 0;
      return;
    }
    tapProgress.value = withSpring(0, {
      damping: 26,
      stiffness: 360,
      mass: 0.46,
      overshootClamping: true,
    });
  }, [disabled, reducedMotion, tapProgress]);

  const confirmLongHold = React.useCallback(() => {
    if (!onOpenDetail || disabled) return;
    skipNextPressRef.current = true;
    void stackrHaptics.selection();
    onOpenDetail();
    setTimeout(() => {
      skipNextPressRef.current = false;
    }, 450);
  }, [disabled, onOpenDetail]);

  const handlePress = React.useCallback(() => {
    if (skipNextPressRef.current) {
      skipNextPressRef.current = false;
      return;
    }
    if (!onPress || disabled) return;
    if (hapticOnPress) {
      void stackrHaptics.selection();
    }
    onPress?.();
  }, [disabled, hapticOnPress, onPress]);

  const longHoldGesture = React.useMemo(
    () => Gesture.LongPress()
      .enabled(canOpenDetail)
      .minDuration(LONG_PRESS_MS)
      .maxDistance(LONG_PRESS_MAX_DISTANCE)
      .shouldCancelWhenOutside(true)
      .onStart(() => {
        runOnJS(confirmLongHold)();
      }),
    [canOpenDetail, confirmLongHold],
  );

  const pressable = (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      aria-pressed={typeof accessibilityState?.selected === 'boolean' ? accessibilityState.selected : undefined}
      aria-disabled={disabled}
      accessibilityActions={canOpenDetail ? [{ name: 'longpress', label: 'View card details' }] : undefined}
      onAccessibilityAction={(event) => {
        if (canOpenDetail && event.nativeEvent.actionName === 'longpress') onOpenDetail?.();
      }}
      style={[
        style,
        tapStyle,
        disabled ? styles.disabledPressable : null,
      ]}
    >
      {children}
    </AnimatedPressable>
  );

  if (!canOpenDetail) return pressable;

  const surface = (
    <GestureDetector gesture={longHoldGesture}>
      {pressable}
    </GestureDetector>
  );

  return showDetailAction ? (
    <View>
      {surface}
      <StackrButton
        label="View details"
        accessibilityLabel={`View ${title} details`}
        variant="ghost"
        icon="information-circle-outline"
        onPress={onOpenDetail}
        disabled={disabled}
        style={{ alignSelf: 'flex-start', marginBottom: 6 }}
      />
    </View>
  ) : surface;
}

export function CardDetailInspectSurface({
  children,
  style,
  disabled = false,
  title,
  rarity,
  variant,
  finish,
  isHolographic,
  isSlabbed,
  surfaceTreatment,
  borderRadius = stackrCardImageSizes.cardCornerRadius,
  accessibilityLabel,
  accessibilityHint,
  setId,
  language,
  releaseDate,
  layout,
  cardMetadata,
  active = true,
  forceReducedMotion = false,
  previewTilt,
}: CardDetailInspectSurfaceProps) {
  const systemReducedMotion = useReducedMotion();
  const motionPreference = useCardMotionPreference();
  // Match the full-screen inspector: pending or failed preference reads remain still.
  const reducedMotion = systemReducedMotion || forceReducedMotion || motionPreference.reduced || !motionPreference.loaded;
  const isFocused = useIsFocused();
  const [foreground, setForeground] = React.useState(AppState.currentState !== 'background');
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const enabled = active && isFocused && foreground && !disabled;
  const webSurface = Platform.OS === 'web';
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const pressProgress = useSharedValue(0);
  const inspectionEngaged = useSharedValue(false);
  const engagedHapticRef = React.useRef(false);
  const pointerOrigin = React.useRef<{ x: number; y: number; tiltX: number; tiltY: number; engaged: boolean } | null>(null);
  const pointerHoldTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureStartX = useSharedValue(0);
  const gestureStartY = useSharedValue(0);
  const restingTiltX = __DEV__ && enabled && !reducedMotion ? clamp(previewTilt?.[0] ?? 0, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE) : 0;
  const restingTiltY = __DEV__ && enabled && !reducedMotion ? clamp(previewTilt?.[1] ?? 0, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE) : 0;
  const resolution = React.useMemo(() => {
    const inherited = getCardFinishMetadata(cardMetadata);
    const legacyFinish = surfaceTreatment === 'standard' ? 'normal'
      : surfaceTreatment === 'reverse_holofoil' ? 'reverse holo'
        : surfaceTreatment === 'textured_rare' ? 'textured full art'
          : surfaceTreatment === 'holofoil' ? 'holo' : undefined;
    return resolveCardFinish({
      ...inherited,
      rarity: rarity ?? inherited.rarity,
      variant: variant ?? inherited.variant,
      finish: finish ?? inherited.finish ?? legacyFinish,
      setId: setId ?? inherited.setId,
      language: language ?? inherited.language,
      releaseDate: releaseDate ?? inherited.releaseDate,
      layout: layout ?? inherited.layout,
      isHolographic: isHolographic ?? inherited.isHolographic,
    });
  }, [cardMetadata, finish, isHolographic, language, layout, rarity, releaseDate, setId, surfaceTreatment, variant]);

  React.useEffect(() => {
    if (enabled && !reducedMotion) return;
    cancelAnimation(tiltX);
    cancelAnimation(tiltY);
    cancelAnimation(pressProgress);
    tiltX.value = 0;
    tiltY.value = 0;
    pressProgress.value = 0;
    inspectionEngaged.value = false;
    engagedHapticRef.current = false;
    pointerOrigin.current = null;
    if (pointerHoldTimer.current) clearTimeout(pointerHoldTimer.current);
    pointerHoldTimer.current = null;
  }, [enabled, reducedMotion, inspectionEngaged, pressProgress, tiltX, tiltY]);

  React.useEffect(() => () => {
    if (pointerHoldTimer.current) clearTimeout(pointerHoldTimer.current);
  }, []);

  React.useEffect(() => {
    if (!__DEV__) return;
    const showTilt = enabled && !reducedMotion && previewTilt;
    tiltX.value = showTilt ? clamp(showTilt[0], -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE) : 0;
    tiltY.value = showTilt ? clamp(showTilt[1], -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE) : 0;
    pressProgress.value = showTilt ? 0.7 : 0;
  }, [enabled, previewTilt, reducedMotion, pressProgress, tiltX, tiltY]);

  const triggerEngageHaptic = React.useCallback(() => {
    if (engagedHapticRef.current) return;
    engagedHapticRef.current = true;
    void stackrHaptics.selection();
  }, []);

  const triggerSettledHaptic = React.useCallback(() => {
    engagedHapticRef.current = false;
    void stackrHaptics.selection();
  }, []);

  const gesture = React.useMemo(
    () => Gesture.Pan()
      .enabled(enabled && Platform.OS !== 'web')
      .activateAfterLongPress(LONG_PRESS_MS)
      .minDistance(1)
      .maxPointers(1)
      .onStart(() => {
        inspectionEngaged.value = true;
        gestureStartX.value = tiltX.value;
        gestureStartY.value = tiltY.value;
        pressProgress.value = reducedMotion
          ? withTiming(1, { duration: 120 })
          : withSpring(1, { damping: 24, stiffness: 220, mass: 0.74 });
        runOnJS(triggerEngageHaptic)();
      })
      .onUpdate((event) => {
        if (reducedMotion) return;
        tiltX.value = withTiming(clamp(gestureStartX.value + event.translationX, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE), { duration: 65 });
        tiltY.value = withTiming(clamp(gestureStartY.value + event.translationY, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE), { duration: 65 });
      })
      .onFinalize(() => {
        const didEngage = inspectionEngaged.value;
        inspectionEngaged.value = false;
        tiltX.value = withSpring(restingTiltX, { damping: 20, stiffness: 170, mass: 0.78 });
        tiltY.value = withSpring(restingTiltY, { damping: 20, stiffness: 170, mass: 0.78 });
        if (!didEngage) {
          pressProgress.value = 0;
          return;
        }
        pressProgress.value = reducedMotion
          ? withTiming(0, { duration: 160 }, (finished) => {
              if (finished) runOnJS(triggerSettledHaptic)();
            })
          : withSpring(0, { damping: 20, stiffness: 210, mass: 0.76 }, (finished) => {
              if (finished) runOnJS(triggerSettledHaptic)();
            });
      }),
    [enabled, gestureStartX, gestureStartY, inspectionEngaged, pressProgress, reducedMotion, restingTiltX, restingTiltY, tiltX, tiltY, triggerEngageHaptic, triggerSettledHaptic],
  );

  const shellStyle = useAnimatedStyle(() => {
    const p = reducedMotion ? 0 : pressProgress.value;
    const rotateY = reducedMotion
      ? 0
      : interpolate(tiltX.value, [-DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE], [-MAX_DETAIL_ROTATION_DEG, MAX_DETAIL_ROTATION_DEG], Extrapolation.CLAMP);
    const rotateX = reducedMotion
      ? 0
      : interpolate(tiltY.value, [-DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE], [MAX_DETAIL_ROTATION_DEG, -MAX_DETAIL_ROTATION_DEG], Extrapolation.CLAMP);

    return {
      transform: [
        { perspective: 1100 },
        { translateY: interpolate(p, [0, 1], [0, reducedMotion ? 0 : -10], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [1, reducedMotion ? 1 : 1.035], Extrapolation.CLAMP) },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
      ],
      ...(webSurface ? {
        boxShadow: `${reducedMotion ? 0 : -tiltX.value / 12}px ${12 + p * 14}px ${16 + p * 12}px rgba(6, 13, 25, ${0.3 + p * 0.16})`,
      } : {
        shadowOpacity: interpolate(p, [0, 1], [0.3, 0.46], Extrapolation.CLAMP),
        shadowRadius: interpolate(p, [0, 1], [16, 28], Extrapolation.CLAMP),
        shadowOffset: { width: 0, height: interpolate(p, [0, 1], [12, 26], Extrapolation.CLAMP) },
        elevation: interpolate(p, [0, 1], [10, 20], Extrapolation.CLAMP),
      }),
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const p = pressProgress.value;
    const x = reducedMotion
      ? 0
      : interpolate(tiltX.value, [-DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE], [16, -16], Extrapolation.CLAMP);
    const y = reducedMotion
      ? 0
      : interpolate(tiltY.value, [-DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE], [8, 20], Extrapolation.CLAMP);
    return {
      opacity: reducedMotion ? 0.18 : interpolate(p, [0, 1], [0.18, 0.38], Extrapolation.CLAMP),
      transform: [
        { translateX: x },
        { translateY: y + 16 },
        { scaleX: reducedMotion ? 0.94 : interpolate(p, [0, 1], [0.94, 1.03], Extrapolation.CLAMP) },
        { scaleY: reducedMotion ? 0.78 : interpolate(p, [0, 1], [0.78, 0.92], Extrapolation.CLAMP) },
      ],
    };
  });

  const edgeStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.22 : 0.22 + pressProgress.value * 0.2,
    borderLeftColor: tiltX.value < 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
    borderRightColor: tiltX.value > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
  }));

  const settlePointer = () => {
    if (pointerHoldTimer.current) clearTimeout(pointerHoldTimer.current);
    pointerHoldTimer.current = null;
    const didEngage = pointerOrigin.current?.engaged;
    if (!pointerOrigin.current) return;
    pointerOrigin.current = null;
    tiltX.value = withSpring(restingTiltX, { damping: 20, stiffness: 170 });
    tiltY.value = withSpring(restingTiltY, { damping: 20, stiffness: 170 });
    pressProgress.value = withTiming(__DEV__ && previewTilt ? 0.7 : 0, { duration: 160 });
    if (didEngage) triggerSettledHaptic();
  };

  const surface = (
      <Animated.View
        accessibilityRole="imagebutton"
        accessibilityLabel={accessibilityLabel ?? (title ? `Inspect ${title} card artwork` : 'Inspect card artwork')}
        accessibilityHint={accessibilityHint ?? 'Hold, then move your finger to tilt the card and inspect its finish.'}
        onPointerDown={Platform.OS === 'web' ? (event) => {
          if (!enabled || reducedMotion || (event.nativeEvent.pointerType === 'mouse' && event.nativeEvent.button !== 0)) return;
          const pointerId = event.nativeEvent.pointerId;
          const target = event.currentTarget as unknown as { setPointerCapture?: (id: number) => void };
          pointerOrigin.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, tiltX: tiltX.value, tiltY: tiltY.value, engaged: false };
          const engage = () => {
            pointerHoldTimer.current = null;
            if (!pointerOrigin.current) return;
            pointerOrigin.current.engaged = true;
            target.setPointerCapture?.(pointerId);
            pressProgress.value = withTiming(1, { duration: 100 });
            triggerEngageHaptic();
          };
          if (event.nativeEvent.pointerType === 'touch') pointerHoldTimer.current = setTimeout(engage, LONG_PRESS_MS);
          else engage();
        } : undefined}
        onPointerMove={Platform.OS === 'web' ? (event) => {
          const origin = pointerOrigin.current;
          if (!origin || !enabled || reducedMotion) return;
          const dx = event.nativeEvent.clientX - origin.x;
          const dy = event.nativeEvent.clientY - origin.y;
          if (!origin.engaged) {
            if (Math.hypot(dx, dy) > LONG_PRESS_MAX_DISTANCE) settlePointer();
            return;
          }
          tiltX.value = clamp(origin.tiltX + dx, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE);
          tiltY.value = clamp(origin.tiltY + dy, -DETAIL_TILT_DISTANCE, DETAIL_TILT_DISTANCE);
        } : undefined}
        onPointerUp={Platform.OS === 'web' ? settlePointer : undefined}
        onPointerCancel={Platform.OS === 'web' ? settlePointer : undefined}
        onPointerLeave={Platform.OS === 'web' ? (event) => {
          if (!event.nativeEvent.buttons) settlePointer();
        } : undefined}
        style={[styles.detailRoot, style, Platform.OS === 'web' ? { touchAction: enabled && !reducedMotion ? 'none' : 'auto', userSelect: 'none' } as ViewStyle & { touchAction: string } : null]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.detailShadow, { borderRadius: 999 }, shadowStyle]}
        />
        <Animated.View style={[styles.detailCardLayer, { borderRadius }, shellStyle]}>
          <View style={[styles.detailContentLayer, { borderRadius }]}>
            {children}
          </View>
          <View pointerEvents="none" style={[styles.detailReflectionClip, { borderRadius }]}>
            <CardFinishOverlay
              resolution={resolution}
              tiltX={tiltX}
              tiltY={tiltY}
              engagement={pressProgress}
              reducedMotion={reducedMotion}
              isSlabbed={isSlabbed || surfaceTreatment === 'slabbed'}
            />
          </View>
          <Animated.View pointerEvents="none" style={[styles.detailEdge, { borderRadius }, edgeStyle]} />
        </Animated.View>
      </Animated.View>
  );
  // Web uses pointer capture so dragging outside the card still ends cleanly.
  // Native keeps the existing hold-to-inspect gesture and haptic policy.
  return Platform.OS === 'web' ? surface : <GestureDetector gesture={gesture}>{surface}</GestureDetector>;
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
  },
  disabledPressable: {
    opacity: 0.58,
  },
  detailRoot: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
  detailShadow: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: -16,
    height: 46,
    backgroundColor: '#0A1020',
    shadowColor: '#0A1020',
    shadowOpacity: 0.8,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  detailCardLayer: {
    position: 'relative',
    flex: 1,
    width: '100%',
    overflow: 'visible',
    shadowColor: '#060D19',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  detailContentLayer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  detailReflectionClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  detailEdge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0.8,
    borderTopColor: 'rgba(255,255,255,0.85)',
    borderBottomColor: 'rgba(15,23,42,0.45)',
  },

});
