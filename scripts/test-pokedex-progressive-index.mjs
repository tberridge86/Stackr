import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const indexSource = fs.readFileSync('lib/stackrApiV1.ts', 'utf8');
const indexAst = ts.createSourceFile('client.ts', indexSource, ts.ScriptTarget.Latest, true);
let indexMethod;
let wirePageSize;
function findIndex(node) {
  if (ts.isClassDeclaration(node) && node.name?.text === 'StackrApiClient') {
    indexMethod = node.members.find(member => member.name?.getText(indexAst) === 'pokemonIndex')?.getText(indexAst);
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(indexAst) === 'STACKR_UI_PAGE_SIZE') {
    wirePageSize = Number(node.initializer.getText(indexAst));
  }
  ts.forEachChild(node, findIndex);
}
findIndex(indexAst);
assert.ok(indexMethod);
assert.equal(wirePageSize, 50, 'Use the real canonical transport cap in the regression');
const screenSource = fs.readFileSync('app/(tabs)/pokedex.tsx', 'utf8');
const screenAst = ts.createSourceFile('pokedex.tsx', screenSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['POKEDEX_LIST_LIMIT', 'POKEDEX_INITIAL_LIST_LIMIT', 'getPokedexListUrl', 'getPokemonIdFromUrl',
  'mapPokemonResults', 'mergePokemonResults', 'fetchPublishedPokedexPage', 'readPokemonPage',
  'fetchCompletePokedex', 'loadPokedexRemote']);
const helpers = [];
for (const statement of screenAst.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (names.has(declaration.name.getText(screenAst))) helpers.push('const ' + declaration.getText(screenAst) + ';');
    }
  } else if (ts.isFunctionDeclaration(statement) && names.has(statement.name?.text)) {
    helpers.push(statement.getText(screenAst).replace(/^export\s+/, ''));
  }
}
function compile(source, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText,
    { module, exports: module.exports, URLSearchParams, console, ...dependencies });
  return module.exports;
}
const { Client } = compile('exports.Client = class Client { ' + indexMethod + ' };', { STACKR_UI_PAGE_SIZE: wirePageSize });
function fixture(count = 1025, options = {}) {
  let active = true, inFlight = 0, maxInFlight = 0;
  const requests = [], partials = [], completes = [], writes = [];
  const client = new Client();
  client.request = (path, query) => {
    assert.equal(path, '/pokemon');
    assert.ok(query.limit <= wirePageSize && query.limit > 0);
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    const request = { ...query, done: false, resolve };
    requests.push(request);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    return promise.finally(() => { inFlight--; });
  };
  const fullModule = compile(helpers.join('\n') + '\nexports.load = loadPokedexRemote; exports.fetch = fetchPublishedPokedexPage;',
    { stackrApiClient: client });
  const result = fullModule.load(fullModule.fetch, {
    hasCachedPokemon: options.hasCachedPokemon ?? false, isActive: () => active,
    publishPartial: rows => partials.push(rows),
    publishComplete: rows => completes.push(rows),
    persistComplete: async rows => { writes.push(rows); await options.persist?.(rows); },
    setLoadingMore() {},
  }).then(value => ({ value }), error => ({ error }));
  function reply(request, change = value => value) {
    assert.equal(request.done, false); request.done = true;
    const results = Array.from({ length: Math.min(request.limit, Math.max(0, count - request.offset)) }, (_, i) => {
      const id = request.offset + i + 1;
      return { name: 'pokemon-' + id, url: '/pokemon/' + id, speciesId: id,
        speciesName: 'pokemon-' + id, routeId: id, routeName: 'pokemon-' + id };
    });
    request.resolve({ data: change({ count, indexVersion: 'published-v1', results }), meta: {} });
  }
  async function drain() {
    for (let turn = 0; turn < 60; turn++) {
      const pending = requests.filter(request => !request.done);
      if (pending.length) reply(pending.at(-1)); // Deliberately complete pages out of order.
      await tick();
      if (!requests.some(request => !request.done)) break;
    }
    return result;
  }
  return { requests, partials, completes, writes, reply, drain, result, deactivate() { active = false; },
    getMaxInFlight: () => maxInFlight };
}
const first = fixture();
await tick();
first.reply(first.requests[0]);
await tick();
assert.equal(first.partials[0]?.length, 50, 'The first visible rows follow one canonical HTTP page, not four serialized requests');
assert.equal(first.requests.filter(request => !request.done).length, 3, 'Only three continuation pages may run concurrently');
assert.equal(first.writes.length, 0, 'A partial page is never persisted as a complete Pokédex');
const completed = await first.drain();
assert.equal(completed.value, 'complete');
assert.equal(first.requests.length, 21);
assert.equal(first.getMaxInFlight(), 3);
assert.deepEqual(Array.from(first.completes[0], row => row.speciesId), Array.from({ length: 1025 }, (_, i) => i + 1));
assert.equal(first.writes.length, 1);
assert.equal(first.writes[0].length, 1025, 'Every species survives out-of-order page completion');

for (const bad of ['version', 'truncated', 'duplicate']) {
  const f = fixture();
  await tick(); f.reply(f.requests[0]); await tick();
  const target = f.requests.find(request => !request.done);
  f.reply(target, value => bad === 'version' ? { ...value, indexVersion: 'changed' }
    : bad === 'truncated' ? { ...value, results: value.results.slice(0, 2) }
      : { ...value, results: value.results.map((row, i) => i === 0
        ? { ...row, speciesId: 1, speciesName: 'pokemon-1' } : row) });
  await tick();
  for (const request of f.requests.filter(request => !request.done)) f.reply(request);
  const outcome = await f.drain();
  assert.ok(outcome.error, bad + ' pages must fail instead of becoming a complete cache');
  assert.equal(f.completes.length, 0);
  assert.equal(f.writes.length, 0);
}
const stale = fixture();
await tick(); stale.reply(stale.requests[0]); await tick();
stale.deactivate();
const started = stale.requests.length;
for (const request of stale.requests.filter(request => !request.done)) stale.reply(request);
assert.equal((await stale.drain()).value, 'stale');
assert.equal(stale.requests.length, started, 'Leaving the screen stops scheduling the rest of the catalogue');
assert.equal(stale.writes.length, 0);

const small = fixture(3);
await tick(); small.reply(small.requests[0]);
assert.equal((await small.drain()).value, 'complete');
assert.equal(small.requests.length, 1);
assert.equal(small.writes[0].length, 3);

for (const cache of ['pending', 'rejected']) {
  const f = fixture(3, { persist: () => cache === 'pending'
    ? new Promise(() => {}) : Promise.reject(new Error('Device cache unavailable')) });
  await tick(); f.reply(f.requests[0]);
  assert.equal((await f.drain()).value, 'complete', 'A ' + cache + ' device cache must not hold live results busy');
  assert.equal(f.completes[0].length, 3);
  assert.equal(f.writes.length, 1);
}
const warm = fixture(1025, { hasCachedPokemon: true });
await tick(); warm.reply(warm.requests[0]); await tick();
assert.equal(warm.partials.length, 0, 'A partial refresh must not replace the complete saved list');
assert.equal((await warm.drain()).value, 'complete');
assert.equal(warm.completes[0].length, 1025);
console.log('PASS actual Pokédex tab + canonical client: one-page first paint, bounded parallel reads, all 1025 species, stale/version/truncation/duplicate guards, complete-only caching and pending/rejected device cache');
