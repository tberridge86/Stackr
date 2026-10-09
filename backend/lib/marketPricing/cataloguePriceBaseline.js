// Railway deploys backend independently. Keep this policy identical to the
// reviewed mobile cataloguePriceBaseline model; the parity test detects drift.
const RARITY_BASELINE_GBP = {
  common: 0.10, uncommon: 0.15,
};

export const PROVISIONAL_CATALOGUE_PRICE_MODEL = 'catalogue-rarity-era-baseline-v2';

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function token(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function releaseYear(value) {
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

function ordinary(value) {
  return ['', 'normal', 'standard', 'default', 'regular', 'non_holo', 'nonholo', 'non_foil', 'nonfoil', 'unlimited'].includes(token(value));
}

/** Provisional browse coverage only, never sale evidence or a holdings value. */
export function provisionalCataloguePriceBaseline(input) {
  if (!input.variantId?.trim()) return null;
  const rarity = token(input.rarity);
  const year = releaseYear(input.releaseDate);
  if (!Object.hasOwn(RARITY_BASELINE_GBP, rarity) || year == null
    || !ordinary(input.finish) || !ordinary(input.variant) || !ordinary(input.edition)) return null;
  const multiplier = year < 2016 ? 1.1 : year >= 2020 ? 0.85 : 1;
  const central = roundMoney(RARITY_BASELINE_GBP[rarity] * multiplier);
  return {
    currency: 'GBP', low: roundMoney(Math.max(0.01, central * 0.25)), central,
    high: roundMoney(central * 2.5), rarity, eraMultiplier: multiplier,
    modelVersion: PROVISIONAL_CATALOGUE_PRICE_MODEL,
  };
}
