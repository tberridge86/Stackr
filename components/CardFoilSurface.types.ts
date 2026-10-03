import type { CardHoloProfile } from '../lib/cardHoloProfile';
import type { CardPreviewLight } from './InteractiveCardPreview';

export type CardFoilSurfaceProps = CardPreviewLight & {
  source: 'catalogue';
  /** URI that actually rendered, not merely the originally requested URL. */
  artworkUri?: string | null;
  width: number;
  height: number;
  profile: CardHoloProfile;
  onUnavailable?: () => void;
};
