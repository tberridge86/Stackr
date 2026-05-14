import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { pipeline, RawImage } from '@huggingface/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, '../../backend/.env') });
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIP_MODEL = process.env.CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
const BATCH_SIZE = Number(process.env.CLIP_EMBED_BATCH_SIZE || 25);
const LIMIT = Number(process.env.CLIP_EMBED_LIMIT || 0);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const extractor = await pipeline('image-feature-extraction', CLIP_MODEL);

async function fetchPendingCards(offset) {
  const { data, error } = await supabase
    .from('pokemon_cards')
    .select('id, image_large, image_small')
    .not('image_small', 'is', null)
    .order('id', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) throw error;
  return data ?? [];
}

async function hasEmbedding(cardId) {
  const { data, error } = await supabase
    .from('card_clip_embeddings')
    .select('card_id')
    .eq('card_id', cardId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function embedCard(card) {
  const url = card.image_large || card.image_small;
  if (!url) return null;

  const image = await RawImage.fromURL(url);
  const tensor = await extractor(image);
  const embedding = Array.from(tensor.data);

  return {
    card_id: card.id,
    model: CLIP_MODEL,
    dimensions: embedding.length,
    embedding,
    updated_at: new Date().toISOString(),
  };
}

let offset = 0;
let inserted = 0;
let skipped = 0;
let failed = 0;

while (true) {
  const cards = await fetchPendingCards(offset);
  if (cards.length === 0) break;

  for (const card of cards) {
    if (LIMIT && inserted >= LIMIT) break;

    try {
      if (await hasEmbedding(card.id)) {
        skipped += 1;
        continue;
      }

      const row = await embedCard(card);
      if (!row) {
        failed += 1;
        continue;
      }

      const { error } = await supabase
        .from('card_clip_embeddings')
        .upsert(row, { onConflict: 'card_id' });

      if (error) throw error;
      inserted += 1;

      if (inserted % 10 === 0) {
        console.log(`Inserted ${inserted} CLIP embeddings...`);
      }
    } catch (error) {
      failed += 1;
      console.log(`Embedding failed for ${card.id}:`, error?.message ?? String(error));
    }
  }

  if (LIMIT && inserted >= LIMIT) break;
  offset += cards.length;
}

console.log(JSON.stringify({ inserted, skipped, failed, model: CLIP_MODEL }, null, 2));
