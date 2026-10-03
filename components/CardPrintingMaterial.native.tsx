import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, ImageShader, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { containedMaterialRect, PRINTING_MAP_ROLES, type PrintingMaterial } from '../lib/cardPrintingMaterial';
import { CARD_PRINTING_MATERIAL_SHADER } from '../lib/cardPrintingMaterialShader';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';

type Props = CardFoilSurfaceProps & { material: PrintingMaterial; fallback: React.ReactNode };
type Loaded = { material: PrintingMaterial; images: SkImage[] };

/** Only mounted inside the existing single-card inspector, never in card lists. */
export default function CardPrintingMaterial({ material, fallback, width, height, x, y, onUnavailable }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const effect = useMemo(() => {
    try { return Skia.RuntimeEffect.Make(CARD_PRINTING_MATERIAL_SHADER); } catch { return null; }
  }, []);
  useEffect(() => { if (!effect) onUnavailable?.(); }, [effect, onUnavailable]);
  useEffect(() => {
    const images: SkImage[] = [];
    try {
      for (const role of PRINTING_MAP_ROLES) {
        const map = material.maps[role];
        const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(map.base64));
        if (!image) throw new Error('Printing material decode failed');
        images.push(image);
        if (image.width() !== map.width || image.height() !== map.height) throw new Error('Printing material dimension mismatch');
      }
      setLoaded({ material, images });
    } catch {
      // A bad optional material never hides the already loaded catalogue image.
      images.forEach(image => image.dispose());
      setLoaded(null);
      onUnavailable?.();
      return;
    }
    return () => { images.forEach(image => image.dispose()); };
  }, [material, onUnavailable]);
  const rect = containedMaterialRect(width, height, material.artwork.width, material.artwork.height);
  const uniforms = useDerivedValue(() => ({
    origin: [rect?.x ?? 0, rect?.y ?? 0], extent: [rect?.width ?? 1, rect?.height ?? 1],
    tilt: [Number.isFinite(x.value) ? x.value : 0, Number.isFinite(y.value) ? y.value : 0], gain: material.gain,
  }), [rect?.x, rect?.y, rect?.width, rect?.height, material.gain]);
  // A previous printing's asynchronously committed state is never rendered.
  if (!effect || !rect || !loaded || loaded.material !== material) return <>{fallback}</>;
  return <Canvas pointerEvents="none" accessible={false} colorSpace="srgb" style={StyleSheet.absoluteFill}>
    <Fill><Shader source={effect} uniforms={uniforms}>
      {loaded.images.map((image, index) => <ImageShader key={PRINTING_MAP_ROLES[index]} image={image}
        fit="fill" rect={rect} tx="clamp" ty="clamp" />)}
    </Shader></Fill>
  </Canvas>;
}
