import type { CollectionPriceInput, CollectionPriceResult } from './collectionPricingApi';

export type StoredCollectionPrice = { identity: string; result: CollectionPriceResult };

/** Quantity is deliberately excluded: changed quantities use the same exact quote. */
export function collectionPriceIdentity(input: CollectionPriceInput): string {
  return JSON.stringify([
    input.references, input.language, input.setId, input.variantCode,
    input.productType, input.condition, input.grader, input.grade, input.edition,
    input.canonicalPrintingId, input.trustedResolution, input.legacyReference, input.legacySetId,
  ]);
}

export function blocksIndependentPriceRead(failure?: { kind: string } | null) {
  return Boolean(failure && ['authentication_required', 'access_denied', 'rate_limited'].includes(failure.kind));
}

/** Merge evidence, never totals. Authoritative missing/invalidated results replace old evidence. */
export function mergeCollectionPriceRead(
  inputs: readonly CollectionPriceInput[],
  incoming: readonly CollectionPriceResult[],
  previous: readonly StoredCollectionPrice[],
): StoredCollectionPrice[] {
  const byIdentity = new Map(previous.map((entry) => [entry.identity, entry.result]));
  return inputs.map((input, index) => {
    const identity = collectionPriceIdentity(input);
    const next = incoming[index];
    if (!next || next.key !== input.key) throw new Error('Price results do not match the collection revision.');
    const old = byIdentity.get(identity);
    const transient = Boolean(next.requestError)
      && !blocksIndependentPriceRead(next.requestFailure?.kind === 'rate_limited' ? null : next.requestFailure);
    const sameVariant = !next.variantId || next.variantId === old?.variantId;
    const validOld = old?.central != null && Number.isFinite(old.central) && old.central >= 0 && old.status !== 'unavailable';
    const oldTime = Date.parse(old?.calculatedAt ?? '');
    const nextTime = Date.parse(next.calculatedAt ?? '');
    const olderResponse = next.central != null && sameVariant && Number.isFinite(oldTime)
      && Number.isFinite(nextTime) && nextTime < oldTime;
    const result = validOld && sameVariant && (transient || olderResponse)
      ? { ...old, key: input.key, quantity: input.quantity, freshness: transient ? 'stale' : old.freshness,
        requestError: next.requestError, requestFailure: next.requestFailure }
      : { ...next, quantity: input.quantity };
    return { identity, result };
  });
}
