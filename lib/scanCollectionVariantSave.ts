import {
  addOwnedCardBatchToBinder,
  clearCollectionBatchRecoveryIntent,
  createCollectionBatchRequestKey,
  persistVerifiedCollectionBatchRecoveryIntent,
  type CollectionBatchCard,
} from './collectionBatch';
import { addScannedVariantCopy } from './scanVariantOwnership';
import type { ScannedVariantInput } from './scanVariantOwnershipCore';

export type ScanCollectionVariantSaveInput = Readonly<{
  sourceSessionId: string;
  binderId: string;
  cards: readonly CollectionBatchCard[];
  variant: Omit<ScannedVariantInput, 'requestKey'> | null;
}>;

/**
 * Saves the binder copy and its exact finish as one resumable operation. Both
 * writers use the same durable request key, so repeating this after an
 * interruption replays the binder journal before resuming the variant journal.
 */
export async function saveScanCollectionVariant(input: ScanCollectionVariantSaveInput) {
  const requestKey = createCollectionBatchRequestKey({
    sourceSessionId: input.sourceSessionId,
    binderId: input.binderId,
    cards: input.cards,
  });
  const intent = await persistVerifiedCollectionBatchRecoveryIntent({
    sourceSessionId: input.sourceSessionId,
    binderId: input.binderId,
    cards: input.cards,
    requestKey,
  });
  const batch = await addOwnedCardBatchToBinder(intent.binderId, [...intent.cards], { requestKey: intent.requestKey });
  const variant = input.variant
    ? await addScannedVariantCopy({ ...input.variant, requestKey: intent.requestKey })
    : null;
  await clearCollectionBatchRecoveryIntent(input.sourceSessionId);
  return { intent, batch, variant };
}