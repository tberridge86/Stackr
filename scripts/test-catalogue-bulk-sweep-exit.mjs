import assert from 'node:assert/strict';
import { durableSweepExitCode } from './refresh-catalogue-bulk-prices.mjs';

const terminal = { runStatus: 'needs_mapping', groups: [{ category_id: 3, status: 'complete', total: 121 }, { category_id: 3, status: 'unmapped', total: 99 }, { category_id: 85, status: 'complete', total: 163 }, { category_id: 85, status: 'unmapped', total: 296 }] };
assert.equal(durableSweepExitCode(terminal), 0, 'historical recovered delays do not make a terminal ledger fail');
assert.equal(durableSweepExitCode({ ...terminal, runStatus: 'complete' }), 0);
assert.equal(durableSweepExitCode({ ...terminal, groups: [{ status: 'failed', total: 1 }] }), 1, 'current failed work retries');
assert.equal(durableSweepExitCode({ ...terminal, groups: [{ status: 'running', total: 1 }] }), 1, 'active work retries');
assert.equal(durableSweepExitCode({ ...terminal, groups: [{ status: 'complete', total: 0 }] }), 1, 'malformed totals fail closed');
assert.equal(durableSweepExitCode({ runStatus: 'needs_mapping', groups: [] }), 1, 'empty health never passes');
assert.equal(durableSweepExitCode(null), 1);
console.log('Catalogue bulk sweep exit passed: only a validated terminal durable ledger clears the cron failure.');
