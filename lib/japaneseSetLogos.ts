import type { ImageSourcePropType } from 'react-native';

export type JapaneseSetLogoMatch = {
  key: string;
  normalizedKey: string;
  name: string;
  code: string;
  source: ImageSourcePropType;
};

export type JapaneseSetLogoLookupInput = {
  id?: string | null;
  setId?: string | null;
  sourceId?: string | number | null;
  setCode?: string | number | null;
  name?: string | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  language?: string | null;
  externalIds?: Record<string, any> | null;
};

const JAPANESE_SET_LOGOS_BY_KEY: Record<string, JapaneseSetLogoMatch> = {
  "pmcg6": {
    key: "pmcg6",
    normalizedKey: "pmcg6",
    name: "Challenge from the Darkness",
    code: "PMCG6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg6.png') as ImageSourcePropType,
  },
  "pmcg5": {
    key: "pmcg5",
    normalizedKey: "pmcg5",
    name: "Leader's Stadium",
    code: "PMCG5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg5.png') as ImageSourcePropType,
  },
  "pmcg4": {
    key: "pmcg4",
    normalizedKey: "pmcg4",
    name: "Team Rocket",
    code: "PMCG4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg4.png') as ImageSourcePropType,
  },
  "pmcg3": {
    key: "pmcg3",
    normalizedKey: "pmcg3",
    name: "Mystery of the Fossils",
    code: "PMCG3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg3.png') as ImageSourcePropType,
  },
  "pmcg2": {
    key: "pmcg2",
    normalizedKey: "pmcg2",
    name: "Pokemon Jungle",
    code: "PMCG2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg2.png') as ImageSourcePropType,
  },
  "pmcg1": {
    key: "pmcg1",
    normalizedKey: "pmcg1",
    name: "Base Set",
    code: "PMCG1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pmcg1.png') as ImageSourcePropType,
  },
  "vendingseries3green": {
    key: "vending-series-3-green",
    normalizedKey: "vendingseries3green",
    name: "Vending Series 3 (Green)",
    code: "Vending 3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/vending-series-3-green.png') as ImageSourcePropType,
  },
  "vendingseries2red": {
    key: "vending-series-2-red",
    normalizedKey: "vendingseries2red",
    name: "Vending Series 2 (Red)",
    code: "Vending 2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/vending-series-2-red.png') as ImageSourcePropType,
  },
  "vendingseries1blue": {
    key: "vending-series-1-blue",
    normalizedKey: "vendingseries1blue",
    name: "Vending Series 1 (Blue)",
    code: "Vending 1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/vending-series-1-blue.png') as ImageSourcePropType,
  },
  "e2": {
    key: "e2",
    normalizedKey: "e2",
    name: "The Town on No Map",
    code: "e2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/e2.png') as ImageSourcePropType,
  },
  "vs1": {
    key: "vs1",
    normalizedKey: "vs1",
    name: "Pokemon VS",
    code: "VS",
    source: require('../assets/rev2/11-japanese-set-logo/logos/vs1.png') as ImageSourcePropType,
  },
  "y33vstarhalfdeck": {
    key: "y33-vstar-half-deck",
    normalizedKey: "y33vstarhalfdeck",
    name: "Vstar Half Deck",
    code: "Y33",
    source: require('../assets/rev2/11-japanese-set-logo/logos/y33-vstar-half-deck.png') as ImageSourcePropType,
  },
  "xy1b": {
    key: "xy1b",
    normalizedKey: "xy1b",
    name: "Collection Y",
    code: "XY1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy1b.png') as ImageSourcePropType,
  },
  "xy1a": {
    key: "xy1a",
    normalizedKey: "xy1a",
    name: "Collection X",
    code: "XY1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy1a.png') as ImageSourcePropType,
  },
  "xybeginningset": {
    key: "xy-beginning-set",
    normalizedKey: "xybeginningset",
    name: "XY Beginning Set",
    code: "XY1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy-beginning-set.png') as ImageSourcePropType,
  },
  "xypromos": {
    key: "xy-promos",
    normalizedKey: "xypromos",
    name: "XY Promos",
    code: "Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy-promos.png') as ImageSourcePropType,
  },
  "xyamcharizardmegabattledeck": {
    key: "xya-m-charizard-mega-battle-deck",
    normalizedKey: "xyamcharizardmegabattledeck",
    name: "M Charizard EX Mega Battle Deck",
    code: "XYA",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xya-m-charizard-mega-battle-deck.png') as ImageSourcePropType,
  },
  "xy2": {
    key: "xy2",
    normalizedKey: "xy2",
    name: "Wild Blaze",
    code: "XY2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy2.png') as ImageSourcePropType,
  },
  "x30xerneashalfdeck": {
    key: "x30-xerneas-half-deck",
    normalizedKey: "x30xerneashalfdeck",
    name: "Xerneas Half Deck",
    code: "X30",
    source: require('../assets/rev2/11-japanese-set-logo/logos/x30-xerneas-half-deck.png') as ImageSourcePropType,
  },
  "y30yveltalhalfdeck": {
    key: "y30-yveltal-half-deck",
    normalizedKey: "y30yveltalhalfdeck",
    name: "Yveltal Half Deck",
    code: "Y30",
    source: require('../assets/rev2/11-japanese-set-logo/logos/y30-yveltal-half-deck.png') as ImageSourcePropType,
  },
  "cp1": {
    key: "cp1",
    normalizedKey: "cp1",
    name: "Magma Gang vs Aqua Gang: Double Crisis",
    code: "CP1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp1.png') as ImageSourcePropType,
  },
  "xy5a": {
    key: "xy5a",
    normalizedKey: "xy5a",
    name: "Gaia Volcano",
    code: "XY5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy5a.png') as ImageSourcePropType,
  },
  "xy5b": {
    key: "xy5b",
    normalizedKey: "xy5b",
    name: "Tidal Storm",
    code: "XY5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy5b.png') as ImageSourcePropType,
  },
  "xybhypermetalchaindeck": {
    key: "xyb-hyper-metal-chain-deck",
    normalizedKey: "xybhypermetalchaindeck",
    name: "Hyper Metal Chain Deck",
    code: "XYB",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xyb-hyper-metal-chain-deck.png') as ImageSourcePropType,
  },
  "xy4": {
    key: "xy4",
    normalizedKey: "xy4",
    name: "Phantom Gate",
    code: "XY4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy4.png') as ImageSourcePropType,
  },
  "xy3": {
    key: "xy3",
    normalizedKey: "xy3",
    name: "Rising Fist",
    code: "XY3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy3.png') as ImageSourcePropType,
  },
  "xy8a": {
    key: "xy8a",
    normalizedKey: "xy8a",
    name: "Blue Impact",
    code: "XY8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy8a.png') as ImageSourcePropType,
  },
  "xy8b": {
    key: "xy8b",
    normalizedKey: "xy8b",
    name: "Red Flash",
    code: "XY8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy8b.png') as ImageSourcePropType,
  },
  "cp2": {
    key: "cp2",
    normalizedKey: "cp2",
    name: "Legendary Holo Collection",
    code: "CP2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp2.png') as ImageSourcePropType,
  },
  "xy7": {
    key: "xy7",
    normalizedKey: "xy7",
    name: "Bandit Ring",
    code: "XY7",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy7.png') as ImageSourcePropType,
  },
  "xy6megarayquazaexbattledeck": {
    key: "xy6-mega-rayquaza-ex-battle-deck",
    normalizedKey: "xy6megarayquazaexbattledeck",
    name: "Mega Rayquaza EX Battle Deck",
    code: "XY6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy6-mega-rayquaza-ex-battle-deck.png') as ImageSourcePropType,
  },
  "xy6": {
    key: "xy6",
    normalizedKey: "xy6",
    name: "Emerald Break",
    code: "XY6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy6.png') as ImageSourcePropType,
  },
  "20thstarterpack": {
    key: "20th-starter-pack",
    normalizedKey: "20thstarterpack",
    name: "Pokemon Card Game Starter Pack",
    code: "20th",
    source: require('../assets/rev2/11-japanese-set-logo/logos/20th-starter-pack.png') as ImageSourcePropType,
  },
  "cp3": {
    key: "cp3",
    normalizedKey: "cp3",
    name: "Pokekyun Collection",
    code: "CP3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp3.png') as ImageSourcePropType,
  },
  "xy9": {
    key: "xy9",
    normalizedKey: "xy9",
    name: "Rage of the Broken Sky",
    code: "XY9",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy9.png') as ImageSourcePropType,
  },
  "xyfgolduckbreakpalkiaexcombodeck": {
    key: "xyf-golduck-break-palkia-ex-combo-deck",
    normalizedKey: "xyfgolduckbreakpalkiaexcombodeck",
    name: "Golduck BREAK & Palkia EX Combo Deck",
    code: "XYF",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xyf-golduck-break-palkia-ex-combo-deck.png') as ImageSourcePropType,
  },
  "snpnoivernbreakevolutionpack": {
    key: "snp-noivern-break-evolution-pack",
    normalizedKey: "snpnoivernbreakevolutionpack",
    name: "Noivern BREAK Evolution Pack",
    code: "SNP",
    source: require('../assets/rev2/11-japanese-set-logo/logos/snp-noivern-break-evolution-pack.png') as ImageSourcePropType,
  },
  "snpraichubreakevolutionpack": {
    key: "snp-raichu-break-evolution-pack",
    normalizedKey: "snpraichubreakevolutionpack",
    name: "Raichu BREAK Evolution Pack",
    code: "SNP",
    source: require('../assets/rev2/11-japanese-set-logo/logos/snp-raichu-break-evolution-pack.png') as ImageSourcePropType,
  },
  "xy11a": {
    key: "xy11a",
    normalizedKey: "xy11a",
    name: "Explosive Warrior",
    code: "XY11",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy11a.png') as ImageSourcePropType,
  },
  "xy11b": {
    key: "xy11b",
    normalizedKey: "xy11b",
    name: "Ruthless Rebel",
    code: "XY11",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy11b.png') as ImageSourcePropType,
  },
  "cp4": {
    key: "cp4",
    normalizedKey: "cp4",
    name: "Premium Champion Pack: EX x M x BREAK",
    code: "CP4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp4.png') as ImageSourcePropType,
  },
  "xyhmegaaudinoexmegabattledeck": {
    key: "xyh-mega-audino-ex-mega-battle-deck",
    normalizedKey: "xyhmegaaudinoexmegabattledeck",
    name: "Mega Audino EX Mega Battle Deck",
    code: "XYH",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xyh-mega-audino-ex-mega-battle-deck.png') as ImageSourcePropType,
  },
  "xy10": {
    key: "xy10",
    normalizedKey: "xy10",
    name: "Awakening of Psychic Kings",
    code: "XY10",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy10.png') as ImageSourcePropType,
  },
  "xygzygardeexperfectbattledeck": {
    key: "xyg-zygarde-ex-perfect-battle-deck",
    normalizedKey: "xygzygardeexperfectbattledeck",
    name: "Zygarde EX Perfect Battle Deck",
    code: "XYG",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xyg-zygarde-ex-perfect-battle-deck.png') as ImageSourcePropType,
  },
  "smbpremiumtrainerbox": {
    key: "smb-premium-trainer-box",
    normalizedKey: "smbpremiumtrainerbox",
    name: "Premium Trainer Box",
    code: "SMB",
    source: require('../assets/rev2/11-japanese-set-logo/logos/smb-premium-trainer-box.png') as ImageSourcePropType,
  },
  "xybestofxy": {
    key: "xy-best-of-xy",
    normalizedKey: "xybestofxy",
    name: "The Best of XY",
    code: "XY",
    source: require('../assets/rev2/11-japanese-set-logo/logos/xy-best-of-xy.png') as ImageSourcePropType,
  },
  "cp6": {
    key: "cp6",
    normalizedKey: "cp6",
    name: "20th Anniversary Collection",
    code: "CP6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp6.png') as ImageSourcePropType,
  },
  "cp5": {
    key: "cp5",
    normalizedKey: "cp5",
    name: "Mythical / Legendary Dream Holo Collection",
    code: "CP5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/cp5.png') as ImageSourcePropType,
  },
  "dppromos": {
    key: "dp-promos",
    normalizedKey: "dppromos",
    name: "DP Promos",
    code: "DP Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/dp-promos.png') as ImageSourcePropType,
  },
  "ppppromos": {
    key: "ppp-promos",
    normalizedKey: "ppppromos",
    name: "PPP Promos",
    code: "PPP Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/ppp-promos.png') as ImageSourcePropType,
  },
  "pt4": {
    key: "pt4",
    normalizedKey: "pt4",
    name: "Advent of Arceus",
    code: "Pt4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pt4.png') as ImageSourcePropType,
  },
  "ptsshayminlvxcollectionpack": {
    key: "pts-shaymin-lvx-collection-pack",
    normalizedKey: "ptsshayminlvxcollectionpack",
    name: "Shaymin LV.X Collection Pack",
    code: "PtS",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pts-shaymin-lvx-collection-pack.png') as ImageSourcePropType,
  },
  "pt3": {
    key: "pt3",
    normalizedKey: "pt3",
    name: "Beat of the Frontier",
    code: "Pt3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pt3.png') as ImageSourcePropType,
  },
  "pt2": {
    key: "pt2",
    normalizedKey: "pt2",
    name: "Bonds to the End of Time",
    code: "Pt2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pt2.png') as ImageSourcePropType,
  },
  "pt1": {
    key: "pt1",
    normalizedKey: "pt1",
    name: "Galactic's Conquest",
    code: "Pt1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pt1.png') as ImageSourcePropType,
  },
  "ptpromos": {
    key: "pt-promos",
    normalizedKey: "ptpromos",
    name: "DPt Promos",
    code: "Pt Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pt-promos.png') as ImageSourcePropType,
  },
  "l3": {
    key: "l3",
    normalizedKey: "l3",
    name: "Clash at the Summit",
    code: "L3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/l3.png') as ImageSourcePropType,
  },
  "l2": {
    key: "l2",
    normalizedKey: "l2",
    name: "Reviving Legends",
    code: "L2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/l2.png') as ImageSourcePropType,
  },
  "l1a": {
    key: "l1a",
    normalizedKey: "l1a",
    name: "HeartGold Collection",
    code: "L1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/l1a.png') as ImageSourcePropType,
  },
  "l1b": {
    key: "l1b",
    normalizedKey: "l1b",
    name: "SoulSilver Collection",
    code: "L1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/l1b.png') as ImageSourcePropType,
  },
  "ll": {
    key: "ll",
    normalizedKey: "ll",
    name: "Lost Link",
    code: "LL",
    source: require('../assets/rev2/11-japanese-set-logo/logos/ll.png') as ImageSourcePropType,
  },
  "kldkeldeobattlestrengthdeck": {
    key: "kld-keldeo-battle-strength-deck",
    normalizedKey: "kldkeldeobattlestrengthdeck",
    name: "Keldeo Battle Strength Deck",
    code: "KLD",
    source: require('../assets/rev2/11-japanese-set-logo/logos/kld-keldeo-battle-strength-deck.png') as ImageSourcePropType,
  },
  "gbrgarchomphalfdeck": {
    key: "gbr-garchomp-half-deck",
    normalizedKey: "gbrgarchomphalfdeck",
    name: "Garchomp Half Deck",
    code: "GBR",
    source: require('../assets/rev2/11-japanese-set-logo/logos/gbr-garchomp-half-deck.png') as ImageSourcePropType,
  },
  "szdhydreigonhalfdeck": {
    key: "szd-hydreigon-half-deck",
    normalizedKey: "szdhydreigonhalfdeck",
    name: "Hydreigon Half Deck",
    code: "SZD",
    source: require('../assets/rev2/11-japanese-set-logo/logos/szd-hydreigon-half-deck.png') as ImageSourcePropType,
  },
  "dsdragonselection": {
    key: "ds-dragon-selection",
    normalizedKey: "dsdragonselection",
    name: "Dragon Selection",
    code: "DS",
    source: require('../assets/rev2/11-japanese-set-logo/logos/ds-dragon-selection.png') as ImageSourcePropType,
  },
  "bwpromos": {
    key: "bw-promos",
    normalizedKey: "bwpromos",
    name: "Black & White Promos",
    code: "BW Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw-promos.png') as ImageSourcePropType,
  },
  "mggenesect": {
    key: "mg-genesect",
    normalizedKey: "mggenesect",
    name: "Mewtwo Vs Genesect: Genesect",
    code: "MG",
    source: require('../assets/rev2/11-japanese-set-logo/logos/mg-genesect.png') as ImageSourcePropType,
  },
  "mgmewtwo": {
    key: "mg-mewtwo",
    normalizedKey: "mgmewtwo",
    name: "Mewtwo Vs Genesect: Mewtwo",
    code: "MG",
    source: require('../assets/rev2/11-japanese-set-logo/logos/mg-mewtwo.png') as ImageSourcePropType,
  },
  "kkblastoisekyuremcombodeck": {
    key: "kk-blastoise-kyurem-combo-deck",
    normalizedKey: "kkblastoisekyuremcombodeck",
    name: "Blastoise & Kyurem Combo Deck",
    code: "KK",
    source: require('../assets/rev2/11-japanese-set-logo/logos/kk-blastoise-kyurem-combo-deck.png') as ImageSourcePropType,
  },
  "scshinycollection": {
    key: "sc-shiny-collection",
    normalizedKey: "scshinycollection",
    name: "Shiny Collection",
    code: "SC",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sc-shiny-collection.png') as ImageSourcePropType,
  },
  "wakexcitingbattleforeveryone": {
    key: "wak-exciting-battle-for-everyone",
    normalizedKey: "wakexcitingbattleforeveryone",
    name: "Exciting Battle for Everyone",
    code: "WAK",
    source: require('../assets/rev2/11-japanese-set-logo/logos/wak-exciting-battle-for-everyone.png') as ImageSourcePropType,
  },
  "pbgteamplasmabattlegiftset": {
    key: "pbg-team-plasma-battle-gift-set",
    normalizedKey: "pbgteamplasmabattlegiftset",
    name: "Team Plasma Battle Gift Set",
    code: "PBG",
    source: require('../assets/rev2/11-japanese-set-logo/logos/pbg-team-plasma-battle-gift-set.png') as ImageSourcePropType,
  },
  "bw2redcollection": {
    key: "bw2-red-collection",
    normalizedKey: "bw2redcollection",
    name: "Red Collection",
    code: "BW2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw2-red-collection.png') as ImageSourcePropType,
  },
  "bw1whitecollection": {
    key: "bw1-white-collection",
    normalizedKey: "bw1whitecollection",
    name: "White Collection",
    code: "BW1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw1-white-collection.png') as ImageSourcePropType,
  },
  "bw1blackcollection": {
    key: "bw1-black-collection",
    normalizedKey: "bw1blackcollection",
    name: "Black Collection",
    code: "BW1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw1-black-collection.png') as ImageSourcePropType,
  },
  "bw6coldflare": {
    key: "bw6-cold-flare",
    normalizedKey: "bw6coldflare",
    name: "Cold Flare",
    code: "BW6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw6-cold-flare.png') as ImageSourcePropType,
  },
  "bw5dragonblade": {
    key: "bw5-dragon-blade",
    normalizedKey: "bw5dragonblade",
    name: "Dragon Blade",
    code: "BW5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw5-dragon-blade.png') as ImageSourcePropType,
  },
  "bw5dragonblast": {
    key: "bw5-dragon-blast",
    normalizedKey: "bw5dragonblast",
    name: "Dragon Blast",
    code: "BW5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw5-dragon-blast.png') as ImageSourcePropType,
  },
  "bw4darkrush": {
    key: "bw4-dark-rush",
    normalizedKey: "bw4darkrush",
    name: "Dark Rush",
    code: "BW4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw4-dark-rush.png') as ImageSourcePropType,
  },
  "bw3hailblizzard": {
    key: "bw3-hail-blizzard",
    normalizedKey: "bw3hailblizzard",
    name: "Hail Blizzard",
    code: "BW3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw3-hail-blizzard.png') as ImageSourcePropType,
  },
  "bw3psychodrive": {
    key: "bw3-psycho-drive",
    normalizedKey: "bw3psychodrive",
    name: "Psycho Drive",
    code: "BW3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw3-psycho-drive.png') as ImageSourcePropType,
  },
  "ebbexbattleboost": {
    key: "ebb-ex-battle-boost",
    normalizedKey: "ebbexbattleboost",
    name: "EX Battle Boost",
    code: "EBB",
    source: require('../assets/rev2/11-japanese-set-logo/logos/ebb-ex-battle-boost.png') as ImageSourcePropType,
  },
  "bw9megalocannon": {
    key: "bw9-megalo-cannon",
    normalizedKey: "bw9megalocannon",
    name: "Megalo Cannon",
    code: "BW9",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw9-megalo-cannon.png') as ImageSourcePropType,
  },
  "bw8thunderknuckle": {
    key: "bw8-thunder-knuckle",
    normalizedKey: "bw8thunderknuckle",
    name: "Thunder Knuckle",
    code: "BW8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw8-thunder-knuckle.png') as ImageSourcePropType,
  },
  "bw8spiralforce": {
    key: "bw8-spiral-force",
    normalizedKey: "bw8spiralforce",
    name: "Spiral Force",
    code: "BW8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw8-spiral-force.png') as ImageSourcePropType,
  },
  "bw7plasmagale": {
    key: "bw7-plasma-gale",
    normalizedKey: "bw7plasmagale",
    name: "Plasma Gale",
    code: "BW7",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw7-plasma-gale.png') as ImageSourcePropType,
  },
  "bw6freezebolt": {
    key: "bw6-freeze-bolt",
    normalizedKey: "bw6freezebolt",
    name: "Freeze Bolt",
    code: "BW6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/bw6-freeze-bolt.png') as ImageSourcePropType,
  },
  "neo4": {
    key: "neo4",
    normalizedKey: "neo4",
    name: "Darkness, and to Light...",
    code: "Neo 4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/neo4.png') as ImageSourcePropType,
  },
  "neo3": {
    key: "neo3",
    normalizedKey: "neo3",
    name: "Awakening Legends",
    code: "Neo 3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/neo3.png') as ImageSourcePropType,
  },
  "neo2": {
    key: "neo2",
    normalizedKey: "neo2",
    name: "Crossing the Ruins...",
    code: "Neo 2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/neo2.png') as ImageSourcePropType,
  },
  "neo1": {
    key: "neo1",
    normalizedKey: "neo1",
    name: "Gold, Silver, to a New World...",
    code: "Neo 1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/neo1.png') as ImageSourcePropType,
  },
  "sm2k": {
    key: "sm2k",
    normalizedKey: "sm2k",
    name: "Islands Awaiting You",
    code: "SM2K",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm2k.png') as ImageSourcePropType,
  },
  "sm1p": {
    key: "sm1p",
    normalizedKey: "sm1p",
    name: "Sun & Moon",
    code: "SM1+",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm1p.png') as ImageSourcePropType,
  },
  "sm1s": {
    key: "sm1s",
    normalizedKey: "sm1s",
    name: "Collection Sun",
    code: "SM1S",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm1s.png') as ImageSourcePropType,
  },
  "sm1m": {
    key: "sm1m",
    normalizedKey: "sm1m",
    name: "Collection Moon",
    code: "SM1M",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm1m.png') as ImageSourcePropType,
  },
  "smpromos": {
    key: "sm-promos",
    normalizedKey: "smpromos",
    name: "Sun & Moon Promos",
    code: "SM Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm-promos.png') as ImageSourcePropType,
  },
  "sm6b": {
    key: "sm6b",
    normalizedKey: "sm6b",
    name: "Champion Road",
    code: "SM6B",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm6b.png') as ImageSourcePropType,
  },
  "s8apromopack": {
    key: "s8a-promo-pack",
    normalizedKey: "s8apromopack",
    name: "25th Anniversary Promo Pack",
    code: "S8a Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s8a-promo-pack.png') as ImageSourcePropType,
  },
  "s8a": {
    key: "s8a",
    normalizedKey: "s8a",
    name: "25th Anniversary Collection",
    code: "S8a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s8a.png') as ImageSourcePropType,
  },
  "s8": {
    key: "s8",
    normalizedKey: "s8",
    name: "Fusion Arts",
    code: "S8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s8.png') as ImageSourcePropType,
  },
  "s7r": {
    key: "s7r",
    normalizedKey: "s7r",
    name: "Blue Sky Stream",
    code: "S7R",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s7r.png') as ImageSourcePropType,
  },
  "s7d": {
    key: "s7d",
    normalizedKey: "s7d",
    name: "Towering Perfection",
    code: "S7D",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s7d.png') as ImageSourcePropType,
  },
  "s6a": {
    key: "s6a",
    normalizedKey: "s6a",
    name: "Eevee Heroes",
    code: "S6a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s6a.png') as ImageSourcePropType,
  },
  "s10d": {
    key: "s10d",
    normalizedKey: "s10d",
    name: "Time Gazer",
    code: "S10D",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s10d.png') as ImageSourcePropType,
  },
  "s10p": {
    key: "s10p",
    normalizedKey: "s10p",
    name: "Space Juggler",
    code: "S10P",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s10p.png') as ImageSourcePropType,
  },
  "s9a": {
    key: "s9a",
    normalizedKey: "s9a",
    name: "Battle Region",
    code: "S9a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s9a.png') as ImageSourcePropType,
  },
  "s9": {
    key: "s9",
    normalizedKey: "s9",
    name: "Star Birth",
    code: "S9",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s9.png') as ImageSourcePropType,
  },
  "mc": {
    key: "mc",
    normalizedKey: "mc",
    name: "Start Deck 100",
    code: "S1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/mc.png') as ImageSourcePropType,
  },
  "s8b": {
    key: "s8b",
    normalizedKey: "s8b",
    name: "VMAX Climax",
    code: "S8b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s8b.png') as ImageSourcePropType,
  },
  "s12a": {
    key: "s12a",
    normalizedKey: "s12a",
    name: "VSTAR Universe",
    code: "S12a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s12a.png') as ImageSourcePropType,
  },
  "s12": {
    key: "s12",
    normalizedKey: "s12",
    name: "Paradigm Trigger",
    code: "S12",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s12.png') as ImageSourcePropType,
  },
  "s11a": {
    key: "s11a",
    normalizedKey: "s11a",
    name: "Incandescent Arcana",
    code: "S11a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s11a.png') as ImageSourcePropType,
  },
  "s11": {
    key: "s11",
    normalizedKey: "s11",
    name: "Lost Abyss",
    code: "S11",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s11.png') as ImageSourcePropType,
  },
  "s10b": {
    key: "s10b",
    normalizedKey: "s10b",
    name: "Pokemon GO",
    code: "S10b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s10b.png') as ImageSourcePropType,
  },
  "s10a": {
    key: "s10a",
    normalizedKey: "s10a",
    name: "Dark Phantasma",
    code: "S10a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s10a.png') as ImageSourcePropType,
  },
  "sv2d": {
    key: "sv2d",
    normalizedKey: "sv2d",
    name: "Clay Burst",
    code: "SV2D",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv2d.png') as ImageSourcePropType,
  },
  "sv1a": {
    key: "sv1a",
    normalizedKey: "sv1a",
    name: "Triplet Beat",
    code: "SV1a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv1a.png') as ImageSourcePropType,
  },
  "sv1v": {
    key: "sv1v",
    normalizedKey: "sv1v",
    name: "Violet ex",
    code: "SV1V",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv1v.png') as ImageSourcePropType,
  },
  "sv1s": {
    key: "sv1s",
    normalizedKey: "sv1s",
    name: "Scarlet ex",
    code: "SV1S",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv1s.png') as ImageSourcePropType,
  },
  "svp": {
    key: "svp",
    normalizedKey: "svp",
    name: "Scarlet & Violet Promos",
    code: "SV Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/svp.png') as ImageSourcePropType,
  },
  "sv4m": {
    key: "sv4m",
    normalizedKey: "sv4m",
    name: "Future Flash",
    code: "SV4M",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv4m.png') as ImageSourcePropType,
  },
  "sv4k": {
    key: "sv4k",
    normalizedKey: "sv4k",
    name: "Ancient Roar",
    code: "SV4K",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv4k.png') as ImageSourcePropType,
  },
  "sv3a": {
    key: "sv3a",
    normalizedKey: "sv3a",
    name: "Raging Surf",
    code: "SV3a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv3a.png') as ImageSourcePropType,
  },
  "sv3": {
    key: "sv3",
    normalizedKey: "sv3",
    name: "Ruler of the Black Flame",
    code: "SV3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv3.png') as ImageSourcePropType,
  },
  "sv2a": {
    key: "sv2a",
    normalizedKey: "sv2a",
    name: "Pokemon 151",
    code: "SV2a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv2a.png') as ImageSourcePropType,
  },
  "sv2p": {
    key: "sv2p",
    normalizedKey: "sv2p",
    name: "Snow Hazard",
    code: "SV2P",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv2p.png') as ImageSourcePropType,
  },
  "sv6a": {
    key: "sv6a",
    normalizedKey: "sv6a",
    name: "Night Wanderer",
    code: "SV6a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv6a.png') as ImageSourcePropType,
  },
  "sv6": {
    key: "sv6",
    normalizedKey: "sv6",
    name: "Mask of Change",
    code: "SV6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv6.png') as ImageSourcePropType,
  },
  "sv5a": {
    key: "sv5a",
    normalizedKey: "sv5a",
    name: "Crimson Haze",
    code: "SV5a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv5a.png') as ImageSourcePropType,
  },
  "sv5m": {
    key: "sv5m",
    normalizedKey: "sv5m",
    name: "Cyber Judge",
    code: "SV5M",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv5m.png') as ImageSourcePropType,
  },
  "sv5k": {
    key: "sv5k",
    normalizedKey: "sv5k",
    name: "Wild Force",
    code: "SV5K",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv5k.png') as ImageSourcePropType,
  },
  "sv4a": {
    key: "sv4a",
    normalizedKey: "sv4a",
    name: "Shiny Treasure ex",
    code: "SV4a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv4a.png') as ImageSourcePropType,
  },
  "sv9a": {
    key: "sv9a",
    normalizedKey: "sv9a",
    name: "Heat Wave Arena",
    code: "SV9a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv9a.png') as ImageSourcePropType,
  },
  "sv9": {
    key: "sv9",
    normalizedKey: "sv9",
    name: "Battle Partners",
    code: "SV9",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv9.png') as ImageSourcePropType,
  },
  "sv8a": {
    key: "sv8a",
    normalizedKey: "sv8a",
    name: "Terastal Festival ex",
    code: "SV8a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv8a.png') as ImageSourcePropType,
  },
  "sv8": {
    key: "sv8",
    normalizedKey: "sv8",
    name: "Super Electric Breaker",
    code: "SV8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv8.png') as ImageSourcePropType,
  },
  "sv7a": {
    key: "sv7a",
    normalizedKey: "sv7a",
    name: "Paradise Dragona",
    code: "SV7a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv7a.png') as ImageSourcePropType,
  },
  "sv7": {
    key: "sv7",
    normalizedKey: "sv7",
    name: "Stellar Miracle",
    code: "SV7",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv7.png') as ImageSourcePropType,
  },
  "m1l": {
    key: "m1l",
    normalizedKey: "m1l",
    name: "Mega Brave",
    code: "M1L",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m1l.png') as ImageSourcePropType,
  },
  "m1s": {
    key: "m1s",
    normalizedKey: "m1s",
    name: "Mega Symphonia",
    code: "M1S",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m1s.png') as ImageSourcePropType,
  },
  "mp": {
    key: "m-p",
    normalizedKey: "mp",
    name: "Mega Series Promos",
    code: "M Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m-p.png') as ImageSourcePropType,
  },
  "sv11w": {
    key: "sv11w",
    normalizedKey: "sv11w",
    name: "White Flare",
    code: "SV11W",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv11w.png') as ImageSourcePropType,
  },
  "sv11b": {
    key: "sv11b",
    normalizedKey: "sv11b",
    name: "Black Bolt",
    code: "SV11B",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv11b.png') as ImageSourcePropType,
  },
  "sv10": {
    key: "sv10",
    normalizedKey: "sv10",
    name: "Glory of Team Rocket",
    code: "SV10",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sv10.png') as ImageSourcePropType,
  },
  "m6a": {
    key: "m6a",
    normalizedKey: "m6a",
    name: "30th Celebration",
    code: "M6a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m6a.png') as ImageSourcePropType,
  },
  "m5": {
    key: "m5",
    normalizedKey: "m5",
    name: "Abyss Eye",
    code: "M5",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m5.png') as ImageSourcePropType,
  },
  "m4": {
    key: "m4",
    normalizedKey: "m4",
    name: "Ninja Spinner",
    code: "M4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m4.png') as ImageSourcePropType,
  },
  "m3": {
    key: "m3",
    normalizedKey: "m3",
    name: "Munikisu Zero",
    code: "M3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m3.png') as ImageSourcePropType,
  },
  "m2a": {
    key: "m2a",
    normalizedKey: "m2a",
    name: "Mega Dream ex",
    code: "M2a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m2a.png') as ImageSourcePropType,
  },
  "m2": {
    key: "m2",
    normalizedKey: "m2",
    name: "Inferno X",
    code: "M2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/m2.png') as ImageSourcePropType,
  },
  "s4": {
    key: "s4",
    normalizedKey: "s4",
    name: "Electrifying Tackle",
    code: "S4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s4.png') as ImageSourcePropType,
  },
  "s3a": {
    key: "s3a",
    normalizedKey: "s3a",
    name: "Legendary Pulse",
    code: "S3a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s3a.png') as ImageSourcePropType,
  },
  "s3": {
    key: "s3",
    normalizedKey: "s3",
    name: "Infinity Zone",
    code: "S3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s3.png') as ImageSourcePropType,
  },
  "s2a": {
    key: "s2a",
    normalizedKey: "s2a",
    name: "Explosive Flame Walker",
    code: "S2a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s2a.png') as ImageSourcePropType,
  },
  "s2": {
    key: "s2",
    normalizedKey: "s2",
    name: "Rebellion Crash",
    code: "S2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s2.png') as ImageSourcePropType,
  },
  "s1a": {
    key: "s1a",
    normalizedKey: "s1a",
    name: "VMAX Rising",
    code: "S1a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s1a.png') as ImageSourcePropType,
  },
  "s1w": {
    key: "s1w",
    normalizedKey: "s1w",
    name: "Sword",
    code: "S1W",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s1w.png') as ImageSourcePropType,
  },
  "s1h": {
    key: "s1h",
    normalizedKey: "s1h",
    name: "Shield",
    code: "S1H",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s1h.png') as ImageSourcePropType,
  },
  "swshpromos": {
    key: "swsh-promos",
    normalizedKey: "swshpromos",
    name: "Sword & Shield Promos",
    code: "S Promo",
    source: require('../assets/rev2/11-japanese-set-logo/logos/swsh-promos.png') as ImageSourcePropType,
  },
  "sp4eeveeheroesvmaxspecialset": {
    key: "sp4-eevee-heroes-vmax-special-set",
    normalizedKey: "sp4eeveeheroesvmaxspecialset",
    name: "Eevee Heroes VMAX Special Set",
    code: "SP4",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sp4-eevee-heroes-vmax-special-set.png') as ImageSourcePropType,
  },
  "sp3silverlancejetblackspiritpromos": {
    key: "sp3-silver-lance-jet-black-spirit-promos",
    normalizedKey: "sp3silverlancejetblackspiritpromos",
    name: "Silver Lance & Jet-Black Spirit Promos",
    code: "SP3",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sp3-silver-lance-jet-black-spirit-promos.png') as ImageSourcePropType,
  },
  "sp2vmaxspecialset": {
    key: "sp2-vmax-special-set",
    normalizedKey: "sp2vmaxspecialset",
    name: "VMAX Special Set",
    code: "SP2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sp2-vmax-special-set.png') as ImageSourcePropType,
  },
  "sm12a": {
    key: "sm12a",
    normalizedKey: "sm12a",
    name: "Tag Team GX All Stars",
    code: "SM12a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm12a.png') as ImageSourcePropType,
  },
  "sm12": {
    key: "sm12",
    normalizedKey: "sm12",
    name: "Alter Genesis",
    code: "SM12",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm12.png') as ImageSourcePropType,
  },
  "sm11b": {
    key: "sm11b",
    normalizedKey: "sm11b",
    name: "Dream League",
    code: "SM11b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm11b.png') as ImageSourcePropType,
  },
  "sm11a": {
    key: "sm11a",
    normalizedKey: "sm11a",
    name: "Remix Bout",
    code: "SM11a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm11a.png') as ImageSourcePropType,
  },
  "sm11": {
    key: "sm11",
    normalizedKey: "sm11",
    name: "Miracle Twins",
    code: "SM11",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm11.png') as ImageSourcePropType,
  },
  "sm10b": {
    key: "sm10b",
    normalizedKey: "sm10b",
    name: "Sky Legend",
    code: "SM10b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm10b.png') as ImageSourcePropType,
  },
  "sm7b": {
    key: "sm7b",
    normalizedKey: "sm7b",
    name: "Fairy Rise",
    code: "SM7b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm7b.png') as ImageSourcePropType,
  },
  "sm7a": {
    key: "sm7a",
    normalizedKey: "sm7a",
    name: "Thunderclap Spark",
    code: "SM7a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm7a.png') as ImageSourcePropType,
  },
  "sm7": {
    key: "sm7",
    normalizedKey: "sm7",
    name: "Charisma of the Cracked Sky",
    code: "SM7",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm7.png') as ImageSourcePropType,
  },
  "sm6": {
    key: "sm6",
    normalizedKey: "sm6",
    name: "Forbidden Light",
    code: "SM6",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm6.png') as ImageSourcePropType,
  },
  "sm5p": {
    key: "sm5p",
    normalizedKey: "sm5p",
    name: "Ultra Force",
    code: "SM5+",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm5p.png') as ImageSourcePropType,
  },
  "sm5s": {
    key: "sm5s",
    normalizedKey: "sm5s",
    name: "Ultra Sun",
    code: "SM5S",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm5s.png') as ImageSourcePropType,
  },
  "sm5m": {
    key: "sm5m",
    normalizedKey: "sm5m",
    name: "Ultra Moon",
    code: "SM5M",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm5m.png') as ImageSourcePropType,
  },
  "sm4p": {
    key: "sm4p",
    normalizedKey: "sm4p",
    name: "GX Battle Boost",
    code: "SM4+",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm4p.png') as ImageSourcePropType,
  },
  "sm4a": {
    key: "sm4a",
    normalizedKey: "sm4a",
    name: "The Transdimensional Beast",
    code: "SM4a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm4a.png') as ImageSourcePropType,
  },
  "sm8b": {
    key: "sm8b",
    normalizedKey: "sm8b",
    name: "GX Ultra Shiny",
    code: "SM8b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm8b.png') as ImageSourcePropType,
  },
  "sm8a": {
    key: "sm8a",
    normalizedKey: "sm8a",
    name: "Dark Order",
    code: "SM8a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm8a.png') as ImageSourcePropType,
  },
  "sm8": {
    key: "sm8",
    normalizedKey: "sm8",
    name: "Explosive Impact",
    code: "SM8",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm8.png') as ImageSourcePropType,
  },
  "smp2": {
    key: "smp2",
    normalizedKey: "smp2",
    name: "Detective Pikachu",
    code: "SMP2",
    source: require('../assets/rev2/11-japanese-set-logo/logos/smp2.png') as ImageSourcePropType,
  },
  "sm10a": {
    key: "sm10a",
    normalizedKey: "sm10a",
    name: "GG End",
    code: "SM10a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm10a.png') as ImageSourcePropType,
  },
  "sm10": {
    key: "sm10",
    normalizedKey: "sm10",
    name: "Double Blaze",
    code: "SM10",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm10.png') as ImageSourcePropType,
  },
  "sm9b": {
    key: "sm9b",
    normalizedKey: "sm9b",
    name: "Full Metal Wall",
    code: "SM9b",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm9b.png') as ImageSourcePropType,
  },
  "sm9a": {
    key: "sm9a",
    normalizedKey: "sm9a",
    name: "Night Unison",
    code: "SM9a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm9a.png') as ImageSourcePropType,
  },
  "sm9": {
    key: "sm9",
    normalizedKey: "sm9",
    name: "Tag Bolt",
    code: "SM9",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm9.png') as ImageSourcePropType,
  },
  "sm4s": {
    key: "sm4s",
    normalizedKey: "sm4s",
    name: "The Awoken Hero",
    code: "SM4S",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm4s.png') as ImageSourcePropType,
  },
  "sm3p": {
    key: "sm3p",
    normalizedKey: "sm3p",
    name: "Shining Legends",
    code: "SM3+",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm3p.png') as ImageSourcePropType,
  },
  "sm3n": {
    key: "sm3n",
    normalizedKey: "sm3n",
    name: "Light-Consuming Darkness",
    code: "SM3N",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm3n.png') as ImageSourcePropType,
  },
  "sm3h": {
    key: "sm3h",
    normalizedKey: "sm3h",
    name: "Seen the Rainbow Battle",
    code: "SM3H",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm3h.png') as ImageSourcePropType,
  },
  "sm2p": {
    key: "sm2p",
    normalizedKey: "sm2p",
    name: "Beyond A New Challenge",
    code: "SM2+",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm2p.png') as ImageSourcePropType,
  },
  "sm2l": {
    key: "sm2l",
    normalizedKey: "sm2l",
    name: "Alola Moonlight",
    code: "SM2L",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm2l.png') as ImageSourcePropType,
  },
  "s6k": {
    key: "s6k",
    normalizedKey: "s6k",
    name: "Jet Black Spirit",
    code: "S6K",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s6k.png') as ImageSourcePropType,
  },
  "s6h": {
    key: "s6h",
    normalizedKey: "s6h",
    name: "Silver Lance",
    code: "S6H",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s6h.png') as ImageSourcePropType,
  },
  "s5a": {
    key: "s5a",
    normalizedKey: "s5a",
    name: "Matchless Fighter",
    code: "S5a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s5a.png') as ImageSourcePropType,
  },
  "s5r": {
    key: "s5r",
    normalizedKey: "s5r",
    name: "Rapid Strike Master",
    code: "S5R",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s5r.png') as ImageSourcePropType,
  },
  "s5i": {
    key: "s5i",
    normalizedKey: "s5i",
    name: "Single Strike Master",
    code: "S5I",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s5i.png') as ImageSourcePropType,
  },
  "s4a": {
    key: "s4a",
    normalizedKey: "s4a",
    name: "Shiny Star V",
    code: "S4a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/s4a.png') as ImageSourcePropType,
  },
  "sm6a": {
    key: "sm6a",
    normalizedKey: "sm6a",
    name: "Dragon Storm",
    code: "SM6a",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm6a.png') as ImageSourcePropType,
  },
  "smdashvsteamrocketbattleset": {
    key: "smd-ash-vs-team-rocket-battle-set",
    normalizedKey: "smdashvsteamrocketbattleset",
    name: "Ash vs Team Rocket Battle Set",
    code: "SMD",
    source: require('../assets/rev2/11-japanese-set-logo/logos/smd-ash-vs-team-rocket-battle-set.png') as ImageSourcePropType,
  },
  "sm0": {
    key: "sm0",
    normalizedKey: "sm0",
    name: "Pikachu & New Friends",
    code: "SM0",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sm0.png') as ImageSourcePropType,
  },
  "smctapubulugxenhancedstarter": {
    key: "smc-tapu-bulu-gx-enhanced-starter",
    normalizedKey: "smctapubulugxenhancedstarter",
    name: "Tapu Bulu GX Enhanced Starter",
    code: "SMC",
    source: require('../assets/rev2/11-japanese-set-logo/logos/smc-tapu-bulu-gx-enhanced-starter.png') as ImageSourcePropType,
  },
  "smp1rockrufffullpowerdeck": {
    key: "smp1-rockruff-full-power-deck",
    normalizedKey: "smp1rockrufffullpowerdeck",
    name: "Rockruff Full Power Deck",
    code: "SMP1",
    source: require('../assets/rev2/11-japanese-set-logo/logos/smp1-rockruff-full-power-deck.png') as ImageSourcePropType,
  },
  "smastartersetdecks": {
    key: "sma-starter-set-decks",
    normalizedKey: "smastartersetdecks",
    name: "Starter Set Decks",
    code: "SMA",
    source: require('../assets/rev2/11-japanese-set-logo/logos/sma-starter-set-decks.png') as ImageSourcePropType,
  },
};

const JAPANESE_SET_LOGO_ALIASES: Record<string, string> = {
  "bwp": "bwpromos",
  "bwpromo": "bwpromos",
  "dpp": "dppromos",
  "dppromo": "dppromos",
  "dptp": "ptpromos",
  "dptpromo": "ptpromos",
  "megapromo": "mp",
  "mp": "mp",
  "mpromo": "mp",
  "ptp": "ptpromos",
  "ptpromo": "ptpromos",
  "smp": "smpromos",
  "smpromo": "smpromos",
  "sn10a": "sm10a",
  "sn11": "sm11",
  "sp": "swshpromos",
  "spromo": "swshpromos",
  "svp": "svp",
  "svpromo": "svp",
  "swordshieldpromos": "swshpromos",
  "xyp": "xypromos",
  "xypromo": "xypromos",
};

const AMBIGUOUS_ENGLISH_SET_LOGO_KEYS = new Set<string>(["neo1", "neo2", "neo3", "neo4", "xy2", "xy3", "xy4", "xy6", "xy7", "xy9", "xy10", "sm6", "sm7", "sm8", "sm9", "sm10", "sm11", "sm12", "sv3", "sv6", "sv7", "sv8", "sv9", "sv10"]);
const JAPANESE_LANGUAGE_ALIASES = new Set(['ja', 'jp', 'jpn', 'japanese', 'japan']);

function clean(value?: string | null) {
  return String(value ?? '').trim();
}

export function normalizeJapaneseSetLogoKey(value?: string | null) {
  const text = clean(value);
  if (!text) return '';
  return text
    .replace(/^(ja|jp):/i, '')
    .replace(/\+/g, 'p')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '');
}

function buildUniqueLogoIndex(getValue: (match: JapaneseSetLogoMatch) => string | null | undefined) {
  const index: Record<string, JapaneseSetLogoMatch> = {};
  const duplicateKeys = new Set<string>();
  for (const match of Object.values(JAPANESE_SET_LOGOS_BY_KEY)) {
    const key = normalizeJapaneseSetLogoKey(getValue(match));
    if (!key) continue;
    if (index[key] && index[key].key !== match.key) {
      duplicateKeys.add(key);
      continue;
    }
    index[key] = match;
  }
  for (const key of duplicateKeys) {
    delete index[key];
  }
  return index;
}

const JAPANESE_SET_LOGOS_BY_CODE = buildUniqueLogoIndex((match) => match.code);
const JAPANESE_SET_LOGOS_BY_NAME = buildUniqueLogoIndex((match) => match.name);

function stripSetLanguagePrefix(value?: string | null) {
  return clean(value).replace(/^(ja|jp):/i, '');
}

function isExplicitJapaneseLookup(setId?: string | null, language?: string | null) {
  const normalizedLanguage = clean(language).toLowerCase();
  const rawSetId = clean(setId).toLowerCase();
  return JAPANESE_LANGUAGE_ALIASES.has(normalizedLanguage) || /^(ja|jp):/i.test(rawSetId);
}

function uniqueClean(values: Array<string | number | null | undefined>) {
  return [...new Set(values.map((value) => clean(value == null ? null : String(value))).filter(Boolean))];
}

function getNormalizedLogoKeys(values: Array<string | number | null | undefined>) {
  return uniqueClean(values)
    .map((candidate) => JAPANESE_SET_LOGO_ALIASES[normalizeJapaneseSetLogoKey(candidate)] ?? normalizeJapaneseSetLogoKey(candidate))
    .filter(Boolean);
}

function getLogoLookupCandidates(setId?: string | null) {
  const raw = clean(setId);
  const stripped = stripSetLanguagePrefix(raw);
  return getNormalizedLogoKeys([raw, stripped, normalizeJapaneseSetLogoKey(raw), normalizeJapaneseSetLogoKey(stripped)]);
}

function getSetLookupIds(input?: JapaneseSetLogoLookupInput | null) {
  const externalIds = input?.externalIds ?? {};
  return uniqueClean([
    input?.id,
    input?.setId,
    input?.sourceId,
    input?.setCode,
    externalIds.setCode,
    externalIds.tcgdex,
    externalIds.pokemonTcg,
    externalIds.pokedata ? `pokedata:${externalIds.pokedata}` : null,
  ]);
}

function getSetLookupNames(input?: JapaneseSetLogoLookupInput | null) {
  return uniqueClean([
    input?.englishDisplayName,
    input?.name,
    input?.localName,
  ]);
}

export function getJapaneseSetLogoMatch(setId?: string | null, language?: string | null): JapaneseSetLogoMatch | null {
  const explicitJapanese = isExplicitJapaneseLookup(setId, language);
  for (const candidate of getLogoLookupCandidates(setId)) {
    const match = JAPANESE_SET_LOGOS_BY_KEY[candidate];
    if (!match) continue;
    if (explicitJapanese || !AMBIGUOUS_ENGLISH_SET_LOGO_KEYS.has(candidate)) return match;
  }
  return null;
}

export function getJapaneseSetLogoMatchForSet(
  input?: JapaneseSetLogoLookupInput | null,
  fallbackLanguage?: string | null
): JapaneseSetLogoMatch | null {
  if (!input) return null;
  const primaryId = input.id ?? input.setId ?? input.sourceId ?? input.setCode ?? null;
  const language = input.language ?? fallbackLanguage ?? null;
  const explicitJapanese = isExplicitJapaneseLookup(primaryId == null ? null : String(primaryId), language);

  for (const candidate of getNormalizedLogoKeys(getSetLookupIds(input))) {
    const match = JAPANESE_SET_LOGOS_BY_KEY[candidate];
    if (match && (explicitJapanese || !AMBIGUOUS_ENGLISH_SET_LOGO_KEYS.has(candidate))) return match;
  }

  if (!explicitJapanese) return null;

  for (const candidate of getNormalizedLogoKeys([input.setCode, input.externalIds?.setCode])) {
    const match = JAPANESE_SET_LOGOS_BY_CODE[candidate];
    if (match) return match;
  }

  for (const candidate of getNormalizedLogoKeys(getSetLookupNames(input))) {
    const match = JAPANESE_SET_LOGOS_BY_NAME[candidate];
    if (match) return match;
  }

  return null;
}

export function getJapaneseSetLogoSource(setId?: string | null, language?: string | null): ImageSourcePropType | null {
  return getJapaneseSetLogoMatch(setId, language)?.source ?? null;
}

export function getJapaneseSetLogoSourceForSet(
  input?: JapaneseSetLogoLookupInput | null,
  fallbackLanguage?: string | null
): ImageSourcePropType | null {
  return getJapaneseSetLogoMatchForSet(input, fallbackLanguage)?.source ?? null;
}

