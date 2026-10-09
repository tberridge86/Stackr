import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { readRecentHomeActivityRows } from '../lib/homeActivity';
import { ACTIVITY_BASE_COLUMNS, ACTIVITY_SNAPSHOT_COLUMNS, isMissingActivitySnapshotColumn } from '../lib/activitySchema';

const require = createRequire(import.meta.url);
const configFile = require.resolve('../lib/config');
require.cache[configFile] = { id: configFile, filename: configFile, loaded: true,
  exports: { LIVE_COMMERCE_RELEASE_APPROVED: false } } as any;
const { isGate0CommerceActivity } = require('../lib/mintyInsights') as typeof import('../lib/mintyInsights');
const { sanitizeGate0CommerceCopy } = require('../lib/gate0CommerceCopy') as typeof import('../lib/gate0CommerceCopy');

const missing = { code: '42703', message: 'column activity_feed.card_name_snapshot does not exist' };
const posts = [
  { id: 'add', user_id: 'owner-a', type: 'binder_add', title: 'Added to collection', subtitle: 'Pikachu', card_id: 'card-a', created_at: '2026-10-09T10:00:00Z', is_positive: true },
  { id: 'remove', user_id: 'owner-a', type: 'binder_remove', title: 'Removed from collection', subtitle: 'Mew', card_id: 'card-b', created_at: '2026-10-09T11:00:00Z', is_positive: false },
  { id: 'trade', user_id: 'owner-a', type: 'sale', title: 'Sold card', created_at: '2026-10-09T12:00:00Z' },
];

function reader(responses: any[], onRead?: (index: number) => void) {
  const calls: any[] = [];
  const client = { from(table: string) {
    const call: any = { table };
    calls.push(call);
    const builder: any = {
      select(columns: string) { call.columns = columns; return builder; },
      eq(column: string, value: string) { call.ownerFilter = [column, value]; return builder; },
      order(column: string, options: any) { call.order = [column, options]; return builder; },
      limit(limit: number) { call.limit = limit; return builder; },
      then(resolve: any, reject: any) { onRead?.(calls.length); return Promise.resolve(responses[calls.length - 1]).then(resolve, reject); },
    };
    return builder;
  } };
  return { client, calls };
}

async function main() {
  const legacy = reader([{ error: missing }, { data: posts, error: null }]);
  assert.deepEqual(await readRecentHomeActivityRows(legacy.client, 'owner-a', () => true), posts);
  assert.deepEqual(legacy.calls.map(call => call.columns), [ACTIVITY_SNAPSHOT_COLUMNS, ACTIVITY_BASE_COLUMNS]);
  for (const call of legacy.calls) {
    assert.equal(call.table, 'activity_feed');
    assert.deepEqual(call.ownerFilter, ['user_id', 'owner-a']);
    assert.equal(call.limit, 20);
    assert.deepEqual(call.order, ['created_at', { ascending: false }]);
  }
  const modern = reader([{ data: [{ ...posts[0], card_name_snapshot: 'Pikachu', card_image_small_snapshot: 'exact-native-small' }], error: null }]);
  assert.equal((await readRecentHomeActivityRows(modern.client, 'owner-a', () => true))[0].card_image_small_snapshot, 'exact-native-small');
  assert.equal(modern.calls.length, 1);
  for (const error of [
    { code: '42501', message: 'permission denied' },
    { code: '42703', message: 'column activity_feed.title does not exist' },
    { code: 'PGRST204', message: "Could not find the 'other_field' column of 'activity_feed'" },
    { code: '08006', message: 'connection failed' },
  ]) {
    assert.equal(isMissingActivitySnapshotColumn(error), false);
    const failing = reader([{ error }]);
    await assert.rejects(readRecentHomeActivityRows(failing.client, 'owner-a', () => true), value => value === error);
    assert.equal(failing.calls.length, 1, 'unrelated errors must not retry or turn into empty history');
  }
  let current = true;
  const switched = reader([{ error: missing }], () => { current = false; });
  await assert.rejects(readRecentHomeActivityRows(switched.client, 'owner-a', () => current), /activity_read_identity_changed/);
  assert.equal(switched.calls.length, 1, 'account changes cannot start a compatibility read');

  // Execute the production Home callback and its real classifiers. Artwork is
  // deliberately deferred to prove events render before optional enrichment.
  const source = readFileSync('features/home/HubScreen.tsx', 'utf8');
  const classifiers = source.slice(source.indexOf('const activityIconForType'), source.indexOf('const enrichActivityItemsWithCardImages'));
  const callback = source.slice(source.indexOf('const loadRecentActivity = useCallback'), source.indexOf('const checkHubTip = useCallback'));
  assert.ok(classifiers && callback);
  const exports: any = {};
  let owner = 'owner-a';
  let authError: unknown = null;
  let rows: any[] = posts;
  let readError: unknown = null;
  const history: any[][] = [];
  const errors: (string | null)[] = [];
  const loading: boolean[] = [];
  const deferredImages: ((items: any[]) => void)[] = [];
  const sessionRef = { current: owner };
  vm.runInNewContext(ts.transpileModule(`${classifiers}\n${callback}\nexports.load = loadRecentActivity;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, useCallback: (fn: unknown) => fn, homeActivityRequestRef: { current: 0 }, homeSessionUserIdRef: sessionRef,
    supabase: { auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null }, error: authError }) } },
    readRecentHomeActivityRows: async () => { if (readError) throw readError; return rows; },
    isGate0CommerceActivity, sanitizeGate0CommerceCopy,
    setActivityLoading: (value: boolean) => loading.push(value), setActivityError: (value: string | null) => errors.push(value),
    setRecentActivity: (items: any[]) => history.push(items),
    enrichActivityItemsWithCardImages: () => new Promise(resolve => deferredImages.push(resolve)),
    console: { log: () => {} },
  });
  await exports.load();
  assert.deepEqual(Array.from(history[0], item => item.id), ['post:remove', 'post:add']);
  assert.equal(history[0][0].activityType, 'removed');
  assert.equal(history[0][0].isPositive, false);
  assert.equal(history[0][1].activityType, 'added');
  assert.equal(loading.at(-1), false, 'history finishes loading while artwork remains pending');
  rows = [{ ...posts[0], id: 'newer' }];
  await exports.load();
  const latest = history.at(-1);
  deferredImages[0]([{ id: 'stale-old-image' }]);
  await Promise.resolve();
  assert.equal(history.at(-1), latest, 'old enrichment cannot overwrite newer events');
  owner = 'owner-b'; sessionRef.current = owner;
  deferredImages[1]([{ id: 'owner-a-image' }]);
  await Promise.resolve();
  assert.equal(history.at(-1), latest, 'old-account enrichment must be ignored');
  readError = new Error('read failed');
  await exports.load();
  assert.equal(history.at(-1), latest, 'failed refresh retains already-rendered history');
  assert.equal(errors.at(-1), 'Could not refresh recent activity.');
  owner = '';
  authError = new Error('authentication transport unavailable');
  await exports.load();
  assert.equal(history.at(-1), latest, 'a failed auth request with no user must retain successful history');
  authError = null;
  await exports.load();
  assert.equal(history.at(-1)?.length, 0, 'signout clears private history');
  console.log('Home activity: legacy/current schemas, scoped bounded reads, strict errors, additions/removals before artwork, stale-account guards and retained history passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
