import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Platform, StyleSheet, View, type ActivityIndicatorProps } from 'react-native';
import { CARD_LOADING_DURATION, CARD_LOADING_STILL, CARD_LOADING_TRACKS, CARD_LOADING_STAGE, CARD_LOADING_SIZES, type CardLoadingTrack } from '../lib/stackrCardLoadingMotion';

const ART = {
  card: require('../assets/loading/card.png'),
  sleeve: require('../assets/loading/sleeve.png'),
  loader: require('../assets/loading/loader.png'),
  sheen: require('../assets/loading/sheen.png'),
  letter: require('../assets/rev2/01-brand/logos/stackr-letter-s.png'),
};

/** Card → penny sleeve → rigid top loader. Every animated property uses the native driver. */
export function StackrLoadingIndicator({ size = 'small', animating = true, hidesWhenStopped = true, style, color, accessibilityLabel = 'Loading', ...props }: ActivityIndicatorProps) {
  // Keep compatibility with existing busy controls; the card retains its brand material.
  void color;
  // Animated.loop resets to the Value's construction value, not its last setValue.
  const clock = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const dimension = typeof size === 'number' ? Math.max(12, size) : size === 'large' ? 96 : 28;
  // Shorter travel keeps the material legible inside a 28px busy control.
  const inline = dimension <= 40;
  const scale = dimension / (inline ? 180 : CARD_LOADING_STAGE.width);

  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => { if (mounted) setReduceMotion(value); };
    void AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    const state = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { mounted = false; motion.remove(); state.remove(); };
  }, []);

  useEffect(() => {
    clock.stopAnimation();
    if (reduceMotion !== false || !animating || !active) {
      clock.setValue(CARD_LOADING_STILL);
      return;
    }
    clock.setValue(0);
    const animation = Animated.loop(Animated.timing(clock, {
      toValue: CARD_LOADING_DURATION,
      duration: CARD_LOADING_DURATION,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); clock.stopAnimation(); };
  }, [active, animating, clock, reduceMotion]);

  const value = (track: CardLoadingTrack) => clock.interpolate({ ...track, extrapolate: 'clamp' });
  const xTrack = (track: CardLoadingTrack) => inline ? { ...track, outputRange: track.outputRange.map(v => 180 + (v - 180) * 0.32) } : track;
  const yTrack = (track: CardLoadingTrack) => inline ? { ...track, outputRange: track.outputRange.map(v => 120 + (v - 151) * 0.52) } : track;
  const layerStyle = (name: keyof typeof CARD_LOADING_SIZES) => {
    const [width, height] = CARD_LOADING_SIZES[name];
    return { width, height, marginLeft: -width / 2, marginTop: -height / 2 };
  };
  const position = (x: CardLoadingTrack, y: CardLoadingTrack, rotation?: CardLoadingTrack) => [
    { translateX: value(xTrack(x)) }, { translateY: value(yTrack(y)) },
    ...(rotation ? [{ rotate: clock.interpolate({ inputRange: rotation.inputRange, outputRange: rotation.outputRange.map(v => `${v}deg`), extrapolate: 'clamp' }) }] : []),
  ];
  if (!animating && hidesWhenStopped) return null;

  return (
    <View {...props} accessible={props.accessible ?? true} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityState={{ ...props.accessibilityState, busy: animating }} style={[styles.container, { width: dimension, height: dimension }, style]}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 360 * scale, height: dimension }}>
        <Animated.View style={[styles.stage, { opacity: value(CARD_LOADING_TRACKS.sceneOpacity), transform: [{ translateX: -180 + 180 * scale }, { translateY: -120 + dimension / 2 }, { scale }] }]}>
          <Animated.View style={[styles.layer, layerStyle('card'), { transform: position(CARD_LOADING_TRACKS.cardX, CARD_LOADING_TRACKS.cardY, CARD_LOADING_TRACKS.cardRotation) }]}>
            <Image source={ART.card} style={styles.image} fadeDuration={0} />
            <Image source={ART.letter} resizeMode="contain" style={{ position: 'absolute', width: 44, height: 44, left: 5, top: 16 }} fadeDuration={0} />
          </Animated.View>
          <Animated.View style={[styles.layer, layerStyle('sleeve'), { transform: position(CARD_LOADING_TRACKS.sleeveX, CARD_LOADING_TRACKS.sleeveY, CARD_LOADING_TRACKS.sleeveRotation) }]}>
            <Image source={ART.sleeve} style={styles.image} fadeDuration={0} />
          </Animated.View>
          <Animated.View style={[styles.layer, layerStyle('loader'), { opacity: value(CARD_LOADING_TRACKS.loaderOpacity), transform: position(CARD_LOADING_TRACKS.loaderX, CARD_LOADING_TRACKS.loaderY) }]}>
            <Image source={ART.loader} style={styles.image} fadeDuration={0} />
          </Animated.View>
          <Animated.View style={[styles.layer, { width: 12, height: 76, top: inline ? 82 : 113, opacity: value(CARD_LOADING_TRACKS.sheenOpacity), transform: [{ translateX: value(xTrack(CARD_LOADING_TRACKS.sheenX)) }] }]}>
            <Image source={ART.sheen} style={styles.image} fadeDuration={0} />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  stage: { position: 'absolute', width: 360, height: 240 },
  layer: { position: 'absolute', left: 0, top: 0 },
  image: { width: '100%', height: '100%' },
});
