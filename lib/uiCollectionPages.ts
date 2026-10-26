export const UI_COLLECTION_PAGE_SIZE = 50;
export const UI_COLLECTION_MAX_ROWS = 256_000;
export const UI_COLLECTION_MAX_PAGE_SIZE = 500;

type PageQuery<T> = {
  order: (column: string, options: { ascending: boolean }) => PageQuery<T>;
  range: (from: number, to: number) => PageQuery<T>;
  abortSignal: (signal: AbortSignal) => PageQuery<T>;
  then: PromiseLike<{ data: T[] | null; error: unknown }>['then'];
};

export type UiCollectionReadOptions = {
  /** May lower the shared ceiling; a caller cannot raise the hard memory bound. */
  maxRows?: number;
  /** Opt in to larger network pages without enlarging the total row or IN-filter budgets. */
  pageSize?: number;
  signal?: AbortSignal;
  assertCurrent?: () => void | Promise<void>;
};

async function assertCurrent(options: UiCollectionReadOptions) {
  if (options.signal?.aborted) throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
  await options.assertCurrent?.();
  if (options.signal?.aborted) throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
}

/** Every network page is bounded; only empty proves exhaustion under lower server caps. */
export async function readUiCollectionPages<T extends { id: string }>(
  buildQuery: () => PageQuery<T>,
  accepts: (row: T) => boolean,
  options: UiCollectionReadOptions = {},
  seen = new Set<string>(),
): Promise<T[]> {
  const maxRows = options.maxRows ?? UI_COLLECTION_MAX_ROWS;
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0 || maxRows > UI_COLLECTION_MAX_ROWS) {
    throw new RangeError('Collection row budget must be a positive integer no greater than 256000.');
  }
  const pageSize = options.pageSize ?? UI_COLLECTION_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > UI_COLLECTION_MAX_PAGE_SIZE) {
    throw new RangeError('Collection page size must be a positive integer no greater than 500.');
  }
  const rows: T[] = [];
  for (;;) {
    await assertCurrent(options);
    let query = buildQuery().order('id', { ascending: true }).range(rows.length, rows.length + pageSize - 1);
    if (options.signal) query = query.abortSignal(options.signal);
    const { data, error } = await query;
    await assertCurrent(options);
    if (error) throw error;
    if (!Array.isArray(data) || data.length > pageSize) throw new Error('Collection pagination was incomplete. Please retry.');
    if (!data.length) return rows;
    // The shared identity set includes prior chunks: no source can evade the ceiling.
    if (seen.size + data.length > maxRows) throw new Error('Collection read exceeded the row budget. Please retry.');
    for (const row of data) {
      if (typeof row?.id !== 'string' || !row.id || seen.has(row.id) || !accepts(row)) {
        throw new Error('Collection pages did not match the requested identities. Please retry.');
      }
      seen.add(row.id);
      rows.push(row);
    }
  }
}

/** Bound IN filters as well as response sizes; retain every row across all chunks. */
export async function readUiCollectionChunks<T extends { id: string }>(
  ids: string[],
  buildQuery: (chunk: string[]) => PageQuery<T>,
  accepts: (row: T, chunk: string[]) => boolean,
  options: UiCollectionReadOptions = {},
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < unique.length; start += UI_COLLECTION_PAGE_SIZE) {
    await assertCurrent(options);
    const chunk = unique.slice(start, start + UI_COLLECTION_PAGE_SIZE);
    const chunkRows = await readUiCollectionPages(() => buildQuery(chunk), (row) => accepts(row, chunk), options, seen);
    for (const row of chunkRows) rows.push(row);
  }
  await assertCurrent(options);
  return rows;
}
