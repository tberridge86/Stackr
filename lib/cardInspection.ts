/** The only entry contract for decorative catalogue inspection. */
export const CARD_INSPECTION_LONG_PRESS_MS = 400;

export type CardInspectionRequest = {
  source: 'catalogue' | 'condition-photo';
  card: { id: string; setId?: string | null; name?: string | null; language?: string | null; raw_data?: unknown };
  imageUri: string;
  fullImageUri?: string | null;
  selectedVariantId?: string | null;
  subtitle?: string;
  onQuickActions?: () => void;
  onDetails?: () => void;
};

export function canInspectCatalogueCard(request: CardInspectionRequest): boolean {
  return request?.source === 'catalogue'
    && typeof request.card?.id === 'string' && request.card.id.trim().length > 0
    && typeof request.imageUri === 'string' && request.imageUri.trim().length > 0;
}

/** Empty means an explicit selection could not be verified; never use default. */
export function showcaseVariantId(rawData: unknown, selection: {
  variant?: string | null; finish?: string | null; edition?: string | null;
} = {}): string {
  const stackr = (rawData as { stackr?: { defaultVariantId?: string; variants?: unknown[] } } | null)?.stackr;
  const variants = Array.isArray(stackr?.variants) ? stackr.variants : [];
  const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  const requestedVariant = normalize(selection.variant);
  const requestedFinish = normalize(selection.finish);
  const requestedEdition = normalize(selection.edition);
  const matches = variants.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const v = entry as Record<string, unknown>;
    if (typeof v.variantId !== 'string' || !v.variantId.trim()) return false;
    if (requestedVariant && ![v.variantId, v.variantCode].some(value => normalize(value) === requestedVariant)) return false;
    if (requestedFinish && normalize(v.finishCode) !== requestedFinish) return false;
    if (requestedEdition && normalize(v.editionCode ?? v.edition) !== requestedEdition) return false;
    return requestedVariant || requestedFinish || requestedEdition ? true : v.variantId === stackr?.defaultVariantId;
  }) as Array<{ variantId: string }>;
  return matches.length === 1 ? matches[0].variantId : '';
}
