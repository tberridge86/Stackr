import assert from 'node:assert/strict';
import {
  CARD_IDENTITY_EMBEDDING_BINARY_MAGIC,
  CARD_IDENTITY_EMBEDDING_DIMENSIONS,
  buildCardIdentityCatalogueManifest,
  createEmptyEmbeddingBinaryHeader,
  parseEmbeddingBinaryHeader,
  type CardIdentityCatalogueCard,
} from '../lib/cardIdentityCataloguePack';

const header = parseEmbeddingBinaryHeader(createEmptyEmbeddingBinaryHeader());
assert.equal(header.magic, CARD_IDENTITY_EMBEDDING_BINARY_MAGIC);
assert.equal(header.dimensions, CARD_IDENTITY_EMBEDDING_DIMENSIONS);
assert.equal(header.embeddingCount, 0);
assert.equal(header.storage, 'fp16');

const cards: CardIdentityCatalogueCard[] = [
  {
    canonicalCardId: 'base1-4',
    sourceImageId: 'src_1',
    cardName: 'Charizard',
    setId: 'base1',
    setName: 'Base',
    language: 'en',
    collectorNumber: '4',
    printedTotal: '102',
    variant: 'holo',
    sourceUri: 'https://example.test/base1-4.png',
    sourceUriSha256: 'a'.repeat(64),
    imageHashSha256: null,
    embeddingStatus: 'missing',
    missingEmbeddingReason: 'no_approved_embedding_model',
    embeddingOffsetBytes: null,
    embeddingLengthBytes: 0,
  },
];

const manifest = buildCardIdentityCatalogueManifest({
  cards,
  modelVersion: 'stackr-card-identity-onnx-v0.0.0-blocked',
  datasetVersion: 'stackr-pilot-recognition-dataset-v1.0.0',
  datasetManifestSha256: 'b'.repeat(64),
  expectedPilotSourceImageCount: 1,
  sqliteSha256: 'c'.repeat(64),
  sqliteBytes: 8192,
  embeddingsSha256: 'd'.repeat(64),
  embeddingsBytes: 64,
});

assert.equal(manifest.status, 'blocked');
assert.equal(manifest.approvedForInstall, false);
assert.equal(manifest.embeddings.count, 0);
assert.equal(manifest.embeddings.missingCount, 1);
assert.equal(manifest.canonicalCards.everyActivePilotCardDocumented, true);
assert.equal(manifest.canonicalCards.missingReasonCounts.no_approved_embedding_model, 1);
assert.ok(manifest.validationCommands.includes('inspect-card-neighbours'));

console.log('Card identity catalogue pack tests passed.');
