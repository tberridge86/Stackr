import assert from 'node:assert/strict';
import {
  StackrCatalogueCache,
  calculateCatalogueChecksum,
  createInMemoryStackrCatalogueStore,
  type StackrCatalogueShard,
} from '../lib/stackrCatalogueCache';
import type { StackrCatalogueManifest } from '../lib/stackrApiV1';

const manifest: StackrCatalogueManifest = {
  currentCatalogueVersion: 'catalogue-test-v1',
  catalogueVersionId: 'catalogue-version-id',
  minCompatibleAppSchemaVersion: '1',
  latestChangeSequence: 12,
  availableLanguageShards: [{
    languageCode: 'en',
    bcp47Code: 'en',
    nativeName: 'English',
    englishName: 'English',
    shardPath: '/v1/catalog/shards/en.json',
    deltaPath: '/v1/catalog/delta?language=en',
  }],
  assetBaseUrl: 'https://assets.stackr.test',
  modelIndexVersion: 'index-test-v1',
  generatedAt: '2026-07-28T00:00:00.000Z',
  etag: 'etag-test',
};

const shard: StackrCatalogueShard = {
  languageCode: 'en',
  generatedAt: manifest.generatedAt,
  sets: [{
    setId: 'set-sv1-en',
    game: 'pokemon',
    languageCode: 'en',
    seriesId: 'series-sv',
    seriesNativeName: 'Scarlet & Violet',
    seriesEnglishDisplayName: 'Scarlet & Violet',
    setCode: 'SV1',
    nativeName: 'Scarlet & Violet',
    englishDisplayName: 'Scarlet & Violet',
    releaseDate: '2023-03-31',
    printedTotal: 198,
    total: 258,
    regionCode: 'us',
    updatedAt: '2026-07-28T00:00:00.000Z',
    sourceUpdatedAt: '2026-07-28T00:00:00.000Z',
  }],
  cards: [{
    cardId: 'pokemon:en:set-sv1-en:001:normal',
    game: 'pokemon',
    languageCode: 'en',
    set: {
      setId: 'set-sv1-en',
      setCode: 'SV1',
      nativeName: 'Scarlet & Violet',
      englishDisplayName: 'Scarlet & Violet',
    },
    collectorNumber: {
      value: '001',
      prefix: null,
      sort: 1,
      suffix: null,
      sortKey: '0001',
    },
    names: {
      native: 'Sprigatito',
      englishDisplay: 'Sprigatito',
    },
    rarity: {
      code: 'common',
      label: 'Common',
    },
    defaultVariantId: 'variant-normal',
    variants: [
      {
        variantId: 'variant-normal',
        canonicalId: 'pokemon:en:set-sv1-en:001:normal',
        variantCode: 'normal',
        variantLabel: 'Normal',
        finishCode: 'normal',
        finishLabel: 'Normal',
        artworkKey: 'artwork-a',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
      {
        variantId: 'variant-reverse',
        canonicalId: 'pokemon:en:set-sv1-en:001:reverse_holo',
        variantCode: 'reverse_holo',
        variantLabel: 'Reverse holo',
        finishCode: 'reverse_holo',
        finishLabel: 'Reverse holo',
        artworkKey: 'artwork-a',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-07-28T00:00:00.000Z',
  }],
};

async function bootstrapAndExactLookup() {
  const store = createInMemoryStackrCatalogueStore();
  const cache = new StackrCatalogueCache(store);
  const expectedChecksum = calculateCatalogueChecksum({ manifest, shards: [shard] });
  const active = await cache.bootstrap({ manifest, shards: [shard], expectedChecksum });
  assert.equal(active.currentCatalogueVersion, 'catalogue-test-v1');
  assert.equal(active.latestChangeSequence, 12);
  assert.equal(active.activeIndexVersion, 'index-test-v1');

  const exact = await cache.findExactIdentities({
    game: 'pokemon',
    languageCode: 'en',
    setCode: 'sv1',
    collectorNumber: '1',
  });
  assert.equal(exact.length, 1);
  assert.equal(exact[0].cardId, 'pokemon:en:set-sv1-en:001:normal');

  const snapshot = store.snapshot?.();
  assert.equal(snapshot?.variants.length, 2);
  assert.equal(snapshot?.variants[0].artworkKey, 'artwork-a');
}

async function rollbackOnChecksumMismatch() {
  const store = createInMemoryStackrCatalogueStore();
  const cache = new StackrCatalogueCache(store);
  await assert.rejects(
    () => cache.bootstrap({ manifest, shards: [shard], expectedChecksum: 'fnv1a32:wrong' }),
    /checksum mismatch/
  );
  assert.equal(store.snapshot?.().cards.length, 0);
}

async function deltaAndOfflineQueue() {
  const store = createInMemoryStackrCatalogueStore();
  const cache = new StackrCatalogueCache(store);
  await cache.bootstrap({ manifest, shards: [shard] });
  await cache.applyDelta([{
    sequence: 18,
    operation: 'update',
    entityType: 'card',
    entityId: 'pokemon:en:set-sv1-en:001:normal',
    entityKey: 'pokemon:en:set-sv1-en:001:normal',
    changedAt: '2026-07-28T00:10:00.000Z',
    summary: { field: 'name' },
  }]);
  assert.equal((await cache.getManifest())?.latestChangeSequence, 18);

  const queued = await cache.enqueueOfflineScan({
    ocrText: '001/198',
    possibleSetCode: 'SV1',
  });
  assert.equal(queued.status, 'queued');
  assert.equal((await cache.listOfflineScans()).length, 1);
}

async function run() {
  await bootstrapAndExactLookup();
  await rollbackOnChecksumMismatch();
  await deltaAndOfflineQueue();
  console.log('stackr catalogue cache checks passed');
}

void run();
