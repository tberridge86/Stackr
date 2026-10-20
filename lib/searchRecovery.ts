export type SearchResultGroup = 'cards' | 'sets' | 'sealed' | 'graded' | 'listings' | 'collectors';
export type SearchLoadErrors = Partial<Record<SearchResultGroup, string>>;

const groupLabels: Record<SearchResultGroup, string> = {
  cards: 'Cards', sets: 'Sets', sealed: 'Products', graded: 'Graded listings', listings: 'Market listings', collectors: 'Collectors',
};

export function getSearchFailureSummary(errors: SearchLoadErrors, groups: readonly SearchResultGroup[]) {
  const failedGroups = groups.filter((group) => Boolean(errors[group]));
  const refreshFailures = failedGroups.filter((group) => /could not be refreshed/i.test(errors[group] ?? ''));
  const loadFailures = failedGroups.filter((group) => !refreshFailures.includes(group));
  const message = [
    refreshFailures.length ? `${refreshFailures.map((group) => groupLabels[group]).join(', ')} could not be refreshed.` : '',
    loadFailures.length ? `${loadFailures.map((group) => groupLabels[group]).join(', ')} could not be loaded.` : '',
  ].filter(Boolean).join(' ');
  return {
    failedGroups,
    allFailed: groups.length > 0 && failedGroups.length === groups.length,
    message,
  };
}

// Only supply previous results for the same query, language and category.
export function retainFailedSearchGroups<T extends Record<SearchResultGroup, unknown[]>>(
  next: T,
  errors: SearchLoadErrors,
  previous: T | null,
  currentResults: Partial<Record<SearchResultGroup, boolean>> = {},
): T {
  if (!previous) return next;
  const merged = { ...next };
  for (const group of Object.keys(groupLabels) as SearchResultGroup[]) {
    // A failure only needs the same-query fallback when this request produced
    // no factual result. Early/cached rows (including an explicit no-match)
    // remain the most specific result, while the caller still exposes the
    // group error and retry control.
    if (errors[group] && !currentResults[group] && next[group].length === 0) merged[group] = previous[group];
  }
  return merged;
}
