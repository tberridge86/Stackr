import assert from 'node:assert/strict';
import { PersonalDataReadTimeoutError, withPersonalDataReadTimeout } from '../lib/personalDataRead';

async function main() {
  let successfulSignal: AbortSignal | undefined;
  assert.equal(await withPersonalDataReadTimeout(async (signal) => {
    successfulSignal = signal;
    return 'saved cards';
  }, { timeoutMs: 20 }), 'saved cards');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(successfulSignal?.aborted, false, 'Success clears the deadline instead of later aborting unrelated work.');

  const denied = Object.assign(new Error('No access'), { status: 403 });
  await assert.rejects(withPersonalDataReadTimeout(() => Promise.reject(denied)), (error) => error === denied,
    'An access denial keeps its identity so callers can revoke saved views.');

  let hungSignal: AbortSignal | undefined;
  let finishLate!: (value: string) => void;
  let published = '';
  const late = new Promise<string>((resolve) => { finishLate = resolve; });
  await assert.rejects((async () => {
    published = await withPersonalDataReadTimeout((signal) => {
      hungSignal = signal;
      return late;
    }, { timeoutMs: 10 });
  })(), PersonalDataReadTimeoutError, 'An SDK promise that ignores abort cannot leave the caller loading forever.');
  assert.equal(hungSignal?.aborted, true);
  finishLate('outdated account data');
  await late;
  await Promise.resolve();
  assert.equal(published, '', 'Late SDK completion cannot continue the expired caller.');

  let lateReject!: (reason: Error) => void;
  const lateFailure = new Promise<never>((_, reject) => { lateReject = reject; });
  await assert.rejects(withPersonalDataReadTimeout(() => lateFailure, { timeoutMs: 10 }), PersonalDataReadTimeoutError);
  lateReject(new Error('late transport failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const abort = new AbortController();
  let transportSignal: AbortSignal | undefined;
  const pending = withPersonalDataReadTimeout((signal) => {
    transportSignal = signal;
    return new Promise<never>(() => {});
  }, { signal: abort.signal });
  await Promise.resolve();
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(transportSignal?.aborted, true, 'Account cancellation propagates to the transport.');
  let started = false;
  await assert.rejects(withPersonalDataReadTimeout(async () => { started = true; }, { signal: abort.signal }), { name: 'AbortError' });
  assert.equal(started, false, 'A cancelled account must not dispatch another read.');

  assert.equal(await withPersonalDataReadTimeout(async () => 'retry succeeds'), 'retry succeeds',
    'A hung read does not poison a later retry.');
  console.log('Personal collection read deadline and cancellation checks passed.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
