import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createLatestRequestGate } from '../lib/latestRequestGate';

// Execute the mounted screen callbacks, replacing only network and React state.
function callback<T>(file: string, name: string, scope: Record<string, unknown>): T {
  const source = readFileSync(resolve(file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let expression: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
      && node.initializer && ts.isCallExpression(node.initializer) && ts.isArrowFunction(node.initializer.arguments[0])) {
      expression = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, `Missing mounted callback ${name}`);
  const js = ts.transpileModule(`(${expression.getText(tree)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(scope), `return ${js}`)(...Object.values(scope)) as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function prices() {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  const commits: unknown[] = [];
  let calls = 0;
  const gate = createLatestRequestGate();
  const load = callback<(cards: { id: string }[]) => Promise<void>>('app/prices/index.tsx', 'loadLiveEbayForSearchResults', {
    livePriceRequestRef: { current: gate },
    fetchLiveEbayForCard: () => ++calls === 1 ? first.promise : second.promise,
    setSearchEbayMap: (value: unknown) => commits.push(value), console,
  });
  const old = load([{ id: 'card' }]);
  const current = load([{ id: 'card' }]);
  second.resolve({ condition: 'Near Mint', average: 12 }); await current;
  first.resolve({ condition: 'Played', average: 4 }); await old;
  assert.deepEqual(commits.at(-1), { card: { condition: 'Near Mint', average: 12 } });
  assert.equal(commits.some(value => JSON.stringify(value).includes('Played')), false);
  await load([]);
  assert.deepEqual(commits.at(-1), {});
}

async function builder() {
  const first = deferred<unknown[]>();
  const second = deferred<unknown[]>();
  const commits: unknown[] = [];
  const loading: boolean[] = [];
  const alerts: unknown[] = [];
  const productTypes: string[] = [];
  const gate = createLatestRequestGate();
  const run = callback<(text: string, type?: string) => Promise<void>>('app/price-builder/index.tsx', 'runSearch', {
    lookupType: 'raw_card', searchRequestRef: { current: gate },
    searchLocalPokemonCards: (text: string) => text === 'Alpha' ? first.promise : second.promise,
    searchMarketProducts: async (_: string, type: string) => { productTypes.push(type); return []; },
    refreshMarketProductPrice: async () => null, productToBuilderRow: (value: unknown) => value,
    setResults: (value: unknown) => commits.push(value), setSearching: (value: boolean) => loading.push(value),
    Alert: { alert: (...args: unknown[]) => alerts.push(args) }, console,
  });
  const old = run('Alpha'); const current = run('Bravo');
  second.resolve([{ id: 'Bravo' }]); await current;
  first.resolve([{ id: 'Alpha' }]); await old;
  assert.deepEqual(commits.at(-1), [{ id: 'Bravo' }]);
  assert.equal(commits.some(value => JSON.stringify(value).includes('Alpha')), false);
  assert.equal(loading.at(-1), false);
  await run('');
  assert.deepEqual(commits.at(-1), []);
  await run('Booster', 'sealed_product');
  assert.deepEqual(productTypes, ['sealed_product'], 'A mode change must use the chosen type immediately.');
  assert.equal(alerts.length, 0);
}

void Promise.all([prices(), builder()]).then(() => console.log('Mounted price callbacks preserve newest query and condition results.'));
