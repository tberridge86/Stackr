import { catalogueVariantLabel } from '../lib/catalogueVariantPresentation';
import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { SearchPagination, mergeSearchRows, searchCardLookupIds, searchOwnedQuantities } from '../lib/searchPagination';

function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
type Row = { id: string; language?: string; finish?: string };
type Page = { rows: Row[]; metadata: { nextCursor: string | null; continuationAvailable: boolean } };
const page = (rows: Row[], nextCursor: string | null): Page => ({ rows, metadata: { nextCursor, continuationAvailable: true } });
async function main() {
const pager = new SearchPagination();
let rows: Row[] = [];
const lease = pager.reset();
pager.acceptInitial(lease.generation, { nextCursor: 'page-2', continuationAvailable: true });
rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), language: i % 2 ? 'ja' : 'en' }));
await pager.load<Row>(async () => page(Array.from({ length: 50 }, (_, i) => ({ id: String(i + 50) })), 'page-3'),
  incoming => { rows = mergeSearchRows(rows, incoming); });
await pager.load<Row>(async () => page(Array.from({ length: 37 }, (_, i) => ({ id: String(i + 100) })), null),
  incoming => { rows = mergeSearchRows(rows, incoming); });
assert.equal(rows.length, 137);
assert.equal(pager.state.nextCursor, null);
let calls = 0;
await pager.load<Row>(async () => { calls++; return page([], null); }, () => {});
assert.equal(calls, 0, 'complete result does not fetch again');
assert.equal(mergeSearchRows([{ id: 'ja-normal', finish: 'normal' }, { id: 'ja-reverse', finish: 'reverse' }],
  [{ id: 'ja-normal', finish: 'normal' }, { id: 'en-normal', finish: 'normal' }]).length, 3);

for (const boundary of ['query', 'language', 'refresh', 'logout', 'A-B-A', 'blur']) {
  const first = pager.reset(); pager.acceptInitial(first.generation, { nextCursor: 'held', continuationAvailable: true });
  const held = deferred<Page>(); let captured: AbortSignal | undefined; let writes = 0;
  const pending = pager.load<Row>((_cursor, signal) => { captured = signal; return held.promise; }, () => { writes++; });
  const next = pager.reset();
  if (boundary === 'A-B-A') pager.reset();
  assert.equal(captured?.aborted, true, boundary);
  held.resolve(page([{ id: 'private-old-overlay' }], 'late')); await pending;
  pager.acceptInitial(first.generation, { nextCursor: 'stale-initial', continuationAvailable: true });
  assert.equal(writes, 0, boundary); assert.equal(pager.state.nextCursor, null, boundary);
  assert.notEqual(next.generation, first.generation);
}

let current = pager.reset(); pager.acceptInitial(current.generation, { nextCursor: 'retry', continuationAvailable: true });
let appended: Row[] = [{ id: 'kept' }];
await pager.load<Row>(async () => { throw new Error('offline'); }, incoming => { appended.push(...incoming); });
assert.equal(pager.state.error, 'retry'); assert.equal(pager.state.nextCursor, 'retry');
assert.deepEqual(appended, [{ id: 'kept' }]);
await pager.load<Row>(async cursor => { assert.equal(cursor, 'retry'); return page([{ id: 'recovered' }], null); }, incoming => { appended.push(...incoming); });
assert.equal(pager.state.error, null); assert.equal(appended.length, 2);

current = pager.reset(); pager.acceptInitial(current.generation, { nextCursor: 'one', continuationAvailable: true });
const held = deferred<Page>(); calls = 0;
const once = pager.load<Row>(async () => { calls++; return held.promise; }, () => {});
await pager.load<Row>(async () => { calls++; return page([], null); }, () => {});
assert.equal(calls, 1, 'duplicate taps do not duplicate requests');
held.resolve(page([], 'two')); await once;
assert.equal(pager.state.nextCursor, 'two', 'a set-only page must not terminate card continuation');
await pager.load<Row>(async () => page([], 'two'), () => { throw new Error('must not append cyclic page'); });
assert.equal(pager.state.error, 'retry', 'no cursor loop');

for (const code of ['search_catalogue_changed', 'invalid_search_cursor']) {
  current = pager.reset(); pager.acceptInitial(current.generation, { nextCursor: 'old', continuationAvailable: true });
  await pager.load<Row>(async () => { throw Object.assign(new Error(code), { code }); }, () => assert.fail('mixed revision'));
  assert.equal(pager.state.error, 'changed');
  await pager.load<Row>(async () => assert.fail('changed catalogue cannot retry old cursor'), () => {});
}
current = pager.reset(); pager.acceptInitial(current.generation);
assert.equal(pager.state.continuationAvailable, false, 'legacy null cursor is not proof of completeness');
console.log('Search pagination: 137 complete rows, exact identities, abort/late response boundaries, retries, deduplication, empty pages, cursor loops and catalogue revision checks passed.');

const variants = [{ variantId: 'v-normal', variantCode: 'normal' }, { variantId: 'v-reverse', variantCode: 'reverse_holo' }];
const identityCards = variants.map(variant => ({ id: variant.variantId, set_id: 'ja-set',
  raw_data: { stackr: { canonical: true, cardId: 'printing', defaultVariantId: variant.variantId, variants: [variant] } } }));
assert.deepEqual(searchCardLookupIds(identityCards), ['v-normal', 'printing', 'v-reverse']);
const quantities = searchOwnedQuantities(identityCards, [
  { card_id: 'printing', set_id: 'ja-set', variant: 'normal', quantity: 2 },
  { card_id: 'printing', set_id: 'ja-set', variant: 'reverseHolofoil', quantity: 3 },
  { card_id: 'printing', set_id: 'en-set', variant: 'normal', quantity: 99 },
  { card_id: 'printing', set_id: 'ja-set', variant: 'unverified', quantity: 88 },
]);
assert.equal(quantities.get('v-normal'), 2);
assert.equal(quantities.get('v-reverse'), 3);
assert.equal(searchOwnedQuantities(identityCards, [{ card_id: 'printing', set_id: 'ja-set', variant: 'reverse_holo', quantity: 7 }]).get('v-reverse'), 7, 'canonical finish codes retain ownership');

const source = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
const ast = ts.createSourceFile('search.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
let debounceBody = '';
let runEffectDependencies = '';
let finishLabelExpression = '';
function visit(node: ts.Node) {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'variantLabel' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) finishLabelExpression = node.initializer.expression.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const body = node.arguments[0]?.getText(ast) ?? '';
    if (body.includes('setSearchInputEpoch')) debounceBody = body;
    if (body.includes('void runSearch(debouncedQuery)')) runEffectDependencies = node.arguments[1]?.getText(ast) ?? '';
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(debounceBody);
assert.ok(finishLabelExpression);
const finishLabel = new Function('card', 'catalogueVariantLabel', ts.transpileModule('const result = ' + finishLabelExpression, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '; return result;');
assert.equal(finishLabel({ id: 'v-normal', raw: identityCards[0] }, catalogueVariantLabel), 'Normal');
assert.equal(finishLabel({ id: 'v-reverse', raw: identityCards[1] }, catalogueVariantLabel), 'Reverse Holo');
assert.match(runEffectDependencies, /searchInputEpoch/);
let debounced = 'Pikachu', epoch = 0, requestId = 0;
let timer: (() => void) | undefined;
let cleanup: (() => void) | undefined;
const effect = (query: string) => {
  cleanup?.();
  const compiled = ts.transpileModule('const tested = ' + debounceBody, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  cleanup = new Function('query','requestRef','paginationRef','setTimeout','clearTimeout','setDebouncedQuery','setSearchInputEpoch',
    compiled + '; return tested();')(
      query, { get current() { return requestId; }, set current(value) { requestId = value; } }, { current: pager },
      (callback: () => void) => { timer = callback; return 1; }, () => { timer = undefined; },
      (value: string) => { debounced = value; }, (update: (value: number) => number) => { epoch = update(epoch); });
};
current = pager.reset(); pager.acceptInitial(current.generation, { nextCursor: 'old-A', continuationAvailable: true });
effect('PikachuB'); effect('Pikachu'); timer?.();
assert.equal(debounced, 'Pikachu'); assert.equal(epoch, 1, 'same normalized query still advances the effect dependency');
assert.equal(pager.state.ready, false);
const refreshed = pager.reset(); pager.acceptInitial(refreshed.generation, { nextCursor: 'new-A', continuationAvailable: true });
pager.acceptInitial(current.generation, { nextCursor: 'old-A', continuationAvailable: true });
assert.equal(pager.state.nextCursor, 'new-A');
effect('Pikachu '); timer?.();
assert.equal(debounced, 'Pikachu'); assert.equal(epoch, 2, 'whitespace round trip also restarts its invalidated lease');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
