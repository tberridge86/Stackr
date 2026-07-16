import type React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type MarketIconName = React.ComponentProps<typeof Ionicons>['name'];

export const marketIcons: Record<
  | 'market'
  | 'buy'
  | 'trade'
  | 'sell'
  | 'offer'
  | 'counterOffer'
  | 'saved'
  | 'search'
  | 'filter'
  | 'sort'
  | 'raw'
  | 'graded'
  | 'sealed'
  | 'delivery'
  | 'tracking'
  | 'protection'
  | 'verified'
  | 'priceHistory'
  | 'message'
  | 'report'
  | 'block'
  | 'share'
  | 'more'
  | 'success'
  | 'warning'
  | 'error'
  | 'retry',
  MarketIconName
> = {
  market: 'storefront-outline',
  buy: 'pricetag-outline',
  trade: 'swap-horizontal-outline',
  sell: 'bag-handle-outline',
  offer: 'chatbubbles-outline',
  counterOffer: 'git-compare-outline',
  saved: 'bookmark-outline',
  search: 'search-outline',
  filter: 'options-outline',
  sort: 'swap-vertical-outline',
  raw: 'albums-outline',
  graded: 'id-card-outline',
  sealed: 'cube-outline',
  delivery: 'mail-outline',
  tracking: 'navigate-outline',
  protection: 'shield-checkmark-outline',
  verified: 'checkmark-circle-outline',
  priceHistory: 'analytics-outline',
  message: 'chatbubble-ellipses-outline',
  report: 'flag-outline',
  block: 'ban-outline',
  share: 'share-outline',
  more: 'ellipsis-horizontal',
  success: 'checkmark-circle-outline',
  warning: 'alert-circle-outline',
  error: 'close-circle-outline',
  retry: 'refresh-outline',
};
