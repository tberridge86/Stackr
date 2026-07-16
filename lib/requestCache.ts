type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
let cacheVersion = 0;

export async function getCachedOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = inflightRequests.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const requestVersion = cacheVersion;
  const request = fetcher()
    .then((value) => {
      if (requestVersion === cacheVersion) {
        memoryCache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return value;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, request);
  return request;
}

export function invalidateRequestCache(prefix?: string) {
  cacheVersion += 1;

  if (!prefix) {
    memoryCache.clear();
    inflightRequests.clear();
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  for (const key of inflightRequests.keys()) {
    if (key.startsWith(prefix)) inflightRequests.delete(key);
  }
}
