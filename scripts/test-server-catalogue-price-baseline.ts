import assert from 'node:assert/strict';
import { provisionalCataloguePriceBaseline as clientBaseline } from '../lib/cataloguePriceBaseline';
import { provisionalCataloguePriceBaseline as serverBaseline } from '../backend/lib/marketPricing/cataloguePriceBaseline.js';
import { createCataloguePriceRead } from '../backend/lib/marketPricing/cataloguePriceRead.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const candidate = (n = 1, overrides: Record<string, unknown> = {}) => ({
  variant_id: id(n), printing_id: id(1000 + n), set_id: id(2000 + n),
  catalogue_version_id: id(9000), language_code: 'en', variant_code: 'normal', finish_code: 'normal',
  is_default: true, requested_variant_ids: [id(n)], ...overrides,
});
const unavailablePrice = (variantId: string, _input = {}, reason = 'insufficient_exact_market_evidence') => ({
  variantId, productType: 'raw_card', currency: 'GBP', status: 'unavailable', priceType: 'unavailable',
  estimates: { low: null, central: null, high: null }, unavailableReason: reason,
  calculatedAt: null, staleAfter: null, freshness: 'unknown', confidence: { score: 0, label: 'insufficient_evidence' },
  sample: { total: 0, sold: 0, active: 0, sources: 0, dateRange: { from: null, to: null } },
  sourceBreakdown: [], fallbackEstimate: null,
});
const quote = (amount: number, overrides: Record<string, unknown> = {}) => ({
  ...unavailablePrice(id(1)), status: 'market_estimate', priceType: 'market_estimate', unavailableReason: null,
  estimates: { low: null, central: amount, high: null }, freshness: 'fresh',
  calculatedAt: '2026-10-08T12:00:00Z', ...overrides,
});

function fixture(candidates: any[], options: any = {}) {
  const calls: any[] = [];
  const cardRows = options.cardRows ?? candidates.map((row) => ({ ...row, rarity_code: 'common', rarity_label: 'Common' }));
  const setRows = options.setRows ?? candidates.map((row) => ({ ...row, release_date: '2022-01-01' }));
  const supabase = { schema(schema: string) {
    assert.equal(schema, 'api', 'fallback only reads the published API schema');
    return {
      async rpc(name: string, args: any) {
        calls.push({ kind: 'rpc', name, args });
        if (name === 'read_catalogue_prices') return { data: args.p_references.map((reference: string) => ({
          reference, candidates: options.byReference?.[reference] ?? candidates.filter((row) => row.variant_id === reference),
        })), error: options.rpcError };
        assert.ok(['read_catalogue_printing_general_prices', 'read_cardmarket_blended_general_prices'].includes(name), 'no provider or job RPC');
        return { data: options.guides?.[name] ?? [] };
      },
      from(table: string) {
        assert.ok(['catalogue_cards', 'catalogue_sets'].includes(table));
        const call: any = { kind: 'metadata', table, filters: [], ids: [], limit: null };
        calls.push(call);
        const builder: any = {
          select(columns: string) { call.columns = columns; return builder; },
          eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
          in(column: string, ids: string[]) { call.idColumn = column; call.ids = ids; return builder; },
          limit(limit: number) { call.limit = limit; return builder; },
          abortSignal(signal: AbortSignal) { call.signal = signal; return builder; },
          then(resolve: any, reject: any) {
            if (options.metadataDeferred) return options.metadataDeferred.promise.then(resolve, reject);
            if (options.rejectTable === table) return Promise.reject(new Error('optional metadata transport failed')).then(resolve, reject);
            let data = table === 'catalogue_cards' ? cardRows : setRows;
            if (!options.ignoreFilters) data = data.filter((row: any) => call.filters.every(([key, value]: any) => row[key] === value) && call.ids.includes(row[call.idColumn]));
            return Promise.resolve({ data: data.slice(0, call.limit), error: options.errorTable === table ? { code: 'fixture' } : null }).then(resolve, reject);
          },
        };
        return builder;
      },
    };
  } };
  return { calls, read: createCataloguePriceRead({ supabase, toEstimatePrice: (row: any) => row, toSnapshotPrice: (row: any) => row, unavailablePrice }) };
}
const metadataCalls = (f: ReturnType<typeof fixture>) => f.calls.filter((call) => call.kind === 'metadata');
const readOne = async (f: ReturnType<typeof fixture>, n = 1, estimateMode = 'general') => (await f.read({ references: [id(n)], estimateMode })).prices[0];

async function main() {
  for (const rarity of [null, 'unknown', 'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare', 'Shiny Rare', 'Shiny Ultra Rare', 'Promo', 'ACE SPEC', 'Radiant Rare', 'Amazing Rare']) {
    for (const releaseDate of [null, 'malformed', '1999-01-01', '2002', '2003', '2009', '2010', '2015', '2016', '2019', '2020', '2026']) {
      const input = { variantId: id(1), rarity, releaseDate };
      assert.deepEqual(serverBaseline(input), clientBaseline(input), `reviewed model parity: ${rarity}/${releaseDate}`);
    }
  }
  assert.equal(serverBaseline({ variantId: '' }), null);
  assert.deepEqual(serverBaseline({ variantId: id(1), rarity: 'common', releaseDate: '2026' }), {
    currency: 'GBP', low: 0.02, central: 0.09, high: 0.23, rarity: 'common', eraMultiplier: 0.85,
    modelVersion: 'catalogue-rarity-era-baseline-v1',
  }, 'fractional pennies use the reviewed rounding policy');

  const baselineFixture = fixture([candidate()]);
  const baseline = await readOne(baselineFixture);
  assert.equal(baseline.price.estimates.central, 0.09);
  assert.equal(baseline.unavailableReason, null);
  assert.equal(baseline.price.sourceBreakdown[0].provider, 'stackr_catalogue_baseline');
  assert.equal(baseline.price.fallbackEstimate.reason, 'provisional_catalogue_baseline');
  assert.equal(baseline.price.fallbackEstimate.usableForExactVariant, false);
  assert.equal(baseline.price.fallbackEstimate.usableForHoldingsValuation, false);
  assert.equal(baseline.price.confidence.label, 'low');
  assert.equal(baseline.price.calculatedAt, null);
  assert.equal(baseline.price.staleAfter, null);
  assert.equal(baseline.price.lastSoldEvidence, null);
  assert.equal(baseline.price.lastSoldObservationId, null);
  assert.equal(baseline.price.provenLastSold, false);
  assert.equal(baseline.price.sample.total, 0);
  assert.deepEqual(baseline.price.sample.dateRange, { from: null, to: null });
  const unchanged = await baselineFixture.read({ references: [id(1)], estimateMode: 'general', knownRevisions: { [id(1)]: baseline.revision } });
  assert.deepEqual(unchanged.prices, []);
  assert.deepEqual(unchanged.unchangedReferences, [id(1)], 'provisional data follows the existing content revision contract');

  const unknown = await readOne(fixture([candidate()], { cardRows: [candidate()], setRows: [] }));
  assert.equal(unknown.price.estimates.central, 0.25);
  assert.equal(unknown.price.sourceBreakdown[0].rarity, 'unknown');
  assert.equal(unknown.price.sourceBreakdown[0].metadataStatus, 'published_card_unknown_set_date');
  const rarityLabel = await readOne(fixture([candidate()], { cardRows: [{ ...candidate(), rarity_code: 'common', rarity_label: 'Special Illustration Rare' }] }));
  assert.equal(rarityLabel.price.estimates.central, 12.75, 'the presentation rarity label wins just as the client adapter does');

  const exact = fixture([candidate()]);
  assert.equal((await readOne(exact, 1, 'exact')).price.status, 'unavailable');
  assert.equal(metadataCalls(exact).length, 0, 'exact mode never consults the provisional policy');
  const unresolved = fixture([]);
  assert.equal((await readOne(unresolved)).unavailableReason, 'unresolved_catalogue_identity');
  assert.equal(metadataCalls(unresolved).length, 0);
  const ambiguous = fixture([], { byReference: { [id(1)]: [candidate(), candidate(2)] } });
  assert.equal((await readOne(ambiguous)).unavailableReason, 'ambiguous_catalogue_identity');
  assert.equal(metadataCalls(ambiguous).length, 0);
  const ambiguousDefault = fixture([], { byReference: { [id(1)]: [candidate(1, { requested_variant_ids: [], is_default: false }), candidate(2, { printing_id: id(1001), set_id: id(2001), requested_variant_ids: [], is_default: false })] } });
  assert.equal((await readOne(ambiguousDefault)).unavailableReason, 'ambiguous_default_variant');
  assert.equal(metadataCalls(ambiguousDefault).length, 0);
  for (const overrides of [{ product_kind: 'graded_card' }, { productType: 'sealed' }, { grader_code: 'psa', grade_value: 10 }, { catalogue_version_id: null }]) {
    const f = fixture([candidate(1, overrides)]);
    assert.equal((await readOne(f)).price.status, 'unavailable');
    assert.equal(metadataCalls(f).length, 0, 'raw published identity is required');
  }

  for (const overrides of [{ estimate: quote(42) }, { snapshot: quote(43) }, { estimate: quote(44, { freshness: 'stale' }) }, { estimate: quote(45, { status: 'last_sold', priceType: 'last_sold', provenLastSold: true, lastSoldEvidence: { observationId: 'sale' } }) }]) {
    const f = fixture([candidate(1, overrides)]);
    const row = await readOne(f);
    assert.ok(row.price.estimates.central >= 42);
    assert.equal(metadataCalls(f).length, 0, 'all positive stored quotes precede a baseline, even stale or sold');
  }
  const exactSold = await readOne(fixture([candidate(1, { estimate: quote(45, { status: 'last_sold', priceType: 'last_sold', provenLastSold: true }) })]), 1, 'exact');
  assert.equal(exactSold.price.provenLastSold, true, 'exact stored sale behavior is preserved');
  const mapped = fixture([candidate(1, { general_quote: { central_estimate: 6, dataset_at: '2026-10-01', stale_after: '2027-01-01', provider: 'tcgcsv' } })]);
  assert.equal((await readOne(mapped)).price.estimates.central, 6);
  assert.equal(metadataCalls(mapped).length, 0);
  const printingQuote = { provider: 'tcgcsv', centralEstimate: 7.5, originalPrice: 10, originalCurrency: 'USD', currency: 'GBP', exchangeRate: 0.75,
    sourceCreatedAt: '2026-10-01', exchangeRateAt: '2026-10-01', staleAfter: '2027-01-01', exchangeRateSource: 'reviewed-fixture',
    priceScope: 'printing_general_estimate', usableForExactVariant: false, usableForHoldingsValuation: false,
    language: 'en', condition: null, finish: null, grade: null, providerSubtype: 'Normal', providerCategoryId: 3, providerGroupId: 1, providerProductId: 1, anchorVariantId: id(1) };
  const printing = fixture([candidate()], { guides: { read_catalogue_printing_general_prices: [{ printing_id: id(1001), quote: printingQuote }] } });
  assert.equal((await readOne(printing)).price.estimates.central, 7.5);
  assert.equal(metadataCalls(printing).length, 0, 'reviewed provider printing guide precedes baseline');
  const cardmarketQuote = { ...printingQuote, provider: 'cardmarket_public', originalCurrency: 'EUR', language: null, priceScope: 'blended_general_estimate', selectedField: 'trend' };
  const cardmarket = fixture([candidate()], { guides: { read_cardmarket_blended_general_prices: [{ printing_id: id(1001), quote: cardmarketQuote }] } });
  assert.equal((await readOne(cardmarket)).price.estimates.central, 7.5);
  assert.equal(metadataCalls(cardmarket).length, 0);

  for (const mismatch of [{ catalogue_version_id: id(9001) }, { language_code: 'ja' }, { printing_id: id(8888) }, { set_id: id(7777) }, { variant_id: id(6666) }]) {
    const f = fixture([candidate()], { cardRows: [{ ...candidate(), ...mismatch }], ignoreFilters: true });
    assert.equal((await readOne(f)).price.status, 'unavailable', 'another publication/printing cannot lend rarity');
  }
  assert.equal((await readOne(fixture([candidate()], { cardRows: [candidate(), candidate()] }))).price.status, 'unavailable', 'duplicate published metadata is ambiguous');
  const setMismatch = await readOne(fixture([candidate()], { setRows: [{ ...candidate(), catalogue_version_id: id(9001), release_date: '1999' }], ignoreFilters: true }));
  assert.equal(setMismatch.price.estimates.central, 0.1, 'foreign publication set dates are ignored');
  for (const error of [{ errorTable: 'catalogue_cards' }, { rejectTable: 'catalogue_cards' }]) {
    const f = fixture([candidate(1), candidate(2, { estimate: quote(50) })], error);
    const result = await f.read({ references: [id(1), id(2)], estimateMode: 'general' });
    assert.equal(result.prices[0].price.status, 'unavailable');
    assert.equal(result.prices[1].price.estimates.central, 50, 'optional metadata failure preserves saved prices');
  }
  const failedSet = await readOne(fixture([candidate()], { rejectTable: 'catalogue_sets' }));
  assert.equal(failedSet.price.estimates.central, 0.1, 'a verified published card may use explicitly unknown era');

  let rejectLate: (error: Error) => void = () => {};
  const metadataDeferred = { promise: new Promise((_, reject) => { rejectLate = reject; }) };
  const stalled = fixture([candidate(1), candidate(2, { estimate: quote(51) })], { metadataDeferred });
  const started = performance.now();
  const stalledResult = await stalled.read({ references: [id(1), id(2)], estimateMode: 'general' });
  assert.ok(performance.now() - started < 1000, 'optional metadata cannot hold saved prices beyond its 450ms budget');
  assert.equal(stalledResult.prices[0].price.status, 'unavailable');
  assert.equal(stalledResult.prices[1].price.estimates.central, 51, 'already retrieved saved quote survives a stalled transport');
  assert.equal(metadataCalls(stalled).length, 2);
  assert.ok(metadataCalls(stalled).every((call) => call.signal instanceof AbortSignal && call.signal.aborted), 'both published reads receive and abort the shared phase signal');
  const stableSnapshot = JSON.stringify(stalledResult);
  rejectLate(new Error('transport rejects after the response'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(stalledResult), stableSnapshot, 'late rejection is consumed and cannot mutate the delivered snapshot');

  const page = fixture(Array.from({ length: 100 }, (_, i) => candidate(i + 1)));
  const pageResult = await page.read({ references: Array.from({ length: 100 }, (_, i) => id(i + 1)), estimateMode: 'general' });
  assert.equal(pageResult.prices.length, 100);
  assert.ok(pageResult.prices.every((row: any) => row.price.estimates.central === 0.09));
  assert.equal(metadataCalls(page).length, 2, 'one card and one set read for a full same-publication page');
  for (const call of metadataCalls(page)) {
    assert.ok(call.ids.length <= 100);
    assert.equal(call.limit, 100);
    assert.deepEqual(call.filters, [['catalogue_version_id', id(9000)], ['language_code', 'en']]);
  }
  await assert.rejects(page.read({ references: Array.from({ length: 101 }, (_, i) => id(i + 1)), estimateMode: 'general' }), /between 1 and 100/);
  const scoped = fixture([candidate(1), candidate(2, { catalogue_version_id: id(9001), language_code: 'ja' })]);
  const scopedResult = await scoped.read({ references: [id(1), id(2)], estimateMode: 'general' });
  assert.equal(scopedResult.prices.length, 2);
  assert.equal(metadataCalls(scoped).length, 4);
  assert.deepEqual(metadataCalls(scoped).map((call) => call.filters), [
    [['catalogue_version_id', id(9000)], ['language_code', 'en']], [['catalogue_version_id', id(9000)], ['language_code', 'en']],
    [['catalogue_version_id', id(9001)], ['language_code', 'ja']], [['catalogue_version_id', id(9001)], ['language_code', 'ja']],
  ]);
  console.log('Server catalogue baseline passed: reviewed policy parity, pennies, saved/provider precedence, raw published identity, version scope, optional failure, revisions and bounded reads.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
