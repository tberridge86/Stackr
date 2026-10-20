import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { BinderLibraryOverviewSnapshot } from '../lib/binderLibraryCache';
import type { BinderRecord } from '../lib/binders';

type Snapshot = BinderLibraryOverviewSnapshot;

function loadCache(storage: Map<string, string>) {
  const source = ts.transpileModule(readFileSync('lib/binderLibraryCache.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext(source, {
    module,
    exports: module.exports,
    console,
    Date,
    Map,
    Set,
    Object,
    JSON,
    Number,
    Promise,
    require: (name: string) => {
      if (name === './mobileRuntimeConfig') return { MOBILE_RUNTIME_CONFIG: { supabaseUrl: 'https://stackr.example' } };
      assert.equal(name, '@react-native-async-storage/async-storage', `unexpected runtime import: ${name}`);
      return {
        getItem: async (key: string) => storage.get(key) ?? null,
        setItem: async (key: string, value: string) => { storage.set(key, value); },
        removeItem: async (key: string) => { storage.delete(key); },
      };
    },
  });
  return module.exports as typeof import('../lib/binderLibraryCache');
}

function snapshot(owner: string, binderId = `${owner}-binder`, customNameArtKeys: Record<string, string> = {}): Snapshot {
  const binder: BinderRecord = {
    id: binderId,
    user_id: owner,
    name: binderId,
    color: '#fff',
    type: 'custom',
    is_public: false,
    source_set_id: null,
    created_at: '2026-10-12T00:00:00.000Z',
  };
  return { binders: [binder], customNameArtKeys };
}

async function main() {
  const storage = new Map<string, string>();
  const cache = loadCache(storage);
  const ownerA = 'owner-a';
  const ownerB = 'owner-b';

  // Regression: an unset invalidation counter must not suppress the first seed.
  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA), { savedAt: 100 });
  assert.deepEqual(await cache.readPersistedBinderOverview(ownerA), snapshot(ownerA), 'first owner-bound preload is readable');
  assert.equal(await cache.readPersistedBinderOverview(ownerB), null, 'another account cannot read the owner A key');

  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'newer'), { savedAt: 200 });
  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'older'), { savedAt: 150 });
  assert.equal((await cache.readPersistedBinderOverview(ownerA))?.binders[0]?.id, 'newer', 'an older completion cannot overwrite newer saved binders');

  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'art', { art: 'chosen-cover' }), { savedAt: 300 });
  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'art'), { savedAt: 400 });
  assert.deepEqual((await cache.readPersistedBinderOverview(ownerA))?.customNameArtKeys, { art: 'chosen-cover' }, 'preload retains current custom cover choices');

  const beforeGuardedWrite = storage.get(cache.getBinderLibraryCacheKey(ownerA));
  await cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'blocked'), { isCurrent: () => false, savedAt: 500 });
  assert.equal(storage.get(cache.getBinderLibraryCacheKey(ownerA)), beforeGuardedWrite, 'a stale caller cannot write after its request is no longer current');

  const staleWrite = cache.writePersistedBinderOverview(ownerA, snapshot(ownerA, 'stale'), { savedAt: 600 });
  const removal = cache.removePersistedBinderOverview(ownerA);
  await Promise.all([staleWrite, removal]);
  assert.equal(await cache.readPersistedBinderOverview(ownerA), null, 'queued deletion invalidates an in-flight preload before it can restore removed data');

  const legacyKey = cache.getBinderLibraryCacheKey(ownerA);
  storage.set(legacyKey, JSON.stringify({ version: 1, binders: snapshot(ownerA).binders, customNameArtKeys: {} }));
  assert.equal(await cache.readPersistedBinderOverview(ownerA), null, 'unowned v1 cache entries are rejected rather than migrated into read-only access');

  const malformed = JSON.parse(cache.serializeBinderLibraryOverview(ownerA, snapshot(ownerA), 700));
  malformed.snapshot.binders[0].name = null;
  storage.set(legacyKey, JSON.stringify(malformed));
  assert.equal(await cache.readPersistedBinderOverview(ownerA), null, 'a malformed cached display row is rejected before the saved screen can render it');

  const future = JSON.parse(cache.serializeBinderLibraryOverview(ownerA, snapshot(ownerA), Date.now() + 10 * 60 * 1000));
  storage.set(legacyKey, JSON.stringify(future));
  assert.equal(await cache.readPersistedBinderOverview(ownerA), null, 'a far-future cache timestamp is rejected rather than defeating write ordering');

  console.log('Binder library cache passed: initial seed, account scope, monotonic writes, custom artwork, stale guards, deletion, v1 rejection, and corrupt-row rejection.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
