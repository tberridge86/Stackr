/**
 * Selects the current image source without trapping a failed primary or backup
 * source in a retry loop. A null result tells StackrImage to render its React
 * fallback (or the generic image icon).
 */
export function selectStackrImageSource<T>(
  primarySource: T | null | undefined,
  fallbackSource: T | null | undefined,
  failedSourceCount: number,
): T | null {
  const primary = primarySource ?? null;
  const fallback = fallbackSource ?? null;

  if (failedSourceCount <= 0) return primary ?? fallback;
  if (failedSourceCount === 1 && primary !== null && fallback !== null && fallback !== primary) {
    return fallback;
  }
  return null;
}

/** Selects the next candidate in an ordered image-source chain. */
export function selectStackrImageSourceCandidate<T>(
  sources: readonly (T | null | undefined)[],
  failedSourceCount: number,
): T | null {
  const candidates = sources.filter((source): source is T => source != null);
  const index = Math.max(0, Math.floor(failedSourceCount));
  return candidates[index] ?? null;
}

/** Builds the recovery order used by StackrImage. */
export function buildStackrImageSourceCandidates<T>(
  localSource: T | null | undefined,
  remoteSources: readonly (T | null | undefined)[],
  fallbackSource: T | null | undefined,
): T[] {
  return [localSource, ...remoteSources, fallbackSource]
    .filter((source): source is T => source != null);
}
