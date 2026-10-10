import { PUBLISHED_CARD_ENGLISH_NAMES } from './generated/publishedCardEnglishNames.js';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS, OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS } from './generated/ownerApprovedCardEnglishNames.js';

const JAPANESE_151_TRAINER_NAMES = {
  'エネルギーシール': 'Energy Sticker',
  'スナッチアーム': 'Grabber',
  '古びたかいの化石': 'Antique Dome Fossil',
  '古びたこうらの化石': 'Antique Helix Fossil',
  '古びたひみつのコハク': 'Antique Old Amber',
  '安全ゴーグル': 'Protective Goggles',
  '大きなふうせん': 'Big Air Balloon',
  'ガチガチバンド': 'Rigid Band',
  'たべのこし': 'Leftovers',
  'エリカの招待': "Erika's Invitation",
  'サカキのカリスマ': "Giovanni's Charisma",
  'ナナミの手助け': "Daisy's Help",
  'マサキの転送': "Bill's Transfer",
  'サイクリングロード': 'Cycling Road',
  'ポケモンいれかえ': 'Switch',
  '基本超エネルギー': 'Basic Psychic Energy',
};

const JAPANESE_POKEMON_ENGLISH_NAMES = {
  'ピカチュウ': 'Pikachu',
  'リザードン': 'Charizard',
  'ミュウツー': 'Mewtwo',
  'ミュウ': 'Mew',
  'イーブイ': 'Eevee',
  'ゲンガー': 'Gengar',
  'ルカリオ': 'Lucario',
  'レックウザ': 'Rayquaza',
  'サーナイト': 'Gardevoir',
  'ブラッキー': 'Umbreon',
  'エーフィ': 'Espeon',
  'ニンフィア': 'Sylveon',
  'グレイシア': 'Glaceon',
  'リーフィア': 'Leafeon',
  'シャワーズ': 'Vaporeon',
  'サンダース': 'Jolteon',
  'ブースター': 'Flareon',
  'ザシアン': 'Zacian',
  'ザマゼンタ': 'Zamazenta',
  'アルセウス': 'Arceus',
  'ギラティナ': 'Giratina',
  'ディアルガ': 'Dialga',
  'パルキア': 'Palkia',
};

function withinTwoEdits(value, expected) {
  if (Math.abs(value.length - expected.length) > 2) return false;
  let previous = Array.from({ length: expected.length + 1 }, (_, i) => i);
  for (let i = 1; i <= value.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= expected.length; j += 1) current[j] = Math.min(
      current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (value[i - 1] === expected[j - 1] ? 0 : 1),
    );
    if (Math.min(...current) > 2) return false;
    previous = current;
  }
  return previous[expected.length] <= 2;
}

/** One implementation for mobile, backend, cache reads and audit tooling. */
export function normalizeCardTranslationName(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || /[\u0000-\u001f\u007f]/u.test(text)) return null;
  const words = text.normalize('NFKC').toLowerCase().match(/^(?:english\s+)?([a-z]{9,13})[\s_-]+([a-z]{5,9})\s*[.!\u2026]*$/u);
  return words && withinTwoEdits(words[1], 'translation') && withinTwoEdits(words[2], 'pending') ? null : text;
}

export function cleanCardEnglishName(value) {
  const text = normalizeCardTranslationName(value);
  if (!text || !/\p{Script=Latin}/u.test(text)) return null;
  // Isolated Greek markers occur in existing delta-species, Sphere and Plate names.
  const letters = text.replace(/(?:^|\s)[αβγδ](?=$|\s)/gu, ' ').replace(/\p{Script=Latin}/gu, '');
  return /\p{L}/u.test(letters) ? null : text;
}

/** Set titles can legitimately be numeric, for example the English set "151". */
export function cleanSetEnglishName(value) {
  const text = normalizeCardTranslationName(value);
  return cleanCardEnglishName(text) ?? (text && /^[0-9]+$/u.test(text) ? text : null);
}

export function normalizeCardTranslationLanguage(value) {
  const language = String(value ?? '').toLowerCase().replace(/_/g, '-');
  if (['jp', 'ja', 'japanese', 'japan'].includes(language)) return 'ja';
  if (['zh-cn', 'zh-hans', 'zhcn', 'simplified-chinese', 'cn', 'china'].includes(language)) return 'zh-cn';
  if (['zh', 'zh-tw', 'zh-hant', 'zh-hk', 'zhtw', 'traditional-chinese', 'chinese', 'tw', 'taiwan'].includes(language)) return 'zh-tw';
  if (['ko', 'kr', 'korean', 'korea'].includes(language)) return 'ko';
  if (['en', 'english'].includes(language)) return 'en';
  return null;
}

/**
 * Public-safe provenance attached to a reviewed canonical English display
 * name.  This is deliberately narrow: a provider-derived label never
 * normalizes as verified official, and unknown legacy rows stay null.
 */
export function normalizeCardEnglishCanonicalProvenance(value) {
  if (!value || typeof value !== 'object') return null;
  const source = String(value.source ?? value.englishNameSource ?? '').trim();
  const status = String(value.status ?? value.englishNameStatus ?? '').trim();
  const verifiedOfficial = value.verifiedOfficial ?? value.englishNameVerifiedOfficial;
  const sourceEvidenceSha256 = String(value.sourceEvidenceSha256 ?? value.englishNameEvidenceSha256 ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sourceEvidenceSha256) || typeof verifiedOfficial !== 'boolean') return null;
  const valid = (expectedSource, expectedStatus, expectedVerified) => source === expectedSource
    && status === expectedStatus && verifiedOfficial === expectedVerified;
  if (!(
    valid('official_card_database', 'verified_official', true)
    || valid('official_card_checklist', 'verified_official', true)
    || valid('editorial_complete_native_name', 'reviewed_editorial_translation', false)
    || valid('provider_complete_native_name', 'reviewed_provider_metadata', false)
    || valid('stackr_published_metadata', 'published_metadata', false)
  )) return null;
  return { source, status, verifiedOfficial, sourceEvidenceSha256 };
}

function nativeKey(value) {
  return normalizeCardTranslationName(value)?.normalize('NFC').replace(/\s+/gu, ' ') ?? null;
}

const ownerApprovedByCardId = new Map();
const ownerApprovedByNativeName = new Map();
for (const [language, nativeName, value, sourceCardIds] of OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS) {
  const record = { language, nativeName, value, sourceCardIds };
  const key = `${language}\u0000${nativeName}`;
  if (!ownerApprovedByNativeName.has(key)) ownerApprovedByNativeName.set(key, record);
  else if (ownerApprovedByNativeName.get(key)?.value !== value) ownerApprovedByNativeName.set(key, null);
  for (const id of sourceCardIds) ownerApprovedByCardId.set(id, record);
}
// These eight older IDs were read back and matched against the approved full
// native title, language, set and collector number. This changes display only.
for (const [legacyId, printingId] of OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS) {
  ownerApprovedByCardId.set(legacyId.toLowerCase(), ownerApprovedByCardId.get(printingId));
}

function ownerApprovedSupplement(record) {
  return {
    value: record.value, provenance: 'published_stackr_exact_native_name',
    authoritative: false, sourceCardIds: record.sourceCardIds.slice(0, 3),
  };
}

export function resolveCardEnglishSupplement({ language, nativeName, cardIds = [], englishNames = [], englishNameProvenance = null } = {}) {
  const key = nativeKey(nativeName);
  const code = normalizeCardTranslationLanguage(language);
  const suffix = key?.match(/(?:VMAX|VSTAR|V-UNION|LV\.X|BREAK|GX|EX|ex|V)$/u)?.[0];
  const canonicalProvenance = normalizeCardEnglishCanonicalProvenance(englishNameProvenance);
  const exactRecords = new Map();
  for (const candidate of cardIds) {
    if (typeof candidate !== 'string') continue;
    const record = ownerApprovedByCardId.get(candidate.trim().toLowerCase());
    if (record && record.language === code && record.nativeName === key) exactRecords.set(record.value, record);
  }
  // An approved printing-specific correction replaces stale legacy/cache text.
  // A later reviewed canonical name keeps precedence over this dated snapshot.
  if (!canonicalProvenance && exactRecords.size === 1) return ownerApprovedSupplement(exactRecords.values().next().value);
  for (const candidate of englishNames) {
    const value = cleanCardEnglishName(candidate);
    if (value && (!suffix || value.endsWith(suffix))) {
      return {
        value,
        provenance: 'explicit_english_metadata',
        authoritative: true,
        ...(canonicalProvenance ? { canonicalProvenance } : {}),
      };
    }
  }
  if (!key) return null;
  if (exactRecords.size === 1) return ownerApprovedSupplement(exactRecords.values().next().value);
  const approvedKey = `${code}\u0000${key}`;
  if (exactRecords.size > 1 || (ownerApprovedByNativeName.has(approvedKey) && !ownerApprovedByNativeName.get(approvedKey))) return null;
  const approved = ownerApprovedByNativeName.get(approvedKey);
  if (approved) return ownerApprovedSupplement(approved);
  // Full native name plus language only. This translates display text; it does
  // not equate printings, artwork, variants, sets or collector numbers.
  const entries = code ? PUBLISHED_CARD_ENGLISH_NAMES[code] : null;
  const published = entries && Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null;
  if (published) return {
    value: published.value, provenance: 'published_stackr_exact_native_name',
    authoritative: false, sourceCardIds: published.sourceCardIds.slice(0, 3),
  };
  if (code === 'en' || !code) {
    const bilingual = code === 'en' ? key.match(/^[\p{Script=Katakana}\p{Script=Hiragana}\p{Script=Han}ー]+\[([^\[\]]+)\]$/u)?.[1] : null;
    const value = cleanCardEnglishName(key) ?? cleanCardEnglishName(bilingual);
    return value ? { value, provenance: 'explicit_english_metadata', authoritative: true } : null;
  }
  if (code !== 'ja') return null;
  if (Object.prototype.hasOwnProperty.call(JAPANESE_151_TRAINER_NAMES, key)) return {
    value: JAPANESE_151_TRAINER_NAMES[key], provenance: 'stackr_existing_application_map', authoritative: false,
  };
  // Accept a complete species name and a known, case-sensitive card suffix.
  // Never discard a Trainer, region, TAG TEAM partner or unknown modifier.
  const compact = key.replace(/\s+/gu, '');
  for (const [native, english] of Object.entries(JAPANESE_POKEMON_ENGLISH_NAMES)) {
    if (!compact.startsWith(native)) continue;
    const suffix = compact.slice(native.length);
    if (!['', 'ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR', 'BREAK', 'LV.X', 'V-UNION'].includes(suffix)) continue;
    return {
      value: english + (suffix ? ` ${suffix}` : ''),
      provenance: 'stackr_existing_application_map', authoritative: false,
    };
  }
  return null;
}

/** Search keeps gender and form markers that distinguish reviewed card titles. */
export function normalizeCardEnglishSearchText(value) {
  const english = cleanCardEnglishName(value);
  return english?.normalize('NFKC').normalize('NFD')
    .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, '$1').normalize('NFKC').toLowerCase()
    .replace(/[\u2019\u2018`\u00b4']/gu, '')
    .replace(/[^\p{L}\p{N}♀♂/+\-]+/gu, ' ').replace(/\s+/gu, ' ').trim() ?? '';
}

// These are candidate native names, never permission to relabel another printing.
// Ambiguous full names are eligible only because the API rechecks the actual ID.
export function findNativeCardNamesForEnglishQuery(query, language = null) {
  const needle = normalizeCardEnglishSearchText(query);
  if (!needle || needle.length < 2) return [];
  const code = language == null ? null : normalizeCardTranslationLanguage(language);
  if (language != null && !code) return [];
  const matches = [];
  for (const [recordLanguage, nativeName, value] of OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS) {
    if (code && code !== recordLanguage) continue;
    if (normalizeCardEnglishSearchText(value).includes(needle)) matches.push({ language: recordLanguage, nativeName });
  }
  for (const [lang, entries] of Object.entries(PUBLISHED_CARD_ENGLISH_NAMES)) {
    if (code && code !== lang) continue;
    for (const [nativeName, record] of Object.entries(entries)) {
      const approvedKey = `${lang}\u0000${nativeName}`;
      if (ownerApprovedByNativeName.has(approvedKey)) continue;
      if (normalizeCardEnglishSearchText(record.value).includes(needle)) matches.push({ language: lang, nativeName });
    }
  }
  if (!code || code === 'ja') {
    for (const [nativeName, english] of Object.entries({ ...JAPANESE_151_TRAINER_NAMES, ...JAPANESE_POKEMON_ENGLISH_NAMES })) {
      if (normalizeCardEnglishSearchText(english).includes(needle)) matches.push({ language: 'ja', nativeName });
    }
  }
  const counts = new Map();
  return [...new Map(matches.map((match) => [`${match.language}\u0000${match.nativeName}`, match])).values()]
    .filter((match) => {
      const count = counts.get(match.language) ?? 0;
      if (count >= 80) return false;
      counts.set(match.language, count + 1);
      return true;
    });
}
