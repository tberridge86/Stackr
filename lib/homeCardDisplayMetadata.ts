import { getEnglishCardDisplayName, getEnglishSetDisplaySupplement } from './pokemonDisplayNames';

type HomeDisplayMetadataInput = {
  id: string;
  setId?: string | null;
  name?: string | null;
  setName?: string | null;
  number?: string | number | null;
  language?: string | null;
  englishDisplayName?: string | null;
  raw?: Record<string, any> | null;
};

/** Display-only English identification. Never changes a card ID, artwork or price scope. */
export function getHomeCardDisplayMetadata(input: HomeDisplayMetadataInput) {
  const raw = input.raw ?? {};
  const language = input.language ?? raw.language ?? null;
  const set = raw.set ?? {};
  return {
    language,
    englishName: getEnglishCardDisplayName({
      id: input.id,
      sourceId: raw.source_id ?? raw.provider_card_id ?? raw.id ?? input.id,
      setId: input.setId,
      collectorNumber: input.number,
      language,
      localName: raw.local_name ?? raw.localName ?? raw.native_name ?? input.name,
      englishDisplayName: input.englishDisplayName ?? raw.english_display_name ?? raw.englishDisplayName,
      fallbackName: input.name,
      raw,
    }),
    englishSetSupplement: getEnglishSetDisplaySupplement({
      id: input.setId ?? set.id,
      sourceId: set.source_id ?? set.id ?? input.setId,
      setCode: set.set_code ?? set.code ?? input.setId,
      language,
      localName: set.local_name ?? set.name ?? input.setName,
      englishDisplayName: set.english_display_name ?? set.englishDisplayName,
      runtimeSupplement: set.english_display_supplement,
      raw: set,
    }),
  };
}
