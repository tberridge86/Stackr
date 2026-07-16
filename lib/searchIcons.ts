import type React from 'react';
import { Ionicons } from '@expo/vector-icons';

export type SearchIconName = React.ComponentProps<typeof Ionicons>['name'];

export const searchIcons = {
  search: 'search-outline',
  community: 'people-outline',
  cards: 'albums-outline',
  sets: 'library-outline',
  sealed: 'cube-outline',
  graded: 'id-card-outline',
  collectors: 'people-outline',
  recent: 'time-outline',
  priceHistory: 'analytics-outline',
  listings: 'storefront-outline',
  owned: 'checkmark-circle-outline',
  missing: 'ellipse-outline',
  chase: 'heart-outline',
  save: 'bookmark-outline',
  binder: 'albums-outline',
  trade: 'swap-horizontal-outline',
  sell: 'bag-handle-outline',
  filter: 'options-outline',
  sort: 'swap-vertical-outline',
  clear: 'close-circle',
  retry: 'refresh-outline',
  offline: 'cloud-offline-outline',
  stale: 'alert-circle-outline',
} satisfies Record<string, SearchIconName>;
