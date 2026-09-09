import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CollectionBatchCard } from './collectionBatch';
import { stripTcgdexReferenceBeforePersistence } from './tcgdexControlledCardReference';

export type ManualCollectionDraft = {
  id: string;
  userId: string;
  card: CollectionBatchCard;
  binderId: string | null;
  quantity: number;
  state: 'review' | 'saving' | 'saved';
  updatedAt: string;
};
const operations = new Map<string, Promise<unknown>>();
const storageKey = (userId: string) => `stackr:manual-collection-review:v1:${userId}`;

export function parseManualCollectionDraft(raw: string | null, userId: string): ManualCollectionDraft | null {
  if (raw === null) return null;
  let value: ManualCollectionDraft;
  try { value = JSON.parse(raw) as ManualCollectionDraft; }
  catch { throw new Error('The saved collection review could not be verified.'); }
  const nonempty = (input: unknown): input is string => typeof input === 'string' && input.trim().length > 0;
  if (!value || value.userId !== userId.trim() || !nonempty(value.id) || !nonempty(value.card?.cardId) || !nonempty(value.card?.setId)
    || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 999
    || !['review', 'saving', 'saved'].includes(value.state)
    || (value.binderId !== null && !nonempty(value.binderId))
    || (value.state !== 'review' && !nonempty(value.binderId))) {
    throw new Error('The saved collection review could not be verified.');
  }
  return value;
}

export async function loadManualCollectionDraft(userId: string) {
  userId = userId.trim();
  if (!userId.trim()) throw new Error('Sign in to resume this collection review.');
  await operations.get(userId)?.catch(() => undefined);
  return parseManualCollectionDraft(await AsyncStorage.getItem(storageKey(userId)), userId);
}

function serialized<T>(userId: string, run: () => Promise<T>): Promise<T> {
  const operation = (operations.get(userId) ?? Promise.resolve()).catch(() => undefined).then(run);
  operations.set(userId, operation);
  void operation.finally(() => {
    if (operations.get(userId) === operation) operations.delete(userId);
  }).catch(() => undefined);
  return operation;
}

async function persist(draft: ManualCollectionDraft) {
  const body = JSON.stringify(draft);
  await AsyncStorage.setItem(storageKey(draft.userId), body);
  if (await AsyncStorage.getItem(storageKey(draft.userId)) !== body) {
    throw new Error('Collection review could not be saved on this device. Please try again.');
  }
  return draft;
}

export function createManualCollectionDraft(userId: string, card: CollectionBatchCard) {
  userId = userId.trim();
  if (!userId.trim() || !card.cardId?.trim() || !card.setId?.trim()) throw new Error('Reload this card before adding it.');
  return serialized(userId, async () => {
    const existing = parseManualCollectionDraft(await AsyncStorage.getItem(storageKey(userId)), userId);
    if (existing && existing.state !== 'saved') {
      if (existing.card.cardId === card.cardId && existing.card.setId === card.setId && existing.card.language === card.language) return existing;
      throw new Error('A collection review is already saved. Resume it from Scan before adding another card.');
    }
    return persist({
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId, card: { ...card, imageUrl: stripTcgdexReferenceBeforePersistence(card.imageUrl) },
      binderId: null, quantity: 1, state: 'review', updatedAt: new Date().toISOString(),
    });
  });
}

export function updateManualCollectionDraft(userId: string, id: string, patch: Partial<Pick<ManualCollectionDraft, 'binderId' | 'quantity' | 'state'>>) {
  userId = userId.trim();
  if (!userId) throw new Error('Sign in to resume this collection review.');
  return serialized(userId, async () => {
    const current = parseManualCollectionDraft(await AsyncStorage.getItem(storageKey(userId)), userId);
    if (!current || current.id !== id) throw new Error('This collection review changed. Reopen it from Scan.');
    if (current.state !== 'review' && (patch.binderId !== undefined || patch.quantity !== undefined)) {
      throw new Error('The saved request is locked. Retry its original selection.');
    }
    if (current.state === 'saved' && patch.state !== 'saved') throw new Error('This card has already been added.');
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    parseManualCollectionDraft(JSON.stringify(next), userId);
    return persist(next);
  });
}

export function discardManualCollectionDraft(userId: string, id: string) {
  userId = userId.trim();
  if (!userId) throw new Error('Sign in to resume this collection review.');
  return serialized(userId, async () => {
    const current = parseManualCollectionDraft(await AsyncStorage.getItem(storageKey(userId)), userId);
    if (!current || current.id !== id || current.state !== 'review') throw new Error('A submitted review must be verified before it can be cleared.');
    await AsyncStorage.removeItem(storageKey(userId));
    if (await AsyncStorage.getItem(storageKey(userId)) !== null) throw new Error('Could not discard this review. Please retry.');
  });
}
