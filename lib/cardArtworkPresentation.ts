import type { StackrCard, StackrCardVariant, StackrCatalogueAsset } from './stackrApiV1';
import { enforceTcgdexRuntimeImagePolicy } from './tcgdexControlledCardReference';

export type CardArtworkCandidate = { uri: string; kind: 'exact' | 'shared'; assetId: string; sourceVariantId: string | null };
export type CardArtworkPresentation = {
  kind: 'exact' | 'shared' | 'missing';
  selectedVariantId: string;
  sourceVariantId: string | null;
  assetId: string | null;
  small?: string;
  large?: string;
  candidates: CardArtworkCandidate[];
};
const ordinaryFinishes = new Set(['normal', 'holo', 'reverse_holo']);
const publicUrl = (value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value)
  ? enforceTcgdexRuntimeImagePolicy(value) ?? undefined : undefined;

function rendition(asset: StackrCatalogueAsset, roles: string[]) {
  for (const role of roles) {
    const match = asset.derivatives?.find((item) => String(item.role ?? item.key ?? item.name ?? item.type ?? '').toLowerCase() === role);
    const url = publicUrl(match?.deliveryUrl ?? match?.url);
    if (url) return url;
  }
  return undefined;
}

/** A printing UUID scopes language/release/illustration. Only ordinary finishes
 * may implicitly share its face. Stamps, editions and special patterns require
 * their own artwork; equal numbers, names or image filenames are never evidence.
 */
function canShareFace(selected: StackrCardVariant, source: StackrCardVariant) {
  return ordinaryFinishes.has(selected.variantCode) && ordinaryFinishes.has(source.variantCode)
    && (!selected.finishCode || ordinaryFinishes.has(selected.finishCode))
    && (!source.finishCode || ordinaryFinishes.has(source.finishCode))
    && (!selected.artworkKey || !source.artworkKey || selected.artworkKey === source.artworkKey);
}

/** Read-time presentation only: never edits a variant, default ID or asset record. */
export function resolveCardArtwork(card: StackrCard, assets: StackrCatalogueAsset[] = [], selectedVariantId = card.defaultVariantId): CardArtworkPresentation {
  const selected = card.variants.find((v) => v.variantId === selectedVariantId);
  const result: CardArtworkPresentation = { kind: 'missing', selectedVariantId, sourceVariantId: null, assetId: null, candidates: [] };
  if (!selected) return result;
  const sources = [...card.variants.flatMap((v) => v.image ? [v.image] : []), ...assets];
  const ranked = sources.flatMap((asset) => {
    if (asset.assetType !== 'card_image' || asset.permissionStatus !== 'approved' || asset.unavailableReason
      || (asset.game && asset.game !== card.game) || (asset.setId && asset.setId !== card.set.setId)
      || (asset.cardId && asset.cardId !== card.cardId)) return [];
    const source = card.variants.find((v) => v.variantId === asset.variantId);
    const exact = asset.variantId === selectedVariantId;
    const printingFace = !asset.variantId && asset.cardId === card.cardId && canShareFace(selected, selected);
    if (!exact && !printingFace && (!source || !canShareFace(selected, source))) return [];
    const original = publicUrl(asset.deliveryUrl);
    const small = rendition(asset, ['card-grid', 'grid', 'small', 'search-result', 'thumb']);
    const large = rendition(asset, ['detail-page', 'detail', 'large']);
    const urls = [...new Set([small, large, original].filter((url): url is string => Boolean(url)))];
    if (!urls.length) return [];
    const explicitAlias = selected.sameArtworkAsVariantId === asset.variantId;
    return [{ asset, small: small ?? large ?? original, large: large ?? original ?? small, urls,
      rank: exact ? 0 : explicitAlias ? 1 : printingFace ? 2 : 3, kind: exact ? 'exact' as const : 'shared' as const }];
  }).sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>();
  for (const item of ranked) {
    if (!result.assetId) Object.assign(result, { kind: item.kind, assetId: item.asset.assetId,
      sourceVariantId: item.asset.variantId, small: item.small, large: item.large });
    for (const uri of item.urls) {
      if (seen.has(uri)) continue;
      seen.add(uri);
      result.candidates.push({ uri, kind: item.kind, assetId: item.asset.assetId, sourceVariantId: item.asset.variantId });
    }
  }
  return result;
}

export function getCardArtworkPresentation(card: any): CardArtworkPresentation | undefined {
  const artwork = card?.raw_data?.presentation?.artwork ?? card?.presentation?.artwork;
  return artwork && Array.isArray(artwork.candidates) ? artwork : undefined;
}
