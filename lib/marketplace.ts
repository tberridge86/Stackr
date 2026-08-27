import { supabase } from './supabase';
import { MARKETPLACE_STATUS_LABELS, normaliseMarketplaceStatus, type MarketplaceLifecycleStatus } from './transactionStates';
import { getCachedOrFetch, invalidateRequestCache } from './requestCache';
import { fetchStackrPriceSnapshots } from './stackrDomainAdapter';
import { assertPremiumSellerWriteAccess } from './premiumSellerAccess';
import { sanitizeGate0CommerceCopy } from './gate0CommerceCopy';
import { sanitizeMarketplaceListingPresentationFields } from './marketplacePresentation';

const ACTIVE_LISTING_STATUS_FILTER = 'listing_status.eq.active,listing_status.is.null';
const MARKETPLACE_LISTINGS_CACHE_TTL_MS = 20 * 1000;

const getMarketplaceListingSelect = (includeMediaMetadata = true) => `
  id, user_id, card_id, set_id, condition, notes, value,
  product_type, product_name, pricing_mode, grade_company, grade,
  admin_review_required, admin_review_reason,
  asking_price, market_estimate, trade_only, has_damage,
  damage_notes, damage_image_url, listing_notes, listing_images${includeMediaMetadata ? ', listing_media, official_image_url, seller_front_image_url, seller_back_image_url' : ''},
  listing_status, created_at, updated_at
`;

const isMissingListingMediaColumnError = (error: any) => {
  if (!error) return false;
  const message = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(' ');
  return /listing_media|official_image_url|seller_front_image_url|seller_back_image_url/i.test(message)
    && /42703|PGRST204|schema cache|column|could not find/i.test(message);
};

// ===============================
// TYPES
// ===============================

export type MarketplaceListingStatus = MarketplaceLifecycleStatus;

export type MarketplaceListingPrices = {
  tcg_mid: number | null;
  tcg_low: number | null;
  ebay_average: number | null;
  cardmarket_trend: number | null;
  preferred_source?: 'stackr' | 'ebay' | 'tcg' | 'cardmarket' | null;
  preferred_value?: number | null;
};

export type MarketplaceListing = {
  id: string;
  user_id: string;
  card_id: string;
  set_id: string | null;
  product_type: string | null;
  product_name: string | null;
  pricing_mode: string | null;
  grade_company: string | null;
  grade: string | null;
  admin_review_required: boolean;
  admin_review_reason: string | null;
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
  listing_images: string[] | null;
  listing_media: any[] | null;
  official_image_url: string | null;
  seller_front_image_url: string | null;
  seller_back_image_url: string | null;
  status: MarketplaceListingStatus;
  created_at: string;
  updated_at?: string | null;
  prices?: MarketplaceListingPrices | null;
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
  const presentation = sanitizeMarketplaceListingPresentationFields(row);
  return {
    id: row.id,
    user_id: row.user_id,
    card_id: row.card_id,
    set_id: presentation.set_id ?? null,
    product_type: presentation.product_type ?? null,
    product_name: presentation.product_name ?? 'Collector listing',
    pricing_mode: presentation.pricing_mode ?? null,
    grade_company: presentation.grade_company ?? null,
    grade: presentation.grade ?? null,
    admin_review_required: Boolean(row.admin_review_required),
    admin_review_reason: sanitizeGate0CommerceCopy(row.admin_review_reason ?? null, null),
    custom_value:
      row.asking_price != null
        ? Number(row.asking_price)
        : row.value
        ? Number(row.value)
        : null,
    asking_price: row.asking_price != null ? Number(row.asking_price) : null,
    market_estimate:
      row.market_estimate != null ? Number(row.market_estimate) : null,
    condition: presentation.condition ?? null,
    notes: sanitizeGate0CommerceCopy(
      row.listing_notes ?? row.notes ?? null,
      'Listing details hidden during this beta.',
    ),
    trade_only: Boolean(row.trade_only),
    has_damage: Boolean(row.has_damage),
    damage_notes: sanitizeGate0CommerceCopy(row.damage_notes ?? null, null),
    damage_image_url: row.damage_image_url ?? null,
    listing_notes: sanitizeGate0CommerceCopy(
      row.listing_notes ?? null,
      'Listing details hidden during this beta.',
    ),
    listing_images: Array.isArray(row.listing_images) ? row.listing_images : null,
    listing_media: presentation.listing_media,
    official_image_url: row.official_image_url ?? null,
    seller_front_image_url: row.seller_front_image_url ?? null,
    seller_back_image_url: row.seller_back_image_url ?? null,
    status: normaliseMarketplaceStatus(row.listing_status),
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
    .from('profile_public_directory')
    .select('id, collector_name, avatar_url, avatar_preset, pokemon_type, background_key')
    .in('id', uniqueUserIds);

  if (error) throw new Error(error.message);

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.id,
      {
        collector_name: sanitizeGate0CommerceCopy(p.collector_name ?? null, 'Collector'),
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

async function attachPrices(listings: MarketplaceListing[]): Promise<MarketplaceListing[]> {
  const uniqueCardIds = Array.from(
    new Set(listings.map((l) => l.card_id).filter(Boolean))
  );

  if (uniqueCardIds.length === 0) return listings;

  const snapshots = await fetchStackrPriceSnapshots(uniqueCardIds);
  const cardPriceMap: Record<string, MarketplaceListingPrices> = {};
  for (const cardId of uniqueCardIds) {
    const snapshot = snapshots.get(cardId);
    if (!snapshot) continue;
    cardPriceMap[cardId] = {
      tcg_mid: snapshot.market_central,
      tcg_low: snapshot.market_low,
      ebay_average: null,
      cardmarket_trend: null,
      preferred_source: 'stackr',
      preferred_value: snapshot.market_central,
    };
  }

  return listings.map((listing) => ({
    ...listing,
    prices: cardPriceMap[listing.card_id] || null,
  }));
}

// ===============================
// PUBLIC API
// ===============================

export async function fetchMarketplaceListings(): Promise<MarketplaceListing[]> {
  return getCachedOrFetch(
    'marketplace:listings:active',
    MARKETPLACE_LISTINGS_CACHE_TTL_MS,
    async () => {
      const primaryResult = await supabase
        .from('user_card_flags')
        .select(getMarketplaceListingSelect(true))
        .eq('flag_type', 'trade')
        .or(ACTIVE_LISTING_STATUS_FILTER)
        .order('created_at', { ascending: false });
      const { data, error } = isMissingListingMediaColumnError(primaryResult.error)
        ? await supabase
          .from('user_card_flags')
          .select(getMarketplaceListingSelect(false))
          .eq('flag_type', 'trade')
          .or(ACTIVE_LISTING_STATUS_FILTER)
          .order('created_at', { ascending: false })
        : primaryResult;

      if (error) throw new Error(error.message);

      const listings = ((data ?? []) as any[]).map(mapFlagToListing);
      const withProfiles = await attachProfiles(listings);
      return attachPrices(withProfiles);
    }
  );
}

export async function fetchMyListings(): Promise<MarketplaceListing[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return [];

  return getCachedOrFetch(
    `marketplace:listings:user:${user.id}`,
    MARKETPLACE_LISTINGS_CACHE_TTL_MS,
    async () => {
      const primaryResult = await supabase
        .from('user_card_flags')
        .select(getMarketplaceListingSelect(true))
        .eq('user_id', user.id)
        .eq('flag_type', 'trade')
        .or(ACTIVE_LISTING_STATUS_FILTER)
        .order('created_at', { ascending: false });
      const { data, error } = isMissingListingMediaColumnError(primaryResult.error)
        ? await supabase
          .from('user_card_flags')
          .select(getMarketplaceListingSelect(false))
          .eq('user_id', user.id)
          .eq('flag_type', 'trade')
          .or(ACTIVE_LISTING_STATUS_FILTER)
          .order('created_at', { ascending: false })
        : primaryResult;

      if (error) throw new Error(error.message);

      const listings = ((data ?? []) as any[]).map(mapFlagToListing);
      const withProfiles = await attachProfiles(listings);
      return attachPrices(withProfiles);
    }
  );
}

export function invalidateMarketplaceListingCaches() {
  invalidateRequestCache('marketplace:listings:');
}

export async function deleteMarketplaceListing(listingId: string): Promise<void> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error('You must be signed in to delete a listing.');
  assertPremiumSellerWriteAccess(user);

  const { error } = await supabase
    .from('user_card_flags')
    .update({ listing_status: 'archived' })
    .eq('id', listingId)
    .eq('user_id', user.id)
    .eq('flag_type', 'trade');

  if (error) throw new Error(error.message);
  invalidateMarketplaceListingCaches();
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

  // ── 1. Auth check ─────────────────────────────────────────────────
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error('You must be signed in to list a card.');
  assertPremiumSellerWriteAccess(user);

  console.log('User ID:', user.id);

  // ── 2. Duplicate check ────────────────────────────────────────────
  const { data: existing, error: existingError } = await supabase
    .from('user_card_flags')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_id', input.card_id)
    .eq('flag_type', 'trade')
    .or(ACTIVE_LISTING_STATUS_FILTER)
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
      listing_status: 'active',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  invalidateMarketplaceListingCaches();

  console.log('✅ Marketplace listing created in Supabase:', data.id);

  // ── 4. Notify Discord ─────────────────────────────────────────────
  return mapFlagToListing(data);
}

export async function archiveMarketplaceListing(
  listingId: string
): Promise<MarketplaceListing> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error('You must be signed in to archive a listing.');
  assertPremiumSellerWriteAccess(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  let query = supabase
    .from('user_card_flags')
    .update({ listing_status: 'archived' })
    .eq('id', listingId)
    .eq('flag_type', 'trade');

  if (!isAdmin) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.select().maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Listing not found or you do not have permission to archive it.');

  invalidateMarketplaceListingCaches();

  return {
    ...mapFlagToListing(data),
    status: 'archived',
  };
}

export function getMarketplaceStatusLabel(status?: string | null) {
  return MARKETPLACE_STATUS_LABELS[normaliseMarketplaceStatus(status)];
}
