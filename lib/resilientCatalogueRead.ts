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
  preferredRead: (signal: AbortSignal) => Promise<T[]>,
  fallbackRead: () => Promise<T[]>,
  options: { preferredTimeoutMs?: number } = {},
): Promise<T[]> {
  let preferredRows: T[] | null = null;
  let preferredError: unknown;

  try {
    const controller = new AbortController();
    const preferredOutcome = Promise.resolve()
      .then(() => preferredRead(controller.signal))
      .then(
        (rows) => ({ status: 'fulfilled' as const, rows }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    const timeoutMs = Math.max(0, Number(options.preferredTimeoutMs ?? 0));
    const preferredResult = timeoutMs > 0
      ? await Promise.race([
          preferredOutcome,
          new Promise<{ status: 'timed-out' }>((resolve) => {
            const timeout = setTimeout(() => resolve({ status: 'timed-out' }), timeoutMs);
            timeout.unref?.();
            void preferredOutcome.then(() => clearTimeout(timeout));
          }),
        ])
      : await preferredOutcome;

    if (preferredResult.status === 'timed-out') {
      controller.abort();
      const settledResult = await preferredOutcome;
      preferredError = new Error(`Preferred catalogue read timed out after ${timeoutMs}ms.`);
      if (settledResult.status === 'rejected') {
        preferredError = preferredError ?? settledResult.error;
      } else {
        preferredRows = settledResult.rows;
      }
    } else if (preferredResult.status === 'rejected') {
      preferredError = preferredResult.error;
    } else {
      preferredRows = preferredResult.rows;
    }
    if (preferredRows?.length) return preferredRows;
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
