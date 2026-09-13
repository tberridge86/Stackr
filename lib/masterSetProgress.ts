import { getCatalogueVariantKeys } from './catalogueVariantPresentation';

/**
 * Master-set progress only expands a printing into finishes when the canonical
 * catalogue supplies those finish identities. Provider price keys are pricing
 * metadata, not evidence that an additional collection slot exists.
 */
export function getCanonicalMasterSetVariants(
  card: { raw_data?: Record<string, any> | null } | null | undefined,
): string[] | null {
  const variants = getCatalogueVariantKeys(card);
  return variants && variants.length > 1 ? variants : null;
}

export function getCanonicalMasterSetSlotCount(
  card: { raw_data?: Record<string, any> | null } | null | undefined,
): number {
  return getCanonicalMasterSetVariants(card)?.length ?? 1;
}
