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

export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  const { data: listings, error: listingsError } = await supabase
    .from('marketplace_listings')
    .select(`
      id,
      user_id,
      card_id,
      set_id,
      custom_value,
      condition,
      notes,
      status,
      created_at,
      updated_at
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (listingsError) {
    throw new Error(listingsError.message);
  }

  const safeListings = (listings as MarketplaceListing[] | null) ?? [];

  const uniqueUserIds = Array.from(
    new Set(safeListings.map((listing) => listing.user_id).filter(Boolean))
  );

  if (uniqueUserIds.length === 0) {
    return safeListings;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select(`
      id,
      collector_name,
      avatar_url,
      avatar_preset,
      pokemon_type,
      background_key
    `)
    .in('id', uniqueUserIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

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

  return safeListings.map((listing) => ({
    ...listing,
    profiles: profileMap.get(listing.user_id) ?? null,
  }));
}

export async function fetchMyListings(): Promise<MarketplaceListing[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return [];
  }

  const { data: listings, error: listingsError } = await supabase
    .from('marketplace_listings')
    .select(`
      id,
      user_id,
      card_id,
      set_id,
      custom_value,
      condition,
      notes,
      status,
      created_at,
      updated_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (listingsError) {
    throw new Error(listingsError.message);
  }

  const safeListings = (listings as MarketplaceListing[] | null) ?? [];

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      id,
      collector_name,
      avatar_url,
      avatar_preset,
      pokemon_type,
      background_key
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return safeListings.map((listing) => ({
    ...listing,
    profiles: profile
      ? {
          collector_name: profile.collector_name ?? null,
          avatar_url: profile.avatar_url ?? null,
          avatar_preset: profile.avatar_preset ?? null,
          pokemon_type: profile.pokemon_type ?? null,
          background_key: profile.background_key ?? null,
        }
      : null,
  }));
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

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    throw new Error('You must be signed in to list a card.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('marketplace_listings')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_id', input.card_id)
    .eq('status', 'active')
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    throw new Error('This card already has an active marketplace listing.');
  }

  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert({
      user_id: user.id,
      card_id: input.card_id,
      set_id: input.set_id ?? null,
      custom_value: input.custom_value ?? null,
      condition: input.condition ?? null,
      notes: input.notes ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as MarketplaceListing;
}

export async function archiveMarketplaceListing(listingId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    throw new Error('You must be signed in to archive a listing.');
  }

  const { data, error } = await supabase
    .from('marketplace_listings')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as MarketplaceListing;
}