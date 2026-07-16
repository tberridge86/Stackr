import { searchLocalPokemonCards } from './cardSearch';
import { expandSearchQuery, normaliseSearchText } from './searchNormalisation';
import { supabase } from './supabase';

export { expandSearchQuery, normaliseSearchText } from './searchNormalisation';

export type GlobalSearchCategory =
  | 'cards'
  | 'sets'
  | 'pokemon'
  | 'binders'
  | 'marketplace'
  | 'trade'
  | 'users'
  | 'sealed'
  | 'graded';

export type GlobalSearchResult = {
  id: string;
  category: GlobalSearchCategory;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  route?: string;
  raw?: unknown;
};

export type GlobalSearchResponse = {
  query: string;
  normalisedQuery: string;
  groups: Partial<Record<GlobalSearchCategory, GlobalSearchResult[]>>;
};

const joinSubtitle = (parts: Array<string | number | null | undefined>) =>
  parts.filter((part) => part !== null && part !== undefined && String(part).length > 0).join(' - ');

export async function runGlobalSearch(query: string, options: { limit?: number } = {}): Promise<GlobalSearchResponse> {
  const normalisedQuery = normaliseSearchText(query);
  const limit = Math.max(4, Math.min(24, Math.floor(options.limit ?? 8)));
  const groups: GlobalSearchResponse['groups'] = {};

  if (normalisedQuery.length < 2) {
    return { query, normalisedQuery, groups };
  }

  const expandedQueries = expandSearchQuery(query);
  const primaryQuery = expandedQueries[0] ?? normalisedQuery;

  const [cards, setsResult, bindersResult, usersResult, listingsResult] = await Promise.allSettled([
    Promise.all([
      searchLocalPokemonCards<any>(primaryQuery, {
        language: 'en',
        limit,
        select: 'id, name, language, set_id, image_small, image_large, raw_data, number',
      }),
      searchLocalPokemonCards<any>(primaryQuery, {
        language: 'ja',
        limit,
        select: 'id, name, language, set_id, image_small, image_large, raw_data, number',
      }),
    ]).then(([englishCards, japaneseCards]) => {
      const seen = new Set<string>();
      return [...englishCards, ...japaneseCards].filter((card) => {
        if (!card?.id || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      }).slice(0, limit);
    }),
    supabase
      .from('pokemon_sets')
      .select('id, name, series, printed_total, total, images')
      .or(`name.ilike.%${primaryQuery}%,id.ilike.%${primaryQuery}%`)
      .limit(limit),
    supabase
      .from('binders')
      .select('id, name, type, source_set_id, cover_key')
      .ilike('name', `%${primaryQuery}%`)
      .limit(limit),
    supabase
      .from('profiles')
      .select('id, collector_name, avatar_url, avatar_preset')
      .ilike('collector_name', `%${primaryQuery}%`)
      .limit(limit),
    supabase
      .from('user_card_flags')
      .select('id, card_id, set_id, product_name, product_type, pricing_mode, grade_company, grade, asking_price')
      .eq('flag_type', 'trade')
      .or(`product_name.ilike.%${primaryQuery}%,card_id.ilike.%${primaryQuery}%,grade_company.ilike.%${primaryQuery}%`)
      .limit(limit),
  ]);

  if (cards.status === 'fulfilled') {
    groups.cards = (cards.value ?? []).map((card: any) => ({
      id: card.id,
      category: 'cards',
      title: card.name,
      subtitle: joinSubtitle([
        card.language === 'ja' ? 'Japanese' : null,
        card.raw_data?.set?.name ?? card.set_id,
        card.number ? `#${card.number}` : null,
      ]),
      imageUrl: card.image_small ?? card.image_large ?? null,
      route: `/card/${card.id}`,
      raw: card,
    }));
  }

  if (setsResult.status === 'fulfilled' && !setsResult.value.error) {
    groups.sets = (setsResult.value.data ?? []).map((set: any) => ({
      id: set.id,
      category: 'sets',
      title: set.name,
      subtitle: joinSubtitle([set.series, set.printed_total ?? set.total ? `${set.printed_total ?? set.total} cards` : null]),
      imageUrl: set.images?.logo ?? null,
      route: `/set/${set.id}`,
      raw: set,
    }));
  }

  if (bindersResult.status === 'fulfilled' && !bindersResult.value.error) {
    groups.binders = (bindersResult.value.data ?? []).map((binder: any) => ({
      id: binder.id,
      category: 'binders',
      title: binder.name,
      subtitle: binder.type === 'official' ? 'Official set binder' : 'Custom binder',
      route: `/binder/${binder.id}`,
      raw: binder,
    }));
  }

  if (usersResult.status === 'fulfilled' && !usersResult.value.error) {
    groups.users = (usersResult.value.data ?? []).map((profile: any) => ({
      id: profile.id,
      category: 'users',
      title: profile.collector_name ?? 'Collector',
      subtitle: 'Stackr profile',
      imageUrl: profile.avatar_url ?? null,
      route: `/community/profile/${profile.id}`,
      raw: profile,
    }));
  }

  if (listingsResult.status === 'fulfilled' && !listingsResult.value.error) {
    const listings = listingsResult.value.data ?? [];
    groups.marketplace = listings.map((listing: any) => ({
      id: listing.id,
      category: listing.pricing_mode === 'graded' ? 'graded' : listing.product_type && listing.product_type !== 'raw_card' ? 'sealed' : 'marketplace',
      title: listing.product_name ?? listing.card_id,
      subtitle: joinSubtitle([
        listing.pricing_mode === 'graded' ? [listing.grade_company, listing.grade].filter(Boolean).join(' ') : null,
        listing.asking_price != null ? `GBP ${Number(listing.asking_price).toFixed(2)}` : null,
      ]),
      route: '/(tabs)/market',
      raw: listing,
    }));
  }

  return { query, normalisedQuery, groups };
}
