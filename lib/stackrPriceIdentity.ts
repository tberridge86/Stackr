import type { StackrCard } from './stackrApiV1';
import { selectExactOwnedVariantId } from './homePriceRefreshCore';

export type StackrPriceVariantOptions = {
  variant?: string | null;
  finish?: string | null;
  edition?: string | null;
};

function editionHint(value: string | null | undefined) {
  const token = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return token === '1stedition' ? 'first_edition' : value;
}

/** Every supplied finish/edition must identify the same published variant.
 * A shared translated name never establishes a price identity. */
export function selectExactStackrPriceVariant(
  card: StackrCard,
  resolvedVariantId: string,
  reference: string,
  options: StackrPriceVariantOptions = {},
) {
  const hints = [options.variant, options.finish, editionHint(options.edition)]
    .map((value) => String(value ?? '').trim()).filter(Boolean);
  const explicit = card.variants.filter((variant) => (
    variant.variantId.toLowerCase() === reference.toLowerCase()
    || variant.canonicalId?.toLowerCase() === reference.toLowerCase()
  ));
  if (!hints.length) {
    if (explicit.length) return explicit.length === 1 ? explicit[0].variantId : null;
    return resolvedVariantId;
  }
  const candidates = explicit.length ? explicit : card.variants;
  const matches = candidates.filter((variant) => hints.every((hint) => (
    selectExactOwnedVariantId([variant], null, hint) === variant.variantId
  )));
  return matches.length === 1 ? matches[0].variantId : null;
}
