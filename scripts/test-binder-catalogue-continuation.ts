import assert from 'node:assert/strict';
import { continueBinderCatalogueRead } from '../lib/binderCatalogueContinuation';

const deferred = () => {
  let resolve!: (cards: unknown[]) => void;
  const promise = new Promise<unknown[]>((done) => { resolve = done; });
  return { promise, resolve };
};
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

async function main() {
  let current = true, claimed = false, reloads = 0;
  const pending = deferred();
  const options = { read: () => pending.promise, isCurrent: () => current,
    claimReload: () => claimed ? false : (claimed = true), reload: () => { reloads++; } };
  const continuation = continueBinderCatalogueRead(options);
  continuation.markIncomplete();
  assert.equal(reloads, 0, 'incomplete saved rows stay visible while full facts are pending');
  pending.resolve([{}, {}]); await continuation.settled; await nextTurn();
  assert.equal(reloads, 1, 'a validated complete read triggers one retained-view reload');
  continuation.markIncomplete(); await nextTurn(); assert.equal(reloads, 1);
  const repeated = continueBinderCatalogueRead({ ...options, read: async () => [{}] });
  repeated.markIncomplete(); await repeated.settled; await nextTurn();
  assert.equal(reloads, 1, 'the same binder/account epoch cannot loop through repeated reloads');
  const switched = deferred(); claimed = false;
  const obsolete = continueBinderCatalogueRead({ ...options, read: () => switched.promise });
  obsolete.markIncomplete(); current = false;
  switched.resolve([{}]); await obsolete.settled; await nextTurn();
  assert.equal(reloads, 1, 'late facts cannot reload a replaced account or request');
  current = true;
  for (const read of [async () => [], async () => { throw new Error('page stalled'); }]) {
    const incomplete = continueBinderCatalogueRead({ ...options, read });
    incomplete.markIncomplete(); await incomplete.settled; await nextTurn();
    assert.equal(reloads, 1, 'empty/failed facts never masquerade as completion');
  }
  const foregroundComplete = continueBinderCatalogueRead({ ...options, read: async () => [{}] });
  await foregroundComplete.settled; await nextTurn();
  assert.equal(reloads, 1, 'an already complete foreground view needs no reload');
  console.log('Binder slow-catalogue continuation preserves rows, retries once, and rejects obsolete/partial completions.');
}
void main();
