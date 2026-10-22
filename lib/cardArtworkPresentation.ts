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
/** Only explicit canonical ordinary classifications may use a printing face.
 * An ordinary variant may lack a separate finish, but default/unknown labels
 * do not establish a physical variant or finish.
 */
export function isOrdinaryPrintingFaceVariant(variant: { variantCode?: unknown; finishCode?: unknown }): boolean {
  return typeof variant.variantCode === 'string' && ordinaryFinishes.has(variant.variantCode)
    && (variant.finishCode == null || typeof variant.finishCode === 'string' && ordinaryFinishes.has(variant.finishCode));
}
const publicUrl = (value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value)
  ? enforceTcgdexRuntimeImagePolicy(value) ?? undefined : undefined;

function rendition(asset: StackrCatalogueAsset, roles: string[], minimumLongEdge = 0) {
  for (const role of roles) {
    const match = asset.derivatives?.find((item) => String(item.role ?? item.key ?? item.name ?? item.type ?? '').toLowerCase() === role
      && (!minimumLongEdge || (Number.isFinite(item.width) && Number.isFinite(item.height)
        && (item.width ?? 0) > 0 && (item.height ?? 0) > 0
        && Math.max(item.width ?? 0, item.height ?? 0) >= minimumLongEdge)));
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
  return isOrdinaryPrintingFaceVariant(selected) && isOrdinaryPrintingFaceVariant(source)
    && (!selected.artworkKey || !source.artworkKey || selected.artworkKey === source.artworkKey);
}

/** Read-time presentation only: never edits a variant, default ID or asset record. */
export function resolveCardArtwork(card: Pick<StackrCard, 'cardId' | 'game' | 'set' | 'defaultVariantId' | 'variants'> & Partial<StackrCard>, assets: StackrCatalogueAsset[] = [], selectedVariantId = card.defaultVariantId): CardArtworkPresentation {
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
    const explicitAlias = selected.sameArtworkAsVariantId === asset.variantId;
    // A narrowed API DTO can omit the sibling while retaining its approved
    // reference. Both source pointers and any embedded image must agree; this
    // does not allow special editions/finishes or bypass a present sibling's
    // artwork checks. The result remains shared artwork, never an exact photo.
    const approvedAbsentSibling = !source && Boolean(asset.variantId) && explicitAlias
      && selected.nativeImageStatus === 'same_artwork_reference'
      && selected.imageVariantId === asset.variantId
      && (!selected.image || selected.image.variantId === asset.variantId)
      && canShareFace(selected, selected);
    if (!exact && !printingFace && !approvedAbsentSibling && (!source || !canShareFace(selected, source))) return [];
    const original = publicUrl(asset.deliveryUrl);
    const small = rendition(asset, ['card-grid', 'grid', 'small', 'search-result', 'thumb']);
    const detail = rendition(asset, ['detail-page', 'detail', 'large']);
    const highResolutionDetail = rendition(asset, ['detail-page', 'detail', 'large'], 1000);
    const highResolutionOriginal = Number.isFinite(asset.width) && Number.isFinite(asset.height)
      && (asset.width ?? 0) > 0 && (asset.height ?? 0) > 0
      && Math.max(asset.width ?? 0, asset.height ?? 0) >= 1000 ? original : undefined;
    const large = highResolutionDetail ?? highResolutionOriginal ?? detail;
    const urls = [...new Set([small, large, detail, original].filter((url): url is string => Boolean(url)))];
    if (!urls.length) return [];
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

function artworkLanguage(value: unknown) {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (['ja', 'jp', 'japanese'].includes(language)) return 'ja';
  if (['ko', 'kr', 'korean'].includes(language)) return 'ko';
  if (['zh-cn', 'zh-hans', 'zhcn', 'cn', 'simplified-chinese', 'chinese-simplified'].includes(language)) return 'zh-cn';
  if (['zh', 'zh-tw', 'zh-hant', 'zhtw', 'tw', 'traditional-chinese', 'chinese'].includes(language)) return 'zh-tw';
  if (language === 'en' || language === 'english' || language.startsWith('en-')) return 'en';
  return null;
}

/** Revalidate cached rendition candidates against the canonical snapshot using
 * the shared artwork resolver. Presentation alone does not establish identity.
 * This performs no provider lookup and never constructs an image address.
 */
export function getApprovedArtworkFallbackUris({ cardId, language, rawData }: {
  cardId?: string | null;
  language?: string | null;
  rawData?: any;
}): string[] {
  const raw = rawData?.raw_data ?? rawData;
  const identity = raw?.stackr;
  const artwork = getCardArtworkPresentation(raw);
  const recordLanguage = artworkLanguage(raw?.language);
  const requestedLanguage = artworkLanguage(language ?? rawData?.language ?? raw?.language);
  if (!cardId || identity?.canonical !== true || raw?.id !== cardId || identity.cardId !== cardId
    || !recordLanguage || requestedLanguage !== recordLanguage || !raw?.set?.id
    || !artwork || artwork.selectedVariantId !== identity.defaultVariantId || !Array.isArray(identity.variants)) return [];
  const variants: StackrCardVariant[] = identity.variants
    .filter((variant: StackrCardVariant | null) => typeof variant?.variantId === 'string')
    .map((variant: StackrCardVariant) => {
      const asset = variant.image;
      const bound = asset?.cardId === cardId && asset.setId === raw.set.id && (!asset.game || asset.game === 'pokemon');
      return { ...variant, image: bound ? { ...asset,
        derivatives: Array.isArray(asset.derivatives) ? asset.derivatives.filter((item) => item && typeof item === 'object') : [],
      } : null };
    });
  if (new Set(variants.map((variant) => variant.variantId)).size !== variants.length
    || !variants.some((variant) => variant.variantId === identity.defaultVariantId)) return [];
  const approved = resolveCardArtwork({ cardId, game: 'pokemon', defaultVariantId: identity.defaultVariantId, variants,
    set: { setId: raw.set.id, setCode: null, nativeName: null, englishDisplayName: null } });
  const binding = (candidate: CardArtworkCandidate) => JSON.stringify([candidate.uri, candidate.kind, candidate.assetId, candidate.sourceVariantId]);
  const approvedBindings = new Set(approved.candidates.map(binding));
  return [...new Set(artwork.candidates.flatMap((candidate) => {
    return candidate && approvedBindings.has(binding(candidate)) ? [candidate.uri] : [];
  }))];
}
