import { getPokemonSetDisplaySeries, groupPokemonSetsBySeries } from './pokemonSetSeries';

export const DISCOVER_DATE_GROUP = 'All sets · newest first';
export const DISCOVER_OTHER_GROUP = 'More sets · newest first';

type DiscoverSet = {
  id: string;
  series?: string | null;
  language?: string | null;
  releaseDate?: string | null;
  externalIds?: { setCode?: string | number | null } | null;
};

export function groupDiscoverSets<T extends DiscoverSet>(sets: readonly T[]) {
  // The catalogue can return the same published set twice during a client merge.
  // Only collapse an exact language/id repeat; similarly named sets remain distinct.
  const uniqueSets = [...new Map(sets.map((set) => [
    `${String(set.language ?? '').toLowerCase()}:${set.id}`,
    set,
  ])).values()];
  const sorted = uniqueSets.sort((a, b) => {
    const timestamp = (value?: string | null) => Date.parse(String(value ?? '').replace(/\//g, '-')) || 0;
    return timestamp(b.releaseDate) - timestamp(a.releaseDate) || a.id.localeCompare(b.id);
  });
  const rows = sorted.map((set) => ({
    ...set,
    series: getPokemonSetDisplaySeries({
      series: set.series === 'Other' ? null : set.series,
      language: set.language ?? 'en',
      setCode: String(set.externalIds?.setCode ?? set.id),
    }),
  }));
  if (rows.length && rows.filter((set) => set.series === 'Other').length > rows.length / 2) {
    return [{ series: DISCOVER_DATE_GROUP, sets: rows }];
  }
  return groupPokemonSetsBySeries(rows).map((group) => ({
    ...group,
    series: group.series === 'Other' ? DISCOVER_OTHER_GROUP : group.series,
  }));
}

export const isDiscoverDateGroup = (series: string) => series === DISCOVER_DATE_GROUP || series === DISCOVER_OTHER_GROUP;
