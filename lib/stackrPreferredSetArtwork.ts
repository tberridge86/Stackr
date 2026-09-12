import type { StackrApiClient, StackrCard } from './stackrApiV1';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from './optionalCatalogueEnrichment';

/** Copy images only: a refresh must never change the facts/edition already on screen. */
export function mergePreferredSetArtwork(facts: StackrCard[], incoming: StackrCard[]): StackrCard[] {
  const byId = new Map(incoming.map((card) => [card.cardId, card]));
  return facts.map((card) => {
    const display = byId.get(card.cardId);
    if (!display || display.set.setId !== card.set.setId || display.languageCode !== card.languageCode
      || display.catalogueVersionId !== card.catalogueVersionId || display.collectorNumber.value !== card.collectorNumber.value) return card;
    const variants = new Map(display.variants.map((variant) => [variant.variantId, variant]));
    return { ...card, variants: card.variants.map((variant) => {
      const imageVariant = variants.get(variant.variantId);
      return imageVariant?.image && imageVariant.canonicalId === variant.canonicalId
        && imageVariant.imageVariantId === variant.imageVariantId
        ? { ...variant, image: imageVariant.image } : variant;
    }) };
  });
}

/** The set-card endpoint selects preferred images on the server; no full asset-manifest download. */
export async function readPreferredSetArtwork(
  facts: StackrCard[],
  client: Pick<StackrApiClient, 'setCards'>,
  signal?: AbortSignal,
  onProgress?: (cards: StackrCard[]) => void,
): Promise<StackrCard[]> {
  if (!facts.length) return facts;
  let result = facts;
  let cursor: string | null = null;
  const visited = new Set<string>();
  // Pagination is over variants, so a printing/default variant can span pages.
  // Bound work by the already-validated complete facts, not an arbitrary card count.
  const maxPages = Math.ceil(facts.reduce((count, card) => count + card.variants.length, 0) / 500) + 1;
  for (let page = 0; page < maxPages; page++) {
    throwIfOptionalCatalogueReadAborted(signal);
    const response = await readOptionalCatalogueEnrichment((pageSignal) => client.setCards(
      facts[0].set.setId, { language: facts[0].languageCode, cursor, limit: 500, includeAssets: true },
      { signal: pageSignal },
    ), signal, 7000);
    if (!response) break;
    result = mergePreferredSetArtwork(result, response.data.cards);
    throwIfOptionalCatalogueReadAborted(signal);
    onProgress?.(result);
    cursor = response.meta.pagination?.nextCursor ?? null;
    if (!cursor || visited.has(cursor)) break;
    visited.add(cursor);
  }
  return result;
}
