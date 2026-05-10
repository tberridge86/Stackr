import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import Jimp from 'jimp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ===============================
// DCT PHASH — must match server.js exactly
// ===============================

function dct1D(signal) {
  const N = signal.length;
  const out = new Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    }
    out[k] = sum;
  }
  return out;
}

function dct2D(pixels, N) {
  // Row-wise DCT
  const temp = new Array(N * N);
  for (let row = 0; row < N; row++) {
    const r = dct1D(pixels.slice(row * N, (row + 1) * N));
    for (let col = 0; col < N; col++) temp[row * N + col] = r[col];
  }
  // Column-wise DCT
  const result = new Array(N * N);
  for (let col = 0; col < N; col++) {
    const c = [];
    for (let row = 0; row < N; row++) c.push(temp[row * N + col]);
    const dc = dct1D(c);
    for (let row = 0; row < N; row++) result[row * N + col] = dc[row];
  }
  return result;
}

async function generatePHash(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    const image = await Jimp.read(buffer);

    const { width, height } = image.bitmap;

    // Crop to art region — skip name/HP bar at top, stop before attacks/text.
    // For standard cards this is roughly 12%–58% of card height.
    // Full-art cards benefit even more since the entire crop is unique art.
    const cropTop = Math.floor(height * 0.12);
    const cropHeight = Math.floor(height * 0.46);
    image.crop(0, cropTop, width, cropHeight);

    image.resize(32, 32).greyscale();

    const pixels = [];
    image.scan(0, 0, 32, 32, (_x, _y, idx) => {
      pixels.push(image.bitmap.data[idx]);
    });

    // Contrast normalise — removes lighting variation
    const min = Math.min(...pixels);
    const max = Math.max(...pixels);
    const range = max - min || 1;
    const normalized = pixels.map(p => (p - min) / range);

    // 2D DCT
    const dct = dct2D(normalized, 32);

    // Extract top-left 8×8 frequency coefficients, skip DC at [0,0]
    const coeffs = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row === 0 && col === 0) continue;
        coeffs.push(dct[row * 32 + col]);
      }
    }

    // Threshold at median → 63-bit hash
    const sorted = [...coeffs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return coeffs.map(c => (c > median ? '1' : '0')).join('');
  } catch (err) {
    console.error(`Failed to hash ${imageUrl}:`, err.message);
    return null;
  }
}

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
        phash,
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
