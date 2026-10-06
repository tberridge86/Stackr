import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runPriceCron } from './run-catalogue-price-cron.mjs';

const messages = [];
let options;
const child = new EventEmitter();
child.kill = () => {};
const normal = runPriceCron({ spawnImpl: (...args) => { options = args; return child; }, log: (value) => messages.push(JSON.parse(value)) });
assert.ok(options[1].includes('--apply'));
assert.equal(options[2].windowsHide, true);
child.emit('exit', 0, null);
assert.equal(await normal, 0);

const stalled = new EventEmitter();
const signals = [];
stalled.kill = (signal) => { signals.push(signal); if (signal === 'SIGKILL') stalled.emit('exit', null, signal); };
assert.equal(await runPriceCron({ spawnImpl: () => stalled, timeoutMs: 5, killGraceMs: 5, log: (value) => messages.push(JSON.parse(value)) }), 124);
assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
assert.ok(messages.some((value) => value.event === 'catalogue_price_cron_timeout'));

const failed = new EventEmitter();
failed.kill = () => {};
const startup = runPriceCron({ spawnImpl: () => failed, log: () => {} });
failed.emit('error', new Error('provider unavailable'));
assert.equal(await startup, 1);
console.log('Catalogue price cron: clean exit, timeout escalation, and startup failure passed.');
