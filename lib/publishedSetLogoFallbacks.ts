import published from './generated/publishedSetLogos.generated.json';
import simplifiedCovers from './generated/publishedSimplifiedChineseCovers.generated.json';
import { MOBILE_RUNTIME_CONFIG } from './mobileRuntimeConfig';

type SetIdentity = { id?: string | null; setId?: string | null; setCode?: string | number | null; language?: string | null };
const STORAGE_ROOT = `${MOBILE_RUNTIME_CONFIG.supabaseUrl}/storage/v1/object/public/stackr-catalogue-public/`;
type PublishedDelivery = { storageKey: string; deliveryUrl?: string; detailUrl?: string };
function publishedDelivery(row: PublishedDelivery, environment?: string) {
  // URLs are copied from exact approved API records, never reconstructed from a
  // legacy storage key. Production evidence must not redirect another runtime.
  if (environment && environment === MOBILE_RUNTIME_CONFIG.environment) {
    const recorded = row.detailUrl ?? row.deliveryUrl;
    if (recorded) return recorded;
  }
  return `${STORAGE_ROOT}${row.storageKey}`;
}
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
const languageOf = (value: unknown) => {
  const language = normalize(value).replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'japanese', 'japan'].includes(language) || language.startsWith('ja-')) return 'ja';
  if (['en', 'eng', 'english'].includes(language) || language.startsWith('en-')) return 'en';
  return language;
};
// The registry includes Crown Zenith's existing reviewed replacement. Sharing
// that logo with Gallery is presentation-only, never an identity/ownership merge.
const byId = new Map(published.logos.map(row => [row.setId, row]));
const byCode = new Map(published.logos.map(row => [`${row.language}:${normalize(row.setCode)}`, row]));
const coversById = new Map(simplifiedCovers.covers.map(row => [row.setId, row]));
// These are presentation parents, never card identities or collection merges.
const parents: Record<string, string> = {
  'en:mee': 'en:me01',
  // Legacy/canonical spellings are verified in englishSetIdentity.ts.
  'en:swsh12pt5': 'en:swsh12.5',
  'en:swsh12.5gg': 'en:swsh12.5',
  'en:swsh12pt5gg': 'en:swsh12.5',
};
const parentSetIds: Record<string, string> = {
  '6f4ff21c-f7e5-42bd-9ac1-ce0212ae1061': 'en:me01',
  '8bb033f3-6059-4f5f-a021-c363241092a1': 'en:swsh12.5',
};

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
  // The requested Crown Zenith parent supersedes a stale Gallery logo. Other
  // parent links remain fallback-only. Prefer the resolved row's identity over a
  // supplied code so conflicting metadata cannot redirect an unrelated known set.
  const parent = parentSetIds[id] ?? parents[row
    ? `${row.language}:${normalize(row.setCode)}`
    : `${language}:${normalize(input.setCode ?? id)}`];
  const replacesChildLogo = parent === 'en:swsh12.5';
  if (parent && (!row || replacesChildLogo) && (!language || parent.startsWith(`${language}:`))) {
    row = byCode.get(parent) ?? row;
  }
  if (!row || (language && row.language !== language)) return undefined;
  return publishedDelivery(row, published.deliveryEnvironment);
}

/** Approved pack artwork is a cover fallback, never a substituted set logo. */
export function getPublishedSetCoverFallback(input?: SetIdentity | null): string | undefined {
  if (!input) return undefined;
  const language = normalize(input.language).replace(/_/g, '-');
  if (language !== 'zh-cn' && language !== 'zh-hans') return undefined;
  const row = coversById.get(normalize(input.id ?? input.setId));
  return row ? publishedDelivery(row, simplifiedCovers.deliveryEnvironment) : undefined;
}
