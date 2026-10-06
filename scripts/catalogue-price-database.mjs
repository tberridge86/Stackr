import { createClient } from '@supabase/supabase-js';

/** Server imports have a bounded database request even during an outage. */
export function createCataloguePriceDatabase(url, key, { fetchImpl = fetch, timeoutMs = 45_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('Invalid database deadline.');
  return createClient(url, key, { global: { fetch: (input, init = {}) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    return fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
  } } });
}
