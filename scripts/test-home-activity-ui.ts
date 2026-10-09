import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function execute(source: string, context: Record<string, unknown>, expression: string) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`${source}\nexports.run = ${expression};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, Map, ...context });
  return exports.run;
}

async function testSetActivityFailure() {
  const source = readFileSync('app/set/[id].tsx', 'utf8');
  const start = source.indexOf('const handleSetVariantQuantity = useCallback');
  const end = source.indexOf('const handleQuickAddVariant', start);
  assert.ok(start >= 0 && end > start);
  let quantities = new Map<string, number>();
  let persisted = 0;
  let identityChanged = false;
  const alerts: string[] = [];
  const activityCalls: any[] = [];
  const builder: any = { eq: () => builder, then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
  const makeHandler = () => execute(source.slice(start, end), {
    useCallback: (fn: unknown) => fn, userId: 'owner-a', authUserIdRef: { current: 'owner-a' }, ownershipReady: true,
    setId: 'set-a', variantQuantities: quantities, cards: [{ id: 'card-a', name: 'Pikachu' }],
    getVariantKey: () => 'key', shortVariant: (value: unknown) => value,
    setVariantQuantities: (update: (previous: Map<string, number>) => Map<string, number>) => { quantities = update(quantities); },
    supabase: { from: () => ({
      upsert: async () => { persisted++; return { error: null }; },
      delete: () => { persisted++; return builder; },
    }) },
    createActivityPost: async (post: unknown, options: unknown) => {
      activityCalls.push({ post, options });
      if (identityChanged) throw new Error('activity_post_identity_changed');
      return { status: 'failed', error: new Error('history transport failed') };
    },
    Alert: { alert: (title: string) => alerts.push(title) }, console: { log: () => {} },
  }, 'handleSetVariantQuantity');
  const handler = makeHandler();
  await handler('card-a', 'normal', 1);
  assert.equal(persisted, 1);
  assert.equal(quantities.get('key'), 1, 'failed history cannot revert a saved holding');
  assert.deepEqual(JSON.parse(JSON.stringify(activityCalls[0].options)), { expectedUserId: 'owner-a' });
  assert.equal(activityCalls[0].post.type, 'binder_add');
  assert.deepEqual(alerts, ['Collection updated']);
  identityChanged = true;
  await makeHandler()('card-a', 'normal', 2);
  assert.equal(quantities.get('key'), 2, 'post-commit owner changes cannot become a save rollback');
  assert.equal(activityCalls[1].post.title, 'Quantity increased from 1 to 2', 'an existing-stack increase creates addition history');
  assert.equal(activityCalls[1].post.type, 'binder_add');
  assert.equal(alerts.length, 1, 'old-owner history completion stays quiet');
  await makeHandler()('card-a', 'normal', 2);
  assert.equal(activityCalls.length, 2, 'an unchanged quantity creates no additional history');
}

async function testManualHistoryRepair() {
  const source = readFileSync('app/collection/add-card.tsx', 'utf8');
  const start = source.indexOf('const save = async');
  const end = source.indexOf('\n  return <SafeAreaView', start);
  assert.ok(start >= 0 && end > start);
  const card = { cardId: 'card-a', setId: 'set-a' };
  let draft: any = { id: 'draft-a', userId: 'owner-a', binderId: 'binder-a', card, quantity: 1, state: 'review' };
  let failHistory = true;
  const mutations: any[] = [];
  const requestKeys: string[] = [];
  const historyPending: boolean[] = [];
  const errors: (string | null)[] = [];
  const context: any = { draft, saved: false, operation: { current: false }, binders: [{ id: 'binder-a', user_id: 'owner-a' }],
    setBusy: () => {}, setError: (value: string | null) => errors.push(value),
    setHistoryPending: (value: boolean) => historyPending.push(value),
    setDraft: (value: any) => { draft = value; context.draft = value; context.saved = value.state === 'saved'; },
    supabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner-a' } } }) } },
    updateManualCollectionDraft: async (_owner: string, _id: string, patch: any) => { mutations.push(patch); return { ...draft, ...patch }; },
    createCollectionBatchRequestKey: () => 'same-original-request',
    persistVerifiedCollectionBatchRecoveryIntent: async (input: any) => input,
    resumeOwnedCardBatchToBinder: async (_id: string, _cards: unknown, options: any) => {
      requestKeys.push(options.requestKey); return failHistory ? { activityFailures: 1 } : { replayed: true };
    },
  };
  // A shared VM context lets the real callback observe React's updated draft.
  const exports: any = {};
  context.exports = exports;
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`${source.slice(start, end)}\nexports.save = save;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  await exports.save();
  assert.equal(draft.state, 'saving', 'failed history retains the recoverable original selection');
  assert.equal(mutations.some(patch => patch.state === 'saved'), false, 'failed history cannot finalize recovery');
  assert.equal(historyPending.at(-1), true);
  assert.match(errors.at(-1) ?? '', /Your card is saved/);
  failHistory = false;
  await exports.save();
  assert.equal(draft.state, 'saved');
  assert.equal(historyPending.at(-1), false);
  assert.deepEqual(requestKeys, ['same-original-request', 'same-original-request']);
  assert.match(source, /'Finish history'/);
}

void (async () => {
  await testSetActivityFailure();
  await testManualHistoryRepair();
  console.log('Home history UI: post-commit failures retain saved quantities, suppress old-owner completion and retry manual history with the original request.');
})().catch(error => { console.error(error); process.exitCode = 1; });
