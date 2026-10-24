import { fetchBinders, type BinderCardRecord, type BinderRecord } from './binders';
import { fetchOwnedCardRows } from './ownership';
import { supabase } from './supabase';
import { withPersonalDataReadTimeout } from './personalDataRead';
import { readUiCollectionChunks } from './uiCollectionPages';

/** Read saved collection records before requesting optional catalogue artwork or prices. */
export async function fetchHomeSavedCollection(userId: string, options: {
  onBindersReady?: (binders: BinderRecord[]) => void;
  isCurrent?: () => boolean;
  signal?: AbortSignal;
} = {}) {
  return withPersonalDataReadTimeout(async (signal) => {
    let accountChanged = false, finished = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id !== userId) accountChanged = true;
    });
    const unsubscribe = () => subscription.unsubscribe();
    signal.addEventListener('abort', unsubscribe, { once: true });
    const assertCurrent = async () => {
      if (signal.aborted || finished || accountChanged || options.isCurrent?.() === false) {
        throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
      }
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (session?.user?.id !== userId) throw new Error('The collection account changed. Please retry.');
      if (signal.aborted || finished || accountChanged || options.isCurrent?.() === false) {
        throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
      }
    };
    try {
      await assertCurrent();
      const [binders, ownedRows] = await Promise.all([
        fetchBinders({ enrich: false }).then(async (savedBinders) => {
          await assertCurrent();
          if (savedBinders.some((binder) => binder.user_id !== userId)) {
            throw new Error('The collection account changed. Please retry.');
          }
          options.onBindersReady?.(savedBinders);
          return savedBinders;
        }),
        fetchOwnedCardRows({ isCurrent: () => !signal.aborted && !finished && !accountChanged && options.isCurrent?.() !== false }),
      ]);
      await assertCurrent();
      if (binders.some((binder) => binder.user_id !== userId) || ownedRows.some((row) => row.user_id !== userId)) {
        throw new Error('The collection account changed. Please retry.');
      }
      const rows = await readUiCollectionChunks<BinderCardRecord>(
        binders.map((binder) => binder.id),
        (ids) => supabase.from('binder_cards').select('*').in('binder_id', ids),
        (row, ids) => ids.includes(row.binder_id), { signal, assertCurrent },
      );
      await assertCurrent();
      // A complete read also proves empty binders. Errors never produce a partial map.
      const byBinder = new Map<string, BinderCardRecord[]>(binders.map((binder) => [binder.id, []]));
      for (const row of rows) byBinder.get(row.binder_id)!.push(row);
      return { binders, ownedRows, cardsByBinder: byBinder };
    } finally {
      finished = true;
      signal.removeEventListener('abort', unsubscribe);
      unsubscribe();
    }
  }, { signal: options.signal });
}
/** Saved rows cannot prove the full size or completion of an official set. */
export function savedBinderCatalogueTotal(binder: BinderRecord, cards: BinderCardRecord[]) {
  if (binder.type !== 'official') return cards.length;
  const totals = cards.map((card) => Number(card.set_total)).filter((total) => Number.isFinite(total) && total > 0);
  const catalogueTotal = Number(binder.catalogue_set_total);
  if (Number.isFinite(catalogueTotal) && catalogueTotal > 0) totals.push(catalogueTotal);
  return totals.length ? Math.max(...totals, cards.length) : 0;
}
