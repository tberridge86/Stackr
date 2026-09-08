import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BinderPageLayout, BinderPagePocketResult } from './binderPageScan';

export type BinderPageScanSession = {
  scanSessionId: string;
  ownerUserId: string;
  binderId?: string | null;
  layout: BinderPageLayout;
  capturedAt: string;
  originalUri?: string | null;
  pageUri?: string | null;
  processingMs: number;
  pockets: BinderPagePocketResult[];
  reviewState?: 'reviewing' | 'saved';
};

export type BinderPageScanRecoverySummary = {
  totalPockets: number;
  confirmedPockets: number;
  needsReviewPockets: number;
  destinationBinderId: string | null;
};

type ScanStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_PREFIX = 'stackr:binder-page-scan:v1';
const MAX_STORED_SESSIONS = 4;
const sessions = new Map<string, BinderPageScanSession>();
const ownerOperations = new Map<string, Promise<unknown>>();
let storage: ScanStorage = AsyncStorage;

const sessionKey = (scanSessionId: string) => `${STORAGE_PREFIX}:session:${scanSessionId}`;
const ownerIndexKey = (ownerUserId: string) => `${STORAGE_PREFIX}:owner:${ownerUserId}`;

function cleanRequired(value: unknown, label: string) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (!cleaned) throw new Error(`Binder page scan ${label} is missing.`);
  return cleaned;
}

function validateSession(value: unknown): BinderPageScanSession {
  if (!value || typeof value !== 'object') throw new Error('Saved binder page review could not be verified.');
  const session = value as Partial<BinderPageScanSession>;
  const scanSessionId = cleanRequired(session.scanSessionId, 'ID');
  const ownerUserId = cleanRequired(session.ownerUserId, 'owner');
  const layout = Number(session.layout);
  const processingMs = Number(session.processingMs);
  if (!Number.isInteger(layout) || layout < 1 || layout > 5
    || typeof session.capturedAt !== 'string' || !Number.isFinite(processingMs)
    || !Array.isArray(session.pockets) || !['reviewing', 'saved', undefined].includes(session.reviewState)) {
    throw new Error('Saved binder page review could not be verified.');
  }
  return {
    ...session,
    scanSessionId,
    ownerUserId,
    binderId: typeof session.binderId === 'string' ? session.binderId : null,
    layout: layout as BinderPageLayout,
    capturedAt: session.capturedAt,
    processingMs,
    pockets: session.pockets as BinderPagePocketResult[],
    reviewState: session.reviewState ?? 'reviewing',
  };
}

function parseOwnerIndex(raw: string | null) {
  if (raw === null) return [] as string[];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('Saved binder page review index could not be verified.');
  }
  return [...new Set(parsed.map((id) => id.trim()))];
}

function serialize(session: BinderPageScanSession) {
  return JSON.stringify(session);
}

async function persistVerified(key: string, value: string, message: string) {
  await storage.setItem(key, value);
  if (await storage.getItem(key) !== value) throw new Error(message);
}

function serialized<T>(ownerUserId: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerOperations.get(ownerUserId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  ownerOperations.set(ownerUserId, next);
  void next.finally(() => {
    if (ownerOperations.get(ownerUserId) === next) ownerOperations.delete(ownerUserId);
  }).catch(() => undefined);
  return next;
}

function cache(session: BinderPageScanSession) {
  sessions.set(session.scanSessionId, session);
  return session;
}

async function checkpointNow(session: BinderPageScanSession) {
  const indexKey = ownerIndexKey(session.ownerUserId);
  const existingIds = parseOwnerIndex(await storage.getItem(indexKey));
  const existing = await Promise.all(existingIds.map(async (id) => {
    const raw = await storage.getItem(sessionKey(id));
    if (raw === null) throw new Error('Saved binder page review index could not be verified.');
    const stored = validateSession(JSON.parse(raw));
    if (stored.ownerUserId !== session.ownerUserId) throw new Error('Saved binder page review index could not be verified.');
    return stored;
  }));
  const unsaved = existing.filter((stored) => stored.reviewState !== 'saved');
  const isNewUnsaved = session.reviewState !== 'saved' && !existingIds.includes(session.scanSessionId);
  if (isNewUnsaved && unsaved.length >= MAX_STORED_SESSIONS) {
    throw new Error('Finish or discard one of your existing binder page reviews before starting another.');
  }
  const retainedIds = existing
    .filter((stored) => stored.reviewState !== 'saved')
    .map((stored) => stored.scanSessionId)
    .filter((id) => id !== session.scanSessionId);
  const nextIds = session.reviewState === 'saved'
    ? retainedIds
    : [session.scanSessionId, ...retainedIds];
  const body = serialize(session);
  await persistVerified(sessionKey(session.scanSessionId), body, 'Binder page review could not be saved on this device.');
  await persistVerified(indexKey, JSON.stringify(nextIds), 'Binder page review index could not be saved on this device.');
  return cache(session);
}

export async function checkpointBinderPageScanSession(input: BinderPageScanSession) {
  const session = validateSession({ ...input, reviewState: input.reviewState ?? 'reviewing' });
  return serialized(session.ownerUserId, () => checkpointNow(session));
}

export async function loadBinderPageScanSession(scanSessionId: string | null | undefined, ownerUserId: string) {
  if (!scanSessionId) return null;
  const cleanId = cleanRequired(scanSessionId, 'ID');
  const cleanOwner = cleanRequired(ownerUserId, 'owner');
  const raw = await storage.getItem(sessionKey(cleanId));
  if (raw === null) return null;
  const session = validateSession(JSON.parse(raw));
  if (session.ownerUserId !== cleanOwner) return null;
  return cache(session);
}

export async function updateBinderPageScanSession(
  scanSessionId: string,
  ownerUserId: string,
  updater: (session: BinderPageScanSession) => BinderPageScanSession,
) {
  const cleanId = cleanRequired(scanSessionId, 'ID');
  const cleanOwner = cleanRequired(ownerUserId, 'owner');
  return serialized(cleanOwner, async () => {
    const raw = await storage.getItem(sessionKey(cleanId));
    if (raw === null) return null;
    const current = validateSession(JSON.parse(raw));
    if (current.ownerUserId !== cleanOwner) return null;
    const next = validateSession(updater(current));
    if (next.scanSessionId !== current.scanSessionId || next.ownerUserId !== current.ownerUserId) {
      throw new Error('Binder page review identity cannot change.');
    }
    return checkpointNow(next);
  });
}

export async function loadRecoverableBinderPageScanSessions(ownerUserId: string) {
  const cleanOwner = cleanRequired(ownerUserId, 'owner');
  const ids = parseOwnerIndex(await storage.getItem(ownerIndexKey(cleanOwner)));
  const recovered = await Promise.all(ids.map((id) => loadBinderPageScanSession(id, cleanOwner)));
  return recovered
    .filter((session): session is BinderPageScanSession => Boolean(session && session.reviewState !== 'saved' && session.pockets.length > 0))
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt));
}

export function getBinderPageScanRecoverySummary(session: BinderPageScanSession): BinderPageScanRecoverySummary {
  const confirmedPockets = session.pockets.filter((pocket) => pocket.status === 'confirmed').length;
  const needsReviewPockets = session.pockets.filter((pocket) => pocket.status !== 'confirmed' && pocket.status !== 'empty').length;
  return { totalPockets: session.pockets.length, confirmedPockets, needsReviewPockets, destinationBinderId: session.binderId ?? null };
}

export async function markBinderPageScanSessionSaved(scanSessionId: string, ownerUserId: string) {
  return updateBinderPageScanSession(scanSessionId, ownerUserId, (session) => ({ ...session, reviewState: 'saved' }));
}

export async function clearBinderPageScanSession(scanSessionId: string, ownerUserId: string) {
  const current = await loadBinderPageScanSession(scanSessionId, ownerUserId);
  if (!current) return;
  return serialized(ownerUserId, async () => {
    await storage.removeItem(sessionKey(scanSessionId));
    if (await storage.getItem(sessionKey(scanSessionId)) !== null) throw new Error('Binder page review could not be cleared.');
    const indexKey = ownerIndexKey(ownerUserId);
    const ids = parseOwnerIndex(await storage.getItem(indexKey));
    await persistVerified(indexKey, JSON.stringify(ids.filter((id) => id !== scanSessionId)), 'Binder page review index could not be updated.');
    sessions.delete(scanSessionId);
  });
}

/** Narrow test seam; production always uses React Native AsyncStorage. */
export function setBinderPageScanStorageForTests(next: ScanStorage | null) {
  storage = next ?? AsyncStorage;
  sessions.clear();
  ownerOperations.clear();
}
