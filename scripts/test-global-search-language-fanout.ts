import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

const requestedLanguages: string[] = [];
const query = {
  select: () => query,
  ilike: () => query,
  eq: () => query,
  or: () => query,
  limit: () => Promise.resolve({ data: [], error: null }),
};

const mocks: Record<string, unknown> = {
  './cardSearch': {
    searchLocalPokemonCards: async (_query: string, options: { language: string }) => {
      requestedLanguages.push(options.language);
      if (options.language === 'ja') throw new Error('temporary Japanese catalogue failure');
      return [{ id: `${options.language}-card`, name: options.language, language: options.language }];
    },
  },
  './pokemonDisplayNames': { getPreferredSetDisplayName: () => null },
  './searchNormalisation': { expandSearchQuery: (value: string) => [value], normaliseSearchText: (value: string) => value.trim() },
  './supabase': { supabase: { from: () => query } },
  './pokemonTcg': { getPokemonCardLanguageLabel: (value: string) => value, normalizePokemonCardLanguage: (value: string) => value },
  './providerSetMarkRuntimePolicy': { enforceSetVisualRuntimePolicy: (value: string) => value },
  './stackrDomainAdapter': { fetchStackrSets: async () => [] },
  './gate0CommerceCopy': { sanitizeGate0CommerceCopy: (value: string) => value },
  './marketplacePresentation': { sanitizeMarketplaceListingPresentationFields: <T>(value: T) => value },
};

function loadGlobalSearch() {
  const path = resolve('lib/globalSearch.ts');
  const compiled = transformSync(readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
  const originalLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function mockLoad(request: string, parent: unknown, isMain: boolean) {
    return request in mocks ? mocks[request] : originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = new Module(path);
    (loaded as unknown as { filename: string }).filename = path;
    (loaded as unknown as { paths: string[] }).paths = (Module as unknown as { _nodeModulePaths(path: string): string[] })._nodeModulePaths(resolve('.'));
    (loaded as unknown as { _compile(code: string, filename: string): void })._compile(compiled, path);
    return loaded.exports as { runGlobalSearch: (query: string) => Promise<{ groups: { cards?: Array<{ id: string }> } }> };
  } finally {
    (Module as unknown as { _load: Function })._load = originalLoad;
  }
}

async function main() {
  const { runGlobalSearch } = loadGlobalSearch();
  const result = await runGlobalSearch('Pikachu');

  assert.deepEqual(requestedLanguages, ['en', 'ja', 'zh-cn', 'zh-tw'], 'Global search must fan out to every supported public language shard.');
  assert.deepEqual(
    result.groups.cards?.map((card) => card.id),
    ['en-card', 'zh-cn-card', 'zh-tw-card'],
    'A temporary failure in one language must not suppress results from the other language shards.',
  );
  console.log('Global search covers en, ja, zh-cn and zh-tw, and isolates a failed language shard.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
