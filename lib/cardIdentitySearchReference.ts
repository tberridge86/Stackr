import { CARD_IDENTITY_EMBEDDING_DIMENSIONS } from './cardIdentityCataloguePack';

export const CARD_IDENTITY_SEARCH_ENGINE_VERSION = 'stackr-card-identity-flat-search-v1.0.0';

export type CardIdentitySearchFilters = {
  language?: string | readonly string[] | null;
  setId?: string | readonly string[] | null;
  collectorNumber?: string | readonly string[] | null;
  era?: string | readonly string[] | null;
};

export type ReferenceCardIdentitySearchRecord = {
  canonicalCardId: string;
  embedding: readonly number[];
  language?: string | null;
  setId?: string | null;
  collectorNumber?: string | null;
  era?: string | null;
};

export type ReferenceCardIdentitySearchCandidate = {
  canonicalCardId: string;
  similarity: number;
  rank: number;
  language?: string | null;
  setId?: string | null;
  collectorNumber?: string | null;
  era?: string | null;
};

export type ReferenceCardIdentitySearchResult = {
  status: 'success' | 'empty' | 'failed';
  dimensions: number;
  searchedCount: number;
  candidateCount: number;
  candidates: ReferenceCardIdentitySearchCandidate[];
  message?: string | null;
};

function asSet(value?: string | readonly string[] | null): Set<string> | null {
  if (!value) return null;
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? new Set(normalized) : null;
}

function matchesFilter(actual: string | null | undefined, allowed: Set<string> | null): boolean {
  if (!allowed) return true;
  if (!actual) return false;
  return allowed.has(actual);
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
  }
  return sum;
}

export function l2Normalize(values: readonly number[]): number[] {
  let sumSquares = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding contains a non-finite value.');
    }
    sumSquares += value * value;
  }
  if (sumSquares <= 0) {
    throw new Error('Embedding norm must be greater than zero.');
  }
  const norm = Math.sqrt(sumSquares);
  return values.map((value) => value / norm);
}

export function assertNormalizedEmbedding(
  embedding: readonly number[],
  dimensions = CARD_IDENTITY_EMBEDDING_DIMENSIONS
): void {
  if (embedding.length !== dimensions) {
    throw new Error(`Expected ${dimensions} embedding dimensions; received ${embedding.length}.`);
  }
  let norm = 0;
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding contains a non-finite value.');
    }
    norm += value * value;
  }
  const normError = Math.abs(Math.sqrt(norm) - 1);
  if (normError > 0.025) {
    throw new Error(`Embedding must be L2-normalised; norm error was ${normError.toFixed(6)}.`);
  }
}

export function exactFlatCardIdentitySearch({
  queryEmbedding,
  records,
  topK,
  filters,
  dimensions = CARD_IDENTITY_EMBEDDING_DIMENSIONS,
}: {
  queryEmbedding: readonly number[];
  records: readonly ReferenceCardIdentitySearchRecord[];
  topK: number;
  filters?: CardIdentitySearchFilters | null;
  dimensions?: number;
}): ReferenceCardIdentitySearchResult {
  try {
    assertNormalizedEmbedding(queryEmbedding, dimensions);
  } catch (error) {
    return {
      status: 'failed',
      dimensions,
      searchedCount: 0,
      candidateCount: 0,
      candidates: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (records.length === 0) {
    return {
      status: 'empty',
      dimensions,
      searchedCount: 0,
      candidateCount: 0,
      candidates: [],
      message: 'No embeddings are available to search.',
    };
  }

  const boundedTopK = Math.max(1, Math.min(Math.trunc(topK), 100));
  const language = asSet(filters?.language);
  const setId = asSet(filters?.setId);
  const collectorNumber = asSet(filters?.collectorNumber);
  const era = asSet(filters?.era);
  const candidates: ReferenceCardIdentitySearchCandidate[] = [];
  let searchedCount = 0;

  for (const record of records) {
    if (!matchesFilter(record.language, language)) continue;
    if (!matchesFilter(record.setId, setId)) continue;
    if (!matchesFilter(record.collectorNumber, collectorNumber)) continue;
    if (!matchesFilter(record.era, era)) continue;
    if (record.embedding.length !== dimensions) continue;

    searchedCount += 1;
    candidates.push({
      canonicalCardId: record.canonicalCardId,
      similarity: dotProduct(queryEmbedding, record.embedding),
      rank: 0,
      language: record.language ?? null,
      setId: record.setId ?? null,
      collectorNumber: record.collectorNumber ?? null,
      era: record.era ?? null,
    });
  }

  candidates.sort((left, right) => (
    right.similarity - left.similarity ||
    left.canonicalCardId.localeCompare(right.canonicalCardId)
  ));

  const topCandidates = candidates.slice(0, boundedTopK).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));

  return {
    status: topCandidates.length > 0 ? 'success' : 'empty',
    dimensions,
    searchedCount,
    candidateCount: topCandidates.length,
    candidates: topCandidates,
    message: topCandidates.length > 0 ? null : 'No embeddings matched the supplied filters.',
  };
}

export function createDeterministicSearchRecords(
  count: number,
  dimensions = CARD_IDENTITY_EMBEDDING_DIMENSIONS
): ReferenceCardIdentitySearchRecord[] {
  const languages = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'];
  const eras = ['wotc', 'ex', 'dp', 'bw', 'xy', 'sm', 'swsh', 'sv'];
  const records: ReferenceCardIdentitySearchRecord[] = [];

  for (let cardIndex = 0; cardIndex < count; cardIndex += 1) {
    const raw: number[] = [];
    for (let dimension = 0; dimension < dimensions; dimension += 1) {
      const value =
        Math.sin((cardIndex + 1) * (dimension + 3) * 0.017) +
        Math.cos((cardIndex + 11) * (dimension + 1) * 0.013) * 0.5;
      raw.push(value);
    }

    records.push({
      canonicalCardId: `synthetic-card-${cardIndex.toString().padStart(6, '0')}`,
      embedding: l2Normalize(raw),
      language: languages[cardIndex % languages.length],
      setId: `set-${(cardIndex % 37).toString().padStart(2, '0')}`,
      collectorNumber: String((cardIndex % 230) + 1).padStart(3, '0'),
      era: eras[cardIndex % eras.length],
    });
  }

  return records;
}
