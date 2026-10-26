import type { BinderCardRecord, BinderRecord } from './binders';
import type { OwnedCardRow } from './ownership';
import { getCachedOrFetch, invalidateRequestCache } from './requestCache';
import { getCollectionSummaryVersion } from './collectionSummaryInvalidation';
import { supabase } from './supabase';

export type HomeSavedCollectionFacts = {
  binders: BinderRecord[];
  ownedRows: OwnedCardRow[];
  cardsByBinder: Map<string, BinderCardRecord[]>;
};
export const HOME_SAVED_FACTS_TTL_MS = 30_000;
const CACHE_PREFIX = 'home:saved-facts:';
const MAX_CACHE_ROWS = 10_000;
const MAX_CACHE_CHARACTERS = 2_000_000;
type Lease = { userId: string; revision: number; generation: number; controller: AbortController; consumers: number; loading: boolean; unsubscribe: () => void };
type Payload = { body: string; facts?: never } | { body?: never; facts: HomeSavedCollectionFacts };
let generation = 0;
let currentLease: Lease | null = null;

export function invalidateHomeSavedFacts() {
  generation += 1;
  const previous = currentLease;
  currentLease = null;
  previous?.controller.abort();
  previous?.unsubscribe();
  invalidateRequestCache(CACHE_PREFIX);
}
export function homeSavedFactsLease(userId: string, revision: number, forceRefresh = false): Lease {
  if (forceRefresh) invalidateRequestCache(`binders:${userId}:saved`);
  if (forceRefresh || currentLease?.userId !== userId || currentLease.revision !== revision) {
    invalidateHomeSavedFacts();
    const lease: Lease = { userId, revision, generation, controller: new AbortController(), consumers: 0, loading: false, unsubscribe() {} };
    currentLease = lease;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // This bounded cache owns its observer while idle too: logout/login as
      // the same account cannot resurrect facts from the preceding session.
      if ((event === 'SIGNED_OUT' || session?.user?.id !== userId) && currentLease === lease) {
        invalidateRequestCache(`binders:${userId}:saved`);
        invalidateHomeSavedFacts();
      }
    });
    lease.unsubscribe = () => subscription.unsubscribe();
  }
  return currentLease;
}
export function isHomeSavedFactsLeaseCurrent(lease: Lease): boolean {
  return currentLease === lease && lease.generation === generation && lease.revision === getCollectionSummaryVersion();
}

/** Retained display/identity facts never become an authority for a stored price. */
export function homeBinderFacts(binder: BinderRecord): BinderRecord {
  const facts = { ...binder };
  delete facts.ebay_value; delete facts.tcg_value; delete facts.cardmarket_value;
  return { ...facts, ...(binder.gradient ? { gradient: [...binder.gradient] } : {}) };
}
const cardFacts = (row: BinderCardRecord): BinderCardRecord => ({
  ...row, ebay_price: null, tcg_price: null, cardmarket_price: null, last_price_update: null,
});
function factsOnly(source: HomeSavedCollectionFacts): HomeSavedCollectionFacts {
  return { binders: source.binders.map(homeBinderFacts), ownedRows: source.ownedRows.map((row) => ({ ...row })),
    cardsByBinder: new Map([...source.cardsByBinder].map(([id, rows]) => [id, rows.map(cardFacts)])) };
}
function cloneFacts(source: HomeSavedCollectionFacts): HomeSavedCollectionFacts {
  // Oversized complete reads bypass retained caching. Clone one row at a time
  // rather than making a second unbounded JSON string for the entire collection.
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  return { binders: source.binders.map(clone), ownedRows: source.ownedRows.map(clone),
    cardsByBinder: new Map([...source.cardsByBinder].map(([id, rows]) => [id, rows.map(clone)])) };
}
export async function readCachedHomeSavedFacts(lease: Lease, read: (signal: AbortSignal) => Promise<HomeSavedCollectionFacts>, signal: AbortSignal): Promise<HomeSavedCollectionFacts> {
  lease.consumers += 1;
  let rejectCancelled: (error: Error) => void = () => {};
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancelled = reject; });
  const cancel = () => rejectCancelled(Object.assign(new Error('The collection request was cancelled.'), { name: 'AbortError' }));
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
  const payload = await Promise.race([ getCachedOrFetch<Payload>(`${CACHE_PREFIX}${lease.userId}:${lease.revision}:${lease.generation}`,
    HOME_SAVED_FACTS_TTL_MS, async () => {
      lease.loading = true;
      try {
      const facts = factsOnly(await read(lease.controller.signal));
      const rowCount = facts.binders.length + facts.ownedRows.length
        + [...facts.cardsByBinder.values()].reduce((count, rows) => count + rows.length, 0);
      if (rowCount > MAX_CACHE_ROWS) return { facts };
      const body = JSON.stringify({ ...facts, cardsByBinder: [...facts.cardsByBinder] });
      return body.length <= MAX_CACHE_CHARACTERS ? { body } : { facts };
      } finally { lease.loading = false; }
    }, { shouldCache: (value) => value.body !== undefined && isHomeSavedFactsLeaseCurrent(lease) }), cancellation]);
  if (!isHomeSavedFactsLeaseCurrent(lease)) throw Object.assign(new Error('The collection changed. Please retry.'), { name: 'AbortError' });
  if (payload.body === undefined) return cloneFacts(payload.facts);
  const value = JSON.parse(payload.body) as Omit<HomeSavedCollectionFacts, 'cardsByBinder'> & { cardsByBinder: [string, BinderCardRecord[]][] };
  return { ...value, cardsByBinder: new Map(value.cardsByBinder) };
  } finally {
    signal.removeEventListener('abort', cancel);
    lease.consumers -= 1;
    if (!lease.consumers && lease.loading && currentLease === lease) invalidateHomeSavedFacts();
  }
}
