type DatedSet = { id: string; name?: string | null; releaseDate?: string | null };

/** Unknown dates follow dated releases; ties remain stable across search queries. */
export function compareBinderSetsNewestFirst(left: DatedSet, right: DatedSet) {
  const timestamp = (value: string | null | undefined) => {
    const parsed = Date.parse(String(value ?? '').trim().replace(/\//g, '-'));
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  const leftDate = timestamp(left.releaseDate);
  const rightDate = timestamp(right.releaseDate);
  if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
  return String(left.name ?? '').localeCompare(String(right.name ?? ''), undefined, { sensitivity: 'base', numeric: true })
    || left.id.localeCompare(right.id);
}
