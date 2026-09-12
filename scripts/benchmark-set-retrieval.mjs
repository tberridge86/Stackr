import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const base = process.env.STACKR_PERF_BASE_URL;
if (!base || !base.startsWith('https://')) throw new Error('Supply the exact HTTPS catalogue endpoint in STACKR_PERF_BASE_URL.');
const sets = [
  { name: 'Perfect Order', id: 'a6a2829a-c5e6-444f-8d92-d6e0de9fdf64', count: 124 },
  { name: 'Surging Sparks', id: '6203fef9-a8e6-4b20-b80a-68447b2166fc', count: 252 },
];
const report = { observedAt: new Date().toISOString(), scope: 'HTTP client through configured endpoint; not mobile rendering or a controlled cold database test', baseUrl: base, runner: process.env.RUNNER_OS ?? process.platform, scriptCommit: process.env.GITHUB_SHA ?? null, sets: [] };
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
for (const set of sets) {
  const samples = [];
  for (let sample = 0; sample < 11; sample++) {
    const started = performance.now(); let cards = []; let cursor = null; let pages = 0; let bytes = 0;
    const seenCursors = new Set(); const requestIds = []; let error = null;
    try {
      do {
        const url = new URL(`${base.replace(/\/$/, '')}/v1/sets/${set.id}/cards`);
        url.searchParams.set('limit', '500'); url.searchParams.set('includeAssets', 'false'); url.searchParams.set('language', 'en');
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        requestIds.push(response.headers.get('x-request-id'));
        assert.equal(response.status, 200, `Unexpected HTTP status ${response.status}`);
        const text = await response.text(); bytes += Buffer.byteLength(text);
        const json = JSON.parse(text); assert(Array.isArray(json.data?.cards), 'Response must contain a structured cards array');
        cards.push(...json.data.cards); pages++;
        cursor = json.meta?.pagination?.nextCursor ?? null;
        if (cursor) { assert(!seenCursors.has(cursor), 'Cursor repeated'); seenCursors.add(cursor); }
        assert(pages <= 16, 'Too many pages');
      } while (cursor);
      assert.equal(cards.length, set.count, 'Incorrect complete card count');
      assert.equal(new Set(cards.map((card) => card.cardId)).size, set.count, 'Duplicate canonical identities');
      assert(cards.every((card) => card.set?.setId === set.id && card.languageCode === 'en'), 'Mixed set/language');
      const numbers = cards.map((card) => Number(card.collectorNumber?.value)).sort((a, b) => a - b);
      assert.deepEqual(numbers, Array.from({ length: set.count }, (_, i) => i + 1), 'Collector numbers missing or duplicated');
      assert(cards.every((card) => card.variants?.length && card.variants.some((variant) => variant.variantId === card.defaultVariantId)), 'Missing variant identity');
    } catch (failure) { error = failure.message; }
    samples.push({ sample, milliseconds: Math.round((performance.now() - started) * 10) / 10, count: cards.length, uniqueCount: new Set(cards.map((card) => card.cardId)).size, pages, bytes, requestIds, error });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const warm = samples.slice(1); const times = warm.map((sample) => sample.milliseconds);
  const result = { name: set.name, expectedCount: set.count, firstObserved: samples[0], warm: { n: warm.length, p50: percentile(times, .5), p95: percentile(times, .95), p99: percentile(times, .99), max: Math.max(...times) }, passed: samples.every((sample) => !sample.error) && warm.every((sample) => sample.milliseconds <= 500), samples };
  report.sets.push(result); console.log(JSON.stringify(result));
}
fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/set-retrieval-evidence.json', JSON.stringify(report, null, 2));
console.log(`API acceptance: ${report.sets.every((set) => set.passed) ? 'PASS' : 'FAIL'}. Mobile release remains separately gated.`);
if (!report.sets.every((set) => set.passed)) process.exitCode = 1;
