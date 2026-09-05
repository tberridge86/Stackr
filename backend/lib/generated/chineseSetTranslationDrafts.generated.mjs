// Generated review-only model-translation candidates. Public runtime import is rights-gated.
// Source draft SHA-256: b51e749e259d3a6c10d6fbcbb8f587b1db42b71516f859276333a9e63ba87dc3.
export const CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA = {
  "schemaVersion": "stackr-chinese-set-model-translation-draft-lookup-v1",
  "status": "model_translation_draft",
  "provenance": "scripts/build-chinese-set-translation-draft-review-pack.ts",
  "nativeNameSource": "catalogue/chinese-set-translation-draft-native-name-source.json",
  "nativeNameSourceSha256": "54de7602708fdf2f785393f4c25f27dcd2924fea5179f17c3e5f40914eedf8f6",
  "providerBaselineSnapshot": {
    "providerBaselinePath": "reports/catalogue/provider-baseline/2026-08-14/raw/{zh-cn,zh-tw}.sets.json",
    "baselineSha256": {
      "zh-cn": "69170515af0564d353d0400905ccbb759ee402455a88021f433453fe23f056da",
      "zh-tw": "06790ef53153231dff8e872415e75cb474fd71ab5f92ec6bb0bec5cbe49ba358"
    }
  },
  "tcgdexChineseIdentityDisplaySource": {
    "path": "catalogue/tcgdex-chinese-set-identity-display-source.json",
    "sha256": "bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629",
    "count": 2,
    "upstream": {
      "repository": "tcgdex/cards-database",
      "pinnedCommit": "dd4fc9460b54b91c25df750c68ca36b9946448e2",
      "licence": "MIT"
    },
    "policy": {
      "use": "runtime_translation_draft_native_identity_only",
      "nativeNameRemainsPrimary": true,
      "strictLanguageCodeAndNativeNameMatchRequired": true,
      "pathStemRekeyAllowedOnlyForReviewedCbb1cTypo": true,
      "canonicalDatabaseWriteAuthorized": false
    },
    "reviewedResolutionEvidence": {
      "evidenceId": "provider-resolution:2026-08-14:42a5f7613be7f7e92c71d286",
      "files": {
        "catalogue/provider-resolution-evidence-contract.2026-08-14.json": "d525dbe9939f40823e30a2b8b16dcba1b4187cec986175574058d66013619fed",
        "reports/catalogue/provider-resolution/2026-08-14/manifest.json": "36bb85d319cfb1b17bede1ac06f99ba428b560c8a34e9b6b690607e00a2e7560",
        "reports/catalogue/provider-resolution/2026-08-14/resolved-provider-baseline-evidence.json": "84afd5d01a71017efca3e2052c6b61499d0be51e5c29c499d2be5188ecb0d1b5",
        "reports/catalogue/provider-resolution/2026-08-14/provider-set-resolution-ledger.jsonl": "59fef5159f65dd4b4ff9fce5dc5245b1b70cda5ea2b63e177b8c8d3eaa22b089",
        "reports/catalogue/provider-resolution/2026-08-14/raw/github-source-CSV1C.json": "1224d60892407d81b0eacbdd0550a88f3fe75b348427e829d9842f4151ba098d",
        "reports/catalogue/provider-resolution/2026-08-14/raw/github-source-CBB1C.json": "bd9a27ada31dcc71197ba253476999fae00e3b309a4724e03bfd8669bd553818"
      }
    }
  },
  "nativeNameRemainsPrimary": true,
  "englishDisplayNameAuthoritative": false,
  "rightsGate": {
    "reviewPath": "catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json",
    "reviewSha256": "756deba35b402b9714937a84f0db88b858945af6d861320dcdca71374630c205",
    "reviewId": "cjk-editorial-set-translation-owner-approved:2026-09-04",
    "reviewStatus": "approved_active_runtime_only",
    "activationAuthorized": true,
    "publicRuntimeImportAuthorized": true,
    "canonicalDatabaseWriteAuthorized": false,
    "ownerAttestationPath": "catalogue/rights-evidence/cjk-app-metadata-permission-owner-attestation.2026-09-04.json",
    "ownerAttestationSha256": "13e9bc1ffa4635cdc10110f0e8dc7356dcb7433d73e60755cc019ba075137d11",
    "verifiedSourceFiles": {
      "catalogue/source-rights-registry.json": "53805cec7470b726190d1b268a2b93c5b0e6d96dd8287428a036f591456b250e",
      "catalogue/rights-evidence/tcgdex-metadata-mit.2026-08-14.json": "178de363fd396d6de895f2bfb36cc91138b58b1cb447a85ae08427b80c3f0b03",
      "catalogue/japanese-set-display-drafts-source.json": "e17095374fa563da0a517b0c7f97859ef4525822f226ffb114ed2c428403f7d3",
      "catalogue/chinese-set-translation-draft-native-name-source.json": "54de7602708fdf2f785393f4c25f27dcd2924fea5179f17c3e5f40914eedf8f6",
      "catalogue/tcgdex-chinese-set-identity-display-source.json": "bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629",
      "scripts/build-chinese-set-translation-draft-review-pack.ts": "c6eac83af5f0419c5b42849c3682b89b874765b1cd20d6b32bdb2eee8393eefa"
    },
    "requiredLaneIds": [
      "chinese_editorial_set_translation_candidates"
    ]
  },
  "displayLabel": "English translation:",
  "languages": [
    "zh-cn",
    "zh-tw"
  ],
  "counts": {
    "zh-cn": 49,
    "zh-tw": 77
  },
  "exclusionCounts": {}
};
export const CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE = {
  "zh-cn": {
    "cbb1c": {
      "nativeName": "宝石包 第一卷",
      "normalizedNativeName": "宝石包第一卷",
      "englishTranslation": "Gem Pack Vol. 1"
    },
    "cbb2c": {
      "nativeName": "宝石包Vol.2",
      "normalizedNativeName": "宝石包Vol.2",
      "englishTranslation": "Gem Pack Vol. 2"
    },
    "cbb3c": {
      "nativeName": "宝石包Vol.3",
      "normalizedNativeName": "宝石包Vol.3",
      "englishTranslation": "Gem Pack Vol. 3"
    },
    "cbb4c": {
      "nativeName": "宝石包 Vol.4",
      "normalizedNativeName": "宝石包Vol.4",
      "englishTranslation": "Gem Pack Vol. 4"
    },
    "cbb5c": {
      "nativeName": "宝石包 Vol.5",
      "normalizedNativeName": "宝石包Vol.5",
      "englishTranslation": "Gem Pack Vol. 5"
    },
    "cs1.5c": {
      "nativeName": "极巨攻防",
      "normalizedNativeName": "极巨攻防",
      "englishTranslation": "Gigantamax Attack and Defense"
    },
    "cs1ac": {
      "nativeName": "横空出世 赫",
      "normalizedNativeName": "横空出世赫",
      "englishTranslation": "Skyborne Emergence: Scarlet"
    },
    "cs1bc": {
      "nativeName": "极巨争锋 焰",
      "normalizedNativeName": "极巨争锋焰",
      "englishTranslation": "Gigantamax Clash: Blaze"
    },
    "cs2.5c": {
      "nativeName": "璀璨反击",
      "normalizedNativeName": "璀璨反击",
      "englishTranslation": "Brilliant Counterattack"
    },
    "cs2ac": {
      "nativeName": "浓墨重彩 黎",
      "normalizedNativeName": "浓墨重彩黎",
      "englishTranslation": "Ink and Color: Dawn"
    },
    "cs2bc": {
      "nativeName": "浓墨重彩 靛",
      "normalizedNativeName": "浓墨重彩靛",
      "englishTranslation": "Ink and Color: Indigo"
    },
    "cs3.5c": {
      "nativeName": "怒炎灼天",
      "normalizedNativeName": "怒炎灼天",
      "englishTranslation": "Raging Flames Scorch the Sky"
    },
    "cs3ac": {
      "nativeName": "洪荒演武 茂",
      "normalizedNativeName": "洪荒演武茂",
      "englishTranslation": "Primeval Battle: Verdant"
    },
    "cs3bc": {
      "nativeName": "洪荒演武 激",
      "normalizedNativeName": "洪荒演武激",
      "englishTranslation": "Primeval Battle: Surge"
    },
    "cs4.5c": {
      "nativeName": "终末炎舞",
      "normalizedNativeName": "终末炎舞",
      "englishTranslation": "Final Flame Dance"
    },
    "cs4ac": {
      "nativeName": "九彩汇聚 朋",
      "normalizedNativeName": "九彩汇聚朋",
      "englishTranslation": "Nine-Color Convergence: Companion"
    },
    "cs4bc": {
      "nativeName": "九彩汇聚 源",
      "normalizedNativeName": "九彩汇聚源",
      "englishTranslation": "Nine-Color Convergence: Origin"
    },
    "cs5.5c": {
      "nativeName": "暗影夺辉",
      "normalizedNativeName": "暗影夺辉",
      "englishTranslation": "Shadow Seizes the Light"
    },
    "cs5ac": {
      "nativeName": "勇魅群星 魅",
      "normalizedNativeName": "勇魅群星魅",
      "englishTranslation": "Courage and Charm Among the Stars: Charm"
    },
    "cs5bc": {
      "nativeName": "勇魅群星 勇",
      "normalizedNativeName": "勇魅群星勇",
      "englishTranslation": "Courage and Charm Among the Stars: Courage"
    },
    "cs6.5c": {
      "nativeName": "胜象星引",
      "normalizedNativeName": "胜象星引",
      "englishTranslation": "Triumphant Star Guidance"
    },
    "cs6ac": {
      "nativeName": "碧海暗影 啸",
      "normalizedNativeName": "碧海暗影啸",
      "englishTranslation": "Azure Sea Shadow: Roar"
    },
    "cs6bc": {
      "nativeName": "碧海暗影 逐",
      "normalizedNativeName": "碧海暗影逐",
      "englishTranslation": "Azure Sea Shadow: Pursuit"
    },
    "csm1.5c": {
      "nativeName": "对战精英",
      "normalizedNativeName": "对战精英",
      "englishTranslation": "Battle Elite"
    },
    "csm1a": {
      "nativeName": "风暴涌现",
      "normalizedNativeName": "风暴涌现",
      "englishTranslation": "Storm Surge"
    },
    "csm1b": {
      "nativeName": "风暴涌现",
      "normalizedNativeName": "风暴涌现",
      "englishTranslation": "Storm Surge"
    },
    "csm1cc": {
      "nativeName": "横空出世 泽",
      "normalizedNativeName": "横空出世泽",
      "englishTranslation": "Skyborne Emergence: Grace"
    },
    "csm2.5c": {
      "nativeName": "炫奇争胜",
      "normalizedNativeName": "炫奇争胜",
      "englishTranslation": "Dazzling Contest"
    },
    "csm2ac": {
      "nativeName": "交相辉映 沐",
      "normalizedNativeName": "交相辉映沐",
      "englishTranslation": "Interwoven Radiance: Bathing"
    },
    "csm2b": {
      "nativeName": "闪耀协同效应",
      "normalizedNativeName": "闪耀协同效应",
      "englishTranslation": "Shining Synergy"
    },
    "csm2cc": {
      "nativeName": "交相辉映 唤",
      "normalizedNativeName": "交相辉映唤",
      "englishTranslation": "Interwoven Radiance: Summoning"
    },
    "csmpic": {
      "nativeName": "对战派对组合 奖励包",
      "normalizedNativeName": "对战派对组合奖励包",
      "englishTranslation": "Battle Party Combination Reward Pack"
    },
    "csv1c": {
      "nativeName": "亘古开来",
      "normalizedNativeName": "亘古开来",
      "englishTranslation": "Eternal Birth"
    },
    "csv2c": {
      "nativeName": "奇迹启程",
      "normalizedNativeName": "奇迹启程",
      "englishTranslation": "Miracle Journey"
    },
    "csv3c": {
      "nativeName": "无畏太晶",
      "normalizedNativeName": "无畏太晶",
      "englishTranslation": "Fearless Terastal"
    },
    "csv4c": {
      "nativeName": "嘉奖回合",
      "normalizedNativeName": "嘉奖回合",
      "englishTranslation": "Prize Turn"
    },
    "csv5c": {
      "nativeName": "黑晶炽诚",
      "normalizedNativeName": "黑晶炽诚",
      "englishTranslation": "Black Crystal Blaze"
    },
    "csv6c": {
      "nativeName": "真实玄虚",
      "normalizedNativeName": "真实玄虚",
      "englishTranslation": "Reality and Illusion"
    },
    "csv7c": {
      "nativeName": "利刃猛醒",
      "normalizedNativeName": "利刃猛醒",
      "englishTranslation": "Awakening Blade"
    },
    "csv8c": {
      "nativeName": "璀璨诡幻",
      "normalizedNativeName": "璀璨诡幻",
      "englishTranslation": "Dazzling Phantasm"
    },
    "csv9.5c": {
      "nativeName": "太晶盛聚",
      "normalizedNativeName": "太晶盛聚",
      "englishTranslation": "Terastal Gathering"
    },
    "csv9c": {
      "nativeName": "星彩晶璃",
      "normalizedNativeName": "星彩晶璃",
      "englishTranslation": "Stellar Crystal Glass"
    },
    "sv10": {
      "nativeName": "火箭隊的榮耀",
      "normalizedNativeName": "火箭隊的榮耀",
      "englishTranslation": "Glory of Team Rocket"
    },
    "sv7": {
      "nativeName": "星晶奇跡",
      "normalizedNativeName": "星晶奇跡",
      "englishTranslation": "Stellar Miracle"
    },
    "sv7a": {
      "nativeName": "樂園騰龍",
      "normalizedNativeName": "樂園騰龍",
      "englishTranslation": "Paradise Dragona"
    },
    "sv8": {
      "nativeName": "超電突圍",
      "normalizedNativeName": "超電突圍",
      "englishTranslation": "Super Electric Breaker"
    },
    "sv8a": {
      "nativeName": "太晶慶典ex",
      "normalizedNativeName": "太晶慶典ex",
      "englishTranslation": "Terastal Festival ex"
    },
    "sv9": {
      "nativeName": "對戰搭檔",
      "normalizedNativeName": "對戰搭檔",
      "englishTranslation": "Battle Partners"
    },
    "sv9a": {
      "nativeName": "熱風競技場",
      "normalizedNativeName": "熱風競技場",
      "englishTranslation": "Heat Wave Arena"
    }
  },
  "zh-tw": {
    "s10a": {
      "nativeName": "黑暗亡靈",
      "normalizedNativeName": "黑暗亡靈",
      "englishTranslation": "Dark Phantasma"
    },
    "s10b": {
      "nativeName": "Pokémon GO",
      "normalizedNativeName": "PokémonGO",
      "englishTranslation": "Pokémon GO"
    },
    "s10d": {
      "nativeName": "時間觀察者",
      "normalizedNativeName": "時間觀察者",
      "englishTranslation": "Time Gazer"
    },
    "s10p": {
      "nativeName": "空間魔術師",
      "normalizedNativeName": "空間魔術師",
      "englishTranslation": "Space Juggler"
    },
    "s11": {
      "nativeName": "三連音爆",
      "normalizedNativeName": "三連音爆",
      "englishTranslation": "Triplet Beat"
    },
    "s11a": {
      "nativeName": "白熱奧祕",
      "normalizedNativeName": "白熱奧祕",
      "englishTranslation": "Incandescent Arcana"
    },
    "s12": {
      "nativeName": "思維激盪",
      "normalizedNativeName": "思維激盪",
      "englishTranslation": "Paradigm Trigger"
    },
    "s12a": {
      "nativeName": "天地萬物VSTAR",
      "normalizedNativeName": "天地萬物VSTAR",
      "englishTranslation": "VSTAR Universe"
    },
    "s5a": {
      "nativeName": "雙璧戰士",
      "normalizedNativeName": "雙璧戰士",
      "englishTranslation": "Twin Warriors"
    },
    "s5i": {
      "nativeName": "一撃大師",
      "normalizedNativeName": "一撃大師",
      "englishTranslation": "Single Strike Master"
    },
    "s5r": {
      "nativeName": "連撃大師",
      "normalizedNativeName": "連撃大師",
      "englishTranslation": "Rapid Strike Master"
    },
    "s6a": {
      "nativeName": "伊布英雄",
      "normalizedNativeName": "伊布英雄",
      "englishTranslation": "Eevee Heroes"
    },
    "s6h": {
      "nativeName": "銀白戰槍",
      "normalizedNativeName": "銀白戰槍",
      "englishTranslation": "Silver Lance"
    },
    "s6k": {
      "nativeName": "漆黑幽魂",
      "normalizedNativeName": "漆黑幽魂",
      "englishTranslation": "Jet-Black Spirit"
    },
    "s7d": {
      "nativeName": "摩天巔峰",
      "normalizedNativeName": "摩天巔峰",
      "englishTranslation": "Skyscraping Perfection"
    },
    "s7r": {
      "nativeName": "蒼空烈流",
      "normalizedNativeName": "蒼空烈流",
      "englishTranslation": "Blue Sky Stream"
    },
    "s8": {
      "nativeName": "匯流藝術",
      "normalizedNativeName": "匯流藝術",
      "englishTranslation": "Fusion Arts"
    },
    "s8a": {
      "nativeName": "25週年收藏款",
      "normalizedNativeName": "25週年收藏款",
      "englishTranslation": "25th Anniversary Collection"
    },
    "s9": {
      "nativeName": "星星誕生",
      "normalizedNativeName": "星星誕生",
      "englishTranslation": "Star Birth"
    },
    "s9a": {
      "nativeName": "對戰地區",
      "normalizedNativeName": "對戰地區",
      "englishTranslation": "Battle Region"
    },
    "sc1a": {
      "nativeName": "劍&盾 SET A",
      "normalizedNativeName": "劍&盾SETA",
      "englishTranslation": "Sword & Shield Set A"
    },
    "sc1b": {
      "nativeName": "劍&盾 SET B",
      "normalizedNativeName": "劍&盾SETB",
      "englishTranslation": "Sword & Shield Set B"
    },
    "sc1d": {
      "nativeName": "劍&盾",
      "normalizedNativeName": "劍&盾",
      "englishTranslation": "Sword & Shield"
    },
    "sc2a": {
      "nativeName": "無極力量 SET A",
      "normalizedNativeName": "無極力量SETA",
      "englishTranslation": "Matchless Fighters Set A"
    },
    "sc2b": {
      "nativeName": "無極力量 SET B",
      "normalizedNativeName": "無極力量SETB",
      "englishTranslation": "Matchless Fighters Set B"
    },
    "sc2d": {
      "nativeName": "無極力量",
      "normalizedNativeName": "無極力量",
      "englishTranslation": "Matchless Fighters"
    },
    "sca": {
      "nativeName": "搭檔",
      "normalizedNativeName": "搭檔",
      "englishTranslation": "Partner"
    },
    "scb": {
      "nativeName": "挑戰",
      "normalizedNativeName": "挑戰",
      "englishTranslation": "Challenge"
    },
    "scd": {
      "nativeName": "強大",
      "normalizedNativeName": "強大",
      "englishTranslation": "Mighty"
    },
    "sdl": {
      "nativeName": "噴火龍",
      "normalizedNativeName": "噴火龍",
      "englishTranslation": "Charizard"
    },
    "sdm": {
      "nativeName": "超夢",
      "normalizedNativeName": "超夢",
      "englishTranslation": "Mewtwo"
    },
    "sdp": {
      "nativeName": "皮卡丘",
      "normalizedNativeName": "皮卡丘",
      "englishTranslation": "Pikachu"
    },
    "sh": {
      "nativeName": "寶可夢卡牌家庭組合",
      "normalizedNativeName": "寶可夢卡牌家庭組合",
      "englishTranslation": "Pokémon Card Game Family Set"
    },
    "si": {
      "nativeName": "初階牌組100",
      "normalizedNativeName": "初階牌組100",
      "englishTranslation": "Start Deck 100"
    },
    "sj": {
      "nativeName": "藏瑪然特VS無極汰那",
      "normalizedNativeName": "藏瑪然特VS無極汰那",
      "englishTranslation": "Zacian vs. Eternatus"
    },
    "sk": {
      "nativeName": "頂級訓練家收藏箱 VSTAR",
      "normalizedNativeName": "頂級訓練家收藏箱VSTAR",
      "englishTranslation": "VSTAR Premium Trainer Box"
    },
    "sld": {
      "nativeName": "起始組合VSTAR 達克萊伊",
      "normalizedNativeName": "起始組合VSTAR達克萊伊",
      "englishTranslation": "Starter Set VSTAR Darkrai"
    },
    "sll": {
      "nativeName": "起始組合VSTAR 路卡利歐",
      "normalizedNativeName": "起始組合VSTAR路卡利歐",
      "englishTranslation": "Starter Set VSTAR Lucario"
    },
    "sn": {
      "nativeName": "初階牌組100 特別版",
      "normalizedNativeName": "初階牌組100特別版",
      "englishTranslation": "Start Deck 100 Special Version"
    },
    "sp5": {
      "nativeName": "強大",
      "normalizedNativeName": "強大",
      "englishTranslation": "Mighty"
    },
    "sp6": {
      "nativeName": "VSTAR特別組合",
      "normalizedNativeName": "VSTAR特別組合",
      "englishTranslation": "VSTAR Special Set"
    },
    "spd": {
      "nativeName": "VSTAR&VMAX 高級牌組 代歐奇希斯",
      "normalizedNativeName": "VSTAR&VMAX高級牌組代歐奇希斯",
      "englishTranslation": "VSTAR & VMAX High-Class Deck Deoxys"
    },
    "spz": {
      "nativeName": "VSTAR&VMAX 高級牌組 捷拉奧拉",
      "normalizedNativeName": "VSTAR&VMAX高級牌組捷拉奧拉",
      "englishTranslation": "VSTAR & VMAX High-Class Deck Zeraora"
    },
    "sv1a": {
      "nativeName": "三連音爆",
      "normalizedNativeName": "三連音爆",
      "englishTranslation": "Triplet Beat"
    },
    "sv1s": {
      "nativeName": "朱ex",
      "normalizedNativeName": "朱ex",
      "englishTranslation": "Scarlet ex"
    },
    "sv1v": {
      "nativeName": "紫ex",
      "normalizedNativeName": "紫ex",
      "englishTranslation": "Violet ex"
    },
    "sv2a": {
      "nativeName": "寶可夢卡牌151",
      "normalizedNativeName": "寶可夢卡牌151",
      "englishTranslation": "Pokémon Card 151"
    },
    "sv2d": {
      "nativeName": "碟旋暴擊",
      "normalizedNativeName": "碟旋暴擊",
      "englishTranslation": "Clay Burst"
    },
    "sv2p": {
      "nativeName": "冰雪險境",
      "normalizedNativeName": "冰雪險境",
      "englishTranslation": "Snow Hazard"
    },
    "sv3": {
      "nativeName": "黯焰支配者",
      "normalizedNativeName": "黯焰支配者",
      "englishTranslation": "Ruler of the Black Flame"
    },
    "sv3a": {
      "nativeName": "激狂駭浪",
      "normalizedNativeName": "激狂駭浪",
      "englishTranslation": "Raging Surf"
    },
    "sv4a": {
      "nativeName": "閃色寶藏ex",
      "normalizedNativeName": "閃色寶藏ex",
      "englishTranslation": "Shiny Treasure ex"
    },
    "sv4k": {
      "nativeName": "古代咆哮",
      "normalizedNativeName": "古代咆哮",
      "englishTranslation": "Ancient Roar"
    },
    "sv4m": {
      "nativeName": "未來閃光",
      "normalizedNativeName": "未來閃光",
      "englishTranslation": "Future Flash"
    },
    "sv5a": {
      "nativeName": "緋紅薄霧",
      "normalizedNativeName": "緋紅薄霧",
      "englishTranslation": "Crimson Haze"
    },
    "sv5m": {
      "nativeName": "異度審判",
      "normalizedNativeName": "異度審判",
      "englishTranslation": "Cyber Judge"
    },
    "sv6": {
      "nativeName": "變幻假面",
      "normalizedNativeName": "變幻假面",
      "englishTranslation": "Mask of Change"
    },
    "sv6a": {
      "nativeName": "黑夜漫遊者",
      "normalizedNativeName": "黑夜漫遊者",
      "englishTranslation": "Night Wanderer"
    },
    "sv7": {
      "nativeName": "星晶奇跡",
      "normalizedNativeName": "星晶奇跡",
      "englishTranslation": "Stellar Miracle"
    },
    "sv7a": {
      "nativeName": "樂園騰龍",
      "normalizedNativeName": "樂園騰龍",
      "englishTranslation": "Paradise Dragona"
    },
    "sv8": {
      "nativeName": "超電突圍",
      "normalizedNativeName": "超電突圍",
      "englishTranslation": "Super Electric Breaker"
    },
    "sv8a": {
      "nativeName": "太晶慶典ex",
      "normalizedNativeName": "太晶慶典ex",
      "englishTranslation": "Terastal Festival ex"
    },
    "sv9": {
      "nativeName": "對戰搭檔",
      "normalizedNativeName": "對戰搭檔",
      "englishTranslation": "Battle Partners"
    },
    "sv9a": {
      "nativeName": "熱風競技場",
      "normalizedNativeName": "熱風競技場",
      "englishTranslation": "Heat Wave Arena"
    },
    "sval": {
      "nativeName": "起始組合ex 呆火鱷&電龍 ex",
      "normalizedNativeName": "起始組合ex呆火鱷&電龍ex",
      "englishTranslation": "Starter Set ex Fuecoco & Ampharos ex"
    },
    "svam": {
      "nativeName": "起始組合ex 新葉喵&路卡利歐 ex",
      "normalizedNativeName": "起始組合ex新葉喵&路卡利歐ex",
      "englishTranslation": "Starter Set ex Sprigatito & Lucario ex"
    },
    "svaw": {
      "nativeName": "起始組合ex 潤水鴨&謎擬Ｑ ex",
      "normalizedNativeName": "起始組合ex潤水鴨&謎擬Qex",
      "englishTranslation": "Starter Set ex Quaxly & Mimikyu ex"
    },
    "svb": {
      "nativeName": "頂級訓練家收藏箱ex",
      "normalizedNativeName": "頂級訓練家收藏箱ex",
      "englishTranslation": "Premium Trainer Box ex"
    },
    "svc": {
      "nativeName": "皮卡丘特別組合",
      "normalizedNativeName": "皮卡丘特別組合",
      "englishTranslation": "Pokémon Card Game Pikachu Special Set"
    },
    "svd": {
      "nativeName": "ex初階牌組",
      "normalizedNativeName": "ex初階牌組",
      "englishTranslation": "ex Start Deck"
    },
    "svel": {
      "nativeName": "骨紋巨聲鱷ex",
      "normalizedNativeName": "骨紋巨聲鱷ex",
      "englishTranslation": "Skeledirge ex"
    },
    "svem": {
      "nativeName": "超夢ex",
      "normalizedNativeName": "超夢ex",
      "englishTranslation": "Mewtwo ex"
    },
    "svf": {
      "nativeName": "黯焰支配者",
      "normalizedNativeName": "黯焰支配者",
      "englishTranslation": "Ruler of the Black Flame"
    },
    "svhk": {
      "nativeName": "未來密勒頓ex",
      "normalizedNativeName": "未來密勒頓ex",
      "englishTranslation": "Future Miraidon ex"
    },
    "svhm": {
      "nativeName": "閃色寶藏ex",
      "normalizedNativeName": "閃色寶藏ex",
      "englishTranslation": "Shiny Treasure ex"
    },
    "svp": {
      "nativeName": "特典卡 朱&紫",
      "normalizedNativeName": "特典卡朱&紫",
      "englishTranslation": "Scarlet & Violet Promo Cards"
    },
    "svp1": {
      "nativeName": "ex特別組合",
      "normalizedNativeName": "ex特別組合",
      "englishTranslation": "ex Special Set"
    }
  }
};
