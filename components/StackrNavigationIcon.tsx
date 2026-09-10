import React from 'react';
import Svg, { Path } from 'react-native-svg';

// One grid and stroke weight for the persistent navigation. The brand mark
// and illustrated action assets retain their separate roles elsewhere.
const paths = {
  home: 'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
  collection: 'M7 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 3v18M3 8h4M3 16h4M13 8h4v6h-4Z',
  scan: 'M3 8V4a1 1 0 0 1 1-1h4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4M8 7h8v10H8ZM2 12h20',
  market: 'M3 9 5 3h14l2 6M3 9v1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9m0 1a3 3 0 0 0 6 0V9H3M5 13v8h14v-8M9 21v-6h6v6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.5 4.5L21 21',
  inventory: 'M3 7 12 3l9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7.5 5l9 4',
  listings: 'M3 4h8l10 10-7 7L3 10V4Zm4 3h.01',
} as const;

export type StackrNavigationIconName = keyof typeof paths;

export function StackrNavigationIcon({ name, color, size = 28 }: {
  name: StackrNavigationIconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={paths[name]} fill="none" stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
