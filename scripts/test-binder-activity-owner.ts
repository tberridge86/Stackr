import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import { assertActivityPostIdentity } from '../lib/activityIdentity';
import { isMissingActivitySnapshotColumn } from '../lib/activitySchema';
import { selectTcgdexReferencePersistenceImage } from '../lib/tcgdexReferencePersistence';

const source = fs.readFileSync(new URL('../lib/binders.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('binders.ts', source, ts.ScriptTarget.Latest, true);
const names = ['decodeVirtualBinderPart', 'parseVirtualBinderCardId', 'updateBinderCardOwned', 'updateBinderCardQuantity'];
const definitions = tree.statements.filter((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && Boolean(node.name && names.includes(node.name.text)),
);
assert.equal(definitions.length, names.length);
const compile = (code: string) => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = compile(definitions.map((node) => node.getText(tree)).join('\n'));
const activityCompiled = compile(fs.readFileSync(new URL('../lib/activity.ts', import.meta.url), 'utf8'));

function fixture(options: {
  row?: Record<string, any> | null;
  switchAfterCommit?: boolean;
  rejectActivity?: boolean;
  rejectHolding?: boolean;
  initialUser?: string | null;
} = {}) {
  let owner: string | null = 'initialUser' in options ? options.initialUser ?? null : 'owner-a';
  let row = options.row === undefined ? {
    id: 'saved-card', binder_id: 'binder-a', card_id: 'card-a', set_id: 'set-a', language: 'en',
    card_name: 'Exact card', owned: false, owned_quantity: 1,
  } : options.row;
  const events: Record<string, unknown>[] = [];
  const actors: string[] = [];
  const steps: string[] = [];
  let holdingWrites = 0;
  const supabase = {
    auth: { getUser: async () => {
      steps.push('auth');
      return { data: { user: owner ? { id: owner } : null }, error: null };
    } },
    from: (table: string) => {
      if (table === 'pokemon_cards') return {
        select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      };
      if (table === 'activity_feed') return { insert: async (payload: Record<string, unknown>) => {
        assert.equal(payload.user_id, owner);
        if (options.rejectActivity) return { error: { code: '42501', message: 'simulated history rejection' } };
        events.push(payload);
        return { error: null };
      } };
      assert.equal(table, 'binder_cards');
      steps.push('holding-query');
      let action = 'read';
      let payload: any;
      const run = () => {
        if (action === 'read') return { data: row ? { ...row } : null, error: null };
        if (options.rejectHolding) return { data: null, error: new Error('holding write rejected') };
        holdingWrites += 1;
        steps.push('holding-commit');
        row = action === 'delete' ? null : { ...row, ...payload, id: row?.id ?? 'saved-card' };
        if (options.switchAfterCommit) owner = 'owner-b';
        return { data: row, error: null };
      };
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => run(),
        single: async () => run(),
        insert: (value: any) => { action = 'insert'; payload = value; return query; },
        upsert: (value: any) => { action = 'upsert'; payload = value; return query; },
        update: (value: any) => { action = 'update'; payload = value; return query; },
        delete: () => { action = 'delete'; return query; },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
  const activityExports: any = {};
  vm.runInNewContext(activityCompiled, {
    exports: activityExports,
    require: (name: string) => {
      if (name === './supabase') return { supabase };
      if (name === './activityIdentity') return { assertActivityPostIdentity };
      if (name === './activitySchema') return { isMissingActivitySnapshotColumn };
      throw new Error(`Unexpected dependency ${name}`);
    },
    console: { warn: () => {}, log: () => {} },
    AbortController, setTimeout, clearTimeout,
  });
  const exports: any = {};
  vm.runInNewContext(compiled, {
    exports, supabase,
    createActivityPost: (input: unknown, postOptions: { expectedUserId: string }) => {
      actors.push(postOptions.expectedUserId);
      return activityExports.createActivityPost(input, postOptions);
    },
    normalizePokemonCardLanguage: (language: string | null | undefined) => language ?? 'en',
    fetchLatestSnapshotPrices: async () => new Map(),
    binderImageUrlForPersistence: selectTcgdexReferencePersistenceImage,
    recordAchievementEvent: async () => {},
    invalidateBinderCaches: () => {},
    console: { warn: () => {}, log: () => {} },
  });
  return { actions: exports, events, actors, steps, row: () => row, writes: () => holdingWrites };
}

async function main() {
  const virtual = 'virtual:binder-a:set-a:card-a';
  const meta = { cardName: 'Exact card', language: 'en', imageUrl: 'https://images.example/approved.jpg' };
  const cases: { name: string; row?: Record<string, any> | null; call: (actions: any) => Promise<unknown>; type: string }[] = [
    { name: 'saved card add', call: (actions) => actions.updateBinderCardOwned('saved-card', true), type: 'binder_add' },
    { name: 'saved card remove', row: { id: 'saved-card', card_id: 'card-a', set_id: 'set-a', card_name: 'Exact card', owned: true, owned_quantity: 2 }, call: (actions) => actions.updateBinderCardOwned('saved-card', false), type: 'binder_remove' },
    { name: 'saved quantity reduction', row: { id: 'saved-card', card_id: 'card-a', set_id: 'set-a', card_name: 'Exact card', owned: true, owned_quantity: 4 }, call: (actions) => actions.updateBinderCardQuantity('saved-card', 2), type: 'quantity_reduced' },
    { name: 'saved quantity increase', row: { id: 'saved-card', card_id: 'card-a', set_id: 'set-a', card_name: 'Exact card', owned: true, owned_quantity: 1 }, call: (actions) => actions.updateBinderCardQuantity('saved-card', 2), type: 'binder_add' },
    { name: 'saved unowned placeholder becomes owned', call: (actions) => actions.updateBinderCardQuantity('saved-card', 1), type: 'binder_add' },
    { name: 'virtual card add', row: null, call: (actions) => actions.updateBinderCardOwned(virtual, true, meta), type: 'binder_add' },
    { name: 'virtual card remove', row: { id: 'saved-card', card_name: 'Exact card' }, call: (actions) => actions.updateBinderCardOwned(virtual, false, meta), type: 'binder_remove' },
    { name: 'virtual quantity reduction', row: { id: 'saved-card', owned_quantity: 4, card_name: 'Exact card' }, call: (actions) => actions.updateBinderCardQuantity(virtual, 2, meta), type: 'quantity_reduced' },
    { name: 'virtual quantity add', row: null, call: (actions) => actions.updateBinderCardQuantity(virtual, 2, meta), type: 'binder_add' },
    { name: 'virtual quantity increase', row: { id: 'saved-card', owned: true, owned_quantity: 1, card_name: 'Exact card' }, call: (actions) => actions.updateBinderCardQuantity(virtual, 2, meta), type: 'binder_add' },
    { name: 'virtual unowned placeholder becomes owned', row: { id: 'saved-card', owned: false, owned_quantity: 1, card_name: 'Exact card' }, call: (actions) => actions.updateBinderCardQuantity(virtual, 1, meta), type: 'binder_add' },
  ];
  for (const scenario of cases) {
    const current = fixture({ row: scenario.row });
    await scenario.call(current.actions);
    assert.equal(current.events.length, 1, scenario.name);
    assert.equal(current.events[0].type, scenario.type);
    assert.equal(current.events[0].user_id, 'owner-a');
    assert.deepEqual(current.actors, ['owner-a']);
    assert.equal(current.steps[0], 'auth', 'the actor is captured before holding reads or writes');

    const switched = fixture({ row: scenario.row, switchAfterCommit: true });
    await scenario.call(switched.actions);
    assert.equal(switched.writes(), 1, `${scenario.name}: holding success stays successful`);
    assert.equal(switched.events.length, 0, `${scenario.name}: a later account cannot receive the earlier holding event`);
    assert.deepEqual(switched.actors, ['owner-a'], 'the caller binds the mutation-start actor rather than the later session');

    const historyRejected = fixture({ row: scenario.row, rejectActivity: true });
    await scenario.call(historyRejected.actions);
    assert.equal(historyRejected.writes(), 1, 'history rejection does not report a failed holding save');
    assert.equal(historyRejected.events.length, 0);
  }
  const noMutation = fixture({ row: null });
  await noMutation.actions.updateBinderCardOwned(virtual, false, meta);
  assert.equal(noMutation.events.length, 0, 'removing a missing virtual card creates no history');
  for (const id of ['saved-card', virtual]) {
    const unchanged = fixture({ row: { id: 'saved-card', owned: true, owned_quantity: 2 } });
    await unchanged.actions.updateBinderCardQuantity(id, 2, meta);
    assert.equal(unchanged.events.length, 0, 'saving an unchanged quantity must not create an addition');
  }
  const holdingRejected = fixture({ rejectHolding: true });
  await assert.rejects(() => holdingRejected.actions.updateBinderCardOwned('saved-card', true), /holding write rejected/);
  assert.equal(holdingRejected.events.length, 0);
  const signedOut = fixture({ initialUser: null });
  await assert.rejects(() => signedOut.actions.updateBinderCardQuantity('saved-card', 2), /Sign in/);
  assert.equal(signedOut.writes(), 0);
  console.log('Binder activity actor checks passed: real/virtual add, removal and quantity edits preserve save success across history failure or account switch.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
