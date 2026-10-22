import assert from 'node:assert/strict';
import { fetchCatalogueQualityReport, summariseQualityRows } from './catalogue-ingestion/qualityReport.ts';

const row = (n, language = 'ja') => ({
  set_id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  game_code: 'pokemon', language_code: language, native_name: 'Repeated name',
  expected_set_total: 600, imported_set_total: 600,
  expected_vs_imported_set_delta: 0, expected_card_total: 1,
  imported_card_total: 1, expected_vs_imported_card_delta: 0,
  cards_missing_images: 0, set_missing_logo: false,
});
function fakeDb(source, { cap = Infinity, failAt, mutate } = {}) {
  const calls = [];
  return {
    calls,
    schema(name) {
      assert.equal(name, 'ingest');
      return { from(table) {
        assert.equal(table, 'catalogue_quality_report');
        const call = {}; calls.push(call);
        const q = {
          select() { return q; },
          order(key, options) { assert.equal(key, 'set_id'); assert.equal(options.ascending, true); return q; },
          limit(n) { call.limit = n; return q; },
          eq(key, value) { assert.equal(key, 'language_code'); call.language = value; return q; },
          gt(key, value) { assert.equal(key, 'set_id'); call.cursor = value; return q; },
          then(resolve, reject) {
            const data = source.filter(r => (!call.language || r.language_code === call.language)
              && (!call.cursor || r.set_id > call.cursor)).slice(0, Math.min(call.limit, cap));
            return Promise.resolve({ data: mutate ? mutate(data, calls.length) : data,
              error: calls.length === failAt ? new Error('page failed') : null }).then(resolve, reject);
          },
        };
        return q;
      } };
    },
  };
}

const source = Array.from({ length: 626 }, (_, i) => row(i + 1, i < 600 ? 'ja' : 'ko'));
source.at(-1).cards_missing_images = 7; // Gap deliberately beyond the old 500-row cutoff.
source.at(-1).expected_card_total = null;
for (const r of source.slice(600)) { r.expected_set_total = 26; r.imported_set_total = 26; }
let cases = 0;
for (const cap of [Infinity, 200]) {
  const db = fakeDb(source, { cap });
  const result = await fetchCatalogueQualityReport(db);
  assert.equal(result.rows.length, 626);
  assert.equal(result.pagination.complete, true);
  assert.equal(result.pagination.terminationReason, 'end_of_results');
  assert.equal(result.summary.importedSetTotal, 626);
  assert.equal(result.summary.cardsMissingImages, 7);
  assert.equal(result.summary.unknownExpectedCardTotalSets, 1);
  assert.equal(result.summary.knownExpectedCardTotal, 625);
  assert.equal(result.summary.expectedCardTotal, null);
  assert.equal(result.summary.expectedVsImportedCardDelta, null);
  assert.equal(result.summary.expectedCardTotalStatus, 'incomplete');
  assert.deepEqual(result.byGameAndLanguage.map(g => [g.language, g.summary.sets]), [['ja',600],['ko',26]]);
  assert.ok(db.calls.every(c => c.limit <= 250));
  cases++;
}
const capped = await fetchCatalogueQualityReport(fakeDb(source), { limit: 500 });
assert.equal(capped.rows.length, 500);
assert.equal(capped.pagination.complete, false);
assert.equal(capped.pagination.terminationReason, 'requested_limit');
cases++;
const exact = await fetchCatalogueQualityReport(fakeDb(source.slice(0,500)), { limit: 500 });
assert.equal(exact.pagination.complete, true);
cases++;
const scoped = await fetchCatalogueQualityReport(fakeDb(source, { cap: 20 }), { language: 'ko' });
assert.equal(scoped.rows.length, 26);
assert.equal(scoped.pagination.complete, true);
assert.equal(scoped.summary.importedSetTotal, 26);
cases++;
const empty = await fetchCatalogueQualityReport(fakeDb([]));
assert.equal(empty.pagination.complete, true);
assert.equal(empty.summary.sets, 0);
assert.equal(empty.summary.expectedCardTotal, 0);
cases++;
const bounded = await fetchCatalogueQualityReport(fakeDb(source, { cap: 1 }));
assert.equal(bounded.pagination.complete, false);
assert.equal(bounded.pagination.terminationReason, 'page_budget');
assert.equal(bounded.pagination.pagesFetched, 20);
cases++;
await assert.rejects(fetchCatalogueQualityReport(fakeDb(source, { failAt: 2 })), /page failed/);
cases++;
await assert.rejects(fetchCatalogueQualityReport(fakeDb(source, {
  mutate: (data, page) => page === 2 ? [source[0]] : data,
})), /page_identity_mismatch/);
cases++;
await assert.rejects(fetchCatalogueQualityReport(fakeDb(source, {
  mutate: data => data.length ? [{ ...data[0], language_code:'en' }] : data,
}), { language:'ja' }), /page_identity_mismatch/);
cases++;
await assert.rejects(fetchCatalogueQualityReport(fakeDb(source, { mutate: () => null })), /invalid_page/);
cases++;
for (const limit of [0,-1,1.5,NaN,Infinity]) {
  const db = fakeDb(source);
  await assert.rejects(fetchCatalogueQualityReport(db, { limit }), /positive_integer/);
  assert.equal(db.calls.length,0);
}
cases++;
const games = [row(1),{...row(2),game_code:'other',imported_set_total:2,expected_set_total:3}];
assert.equal(summariseQualityRows(games).importedSetTotal,602);
assert.equal(summariseQualityRows(games).expectedSetTotal,603);
cases++;
const complete = summariseQualityRows([row(1), { ...row(2), expected_card_total: 2 }]);
assert.equal(complete.expectedCardTotalStatus, 'complete');
assert.equal(complete.expectedCardTotal, 3);
assert.equal(complete.expectedVsImportedCardDelta, 1);
cases++;
const contaminated = summariseQualityRows([
  row(1),
  { ...row(2), expected_card_total: 23_198, imported_card_total: 17 },
  { ...row(3), expected_card_total: -1 },
  { ...row(4), expected_card_total: 2.5 },
]);
assert.equal(contaminated.expectedCardTotalStatus, 'rejected_invalid_values');
assert.equal(contaminated.expectedCardTotal, null);
assert.equal(contaminated.knownExpectedCardTotal, 1);
assert.equal(contaminated.expectedVsImportedCardDelta, null);
assert.equal(contaminated.rejectedExpectedCardTotalSets, 3);
assert.deepEqual(contaminated.rejectedExpectedCardTotalSetIds, [row(2).set_id, row(3).set_id, row(4).set_id]);
cases++;
console.log(JSON.stringify({ cases, recoveredRows:626, recoveredTailGaps:7,
  rejectedContaminatedDenominators:3, networkCalls:0 }));
