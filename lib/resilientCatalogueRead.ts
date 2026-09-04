export async function firstNonEmptyCatalogueRows<Candidate, Row>(
  candidates: Candidate[],
  read: (candidate: Candidate) => Promise<Row[]>,
): Promise<Row[]> {
  let completedRead = false;
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const rows = await read(candidate);
      completedRead = true;
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }

  if (completedRead || !lastError) return [];
  throw lastError;
}

export async function preferNonEmptyCatalogueRows<T>(
  preferredRead: () => Promise<T[]>,
  fallbackRead: () => Promise<T[]>,
  options: { preferredTimeoutMs?: number } = {},
): Promise<T[]> {
  let preferredRows: T[] | null = null;
  let preferredError: unknown;

  try {
    const preferredPromise = Promise.resolve().then(preferredRead);
    const timeoutMs = Math.max(0, Number(options.preferredTimeoutMs ?? 0));
    preferredRows = timeoutMs > 0
      ? await new Promise<T[]>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`Preferred catalogue read timed out after ${timeoutMs}ms.`)),
            timeoutMs,
          );
          preferredPromise.then(
            (rows) => {
              clearTimeout(timeout);
              resolve(rows);
            },
            (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          );
        })
      : await preferredPromise;
    if (preferredRows.length) return preferredRows;
  } catch (error) {
    preferredError = error;
  }

  try {
    return await fallbackRead();
  } catch (fallbackError) {
    if (preferredRows) return preferredRows;
    throw preferredError ?? fallbackError;
  }
}
