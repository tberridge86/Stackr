import type { CardHoloProfile } from '../lib/cardHoloProfile';
import type { CardPreviewLight } from './InteractiveCardPreview';

export type CardFoilSurfaceProps = CardPreviewLight & {
  source: 'catalogue';
  /** Exact artwork source selected by the inspector, never a seller capture. */
  artworkUri?: string | null;
  width: number;
  height: number;
  profile: CardHoloProfile;
  onUnavailable?: () => void;
};
