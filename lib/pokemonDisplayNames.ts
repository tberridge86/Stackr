type CardDisplayNameInput = {
  language?: string | null;
  region?: string | null;
  id?: string | null;
  sourceId?: string | null;
  setId?: string | null;
  collectorNumber?: string | number | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  canonicalName?: string | null;
  fallbackName?: string | null;
  raw?: any;
};

type SetDisplayNameInput = {
  language?: string | null;
  region?: string | null;
  id?: string | null;
  sourceId?: string | null;
  setCode?: string | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  canonicalName?: string | null;
  fallbackName?: string | null;
  raw?: any;
};

const KANTO_SPECIES_BY_DEX_ID: Record<number, string> = {
  1: 'Bulbasaur',
  2: 'Ivysaur',
  3: 'Venusaur',
  4: 'Charmander',
  5: 'Charmeleon',
  6: 'Charizard',
  7: 'Squirtle',
  8: 'Wartortle',
  9: 'Blastoise',
  10: 'Caterpie',
  11: 'Metapod',
  12: 'Butterfree',
  13: 'Weedle',
  14: 'Kakuna',
  15: 'Beedrill',
  16: 'Pidgey',
  17: 'Pidgeotto',
  18: 'Pidgeot',
  19: 'Rattata',
  20: 'Raticate',
  21: 'Spearow',
  22: 'Fearow',
  23: 'Ekans',
  24: 'Arbok',
  25: 'Pikachu',
  26: 'Raichu',
  27: 'Sandshrew',
  28: 'Sandslash',
  29: 'Nidoran Female',
  30: 'Nidorina',
  31: 'Nidoqueen',
  32: 'Nidoran Male',
  33: 'Nidorino',
  34: 'Nidoking',
  35: 'Clefairy',
  36: 'Clefable',
  37: 'Vulpix',
  38: 'Ninetales',
  39: 'Jigglypuff',
  40: 'Wigglytuff',
  41: 'Zubat',
  42: 'Golbat',
  43: 'Oddish',
  44: 'Gloom',
  45: 'Vileplume',
  46: 'Paras',
  47: 'Parasect',
  48: 'Venonat',
  49: 'Venomoth',
  50: 'Diglett',
  51: 'Dugtrio',
  52: 'Meowth',
  53: 'Persian',
  54: 'Psyduck',
  55: 'Golduck',
  56: 'Mankey',
  57: 'Primeape',
  58: 'Growlithe',
  59: 'Arcanine',
  60: 'Poliwag',
  61: 'Poliwhirl',
  62: 'Poliwrath',
  63: 'Abra',
  64: 'Kadabra',
  65: 'Alakazam',
  66: 'Machop',
  67: 'Machoke',
  68: 'Machamp',
  69: 'Bellsprout',
  70: 'Weepinbell',
  71: 'Victreebel',
  72: 'Tentacool',
  73: 'Tentacruel',
  74: 'Geodude',
  75: 'Graveler',
  76: 'Golem',
  77: 'Ponyta',
  78: 'Rapidash',
  79: 'Slowpoke',
  80: 'Slowbro',
  81: 'Magnemite',
  82: 'Magneton',
  83: "Farfetch'd",
  84: 'Doduo',
  85: 'Dodrio',
  86: 'Seel',
  87: 'Dewgong',
  88: 'Grimer',
  89: 'Muk',
  90: 'Shellder',
  91: 'Cloyster',
  92: 'Gastly',
  93: 'Haunter',
  94: 'Gengar',
  95: 'Onix',
  96: 'Drowzee',
  97: 'Hypno',
  98: 'Krabby',
  99: 'Kingler',
  100: 'Voltorb',
  101: 'Electrode',
  102: 'Exeggcute',
  103: 'Exeggutor',
  104: 'Cubone',
  105: 'Marowak',
  106: 'Hitmonlee',
  107: 'Hitmonchan',
  108: 'Lickitung',
  109: 'Koffing',
  110: 'Weezing',
  111: 'Rhyhorn',
  112: 'Rhydon',
  113: 'Chansey',
  114: 'Tangela',
  115: 'Kangaskhan',
  116: 'Horsea',
  117: 'Seadra',
  118: 'Goldeen',
  119: 'Seaking',
  120: 'Staryu',
  121: 'Starmie',
  122: 'Mr. Mime',
  123: 'Scyther',
  124: 'Jynx',
  125: 'Electabuzz',
  126: 'Magmar',
  127: 'Pinsir',
  128: 'Tauros',
  129: 'Magikarp',
  130: 'Gyarados',
  131: 'Lapras',
  132: 'Ditto',
  133: 'Eevee',
  134: 'Vaporeon',
  135: 'Jolteon',
  136: 'Flareon',
  137: 'Porygon',
  138: 'Omanyte',
  139: 'Omastar',
  140: 'Kabuto',
  141: 'Kabutops',
  142: 'Aerodactyl',
  143: 'Snorlax',
  144: 'Articuno',
  145: 'Zapdos',
  146: 'Moltres',
  147: 'Dratini',
  148: 'Dragonair',
  149: 'Dragonite',
  150: 'Mewtwo',
  151: 'Mew',
};

const JAPANESE_151_TRAINER_NAMES: Record<string, string> = {
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

const JAPANESE_POKEMON_ENGLISH_NAMES: Record<string, string> = {
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

const JAPANESE_SET_ENGLISH_NAMES_BY_ID: Record<string, string> = {
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

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function containsJapaneseScript(value: string | null) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value ?? '');
}

function isJapaneseCard(input: CardDisplayNameInput) {
  const language = String(input.language ?? input.raw?.language ?? '').trim().toLowerCase();
  const region = String(input.region ?? input.raw?.region ?? '').trim().toLowerCase();
  return language === 'ja'
    || language === 'jp'
    || region === 'japan'
    || region === 'jp'
    || String(input.id ?? input.sourceId ?? '').toLowerCase().startsWith('ja:');
}

function isNonEnglishCard(input: CardDisplayNameInput) {
  const language = String(input.language ?? input.raw?.language ?? '').trim().toLowerCase().replace(/_/g, '-');
  const region = String(input.region ?? input.raw?.region ?? '').trim().toLowerCase();
  const id = String(input.id ?? input.sourceId ?? '').toLowerCase();
  return isJapaneseCard(input)
    || language === 'zh-tw'
    || language === 'zh'
    || language === 'zhtw'
    || language === 'chinese'
    || language === 'traditional-chinese'
    || region === 'tw'
    || region === 'taiwan'
    || id.startsWith('zh-tw:')
    || id.startsWith('zh:');
}

function isJapaneseSet(input: SetDisplayNameInput) {
  const language = String(input.language ?? input.raw?.language ?? input.raw?.set?.language ?? '').trim().toLowerCase();
  const region = String(input.region ?? input.raw?.region ?? input.raw?.set?.region ?? '').trim().toLowerCase();
  return language === 'ja'
    || language === 'jp'
    || region === 'japan'
    || region === 'jp'
    || String(input.id ?? input.sourceId ?? input.setCode ?? '').toLowerCase().startsWith('ja:');
}

function isNonEnglishSet(input: SetDisplayNameInput) {
  const language = String(input.language ?? input.raw?.language ?? input.raw?.set?.language ?? '').trim().toLowerCase().replace(/_/g, '-');
  const region = String(input.region ?? input.raw?.region ?? input.raw?.set?.region ?? '').trim().toLowerCase();
  const id = String(input.id ?? input.sourceId ?? input.setCode ?? '').toLowerCase();
  return isJapaneseSet(input)
    || language === 'zh-tw'
    || language === 'zh'
    || language === 'zhtw'
    || language === 'chinese'
    || language === 'traditional-chinese'
    || region === 'tw'
    || region === 'taiwan'
    || id.startsWith('zh-tw:')
    || id.startsWith('zh:');
}

function normalizeSetKey(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  return text
    .replace(/^(ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '')
    .replace(/\+/g, 'p')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}


const JAPANESE_SET_ENGLISH_NAME_LOOKUP = Object.entries(JAPANESE_SET_ENGLISH_NAMES_BY_ID).reduce<Record<string, string>>((map, [key, name]) => {
  const normalizedKey = normalizeSetKey(key);
  if (normalizedKey) map[normalizedKey] = name;
  return map;
}, {});

function getSetKeyCandidates(input: SetDisplayNameInput) {
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
  ].map(normalizeSetKey).filter(Boolean) as string[];
}

export function getLocalSetName(input: SetDisplayNameInput) {
  return clean(input.localName)
    ?? clean(input.raw?.local_name)
    ?? clean(input.raw?.localName)
    ?? clean(input.raw?.set?.local_name)
    ?? clean(input.raw?.set?.localName)
    ?? clean(input.raw?.set?.name)
    ?? (isNonEnglishSet(input) ? clean(input.raw?.name ?? input.fallbackName) : null);
}

export function getEnglishSetDisplayName(input: SetDisplayNameInput) {
  const explicit = clean(input.englishDisplayName)
    ?? clean(input.raw?.english_display_name)
    ?? clean(input.raw?.englishDisplayName)
    ?? clean(input.raw?.display_name)
    ?? clean(input.raw?.displayName)
    ?? clean(input.raw?.set?.english_display_name)
    ?? clean(input.raw?.set?.englishDisplayName)
    ?? clean(input.raw?.set?.display_name)
    ?? clean(input.raw?.name_en)
    ?? clean(input.raw?.nameEn);
  if (explicit) return explicit;

  if (!isJapaneseSet(input)) {
    const localName = getLocalSetName(input) ?? clean(input.canonicalName) ?? clean(input.fallbackName);
    return localName && !containsJapaneseScript(localName) ? localName : null;
  }

  for (const key of getSetKeyCandidates(input)) {
    const mapped = JAPANESE_SET_ENGLISH_NAME_LOOKUP[key];
    if (mapped) return mapped;
  }

  const localName = getLocalSetName(input) ?? clean(input.canonicalName) ?? clean(input.fallbackName);
  return localName && !containsJapaneseScript(localName) ? localName : null;
}

function readDexIds(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function getFirstDexId(input: CardDisplayNameInput) {
  const japanese151DexId = getJapanese151DexId(input);
  if (japanese151DexId != null) return japanese151DexId;
  return [
    ...readDexIds(input.raw?.dexId),
    ...readDexIds(input.raw?.dexIds),
    ...readDexIds(input.raw?.nationalPokedexNumbers),
    ...readDexIds(input.raw?.nationalPokedexNumber),
  ][0] ?? null;
}

function getJapanese151DexId(input: CardDisplayNameInput) {
  const setKeys = [
    input.setId,
    input.raw?.set_id,
    input.raw?.setId,
    input.raw?.set?.id,
    input.raw?.set?.tcgdex_id,
  ].map(normalizeSetKey);
  if (!setKeys.includes('sv2a')) return null;

  const number = Number(String(input.collectorNumber ?? input.raw?.localId ?? input.raw?.number ?? '').replace(/^0+(?=\d)/, ''));
  return Number.isInteger(number) && number >= 1 && number <= 151 ? number : null;
}

function getJapaneseCardSuffix(localName: string | null) {
  const value = clean(localName);
  if (!value) return '';
  if (/(vstar)$/i.test(value)) return ' VSTAR';
  if (/(vmax)$/i.test(value)) return ' VMAX';
  if (/(ex)$/i.test(value)) return ' ex';
  if (/(gx)$/i.test(value)) return ' GX';
  if (/(break)$/i.test(value)) return ' BREAK';
  if (/(^|[^a-z])v$/i.test(value)) return ' V';
  return '';
}

function getJapanesePokemonEnglishName(localName: string | null) {
  const value = clean(localName)?.replace(/\s+/g, '');
  if (!value) return null;

  for (const [localNamePrefix, englishName] of Object.entries(JAPANESE_POKEMON_ENGLISH_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    if (value === localNamePrefix || value.startsWith(localNamePrefix)) {
      return `${englishName}${getJapaneseCardSuffix(value.slice(localNamePrefix.length) || value)}`;
    }
  }

  return null;
}

export function getLocalCardName(input: CardDisplayNameInput) {
  return clean(input.localName)
    ?? clean(input.raw?.local_name)
    ?? (isNonEnglishCard(input) ? clean(input.raw?.name ?? input.fallbackName) : null);
}

export function getEnglishCardDisplayName(input: CardDisplayNameInput) {
  const explicit = clean(input.englishDisplayName)
    ?? clean(input.raw?.english_display_name)
    ?? clean(input.raw?.englishDisplayName)
    ?? clean(input.raw?.name_en)
    ?? clean(input.raw?.nameEn);
  if (explicit) return explicit;

  if (!isJapaneseCard(input)) {
    const localName = getLocalCardName(input) ?? clean(input.canonicalName) ?? clean(input.fallbackName);
    return localName && !containsJapaneseScript(localName) ? localName : null;
  }

  const localName = getLocalCardName(input) ?? clean(input.canonicalName) ?? clean(input.fallbackName);
  if (localName && JAPANESE_151_TRAINER_NAMES[localName]) {
    return JAPANESE_151_TRAINER_NAMES[localName];
  }

  const mappedPokemonName = getJapanesePokemonEnglishName(localName);
  if (mappedPokemonName) return mappedPokemonName;

  const dexId = getFirstDexId(input);
  const speciesName = dexId == null ? null : KANTO_SPECIES_BY_DEX_ID[dexId];
  if (!speciesName) return null;

  return `${speciesName}${getJapaneseCardSuffix(localName)}`;
}

export function getPreferredCardDisplayName(input: CardDisplayNameInput) {
  return getEnglishCardDisplayName(input)
    ?? getLocalCardName(input)
    ?? clean(input.canonicalName)
    ?? clean(input.fallbackName)
    ?? clean(input.raw?.name)
    ?? clean(input.id)
    ?? 'Unknown card';
}

export function getPreferredSetDisplayName(input: SetDisplayNameInput) {
  return getEnglishSetDisplayName(input)
    ?? getLocalSetName(input)
    ?? clean(input.canonicalName)
    ?? clean(input.fallbackName)
    ?? clean(input.raw?.name)
    ?? clean(input.id)
    ?? 'Unknown set';
}
