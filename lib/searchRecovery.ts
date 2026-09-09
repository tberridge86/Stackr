export type SearchResultGroup = 'cards' | 'sets' | 'sealed' | 'graded' | 'listings' | 'collectors';
export type SearchLoadErrors = Partial<Record<SearchResultGroup, string>>;

const groupLabels: Record<SearchResultGroup, string> = {
  cards: 'Cards', sets: 'Sets', sealed: 'Products', graded: 'Graded listings', listings: 'Market listings', collectors: 'Collectors',
};

export function getSearchFailureSummary(errors: SearchLoadErrors, groups: readonly SearchResultGroup[]) {
  const failedGroups = groups.filter((group) => Boolean(errors[group]));
  return {
    failedGroups,
    allFailed: groups.length > 0 && failedGroups.length === groups.length,
    message: failedGroups.length ? `${failedGroups.map((group) => groupLabels[group]).join(', ')} could not be loaded.` : '',
  };
}

// Only supply previous results for the same query, language and category.
export function retainFailedSearchGroups<T extends Record<SearchResultGroup, unknown[]>>(
  next: T,
  errors: SearchLoadErrors,
  previous: T | null,
): T {
  if (!previous) return next;
  const merged = { ...next };
  for (const group of Object.keys(groupLabels) as SearchResultGroup[]) {
    if (errors[group]) merged[group] = previous[group];
  }
  return merged;
}
