export const CARD_IDENTITY_CATALOGUE_SCHEMA_VERSION = 'stackr-card-identity-catalogue-v1.0.0';
export const CARD_IDENTITY_CATALOGUE_PACK_VERSION = 'stackr-card-identity-catalogue-v0.0.0-blocked';
export const CARD_IDENTITY_CATALOGUE_GENERATED_AT = '2026-07-26T00:00:00.000Z';
export const CARD_IDENTITY_EMBEDDING_DIMENSIONS = 128;
export const CARD_IDENTITY_EMBEDDING_STORAGE = 'fp16';
export const CARD_IDENTITY_EMBEDDING_BYTES_PER_VALUE = 2;
export const CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES = 64;
export const CARD_IDENTITY_EMBEDDING_BINARY_MAGIC = 'STKR-EMB-FP16';

export type CardIdentityCatalogueCard = {
  canonicalCardId: string;
  sourceImageId: string;
  cardName: string;
  setId: string;
  setName: string;
  language: string;
  collectorNumber: string;
  printedTotal: string;
  variant: string;
  sourceUri: string;
  sourceUriSha256: string;
  imageHashSha256: string | null;
  embeddingStatus: 'ready' | 'missing';
  missingEmbeddingReason: string | null;
  embeddingOffsetBytes: number | null;
  embeddingLengthBytes: number;
};

export type CardIdentityCatalogueManifest = {
  schemaVersion: typeof CARD_IDENTITY_CATALOGUE_SCHEMA_VERSION;
  packVersion: typeof CARD_IDENTITY_CATALOGUE_PACK_VERSION;
  status: 'blocked' | 'ready';
  generatedAt: typeof CARD_IDENTITY_CATALOGUE_GENERATED_AT;
  deterministic: true;
  modelVersion: string;
  requiredInstalledModelVersion: string;
  approvedForInstall: boolean;
  installRejectionReason: string | null;
  dataset: {
    datasetVersion: string | null;
    datasetManifestSha256: string | null;
    expectedPilotSourceImageCount: number | null;
    reconstructedPilotSourceImageCount: number;
  };
  embeddings: {
    dimensions: typeof CARD_IDENTITY_EMBEDDING_DIMENSIONS;
    storage: typeof CARD_IDENTITY_EMBEDDING_STORAGE;
    tensorNormalisation: 'l2';
    count: number;
    missingCount: number;
    bytesPerEmbedding: number;
    memoryMappable: true;
    int8Comparison: {
      status: 'blocked' | 'measured' | 'rejected' | 'adopted';
      reason: string;
      retrievalAccuracy: number | null;
      hardNegativeAccuracy: number | null;
      exactVariantAccuracy: number | null;
    };
  };
  canonicalCards: {
    count: number;
    everyActivePilotCardDocumented: boolean;
    missingReasonCounts: Record<string, number>;
  };
  files: {
    sqlite: {
      path: 'assets/catalogue/card-catalogue.sqlite';
      sha256: string;
      bytes: number;
    };
    embeddings: {
      path: 'assets/catalogue/card-embeddings.bin';
      sha256: string;
      bytes: number;
      headerBytes: typeof CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES;
    };
  };
  packages: {
    complete: {
      status: 'blocked' | 'ready';
      files: string[];
      atomicInstallInstructions: string[];
    };
    delta: {
      status: 'blocked' | 'ready';
      fromPackVersion: string | null;
      files: string[];
      atomicInstallInstructions: string[];
    };
  };
  validationCommands: string[];
};

export type EmbeddingBinaryHeader = {
  magic: string;
  version: number;
  dimensions: number;
  embeddingCount: number;
  dataOffsetBytes: number;
  storage: typeof CARD_IDENTITY_EMBEDDING_STORAGE | 'unknown';
};

export function createEmptyEmbeddingBinaryHeader() {
  const header = new Uint8Array(CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES);
  const magic = CARD_IDENTITY_EMBEDDING_BINARY_MAGIC;
  for (let index = 0; index < magic.length; index += 1) {
    header[index] = magic.charCodeAt(index);
  }
  const view = new DataView(header.buffer);
  view.setUint32(16, 1, true);
  view.setUint32(20, CARD_IDENTITY_EMBEDDING_DIMENSIONS, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES, true);
  view.setUint32(32, CARD_IDENTITY_EMBEDDING_BYTES_PER_VALUE, true);
  return header;
}

export function parseEmbeddingBinaryHeader(bytes: Uint8Array): EmbeddingBinaryHeader {
  if (bytes.length < CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES) {
    throw new Error('Embedding binary is shorter than the required header.');
  }
  const nulIndex = bytes.slice(0, 16).findIndex((value) => value === 0);
  const magicBytes = bytes.slice(0, nulIndex >= 0 ? nulIndex : 16);
  const magic = String.fromCharCode(...magicBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPerValue = view.getUint32(32, true);
  return {
    magic,
    version: view.getUint32(16, true),
    dimensions: view.getUint32(20, true),
    embeddingCount: view.getUint32(24, true),
    dataOffsetBytes: view.getUint32(28, true),
    storage: bytesPerValue === CARD_IDENTITY_EMBEDDING_BYTES_PER_VALUE ? 'fp16' : 'unknown',
  };
}

export function summarizeMissingReasons(cards: readonly CardIdentityCatalogueCard[]) {
  return cards.reduce<Record<string, number>>((summary, card) => {
    if (card.embeddingStatus !== 'missing') return summary;
    const reason = card.missingEmbeddingReason ?? 'unknown';
    summary[reason] = (summary[reason] ?? 0) + 1;
    return summary;
  }, {});
}

export function buildCardIdentityCatalogueManifest({
  cards,
  modelVersion,
  datasetVersion,
  datasetManifestSha256,
  expectedPilotSourceImageCount,
  sqliteSha256,
  sqliteBytes,
  embeddingsSha256,
  embeddingsBytes,
}: {
  cards: readonly CardIdentityCatalogueCard[];
  modelVersion: string;
  datasetVersion: string | null;
  datasetManifestSha256: string | null;
  expectedPilotSourceImageCount: number | null;
  sqliteSha256: string;
  sqliteBytes: number;
  embeddingsSha256: string;
  embeddingsBytes: number;
}): CardIdentityCatalogueManifest {
  const embeddingCount = cards.filter((card) => card.embeddingStatus === 'ready').length;
  const missingCount = cards.length - embeddingCount;
  const status = embeddingCount > 0 && missingCount === 0 ? 'ready' : 'blocked';
  const expectedCount = expectedPilotSourceImageCount ?? cards.length;
  return {
    schemaVersion: CARD_IDENTITY_CATALOGUE_SCHEMA_VERSION,
    packVersion: CARD_IDENTITY_CATALOGUE_PACK_VERSION,
    status,
    generatedAt: CARD_IDENTITY_CATALOGUE_GENERATED_AT,
    deterministic: true,
    modelVersion,
    requiredInstalledModelVersion: modelVersion,
    approvedForInstall: false,
    installRejectionReason: status === 'blocked'
      ? 'No approved model embeddings are present; install must be rejected safely.'
      : null,
    dataset: {
      datasetVersion,
      datasetManifestSha256,
      expectedPilotSourceImageCount,
      reconstructedPilotSourceImageCount: cards.length,
    },
    embeddings: {
      dimensions: CARD_IDENTITY_EMBEDDING_DIMENSIONS,
      storage: CARD_IDENTITY_EMBEDDING_STORAGE,
      tensorNormalisation: 'l2',
      count: embeddingCount,
      missingCount,
      bytesPerEmbedding: CARD_IDENTITY_EMBEDDING_DIMENSIONS * CARD_IDENTITY_EMBEDDING_BYTES_PER_VALUE,
      memoryMappable: true,
      int8Comparison: {
        status: 'blocked',
        reason: 'INT8 storage cannot be compared until FP16 reference embeddings exist.',
        retrievalAccuracy: null,
        hardNegativeAccuracy: null,
        exactVariantAccuracy: null,
      },
    },
    canonicalCards: {
      count: cards.length,
      everyActivePilotCardDocumented: cards.length === expectedCount,
      missingReasonCounts: summarizeMissingReasons(cards),
    },
    files: {
      sqlite: {
        path: 'assets/catalogue/card-catalogue.sqlite',
        sha256: sqliteSha256,
        bytes: sqliteBytes,
      },
      embeddings: {
        path: 'assets/catalogue/card-embeddings.bin',
        sha256: embeddingsSha256,
        bytes: embeddingsBytes,
        headerBytes: CARD_IDENTITY_EMBEDDING_BINARY_HEADER_BYTES,
      },
    },
    packages: {
      complete: {
        status,
        files: [
          'assets/catalogue/card-catalogue.sqlite',
          'assets/catalogue/card-embeddings.bin',
          'assets/catalogue/catalogue-manifest.json',
        ],
        atomicInstallInstructions: [
          'Download files to a temporary catalogue directory.',
          'Verify catalogue-manifest.json checksum entries before opening SQLite.',
          'Verify requiredInstalledModelVersion matches the installed card identity model version.',
          'Move the complete directory into place with a single filesystem rename only after all checks pass.',
          'Reject blocked packs and keep the previously installed approved pack.',
        ],
      },
      delta: {
        status: 'blocked',
        fromPackVersion: null,
        files: [],
        atomicInstallInstructions: [
          'Delta updates are blocked until at least one approved complete pack exists.',
        ],
      },
    },
    validationCommands: [
      'verify-catalogue',
      'verify-embedding-count',
      'verify-model-compatibility',
      'verify-checksums',
      'inspect-card-neighbours',
    ],
  };
}
