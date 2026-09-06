import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  persistPokeTraceSoldEvidence,
  pokeTraceConditionCode,
  toPokeTraceSoldEvidenceRow,
} from '../backend/lib/marketPricing/pokeTraceEvidence.js';

const pokeTraceAdapterSource = await readFile(
  new URL('../backend/lib/pricingV2/adapters/pokeTraceSold.js', import.meta.url),
  'utf8',
);

const variantId = '33333333-3333-4333-8333-333333333333';
const sourceItemId = '123456789012';
const listing = {
  sourceItemId,
  title: 'Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR',
  price: 12.5,
  currency: 'GBP',
  listingUrl: `https://www.ebay.co.uk/itm/${sourceItemId}`,
  condition: 'NEAR_MINT',
  listingType: 'auction',
  soldAt: '2026-09-03T10:00:00.000Z',
  anomalyFlag: false,
  anomalyReason: null,
};
const observation = {
  sourceId: 'poketrace_sold',
  sourceType: 'sold_transaction',
  externalReference: sourceItemId,
  title: listing.title,
  originalItemPrice: listing.price,
  originalCurrency: listing.currency,
  soldAt: listing.soldAt,
  fetchedAt: '2026-09-03T10:05:00.000Z',
  rawCondition: listing.condition,
  matchScore: 0.98,
  metadata: {
    providerObservationState: 'provider_observed',
    soldProvenance: {
      qualified: true,
      externalReference: sourceItemId,
      sourceUrl: listing.listingUrl,
      finalPrice: listing.price,
      currency: listing.currency,
      soldAt: listing.soldAt,
    },
  },
  rawPayload: {
    card: {
      id: '019bff77-befa-771d-bab0-f5909f0a78c9',
      name: 'Zacian',
      cardNumber: '225/172',
      set: { slug: 'sv12a', name: 'VSTAR Universe' },
      variant: 'Holofoil',
      game: 'pokemon-japanese',
      market: 'US',
      productType: 'single',
      productFamily: 'card',
      prices: { ebay: { NEAR_MINT: { avg: 999 } } },
    },
    listing,
  },
};
const identity = { canonicalVariantId: variantId, productType: 'raw_card' };

assert.equal(pokeTraceConditionCode('Near Mint'), 'raw_near_mint');
assert.equal(pokeTraceConditionCode('UNKNOWN'), null);

const row = toPokeTraceSoldEvidenceRow(identity, observation, 2);
assert.equal(row.variantId, variantId);
assert.equal(row.conditionCode, 'raw_near_mint');
assert.equal(row.shippingPrice, null, 'Undocumented shipping must remain unknown, not zero');
assert.match(pokeTraceAdapterSource, /reviewed PokeTrace v1\.7 listing contract does not document shipping[\s\S]{0,220}shippingPrice:\s*null/,
  'undocumented PokeTrace shipping-like fields must not affect delivered-price estimates');
assert.equal(row.rawPayload.providerCard.prices, undefined, 'Volatile aggregate card prices must not enter immutable sale evidence');
assert.deepEqual(row.rawPayload.listing, listing);
assert.equal(toPokeTraceSoldEvidenceRow({ ...identity, canonicalVariantId: 'not-a-uuid' }, observation), null);
assert.equal(toPokeTraceSoldEvidenceRow(identity, { ...observation, sourceType: 'market_estimate' }), null);

const rpcCalls = [];
const supabase = {
  schema(schema) {
    assert.equal(schema, 'api');
    return {
      async rpc(name, args) {
        rpcCalls.push({ name, args });
        return {
          data: {
            status: 'applied',
            writtenCount: args.p_rows.length,
            observations: args.p_rows.map((item, index) => ({ observationId: String(index), sourceItemId: item.sourceItemId })),
          },
          error: null,
        };
      },
    };
  },
};
const persisted = await persistPokeTraceSoldEvidence(supabase, identity, [observation]);
assert.equal(persisted.rows.length, 1);
assert.equal(rpcCalls[0].name, 'ingest_poketrace_sold_evidence_batch');

const migration = await readFile(new URL('../supabase/migrations/20260904123000_poketrace_sold_evidence_provider.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('./pricing-v2-refresh-worker.ts', import.meta.url), 'utf8');
const printingLevelWorker = await readFile(new URL('./price-refresh.ts', import.meta.url), 'utf8');
const targetGuard = await readFile(new URL('./pricing-v2-supabase-target.mjs', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/price-refresh.yml', import.meta.url), 'utf8');
const legacyServer = await readFile(new URL('../backend/server.js', import.meta.url), 'utf8');
assert.match(migration, /'poketrace_sold'[\s\S]+?'under_review'[\s\S]+?false/i);
assert.match(migration, /'poketrace_sold'[\s\S]+?'unreviewed'[\s\S]+?false/i);
assert.match(migration, /current_user <> 'service_role'/i);
assert.match(migration, /market\.is_authorised_sold_provider/i);
assert.match(migration, /audit\.provider_data_rights_approvals[\s\S]+?commercial_card_identity_price_history_and_sold_listing_use/i);
assert.match(migration, /provider_data_rights_approvals_amber_review_check[\s\S]+?downstreamDeliveryRights[\s\S]+?approvingPerson/i);
assert.match(migration, /api\.is_poketrace_data_use_authorised\(\)/i);
assert.match(migration, /revoke all on table audit\.provider_data_rights_approvals from public, anon, authenticated, service_role/i);
assert.match(migration, /alter table audit\.provider_data_rights_approvals enable row level security/i);
assert.match(migration, /jsonb_array_length\(p_rows\)[\s\S]+?> 20/i);
assert.match(migration, /sha256\(pg_catalog\.convert_to\(v_raw_payload::text/i);
assert.match(migration, /'provider_observed'/i);
assert.match(migration, /on conflict \(code\) do update set[\s\S]+?licence_status = excluded\.licence_status[\s\S]+?active = excluded\.active/i, 'Source upsert reruns must reset PokeTrace to unreviewed and inactive');
assert.match(migration, /on conflict \(code\) do update set[\s\S]+?data_licence_status = excluded\.data_licence_status[\s\S]+?automated_refresh_allowed = excluded\.automated_refresh_allowed/i, 'Provider upsert reruns must reset its rights-sensitive controls');
assert.match(migration, /refund, cancellation, and later ebay reversal state are not exposed/i);
assert.match(migration, /listingType[\s\S]+?listing_type[\s\S]+?active_listing[\s\S]+?ended_unsold/i, 'Documented sale mechanisms must be accepted while contradictory listing states fail closed');
assert.doesNotMatch(migration, /listingType[\s\S]{0,120}is distinct from 'sold'/i, 'PokeTrace listingType is not a sold-state field');
assert.match(migration, /provider card does not exactly match the active canonical card, set, number, language, and variant/i);
assert.match(migration, /where observation\.provider_code = 'poketrace_sold'[\s\S]+?observation\.source_item_id = v_source_item_id[\s\S]+?observation\.sold_at = v_sold_at[\s\S]+?for update/i, 'same-listing revisions must lock and update the unique observation row');
assert.doesNotMatch(migration, /ebay\\\.\[a-z\.\]\+/i, 'eBay proof URLs must use a fixed official-domain allow-list');
assert.match(worker, /manual_snapshot_refresh[\s\S]+?canonicalVariantId/i, 'Manual Home refreshes must enter the exact-evidence worker');
assert.match(worker, /canonicalVariantId:\s*metadata\.canonicalVariantId/i, 'The canonical variant must reach the PokeTrace evidence boundary');
assert.match(worker, /edition:\s*metadata\.edition/i, 'Queued exact refreshes must retain edition when rebuilding the provider query');
assert.match(worker, /metadata\.identityKey && result\.identityKey !== metadata\.identityKey/i, 'A worker must retry rather than complete an identity-mismatched result');
assert.match(worker, /metadata\.canonicalVariantId && result\.canonicalVariantId !== metadata\.canonicalVariantId/i, 'A worker must retry rather than complete a canonical-variant-mismatched result');
assert.match(worker, /function exactQueueMetadataError[\s\S]+?canonicalVariantId[\s\S]+?identityKey[\s\S]+?canonicalCardName[\s\S]+?cardNumber/i, 'Exact queue rows must fail before provider work when their canonical rehydration identity is incomplete');
assert.match(worker, /const metadataError = exactQueueMetadataError\(metadata\);[\s\S]+?if \(metadataError\) throw new Error\(metadataError\);[\s\S]+?refreshPricingForCard/i, 'Incomplete exact queue rows must remain pending via the worker catch path rather than calling a provider');
assert.match(worker, /if \(updateError\) throw new Error\(`Could not persist queue state/i, 'A worker must fail when it cannot persist the exact queue state');
assert.doesNotMatch(worker, /handToLegacyRefresh\(row/i, 'Exact manual rows must never be handed to the printing-level legacy worker');
assert.match(worker, /pokeTraceFailure[\s\S]+?await markQueue\(row, message\)/i, 'PokeTrace failures must keep exact requests retryable with backoff');
assert.match(worker, /like\('reason', 'pricing_v2%'\)[\s\S]+?metadata->>pricingEngine[\s\S]+?metadata->>canonicalVariantId/i, 'V2 ownership filters must be applied before per-query limits');
assert.match(printingLevelWorker, /is\('metadata->>canonicalVariantId', null\)[\s\S]+?is\('metadata->>pricingEngine', null\)[\s\S]+?not\('reason', 'like', 'pricing_v2%'\)/i, 'Printing-level refreshes must exclude exact and V2-owned queue rows before limiting');
assert.match(worker, /pokeTraceExpected[\s\S]+?sourceSpecificFailureCounts\.poketrace_sold/i, 'An enabled provider whose runtime rights gate is unavailable must fail visibly');
assert.match(worker, /resolvePricingV2SupabaseTarget\(\)/i, 'The V2 worker must validate its exact Supabase target before creating a service-role client');
assert.match(targetGuard, /STACKR_EXPECTED_SUPABASE_PROJECT_REF/i, 'The V2 worker must require an explicit scheduled-job project ref');
assert.match(targetGuard, /SUPABASE_URL is required; no default project is permitted/i, 'The V2 worker must never default to production');
assert.match(targetGuard, /parsed\.hostname\.toLowerCase\(\) !== expectedHost/i, 'The V2 worker must reject a mismatched Supabase host');
assert.match(workflow, /PokeTrace completed-sale evidence refresh[\s\S]+?PRICING_V2_POKETRACE_SOLD_AUTHORISED == 'true'[\s\S]+?--delayMs=1100/i);
assert.match(workflow, /env\.POKETRACE_API_KEY != ''/i, 'The scheduled evidence step must not run without its GitHub secret');
assert.match(workflow, /environment:\s*production/i, 'Scheduled service-role refreshes must run in the protected production environment');
assert.match(workflow, /STACKR_EXPECTED_SUPABASE_PROJECT_REF:\s*\$\{\{ vars\.STACKR_EXPECTED_SUPABASE_PROJECT_REF \}\}/i, 'The workflow must bind the worker to an explicit Supabase project ref');
assert.match(workflow, /poketrace_activation_gate\.outcome == 'success'/i, 'The provider step must require the reviewed benchmark gate');
assert.match(workflow, /Report PokeTrace evidence gate failure[\s\S]+?poketrace_evidence_refresh\.outcome == 'failure'[\s\S]+?exact-variant requests remain pending[\s\S]+?exit 1/i, 'Provider failures must fail the job while exact requests remain pending');
assert.match(legacyServer, /function shouldUseStalePokeTraceCache\(error\)[\s\S]{0,120}error\?\.failClosed === true\) return false/i, 'Rights failures must never expose stale PokeTrace cache data');
assert.match(legacyServer, /async function fetchPokeTraceJson\(path, params\) \{[\s\S]{0,100}await assertPokeTraceRuntimeAuthorised\(\)/i, 'Every legacy PokeTrace HTTP request must cross the shared runtime and DB rights gate');
assert.match(legacyServer, /app\.get\('\/api\/poketrace\/card'[\s\S]{0,180}await assertPokeTraceRuntimeAuthorised\(\)/i, 'Legacy card cache delivery must be rights-gated');
assert.match(legacyServer, /app\.get\('\/api\/poketrace\/card\/:id\/prices\/:tier\/history'[\s\S]{0,180}await assertPokeTraceRuntimeAuthorised\(\)/i, 'Legacy history cache delivery must be rights-gated');
assert.ok(
  workflow.indexOf('Run PokeTrace completed-sale evidence refresh') < workflow.indexOf('Run queued printing-level refreshes'),
  'The exact evidence worker must claim eligible rows before unrelated printing-level refreshes',
);

console.log('PokeTrace sold-evidence boundary tests passed.');
