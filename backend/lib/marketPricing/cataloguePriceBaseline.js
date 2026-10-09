// Railway deploys backend independently. Keep this policy identical to the
// reviewed mobile cataloguePriceBaseline model; the parity test detects drift.
const RARITY_BASELINE_GBP = {
  common: 0.10, uncommon: 0.15, rare: 0.35, rare_holo: 0.75,
  double_rare: 1.20, ultra_rare: 3, illustration_rare: 5,
  special_illustration_rare: 15, hyper_rare: 8, shiny_rare: 2,
  shiny_ultra_rare: 5, promo: 1, ace_spec: 2, radiant_rare: 1.5,
  amazing_rare: 1.25, unknown: 0.25,
};

export const PROVISIONAL_CATALOGUE_PRICE_MODEL = 'catalogue-rarity-era-baseline-v1';

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rarityKey(value) {
  const token = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (token.includes('special') && token.includes('illustration')) return 'special_illustration_rare';
  if (token.includes('illustration')) return 'illustration_rare';
  if (token.includes('shiny') && token.includes('ultra')) return 'shiny_ultra_rare';
  if (token.includes('shiny')) return 'shiny_rare';
  if (token.includes('double')) return 'double_rare';
  if (token.includes('ultra')) return 'ultra_rare';
  if (token.includes('hyper')) return 'hyper_rare';
  if (token.includes('holo')) return 'rare_holo';
  if (token.includes('promo')) return 'promo';
  if (token.includes('ace')) return 'ace_spec';
  if (token.includes('radiant')) return 'radiant_rare';
  if (token.includes('amazing')) return 'amazing_rare';
  if (token.includes('uncommon')) return 'uncommon';
  if (token.includes('common')) return 'common';
  if (token.includes('rare')) return 'rare';
  return 'unknown';
}

function eraMultiplier(value) {
  const text = String(value ?? '').slice(0, 4);
  if (!/^\d{4}$/.test(text)) return 1;
  const year = Number(text);
  if (year < 2003) return 1.8;
  if (year < 2010) return 1.35;
  if (year < 2016) return 1.1;
  return year >= 2020 ? 0.85 : 1;
}

/** Provisional browse coverage only, never sale evidence or a holdings value. */
export function provisionalCataloguePriceBaseline(input) {
  if (!input.variantId?.trim()) return null;
  const rarity = rarityKey(input.rarity);
  const multiplier = eraMultiplier(input.releaseDate);
  const central = roundMoney(RARITY_BASELINE_GBP[rarity] * multiplier);
  return {
    currency: 'GBP', low: roundMoney(Math.max(0.01, central * 0.25)), central,
    high: roundMoney(central * 2.5), rarity, eraMultiplier: multiplier,
    modelVersion: PROVISIONAL_CATALOGUE_PRICE_MODEL,
  };
}
