/** Stored catalogue prices are raw-card guides, never graded-card valuations. */
export type CollectionSummaryPriceInput = {
  card: any;
  cardId: string;
  setId: string;
  variant?: string | null;
  edition?: string | null;
  condition?: string | null;
  gradeCompany?: string | null;
  grade?: string | null;
  mode: 'raw' | 'graded';
  languages?: unknown[];
};

export const COLLECTION_SUMMARY_USD_TO_GBP = 0.79;
const PRICE_KEYS = [
  'normal', 'unlimited', 'holofoil', 'unlimitedHolofoil', 'reverseHolofoil',
  'reverseHoloEnergy', 'reverseHoloPokeball', '1stEditionNormal', '1stEditionHolofoil',
] as const;
const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en', ja: 'ja', jp: 'ja', japanese: 'ja',
  ko: 'ko', kr: 'ko', korean: 'ko', 'zh-tw': 'zh-tw', 'zh-hant': 'zh-tw',
  'traditional-chinese': 'zh-tw', 'zh-cn': 'zh-cn', 'zh-hans': 'zh-cn', 'simplified-chinese': 'zh-cn',
};
const token = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replaceAll('_', '-') : '';
const explicitPrefix = (value: string) => /^(en|ja|jp|ko|zh-tw|zh-cn):/i.exec(value)?.[1] ?? null;

/** Decimal conversion agrees with PostgreSQL numeric round, including half-cent boundaries. */
function usdToGbp(usd: number): number {
  const [mantissa, exponent = '0'] = usd.toString().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const numerator = BigInt(integer + fraction) * 79n;
  const scale = Number(exponent) - fraction.length;
  const pennies = scale >= 0 ? numerator * 10n ** BigInt(scale)
    : (numerator + 10n ** BigInt(-scale) / 2n) / 10n ** BigInt(-scale);
  return Number(pennies) / 100;
}

export function storedRawSummaryPrice(input: CollectionSummaryPriceInput): { amount: number | null; unsupported: boolean } {
  const condition = token(input.condition || 'Near Mint');
  if (input.mode === 'graded' || token(input.gradeCompany) || token(input.grade)
    || !['near mint', 'near-mint', 'nm', 'raw near mint', 'raw-near-mint'].includes(condition)) {
    return { amount: null, unsupported: true };
  }
  const missing = { amount: null, unsupported: false };
  const card = input.card;
  if (!card || !input.cardId || !input.setId || card.id !== input.cardId || card.set_id !== input.setId) return missing;
  const languages = [card.language, ...(input.languages ?? []), explicitPrefix(input.cardId), explicitPrefix(input.setId)]
    .filter((value) => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== ''));
  const normalized = languages.map((value) => LANGUAGE_ALIASES[token(value)]);
  if (normalized.some((value) => !value) || new Set(normalized).size > 1) return missing;
  const prices = card.raw_data?.tcgplayer?.prices;
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) return missing;
  const edition = token(input.edition);
  if (edition && !['1st-edition', 'first-edition', 'unlimited'].includes(edition)) return missing;
  const matchesEdition = (key: string) => !edition || (edition === 'unlimited'
    ? !key.startsWith('1stEdition') : key.startsWith('1stEdition'));
  const keys = input.variant
    ? PRICE_KEYS.filter((key) => key === input.variant && matchesEdition(key) && Object.hasOwn(prices, key))
    : PRICE_KEYS.filter((key) => matchesEdition(key) && Object.hasOwn(prices, key));
  // Saved placement rows lack a physical finish. Multiple keys cannot establish it.
  if (keys.length !== 1) return missing;
  const entry = prices[keys[0]];
  const usd = entry?.market ?? entry?.mid ?? entry?.low;
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0 || !Number.isSafeInteger(Math.round(usd * 100))) return missing;
  const amount = usdToGbp(usd);
  return Number.isSafeInteger(Math.round(amount * 100)) ? { amount, unsupported: false } : missing;
}
