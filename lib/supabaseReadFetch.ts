import { PERSONAL_DATA_READ_TIMEOUT_MS, PersonalDataReadTimeoutError } from './personalDataRead';

type ReadFetchOptions = {
  supabaseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const BODY_READ_METHODS = new Set(['arrayBuffer', 'blob', 'formData', 'json', 'text']);

function cancelledRead() {
  const error = new Error('The collection request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Bound SDK reads at the transport, where rejection releases Supabase's auth
 * lock. A screen-only Promise.race leaves getUser's lock and queued reads alive.
 * Writes retain their existing behaviour; only token renewal shares this bound.
 */
export function createSupabaseReadFetch(options: ReadFetchOptions): typeof fetch {
  const base = new URL(options.supabaseUrl);
  const basePath = base.pathname.replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? PERSONAL_DATA_READ_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Collection read timeout must be a positive finite duration.');
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const transport = options.fetchImpl ?? globalThis.fetch;
    const request = typeof input === 'object' && 'url' in input ? input as Request : null;
    let url: URL;
    try { url = new URL(request?.url ?? String(input)); }
    catch { return transport(input, init); }
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const privateRead = (method === 'GET' || method === 'HEAD')
      && (url.pathname === `${basePath}/auth/v1/user`
        || url.pathname === `${basePath}/rest/v1`
        || url.pathname.startsWith(`${basePath}/rest/v1/`));
    const tokenRenewal = method === 'POST' && url.pathname === `${basePath}/auth/v1/token`
      && url.searchParams.get('grant_type') === 'refresh_token';
    if (url.origin !== base.origin || (!privateRead && !tokenRenewal)) return transport(input, init);

    // An explicit init signal (including null) overrides a Request's signal,
    // matching fetch. Do not lose Request headers, body or other init fields.
    const externalSignal = init?.signal !== undefined ? init.signal : request?.signal;
    if (externalSignal?.aborted) throw cancelledRead();
    const controller = new AbortController();
    let failure: Error | null = null;
    let finished = false;
    let openBodies = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectBoundary!: (reason: Error) => void;
    const boundary = new Promise<never>((_, reject) => { rejectBoundary = reject; });
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    };
    const fail = (error: Error) => {
      if (finished) return;
      failure = error;
      // Settle first even when a native/polyfilled fetch ignores abort.
      rejectBoundary(error);
      controller.abort();
      finish();
    };
    const cancel = () => fail(cancelledRead());
    externalSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => fail(new PersonalDataReadTimeoutError()), timeoutMs);

    const bounded = async <T,>(work: () => PromiseLike<T>): Promise<T> => {
      if (failure) throw failure;
      return Promise.race([Promise.resolve().then(() => {
        if (failure) throw failure;
        return work();
      }), boundary]);
    };
    const wrap = (response: Response): Response => {
      openBodies += 1;
      let bodyFinished = false;
      return new Proxy(response, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (property === 'clone') return () => wrap(target.clone());
          if (typeof property === 'string' && BODY_READ_METHODS.has(property) && typeof value === 'function') {
            return async (...args: unknown[]) => {
              try { return await bounded(async () => Reflect.apply(value, target, args)); }
              finally {
                if (!bodyFinished) {
                  bodyFinished = true;
                  openBodies -= 1;
                  if (!openBodies) finish();
                }
              }
            };
          }
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };

    try {
      const response = await bounded(() => transport(input, { ...init, signal: controller.signal }));
      if (method === 'HEAD' || [204, 205, 304].includes(response.status)) {
        finish();
        return response;
      }
      // Keep the same absolute deadline through the SDK's json/text read. A
      // response with headers but a stalled body can otherwise hold the lock.
      return wrap(response);
    } catch (error) {
      finish();
      throw error;
    }
  }) as typeof fetch;
}
