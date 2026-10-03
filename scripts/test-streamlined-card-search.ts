import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(source: string, dependencies: Record<string, any>) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as any };
  const require = (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new vm.Script(`(function(require,module,exports){${output}\n})`).runInNewContext({})(require,module,module.exports);
  return module.exports;
}

const intentSource = fs.readFileSync('lib/cardSearchIntent.ts','utf8');
const intent = loadModule(intentSource, {});
const source = fs.readFileSync('lib/cardSearch.ts','utf8');

const calls: any[] = [];
let rows: any[] = [];
let searchError: Error | null = null;
let enrichCalls = 0;

const adapter = loadModule(source, {
  './cardSearchIntent': intent,
  './stackrDomainAdapter': {
    async searchStackrCards(query: string, options: any) {
      calls.push({ query, language: options.language, limit: options.limit });
      if (searchError) throw searchError;
      options.onCanonicalResults?.(rows);
      return rows;
    },
  },
  './optionalCatalogueEnrichment': {
    async readOptionalCatalogueEnrichment(read: () => Promise<any>) { return read(); },
  },
  './pokemonTcg': {
    async attachLiveTcgdexCardReferences(cards: any[]) {
      enrichCalls += 1;
      return cards.map((card) => card.images.small || card.images.large
        ? card
        : { ...card, images: { ...card.images, small: 'https://example.invalid/reference.webp' } });
    },
  },
});

const { searchLocalPokemonCards } = adapter;
assert.deepEqual(Object.keys(adapter), ['searchLocalPokemonCards']);

const card = (overrides: Record<string, any> = {}) => ({
  id: 'printing-1',
  name: 'Pikachu',
  language: 'ja',
  region: 'JP',
  number: '001',
  rarity: 'Rare',
  images: { small: 'https://example.invalid/small.webp', large: 'https://example.invalid/large.webp' },
  set: { id: 'set-1', name: 'Set One' },
  externalIds: { tcgdex: 'set-1-001' },
  raw_data: { stackr: { canonical: true } },
  ...overrides,
});

async function main() {
for (const query of ['', ' ', 'x', 'PSA 10']) {
    calls.length = 0;
    assert.deepEqual(await searchLocalPokemonCards(query), []);
    assert.equal(calls.length, 0, `${query || '<empty>'} must not create a catalogue request`);
}

  rows = [card()];
  calls.length = 0;
  enrichCalls = 0;
  let canonical: any[] = [];
  const result = await searchLocalPokemonCards('  Pikachu  ', {
    language: 'ja',
    limit: 24,
    onCanonicalResults: (value: any[]) => { canonical = value; },
  });
  assert.deepEqual(calls[0], { query: 'Pikachu', language: 'ja', limit: 24 });
  assert.equal(canonical.length, 1, 'canonical Stackr rows must be usable before optional presentation enrichment');
  assert.equal(result[0].id, 'printing-1');
  assert.equal(result[0].set_id, 'set-1');
  assert.equal(enrichCalls, 0, 'complete canonical artwork must not trigger direct presentation enrichment');

  rows = [card({ images: { small: null, large: null } })];
  canonical = [];
  enrichCalls = 0;
  const enriched = await searchLocalPokemonCards('Pikachu', {
    language: 'all',
    onCanonicalResults: (value: any[]) => { canonical = value; },
  });
  assert.equal(calls.at(-1).language, null, 'All language search stays canonical rather than selecting a locale');
  assert.equal(canonical[0].image_small, null, 'first paint reflects canonical evidence honestly');
  assert.equal(enriched[0].image_small, 'https://example.invalid/reference.webp');
  assert.equal(enrichCalls, 1, 'controlled display-only enrichment runs only for a genuine image gap');

  searchError = new Error('canonical unavailable');
  await assert.rejects(searchLocalPokemonCards('Pikachu'), (error) => error === searchError);
  searchError = null;

  const fileText = source;
  assert.doesNotMatch(fileText, /supabase\.from|fetchCatalogueSearchRows|fetchJapaneseCatalogueRowsByDexIds|getLocalCardIndex|findMatchingSetIds/,
    'the search boundary must not retain dead competing database/index implementations');
  assert.match(fileText, /searchStackrCards\(catalogueQuery/);

    console.log('Streamlined card search boundary passed: one canonical matching route, optional display-only enrichment, no legacy direct-table search.');
}

void main();
