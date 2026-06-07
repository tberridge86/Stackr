import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function canonicalImages(card) {
  const rawSmall = card.raw_data?.images?.small;
  const rawLarge = card.raw_data?.images?.large;
  if (rawSmall || rawLarge) {
    return {
      small: rawSmall ?? card.image_small ?? null,
      large: rawLarge ?? card.image_large ?? null,
    };
  }

  const setId = card.set_id || String(card.id).split('-')[0];
  const prefix = `${setId}-`;
  const idNumber = String(card.id).startsWith(prefix)
    ? String(card.id).slice(prefix.length)
    : String(Number(card.number));

  return {
    small: `https://images.pokemontcg.io/${setId}/${idNumber}.png`,
    large: `https://images.pokemontcg.io/${setId}/${idNumber}_hires.png`,
  };
}

async function loadMismatches() {
  const pageSize = 1000;
  let from = 0;
  const mismatches = [];
  let total = 0;

  while (true) {
      const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id,set_id,number,image_small,image_large,raw_data')
      .range(from, from + pageSize - 1)
      .order('id');

    if (error) throw error;
    if (!data?.length) break;

    for (const card of data) {
      total += 1;
      const expected = canonicalImages(card);

      if (card.image_small !== expected.small || card.image_large !== expected.large) {
        mismatches.push({
          id: card.id,
          small: expected.small,
          large: expected.large,
          setId: card.set_id,
        });
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { total, mismatches };
}

async function updateMismatches(mismatches) {
  const chunkSize = 50;
  let updated = 0;

  for (let i = 0; i < mismatches.length; i += chunkSize) {
    const chunk = mismatches.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from('pokemon_cards')
          .update({
            image_small: row.small,
            image_large: row.large,
          })
          .eq('id', row.id)
      )
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    updated += chunk.length;
    console.log(JSON.stringify({ updated, total: mismatches.length }));
  }

  return updated;
}

const { total, mismatches } = await loadMismatches();
console.log(JSON.stringify({ total, toUpdate: mismatches.length }));

const updated = await updateMismatches(mismatches);
console.log(JSON.stringify({ done: true, updated }, null, 2));
