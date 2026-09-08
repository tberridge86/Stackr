import { fetchBinders, type BinderCardRecord, type BinderRecord } from './binders';
import { fetchOwnedCardRows } from './ownership';
import { supabase } from './supabase';

/** Read saved collection records before requesting optional catalogue artwork or prices. */
export async function fetchHomeSavedCollection(userId: string) {
  const [binders, ownedRows] = await Promise.all([
    fetchBinders({ enrich: false }),
    fetchOwnedCardRows(),
  ]);
  if (binders.some((binder) => binder.user_id !== userId)
    || ownedRows.some((row) => row.user_id && row.user_id !== userId)) {
    throw new Error('The collection account changed. Please retry.');
  }
  const rows: BinderCardRecord[] = [];
  const knownBinders = new Set(binders.map((binder) => binder.id));
  // Bound URL size and paginate; Supabase's default row limit is not a collection limit.
  for (let offset = 0; offset < binders.length; offset += 100) {
    const ids = binders.slice(offset, offset + 100).map((binder) => binder.id);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('binder_cards').select('*')
        .in('binder_id', ids)
        .order('id', { ascending: true }).range(from, from + 999);
      if (error) throw error;
      const page = (data ?? []) as BinderCardRecord[];
      if (page.some((row) => !knownBinders.has(row.binder_id))) {
        throw new Error('Collection cards did not match the requested binders.');
      }
      rows.push(...page);
      if (page.length < 1000) break;
    }
  }
  const byBinder = new Map<string, BinderCardRecord[]>();
  for (const row of rows) {
    const cards = byBinder.get(row.binder_id) ?? [];
    cards.push(row);
    byBinder.set(row.binder_id, cards);
  }
  return { binders, ownedRows, cardsByBinder: byBinder };
}

/** Saved rows cannot prove the full size or completion of an official set. */
export function savedBinderCatalogueTotal(binder: BinderRecord, cards: BinderCardRecord[]) {
  if (binder.type !== 'official') return cards.length;
  const totals = cards.map((card) => Number(card.set_total)).filter((total) => Number.isFinite(total) && total > 0);
  const catalogueTotal = Number(binder.catalogue_set_total);
  if (Number.isFinite(catalogueTotal) && catalogueTotal > 0) totals.push(catalogueTotal);
  return totals.length ? Math.max(...totals, cards.length) : 0;
}
