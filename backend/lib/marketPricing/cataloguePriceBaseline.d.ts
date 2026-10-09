export type CataloguePriceBaselineInput = {
  variantId: string;
  printingId?: string | null;
  language?: string | null;
  rarity?: unknown;
  releaseDate?: unknown;
};
export const PROVISIONAL_CATALOGUE_PRICE_MODEL: 'catalogue-rarity-era-baseline-v1';
export function provisionalCataloguePriceBaseline(input: CataloguePriceBaselineInput): {
  currency: 'GBP'; low: number; central: number; high: number;
  rarity: string; eraMultiplier: number; modelVersion: typeof PROVISIONAL_CATALOGUE_PRICE_MODEL;
} | null;
