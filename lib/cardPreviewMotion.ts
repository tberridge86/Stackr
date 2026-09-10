/** Presentation only: never changes a card's stored finish or artwork. */
export function isFoilPreview(raw: any, selectedVariantId?: string | null): boolean {
  const canonical = raw?.stackr;
  const variants = Array.isArray(canonical?.variants) ? canonical.variants : [];
  const selected = variants.find((v: any) => v.variantId === (selectedVariantId ?? canonical?.defaultVariantId));
  const finish = String(selected?.finishCode ?? selected?.variantCode ?? raw?.finish_code ?? '').toLowerCase();
  if (finish) return !/non.?holo|non.?foil|normal|regular/.test(finish) && /holo|foil|reverse|prism|radiant/.test(finish);
  return /holo|foil|radiant/.test(String(raw?.rarity ?? '').toLowerCase());
}

export function boundedCardTilt(value: number) {
  'worklet';
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

export function relativeCardTilt(value: number, origin: number) {
  'worklet';
  const delta = Math.atan2(Math.sin(value - origin), Math.cos(value - origin));
  return boundedCardTilt(delta / 0.55);
}
