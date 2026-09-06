import type { ImageSourcePropType } from 'react-native';
import {
  getJapaneseSetLogoSourceForSet,
  type JapaneseSetLogoLookupInput,
} from './japaneseSetLogos';
import { getMagazineSetCoverSourceForSet } from './magazineSetCovers';

/**
 * Local presentation artwork only. It never supplies card art, product images,
 * seller photographs, or a value intended for catalogue persistence.
 */
export function getLocalSetArtworkSourceForSet(
  input?: JapaneseSetLogoLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  return getMagazineSetCoverSourceForSet(input, fallbackLanguage)
    ?? getJapaneseSetLogoSourceForSet(input, fallbackLanguage);
}
