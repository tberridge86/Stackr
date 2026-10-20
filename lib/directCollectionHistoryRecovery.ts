import AsyncStorage from '@react-native-async-storage/async-storage';
import { createActivityPost } from './activity';
import { sha256Text } from './collectionRequestHash';
import { canonicalCollectionBatchValue } from './collectionBatchIdempotency';

type DirectCollectionHistoryActivity = Parameters<typeof createActivityPost>[0];

export type DirectCollectionHistoryIntent = Readonly<{
  schemaVersion: 1;
  ownerUserId: string;
  eventId: string;
  activity: DirectCollectionHistoryActivity;
  payloadSha256: string;
}>;

export type DirectCollectionHistoryResult =
  | { status: 'created' }
  | { status: 'pending'; error: unknown }
  | { status: 'persistence_failed'; error: unknown };

const STORAGE_PREFIX = 'stackr:direct-collection-history:v1';
const MAX_RECOVERY_ATTEMPTS = 20;
let sequence = 0;
const inFlight = new Map<string, Promise<DirectCollectionHistoryResult>>();

function cleanText(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  return text || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function ownerStoragePrefix(ownerUserId: string) {
  return `${STORAGE_PREFIX}:${sha256Text(ownerUserId)}:`;
}

function storageKey(intent: DirectCollectionHistoryIntent) {
  return `${ownerStoragePrefix(intent.ownerUserId)}${intent.eventId}`;
}

function randomOperationId() {
  const randomUuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : null;
  if (randomUuid) return randomUuid;
  sequence += 1;
  return `${Date.now()}:${sequence}:${Math.random()}`;
}

function stableEventId(value: unknown) {
  const hash = sha256Text(canonicalCollectionBatchValue(value));
  const variantNibble = ((Number.parseInt(hash[16], 16) & 3) | 8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variantNibble}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function freezeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJsonValue));
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) value[key] = freezeJsonValue(nested);
    return Object.freeze(value);
  }
  return value;
}

function immutableActivity(value: DirectCollectionHistoryActivity): DirectCollectionHistoryActivity {
  const cloned = JSON.parse(canonicalCollectionBatchValue(value));
  if (!isRecord(cloned)) throw new Error('Collection history activity is invalid.');
  return freezeJsonValue(cloned) as DirectCollectionHistoryActivity;
}

export function createDirectCollectionHistoryIntent(input: {
  ownerUserId: string;
  activity: DirectCollectionHistoryActivity;
  operationId?: string;
}): DirectCollectionHistoryIntent {
  const ownerUserId = cleanText(input.ownerUserId);
  if (!ownerUserId) throw new Error('Collection history owner is missing.');
  const activity = immutableActivity(input.activity);
  const operationId = cleanText(input.operationId) ?? randomOperationId();
  const eventId = stableEventId({
    purpose: 'direct-collection-history-v1', ownerUserId, operationId, activity,
  });
  const body = {
    schemaVersion: 1 as const,
    ownerUserId,
    eventId,
    activity,
  };
  return Object.freeze({
    ...body,
    payloadSha256: sha256Text(canonicalCollectionBatchValue(body)),
  });
}

export function parseDirectCollectionHistoryIntent(value: unknown): DirectCollectionHistoryIntent {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'ownerUserId', 'eventId', 'activity', 'payloadSha256',
  ])) {
    throw new Error('Saved collection history recovery data has an invalid shape.');
  }
  if (value.schemaVersion !== 1
    || typeof value.ownerUserId !== 'string'
    || !cleanText(value.ownerUserId)
    || typeof value.eventId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId)
    || !isRecord(value.activity)
    || typeof value.payloadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.payloadSha256)) {
    throw new Error('Saved collection history recovery data is invalid.');
  }
  const body = {
    schemaVersion: 1 as const,
    ownerUserId: value.ownerUserId,
    eventId: value.eventId,
    activity: immutableActivity(value.activity as DirectCollectionHistoryActivity),
  };
  if (sha256Text(canonicalCollectionBatchValue(body)) !== value.payloadSha256) {
    throw new Error('Saved collection history recovery data failed its integrity check.');
  }
  return Object.freeze({ ...body, payloadSha256: value.payloadSha256 });
}

export async function persistDirectCollectionHistoryIntent(intent: DirectCollectionHistoryIntent) {
  const key = storageKey(intent);
  const serialized = canonicalCollectionBatchValue(intent);
  try {
    const existing = await AsyncStorage.getItem(key);
    if (existing !== null && existing !== serialized) {
      throw new Error('Collection history recovery key is already bound to another event.');
    }
    if (existing === null) await AsyncStorage.setItem(key, serialized);
    const verified = await AsyncStorage.getItem(key);
    if (verified !== serialized) throw new Error('Collection history recovery data could not be verified.');
  } catch (error) {
    throw new Error('Collection history recovery could not be stored.', { cause: error });
  }
}

async function clearDirectCollectionHistoryIntent(intent: DirectCollectionHistoryIntent) {
  try {
    await AsyncStorage.removeItem(storageKey(intent));
  } catch {
    // The event is already server-idempotent. Retaining a verified intent is safe.
  }
}

async function writePersistedDirectCollectionHistory(intent: DirectCollectionHistoryIntent): Promise<DirectCollectionHistoryResult> {
  try {
    const result = await createActivityPost(intent.activity, {
      expectedUserId: intent.ownerUserId,
      eventId: intent.eventId,
    });
    if (result.status === 'created') {
      await clearDirectCollectionHistoryIntent(intent);
      return { status: 'created' };
    }
    return { status: 'pending', error: result.status === 'signed_out' ? new Error('activity_post_identity_changed') : result.error };
  } catch (error) {
    return { status: 'pending', error };
  }
}

function coordinate(intent: DirectCollectionHistoryIntent) {
  const key = storageKey(intent);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const operation = writePersistedDirectCollectionHistory(intent).finally(() => {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  });
  inFlight.set(key, operation);
  return operation;
}

/**
 * Call only after the independent holding write is known to have committed.
 * This journal never contains a holding mutation, so every recovery is history-only.
 */
export async function recordDirectCollectionHistory(intent: DirectCollectionHistoryIntent): Promise<DirectCollectionHistoryResult> {
  try {
    await persistDirectCollectionHistoryIntent(intent);
  } catch (error) {
    // A best-effort immediate write can still complete the event, but a failure is
    // returned to the caller because it is not durable across restart.
    try {
      const result = await createActivityPost(intent.activity, {
        expectedUserId: intent.ownerUserId,
        eventId: intent.eventId,
      });
      if (result.status === 'created') return { status: 'created' };
      return { status: 'persistence_failed', error };
    } catch {
      return { status: 'persistence_failed', error };
    }
  }
  return coordinate(intent);
}

export async function recoverDirectCollectionHistory(ownerUserId: string, limit = MAX_RECOVERY_ATTEMPTS) {
  const owner = cleanText(ownerUserId);
  if (!owner) return { attempted: 0, completed: 0, pending: 0, invalid: 0 };
  const boundedLimit = Math.max(0, Math.min(MAX_RECOVERY_ATTEMPTS, Math.floor(limit)));
  const prefix = ownerStoragePrefix(owner);
  const keys = (await AsyncStorage.getAllKeys())
    .filter((key) => key.startsWith(prefix))
    .sort();
  let completed = 0;
  let pending = 0;
  let invalid = 0;
  let attempted = 0;
  for (const key of keys) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) continue;
      const intent = parseDirectCollectionHistoryIntent(JSON.parse(raw));
      if (intent.ownerUserId !== owner || storageKey(intent) !== key) throw new Error('Collection history recovery owner mismatch.');
      if (attempted >= boundedLimit) continue;
      attempted += 1;
      const result = await coordinate(intent);
      if (result.status === 'created') completed += 1;
      else pending += 1;
    } catch {
      invalid += 1;
    }
  }
  return { attempted, completed, pending, invalid };
}
