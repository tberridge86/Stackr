import type { StackrApiClient, StackrCard } from './stackrApiV1';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from './optionalCatalogueEnrichment';

type ArtworkReassignment = {
  assetId: string;
  previousVariantId: string | null;
  variantId: string;
  previousImageUrls: string[];
};
// Positive read-time evidence is never persisted or inferred from an empty page.
const artworkReassignments = new WeakMap<object, readonly ArtworkReassignment[]>();
type PreviousArtworkObservation = { selectedVariantId: string; assetId: string; variantId: string; previousImageUrls: string[] };
const previousArtworkObservations = new WeakMap<object, readonly PreviousArtworkObservation[]>();
/** Called only after saved canonical identity has matched current public facts.
 * This is a prior observation, never permission to display or clear an image. */
export function rememberPreferredSetArtworkObservation(card: StackrCard, artwork: any) {
  if (!artwork || !['exact', 'shared'].includes(artwork.kind) || artwork.selectedVariantId !== card.defaultVariantId
    || typeof artwork.assetId !== 'string' || !artwork.assetId
    || !card.variants.some(variant => variant.variantId === artwork.sourceVariantId)) return;
  const urls = [artwork.small, artwork.large, ...(Array.isArray(artwork.candidates) ? artwork.candidates
    .filter((candidate: any) => candidate.assetId === artwork.assetId && candidate.sourceVariantId === artwork.sourceVariantId)
    .map((candidate: any) => candidate.uri) : [])].filter((url): url is string => typeof url === 'string' && Boolean(url));
  previousArtworkObservations.set(card, [{ selectedVariantId: card.defaultVariantId, assetId: artwork.assetId,
    variantId: artwork.sourceVariantId, previousImageUrls: urls }]);
}
export const getPreferredSetArtworkReassignments = (value?: object | null) => (
  value ? artworkReassignments.get(value) ?? [] : []
);
export function copyPreferredSetArtworkReassignments(source: object, target: object) {
  const evidence = artworkReassignments.get(source);
  if (evidence) artworkReassignments.set(target, evidence);
}

function sameScope(left: StackrCard, right: StackrCard) {
  return left.game === right.game && left.set.setId === right.set.setId
    && left.languageCode === right.languageCode && left.catalogueVersionId === right.catalogueVersionId;
}

function approvedImage(card: StackrCard, image: StackrCard['variants'][number]['image']) {
  return image?.assetId && image.assetType === 'card_image' && image.permissionStatus === 'approved'
    && !image.unavailableReason && (!image.game || image.game === card.game)
    && (!image.setId || image.setId === card.set.setId) && (!image.cardId || image.cardId === card.cardId);
}

// Stream a modest page instead of waiting for a whole set's image manifest.
// Pagination counts variants, and incoming pages may split one printing.
export const PREFERRED_ARTWORK_PAGE_SIZE = 96;

/** Copy images only: a refresh must never change the facts/edition already on screen. */
export function mergePreferredSetArtwork(facts: StackrCard[], incoming: StackrCard[]): StackrCard[] {
  // A page can contain several rows for a printing (one per default finish).
  // Do not let the last row discard artwork supplied by its siblings.
  const byId = new Map<string, StackrCard[]>();
  const verified = incoming.flatMap(display => {
    const fact = facts.find(card => card.cardId === display.cardId && sameScope(card, display)
      && card.collectorNumber.value === display.collectorNumber.value);
    if (!fact) return [];
    const variants = display.variants.filter(candidate => {
      const known = fact.variants.find(variant => variant.variantId === candidate.variantId);
      const image = candidate.image;
      if (!known || known.canonicalId !== candidate.canonicalId || known.imageVariantId !== candidate.imageVariantId
        || !approvedImage(display, image) || !image) return false;
      if (image.variantId ? ![candidate.variantId, candidate.imageVariantId, candidate.sameArtworkAsVariantId].includes(image.variantId)
        : image.cardId !== display.cardId) return false;
      return !fact.variants.some(variant => variant.image?.assetId === image.assetId
        && variant.image.contentSha256 && image.contentSha256 && variant.image.contentSha256 !== image.contentSha256);
    });
    const valid = { ...display, variants };
    byId.set(display.cardId, [...(byId.get(display.cardId) ?? []), valid]);
    return variants.flatMap(variant => variant.image?.cardId === display.cardId
      && variant.image.variantId === variant.variantId ? [{ card: display, image: variant.image }] : []);
  });
  return facts.map((card) => {
    const displays = byId.get(card.cardId) ?? [];
    const evidence = getPreferredSetArtworkReassignments(card).filter(previous => !verified.some(({ card: target, image }) => (
      sameScope(card, target) && image.assetId === previous.assetId && image.variantId !== previous.variantId
    )));
    let changed = false;
    const variants = card.variants.map((variant) => {
      const imageVariant = displays.flatMap((display) => display.variants).find((candidate) => candidate.image
        && candidate.variantId === variant.variantId && candidate.canonicalId === variant.canonicalId
        && candidate.imageVariantId === variant.imageVariantId);
      const previous = variant.image;
      const observations = [...(previous ? [{ assetId: previous.assetId, variantId: previous.variantId,
        contentSha256: previous.contentSha256, previousImageUrls: [previous.deliveryUrl,
          ...(previous.derivatives ?? []).map(derivative => derivative.deliveryUrl ?? derivative.url)]
          .filter((url): url is string => typeof url === 'string' && Boolean(url)) }] : []),
      ...(previousArtworkObservations.get(card) ?? []).filter(observation => observation.selectedVariantId === variant.variantId)];
      let stale = false;
      for (const observation of observations) {
        const reassigned = card.catalogueVersionId && verified.find(({ card: target, image }) => (
          sameScope(card, target) && image.assetId === observation.assetId
          && (!('contentSha256' in observation) || !observation.contentSha256 || !image.contentSha256 || observation.contentSha256 === image.contentSha256)
          && (target.cardId !== card.cardId || image.variantId !== observation.variantId)
        ));
        if (!reassigned) continue;
        stale = stale || (previous?.assetId === observation.assetId && previous.variantId === observation.variantId);
        if (!evidence.some(item => item.assetId === observation.assetId && item.previousVariantId === observation.variantId
          && item.variantId === reassigned.image.variantId)) {
          evidence.push({ assetId: observation.assetId, previousVariantId: observation.variantId,
            variantId: reassigned.image.variantId!, previousImageUrls: observation.previousImageUrls });
          changed = true;
        }
      }
      const image = imageVariant?.image ?? (stale ? null : previous);
      if (image === previous) return variant;
      changed = true;
      return { ...variant, image };
    });
    if (!changed) return card;
    const result = { ...card, variants };
    if (evidence.length) artworkReassignments.set(result, evidence);
    const observations = previousArtworkObservations.get(card);
    if (observations) previousArtworkObservations.set(result, observations);
    return result;
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
  const maxPages = Math.ceil(facts.reduce((count, card) => count + card.variants.length, 0) / PREFERRED_ARTWORK_PAGE_SIZE) + 1;
  for (let page = 0; page < maxPages; page++) {
    throwIfOptionalCatalogueReadAborted(signal);
    const response = await readOptionalCatalogueEnrichment((pageSignal) => client.setCards(
      facts[0].set.setId, { language: facts[0].languageCode, cursor, limit: PREFERRED_ARTWORK_PAGE_SIZE, includeAssets: true },
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
