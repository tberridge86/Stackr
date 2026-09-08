/** Existing collection keys stay stable while canonical catalogue finishes drive the UI. */
const COLLECTION_VARIANT_KEYS: Record<string, string> = {
  holo: 'holofoil',
  reverse_holo: 'reverseHolofoil',
  poke_ball: 'reverseHoloPokeball',
  master_ball: 'masterBallPatternHolofoil',
};

export function getCatalogueVariantKeys(card: { raw_data?: Record<string, any> | null } | null | undefined): string[] | null {
  const catalogue = card?.raw_data?.stackr;
  if (!catalogue?.canonical || !Array.isArray(catalogue.variants)) return null;
  const keys = catalogue.variants.flatMap((variant: any) => {
    const code = typeof variant.variantCode === 'string' ? variant.variantCode.trim() : '';
    return code && variant.variantId ? [COLLECTION_VARIANT_KEYS[code] ?? code] : [];
  });
  // Missing canonical finish information must never be invented from price keys.
  return [...new Set<string>(keys)];
}

export function catalogueVariantLabel(key: string) {
  const labels: Record<string, string> = {
    normal: 'Normal', holofoil: 'Holo', reverseHolofoil: 'Reverse Holo',
    reverseHoloPokeball: 'Poké Ball', master_ball: 'Master Ball', masterBallPatternHolofoil: 'Master Ball',
    first_edition: 'First edition', unclassified: 'Finish unclassified',
  };
  if (labels[key]) return labels[key];
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(key)) return 'Finish translation pending';
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
