import React, { memo, useId } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import { getCardFinishMask, type CardFinishPattern, type CardFinishResolution, type CardFinishTexture } from '../lib/cardFinishProfiles';

const AnimatedG = Animated.createAnimatedComponent(G);

/** Patterns and texture are fixed in card coordinates; only light moves. No frame-time React renders. */
export const CardFinishOverlay = memo(function CardFinishOverlay({
  resolution,
  tiltX,
  tiltY,
  engagement,
  reducedMotion,
  isSlabbed = false,
}: {
  resolution: CardFinishResolution;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  engagement: SharedValue<number>;
  reducedMotion: boolean;
  isSlabbed?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { profile, layout } = resolution;
  const { intensity, palette } = profile;
  const lightProps = useAnimatedProps(() => {
    const x = reducedMotion ? 0 : tiltX.value / 96;
    const y = reducedMotion ? 0 : tiltY.value / 96;
    const strength = reducedMotion ? 0 : Math.max(engagement.value * 0.55, Math.abs(x), Math.abs(y));
    return {
      opacity: (0.16 + strength * 0.3) * intensity,
      transform: `translate(${x * 38}, ${y * 26}) rotate(${-22 + x * 9 - y * 6}, 50, 70)`,
    };
  });
  const materialProps = useAnimatedProps(() => {
    const strength = reducedMotion ? 0 : Math.max(engagement.value * 0.55, Math.abs(tiltX.value / 96), Math.abs(tiltY.value / 96));
    return { opacity: (0.14 + strength * 0.28) * intensity };
  });
  const plasticProps = useAnimatedProps(() => ({
    opacity: reducedMotion ? 0.12 : 0.12 + engagement.value * 0.18,
    transform: `translate(${reducedMotion ? 0 : tiltX.value / 8}, ${reducedMotion ? 0 : tiltY.value / 10}) rotate(-12, 50, 70)`,
  }));

  const colors = palette === 'paper' || palette === 'silver'
    ? ['#FFFFFF', '#DAE8FF', '#FFFFFF', '#D8D4FF', '#FFFFFF']
    : palette === 'gold'
      ? ['#FFF3BC', '#EABD49', '#FFF9D9', '#DBA92F', '#FFF3BC']
      : ['#81E8FF', '#ACA0FF', '#FFFFFF', '#FFADCF', '#FFF2A4'];

  return (
    <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 100 140" preserveAspectRatio="none" style={StyleSheet.absoluteFill} aria-hidden>
      <Defs>
        <ClipPath id={`${id}coverage`}>
          <Path d={getCardFinishMask(profile.coverage, layout)} fillRule="evenodd" clipRule="evenodd" />
        </ClipPath>
        <LinearGradient id={`${id}light`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0" stopColor={colors[0]} stopOpacity="0" />
          <Stop offset="0.23" stopColor={colors[0]} stopOpacity={palette === 'paper' ? 0 : 0.25} />
          <Stop offset="0.38" stopColor={colors[1]} stopOpacity={palette === 'paper' ? 0.08 : 0.48} />
          <Stop offset="0.49" stopColor={colors[2]} stopOpacity="0.72" />
          <Stop offset="0.55" stopColor={colors[3]} stopOpacity={palette === 'paper' ? 0.12 : 0.46} />
          <Stop offset="0.72" stopColor={colors[4]} stopOpacity={palette === 'paper' ? 0 : 0.2} />
          <Stop offset="1" stopColor={colors[4]} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${id}plastic`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.43" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.08" />
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <Pattern id={`${id}pattern`} patternUnits="userSpaceOnUse" width="18" height="18">
          <FinishMotif pattern={profile.pattern} ink={profile.coverage === 'body' ? '#637CA9' : '#FFFFFF'} />
        </Pattern>
        <Pattern id={`${id}texture`} patternUnits="userSpaceOnUse" width="12" height="12">
          <FinishTexture texture={profile.texture} />
        </Pattern>
      </Defs>
      <G clipPath={`url(#${id}coverage)`}>
        <AnimatedG animatedProps={materialProps}>
          {profile.pattern !== 'none' && <Rect width="100" height="140" fill={`url(#${id}pattern)`} />}
          {profile.texture !== 'none' && <Rect width="100" height="140" fill={`url(#${id}texture)`} />}
        </AnimatedG>
        <AnimatedG animatedProps={lightProps}>
          <Rect x="-50" y="-70" width="200" height="280" fill={`url(#${id}light)`} />
          {profile.texture !== 'none' && <Rect x="-35" y="-70" width="90" height="280" fill={`url(#${id}light)`} opacity="0.35" />}
        </AnimatedG>
      </G>
      {isSlabbed && (
        <AnimatedG animatedProps={plasticProps}>
          <Rect x="-35" y="-35" width="170" height="210" fill={`url(#${id}plastic)`} />
        </AnimatedG>
      )}
    </Svg>
  );
});

const FinishMotif = memo(function FinishMotif({ pattern, ink }: { pattern: CardFinishPattern; ink: string }) {
  switch (pattern) {
    case 'pokeball':
    case 'masterball':
      return (
        <G fill="none" stroke={ink} strokeWidth="0.5" strokeOpacity="0.85">
          <Circle cx="9" cy="9" r="5.5" />
          <Path d="M3.5 9H6.9 M11.1 9H14.5" />
          <Circle cx="9" cy="9" r="2.1" />
          <Circle cx="9" cy="9" r="0.7" />
          {pattern === 'masterball' && <>
            <Path d="M6.9 6.7V4.8L9 6.1 11.1 4.8V6.7" strokeWidth="0.65" />
            <Path d="M4.1 6.4Q5.5 4.2 6.2 6 M11.8 6Q12.5 4.2 13.9 6.4" />
          </>}
        </G>
      );
    case 'geometric':
      return <Path d="M9 1L17 9 9 17 1 9Z M9 4L14 9 9 14 4 9Z" fill="none" stroke={ink} strokeWidth="0.4" />;
    case 'energy':
      return <G fill="none" stroke={ink} strokeWidth="0.45"><Circle cx="9" cy="9" r="5" /><Path d="M10 4L6.5 9.5H9L8 14 12 8H9.5Z" /></G>;
    case 'cosmos':
      return <G fill={ink}><Circle cx="3" cy="5" r="0.8" /><Circle cx="12" cy="12" r="1.15" fillOpacity="0.5" /><Circle cx="16" cy="3" r="0.35" /><Circle cx="7" cy="16" r="0.45" /></G>;
    case 'stars':
      return <G fill={ink}><Path d="M5 2L5.8 4.2 8 5 5.8 5.8 5 8 4.2 5.8 2 5 4.2 4.2Z" /><Path d="M13 10L13.5 12 15.5 12.5 13.5 13 13 15 12.5 13 10.5 12.5 12.5 12Z" fillOpacity="0.65" /></G>;
    case 'confetti':
      return <G fill="#FFFFFF"><Path d="M2 3L4 2 5 5 3 6Z M11 10L14 11 13 13 10 12Z" /><Path d="M13 2L15 3 14 5 12 4Z M3 13L5 15 4 16 2 14Z" fillOpacity="0.5" /></G>;
    case 'cracked_ice':
      return <Path d="M0 3L6 0 11 6 18 4 M11 6L8 13 0 10 M8 13L14 18 M8 13L18 12 M6 0L4 7 0 10" fill="none" stroke="#FFFFFF" strokeWidth="0.45" />;
    case 'radiant':
      return <Path d="M0 0L18 18 M18 0L0 18 M9 0L18 9 9 18 0 9Z" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />;
    case 'glitter':
      return <G fill="#FFFFFF"><Circle cx="2" cy="4" r="0.4" /><Circle cx="8" cy="13" r="0.3" /><Circle cx="15" cy="7" r="0.5" /><Path d="M7 3h2M8 2v2 M13 14h2M14 13v2" stroke="#FFFFFF" strokeWidth="0.3" /></G>;
    default:
      return null;
  }
});

const FinishTexture = memo(function FinishTexture({ texture }: { texture: CardFinishTexture }) {
  if (texture === 'none') return null;
  return texture === 'etched'
    ? <Path d="M-3 3L3 -3 M0 6L6 0 M0 9L9 0 M0 12L12 0 M3 15L15 3 M6 18L18 6" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="0.18" />
    : <Path d="M0 2Q6 -1 12 2 M0 5Q6 1 12 5 M0 8Q6 4 12 8 M0 11Q6 7 12 11" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="0.2" />;
});
