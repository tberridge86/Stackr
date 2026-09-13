import published from './generated/publishedSetLogos.generated.json';
import simplifiedCovers from './generated/publishedSimplifiedChineseCovers.generated.json';

type SetIdentity = { id?: string | null; setId?: string | null; setCode?: string | number | null; language?: string | null };
const STORAGE_ROOT = 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/';
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
const languageOf = (value: unknown) => {
  const language = normalize(value).replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'japanese', 'japan'].includes(language) || language.startsWith('ja-')) return 'ja';
  if (['en', 'eng', 'english'].includes(language) || language.startsWith('en-')) return 'en';
  return language;
};
const byId = new Map(published.logos.map(row => [row.setId, row]));
const byCode = new Map(published.logos.map(row => [`${row.language}:${normalize(row.setCode)}`, row]));
const coversById = new Map(simplifiedCovers.covers.map(row => [row.setId, row]));
// These are presentation parents, never card identities or collection merges.
const parents: Record<string, string> = { 'en:mee': 'en:me01' };
const parentSetIds: Record<string, string> = { '6f4ff21c-f7e5-42bd-9ac1-ce0212ae1061': 'en:me01' };

/** Immutable, already-published set logos remain usable while optional API marks load. */
export function getPublishedSetLogoFallback(input?: SetIdentity | null): string | undefined {
  if (!input) return undefined;
  const rawId = normalize(input.id ?? input.setId);
  const prefix = rawId.match(/^(en|ja|jp):/);
  const language = languageOf(input.language || prefix?.[1]);
  if (prefix && input.language && languageOf(prefix[1]) !== language) return undefined;
  const id = rawId.replace(/^(en|ja|jp):/, '');
  let row = byId.get(id);
  if (row && language && row.language !== language) return undefined;
  if (!row && language) row = byCode.get(`${language}:${normalize(input.setCode ?? id)}`);
  if (!row) {
    const parent = parentSetIds[id] ?? parents[`${language}:${normalize(input.setCode ?? id)}`];
    if (parent && (!language || parent.startsWith(`${language}:`))) row = byCode.get(parent);
  }
  if (!row || (language && row.language !== language)) return undefined;
  return `${STORAGE_ROOT}${row.storageKey}`;
}

/** Approved pack artwork is a cover fallback, never a substituted set logo. */
export function getPublishedSetCoverFallback(input?: SetIdentity | null): string | undefined {
  if (!input) return undefined;
  const language = normalize(input.language).replace(/_/g, '-');
  if (language !== 'zh-cn' && language !== 'zh-hans') return undefined;
  const row = coversById.get(normalize(input.id ?? input.setId));
  return row ? `${STORAGE_ROOT}${row.storageKey}` : undefined;
}
