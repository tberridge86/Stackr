import { resolveCardHoloProfile } from './cardHoloProfile';

/** Compatibility helper; the renderer uses the full, mask-aware resolution. */
export function isFoilPreview(raw: unknown, selectedVariantId?: string | null): boolean {
  return resolveCardHoloProfile(raw, { selectedVariantId }).profile !== 'plain';
}

export function boundedCardTilt(value: number) {
  'worklet';
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

/** A small visual lift that remains inside the card preview's bounds. */
export function cardFloatOffset(value: number, maximum: number) {
  'worklet';
  return boundedCardTilt(value) * (Number.isFinite(maximum) ? Math.max(0, maximum) : 0);
}

/** Shared intensity for the lift, shadow and holographic treatment. */
export function cardMotionIntensity(x: number, y: number) {
  'worklet';
  return Math.min(1, Math.hypot(boundedCardTilt(x), boundedCardTilt(y)) / Math.SQRT2);
}

export function relativeCardTilt(value: number, origin: number) {
  'worklet';
  const delta = Math.atan2(Math.sin(value - origin), Math.cos(value - origin));
  return boundedCardTilt(delta / 0.48);
}

export function cardInspectionMotionEnabled(active: boolean, foreground: boolean, reduceMotion: boolean) {
  return active && foreground && !reduceMotion;
}

export function cardDragTilt(dx: number, dy: number) {
  'worklet';
  return { x: boundedCardTilt(dx / 140), y: boundedCardTilt(-dy / 180) };
}

export type CardSensorOrigin = { pitch: number; roll: number; interfaceOrientation: number };

/** Recalibrate after an interface rotation rather than interpreting it as tilt. */
export function calibratedCardSensor(reading: CardSensorOrigin, origin: CardSensorOrigin | null) {
  'worklet';
  if (!Number.isFinite(reading.pitch) || !Number.isFinite(reading.roll)) return null;
  if (!origin || origin.interfaceOrientation !== reading.interfaceOrientation) {
    return { origin: reading, x: 0, y: 0 };
  }
  return { origin, x: relativeCardTilt(reading.roll, origin.roll), y: relativeCardTilt(reading.pitch, origin.pitch) };
}
