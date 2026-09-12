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

export type LocalSetArtworkLookupInput = EnglishSetLogoLookupInput & JapaneseSetLogoLookupInput;

/**
 * Local presentation artwork only. It never supplies card art, product images,
 * seller photographs, or a value intended for catalogue persistence.
 *
 * Resolution order is deliberate: exact magazine issues retain their cover,
 * reviewed English set identities use the canonical bundled logo, and native
 * Japanese sets retain the existing Japanese-only fallback.
 */
export function getLocalSetArtworkSourceForSet(
  input?: LocalSetArtworkLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  return getMagazineSetCoverSourceForSet(input, fallbackLanguage)
    ?? getEnglishSetLogoSourceForSet(input, fallbackLanguage)
    ?? getJapaneseSetLogoSourceForSet(input, fallbackLanguage);
}
