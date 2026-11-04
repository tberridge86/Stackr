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
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const languageOf = (value: unknown) => {
  const language = normalize(value).replace(/_/g, '-');
  if (['ja', 'jp', 'jpn', 'japanese', 'japan'].includes(language) || language.startsWith('ja-')) return 'ja';
  if (['en', 'eng', 'english'].includes(language) || language.startsWith('en-')) return 'en';
  return language;
};
// Exact approved production manifest records read on 4 November 2026. These
// immutable URLs are copied verbatim; no cross-environment URL is constructed.
// Separate publication records preserve each edition even where pixels match.
const ANNIVERSARY_LOGOS = [
  {
    setId: '258cb8e5-c769-540d-9e3c-40d4ed4dafdb', language: 'en', setCode: '30c',
    url: 'https://assets.stackrtcg.com/public/set_logo/15dac49d-ba40-4516-bd76-b3acc2faf12d/5a16b09fb84c7fbd909d49e4f57c105caf49bfec6c832ca3f7df072cb33bf089/4913f030d321f15da74b7a0275777c63aa06b0a2c0fa4f1be85e31ea8088be2e/original.png',
  },
  {
    setId: '88e351b5-8191-5ef4-854b-2978046cda53', language: 'ja', setCode: 'm6a',
    url: 'https://assets.stackrtcg.com/public/set_logo/57d246c4-995a-4e4f-b31a-8a3717ca3322/849b77fce11f5151e03e2a19a2ef8db787df003827cf9f9157fa1450fe303152/4913f030d321f15da74b7a0275777c63aa06b0a2c0fa4f1be85e31ea8088be2e/original.png',
  },
] as const;
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
  // Preserve every domain prefix accepted by pokemonSetIdentity, plus the
  // existing English/Japanese regional language aliases used by this resolver.
  const prefix = rawId.match(/^(en(?:[-_][a-z]+)?|ja(?:[-_][a-z]+)?|jp|jpn|ko|kr|zh-cn|zh_cn|zhcn|zh-hans|zh_hans|zhhans|zh-sg|zh_sg|zhsg|zh-tw|zh_tw|zhtw|zh-hant|zh_hant|zhhant|zh):/);
  const language = languageOf(input.language || prefix?.[1]);
  if (prefix && input.language && languageOf(prefix[1]) !== language) return undefined;
  const id = prefix ? rawId.slice(prefix[0].length) : rawId;
  const canonicalIdentity = CANONICAL_UUID.test(id);
  if (MOBILE_RUNTIME_CONFIG.environment === 'production') {
    const anniversary = ANNIVERSARY_LOGOS.find((entry) => entry.setId === id
      || (!canonicalIdentity && entry.language === language && entry.setCode === normalize(input.setCode ?? id)));
    if (anniversary) return !language || anniversary.language === language ? anniversary.url : undefined;
  }
  let row = byId.get(id);
  if (row && language && row.language !== language) return undefined;
  // A canonical UUID is authoritative even when it is unknown. Do not let a
  // stale display code redirect that set to another set's published artwork.
  if (!row && language && !canonicalIdentity) row = byCode.get(`${language}:${normalize(input.setCode ?? id)}`);
  // The requested Crown Zenith parent supersedes a stale Gallery logo. Other
  // parent links remain fallback-only. Prefer the resolved row's identity over a
  // supplied code so conflicting metadata cannot redirect an unrelated known set.
  const parent = parentSetIds[id] ?? ((!canonicalIdentity || row) ? parents[row
    ? `${row.language}:${normalize(row.setCode)}`
    : `${language}:${normalize(input.setCode ?? id)}`] : undefined);
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
