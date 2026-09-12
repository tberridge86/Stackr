/** Schedules only rows the binder is currently showing; quote data stays with the caller. */
export type VisiblePriceFailure = { status?: number | null } | null | undefined;
export type VisiblePriceLoadResult = { failure?: VisiblePriceFailure } | void;

type TimerApi = {
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
};

export type VisibleBinderPriceReaderOptions<Row> = TimerApi & {
  idForRow?: (row: Row) => string;
  loader: (rows: Row[]) => Promise<VisiblePriceLoadResult>;
  onError?: (error: unknown) => void;
};

export type VisibleBinderPriceReader = { request: (ids: string[]) => void; dispose: () => void };

const BATCH_SIZE = 12;
const MAX_REQUESTS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;

function failureStatus(value: VisiblePriceLoadResult): number | null {
  const status = value && typeof value === 'object' ? value.failure?.status : null;
  return typeof status === 'number' ? status : null;
}

/**
 * A viewport callback may fire repeatedly. IDs are therefore tracked for the
 * lifetime of this reader: completed or active rows cannot be requested again.
 * A new viewport replaces only pending work; an active batch is left intact.
 */
export function createVisibleBinderPriceReader<Row>(
  rows: Row[],
  options: VisibleBinderPriceReaderOptions<Row>,
): VisibleBinderPriceReader {
  const idForRow = options.idForRow ?? ((row: any) => String(row?.id ?? ''));
  const byId = new Map<string, Row>();
  for (const row of rows) {
    const id = idForRow(row);
    if (id) byId.set(id, row);
  }
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let disposed = false;
  let authBlocked = false;
  let inFlight = false;
  let timer: unknown = null;
  let blockedUntil = 0;
  let currentVisible = new Set<string>();
  let pending = new Set<string>();
  const completed = new Set<string>();
  const active = new Set<string>();
  const retries = new Map<string, number>();
  const attemptedAt: number[] = [];

  const trimBudget = () => {
    const cutoff = now() - MINUTE_MS;
    while (attemptedAt.length && attemptedAt[0] <= cutoff) attemptedAt.shift();
  };
  const scheduleAt = (target: number) => {
    if (disposed || timer != null) return;
    timer = setTimer(() => {
      timer = null;
      void pump();
    }, Math.max(1, target - now()));
  };
  const refreshPending = () => {
    pending = new Set([...currentVisible].filter((id) => !completed.has(id) && !active.has(id)));
  };
  const cooldownFor = (status: number | null) => status === 429 ? MINUTE_MS : status != null && status >= 500 ? 30_000 : null;

  const pump = async (): Promise<void> => {
    if (disposed || authBlocked || inFlight || !pending.size) return;
    trimBudget();
    if (blockedUntil > now()) {
      scheduleAt(blockedUntil);
      return;
    }
    const remaining = MAX_REQUESTS_PER_MINUTE - attemptedAt.length;
    if (remaining <= 0) {
      blockedUntil = Math.max(blockedUntil, attemptedAt[0] + MINUTE_MS);
      scheduleAt(blockedUntil);
      return;
    }
    const ids = [...pending].filter((id) => currentVisible.has(id) && !completed.has(id) && !active.has(id))
      .slice(0, Math.min(BATCH_SIZE, remaining));
    ids.forEach((id) => pending.delete(id));
    const batch = ids.map((id) => byId.get(id)).filter((row): row is Row => row != null);
    if (!batch.length) return;
    ids.forEach((id) => active.add(id));
    inFlight = true;
    attemptedAt.push(...batch.map(() => now()));
    let result: VisiblePriceLoadResult;
    try {
      result = await options.loader(batch);
    } catch (error) {
      options.onError?.(error);
      result = { failure: { status: (error as { status?: unknown })?.status as number | undefined } };
    } finally {
      inFlight = false;
      ids.forEach((id) => active.delete(id));
    }
    const status = failureStatus(result);
    if (status === 401 || status === 403) {
      authBlocked = true;
      pending.clear();
      return;
    }
    const cooldown = cooldownFor(status);
    if (cooldown != null) {
      const retryIds = ids.filter((id) => currentVisible.has(id) && (retries.get(id) ?? 0) < 1);
      retryIds.forEach((id) => retries.set(id, (retries.get(id) ?? 0) + 1));
      retryIds.forEach((id) => pending.add(id));
      ids.filter((id) => !retryIds.includes(id)).forEach((id) => completed.add(id));
      // Back off every visible price read after a service/rate interruption,
      // even when the failed rows have just left the viewport.
      blockedUntil = Math.max(blockedUntil, now() + cooldown);
      scheduleAt(blockedUntil);
      return;
    }
    ids.forEach((id) => completed.add(id));
    void pump();
  };

  return {
    request(ids) {
      if (disposed || authBlocked) return;
      currentVisible = new Set(ids.filter((id) => byId.has(id)));
      // `blockedUntil` is absolute: viewability events never bypass a retry.
      refreshPending();
      void pump();
    },
    dispose() {
      disposed = true;
      pending.clear();
      if (timer != null) clearTimer(timer);
      timer = null;
    },
  };
}
