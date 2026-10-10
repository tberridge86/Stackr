import assert from 'node:assert/strict';
import { dailyGuideFreshness, requireFreshDailyGuide, summarizeCatalogueDailyRun } from './catalogue-price-daily-status.mjs';

const now = Date.parse('2026-10-10T12:00:00Z');
assert.equal(dailyGuideFreshness('2026-10-09T20:05:19+0000', now).state, 'fresh', 'daily publication may cross UTC midnight');
assert.equal(dailyGuideFreshness('2026-10-08T12:00:00Z', now).state, 'fresh');
assert.throws(() => requireFreshDailyGuide('2026-10-08T11:59:59Z', now), /stale/);
assert.throws(() => requireFreshDailyGuide('2026-10-10T12:06:00Z', now), /future/);
assert.throws(() => requireFreshDailyGuide(null, now), /unknown/);
const row = { language_code: 'en', total: 2, supported: 2, mapped: 2, unmapped: 0, priced: 2, stale: 0, missing_quote: 0, retry: 0, unsupported: 0 };
const report = { datasetAt: '2026-10-10T00:00:00Z', health: { runStatus: 'complete', groups: [{ status: 'complete', total: 1 }] },
  coverage: { cards: [row], openRepairs: 0, runStatus: 'complete', diagnostics: { atomic: false, scanned: 2, catalogueVersions: [{ language_code: 'en', id: 'fixture-version' }] } } };
assert.equal(summarizeCatalogueDailyRun(report, now).dailyReadiness.fullCatalogueCurrent, true);
for (const changed of [{ stale: 1 }, { priced: 1 }, { total: 3, unsupported: 1 }]) {
  assert.equal(summarizeCatalogueDailyRun({ ...report, coverage: { ...report.coverage, cards: [{ ...row, ...changed }] } }, now).dailyReadiness.fullCatalogueCurrent, false);
}
const gaps = summarizeCatalogueDailyRun({ ...report, health: { ...report.health, runStatus: 'needs_mapping' }, coverage: { ...report.coverage, openRepairs: 35 } }, now);
assert.equal(gaps.dailyReadiness.processingComplete, true);
assert.equal(gaps.dailyReadiness.fullCatalogueCurrent, false, 'completed work does not certify all prices');
assert.equal(summarizeCatalogueDailyRun({ ...report, coverage: null }, now).dailyReadiness.coverageVerified, false);
assert.equal(summarizeCatalogueDailyRun({ ...report, datasetAt: '2026-10-01T00:00:00Z' }, now).dailyReadiness.fullCatalogueCurrent, false);
const excluded = summarizeCatalogueDailyRun({ ...report, coverage: { ...report.coverage, diagnostics: { ...report.coverage.diagnostics, scanned: 3 } } }, now);
assert.equal(excluded.dailyReadiness.unclassifiedRows, 1);
assert.equal(excluded.dailyReadiness.fullCatalogueCurrent, false, 'a raw published member excluded by identity joins still belongs in the denominator');
assert.equal(summarizeCatalogueDailyRun({ ...report, coverage: { ...report.coverage, diagnostics: {} } }, now).dailyReadiness.fullCatalogueCurrent, false);
const large = { ...report, coverage: { ...report.coverage, cards: Array.from({ length: 1000 }, () => row), diagnostics: { ...report.coverage.diagnostics, scanned: 2000 } } };
const compact = summarizeCatalogueDailyRun(large, now);
assert.equal(compact.coverage.languages.en.total, 2000);
assert.ok(JSON.stringify(compact).length < 1500, 'daily logs must remain bounded');
assert.equal(large.coverage.cards.length, 1000, 'callers retain the detailed offline report');
console.log('Daily pricing: publication freshness, honest coverage and bounded logs passed.');
