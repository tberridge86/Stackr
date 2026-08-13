export async function loadRemoteWithCache<T>({
  cached,
  fetchRemote,
  writeCache,
  onStale,
  onCacheWriteError,
}: {
  cached: T;
  fetchRemote: () => Promise<T>;
  writeCache: (value: T) => Promise<void>;
  onStale?: () => void;
  onCacheWriteError?: (error: unknown) => void;
}) {
  let fresh: T;
  try {
    fresh = await fetchRemote();
  } catch (error) {
    onStale?.();
    return { value: cached, stale: true, remoteError: error } as const;
  }

  try {
    await writeCache(fresh);
  } catch (error) {
    onCacheWriteError?.(error);
  }
  return { value: fresh, stale: false, remoteError: null } as const;
}
