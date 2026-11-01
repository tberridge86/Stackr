import type { ImageSourcePropType } from 'react-native';
import {
  getEnglishSetLogoSourceForSet,
  type EnglishSetLogoLookupInput,
} from './englishSetLogos';
import {
  getJapaneseSetLogoMatchForSet,
  getJapaneseSetLogoSourceForSet,
  type JapaneseSetLogoLookupInput,
} from './japaneseSetLogos';
import { getMagazineSetCoverSourceForSet } from './magazineSetCovers';
import { getSimplifiedChineseSetLogoSourceForSet } from './simplifiedChineseSetLogos';
import { getTraditionalChineseSetArtworkSourceForSet, getTraditionalChineseSetLogoSourceForSet } from './traditionalChineseSetLogos';
import { enforceSetVisualRuntimePolicy } from './providerSetMarkRuntimePolicy';

export type LocalSetArtworkLookupInput = EnglishSetLogoLookupInput & JapaneseSetLogoLookupInput;

/**
 * Local presentation artwork only. It never supplies card art, product images,
 * seller photographs, or a value intended for catalogue persistence.
 *
 * Resolution order is deliberate: exact magazine issues retain their cover,
 * reviewed English set identities use the canonical bundled logo, and native
 * Japanese sets retain the existing Japanese-only fallback. Reviewed Chinese
 * marks and native pack artwork retain their exact language and set identity.
 */
export function getLocalSetArtworkSourceForSet(
  input?: LocalSetArtworkLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  return getMagazineSetCoverSourceForSet(input, fallbackLanguage)
    ?? getEnglishSetLogoSourceForSet(input, fallbackLanguage)
    ?? getJapaneseSetLogoSourceForSet(input, fallbackLanguage)
    ?? getSimplifiedChineseSetLogoSourceForSet(input, fallbackLanguage)
    ?? getTraditionalChineseSetArtworkSourceForSet(input, fallbackLanguage);
}

/** Logo/mark-only resolver. Magazine issue covers are deliberately excluded so
 * a full portrait cover is never squeezed into a tiny set-logo slot. */
export function getLocalSetLogoSourceForSet(
  input?: LocalSetArtworkLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  return getEnglishSetLogoSourceForSet(input, fallbackLanguage)
    ?? getJapaneseSetLogoSourceForSet(input, fallbackLanguage)
    ?? getSimplifiedChineseSetLogoSourceForSet(input, fallbackLanguage)
    ?? getTraditionalChineseSetLogoSourceForSet(input, fallbackLanguage);
}

/** Exact canonical aliases for the reviewed PR203 bundled crops. These remain
 * absence/failure fallbacks; approved published delivery has primary priority. */
const REVIEWED_JAPANESE_CROP_FALLBACK_IDS: Record<string, string> = {
  'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27': 'l1b',
  '7dbeff79-cfb7-4ac8-8a4f-d7c73a523349': 'll',
};

/** Shared binder presentation policy. Current exact-set published mapping wins
 * over a saved pointer; local artwork recovers absent/failed remote delivery.
 * Callers supply the existing environment-scoped canonical lookup, not a new
 * host or inferred URL. Magazine covers keep their distinct presentation.
 * This never changes catalogue or saved metadata. */
export function getSetArtworkPresentation(
  input: LocalSetArtworkLookupInput,
  options: {
    publishedUrl?: string | null;
    savedUrl?: string | null;
    fallbackSource?: ImageSourcePropType | null;
    failedUrl?: string | null;
    failedSource?: ImageSourcePropType | null;
  } = {},
): { source: ImageSourcePropType | null; url: string | null } {
  const identity = String(input.id ?? input.setId ?? input.sourceId ?? '').trim().replace(/^(ja|jp):/i, '').toLowerCase();
  const canonicalIdentity = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identity);
  const cropCode = REVIEWED_JAPANESE_CROP_FALLBACK_IDS[identity];
  const japanese = getJapaneseSetLogoMatchForSet(cropCode
    ? { id: `ja:${cropCode}`, language: input.language }
    : input);
  const reviewedCrop = japanese && (japanese.key === 'l1b' || japanese.key === 'll') ? japanese.source : null;
  // A stale display name/code must not reintroduce another canonical set's crop
  // through either the generic local resolver or a caller-provided logo fallback.
  const conflictingCrop = canonicalIdentity && !cropCode ? reviewedCrop : null;
  const reviewedCropFallback = conflictingCrop ? null : reviewedCrop;
  const magazine = getMagazineSetCoverSourceForSet(input);
  const fallbackSource = options.fallbackSource ?? getLocalSetArtworkSourceForSet(input);
  const safeFallback = conflictingCrop && fallbackSource === conflictingCrop ? null : fallbackSource;
  const source = magazine ?? reviewedCropFallback ?? safeFallback;
  const availableSource = source && source !== options.failedSource ? source : null;
  const url = enforceSetVisualRuntimePolicy(options.publishedUrl)
    ?? enforceSetVisualRuntimePolicy(options.savedUrl)
    ?? null;
  if (magazine || !url || url === options.failedUrl) {
    return { source: availableSource, url: null };
  }
  return { source: null, url };
}
