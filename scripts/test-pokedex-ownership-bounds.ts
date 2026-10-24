import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as ownership from '../lib/pokedexCollectionCore';
import { withPersonalDataReadTimeout } from '../lib/personalDataRead';
import type { PokedexOwnershipReadOptions } from '../lib/pokedexCollection';

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const account = 'fixture-owner';
const baseline = process.env.PDX_OWNERSHIP_BASELINE === '1';
const source = baseline ? execFileSync('git', ['show', 'HEAD:lib/pokedexCollection.ts'], { encoding: 'utf8' })
  : readFileSync('lib/pokedexCollection.ts', 'utf8');
type Row = { id: string; [key: string]: any };
type Page = { data: Row[] | null; error: unknown };
type ReadRequest = {
  table: string; columns: string; after: string | null; limit: number;
  binderIds: string[] | null; equalities: [string, unknown][]; signal: AbortSignal;
};
type FixtureOptions = {
  rows?: Record<string, Row[]>;
  cap?: number | ((table: string) => number);
  timeoutMs?: number;
  user?: string | null;
  auth?: () => Promise<any>;
  override?: (request: ReadRequest) => Page | Promise<Page> | undefined;
  cardRows?: (ids: string[]) => Promise<Map<string, any>>;
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options: FixtureOptions = {}) {
  const requests: ReadRequest[] = [];
  const nameBatches: string[][] = [];
  let authReads = 0;
  const query = (table: string) => {
    let after: string | null = null;
    let limit = 0;
    let columns = '';
    let binderIds: string[] | null = null;
    let signal: AbortSignal | undefined;
    const equalities: [string, unknown][] = [];
    const chain: any = {
      select: (value: string) => { columns = value; return chain; },
      eq: (column: string, value: unknown) => { equalities.push([column, value]); return chain; },
      in: (column: string, values: string[]) => {
        assert.equal(column, 'binder_id'); assert.ok(values.length > 0 && values.length <= 100);
        binderIds = [...values]; return chain;
      },
      order: (column: string, order: { ascending: boolean }) => {
        assert.equal(column, 'id'); assert.equal(order.ascending, true); return chain;
      },
      limit: (value: number) => { assert.equal(value, 50); limit = value; return chain; },
      gt: (column: string, value: string) => { assert.equal(column, 'id'); after = value; return chain; },
      abortSignal: (value: AbortSignal) => { signal = value; return chain; },
      upsert: () => { throw new Error('The ownership reader must never write.'); },
      delete: () => { throw new Error('The ownership reader must never write.'); },
      update: () => { throw new Error('The ownership reader must never write.'); },
      then: (resolve: (value: Page) => unknown, reject: (error: unknown) => unknown) => {
        // The preserved baseline lacks signals; allow it only in the explicit
        // RED control so the first failure proves actual short-page truncation.
        if (!baseline) assert.ok(signal, 'Every table page must use the logical read signal.');
        const readSignal = signal ?? new AbortController().signal;
        assert.equal(readSignal.aborted, false, 'Do not dispatch after cancellation.');
        const request = { table, columns, after, limit, binderIds, equalities, signal: readSignal };
        requests.push(request);
        const cap = typeof options.cap === 'function' ? options.cap(table) : options.cap ?? 500;
        const page = options.override?.(request) ?? {
          data: (options.rows?.[table] ?? []).filter((row) => (!after || row.id.toLowerCase() > after)
            && (!binderIds || binderIds.includes(row.binder_id))
            && equalities.every(([column, value]) => row[column] === value)).slice(0, Math.min(limit, cap)),
          error: null,
        };
        return Promise.resolve(page).then(resolve, reject);
      },
    };
    return chain;
  };
  const exports: any = {};
  const dependencies: Record<string, unknown> = {
    './supabase': { supabase: {
      auth: { getUser: () => {
        authReads++;
        return options.auth?.() ?? Promise.resolve({ data: { user: options.user === null ? null : { id: options.user ?? account } }, error: null });
      } }, from: query,
    } },
    './pokedexCollectionCore': ownership,
    './personalDataRead': { withPersonalDataReadTimeout: (read: any, controls: any) => withPersonalDataReadTimeout(read,
      options.timeoutMs === undefined ? controls : { ...controls, timeoutMs: options.timeoutMs }) },
    './cardSearch': {}, './stackrApiV1': {},
    './pokemonDisplayNames': {
      getPreferredCardDisplayName: (value: any) => value.fallbackName,
      getEnglishCardDisplayName: (value: any) => value.englishDisplayName,
    },
    './stackrDomainAdapter': { fetchStackrCardRows: async (ids: string[], controls: { includeAssets?: boolean; requireComplete?: boolean; signal?: AbortSignal }) => {
      assert.equal(controls.includeAssets, false, 'Name lookup must not request artwork.');
      assert.equal(controls.requireComplete, true, 'Incomplete facts cannot become successful ownership.');
      assert.ok(controls.signal && !controls.signal.aborted, 'Name lookup uses the live logical read signal.');
      nameBatches.push([...ids]);
      return options.cardRows?.(ids) ?? new Map(ids.map((id) => [id, { id, name: 'Pikachu', supertype: 'Pokémon' }]));
    } },
  };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, AbortController, Set, Map, Date,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected collection dependency: ${name}`); return dependencies[name]; } });
  return {
    requests, nameBatches, authReads: () => authReads,
    read: (controls?: PokedexOwnershipReadOptions) => exports.fetchOwnedPokedexCards(account, controls) as Promise<Map<string, ownership.OwnedPokedexCard>>,
    names: (controls?: PokedexOwnershipReadOptions) => exports.fetchOwnedPokemonNameSet(account, controls) as Promise<Set<string>>,
    signedOut: () => exports.fetchOwnedPokedexCards() as Promise<Map<string, ownership.OwnedPokedexCard>>,
  };
}

const binderRow = (index: number) => ({ id: uuid(10_000 + index), user_id: account });
const variantRow = (index: number) => ({ id: uuid(20_000 + index), user_id: account, card_id: `legacy:card-${index}`, set_id: 'ja:M6' });
const savedRow = (index: number) => ({ id: uuid(30_000 + index), binder_id: binderRow(index).id, owned: true, card_id: `saved:card-${index}`, set_id: 'ja:M6' });
const markerRow = (index: number) => ({ id: uuid(40_000 + index), user_id: account, card_id: `manual:card-${index}`, set_id: null });
const groups: string[] = [];
async function test(name: string, read: () => Promise<void>) { await read(); groups.push(name); }

async function run() {
  await test('lower server caps complete all four sources and every bounded binder chunk only after empty pages', async () => {
    const f = fixture({ cap: 7, rows: {
      binders: Array.from({ length: 201 }, (_, index) => binderRow(index)),
      user_card_variants: Array.from({ length: 201 }, (_, index) => variantRow(index)),
      binder_cards: Array.from({ length: 201 }, (_, index) => savedRow(index)),
      user_pokedex_cards: Array.from({ length: 201 }, (_, index) => markerRow(index)),
    } });
    const owned = await f.read();
    assert.equal(owned.size, 603, 'A lower server cap must not truncate any ownership source.');
    assert.equal(owned.get('ja:M6:legacy:card-200')?.card_variant_ids[0], variantRow(200).id);
    assert.equal(owned.get('ja:M6:saved:card-200')?.binder_card_ids[0], savedRow(200).id);
    assert.equal(owned.get(':manual:card-200')?.pokedex_card_ids[0], markerRow(200).id);
    for (const table of ['binders', 'user_card_variants', 'user_pokedex_cards']) {
      const pages = f.requests.filter((row) => row.table === table);
      assert.equal(pages.length, 30, `${table}: 29 nonempty pages plus a definitive empty read`);
      assert.equal(pages.at(-1)?.after, table === 'binders' ? binderRow(200).id : table === 'user_card_variants' ? variantRow(200).id : markerRow(200).id);
      assert.ok(pages.every((row) => row.columns.includes('user_id')));
    }
    const chunks = new Set(f.requests.filter((row) => row.table === 'binder_cards').map((row) => JSON.stringify(row.binderIds)));
    assert.equal(chunks.size, 3);
    assert.ok(f.requests.every((row) => row.signal.aborted), 'Success releases every query signal.');
  });

  await test('exact physical, binder and manual contributions merge without treating inventory as quantity or species', async () => {
    const physical = { ...variantRow(0), card_id: 'ピカチュウ-native', set_id: 'zh-tw:non-uuid-set' };
    const saved = { ...savedRow(0), card_id: physical.card_id, set_id: physical.set_id };
    const manual = { ...markerRow(0), card_id: physical.card_id, set_id: physical.set_id };
    const f = fixture({ cap: 1, rows: { binders: [binderRow(0)], user_card_variants: [physical], binder_cards: [saved], user_pokedex_cards: [manual] } });
    const owned = await f.read(); const entry = owned.get(`${physical.set_id}:${physical.card_id}`)!;
    assert.equal(owned.size, 1);
    assert.deepEqual(entry.card_variant_ids, [physical.id]); assert.deepEqual(entry.binder_card_ids, [saved.id]); assert.deepEqual(entry.pokedex_card_ids, [manual.id]);
    const zero = fixture(); assert.equal((await zero.read()).size, 0);
    const out = fixture({ user: null }); assert.equal((await out.signedOut()).size, 0); assert.equal(out.requests.length, 0);
    const wrong = fixture({ user: 'another-fixture-owner' }); await assert.rejects(wrong.read(), /account changed/); assert.equal(wrong.requests.length, 0);
  });

  await test('later source failure rejects the full snapshot, aborts siblings and prevents late pagination', async () => {
    const held = deferred<Page>();
    const f = fixture({ cap: 1, rows: { binders: [binderRow(0)], user_card_variants: [variantRow(0), variantRow(1)] },
      override: (request) => request.table === 'user_card_variants' && request.after ? { data: null, error: new Error('second ownership page failed') }
        : request.table === 'binder_cards' ? held.promise : undefined });
    await assert.rejects(f.read(), /second ownership page failed/);
    const count = f.requests.length;
    assert.ok(f.requests.every((row) => row.signal.aborted));
    held.resolve({ data: [savedRow(0)], error: null }); await tick(); await tick();
    assert.equal(f.requests.length, count, 'A late sibling cannot schedule another page.');
  });

  await test('malformed, duplicate, reversed, repeated, foreign and oversized pages remain incomplete', async () => {
    const valid = binderRow(0);
    const invalid: (() => Page)[] = [
      () => ({ data: null, error: null }),
      () => ({ data: [{ ...valid, id: 'legacy-not-a-row-uuid' }], error: null }),
      () => ({ data: [valid, valid], error: null }),
      () => ({ data: [binderRow(1), valid], error: null }),
      () => ({ data: [valid], error: null }),
      () => ({ data: [{ ...valid, user_id: 'foreign-owner' }], error: null }),
      () => ({ data: Array.from({ length: 501 }, (_, index) => binderRow(index)), error: null }),
    ];
    for (const page of invalid) {
      const f = fixture({ override: (request) => request.table === 'binders' ? page() : undefined });
      await assert.rejects(f.read(), /incomplete|pagination could not be verified/);
      assert.ok(f.requests.length <= 2); assert.ok(f.requests.every((row) => row.signal.aborted));
    }
    for (const table of ['user_card_variants', 'user_pokedex_cards']) {
      for (const invalidRow of [{ ...variantRow(0), user_id: 'foreign-owner' }, { ...variantRow(0), card_id: '' }, { ...variantRow(0), set_id: undefined }]) {
        const f = fixture({ override: (request) => request.table === table ? { data: [invalidRow], error: null } : undefined });
        await assert.rejects(f.read(), /pagination could not be verified/);
      }
    }
    for (const invalidRow of [{ ...savedRow(0), binder_id: binderRow(1).id }, { ...savedRow(0), owned: false }]) {
      const f = fixture({ rows: { binders: [valid] }, override: (request) => request.table === 'binder_cards' ? { data: [invalidRow], error: null } : undefined });
      await assert.rejects(f.read(), /pagination could not be verified/);
    }
  });

  await test('a cycle and duplicate row crossing binder chunks cannot masquerade as a new contribution', async () => {
    const repeated = fixture({ override: (request) => request.table === 'binders'
      ? { data: [request.after ? binderRow(0) : binderRow(1)], error: null } : undefined });
    await assert.rejects(repeated.read(), /pagination could not be verified/); assert.equal(repeated.requests.length, 2);
    const f = fixture({ rows: { binders: Array.from({ length: 101 }, (_, index) => binderRow(index)) },
      override: (request) => request.table === 'binder_cards'
        ? { data: request.after ? [] : [{ ...savedRow(0), binder_id: request.binderIds![0] }], error: null } : undefined });
    await assert.rejects(f.read(), /pagination could not be verified/);
    assert.equal(f.requests.filter((row) => row.table === 'binder_cards' && !row.after).length, 2);
  });

  await test('one shared 2560-page budget preserves the previous logical capacity', async () => {
    const f = fixture({ cap: (table) => table === 'binder_cards' ? 1 : 50, rows: {
      binders: Array.from({ length: 2600 }, (_, index) => binderRow(index)),
      binder_cards: Array.from({ length: 2600 }, (_, index) => savedRow(index)),
    } });
    await assert.rejects(f.read(), /safe request limit/);
    assert.equal(f.requests.length, 2560);
    assert.equal(f.requests.filter((row) => row.table === 'binders').length, 53);
    assert.ok(new Set(f.requests.filter((row) => row.table === 'binder_cards').map((row) => JSON.stringify(row.binderIds))).size > 3);
    assert.ok(f.requests.every((row) => row.signal.aborted));
  });

  await test('the shared deadline settles ignored-abort pages and late authentication without further dispatch', async () => {
    const held = deferred<Page>();
    const f = fixture({ timeoutMs: 20, override: () => held.promise });
    await assert.rejects(f.read(), /taking longer than expected/);
    const count = f.requests.length; assert.equal(count, 1); assert.ok(f.requests[0].signal.aborted);
    held.resolve({ data: [binderRow(0)], error: null }); await tick(); await tick(); assert.equal(f.requests.length, count);
    const auth = deferred<any>(); const authPending = fixture({ timeoutMs: 20, auth: () => auth.promise });
    await assert.rejects(authPending.read(), /taking longer than expected/);
    auth.resolve({ data: { user: { id: account } }, error: null }); await tick(); await tick(); assert.equal(authPending.requests.length, 0);
  });

  await test('signal and generation invalidation stop all later pages and binder chunks even if transport ignores abort', async () => {
    for (const boundary of ['signal', 'generation'] as const) {
      const held = deferred<Page>(); let current = true; const request = new AbortController();
      const f = fixture({ rows: { binders: Array.from({ length: 101 }, (_, index) => binderRow(index)) },
        override: (page) => page.table === 'binder_cards' ? held.promise : undefined });
      const read = f.read({ signal: request.signal, isCurrent: () => current }); await tick();
      const rejected = assert.rejects(read, /cancelled/);
      if (boundary === 'signal') request.abort(); else current = false;
      const count = f.requests.length;
      held.resolve({ data: [savedRow(0)], error: null }); await rejected; await tick(); await tick();
      assert.equal(f.requests.length, count);
      assert.equal(f.requests.filter((row) => row.table === 'binder_cards').length, 1, 'Never enter the second binder chunk.');
      assert.ok(f.requests.every((row) => row.signal.aborted));
    }
    const already = fixture(); const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(already.read({ signal: cancelled.signal }), /cancelled/); assert.equal(already.authReads(), 0);
  });

  await test('owned-name lookup preserves six-card batches and stops after invalidation or deadline', async () => {
    const rows = { user_card_variants: Array.from({ length: 13 }, (_, index) => variantRow(index)) };
    const success = fixture({ rows }); assert.deepEqual([...(await success.names())], ['pikachu']);
    assert.deepEqual(success.nameBatches.map((batch) => batch.length), [6, 6, 1]);
    const held = deferred<Map<string, any>>(); const request = new AbortController();
    const f = fixture({ rows, cardRows: async (ids) => ids.includes(variantRow(6).card_id) ? held.promise
      : new Map(ids.map((id) => [id, { id, name: 'Pikachu' }])) });
    const pending = f.names({ signal: request.signal }); await tick();
    assert.equal(f.nameBatches.length, 2);
    const rejected = assert.rejects(pending, /cancelled/); request.abort(); await rejected;
    held.resolve(new Map()); await tick(); await tick(); assert.equal(f.nameBatches.length, 2);
    const late = deferred<Map<string, any>>(); const timed = fixture({ rows, timeoutMs: 20, cardRows: () => late.promise });
    await assert.rejects(timed.names(), /taking longer than expected/);
    late.resolve(new Map()); await tick(); await tick(); assert.equal(timed.nameBatches.length, 1);
  });

  await test('required name facts fail the ownership refresh without scheduling later name batches', async () => {
    const failure = new Error('required name facts failed');
    const f = fixture({ rows: { user_card_variants: Array.from({ length: 13 }, (_, index) => variantRow(index)) },
      cardRows: async () => { throw failure; } });
    await assert.rejects(f.names(), (error) => error === failure);
    assert.equal(f.nameBatches.length, 1);
    assert.ok(f.requests.every((row) => row.signal.aborted));
  });

  console.log(JSON.stringify({ fixtureAccountsOnly: true, actualOwnershipService: true, passedGroups: groups.length, groups,
    limits: { tablePageSize: 50, sharedTablePageBudget: 2560, productionLogicalDeadlineMs: 10_000,
      adapterNameBatch: 6, adapterNetworkInternalsCountedAsTablePages: false },
    liveServerCapAndPhoneCause: 'unverified' }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
