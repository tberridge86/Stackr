const LANGUAGE_ALIASES = new Map([
  ['en', 'en'],
  ['eng', 'en'],
  ['english', 'en'],
  ['uk', 'en'],
  ['us', 'en'],
  ['ja', 'ja'],
  ['jp', 'ja'],
  ['jpn', 'ja'],
  ['ja-jp', 'ja'],
  ['ja_jp', 'ja'],
  ['japanese', 'ja'],
  ['japan', 'ja'],
  ['ko', 'ko'],
  ['kr', 'ko'],
  ['kor', 'ko'],
  ['korean', 'ko'],
  ['zh', 'zh-TW'],
  ['zhtw', 'zh-TW'],
  ['zh-tw', 'zh-TW'],
  ['zh_tw', 'zh-TW'],
  ['zh-hant', 'zh-TW'],
  ['zh_hant', 'zh-TW'],
  ['traditional chinese', 'zh-TW'],
  ['chinese traditional', 'zh-TW'],
  ['taiwan', 'zh-TW'],
  ['tc', 'zh-TW'],
  ['zhcn', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['zh_cn', 'zh-CN'],
  ['zh-hans', 'zh-CN'],
  ['zh_hans', 'zh-CN'],
  ['simplified chinese', 'zh-CN'],
  ['chinese simplified', 'zh-CN'],
  ['mainland chinese', 'zh-CN'],
  ['cn', 'zh-CN'],
]);

const FINISH_ALIASES = [
  { key: 'masterball_reverse', patterns: [/master\s*ball/i, /masterball/i] },
  { key: 'pokeball_reverse', patterns: [/poke\s*ball/i, /pokeball/i] },
  { key: 'reverse_holo', patterns: [/reverse/i] },
  { key: 'holo', patterns: [/holo/i, /foil/i] },
  { key: 'textured', patterns: [/textured/i, /\bsar\b/i, /\bsir\b/i, /\bsr\b/i, /\bur\b/i, /\bhr\b/i] },
  { key: 'non_holo', patterns: [/non[\s-]?holo/i, /normal/i] },
];

const EDITION_ALIASES = [
  { key: 'first_edition', patterns: [/1st/i, /first edition/i] },
  { key: 'shadowless', patterns: [/shadowless/i] },
  { key: 'unlimited', patterns: [/unlimited/i] },
  { key: 'promotional', patterns: [/promo/i, /promotional/i] },
];

function normalizeLooseText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeLanguage(value) {
  const raw = normalizeLooseText(value).toLowerCase();
  if (!raw) return 'en';
  return LANGUAGE_ALIASES.get(raw) ?? 'en';
}

export function normalizeLanguageForDb(value) {
  return normalizeLanguage(value).toLowerCase();
}

export function normalizeIdentityPart(value, fallback = 'unknown') {
  const normalized = normalizeLooseText(value)
    .toLowerCase()
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

export function normalizeCollectorNumber(value) {
  const normalized = normalizeLooseText(value)
    .replace(/^#/, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  if (!normalized) return '';

  return normalized
    .split('/')
    .map((part) => {
      const cleaned = part.replace(/[^a-z0-9-]/g, '');
      return /^\d+$/.test(cleaned) ? (cleaned.replace(/^0+/, '') || '0') : cleaned;
    })
    .join('/');
}

export function getCollectorNumberLeft(value) {
  return normalizeCollectorNumber(value).split('/')[0] ?? '';
}

function pickFirst(...values) {
  for (const value of values) {
    const normalized = normalizeLooseText(value);
    if (normalized) return normalized;
  }
  return null;
}

function inferFinish({ finish, variant, rarity, raw }) {
  const explicit = normalizeIdentityPart(finish ?? raw?.finish ?? raw?.card_finish ?? '', '');
  if (explicit) return explicit;

  const haystack = [
    variant,
    raw?.variant,
    raw?.subtype,
    raw?.rarity,
    rarity,
    raw?.cardmarket?.variant,
    raw?.tcgplayer?.variant,
  ].filter(Boolean).join(' ');

  for (const alias of FINISH_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(haystack))) return alias.key;
  }

  return 'unknown_finish';
}

function inferEdition({ edition, rarity, raw }) {
  const explicit = normalizeIdentityPart(edition ?? raw?.edition ?? '', '');
  if (explicit) return explicit;

  const haystack = [rarity, raw?.rarity, raw?.variant, raw?.name].filter(Boolean).join(' ');
  for (const alias of EDITION_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(haystack))) return alias.key;
  }

  return 'modern';
}

function inferProductType(options) {
  const rawType = normalizeIdentityPart(options.productType ?? options.raw?.product_type ?? '', '');
  if (['raw_card', 'graded_card', 'sealed_product'].includes(rawType)) return rawType;
  if (['sealed', 'booster_pack', 'booster_box', 'elite_trainer_box'].includes(rawType)) return 'sealed_product';
  if (options.gradingCompany || options.grade || normalizeIdentityPart(options.pricingMode, '') === 'graded') {
    return 'graded_card';
  }
  return 'raw_card';
}

export function buildCanonicalIdentity(cardRow = {}, overrides = {}) {
  const raw = cardRow.raw_data ?? cardRow.raw ?? {};
  const setRaw = raw?.set ?? cardRow.set ?? {};
  const language = normalizeLanguage(overrides.language ?? cardRow.language ?? raw?.language ?? setRaw?.language);
  const productType = inferProductType({ ...overrides, raw });
  const cardNumber = normalizeCollectorNumber(
    overrides.cardNumber ??
      overrides.number ??
      cardRow.number ??
      raw?.number ??
      raw?.localId ??
      raw?.collector_number
  );
  const setTotal = pickFirst(
    overrides.setTotal,
    overrides.printedTotal,
    raw?.set?.printedTotal,
    raw?.set?.printed_total,
    raw?.set?.total,
    cardRow.printed_total,
    cardRow.total
  );
  const printedCardNumber = setTotal && cardNumber && !cardNumber.includes('/')
    ? `${cardNumber}/${normalizeCollectorNumber(setTotal)}`
    : cardNumber;
  const canonicalCardName = pickFirst(
    overrides.canonicalCardName,
    raw?.canonical_name,
    raw?.english_display_name,
    raw?.englishDisplayName,
    language === 'en' ? cardRow.name : null,
    cardRow.name,
    cardRow.id
  );
  const localName = pickFirst(
    overrides.localName,
    raw?.local_name,
    raw?.localName,
    language !== 'en' ? cardRow.name : null
  );
  const canonicalSetName = pickFirst(
    overrides.canonicalSetName,
    raw?.set?.english_display_name,
    raw?.set?.englishDisplayName,
    raw?.set?.canonical_name,
    setRaw?.english_display_name,
    setRaw?.name,
    raw?.set?.name,
    overrides.setName
  );
  const localSetName = pickFirst(
    overrides.localSetName,
    raw?.set?.local_name,
    raw?.set?.localName,
    language !== 'en' ? raw?.set?.name : null,
    language !== 'en' ? overrides.setName : null
  );

  const identity = {
    cardId: String(cardRow.id ?? overrides.cardId ?? '').trim(),
    productType,
    game: 'pokemon',
    characterName: pickFirst(overrides.characterName, raw?.pokemon_name, raw?.subject, canonicalCardName),
    canonicalCardName,
    localisedCardNames: {
      en: pickFirst(raw?.english_display_name, raw?.englishDisplayName, language === 'en' ? cardRow.name : null),
      [language]: localName,
    },
    setId: normalizeIdentityPart(overrides.setId ?? cardRow.set_id ?? raw?.set?.id ?? raw?.set_id ?? '', ''),
    canonicalSetName,
    localisedSetNames: {
      en: pickFirst(raw?.set?.english_display_name, raw?.set?.englishDisplayName),
      [language]: localSetName,
    },
    setCode: normalizeIdentityPart(overrides.setCode ?? raw?.set?.set_code ?? raw?.set?.setCode ?? raw?.setCode ?? '', ''),
    cardNumber,
    printedCardNumber,
    setTotal: setTotal ? normalizeCollectorNumber(setTotal) : '',
    language,
    releaseRegion: pickFirst(overrides.releaseRegion, cardRow.region, raw?.region, setRaw?.region),
    rarity: pickFirst(overrides.rarity, cardRow.rarity, raw?.rarity),
    finish: inferFinish({ finish: overrides.finish, variant: overrides.variant, rarity: overrides.rarity ?? cardRow.rarity, raw }),
    edition: inferEdition({ edition: overrides.edition, rarity: overrides.rarity ?? cardRow.rarity, raw }),
    variant: normalizeIdentityPart(overrides.variant ?? raw?.variant ?? '', 'standard'),
    promoCode: normalizeIdentityPart(overrides.promoCode ?? raw?.promoCode ?? raw?.promo_code ?? '', ''),
    gradingCompany: productType === 'graded_card'
      ? normalizeIdentityPart(overrides.gradingCompany ?? overrides.grader ?? raw?.gradingCompany ?? '', '')
      : '',
    grade: productType === 'graded_card'
      ? normalizeIdentityPart(overrides.grade ?? raw?.grade ?? '', '')
      : '',
    qualifier: normalizeIdentityPart(overrides.qualifier ?? raw?.qualifier ?? '', ''),
    rawCondition: productType === 'raw_card'
      ? normalizeIdentityPart(overrides.condition ?? overrides.rawCondition ?? raw?.condition ?? '', 'condition_unknown')
      : '',
    sealedProductType: productType === 'sealed_product'
      ? normalizeIdentityPart(overrides.sealedProductType ?? raw?.product_type ?? '', 'sealed_product')
      : '',
    packageVariant: productType === 'sealed_product'
      ? normalizeIdentityPart(overrides.packageVariant ?? raw?.package_variant ?? '', 'standard')
      : '',
  };

  return {
    ...identity,
    identityKey: buildIdentityKey(identity),
  };
}

export function buildIdentityKey(identity) {
  const parts = [
    identity.productType,
    identity.language,
    identity.setId,
    identity.cardNumber,
    identity.variant,
    identity.finish,
    identity.edition,
    identity.gradingCompany,
    identity.grade,
    identity.rawCondition,
    identity.sealedProductType,
    identity.packageVariant,
  ];
  return parts.map((part) => normalizeIdentityPart(part, '') || '_').join('|');
}

export function identitiesAreCompatible(left, right) {
  return buildIdentityKey(left) === buildIdentityKey(right);
}
