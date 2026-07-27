import { getCollectorNumberLeft, normalizeIdentityPart, normalizeLanguage } from './identity.js';

const LANGUAGE_MARKETPLACE_TERMS = {
  en: ['English'],
  ja: ['Japanese', 'Japan', 'JPN'],
  'zh-TW': ['Chinese Traditional', 'Taiwan Chinese', 'zh-tw'],
  'zh-CN': ['Chinese Simplified', 'Simplified Chinese', 'zh-cn'],
  ko: ['Korean', 'KOR'],
};

const COMMON_SET_ALIASES = {
  'crown zenith': ['Crown Zenith', 'CZ'],
  'vstar universe': ['VSTAR Universe', 'V Star Universe', 'S12a'],
  'terastal festival ex': ['Terastal Festival ex', 'Terastal Festival', 'SV8a'],
  'super electric breaker': ['Super Electric Breaker', 'SV8'],
  'shiny treasure ex': ['Shiny Treasure ex', 'SV4a'],
  'gem pack vol. 5': ['Gem Pack Vol. 5', 'Gem Pack 5'],
};

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const cleaned = String(value ?? '').trim().replace(/\s+/g, ' ');
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function quote(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned.includes(' ') ? `"${cleaned}"` : cleaned;
}

function getNames(identity) {
  return unique([
    identity.canonicalCardName,
    identity.localisedCardNames?.[identity.language],
    identity.localisedCardNames?.en,
    ...(Array.isArray(identity.aliases?.cardNames) ? identity.aliases.cardNames : []),
  ]);
}

function getSetNames(identity) {
  const base = unique([
    identity.canonicalSetName,
    identity.localisedSetNames?.[identity.language],
    identity.localisedSetNames?.en,
    ...(Array.isArray(identity.aliases?.setNames) ? identity.aliases.setNames : []),
  ]);
  const aliases = base.flatMap((name) => COMMON_SET_ALIASES[normalizeIdentityPart(name, '')] ?? []);
  return unique([...base, ...aliases]);
}

function getNumberForms(identity) {
  const left = getCollectorNumberLeft(identity.cardNumber);
  return unique([
    identity.printedCardNumber,
    identity.cardNumber,
    identity.setTotal && left ? `${left}/${identity.setTotal}` : null,
    left,
  ]);
}

function getVariantTerms(identity) {
  const terms = [];
  if (identity.finish === 'masterball_reverse') terms.push('Master Ball reverse', 'Masterball');
  if (identity.finish === 'pokeball_reverse') terms.push('Poke Ball reverse', 'Pokeball');
  if (identity.finish === 'reverse_holo') terms.push('reverse holo');
  if (identity.finish === 'holo') terms.push('holo');
  if (identity.finish === 'textured') terms.push('textured');
  if (identity.edition === 'first_edition') terms.push('1st edition');
  if (identity.edition === 'shadowless') terms.push('shadowless');
  if (identity.edition === 'unlimited') terms.push('unlimited');
  if (identity.productType === 'graded_card') {
    if (identity.gradingCompany) terms.push(identity.gradingCompany.toUpperCase());
    if (identity.grade) terms.push(identity.grade);
    terms.push('graded slab');
  }
  if (identity.productType === 'sealed_product') {
    terms.push(identity.sealedProductType || 'sealed product');
    terms.push('sealed');
  }
  return unique(terms);
}

export function generatePricingQueries(identity, options = {}) {
  const language = normalizeLanguage(identity.language);
  const names = getNames(identity);
  const setNames = getSetNames(identity);
  const numberForms = getNumberForms(identity);
  const languageTerms = LANGUAGE_MARKETPLACE_TERMS[language] ?? [];
  const variantTerms = getVariantTerms(identity);
  const setCode = identity.setCode ? identity.setCode.toUpperCase() : '';
  const queryLimit = options.limit ?? 12;
  const queries = [];

  for (const name of names.slice(0, 3)) {
    for (const number of numberForms.slice(0, 3)) {
      for (const setName of setNames.slice(0, 3)) {
        queries.push([
          quote(name),
          quote(number),
          quote(setName),
          setCode,
          ...languageTerms.slice(0, 1),
          ...variantTerms.slice(0, 2),
          'pokemon card',
        ]);
      }
    }
  }

  for (const name of names.slice(0, 2)) {
    for (const number of numberForms.slice(0, 2)) {
      queries.push([
        quote(name),
        quote(number),
        setCode,
        ...languageTerms.slice(0, 2),
        ...variantTerms.slice(0, 2),
        'pokemon card',
      ]);
    }
  }

  if (identity.productType === 'sealed_product') {
    queries.push([
      quote(identity.canonicalSetName || identity.localisedSetNames?.[identity.language]),
      identity.setCode,
      identity.sealedProductType,
      identity.packageVariant,
      ...languageTerms.slice(0, 1),
      'pokemon sealed',
    ]);
  }

  return unique(
    queries
      .map((parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())
      .filter((query) => query.length >= 8)
  ).slice(0, queryLimit);
}
