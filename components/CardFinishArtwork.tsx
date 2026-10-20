import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { cancelAnimation, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { getCardFinishMetadata, resolveCardFinish } from '../lib/cardFinishProfiles';
import { CardFinishOverlay } from './CardFinishOverlay';

/** Thumbnail material preview. Leaves tap, long hold, scrolling and reordering to its parent. */
export const CardFinishArtwork = React.memo(function CardFinishArtwork({
  children, cardMetadata, variant, finish, style, borderRadius = 7, isSlabbed = false, active = true, forceReducedMotion = false,
}: {
  children: React.ReactNode;
  cardMetadata?: unknown;
  variant?: string | null;
  finish?: string | null;
  style?: StyleProp<ViewStyle>;
  borderRadius?: ViewStyle['borderRadius'];
  isSlabbed?: boolean;
  active?: boolean;
  forceReducedMotion?: boolean;
}) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = systemReducedMotion || forceReducedMotion;
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const engagement = useSharedValue(0);
  const resolution = React.useMemo(() => resolveCardFinish({
    ...getCardFinishMetadata(cardMetadata),
    ...(variant != null ? { variant } : {}),
    ...(finish != null ? { finish } : {}),
  }), [cardMetadata, variant, finish]);

  React.useEffect(() => {
    if (active && !reducedMotion) return;
    cancelAnimation(tiltX);
    cancelAnimation(tiltY);
    cancelAnimation(engagement);
    tiltX.value = 0;
    tiltY.value = 0;
    engagement.value = 0;
  }, [active, reducedMotion, tiltX, tiltY, engagement]);

  const settle = () => {
    tiltX.value = withTiming(0, { duration: 180 });
    tiltY.value = withTiming(0, { duration: 180 });
    engagement.value = withTiming(0, { duration: 180 });
  };

  return (
    <View
      style={[styles.frame, style, { borderRadius }]}
      onPointerMove={Platform.OS === 'web' ? (event) => {
        if (!active || reducedMotion || event.nativeEvent.pointerType === 'touch') return;
        const bounds = (event.currentTarget as unknown as { getBoundingClientRect(): { left: number; top: number; width: number; height: number } }).getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        tiltX.value = Math.max(-96, Math.min(96, ((event.nativeEvent.clientX - bounds.left) / bounds.width - 0.5) * 192));
        tiltY.value = Math.max(-96, Math.min(96, ((event.nativeEvent.clientY - bounds.top) / bounds.height - 0.5) * 192));
        engagement.value = 1;
      } : undefined}
      onPointerLeave={Platform.OS === 'web' ? settle : undefined}
    >
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <CardFinishOverlay resolution={resolution} tiltX={tiltX} tiltY={tiltY} engagement={engagement} reducedMotion={reducedMotion} isSlabbed={isSlabbed} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({ frame: { position: 'relative', overflow: 'hidden' } });
