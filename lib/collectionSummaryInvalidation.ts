import { invalidateStackrCollectionQueries } from './stackrQuery';

let collectionSummaryVersion = 0;
const listeners = new Set<() => void>();

export function subscribeCollectionSummaryInvalidation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function bumpCollectionSummaryVersion() {
  collectionSummaryVersion += 1;
  for (const listener of listeners) {
    try { listener(); } catch { /* Optional views cannot turn a saved mutation into a failure. */ }
  }
  invalidateStackrCollectionQueries();
}

export function getCollectionSummaryVersion() {
  return collectionSummaryVersion;
}
