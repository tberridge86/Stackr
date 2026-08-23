import { sha256Text } from './sha256';

export type CollectionBatchRequestCard = Readonly<{
  cardId: string;
  setId: string;
  language?: string | null;
  quantity?: number;
  cardName?: string | null;
  cardNumber?: string | null;
  imageUrl?: string | null;
  setName?: string | null;
  notes?: string | null;
  slotOrder?: number | null;
}>;

type CollectionBatchRequestEntry<T> =
  | { state: 'pending'; fingerprint: string; operation: Promise<T> }
  | { state: 'committed'; fingerprint: string; value: T }
  | { state: 'reconciliation_required'; fingerprint: string };

export class CollectionBatchReconciliationRequiredError extends Error {
  readonly code = 'collection_batch_reconciliation_required';

  constructor(readonly requestKey: string, options?: { cause?: unknown }) {
    super(
      'This collection save may have changed the binder, but its exact result could not be proven. Keep this batch locked and verify the binder before saving again.',
      options,
    );
    this.name = 'CollectionBatchReconciliationRequiredError';
  }
}

export function isCollectionBatchReconciliationRequired(error: unknown) {
  return error instanceof CollectionBatchReconciliationRequiredError
    || (error as { code?: string } | null)?.code === 'collection_batch_reconciliation_required';
}

function cleanText(value?: string | null) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanSlotOrder(value?: number | null) {
  if (value === null || value === undefined) return null;
  const slotOrder = Number(value);
  return Number.isInteger(slotOrder) && slotOrder >= 0 ? slotOrder : null;
}

export function canonicalCollectionBatchValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Collection batch contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalCollectionBatchValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalCollectionBatchValue(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Collection batch contains an unsupported value.');
}

function canonicalRequestCards(cards: readonly CollectionBatchRequestCard[]) {
  const grouped = new Map<string, {
    cardId: string;
    setId: string;
    language: string;
    quantity: number;
    cardName: string | null;
    cardNumber: string | null;
    imageUrl: string | null;
    setName: string | null;
    notes: string[];
    slotOrder: number | null;
  }>();
  for (const card of cards) {
    const cardId = cleanText(card.cardId);
    const setId = cleanText(card.setId);
    if (!cardId || !setId) continue;
    const key = cardId.toLowerCase();
    const quantity = Math.max(1, Math.round(Number(card.quantity) || 1));
    const note = cleanText(card.notes);
    const slotOrder = cleanSlotOrder(card.slotOrder);
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (note && !existing.notes.includes(note)) existing.notes.push(note);
      existing.cardName ??= cleanText(card.cardName);
      existing.cardNumber ??= cleanText(card.cardNumber);
      existing.imageUrl ??= cleanText(card.imageUrl);
      existing.setName ??= cleanText(card.setName);
      if (slotOrder !== null) {
        existing.slotOrder = existing.slotOrder === null ? slotOrder : Math.min(existing.slotOrder, slotOrder);
      }
      continue;
    }
    grouped.set(key, {
      cardId,
      setId,
      language: cleanText(card.language)?.toLowerCase() ?? 'en',
      quantity,
      cardName: cleanText(card.cardName),
      cardNumber: cleanText(card.cardNumber),
      imageUrl: cleanText(card.imageUrl),
      setName: cleanText(card.setName),
      notes: note ? [note] : [],
      slotOrder,
    });
  }
  return [...grouped.values()]
    .sort((left, right) => left.cardId.localeCompare(right.cardId))
    .map((card) => ({ ...card, notes: card.notes.length ? card.notes.join('\n') : null }));
}

export type CollectionBatchRecoveryIntent = Readonly<{
  schemaVersion: 1;
  sourceSessionId: string;
  binderId: string;
  requestKey: string;
  cards: readonly CollectionBatchRequestCard[];
  payloadSha256: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

export function buildCollectionBatchRecoveryIntent(input: {
  sourceSessionId: string;
  binderId: string;
  cards: readonly CollectionBatchRequestCard[];
  requestKey?: string;
}): CollectionBatchRecoveryIntent {
  const sourceSessionId = cleanText(input.sourceSessionId);
  const binderId = cleanText(input.binderId);
  if (!sourceSessionId || !binderId) throw new Error('Collection recovery identity is incomplete.');
  const cards = Object.freeze(canonicalRequestCards(input.cards).map((card) => Object.freeze(card)));
  if (!cards.length) throw new Error('Collection recovery intent has no valid cards.');
  const requestKey = createCollectionBatchRequestKey({ sourceSessionId, binderId, cards });
  if (input.requestKey !== undefined && input.requestKey !== requestKey) {
    throw new Error('Collection recovery request key does not match its exact cards.');
  }
  const body = Object.freeze({
    schemaVersion: 1 as const,
    sourceSessionId,
    binderId,
    requestKey,
    cards,
  });
  return Object.freeze({
    ...body,
    payloadSha256: sha256Text(canonicalCollectionBatchValue(body)),
  });
}

export function parseCollectionBatchRecoveryIntent(
  value: unknown,
  expectedSourceSessionId: string,
): CollectionBatchRecoveryIntent {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'sourceSessionId',
    'binderId',
    'requestKey',
    'cards',
    'payloadSha256',
  ])) {
    throw new Error('Saved collection recovery intent has an invalid shape.');
  }
  if (value.schemaVersion !== 1
    || typeof value.sourceSessionId !== 'string'
    || typeof value.binderId !== 'string'
    || typeof value.requestKey !== 'string'
    || !Array.isArray(value.cards)
    || typeof value.payloadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.payloadSha256)) {
    throw new Error('Saved collection recovery intent is invalid.');
  }
  const sourceSessionId = cleanText(expectedSourceSessionId);
  if (!sourceSessionId || value.sourceSessionId !== sourceSessionId) {
    throw new Error('Saved collection recovery intent belongs to another scan session.');
  }
  const rebuilt = buildCollectionBatchRecoveryIntent({
    sourceSessionId: value.sourceSessionId,
    binderId: value.binderId,
    cards: value.cards as CollectionBatchRequestCard[],
    requestKey: value.requestKey,
  });
  if (rebuilt.payloadSha256 !== value.payloadSha256
    || canonicalCollectionBatchValue(rebuilt) !== canonicalCollectionBatchValue(value)) {
    throw new Error('Saved collection recovery intent failed its integrity check.');
  }
  return rebuilt;
}

export function createCollectionBatchRequestKey(input: {
  sourceSessionId: string;
  binderId: string;
  cards: readonly CollectionBatchRequestCard[];
}) {
  const sourceSessionId = cleanText(input.sourceSessionId);
  const binderId = cleanText(input.binderId);
  if (!sourceSessionId || !binderId) throw new Error('Collection batch request identity is incomplete.');
  const cards = canonicalRequestCards(input.cards);
  if (!cards.length) throw new Error('Collection batch request has no valid cards.');
  return `collection:${sha256Text(canonicalCollectionBatchValue({ binderId, cards, sourceSessionId }))}`;
}

export type CollectionBatchJournalRecoveryDecision = 'replay' | 'resume' | 'block';

export function decideCollectionBatchJournalRecovery(input: {
  state: 'pending' | 'committed';
  baselineMatches: boolean;
  expectedMatches: boolean;
}): CollectionBatchJournalRecoveryDecision {
  if (input.state === 'committed') return input.expectedMatches ? 'replay' : 'block';
  if (input.expectedMatches) return 'replay';
  if (input.baselineMatches) return 'resume';
  return 'block';
}

export function resolveCollectionBatchSlotOrder(input: Readonly<{
  existing: boolean;
  existingSlotOrder: number | null;
  requestedSlotOrder: number | null;
  nextSlotOrder: number;
}>): number | null {
  if (input.existing) return input.existingSlotOrder;
  if (input.requestedSlotOrder !== null) return input.requestedSlotOrder;
  return input.nextSlotOrder;
}

export function createCollectionBatchRequestCoordinator() {
  const requests = new Map<string, CollectionBatchRequestEntry<unknown>>();
  return Object.freeze({
    async execute<T>(input: {
      requestKey: string;
      fingerprint: string;
      invoke: () => Promise<T>;
    }): Promise<{ value: T; replayed: boolean }> {
      if (!/^collection:[0-9a-f]{64}$/.test(input.requestKey)
        || !/^[0-9a-f]{64}$/.test(input.fingerprint)) {
        throw new Error('Collection batch request key or fingerprint is invalid.');
      }
      const existing = requests.get(input.requestKey) as CollectionBatchRequestEntry<T> | undefined;
      if (existing) {
        if (existing.fingerprint !== input.fingerprint) {
          throw new Error('Collection batch request key is already bound to different cards.');
        }
        if (existing.state === 'reconciliation_required') {
          throw new CollectionBatchReconciliationRequiredError(input.requestKey);
        }
        if (existing.state === 'committed') return { value: existing.value, replayed: true };
        return { value: await existing.operation, replayed: true };
      }

      const operation = Promise.resolve().then(input.invoke);
      requests.set(input.requestKey, { state: 'pending', fingerprint: input.fingerprint, operation });
      try {
        const value = await operation;
        requests.set(input.requestKey, { state: 'committed', fingerprint: input.fingerprint, value });
        return { value, replayed: false };
      } catch (error) {
        if (isCollectionBatchReconciliationRequired(error)) {
          requests.set(input.requestKey, { state: 'reconciliation_required', fingerprint: input.fingerprint });
        } else {
          requests.delete(input.requestKey);
        }
        throw error;
      }
    },
  });
}
