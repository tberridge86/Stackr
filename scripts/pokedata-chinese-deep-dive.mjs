#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const POKEDATA_BASE_URL = 'https://www.pokedata.io';
const LANGUAGE = 'CHINESE';
const OUTPUT_DIR = path.resolve('tmp', 'pokedata-chinese');

const CARD_PRICE_SOURCES = {
  0: 'raw_average_usd',
  1: 'psa_1_ebay_average_usd',
  2: 'psa_2_ebay_average_usd',
  3: 'psa_3_ebay_average_usd',
  4: 'psa_4_ebay_average_usd',
  5: 'psa_5_ebay_average_usd',
  6: 'psa_6_ebay_average_usd',
  7: 'psa_7_ebay_average_usd',
  8: 'psa_8_ebay_average_usd',
  9: 'psa_9_ebay_average_usd',
  10: 'psa_10_ebay_average_usd',
  11: 'tcgplayer_average_usd',
  12: 'ebay_average_usd',
};

const CARD_PRICE_SOURCE_LABELS = {
  0: 'Raw average',
  1: 'PSA 1 eBay average',
  2: 'PSA 2 eBay average',
  3: 'PSA 3 eBay average',
  4: 'PSA 4 eBay average',
  5: 'PSA 5 eBay average',
  6: 'PSA 6 eBay average',
  7: 'PSA 7 eBay average',
  8: 'PSA 8 eBay average',
  9: 'PSA 9 eBay average',
  10: 'PSA 10 eBay average',
  11: 'TCGplayer average',
  12: 'eBay average',
};

const args = new Set(process.argv.slice(2));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const delayArg = process.argv.find((arg) => arg.startsWith('--delay='));
const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0;
const delayMs = delayArg ? Math.max(250, Number(delayArg.split('=')[1]) || 0) : 800;
const setsOnly = args.has('--sets-only');
const resume = args.has('--resume');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Stackr Chinese catalogue audit',
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
  const sources = [];

  for (const stat of Array.isArray(stats) ? stats : []) {
    const sourceCode = Number(stat?.source);
    const value = typeof stat?.avg === 'number'
      ? stat.avg
      : typeof stat?.avg === 'string' && stat.avg.trim() !== ''
        ? Number(stat.avg)
        : null;
    const key = CARD_PRICE_SOURCES[sourceCode] ?? `source_${stat?.source}_average_usd`;
    const normalizedValue = Number.isFinite(value) ? value : null;
    result[key] = normalizedValue;
    sources.push({
      source: Number.isFinite(sourceCode) ? sourceCode : stat?.source ?? null,
      label: CARD_PRICE_SOURCE_LABELS[sourceCode] ?? `PokeData source ${stat?.source ?? 'unknown'}`,
      average_usd: normalizedValue,
    });
  }

  return {
    values: result,
    sources,
    has_live_value: sources.some((source) => typeof source.average_usd === 'number'),
  };
}

function mapSet(set) {
  return {
    pokedata_id: set.id,
    code: set.code ?? null,
    name: set.name,
    language: set.language,
    series: set.series ?? null,
    live: Boolean(set.live),
    release_date: normalizeDate(set.release_date),
    master_set_value_usd: typeof set.mastersetvalue === 'number' ? set.mastersetvalue : null,
    artwork: {
      logo: set.img_url ?? null,
      symbol: set.symbol_img_url ?? null,
      tile: set.tile_img_url ?? null,
      banner: set.banner_img_url ?? null,
      series: set.series_img_url ?? null,
    },
    source_url: `${POKEDATA_BASE_URL}/sets#CHINESE`,
  };
}

function mapCard(card) {
  const prices = normalizePriceStats(card.stats);
  return {
    pokedata_id: card.id,
    set_id: card.set_id,
    set_code: card.set_code ?? null,
    set_name: card.set_name,
    name: card.name,
    number: card.num ?? null,
    language: card.language,
    live: Boolean(card.live),
    secret: Boolean(card.secret),
    hot: Boolean(card.hot),
    release_date: normalizeDate(card.release_date),
    image: card.img_url ?? null,
    stat_url: card.stat_url ? `${POKEDATA_BASE_URL}${card.stat_url}` : null,
    prices,
  };
}

function summarizeSet(set, cards) {
  const pricedCards = cards.filter((card) => card.prices.has_live_value);
  const rawValues = pricedCards
    .map((card) => card.prices.values.raw_average_usd ?? card.prices.values.ebay_average_usd)
    .filter((value) => typeof value === 'number');
  const psa10Values = pricedCards
    .map((card) => card.prices.values.psa_10_ebay_average_usd)
    .filter((value) => typeof value === 'number');

  return {
    pokedata_id: set.pokedata_id,
    code: set.code,
    name: set.name,
    language: set.language,
    series: set.series,
    release_date: set.release_date,
    live: set.live,
    artwork: set.artwork,
    card_count: cards.length,
    priced_card_count: pricedCards.length,
    unpriced_card_count: cards.length - pricedCards.length,
    raw_or_ebay_value_count: rawValues.length,
    psa_10_value_count: psa10Values.length,
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const allSets = await fetchJson(`${POKEDATA_BASE_URL}/api/sets`);
  const chineseSets = allSets
    .filter((set) => String(set?.tcg ?? '').toLowerCase() === 'pokemon')
    .filter((set) => String(set?.language ?? '').toUpperCase() === LANGUAGE)
    .map(mapSet);
  const selectedSets = limit > 0 ? chineseSets.slice(0, limit) : chineseSets;

  const setsPath = path.join(OUTPUT_DIR, 'pokedata-chinese-sets.json');
  const cardsPath = path.join(OUTPUT_DIR, 'pokedata-chinese-cards.json');
  const indexPath = path.join(OUTPUT_DIR, 'pokedata-chinese-set-card-index.json');

  await fs.writeFile(setsPath, JSON.stringify(chineseSets, null, 2));

  let cards = [];
  if (resume && !setsOnly) {
    cards = JSON.parse(await fs.readFile(cardsPath, 'utf8').catch(() => '[]'));
  }

  const completedSetNames = new Set(cards.map((card) => card.set_name).filter(Boolean));
  const setSummaries = [];

  if (!setsOnly) {
    for (const [index, set] of selectedSets.entries()) {
      if (resume && completedSetNames.has(set.name)) {
        const existingCards = cards.filter((card) => card.set_name === set.name);
        setSummaries.push(summarizeSet(set, existingCards));
        console.log(`${index + 1}/${selectedSets.length} ${set.name}: already scraped`);
        continue;
      }

      const params = new URLSearchParams({
        set_name: set.name,
        tcg: 'Pokemon',
        stats: 'kwan',
      });
      const rows = await fetchJson(`${POKEDATA_BASE_URL}/api/cards?${params.toString()}`);
      const mappedCards = rows.map(mapCard);
      cards.push(...mappedCards);
      setSummaries.push(summarizeSet(set, mappedCards));
      const pricedCount = mappedCards.filter((card) => card.prices.has_live_value).length;
      console.log(`${index + 1}/${selectedSets.length} ${set.name}: ${mappedCards.length} cards, ${pricedCount} priced`);
      await fs.writeFile(cardsPath, JSON.stringify(cards, null, 2));
      await fs.writeFile(indexPath, JSON.stringify(setSummaries, null, 2));
      await sleep(delayMs);
    }
  }

  const sourceCounts = {};
  for (const card of cards) {
    for (const source of card.prices.sources) {
      sourceCounts[source.label] = (sourceCounts[source.label] ?? 0) + (typeof source.average_usd === 'number' ? 1 : 0);
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    source: POKEDATA_BASE_URL,
    source_page: `${POKEDATA_BASE_URL}/sets#CHINESE`,
    language: LANGUAGE,
    chinese_sets: chineseSets.length,
    scraped_sets: selectedSets.length,
    scraped_cards: cards.length,
    priced_cards: cards.filter((card) => card.prices.has_live_value).length,
    unpriced_cards: cards.filter((card) => !card.prices.has_live_value).length,
    price_source_counts: sourceCounts,
    delay_ms: delayMs,
    outputs: {
      sets: setsPath,
      cards: setsOnly ? null : cardsPath,
      set_card_index: setsOnly ? null : indexPath,
    },
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
