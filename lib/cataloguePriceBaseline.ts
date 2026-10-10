export type CataloguePriceBaselineInput = {
  variantId: string;
  printingId?: string | null;
  language?: string | null;
  rarity?: unknown;
  releaseDate?: unknown;
  finish?: unknown;
  variant?: unknown;
  edition?: unknown;
};

export type CataloguePriceBaselineDisplayInput = CataloguePriceBaselineInput & { productType?: unknown };

const RARITY_BASELINE_GBP: Record<string, number> = {
  common: 0.10, uncommon: 0.15,
};

export const PROVISIONAL_CATALOGUE_PRICE_MODEL = 'catalogue-rarity-era-baseline-v2';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function token(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function releaseYear(value: unknown) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}(?:-\d{2}-\d{2})?$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  if (year < 2010 || year > new Date().getUTCFullYear() + 1) return null;
  if (text.length > 4) {
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  }
  return year;
}

function ordinary(value: unknown) {
  return ['', 'normal', 'standard', 'default', 'regular', 'non_holo', 'nonholo', 'non_foil', 'nonfoil', 'unlimited'].includes(token(value));
}

/** Conservative browse-only estimate for ordinary modern bulk cards. Vintage
 * cards, rares and missing metadata require a stored price with card evidence. */
export function provisionalCataloguePriceBaseline(input: CataloguePriceBaselineInput) {
  if (!input.variantId?.trim()) return null;
  const rarity = token(input.rarity);
  const year = releaseYear(input.releaseDate);
  if (!Object.hasOwn(RARITY_BASELINE_GBP, rarity) || year == null
    || !ordinary(input.finish) || !ordinary(input.variant) || !ordinary(input.edition)) return null;
  const multiplier = year < 2016 ? 1.1 : year >= 2020 ? 0.85 : 1;
  const central = roundMoney(RARITY_BASELINE_GBP[rarity] * multiplier);
  return {
    currency: 'GBP' as const,
    low: roundMoney(Math.max(0.01, central * 0.25)),
    central,
    high: roundMoney(central * 2.5),
    rarity,
    eraMultiplier: multiplier,
    modelVersion: PROVISIONAL_CATALOGUE_PRICE_MODEL,
  };
}

export function provisionalCataloguePriceDisplay(input: CataloguePriceBaselineDisplayInput) {
  if (String(input.productType ?? 'raw_card').toLowerCase() !== 'raw_card') return null;
  const baseline = provisionalCataloguePriceBaseline(input);
  if (!baseline) return null;
  return {
    displayPrice: baseline.central,
    currency: baseline.currency,
    priceType: 'market_estimate',
    updatedAt: null,
    pricingStatus: 'provisional',
    sourceLabel: 'Estimated price (provisional baseline)',
    confidence: 'low',
    unavailableReason: null,
    priceBasis: 'general' as const,
    provisional: true,
    sourceBreakdown: [{
      provider: 'stackr_catalogue_baseline', evidenceType: 'provisional_category_baseline',
      modelVersion: baseline.modelVersion, rarity: baseline.rarity, eraMultiplier: baseline.eraMultiplier,
    }],
  };
}
