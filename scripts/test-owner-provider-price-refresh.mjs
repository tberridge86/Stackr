import assert from 'node:assert/strict';
import {
  OWNER_PRICE_REFRESH_MAX_LIMIT,
  ownedRowEligibility,
  legacyEnglishOwnerPair,
  parseOwnerPriceRefreshArguments,
  resolveOwnerExactQueueItem,
  resolveOwnedProviderVariant,
} from './lib/owner-provider-price-refresh-core.mjs';
import { runOwnerProviderRefresh } from './refresh-owner-provider-prices.mjs';

const variant = '11111111-1111-4111-8111-111111111111';
const set = '22222222-2222-4222-8222-222222222222';
const owned = { card_id: 'tcgdex-card', set_id: 'tcgdex-set', variant: 'normal', quantity: 1, condition: 'Near Mint', grade_company: '', grade: '' };
const identifiers = [
  { source_entity_type: 'card', external_id: 'tcgdex-card', set_id: set, variant_id: variant },
  { source_entity_type: 'set', external_id: 'tcgdex-set', set_id: set, variant_id: null },
];
const catalogue = [{ variant_id: variant, set_id: set, language_code: 'en', variant_code: 'normal', finish_code: 'normal' }];

assert.deepEqual(parseOwnerPriceRefreshArguments([]), { limit: 10, dryRun: true, includeQueue: false, queueOnly: false });
assert.deepEqual(parseOwnerPriceRefreshArguments(['--limit=2', '--apply']), { limit: 2, dryRun: false, includeQueue: false, queueOnly: false });
assert.deepEqual(parseOwnerPriceRefreshArguments(['--include-queue', '--queue-only']), { limit: 10, dryRun: true, includeQueue: true, queueOnly: true });
assert.throws(() => parseOwnerPriceRefreshArguments(['--queue-only']), /requires --include-queue/);
assert.throws(() => parseOwnerPriceRefreshArguments([`--limit=${OWNER_PRICE_REFRESH_MAX_LIMIT + 1}`]), /1 to 30/);
assert.equal(ownedRowEligibility({ ...owned, condition: 'Lightly Played' }), 'not_raw_near_mint');
assert.equal(ownedRowEligibility({ ...owned, grade: '10' }), 'graded_card');
assert.deepEqual(legacyEnglishOwnerPair({ ...owned, card_id: 'me2pt5-2', set_id: 'me2pt5' }), { setAliases: ['me2pt5', 'me02.5'], collectorNumber: '2' });
assert.equal(legacyEnglishOwnerPair({ ...owned, card_id: 'sv8pt5-10', set_id: 'sv8pt5' }), null, 'unprefixed SV pairs remain held because their language is ambiguous');
assert.equal(legacyEnglishOwnerPair({ ...owned, card_id: 'm3-10', set_id: 'm3' }), null, 'Japanese ME identifiers must not be reinterpreted as English');
assert.deepEqual(resolveOwnedProviderVariant(owned, identifiers, catalogue), { ok: true, variantId: variant });
const englishLegacySet = '33333333-3333-4333-8333-333333333333';
const englishLegacyVariant = '44444444-4444-4444-8444-444444444444';
assert.deepEqual(resolveOwnedProviderVariant(
  { ...owned, card_id: 'me2pt5-2', set_id: 'me2pt5' },
  [{ source_entity_type: 'set', external_id: 'me02.5', language_code: 'en', set_id: englishLegacySet }],
  [{ variant_id: englishLegacyVariant, set_id: englishLegacySet, language_code: 'en', collector_number: '002', variant_code: 'normal', finish_code: 'normal' }],
), { ok: true, variantId: englishLegacyVariant });
assert.deepEqual(resolveOwnedProviderVariant({ ...owned, card_id: variant, set_id: set }, [], catalogue), { ok: true, variantId: variant });
assert.equal(resolveOwnedProviderVariant(owned, identifiers, [{ ...catalogue[0], finish_code: 'holo' }]).reason, 'unsupported_or_unpublished_variant');
assert.equal(resolveOwnedProviderVariant(owned, [...identifiers, { ...identifiers[0], variant_id: '33333333-3333-4333-8333-333333333333' }], [...catalogue, { ...catalogue[0], variant_id: '33333333-3333-4333-8333-333333333333' }]).reason, 'ambiguous_saved_identity');

function query(data) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, gt() { return chain; }, order() { return chain; }, limit() { return chain; }, in() { return chain; },
    then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); },
  };
  return chain;
}
const supabase = {
  from(name) { return query(name === 'user_card_variants' ? [owned, owned] : []); },
  schema() { return { from(name) { return query(name === 'catalogue_external_identifiers' ? identifiers : catalogue); } }; },
};
let calls = 0;
const dry = await runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate: async () => { calls += 1; }, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 2, dryRun: true });
assert.equal(dry.selected, 1, 'duplicate saved identities must use one provider refresh');
assert.equal(calls, 0, 'dry run must never invoke provider refresh');
const applied = await runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate: async (id, input) => { calls += 1; assert.equal(id, variant); assert.deepEqual(input, { productType: 'raw_card', condition: 'near_mint', currency: 'GBP' }); }, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 2, dryRun: false });
assert.equal(applied.refreshed, 1);
assert.equal(calls, 1);

const legacyOwned = { ...owned, card_id: 'me3-10', set_id: 'me3' };
const legacyIdentifiers = [{ source_entity_type: 'set', external_id: 'me03', language_code: 'en', set_id: englishLegacySet, variant_id: null }];
const legacyCatalogue = [{ variant_id: englishLegacyVariant, set_id: englishLegacySet, language_code: 'en', collector_number: '010', variant_code: 'normal', finish_code: 'normal' }];
const legacySupabase = {
  from(name) { return query(name === 'user_card_variants' ? [legacyOwned] : []); },
  schema() { return { from(name) { return query(name === 'catalogue_external_identifiers' ? legacyIdentifiers : legacyCatalogue); } }; },
};
const legacyDry = await runOwnerProviderRefresh({ supabase: legacySupabase, refreshExactProviderEstimate: async () => { throw new Error('dry run must not refresh'); }, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', limit: 3, dryRun: true });
assert.equal(legacyDry.selected, 1, 'the deterministic me3/me3-10 pair reaches its exact English normal variant');

const queuePrinting = '55555555-5555-4555-8555-555555555555';
const queueRow = {
  id: '66666666-6666-4666-8666-666666666666', card_id: queuePrinting, set_id: set, language: 'en',
  reason: 'manual_snapshot_refresh', requested_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', run_after: '2026-09-09T00:00:00.000Z', attempts: 0,
  metadata: { refreshPipeline: 'pricing_v2_exact', canonicalVariantId: variant, canonicalPrintingId: queuePrinting, productType: 'raw_card', rawCondition: 'raw_near_mint', currency: 'GBP', variantCode: 'normal', finishCode: 'normal' },
};
const queueCatalogue = [{ ...catalogue[0], printing_id: queuePrinting }];
assert.deepEqual(resolveOwnerExactQueueItem(queueRow, queueCatalogue), { ok: true, variantId: variant });
assert.equal(resolveOwnerExactQueueItem(queueRow, queueCatalogue, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').reason, 'unsupported_queue_identity', 'a queue row from another owner is never eligible');
assert.equal(resolveOwnerExactQueueItem({ ...queueRow, metadata: { ...queueRow.metadata, finishCode: 'reverse_holo' } }, queueCatalogue).reason, 'unsupported_queue_identity');
assert.equal(resolveOwnerExactQueueItem({ ...queueRow, metadata: { ...queueRow.metadata, currency: 'USD' } }, queueCatalogue).reason, 'unsupported_queue_scope');
assert.equal(resolveOwnerExactQueueItem({ ...queueRow, metadata: { ...queueRow.metadata, language: 'ja' } }, queueCatalogue).reason, 'unsupported_queue_scope');

function queueHarness({ claim = true, row = queueRow, ownedRows = [] } = {}) {
  const seen = [];
  const patches = [];
  const chain = (kind) => {
    const value = {
      select() { return value; }, eq(...args) { seen.push(args); return value; }, gt() { return value; }, is() { return value; }, lte() { return value; }, order() { return value; }, limit() { return value; }, in() { return value; },
      update(patch) { patches.push(patch); return value; },
      maybeSingle() { return Promise.resolve({ data: claim ? { id: row.id } : null, error: null }); },
      then(resolve) { return Promise.resolve({ data: kind === 'queue' ? [row] : kind === 'owned' ? ownedRows : kind === 'identifiers' ? identifiers : [...catalogue, ...queueCatalogue], error: null }).then(resolve); },
    };
    return value;
  };
  return {
    seen,
    patches,
    supabase: {
      from(name) { return chain(name === 'user_card_variants' ? 'owned' : 'queue'); },
      schema() { return { from(name) { return chain(name === 'catalogue_external_identifiers' ? 'identifiers' : 'catalogue'); } }; },
    },
  };
}
const queued = queueHarness();
let queueCalls = 0;
const queueApplied = await runOwnerProviderRefresh({ supabase: queued.supabase, refreshExactProviderEstimate: async (id) => { queueCalls += 1; assert.equal(id, variant); }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true, queueOnly: true });
assert.equal(queueApplied.queueCompleted, 1);
assert.equal(queueCalls, 1);
assert(queued.seen.some((args) => args[0] === 'requested_by' && args[1] === queueRow.requested_by), 'queue reads and writes are scoped to the owner');
assert(queued.seen.some((args) => args[0] === 'run_after' && args[1] === queueRow.run_after), 'the queue claim is guarded by the originally-read due timestamp');
const queueAndOwned = queueHarness({ ownedRows: [owned] });
let combinedCalls = 0;
const combined = await runOwnerProviderRefresh({ supabase: queueAndOwned.supabase, refreshExactProviderEstimate: async () => { combinedCalls += 1; }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true });
assert.equal(combined.selected, 1, 'a queued and owned copy of the same canonical variant uses one provider refresh');
assert.equal(combinedCalls, 1);
const raced = queueHarness({ claim: false });
const claimRace = await runOwnerProviderRefresh({ supabase: raced.supabase, refreshExactProviderEstimate: async () => { throw new Error('lost claim must not refresh'); }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true, queueOnly: true });
assert.equal(claimRace.queueClaimLost, 1, 'an optimistic claim race must not duplicate a provider request');
const failed = queueHarness();
const retry = await runOwnerProviderRefresh({ supabase: failed.supabase, refreshExactProviderEstimate: async () => { const error = new Error('provider down'); error.code = 'provider_unavailable_secret_text'; throw error; }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true, queueOnly: true });
assert.equal(retry.queueRetried, 1, 'provider failures are retried with the bounded queue backoff');
assert.equal(failed.patches.at(-1).last_error, 'exact_provider_refresh_failed', 'arbitrary provider errors must not be written to the queue');
const unsupported = queueHarness({ row: { ...queueRow, metadata: { ...queueRow.metadata, finishCode: 'reverse_holo' } } });
const terminal = await runOwnerProviderRefresh({ supabase: unsupported.supabase, refreshExactProviderEstimate: async () => { throw new Error('unsupported queue identity must not refresh'); }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true, queueOnly: true });
assert.equal(terminal.queueTerminal, 1, 'unsupported exact identities are terminally marked instead of retried');
const exhaustedHarness = queueHarness({ row: { ...queueRow, attempts: 4 } });
const exhausted = await runOwnerProviderRefresh({ supabase: exhaustedHarness.supabase, refreshExactProviderEstimate: async () => { throw new Error('provider unavailable'); }, ownerId: queueRow.requested_by, limit: 3, dryRun: false, includeQueue: true, queueOnly: true });
assert.equal(exhausted.queueTerminal, 1, 'the fifth failed attempt is terminal rather than retrying forever');
assert.equal(exhaustedHarness.patches.at(-1).last_error, 'exact_provider_retry_exhausted');

console.log('Owner provider price refresh tests passed.');
