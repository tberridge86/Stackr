import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildCompletedBCommand } from './build-r2-completed-b-command-20261027.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
test('source bounds reject empty and oversized modules', () => {
  for (const s of ['', null, 'x'.repeat(131073)]) assert.throws(() => buildCompletedBCommand(s), /closeout_source_bound/);
});
test('composed shell entry emits bounded three-event receipt without starting uploader', () => {
  const source = `export async function inspectCompletedB20261027(){return {certificateSha256:'${'a'.repeat(64)}',events:[{event:'one'},{event:'two'},{event:'three'}]}}`;
  const built = buildCompletedBCommand(source);
  assert.equal(built.sourceSha256, hash(source));
  assert.equal(built.commandSha256, hash(built.startCommand));
  const r = spawnSync('/bin/sh', ['-c', built.startCommand], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  const events = r.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 5);
  assert.equal(events[0].runnerStarted, false);
  assert.equal(events.at(-1).completionVerified, false);
});
test('unsafe exceptions are redacted and fail closed', () => {
  const built = buildCompletedBCommand(`export async function inspectCompletedB20261027(){throw new Error('private-value-must-not-leak')}`);
  const r = spawnSync('/bin/sh', ['-c', built.startCommand], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes('private-value'));
  assert.equal(JSON.parse(r.stdout.trim().split('\n').at(-1)).code, 'closeout_failed');
});
test('oversized receipt event is rejected before log emission', () => {
  const built = buildCompletedBCommand(`export async function inspectCompletedB20261027(){return {events:[{payload:'x'.repeat(9000)},{},{}]}}`);
  const r = spawnSync('/bin/sh', ['-c', built.startCommand], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').at(-1)).code, 'closeout_output_bound');
});
