import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = process.argv[2] ?? fileURLToPath(new URL('../lib/stackrDomainAdapter.ts', import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const fallback = 'https://fixture.example/reviewed-fallback.png';
const api = {};
const dependencies = {
  './pokemonDisplayNames': {
    getLocalSetName: (input) => input.localName ?? input.setCode,
    getEnglishSetDisplayName: (input) => input.englishDisplayName ?? input.localName,
    getPreferredSetDisplayName: (input) => input.englishDisplayName ?? input.localName,
  },
  './pokemonSetSeries': { getPokemonSetDisplaySeries: (input) => input.series },
  './publishedSetLogoFallbacks': { getPublishedSetLogoFallback: () => fallback, getPublishedSetCoverFallback: () => undefined },
  './optionalCatalogueEnrichment': {
    readOptionalCatalogueEnrichment: (read) => read(),
    throwIfOptionalCatalogueReadAborted: () => {},
  },
};
vm.runInNewContext(compiled, {
  exports: api, require: (name) => dependencies[name] ?? {}, process,
  console, AbortController, setTimeout, clearTimeout,
});
const set = { setId: 'set-a', setCode: 'fixture', languageCode: 'ja', nativeName: 'Fixture', total: 10 };
// Synthetic locators: the dimensions match the observed approved 1000x559 logo
// and its declared 720x402 rendition. No filename rewriting is permitted.
const logo = {
  assetId: 'logo-a', setId: set.setId, assetType: 'set_logo', permissionStatus: 'approved',
  deliveryUrl: 'https://fixture.example/original.png', deliveryPath: null,
  width: 1000, height: 559, byteSize: 667122, contentSha256: 'original-hash',
  sourceAttribution: 'Existing approved source',
  derivatives: [
    { role: 'search-result', deliveryUrl: 'https://fixture.example/search.webp', width: 96, height: 54 },
    { role: 'card-grid', deliveryUrl: 'https://fixture.example/grid.webp', width: 240, height: 134 },
    { role: 'detail-page', deliveryUrl: 'https://fixture.example/detail.webp?version=approved', width: 720, height: 402, byteSize: 58190 },
  ],
};
const sourceBefore = JSON.stringify(logo);
const mapped = (asset) => api.stackrSetToLegacySet(set, [asset]);
assert.equal(mapped(logo).images.logo, logo.derivatives[2].deliveryUrl,
  'initial set mapping selects its recorded high-resolution display rendition');
assert.equal(mapped({ ...logo, derivatives: [] }).images.logo, logo.deliveryUrl,
  'missing derivative preserves the original');
assert.equal(mapped({ ...logo, derivatives: logo.derivatives.slice(0, 2) }).images.logo, logo.deliveryUrl,
  'do not downgrade shared header/search logos to a 96px or 240px thumbnail');
assert.equal(mapped({ ...logo, derivatives: [{ role: 'detail-page', deliveryUrl: '  ', deliveryPath: '  ' }] }).images.logo,
  logo.deliveryUrl, 'blank rendition locators preserve the original');
assert.equal(mapped({ ...logo, derivatives: [{ role: 'detail-page', deliveryUrl: null, deliveryPath: '/recorded/detail.webp' }] }).images.logo,
  '/recorded/detail.webp', 'an explicitly recorded delivery path is retained verbatim');
assert.equal(mapped({ ...logo, permissionStatus: 'denied' }).images.logo, logo.deliveryUrl,
  'new rendition selection never expands permission eligibility');
assert.equal(mapped({ ...logo, deliveryUrl: null }).images.logo, fallback,
  'a derivative cannot make an otherwise unavailable original eligible');
assert.equal(mapped({ ...logo, assetType: 'set_symbol' }).images.symbol, logo.deliveryUrl,
  'symbols retain their existing original selection');
assert.equal(mapped({ ...logo, assetType: 'set_cover' }).images.cover, logo.deliveryUrl,
  'covers retain their existing original selection');
assert.equal(api.stackrSetToLegacySet(set).images.logo, fallback,
  'published fallback remains available for missing logos');

const requests = [];
const client = {
  sets: async () => ({ data: { sets: [set, { ...set, setId: 'set-b' }] }, meta: {} }),
  assetManifest: async ({ assetType }) => {
    requests.push(assetType);
    return { data: { assets: assetType === 'set_logo' ? [logo] : [] }, meta: {} };
  },
};
const enriched = await api.fetchStackrSets('ja', client);
assert.equal(enriched[0].images.logo, logo.derivatives[2].deliveryUrl,
  'canonical catalogue enrichment uses the same rendition policy as direct mapping');
assert.equal(enriched[1].images.logo, fallback, 'another set never inherits this logo');
assert.deepEqual(requests.sort(), ['set_artwork', 'set_cover', 'set_logo', 'set_symbol']);
assert.equal(JSON.stringify(logo), sourceBefore, 'selection never mutates original metadata, identity or provenance');
console.log('Set logo rendition mapping passed: declared detail URLs, original/fallback recovery, permission eligibility, symbol/cover behavior, exact-set enrichment and immutable metadata.');
