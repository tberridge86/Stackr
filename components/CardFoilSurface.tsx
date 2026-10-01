import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';

/**
 * Web intentionally uses a small CSS-compatible approximation instead of
 * claiming Skia parity. Each visible sheet is clipped to already-verified
 * geometry, so a plain card or an unknown mask remains visually plain.
 */
function ReflectionSheet({ x, y, width, height, chromatic = false }: CardFoilSurfaceProps & { chromatic?: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [
    { translateX: -x.value * width * 0.38 }, { translateY: y.value * height * 0.32 },
    { rotate: '-28deg' },
  ] }));
  return <Animated.View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient colors={chromatic
      ? ['transparent', 'rgba(255,255,255,0.045)', 'rgba(214,237,255,0.12)', 'rgba(255,255,255,0.035)', 'transparent']
      : ['transparent', 'rgba(255,255,255,0.035)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.025)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} accessible={false} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

function ClippedReflection(props: CardFoilSurfaceProps & { frame: { left: number; top: number; width: number; height: number }; chromatic?: boolean }) {
  const { frame } = props;
  return <Animated.View pointerEvents="none" accessible={false} style={{ position: 'absolute', left: frame.left, top: frame.top, width: frame.width, height: frame.height, overflow: 'hidden' }}>
    <ReflectionSheet {...props} />
  </Animated.View>;
}

export default function CardFoilSurface(props: CardFoilSurfaceProps) {
  const { profile, width, height } = props;
  const frames = useMemo(() => {
    if (profile.profile === 'plain' || profile.mask.kind === 'none') return [];
    if (profile.mask.kind === 'full') return [{ left: 0, top: 0, width, height }];
    const regions = profile.mask.regions ?? [];
    if (profile.mask.kind === 'regions' || profile.mask.kind === 'artwork') return regions.map(region => ({
      left: region.x * width, top: region.y * height, width: region.width * width, height: region.height * height,
    }));
    // An outside-artwork mask is represented exactly on web only for one
    // verified rectangle. More complex exclusion geometry stays quiet rather
    // than showing reflection over a protected region.
    if (profile.mask.kind === 'outside-artwork' && regions.length === 1) {
      const region = regions[0]; const left = region.x * width; const top = region.y * height;
      const right = left + region.width * width; const bottom = top + region.height * height;
      return [
        { left: 0, top: 0, width, height: top },
        { left: 0, top: bottom, width, height: height - bottom },
        { left: 0, top, width: left, height: bottom - top },
        { left: right, top, width: width - right, height: bottom - top },
      ].filter(frame => frame.width > 0 && frame.height > 0);
    }
    return [];
  }, [height, profile.mask.kind, profile.mask.regions, profile.profile, width]);
  if (props.source !== 'catalogue') return null;
  // Every catalogue card retains a small achromatic hand-driven reflection.
  // It is deliberately not a statement about a physical foil treatment.
  if (profile.profile === 'plain' || profile.mask.kind === 'none' || frames.length === 0) return <ReflectionSheet {...props} />;
  return <>{frames.map((frame, index) => <ClippedReflection key={`${index}-${frame.left}-${frame.top}`} {...props} chromatic frame={frame} />)}</>;
}
