export type CardEnglishCanonicalProvenance = {
  source: 'official_card_database' | 'official_card_checklist' | 'editorial_complete_native_name' | 'provider_complete_native_name' | 'stackr_published_metadata';
  status: 'verified_official' | 'reviewed_editorial_translation' | 'reviewed_provider_metadata' | 'published_metadata';
  verifiedOfficial: boolean;
  sourceEvidenceSha256: string;
};
export type CardEnglishSupplement = {
  value: string;
  provenance: 'explicit_english_metadata' | 'published_stackr_exact_native_name' | 'stackr_existing_application_map';
  authoritative: boolean;
  sourceCardIds?: readonly string[];
  canonicalProvenance?: CardEnglishCanonicalProvenance;
};
export function normalizeCardTranslationName(value: unknown): string | null;
export function cleanCardEnglishName(value: unknown): string | null;
export function cleanSetEnglishName(value: unknown): string | null;
export function normalizeCardTranslationLanguage(value: unknown): string | null;
export function normalizeCardEnglishCanonicalProvenance(value: unknown): CardEnglishCanonicalProvenance | null;
export function resolveCardEnglishSupplement(input: { language?: unknown; nativeName?: unknown; cardIds?: unknown[]; englishNames?: unknown[]; englishNameProvenance?: unknown }): CardEnglishSupplement | null;
export function normalizeCardEnglishSearchText(value: unknown): string;
export function findNativeCardNamesForEnglishQuery(query: string, language?: string | null): { language: string; nativeName: string }[];
