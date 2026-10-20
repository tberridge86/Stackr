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
  const currentOwnershipGeneration = 1;
  const alerts: string[] = [];
  const activityCalls: any[] = [];
  const ownershipIdentityRef = { current: 'owner-a' };
  const ownershipGenerationRef = { current: currentOwnershipGeneration };
  const quantityMutationRef = { current: new Map<string, number>() };
  const builder: any = { eq: () => builder, then: (resolve: any) => Promise.resolve({ error: null }).then(resolve) };
  const defaultCards = [{ id: 'card-a', name: 'Pikachu' }];
  const makeHandler = ({ signedOut = false, loadedCards = defaultCards }: { signedOut?: boolean; loadedCards?: any[] } = {}) => execute(source.slice(start, end), {
    useCallback: (fn: unknown) => fn, userId: signedOut ? null : 'owner-a', authUserIdRef: { current: 'owner-a' }, ownershipReady: true,
    ownershipIdentityRef, ownershipGenerationRef,
    currentOwnershipGeneration, quantityMutationRef,
    setId: 'set-a', setInfo: { language: 'en' }, visibleVariantQuantities: quantities, cards: loadedCards,
    getVariantKey: (cardId: string) => cardId, shortVariant: (value: unknown) => value,
    setVariantQuantities: (update: (previous: Map<string, number>) => Map<string, number>) => { quantities = update(quantities); },
    supabase: { from: () => ({
      upsert: async () => { persisted++; return { error: null }; },
      delete: () => { persisted++; return builder; },
    }) },
    createActivityPost: async () => ({ status: 'created' }),
    createDirectCollectionHistoryIntent: (input: unknown) => input,
    recordDirectCollectionHistory: async (intent: any) => {
      activityCalls.push(intent);
      if (identityChanged) {
        ownershipIdentityRef.current = 'owner-b';
        ownershipGenerationRef.current += 1;
      }
      return { status: 'pending', error: new Error('history transport failed') };
    },
    Alert: { alert: (title: string) => alerts.push(title) }, console: { log: () => {} },
  }, 'handleSetVariantQuantity');
  await makeHandler({ loadedCards: [] })('card-missing', 'normal', 1);
  assert.equal(persisted, 1, 'a direct quantity still commits when its card row has left the loaded list');
  assert.equal(quantities.get('card-missing'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(activityCalls[0].activity.cardSnapshot)), {
    name: null, number: null, language: null, imageSmall: null, imageLarge: null,
  }, 'a missing target records an explicit empty snapshot instead of enabling a replay lookup');
  const handler = makeHandler();
  await handler('card-a', 'normal', 1);
  assert.equal(persisted, 2);
  assert.equal(quantities.get('card-a'), 1, 'failed history cannot revert a saved holding');
  assert.equal(activityCalls[1].ownerUserId, 'owner-a');
  assert.equal(activityCalls[1].activity.type, 'binder_add');
  assert.deepEqual(alerts, ['Collection updated', 'Collection updated']);
  identityChanged = true;
  await makeHandler()('card-a', 'normal', 2);
  assert.equal(quantities.get('card-a'), 2, 'post-commit owner changes cannot become a save rollback');
  assert.equal(activityCalls[2].activity.title, 'Quantity increased from 1 to 2', 'an existing-stack increase creates addition history');
  assert.equal(activityCalls[2].activity.type, 'binder_add');
  assert.equal(alerts.length, 2, 'old-owner history completion stays quiet');
  await makeHandler()('card-a', 'normal', 2);
  assert.equal(activityCalls.length, 3, 'an unchanged quantity creates no additional history');
  const persistedBeforeSignedOut = persisted;
  await makeHandler({ signedOut: true })('card-a', 'normal', 3);
  assert.equal(persisted, persistedBeforeSignedOut, 'a stale signed-out handler cannot write a quantity');
  assert.equal(quantities.get('card-a'), 2, 'a stale signed-out handler cannot change a visible quantity');
  assert.equal(activityCalls.length, 3, 'a stale signed-out handler cannot create activity');
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
