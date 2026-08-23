import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchBinderById, invalidateBinderCaches } from './binders';
import {
  canonicalCollectionBatchValue,
  buildCollectionBatchRecoveryIntent,
  createCollectionBatchRequestCoordinator,
  CollectionBatchReconciliationRequiredError,
  decideCollectionBatchJournalRecovery,
  isCollectionBatchReconciliationRequired,
  parseCollectionBatchRecoveryIntent,
  resolveCollectionBatchSlotOrder,
  type CollectionBatchRecoveryIntent,
} from './collectionBatchIdempotency';
import { normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';
import { sha256Text } from './sha256';
import { supabase } from './supabase';

export {
  createCollectionBatchRequestKey,
  CollectionBatchReconciliationRequiredError,
  isCollectionBatchReconciliationRequired,
} from './collectionBatchIdempotency';
export type { CollectionBatchRecoveryIntent } from './collectionBatchIdempotency';

export type CollectionBatchCard = {
  cardId: string;
  setId: string;
  language?: PokemonCardLanguage | string | null;
  quantity?: number;
  cardName?: string | null;
  cardNumber?: string | null;
  imageUrl?: string | null;
  setName?: string | null;
  notes?: string | null;
  slotOrder?: number | null;
};

export type CollectionBatchEntry = CollectionBatchCard & {
  language: PokemonCardLanguage;
  quantity: number;
  notes: string | null;
};

export type CollectionBatchSaveResult = {
  requestKey: string;
  replayed: boolean;
  distinctCards: number;
  copiesAdded: number;
  newCards: number;
  incrementedCards: number;
};

type BinderCardRow = {
  id: string;
  card_id: string;
  set_id: string;
  language: string | null;
  slot_order: number | null;
  owned: boolean | null;
  owned_quantity: number | null;
  condition: string | null;
  notes: string | null;
  card_name: string | null;
  card_number: string | null;
  image_url: string | null;
  set_name: string | null;
};

type ExpectedBinderCard = Readonly<{
  cardId: string;
  ownedQuantity: number;
  contentFingerprint: string;
}>;

type BaselineBinderCard = Readonly<{
  cardId: string;
  exists: boolean;
  owned: boolean | null;
  ownedQuantity: number | null;
  rowFingerprint: string | null;
}>;

type CollectionBatchBaseResult = Omit<CollectionBatchSaveResult, 'requestKey' | 'replayed'>;

type CollectionBatchJournal = Readonly<{
  schemaVersion: 1;
  requestKey: string;
  fingerprint: string;
  binderId: string;
  state: 'pending' | 'committed';
  baseline: readonly BaselineBinderCard[];
  expected: readonly ExpectedBinderCard[];
  result: CollectionBatchBaseResult;
}>;

type CollectionBatchExecutionResult = CollectionBatchBaseResult & Readonly<{
  durablyReplayed: boolean;
}>;

type CollectionBatchMutationPlan = Readonly<{
  entry: CollectionBatchEntry;
  existing: BinderCardRow | null;
  row: Readonly<Record<string, string | number | boolean | null>>;
  expectedQuantity: number;
}>;

const COLLECTION_BATCH_JOURNAL_PREFIX = 'stackr:collection-batch:v1';
const COLLECTION_BATCH_RECOVERY_PREFIX = 'stackr:collection-batch-recovery:v1';

function cleanText(value?: string | null) {
  const text = String(value ?? '').trim();
  return text || null;
}

function joinNotes(values: (string | null | undefined)[]) {
  const notes = [...new Set(values.map(cleanText).filter((value): value is string => Boolean(value)))];
  return notes.length ? notes.join('\n') : null;
}

function cleanSlotOrder(value?: number | null) {
  if (value === null || value === undefined) return null;
  const slotOrder = Number(value);
  return Number.isInteger(slotOrder) && slotOrder >= 0 ? slotOrder : null;
}

export function aggregateCollectionBatch(
  cards: CollectionBatchCard[],
  defaultLanguage: PokemonCardLanguage | string | null = 'en'
) {
  const entries = new Map<string, CollectionBatchEntry>();
  for (const card of cards) {
    const cardId = cleanText(card.cardId);
    const setId = cleanText(card.setId);
    if (!cardId || !setId) continue;
    const language = normalizePokemonCardLanguage(card.language ?? defaultLanguage);
    const key = cardId.toLowerCase();
    const quantity = Math.max(1, Math.round(Number(card.quantity) || 1));
    const slotOrder = cleanSlotOrder(card.slotOrder);
    const existing = entries.get(key);
    if (existing) {
      entries.set(key, {
        ...existing,
        quantity: existing.quantity + quantity,
        cardName: existing.cardName ?? cleanText(card.cardName),
        cardNumber: existing.cardNumber ?? cleanText(card.cardNumber),
        imageUrl: existing.imageUrl ?? cleanText(card.imageUrl),
        setName: existing.setName ?? cleanText(card.setName),
        notes: joinNotes([existing.notes, card.notes]),
        slotOrder: slotOrder === null
          ? existing.slotOrder
          : Math.min(existing.slotOrder ?? slotOrder, slotOrder),
      });
      continue;
    }
    entries.set(key, {
      ...card,
      cardId,
      setId,
      language,
      quantity,
      cardName: cleanText(card.cardName),
      cardNumber: cleanText(card.cardNumber),
      imageUrl: cleanText(card.imageUrl),
      setName: cleanText(card.setName),
      notes: cleanText(card.notes),
      slotOrder,
    });
  }
  return [...entries.values()].sort((left, right) => left.cardId.localeCompare(right.cardId));
}

const collectionBatchCoordinator = createCollectionBatchRequestCoordinator();

async function loadBinderCardRows(binderId: string): Promise<BinderCardRow[]> {
  const { data, error } = await supabase
    .from('binder_cards')
    .select('id, card_id, set_id, language, slot_order, owned, owned_quantity, condition, notes, card_name, card_number, image_url, set_name')
    .eq('binder_id', binderId);
  if (error) throw error;
  return (data ?? []) as BinderCardRow[];
}

function indexBinderRows(rows: BinderCardRow[]) {
  const byCardId = new Map<string, BinderCardRow>();
  for (const row of rows) {
    const key = String(row.card_id).toLowerCase();
    if (byCardId.has(key)) throw new Error('Binder contains duplicate card rows and must be repaired before adding a batch.');
    byCardId.set(key, row);
  }
  return byCardId;
}

function exactOwnedQuantity(value: number | null) {
  if (value === null) return null;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Binder contains an invalid owned quantity and must be repaired before adding a batch.');
  }
  return quantity;
}

function binderRowFingerprint(row: BinderCardRow) {
  return sha256Text(canonicalCollectionBatchValue({
    id: row.id,
    cardId: row.card_id,
    setId: row.set_id,
    language: row.language,
    slotOrder: row.slot_order,
    owned: row.owned,
    ownedQuantity: row.owned_quantity,
    condition: row.condition,
    notes: row.notes,
    cardName: row.card_name,
    cardNumber: row.card_number,
    imageUrl: row.image_url,
    setName: row.set_name,
  }));
}

function binderRowContentFingerprint(row: Omit<BinderCardRow, 'id'>) {
  return sha256Text(canonicalCollectionBatchValue({
    cardId: row.card_id,
    setId: row.set_id,
    language: row.language,
    slotOrder: row.slot_order,
    owned: row.owned,
    ownedQuantity: row.owned_quantity,
    condition: row.condition,
    notes: row.notes,
    cardName: row.card_name,
    cardNumber: row.card_number,
    imageUrl: row.image_url,
    setName: row.set_name,
  }));
}

function expectedBinderStateMatches(rows: BinderCardRow[], expected: readonly ExpectedBinderCard[]) {
  let byCardId: Map<string, BinderCardRow>;
  try {
    byCardId = indexBinderRows(rows);
  } catch {
    return false;
  }
  return expected.every((item) => {
    const row = byCardId.get(item.cardId.toLowerCase());
    if (!row) return false;
    return row.owned === true
      && Math.max(0, Math.round(Number(row.owned_quantity) || 0)) === item.ownedQuantity
      && binderRowContentFingerprint(row) === item.contentFingerprint;
  });
}

function baselineBinderStateMatches(rows: BinderCardRow[], baseline: readonly BaselineBinderCard[]) {
  let byCardId: Map<string, BinderCardRow>;
  try {
    byCardId = indexBinderRows(rows);
  } catch {
    return false;
  }
  return baseline.every((item) => {
    const row = byCardId.get(item.cardId.toLowerCase());
    if (!item.exists) return !row;
    if (!row) return false;
    try {
      return row.owned === item.owned
        && exactOwnedQuantity(row.owned_quantity) === item.ownedQuantity
        && binderRowFingerprint(row) === item.rowFingerprint;
    } catch {
      return false;
    }
  });
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(record).sort().join('\u0000') === [...keys].sort().join('\u0000');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateCollectionBatchJournal(
  value: unknown,
  input: { requestKey: string; fingerprint: string; binderId: string; batch: CollectionBatchEntry[] },
): CollectionBatchJournal {
  const fail = (): never => {
    throw new CollectionBatchReconciliationRequiredError(input.requestKey);
  };
  if (!isRecord(value)) {
    throw new CollectionBatchReconciliationRequiredError(input.requestKey);
  }
  const journalRecord = value;
  if (!hasExactKeys(journalRecord, [
    'schemaVersion', 'requestKey', 'fingerprint', 'binderId', 'state', 'baseline', 'expected', 'result',
  ])) fail();
  if (journalRecord.schemaVersion !== 1
    || journalRecord.requestKey !== input.requestKey
    || journalRecord.fingerprint !== input.fingerprint
    || journalRecord.binderId !== input.binderId
    || (journalRecord.state !== 'pending' && journalRecord.state !== 'committed')) fail();
  const state = journalRecord.state as 'pending' | 'committed';
  if (!Array.isArray(journalRecord.baseline) || !Array.isArray(journalRecord.expected)) {
    throw new CollectionBatchReconciliationRequiredError(input.requestKey);
  }
  const baselineValues = journalRecord.baseline;
  const expectedValues = journalRecord.expected;
  if (!isRecord(journalRecord.result)) {
    throw new CollectionBatchReconciliationRequiredError(input.requestKey);
  }
  const resultValue = journalRecord.result;
  if (baselineValues.length !== input.batch.length
    || expectedValues.length !== input.batch.length) fail();

  const baseline: BaselineBinderCard[] = [];
  const expected: ExpectedBinderCard[] = [];
  for (let index = 0; index < input.batch.length; index += 1) {
    const baselineValue = baselineValues[index];
    const expectedValue = expectedValues[index];
    const entry = input.batch[index];
    if (!entry || !isRecord(baselineValue) || !isRecord(expectedValue)) fail();
    if (!hasExactKeys(baselineValue, ['cardId', 'exists', 'owned', 'ownedQuantity', 'rowFingerprint'])
      || !hasExactKeys(expectedValue, ['cardId', 'ownedQuantity', 'contentFingerprint'])
      || baselineValue.cardId !== entry.cardId
      || expectedValue.cardId !== entry.cardId
      || typeof baselineValue.exists !== 'boolean'
      || (baselineValue.owned !== null && typeof baselineValue.owned !== 'boolean')
      || (baselineValue.ownedQuantity !== null && !isNonNegativeInteger(baselineValue.ownedQuantity))
      || (baselineValue.rowFingerprint !== null
        && (typeof baselineValue.rowFingerprint !== 'string'
          || !/^[0-9a-f]{64}$/.test(baselineValue.rowFingerprint)))
      || !isNonNegativeInteger(expectedValue.ownedQuantity)
      || typeof expectedValue.contentFingerprint !== 'string'
      || !/^[0-9a-f]{64}$/.test(expectedValue.contentFingerprint)) fail();

    const exists = baselineValue.exists as boolean;
    const owned = baselineValue.owned as boolean | null;
    const ownedQuantity = baselineValue.ownedQuantity as number | null;
    const rowFingerprint = baselineValue.rowFingerprint as string | null;
    if ((!exists && (owned !== null || ownedQuantity !== null || rowFingerprint !== null))
      || (exists && rowFingerprint === null)) fail();
    const currentOwnedQuantity = exists && owned === true ? ownedQuantity ?? 0 : 0;
    if (expectedValue.ownedQuantity !== currentOwnedQuantity + entry.quantity) fail();
    baseline.push(Object.freeze({ cardId: entry.cardId, exists, owned, ownedQuantity, rowFingerprint }));
    expected.push(Object.freeze({
      cardId: entry.cardId,
      ownedQuantity: expectedValue.ownedQuantity,
      contentFingerprint: expectedValue.contentFingerprint,
    }));
  }

  const result = resultValue;
  if (!hasExactKeys(result, ['distinctCards', 'copiesAdded', 'newCards', 'incrementedCards'])
    || !isNonNegativeInteger(result.distinctCards)
    || !isNonNegativeInteger(result.copiesAdded)
    || !isNonNegativeInteger(result.newCards)
    || !isNonNegativeInteger(result.incrementedCards)
    || result.distinctCards !== input.batch.length
    || result.copiesAdded !== input.batch.reduce((sum, entry) => sum + entry.quantity, 0)
    || result.newCards !== baseline.filter((item) => !item.exists).length
    || result.incrementedCards !== baseline.filter((item) => item.exists).length) fail();
  const parsedResult: CollectionBatchBaseResult = Object.freeze({
    distinctCards: result.distinctCards as number,
    copiesAdded: result.copiesAdded as number,
    newCards: result.newCards as number,
    incrementedCards: result.incrementedCards as number,
  });

  return Object.freeze({
    schemaVersion: 1,
    requestKey: input.requestKey,
    fingerprint: input.fingerprint,
    binderId: input.binderId,
    state,
    baseline: Object.freeze(baseline),
    expected: Object.freeze(expected),
    result: parsedResult,
  });
}

function collectionBatchJournalStorageKey(requestKey: string) {
  return `${COLLECTION_BATCH_JOURNAL_PREFIX}:${requestKey}`;
}

function serializeCollectionBatchJournal(journal: CollectionBatchJournal) {
  return canonicalCollectionBatchValue(journal);
}

async function readCollectionBatchJournal(input: {
  requestKey: string;
  fingerprint: string;
  binderId: string;
  batch: CollectionBatchEntry[];
}) {
  try {
    const raw = await AsyncStorage.getItem(collectionBatchJournalStorageKey(input.requestKey));
    if (raw === null) return null;
    return validateCollectionBatchJournal(JSON.parse(raw), input);
  } catch (error) {
    if (isCollectionBatchReconciliationRequired(error)) throw error;
    throw new CollectionBatchReconciliationRequiredError(input.requestKey, { cause: error });
  }
}

async function persistVerifiedCollectionBatchJournal(journal: CollectionBatchJournal) {
  const storageKey = collectionBatchJournalStorageKey(journal.requestKey);
  const serialized = serializeCollectionBatchJournal(journal);
  try {
    await AsyncStorage.setItem(storageKey, serialized);
    const verified = await AsyncStorage.getItem(storageKey);
    if (verified !== serialized) throw new Error('Collection save journal could not be verified.');
  } catch (error) {
    throw new CollectionBatchReconciliationRequiredError(journal.requestKey, { cause: error });
  }
}

function collectionBatchRecoveryStorageKey(sourceSessionId: string) {
  return `${COLLECTION_BATCH_RECOVERY_PREFIX}:${sha256Text(sourceSessionId)}`;
}

export async function persistVerifiedCollectionBatchRecoveryIntent(input: {
  sourceSessionId: string;
  binderId: string;
  cards: readonly CollectionBatchCard[];
  requestKey: string;
}): Promise<CollectionBatchRecoveryIntent> {
  const intent = buildCollectionBatchRecoveryIntent(input);
  const storageKey = collectionBatchRecoveryStorageKey(intent.sourceSessionId);
  const serialized = canonicalCollectionBatchValue(intent);
  try {
    const existingRaw = await AsyncStorage.getItem(storageKey);
    if (existingRaw !== null) {
      const existing = parseCollectionBatchRecoveryIntent(JSON.parse(existingRaw), intent.sourceSessionId);
      if (canonicalCollectionBatchValue(existing) !== serialized) {
        throw new Error('This scan session already has a different unresolved binder save.');
      }
      return existing;
    }
    await AsyncStorage.setItem(storageKey, serialized);
    const verifiedRaw = await AsyncStorage.getItem(storageKey);
    if (verifiedRaw !== serialized) throw new Error('Collection recovery intent could not be verified.');
    return parseCollectionBatchRecoveryIntent(JSON.parse(verifiedRaw), intent.sourceSessionId);
  } catch (error) {
    throw new CollectionBatchReconciliationRequiredError(intent.requestKey, { cause: error });
  }
}

export async function loadCollectionBatchRecoveryIntent(
  sourceSessionId: string,
): Promise<CollectionBatchRecoveryIntent | null> {
  const cleanSourceSessionId = cleanText(sourceSessionId);
  if (!cleanSourceSessionId) throw new Error('Collection recovery scan session is missing.');
  try {
    const raw = await AsyncStorage.getItem(collectionBatchRecoveryStorageKey(cleanSourceSessionId));
    if (raw === null) return null;
    return parseCollectionBatchRecoveryIntent(JSON.parse(raw), cleanSourceSessionId);
  } catch (error) {
    throw new Error('The saved binder recovery data failed its integrity check. Verify the binder before retrying.', {
      cause: error,
    });
  }
}

export async function clearCollectionBatchRecoveryIntent(sourceSessionId: string) {
  const cleanSourceSessionId = cleanText(sourceSessionId);
  if (!cleanSourceSessionId) throw new Error('Collection recovery scan session is missing.');
  const storageKey = collectionBatchRecoveryStorageKey(cleanSourceSessionId);
  await AsyncStorage.removeItem(storageKey);
  if (await AsyncStorage.getItem(storageKey) !== null) {
    throw new Error('Collection recovery intent could not be cleared after a verified save.');
  }
}

function buildCollectionBatchPlan(input: {
  requestKey: string;
  fingerprint: string;
  binderId: string;
  batch: CollectionBatchEntry[];
  binderDefaultCondition: string | null | undefined;
  existingRows: BinderCardRow[];
}) {
  const existingByCardId = indexBinderRows(input.existingRows);
  let maxSlot = input.existingRows.reduce(
    (maximum, row) => Math.max(maximum, Number(row.slot_order) || 0),
    -1,
  );
  const baseline: BaselineBinderCard[] = [];
  const expected: ExpectedBinderCard[] = [];
  const plans: CollectionBatchMutationPlan[] = [];

  for (const entry of input.batch) {
    const existing = existingByCardId.get(entry.cardId.toLowerCase()) ?? null;
    const rawOwnedQuantity = existing ? exactOwnedQuantity(existing.owned_quantity) : null;
    const currentOwnedQuantity = existing?.owned === true ? rawOwnedQuantity ?? 0 : 0;
    const expectedQuantity = currentOwnedQuantity + entry.quantity;
    const slotOrder = resolveCollectionBatchSlotOrder({
      existing: existing !== null,
      existingSlotOrder: existing?.slot_order ?? null,
      requestedSlotOrder: entry.slotOrder ?? null,
      nextSlotOrder: maxSlot + 1,
    });
    if (!existing && slotOrder !== null) maxSlot = Math.max(maxSlot, slotOrder);
    const row = Object.freeze({
      binder_id: input.binderId,
      card_id: entry.cardId,
      set_id: entry.setId,
      language: entry.language,
      card_name: entry.cardName ?? existing?.card_name ?? null,
      card_number: entry.cardNumber ?? existing?.card_number ?? null,
      image_url: entry.imageUrl ?? existing?.image_url ?? null,
      set_name: entry.setName ?? existing?.set_name ?? null,
      slot_order: slotOrder,
      owned: true,
      owned_quantity: expectedQuantity,
      condition: existing?.condition ?? input.binderDefaultCondition ?? 'Near Mint',
      notes: joinNotes([existing?.notes, entry.notes]) ?? '',
    });
    baseline.push(Object.freeze({
      cardId: entry.cardId,
      exists: Boolean(existing),
      owned: existing?.owned ?? null,
      ownedQuantity: rawOwnedQuantity,
      rowFingerprint: existing ? binderRowFingerprint(existing) : null,
    }));
    expected.push(Object.freeze({
      cardId: entry.cardId,
      ownedQuantity: expectedQuantity,
      contentFingerprint: binderRowContentFingerprint(row),
    }));
    plans.push(Object.freeze({
      entry,
      existing,
      expectedQuantity,
      row,
    }));
  }

  const result = Object.freeze({
    distinctCards: input.batch.length,
    copiesAdded: input.batch.reduce((sum, entry) => sum + entry.quantity, 0),
    newCards: baseline.filter((item) => !item.exists).length,
    incrementedCards: baseline.filter((item) => item.exists).length,
  });
  const journal: CollectionBatchJournal = Object.freeze({
    schemaVersion: 1,
    requestKey: input.requestKey,
    fingerprint: input.fingerprint,
    binderId: input.binderId,
    state: 'pending',
    baseline: Object.freeze(baseline),
    expected: Object.freeze(expected),
    result,
  });
  return Object.freeze({ journal, plans });
}

async function saveCollectionBatchOnce(input: {
  requestKey: string;
  fingerprint: string;
  binderId: string;
  batch: CollectionBatchEntry[];
  binderDefaultCondition: string | null | undefined;
}): Promise<CollectionBatchExecutionResult> {
  const existingRows = await loadBinderCardRows(input.binderId);
  const storedJournal = await readCollectionBatchJournal(input);
  let plan: ReturnType<typeof buildCollectionBatchPlan>;

  if (storedJournal) {
    const decision = decideCollectionBatchJournalRecovery({
      state: storedJournal.state,
      baselineMatches: baselineBinderStateMatches(existingRows, storedJournal.baseline),
      expectedMatches: expectedBinderStateMatches(existingRows, storedJournal.expected),
    });
    if (decision === 'block') {
      throw new CollectionBatchReconciliationRequiredError(input.requestKey);
    }
    if (decision === 'replay') {
      if (storedJournal.state !== 'committed') {
        await persistVerifiedCollectionBatchJournal(Object.freeze({ ...storedJournal, state: 'committed' }));
      }
      return { ...storedJournal.result, durablyReplayed: true };
    }
    plan = buildCollectionBatchPlan({ ...input, existingRows });
    if (serializeCollectionBatchJournal(plan.journal) !== serializeCollectionBatchJournal(storedJournal)) {
      throw new CollectionBatchReconciliationRequiredError(input.requestKey);
    }
  } else {
    plan = buildCollectionBatchPlan({ ...input, existingRows });
  }

  await persistVerifiedCollectionBatchJournal(plan.journal);
  let mutationStarted = false;

  try {
    for (const mutation of plan.plans) {
      mutationStarted = true;
      if (mutation.existing) {
        let update = supabase
          .from('binder_cards')
          .update(mutation.row)
          .eq('id', mutation.existing.id)
          .eq('binder_id', input.binderId)
          .eq('card_id', mutation.existing.card_id)
          .eq('set_id', mutation.existing.set_id);
        update = mutation.existing.language === null
          ? update.is('language', null)
          : update.eq('language', mutation.existing.language);
        update = mutation.existing.slot_order === null
          ? update.is('slot_order', null)
          : update.eq('slot_order', mutation.existing.slot_order);
        update = mutation.existing.owned === null
          ? update.is('owned', null)
          : update.eq('owned', mutation.existing.owned);
        update = mutation.existing.owned_quantity === null
          ? update.is('owned_quantity', null)
          : update.eq('owned_quantity', mutation.existing.owned_quantity);
        update = mutation.existing.condition === null
          ? update.is('condition', null)
          : update.eq('condition', mutation.existing.condition);
        update = mutation.existing.notes === null
          ? update.is('notes', null)
          : update.eq('notes', mutation.existing.notes);
        update = mutation.existing.card_name === null
          ? update.is('card_name', null)
          : update.eq('card_name', mutation.existing.card_name);
        update = mutation.existing.card_number === null
          ? update.is('card_number', null)
          : update.eq('card_number', mutation.existing.card_number);
        update = mutation.existing.image_url === null
          ? update.is('image_url', null)
          : update.eq('image_url', mutation.existing.image_url);
        update = mutation.existing.set_name === null
          ? update.is('set_name', null)
          : update.eq('set_name', mutation.existing.set_name);
        const { data, error } = await update
          .select('id, card_id, owned, owned_quantity')
          .maybeSingle();
        if (error) throw error;
        if (!data || Number(data.owned_quantity) !== mutation.expectedQuantity || data.owned !== true) {
          throw new Error('Binder quantity changed concurrently before this batch could be applied.');
        }
      } else {
        const { data, error } = await supabase
          .from('binder_cards')
          .insert(mutation.row)
          .select('id, card_id, owned, owned_quantity')
          .single();
        if (error) throw error;
        if (!data || Number(data.owned_quantity) !== mutation.expectedQuantity || data.owned !== true) {
          throw new Error('New binder card could not be verified after insert.');
        }
      }
    }

    const verifiedRows = await loadBinderCardRows(input.binderId);
    if (!expectedBinderStateMatches(verifiedRows, plan.journal.expected)) {
      throw new CollectionBatchReconciliationRequiredError(input.requestKey);
    }
    await persistVerifiedCollectionBatchJournal(Object.freeze({ ...plan.journal, state: 'committed' }));
  } catch (error) {
    if (!mutationStarted || isCollectionBatchReconciliationRequired(error)) throw error;
    try {
      const reconciledRows = await loadBinderCardRows(input.binderId);
      if (expectedBinderStateMatches(reconciledRows, plan.journal.expected)) {
        await persistVerifiedCollectionBatchJournal(Object.freeze({ ...plan.journal, state: 'committed' }));
        return { ...plan.journal.result, durablyReplayed: false };
      }
    } catch {
      // The original write outcome remains unprovable, so the request must stay locked.
    }
    throw new CollectionBatchReconciliationRequiredError(input.requestKey, { cause: error });
  }

  return { ...plan.journal.result, durablyReplayed: false };
}

export async function addOwnedCardBatchToBinder(
  binderId: string,
  cards: CollectionBatchCard[],
  options: { requestKey: string },
): Promise<CollectionBatchSaveResult> {
  const binder = await fetchBinderById(binderId);
  if (!binder) throw new Error('The selected binder could not be found.');

  const defaultLanguage = normalizePokemonCardLanguage(binder.language ?? 'en');
  const batch = aggregateCollectionBatch(cards, defaultLanguage);
  if (!batch.length) {
    return {
      requestKey: options.requestKey,
      replayed: false,
      distinctCards: 0,
      copiesAdded: 0,
      newCards: 0,
      incrementedCards: 0,
    };
  }

  const fingerprint = sha256Text(canonicalCollectionBatchValue({ binderId, batch }));
  const execution = await collectionBatchCoordinator.execute({
    requestKey: options.requestKey,
    fingerprint,
    invoke: () => saveCollectionBatchOnce({
      requestKey: options.requestKey,
      fingerprint,
      binderId,
      batch,
      binderDefaultCondition: binder.default_condition,
    }),
  });

  invalidateBinderCaches(binderId);
  const { durablyReplayed, ...result } = execution.value;
  return {
    requestKey: options.requestKey,
    replayed: execution.replayed || durablyReplayed,
    ...result,
  };
}
