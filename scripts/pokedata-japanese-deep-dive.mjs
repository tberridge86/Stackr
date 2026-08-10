#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const POKEDATA_BASE_URL = 'https://www.pokedata.io';
const OUTPUT_DIR = path.resolve('tmp', 'pokedata-japanese');
const CARD_PRICE_SOURCES = {
  0: 'raw_average_usd',
  11: 'tcgplayer_average_usd',
  12: 'ebay_average_usd',
};

const args = new Set(process.argv.slice(2));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const delayArg = process.argv.find((arg) => arg.startsWith('--delay='));
const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0;
const delayMs = delayArg ? Math.max(250, Number(delayArg.split('=')[1]) || 0) : 1400;
const setsOnly = args.has('--sets-only');
const resume = args.has('--resume');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Stackr catalogue audit',
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt <= 6) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(45000, attempt * attempt * 3500);
      console.log(`Waiting ${Math.round(waitMs / 1000)}s after ${response.status} from PokeData...`);
      await sleep(waitMs);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return json;
}

function normalizeDate(value) {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? String(value ?? '').trim() : date.toISOString().slice(0, 10);
}

function normalizePriceStats(stats) {
  const result = {};
  for (const stat of Array.isArray(stats) ? stats : []) {
    const key = CARD_PRICE_SOURCES[Number(stat?.source)] ?? `source_${stat?.source}`;
    const value = Number(stat?.avg);
    result[key] = Number.isFinite(value) ? value : null;
  }
  return result;
}

function mapSet(set) {
  return {
    pokedata_id: set.id,
    code: set.code ?? null,
    name: set.name,
    language: set.language,
    series: set.series ?? null,
    release_date: normalizeDate(set.release_date),
    master_set_value_usd: typeof set.mastersetvalue === 'number' ? set.mastersetvalue : null,
    artwork: {
      logo: set.img_url ?? null,
      symbol: set.symbol_img_url ?? null,
      tile: set.tile_img_url ?? null,
      banner: set.banner_img_url ?? null,
      series: set.series_img_url ?? null,
    },
  };
}

function mapCard(card) {
  return {
    pokedata_id: card.id,
    set_id: card.set_id,
    set_name: card.set_name,
    name: card.name,
    number: card.num ?? null,
    language: card.language,
    secret: Boolean(card.secret),
    release_date: normalizeDate(card.release_date),
    image: card.img_url ?? null,
    prices: normalizePriceStats(card.stats),
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const allSets = await fetchJson(`${POKEDATA_BASE_URL}/api/sets`);
  const japaneseSets = allSets
    .filter((set) => String(set?.tcg ?? '').toLowerCase() === 'pokemon')
    .filter((set) => String(set?.language ?? '').toUpperCase() === 'JAPANESE')
    .map(mapSet);
  const selectedSets = limit > 0 ? japaneseSets.slice(0, limit) : japaneseSets;

  await fs.writeFile(
    path.join(OUTPUT_DIR, 'pokedata-japanese-sets.json'),
    JSON.stringify(japaneseSets, null, 2),
  );

  const cardsPath = path.join(OUTPUT_DIR, 'pokedata-japanese-cards.json');
  let cards = [];
  if (resume && !setsOnly) {
    cards = JSON.parse(await fs.readFile(cardsPath, 'utf8').catch(() => '[]'));
  }
  const completedSetNames = new Set(cards.map((card) => card.set_name).filter(Boolean));

  if (!setsOnly) {
    for (const [index, set] of selectedSets.entries()) {
      if (resume && completedSetNames.has(set.name)) {
        console.log(`${index + 1}/${selectedSets.length} ${set.name}: already scraped`);
        continue;
      }
      const params = new URLSearchParams({
        set_name: set.name,
        tcg: 'Pokemon',
        stats: 'kwan',
      });
      const rows = await fetchJson(`${POKEDATA_BASE_URL}/api/cards?${params.toString()}`);
      cards.push(...rows.map(mapCard));
      console.log(`${index + 1}/${selectedSets.length} ${set.name}: ${rows.length} cards`);
      await fs.writeFile(cardsPath, JSON.stringify(cards, null, 2));
      await sleep(delayMs);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    source: POKEDATA_BASE_URL,
    japanese_sets: japaneseSets.length,
    scraped_sets: selectedSets.length,
    scraped_cards: cards.length,
    sets_output: path.join(OUTPUT_DIR, 'pokedata-japanese-sets.json'),
    delay_ms: delayMs,
    cards_output: setsOnly ? null : cardsPath,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
