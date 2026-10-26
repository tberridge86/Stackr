import { fetchBinders, type BinderCardRecord, type BinderRecord } from './binders';
import { fetchOwnedCardRows } from './ownership';
import { supabase } from './supabase';
import { withPersonalDataReadTimeout } from './personalDataRead';
import { readUiCollectionChunks } from './uiCollectionPages';
import { getCollectionSummaryVersion } from './collectionSummaryInvalidation';
import {
  homeBinderFacts, homeSavedFactsLease, invalidateHomeSavedFacts, isHomeSavedFactsLeaseCurrent,
  readCachedHomeSavedFacts, type HomeSavedCollectionFacts,
} from './homeSavedCollectionCache';

// Home needs the complete snapshot; larger bounded pages reduce cold round trips.
const HOME_SAVED_FACTS_PAGE_SIZE = 500;

type HomeSavedCollectionOptions = {
  onBindersReady?: (binders: BinderRecord[]) => void;
  isCurrent?: () => boolean;
  signal?: AbortSignal;
  forceRefresh?: boolean;
};

/** Essential independent saved/owned reads share a deadline, not a dependency. */
async function readHomeSavedCollection(userId: string, options: HomeSavedCollectionOptions): Promise<HomeSavedCollectionFacts> {
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
      const savedRead = fetchBinders({ enrich: false }).then(async (binders) => {
        await assertCurrent();
        if (binders.some((binder) => binder.user_id !== userId)) throw new Error('The collection account changed. Please retry.');
        options.onBindersReady?.(binders);
        const rows = await readUiCollectionChunks<BinderCardRecord>(
          binders.map((binder) => binder.id),
          (ids) => supabase.from('binder_cards').select('*').in('binder_id', ids),
          (row, ids) => ids.includes(row.binder_id), { signal, assertCurrent, pageSize: HOME_SAVED_FACTS_PAGE_SIZE },
        );
        const cardsByBinder = new Map<string, BinderCardRecord[]>(binders.map((binder) => [binder.id, []]));
        for (const row of rows) cardsByBinder.get(row.binder_id)!.push(row);
        return { binders, cardsByBinder };
      });
      const [saved, ownedRows] = await Promise.all([
        savedRead,
        fetchOwnedCardRows({
          pageSize: HOME_SAVED_FACTS_PAGE_SIZE,
          isCurrent: () => !signal.aborted && !finished && !accountChanged && options.isCurrent?.() !== false,
        }),
      ]);
      await assertCurrent();
      if (ownedRows.some((row) => row.user_id !== userId)) throw new Error('The collection account changed. Please retry.');
      return { ...saved, ownedRows };
    } finally {
      finished = true;
      signal.removeEventListener('abort', unsubscribe);
      unsubscribe();
    }
  }, { signal: options.signal });
}

/** Only complete facts are reused; prices and authenticated valuation reads stay independent. */
export async function fetchHomeSavedCollection(userId: string, options: HomeSavedCollectionOptions = {}): Promise<HomeSavedCollectionFacts> {
  const revision = getCollectionSummaryVersion();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener('abort', cancel, { once: true });
  let accountChanged = false, finished = false, callbackSent = false;
  let lease: ReturnType<typeof homeSavedFactsLease> | undefined;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== userId && !accountChanged) {
      accountChanged = true;
      invalidateHomeSavedFacts();
      cancel();
    }
  });
  const cancelled = () => finished || accountChanged || controller.signal.aborted || options.isCurrent?.() === false
    || revision !== getCollectionSummaryVersion() || (lease !== undefined && !isHomeSavedFactsLeaseCurrent(lease));
  const notify = (binders: BinderRecord[]) => {
    if (cancelled() || callbackSent) return;
    callbackSent = true;
    try { options.onBindersReady?.(binders.map(homeBinderFacts)); } catch { /* Optional warming cannot fail complete facts. */ }
  };
  try {
    return await withPersonalDataReadTimeout(async (signal) => {
      const assertCurrent = async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session?.user?.id !== userId) throw new Error('The collection account changed. Please retry.');
        if (cancelled()) throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
      };
      await assertCurrent();
      lease = homeSavedFactsLease(userId, revision, options.forceRefresh);
      const capturedLease = lease;
      const value = await readCachedHomeSavedFacts(capturedLease, (sharedSignal) => readHomeSavedCollection(userId, {
        signal: sharedSignal,
        isCurrent: () => isHomeSavedFactsLeaseCurrent(capturedLease),
        onBindersReady: (binders) => { if (!cancelled()) notify(binders); },
      }), signal);
      await assertCurrent();
      notify(value.binders);
      if (cancelled()) throw Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' });
      return value;
    }, { signal: controller.signal });
  } finally {
    finished = true;
    options.signal?.removeEventListener('abort', cancel);
    subscription.unsubscribe();
  }
}

/** Saved rows cannot prove the full size or completion of an official set. */
export function savedBinderCatalogueTotal(binder: BinderRecord, cards: BinderCardRecord[]) {
  if (binder.type !== 'official') return cards.length;
  const totals = cards.map((card) => Number(card.set_total)).filter((total) => Number.isFinite(total) && total > 0);
  const catalogueTotal = Number(binder.catalogue_set_total);
  if (Number.isFinite(catalogueTotal) && catalogueTotal > 0) totals.push(catalogueTotal);
  return totals.length ? Math.max(...totals, cards.length) : 0;
}
