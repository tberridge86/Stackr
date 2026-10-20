import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import { assertActivityPostIdentity } from '../lib/activityIdentity';
import { isMissingActivitySnapshotColumn } from '../lib/activitySchema';

type Failure = { code?: string; message?: string; details?: string };
const snapshotColumns = [
  'card_name_snapshot', 'card_number_snapshot', 'card_language_snapshot',
  'card_image_small_snapshot', 'card_image_large_snapshot',
  'canonical_printing_id', 'canonical_variant_id',
];
const input = {
  title: 'Removed from collection', type: 'binder_remove', cardId: 'card-a', setId: 'set-a',
  isPositive: false,
  cardSnapshot: { name: 'Exact card', number: '7', language: 'ja', imageSmall: 'https://images.example/exact.jpg' },
};

function activityWriter(options: {
  failures?: (Failure | null | Error)[];
  users?: (string | null)[];
  lookupUser?: string | null;
  authError?: Failure;
  existingEvent?: Record<string, unknown> | null;
  existingError?: Failure;
  lookupPromise?: Promise<any>;
} = {}) {
  const writes: Record<string, unknown>[] = [];
  let userId: string | null = options.users?.[0] ?? 'owner-a';
  let authCalls = 0;
  let lookupCalls = 0;
  let lookupSignal: AbortSignal | undefined;
  const supabase = {
    auth: { getUser: async () => {
      if (options.users) userId = options.users[Math.min(authCalls, options.users.length - 1)]!;
      authCalls += 1;
      return { data: { user: userId ? { id: userId } : null }, error: options.authError ?? null };
    } },
    from: (table: string) => {
      if (table === 'pokemon_cards') return {
        select: () => ({ eq: (_column: string, cardId: string) => ({ abortSignal: (signal: AbortSignal) => {
          lookupSignal = signal;
          return { maybeSingle: async () => {
          lookupCalls += 1;
          if ('lookupUser' in options) userId = options.lookupUser ?? null;
          if (options.lookupPromise) return options.lookupPromise;
          return { data: { id: cardId, name: 'Exact card', language: 'ja', image_small: input.cardSnapshot.imageSmall }, error: null };
        } };
        } }) }),
      };
      assert.equal(table, 'activity_feed');
      return { select: () => {
        const filters: Record<string, unknown> = {};
        const query: any = {
          eq: (column: string, value: unknown) => { filters[column] = value; return query; },
          maybeSingle: async () => ({
            data: options.existingEvent && Object.entries(filters).every(([column, value]) => options.existingEvent?.[column] === value)
              ? options.existingEvent : null,
            error: options.existingError ?? null,
          }),
        };
        return query;
      }, insert: async (payload: Record<string, unknown>) => {
        writes.push(payload);
        const failure = options.failures?.[writes.length - 1] ?? null;
        if (failure instanceof Error) throw failure;
        return { error: failure };
      } };
    },
  };
  const exports: any = {};
  const source = fs.readFileSync(new URL('../lib/activity.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === './supabase') return { supabase };
      if (name === './activityIdentity') return { assertActivityPostIdentity };
      if (name === './activitySchema') return { isMissingActivitySnapshotColumn };
      throw new Error(`Unexpected activity dependency: ${name}`);
    },
    console: { log: () => {}, warn: () => {} },
    AbortController, setTimeout, clearTimeout,
  });
  return { write: exports.createActivityPost as (...args: any[]) => Promise<any>, writes, lookupCalls: () => lookupCalls, lookupSignal: () => lookupSignal };
}

async function main() {
  const current = activityWriter();
  assert.equal((await current.write(input, { expectedUserId: 'owner-a' })).status, 'created');
  assert.equal(current.writes.length, 1);
  assert.equal(current.writes[0].user_id, 'owner-a');
  assert.equal(current.writes[0].card_id, 'card-a');
  assert.equal(current.writes[0].card_image_small_snapshot, input.cardSnapshot.imageSmall);
  assert.equal(current.lookupCalls(), 0, 'supplied exact snapshots need no catalogue lookup');

  for (const column of snapshotColumns) {
    const legacy = activityWriter({ failures: [{
      code: 'PGRST204', message: `Could not find the '${column}' column of 'activity_feed' in the schema cache`,
    }, null] });
    const result = await legacy.write(input, { expectedUserId: 'owner-a' });
    assert.equal(result.status, 'created');
    assert.equal(legacy.writes.length, 2, 'an absent optional activity column retries once against the old schema');
    for (const optional of snapshotColumns) assert.equal(optional in legacy.writes[1], false);
    for (const base of ['user_id', 'type', 'title', 'subtitle', 'card_id', 'set_id', 'is_positive', 'value_change']) {
      assert.equal(legacy.writes[1][base], legacy.writes[0][base], `legacy retry preserves ${base}`);
    }
  }

  const postgres = activityWriter({ failures: [{ code: '42703', message: 'column "canonical_printing_id" of relation "activity_feed" does not exist' }, null] });
  assert.equal((await postgres.write(input)).status, 'created');
  assert.equal(postgres.writes.length, 2);

  for (const failure of [
    { code: '42501', message: 'new row violates row-level security policy for table "activity_feed"' },
    { code: '23503', message: 'activity_feed foreign key violation' },
    { code: 'PGRST204', message: "Could not find the 'title' column of 'activity_feed' in the schema cache" },
    { code: '42501', message: 'permission denied for card_image_small_snapshot' },
    { message: 'Network request failed' },
    new Error('transport unavailable'),
  ]) {
    const rejected = activityWriter({ failures: [failure] });
    const result = await rejected.write(input);
    assert.equal(result.status, 'failed', 'a saved holding gets an explicit activity failure without claiming a rollback');
    assert.equal(result.error, failure);
    assert.equal(rejected.writes.length, 1, 'unknown failures must not retry or strip identity/artwork');
  }

  const retryFailed = activityWriter({ failures: [
    { code: 'PGRST204', message: "Could not find the 'card_name_snapshot' column of 'activity_feed' in the schema cache" },
    { code: '42501', message: 'activity writes are forbidden' },
  ] });
  assert.equal((await retryFailed.write(input)).status, 'failed');
  assert.equal(retryFailed.writes.length, 2, 'schema fallback is bounded even when the old payload fails');

  const signedOut = activityWriter({ users: [null] });
  assert.equal((await signedOut.write(input)).status, 'signed_out');
  assert.equal(signedOut.writes.length, 0);
  const authError = { message: 'Auth network request failed' };
  const authFailed = activityWriter({ users: [null], authError });
  const authFailureResult = await authFailed.write(input, { expectedUserId: 'owner-a' });
  assert.equal(authFailureResult.status, 'failed', 'an auth lookup failure is distinct from a verified account change');
  assert.equal(authFailureResult.error, authError);
  assert.equal(authFailed.writes.length, 0);
  const wrongOwner = activityWriter({ users: ['owner-b'] });
  await assert.rejects(() => wrongOwner.write(input, { expectedUserId: 'owner-a' }), /activity_post_identity_changed/);
  assert.equal(wrongOwner.writes.length, 0);

  const lookupSwitch = activityWriter({ lookupUser: 'owner-b' });
  await assert.rejects(() => lookupSwitch.write({ ...input, cardSnapshot: undefined }, { expectedUserId: 'owner-a' }), /activity_post_identity_changed/);
  assert.equal(lookupSwitch.writes.length, 0, 'account switching while resolving artwork must never post under the next account');

  let resolveLateLookup!: (value: unknown) => void;
  const slowLookup = new Promise((resolve) => { resolveLateLookup = resolve; });
  const slow = activityWriter({ lookupPromise: slowLookup });
  const lookupStarted = Date.now();
  assert.equal((await slow.write({ ...input, cardSnapshot: undefined }, { expectedUserId: 'owner-a' })).status, 'created');
  assert.ok(Date.now() - lookupStarted < 1000, 'optional artwork must not hold up a saved collection event');
  assert.equal(slow.lookupSignal()?.aborted, true, 'a stalled optional request is cancelled at the deadline');
  assert.equal(slow.writes[0].card_image_small_snapshot, null);
  resolveLateLookup({ data: { id: input.cardId, image_small: 'https://images.example/too-late.jpg' }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(slow.writes.length, 1);
  assert.equal(slow.writes[0].card_image_small_snapshot, null, 'late artwork cannot change an already written event');

  const retrySwitch = activityWriter({ users: ['owner-a', 'owner-a', 'owner-b'], failures: [{
    code: 'PGRST204', message: "Could not find the 'card_name_snapshot' column of 'activity_feed' in the schema cache",
  }] });
  await assert.rejects(() => retrySwitch.write(input, { expectedUserId: 'owner-a' }), /activity_post_identity_changed/);
  assert.equal(retrySwitch.writes.length, 1, 'an account change after the rejected modern write must prevent the legacy retry');

  const eventId = '11111111-1111-5111-8111-111111111111';
  const duplicateFailure = { code: '23505', message: 'duplicate key value violates unique constraint "activity_feed_pkey"' };
  const baseEvent = {
    id: eventId, user_id: 'owner-a', type: input.type, title: input.title, subtitle: null,
    card_id: input.cardId, set_id: input.setId, value_change: null, is_positive: false,
  };
  const existing = activityWriter({ failures: [duplicateFailure], existingEvent: baseEvent });
  const existingResult = await existing.write(input, { eventId, expectedUserId: 'owner-a' });
  assert.equal(existingResult.status, 'created');
  assert.equal(existingResult.snapshotStored, false, 'a legacy event remains valid without claiming its snapshot exists');
  assert.equal(existing.writes.length, 1, 'verified idempotent replay does not insert another event');
  for (const wrong of [
    { ...baseEvent, user_id: 'owner-b' },
    { ...baseEvent, card_id: 'card-b' },
    { ...baseEvent, title: 'Other operation' },
    { ...baseEvent, card_image_small_snapshot: 'https://images.example/wrong.jpg' },
    null,
  ]) {
    const collision = activityWriter({ failures: [duplicateFailure], existingEvent: wrong });
    assert.equal((await collision.write(input, { eventId, expectedUserId: 'owner-a' })).status, 'failed',
      'a duplicate key is success only for the same owner and exact activity payload');
  }

  console.log('Home activity writes passed: legacy/current schema, exact snapshots, explicit failures and owner checks across lookup/retry.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
