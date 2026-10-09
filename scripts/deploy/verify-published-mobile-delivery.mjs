import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA, OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS } from '../../backend/lib/generated/ownerApprovedCardEnglishNames.js';
import { ACTIVITY_BASE_COLUMNS, ACTIVITY_SNAPSHOT_COLUMNS, isMissingActivitySnapshotColumn } from '../../lib/activitySchema.ts';

const index = JSON.parse(readFileSync(new URL('../../backend/data/pokedex-index.json', import.meta.url), 'utf8'));
const proposals = new Set(OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.ownerApprovedProposalCardIds);
export const requiredTranslationSamples = OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS.flatMap(([language, native, english, ids]) =>
  ids.filter((id) => proposals.has(id)).map((cardId) => ({ cardId, language, native, english })));

/** Public reads only. This does not refresh prices, promote data or deploy. */
export async function verifyPublishedMobileDelivery({ expectedBackendSha, supabaseUrl, supabasePublishableKey,
  historyTimeoutMs = 15_000, fetchImpl = fetch }) {
  assert.match(expectedBackendSha ?? '', /^[0-9a-f]{40}$/, 'Supply the reviewed deployed backend SHA.');
  assert.ok(typeof supabasePublishableKey === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(supabasePublishableKey),
    'Use the frozen mobile profile publishable Supabase key.');
  assert.ok(Number.isInteger(historyTimeoutMs) && historyTimeoutMs > 0 && historyTimeoutMs <= 15_000,
    'History schema proof requires a bounded timeout.');
  let projectUrl;
  try { projectUrl = new URL(supabaseUrl); } catch { throw new Error('The frozen mobile Supabase URL is invalid.'); }
  assert.ok(projectUrl.protocol === 'https:' && !projectUrl.username && !projectUrl.password
    && projectUrl.pathname === '/' && !projectUrl.search && !projectUrl.hash,
  'Use an HTTPS Supabase project origin without credentials, paths or query parameters.');
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
  assert.ok(projectUrl.origin === `https://${runtime.runtime.supabaseProjectRef}.supabase.co`,
    'The frozen mobile Supabase origin must match the reviewed production backend.');
  const activityReads = [];
  const readActivitySchema = async (columns, contract) => {
    const url = new URL('/rest/v1/activity_feed', projectUrl.origin);
    url.searchParams.set('select', columns);
    url.searchParams.set('limit', '0');
    const controller = new AbortController();
    let timer;
    const started = performance.now();
    // The race bounds fetch and JSON parsing; its handlers consume late errors.
    const request = (async () => {
      const response = await fetchImpl(url.href, { method: 'GET', signal: controller.signal, cache: 'no-store',
        credentials: 'omit', redirect: 'error', headers: { apikey: supabasePublishableKey } });
      const body = await response.json();
      return { status: response.status, body };
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('History schema proof timed out.'));
      }, historyTimeoutMs);
    });
    let result;
    try {
      result = await Promise.race([request, timeout]);
    } catch {
      // Never emit request headers or a provider error that could echo a key.
      throw new Error('Published history schema proof could not complete.');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    activityReads.push({ path: url.pathname, contract, limit: 0, status: result.status,
      milliseconds: Math.round(performance.now() - started) });
    return result;
  };
  const baseActivity = await readActivitySchema(ACTIVITY_BASE_COLUMNS, 'base');
  assert.equal(baseActivity.status, 200, 'Published history base schema is unavailable to the mobile publishable key.');
  assert.ok(Array.isArray(baseActivity.body) && baseActivity.body.length === 0,
    'History schema proof must return an empty array and read no collector rows.');
  const richActivity = await readActivitySchema(ACTIVITY_SNAPSHOT_COLUMNS, 'snapshots');
  let snapshotSchema;
  if (richActivity.status === 200) {
    assert.ok(Array.isArray(richActivity.body) && richActivity.body.length === 0,
      'History snapshot schema proof must return no collector rows.');
    snapshotSchema = 'available';
  } else {
    assert.ok(richActivity.status === 400 && isMissingActivitySnapshotColumn(richActivity.body),
      'Published history snapshot contract failed beyond the compatible optional columns.');
    snapshotSchema = 'legacy_compatible';
  }
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
    verifiedTranslationSamples: requiredTranslationSamples.length, reads,
    activityHistory: { supabaseProjectRef: runtime.runtime.supabaseProjectRef, baseSchema: 'verified',
      baseColumns: ACTIVITY_BASE_COLUMNS, snapshotSchema, access: 'anonymous_publishable_key', rowLimit: 0, reads: activityReads } };
}
