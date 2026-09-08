export function throwIfOptionalCatalogueReadAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('Catalogue read aborted.');
  error.name = 'AbortError';
  throw error;
}

/**
 * Optional asset or set metadata may fail without invalidating already-read
 * canonical facts. An independent child deadline bounds optional work, and
 * parent cancellation is never downgraded to a partial success.
 */
export async function readOptionalCatalogueEnrichment<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
  timeoutMs = 2_000,
): Promise<T | null> {
  throwIfOptionalCatalogueReadAborted(parentSignal);
  const child = new AbortController();
  const abortChildFromParent = () => child.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', abortChildFromParent, { once: true });
  const boundedTimeout = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 2_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveTimeout: (() => void) | null = null;
  const timeout = new Promise<void>((resolve) => { resolveTimeout = resolve; });
  let rejectParentAbort: ((reason?: unknown) => void) | null = null;
  const parentAbort = new Promise<never>((_, reject) => { rejectParentAbort = reject; });
  const rejectFromParentAbort = () => rejectParentAbort?.(parentSignal?.reason instanceof Error
    ? parentSignal.reason
    : Object.assign(new Error('Catalogue read aborted.'), { name: 'AbortError' }));
  parentSignal?.addEventListener('abort', rejectFromParentAbort, { once: true });
  const requested = Promise.resolve().then(() => operation(child.signal));
  // The timeout can win against a transport that ignores abort. Observe a late
  // rejection independently so it cannot become an unhandled rejection.
  void requested.catch(() => undefined);
  try {
    timer = setTimeout(() => {
      child.abort(new Error('Optional catalogue enrichment timed out.'));
      resolveTimeout?.();
    }, boundedTimeout);
    const result = await Promise.race([
      requested,
      timeout.then(() => null as T | null),
      parentAbort,
    ]);
    throwIfOptionalCatalogueReadAborted(parentSignal);
    return result;
  } catch {
    throwIfOptionalCatalogueReadAborted(parentSignal);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortChildFromParent);
    parentSignal?.removeEventListener('abort', rejectFromParentAbort);
  }
}
