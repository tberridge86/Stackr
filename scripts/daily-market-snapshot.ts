import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchLivePricesForCardIds } from '../lib/pricing';
import { fetchEbayPrice } from '../lib/ebay';

type EbayResponse = {
  low?: number | string | null;
  average?: number | string | null;
  high?: number | string | null;
  count?: number | string | null;
  rawCount?: number | string | null;
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

function toInteger(value: number | string | null | undefined): number {
  const parsed = toNumber(value);
  return parsed == null ? 0 : Math.round(parsed);
}

function buildEbayQuery(card: any): string {
  const number =
    card.card_number && card.set_total
      ? `${card.card_number}/${card.set_total}`
      : card.card_number;

  return [card.card_name, number, card.set_name, 'pokemon card']
    .filter(Boolean)
    .join(' ');
}

async function runDailyMarketSnapshot() {
  console.log('🚀 Snapshot started');

  const { data: cards, error } = await supabase
    .from('binder_cards')
    .select(
      'card_id, set_id, api_card_id, api_set_id, card_name, card_number, set_name, set_total'
    )
    .eq('owned', true);

  if (error) throw error;

  if (!cards || cards.length === 0) {
    console.log('⚠️ No owned cards found');
    return;
  }

  console.log(`📦 Found ${cards.length} owned cards`);

  const uniqueCards = Array.from(
    new Map(cards.map((card) => [card.api_card_id || card.card_id, card])).values()
  );

  const cardIds = uniqueCards.map((card) => card.api_card_id || card.card_id);

  console.log(`🔍 Fetching TCG prices for ${cardIds.length} unique cards`);

  const priceMap = await fetchLivePricesForCardIds(cardIds);

  let savedCount = 0;
  let missingTcgCount = 0;
  let ebayCount = 0;

  for (const card of uniqueCards) {
    const lookupId = card.api_card_id || card.card_id;
    const displayName = card.card_name || lookupId;
    const tcgPrice = priceMap[lookupId];

    if (typeof tcgPrice !== 'number') {
      missingTcgCount += 1;
      console.log(`⚠️ No TCG price found for ${displayName}`);
    }

    let ebay: EbayResponse = {
      low: null,
      average: null,
      high: null,
      count: 0,
    };

    const ebayQuery = buildEbayQuery(card);

    try {
      console.log(`🟡 eBay query: ${ebayQuery}`);

      ebay = await fetchEbayPrice(ebayQuery);

      if (toNumber(ebay.average) !== null) {
        ebayCount += 1;
      }
    } catch (err) {
      console.log(`⚠️ eBay fetch failed for ${displayName}`, err);
    }

    const snapshot = {
      card_id: card.card_id,
      set_id: card.set_id,

      tcg_low: null,
      tcg_mid: typeof tcgPrice === 'number' ? tcgPrice : null,

      cardmarket_trend: null,

      ebay_low: toNumber(ebay.low),
      ebay_average: toNumber(ebay.average),
      ebay_high: toNumber(ebay.high),
      ebay_count: toInteger(ebay.count ?? ebay.rawCount),

      snapshot_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('market_price_snapshots')
      .insert(snapshot);

    if (insertError) {
      console.error(`❌ Insert failed for ${displayName}:`, insertError);
      continue;
    }

    savedCount += 1;

    console.log(
      `✅ Snapshot saved for ${displayName} | TCG: ${
        snapshot.tcg_mid ?? 'none'
      } | eBay: ${snapshot.ebay_average ?? 'none'}`
    );
  }

  console.log('✅ Snapshot complete');
  console.log(`💾 Saved: ${savedCount}`);
  console.log(`⚠️ Missing TCG prices: ${missingTcgCount}`);
  console.log(`🟡 eBay prices found: ${ebayCount}`);

  const { error: updateError } = await supabase.rpc(
    'update_binder_card_prices'
  );

  if (updateError) {
    throw updateError;
  }

  console.log('✅ Binder card prices updated');
}

runDailyMarketSnapshot()
  .then(() => {
    console.log('🎉 Daily market snapshot job finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Daily snapshot job failed:', error);
    process.exit(1);
  });