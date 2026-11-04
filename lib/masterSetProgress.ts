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

export type BinderProgressEntry = {
  card?: { raw_data?: Record<string, any> | null } | null;
  owned: boolean;
  /** Positive quantities for this exact printing only. */
  ownedVariants: readonly string[];
  variantManaged?: boolean;
};

/** Quantities count once per printing/finish, and prices never create slots. */
export function countBinderProgressSlots(entries: readonly BinderProgressEntry[], masterSetEnabled: boolean) {
  let owned = 0;
  let total = 0;
  for (const entry of entries) {
    const variants = masterSetEnabled ? getCanonicalMasterSetVariants(entry.card) : null;
    total += variants?.length ?? 1;
    if (!variants) {
      if (entry.owned || entry.ownedVariants.length > 0) owned += 1;
      continue;
    }
    const ownedFinishes = variants.filter((variant) => entry.ownedVariants.includes(variant)).length;
    owned += ownedFinishes || (entry.owned && !entry.variantManaged ? 1 : 0);
  }
  return { owned, total };
}
