import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { CARD_FOIL_MODES, CARD_FOIL_SHADER } from '../lib/cardFoilShader';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';

function CatalogueMaterial({ x, y, width, height, profile, onUnavailable }: CardFoilSurfaceProps) {
  const effect = useMemo(() => {
    try { return Skia.RuntimeEffect.Make(CARD_FOIL_SHADER); } catch { return null; }
  }, []);
  useEffect(() => { if (!effect) onUnavailable?.(); }, [effect, onUnavailable]);
  const { material, mask } = profile;
  const regions = useMemo(() => Array.from({ length: 4 }, (_, i) => {
    const r = mask.regions?.[i];
    return r ? [r.x, r.y, r.width, r.height] : [0, 0, 0, 0];
  }), [mask]);
  const maskKind = mask.kind === 'full' ? 1 : mask.kind === 'outside-artwork' ? 3 : mask.kind === 'none' ? 0 : 2;
  const uniforms = useDerivedValue(() => ({
    size: [width, height], tilt: [x.value, y.value],
    mode: CARD_FOIL_MODES[profile.profile], foil: material.foilStrength,
    specular: material.specularStrength, texture: material.textureStrength,
    patternScale: material.patternScale, maskKind,
    regionCount: Math.min(4, mask.regions?.length ?? 0), regions,
  }), [width, height, profile, material, mask, maskKind, regions]);
  if (!effect) return null;
  // The native compositor combines the cached Expo artwork with this transparent
  // premultiplied material. Keeping the base outside Skia avoids a second image
  // decode/download and preserves the image's existing cache and rights policy.
  return <Canvas pointerEvents="none" accessible={false} colorSpace="srgb" style={StyleSheet.absoluteFill}>
    <Fill><Shader source={effect} uniforms={uniforms} /></Fill>
  </Canvas>;
}

export default function CardFoilSurface(props: CardFoilSurfaceProps) {
  // Defence in depth for untyped callers: condition evidence never reaches Skia.
  return props.source === 'catalogue' ? <CatalogueMaterial {...props} /> : null;
}
