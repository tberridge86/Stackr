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
