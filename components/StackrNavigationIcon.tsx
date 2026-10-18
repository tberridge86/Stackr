import React from 'react';
import Svg, { Path } from 'react-native-svg';

export const STACKR_ICON_OUTLINE = '#0B1739';

// Accent paths describe the object rather than adding decoration around it.
const drawings = {
  home: { outline: 'M3 10 12 3l9 7M5 9v11h14V9', accent: 'M9 20v-7h6v7M10 10h4' },
  collection: { outline: 'M7 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 8h4M3 12h4M3 16h4', accent: 'M9 3v18M13 8h4v6h-4Z' },
  scan: { outline: 'M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3M8 7h8v10H8Z', accent: 'M6 12h12' },
  market: { outline: 'M3 9 5 3h14l2 6H3ZM3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9M5 13v8h14v-8', accent: 'M9 21v-6h6v6' },
  search: { outline: 'M12 3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6M8 7h3', accent: 'M19 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-1.5 3.5L21 20' },
  inventory: { outline: 'M3 7 12 3l9 4v10l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v10', accent: 'M7.5 5l9 4v4' },
  listings: { outline: 'M3 4h8l10 10-7 7L3 10V4Z', accent: 'M7 7h.01M12 13l3 3' },
  discover: { outline: 'M9 6V4a1 1 0 0 1 1-1h9a2 2 0 0 1 2 2v10M6 9V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v11M4 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z', accent: 'M7 13h4M7 17h4' },
  pokedex: { outline: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 17h6', accent: 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM16 6h.01' },
  duplicates: { outline: 'M8 6V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-2M5 6h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', accent: 'M8 11h4M8 15h4' },
  chase: { outline: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', accent: 'm12 7 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.5-3 1.5.6-3.2-2.4-2.3 3.3-.5L12 7Z' },
  favorite: { outline: 'M12 20 4.3 12.6a5 5 0 0 1 7.1-7.1l.6.6.6-.6a5 5 0 0 1 7.1 7.1L12 20Z', accent: 'm8 12 4 4 4-4' },
  info: { outline: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', accent: 'M12 7h.01M11 11h1v6M10 17h4' },
  notifications: { outline: 'M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3v-4ZM12 3V2.5', accent: 'M10 20a2 2 0 0 0 4 0' },
  profile: { outline: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2', accent: 'M8 20h8' },
  priceBuilder: { outline: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h8', accent: 'M8 17v-3M12 17v-5M16 17v-7' },
  marketMovers: { outline: 'M3 4v16h18', accent: 'm6 15 5-5 4 3 6-7M16 6h5v5' },
  protect: { outline: 'm12 3 8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3Z', accent: 'm8 12 3 3 5-6' },
  social: { outline: 'M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2', accent: 'M18 4a3 3 0 0 1 0 6M20 13a4 4 0 0 1 2 3.5V19' },
  trade: { outline: 'M4 9V5a1 1 0 0 1 1-1h8M20 15v4a1 1 0 0 1-1 1h-8', accent: 'M3 14h14m-3-3 3 3-3 3M21 10H7m3-3-3 3 3 3' },
  inbound: { outline: 'M4 9v11h16V9M4 14h5l1 3h4l1-3h5', accent: 'M12 3v9m-4-4 4 4 4-4' },
  outbound: { outline: 'M4 9v11h16V9M4 14h5l1 3h4l1-3h5', accent: 'M12 12V3m-4 4 4-4 4 4' },
} as const;

const aliases = {
  binders: 'collection', hub: 'home', marketplace: 'market', scanCard: 'scan',
  searchCard: 'search', sellCard: 'listings', sellerMode: 'inventory',
  setDiscovery: 'discover', stock: 'priceBuilder',
} as const;

export type StackrNavigationIconName = keyof typeof drawings | keyof typeof aliases;

export function StackrNavigationIcon({ name, color, size = 28, accentColor = color }: {
  name: StackrNavigationIconName;
  color: string;
  size?: number;
  accentColor?: string;
}) {
  const key = name in aliases ? aliases[name as keyof typeof aliases] : name as keyof typeof drawings;
  const drawing = drawings[key];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={drawing.outline} fill="none" stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" />
      <Path d={drawing.accent} fill="none" stroke={accentColor} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
