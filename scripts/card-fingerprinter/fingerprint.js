import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import Jimp from 'jimp';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HASH_SIZE = 32;
const DCT_SIZE = 8;
const ALGORITHM_VERSION = 2;

const FINGERPRINT_REGIONS = [
  { key: 'full', x: 0, y: 0, width: 1, height: 1 },
  { key: 'art', x: 0, y: 0.12, width: 1, height: 0.46 },
  { key: 'name', x: 0, y: 0.02, width: 1, height: 0.16 },
  { key: 'lower', x: 0, y: 0.56, width: 1, height: 0.34 },
  { key: 'center', x: 0, y: 0.22, width: 1, height: 0.58 },
];

// ===============================
// DCT PHASH - must match backend/server.js
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
  const temp = new Array(N * N);
  for (let row = 0; row < N; row++) {
    const r = dct1D(pixels.slice(row * N, (row + 1) * N));
    for (let col = 0; col < N; col++) temp[row * N + col] = r[col];
  }

  const result = new Array(N * N);
  for (let col = 0; col < N; col++) {
    const c = [];
    for (let row = 0; row < N; row++) c.push(temp[row * N + col]);
    const dc = dct1D(c);
    for (let row = 0; row < N; row++) result[row * N + col] = dc[row];
  }
  return result;
}

function cropRegion(image, region) {
  const { width, height } = image.bitmap;
  const x = Math.max(0, Math.floor(width * region.x));
  const y = Math.max(0, Math.floor(height * region.y));
  const cropWidth = Math.max(1, Math.min(width - x, Math.floor(width * region.width)));
  const cropHeight = Math.max(1, Math.min(height - y, Math.floor(height * region.height)));
  return image.clone().crop(x, y, cropWidth, cropHeight);
}

function hashPreparedImage(image) {
  image.resize(HASH_SIZE, HASH_SIZE).greyscale();

  const pixels = [];
  image.scan(0, 0, HASH_SIZE, HASH_SIZE, (_x, _y, idx) => {
    pixels.push(image.bitmap.data[idx]);
  });

  const min = Math.min(...pixels);
  const max = Math.max(...pixels);
  const range = max - min || 1;
  const normalized = pixels.map((p) => (p - min) / range);

  const dct = dct2D(normalized, HASH_SIZE);
  const coeffs = [];
  for (let row = 0; row < DCT_SIZE; row++) {
    for (let col = 0; col < DCT_SIZE; col++) {
      if (row === 0 && col === 0) continue;
      coeffs.push(dct[row * HASH_SIZE + col]);
    }
  }

  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return coeffs.map((c) => (c > median ? '1' : '0')).join('');
}

async function generateFingerprints(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const image = await Jimp.read(buffer);

    const fingerprints = {};
    for (const region of FINGERPRINT_REGIONS) {
      fingerprints[region.key] = hashPreparedImage(cropRegion(image, region));
    }

    return fingerprints;
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
      .select('id, name, set_id, image_small, image_large')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
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
    const imageUrl = card.image_large || card.image_small;
    if (!imageUrl) {
      skipped++;
      continue;
    }

    const fingerprints = await generateFingerprints(imageUrl);
    if (!fingerprints) {
      failed++;
      continue;
    }

    const { error } = await supabase
      .from('card_fingerprints')
      .upsert({
        card_id: card.id,
        card_name: card.name,
        set_id: card.set_id,
        image_url: imageUrl,
        phash: fingerprints.art,
        fingerprints,
        algorithm_version: ALGORITHM_VERSION,
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
