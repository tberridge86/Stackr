import type { CardHoloProfile } from '../lib/cardHoloProfile';
import type { CardPreviewLight } from './InteractiveCardPreview';

export type CardFoilSurfaceProps = CardPreviewLight & {
  source: 'catalogue';
  width: number;
  height: number;
  profile: CardHoloProfile;
  onUnavailable?: () => void;
};
