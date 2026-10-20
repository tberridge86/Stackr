import type { ImageSourcePropType } from 'react-native';
import {
  getEnglishSetLogoSourceForSet,
  type EnglishSetLogoLookupInput,
} from './englishSetLogos';
import {
  getJapaneseSetLogoSourceForSet,
  type JapaneseSetLogoLookupInput,
} from './japaneseSetLogos';
import { getMagazineSetCoverSourceForSet } from './magazineSetCovers';
import { getSimplifiedChineseSetLogoSourceForSet } from './simplifiedChineseSetLogos';
import { getTraditionalChineseSetArtworkSourceForSet, getTraditionalChineseSetLogoSourceForSet } from './traditionalChineseSetLogos';

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
