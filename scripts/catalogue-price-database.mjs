import { createClient } from '@supabase/supabase-js';

// Only fixed operational names can reach logs. Never log URLs, request bodies,
// headers, provider/card identities or arbitrary caller-controlled path text.
const diagnosticRpcs = new Set([
  'list_reviewed_cardmarket_printing_mappings', 'read_catalogue_bulk_feed',
  'begin_catalogue_bulk_sweep', 'catalogue_bulk_price_coverage_page',
  'claim_catalogue_bulk_feed_revision', 'finish_catalogue_bulk_feed',
  'seed_catalogue_bulk_price_outcomes', 'requeue_english_exact_title_groups',
  'claim_catalogue_bulk_sweep_group', 'resolve_catalogue_bulk_set',
  'catalogue_bulk_group_candidates', 'store_catalogue_bulk_prices',
  'finish_catalogue_bulk_sweep_group', 'catalogue_bulk_sweep_health',
  'read_cardmarket_retained_feed_revision', 'claim_cardmarket_source_revision',
  'finish_cardmarket_public_feed', 'fail_cardmarket_public_feed',
  'queue_cardmarket_mapping_repairs', 'store_cardmarket_blended_general_prices',
]);
function diagnosticRpc(input) {
  try {
    const pathname = new URL(typeof input === 'string' || input instanceof URL ? input : input.url).pathname;
    const name = pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
    return diagnosticRpcs.has(name) ? name : 'unknown';
  } catch { return 'unknown'; }
}

/** Server imports have a bounded database request even during an outage. */
export function createCataloguePriceDatabase(url, key, {
  fetchImpl = fetch, timeoutMs = 45_000,
  onTransportFailure = event => console.error(JSON.stringify(event)),
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('Invalid database deadline.');
  if (typeof onTransportFailure !== 'function') throw Error('Invalid database failure observer.');
  return createClient(url, key, { global: { fetch: async (input, init = {}) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
    } catch (error) {
      // Observer failures cannot change cancellation, exception identity or
      // replay a potentially committed POST. HTTP/SQL responses pass unchanged.
      try { Promise.resolve(onTransportFailure({ event: 'catalogue_price_database_transport_failed',
        rpc: diagnosticRpc(input), reason: init.signal?.aborted ? 'caller_aborted'
          : deadline.aborted ? 'request_deadline' : 'transport_error', timeoutMs })).catch(() => {}); }
      catch { /* Preserve the original request error. */ }
      throw error;
    }
  } } });
}
