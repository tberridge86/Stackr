export const LEGACY_HOME_COLLECTION_CACHE_KEY = 'stackr:home-collection-cache:v1';

const HOME_COLLECTION_CACHE_KEY_PREFIX = 'stackr:home-collection-cache:v2';
const HOME_COLLECTION_CACHE_SCHEMA_VERSION = 2;

function normalizeTrustedUserId(userId: string): string {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) {
    throw new Error('A verified user is required for the Home collection cache.');
  }
  return normalizedUserId;
}

export function getHomeCollectionCacheKey(userId: string): string {
  return `${HOME_COLLECTION_CACHE_KEY_PREFIX}:${encodeURIComponent(normalizeTrustedUserId(userId))}`;
}

export function serializeHomeCollectionCache<T>(userId: string, snapshot: T): string {
  const ownerUserId = normalizeTrustedUserId(userId);
  return JSON.stringify({
    schemaVersion: HOME_COLLECTION_CACHE_SCHEMA_VERSION,
    ownerUserId,
    snapshot,
  });
}

export function parseHomeCollectionCache<T>(raw: string, trustedUserId: string): T | null {
  const ownerUserId = normalizeTrustedUserId(trustedUserId);

  try {
    const envelope = JSON.parse(raw) as {
      schemaVersion?: unknown;
      ownerUserId?: unknown;
      snapshot?: unknown;
    };

    if (
      !envelope
      || typeof envelope !== 'object'
      || envelope.schemaVersion !== HOME_COLLECTION_CACHE_SCHEMA_VERSION
      || envelope.ownerUserId !== ownerUserId
      || !envelope.snapshot
      || typeof envelope.snapshot !== 'object'
      || Array.isArray(envelope.snapshot)
    ) {
      return null;
    }

    return envelope.snapshot as T;
  } catch {
    return null;
  }
}

type HomeCacheWrite = { write: () => Promise<void>; resolve: () => void };
type HomeCacheWriter = { active: boolean; pending: HomeCacheWrite | null };
const homeCacheWriters = new Map<string, HomeCacheWriter>();
const MAX_HOME_CACHE_WRITERS = 8;

/**
 * AsyncStorage writes cannot be cancelled after dispatch. Serialize the whole
 * write and obsolete-write cleanup across mounts, retaining only the newest
 * queued snapshot for each owner. This optional cache never blocks Home UI.
 */
export function enqueueHomeCollectionCacheWrite(userId: string, write: () => Promise<void>): Promise<void> {
  const key = getHomeCollectionCacheKey(userId);
  let writer = homeCacheWriters.get(key);
  if (!writer) {
    // Permanently stalled storage must not accumulate unbounded owner queues.
    if (homeCacheWriters.size >= MAX_HOME_CACHE_WRITERS) return Promise.resolve();
    writer = { active: false, pending: null };
    homeCacheWriters.set(key, writer);
  }
  const current = writer;
  return new Promise<void>((resolve) => {
    current.pending?.resolve();
    current.pending = { write, resolve };
    if (!current.active) void drain();
  });

  async function drain() {
    current.active = true;
    try {
      while (current.pending) {
        const task = current.pending;
        current.pending = null;
        try { await task.write(); } catch { /* Cache persistence is best effort. */ }
        finally { task.resolve(); }
      }
    } finally {
      current.active = false;
      if (homeCacheWriters.get(key) === current) homeCacheWriters.delete(key);
    }
  }
}
