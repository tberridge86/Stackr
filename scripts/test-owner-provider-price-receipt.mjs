import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual CLI logging expression without importing the worker,
// connecting to a database, or calling a provider.
const worker = readFileSync('scripts/refresh-owner-provider-prices.mjs', 'utf8');
const statement = worker.match(/console\.log\(JSON\.stringify\(\{ worker: 'owner-provider-price-refresh',[\s\S]*?\)\);/)?.[0];
assert.ok(statement, 'Locate the existing operational receipt emission');
const ids = Array.from({ length: 499 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
const summary = {
  selected: ids.length,
  selectedVariantIds: ids,
  refreshed: 325,
  unavailable: 172,
  failed: 2,
  failureDiagnostics: [
    { variantId: ids[0], code: 'exact_provider_refresh_failed', source: 'owned' },
    { variantId: ids[1], code: 'exact_provider_quote_unavailable', source: 'owned' },
  ],
  completeOwnedCompleted: true,
};
const valuation = { published: false, diagnostics: { elapsedMs: 123 } };
function emit(code, result) {
  const writes = [];
  runInNewContext(code, {
    summary, valuation: result,
    console: { log(value) { writes.push(String(value)); } },
  });
  assert.equal(writes.length, 1, 'Emit one receipt per invocation');
  return writes[0];
}
function checkReceipt(line, expectedValuation) {
  assert.equal(line.split('\n').length, 1, 'A receipt must occupy one physical log entry');
  const parsed = JSON.parse(line);
  assert.deepEqual(parsed, {
    worker: 'owner-provider-price-refresh', ...summary,
    valuationPublished: expectedValuation?.published ?? false,
    valuationDiagnostics: expectedValuation?.diagnostics ?? null,
  }, 'Retain every selection, outcome and diagnostic association');
}
checkReceipt(emit(statement, valuation), valuation);
checkReceipt(emit(statement, null), null);
// This is the exact former formatting: it splits a near-bound receipt across
// more than the MCP log reader's maximum 500 entries.
const oldStatement = statement.replace(/\}\)\);$/, '}, null, 2));');
assert.notEqual(oldStatement, statement, 'Restore the old pretty-printing negative control');
const oldReceipt = emit(oldStatement, valuation);
assert.ok(oldReceipt.split('\n').length > 500);
assert.throws(() => checkReceipt(oldReceipt, valuation), /one physical log entry/);
console.log('Owner price receipt: 2 round-trip controls and old-format negative control passed.');
