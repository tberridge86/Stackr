import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readUiCollectionChunks, readUiCollectionPages } from '../lib/uiCollectionPages';

type Row = { id: string; group: string };
const groups = Array.from({ length: 137 }, (_, index) => `group-${index}`);
const all = groups.flatMap((group) => Array.from({ length: 3 }, (_, index) => ({ id: `${group}-${index}`, group })));
const requests: { from: number; to: number; groups: string[] }[] = [];
let fail = false, duplicate = false, foreign = false, malformed = false;
let afterPage: (() => void) | undefined;
function query(ids: string[]) {
  let from = 0, to = 49;
  const q: any = {
    order: (name: string, options: any) => { assert.equal(name, 'id'); assert.equal(options.ascending, true); return q; },
    range: (start: number, end: number) => { from = start; to = end; assert.equal(end - start, 49); return q; },
    abortSignal: (signal: AbortSignal) => { assert.equal(signal.aborted, false); return q; },
    then: (resolve: (value: any) => unknown) => {
      assert.ok(ids.length <= 50); requests.push({ from, to, groups: [...ids] });
      const matching = all.filter((row) => ids.includes(row.group));
      let page: Row[] | null = matching.slice(from, from + 17);
      if (duplicate && from) page = [matching[0]];
      if (foreign) page = [{ id: 'foreign', group: 'not-requested' }];
      if (malformed) page = null;
      afterPage?.();
      return Promise.resolve({ data: page, error: fail && from ? new Error('later failed') : null }).then(resolve);
    },
  }; return q;
}
async function main() {
  const accepts = (row: Row, ids: string[]) => ids.includes(row.group);
  const rows = await readUiCollectionChunks<Row>(groups, query, accepts);
  assert.equal(rows.length, 411); assert.equal(new Set(rows.map(row => row.id)).size, 411);
  assert.equal(requests.filter(request => request.from === 0).length, 3, '137 filter IDs use three bounded chunks');
  requests.length = 0;
  await assert.rejects(readUiCollectionChunks(groups, query, accepts, { maxRows: 200 }), /row budget/);
  assert.equal(requests.filter(request => request.from === 0).length, 2, 'The 200-row ceiling is shared across 150-row chunks; the third chunk never starts');
  for (const maxRows of [0, -1, 1.5, Infinity, 256001]) {
    const countBefore = requests.length;
    await assert.rejects(readUiCollectionPages(() => query(groups.slice(0, 50)), () => true, { maxRows }), /row budget/);
    assert.equal(requests.length, countBefore, 'Invalid or enlarged budgets fail before scheduling HTTP work');
  }
  fail = true; await assert.rejects(readUiCollectionChunks(groups, query, accepts), /later failed/); fail = false;
  duplicate = true; await assert.rejects(readUiCollectionChunks(groups, query, accepts), /identities/); duplicate = false;
  foreign = true; await assert.rejects(readUiCollectionChunks(groups, query, accepts), /identities/); foreign = false;
  malformed = true; await assert.rejects(readUiCollectionChunks(groups, query, accepts), /incomplete/); malformed = false;
  let current = true; afterPage = () => { current = false; }; requests.length = 0;
  await assert.rejects(readUiCollectionChunks(groups, query, accepts, { assertCurrent: () => { if (!current) throw new Error('account changed'); } }), /account changed/);
  assert.equal(requests.length, 1);
  const controller = new AbortController(); afterPage = () => controller.abort(); requests.length = 0;
  await assert.rejects(readUiCollectionPages(() => query(groups.slice(0, 50)), () => true, { signal: controller.signal }), /cancelled/);
  assert.equal(requests.length, 1);
  afterPage = undefined;
  // Exercise the installed Supabase SDK with an intercepted fetch boundary,
  // proving the bounds exist in each HTTP request, not only in a query mock.
  const httpRows = Array.from({ length: 137 }, (_, index) => ({ id: `http-${index}`, group: 'http-group' }));
  const httpRequests: URL[] = [];
  const client = createClient('https://fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      httpRequests.push(url);
      assert.equal(url.searchParams.get('limit'), '50');
      assert.equal(url.searchParams.get('order'), 'id.asc');
      const offset = Number(url.searchParams.get('offset'));
      return new Response(JSON.stringify(httpRows.slice(offset, offset + 17)), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const actualRows = await readUiCollectionChunks<Row>(['http-group'],
    ids => client.from('fixture_rows').select('id,group').in('group', ids),
    (row, ids) => ids.includes(row.group));
  assert.equal(actualRows.length, 137);
  assert.equal(httpRequests.length, 10, 'Nine nonempty HTTP pages plus an empty final page prove complete retrieval');
  assert.equal(httpRequests.at(-1)!.searchParams.get('offset'), '137');
  console.log('UI collection pagination: all rows and filter chunks, lower server cap, later failure, identity rejection and account/cancellation boundaries passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
