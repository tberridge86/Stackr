import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { PRICE_API_URL } from './config';
import type { LocalScanCard } from './localCardIndex';

const MANIFEST_KEY = 'stackr:scanner-pack:manifest:v2';
const PACK_DIR = `${FileSystem.documentDirectory ?? ''}scanner-packs`;

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
  localManifestUri?: string;
  localVectorsUri?: string;
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

async function ensurePackDir() {
  const info = await FileSystem.getInfoAsync(PACK_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PACK_DIR, { intermediates: true });
  }
}

function getManifestUri(packId: string) {
  return `${PACK_DIR}/${packId}.manifest.json`;
}

function getVectorsUri(packId: string) {
  return `${PACK_DIR}/${packId}.vectors.i8`;
}

async function readVectorFile(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  return new Int8Array(bytes.buffer);
}

async function loadStoredPack() {
  const rawManifest = await AsyncStorage.getItem(MANIFEST_KEY);
  if (!rawManifest) return null;

  const storedManifest = JSON.parse(rawManifest) as ScannerPackManifest;
  if (!storedManifest.localManifestUri || !storedManifest.localVectorsUri) return null;

  const [manifestInfo, vectorsInfo] = await Promise.all([
    FileSystem.getInfoAsync(storedManifest.localManifestUri),
    FileSystem.getInfoAsync(storedManifest.localVectorsUri),
  ]);
  if (!manifestInfo.exists || !vectorsInfo.exists) return null;

  const manifestRaw = await FileSystem.readAsStringAsync(storedManifest.localManifestUri);
  const manifest = {
    ...(JSON.parse(manifestRaw) as ScannerPackManifest),
    localManifestUri: storedManifest.localManifestUri,
    localVectorsUri: storedManifest.localVectorsUri,
  };
  const vectors = await readVectorFile(storedManifest.localVectorsUri);
  return { manifest, vectors };
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
  if (current && current.manifest.id === latest.id && current.manifest.generatedAt === latest.generatedAt) {
    return current.manifest;
  }

  await ensurePackDir();
  const manifestUri = getManifestUri(latest.id);
  const vectorsUri = getVectorsUri(latest.id);

  const manifestDownload = await FileSystem.downloadAsync(`${PRICE_API_URL}${latest.manifestUrl}`, manifestUri);
  if (manifestDownload.status !== 200) {
    throw new Error(`Scanner pack manifest failed: ${manifestDownload.status}`);
  }

  const vectorsDownload = await FileSystem.downloadAsync(`${PRICE_API_URL}${latest.vectorsUrl}`, vectorsUri);
  if (vectorsDownload.status !== 200) {
    throw new Error(`Scanner pack vectors failed: ${vectorsDownload.status}`);
  }

  const manifestRaw = await FileSystem.readAsStringAsync(manifestUri);
  const manifest = {
    ...(JSON.parse(manifestRaw) as ScannerPackManifest),
    localManifestUri: manifestUri,
    localVectorsUri: vectorsUri,
  };

  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify({
    id: manifest.id,
    generatedAt: manifest.generatedAt,
    localManifestUri: manifest.localManifestUri,
    localVectorsUri: manifest.localVectorsUri,
  }));

  memoryPack = { manifest, vectors: await readVectorFile(vectorsUri) };
  return manifest;
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
