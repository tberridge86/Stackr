import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = process.argv[2] ?? fileURLToPath(new URL('../lib/collectionSummary.ts', import.meta.url));
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  let userId = 'owner-a';
  let version = 0;
  let quantity = 1;
  let nextWrite = null;
  let nextRead = null;
  let failWrite = false;
  const stored = new Map();
  const writes = [];
  const moduleExports = {};
  const dependencies = {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async (key) => stored.get(key) ?? null,
      setItem: async (key, value) => {
        const blocker = nextWrite;
        nextWrite = null;
        writes.push({ key, value });
        if (blocker) await blocker.promise;
        if (failWrite) { failWrite = false; throw new Error('storage unavailable'); }
        stored.set(key, value);
      },
      removeItem: async (key) => { stored.delete(key); },
    } },
    './binders': { fetchBinders: () => { throw new Error('Compact summary must not expand binders'); } },
    './ownership': { fetchOwnedCardRows: () => { throw new Error('Compact summary must not expand ownership'); } },
    './collectionSummaryRead': {
      parseCollectionSummary: (value, expectedUser) => {
        assert.equal(value.subjectUserId, expectedUser);
        return value;
      },
      readCompactCollectionSummary: async () => {
        const value = { subjectUserId: userId, totalCardsOwned: quantity };
        const blocker = nextRead;
        nextRead = null;
        if (blocker) await blocker.promise;
        return value;
      },
    },
    './collectionSummaryValue': { COLLECTION_SUMMARY_USD_TO_GBP: 0.8 },
    './personalDataRead': { withPersonalDataReadTimeout: (callback, { signal }) => callback(signal) },
    './collectionSummaryInvalidation': {
      getCollectionSummaryVersion: () => version,
      bumpCollectionSummaryVersion: () => { version++; },
    },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } } },
  };
  vm.runInNewContext(compiled, {
    exports: moduleExports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    }, console, AbortController, setTimeout, clearTimeout,
  });
  return {
    api: moduleExports, stored, writes,
    setQuantity: (value) => { quantity = value; },
    setUser: (value) => { userId = value; },
    failNextWrite: () => { failWrite = true; },
    blockNextWrite: () => { nextWrite = deferred(); return nextWrite; },
    blockNextRead: () => { nextRead = deferred(); return nextRead; },
  };
}

{
  const h = harness();
  const blocked = h.blockNextWrite();
  const oldResult = h.api.getCollectionSummary().then(() => 'accepted', () => 'rejected');
  await tick();
  assert.equal(h.writes.length, 1);
  h.api.invalidateCollectionSummary();
  h.setQuantity(8);
  let fresh;
  const freshResult = h.api.getCollectionSummary().then((value) => { fresh = value; });
  await tick();
  assert.equal(fresh?.totalCardsOwned, 8, 'a stalled disk queue must not block a valid live refresh');
  blocked.resolve();
  await oldResult;
  await freshResult;
  await tick();
  const disk = JSON.parse(h.stored.get('stackr:collection-summary:v3:owner-a'));
  assert.equal(disk.value.totalCardsOwned, 8, 'a slow pre-save storage write must not overwrite the newer snapshot');
  assert.equal(disk.version, 1, 'persist the snapshot version captured by its read');
}
{
  const h = harness();
  const blocked = h.blockNextWrite();
  const oldResult = h.api.getCollectionSummary().then(() => 'accepted', () => 'rejected');
  await tick();
  h.api.invalidateCollectionSummary();
  blocked.resolve();
  await oldResult;
  await tick();
  assert.equal(h.stored.has('stackr:collection-summary:v3:owner-a'), false,
    'invalidation during storage must not resurrect stale totals on next launch');
}
{
  const h = harness();
  const blocked = h.blockNextWrite();
  const oldResult = h.api.getCollectionSummary().then(() => 'accepted', () => 'rejected');
  await tick();
  h.setUser('owner-b');
  h.setQuantity(9);
  const fresh = await h.api.getCollectionSummary();
  assert.equal(fresh.subjectUserId, 'owner-b', 'another account does not wait for the old account storage queue');
  assert.equal(fresh.totalCardsOwned, 9);
  blocked.resolve();
  await oldResult;
  await tick();
  assert.equal(JSON.parse(h.stored.get('stackr:collection-summary:v3:owner-b')).value.totalCardsOwned, 9);
}
{
  const h = harness();
  h.failNextWrite();
  assert.equal((await h.api.getCollectionSummary()).totalCardsOwned, 1, 'cache storage failure does not discard valid live totals');
  await tick();
  h.api.invalidateCollectionSummary();
  h.setQuantity(3);
  assert.equal((await h.api.getCollectionSummary()).totalCardsOwned, 3);
  await tick();
  assert.equal(JSON.parse(h.stored.get('stackr:collection-summary:v3:owner-a')).value.totalCardsOwned, 3,
    'failed persistence releases its queue for a later write');
}
for (const change of ['mutation', 'account']) {
  const h = harness();
  const blocked = h.blockNextRead();
  const oldResult = h.api.getCollectionSummary().then(() => 'accepted', () => 'rejected');
  await tick();
  const joinedResult = h.api.getCollectionSummary().then(() => 'accepted', () => 'rejected');
  await tick();
  if (change === 'mutation') h.api.invalidateCollectionSummary();
  else h.setUser('owner-b');
  blocked.resolve();
  assert.equal(await oldResult, 'rejected', `${change} during read rejects the obsolete snapshot`);
  assert.equal(await joinedResult, 'rejected', `${change} during read rejects every joined caller`);
  assert.equal(h.writes.length, 0, 'an obsolete read is never persisted');
}
console.log('Collection summary persistence: mutation races, stalled storage, invalidation cleanup, account isolation, storage recovery and joined-read guards passed (6 scenarios).');
