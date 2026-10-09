import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA, OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS } from '../../backend/lib/generated/ownerApprovedCardEnglishNames.js';

const index = JSON.parse(readFileSync(new URL('../../backend/data/pokedex-index.json', import.meta.url), 'utf8'));
const proposals = new Set(OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.ownerApprovedProposalCardIds);
export const requiredTranslationSamples = OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS.flatMap(([language, native, english, ids]) =>
  ids.filter((id) => proposals.has(id)).map((cardId) => ({ cardId, language, native, english })));

/** Public reads only. This does not refresh prices, promote data or deploy. */
export async function verifyPublishedMobileDelivery({ expectedBackendSha, fetchImpl = fetch }) {
  assert.match(expectedBackendSha ?? '', /^[0-9a-f]{40}$/, 'Supply the reviewed deployed backend SHA.');
  const reads = [];
  const read = async (url) => {
    const start = performance.now();
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    assert.equal(response.status, 200, `Published delivery read failed: ${new URL(url).pathname}`);
    reads.push({ path: new URL(url).pathname, milliseconds: Math.round(performance.now() - start),
      cache: response.headers.get('X-Stackr-Cache') });
    return response.json();
  };
  const runtime = await read('https://pocketvault-production.up.railway.app/health');
  assert.equal(runtime.ok, true);
  assert.equal(runtime.runtime?.railwayEnvironment, 'production');
  assert.equal(runtime.runtime?.supabaseProjectRef, 'oakdbbzdqwurpjnoqhmu');
  assert.equal(runtime.runtime?.gitCommitSource, 'bundled_workflow_sha');
  assert.equal(runtime.runtime?.gitCommit, expectedBackendSha.slice(0, 12), 'Backend is not the reviewed deployment.');
  const manifest = await read('https://api.stackrtcg.com/v1/catalog/manifest');
  assert.equal(manifest.meta?.apiVersion, '1');
  assert.ok(manifest.data?.currentCatalogueVersion, 'A published catalogue is required.');
  const languages = new Set(manifest.data.availableLanguageShards.map((shard) => shard.languageCode));
  for (const language of ['en', 'ja', 'zh-cn', 'zh-tw', 'ko']) assert.ok(languages.has(language));
  const page = await read('https://api.stackrtcg.com/v1/pokemon?offset=0&limit=151');
  assert.equal(page.data?.indexVersion, index.indexVersion, 'Pokédex index is absent or stale at the gateway.');
  assert.equal(page.data.count, index.entries.length);
  assert.deepEqual(page.data.results, index.entries.slice(0, 151).map(({ id, name }) => ({
    name, url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
  })));
  const continuation = await read('https://api.stackrtcg.com/v1/pokemon?offset=151&limit=1199');
  assert.equal(continuation.data?.indexVersion, page.data.indexVersion);
  assert.equal(continuation.data.count, page.data.count);
  assert.deepEqual(continuation.data.results, index.entries.slice(151).map(({ id, name }) => ({
    name, url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
  })), 'The complete app continuation must pass through the deployed gateway.');
  assert.equal(requiredTranslationSamples.length, 4);
  for (const sample of requiredTranslationSamples) {
    const response = await read(`https://api.stackrtcg.com/v1/cards/${sample.cardId}`);
    const card = response.data?.card;
    assert.equal(card?.cardId, sample.cardId);
    assert.equal(card.languageCode, sample.language);
    assert.equal(card.names.native, sample.native, 'Native printing identity must be preserved.');
    assert.equal(card.names.englishDisplay, sample.english, 'The completed English name is not delivered by the API.');
    assert.equal(card.names.englishSupplement?.value, sample.english);
    assert.equal(card.names.englishSupplement?.authoritative, false, 'Reviewed alias must not be claimed as official.');
  }
  return { backendSource: expectedBackendSha, catalogueVersion: manifest.data.currentCatalogueVersion,
    pokedexIndexVersion: index.indexVersion, translationRecordsSha256: OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.recordsSha256,
    verifiedTranslationSamples: requiredTranslationSamples.length, reads };
}
