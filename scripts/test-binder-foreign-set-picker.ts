import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getPokemonSetLanguageFromPrefixedId,
  normalizePokemonSetReferenceForLookup,
  stripPokemonSetLanguagePrefix,
} from '../lib/pokemonSetIdentity';
import {
  firstNonEmptyCatalogueRows,
  preferNonEmptyCatalogueRows,
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
  const timedOutRows = await preferNonEmptyCatalogueRows(
    () => new Promise<string[]>(() => {}),
    async () => ['legacy-after-timeout'],
    { preferredTimeoutMs: 5 },
  );
  assert.deepEqual(timedOutRows, ['legacy-after-timeout']);
  assert.ok(Date.now() - startedAt < 1000, 'a stalled preferred read must reach the fallback promptly');
}

async function main() {
  await verifyReadFallback();

  const pokemonTcgSource = readFileSync('lib/pokemonTcg.ts', 'utf8');
  assert.match(pokemonTcgSource, /export function getPokemonSetIdLookupCandidates/);
  assert.match(pokemonTcgSource, /const stripped = stripPokemonSetLanguagePrefix\(raw\)/);
  assert.match(pokemonTcgSource, /const prefixedLanguage = getPokemonSetLanguageFromPrefixedId\(raw\)/);
  assert.match(pokemonTcgSource, /for \(const candidate of setIdCandidates\)/);
  assert.match(pokemonTcgSource, /catch \(error\) \{\s*candidateError = error;\s*continue;/);
  assert.match(pokemonTcgSource, /function mergeApprovedSetImages/);

  const pickerSource = readFileSync('app/binder/new.tsx', 'utf8');
  assert.match(pickerSource, /\{ key: 'zh-cn', label: 'Simplified' \}/);
  assert.match(pickerSource, /\{ key: 'zh-tw', label: 'Traditional' \}/);
  assert.match(pickerSource, /preferCanonicalApi: setLanguage !== 'en'/);

  const binderSource = readFileSync('lib/binders.ts', 'utf8');
  assert.match(
    binderSource,
    /fetchCardsForSet\(binder\.source_set_id, \{\s*language: binderLanguage,\s*preferCanonicalApi: binderLanguage !== 'en',/,
  );
  assert.match(binderSource, /`zh-cn:\$\{stripped\}`/);

  const adapterSource = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
  assert.match(adapterSource, /export function fetchPreferredStackrSets/);
  assert.match(adapterSource, /fetchCanonicalStackrSets\(language, client, false\)/);
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
