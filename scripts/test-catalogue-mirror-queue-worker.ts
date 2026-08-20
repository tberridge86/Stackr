import assert from 'node:assert/strict';
import {
  boundedQueueError,
  buildCatalogueMirrorCliArgs,
  queueRetryDelaySeconds,
  type CatalogueQueueItem,
} from './catalogue-ingestion/queueWorker';

function item(overrides: Partial<CatalogueQueueItem> = {}): CatalogueQueueItem {
  return {
    id: '10000000-0000-0000-0000-000000000001',
    command: 'run_language',
    payload: {
      source: 'tcgdex',
      language: 'ja',
      offset: 500,
      limit: 250,
      writeConcurrency: 4,
      approvedOnlyAssets: true,
    },
    request_id: 'catalogue-mirror:test:001',
    attempts: 1,
    max_attempts: 5,
    ...overrides,
  };
}

const tcgdexArgs = buildCatalogueMirrorCliArgs(item());
assert.deepEqual(tcgdexArgs, [
  'scripts/catalogue-ingest.ts',
  'run-language',
  '--source=tcgdex',
  '--language=ja',
  '--target=staging',
  '--requestId=catalogue-mirror:test:001',
  '--offset=500',
  '--writeConcurrency=4',
  '--limit=250',
  '--approvedOnlyAssets',
]);

const pokemonArgs = buildCatalogueMirrorCliArgs(item({
  command: 'run_set',
  payload: {
    source: 'pokemon-tcg',
    setId: 'sv3pt5',
    allowImageAssets: true,
    approvedOnlyAssets: true,
    assetLicenceStatus: 'under_review',
  },
}));
assert.match(pokemonArgs.join(' '), /--source=pokemon-tcg-api/);
assert.match(pokemonArgs.join(' '), /--language=en/);
assert.match(pokemonArgs.join(' '), /--setId=sv3pt5/);
assert.match(pokemonArgs.join(' '), /--allowImageAssets/);
assert.match(pokemonArgs.join(' '), /--approvedOnlyAssets/);
assert.match(pokemonArgs.join(' '), /--assetLicenceStatus=under_review/);

assert.throws(
  () => buildCatalogueMirrorCliArgs(item({
    payload: { source: 'pokemon-tcg-api', language: 'ja' },
  })),
  /English catalogue/,
);
assert.throws(
  () => buildCatalogueMirrorCliArgs(item({
    payload: { source: 'scraped-web-page', language: 'en' },
  })),
  /supports tcgdex and pokemon-tcg-api only/,
);
assert.throws(
  () => buildCatalogueMirrorCliArgs(item({
    command: 'run_set',
    payload: { source: 'tcgdex', language: 'en' },
  })),
  /requires setId/,
);
assert.throws(
  () => buildCatalogueMirrorCliArgs(item({
    command: 'rebuild_record',
    payload: { source: 'tcgdex', language: 'en' },
  })),
  /requires providerRecordId/,
);

assert.equal(queueRetryDelaySeconds(1), 60);
assert.equal(queueRetryDelaySeconds(2), 120);
assert.equal(queueRetryDelaySeconds(20), 3600);
assert.equal(boundedQueueError('x'.repeat(20), 10), `${'x'.repeat(10)}…`);

console.log('Catalogue mirror queue worker tests passed.');
