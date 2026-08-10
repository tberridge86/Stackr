import { invalidateStackrCollectionQueries } from './stackrQuery';

let collectionSummaryVersion = 0;

export function bumpCollectionSummaryVersion() {
  collectionSummaryVersion += 1;
  invalidateStackrCollectionQueries();
}

export function getCollectionSummaryVersion() {
  return collectionSummaryVersion;
}
