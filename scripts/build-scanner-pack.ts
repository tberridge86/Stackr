import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MODEL = process.env.SCANNER_PACK_MODEL || 'Xenova/clip-vit-base-patch32';
const PACK_ID = process.env.SCANNER_PACK_ID || 'en-clip-base-v1';
const OUT_DIR = process.env.SCANNER_PACK_OUT_DIR || 'backend/data/scanner-packs/en-clip-base-v1';
const PAGE_SIZE = 250;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CardRow = {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set_id: string | null;
  image_small: string | null;
  raw_data: any;
};

type EmbeddingRow = {
  card_id: string;
  embedding: number[];
};

function getPrintedTotal(rawData: any) {
  const total = Number(rawData?.set?.printedTotal ?? rawData?.set?.total ?? NaN);
  return Number.isFinite(total) ? total : null;
}

function normalizeVector(values: number[]) {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return values.map((value) => value / norm);
}

function quantizeUnitVector(values: number[]) {
  const normalized = normalizeVector(values);
  return Int8Array.from(normalized.map((value) => Math.max(-127, Math.min(127, Math.round(value * 127)))));
}

async function fetchEmbeddings() {
  const rows: EmbeddingRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('card_clip_embeddings')
      .select('card_id, embedding')
      .eq('model', MODEL)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as EmbeddingRow[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchCards(ids: string[]) {
  const cards = new Map<string, CardRow>();

  for (let index = 0; index < ids.length; index += PAGE_SIZE) {
    const batch = ids.slice(index, index + PAGE_SIZE);
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, set_id, image_small, raw_data')
      .in('id', batch);

    if (error) throw error;
    for (const row of (data ?? []) as CardRow[]) {
      cards.set(row.id, row);
    }
  }

  return cards;
}

async function main() {
  const startedAt = Date.now();
  const embeddings = await fetchEmbeddings();
  if (embeddings.length === 0) throw new Error(`No embeddings found for model ${MODEL}`);

  const cardMap = await fetchCards(embeddings.map((row) => row.card_id));
  const rows = embeddings
    .map((embeddingRow) => ({ embeddingRow, card: cardMap.get(embeddingRow.card_id) }))
    .filter((row): row is { embeddingRow: EmbeddingRow; card: CardRow } => Boolean(row.card));

  const firstEmbedding = rows[0].embeddingRow.embedding;
  if (!Array.isArray(firstEmbedding) || firstEmbedding.length === 0) {
    throw new Error('First row did not include a valid embedding');
  }

  const dimensions = firstEmbedding.length;
  const vectors = Buffer.alloc(rows.length * dimensions);
  const cards = rows.map((row, index) => {
    const embedding = row.embeddingRow.embedding;
    if (!Array.isArray(embedding) || embedding.length !== dimensions) {
      throw new Error(`Invalid embedding for card ${row.embeddingRow.card_id}`);
    }

    const quantized = quantizeUnitVector(embedding);
    Buffer.from(quantized.buffer, quantized.byteOffset, quantized.byteLength).copy(vectors, index * dimensions);

    return {
      id: row.card.id,
      name: row.card.name,
      setId: row.card.set_id,
      setName: row.card.raw_data?.set?.name ?? row.card.set_id,
      number: row.card.number ?? '',
      printedTotal: getPrintedTotal(row.card.raw_data),
      rarity: row.card.rarity ?? '',
      imageSmall: row.card.image_small ?? '',
    };
  });

  const manifest = {
    id: PACK_ID,
    language: 'en',
    model: MODEL,
    quantization: 'int8-normalized',
    dimensions,
    vectorFile: 'vectors.i8',
    cardCount: cards.length,
    generatedAt: new Date().toISOString(),
    cards,
  };

  const absoluteOutDir = path.resolve(OUT_DIR);
  await mkdir(absoluteOutDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(absoluteOutDir, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(path.join(absoluteOutDir, 'vectors.i8'), vectors),
  ]);

  console.log(JSON.stringify({
    ok: true,
    packId: PACK_ID,
    model: MODEL,
    cards: cards.length,
    dimensions,
    manifest: path.join(OUT_DIR, 'manifest.json'),
    vectors: path.join(OUT_DIR, 'vectors.i8'),
    vectorBytes: vectors.byteLength,
    totalMs: Date.now() - startedAt,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
