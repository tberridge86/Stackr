import { searchLocalPokemonCards } from './cardSearch';
import {
  getEnglishCardDisplayName,
  getLocalCardName,
  getPreferredSetDisplayName,
} from './pokemonDisplayNames';
import { correctPokemonNameQuery } from './pokemonNameAutocorrect';
import { normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';

const cleanText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text.length ? text : undefined;
};

const containsCjkText = (value: unknown) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value ?? ''));

export type PokemonSearchCard = {
  id: string;
  language?: PokemonCardLanguage;
  name?: string;
  localName?: string;
  englishName?: string;
  number?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    name?: string;
    localName?: string;
    englishName?: string;
    series?: string;
  };
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
};

export async function searchPokemonCards(
  query: string,
  options: { language?: PokemonCardLanguage | 'all' | string | null } = {}
): Promise<PokemonSearchCard[]> {
  const trimmed = query.trim();
  const language = String(options.language ?? '').trim().toLowerCase() === 'all'
    ? 'all'
    : normalizePokemonCardLanguage(options.language);

  if (!trimmed) return [];

  const localResults = await searchLocalPokemonCards<any>(trimmed, {
    language,
    limit: 80,
    select: 'id, name, language, number, rarity, image_small, image_large, set_id, raw_data',
  });

  if (localResults.length > 0) {
    return localResults.map((card) => {
      const raw = card.raw_data ?? {};
      const normalizedLanguage = normalizePokemonCardLanguage(card.language ?? raw.language ?? (language === 'all' ? null : language));
      const providerCardId = raw.source_id ?? raw.provider_card_id ?? raw.id ?? card.id ?? null;
      const localName = getLocalCardName({
        id: card.id,
        sourceId: providerCardId,
        setId: card.set_id ?? raw.set?.id ?? null,
        collectorNumber: card.number ?? raw.localId ?? raw.number ?? null,
        language: normalizedLanguage,
        region: card.region ?? raw.region ?? null,
        localName: raw.local_name ?? (normalizedLanguage !== 'en' ? raw.name ?? card.name ?? null : null),
        englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
        canonicalName: raw.canonical_name ?? null,
        fallbackName: card.name ?? providerCardId,
        raw,
      });
      const englishName = getEnglishCardDisplayName({
        id: card.id,
        sourceId: providerCardId,
        setId: card.set_id ?? raw.set?.id ?? null,
        collectorNumber: card.number ?? raw.localId ?? raw.number ?? null,
        language: normalizedLanguage,
        region: card.region ?? raw.region ?? null,
        localName,
        englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
        canonicalName: raw.canonical_name ?? null,
        fallbackName: card.name ?? providerCardId,
        raw,
      });
      const setDisplayName = getPreferredSetDisplayName({
        id: card.set_id ?? raw.set?.id ?? null,
        sourceId: raw.set?.tcgdex_id ?? raw.set?.source_id ?? raw.source_id ?? card.set_id ?? null,
        setCode: raw.set?.set_code ?? raw.set?.tcgdex_id ?? raw.set_code ?? card.set_id ?? null,
        language: normalizedLanguage,
        region: card.region ?? raw.region ?? raw.set?.region ?? null,
        localName: raw.set?.local_name ?? raw.set?.name ?? null,
        englishDisplayName: raw.set?.english_display_name ?? raw.set?.englishDisplayName ?? null,
        canonicalName: raw.set?.name ?? null,
        fallbackName: card.set_id ?? null,
        raw: raw.set ?? raw,
      });
      const setLocalName = cleanText(raw.set?.local_name ?? (normalizedLanguage !== 'en' ? raw.set?.name : null));
      const setEnglishName = cleanText(raw.set?.english_display_name ?? raw.set?.englishDisplayName)
        ?? (setDisplayName && !containsCjkText(setDisplayName) ? setDisplayName : undefined);

      return {
        id: card.id,
        language: normalizedLanguage,
        name: cleanText(englishName ?? localName ?? card.name) ?? card.id,
        localName: cleanText(localName),
        englishName: cleanText(englishName),
        number: cleanText(card.number ?? raw.localId ?? raw.number),
        rarity: card.rarity ?? raw.rarity ?? undefined,
        images: {
          small: card.image_small ?? undefined,
          large: card.image_large ?? undefined,
        },
        set: {
          id: card.set_id ?? undefined,
          name: cleanText(setDisplayName ?? setEnglishName ?? setLocalName),
          localName: setLocalName,
          englishName: setEnglishName,
          series: raw.set?.series ?? undefined,
        },
        supertype: raw.supertype,
        subtypes: raw.subtypes,
      };
    });
  }

  const corrected = await correctPokemonNameQuery(trimmed, { allowIndex: false });
  if (language !== 'en' && language !== 'all') return [];

  const fallbackQuery = corrected.changed ? corrected.correctedQuery : trimmed;
  const encoded = encodeURIComponent(`name:"*${fallbackQuery}*"`);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encoded}&pageSize=60`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search cards.');
  }

  const json = await response.json();
  return json?.data ?? [];
}
