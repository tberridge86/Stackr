import type { ImageSourcePropType } from 'react-native';

// Owner-supplied covers are bundled for offline use on the phone.
// Issue keys preserve the exact publication and printed cover month.
const covers: Record<string, () => ImageSourcePropType> = {
  'monthly:1996-11': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1996-11-CoroCoro-Comic.png'),
  'monthly:1997-02': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-02-CoroCoro-Comic.png'),
  'monthly:1997-06': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-06-CoroCoro-Comic.png'),
  'monthly:1997-07': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-07-CoroCoro-Comic.png'),
  'monthly:1997-09': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-09-CoroCoro-Comic.png'),
  'monthly:1997-10': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-10-CoroCoro-Comic.png'),
  'monthly:1997-11': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1997-11-CoroCoro-Comic.png'),
  'monthly:1998-01': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-01-CoroCoro-Comic.png'),
  'monthly:1998-03': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-03-CoroCoro-Comic.png'),
  'monthly:1998-04': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-04-CoroCoro-Comic.png'),
  'monthly:1998-05': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-05-CoroCoro-Comic.png'),
  'monthly:1998-06': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-06-CoroCoro-Comic.png'),
  'monthly:1998-08': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-08-CoroCoro-Comic.png'),
  'monthly:1998-10': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-10-CoroCoro-Comic.png'),
  'monthly:1998-11': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-11-CoroCoro-Comic.png'),
  'monthly:1998-12': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1998-12-CoroCoro-Comic.png'),
  'monthly:1999-02': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1999-02-CoroCoro-Comic.png'),
  'monthly:1999-03': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/1999-03-CoroCoro-Comic.png'),
  'monthly:2000-02': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2000-02-CoroCoro-Comic.png'),
  'monthly:2000-04': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2000-04-CoroCoro-Comic.png'),
  'monthly:2000-07': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2000-07-CoroCoro-Comic.png'),
  'monthly:2000-11': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2000-11-CoroCoro-Comic.png'),
  'monthly:2001-01': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2001-01-CoroCoro-Comic.png'),
  'monthly:2001-05': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2001-05-CoroCoro-Comic.png'),
  'monthly:2001-08': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2001-08-CoroCoro-Comic.png'),
  'monthly:2001-12': () => require('../assets/Pokemon_Magazine_Cover_Art_PNGs/CoroCoro Comic/2001-12-CoroCoro-Comic.png'),
};

export const COROCORO_SUPPLIED_COVER_COUNT = Object.keys(covers).length;

export function getCorocoroSuppliedCover(issueId: string, context: {
  development?: boolean; platform?: string; hostname?: string; sourceEnabled?: boolean;
} = {}): ImageSourcePropType | null {
  return context.sourceEnabled === false ? null : covers[issueId]?.() ?? null;
}
