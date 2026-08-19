import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  arrayPayload,
  normaliseSnapshotLanguages,
  normaliseSnapshotSources,
  providerRecordId,
  retryAfterMs,
  uniqueProviderIds,
} from './export-full-catalogue-metadata-snapshot';

assert.deepEqual(
  normaliseSnapshotSources(['TCGDEX', 'pokemon_tcg', 'pokemontcg']),
  ['tcgdex', 'pokemon-tcg-api'],
);
assert.throws(
  () => normaliseSnapshotSources(['unapproved-web-scraper']),
  /Unsupported metadata snapshot source/,
);

assert.deepEqual(
  normaliseSnapshotLanguages(['EN', 'ja', 'zh_TW', 'zh-cn', 'ko', 'en']),
  ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'],
);
assert.throws(
  () => normaliseSnapshotLanguages(['fr']),
  /Unsupported catalogue language/,
);

assert.equal(retryAfterMs('2', 0), 2000);
assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 1000), 4000);
assert.equal(retryAfterMs('not-a-date', 0), null);

assert.deepEqual(arrayPayload([{ id: 'a' }], 'array'), [{ id: 'a' }]);
assert.deepEqual(arrayPayload({ data: [{ id: 'b' }] }, 'envelope'), [{ id: 'b' }]);
assert.throws(() => arrayPayload({ cards: [] }, 'invalid'), /did not return an array/);

assert.equal(providerRecordId('card-1'), 'card-1');
assert.equal(providerRecordId({ id: 'card-2' }), 'card-2');
assert.equal(providerRecordId({ slug: 'card-3' }), 'card-3');
assert.equal(providerRecordId(null), null);
assert.deepEqual(uniqueProviderIds([{ id: '1' }, { id: '2' }], 'cards'), ['1', '2']);
assert.throws(
  () => uniqueProviderIds([{ id: '1' }, { id: '1' }], 'cards'),
  /duplicate id 1/,
);

const exporter = readFileSync('scripts/export-full-catalogue-metadata-snapshot.ts', 'utf8');
const workflow = readFileSync('.github/workflows/full-catalogue-metadata-backfill.yml', 'utf8');

assert.match(exporter, /metadataOnly: true/);
assert.match(exporter, /imagesDownloaded: false/);
assert.match(exporter, /'en', 'ja', 'zh-tw', 'zh-cn', 'ko'/);
assert.match(exporter, /pokemon-tcg-api/);
assert.match(exporter, /X-Api-Key/);
assert.match(exporter, /sha256/);
assert.match(
  exporter,
  /path\.join\(options\.outputDir, 'tcgdex', language, `\$\{resource\}\.json`\)/,
  'TCGdex card and set snapshots must use deterministic per-resource JSON paths',
);
assert.match(
  exporter,
  /path\.join\(options\.outputDir, 'pokemon-tcg-api', 'en', `\$\{resource\}\.json`\)/,
  'Pokémon TCG API card and set snapshots must use deterministic per-resource JSON paths',
);
assert.match(exporter, /series\.json/);
assert.match(exporter, /fields\.json/);
assert.doesNotMatch(exporter, /createClient|SUPABASE_SERVICE_ROLE_KEY|allowImageAssets/);

assert.match(workflow, /Export the complete provider metadata snapshot/);
assert.match(workflow, /export-full-catalogue-metadata-snapshot\.ts/);
assert.match(workflow, /full-metadata-snapshot/);
assert.match(workflow, /continue-on-error: true[\s\S]+probe-catalogue-ingest-access\.ts/);
assert.match(workflow, /steps\.staging_access\.outcome == 'success'/);

console.log('Complete multilingual catalogue metadata snapshot tests passed.');
