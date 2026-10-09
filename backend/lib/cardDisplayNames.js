import { normalizeCardTranslationName, resolveCardEnglishSupplement } from './cardNameTranslations.js';
import {
  JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA,
  JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE,
} from './generated/japaneseSetDisplayDrafts.generated.mjs';
import {
  CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA,
  CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE,
} from './generated/chineseSetTranslationDrafts.generated.mjs';
import {
  TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA,
  TCGDEX_JAPANESE_SET_ENGLISH_NAMES,
} from './generated/tcgdexJapaneseSetEnglishNames.generated.mjs';
import {
  STACKR_JAPANESE_SET_IDENTITIES_BY_CODE,
  STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA,
} from './generated/stackrJapaneseSetIdentity.generated.mjs';

const JAPANESE_SET_ENGLISH_NAMES_BY_ID = {
  pmcg1: 'Base Set',
  pmcg2: 'Pokemon Jungle',
  pmcg3: 'Mystery of the Fossils',
  pmcg4: 'Team Rocket',
  pmcg5: "Leader's Stadium",
  pmcg6: 'Challenge from the Darkness',
  neo1: 'Gold, Silver, to a New World...',
  neo2: 'Crossing the Ruins...',
  neo3: 'Awakening Legends',
  neo4: 'Darkness, and to Light...',
  vs1: 'Pokemon Card VS',
  web1: 'Pokemon Card Web',
  e1: 'Base Expansion Pack',
  e2: 'Town on No Map',
  e3: 'Wind from the Sea',
  e4: 'Split Earth',
  e5: 'Mysterious Mountains',
  adv1: 'Expansion Pack',
  adv2: 'Miracle of the Desert',
  adv3: 'Rulers of the Heavens',
  'vending-series-3-green': 'Vending Series 3 (Green)',
  'vending-series-2-red': 'Vending Series 2 (Red)',
  'vending-series-1-blue': 'Vending Series 1 (Blue)',
  'y33-vstar-half-deck': 'Vstar Half Deck',
  'xy1b': 'Collection Y',
  'xy1a': 'Collection X',
  'xy-beginning-set': 'XY Beginning Set',
  'xy-promos': 'XY Promos',
  'xya-m-charizard-mega-battle-deck': 'M Charizard EX Mega Battle Deck',
  'xy2': 'Wild Blaze',
  'x30-xerneas-half-deck': 'Xerneas Half Deck',
  'y30-yveltal-half-deck': 'Yveltal Half Deck',
  'cp1': 'Magma Gang vs Aqua Gang: Double Crisis',
  'xy5a': 'Gaia Volcano',
  'xy5b': 'Tidal Storm',
  'xyb-hyper-metal-chain-deck': 'Hyper Metal Chain Deck',
  'xy4': 'Phantom Gate',
  'xy3': 'Rising Fist',
  'xy8a': 'Blue Impact',
  'xy8b': 'Red Flash',
  'cp2': 'Legendary Holo Collection',
  'xy7': 'Bandit Ring',
  'xy6-mega-rayquaza-ex-battle-deck': 'Mega Rayquaza EX Battle Deck',
  'xy6': 'Emerald Break',
  '20th-starter-pack': 'Pokemon Card Game Starter Pack',
  'cp3': 'Pokekyun Collection',
  'xy9': 'Rage of the Broken Sky',
  'xyf-golduck-break-palkia-ex-combo-deck': 'Golduck BREAK & Palkia EX Combo Deck',
  'snp-noivern-break-evolution-pack': 'Noivern BREAK Evolution Pack',
  'snp-raichu-break-evolution-pack': 'Raichu BREAK Evolution Pack',
  'xy11a': 'Explosive Warrior',
  'xy11b': 'Ruthless Rebel',
  'cp4': 'Premium Champion Pack: EX x M x BREAK',
  'xyh-mega-audino-ex-mega-battle-deck': 'Mega Audino EX Mega Battle Deck',
  'xy10': 'Awakening of Psychic Kings',
  'xyg-zygarde-ex-perfect-battle-deck': 'Zygarde EX Perfect Battle Deck',
  'smb-premium-trainer-box': 'Premium Trainer Box',
  'xy-best-of-xy': 'The Best of XY',
  'cp6': '20th Anniversary Collection',
  'cp5': 'Mythical / Legendary Dream Holo Collection',
  'dp-promos': 'DP Promos',
  'ppp-promos': 'PPP Promos',
  'pt4': 'Advent of Arceus',
  'pts-shaymin-lvx-collection-pack': 'Shaymin LV.X Collection Pack',
  'pt3': 'Beat of the Frontier',
  'pt2': 'Bonds to the End of Time',
  'pt1': 'Galactic\'s Conquest',
  'pt-promos': 'DPt Promos',
  'l3': 'Clash at the Summit',
  'l2': 'Reviving Legends',
  'l1a': 'HeartGold Collection',
  'l1b': 'SoulSilver Collection',
  'll': 'Lost Link',
  'kld-keldeo-battle-strength-deck': 'Keldeo Battle Strength Deck',
  'gbr-garchomp-half-deck': 'Garchomp Half Deck',
  'szd-hydreigon-half-deck': 'Hydreigon Half Deck',
  'ds-dragon-selection': 'Dragon Selection',
  'bw-promos': 'Black & White Promos',
  'mg-genesect': 'Mewtwo Vs Genesect: Genesect',
  'mg-mewtwo': 'Mewtwo Vs Genesect: Mewtwo',
  'kk-blastoise-kyurem-combo-deck': 'Blastoise & Kyurem Combo Deck',
  'sc-shiny-collection': 'Shiny Collection',
  'wak-exciting-battle-for-everyone': 'Exciting Battle for Everyone',
  'pbg-team-plasma-battle-gift-set': 'Team Plasma Battle Gift Set',
  'bw2-red-collection': 'Red Collection',
  'bw1-white-collection': 'White Collection',
  'bw1-black-collection': 'Black Collection',
  'bw6-cold-flare': 'Cold Flare',
  'bw5-dragon-blade': 'Dragon Blade',
  'bw5-dragon-blast': 'Dragon Blast',
  'bw4-dark-rush': 'Dark Rush',
  'bw3-hail-blizzard': 'Hail Blizzard',
  'bw3-psycho-drive': 'Psycho Drive',
  'ebb-ex-battle-boost': 'EX Battle Boost',
  'bw9-megalo-cannon': 'Megalo Cannon',
  'bw8-thunder-knuckle': 'Thunder Knuckle',
  'bw8-spiral-force': 'Spiral Force',
  'bw7-plasma-gale': 'Plasma Gale',
  'bw6-freeze-bolt': 'Freeze Bolt',
  'sm-promos': 'Sun & Moon Promos',
  's8a-promo-pack': '25th Anniversary Promo Pack',
  'svp': 'Scarlet & Violet Promos',
  'm6a': '30th Celebration',
  'swsh-promos': 'Sword & Shield Promos',
  'sp4-eevee-heroes-vmax-special-set': 'Eevee Heroes VMAX Special Set',
  'sp3-silver-lance-jet-black-spirit-promos': 'Silver Lance & Jet-Black Spirit Promos',
  'sp2-vmax-special-set': 'VMAX Special Set',
  'smd-ash-vs-team-rocket-battle-set': 'Ash vs Team Rocket Battle Set',
  'sm0': 'Pikachu & New Friends',
  'smc-tapu-bulu-gx-enhanced-starter': 'Tapu Bulu GX Enhanced Starter',
  'smp1-rockruff-full-power-deck': 'Rockruff Full Power Deck',
  'sma-starter-set-decks': 'Starter Set Decks',
  sm1s: 'Collection Sun',
  sm1m: 'Collection Moon',
  sm1p: 'Sun & Moon',
  sm2k: 'Islands Await You',
  sm2l: 'Alolan Moonlight',
  sm2p: 'Facing a New Trial',
  sm3h: 'To Have Seen the Battle Rainbow',
  sm3n: 'Darkness that Consumes Light',
  sm3p: 'Shining Legends',
  sm4s: 'Awakened Heroes',
  sm4a: 'Ultradimensional Beasts',
  sm4p: 'GX Battle Boost',
  sm5s: 'Ultra Sun',
  sm5m: 'Ultra Moon',
  sm5p: 'Ultra Force',
  sm6: 'Forbidden Light',
  sm6a: 'Dragon Storm',
  sm6b: 'Champion Road',
  sm7: 'Charisma of the Wrecked Sky',
  sm7a: 'Thunderclap Spark',
  sm7b: 'Fairy Rise',
  sm8: 'Super-Burst Impact',
  sm8a: 'Dark Order',
  sm8b: 'GX Ultra Shiny',
  sm9: 'Tag Bolt',
  sm9a: 'Night Unison',
  sm9b: 'Full Metal Wall',
  sm10: 'Double Blaze',
  sm10a: 'GG End',
  sn10a: 'GG End',
  sm10b: 'Sky Legend',
  smp2: 'Detective Pikachu',
  sm11: 'Miracle Twin',
  sn11: 'Miracle Twin',
  sm11a: 'Remix Bout',
  sm11b: 'Dream League',
  sm12: 'Alter Genesis',
  sm12a: 'Tag Team GX All Stars',
  s1h: 'Shield',
  s1w: 'Sword',
  s1a: 'VMAX Rising',
  s2: 'Rebellion Crash',
  s2a: 'Explosive Walker',
  s3: 'Infinity Zone',
  s3a: 'Legendary Heartbeat',
  s4: 'Astonishing Volt Tackle',
  s4a: 'Shiny Star V',
  s5i: 'Single Strike Master',
  s5r: 'Rapid Strike Master',
  s5a: 'Matchless Fighters',
  s6h: 'Silver Lance',
  s6k: 'Jet-Black Spirit',
  s6a: 'Eevee Heroes',
  s7d: 'Skyscraping Perfection',
  s7r: 'Blue Sky Stream',
  s8: 'Fusion Arts',
  s8a: '25th Anniversary Collection',
  s8b: 'VMAX Climax',
  s9: 'Star Birth',
  s9a: 'Battle Region',
  s10d: 'Time Gazer',
  s10p: 'Space Juggler',
  s10a: 'Dark Phantasma',
  s10b: 'Pokemon GO',
  s11: 'Lost Abyss',
  s11a: 'Incandescent Arcana',
  s12: 'Paradigm Trigger',
  s12a: 'VSTAR Universe',
  sv1s: 'Scarlet ex',
  sv1v: 'Violet ex',
  sv1a: 'Triplet Beat',
  sv2p: 'Snow Hazard',
  sv2d: 'Clay Burst',
  sv2a: 'Pokemon Card 151',
  sv3: 'Ruler of the Black Flame',
  sv3a: 'Raging Surf',
  sv4k: 'Ancient Roar',
  sv4m: 'Future Flash',
  sv4a: 'Shiny Treasure ex',
  sv5k: 'Wild Force',
  sv5m: 'Cyber Judge',
  sv5a: 'Crimson Haze',
  sv6: 'Mask of Change',
  sv6a: 'Night Wanderer',
  sv7: 'Stellar Miracle',
  sv7a: 'Paradise Dragona',
  sv8: 'Super Electric Breaker',
  sv8a: 'Terastal Festival ex',
  sv9: 'Battle Partners',
  sv9a: 'Heat Wave Arena',
  sv10: 'Glory of Team Rocket',
  sv11b: 'Black Bolt',
  sv11w: 'White Flare',
  svk: 'Stellar Miracle Deck Build Box',
  svln: 'Stellar Sylveon ex Starter Set',
  svls: 'Stellar Ceruledge ex Starter Set',
  m1l: 'Mega Brave',
  m1s: 'Mega Symphonia',
  m2: 'Inferno X',
  m2a: 'Mega Dream ex',
  m3: 'Munikisu Zero',
  m4: 'Ninja Spinner',
  m5: 'Abyss Eye',
  me2: 'Phantasmal Flames',
  me3: 'Perfect Order',
  me5: 'Pitch Black',
  me05: 'Pitch Black',
  b1a: 'Crimson Blaze',
  mc: 'Starter Deck 100 Battle Collection',
  'm-p': 'Mega Promo Cards',
};

function clean(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function containsNonEnglishScript(value) {
  return /[\u0400-\u052f\u0590-\u08ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3100-\u312f\u3400-\u9fff\uac00-\ud7af]/.test(value ?? '');
}

function cleanEnglishDisplayCandidate(value) {
  const candidate = clean(value);
  return candidate && !containsNonEnglishScript(candidate) ? candidate : null;
}

function isKnownForeignLanguage(value) {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!language || ['all', 'und', 'unknown'].includes(language)) return false;
  return language !== 'en' && language !== 'english' && !language.startsWith('en-');
}

function isJapaneseSet(input = {}) {
  const language = String(input.language ?? input.raw?.language ?? input.raw?.set?.language ?? '').trim().toLowerCase();
  const region = String(input.region ?? input.raw?.region ?? input.raw?.set?.region ?? '').trim().toLowerCase();
  return language === 'ja'
    || language === 'jp'
    || region === 'japan'
    || region === 'jp'
    || String(input.id ?? input.sourceId ?? input.setCode ?? '').toLowerCase().startsWith('ja:');
}

function isNonEnglishSet(input = {}) {
  const language = String(input.language ?? input.raw?.language ?? input.raw?.set?.language ?? '').trim().toLowerCase().replace(/_/g, '-');
  const region = String(input.region ?? input.raw?.region ?? input.raw?.set?.region ?? '').trim().toLowerCase();
  const id = String(input.id ?? input.sourceId ?? input.setCode ?? '').toLowerCase();
  return isJapaneseSet(input)
    || isKnownForeignLanguage(language)
    || region === 'tw'
    || region === 'taiwan'
    || id.startsWith('zh-tw:')
    || id.startsWith('zh:');
}

function normalizeSetKey(value) {
  const text = clean(value);
  if (!text) return null;
  return text.replace(/^(ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '').replace(/\+/g, 'p').toLowerCase().replace(/[^a-z0-9.]+/g, '');
}


const JAPANESE_SET_ENGLISH_NAME_LOOKUP = Object.entries(JAPANESE_SET_ENGLISH_NAMES_BY_ID).reduce((map, [key, name]) => {
  const normalizedKey = normalizeSetKey(key);
  if (normalizedKey) map[normalizedKey] = name;
  return map;
}, {});

function getSetKeyCandidates(input = {}) {
  return [
    input.id,
    input.sourceId,
    input.setCode,
    input.raw?.source_id,
    input.raw?.provider_id,
    input.raw?.providerSetId,
    input.raw?.set_code,
    input.raw?.id,
    input.raw?.set?.id,
    input.raw?.set?.tcgdex_id,
  ].map(normalizeSetKey).filter(Boolean);
}

function normalizeNativeName(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, '').trim();
}

function getExactCjkLanguage(input = {}) {
  const values = [input.language, input.raw?.language, input.raw?.set?.language]
    .map(clean).filter(Boolean).map((value) => value.toLowerCase().replace(/_/g, '-'));
  if (!values.length) return null;
  const normalized = values.map((value) => value === 'jp' ? 'ja' : value);
  return normalized.every((value) => value === 'ja') ? 'ja'
    : normalized.every((value) => value === 'zh-cn') ? 'zh-cn'
      : normalized.every((value) => value === 'zh-tw') ? 'zh-tw' : null;
}

function getExactSetCode(input = {}) {
  const values = [input.setCode, input.raw?.set_code, input.raw?.setCode, input.raw?.set?.set_code, input.raw?.set?.setCode]
    .map(normalizeSetKey).filter(Boolean);
  return [...new Set(values)].length === 1 ? values[0] : null;
}

function isCjkEditorialSetTranslationsEnabled() {
  return JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA.rightsGate.activationAuthorized === true
    && JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA.rightsGate.publicRuntimeImportAuthorized === true
    && JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA.rightsGate.canonicalDatabaseWriteAuthorized === false
    && CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.activationAuthorized === true
    && CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.publicRuntimeImportAuthorized === true
    && CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA.rightsGate.canonicalDatabaseWriteAuthorized === false
    && process.env.STACKR_DISABLE_CJK_EDITORIAL_SET_TRANSLATIONS !== 'true';
}

export function getLocalSetName(input = {}) {
  return clean(input.localName)
    ?? clean(input.raw?.local_name)
    ?? clean(input.raw?.localName)
    ?? clean(input.raw?.set?.local_name)
    ?? clean(input.raw?.set?.localName)
    ?? clean(input.raw?.set?.name)
    ?? (isNonEnglishSet(input) ? clean(input.raw?.name ?? input.fallbackName) : null);
}

export function getEnglishSetDisplayName(input = {}) {
  const explicitlyEnglish = [
    input.englishDisplayName,
    input.raw?.english_display_name,
    input.raw?.englishDisplayName,
    input.raw?.set?.english_display_name,
    input.raw?.set?.englishDisplayName,
    input.raw?.name_en,
    input.raw?.nameEn,
    input.raw?.translations?.en?.name,
    input.raw?.translations?.['en-GB']?.name,
    input.raw?.translations?.['en-US']?.name,
  ];
  const genericDisplay = isNonEnglishSet(input)
    ? []
    : [input.raw?.display_name, input.raw?.displayName, input.raw?.set?.display_name];
  const explicit = [...explicitlyEnglish, ...genericDisplay]
    .map(cleanEnglishDisplayCandidate)
    .find(Boolean) ?? null;
  if (explicit) return explicit;
  if (!isJapaneseSet(input)) {
    const localName = getLocalSetName(input) ?? clean(input.canonicalName) ?? clean(input.fallbackName);
    return !isNonEnglishSet(input) && localName && !containsNonEnglishScript(localName) ? localName : null;
  }

  for (const key of getSetKeyCandidates(input)) {
    const mapped = JAPANESE_SET_ENGLISH_NAME_LOOKUP[key];
    if (mapped) return mapped;
  }

  return null;
}

function hasExactProviderJapaneseLanguage(input = {}) {
  const languages = [input.language, input.raw?.language, input.raw?.set?.language]
    .map(clean)
    .filter(Boolean);
  return languages.length > 0 && languages.every((value) => value.toLowerCase().replace(/_/g, '-') === 'ja');
}

export function getEnglishSetDisplaySupplement(input = {}) {
  const authoritative = getEnglishSetDisplayName(input);
  if (authoritative) return { value: authoritative, label: 'English set:', status: 'authoritative_english_display_name', provenance: 'canonical_or_provider_english_display_name', authoritative: true };
  if (TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA.rightsGate.activationAuthorized === true
    && TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA.rightsGate.publicRuntimeImportAuthorized === true
    && TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA.rightsGate.canonicalDatabaseWriteAuthorized === false
    && STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA.policy.canonicalDatabaseWriteAuthorized === false
    && process.env.EXPO_PUBLIC_DISABLE_TCGDEX_METADATA !== 'true'
    && process.env.STACKR_DISABLE_TCGDEX_METADATA !== 'true'
    && hasExactProviderJapaneseLanguage(input)) {
    const code = getExactSetCode(input);
    const nativeName = getLocalSetName(input);
    const identities = code ? STACKR_JAPANESE_SET_IDENTITIES_BY_CODE[code] ?? [] : [];
    if (code && nativeName && identities.length === 1 && identities[0]?.normalizedNativeName === normalizeNativeName(nativeName)) {
      const value = cleanEnglishDisplayCandidate(TCGDEX_JAPANESE_SET_ENGLISH_NAMES[code]);
      if (value) return { value, label: 'English set:', status: 'provider_metadata_english_supplement', provenance: 'tcgdex_mit_pinned_japanese_set_code_map+stackr_catalog_sets_identity_snapshot', authoritative: false };
    }
  }
  if (!isCjkEditorialSetTranslationsEnabled()) return null;
  const language = getExactCjkLanguage(input);
  const code = getExactSetCode(input);
  const nativeName = getLocalSetName(input);
  if (!language || !code || !nativeName) return null;
  const record = language === 'ja' ? JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE[code] : CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE[language]?.[code];
  return record && normalizeNativeName(nativeName) === record.normalizedNativeName
    ? { value: record.englishTranslation, label: 'English translation:', status: 'model_translation_draft', provenance: 'stackr_owner_approved_editorial_set_translation_runtime_map', authoritative: false }
    : null;
}

export function getChineseSetEnglishTranslationDraft(input = {}) {
  const supplement = getEnglishSetDisplaySupplement(input);
  const language = getExactCjkLanguage(input);
  return (language === 'zh-cn' || language === 'zh-tw') && supplement?.status === 'model_translation_draft'
    ? supplement
    : null;
}

export function getJapaneseSetEnglishTranslationDraft(input = {}) {
  const supplement = getEnglishSetDisplaySupplement(input);
  return getExactCjkLanguage(input) === 'ja' && supplement?.status === 'model_translation_draft' ? supplement : null;
}

/** Reviewed names are display aliases; they do not establish printing equivalence. */
export function getEnglishCardDisplaySupplement(input = {}) {
  const explicitLanguage = input.language ?? input.raw?.language;
  const region = input.region ?? input.raw?.region;
  const id = String(input.id ?? input.sourceId ?? '').trim();
  const language = explicitLanguage ?? region ?? id.split(':')[0];
  const nativeName = [
    input.localName, input.raw?.local_name, input.raw?.localName,
    input.raw?.native_name, input.raw?.nativeName, input.raw?.name,
    input.canonicalName, input.fallbackName,
  ].map(normalizeCardTranslationName).find(Boolean) ?? null;
  return resolveCardEnglishSupplement({
    language, nativeName,
    cardIds: [input.id, input.sourceId, input.raw?.canonicalId, input.raw?.canonical_id,
      input.raw?.cardId, input.raw?.card_id, input.raw?.printingId, input.raw?.printing_id,
      input.raw?.stackr?.cardId, input.raw?.stackr?.canonicalId],
    englishNames: [input.englishDisplayName, input.raw?.english_display_name, input.raw?.englishDisplayName,
      input.raw?.name_en, input.raw?.nameEn, input.raw?.translations?.en?.name,
      input.raw?.translations?.['en-GB']?.name, input.raw?.translations?.['en-US']?.name],
    englishNameProvenance: input.englishDisplayProvenance
      ?? input.raw?.english_display_provenance ?? input.raw?.englishDisplayProvenance,
  });
}

export function getEnglishCardDisplayName(input = {}) {
  return getEnglishCardDisplaySupplement(input)?.value ?? null;
}

export function getPreferredSetDisplayName(input = {}) {
  const localName = getLocalSetName(input);
  if (localName) return localName;
  if (isNonEnglishSet(input)) return clean(input.id) ?? clean(input.sourceId) ?? clean(input.setCode) ?? 'Unknown set';
  return getEnglishSetDisplayName(input)
    ?? clean(input.canonicalName)
    ?? clean(input.fallbackName)
    ?? clean(input.raw?.name)
    ?? clean(input.id)
    ?? 'Unknown set';
}
