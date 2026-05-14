import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRICE_API_URL } from './config';
import type { LocalScanCard } from './localCardIndex';

const MANIFEST_KEY = 'stackr:scanner-pack:manifest:v1';
const VECTORS_KEY_PREFIX = 'stackr:scanner-pack:vectors:v1:';
const VECTOR_CHUNK_SIZE = 64 * 1024;

export type ScannerPackCard = {
  id: string;
  name: string;
  setId: string | null;
  setName: string | null;
  number: string;
  printedTotal: number | null;
  rarity: string;
  imageSmall: string;
};

export type ScannerPackManifest = {
  id: string;
  language: string;
  model: string;
  quantization: 'int8-normalized';
  dimensions: number;
  vectorFile: string;
  cardCount: number;
  generatedAt: string;
  cards: ScannerPackCard[];
  vectorChunkCount?: number;
};

export type ScannerPackSearchResult = {
  card: ScannerPackCard;
  similarity: number;
};

let memoryPack: { manifest: ScannerPackManifest; vectors: Int8Array } | null = null;

function toLocalScanCard(card: ScannerPackCard): LocalScanCard {
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    set_id: card.setId ?? '',
    set_name: card.setName ?? card.setId ?? '',
    set_printed_total: card.printedTotal,
    image_small: card.imageSmall,
    rarity: card.rarity,
  };
}

function base64ToBytes(value: string) {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function storeVectors(packId: string, vectors: Uint8Array) {
  const entries: [string, string][] = [];
  let chunkCount = 0;

  for (let offset = 0; offset < vectors.length; offset += VECTOR_CHUNK_SIZE) {
    entries.push([
      `${VECTORS_KEY_PREFIX}${packId}:${chunkCount}`,
      bytesToBase64(vectors.slice(offset, offset + VECTOR_CHUNK_SIZE)),
    ]);
    chunkCount += 1;
  }

  await AsyncStorage.multiSet(entries);
  return chunkCount;
}

async function loadStoredPack() {
  const rawManifest = await AsyncStorage.getItem(MANIFEST_KEY);
  if (!rawManifest) return null;

  const manifest = JSON.parse(rawManifest) as ScannerPackManifest;
  if (!manifest.vectorChunkCount) return null;

  const chunkKeys = Array.from(
    { length: manifest.vectorChunkCount },
    (_, index) => `${VECTORS_KEY_PREFIX}${manifest.id}:${index}`
  );
  const chunks = await AsyncStorage.multiGet(chunkKeys);
  const totalBytes = manifest.cardCount * manifest.dimensions;
  const vectors = new Uint8Array(totalBytes);
  let offset = 0;

  for (const [, raw] of chunks) {
    if (!raw) return null;
    const bytes = base64ToBytes(raw);
    vectors.set(bytes, offset);
    offset += bytes.length;
  }

  return { manifest, vectors: new Int8Array(vectors.buffer) };
}

export async function getScannerPack() {
  if (memoryPack) return memoryPack;
  memoryPack = await loadStoredPack();
  return memoryPack;
}

export async function syncScannerPack() {
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');

  const latestRes = await fetch(`${PRICE_API_URL}/api/scanner-packs/latest`);
  if (!latestRes.ok) throw new Error(`Scanner pack latest failed: ${latestRes.status}`);
  const latest = await latestRes.json();

  const current = await getScannerPack();
  if (current?.manifest?.id === latest.id && current.manifest.generatedAt === latest.generatedAt) {
    return current.manifest;
  }

  const manifestRes = await fetch(`${PRICE_API_URL}${latest.manifestUrl}`);
  if (!manifestRes.ok) throw new Error(`Scanner pack manifest failed: ${manifestRes.status}`);
  const manifest = await manifestRes.json() as ScannerPackManifest;

  const vectorsRes = await fetch(`${PRICE_API_URL}${latest.vectorsUrl}`);
  if (!vectorsRes.ok) throw new Error(`Scanner pack vectors failed: ${vectorsRes.status}`);
  const vectorBytes = new Uint8Array(await vectorsRes.arrayBuffer());
  const vectorChunkCount = await storeVectors(manifest.id, vectorBytes);

  const storedManifest = { ...manifest, vectorChunkCount };
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(storedManifest));
  memoryPack = { manifest: storedManifest, vectors: new Int8Array(vectorBytes.buffer) };
  return storedManifest;
}

function dotInt8Float(vectors: Int8Array, offset: number, query: Float32Array, dimensions: number) {
  let score = 0;
  for (let index = 0; index < dimensions; index += 1) {
    score += (vectors[offset + index] / 127) * query[index];
  }
  return score;
}

export async function searchScannerPack(
  queryEmbedding: Float32Array,
  options?: { limit?: number; candidateIds?: Set<string> | string[] }
): Promise<ScannerPackSearchResult[]> {
  const pack = await getScannerPack();
  if (!pack) return [];

  const dimensions = pack.manifest.dimensions;
  if (queryEmbedding.length !== dimensions) {
    throw new Error(`Query embedding has ${queryEmbedding.length} dimensions; expected ${dimensions}`);
  }

  const candidateIds = options?.candidateIds
    ? new Set(Array.isArray(options.candidateIds) ? options.candidateIds : [...options.candidateIds])
    : null;
  const limit = options?.limit ?? 10;
  const best: ScannerPackSearchResult[] = [];

  for (let cardIndex = 0; cardIndex < pack.manifest.cards.length; cardIndex += 1) {
    const card = pack.manifest.cards[cardIndex];
    if (candidateIds && !candidateIds.has(card.id)) continue;

    const similarity = dotInt8Float(pack.vectors, cardIndex * dimensions, queryEmbedding, dimensions);
    if (best.length < limit || similarity > best[best.length - 1].similarity) {
      best.push({ card, similarity });
      best.sort((a, b) => b.similarity - a.similarity);
      if (best.length > limit) best.pop();
    }
  }

  return best;
}

export function scannerPackCardToLocalCard(card: ScannerPackCard) {
  return toLocalScanCard(card);
}
