import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const ts: typeof import('typescript') = require('typescript');
const storageValues = new Map<string, string>();
let delayFirstSessionWrite = true;
let rejectNextSessionWrite = false;

function mock(name: string, exports: unknown) {
  const filename = require.resolve(name);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
}

mock('@react-native-async-storage/async-storage', {
  getItem: async (key: string) => storageValues.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    if (rejectNextSessionWrite && key.includes(':session:')) {
      rejectNextSessionWrite = false;
      throw new Error('review storage rejected this write');
    }
    if (delayFirstSessionWrite && key.includes(':session:')) {
      delayFirstSessionWrite = false;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    storageValues.set(key, value);
  },
  removeItem: async (key: string) => { storageValues.delete(key); },
});
mock(path.join(root, 'lib/binders'), { fetchBinderById: async () => null, invalidateBinderCaches: () => undefined });
mock(path.join(root, 'lib/pokemonTcg'), { normalizePokemonCardLanguage: (value: unknown) => String(value ?? 'en').toLowerCase() });
mock(path.join(root, 'lib/supabase'), { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-a' } } } }) } } });

const store: any = require(path.join(root, 'lib/binderPageScanStore'));
const batch: any = require(path.join(root, 'lib/collectionBatch'));
const sourcePath = path.join(root, 'app/scan/binder-page-result.tsx');
const sourceText = fs.readFileSync(sourcePath, 'utf8');
const source = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers: Record<string, string> = {};

function walk(node: import('typescript').Node): void {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['updatePockets', 'saveConfirmed'].includes(node.name.text) && node.initializer) {
    handlers[node.name.text] = node.initializer.getText(source);
  }
  ts.forEachChild(node, walk);
}
walk(source);
assert.ok(handlers.updatePockets && handlers.saveConfirmed, 'actual binder review handlers must be present');

const factorySource = `function factory(deps: any) {
  const { correctionOpen, correctionApplyInFlightRef, scanSessionId, session, pockets, sessionRef, pocketsRef, pendingPocketMutationRef, pocketMutationSequenceRef, pocketMutationFailuresRef, sessionLoadRequestRef, updateBinderPageScanSession, setSession, setPockets, bindersLoading, bindersError, selectedBinder, saveInFlightRef, setSaving, supabase, destinationPage, createCollectionBatchRequestKey, persistVerifiedCollectionBatchRecoveryIntent, addOwnedCardBatchToBinder, logScanLearningEvent, buildBinderPageAnalytics, gridLayout, buildPocketLearningCandidates, countPocketStatuses, invalidateBinderCaches, markBinderPageScanSessionSaved, Alert, router, getSelectedCandidate } = deps;
  const updatePockets = ${handlers.updatePockets};
  const saveConfirmed = ${handlers.saveConfirmed};
  return { updatePockets, saveConfirmed };
}`;
const factoryJs = ts.transpileModule(factorySource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const factory = new Function(`${factoryJs}; return factory;`)() as (deps: any) => {
  updatePockets: (updater: (pockets: any[]) => any[]) => Promise<void>;
  saveConfirmed: () => Promise<void>;
};

const session = {
  scanSessionId: 'binder-page-confirm-race', ownerUserId: 'owner-a', binderId: 'binder-a', layout: 2,
  capturedAt: '2026-09-10T00:00:00.000Z', processingMs: 1,
  pockets: [
    { index: 0, row: 0, column: 0, cropUri: null, candidates: [{ id: 'a', set_id: 'set', language: 'en', name: 'A' }], selectedCandidateIndex: 0, status: 'confirmed', source: 'manual', quality: null, notes: [] },
    { index: 1, row: 0, column: 1, cropUri: null, candidates: [{ id: 'b', set_id: 'set', language: 'en', name: 'B' }], selectedCandidateIndex: 0, status: 'possible_match', source: 'manual', quality: null, notes: [] },
  ],
};

const createHandlerHarness = ({
  currentSession = session,
  submit,
  addOwnedCardBatch,
}: {
  currentSession?: typeof session;
  submit: (cards: any[]) => Promise<void>;
  addOwnedCardBatch?: (binderId: string, cards: any[], options: { requestKey: string }) => Promise<{ copiesAdded: number; distinctCards: number; replayed: boolean }>;
}) => {
  const sessionRef = { current: structuredClone(currentSession) };
  const pocketsRef = { current: structuredClone(currentSession.pockets) };
  const pendingPocketMutationRef = { current: Promise.resolve() as Promise<void> };
  const pocketMutationSequenceRef = { current: 0 };
  const pocketMutationFailuresRef = { current: [] as { sequence: number; error: Error }[] };
  const saveInFlightRef = { current: false };
  const alerts: string[] = [];
  const actual = factory({
    correctionOpen: false,
    correctionApplyInFlightRef: { current: false },
    scanSessionId: currentSession.scanSessionId,
    session: currentSession,
    pockets: structuredClone(currentSession.pockets),
    sessionRef,
    pocketsRef,
    pendingPocketMutationRef,
    pocketMutationSequenceRef,
    pocketMutationFailuresRef,
    sessionLoadRequestRef: { current: 1 },
    updateBinderPageScanSession: store.updateBinderPageScanSession,
    setSession: () => undefined,
    setPockets: () => undefined,
    bindersLoading: false,
    bindersError: null,
    selectedBinder: { id: 'binder-a' },
    saveInFlightRef,
    setSaving: () => undefined,
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-a' } } } }) } },
    destinationPage: 1,
    createCollectionBatchRequestKey: batch.createCollectionBatchRequestKey,
    persistVerifiedCollectionBatchRecoveryIntent: batch.persistVerifiedCollectionBatchRecoveryIntent,
    addOwnedCardBatchToBinder: addOwnedCardBatch ?? (async (_binderId: string, cards: any[]) => {
      await submit(cards);
      return { copiesAdded: cards.length, distinctCards: cards.length, replayed: false };
    }),
    logScanLearningEvent: async () => undefined,
    buildBinderPageAnalytics: () => ({}),
    gridLayout: 2,
    buildPocketLearningCandidates: () => [],
    countPocketStatuses: () => ({}),
    invalidateBinderCaches: () => undefined,
    markBinderPageScanSessionSaved: store.markBinderPageScanSessionSaved,
    Alert: { alert: (title: string) => alerts.push(title) },
    router: { replace: () => undefined },
    getSelectedCandidate: (pocket: any) => pocket.candidates[pocket.selectedCandidateIndex] ?? null,
  });
  return { actual, alerts };
};

async function run() {
  await store.checkpointBinderPageScanSession(session);
  delayFirstSessionWrite = true;
  const submitted: any[][] = [];
  const { actual } = createHandlerHarness({ submit: async (cards) => { submitted.push(cards); } });

  const confirmB = actual.updatePockets((current) => current.map((pocket) => (
    pocket.index === 1 ? { ...pocket, status: 'confirmed' } : pocket
  )));
  await new Promise((resolve) => setTimeout(resolve, 1));
  const save = actual.saveConfirmed();
  const midSaveEdit = actual.updatePockets((current) => current.map((pocket) => ({ ...pocket, status: 'empty' })))
    .then(() => ({ error: null }), (error) => ({ error }));
  await Promise.all([confirmB, save]);

  assert.deepEqual(
    submitted.map((cards) => cards.map((card) => card.cardId)),
    [['a', 'b']],
    'Save must include the confirmation that was already persisting when Save was pressed.',
  );
  const midSaveEditResult = await midSaveEdit;
  assert.match(
    midSaveEditResult.error instanceof Error ? midSaveEditResult.error.message : '',
    /Saving confirmed cards/,
    'A new review edit must not race with a save that has already started.',
  );
  const stored = await store.loadBinderPageScanSession(session.scanSessionId, 'owner-a');
  assert.equal(stored?.pockets[1].status, 'confirmed');
  assert.equal(stored?.reviewState, 'saved');
  assert.deepEqual(await store.loadRecoverableBinderPageScanSessions('owner-a'), [], 'A completed review must not hide an omitted confirmed pocket.');

  store.setBinderPageScanStorageForTests(null);
  storageValues.clear();
  const failedSession = { ...session, scanSessionId: 'binder-page-confirm-write-failure' };
  delayFirstSessionWrite = false;
  await store.checkpointBinderPageScanSession(failedSession);
  rejectNextSessionWrite = true;
  const failedSubmitted: any[][] = [];
  const { actual: failingActual, alerts } = createHandlerHarness({
    currentSession: failedSession,
    submit: async (cards) => { failedSubmitted.push(cards); },
  });
  const rejectedConfirmation = failingActual.updatePockets((current) => current.map((pocket) => (
    pocket.index === 1 ? { ...pocket, status: 'confirmed' } : pocket
  )));
  const failedSave = failingActual.saveConfirmed();
  await assert.rejects(rejectedConfirmation, /review storage rejected this write/);
  await failedSave;
  assert.deepEqual(failedSubmitted, [], 'A rejected review edit must prevent collection writes.');
  const failedStored = await store.loadBinderPageScanSession(failedSession.scanSessionId, 'owner-a');
  assert.equal(failedStored?.reviewState, 'reviewing');
  assert.equal(failedStored?.pockets[1].status, 'possible_match');
  assert.deepEqual(
    (await store.loadRecoverableBinderPageScanSessions('owner-a')).map((item: any) => item.scanSessionId),
    [failedSession.scanSessionId],
    'A rejected edit must leave the review recoverable for retry.',
  );
  assert.ok(alerts.includes('Could not save page'));

  await failingActual.saveConfirmed();
  assert.deepEqual(failedSubmitted, [], 'Retrying Save alone must not discard a failed confirmation.');
  assert.equal((await store.loadBinderPageScanSession(failedSession.scanSessionId, 'owner-a'))?.reviewState, 'reviewing');

  await failingActual.updatePockets((current) => current.map((pocket) => (
    pocket.index === 1 ? { ...pocket, status: 'confirmed' } : pocket
  )));
  await failingActual.saveConfirmed();
  assert.deepEqual(
    (failedSubmitted as any[][]).map((cards) => cards.map((card) => card.cardId)),
    [['a', 'b']],
    'A successful retry must clear the rejected edit latch and save the durable review.',
  );
  assert.equal(
    (await store.loadBinderPageScanSession(failedSession.scanSessionId, 'owner-a'))?.reviewState,
    'saved',
  );

  store.setBinderPageScanStorageForTests(null);
  storageValues.clear();
  const collectionRetrySession = {
    ...session,
    scanSessionId: 'binder-page-collection-retry',
    pockets: session.pockets.map((pocket) => (pocket.index === 1 ? { ...pocket, status: 'confirmed' } : pocket)),
  };
  await store.checkpointBinderPageScanSession(collectionRetrySession);
  const submittedOnce: any[][] = [];
  const collectionRequestKeys: string[] = [];
  let collectionAttempt = 0;
  const { actual: collectionRetryActual } = createHandlerHarness({
    currentSession: collectionRetrySession,
    submit: async (cards) => { submittedOnce.push(cards); },
    addOwnedCardBatch: async (_binderId, cards, { requestKey }) => {
      collectionAttempt += 1;
      collectionRequestKeys.push(requestKey);
      if (collectionAttempt === 1) {
        submittedOnce.push(cards);
        throw new Error('collection write interrupted after acceptance');
      }
      return { copiesAdded: 0, distinctCards: 0, replayed: true };
    },
  });
  await collectionRetryActual.saveConfirmed();
  await collectionRetryActual.saveConfirmed();
  assert.deepEqual(
    submittedOnce.map((cards) => cards.map((card) => card.cardId)),
    [['a', 'b']],
    'A failed collection response must retry through the same request without a duplicate submission.',
  );
  assert.equal(collectionRequestKeys.length, 2);
  assert.equal(collectionRequestKeys[1], collectionRequestKeys[0]);
  assert.equal(
    (await store.loadBinderPageScanSession(collectionRetrySession.scanSessionId, 'owner-a'))?.reviewState,
    'saved',
  );
  store.setBinderPageScanStorageForTests(null);
  console.log('Binder page confirmation/save race regression passed');
}

void run().catch((error) => {
  store.setBinderPageScanStorageForTests(null);
  console.error(error);
  process.exitCode = 1;
});
