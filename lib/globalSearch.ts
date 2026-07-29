import { searchLocalPokemonCards } from './cardSearch';
import { getPreferredSetDisplayName } from './pokemonDisplayNames';
import { expandSearchQuery, normaliseSearchText } from './searchNormalisation';
import { supabase } from './supabase';
import { getPokemonCardLanguageLabel, normalizePokemonCardLanguage } from './pokemonTcg';
import { fetchStackrSets } from './stackrDomainAdapter';

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
      searchLocalPokemonCards<any>(primaryQuery, {
        language: 'zh-tw',
        limit,
        select: 'id, name, language, set_id, image_small, image_large, raw_data, number',
      }),
    ]).then(([englishCards, japaneseCards, chineseCards]) => {
      const seen = new Set<string>();
      return [...englishCards, ...japaneseCards, ...chineseCards].filter((card) => {
        if (!card?.id || seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      }).slice(0, limit);
    }),
    fetchStackrSets().then((sets) => sets.filter((set) => {
      const haystack = [set.id, set.name, set.series, set.localName, set.externalIds.setCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(primaryQuery.toLowerCase());
    }).slice(0, limit)),
    supabase
      .from('binders')
      .select('id, name, type, source_set_id, cover_key')
      .ilike('name', `%${primaryQuery}%`)
      .limit(limit),
    supabase
      .from('profile_public_directory')
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
        normalizePokemonCardLanguage(card.language) !== 'en' ? getPokemonCardLanguageLabel(card.language) : null,
        getPreferredSetDisplayName({
          id: card.set_id ?? card.raw_data?.set?.id ?? null,
          sourceId: card.raw_data?.set?.tcgdex_id ?? card.raw_data?.set?.source_id ?? card.raw_data?.source_id ?? card.set_id ?? null,
          setCode: card.raw_data?.set?.set_code ?? card.raw_data?.set?.tcgdex_id ?? card.raw_data?.set_code ?? card.set_id ?? null,
          language: card.language ?? card.raw_data?.language ?? card.raw_data?.set?.language ?? null,
          region: card.region ?? card.raw_data?.region ?? card.raw_data?.set?.region ?? null,
          localName: card.raw_data?.set?.local_name ?? card.raw_data?.set?.name ?? null,
          englishDisplayName: card.raw_data?.set?.english_display_name ?? card.raw_data?.set?.englishDisplayName ?? null,
          canonicalName: card.raw_data?.set?.name ?? null,
          fallbackName: card.set_id ?? null,
          raw: card.raw_data?.set ?? card.raw_data,
        }),
        card.number ? `#${card.number}` : null,
      ]),
      imageUrl: card.image_small ?? card.image_large ?? null,
      route: `/card/${card.id}`,
      raw: card,
    }));
  }

  if (setsResult.status === 'fulfilled') {
    groups.sets = setsResult.value.map((set) => ({
      id: set.id,
      category: 'sets',
      title: set.name,
      subtitle: joinSubtitle([set.series, set.printedTotal ?? set.total ? `${set.printedTotal ?? set.total} cards` : null]),
      imageUrl: set.images.logo ?? set.images.symbol ?? set.images.cover ?? null,
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
