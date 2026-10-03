import React, { useMemo } from 'react';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';
import CardPrintingMaterial from './CardPrintingMaterial.native';
import { resolvePrintingMaterial } from '../lib/cardPrintingMaterial';
import { REVIEWED_PRINTING_MATERIALS } from '../lib/cardPrintingMaterialRegistry';

/**
 * Native inspection is fail-closed: only an exact, reference-reviewed material
 * pack may alter catalogue pixels. Known finish metadata without a verified pack
 * is not permission to draw a generic foil, spotlight, rainbow or texture.
 */
export default function CardFoilSurface(props: CardFoilSurfaceProps) {
  const material = useMemo(() => props.source === 'catalogue'
    ? resolvePrintingMaterial(props.profile, props.artworkUri, REVIEWED_PRINTING_MATERIALS)
    : null, [props.source, props.profile, props.artworkUri]);
  if (props.source !== 'catalogue' || !material) return null;
  return <CardPrintingMaterial {...props} material={material} fallback={null} />;
}
