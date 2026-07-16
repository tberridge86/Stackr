export type CardCondition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged'
  | 'Sealed'
  | string;

export type CardOwnershipState = 'raw' | 'graded';

export type CanonicalCardOwnershipRecord = {
  id?: string | null;
  userId?: string | null;
  cardId: string;
  setId: string | null;
  cardNumber?: string | null;
  variant?: string | null;
  language?: string | null;
  state?: CardOwnershipState;
  gradingCompany?: string | null;
  grade?: string | null;
  condition?: CardCondition | null;
  ownedQuantity: number;
  costBasis?: number | null;
  currentEstimatedValue?: number | null;
  binderId?: string | null;
  binderName?: string | null;
  physicalLocation?: string | null;
  personalCollection?: boolean;
  availableForSale?: boolean;
  availableForTrade?: boolean;
  activeListedQuantity?: number;
  reservedQuantity?: number;
  pendingTransactionQuantity?: number;
  images?: {
    small?: string | null;
    large?: string | null;
    sellerFront?: string | null;
    sellerBack?: string | null;
  };
  scanConfidence?: number | null;
  userCorrections?: Record<string, unknown> | null;
  acquiredAt?: string | null;
  acquisitionSource?: string | null;
  notes?: string | null;
};

export type QuantityCommitment = {
  listed?: number | null;
  reserved?: number | null;
  pendingTransactions?: number | null;
};

export type AvailabilityBreakdown = {
  ownedQuantity: number;
  listedQuantity: number;
  reservedQuantity: number;
  pendingTransactionQuantity: number;
  committedQuantity: number;
  availableQuantity: number;
  overCommittedQuantity: number;
};

export const normaliseQuantity = (value: number | null | undefined) =>
  Math.max(0, Math.floor(Number(value ?? 0) || 0));

export function calculateAvailableQuantity(
  ownedQuantity: number | null | undefined,
  commitments: QuantityCommitment = {}
): AvailabilityBreakdown {
  const owned = normaliseQuantity(ownedQuantity);
  const listed = normaliseQuantity(commitments.listed);
  const reserved = normaliseQuantity(commitments.reserved);
  const pendingTransactions = normaliseQuantity(commitments.pendingTransactions);
  const committed = listed + reserved + pendingTransactions;
  const available = Math.max(0, owned - committed);

  return {
    ownedQuantity: owned,
    listedQuantity: listed,
    reservedQuantity: reserved,
    pendingTransactionQuantity: pendingTransactions,
    committedQuantity: committed,
    availableQuantity: available,
    overCommittedQuantity: Math.max(0, committed - owned),
  };
}

export function getOwnershipAvailability(record: Pick<
  CanonicalCardOwnershipRecord,
  'ownedQuantity' | 'activeListedQuantity' | 'reservedQuantity' | 'pendingTransactionQuantity'
>): AvailabilityBreakdown {
  return calculateAvailableQuantity(record.ownedQuantity, {
    listed: record.activeListedQuantity,
    reserved: record.reservedQuantity,
    pendingTransactions: record.pendingTransactionQuantity,
  });
}

export function assertCanCommitQuantity(
  record: Pick<CanonicalCardOwnershipRecord, 'ownedQuantity' | 'activeListedQuantity' | 'reservedQuantity' | 'pendingTransactionQuantity'>,
  quantity: number,
  label = 'quantity'
) {
  const requested = normaliseQuantity(quantity);
  const availability = getOwnershipAvailability(record);
  if (requested <= 0) {
    throw new Error(`Select at least one ${label}.`);
  }
  if (requested > availability.availableQuantity) {
    throw new Error(
      `Only ${availability.availableQuantity} available. ${availability.committedQuantity} already committed to listings, reservations or pending transactions.`
    );
  }
  return availability;
}

export function getDuplicateQuantity(ownedQuantity: number | null | undefined) {
  return Math.max(0, normaliseQuantity(ownedQuantity) - 1);
}

export function getOwnershipKey(record: Pick<CanonicalCardOwnershipRecord, 'cardId' | 'setId' | 'variant' | 'language' | 'state' | 'gradingCompany' | 'grade' | 'condition'>) {
  return [
    record.setId ?? '',
    record.cardId,
    record.variant ?? 'normal',
    record.language ?? 'en',
    record.state ?? (record.gradingCompany || record.grade ? 'graded' : 'raw'),
    record.gradingCompany ?? '',
    record.grade ?? '',
    record.condition ?? '',
  ].join(':');
}
