/** Presentation only: these notices do not enforce transactions on the server. */
export type OfferConfirmAction = 'accept' | 'decline' | 'withdraw' | 'dispute';

export const CARD_ONLY_RELEASE_NOTICE =
  'Acceptance records a card-only agreement. Payments, delivery tracking and free-form messages are unavailable in this release. Stackr does not authenticate cards, hold payment or guarantee delivery.';

export const TRADE_PROBLEM_NOTICE =
  'This marks the agreement as having a problem. It does not create a support ticket or promise a review, refund or resolution.';

type ReviewCard = { quantity: number | null | undefined };

function knownQuantity(cards: readonly ReviewCard[]): number | null {
  if (cards.some(({ quantity }) => !Number.isSafeInteger(quantity) || Number(quantity) <= 0)) return null;
  const quantity = cards.reduce((total, card) => total + Number(card.quantity), 0);
  return Number.isSafeInteger(quantity) ? quantity : null;
}

export function getCardOnlyOfferWarning(
  outgoing: readonly ReviewCard[],
  incoming: readonly ReviewCard[],
): string | null {
  const sending = knownQuantity(outgoing);
  const receiving = knownQuantity(incoming);
  if (sending === null || receiving === null) {
    return 'Card quantities could not be confirmed. Check the offer before accepting.';
  }
  if (sending === 0 && receiving === 0) return 'No cards are included in this offer. Check both sides before accepting.';
  if (receiving === 0) return 'One-sided offer: you will receive no cards in return. Check before accepting.';
  if (sending === 0) return 'One-sided offer: you are offering no cards in return. Check both sides before accepting.';
  return null;
}

export function getOfferConfirmCopy(action: OfferConfirmAction | null, warning: string | null = null) {
  if (!action) return null;
  if (action === 'accept') return {
    title: 'Accept trade?',
    body: [warning, 'Accept only the cards and quantities shown. This records the card-only agreement; it does not authenticate cards, reserve stock or arrange delivery.'].filter(Boolean).join(' '),
    actionLabel: 'Accept Trade',
    destructive: false,
  };
  if (action === 'decline') return {
    title: 'Decline offer?',
    body: 'This closes the pending offer and lets the other collector know.',
    actionLabel: 'Decline',
    destructive: true,
  };
  if (action === 'withdraw') return {
    title: 'Withdraw offer?',
    body: 'This cancels your pending offer before it is accepted.',
    actionLabel: 'Withdraw',
    destructive: true,
  };
  return {
    title: 'Flag a problem?',
    body: TRADE_PROBLEM_NOTICE,
    actionLabel: 'Flag a problem',
    destructive: true,
  };
}
