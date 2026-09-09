import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addOwnedCardBatchToBinder,
  clearCollectionBatchRecoveryIntent,
  createCollectionBatchRequestKey,
  persistVerifiedCollectionBatchRecoveryIntent,
  sanitizeCollectionBatchCards,
  type CollectionBatchCard,
} from './collectionBatch';
import { addScannedVariantCopy } from './scanVariantOwnership';
import type { ScannedVariantInput } from './scanVariantOwnershipCore';
import { supabase } from './supabase';

const STORAGE_PREFIX = 'stackr:scan-composite-save:v1:owner:';
const MAX_PENDING_OPERATIONS = 8;
const operations = new Map<string, Promise<unknown>>();
const resumeOperations = new Map<string, Promise<unknown>>();

type SavedScanCollectionVariantIntent = Readonly<{
  schemaVersion: 1;
  ownerUserId: string;
  sourceSessionId: string;
  binderId: string;
  cards: readonly CollectionBatchCard[];
  variant: Omit<ScannedVariantInput, 'requestKey'> | null;
}>;

export type ScanCollectionVariantSaveInput = Omit<SavedScanCollectionVariantIntent, 'schemaVersion'>;

const ownerStorageKey = (ownerUserId: string) => `${STORAGE_PREFIX}${encodeURIComponent(ownerUserId)}`;
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function canonical(intent: SavedScanCollectionVariantIntent) {
  return JSON.stringify({
    schemaVersion: intent.schemaVersion,
    ownerUserId: intent.ownerUserId,
    sourceSessionId: intent.sourceSessionId,
    binderId: intent.binderId,
    cards: intent.cards,
    variant: intent.variant,
  });
}

function validateIntent(value: unknown, ownerUserId: string): SavedScanCollectionVariantIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved scan collection recovery data could not be verified.');
  const raw = value as Partial<SavedScanCollectionVariantIntent>;
  const sourceSessionId = clean(raw.sourceSessionId);
  const binderId = clean(raw.binderId);
  if (raw.schemaVersion !== 1 || clean(raw.ownerUserId) !== ownerUserId || !sourceSessionId || !binderId
    || !Array.isArray(raw.cards) || raw.cards.length === 0 || (raw.variant !== null && typeof raw.variant !== 'object')) {
    throw new Error('Saved scan collection recovery data could not be verified.');
  }
  const requestKey = createCollectionBatchRequestKey({ sourceSessionId, binderId, cards: raw.cards });
  if (!requestKey) throw new Error('Saved scan collection recovery data could not be verified.');
  if (raw.variant) {
    const variant = raw.variant as Omit<ScannedVariantInput, 'requestKey'>;
    for (const field of ['userId', 'cardId', 'setId', 'variant', 'condition', 'gradeCompany', 'grade'] as const) {
      if (typeof variant[field] !== 'string' || (field !== 'gradeCompany' && field !== 'grade' && !variant[field].trim())) {
        throw new Error('Saved scan collection recovery data could not be verified.');
      }
    }
    if (variant.userId !== ownerUserId) throw new Error('Saved scan collection recovery data belongs to another account.');
    if (!raw.cards.some((card) => card.cardId === variant.cardId && card.setId === variant.setId)) {
      throw new Error('Saved scan collection variant does not match its card.');
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    ownerUserId,
    sourceSessionId,
    binderId,
    cards: Object.freeze(sanitizeCollectionBatchCards(raw.cards)),
    variant: raw.variant ? Object.freeze({ ...(raw.variant as Omit<ScannedVariantInput, 'requestKey'>) }) : null,
  });
}

async function verifyOwner(ownerUserId: string) {
  const owner = clean(ownerUserId);
  if (!owner) throw new Error('Sign in to resume this saved scan.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (data.user?.id !== owner) throw new Error('This saved scan belongs to another account.');
  return owner;
}

async function loadBucket(ownerUserId: string) {
  const raw = await AsyncStorage.getItem(ownerStorageKey(ownerUserId));
  if (raw === null) return [] as SavedScanCollectionVariantIntent[];
  let values: unknown;
  try { values = JSON.parse(raw); } catch { throw new Error('Saved scan collection recovery data could not be verified.'); }
  if (!Array.isArray(values)) throw new Error('Saved scan collection recovery data could not be verified.');
  return values.map((value) => validateIntent(value, ownerUserId));
}

async function persistBucket(ownerUserId: string, intents: readonly SavedScanCollectionVariantIntent[]) {
  const key = ownerStorageKey(ownerUserId);
  const serialized = JSON.stringify(intents);
  await AsyncStorage.setItem(key, serialized);
  if (await AsyncStorage.getItem(key) !== serialized) throw new Error('Scan recovery data could not be saved on this device.');
}

function serialized<T>(key: string, operation: () => Promise<T>) {
  const previous = operations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  operations.set(key, next);
  const clear = () => { if (operations.get(key) === next) operations.delete(key); };
  void next.then(clear, clear);
  return next;
}

async function persistPending(input: ScanCollectionVariantSaveInput) {
  const ownerUserId = await verifyOwner(input.ownerUserId);
  const intent = validateIntent({ ...input, schemaVersion: 1, ownerUserId }, ownerUserId);
  return serialized(ownerUserId, async () => {
    const pending = await loadBucket(ownerUserId);
    const existing = pending.find((item) => item.sourceSessionId === intent.sourceSessionId);
    if (existing) {
      if (canonical(existing) !== canonical(intent)) throw new Error('This scan already has a different unfinished collection save. Resume or finish that save first.');
      return existing;
    }
    if (pending.length >= MAX_PENDING_OPERATIONS) throw new Error('Finish your saved scans before adding another.');
    await persistBucket(ownerUserId, [...pending, intent]);
    return intent;
  });
}

async function clearPending(ownerUserId: string, sourceSessionId: string) {
  return serialized(ownerUserId, async () => {
    const pending = await loadBucket(ownerUserId);
    await persistBucket(ownerUserId, pending.filter((item) => item.sourceSessionId !== sourceSessionId));
  });
}

async function resumeIntent(intent: SavedScanCollectionVariantIntent) {
  const requestKey = createCollectionBatchRequestKey({ sourceSessionId: intent.sourceSessionId, binderId: intent.binderId, cards: intent.cards });
  const batchIntent = await persistVerifiedCollectionBatchRecoveryIntent({
    sourceSessionId: intent.sourceSessionId,
    binderId: intent.binderId,
    cards: intent.cards,
    requestKey,
  });
  await verifyOwner(intent.ownerUserId);
  const batch = await addOwnedCardBatchToBinder(batchIntent.binderId, [...batchIntent.cards], { requestKey: batchIntent.requestKey });
  const variant = intent.variant ? await addScannedVariantCopy({ ...intent.variant, requestKey: batchIntent.requestKey }) : null;
  await clearCollectionBatchRecoveryIntent(intent.sourceSessionId);
  await clearPending(intent.ownerUserId, intent.sourceSessionId);
  return { intent: batchIntent, batch, variant };
}

/** Persists a full, owner-bound scan operation before writing either collection record. */
export async function saveScanCollectionVariant(input: ScanCollectionVariantSaveInput) {
  const pending = await persistPending(input);
  return serialized(`${pending.ownerUserId}:${pending.sourceSessionId}`, () => resumeIntent(pending));
}

export async function listPendingScanCollectionVariants(ownerUserId: string) {
  const owner = await verifyOwner(ownerUserId);
  return serialized(owner, () => loadBucket(owner));
}

export async function resumePendingScanCollectionVariant(ownerUserId: string, sourceSessionId: string) {
  const owner = await verifyOwner(ownerUserId);
  const source = clean(sourceSessionId);
  if (!source) throw new Error('Saved scan identity is missing.');
  const key = `${owner}:${source}`;
  const inFlight = resumeOperations.get(key);
  if (inFlight) return inFlight as ReturnType<typeof resumeIntent>;
  const operation = serialized(key, async () => {
    const pending = await loadBucket(owner);
    const intent = pending.find((item) => item.sourceSessionId === source);
    if (!intent) throw new Error('This saved scan is no longer available.');
    return resumeIntent(intent);
  });
  resumeOperations.set(key, operation);
  const clear = () => { if (resumeOperations.get(key) === operation) resumeOperations.delete(key); };
  void operation.then(clear, clear);
  return operation;
}
