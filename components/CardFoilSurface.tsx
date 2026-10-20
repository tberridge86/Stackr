import React from 'react';
import type { CardFoilSurfaceProps } from './CardFoilSurface.types';

/**
 * Web has no reviewed map renderer. Stay visually truthful instead of showing
 * a CSS approximation that could be mistaken for the physical printing.
 */
export default function CardFoilSurface(_props: CardFoilSurfaceProps) { return null; }
