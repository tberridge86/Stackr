import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getLocalCardName,
  getLocalSetName,
} from './pokemonDisplayNames';

type CardAttack = {
  name?: string;
  damage?: string;
  text?: string;
  cost?: string[];
};

type CardEffect = {
  type?: string;
  value?: string;
};

export type ForeignCardPresentationInput = {
  id?: string | null;
  name?: string | null;
  localName?: string | null;
  number?: string | null;
  language?: string | null;
  region?: string | null;
  set?: {
    id?: string | null;
    name?: string | null;
    localName?: string | null;
    englishDisplayName?: string | null;
  } | null;
  raw_data?: any;
  artist?: string;
  hp?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  evolvesFrom?: string;
  flavorText?: string;
  rules?: string[];
  attacks?: CardAttack[];
  weaknesses?: CardEffect[];
  resistances?: CardEffect[];
  retreatCost?: string[];
};

export type ForeignCardPresentation = {
  isForeign: boolean;
  languageCode: string;
  languageLabel: string;
  name: string;
  englishDisplayName: string | null;
  nativeName: string | null;
  setName: string;
  englishSetDisplayName: string | null;
  nativeSetName: string | null;
  translationStatus: 'not_required' | 'verified' | 'partial' | 'pending';
  withheldNativeDetails: boolean;
  details: {
    supertype?: string;
    subtypes?: string[];
    types?: string[];
    evolvesFrom?: string;
    flavorText?: string;
    rules?: string[];
    attacks?: CardAttack[];
    weaknesses?: CardEffect[];
    resistances?: CardEffect[];
    retreatCost?: string[];
  };
};

const LANGUAGE_LABELS: Record<string, string> = {
  ja: 'Japanese',
  jp: 'Japanese',
  'zh-cn': 'Simplified Chinese',
  'zh-hans': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  'zh-hant': 'Traditional Chinese',
  zh: 'Chinese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  'pt-br': 'Brazilian Portuguese',
  pt: 'Portuguese',
  id: 'Indonesian',
  th: 'Thai',
};

const ENGLISH_TAXONOMY: Record<string, string> = {
  colorless: 'Colorless',
  darkness: 'Darkness',
  dragon: 'Dragon',
  fairy: 'Fairy',
  fighting: 'Fighting',
  fire: 'Fire',
  grass: 'Grass',
  lightning: 'Lightning',
  metal: 'Metal',
  psychic: 'Psychic',
  water: 'Water',
  pokemon: 'Pokemon',
  pokémon: 'Pokemon',
  trainer: 'Trainer',
  energy: 'Energy',
  basic: 'Basic',
  stage1: 'Stage 1',
  'stage 1': 'Stage 1',
  stage2: 'Stage 2',
  'stage 2': 'Stage 2',
  item: 'Item',
  supporter: 'Supporter',
  stadium: 'Stadium',
  tool: 'Tool',
  special: 'Special',
};

function clean(value: unknown) {
  const text = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  return text || null;
}

function containsNonEnglishScript(value: string | null) {
  return /[\u0400-\u052f\u0590-\u08ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3100-\u312f\u3400-\u9fff\uac00-\ud7af]/.test(value ?? '');
}

function cleanEnglishText(value: unknown) {
  const text = clean(value);
  return text && !containsNonEnglishScript(text) ? text : null;
}

function normalizedLanguage(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

export function isForeignCardLanguage(value: unknown) {
  const language = normalizedLanguage(value);
  if (!language || ['all', 'und', 'unknown'].includes(language)) return false;
  return language !== 'en' && language !== 'english' && !language.startsWith('en-');
}

function languageLabel(language: string) {
  return LANGUAGE_LABELS[language] ?? language.toUpperCase();
}

function englishPayloads(raw: any) {
  return [
    raw?.english,
    raw?.english_details,
    raw?.englishDetails,
    raw?.translation?.english,
    raw?.translations?.en,
    raw?.translations?.['en-GB'],
    raw?.translations?.['en-US'],
  ].filter((value) => value && typeof value === 'object');
}

function firstEnglishField(raw: any, fieldNames: string[]) {
  for (const payload of englishPayloads(raw)) {
    for (const field of fieldNames) {
      if (payload[field] != null) return payload[field];
    }
  }
  for (const field of fieldNames) {
    const snake = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    for (const suffix of ['_en', 'En']) {
      const key = suffix === '_en' ? `${snake}${suffix}` : `${field}${suffix}`;
      if (raw?.[key] != null) return raw[key];
    }
  }
  return null;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map(cleanEnglishText).filter((entry): entry is string => Boolean(entry));
  return cleaned.length ? cleaned : undefined;
}

function cleanTaxonomyArray(value: unknown) {
  const values = cleanStringArray(value);
  if (!values) return undefined;
  const translated = values.map((entry) => ENGLISH_TAXONOMY[entry.toLowerCase()] ?? null);
  return translated.every(Boolean) ? translated as string[] : undefined;
}

function cleanEffects(value: unknown, requireKnownTaxonomy = false): CardEffect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effects = value.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const type = cleanEnglishText((entry as any).type);
    const translatedType = type
      ? ENGLISH_TAXONOMY[type.toLowerCase()] ?? (requireKnownTaxonomy ? null : type)
      : null;
    const effectValue = clean((entry as any).value);
    return translatedType
      ? { type: translatedType, value: effectValue ?? undefined }
      : null;
  }).filter(Boolean) as CardEffect[];
  return effects.length ? effects : undefined;
}

function cleanAttacks(value: unknown): CardAttack[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attacks = value.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const name = cleanEnglishText((entry as any).name);
    const damage = clean((entry as any).damage);
    const text = cleanEnglishText((entry as any).text ?? (entry as any).effect);
    const cost = cleanTaxonomyArray((entry as any).cost);
    if (!name && !damage && !text && !cost) return null;
    return {
      name: name ?? undefined,
      damage: damage ?? undefined,
      text: text ?? undefined,
      cost,
    };
  }).filter(Boolean) as CardAttack[];
  return attacks.length ? attacks : undefined;
}

function hasNativeDescriptiveDetails(card: ForeignCardPresentationInput) {
  return Boolean(
    clean(card.evolvesFrom)
    || clean(card.flavorText)
    || card.rules?.length
    || card.attacks?.length,
  );
}

export function buildForeignCardPresentation(card: ForeignCardPresentationInput): ForeignCardPresentation {
  const raw = card.raw_data ?? {};
  const languageCode = normalizedLanguage(card.language ?? raw.language) || 'en';
  const isForeign = isForeignCardLanguage(languageCode);
  const nativeName = getLocalCardName({
    id: card.id,
    setId: card.set?.id,
    collectorNumber: card.number,
    language: languageCode,
    region: card.region ?? raw.region,
    localName: card.localName ?? raw.local_name,
    fallbackName: raw.native_name ?? raw.name ?? card.name,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: card.id,
    setId: card.set?.id,
    collectorNumber: card.number,
    language: languageCode,
    region: card.region ?? raw.region,
    localName: nativeName,
    englishDisplayName: raw.english_display_name ?? raw.englishDisplayName,
    fallbackName: card.name,
    raw,
  });
  const rawSet = raw.set ?? {};
  const nativeSetName = getLocalSetName({
    id: card.set?.id,
    setCode: rawSet.set_code ?? rawSet.setCode,
    language: languageCode,
    region: card.region ?? raw.region,
    localName: card.set?.localName ?? rawSet.local_name ?? rawSet.native_name,
    fallbackName: rawSet.name ?? card.set?.name,
    raw: rawSet,
  });
  const englishSetDisplayName = getEnglishSetDisplayName({
    id: card.set?.id,
    setCode: rawSet.set_code ?? rawSet.setCode,
    language: languageCode,
    region: card.region ?? raw.region,
    localName: nativeSetName,
    englishDisplayName: card.set?.englishDisplayName ?? rawSet.english_display_name ?? rawSet.englishDisplayName,
    fallbackName: card.set?.name,
    raw: rawSet,
  });

  if (!isForeign) {
    return {
      isForeign: false,
      languageCode,
      languageLabel: languageLabel(languageCode),
      name: englishDisplayName ?? clean(card.name) ?? nativeName ?? 'Unknown card',
      englishDisplayName: englishDisplayName ?? clean(card.name),
      nativeName: nativeName ?? clean(card.name),
      setName: englishSetDisplayName ?? clean(card.set?.name) ?? nativeSetName ?? 'Unknown set',
      englishSetDisplayName: englishSetDisplayName ?? clean(card.set?.name),
      nativeSetName: nativeSetName ?? clean(card.set?.name),
      translationStatus: 'not_required',
      withheldNativeDetails: false,
      details: {
        supertype: card.supertype,
        subtypes: card.subtypes,
        types: card.types,
        evolvesFrom: card.evolvesFrom,
        flavorText: card.flavorText,
        rules: card.rules,
        attacks: card.attacks,
        weaknesses: card.weaknesses,
        resistances: card.resistances,
        retreatCost: card.retreatCost,
      },
    };
  }

  const translatedSupertype = cleanEnglishText(firstEnglishField(raw, ['supertype']))
    ?? cleanTaxonomyArray(card.supertype ? [card.supertype] : undefined)?.[0];
  const translatedSubtypes = cleanStringArray(firstEnglishField(raw, ['subtypes']))
    ?? cleanTaxonomyArray(card.subtypes);
  const translatedTypes = cleanStringArray(firstEnglishField(raw, ['types']))
    ?? cleanTaxonomyArray(card.types);
  const translatedEvolvesFrom = cleanEnglishText(firstEnglishField(raw, ['evolvesFrom', 'evolves_from']));
  const translatedFlavorText = cleanEnglishText(firstEnglishField(raw, ['flavorText', 'flavourText', 'flavor_text', 'flavour_text']));
  const translatedRules = cleanStringArray(firstEnglishField(raw, ['rules']));
  const translatedAttacks = cleanAttacks(firstEnglishField(raw, ['attacks']));
  const translatedWeaknesses = cleanEffects(firstEnglishField(raw, ['weaknesses']))
    ?? cleanEffects(card.weaknesses, true);
  const translatedResistances = cleanEffects(firstEnglishField(raw, ['resistances']))
    ?? cleanEffects(card.resistances, true);
  const translatedRetreatCost = cleanStringArray(firstEnglishField(raw, ['retreatCost', 'retreat_cost']))
    ?? cleanTaxonomyArray(card.retreatCost);
  const withheldNativeDetails = hasNativeDescriptiveDetails(card)
    && !translatedEvolvesFrom
    && !translatedFlavorText
    && !translatedRules
    && !translatedAttacks;
  const hasTranslatedDetails = Boolean(
    translatedSupertype
    || translatedSubtypes?.length
    || translatedTypes?.length
    || translatedEvolvesFrom
    || translatedFlavorText
    || translatedRules?.length
    || translatedAttacks?.length,
  );
  const translationStatus = englishDisplayName
    ? withheldNativeDetails ? 'partial' : 'verified'
    : hasTranslatedDetails ? 'partial' : 'pending';

  return {
    isForeign: true,
    languageCode,
    languageLabel: languageLabel(languageCode),
    name: englishDisplayName ?? nativeName ?? clean(card.name) ?? 'Unknown card',
    englishDisplayName,
    nativeName,
    setName: englishSetDisplayName ?? nativeSetName ?? clean(card.set?.name) ?? 'Unknown set',
    englishSetDisplayName,
    nativeSetName,
    translationStatus,
    withheldNativeDetails,
    details: {
      supertype: translatedSupertype ?? undefined,
      subtypes: translatedSubtypes,
      types: translatedTypes,
      evolvesFrom: translatedEvolvesFrom ?? undefined,
      flavorText: translatedFlavorText ?? undefined,
      rules: translatedRules,
      attacks: translatedAttacks,
      weaknesses: translatedWeaknesses,
      resistances: translatedResistances,
      retreatCost: translatedRetreatCost,
    },
  };
}
