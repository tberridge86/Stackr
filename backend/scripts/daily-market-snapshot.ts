import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

type EbayResponse = {
  low?: number | string;
  average?: number | string;
  high?: number | string;
  count?: number | string;
  rawCount?: number | string;
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toInteger(value: number | string | null | undefined): number | null {
  const parsed = toNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

async function runDailyMarketSnapshot() {
  const { data: watchlist, error: watchError } = await supabase
    .from('market_watchlist')
    .select('card_id, set_id');

  if (watchError) {
    throw watchError;
  }

  if (!watchlist?.length) {
    console.log('No watched cards found.');
    return;
  }

  console.log(`Found ${watchlist.length} watched cards.`);

  for (const item of watchlist) {
    try {
      const pokemonRes = await fetch(
        `https://api.pokemontcg.io/v2/cards/${item.card_id}`
      );

      if (!pokemonRes.ok) {
        throw new Error(`Pokemon TCG fetch failed: ${pokemonRes.status}`);
      }

      const pokemonJson = await pokemonRes.json();
      const card = pokemonJson?.data;

      const tcgPrices = card?.tcgplayer?.prices
        ? (Object.values(card.tcgplayer.prices)[0] as any)
        : null;

      const cardmarketPrices = card?.cardmarket?.prices
        ? (Object.values(card.cardmarket.prices)[0] as any)
        : null;

      const ebayQuery = `${card?.name ?? ''} ${card?.set?.name ?? ''}`.trim();

      let ebay: EbayResponse = {};
      if (ebayQuery) {
        const ebayRes = await fetch(
          `${process.env.PRICE_API_URL}/price?q=${encodeURIComponent(ebayQuery)}`
        );

        if (ebayRes.ok) {
          ebay = (await ebayRes.json()) as EbayResponse;
        } else {
          console.log(
            `eBay price fetch failed for ${item.card_id}: ${ebayRes.status}`
          );
        }
      }

      const { error: insertError } = await supabase
        .from('market_price_snapshots')
        .insert({
          card_id: item.card_id,
          set_id: item.set_id,
          tcg_low: toNumber(tcgPrices?.low),
          tcg_mid: toNumber(tcgPrices?.mid),
          cardmarket_trend: toNumber(cardmarketPrices?.trendPrice),
          ebay_low: toNumber(ebay?.low),
          ebay_average: toNumber(ebay?.average),
          ebay_high: toNumber(ebay?.high),
          ebay_count: toInteger(ebay?.count ?? ebay?.rawCount),
        });

      if (insertError) {
        throw insertError;
      }

      console.log(`Snapshot saved for ${item.card_id}`);
    } catch (error) {
      console.error(`Snapshot failed for ${item.card_id}`, error);
    }
  }

  console.log('Daily market snapshot complete.');
}

runDailyMarketSnapshot()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Daily snapshot job failed', error);
    process.exit(1);
  });
