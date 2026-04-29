import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'https://api.pokemontcg.io/v2';

async function syncSets() {
  let page = 1;
  let allSets: any[] = [];

  while (true) {
    const res = await fetch(`${API_BASE}/sets?page=${page}&pageSize=250`);
    const json = await res.json();

    if (!json.data.length) break;

    allSets.push(...json.data);
    console.log(`Fetched sets page ${page}`);

    page++;
  }

  const rows = allSets.map((set: any) => ({
    id: set.id,
    name: set.name,
    series: set.series,
    printed_total: set.printedTotal,
    total: set.total,
    release_date: set.releaseDate,
    symbol_url: set.images?.symbol ?? null,
    logo_url: set.images?.logo ?? null,
  }));

  await supabase.from('pokemon_sets').upsert(rows);
  console.log('✅ Sets synced:', rows.length);
}

async function syncCards() {
  let page = 1;
  let totalFetched = 0;

  while (true) {
    const res = await fetch(`${API_BASE}/cards?page=${page}&pageSize=250`);
    const json = await res.json();

    if (!json.data.length) break;

    const rows = json.data.map((card: any) => ({
      id: card.id,
      set_id: card.set.id,
      name: card.name,
      number: card.number,
      rarity: card.rarity ?? null,
      image_small: card.images?.small ?? null,
      image_large: card.images?.large ?? null,
      raw_data: card,
    }));

    await supabase.from('pokemon_cards').upsert(rows);

    totalFetched += rows.length;

    console.log(`Fetched cards page ${page} (total: ${totalFetched})`);

    page++;
  }

  console.log('✅ ALL cards synced:', totalFetched);
}

async function run() {
  await syncSets();
  await syncCards();
}

run();