import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import * as ts from 'typescript';
import {
  canShareBinderInCommunity,
  PRIVATE_BINDER_SHARE_MESSAGE,
  publicCommunityShareBinders,
} from '../lib/communityBinderSharing';

type Scenario = {
  body: string;
  selectedBinder: { id: string; is_public: boolean } | null;
  selectedCard: { binder_id?: string; card_id: string; set_id: string } | null;
  insertError?: { message: string } | null;
};

type ScenarioResult = {
  authCalls: number;
  tableCalls: string[];
  payloads: Array<Record<string, unknown>>;
  alerts: unknown[][];
  postingStates: boolean[];
  loadFeedCalls: number;
  binderVisibility: boolean;
};

const sourcePath = resolve(process.cwd(), 'app', '(tabs)', 'community', 'index.tsx');
const source = readFileSync(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource: string | undefined;

const findHandler = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'handleCreatePost') {
    handlerSource = node.initializer?.getText(sourceFile);
  }
  ts.forEachChild(node, findHandler);
};
findHandler(sourceFile);
assert.ok(handlerSource, 'The actual community handleCreatePost handler must exist.');

const compiledHandler = ts.transpileModule(`globalThis.run = ${handlerSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    authCalls: 0,
    tableCalls: [],
    payloads: [],
    alerts: [],
    postingStates: [],
    loadFeedCalls: 0,
    binderVisibility: scenario.selectedBinder?.is_public ?? false,
  };

  const context = vm.createContext({
    body: scenario.body,
    selectedCard: scenario.selectedCard,
    selectedBinder: scenario.selectedBinder,
    activeSocialTab: 'Flex',
    activeCategory: 'All',
    canShareBinderInCommunity,
    PRIVATE_BINDER_SHARE_MESSAGE,
    getActiveChannel: () => ({ key: 'binder_flex' }),
    getComposerPostType: () => 'binder_showcase',
    setPosting: (value: boolean) => result.postingStates.push(value),
    setBody: () => {},
    setSelectedCard: () => {},
    setSelectedBinder: () => {},
    setActiveCategory: () => {},
    loadFeed: async () => { result.loadFeedCalls += 1; },
    console: { log: () => {} },
    Alert: { alert: (...args: unknown[]) => result.alerts.push(args) },
    supabase: {
      auth: {
        getUser: async () => {
          result.authCalls += 1;
          return { data: { user: { id: 'owner' } }, error: null };
        },
      },
      from: (table: string) => {
        result.tableCalls.push(table);
        if (table === 'binders') {
          throw new Error('A community post must never mutate binder visibility.');
        }
        if (table !== 'social_posts') throw new Error(`Unexpected table: ${table}`);
        return {
          insert: async (payload: Record<string, unknown>) => {
            result.payloads.push(payload);
            return { error: scenario.insertError ?? null };
          },
        };
      },
    },
  });

  vm.runInContext(compiledHandler, context);
  await (context as vm.Context & { run: () => Promise<void> }).run();
  return result;
}

const privateBinder = { id: 'private', is_public: false };
const publicBinder = { id: 'public', is_public: true };
const unknownVisibility = { id: 'unknown', is_public: null };
assert.equal(canShareBinderInCommunity(privateBinder), false);
assert.equal(canShareBinderInCommunity(unknownVisibility), false);
assert.equal(canShareBinderInCommunity(publicBinder), true);
assert.deepEqual(publicCommunityShareBinders([privateBinder, publicBinder, unknownVisibility]).map((binder) => binder.id), ['public']);
assert.match(PRIVATE_BINDER_SHARE_MESSAGE, /private/i);
assert.match(PRIVATE_BINDER_SHARE_MESSAGE, /visibility/i);

async function main() {
  const failedPublicPost = await runScenario({
    body: 'My collection',
    selectedCard: null,
    selectedBinder: { id: 'public-binder', is_public: true },
    insertError: { message: 'Simulated post insert failure' },
  });
  assert.deepEqual(failedPublicPost.tableCalls, ['social_posts']);
  assert.equal(failedPublicPost.binderVisibility, true, 'A failed post must leave the existing public visibility unchanged.');
  assert.equal(failedPublicPost.payloads[0]?.binder_id, 'public-binder');
  assert.equal(failedPublicPost.alerts[0]?.[0], 'Could not post');
  assert.deepEqual(failedPublicPost.postingStates, [true, false]);

  const blockedPrivatePost = await runScenario({
    body: 'My collection',
    selectedCard: null,
    selectedBinder: { id: 'private-binder', is_public: false },
  });
  assert.equal(blockedPrivatePost.authCalls, 0, 'A private binder must be rejected before authentication or post creation.');
  assert.deepEqual(blockedPrivatePost.tableCalls, []);
  assert.equal(blockedPrivatePost.alerts[0]?.[0], 'Make binder public first');
  assert.equal(blockedPrivatePost.alerts[0]?.[1], PRIVATE_BINDER_SHARE_MESSAGE);
  assert.deepEqual(blockedPrivatePost.postingStates, []);

  const cardFromPrivateBinder = await runScenario({
    body: 'Card discussion',
    selectedBinder: null,
    selectedCard: { binder_id: 'private-binder', card_id: 'card-1', set_id: 'set-1' },
  });
  assert.deepEqual(cardFromPrivateBinder.tableCalls, ['social_posts']);
  assert.equal(cardFromPrivateBinder.payloads.length, 1);
  assert.deepEqual(
    {
      binder_id: cardFromPrivateBinder.payloads[0]?.binder_id,
      card_id: cardFromPrivateBinder.payloads[0]?.card_id,
      set_id: cardFromPrivateBinder.payloads[0]?.set_id,
    },
    { binder_id: null, card_id: 'card-1', set_id: 'set-1' },
    'Discussing a card from a private binder must not attach or reveal its binder.',
  );
  assert.equal(cardFromPrivateBinder.loadFeedCalls, 1);
  assert.deepEqual(cardFromPrivateBinder.alerts, []);

  console.log('Community post creation preserves binder privacy across failed, blocked, and card-only flows.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
