import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BinderRecord } from './binders';
import { MOBILE_RUNTIME_CONFIG } from './mobileRuntimeConfig';

export type BinderLibraryOverviewSnapshot = {
  binders: BinderRecord[];
  customNameArtKeys: Record<string, string>;
};

const BINDER_OVERVIEW_CACHE_VERSION = 2;
const MAX_FUTURE_CACHE_SKEW_MS = 5 * 60 * 1000;
// Keep the approved runtime namespace so a preload warms the same library key.
const BINDER_OVERVIEW_CACHE_PREFIX = 'stackr:binder-library-overview:v1:';
const writeQueues = new Map<string, Promise<void>>();
const invalidationVersions = new Map<string, number>();

function normalizeTrustedUserId(userId: string): string {
  const normalized = String(userId ?? '').trim();
  if (!normalized) throw new Error('A verified user is required for the binder library cache.');
  return normalized;
}

export function getBinderLibraryCacheKey(userId: string) {
  return `${BINDER_OVERVIEW_CACHE_PREFIX}${encodeURIComponent(normalizeTrustedUserId(userId))}`;
}

export function isBinderLibraryOverviewForUser(snapshot: unknown, userId: string): snapshot is BinderLibraryOverviewSnapshot {
  const ownerUserId = normalizeTrustedUserId(userId);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const candidate = snapshot as Partial<BinderLibraryOverviewSnapshot>;
  if (!Array.isArray(candidate.binders) || !candidate.customNameArtKeys || typeof candidate.customNameArtKeys !== 'object' || Array.isArray(candidate.customNameArtKeys)) return false;
  const binderIds = new Set<string>();
  for (const binder of candidate.binders) {
    if (!binder || typeof binder !== 'object'
      || typeof binder.id !== 'string' || !binder.id.trim()
      || typeof binder.user_id !== 'string' || binder.user_id !== ownerUserId
      || typeof binder.name !== 'string' || !binder.name.trim()
      || (binder.type !== 'official' && binder.type !== 'custom')
      || typeof binder.color !== 'string' || !binder.color.trim()
      || typeof binder.created_at !== 'string' || !binder.created_at.trim()
      || (binder.source_set_id !== null && binder.source_set_id !== undefined && typeof binder.source_set_id !== 'string')
      || binderIds.has(binder.id)) return false;
    binderIds.add(binder.id);
  }
  return Object.entries(candidate.customNameArtKeys).every(([binderId, artKey]) => (
    binderIds.has(binderId) && typeof artKey === 'string' && artKey.trim().length > 0
  ));
}

export function serializeBinderLibraryOverview(userId: string, snapshot: BinderLibraryOverviewSnapshot, cachedAt = Date.now()): string {
  const ownerUserId = normalizeTrustedUserId(userId);
  if (!isBinderLibraryOverviewForUser(snapshot, ownerUserId)) {
    throw new Error('Binder overview cache must contain only rows owned by the active account.');
  }
  return JSON.stringify({ version: BINDER_OVERVIEW_CACHE_VERSION, runtimeUrl: MOBILE_RUNTIME_CONFIG.supabaseUrl, ownerUserId, cachedAt, snapshot });
}

export function parseBinderLibraryOverview(raw: string, userId: string): BinderLibraryOverviewSnapshot | null {
  const ownerUserId = normalizeTrustedUserId(userId);
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; runtimeUrl?: unknown; ownerUserId?: unknown; snapshot?: unknown };
    if (parsed?.version !== BINDER_OVERVIEW_CACHE_VERSION
      || parsed.runtimeUrl !== MOBILE_RUNTIME_CONFIG.supabaseUrl
      || parsed.ownerUserId !== ownerUserId) return null;
    return isBinderLibraryOverviewForUser(parsed.snapshot, ownerUserId) ? parsed.snapshot : null;
  } catch {
    return null;
  }
}

function parseBinderLibraryEnvelope(raw: string, userId: string): { cachedAt: number; snapshot: BinderLibraryOverviewSnapshot } | null {
  const snapshot = parseBinderLibraryOverview(raw, userId);
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(raw) as { cachedAt?: unknown };
    if (typeof parsed.cachedAt !== 'number' || !Number.isFinite(parsed.cachedAt)
      || parsed.cachedAt < 0 || parsed.cachedAt > Date.now() + MAX_FUTURE_CACHE_SKEW_MS) return null;
    return { cachedAt: parsed.cachedAt, snapshot };
  } catch {
    return null;
  }
}

export async function readPersistedBinderOverview(userId: string): Promise<BinderLibraryOverviewSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(getBinderLibraryCacheKey(userId));
    return raw ? parseBinderLibraryEnvelope(raw, userId)?.snapshot ?? null : null;
  } catch (error) {
    console.log('Failed to read persisted binder overview', error);
    return null;
  }
}

export async function writePersistedBinderOverview(
  userId: string,
  snapshot: BinderLibraryOverviewSnapshot,
  options: { isCurrent?: () => boolean; savedAt?: number } = {},
) {
  const ownerUserId = normalizeTrustedUserId(userId);
  if (!isBinderLibraryOverviewForUser(snapshot, ownerUserId)) return;
  const key = getBinderLibraryCacheKey(ownerUserId);
  const savedAt = Number.isFinite(options.savedAt) ? Number(options.savedAt) : Date.now();
  const invalidationVersion = invalidationVersions.get(key) ?? 0;
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const write = previous.then(async () => {
    if (options.isCurrent?.() === false || (invalidationVersions.get(key) ?? 0) !== invalidationVersion) return;
    const current = await AsyncStorage.getItem(key);
    if (options.isCurrent?.() === false || (invalidationVersions.get(key) ?? 0) !== invalidationVersion) return;
    const existing = current ? parseBinderLibraryEnvelope(current, ownerUserId) : null;
    if (existing && existing.cachedAt > savedAt) return;
    const currentBinderIds = new Set(snapshot.binders.map((binder) => binder.id));
    const preservedArtKeys = Object.fromEntries(Object.entries(existing?.snapshot.customNameArtKeys ?? {})
      .filter(([binderId]) => currentBinderIds.has(binderId)));
    const merged = {
      ...snapshot,
      customNameArtKeys: { ...preservedArtKeys, ...snapshot.customNameArtKeys },
    };
    if (options.isCurrent?.() === false || (invalidationVersions.get(key) ?? 0) !== invalidationVersion) return;
    await AsyncStorage.setItem(key, serializeBinderLibraryOverview(ownerUserId, merged, savedAt));
  }).catch((error) => {
    console.log('Failed to persist binder overview', error);
  });
  writeQueues.set(key, write);
  await write;
}

export async function removePersistedBinderOverview(userId: string) {
  const key = getBinderLibraryCacheKey(userId);
  invalidationVersions.set(key, (invalidationVersions.get(key) ?? 0) + 1);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const remove = previous.then(async () => {
    await AsyncStorage.removeItem(key);
  }).catch((error) => {
    console.log('Failed to remove persisted binder overview', error);
  });
  writeQueues.set(key, remove);
  try {
    await remove;
  } catch (error) {
    console.log('Failed to remove persisted binder overview', error);
  }
}
