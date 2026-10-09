import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiredTranslationSamples, verifyPublishedMobileDelivery } from './deploy/verify-published-mobile-delivery.mjs';

const index = JSON.parse(readFileSync('backend/data/pokedex-index.json', 'utf8'));
const sha = 'a'.repeat(40);
const fixture = (broken = null) => async (url, init) => {
  assert.ok(init.signal);
  assert.equal(init.headers, undefined, 'Public delivery proof never supplies credentials.');
  const pathname = new URL(url).pathname;
  let body;
  if (pathname === '/health') body = { ok: true, runtime: { railwayEnvironment: 'production',
    supabaseProjectRef: 'oakdbbzdqwurpjnoqhmu', gitCommitSource: 'bundled_workflow_sha', gitCommit: sha.slice(0, 12) } };
  else if (pathname === '/v1/catalog/manifest') body = { meta: { apiVersion: '1' }, data: {
    currentCatalogueVersion: 'published-v1', availableLanguageShards: ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'].map((languageCode) => ({ languageCode })),
  } };
  else if (pathname === '/v1/pokemon') {
    const offset = Number(new URL(url).searchParams.get('offset'));
    const limit = Number(new URL(url).searchParams.get('limit'));
    body = { data: { count: index.entries.length, indexVersion: index.indexVersion,
      results: index.entries.slice(offset, offset + limit).map(({ id, name }) => ({ name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` })) } };
  }
  else {
    const sample = requiredTranslationSamples.find((row) => pathname.endsWith(row.cardId));
    assert.ok(sample, `Unexpected read ${pathname}`);
    body = { data: { card: { cardId: sample.cardId, languageCode: sample.language, names: { native: sample.native,
      englishDisplay: sample.english, englishSupplement: { value: sample.english, authoritative: false } } } } };
  }
  if (broken === 'backend' && pathname === '/health') body.runtime.gitCommit = 'b'.repeat(12);
  if (broken === 'index' && pathname === '/v1/pokemon') body.data.indexVersion = 'old-index';
  if (broken === 'translation' && pathname.includes('/cards/')) body.data.card.names.englishDisplay = 'Incorrect old name';
  if (broken === 'authority' && pathname.includes('/cards/')) body.data.card.names.englishSupplement.authoritative = true;
  const missing = broken === 'missing-route' && pathname === '/v1/pokemon';
  const blockedContinuation = broken === 'continuation' && new URL(url).searchParams.get('offset') === '151';
  return Response.json(body, { status: missing ? 404 : blockedContinuation ? 400 : 200 });
};
const receipt = await verifyPublishedMobileDelivery({ expectedBackendSha: sha, fetchImpl: fixture() });
assert.equal(receipt.backendSource, sha);
assert.equal(receipt.reads.length, 8, 'One runtime, one manifest, both index pages and four exact translations.');
for (const broken of ['backend', 'index', 'translation', 'authority', 'missing-route', 'continuation']) {
  await assert.rejects(verifyPublishedMobileDelivery({ expectedBackendSha: sha, fetchImpl: fixture(broken) }));
}
assert.equal(receipt.verifiedTranslationSamples, 4);
console.log('Published mobile delivery gate rejects old source, old index, missing gateway route and undelivered/untruthful English names.');
