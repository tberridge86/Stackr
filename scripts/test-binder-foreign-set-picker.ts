import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getPokemonSetLanguageFromPrefixedId,
  normalizePokemonSetReferenceForLookup,
  stripPokemonSetLanguagePrefix,
} from '../lib/pokemonSetIdentity';
import {
  cacheNonEmptyCatalogueRows,
  firstNonEmptyCatalogueRows,
  preferNonEmptyCatalogueRows,
  readNonEmptyCatalogueRows,
} from '../lib/resilientCatalogueRead';

const languageCases = [
  ['ja:SV2A', 'ja', 'SV2A'],
  ['zh-cn:CSV1C', 'zh-cn', 'CSV1C'],
  ['zh_cn:CSV1C', 'zh-cn', 'CSV1C'],
  ['zh-hans:CSV1C', 'zh-cn', 'CSV1C'],
  ['zh-tw:SVF', 'zh-tw', 'SVF'],
  ['zh_hant:SVF', 'zh-tw', 'SVF'],
] as const;

for (const [setId, language, unprefixed] of languageCases) {
  assert.equal(getPokemonSetLanguageFromPrefixedId(setId), language);
  assert.equal(stripPokemonSetLanguagePrefix(setId), unprefixed);
}

const uppercaseUuid = '0185ABCD-1234-4ABC-8ABC-1234567890AB';
assert.equal(
  normalizePokemonSetReferenceForLookup(`zh-cn:${uppercaseUuid}`),
  uppercaseUuid.toLowerCase(),
  'prefixed canonical set UUIDs must normalize to lowercase',
);

async function verifyReadFallback() {
  const attemptedCandidates: string[] = [];
  const candidateRows = await firstNonEmptyCatalogueRows(
    ['zh-cn:CSV1C', 'CSV1C'],
    async (candidate) => {
      attemptedCandidates.push(candidate);
      if (candidate.includes(':')) throw new Error('prefixed form not found');
      return ['canonical-card'];
    },
  );
  assert.deepEqual(candidateRows, ['canonical-card']);
  assert.deepEqual(attemptedCandidates, ['zh-cn:CSV1C', 'CSV1C']);

  let fallbackCalls = 0;
  const preferredRows = await preferNonEmptyCatalogueRows(
    async () => ['canonical'],
    async () => {
      fallbackCalls += 1;
      return ['legacy'];
    },
  );
  assert.deepEqual(preferredRows, ['canonical']);
  assert.equal(fallbackCalls, 0, 'a healthy canonical read must not invoke the fallback');

  const rejectedRows = await preferNonEmptyCatalogueRows(
    async () => { throw new Error('canonical unavailable'); },
    async () => ['legacy-after-error'],
  );
  assert.deepEqual(rejectedRows, ['legacy-after-error']);

  const emptyRows = await preferNonEmptyCatalogueRows(
    async () => [],
    async () => ['legacy-after-empty'],
  );
  assert.deepEqual(emptyRows, ['legacy-after-empty']);

  const startedAt = Date.now();
  let activeCanonicalReads = 0;
  let canonicalAborted = false;
  let canonicalSettled = false;
  const timedOutRows = await preferNonEmptyCatalogueRows(
    (signal) => new Promise<string[]>((_resolve, reject) => {
      activeCanonicalReads += 1;
      signal.addEventListener('abort', () => {
        canonicalAborted = true;
        activeCanonicalReads -= 1;
        canonicalSettled = true;
        const error = new Error('canonical request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
    async () => {
      assert.equal(canonicalAborted, true, 'timeout must abort the preferred read');
      assert.equal(canonicalSettled, true, 'preferred read must settle before fallback starts');
      assert.equal(activeCanonicalReads, 0, 'preferred and fallback reads must never overlap');
      return ['legacy-after-timeout'];
    },
    { preferredTimeoutMs: 5 },
  );
  assert.deepEqual(timedOutRows, ['legacy-after-timeout']);
  assert.ok(Date.now() - startedAt < 1000, 'a stalled preferred read must reach the fallback promptly');
}

function verifyNonEmptyCatalogueCachePolicy() {
  const cache = new Map<string, { expiresAt: number; value: string[] }>();
  const expiresAt = Date.now() + 60_000;

  cache.set('sets:zh-tw:canonical-api', { expiresAt, value: [] });
  assert.equal(
    readNonEmptyCatalogueRows(cache, 'sets:zh-tw:canonical-api'),
    null,
    'an empty entry retained by an older app bundle must be ignored immediately',
  );
  assert.equal(cache.has('sets:zh-tw:canonical-api'), false, 'the legacy empty entry must be deleted');

  assert.equal(
    cacheNonEmptyCatalogueRows(cache, 'sets:zh-cn:canonical-api', ['CSV1C'], expiresAt),
    true,
    'a populated Simplified-Chinese catalogue response must be cacheable',
  );
  assert.deepEqual(cache.get('sets:zh-cn:canonical-api'), { expiresAt, value: ['CSV1C'] });
  assert.deepEqual(readNonEmptyCatalogueRows(cache, 'sets:zh-cn:canonical-api'), ['CSV1C']);

  assert.equal(
    cacheNonEmptyCatalogueRows(cache, 'sets:zh-cn:canonical-api', [], expiresAt),
    false,
    'an empty CJK response must not be cached as a ten-minute no-results state',
  );
  assert.equal(cache.has('sets:zh-cn:canonical-api'), false, 'an empty retry result must clear stale cache state');

  assert.equal(
    cacheNonEmptyCatalogueRows(cache, 'sets:zh-tw:canonical-api', [], expiresAt),
    false,
    'an initial empty Traditional-Chinese response must leave the next picker open eligible to retry',
  );
  assert.equal(cache.has('sets:zh-tw:canonical-api'), false);
}

async function main() {
  await verifyReadFallback();
  verifyNonEmptyCatalogueCachePolicy();

  const pokemonTcgSource = readFileSync('lib/pokemonTcg.ts', 'utf8');
  assert.match(pokemonTcgSource, /export function getPokemonSetIdLookupCandidates/);
  assert.match(pokemonTcgSource, /const stripped = stripPokemonSetLanguagePrefix\(raw\)/);
  assert.match(pokemonTcgSource, /const prefixedLanguage = getPokemonSetLanguageFromPrefixedId\(raw\)/);
  assert.match(pokemonTcgSource, /for \(const candidate of setIdCandidates\)/);
  assert.match(pokemonTcgSource, /catch \(error\) \{\s*candidateError = error;\s*continue;/);
  assert.match(pokemonTcgSource, /function mergeApprovedSetImages/);
  assert.match(pokemonTcgSource, /cacheNonEmptyCatalogueRows\(allSetsCache, cacheKey, sets,/);
  assert.match(pokemonTcgSource, /cacheNonEmptyCatalogueRows\(cardsForSetCache, cacheKey, cards,/);
  assert.match(pokemonTcgSource, /export function invalidatePokemonCatalogueCardCaches\(\) \{\s*cardsForSetCache\.clear\(\);\s*invalidateForeignPokemonSetReferenceCache\(\);/);
  const binderDetailSource = readFileSync('features/binder/BinderDetailScreen.tsx', 'utf8');
  assert.match(binderDetailSource, /if \(forceRefresh\) \{\s*invalidateBinderCaches\(binderId\);\s*invalidatePokemonCatalogueCardCaches\(\);/);

  const pickerSource = readFileSync('app/binder/new.tsx', 'utf8');
  assert.match(pickerSource, /POKEMON_CATALOGUE_LANGUAGE_OPTIONS/);
  assert.match(pickerSource, /preferCanonicalApi: requestedLanguage !== 'en'/);
  assert.match(pickerSource, /accessibilityLabel=\{`Retry loading \$\{getSetLanguageLabel\(setLanguage\)\} sets`\}/);
  assert.match(pickerSource, /No \$\{getSetLanguageLabel\(requestedLanguage\)\} sets were returned/);

  const languageBadgeSource = readFileSync('components/PokemonLanguageBadge.tsx', 'utf8');
  assert.match(languageBadgeSource, /POKEMON_CATALOGUE_LANGUAGE_OPTIONS/);
  assert.match(
    languageBadgeSource,
    /POKEMON_CATALOGUE_LANGUAGE_CODES = \[\s*'en', 'ja', 'zh-cn', 'zh-tw',\s*\]/s,
    'the shared selectable-set language list must retain English, Japanese, and both Chinese editions',
  );

  const binderSource = readFileSync('lib/binders.ts', 'utf8');
  assert.match(
    binderSource,
    /fetchCardsForSet\(binder\.catalogue_set_id \?\? binder\.source_set_id, \{\s*language: binderLanguage,\s*preferCanonicalApi: binderLanguage !== 'en',/,
  );
  assert.match(binderSource, /`zh-cn:\$\{stripped\}`/);

  const adapterSource = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
  assert.match(adapterSource, /export function fetchPreferredStackrSets/);
  assert.match(adapterSource, /fetchCanonicalStackrSets\(language, client, false, signal\)/);
  assert.match(adapterSource, /preferredTimeoutMs: PREFERRED_CATALOGUE_READ_TIMEOUT_MS/);
  assert.match(adapterSource, /export function fetchPreferredStackrCardsForSet/);
  assert.match(adapterSource, /export function fetchPreferredStackrCardsForReferences/);
  assert.match(adapterSource, /normalizePokemonSetReferenceForLookup\(value\)/);
  assert.match(adapterSource, /\.in\('set_id', references\)/);

  console.log('Foreign official-binder picker, UUID normalization, and resilient CJK reads passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
