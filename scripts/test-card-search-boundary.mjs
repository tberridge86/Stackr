import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/cardSearch.ts', import.meta.url), 'utf8');
const intentSource = readFileSync(new URL('../lib/cardSearchIntent.ts', import.meta.url), 'utf8');

// Execute the checked-in modules with explicit dependency doubles. This checks
// adapter behavior, not backend coverage, native imports or physical timings.
function loadModule(text, dependencies = {}) {
  const output = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal((output.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  const require = (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected search dependency: ${name}`);
    return dependencies[name];
  };
  const wrapper = new vm.Script(`(function(require, module, exports) { ${output.outputText}\n})`);
  wrapper.runInNewContext({})(require, module, module.exports);
  return module.exports;
}

const intent = loadModule(intentSource);
const calls = [];
let rows = [];
let searchFailure = null;
let enrichmentFailure = null;
const adapter = loadModule(source, {
  './stackrDomainAdapter': {
    async searchStackrCards(query, options) {
      calls.push({ type: 'search', query, options: { ...options } });
      if (searchFailure) throw searchFailure;
      return rows;
    },
  },
  './cardSearchIntent': intent,
  './pokemonTcg': {
    async attachLiveTcgdexCardReferences(cards) {
      calls.push({ type: 'enrich', cards });
      if (enrichmentFailure) throw enrichmentFailure;
      return cards;
    },
  },
});
const { searchLocalPokemonCards } = adapter;
assert.deepEqual(Object.keys(adapter), ['searchLocalPokemonCards']);
const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;

// Empty, short and grading-only searches must not reach either dependency.
for (const input of ['', ' ', 'x', 'PSA 10']) {
  calls.length = 0;
  assert.deepEqual(plain(await searchLocalPokemonCards(input)), []);
  assert.equal(calls.length, 0);
  checks++;
}

const raw = { finish_code: 'reverse_holo', provider_timestamp: '2026-09-19T22:00:00Z' };
const aliases = { tcgdex: 'sv03-001' };
rows = [{
  id: '40000000-0000-4000-8000-000000000001', name: 'Bulbasaur',
  language: 'en', region: 'international', number: '001', rarity: null,
  images: { small: null, large: 'https://example.invalid/canonical-card.webp' },
  set: { id: 'canonical-set-id', name: 'Canonical set' },
  externalIds: aliases, raw_data: raw,
}];
calls.length = 0;
const mapped = await searchLocalPokemonCards('  Bulbasaur  ', { language: 'en', limit: 12 });
assert.deepEqual(calls[0], { type: 'search', query: 'Bulbasaur', options: { language: 'en', limit: 12 } });
assert.equal(calls.length, 2);
assert.equal(calls[1].cards, rows);
assert.deepEqual(plain(mapped[0]), {
  id: rows[0].id, name: 'Bulbasaur', language: 'en', region: 'international',
  number: '001', rarity: null, image_small: null,
  image_large: 'https://example.invalid/canonical-card.webp',
  set_id: 'canonical-set-id', set_name: 'Canonical set', external_ids: aliases, raw_data: raw,
});
assert.equal(mapped[0].raw_data, raw);
assert.equal(mapped[0].external_ids, aliases);
checks++;

for (const [query, language, expected] of [
  ['ピカチュウ', 'ja', 'ピカチュウ'],
  ['皮卡丘', 'zh-cn', '皮卡丘'],
  ['皮卡丘', 'zh-tw', '皮卡丘'],
  ['피카츄', 'ko', '피카츄'],
  ['PSA 10 Charizard', 'en', 'Charizard'],
  ['ＰＳＡ １０ リザードン', 'ja', 'リザードン'],
  ['Charizard 4/102', 'en', 'Charizard 4/102'],
  ['151', 'en', '151'],
]) {
  calls.length = 0;
  await searchLocalPokemonCards(query, { language });
  assert.deepEqual(calls[0], { type: 'search', query: expected, options: { language, limit: 80 } });
  assert.equal(calls.length, 2);
  checks++;
}
for (const language of ['all', ' ALL ', null, undefined]) {
  calls.length = 0;
  await searchLocalPokemonCards('Pikachu', { language });
  assert.equal(calls[0].options.language, typeof language === 'string' ? null : language);
  checks++;
}

rows = [];
calls.length = 0;
assert.deepEqual(plain(await searchLocalPokemonCards('Pikachu')), []);
assert.equal(calls.length, 2);
assert.equal(calls[0].options.limit, 80);
checks++;

searchFailure = new Error('canonical search unavailable');
calls.length = 0;
await assert.rejects(searchLocalPokemonCards('Pikachu'), (error) => error === searchFailure);
assert.equal(calls.length, 1, 'A failed search must not invent a direct-provider fallback.');
searchFailure = null;
checks++;

enrichmentFailure = new Error('existing presentation dependency unavailable');
await assert.rejects(searchLocalPokemonCards('Pikachu'), (error) => error === enrichmentFailure);
enrichmentFailure = null;
checks++;
console.log(`Card-search boundary: ${checks} scenarios passed; dependency calls mocked, no production or device benchmark.`);
