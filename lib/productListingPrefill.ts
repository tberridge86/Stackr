export type ProductPrefillState = 'idle' | 'resolving' | 'resolved' | 'failed' | 'manual';
export const productPrefillBlocksPublication = (state: ProductPrefillState) => state === 'resolving' || state === 'failed';
export const resolveCanonicalProductPrefill = (requestedId: string, actualId?: string | null): ProductPrefillState => actualId === requestedId ? 'resolved' : 'failed';
