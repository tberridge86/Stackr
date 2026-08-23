import {
  planSellerSweepInventoryBatch,
  type SellerSweepInventoryBatchProposal,
  type SellerSweepInventoryCondition,
  type SellerSweepInventoryItem,
  type SellerSweepReviewedLine,
} from './sellerSweepBatchPlanner';
import type { SweepScanItem, SweepScanSession } from './sweepScanSession';

export type SellerSweepConditionSelections = Readonly<
  Record<string, SellerSweepInventoryCondition | null | undefined>
>;

export type SellerSweepIdentityReviews = Readonly<Record<string, boolean | undefined>>;

export type SellerSweepReviewIssueCode =
  | 'empty_batch'
  | 'scan_not_confirmed'
  | 'missing_exact_identity'
  | 'identity_not_reviewed'
  | 'condition_not_reviewed'
  | 'invalid_quantity';

export type SellerSweepReviewIssue = {
  code: SellerSweepReviewIssueCode;
  itemId: string | null;
  message: string;
};

export class SellerSweepReviewHandoffError extends Error {
  constructor(public readonly issues: SellerSweepReviewIssue[]) {
    super(issues[0]?.message ?? 'The Seller Sweep batch is not ready.');
    this.name = 'SellerSweepReviewHandoffError';
  }
}
function selectedCandidate(item: SweepScanItem) {
  return item.candidates[item.selectedCandidateIndex] ?? item.candidates[0] ?? null;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getSellerSweepReviewIssues(input: {
  session: SweepScanSession;
  conditions: SellerSweepConditionSelections;
  identityReviews: SellerSweepIdentityReviews;
}): SellerSweepReviewIssue[] {
  const { session, conditions, identityReviews } = input;
  if (!session.items.length) {
    return [{
      code: 'empty_batch',
      itemId: null,
      message: 'Scan at least one card before preparing a seller batch.',
    }];
  }

  const issues: SellerSweepReviewIssue[] = [];
  for (const item of session.items) {
    if (item.status !== 'confirmed') {
      issues.push({
        code: 'scan_not_confirmed',
        itemId: item.id,
        message: 'Every scan must be matched and confirmed before the seller batch can be prepared.',
      });
      continue;
    }

    const candidate = selectedCandidate(item);
    if (!candidate
      || !cleanText(candidate.id)
      || !cleanText(candidate.name)
      || !cleanText(candidate.set_id)
      || !cleanText(candidate.language)
      || !cleanText(candidate.variant_code)) {
      issues.push({
        code: 'missing_exact_identity',
        itemId: item.id,
        message: 'A confirmed scan is missing its exact set, language, or physical variant.',
      });
    } else if (!identityReviews[item.id]) {
      issues.push({
        code: 'identity_not_reviewed',
        itemId: item.id,
        message: 'Confirm the exact identity for every seller card.',
      });
    }
    if (!conditions[item.id]) {
      issues.push({
        code: 'condition_not_reviewed',
        itemId: item.id,
        message: 'Choose a condition for every confirmed card.',
      });
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      issues.push({
        code: 'invalid_quantity',
        itemId: item.id,
        message: 'Every seller batch quantity must be a positive whole number.',
      });
    }
  }
  return issues;
}

function buildReviewedLines(input: {
  session: SweepScanSession;
  conditions: SellerSweepConditionSelections;
  requestId: string;
}): SellerSweepReviewedLine[] {
  return input.session.items.map((item, index) => {
    const candidate = selectedCandidate(item)!;
    const condition = input.conditions[item.id]!;
    return {
      scanItemId: item.id,
      status: 'confirmed',
      identityResolution: 'exact',
      card: {
        id: cleanText(candidate.id),
        name: cleanText(candidate.name),
        number: cleanText(candidate.number) || null,
        set_id: cleanText(candidate.set_id),
        set_name: cleanText(candidate.set_name) || null,
        rarity: null,
        image_small: cleanText(candidate.image_small) || null,
        image_large: cleanText(candidate.image_large) || null,
        tcg_price: null,
        ebay_price: null,
        cardmarket_price: null,
        language: cleanText(candidate.language),
        variant_code: cleanText(candidate.variant_code),
      },
      condition,
      quantity: item.quantity,
      movementId: `sweep:${input.requestId}:movement:${String(index + 1).padStart(3, '0')}`,
      binder: null,
      valueAtTime: null,
    };
  });
}

/**
 * Converts a fully reviewed Sweep session into the existing atomic seller batch
 * proposal. This function only builds data; it never reads or writes storage.
 */
export function createSellerSweepReviewHandoff(input: {
  session: SweepScanSession;
  conditions: SellerSweepConditionSelections;
  identityReviews: SellerSweepIdentityReviews;
  expectedItems: SellerSweepInventoryItem[];
  requestId: string;
  timestamp: string;
}): SellerSweepInventoryBatchProposal {
  const issues = getSellerSweepReviewIssues(input);
  if (issues.length) throw new SellerSweepReviewHandoffError(issues);

  return planSellerSweepInventoryBatch({
    requestId: input.requestId,
    timestamp: input.timestamp,
    expectedItems: input.expectedItems,
    lines: buildReviewedLines(input),
  });
}

/**
 * Builds a privacy-minimised review export. It deliberately excludes the
 * optimistic inventory snapshots, prices, notes, binder identifiers and local
 * inventory item IDs used by the in-app transactional commit.
 */
export function createSellerSweepReviewExport(input: {
  sourceSessionId: string;
  exportedAt: string;
  proposal: SellerSweepInventoryBatchProposal;
}) {
  const itemById = new Map(input.proposal.items.map((item) => [item.id, item]));
  return {
    schemaVersion: 1,
    kind: 'stackr_seller_sweep_review_summary',
    commitEnabled: true,
    sourceSessionId: cleanText(input.sourceSessionId),
    exportedAt: input.exportedAt,
    requestId: input.proposal.requestId,
    summary: {
      reviewedMovementCount: input.proposal.movements.length,
      reviewedCopyCount: input.proposal.movements.reduce((sum, movement) => sum + movement.quantity, 0),
      distinctReviewedCardCount: new Set(input.proposal.movements.map((movement) => (
        `${movement.set_id}:${movement.card_id}:${itemById.get(movement.inventory_item_id)?.card.variant_code ?? ''}:${itemById.get(movement.inventory_item_id)?.condition ?? ''}`
      ))).size,
      binderDeltaCount: input.proposal.binderDeltas.length,
    },
    reviewedCards: input.proposal.movements.map((movement) => {
      const item = itemById.get(movement.inventory_item_id);
      return {
        cardId: movement.card_id,
        setId: movement.set_id,
        cardName: movement.card_name,
        language: item?.card.language ?? null,
        variantCode: item?.card.variant_code ?? null,
        condition: item?.condition ?? null,
        quantity: movement.quantity,
        reason: movement.reason,
        binderLinked: Boolean(movement.binder_id),
      };
    }),
    omittedPrivateFields: [
      'expectedItems',
      'items',
      'inventoryItemIds',
      'askingPrices',
      'buyPrices',
      'notes',
      'binderIds',
      'binderNames',
    ],
  };
}
