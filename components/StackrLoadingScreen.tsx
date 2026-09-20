import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LoadingMarkLayer, LoadingSparkles, LoadingWordmark } from './StackrLoadingBrand';
import {
  getStackrLoadingLayout,
  STACKR_LOADING_TIMING,
  STACKR_LOADING_TRACKS,
  type LoadingTrack,
} from '../lib/stackrLoadingMotion';

type StackrLoadingScreenProps = {
  message?: string;
  compact?: boolean;
  /** Stops motion while an adjacent recovery action is shown. */
  busy?: boolean;
  /** Replay the reference animation on the dedicated preview screen. */
  loop?: boolean;
  /** Short in-app waits can show the finished lockup immediately. */
  animate?: boolean;
  onReadyForDismiss?: () => void;
};

export function StackrLoadingScreen({
  message,
  compact = false,
  busy = true,
  loop = false,
  animate = true,
  onReadyForDismiss,
}: StackrLoadingScreenProps) {
  const { width, height } = useWindowDimensions();
  const layout = getStackrLoadingLayout(width, height, compact);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const clock = useRef(new Animated.Value(0)).current;
  const onReadyRef = useRef(onReadyForDismiss);
  onReadyRef.current = onReadyForDismiss;
  const glowId = useId().replace(/:/g, '');

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReduceMotion(enabled); })
      .catch(() => { if (active) setReduceMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion || !animate || !busy) {
      clock.setValue(STACKR_LOADING_TIMING.revealEnd);
      const readyTimer = setTimeout(() => onReadyRef.current?.(), 240);
      return () => clearTimeout(readyTimer);
    }

    clock.setValue(0);
    const entrance = Animated.timing(clock, {
      toValue: loop ? STACKR_LOADING_TIMING.loopEnd : STACKR_LOADING_TIMING.ready,
      duration: loop ? STACKR_LOADING_TIMING.loopEnd : STACKR_LOADING_TIMING.ready,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    const animation = loop ? Animated.loop(entrance) : entrance;
    animation.start(({ finished }) => {
      if (finished && !loop) onReadyRef.current?.();
    });
    return () => animation.stop();
  }, [animate, busy, clock, loop, reduceMotion]);

  const track = (value: LoadingTrack) => clock.interpolate({ ...value, extrapolate: 'clamp' });
  const frontOpacity = track(STACKR_LOADING_TRACKS.frontOpacity);
  const frontY = track(STACKR_LOADING_TRACKS.frontY);
  const frontRotation = clock.interpolate({
    inputRange: STACKR_LOADING_TRACKS.frontRotation.inputRange,
    outputRange: STACKR_LOADING_TRACKS.frontRotation.outputRange.map((value) => `${value}deg`),
    extrapolate: 'clamp',
  });
  const rear = track(STACKR_LOADING_TRACKS.rear);
  const middle = track(STACKR_LOADING_TRACKS.middle);
  const star = track(STACKR_LOADING_TRACKS.star);
  const lockup = track(STACKR_LOADING_TRACKS.lockup);
  const wordmark = track(STACKR_LOADING_TRACKS.wordmark);
  const tagline = track(STACKR_LOADING_TRACKS.tagline);
  const sparkles = track(STACKR_LOADING_TRACKS.sparkles);
  const sceneOpacity = track(STACKR_LOADING_TRACKS.sceneOpacity);
  const markSize = { width: layout.markWidth, height: layout.markHeight };

  return (
    <View
      style={[styles.container, compact && styles.compactContainer]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ? `Stackr. ${message}` : 'Stackr loading. Collect. Trade. Protect.'}
      accessibilityState={{ busy }}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FCFAFF', '#FFFDFA', '#FFFFFF']}
        locations={[0, 0.42, 0.78, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width={layout.auraSize}
        height={layout.auraSize}
        viewBox="0 0 600 600"
        style={styles.aura}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id={glowId} cx="50%" cy="48%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#C7B5FF" stopOpacity={0.36} />
            <Stop offset="0.44" stopColor="#DFD4FF" stopOpacity={0.25} />
            <Stop offset="1" stopColor="#F5F0FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="600" height="600" fill={`url(#${glowId})`} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.scene,
          {
            width: layout.width,
            height: layout.height + (message ? 31 * layout.scale : 0),
            opacity: reduceMotion === null ? 0 : sceneOpacity,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.lockup,
            {
              height: layout.markHeight,
              gap: layout.gap,
              transform: [{ translateX: lockup.interpolate({ inputRange: [0, 1], outputRange: [(layout.wordmarkWidth + layout.gap) / 2, 0] }) }],
            },
          ]}
        >
          <View style={markSize}>
            <Animated.View style={[styles.markLayer, markSize, {
              opacity: rear,
              transform: [
                { translateX: rear.interpolate({ inputRange: [0, 1], outputRange: [layout.markWidth * 0.22, 0] }) },
                { rotate: rear.interpolate({ inputRange: [0, 1], outputRange: ['17deg', '0deg'] }) },
              ],
            }]}>
              <LoadingMarkLayer layer="rear" {...markSize} />
            </Animated.View>
            <Animated.View style={[styles.markLayer, markSize, {
              opacity: middle,
              transform: [
                { translateX: middle.interpolate({ inputRange: [0, 1], outputRange: [layout.markWidth * 0.12, 0] }) },
                { rotate: middle.interpolate({ inputRange: [0, 1], outputRange: ['8deg', '0deg'] }) },
              ],
            }]}>
              <LoadingMarkLayer layer="middle" {...markSize} />
            </Animated.View>
            <Animated.View style={[styles.markLayer, markSize, {
              opacity: frontOpacity,
              transform: [{ translateY: Animated.multiply(frontY, layout.scale) }, { rotate: frontRotation }],
            }]}>
              <LoadingMarkLayer layer="front" {...markSize} />
            </Animated.View>
            <Animated.View style={[styles.markLayer, markSize, {
              opacity: star,
              transform: [
                { translateY: star.interpolate({ inputRange: [0, 1], outputRange: [-8 * layout.scale, 0] }) },
                { scale: star.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
              ],
            }]}>
              <LoadingMarkLayer layer="star" {...markSize} />
            </Animated.View>
          </View>
          <Animated.View style={{
            opacity: wordmark,
            transform: [
              { translateX: wordmark.interpolate({ inputRange: [0, 1], outputRange: [12 * layout.scale, 0] }) },
              { scale: wordmark.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
            ],
          }}>
            <LoadingWordmark width={layout.wordmarkWidth} height={layout.wordmarkHeight} />
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[
          styles.tagline,
          {
            marginTop: 12 * layout.scale,
            fontSize: layout.taglineSize,
            lineHeight: layout.taglineHeight,
            letterSpacing: layout.taglineSpacing,
            opacity: tagline,
            transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [7 * layout.scale, 0] }) }],
          },
        ]}>
          Collect. Trade. Protect.
        </Animated.Text>
        <Animated.View style={{ opacity: sparkles, marginTop: 6 * layout.scale }}>
          <LoadingSparkles width={layout.sparklesWidth} height={layout.sparklesHeight} />
        </Animated.View>
        {message ? (
          <Animated.Text style={[styles.message, { opacity: tagline }]}>{message}</Animated.Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  compactContainer: { minHeight: 240 },
  aura: { position: 'absolute' },
  scene: { alignItems: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  markLayer: { position: 'absolute', top: 0, left: 0 },
  tagline: {
    color: '#061638',
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    marginTop: 14,
    color: '#786F91',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
