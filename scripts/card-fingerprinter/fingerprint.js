import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import Jimp from 'jimp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Generate a simple pHash from image buffer
async function generatePHash(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    
    const image = await Jimp.read(buffer);
    
    // Resize to 32x32 greyscale — standard pHash prep
    image.resize(32, 32).greyscale();
    
    // Get pixel data and compute mean
    const pixels = [];
    image.scan(0, 0, 32, 32, (x, y, idx) => {
      pixels.push(image.bitmap.data[idx]); // R channel (greyscale so R=G=B)
    });
    
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    
    // Build hash: 1 if pixel > mean, 0 if not
    const hash = pixels.map(p => (p >= mean ? '1' : '0')).join('');
    return hash;
  } catch (err) {
    console.error(`Failed to hash ${imageUrl}:`, err.message);
    return null;
  }
}

// Fetch all cards from your own Supabase table
async function fetchAllCards() {
  const allCards = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    console.log(`Fetching rows ${from} to ${from + batchSize}...`);
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, set_id, image_small')
      .range(from, from + batchSize - 1);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;

    allCards.push(...data);
    console.log(`  Got ${allCards.length} cards so far...`);

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return allCards;
}

// Main run
async function run() {
  console.log('Fetching cards from Supabase...');
  const cards = await fetchAllCards();
  console.log(`Total cards: ${cards.length}`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of cards) {
    const imageUrl = card.image_small;
    if (!imageUrl) { skipped++; continue; }

    const phash = await generatePHash(imageUrl);
    if (!phash) { failed++; continue; }

    const { error } = await supabase
      .from('card_fingerprints')
      .upsert({
        card_id: card.id,
        card_name: card.name,
        set_id: card.set_id,
        image_url: imageUrl,
        phash
      }, { onConflict: 'card_id' });

    if (error) {
      console.error(`DB error for ${card.id}:`, error.message);
      failed++;
    } else {
      inserted++;
      if (inserted % 100 === 0) console.log(`Inserted ${inserted} cards...`);
    }
  }

  console.log(`\nDone! Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);
}

run();