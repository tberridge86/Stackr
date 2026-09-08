// These English provider-code families match the series already stored in the
// legacy catalogue. They are display fallbacks, never persisted set identities.
const ENGLISH_SERIES_CODES: readonly [RegExp, string][] = [
  [/^(?:me\d+(?:pt5|\.5)?|mep|mee)$/, 'Mega Evolution'],
  [/^(?:sv\d+(?:pt5|\.5)?[bw]?|[rz]sv10pt5|svp|sve)$/, 'Scarlet & Violet'],
  [/^(?:swsh\d+(?:pt5|\.5)?(?:tg|gg|sv)?|swshp|cel25(?:c|cc)?|pgo)$/, 'Sword & Shield'],
  [/^(?:sm\d+(?:\.5)?|sma|smp|det1)$/, 'Sun & Moon'],
  [/^(?:xy\d+|xyp|xya|g1|dc1)$/, 'XY'],
  [/^(?:bw\d+|bwp|dv1)$/, 'Black & White'],
  [/^(?:hgss\d+|hgssp|hsp|col1)$/, 'HeartGold & SoulSilver'],
  [/^pl\d+$/, 'Platinum'],
  [/^(?:dp\d+|dpp)$/, 'Diamond & Pearl'],
  [/^(?:ex\d+(?:\.5)?|exu|tk[12][ab])$/, 'EX'],
  [/^ecard\d+$/, 'e-Card'],
  [/^neo\d+$/, 'Neo'],
  [/^gym\d+$/, 'Gym'],
  [/^(?:base[1-5]|basep)$/, 'Base'],
  [/^pop\d+$/, 'POP'],
];

export const POKEMON_SET_SERIES_ORDER = [
  'Mega Evolution', 'Scarlet & Violet', 'Sword & Shield', 'Sun & Moon', 'XY',
  'Black & White', 'HeartGold & SoulSilver', 'Platinum', 'Diamond & Pearl',
  'EX', 'e-Card', 'E-Card', 'Neo', 'Gym', 'Base', 'POP', 'Other',
] as const;

export const DEFAULT_EXPANDED_ENGLISH_SERIES = ['Mega Evolution', 'Scarlet & Violet', 'Sword & Shield'] as const;

export function getPokemonSetDisplaySeries(input: {
  series?: string | null;
  language?: string | null;
  setCode?: string | null;
}) {
  const storedSeries = input.series?.trim();
  if (storedSeries) return storedSeries;
  if (input.language !== 'en') return 'Other';
  const code = String(input.setCode ?? '').trim().toLowerCase().replace(/^en:/, '');
  return ENGLISH_SERIES_CODES.find(([pattern]) => pattern.test(code))?.[1] ?? 'Other';
}

export function groupPokemonSetsBySeries<T extends { series?: string | null }>(sets: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const set of sets) {
    const series = set.series?.trim() || 'Other';
    const rows = groups.get(series) ?? [];
    rows.push(set);
    groups.set(series, rows);
  }
  const known = new Set<string>(POKEMON_SET_SERIES_ORDER);
  return [...POKEMON_SET_SERIES_ORDER, ...[...groups.keys()].filter((series) => !known.has(series))]
    .filter((series) => groups.has(series))
    .map((series) => ({ series, sets: groups.get(series)! }));
}
