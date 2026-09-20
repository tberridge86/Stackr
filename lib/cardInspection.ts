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
