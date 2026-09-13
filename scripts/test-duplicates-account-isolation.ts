import assert from 'node:assert/strict';
import { createAccountLoadGeneration } from '../lib/accountLoadGeneration';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const controller = createAccountLoadGeneration();
  const firstCurrent = controller.begin();
  const firstRead = deferred<string>();
  const commits: string[] = [];
  const first = firstRead.promise.then((account) => {
    if (firstCurrent()) commits.push(account);
  });

  // This models account B opening or refreshing the screen before account A's
  // saved collection resolves. The old result must never commit afterward.
  const secondCurrent = controller.begin();
  const secondRead = deferred<string>();
  const second = secondRead.promise.then((account) => {
    if (secondCurrent()) commits.push(account);
  });
  firstRead.resolve('account-a');
  secondRead.resolve('account-b');
  await Promise.all([first, second]);
  assert.deepEqual(commits, ['account-b']);

  const focusedCurrent = controller.begin();
  controller.invalidate();
  assert.equal(focusedCurrent(), false, 'blur/unmount invalidates its pending account read');
  console.log('Duplicate ownership reads remain isolated across async account changes.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
