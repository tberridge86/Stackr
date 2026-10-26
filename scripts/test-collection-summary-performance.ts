import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';
import { storedRawSummaryPrice, COLLECTION_SUMMARY_USD_TO_GBP } from '../lib/collectionSummaryValue';
import { withPersonalDataReadTimeout } from '../lib/personalDataRead';

type Binder = { id: string; user_id: string; type: 'official'; source_set_id: string; card_mode?: 'raw' | 'graded'; edition?: string | null; master_set_enabled?: boolean };
type Owned = { id: string; user_id: string; card_id: string; set_id: string; variant: string; quantity: number; grade_company?: string; grade?: string };
type Saved = { id: string; binder_id: string; card_id: string; set_id: string; owned: boolean; owned_quantity: number; tcg_price: number | null; grade_company?: string; grade?: string; slot_order: number };

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function main() {
  let accountId: string | null = 'owner-a';
  let version = 0;
  let failNextBinderCardRead = false;
  let serverCap = 50;
  let failLaterBinderPage = false;
  let repeatLaterBinderPage = false;
  const readRequests: { table: string; column: string; ids: string[]; range: [number, number] }[] = [];
  let deferredBinderCards: { promise: Promise<void>; release: () => void } | null = null;
  const persisted = new Map<string, string>();
  const binderReadOptions: { enrich?: boolean }[] = [];
  const binderCardRanges: [number, number][] = [];

  const bindersByAccount: Record<string, Binder[]> = {
    'owner-a': [
      { id: 'binder-a', user_id: 'owner-a', type: 'official', source_set_id: 'base3', card_mode: 'raw', edition: null },
      { id: 'binder-b', user_id: 'owner-a', type: 'official', source_set_id: 'base3', card_mode: 'graded', edition: '1st_edition' },
    ],
    'owner-b': [],
  };
  const ownedByAccount: Record<string, Owned[]> = {
    'owner-a': [
      { id: 'raw-38', user_id: 'owner-a', card_id: '38', set_id: 'base3', variant: 'normal', quantity: 2 },
      { id: 'slab-38', user_id: 'owner-a', card_id: '38', set_id: 'base3', variant: 'normal', quantity: 1, grade_company: 'PSA', grade: '9' },
    ],
    'owner-b': [],
  };
  const pageRows: Saved[] = Array.from({ length: 1001 }, (_, index) => ({
    id: `page-${index}`, binder_id: 'binder-a', card_id: 'page-card', set_id: 'base3', owned: true, owned_quantity: 1, tcg_price: null, slot_order: index + 2,
  }));
  const savedRows: Saved[] = [
    { id: 'shadow-38', binder_id: 'binder-a', card_id: '38', set_id: 'base3', owned: true, owned_quantity: 8, tcg_price: null, slot_order: 0 },
    { id: 'first-39', binder_id: 'binder-b', card_id: '39', set_id: 'base3', owned: true, owned_quantity: 3, tcg_price: 1, slot_order: 1 },
    ...pageRows,
  ];
  const cards: Record<string, any> = {
    '38': { id: '38', set_id: 'base3', name: 'Kingler', raw_data: { tcgplayer: { prices: { normal: { market: 10 } } } } },
    '39': { id: '39', set_id: 'base3', name: 'Raichu', raw_data: { tcgplayer: { prices: { '1stEditionNormal': { market: 20 }, normal: { market: 1 } } } } },
    'page-card': { id: 'page-card', set_id: 'base3', name: 'Page card', raw_data: { tcgplayer: { prices: { normal: { market: 2 } } } } },
  };

  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (table: string) => {
      let inColumn = '';
      let inValues: string[] = [];
      let ownedOnly = false;
      let range: [number, number] | null = null;
      const query: any = {
        select: () => query,
        in: (column: string, values: string[]) => { assert.ok(values.length <= 50, 'metadata filter chunks stay bounded'); inColumn = column; inValues = values; return query; },
        eq: (column: string, value: unknown) => { if (column === 'owned') ownedOnly = value === true; return query; },
        order: () => query,
        abortSignal: () => query,
        range: (from: number, to: number) => { assert.equal(to - from + 1, 50, 'every summary response requests at most 50 rows'); range = [from, to]; return query; },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(async () => {
          assert.ok(range, 'every summary table read is explicitly paged');
          readRequests.push({ table, column: inColumn, ids: [...inValues], range: range! });
          const page = (rows: any[]) => rows.slice(range![0], range![0] + Math.min(50, serverCap));
          if (table === 'binder_cards') {
            assert.equal(inColumn, 'binder_id');
            assert.equal(ownedOnly, true);
            assert.ok(range);
            binderCardRanges.push(range!);
            if (deferredBinderCards) await deferredBinderCards.promise;
            if (failNextBinderCardRead) {
              failNextBinderCardRead = false;
              return { data: null, error: new Error('simulated binder read failure') };
            }
            if (failLaterBinderPage && range![0] > 0) return { data: null, error: new Error('simulated later page failure') };
            const rows = savedRows.filter((row) => inValues.includes(row.binder_id) && row.owned)
              .sort((left, right) => left.slot_order - right.slot_order || left.id.localeCompare(right.id));
            if (repeatLaterBinderPage && range![0] > 0) return { data: [rows[0]], error: null };
            return { data: page(rows), error: null };
          }
          if (table === 'pokemon_cards') {
            const rows = Object.values(cards).filter((row) => inValues.includes(inColumn === 'id' ? row.id : row.set_id))
              .sort((left, right) => left.id.localeCompare(right.id));
            return { data: page(rows), error: null };
          }
          if (table === 'pokemon_sets') return { data: page(inValues.map((id) => ({ id, printed_total: id === 'base3' ? 3 : 61, total: id === 'base3' ? 3 : 61 }))), error: null };
          throw new Error(`Unexpected table ${table}`);
        }).then(resolve, reject),
      };
      return query;
    },
  };

  const dependencies: Record<string, unknown> = {
    '@react-native-async-storage/async-storage': {
      default: {
        getItem: async (key: string) => persisted.get(key) ?? null,
        setItem: async (key: string, value: string) => { persisted.set(key, value); },
      },
    },
    './binders': {
      fetchBinders: async (options: { enrich?: boolean } = {}) => {
        binderReadOptions.push(options);
        assert.equal(options.enrich, false, 'summary must use the saved-binder lane');
        return accountId ? bindersByAccount[accountId] ?? [] : [];
      },
    },
    './ownership': { fetchOwnedCardRows: async () => accountId ? ownedByAccount[accountId] ?? [] : [] },
    './collectionSummaryValue': { storedRawSummaryPrice, COLLECTION_SUMMARY_USD_TO_GBP },
    './personalDataRead': { withPersonalDataReadTimeout },
    './supabase': { supabase },
    './collectionSummaryInvalidation': {
      bumpCollectionSummaryVersion: () => { version += 1; },
      getCollectionSummaryVersion: () => version,
    },
  };
  const readExports: any = {};
  const readSource = fs.readFileSync(fileURLToPath(new URL('../lib/collectionSummaryRead.ts', import.meta.url)), 'utf8');
  vm.runInNewContext(ts.transpileModule(readSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: readExports, require: (name: string) => dependencies[name] ?? {}, console, setTimeout, clearTimeout, AbortController });
  dependencies['./collectionSummaryRead'] = { parseCollectionSummary: readExports.parseCollectionSummary,
    readCompactCollectionSummary: async () => null }; // Exercise compatibility with a database lacking the new RPC.
  const source = fs.readFileSync(fileURLToPath(new URL('../lib/collectionSummary.ts', import.meta.url)), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadSummaryModule = () => {
    const moduleExports: any = {};
    vm.runInNewContext(compiled, { exports: moduleExports, require: (name: string) => dependencies[name] ?? {}, console, setTimeout, clearTimeout, AbortController });
    return moduleExports;
  };
  const exports: any = loadSummaryModule();

  const first = await exports.getCollectionSummary();
  assert.equal(first.totalOwnedItems, 7, 'canonical raw + slab and saved-only raw/graded units are retained');
  assert.equal(first.rawCardsOwned, 3);
  assert.equal(first.gradedSlabsOwned, 4, 'binder-level graded mode is retained');
  assert.equal(first.uniqueCards, 3, 'cross-binder saved duplicates use the existing set/card/mode dedup');
  assert.equal(first.collectionValue, 17.38, 'raw stored prices remain; slabs and graded binder rows cannot borrow raw quotes');
  assert.equal(first.valuation.pricedUnits, 3);
  assert.equal(first.valuation.unpricedUnits, 4);
  assert.equal(first.valuation.unsupportedUnits, 4);
  assert.equal(first.valuation.state, 'partial');
  assert.equal(first.completedSets, 1, 'same-set canonical and cross-binder saved cards complete the tracked official set without virtual rows');
  assert.equal(binderCardRanges.length, 22, 'all 1,003 saved rows plus the terminal empty page are read');
  assert.deepEqual(binderCardRanges.at(-1), [1003, 1052], 'the offset advances by received rows, including the short tail');
  assert.ok(binderCardRanges.every(([from, to]) => to - from + 1 === 50));
  assert.equal(binderReadOptions.length, 1);

  serverCap = 17;
  const lowerCap = await exports.getCollectionSummary({ forceRefresh: true });
  assert.equal(lowerCap.totalOwnedItems, 7, 'lower server caps cannot truncate ownership or change totals');
  assert.equal(lowerCap.collectionValue, 17.38);
  serverCap = 50;
  failLaterBinderPage = true;
  await assert.rejects(exports.getCollectionSummary({ forceRefresh: true }), /simulated later page failure/);
  failLaterBinderPage = false;
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7, 'a later-page failure retains the prior complete summary');
  repeatLaterBinderPage = true;
  await assert.rejects(exports.getCollectionSummary({ forceRefresh: true }), /inconsistent page identities/);
  repeatLaterBinderPage = false;
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7, 'repeated pages cannot publish partial or duplicate ownership');

  // Master completion must include an unowned card beyond the first 50 rows.
  bindersByAccount['owner-a'].push({ id: 'master-binder', user_id: 'owner-a', type: 'official', source_set_id: 'master-set', master_set_enabled: true });
  for (let index = 0; index < 61; index++) {
    const id = 'master-' + String(index).padStart(3, '0');
    cards[id] = { id, set_id: 'master-set', name: id, raw_data: { tcgplayer: { prices: { normal: { market: 1 } } } } };
    if (index < 60) ownedByAccount['owner-a'].push({ id: 'owned-' + id, user_id: 'owner-a', card_id: id, set_id: 'master-set', variant: 'normal', quantity: 1 });
  }
  const metadataStart = readRequests.length;
  const incompleteMaster = await exports.getCollectionSummary({ forceRefresh: true });
  assert.equal(incompleteMaster.totalOwnedItems, 67);
  assert.equal(incompleteMaster.completedSets, 1, 'the last unowned master card prevents false completion');
  const masterPages = readRequests.slice(metadataStart).filter((request) => request.table === 'pokemon_cards' && request.column === 'set_id');
  assert.deepEqual(masterPages.map((request) => request.range[0]), [0, 50, 61]);
  assert.ok(readRequests.slice(metadataStart).every((request) => request.ids.length <= 50 && request.range[1] - request.range[0] + 1 === 50));
  ownedByAccount['owner-a'].push({ id: 'owned-master-060', user_id: 'owner-a', card_id: 'master-060', set_id: 'master-set', variant: 'normal', quantity: 1 });
  assert.equal((await exports.getCollectionSummary({ forceRefresh: true })).completedSets, 2, 'all verified master identities restore completion');
  bindersByAccount['owner-a'].pop();
  ownedByAccount['owner-a'].splice(2);
  for (const id of Object.keys(cards)) if (id.startsWith('master-')) delete cards[id];
  assert.equal((await exports.getCollectionSummary({ forceRefresh: true })).totalOwnedItems, 7);

  // A cold module may use its persisted value only with stale-while-refresh. It must
  // return that value promptly, then refresh in the background. A manual/default read
  // must wait for a fresh request instead of serving a six-hour persisted value.
  const coldStale = loadSummaryModule();
  deferredBinderCards = (() => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  })();
  let persistedStale: any = null;
  const staleFromDisk = coldStale.getCollectionSummary({ staleWhileRefresh: true }).then((value: any) => { persistedStale = value; });
  await tick();
  assert.equal(persistedStale?.totalOwnedItems, 7, 'persisted stale data returns without waiting for the refresh');
  deferredBinderCards.release();
  await staleFromDisk;
  await tick();
  deferredBinderCards = null;

  const coldManual = loadSummaryModule();
  deferredBinderCards = (() => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  })();
  let manualSettled = false;
  const manualFresh = coldManual.getCollectionSummary().then(() => { manualSettled = true; });
  await tick();
  assert.equal(manualSettled, false, 'a default/manual read waits for fresh data rather than persisted cache');
  deferredBinderCards.release();
  await manualFresh;
  deferredBinderCards = null;

  // A failed background refresh must retain a prior good value rather than cache zeroes.
  failNextBinderCardRead = true;
  const stale = await exports.getCollectionSummary({ forceRefresh: true, staleWhileRefresh: true });
  assert.equal(stale.totalOwnedItems, 7);
  await tick();
  await tick();
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7);

  // A different session cannot receive owner A's in-memory value.
  accountId = 'owner-b';
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 0);
  accountId = 'owner-a';
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7);

  // Results that finish after an account switch or invalidation are rejected, never cached.
  deferredBinderCards = (() => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  })();
  const switched = exports.getCollectionSummary({ forceRefresh: true });
  const switchedJoin = exports.getCollectionSummary({ forceRefresh: true });
  await tick();
  accountId = 'owner-b';
  deferredBinderCards.release();
  await assert.rejects(switched, /changed account or version/);
  await assert.rejects(switchedJoin, /changed account or version/);
  deferredBinderCards = null;
  accountId = 'owner-a';
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7, 'the switched result did not replace owner A cache');

  deferredBinderCards = (() => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  })();
  const invalidated = exports.getCollectionSummary({ forceRefresh: true });
  const invalidatedJoin = exports.getCollectionSummary({ forceRefresh: true });
  await tick();
  exports.invalidateCollectionSummary();
  deferredBinderCards.release();
  await assert.rejects(invalidated, /changed account or version/);
  await assert.rejects(invalidatedJoin, /changed account or version/);
  deferredBinderCards = null;
  assert.equal((await exports.getCollectionSummary()).totalOwnedItems, 7, 'a newer invalidation rebuilds instead of accepting stale data');

  console.log('Collection summary performance checks passed: saved-only paged reads, raw/graded counts, conservative price coverage, persisted stale-while-refresh, account isolation, and joined stale-result rejection.');
}

void main();
