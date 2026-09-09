export function getSearchFacetScope(category: string) {
  const all = category === 'all';
  const collector = category === 'collectors';
  const sets = category === 'sets';
  const raw = category === 'cards' || category === 'raw_card';
  const graded = category === 'graded' || category === 'graded_slab';
  return {
    rarity: all || raw,
    set: !collector,
    language: !collector,
    price: !collector && !sets,
    grading: all || graded,
  };
}

export function isSearchSortSupported(category: string, sort: string) {
  const scope = getSearchFacetScope(category);
  if (sort === 'relevance') return true;
  if (sort === 'rarity') return scope.rarity;
  if (sort === 'gradeDesc') return scope.grading;
  if (sort === 'priceAsc' || sort === 'priceDesc') return scope.price;
  return category !== 'collectors';
}
