import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

// ===============================
// TYPES
// ===============================

export type MarketplaceListingStatus = 'active' | 'archived' | 'sold';

export type MarketplaceListing = {
  id: string;
  user_id: string;
  card_id: string;
  set_id: string | null;
  custom_value: number | null;
  asking_price: number | null;
  market_estimate: number | null;
  condition: string | null;
  notes: string | null;
  trade_only: boolean;
  has_damage: boolean;
  damage_notes: string | null;
  damage_image_url: string | null;
  listing_notes: string | null;
  status: MarketplaceListingStatus;
  created_at: string;
  updated_at?: string | null;
  profiles?: {
    collector_name: string | null;
    avatar_url: string | null;
    avatar_preset: string | null;
    pokemon_type: string | null;
    background_key: string | null;
  } | null;
};

// ===============================
// HELPERS
// ===============================

function mapFlagToListing(row: any): MarketplaceListing {
  return {
    id: row.id,
    user_id: row.user_id,
    card_id: row.card_id,
    set_id: row.set_id ?? null,
    custom_value:
      row.asking_price != null
        ? Number(row.asking_price)
        : row.value
        ? Number(row.value)
        : null,
    asking_price: row.asking_price != null ? Number(row.asking_price) : null,
    market_estimate:
      row.market_estimate != null ? Number(row.market_estimate) : null,
    condition: row.condition ?? null,
    notes: row.listing_notes ?? row.notes ?? null,
    trade_only: Boolean(row.trade_only),
    has_damage: Boolean(row.has_damage),
    damage_notes: row.damage_notes ?? null,
    damage_image_url: row.damage_image_url ?? null,
    listing_notes: row.listing_notes ?? null,
    status: row.listing_status ?? 'active',
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  };
}

async function attachProfiles(
  listings: MarketplaceListing[]
): Promise<MarketplaceListing[]> {
  const uniqueUserIds = Array.from(
    new Set(listings.map((l) => l.user_id).filter(Boolean))
  );

  if (uniqueUserIds.length === 0) return listings;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, collector_name, avatar_url, avatar_preset, pokemon_type, background_key')
    .in('id', uniqueUserIds);

  if (error) throw new Error(error.message);

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.id,
      {
        collector_name: p.collector_name ?? null,
        avatar_url: p.avatar_url ?? null,
        avatar_preset: p.avatar_preset ?? null,
        pokemon_type: p.pokemon_type ?? null,
        background_key: p.background_key ?? null,
      },
    ])
  );

  return listings.map((listing) => ({
    ...listing,
    profiles: profileMap.get(listing.user_id) ?? null,
  }));
}

async function notifyDiscordNewTradeListing(listingId: string) {
  console.log('🔥 notifyDiscordNewTradeListing called');
  console.log('API_URL:', API_URL);
  console.log('Listing ID:', listingId);

  if (!API_URL) {
    console.log('❌ API_URL missing — check EXPO_PUBLIC_PRICE_API_URL in your env');
    return;
  }

  const url = `${API_URL.replace(/\/$/, '')}/api/discord/new-trade-listing`;
  console.log('📡 Posting to:', url);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId }),
    });

    const text = await res.text();
    console.log('✅ Discord status:', res.status);
    console.log('✅ Discord response:', text);

    if (!res.ok) {
      console.log('❌ Discord backend returned an error');
    }
  } catch (error) {
    console.log('❌ Discord listing notification failed:', error);
  }
}

// ===============================
// PUBLIC API
// ===============================

export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  const { data, error } = await supabase
    .from('user_card_flags')
    .select(`
      id, user_id, card_id, set_id, condition, notes, value,
      asking_price, market_estimate, trade_only, has_damage,
      damage_notes, damage_image_url, listing_notes, listing_status,
      created_at, updated_at
    `)
    .eq('flag_type', 'trade')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const listings = ((data ?? []) as any[]).map(mapFlagToListing);
  return attachProfiles(listings);
}

export async function fetchMyListings(): Promise<MarketplaceListing[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_card_flags')
    .select(`
      id, user_id, card_id, set_id, condition, notes, value,
      asking_price, market_estimate, trade_only, has_damage,
      damage_notes, damage_image_url, listing_notes, listing_status,
      created_at, updated_at
    `)
    .eq('user_id', user.id)
    .eq('flag_type', 'trade')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const listings = ((data ?? []) as any[]).map(mapFlagToListing);
  return attachProfiles(listings);
}

export async function createMarketplaceListing(input: {
  card_id: string;
  set_id?: string | null;
  custom_value?: number | null;
  condition?: string | null;
  notes?: string | null;
}): Promise<MarketplaceListing> {
  console.log('🔥 createMarketplaceListing called');
  console.log('Input:', input);
  console.log('API_URL:', API_URL);

  // ── 1. Auth check ─────────────────────────────────────────────────
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error('You must be signed in to list a card.');

  console.log('User ID:', user.id);

  // ── 2. Duplicate check ────────────────────────────────────────────
  const { data: existing, error: existingError } = await supabase
    .from('user_card_flags')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_id', input.card_id)
    .eq('flag_type', 'trade')
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  console.log('🔍 Existing listing check:', existing);

  if (existing) {
    console.log('⚠️ Card already listed:', existing.id);
    throw new Error('This card is already marked for trade.');
  }

  // ── 3. Insert listing ─────────────────────────────────────────────
  const { data, error } = await supabase
    .from('user_card_flags')
    .insert({
      user_id: user.id,
      card_id: input.card_id,
      set_id: input.set_id ?? null,
      flag_type: 'trade',
      value:
        input.custom_value == null || Number.isNaN(input.custom_value)
          ? null
          : String(input.custom_value),
      condition: input.condition ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  console.log('✅ Marketplace listing created in Supabase:', data.id);

  // ── 4. Notify Discord ─────────────────────────────────────────────
  await notifyDiscordNewTradeListing(data.id);

  return mapFlagToListing(data);
}

export async function archiveMarketplaceListing(
  listingId: string
): Promise<MarketplaceListing> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error('You must be signed in to archive a listing.');

  const { data, error } = await supabase
    .from('user_card_flags')
    .delete()
    .eq('id', listingId)
    .eq('user_id', user.id)
    .eq('flag_type', 'trade')
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    ...mapFlagToListing(data),
    status: 'archived',
  };
}