import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const optionalExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/optionalCatalogueEnrichment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: optionalExports, AbortController, setTimeout, clearTimeout });

const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function extract(file, name, scope) {
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(tree).replace(/^export /, '');
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && ts.isCallExpression(node.initializer)) expression = node.initializer.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert(expression, name);
  const compiled = ts.transpileModule(`const tested = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${compiled}; return tested;`)(...Object.values(scope));
}

// Execute the actual adapter's control flow with a stalled image manifest.
const manifest = deferred(); let early, calls = 0, settled = false;
const client = { search: async () => ({ data: { results: [{ type: 'card', card: { cardId: 'ja-printing', language: 'ja' } }] } }) };
const search = extract('lib/stackrDomainAdapter.ts', 'searchStackrCards', {
  ...optionalExports,
  stackrApiClient: client, shouldUseStackrApi: () => true, toStackrApiLanguage: x => x,
  UUID_PATTERN: /^[0-9a-f-]{36}$/,
  stackrCardToLegacyCard: (card, assets = []) => ({ ...card, assets }),
  primaryCardImageAsset: () => null, embeddedCardImageAssets: () => [],
  fetchStackrAssetsForPrinting: () => { calls++; return manifest.promise; },
});
const pending = search('SV2a 157', { language: 'ja', onCanonicalResults: rows => { early = rows; } }).then(rows => { settled = true; return rows; });
await tick(); assert.equal(early[0].cardId, 'ja-printing'); assert.equal(early[0].language, 'ja');
assert.equal(calls, 1); assert.equal(settled, false, 'canonical rows arrive while artwork is pending');
manifest.reject(new Error('optional image service offline'));
assert.equal((await pending)[0].cardId, 'ja-printing', 'artwork failure cannot erase matched cards');

let activeManifests = 0;
const stalledClient = { search: async () => ({ data: { results: Array.from({ length: 20 }, (_, i) => ({ type: 'card', card: { cardId: `card-${i}` } })) } }) };
const stalledSearch = extract('lib/stackrDomainAdapter.ts', 'searchStackrCards', {
  ...optionalExports, stackrApiClient: stalledClient, shouldUseStackrApi: () => true, toStackrApiLanguage: x => x,
  UUID_PATTERN: /^[0-9a-f-]{36}$/, stackrCardToLegacyCard: card => card,
  primaryCardImageAsset: () => null, embeddedCardImageAssets: () => [],
  fetchStackrAssetsForPrinting: () => { activeManifests++; return new Promise(() => {}); },
});
const boundedStarted = Date.now();
assert.equal((await stalledSearch('Mew')).length, 20, 'stalled optional artwork cannot erase or indefinitely hold card search matches');
assert.ok(Date.now() - boundedStarted < 3_000, 'optional images respect the shared two-second deadline');
assert.equal(activeManifests, 4, 'missing images are fetched in bounded batches, not twenty simultaneous requests');

const energyRequests = [];
client.search = async input => { energyRequests.push(input); return { data: { results: [] } }; };
const energySetId = '11111111-1111-4111-8111-111111111111';
await search('R', { setId: energySetId, language: 'en' });
assert.deepEqual(energyRequests, [{ q: 'R', language: 'en', setId: energySetId, limit: 40 }]);
await search('R');
await search('R', { setId: 'not-a-canonical-set' });
await search('%', { setId: energySetId });
assert.equal(energyRequests.length, 1, 'Only an exact selected set can enable a one-character collector search');

// Execute the real search-row mapper; early and enriched rows keep the same identity.
const images = deferred(); let firstRows;
const card = { id: 'ja-printing', language: 'ja', name: 'Card', number: '157', images: {}, set: { id: 'sv2a', name: 'Set' }, raw_data: { stackr: { variants: ['finish'] } } };
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/cardSearch.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, require: name => ({
    './optionalCatalogueEnrichment': optionalExports,
    './cardSearchIntent': { parseCardSearchIntent: q => ({ catalogueQuery: q }) },
    './stackrDomainAdapter': { searchStackrCards: async (_q, options) => { options.onCanonicalResults?.([card]); return [card]; } },
    './pokemonTcg': { attachLiveTcgdexCardReferences: () => images.promise, normalizePokemonCardLanguage: x => x },
  }[name] ?? {}),
});
const enriched = exports.searchLocalPokemonCards('Card', { language: 'ja', onCanonicalResults: rows => { firstRows = rows; } });
await tick(); assert.equal(firstRows[0].id, card.id); assert.equal(firstRows[0].image_small, null);
images.resolve([{ ...card, images: { small: 'https://example.test/approved.webp' } }]);
const finalRows = await enriched;
assert.equal(finalRows[0].id, firstRows[0].id); assert.equal(finalRows[0].raw_data, firstRows[0].raw_data);
assert.equal(finalRows[0].image_small, 'https://example.test/approved.webp');

// Execute the mounted tab callback, including the first and final render phases.
const EMPTY_RESULTS = { cards: [], sets: [], sealed: [], collectors: [], listings: [], graded: [] };
const requestRef = { current: 0 }, previousSearchRef = { current: null };
let state = EMPTY_RESULTS;
const requests = new Map();
const query = { select() { return this; }, ilike() { return this; }, eq() { return this; }, or() { return this; }, limit: async () => ({ data: [] }) };
const noop = () => {};
const run = extract('app/(tabs)/search.tsx', 'runSearch', {
  requestRef, previousSearchRef, category: 'all', selectedLanguage: 'ja', searchIdentityEpoch: 0,
  EMPTY_RESULTS, SEARCH_FIRST_PAINT_BUDGET_MS: 1,
  setResults: value => { state = typeof value === 'function' ? value(state) : value; },
  setLoading: noop, setRefreshing: noop, setErrors: noop, setSuggestion: noop, setSetSuggestion: noop, setSearchError: noop,
  expandSearchQuery: q => [q], normaliseSearchText: q => q,
  getCatalogueProductTypeFilter: () => null, getListingProductTypeFilter: () => null,
  productTypeMatchesIntent: () => false, isRawCardCategory: () => true, isListingProductCategory: () => false, isGradedCategory: () => false,
  correctPokemonNameQuery: async () => null, searchSetsQuick: async () => [], searchMarketProducts: async () => [],
  searchLocalPokemonCards: (q, options) => { const d = deferred(); requests.set(q, { ...d, options }); return d.promise; },
  supabase: { from: () => query },
  settleWithin: async () => ({ status: 'pending' }),
  isFulfilled: result => result.status === 'fulfilled', isRejected: result => result.status === 'rejected',
  mapCardResults: rows => rows, mapListingResult: row => row, sanitizeGate0CommerceCopy: x => x,
  retainFailedSearchGroups: (next, errors, previous) => Object.fromEntries(Object.entries(next).map(([key, value]) => [key, errors[key] && previous ? previous[key] : value])),
  fetchCardListingStats: async () => new Map(), fetchOwnedCardRows: async () => [], fetchProductListingStats: async () => new Map(),
  console: { log: noop },
});
const old = run('Alpha');
requests.get('Alpha').options.onCanonicalResults([{ id: 'Alpha' }]);
assert.equal(state.cards[0].id, 'Alpha');
await tick(); assert.equal(state.cards[0].id, 'Alpha', 'first-phase pending render keeps early rows');
const current = run('Bravo');
requests.get('Bravo').options.onCanonicalResults([{ id: 'Bravo' }]);
requests.get('Alpha').options.onCanonicalResults([{ id: 'stale' }]);
assert.equal(state.cards[0].id, 'Bravo', 'late callbacks from previous query are ignored');
requests.get('Alpha').resolve([{ id: 'Alpha' }]); await old;
assert.equal(state.cards[0].id, 'Bravo');
requests.get('Bravo').reject(new Error('optional enrichment failed')); await current;
assert.equal(state.cards[0].id, 'Bravo', 'final failure retains current canonical matches');
console.log('Progressive search passed: rows before artwork, optional failure, identity preservation, first/final renders and stale-query rejection.');
