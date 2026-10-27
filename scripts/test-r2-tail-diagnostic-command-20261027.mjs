import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { buildTailDiagnosticCommand } from './build-r2-tail-diagnostic-command-20261027.mjs';

function run(source) {
  const { startCommand } = buildTailDiagnosticCommand(source);
  return spawnSync('/bin/sh', ['-c', startCommand], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 65536, env: { PATH: process.env.PATH },
  });
}

test('generated command routes only the two fixed runs and exits after evidence output', () => {
  const source = `export async function inspectOptimisedTail20261027({runId}) {
    return {events:[{event:'fixture',runId}]};
  }`;
  const first = buildTailDiagnosticCommand(source);
  assert.deepEqual(buildTailDiagnosticCommand(source), first);
  const result = run(source);
  assert.equal(result.status, 0, result.stderr);
  const events = result.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.filter(e => e.event === 'fixture').map(e => e.runId),
    ['production-optimised-20261026b', 'production-resumed-20261026a']);
  assert.equal(events[0].sourceSha256, first.sourceSha256);
  assert.equal(events.at(-1).event, 'r2_tail_diagnostic_all_runs_complete');
  assert.equal(events.at(-1).resumeAuthorized, false);
});

test('embedded source is shell-quoted and error text is never emitted', () => {
  const result = run(`throw Object.assign(new Error('PRIVATE_SECRET_$HOME_' + String.raw\`$(touch /must-not-exist)\`),{code:'PRIVATE_SECRET'});`);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('PRIVATE_SECRET'), false);
  assert.deepEqual(JSON.parse(result.stdout.trim()),
    {event:'r2_tail_diagnostic_failed',code:'diagnostic_failed',resumeAuthorized:false});
});

test('oversized records fail closed before their payload is emitted', () => {
  const result = run(`export async function inspectOptimisedTail20261027(){return {events:[{secret:'PRIVATE_'+'x'.repeat(9000)}]};}`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes('PRIVATE_'), false);
  assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).code, 'diagnostic_output_bound');
  assert.equal(result.stdout.includes('all_runs_complete'), false);
});

test('too many records fail closed and an invalid source bound is rejected', () => {
  const result = run(`export async function inspectOptimisedTail20261027(){return {events:Array.from({length:199},()=>({event:'unexpected'}))};}`);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes('unexpected'), false);
  assert.throws(() => buildTailDiagnosticCommand(''), /diagnostic_source_bound/);
  assert.throws(() => buildTailDiagnosticCommand('x'.repeat(131073)), /diagnostic_source_bound/);
});
