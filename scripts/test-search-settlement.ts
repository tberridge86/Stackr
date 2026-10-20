import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function extract(name: string) {
  const file = 'app/(tabs)/search.tsx';
  const source = readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(expression, `${name} must keep a bounded final settlement path in the mounted Search screen.`);
  const output = ts.transpileModule(`${expression}\nexports.tested = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function('exports', 'setTimeout', 'clearTimeout', output)(exports, setTimeout, clearTimeout);
  return exports.tested as <T>(promise: Promise<T>, timeoutMs?: number) => Promise<PromiseSettledResult<T>>;
}

async function run() {
  const settleSearchSource = extract('settleSearchSource');
  const screen = readFileSync('app/(tabs)/search.tsx', 'utf8');
  assert.match(screen, /settleSearchSource\(cardsPromise\)/,
    'The mounted Search coordinator must use the bounded final settlement helper.');
  assert.match(screen, /\[trimmed, category, selectedLanguage, searchIdentityEpoch\]/,
    'A replacement account identity must remain part of the request scope that current-result guards protect.');
  assert.deepEqual(await settleSearchSource(Promise.resolve('card'), 20), { status: 'fulfilled', value: 'card' });
  await assert.rejects(async () => {
    const settled = await settleSearchSource(new Promise<never>(() => {}), 1);
    assert.equal(settled.status, 'rejected');
    if (settled.status === 'rejected') throw settled.reason;
  }, /Search source timed out/);
  await assert.rejects(async () => {
    const settled = await settleSearchSource(Promise.reject(new Error('offline')), 20);
    assert.equal(settled.status, 'rejected');
    if (settled.status === 'rejected') throw settled.reason;
  }, /offline/);
  console.log('Search final settlement bounds unresolved sources without converting them to empty results.');
}

void run();
