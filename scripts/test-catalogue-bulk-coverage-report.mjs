import assert from 'node:assert/strict';
import { deriveCatalogueBulkCoverageRunStatus, readPagedCatalogueBulkCoverage } from './catalogue-bulk-coverage-report.mjs';

const runId = '11111111-1111-4111-8111-111111111111';
const versionEn = '22222222-2222-4222-8222-222222222222';
const versionJa = '33333333-3333-4333-8333-333333333333';
const setEn = '44444444-4444-4444-8444-444444444444';
const setJa = '55555555-5555-4555-8555-555555555555';
const cursorOne = '66666666-6666-4666-8666-666666666666';
const cursorTwo = '77777777-7777-4777-8777-777777777777';
const cursorThree = '88888888-8888-4888-8888-888888888888';
const versions = [{ language_code: 'en', id: versionEn }, { language_code: 'ja', id: versionJa }];
const health = { runId, groups: [{ categoryId: 85, status: 'complete', total: 3 }, { categoryId: 3, status: 'unmapped', total: 1 }], openRepairs: 0, runStatus: 'needs_mapping' };

function card(language_code, set_id, values = {}) {
  return { language_code, set_id, total: 1, supported: 1, mapped: 1, unmapped: 0, priced: 1, stale: 0, missing_quote: 0, retry: 0, unsupported: 0, ...values };
}

const calls = [];
const report = await readPagedCatalogueBulkCoverage({
  health,
  runId,
  pageLimit: 2,
  readPage: async ({ after, limit, runId: passedRunId }) => {
    calls.push({ after, limit, runId: passedRunId });
    if (after === null) return { runId, cards: [card('ja', setJa, { total: 2, supported: 2, mapped: 1, unmapped: 1, priced: 2, stale: 1 })], scanned: 2, nextAfter: cursorOne, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:00:00.000Z' };
    if (after === cursorOne) return { runId, cards: [], scanned: 2, nextAfter: cursorTwo, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:00:01.000Z' };
    return { runId, cards: [card('ja', setJa, { total: 3, supported: 2, unsupported: 1, mapped: 2, priced: 2, missing_quote: 1 }), card('en', setEn, { total: 4, supported: 4, mapped: 4, priced: 3, retry: 1 })], scanned: 1, nextAfter: cursorThree, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:00:02.000Z' };
  }
});
assert.deepEqual(calls.map((call) => call.after), [null, cursorOne, cursorTwo], 'an invalid-only page still advances the raw UUID cursor');
assert.equal(report.diagnostics.pages, 3);
assert.equal(report.diagnostics.scanned, 5);
assert.equal(report.diagnostics.atomic, false);
assert.deepEqual(report.cards, [
  card('en', setEn, { total: 4, supported: 4, mapped: 4, priced: 3, retry: 1 }),
  card('ja', setJa, { total: 5, supported: 4, unsupported: 1, mapped: 3, unmapped: 1, priced: 4, stale: 1, missing_quote: 1 })
]);
assert.deepEqual(report.groups, [{ category_id: 3, status: 'unmapped', total: 1 }, { category_id: 85, status: 'complete', total: 3 }]);
assert.equal(report.runStatus, 'needs_mapping');

const empty = await readPagedCatalogueBulkCoverage({ health: { ...health, groups: [], runStatus: 'not_started' }, runId, readPage: async () => ({ runId, cards: [], scanned: 0, nextAfter: null, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:01:00.000Z' }) });
assert.equal(empty.runStatus, 'not_started');
assert.deepEqual(empty.cards, []);
const invalidOnlyTerminal = await readPagedCatalogueBulkCoverage({ health, runId, readPage: async () => ({ runId, cards: [], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:01:01.000Z' }) });
assert.equal(invalidOnlyTerminal.diagnostics.scanned, 1, 'a physically scanned but invalid-only terminal page is valid');
assert.equal(deriveCatalogueBulkCoverageRunStatus([{ status: 'failed' }], [], 0), 'partial');
assert.equal(deriveCatalogueBulkCoverageRunStatus([{ status: 'complete' }], [card('en', setEn, { unmapped: 1 })], 0), 'needs_mapping');
assert.equal(deriveCatalogueBulkCoverageRunStatus([{ status: 'complete' }], [], 1), 'needs_mapping');
assert.equal(deriveCatalogueBulkCoverageRunStatus([{ status: 'complete' }], [], 0), 'complete');

async function rejects(name, options, pattern) {
  await assert.rejects(() => readPagedCatalogueBulkCoverage({ health, runId, ...options }), pattern, name);
}
await rejects('changed current versions fail closed', { readPage: async ({ after }) => after === null ? ({ runId, cards: [], scanned: 1, nextAfter: cursorOne, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:02:00.000Z' }) : ({ runId, cards: [], scanned: 0, nextAfter: cursorOne, complete: true, catalogueVersions: [{ language_code: 'en', id: versionJa }], observedAt: '2026-10-04T18:02:01.000Z' }) }, /catalogueVersions changed/);
await rejects('bad counts fail closed', { readPage: async () => ({ runId, cards: [card('en', setEn, { priced: -1 })], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:03:00.000Z' }) }, /priced must be a non-negative/);
await rejects('count relationships fail closed', { readPage: async () => ({ runId, cards: [card('en', setEn, { total: 2, supported: 2, unsupported: 1, priced: 1 })], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:03:01.000Z' }) }, /supported plus unsupported/);
await rejects('duplicate language and set rows fail closed', { readPage: async () => ({ runId, cards: [card('en', setEn), card('en', setEn)], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:03:02.000Z' }) }, /duplicate language_code:set_id/);
await rejects('terminal full page cannot claim completion', { pageLimit: 1, readPage: async () => ({ runId, cards: [card('en', setEn)], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:03:03.000Z' }) }, /terminal page must scan fewer/);
await rejects('nonterminal cursor regression fails closed', { readPage: async () => ({ runId, cards: [], scanned: 1, nextAfter: cursorOne, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:04:00.000Z' }) }, /maxPages|did not advance/, );
await rejects('nonterminal missing cursor fails closed', { readPage: async () => ({ runId, cards: [], scanned: 1, nextAfter: null, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:04:01.000Z' }) }, /nextAfter must be a UUID/);
await rejects('terminal cursor regression fails closed', { readPage: async ({ after }) => after === null ? ({ runId, cards: [], scanned: 1, nextAfter: cursorTwo, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:04:02.000Z' }) : ({ runId, cards: [], scanned: 1, nextAfter: cursorOne, complete: true, catalogueVersions: versions, observedAt: '2026-10-04T18:04:03.000Z' }) }, /terminal page did not advance/);
await rejects('API errors never fall back to the whole report RPC', { readPage: async () => { throw new Error('temporary RPC failure'); } }, /page request failed/);
await rejects('bounded pages refuse an incomplete report', { maxPages: 1, readPage: async () => ({ runId, cards: [], scanned: 1, nextAfter: cursorOne, complete: false, catalogueVersions: versions, observedAt: '2026-10-04T18:05:00.000Z' }) }, /exceeded maxPages/);
await rejects('page limit stays inside the RPC bound', { pageLimit: 5001, readPage: async () => null }, /pageLimit/);

console.log('Catalogue bulk coverage report passed: paged physical aggregation preserves the full coverage schema and fails closed.');
