/** Essential private reads must settle so the screen can offer a retry. */
export const PERSONAL_DATA_READ_TIMEOUT_MS = 10_000;

export class PersonalDataReadTimeoutError extends Error {
  constructor() {
    super('Your collection is taking longer than expected to load. Please try again.');
    this.name = 'PersonalDataReadTimeoutError';
  }
}

function cancelledRead() {
  const error = new Error('The collection request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Pass the signal through to network queries where supported. The deadline also
 * settles SDK reads which ignore cancellation. Callers still own their account
 * generation guards and must publish state only after this promise resolves.
 */
export async function withPersonalDataReadTimeout<T>(
  read: (signal: AbortSignal) => PromiseLike<T>,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  if (options.signal?.aborted) throw cancelledRead();
  const timeoutMs = options.timeoutMs ?? PERSONAL_DATA_READ_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Collection read timeout must be a positive finite duration.');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectBoundary: (reason: Error) => void = () => {};
  const boundary = new Promise<never>((_, reject) => { rejectBoundary = reject; });
  const cancel = () => {
    rejectBoundary(cancelledRead());
    controller.abort();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    timer = setTimeout(() => {
      // Reject before aborting: abort-aware transports may reject synchronously.
      rejectBoundary(new PersonalDataReadTimeoutError());
      controller.abort();
    }, timeoutMs);
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw cancelledRead();
      return read(controller.signal);
    }), boundary]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
