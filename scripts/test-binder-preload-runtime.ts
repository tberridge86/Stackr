import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { BINDER_REOPEN_STORED_BYTES, BINDER_REOPEN_STORED_ENTRIES, createBinderReopenCache, isCompleteBinderSnapshot } from '../lib/binderReopenSnapshot';
import type { BinderCardRecord, BinderRecord } from '../lib/binders';

type Binder = { id: string; user_id: string; type: 'official' | 'custom'; created_at: string };
const owner = 'owner-a';
const now = Math.floor(Date.now() / 1000) + 3600;
const binder = (id: string, created = 1): Binder => ({ id, user_id: owner, type: 'official', created_at: new Date(Date.UTC(2026, 9, created)).toISOString() });
const customId = '11111111-1111-4111-8111-111111111111';
const customBinder = (): BinderRecord => ({ id: customId, user_id: owner, name: 'Custom', color: '#fff', type: 'custom', is_public: false, source_set_id: null, created_at: '2026-10-12T00:00:00.000Z' });
const customCard = (id = 'saved-card'): BinderCardRecord => ({ id, binder_id: customId, card_id: id, set_id: 'custom', language: 'en', api_card_id: null, card_name: 'Saved', api_set_id: null, card_number: null, image_url: null, set_name: null, set_total: null, slot_order: 0, owned: true, owned_quantity: 1, condition: 'Near Mint', notes: 'kept', ebay_price: 9, tcg_price: 8, cardmarket_price: 7, last_price_update: '2026-10-12T00:00:00.000Z', created_at: '2026-10-12T00:00:00.000Z' });

async function main() {
  let lease = 0;
  let current = true;
  let returnForeign = false;
  let saveAllowed = true;
  let sessionExpiry = now;
  let runtimeClock = Date.now();
  const reads: string[] = [];
  const saves: unknown[][] = [];
  const fetched: string[] = [];
  const cards: string[] = [];
  const cache = {
    lease: () => lease,
    read: async (_scope: unknown, id: string) => { reads.push(id); return null; },
    save: (...args: unknown[]) => { saves.push(args); return saveAllowed; },
    invalidate() {},
  };
  const source = ts.transpileModule(readFileSync('lib/binderReopenRuntime.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext(source, {
    module, exports: module.exports, console, Date: { now: () => runtimeClock, parse: Date.parse }, Promise, JSON, String, Number, Map, Set,
    require: (name: string) => {
      if (name === './supabase') return { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: owner }, expires_at: sessionExpiry } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } };
      if (name === './mobileRuntimeConfig') return { MOBILE_RUNTIME_CONFIG: { supabaseUrl: 'https://stackr.example' } };
      if (name === './stackrApiV1') return { stackrApiClient: { catalogueCacheNamespace: 'catalogue' } };
      if (name === './requestCache') return { subscribeRequestCacheInvalidation: () => () => {} };
      if (name === './binderReopenSnapshot') return { BINDER_REOPEN_STORED_BYTES, BINDER_REOPEN_STORED_ENTRIES, createBinderReopenCache: () => cache };
      if (name === './binders') return {
        fetchBinderById: async (id: string) => { fetched.push(id); return { ...binder(id), type: id.startsWith('custom') ? 'custom' : 'official', user_id: returnForeign ? 'owner-b' : owner }; },
        fetchBinderCards: async (id: string, options: unknown) => { cards.push(`${id}:${JSON.stringify(options)}`); return [{ id: `${id}-card`, binder_id: id }]; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const preload = module.exports.preloadBinderReopenViews as (rows: Binder[], account: string, guard: () => boolean, options?: { completeSavedCardsByBinder?: Map<string, unknown[]> }) => Promise<void>;

  await preload([...Array.from({ length: 9 }, (_, index) => binder(`b${index + 1}`, index + 1)), { ...binder('custom', 20), type: 'custom' }], owner, () => current);
  assert.equal(fetched.length, 10, 'all ten started binders are prepared, including a custom binder without Home data');
  assert.deepEqual(fetched, ['custom', 'b9', 'b8', 'b7', 'b6', 'b5', 'b4', 'b3', 'b2', 'b1'], 'newest binders are warmed sequentially beyond the old eight-binder cap');
  assert.equal(saves.length, 10, 'each fetched owner-bound candidate reaches the completeness gate');
  assert.ok(cards.every((value) => value.endsWith('{"includePrices":false,"includeAssets":false}')), 'warm reads exclude prices and optional assets');
  saves.length = 0; fetched.length = 0; cards.length = 0;
  const many = Array.from({ length: 70 }, (_, index) => binder(`many-${index + 1}`, index + 1));
  await preload([...many, many[69], { ...binder('foreign-input'), user_id: 'owner-b' }], owner, () => current);
  assert.equal(fetched.length, BINDER_REOPEN_STORED_ENTRIES, 'larger collections remain within the disk-cache preload budget');
  assert.equal(new Set(fetched).size, fetched.length, 'duplicate library rows do not cause duplicate preparation');
  assert.equal(fetched[0], 'many-70', 'newest started binders have priority');

  // A foreign response cannot be saved, even when its requested id looked valid.
  saves.length = 0; fetched.length = 0; cards.length = 0;
  returnForeign = true;
  await preload([binder('foreign')], owner, () => current);
  assert.deepEqual(fetched, ['foreign']);
  assert.equal(cards.length, 0, 'a wrong-owner binder stops before its contents are read');
  assert.equal(saves.length, 0, 'a wrong-owner binder is never persisted');

  returnForeign = false;
  saveAllowed = false;
  await preload([binder('partial')], owner, () => current);
  assert.equal(saves.length, 1, 'a partial official result reaches the existing authoritative completeness gate once');
  saveAllowed = true;

  saves.length = 0; fetched.length = 0; cards.length = 0;
  const customWorker = { ...binder('custom-worker'), type: 'custom' as const };
  const completeWorkerMap = new Map<string, unknown[]>([[customWorker.id, [{ id: 'custom-row', binder_id: customWorker.id }]]]);
  await preload([customWorker], owner, () => current, { completeSavedCardsByBinder: completeWorkerMap });
  assert.equal(fetched.length, 0, 'a custom preload uses only Home’s complete saved-card map');
  assert.equal(cards.length, 0, 'a custom preload makes no binder-card network request');
  assert.equal((saves[0]?.[5] as any)?.customSource?.kind, 'home-saved-cards-v1', 'the worker forwards complete custom provenance to the cache gate');
  assert.equal((saves[0]?.[5] as any)?.customSource?.cardCount, 1);
  saves.length = 0;
  await preload([{ ...customWorker, id: 'empty-custom' }], owner, () => current, { completeSavedCardsByBinder: new Map([['empty-custom', []]]) });
  assert.equal((saves[0]?.[5] as any)?.customSource?.cardCount, 0, 'a Home-complete empty custom binder is warmed honestly');
  saves.length = 0;
  await preload([customWorker], owner, () => current);
  assert.equal(saves.length, 1, 'opening the library directly can prepare a custom binder through normal private reads');
  assert.equal((saves[0]?.[5] as any)?.customSource?.kind, 'binder-saved-cards-v1');
  assert.equal((saves[0]?.[5] as any)?.customSource?.cardCount, 1);
  saves.length = 0;
  const foreignWorkerMap = new Map<string, unknown[]>([[customWorker.id, [{ id: 'foreign', binder_id: 'other' }]]]);
  await preload([customWorker], owner, () => current, { completeSavedCardsByBinder: foreignWorkerMap });
  assert.equal(saves.length, 0, 'foreign custom-map rows are rejected before save');

  fetched.length = 0;
  current = false;
  await preload([binder('cancel')], owner, () => current);
  assert.equal(fetched.length, 0, 'a cancelled preload does not begin a late fetch');

  current = true;
  saves.length = 0; fetched.length = 0; cards.length = 0;
  const beforeLease = lease;
  cache.read = async (_scope: unknown, id: string) => { reads.push(id); lease = beforeLease + 1; return null; };
  await preload([binder('lease-change')], owner, () => current);
  assert.equal(fetched.length, 0, 'a lease change after cache read prevents later network or save work');

  lease = 0; cache.read = async (_scope: unknown, id: string) => { reads.push(id); runtimeClock = (sessionExpiry + 1) * 1000; return null; };
  await preload([binder('expired-after-read')], owner, () => current);
  assert.equal(fetched.length, 0, 'expiry between awaited cache read and fetch prevents a late save');
  runtimeClock = Date.now(); sessionExpiry = now;

  const storeRows: unknown[] = [];
  const actualCache = createBinderReopenCache({ store: async () => ({ read: async () => null, write: async (snapshot) => { storeRows.push(snapshot); }, clear: async () => {} }) });
  const scope = { namespace: 'fixture', accountId: owner };
  const completeCustom = [customCard()];
  assert.equal(actualCache.save(scope, customBinder(), completeCustom, actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 1 } }), true, 'a complete custom source can enter the existing bounded cache');
  await actualCache.flush();
  const savedCustom = await actualCache.read(scope, customId);
  assert.equal(savedCustom?.cards[0]?.notes, 'kept', 'custom saved-card fields survive the cache whitelist');
  assert.equal(savedCustom?.cards[0]?.ebay_price, null, 'custom cached rows still exclude prices');
  assert.deepEqual(savedCustom?.customSource, { kind: 'home-saved-cards-v1', cardCount: 1 }, 'custom provenance is re-whitelisted without arbitrary metadata');
  const restartStore = { read: async () => storeRows[0], write: async () => {}, clear: async () => {} };
  const restarted = createBinderReopenCache({ store: async () => restartStore });
  const restoredCustom = await restarted.read(scope, customId);
  assert.ok(isCompleteBinderSnapshot(restoredCustom, scope, customId, Date.now()), 'a custom binder remains complete after a real cold disk restore');
  assert.deepEqual(restoredCustom.customSource, { kind: 'home-saved-cards-v1', cardCount: 1 });
  assert.equal((await restarted.read(scope, customId))?.cards[0]?.notes, 'kept', 'repeated reads keep the restored custom snapshot usable');
  assert.equal(actualCache.save(scope, customBinder(), completeCustom, actualCache.lease(), Date.now(), { customSource: { kind: 'binder-saved-cards-v1', cardCount: 1 } }), true);
  await actualCache.flush();
  const detailRestart = createBinderReopenCache({ store: async () => ({ ...restartStore, read: async () => storeRows.at(-1) }) });
  assert.equal((await detailRestart.read(scope, customId))?.customSource?.kind, 'binder-saved-cards-v1', 'direct-open custom binders also survive app restart');
  const unownedCustom = { ...customBinder(), id: '33333333-3333-4333-8333-333333333333' };
  assert.equal(actualCache.save(scope, unownedCustom, [{ ...customCard('unowned'), binder_id: unownedCustom.id, owned: false, owned_quantity: 0 }], actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 1, ignored: 'nope' } as any }), true, 'unowned custom cards preserve a truthful zero quantity');
  const savedUnowned = await actualCache.read(scope, unownedCustom.id);
  assert.deepEqual(savedUnowned?.customSource, { kind: 'home-saved-cards-v1', cardCount: 1 }, 'custom provenance drops unrecognised source fields');
  assert.equal(actualCache.save(scope, unownedCustom, [{ ...customCard('negative'), binder_id: unownedCustom.id, owned: false, owned_quantity: -1 }], actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 1 } }), false, 'negative custom quantities are rejected');
  assert.equal(actualCache.save(scope, unownedCustom, [{ ...customCard('owned-zero'), binder_id: unownedCustom.id, owned: true, owned_quantity: 0 }], actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 1 } }), false, 'owned custom cards require a positive quantity');
  const emptyCustom = { ...customBinder(), id: '22222222-2222-4222-8222-222222222222' };
  assert.equal(actualCache.save(scope, emptyCustom, [], actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 0 } }), true, 'a verified complete custom binder may truthfully contain zero saved cards');
  assert.equal(actualCache.save(scope, customBinder(), [], actualCache.lease()), false, 'custom rows without explicit complete-source provenance are rejected');
  assert.equal(actualCache.save(scope, customBinder(), completeCustom, actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 2 } }), false, 'a partial-source count marker is rejected');
  assert.equal(actualCache.save(scope, customBinder(), [{ ...customCard(), binder_id: 'foreign' }], actualCache.lease(), Date.now(), { customSource: { kind: 'home-saved-cards-v1', cardCount: 1 } }), false, 'foreign custom rows are rejected');
  assert.equal(actualCache.save(scope, { ...customBinder(), type: 'official', source_set_id: 'not-a-canonical-uuid' }, [], actualCache.lease()), false, 'official snapshots retain their original canonical completeness requirement');

  console.log('Binder preload runtime passed: expanded bounded storage, private direct-library preparation, custom cold restores, cancellation, and account guards.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
