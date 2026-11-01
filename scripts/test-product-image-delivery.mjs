import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = process.argv[2] ?? fileURLToPath(new URL('../lib/productSearch.ts', import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const set = { id: 'fixture', name: 'Fixture', language: 'en', series: 'Fixture', releaseDate: '2026-01-01' };
const product = {
  id: 'fixture-product', name: 'Fixture Booster Box', product_type: 'booster_box',
  set_name: set.name, language: 'English', source: 'catalogue', aliases: [],
  image_url: null, image_large_url: null,
};
const providerRow = {
  productId: 123, name: product.name, groupName: set.name, imageUrl: null, variants: [],
};

function loadProducts({ rows = [], providerRows = [] } = {}) {
  const api = {};
  const calls = [];
  const dependencies = {
    './config': { PRICE_API_URL: 'https://fixture.invalid', USD_TO_GBP: 0.8 },
    './pricing': { fetchTcgcsvUiProductPricesForSet: async (name) => {
      calls.push(name);
      return providerRows;
    } },
    './pokemonTcg': {
      fetchAllSets: async () => [set],
      getPokemonCardLanguageLabel: () => 'English',
      normalizePokemonCardLanguage: (language) => language,
    },
    './pokemonDisplayNames': { getPreferredSetDisplayName: (value) => value.name },
    './supabase': { supabase: { from: (table) => {
      const result = { data: table === 'market_products' ? rows : [], error: null };
      const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
      for (const method of ['select', 'limit', 'eq', 'ilike', 'in', 'order']) query[method] = () => query;
      query.maybeSingle = async () => ({ ...result, data: rows[0] ?? null });
      return query;
    } } },
  };
  vm.runInNewContext(compiled, {
    exports: api,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
  }, { filename: sourcePath });
  return { api, calls };
}

// Synthetic provider locators exercise the actual public mapping/enrichment calls.
// No URL change can establish that another rendition exists.
for (const url of [
  'https://fixture.invalid/product_200w.jpg',
  'https://fixture.invalid/product_200w.PNG',
  'https://fixture.invalid/product_200w.jpg?signature=exact#asset',
  'https://fixture.invalid/public/sealed/immutable/original.webp',
  null,
]) {
  const providerRows = [{ ...providerRow, imageUrl: url }];
  const { api } = loadProducts({ providerRows });
  const fallback = await api.searchMarketProducts('Fixture Booster Box', 'booster_box', 1);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].image_url, url, 'fallback keeps its recorded source');
  assert.equal(fallback[0].image_large_url, url, 'fallback never invents a larger rendition');

  const { api: enrichment } = loadProducts({ rows: [product], providerRows });
  const results = await enrichment.listMarketProducts('booster_box', 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, product.id, 'media enrichment preserves the product identity');
  assert.equal(results[0].image_url, url);
  assert.equal(results[0].image_large_url, url, 'enrichment keeps the same recorded locator');
}

const published = {
  ...product,
  image_url: 'https://fixture.invalid/published/search.webp',
  image_large_url: 'https://fixture.invalid/published/detail.webp?revision=verified',
};
// The current canonical sealed-product provider deliberately supplies no rows.
// Existing database images, including an explicitly supplied large URL, survive.
const { api, calls } = loadProducts({ rows: [published] });
const detail = await api.getMarketProductById(product.id);
assert.equal(detail.image_url, published.image_url);
assert.equal(detail.image_large_url, published.image_large_url);
assert.deepEqual(calls, [set.name]);
assert.equal((await api.getMarketProductById('  ')), null);
console.log('Product image delivery passed: public fallback/enrichment keep exact locators; absent provider rows preserve published originals and explicit detail URLs.');
