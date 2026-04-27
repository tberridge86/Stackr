import { supabase } from './supabase';

export type MarketplaceListingStatus = 'active' | 'archived' | 'sold';

export type MarketplaceListing = {
  id: string;
  user_id: string;
  card_id: string;
  set_id: string | null;
  custom_value: number | null;
  condition: string | null;
  notes: string | null;
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

function mapFlagToListing(row: any): MarketplaceListing {
  return {
    id: row.id,
    user_id: row.user_id,
    card_id: row.card_id,
    set_id: row.set_id ?? null,
    custom_value: row.value ? Number(row.value) : null,
    condition: row.condition ?? null,
    notes: row.notes ?? null,
    status: 'active',
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  };
}

async function attachProfiles(
  listings: MarketplaceListing[]
): Promise<MarketplaceListing[]> {
  const uniqueUserIds = Array.from(
    new Set(listings.map((listing) => listing.user_id).filter(Boolean))
  );

  if (uniqueUserIds.length === 0) {
    return listings;
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(
      `
      id,
      collector_name,
      avatar_url,
      avatar_preset,
      pokemon_type,
      background_key
    `
    )
    .in('id', uniqueUserIds);

  if (error) throw new Error(error.message);

  const profileMap = new Map(
    (profiles ?? []).map((profile: any) => [
      profile.id,
      {
        collector_name: profile.collector_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        avatar_preset: profile.avatar_preset ?? null,
        pokemon_type: profile.pokemon_type ?? null,
        background_key: profile.background_key ?? null,
      },
    ])
  );

  return listings.map((listing) => ({
    ...listing,
    profiles: profileMap.get(listing.user_id) ?? null,
  }));
}

export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  const { data, error } = await supabase
    .from('user_card_flags')
    .select(
      `
      id,
      user_id,
      card_id,
      set_id,
      condition,
      notes,
      value,
      created_at,
      updated_at
    `
    )
    .eq('flag_type', 'trade')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const listings = ((data ?? []) as any[]).map(mapFlagToListing);

  return attachProfiles(listings);
}

export async function fetchMyListings(): Promise<MarketplaceListing[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_card_flags')
    .select(
      `
      id,
      user_id,
      card_id,
      set_id,
      condition,
      notes,
      value,
      created_at,
      updated_at
    `
    )
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
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);

  if (!user) {
    throw new Error('You must be signed in to list a card.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('user_card_flags')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_id', input.card_id)
    .eq('flag_type', 'trade')
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    throw new Error('This card is already marked for trade.');
  }

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

  return mapFlagToListing(data);
}

export async function archiveMarketplaceListing(listingId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);

  if (!user) {
    throw new Error('You must be signed in to archive a listing.');
  }

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