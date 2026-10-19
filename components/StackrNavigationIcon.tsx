import React from 'react';
import Svg, { Path } from 'react-native-svg';

export const STACKR_ICON_OUTLINE = '#0B1739';
export const STACKR_ICON_STROKE_WIDTH = 1.7;

// Accent paths describe the object rather than adding decoration around it.
const drawings = {
  home: { outline: 'M3 10 12 3l9 7M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9', accent: 'M9 20v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6M10 9h4' },
  collection: { outline: 'M7 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM3 8h4M3 12h4M3 16h4', accent: 'M9 3v18M14 8h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z' },
  scan: { outline: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 7h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z', accent: 'M6 12h12' },
  market: { outline: 'M3 9 5 3h14l2 6H3ZM3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6', accent: 'M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5' },
  search: { outline: 'M12 3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h6M7 7h3', accent: 'M18.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-1.3 3.2L21 19' },
  inventory: { outline: 'M3 7 12 3l9 4v10l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v10', accent: 'M7.5 5l9 4v4' },
  listings: { outline: 'M3 4h8l10 10-7 7L3 10V4Z', accent: 'M7 7h.01M12 13l3 3' },
  discover: { outline: 'M9 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M6 9V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10M5 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z', accent: 'M7 13h4M7 17h4' },
  pokedex: { outline: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 17h6', accent: 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM16 6h.01' },
  duplicates: { outline: 'M8 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2M6 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z', accent: 'M8 11h4M8 15h4' },
  chase: { outline: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', accent: 'm12 7 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.5-3 1.5.6-3.2-2.4-2.3 3.3-.5L12 7Z' },
  favorite: { outline: 'M12 20 4.3 12.6a5 5 0 0 1 7.1-7.1l.6.6.6-.6a5 5 0 0 1 7.1 7.1L12 20Z', accent: 'm8 12 4 4 4-4' },
  info: { outline: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', accent: 'M12 7h.01M11 11h1v6M10 17h4' },
  notifications: { outline: 'M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3v-4ZM12 3V2.5', accent: 'M10 20a2 2 0 0 0 4 0' },
  profile: { outline: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2', accent: 'M8 20h8' },
  priceBuilder: { outline: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h8', accent: 'M8 17v-3M12 17v-5M16 17v-7' },
  marketMovers: { outline: 'M3 4v16h18', accent: 'm6 15 5-5 4 3 6-7M16 6h5v5' },
  protect: { outline: 'm12 3 8 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3Z', accent: 'm8 12 3 3 5-6' },
  social: { outline: 'M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2', accent: 'M18 4a3 3 0 0 1 0 6M20 13a4 4 0 0 1 2 3.5V19' },
  trade: { outline: 'M4 9V6a2 2 0 0 1 2-2h7M20 15v3a2 2 0 0 1-2 2h-7', accent: 'M3 14h14m-3-3 3 3-3 3M21 10H7m3-3-3 3 3 3' },
  inbound: { outline: 'M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M4 14h4l2 3h4l2-3h4', accent: 'M12 3v9m-4-4 4 4 4-4' },
  outbound: { outline: 'M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M4 14h4l2 3h4l2-3h4', accent: 'M12 12V3m-4 4 4-4 4 4' },
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
      <Path d={drawing.outline} fill="none" stroke={color} strokeWidth={STACKR_ICON_STROKE_WIDTH}
        strokeLinecap="round" strokeLinejoin="round" />
      <Path d={drawing.accent} fill="none" stroke={accentColor} strokeWidth={STACKR_ICON_STROKE_WIDTH}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
