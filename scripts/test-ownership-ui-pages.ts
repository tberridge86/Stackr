import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

async function main() {

const ownedSource = readFileSync('lib/ownership.ts', 'utf8');
const owner = 'fixture-owner';
const rows = Array.from({ length: 137 }, (_, index) => ({
  id: 'row-' + String(index).padStart(6, '0'), user_id: owner, card_id: 'card-' + index,
  set_id: 'fixture-set', variant: 'normal', quantity: 1,
}));

function ownershipFixture(options: { cap?: number; legacy?: boolean; response?: (from: number, selected: any[]) => any } = {}) {
  const reads: { from: number; to: number; columns: string }[] = [];
  let current = true;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: (table: string) => {
      assert.equal(table, 'user_card_variants');
      let from = 0, to = 0, columns = '', account = '';
      const query: any = {
        select: (value: string) => { columns = value; return query; },
        eq: (column: string, value: string) => { assert.equal(column, 'user_id'); account = value; return query; },
        in: () => query,
        order: (column: string, options: any) => { assert.equal(column, 'id'); assert.equal(options.ascending, true); return query; },
        range: (start: number, end: number) => { from = start; to = end; assert.ok(end - start + 1 <= 50); return query; },
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          assert.equal(account, owner);
          reads.push({ from, to, columns });
          if (options.legacy && columns.includes('condition')) return { data: null, error: { code: '42703', message: 'column condition missing' } };
          const selected = rows.slice(from, from + Math.min(to - from + 1, options.cap ?? 50));
          return options.response?.(from, selected) ?? { data: selected, error: null };
        }).then(resolve, reject),
      };
      return query;
    },
  };
  const exports: any = {};
  const dependencies: Record<string, any> = {
    './supabase': { supabase },
    './collectionSummaryInvalidation': { bumpCollectionSummaryVersion() {} },
  };
  runInNewContext(ts.transpileModule(ownedSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; }, console });
  return { reads, cancel: () => { current = false; }, read: () => exports.fetchOwnedCardRows({ isCurrent: () => current }) };
}

for (const legacy of [false, true]) {
  const f = ownershipFixture({ cap: 17, legacy });
  const result = await f.read();
  assert.equal(result.length, 137);
  assert.equal(new Set(result.map((row: any) => row.id)).size, 137);
  assert.equal(result.reduce((sum: number, row: any) => sum + row.quantity, 0), 137);
  const validReads = f.reads.filter((read) => !legacy || !read.columns.includes('condition'));
  assert.equal(validReads.length, 10, 'lower server caps continue through a definitive empty page');
  assert.deepEqual(validReads.map((read) => read.from), [0, 17, 34, 51, 68, 85, 102, 119, 136, 137]);
}
const laterFailure = ownershipFixture({ response: (from) => from ? { data: null, error: new Error('second page failed') } : undefined });
await assert.rejects(laterFailure.read(), /second page failed/);
assert.equal(laterFailure.reads.length, 2);
for (const invalid of [null, [null], [false], [17], [[]], rows.slice(0, 51), [{ ...rows[0], user_id: 'another-owner' }], [{ ...rows[0], id: null }]]) {
  const f = ownershipFixture({ response: () => ({ data: invalid, error: null }) });
  await assert.rejects(f.read(), /pagination/);
  assert.equal(f.reads.length, 1);
}
const repeated = ownershipFixture({ cap: 17, response: (from) => from ? { data: rows.slice(0, 17), error: null } : undefined });
await assert.rejects(repeated.read(), /pagination/);
assert.equal(repeated.reads.length, 2);
let cancelled: ReturnType<typeof ownershipFixture>;
cancelled = ownershipFixture({ response: (_from, selected) => { cancelled.cancel(); return { data: selected, error: null }; } });
await assert.rejects(cancelled.read(), /cancelled/);
assert.equal(cancelled.reads.length, 1, 'account invalidation stops later pages');
const alreadyCancelled = ownershipFixture(); alreadyCancelled.cancel();
await assert.rejects(alreadyCancelled.read(), /cancelled/);
assert.equal(alreadyCancelled.reads.length, 0);

// Execute the real screen helpers without loading React Native or mounting the UI.
const tradeSource = readFileSync('app/offer/new.tsx', 'utf8');
const ast = ts.createSourceFile('trade.tsx', tradeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast));
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'TRADE_SELECTOR_PAGE_SIZE')) declarations.set('pageSize', node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const selected = ['pageSize', 'fetchPagedRows', 'fetchBinderOwnedTradeSources', 'fetchMyTradeCards'].map((name) => {
  assert.ok(declarations.has(name), 'Missing actual trade helper ' + name); return declarations.get(name);
}).join('\n');
function tradeRuntime(dependencies: Record<string, any> = {}) {
  const exports: any = {};
  const source = selected + '\nexports.readPages = fetchPagedRows; exports.readOwned = fetchMyTradeCards;';
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, console: { log() {} }, isCurrentIdentity: () => true, ...dependencies });
  return exports;
}
function tradePages(options: { repeat?: boolean; failAfterFirst?: boolean; afterResponse?: () => void } = {}) {
  const requests: [number, number][] = [];
  const build = () => {
    let from = 0, to = 0;
    const query: any = {
      order: (column: string, order: any) => { assert.equal(column, 'id'); assert.equal(order.ascending, true); return query; },
      range: (start: number, end: number) => { from = start; to = end; assert.ok(end - start + 1 <= 50); return query; },
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        requests.push([from, to]);
        options.afterResponse?.();
        return options.failAfterFirst && from
          ? { data: null, error: new Error('trade later page failed') }
          : { data: rows.slice(options.repeat ? 0 : from, (options.repeat ? 0 : from) + 13), error: null };
      }).then(resolve, reject),
    };
    return query;
  };
  return { requests, build };
}
const trade = tradeRuntime();
const completeTrade = tradePages();
assert.equal((await trade.readPages(completeTrade.build, () => {})).length, 137);
assert.equal(completeTrade.requests.length, 12);
const failedTrade = tradePages({ failAfterFirst: true });
await assert.rejects(trade.readPages(failedTrade.build, () => {}), /trade later page failed/);
const repeatedTrade = tradePages({ repeat: true });
await assert.rejects(trade.readPages(repeatedTrade.build, () => {}), /repeated an identity/);
assert.equal(repeatedTrade.requests.length, 2);
let current = true;
const cancelledTrade = tradePages({ afterResponse: () => { current = false; } });
await assert.rejects(trade.readPages(cancelledTrade.build, () => { if (!current) throw new Error('account changed'); }), /account changed/);
assert.equal(cancelledTrade.requests.length, 1);

// Required source failures must not turn into apparently empty trade inventory.
const failedCanonical = tradeRuntime({ fetchOwnedCardRows: async () => { throw new Error('canonical unavailable'); } });
await assert.rejects(failedCanonical.readOwned(owner, 1), /canonical unavailable/);
const failedBinder = tradeRuntime({
  fetchOwnedCardRows: async () => [],
  supabase: { from: () => { throw new Error('binder unavailable'); } },
});
await assert.rejects(failedBinder.readOwned(owner, 1), /binder unavailable/);

console.log('Owned ledger and trade selector preserve complete identities with <=50-row responses, lower caps, schema fallback, failure and account cancellation.');

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
