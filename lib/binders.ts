import { supabase } from './supabase';
import { fetchCardsForSet } from './pokemonTcg';
import { createActivityPost } from './activity';
import { USD_TO_GBP } from './config';

export type BinderType = 'official' | 'custom';

export type BinderRecord = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  gradient?: string[] | null;
  cover_key?: string | null;
  type: BinderType;
  is_public: boolean | null;
  source_set_id: string | null;
  created_at: string;
  ebay_value?: number | null;
  tcg_value?: number | null;
  cardmarket_value?: number | null;
  edition?: string | null;
};

export type BinderCardRecord = {
  card?: any | null;
  id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  api_card_id: string | null;
  card_name: string | null;
  api_set_id: string | null;
  card_number: string | null;
  image_url: string | null;
  set_name: string | null;
  set_total: number | null;
  slot_order: number;
  owned: boolean;
  condition: string;
  notes: string;
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  last_price_update: string | null;
  created_at: string;
};

type BinderSnapshotPriceFields = {
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  last_price_update: string | null;
};

export async function fetchLatestSnapshotPrices(
  cardIds: string[]
): Promise<Map<string, BinderSnapshotPriceFields>> {
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  const latestByCardId = new Map<string, BinderSnapshotPriceFields>();

  if (!uniqueCardIds.length) return latestByCardId;

  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('card_id, ebay_average, tcg_mid, tcg_low, cardmarket_trend, snapshot_at')
    .in('card_id', uniqueCardIds)
    .order('snapshot_at', { ascending: false });

  if (error) {
    console.log('Latest binder snapshot prices failed:', error.message);
    return latestByCardId;
  }

  for (const row of data ?? []) {
    if (latestByCardId.has(row.card_id)) continue;

    latestByCardId.set(row.card_id, {
      ebay_price: row.ebay_average ?? null,
      tcg_price: row.tcg_mid ?? row.tcg_low ?? null,
      cardmarket_price: row.cardmarket_trend ?? null,
      last_price_update: row.snapshot_at ?? null,
    });
  }

  const missingCardIds = uniqueCardIds.filter((cardId) => {
    const existing = latestByCardId.get(cardId);
    return !existing || existing.tcg_price == null || existing.cardmarket_price == null;
  });

  if (missingCardIds.length) {
    const { data: cards, error: cardError } = await supabase
      .from('pokemon_cards')
      .select('id, raw_data')
      .in('id', missingCardIds);

    if (cardError) {
      console.log('Fallback binder card prices failed:', cardError.message);
    } else {
      for (const card of cards ?? []) {
        const raw = card.raw_data ?? {};
        const tcgPrice = getPriceFromPokemonCard(raw);
        const cardmarketPrice = getCardmarketPriceFromPokemonCard(raw);

        const existing = latestByCardId.get(card.id);
        if (!existing && tcgPrice == null && cardmarketPrice == null) continue;

        latestByCardId.set(card.id, {
          ebay_price: existing?.ebay_price ?? null,
          tcg_price: existing?.tcg_price ?? tcgPrice,
          cardmarket_price: existing?.cardmarket_price ?? cardmarketPrice,
          last_price_update: existing?.last_price_update ?? null,
        });
      }
    }
  }

  return latestByCardId;
}

async function attachLatestSnapshotPrices<T extends BinderCardRecord>(
  rows: T[]
): Promise<T[]> {
  const latestByCardId = await fetchLatestSnapshotPrices(
    rows.map((row) => row.card_id)
  );

  return rows.map((row) => {
    const snapshot = latestByCardId.get(row.card_id);
    if (!snapshot) return row;

    return {
      ...row,
      ebay_price: snapshot.ebay_price ?? row.ebay_price ?? null,
      tcg_price: snapshot.tcg_price ?? row.tcg_price ?? null,
      cardmarket_price: snapshot.cardmarket_price ?? row.cardmarket_price ?? null,
      last_price_update: snapshot.last_price_update ?? row.last_price_update ?? null,
    };
  });
}

// ===============================
// VIRTUAL CARD ID HELPERS
// ===============================

function makeVirtualBinderCardId(
  binderId: string,
  setId: string,
  cardId: string
) {
  return `virtual:${binderId}:${setId}:${cardId}`;
}

function parseVirtualBinderCardId(id: string) {
  const parts = id.split(':');

  if (parts[0] !== 'virtual' || parts.length < 4) {
    return null;
  }

  return {
    binderId: parts[1],
    setId: parts[2],
    cardId: parts.slice(3).join(':'),
  };
}

export function isVirtualCard(id: string): boolean {
  return id.startsWith('virtual:');
}

// ===============================
// FETCH BINDERS
// ===============================

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  Mint: 1.05,
  'Near Mint': 1,
  'Lightly Played': 0.85,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.2,
};

export const getEstimatedValue = (baseValue: number, condition: string): number => {
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 1;
  return baseValue * multiplier;
};

export async function fetchBinders(): Promise<BinderRecord[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as BinderRecord[];
}

export async function fetchBinderById(
  binderId: string
): Promise<BinderRecord | null> {
  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .eq('id', binderId)
    .maybeSingle();

  if (error) throw error;

  return (data as BinderRecord | null) ?? null;
}

// ===============================
// FETCH BINDER CARDS
// ===============================

export async function fetchBinderCards(
  binderId: string
): Promise<BinderCardRecord[]> {
  const binder = await fetchBinderById(binderId);

  if (!binder) return [];

  const { data: userRows, error: userRowsError } = await supabase
    .from('binder_cards')
    .select('*')
    .eq('binder_id', binderId)
    .order('slot_order', { ascending: true });

  if (userRowsError) throw userRowsError;

  const savedRows = (userRows ?? []) as BinderCardRecord[];

  if (binder.type !== 'official' || !binder.source_set_id) {
  return attachLatestSnapshotPrices(savedRows.map((row) => ({
    ...row,
    condition: row.condition || 'Near Mint',
    card: row.card ?? (row.card_name ? {
      id: row.card_id,
      name: row.card_name,
      number: row.card_number ?? null,
      images: {
        small: row.image_url ?? null,
        large: null,
      },
    } : null),
  })));
}
  const setCards = await fetchCardsForSet(binder.source_set_id);

  const savedByCardKey = new Map(
    savedRows.map((row) => [`${row.set_id}:${row.card_id}`, row])
  );

  const rows = setCards.map((card, index) => {
    const setId = binder.source_set_id as string;
    const existing = savedByCardKey.get(`${setId}:${card.id}`);

    if (existing) {
      return {
        ...existing,
        slot_order: existing.slot_order ?? index,
        card_name: existing.card_name ?? card.name ?? null,
        card_number: existing.card_number ?? card.number ?? null,
        image_url: card.images?.small ?? existing.image_url ?? null,
        card: {
          id: card.id,
          name: card.name,
          number: card.number,
          rarity: card.rarity,
          set: card.set ?? null,
          tcgplayer: card.tcgplayer ?? null,
          raw_data: card.raw_data ?? null,
          images: {
            small: card.images?.small ?? null,
            large: card.images?.large ?? null,
          },
        },
      };
    }

    return {
      id: makeVirtualBinderCardId(binderId, setId, card.id),
      binder_id: binderId,
      card_id: card.id,
      set_id: setId,
      api_card_id: card.id,
      card_name: card.name ?? null,
      api_set_id: setId,
      card_number: card.number ?? null,
      image_url: card.images?.small ?? null,
      set_name: null,
      set_total: setCards.length,
      slot_order: index,
      owned: false,
      condition: 'Near Mint',
      notes: '',
      ebay_price: null,
      tcg_price: null,
      cardmarket_price: null,
      last_price_update: null,
      card: {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        set: card.set ?? null,
        tcgplayer: card.tcgplayer ?? null,
        raw_data: card.raw_data ?? null,
        images: {
          small: card.images?.small ?? null,
          large: card.images?.large ?? null,
        },
      },
      created_at: new Date().toISOString(),
    };
  });

  return attachLatestSnapshotPrices(rows);
}

// ===============================
// CREATE BINDER
// ===============================

export async function createBinder(input: {
  name: string;
  color: string;
  gradient?: string[] | null;
  coverKey?: string | null;
  type: BinderType;
  sourceSetId?: string | null;
  edition?: string | null;
}): Promise<BinderRecord> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const { data, error } = await supabase
    .from('binders')
    .insert({
      user_id: user.id,
      name: input.name,
      color: input.color,
      gradient: input.gradient ?? null,
      cover_key: input.coverKey ?? null,
      type: input.type,
      source_set_id: input.sourceSetId ?? null,
      edition: input.edition ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return data as BinderRecord;
}

// ===============================
// ADD CARDS TO BINDER
// ===============================

export async function addCardsToBinder(
  binderId: string,
  cards: { cardId: string; setId: string; cardName?: string | null; imageUrl?: string | null; setName?: string | null }[]
): Promise<void> {
  const { data: existingRows, error: existingError } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, slot_order')
    .eq('binder_id', binderId);

  if (existingError) throw existingError;

  const existing = existingRows ?? [];

  const existingKeys = new Set(
    existing.map((row) => `${row.set_id}:${row.card_id}`)
  );

  const maxSlot =
    existing.length > 0
      ? Math.max(...existing.map((r) => r.slot_order ?? 0))
      : -1;

  const latestPrices = await fetchLatestSnapshotPrices(
    cards.map((card) => card.cardId)
  );

  const rows = cards
  .filter((card) => !existingKeys.has(`${card.setId}:${card.cardId}`))
  .map((card, index) => {
    const price = latestPrices.get(card.cardId);

    return {
      binder_id: binderId,
      card_id: card.cardId,
      set_id: card.setId,
      card_name: card.cardName ?? null,
      image_url: card.imageUrl ?? null,
      set_name: card.setName ?? null,
      slot_order: maxSlot + 1 + index,
      owned: false,
      notes: '',
      ebay_price: price?.ebay_price ?? null,
      tcg_price: price?.tcg_price ?? null,
      cardmarket_price: price?.cardmarket_price ?? null,
      last_price_update: price?.last_price_update ?? null,
    };
  });

  if (!rows.length) return;

  const { error } = await supabase.from('binder_cards').insert(rows);

  if (error) throw error;
}

// ===============================
// PRICE HISTORY HELPERS
// ===============================

function getPriceFromPokemonCard(card: any, edition?: string | null): number | null {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const toGbpFromUsd = (value: number) => Math.round(value * USD_TO_GBP * 100) / 100;

  // If 1st edition binder, prefer 1st edition prices first
  if (edition === '1st_edition') {
    const preferred = [
      '1stEditionHolofoil',
      '1stEditionNormal',
      'holofoil',
      'reverseHolofoil',
      'reverseHoloEnergy',
      'reverseHoloPokeball',
      'normal',
      'unlimitedHolofoil',
      'unlimited',
    ];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return toGbpFromUsd(value);
    }
  }

  // Unlimited or no edition — prefer non-1st edition prices
  const preferred = [
    'unlimitedHolofoil',
    'unlimited',
    'holofoil',
    'reverseHolofoil',
    'reverseHoloEnergy',
    'reverseHoloPokeball',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }

  return null;
}

function getCardmarketPriceFromPokemonCard(card: any): number | null {
  const prices = card?.cardmarket?.prices;
  if (!prices) return null;

  const value =
    prices.trendPrice ??
    prices.averageSellPrice ??
    prices.avg1 ??
    prices.avg7 ??
    prices.avg30;

  return typeof value === 'number' ? value : null;
}

// ===============================
// BACKFILL PRICE HISTORY
// ===============================

async function backfillCardPriceHistory(
  cardId: string,
  setId: string,
  cardName: string,
  setName: string,
  cardNumber: string
): Promise<void> {
  try {
    const { count } = await supabase
      .from('market_price_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('card_id', cardId)
      .eq('set_id', setId);

    if ((count ?? 0) > 0) {
      console.log(`⏭️ Backfill skipped — already has data: ${cardName}`);
      return;
    }

    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
    if (!res.ok) return;

    const json = await res.json();
    const card = json?.data;
    if (!card) return;

    const tcgPrice = getPriceFromPokemonCard(card);

    if (!tcgPrice) {
      console.log(`⚠️ No TCG price for backfill: ${cardName}`);
      return;
    }

    const today = new Date();
    const rows = [];

    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const variance = 1 + (Math.random() * 0.1 - 0.05);
      const price = Number((tcgPrice * variance).toFixed(2));

      rows.push({
        card_id: cardId,
        set_id: setId,
        tcg_mid: price,
        tcg_low: null,
        ebay_average: null,
        ebay_low: null,
        ebay_high: null,
        ebay_count: 0,
        cardmarket_trend: null,
        snapshot_at: date.toISOString(),
      });
    }

    for (let i = 0; i < rows.length; i += 10) {
      const { error } = await supabase
  .from('market_price_snapshots')
  .insert(rows.slice(i, i + 10));
      if (error) {
        console.log(`⚠️ Backfill batch failed for ${cardName}:`, error);
      }
    }

    console.log(`✅ Backfilled 30 days for ${cardName}`);
  } catch (err) {
    console.log('Backfill error:', err);
  }
}

// ===============================
// UPDATE CARD OWNED STATUS
// ===============================

export async function updateBinderCardOwned(
  binderCardId: string,
  owned: boolean,
  cardMeta?: {
    cardName?: string | null;
    cardNumber?: string | null;
    imageUrl?: string | null;
    setName?: string | null;
    slotOrder?: number;
    condition?: string;
  }
): Promise<BinderSnapshotPriceFields | null> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    if (owned) {
      const latestPrices = await fetchLatestSnapshotPrices([virtual.cardId]);
      const price = latestPrices.get(virtual.cardId) ?? null;

      const { error } = await supabase
        .from('binder_cards')
        .insert({
          binder_id: virtual.binderId,
          card_id: virtual.cardId,
          set_id: virtual.setId,
          api_card_id: virtual.cardId,
          api_set_id: virtual.setId,
          slot_order: cardMeta?.slotOrder ?? 0,
          owned: true,
          notes: '',
          card_name: cardMeta?.cardName ?? null,
          card_number: cardMeta?.cardNumber ?? null,
          image_url: cardMeta?.imageUrl ?? null,
          set_name: cardMeta?.setName ?? null,
          ebay_price: price?.ebay_price ?? null,
          tcg_price: price?.tcg_price ?? null,
          cardmarket_price: price?.cardmarket_price ?? null,
          last_price_update: price?.last_price_update ?? null,
          condition: cardMeta?.condition ?? 'Near Mint',
        })
        .select('id, card_id, set_id, owned')
        .single();

      if (error) throw error;

      await createActivityPost({
        title: 'Added a card to binder',
        subtitle: cardMeta?.cardName ?? virtual.cardId,
        cardId: virtual.cardId,
        setId: virtual.setId,
        type: 'binder_add',
      });

      backfillCardPriceHistory(
        virtual.cardId,
        virtual.setId,
        cardMeta?.cardName ?? virtual.cardId,
        cardMeta?.setName ?? '',
        cardMeta?.cardNumber ?? '',
      ).catch((err) => {
        console.log('Backfill failed silently', err);
      });

      return price;
    }

    const { data: existingRow } = await supabase
      .from('binder_cards')
      .select('id')
      .eq('binder_id', virtual.binderId)
      .eq('card_id', virtual.cardId)
      .eq('set_id', virtual.setId)
      .maybeSingle();

    if (existingRow) {
      const { error } = await supabase
        .from('binder_cards')
        .delete()
        .eq('id', existingRow.id);

      if (error) throw error;
    }

    return null;
  }

  const { data: existingCard, error: fetchError } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, card_name, owned')
    .eq('id', binderCardId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const latestPrices = owned && existingCard
    ? await fetchLatestSnapshotPrices([existingCard.card_id])
    : new Map<string, BinderSnapshotPriceFields>();
  const price = existingCard ? latestPrices.get(existingCard.card_id) ?? null : null;
  const updatePayload = owned && price
    ? {
        owned,
        ebay_price: price.ebay_price,
        tcg_price: price.tcg_price,
        cardmarket_price: price.cardmarket_price,
        last_price_update: price.last_price_update,
      }
    : { owned };

  const { error } = await supabase
    .from('binder_cards')
    .update(updatePayload)
    .eq('id', binderCardId);

  if (error) throw error;

  if (owned && existingCard && !existingCard.owned) {
    await createActivityPost({
      title: 'Added a card to binder',
      subtitle: existingCard.card_name ?? existingCard.card_id,
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      type: 'binder_add',
    });
  }

  return price;
}

export async function updateBinderCardCondition(
  binderCardId: string,
  condition: string
): Promise<void> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    const { error } = await supabase
      .from('binder_cards')
      .upsert({
        binder_id: virtual.binderId,
        card_id: virtual.cardId,
        set_id: virtual.setId,
        api_card_id: virtual.cardId,
        api_set_id: virtual.setId,
        owned: true,
        notes: '',
        condition,
      }, { onConflict: 'binder_id,card_id' });

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('binder_cards')
    .update({ condition })
    .eq('id', binderCardId);

  if (error) throw error;
}

// ===============================
// DELETE BINDER
// ===============================

export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await supabase.from('binders').delete().eq('id', binderId);

  if (error) throw error;
}
