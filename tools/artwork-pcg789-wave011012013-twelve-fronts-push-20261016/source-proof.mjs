import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "44e54db1-ee82-40e2-9465-c5eb1cc18cdb": {
    "printingId": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
    "alias": "022",
    "rawCanonicalSha256": "7124c60317be413fbfa5e346a05936ed0d86ef223d3ee9f67b349a18d703f0ec",
    "bodyCanonicalSha256": "f69866a459644dc42ced2c04a534bb3f342fe9c15788a042788441ff0e066a44",
    "controlsCanonicalSha256": "c7cbbd9d8a23c0442a2d28c3b48623fd79dafcf843576e66d1a91a5713161baa",
    "inputCanonicalSha256": "a37eccf68310a654ee419a41748dc10ba2dbd79db648e351f31e6d92ab0c6a17",
    "preparedCanonicalSha256": "3c0108b55a33455359e712f6d450f7663009880f4d462555444f0cfc9a613c9c",
    "entryCanonicalSha256": "82aa8e84471fea4c9b1a6ce930c6ee42ae4a574037e7674518a98e5addbac2b3",
    "everyRawPrintedWitness": {
      "printedNativeName": "デオキシス",
      "printedCardClass": "Pokemon",
      "printedHP": 60,
      "printedType": "雷",
      "printedStage": "たね",
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "022/052",
      "printedArtist": "Masakazu Fukuda",
      "setMarkVisible": "Three-circle triangular setmark beside022/052.",
      "visibleFinishCues": "Rainbow reflective perimeter and yellow/silver patterned body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "Printedname onlyデオキシス; no form-name text or form metadata inferred"
      ],
      "attacks": [
        {
          "name": "テレポートブレイク",
          "cost": [
            "雷"
          ],
          "damage": "20",
          "effect": "自分を自分のベンチポケモンと入れ替える。"
        }
      ],
      "abilities": [
        {
          "kind": "ポケパワー",
          "name": "フォルムチェンジ",
          "effect": "このパワーは、自分の番に1回使うことができる。自分の山札から「デオキシス」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどして、その山札を切る。「フォルムチェンジ」は、自分の番の中で1回だけ。"
        }
      ],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedForm": null,
      "printedWeakness": "超",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Fine sampled/printedtexture visible; fullcanvas dimensions not provider optical/card-region certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "57731a3e380728e4e2c39e39251dd6e6259ccf9271d54df58780b888c190e2a2",
    "rawSourceWitnessInsertionSHA": "1546d4f9453a074573f743af0f3950147de8db0b44b98dc85aa94a4f2936bf16",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/deoxys-22",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/jig6bp6a5pgf5gae/1600.jpg",
      "literalOriginalUrlSha256": "5257f46b3e91d8a1bff71066df005bd3192defec97ab5b14c222055fcb412a4e",
      "canonicalPrintingId": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
      "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
      "canonicalSetCode": "PCG7",
      "languageCode": "ja",
      "canonicalAlias": "022",
      "printedCollectorNumber": "022/052",
      "printedSetMarkObservation": "Three-circle triangular setmark beside022/052.",
      "originalFileByteSha256": "84977709728507c6ec359c1f60bb91c367f06ae8b9b875c0d8a3f08462d03e17",
      "originalByteSize": 354991,
      "width": 990,
      "height": 1380,
      "actualPrintedName": "デオキシス",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "011",
      "closedSourceHandoffSha256": "40888f3bc3efbd3a8aaf585175601f6680b5d80941614226f6ae01a0610a03a4",
      "independentActualSourceReviewSha256": "7097a3538764e7983e6e2075330a1a24484c4ba5026dec73aed35b4f6eff29ac",
      "priorFiniteDecisionSha256": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
    "finish": "holo",
    "isDefault": false,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": {
      "currentProofSHA": "28604117ad0d490f95bb75c5766001bd452d5d4fabf5c1f2ab4e953f224ec02c",
      "originalDecisionSHA": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
      "incorrectHistoricalProse": "022 normal/defaultTRUE",
      "correctFrozenRowAndActualCurrentTuple": "022 holo/defaultFALSE; sole actual API default remains its only holo variant",
      "sourceArtifactBytesAndMetadataUnchanged": true
    },
    "rowCanonicalSha256": "a6ecebc94eafe080c294baac6027e7760c8cdf1865019e4618e87b2d2b451a1f",
    "rootDecisionRowCanonicalSha256": "aec2fa54b89d0ce44c7887892e9d22a851a79046277ab136a841e9ff8ae53ce6",
    "actualCanonicalSha256": "57731a3e380728e4e2c39e39251dd6e6259ccf9271d54df58780b888c190e2a2",
    "witnessSerialized": "{\"printedNativeName\":\"デオキシス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":60,\"printedType\":\"雷\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"022/052\",\"printedArtist\":\"Masakazu Fukuda\",\"setMarkVisible\":\"Three-circle triangular setmark beside022/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and yellow/silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"Printedname onlyデオキシス; no form-name text or form metadata inferred\"],\"attacks\":[{\"name\":\"テレポートブレイク\",\"cost\":[\"雷\"],\"damage\":\"20\",\"effect\":\"自分を自分のベンチポケモンと入れ替える。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"フォルムチェンジ\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札から「デオキシス」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどして、その山札を切る。「フォルムチェンジ」は、自分の番の中で1回だけ。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedForm\":null,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Fine sampled/printedtexture visible; fullcanvas dimensions not provider optical/card-region certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"デオキシス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":60,\"printedType\":\"雷\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"022/052\",\"printedArtist\":\"Masakazu Fukuda\",\"setMarkVisible\":\"Three-circle triangular setmark beside022/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and yellow/silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"Printedname onlyデオキシス; no form-name text or form metadata inferred\"],\"attacks\":[{\"name\":\"テレポートブレイク\",\"cost\":[\"雷\"],\"damage\":\"20\",\"effect\":\"自分を自分のベンチポケモンと入れ替える。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"フォルムチェンジ\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札から「デオキシス」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどして、その山札を切る。「フォルムチェンジ」は、自分の番の中で1回だけ。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedForm\":null,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Fine sampled/printedtexture visible; fullcanvas dimensions not provider optical/card-region certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "collector_number": "022",
        "card_native_name": "deoxys（デルタ種）",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "collector_number": "022",
        "card_native_name": "deoxys（デルタ種）",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:5257f46b3e91d8a1bff71066df005bd3192defec97ab5b14c222055fcb412a4e",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/deoxys-22",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/jig6bp6a5pgf5gae/1600.jpg",
    "productId": "3439683",
    "setCode": "PCG7",
    "currentLabel": "deoxys（デルタ種）",
    "currentEnglish": null,
    "printedName": "デオキシス",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "5e702890890f9b3e31e9950ee0010944c086660782da794ab647f468d0ab6f11",
    "actualClass": "Pokemon",
    "hp": 60,
    "type": "雷",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "022/052",
    "artist": "Masakazu Fukuda",
    "variantId": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "84977709728507c6ec359c1f60bb91c367f06ae8b9b875c0d8a3f08462d03e17",
      "bytes": 354991,
      "width": 990,
      "height": 1380,
      "rgbaSha256": "77ce77d7939d4e10b00d9f34f32eb23bc20d02acf821f62f4300707b276fcf3a"
    },
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "48edaa8d-8750-4aeb-a246-73ce4ef1218f": {
    "printingId": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
    "alias": "033",
    "rawCanonicalSha256": "b471757cd68311e76599f356ab6fd5be2a8dc3c2e642c16f7c59e441f972046a",
    "bodyCanonicalSha256": "cda312599357f467180d0441ebb11b0e05706364a1c2c3abc52f96f7e47865cb",
    "controlsCanonicalSha256": "e94e4c530894ec6d4da3d11f0b6c25ac534e53662cc22cdac2854ad2dc4b40d0",
    "inputCanonicalSha256": "d5e210aa91876f4eb06bb9b02a87737bb9adbee930b3076bc13bc87306ef43c7",
    "preparedCanonicalSha256": "e5a20ed61781594c32def4fe652f07cc0f13d2832c6edfe87e20308f2ea2d4b2",
    "entryCanonicalSha256": "26b55db1a9baa69a5cf1312176317898cff49eeb1dc5cff82347c3d3cff149bf",
    "everyRawPrintedWitness": {
      "printedNativeName": "アーマルド",
      "printedCardClass": "Pokemon",
      "printedHP": 110,
      "printedType": "闘・鋼",
      "printedStage": "2進化",
      "printedEvolutionFrom": "アノプス",
      "printedEvolutionPlacement": "アノプスから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "033/052",
      "printedArtist": "Masakazu Fukuda",
      "setMarkVisible": "Three-circle triangular setmark beside033/052.",
      "visibleFinishCues": "Rainbow reflective perimeter and silver patterned body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "このポケモンは［闘］［鋼］の2つのタイプを持つポケモンです。"
      ],
      "attacks": [
        {
          "name": "デルタブレード",
          "cost": [
            "鋼",
            "無色"
          ],
          "damage": "70",
          "effect": "自分の場に「サポーター」があるなら、このワザのダメージは「20」になる。"
        },
        {
          "name": "かせきくだき",
          "cost": [
            "闘",
            "無色",
            "無色"
          ],
          "damage": "50",
          "effect": "のぞむなら、自分の手札から、「ツメの化石」「なにかの化石」「ねっこの化石」「ホロンの化石」のうち、1枚を選び出し、トラッシュしてよい。その場合、相手のベンチポケモン1匹にも、30ダメージ。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "草",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色",
        "無色",
        "無色"
      ],
      "qualityAdvisories": [
        "Fine printed/sampled texture; canvas not certified native optical/card-region resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "9c1035603e234ef7e8e9b2236ef317d193916ca63a451f2372caa070bc6ce6a0",
    "rawSourceWitnessInsertionSHA": "c2af12282a36fb3a79607766200a9d91779a7904611364d2850b822c46dd9e4b",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/armaldo-33",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/013db1f56c66d78ca2e21d2e15c9629580b6c523ebba71b093395c7b61c7743b/1600.jpg",
      "literalOriginalUrlSha256": "f6b5659fee795eaa81b1a6e9e3ceda4c86a09db54c73d0c8a9249e1184725db3",
      "canonicalPrintingId": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
      "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
      "canonicalSetCode": "PCG7",
      "languageCode": "ja",
      "canonicalAlias": "033",
      "printedCollectorNumber": "033/052",
      "printedSetMarkObservation": "Three-circle triangular setmark beside033/052.",
      "originalFileByteSha256": "8a56ec47105a19324ca523ceb1f513fbaf2d60636cb617254faad43a16167efd",
      "originalByteSize": 581356,
      "width": 1018,
      "height": 1412,
      "actualPrintedName": "アーマルド",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "011",
      "closedSourceHandoffSha256": "40888f3bc3efbd3a8aaf585175601f6680b5d80941614226f6ae01a0610a03a4",
      "independentActualSourceReviewSha256": "7097a3538764e7983e6e2075330a1a24484c4ba5026dec73aed35b4f6eff29ac",
      "priorFiniteDecisionSha256": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "c33e36aa-e537-49b8-b508-63064b097899",
    "finish": "holo",
    "isDefault": false,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "d19e50622a1f3172b2e7c5311b5f3f03fe61916d6284f5a30a3bfac829c7e3c7",
    "rootDecisionRowCanonicalSha256": "18345f8f6e7494b9b76edef65f216c7322a294d38d331a6b3ab508b6031539fc",
    "actualCanonicalSha256": "9c1035603e234ef7e8e9b2236ef317d193916ca63a451f2372caa070bc6ce6a0",
    "witnessSerialized": "{\"printedNativeName\":\"アーマルド\",\"printedCardClass\":\"Pokemon\",\"printedHP\":110,\"printedType\":\"闘・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"アノプス\",\"printedEvolutionPlacement\":\"アノプスから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"033/052\",\"printedArtist\":\"Masakazu Fukuda\",\"setMarkVisible\":\"Three-circle triangular setmark beside033/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［闘］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"デルタブレード\",\"cost\":[\"鋼\",\"無色\"],\"damage\":\"70\",\"effect\":\"自分の場に「サポーター」があるなら、このワザのダメージは「20」になる。\"},{\"name\":\"かせきくだき\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"のぞむなら、自分の手札から、「ツメの化石」「なにかの化石」「ねっこの化石」「ホロンの化石」のうち、1枚を選び出し、トラッシュしてよい。その場合、相手のベンチポケモン1匹にも、30ダメージ。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"草\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\",\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampled texture; canvas not certified native optical/card-region resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"アーマルド\",\"printedCardClass\":\"Pokemon\",\"printedHP\":110,\"printedType\":\"闘・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"アノプス\",\"printedEvolutionPlacement\":\"アノプスから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"033/052\",\"printedArtist\":\"Masakazu Fukuda\",\"setMarkVisible\":\"Three-circle triangular setmark beside033/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［闘］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"デルタブレード\",\"cost\":[\"鋼\",\"無色\"],\"damage\":\"70\",\"effect\":\"自分の場に「サポーター」があるなら、このワザのダメージは「20」になる。\"},{\"name\":\"かせきくだき\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"のぞむなら、自分の手札から、「ツメの化石」「なにかの化石」「ねっこの化石」「ホロンの化石」のうち、1枚を選び出し、トラッシュしてよい。その場合、相手のベンチポケモン1匹にも、30ダメージ。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"草\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\",\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampled texture; canvas not certified native optical/card-region resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "collector_number": "033",
        "card_native_name": "アルマルド（デルタ種）",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "collector_number": "033",
        "card_native_name": "アルマルド（デルタ種）",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:f6b5659fee795eaa81b1a6e9e3ceda4c86a09db54c73d0c8a9249e1184725db3",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/armaldo-33",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/013db1f56c66d78ca2e21d2e15c9629580b6c523ebba71b093395c7b61c7743b/1600.jpg",
    "productId": "3439694",
    "setCode": "PCG7",
    "currentLabel": "アルマルド（デルタ種）",
    "currentEnglish": null,
    "printedName": "アーマルド",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "5e702890890f9b3e31e9950ee0010944c086660782da794ab647f468d0ab6f11",
    "actualClass": "Pokemon",
    "hp": 110,
    "type": "闘・鋼",
    "stage": "2進化",
    "evolvesFrom": "アノプス",
    "collector": "033/052",
    "artist": "Masakazu Fukuda",
    "variantId": "c33e36aa-e537-49b8-b508-63064b097899",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "original",
    "original": {
      "sha256": "8a56ec47105a19324ca523ceb1f513fbaf2d60636cb617254faad43a16167efd",
      "bytes": 581356,
      "width": 1018,
      "height": 1412,
      "rgbaSha256": "11953dfd5d3e03eb5eab9f743d28260a7d679400a2ac66167abf85bef589e238"
    },
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "d9d4cb1b-0b22-4753-98f2-181298f22a07": {
    "printingId": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
    "alias": "040",
    "rawCanonicalSha256": "a261281a7b721b3de7ffeb2511a1efa7b7b9994d4cf406c53b4da94b2f76e37c",
    "bodyCanonicalSha256": "5eeb8e8499cf1fe89d2b16ac8fadb6cdd558374c576f23b19c0a5d6d33fef0c8",
    "controlsCanonicalSha256": "035963d4531ec7609e43968ea8d57d35093e0cbf6c008a802f8376064b21a205",
    "inputCanonicalSha256": "3f9ebf7320c34f76a2871059540f64c7e259d6a973916a10a179b88b8eb633d2",
    "preparedCanonicalSha256": "5c44ecddc548f3a29267c610678886c68201dc2d4293ada7260fa0337771e389",
    "entryCanonicalSha256": "a943f5ffa6517190ca2c692aedf043d5c38c9ccd0cbac97679afe7089838e87e",
    "everyRawPrintedWitness": {
      "printedNativeName": "ユレイドル",
      "printedCardClass": "Pokemon",
      "printedHP": 100,
      "printedType": "悪・鋼",
      "printedStage": "2進化",
      "printedEvolutionFrom": "リリーラ",
      "printedEvolutionPlacement": "リリーラから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "040/052",
      "printedArtist": "Kouki Saitou",
      "setMarkVisible": "Three-circle triangular setmark beside040/052.",
      "visibleFinishCues": "Rainbow reflective perimeter and silver patterned body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。"
      ],
      "attacks": [
        {
          "name": "しょうかえき",
          "cost": [
            "悪",
            "無色"
          ],
          "damage": "20",
          "effect": "次の相手の番の終わりに、このワザを受けた相手にダメージカウンターを5個のせる。"
        },
        {
          "name": "どくのしょくしゅ",
          "cost": [
            "鋼",
            "無色",
            "無色"
          ],
          "damage": "50",
          "effect": "相手をどくにする。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "炎",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色",
        "無色"
      ],
      "qualityAdvisories": [
        "Fine printed/sampledtexture and bright silverfooter; full actual text readable, canvas not native optical/card-region certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "5076f9dc1a07e69d50ae3de8947cfde084c7eddf9d71b782100a12bc1de6c6ad",
    "rawSourceWitnessInsertionSHA": "2734b55974567877e55fdce6c1c9b47973fe7da19ac540a04a8dd3a53af8e77e",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/cradily-40",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/4h77fixnqi6sjgzl/1600.jpg",
      "literalOriginalUrlSha256": "e2e3ef3ac2ca2aef50c209895a2b80ceaf4a400d3bf39831981c7b5687263a9b",
      "canonicalPrintingId": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
      "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
      "canonicalSetCode": "PCG7",
      "languageCode": "ja",
      "canonicalAlias": "040",
      "printedCollectorNumber": "040/052",
      "printedSetMarkObservation": "Three-circle triangular setmark beside040/052.",
      "originalFileByteSha256": "059c3984b262f75eb86bb206bcee0d0290150c32bfd20c985f3b783bbe48c74f",
      "originalByteSize": 444341,
      "width": 1035,
      "height": 1449,
      "actualPrintedName": "ユレイドル",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "011",
      "closedSourceHandoffSha256": "40888f3bc3efbd3a8aaf585175601f6680b5d80941614226f6ae01a0610a03a4",
      "independentActualSourceReviewSha256": "7097a3538764e7983e6e2075330a1a24484c4ba5026dec73aed35b4f6eff29ac",
      "priorFiniteDecisionSha256": "2ca1aa85477d1303871f9efeafe5434f7cda1d0a2ea932d56c3ff8df98d4f464",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
    "finish": "holo",
    "isDefault": false,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "62fec27f061d199bd6a48df09b274847de6735f7a0aba12aaa3a6c18f048fb47",
    "rootDecisionRowCanonicalSha256": "4e0ec023d91cd9c95c91cc13bcddb7a34748762584ade2032da46b452267ca9f",
    "actualCanonicalSha256": "5076f9dc1a07e69d50ae3de8947cfde084c7eddf9d71b782100a12bc1de6c6ad",
    "witnessSerialized": "{\"printedNativeName\":\"ユレイドル\",\"printedCardClass\":\"Pokemon\",\"printedHP\":100,\"printedType\":\"悪・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"リリーラ\",\"printedEvolutionPlacement\":\"リリーラから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"040/052\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Three-circle triangular setmark beside040/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"しょうかえき\",\"cost\":[\"悪\",\"無色\"],\"damage\":\"20\",\"effect\":\"次の相手の番の終わりに、このワザを受けた相手にダメージカウンターを5個のせる。\"},{\"name\":\"どくのしょくしゅ\",\"cost\":[\"鋼\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"相手をどくにする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampledtexture and bright silverfooter; full actual text readable, canvas not native optical/card-region certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ユレイドル\",\"printedCardClass\":\"Pokemon\",\"printedHP\":100,\"printedType\":\"悪・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"リリーラ\",\"printedEvolutionPlacement\":\"リリーラから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"040/052\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Three-circle triangular setmark beside040/052.\",\"visibleFinishCues\":\"Rainbow reflective perimeter and silver patterned body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"しょうかえき\",\"cost\":[\"悪\",\"無色\"],\"damage\":\"20\",\"effect\":\"次の相手の番の終わりに、このワザを受けた相手にダメージカウンターを5個のせる。\"},{\"name\":\"どくのしょくしゅ\",\"cost\":[\"鋼\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"相手をどくにする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampledtexture and bright silverfooter; full actual text readable, canvas not native optical/card-region certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "collector_number": "040",
        "card_native_name": "ゆっくり（デルタ種）",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "collector_number": "040",
        "card_native_name": "ゆっくり（デルタ種）",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:e2e3ef3ac2ca2aef50c209895a2b80ceaf4a400d3bf39831981c7b5687263a9b",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/cradily-40",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/4h77fixnqi6sjgzl/1600.jpg",
    "productId": "3439701",
    "setCode": "PCG7",
    "currentLabel": "ゆっくり（デルタ種）",
    "currentEnglish": null,
    "printedName": "ユレイドル",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "5e702890890f9b3e31e9950ee0010944c086660782da794ab647f468d0ab6f11",
    "actualClass": "Pokemon",
    "hp": 100,
    "type": "悪・鋼",
    "stage": "2進化",
    "evolvesFrom": "リリーラ",
    "collector": "040/052",
    "artist": "Kouki Saitou",
    "variantId": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "059c3984b262f75eb86bb206bcee0d0290150c32bfd20c985f3b783bbe48c74f",
      "bytes": 444341,
      "width": 1035,
      "height": 1449,
      "rgbaSha256": "3c693078dc40542b5d280ec1ba87dc3a427d9c6f15fe1ccbd4be67554b7c6455"
    },
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "38e67ba5-019b-405a-9800-6995a3d62393": {
    "printingId": "38e67ba5-019b-405a-9800-6995a3d62393",
    "alias": "048",
    "rawCanonicalSha256": "2ee2aa07e1967c9777b203ca1d34a9db4e95c4867470defd67eacefc4b8f0450",
    "bodyCanonicalSha256": "e9fac4c2360fdc4e83fc39e975f1faf32d18b780f27584667c383ea9a7c925c4",
    "controlsCanonicalSha256": "dd08531abfe190bc8957ec3c3e2ae41f52e96db43a87183cbd8759f85ab93b62",
    "inputCanonicalSha256": "f66df5da683b7bd3c9cfd51080275bb0378daf9a35ea5985511d978dbbaa20bb",
    "preparedCanonicalSha256": "64e6642ade9f557b9dfd93afc744911505364f1d749b0c9b310b8e65940b5895",
    "entryCanonicalSha256": "402d9bdf5727eaec8b6480c4c4890fc9f64a4156c28c7553cbd67dbe5e9e7b71",
    "everyRawPrintedWitness": {
      "printedNativeName": "ふしぎなアメ",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "048/052",
      "printedArtist": "Ryo Ueda",
      "setMarkVisible": "Three-circle triangular setmark beside048/052.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の「たねポケモン」を1匹選び、そのポケモンから進化する「1進化カード」またはその上の「2進化カード」を、自分の手札から1枚選び出す。その後、そのカードを、選んだ「たねポケモン」の上にのせ、進化させる。",
      "printedSpecialIdentityMarkers": [],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide complete original below genericHD canvas advisory; no enlargement/card-region or native optical certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "0cf0892529350e656d8a495a2210dd8e99035d841735acb37bdcc4b9d48bd260",
    "rawSourceWitnessInsertionSHA": "47319baa161846b98a564e5454609204cd705679994119959e7e57e903da187d",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/rare-candy-48",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/3dxsoiqijpj5xmcb/1600.jpg",
      "literalOriginalUrlSha256": "a0135570ba574a73d1176a5599b98df66d787dbf91bd22f4051fd2532bc46a9c",
      "canonicalPrintingId": "38e67ba5-019b-405a-9800-6995a3d62393",
      "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
      "canonicalSetCode": "PCG7",
      "languageCode": "ja",
      "canonicalAlias": "048",
      "printedCollectorNumber": "048/052",
      "printedSetMarkObservation": "Three-circle triangular setmark beside048/052.",
      "originalFileByteSha256": "8b76f7406270e84df93ee27dc2ed0cda7e413f3409db33633d301a1c116e5f5c",
      "originalByteSize": 54130,
      "width": 500,
      "height": 702,
      "actualPrintedName": "ふしぎなアメ",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "1b73d0d4-dba6-4acf-a068-f1334471af86",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "83578e3197015301be82c63f4651869dc298337c3f6a742c8f2c94ca3409a98c",
    "rootDecisionRowCanonicalSha256": "3a8203ca2f829a4705418118daeabceedc2b8575c7ca94969b670b88ecfaa269",
    "actualCanonicalSha256": "0cf0892529350e656d8a495a2210dd8e99035d841735acb37bdcc4b9d48bd260",
    "witnessSerialized": "{\"printedNativeName\":\"ふしぎなアメ\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/052\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Three-circle triangular setmark beside048/052.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の「たねポケモン」を1匹選び、そのポケモンから進化する「1進化カード」またはその上の「2進化カード」を、自分の手札から1枚選び出す。その後、そのカードを、選んだ「たねポケモン」の上にのせ、進化させる。\",\"printedSpecialIdentityMarkers\":[],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete original below genericHD canvas advisory; no enlargement/card-region or native optical certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ふしぎなアメ\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/052\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Three-circle triangular setmark beside048/052.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の「たねポケモン」を1匹選び、そのポケモンから進化する「1進化カード」またはその上の「2進化カード」を、自分の手札から1枚選び出す。その後、そのカードを、選んだ「たねポケモン」の上にのせ、進化させる。\",\"printedSpecialIdentityMarkers\":[],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete original below genericHD canvas advisory; no enlargement/card-region or native optical certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "collector_number": "048",
        "card_native_name": "珍しいキャンディー",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "collector_number": "048",
        "card_native_name": "珍しいキャンディー",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:a0135570ba574a73d1176a5599b98df66d787dbf91bd22f4051fd2532bc46a9c",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/rare-candy-48",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/3dxsoiqijpj5xmcb/1600.jpg",
    "productId": "3439709",
    "setCode": "PCG7",
    "currentLabel": "珍しいキャンディー",
    "currentEnglish": null,
    "printedName": "ふしぎなアメ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "048/052",
    "artist": "Ryo Ueda",
    "variantId": "1b73d0d4-dba6-4acf-a068-f1334471af86",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "8b76f7406270e84df93ee27dc2ed0cda7e413f3409db33633d301a1c116e5f5c",
      "bytes": 54130,
      "width": 500,
      "height": 702,
      "rgbaSha256": "59e191a2b9e4e9916eb08372fd35f922200828b08771c93ab3e4a41274d28821"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の「たねポケモン」を1匹選び、そのポケモンから進化する「1進化カード」またはその上の「2進化カード」を、自分の手札から1枚選び出す。その後、そのカードを、選んだ「たねポケモン」の上にのせ、進化させる。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "826abe37-5568-4559-b3e2-da9cc4e29658": {
    "printingId": "826abe37-5568-4559-b3e2-da9cc4e29658",
    "alias": "050",
    "rawCanonicalSha256": "7725b64784351d80c57b4ed8cea689c5cba60431acc449fc24a6e40fb59d776e",
    "bodyCanonicalSha256": "1a1f9356de8422953c8ee1e9644ace786b6ae5b168b680356156ef13b5ab4a4e",
    "controlsCanonicalSha256": "c51266b9ede601626e7836ff1b0a092313f2222828c0f26b005311aee5a72a76",
    "inputCanonicalSha256": "e1cff1b7c24f7483aa6adfbe569437064462d83acb9c1a4440a3b1fce19063b1",
    "preparedCanonicalSha256": "172a8318f713142984e34b38890d764e6280e89079e87a1ee54b7d0b9780559f",
    "entryCanonicalSha256": "a3f53c8fc07114dedd9ee5ff2ffdb322fc230fa2176d3aa5c68721ed9796b766",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンの冒険家",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "050/052",
      "printedArtist": "Kouki Saitou",
      "setMarkVisible": "Three-circle triangular setmark beside050/052.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分の山札からカードを3枚引く。\n\nトラッシュしたカードが「δ-デルタ種」のポケモンなら、さらに1枚引く。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual サポーター header",
        "Actual ホロン name and「δ-デルタ種」 rules qualifier"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide complete sourcecanvas below genericHD signal; no enlargement or native optical/card-region certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "00847c63005522834f96e7b43b9c8ef4e461fb3fe0a82bc4d8d734b4c10dfb2d",
    "rawSourceWitnessInsertionSHA": "1ce0b59763a6bddb9a6355b54935e198edf10e86534e97aa67c398694ab5b31b",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/holon-adventurer-50",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/qyth7vwanaf5v7eu/1600.jpg",
      "literalOriginalUrlSha256": "5b35193af80819e03ec17e690f20484b6914b6b264779beed53766ed199a7f1a",
      "canonicalPrintingId": "826abe37-5568-4559-b3e2-da9cc4e29658",
      "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
      "canonicalSetCode": "PCG7",
      "languageCode": "ja",
      "canonicalAlias": "050",
      "printedCollectorNumber": "050/052",
      "printedSetMarkObservation": "Three-circle triangular setmark beside050/052.",
      "originalFileByteSha256": "2c4fa56b5fb9559e380421b37fafe3ed9a176ae6f34dfc4c01b378e04f43de18",
      "originalByteSize": 76052,
      "width": 500,
      "height": 700,
      "actualPrintedName": "ホロンの冒険家",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "ef7ddfa9129df865c2517f6caa34ce920726f45a157723e90ef9775f2987b7e0",
    "rootDecisionRowCanonicalSha256": "0aa58853f6c78981e6b3164d74a4e75ae0819bcc53b5428d7044d329ccc61e07",
    "actualCanonicalSha256": "00847c63005522834f96e7b43b9c8ef4e461fb3fe0a82bc4d8d734b4c10dfb2d",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンの冒険家\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"050/052\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Three-circle triangular setmark beside050/052.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分の山札からカードを3枚引く。\\n\\nトラッシュしたカードが「δ-デルタ種」のポケモンなら、さらに1枚引く。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\",\"Actual ホロン name and「δ-デルタ種」 rules qualifier\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete sourcecanvas below genericHD signal; no enlargement or native optical/card-region certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンの冒険家\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"050/052\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Three-circle triangular setmark beside050/052.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分の山札からカードを3枚引く。\\n\\nトラッシュしたカードが「δ-デルタ種」のポケモンなら、さらに1枚引く。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\",\"Actual ホロン name and「δ-デルタ種」 rules qualifier\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete sourcecanvas below genericHD signal; no enlargement or native optical/card-region certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "collector_number": "050",
        "card_native_name": "ホロンアドベンチャー",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "set_code": "PCG7",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "collector_number": "050",
        "card_native_name": "ホロンアドベンチャー",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:5b35193af80819e03ec17e690f20484b6914b6b264779beed53766ed199a7f1a",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-phantom/holon-adventurer-50",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/qyth7vwanaf5v7eu/1600.jpg",
    "productId": "3439711",
    "setCode": "PCG7",
    "currentLabel": "ホロンアドベンチャー",
    "currentEnglish": null,
    "printedName": "ホロンの冒険家",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "050/052",
    "artist": "Kouki Saitou",
    "variantId": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "2c4fa56b5fb9559e380421b37fafe3ed9a176ae6f34dfc4c01b378e04f43de18",
      "bytes": 76052,
      "width": 500,
      "height": 700,
      "rgbaSha256": "55db7fb94ed5fd5aab11fb205ae48f6fa273c32ed00f904fe9a1d3280dd16ca4"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分の山札からカードを3枚引く。\n\nトラッシュしたカードが「δ-デルタ種」のポケモンなら、さらに1枚引く。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "40c40f95-7df1-4153-9030-1871ccaf77cf": {
    "printingId": "40c40f95-7df1-4153-9030-1871ccaf77cf",
    "alias": "047",
    "rawCanonicalSha256": "48e6511f424757609ec316845702976bdb7c8b81446e56a361b2223fabd5bf2a",
    "bodyCanonicalSha256": "60e10d174d3e4d65abf65dce0b1222021e73a39c3729676fd624ab1a1644711f",
    "controlsCanonicalSha256": "504b751f12c514ef685980cb9dd225c37b6cd3ae39eff1dc964311763f1040c4",
    "inputCanonicalSha256": "f6bd352eb0711e980087be2d0e3ae3ee4ceba75c8042992c5dc47d602ccc4788",
    "preparedCanonicalSha256": "a500bfe27b48b606232b75ebdb3777bbf70fb6f13aba939d1e786c2644a16ee3",
    "entryCanonicalSha256": "d93ae5c478da87744133fc2376031d745ec70c4944d1f11e5537a7bd4a553e9e",
    "everyRawPrintedWitness": {
      "printedNativeName": "チャーレム",
      "printedCardClass": "Pokemon",
      "printedHP": 80,
      "printedType": "闘",
      "printedStage": "1進化",
      "printedEvolutionFrom": "アサナン",
      "printedEvolutionPlacement": "アサナンから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "047/075",
      "printedArtist": "Midori Harada",
      "setMarkVisible": "Angular pointed setmark beside047/075.",
      "visibleFinishCues": "Orange normal-looking body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [],
      "attacks": [
        {
          "name": "ねんりき",
          "cost": [
            "無色",
            "無色"
          ],
          "damage": "20",
          "effect": "コインを1回投げオモテなら、相手をマヒにする。"
        },
        {
          "name": "スカイアッパー",
          "cost": [
            "闘",
            "無色",
            "無色"
          ],
          "damage": "50",
          "effect": "このワザは、相手の抵抗力に関係なく、ダメージを与える。"
        }
      ],
      "abilities": [
        {
          "kind": "ポケボディー",
          "name": "デュアルアーマー",
          "effect": "このポケモンに［超］エネルギーがついているなら、このポケモンのタイプは、［超］［闘］の2つになる。"
        }
      ],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "超",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Native500-wide complete original below genericHD signal; no enlargement/native optical or card-region certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "ade639683e72c0be531182fac1296b642ee3bf39af8ae868e4c72ab1357a25fc",
    "rawSourceWitnessInsertionSHA": "56163e02439ff0f880c90c3a9e8ba7d7983d488c94afb4c242ba13757dbe35f7",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/medicham-47",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/ikrh2cvxajwxganu/1600.jpg",
      "literalOriginalUrlSha256": "606d667cd88c734886daaea0b25fe02f88abdb6a267058918f4dee0e90bee833",
      "canonicalPrintingId": "40c40f95-7df1-4153-9030-1871ccaf77cf",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "047",
      "printedCollectorNumber": "047/075",
      "printedSetMarkObservation": "Angular pointed setmark beside047/075.",
      "originalFileByteSha256": "887470b1479016f08c4bc4e9d817f1f9aba9b8c7849c6ffd6715b0b7683fbeb5",
      "originalByteSize": 81922,
      "width": 500,
      "height": 702,
      "actualPrintedName": "チャーレム",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "5f6845382603d365b9021e2b2a7a8ec2beb3feda4f81f79e21694609693faca7",
    "rootDecisionRowCanonicalSha256": "9552c70431e8edb4844d742ebdb25b92c301ebd5cea6937b173f782f3a3c0c21",
    "actualCanonicalSha256": "ade639683e72c0be531182fac1296b642ee3bf39af8ae868e4c72ab1357a25fc",
    "witnessSerialized": "{\"printedNativeName\":\"チャーレム\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"闘\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"アサナン\",\"printedEvolutionPlacement\":\"アサナンから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"047/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside047/075.\",\"visibleFinishCues\":\"Orange normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"ねんりき\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":\"コインを1回投げオモテなら、相手をマヒにする。\"},{\"name\":\"スカイアッパー\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"このワザは、相手の抵抗力に関係なく、ダメージを与える。\"}],\"abilities\":[{\"kind\":\"ポケボディー\",\"name\":\"デュアルアーマー\",\"effect\":\"このポケモンに［超］エネルギーがついているなら、このポケモンのタイプは、［超］［闘］の2つになる。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Native500-wide complete original below genericHD signal; no enlargement/native optical or card-region certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"チャーレム\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"闘\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"アサナン\",\"printedEvolutionPlacement\":\"アサナンから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"047/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside047/075.\",\"visibleFinishCues\":\"Orange normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"ねんりき\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":\"コインを1回投げオモテなら、相手をマヒにする。\"},{\"name\":\"スカイアッパー\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":\"このワザは、相手の抵抗力に関係なく、ダメージを与える。\"}],\"abilities\":[{\"kind\":\"ポケボディー\",\"name\":\"デュアルアーマー\",\"effect\":\"このポケモンに［超］エネルギーがついているなら、このポケモンのタイプは、［超］［闘］の2つになる。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Native500-wide complete original below genericHD signal; no enlargement/native optical or card-region certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "collector_number": "047",
        "card_native_name": "メディチャム",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "collector_number": "047",
        "card_native_name": "メディチャム",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:606d667cd88c734886daaea0b25fe02f88abdb6a267058918f4dee0e90bee833",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/medicham-47",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ikrh2cvxajwxganu/1600.jpg",
    "productId": "3439760",
    "setCode": "PCG8",
    "currentLabel": "メディチャム",
    "currentEnglish": null,
    "printedName": "チャーレム",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Pokemon",
    "hp": 80,
    "type": "闘",
    "stage": "1進化",
    "evolvesFrom": "アサナン",
    "collector": "047/075",
    "artist": "Midori Harada",
    "variantId": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "887470b1479016f08c4bc4e9d817f1f9aba9b8c7849c6ffd6715b0b7683fbeb5",
      "bytes": 81922,
      "width": 500,
      "height": 702,
      "rgbaSha256": "7f7ba7ff7efdc92ce9f57918efd4d93def1689531707d4f4d47f23355d921507"
    },
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "16b33fb8-f25f-46d0-9cdc-3d58c9973093": {
    "printingId": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
    "alias": "048",
    "rawCanonicalSha256": "56a4e8b2f3353af483a9e77a7a064862302fca495c1361071841293deab1f1c6",
    "bodyCanonicalSha256": "906b2a651ee3a9d5f8a96a45634b8b8e4eece3bdbd0e969cc55215e63c6585e8",
    "controlsCanonicalSha256": "b0dcc64377218bf56e19d1588b58c3468b7d6c9c29d393fd67f229dc244ba8fe",
    "inputCanonicalSha256": "552e195273f8358010975b55209400cdc9b4f8c7b6033c643baa551b6babec7d",
    "preparedCanonicalSha256": "57d4f268ff399d6885a62babaac246c46378508f8eff537a8dbcd987ec87f205",
    "entryCanonicalSha256": "73a4a4af567fdf9ac44db6902fd704200a4e7215d72f143bd94e30acbc1512b7",
    "everyRawPrintedWitness": {
      "printedNativeName": "ノクタス",
      "printedCardClass": "Pokemon",
      "printedHP": 80,
      "printedType": "闘",
      "printedStage": "1進化",
      "printedEvolutionFrom": "サボネア",
      "printedEvolutionPlacement": "サボネアから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "048/075",
      "printedArtist": "Kouki Saitou",
      "setMarkVisible": "Angular pointed setmark beside048/075.",
      "visibleFinishCues": "Orange normal-looking body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header"
      ],
      "attacks": [
        {
          "name": "トリプルニードル",
          "cost": [
            "闘"
          ],
          "damage": null,
          "effect": "相手のポケモン3匹に、それぞれ10ダメージ。"
        },
        {
          "name": "なぐる",
          "cost": [
            "闘",
            "無色",
            "無色"
          ],
          "damage": "50",
          "effect": null
        }
      ],
      "abilities": [
        {
          "kind": "ポケパワー",
          "name": "トゲのあらし",
          "effect": "このパワーは、このポケモンがバトル場にいるなら、自分の番に1回使うことができる。ダメージカウンターがのっている相手のポケモン1匹に、ダメージカウンターを1個のせる。このポケモンが特殊状態なら、このパワーを使うことはできない。"
        }
      ],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "炎",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Native500-wide complete sourcecanvas below genericHD advisory; no enlargement or optical/card-region certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "557a43ff0b51d115eb0c93d55350e345c6ea468125992315562c91fcaaa1849f",
    "rawSourceWitnessInsertionSHA": "612a3da5f9689aa381a566fb7327ca095959043b04d5df85c3d5701b3542db09",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/cacturne-48",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/pe7abj52kraritlh/1600.jpg",
      "literalOriginalUrlSha256": "0bba36bb98f3150a4e45f05877738e9820f354fd5eac14669e37f459a6e54be9",
      "canonicalPrintingId": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "048",
      "printedCollectorNumber": "048/075",
      "printedSetMarkObservation": "Angular pointed setmark beside048/075.",
      "originalFileByteSha256": "e10b678bf15ad4adb7b50fd027b0b3d91dcb43935c0ff09789937feab7951364",
      "originalByteSize": 82660,
      "width": 500,
      "height": 700,
      "actualPrintedName": "ノクタス",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "71c383ba-8c07-4106-8286-b8789db9414e",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "7ab11fbc3022de320160ec1a144b5fe51c717b0d633d0b4dec33282d1e70e8f6",
    "rootDecisionRowCanonicalSha256": "30822d3e28961b7258961ef9be79e3d03a44843586e90a065f2e0ef715e649c3",
    "actualCanonicalSha256": "557a43ff0b51d115eb0c93d55350e345c6ea468125992315562c91fcaaa1849f",
    "witnessSerialized": "{\"printedNativeName\":\"ノクタス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"闘\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"サボネア\",\"printedEvolutionPlacement\":\"サボネアから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/075\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Angular pointed setmark beside048/075.\",\"visibleFinishCues\":\"Orange normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\"],\"attacks\":[{\"name\":\"トリプルニードル\",\"cost\":[\"闘\"],\"damage\":null,\"effect\":\"相手のポケモン3匹に、それぞれ10ダメージ。\"},{\"name\":\"なぐる\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":null}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"トゲのあらし\",\"effect\":\"このパワーは、このポケモンがバトル場にいるなら、自分の番に1回使うことができる。ダメージカウンターがのっている相手のポケモン1匹に、ダメージカウンターを1個のせる。このポケモンが特殊状態なら、このパワーを使うことはできない。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Native500-wide complete sourcecanvas below genericHD advisory; no enlargement or optical/card-region certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ノクタス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"闘\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"サボネア\",\"printedEvolutionPlacement\":\"サボネアから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/075\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Angular pointed setmark beside048/075.\",\"visibleFinishCues\":\"Orange normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\"],\"attacks\":[{\"name\":\"トリプルニードル\",\"cost\":[\"闘\"],\"damage\":null,\"effect\":\"相手のポケモン3匹に、それぞれ10ダメージ。\"},{\"name\":\"なぐる\",\"cost\":[\"闘\",\"無色\",\"無色\"],\"damage\":\"50\",\"effect\":null}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"トゲのあらし\",\"effect\":\"このパワーは、このポケモンがバトル場にいるなら、自分の番に1回使うことができる。ダメージカウンターがのっている相手のポケモン1匹に、ダメージカウンターを1個のせる。このポケモンが特殊状態なら、このパワーを使うことはできない。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Native500-wide complete sourcecanvas below genericHD advisory; no enlargement or optical/card-region certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "collector_number": "048",
        "card_native_name": "サボテン（デルタ種）",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "collector_number": "048",
        "card_native_name": "サボテン（デルタ種）",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:0bba36bb98f3150a4e45f05877738e9820f354fd5eac14669e37f459a6e54be9",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/cacturne-48",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/pe7abj52kraritlh/1600.jpg",
    "productId": "3439761",
    "setCode": "PCG8",
    "currentLabel": "サボテン（デルタ種）",
    "currentEnglish": null,
    "printedName": "ノクタス",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Pokemon",
    "hp": 80,
    "type": "闘",
    "stage": "1進化",
    "evolvesFrom": "サボネア",
    "collector": "048/075",
    "artist": "Kouki Saitou",
    "variantId": "71c383ba-8c07-4106-8286-b8789db9414e",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "e10b678bf15ad4adb7b50fd027b0b3d91dcb43935c0ff09789937feab7951364",
      "bytes": 82660,
      "width": 500,
      "height": 700,
      "rgbaSha256": "0cbf7d8bc31797f5adb587b77232d1f69d185da3b66af2962eca576b170910d0"
    },
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "4f98bea0-d418-4443-84bf-07a30281a5d3": {
    "printingId": "4f98bea0-d418-4443-84bf-07a30281a5d3",
    "alias": "050",
    "rawCanonicalSha256": "3122ca9af6924e5aa7f9ed9256466eba01e3c6a38a9e1e5c1a6d94068ec09944",
    "bodyCanonicalSha256": "0097a4497f51f5467017f936b2ac0be580a5ad07e0af229dd73ef09c9d6c598e",
    "controlsCanonicalSha256": "4549d064d60b2cff2b4e69030cc25fc00cdf6b87fd5dc6a43ab74aab18a51233",
    "inputCanonicalSha256": "7ca294a4af05aa7d7b717033b4ee0d613252359d48d7c624533a02d09adb5709",
    "preparedCanonicalSha256": "c76f1034d7d8bcf6054ecae6c588be6187b2c80f1bd78aaa81840a69cf929e4d",
    "entryCanonicalSha256": "e9661bf956e039947b825dccdc7d72cc61fb353b54eb679c06619be09febddcf",
    "everyRawPrintedWitness": {
      "printedNativeName": "オニスズメ",
      "printedCardClass": "Pokemon",
      "printedHP": 40,
      "printedType": "無色",
      "printedStage": "たね",
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "050/075",
      "printedArtist": "Midori Harada",
      "setMarkVisible": "Angular pointed setmark beside050/075.",
      "visibleFinishCues": "Gray normal-looking body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [],
      "attacks": [
        {
          "name": "さきどり",
          "cost": [
            "無色"
          ],
          "damage": null,
          "effect": "自分の山札からカードを1枚引く。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "雷",
      "printedResistance": "闘 -30",
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Fine printed/sampledtexture and a small dark speck on leftoutermargin; material/origin not certified.",
        "Wholecanvas dimensions are not card-region/native optical certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "c3305870afb4ac32d47e63a809e58550e7d52212abfaee8be9b13eea5698fb21",
    "rawSourceWitnessInsertionSHA": "2b20eb153ef1e647253e01f0719bcf017174e144d9cf57d42cf78a3f23911c91",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/spearow-50",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/refb869a7c34d566afc4dde2bcdcbd349f5bcf485123e6d740b6f016925cb5e319a/1600.jpg",
      "literalOriginalUrlSha256": "296ec82e383b529dec32fe5d99fd309f1b398f343f5c0d67d061a94ef670522d",
      "canonicalPrintingId": "4f98bea0-d418-4443-84bf-07a30281a5d3",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "050",
      "printedCollectorNumber": "050/075",
      "printedSetMarkObservation": "Angular pointed setmark beside050/075.",
      "originalFileByteSha256": "c0e2953b4b20ad72219532598496be9d715fb1ed8b1444d498b8ea79e8b070af",
      "originalByteSize": 433852,
      "width": 1153,
      "height": 1600,
      "actualPrintedName": "オニスズメ",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "c5276d4a5631e44ff969be7c1ecb7a96e3f516c2ddfbf5ebed796666c553c672",
    "rootDecisionRowCanonicalSha256": "99c94f64c3cd86f1505bf1bb3bf88473f4909aff505bb9ce300e35d8b75231fd",
    "actualCanonicalSha256": "c3305870afb4ac32d47e63a809e58550e7d52212abfaee8be9b13eea5698fb21",
    "witnessSerialized": "{\"printedNativeName\":\"オニスズメ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":40,\"printedType\":\"無色\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"050/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside050/075.\",\"visibleFinishCues\":\"Gray normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"さきどり\",\"cost\":[\"無色\"],\"damage\":null,\"effect\":\"自分の山札からカードを1枚引く。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"雷\",\"printedResistance\":\"闘 -30\",\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampledtexture and a small dark speck on leftoutermargin; material/origin not certified.\",\"Wholecanvas dimensions are not card-region/native optical certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"オニスズメ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":40,\"printedType\":\"無色\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"050/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside050/075.\",\"visibleFinishCues\":\"Gray normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"さきどり\",\"cost\":[\"無色\"],\"damage\":null,\"effect\":\"自分の山札からカードを1枚引く。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"雷\",\"printedResistance\":\"闘 -30\",\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Fine printed/sampledtexture and a small dark speck on leftoutermargin; material/origin not certified.\",\"Wholecanvas dimensions are not card-region/native optical certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "collector_number": "050",
        "card_native_name": "槍",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "collector_number": "050",
        "card_native_name": "槍",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:296ec82e383b529dec32fe5d99fd309f1b398f343f5c0d67d061a94ef670522d",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/spearow-50",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/refb869a7c34d566afc4dde2bcdcbd349f5bcf485123e6d740b6f016925cb5e319a/1600.jpg",
    "productId": "3439763",
    "setCode": "PCG8",
    "currentLabel": "槍",
    "currentEnglish": null,
    "printedName": "オニスズメ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Pokemon",
    "hp": 40,
    "type": "無色",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "050/075",
    "artist": "Midori Harada",
    "variantId": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "c0e2953b4b20ad72219532598496be9d715fb1ed8b1444d498b8ea79e8b070af",
      "bytes": 433852,
      "width": 1153,
      "height": 1600,
      "rgbaSha256": "f4e3a5cd5ccf1d1a2140cc72f90497964191bda475df8e559aee97dd23e5f880"
    },
    "abilityCount": 0,
    "attackCount": 1,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "65ce4679-d7b1-48b4-a747-2e18cf57847f": {
    "printingId": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
    "alias": "051",
    "rawCanonicalSha256": "859583d9f6521476c565d71ecb6260583430516f12beb50322710bb091722a91",
    "bodyCanonicalSha256": "7d75177b23854a67d62acfe4c082e1383ccd199d4991718fbbd36e9061e6d497",
    "controlsCanonicalSha256": "3cb53a3e69943e956241b83c059f52a1964bd81d0fccb9db2bd44b2856881127",
    "inputCanonicalSha256": "38e45de919266ae28014b61351d9bce0b723f698ed9b5153a173aea80260a05a",
    "preparedCanonicalSha256": "deeb42df8b02cdad6d420100b3ac64e3caf9d19b950a56f372054a81803afb8c",
    "entryCanonicalSha256": "4641bdd01297e083e1ba2a9b4c211d1e8a75e3b597c4aa01405e8da48a7b6e73",
    "everyRawPrintedWitness": {
      "printedNativeName": "プリン",
      "printedCardClass": "Pokemon",
      "printedHP": 50,
      "printedType": "無色",
      "printedStage": "たね",
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "051/075",
      "printedArtist": "Midori Harada",
      "setMarkVisible": "Angular pointed setmark beside051/075.",
      "visibleFinishCues": "Light normal-looking body under bright/hazy photographic illumination; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [],
      "attacks": [
        {
          "name": "さいみんはどう",
          "cost": [
            "無色"
          ],
          "damage": "10",
          "effect": "相手をねむりにする。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "闘",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Uneven bright/hazy photographic lighting over card; all actual printedtext remains readable.",
        "Card occupies onlypartof large squarecanvas on darkfabric; canvas not card-region/native optical resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "93e5febd8cf66087e38c8b7b9668bc8b67c922bf7c03a2479994ec0ecd2aae52",
    "rawSourceWitnessInsertionSHA": "bc9a6f0f5adb3a18866445a927b5beccb30a67eab6d0e6c3f7976cf4a406caa9",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/jigglypuff-51",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/ac182bede13131900b97aaee338c1db77f8dc0fb7193005ff65142bd7dbc367b/1600.jpg",
      "literalOriginalUrlSha256": "3aea527201802a9ed495dae24db19b30c7c6817d0ccda795a3ead36dfbeb0143",
      "canonicalPrintingId": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "051",
      "printedCollectorNumber": "051/075",
      "printedSetMarkObservation": "Angular pointed setmark beside051/075.",
      "originalFileByteSha256": "70837a665bfc760d181de1f5ab82cdb74ee601934928f3b85179a7b01f551520",
      "originalByteSize": 713124,
      "width": 1600,
      "height": 1600,
      "actualPrintedName": "プリン",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "012",
      "closedSourceHandoffSha256": "d932d62effa8de0750d354315754151a70cc4c1a44d56937a74562e2bc86d301",
      "independentActualSourceReviewSha256": "ef81e16e1eb99e6409ccad444a8ace3fce7c4534071fa26f99fd76405737b067",
      "priorFiniteDecisionSha256": "3c2fcec13e7c4ab8c59925f6cad076c5fb81e60799c31dfdcc596c60e11b01d9",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": {
        "handoffSHA": "f2cc9030fc2520b593c4a0bc663cd180eeca8f790e992f55ffa2a185c8a0b53d",
        "peerSHA": "86c7d74d397d0abdfec4021b63ef7693fa9bd880327abb11de2fbea9214c668c",
        "rawHistoricalPartition": {
          "accepted": 7,
          "held": 13
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        },
        "sourceRowsAndFlagsUnchanged": true
      },
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "c73b2587-431d-47e1-ac6f-654d5559532f",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": "jigglypuff",
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "bf26e8c552133486773d065651731906897be97b3a41ce842089b0369c7ec884",
    "rootDecisionRowCanonicalSha256": "c74348884f1435962e71404a6085a34af24016d2bb24158a12a5b23ada449a09",
    "actualCanonicalSha256": "93e5febd8cf66087e38c8b7b9668bc8b67c922bf7c03a2479994ec0ecd2aae52",
    "witnessSerialized": "{\"printedNativeName\":\"プリン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":50,\"printedType\":\"無色\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"051/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside051/075.\",\"visibleFinishCues\":\"Light normal-looking body under bright/hazy photographic illumination; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"さいみんはどう\",\"cost\":[\"無色\"],\"damage\":\"10\",\"effect\":\"相手をねむりにする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"闘\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Uneven bright/hazy photographic lighting over card; all actual printedtext remains readable.\",\"Card occupies onlypartof large squarecanvas on darkfabric; canvas not card-region/native optical resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"プリン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":50,\"printedType\":\"無色\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"051/075\",\"printedArtist\":\"Midori Harada\",\"setMarkVisible\":\"Angular pointed setmark beside051/075.\",\"visibleFinishCues\":\"Light normal-looking body under bright/hazy photographic illumination; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"さいみんはどう\",\"cost\":[\"無色\"],\"damage\":\"10\",\"effect\":\"相手をねむりにする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"闘\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Uneven bright/hazy photographic lighting over card; all actual printedtext remains readable.\",\"Card occupies onlypartof large squarecanvas on darkfabric; canvas not card-region/native optical resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "collector_number": "051",
        "card_native_name": "jigglypuff",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "collector_number": "051",
        "card_native_name": "jigglypuff",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:3aea527201802a9ed495dae24db19b30c7c6817d0ccda795a3ead36dfbeb0143",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/jigglypuff-51",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ac182bede13131900b97aaee338c1db77f8dc0fb7193005ff65142bd7dbc367b/1600.jpg",
    "productId": "3439764",
    "setCode": "PCG8",
    "currentLabel": "jigglypuff",
    "currentEnglish": "jigglypuff",
    "printedName": "プリン",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "998a47f23c0312c2d95aa54d11de6d2c3171e5dcf4c8e36bc107d437afa7de0e",
    "actualClass": "Pokemon",
    "hp": 50,
    "type": "無色",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "051/075",
    "artist": "Midori Harada",
    "variantId": "c73b2587-431d-47e1-ac6f-654d5559532f",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "70837a665bfc760d181de1f5ab82cdb74ee601934928f3b85179a7b01f551520",
      "bytes": 713124,
      "width": 1600,
      "height": 1600,
      "rgbaSha256": "b2c63851733b679738ba093bcfbbdf32b5a3c8940fcd59e7c9707c9275eced9a"
    },
    "abilityCount": 0,
    "attackCount": 1,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "e878f64d-e38a-4d38-854b-d0dedb8ecafe": {
    "printingId": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
    "alias": "068",
    "rawCanonicalSha256": "a02942a78de3cbc6952fb52a711731cebd122887244c803fd5f56ca6f01c05f5",
    "bodyCanonicalSha256": "237fe0c2fe7a75d612f96b309a21250822954aad8426cb612d9107937193f9da",
    "controlsCanonicalSha256": "72f3758caef4265fe9bc8f744c35ff2b4e11c65aa85e52aaaed2d3ca29e28602",
    "inputCanonicalSha256": "22e04c21544d6d7aac2814f8d97de1d3398fc70240297327d8b40b202684b2b8",
    "preparedCanonicalSha256": "06a25d4e7ea15a00ced23e4f1689008f0c8137466be685fe7873188a02d7ef57",
    "entryCanonicalSha256": "9f9fac863b81a3e58a8985c0943c667b899fe48b8006c62e608367edbbdf11bc",
    "everyRawPrintedWitness": {
      "printedNativeName": "漂流者",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "068/075",
      "printedArtist": "Kouki Saitou",
      "setMarkVisible": "Angular pointed setmark beside068/075.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の山札から、「サポーター」と「ポケモンのどうぐ」と「基本エネルギー」を、それぞれ1枚ずつ選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual サポーター header"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "completeVerticalPerimeterInspection": "Entire left andright physicalouteredges continuously visible through middle/lowercard against distinctgraybackground; top/bottom and allcorners visible.",
      "qualityAdvisories": [
        "Originalcanvas includes whiteandgraybackground; fullcanvas not card-region/native optical resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "77f095a54d63e36c6fc4fd640671fc1cb4e53a541269406216d2cc354fce4f41",
    "rawSourceWitnessInsertionSHA": "94c52456feceeade2fb8447104b8f79f91c792ca2e7edc001f716a1e7be39bd6",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/castaway-68",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/corri4wf7kojvtosxgev/1600.jpg",
      "literalOriginalUrlSha256": "b85a933355639621afe1efdbd56a7793f3e34c73357de8318495bb8838044784",
      "canonicalPrintingId": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "068",
      "printedCollectorNumber": "068/075",
      "printedSetMarkObservation": "Angular pointed setmark beside068/075.",
      "originalFileByteSha256": "de83821bd05fb63841846b55857f651530de4b86bd19971074ab2158ec65f25c",
      "originalByteSize": 453584,
      "width": 1600,
      "height": 1600,
      "actualPrintedName": "漂流者",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "013",
      "closedSourceHandoffSha256": "a1d2991c2f423bd37c70c414943a94caa6a646dc4f6063d365b1ee878865124a",
      "independentActualSourceReviewSha256": "6595353e6ca7046b030607101fece0e4c0fbcb954139ce3e04a74b433aa7f47f",
      "priorFiniteDecisionSha256": "eaf72c29563094f5fea5f00e9932a8cc5423c908cc619a5f58bb0168e31f1fb8",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "7d2deb7c714e08a4a74a7e5d877acc233d213b11bf277de5435fa6dbb151e639",
    "rootDecisionRowCanonicalSha256": "1807ea392a57b1f22a30adf4c6625c07313f56d04306c3809b3a07075f0a5f7c",
    "actualCanonicalSha256": "77f095a54d63e36c6fc4fd640671fc1cb4e53a541269406216d2cc354fce4f41",
    "witnessSerialized": "{\"printedNativeName\":\"漂流者\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"068/075\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Angular pointed setmark beside068/075.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の山札から、「サポーター」と「ポケモンのどうぐ」と「基本エネルギー」を、それぞれ1枚ずつ選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"completeVerticalPerimeterInspection\":\"Entire left andright physicalouteredges continuously visible through middle/lowercard against distinctgraybackground; top/bottom and allcorners visible.\",\"qualityAdvisories\":[\"Originalcanvas includes whiteandgraybackground; fullcanvas not card-region/native optical resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"漂流者\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"068/075\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Angular pointed setmark beside068/075.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の山札から、「サポーター」と「ポケモンのどうぐ」と「基本エネルギー」を、それぞれ1枚ずつ選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"completeVerticalPerimeterInspection\":\"Entire left andright physicalouteredges continuously visible through middle/lowercard against distinctgraybackground; top/bottom and allcorners visible.\",\"qualityAdvisories\":[\"Originalcanvas includes whiteandgraybackground; fullcanvas not card-region/native optical resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "collector_number": "068",
        "card_native_name": "キャスト・アウェイ",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "collector_number": "068",
        "card_native_name": "キャスト・アウェイ",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:b85a933355639621afe1efdbd56a7793f3e34c73357de8318495bb8838044784",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/castaway-68",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corri4wf7kojvtosxgev/1600.jpg",
    "productId": "3439781",
    "setCode": "PCG8",
    "currentLabel": "キャスト・アウェイ",
    "currentEnglish": null,
    "printedName": "漂流者",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "6a757a81c8fbf34c069665fee61fdcfae0a77e83c2a959669f59ff686a00d6a0",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "068/075",
    "artist": "Kouki Saitou",
    "variantId": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "de83821bd05fb63841846b55857f651530de4b86bd19971074ab2158ec65f25c",
      "bytes": 453584,
      "width": 1600,
      "height": 1600,
      "rgbaSha256": "4f588e0c23f3a66776870ce9024f29c8b78420d46af58d97195a81f1691edc6e"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の山札から、「サポーター」と「ポケモンのどうぐ」と「基本エネルギー」を、それぞれ1枚ずつ選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5": {
    "printingId": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
    "alias": "075",
    "rawCanonicalSha256": "5b97d1caa924a2ae53055a8e21ec1513064586d195be78c0152fff0cb6b46e9e",
    "bodyCanonicalSha256": "cd9c96c196e502d57690bf7b5226efaaa4a890cd79b9d00f3cc5b0cf66118242",
    "controlsCanonicalSha256": "3a9218f9f63375b90e28057d24b92d8155f02b775791f2cab922280bf78650bb",
    "inputCanonicalSha256": "7257cef07cd8fd9c66dcd4ccdfa04c95df7ff104bd6322112e8e766ac5e077c7",
    "preparedCanonicalSha256": "88a770fb91f31d3b54234af1a9e7caf2ec981e27b98dfe5175cbf91db4d88b4f",
    "entryCanonicalSha256": "45f9c975d30d586c16eb02814af41d4fe669830f81e25ddbd24bccecccd16580",
    "everyRawPrintedWitness": {
      "printedNativeName": "Wレインボーエネルギー",
      "printedCardClass": "Energy",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "075/075",
      "printedArtist": "Takumi Akabane",
      "setMarkVisible": "Angular pointed setmark beside075/075.",
      "visibleFinishCues": "Normal-looking Energy frame/body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "このカードは、「進化ポケモン（ポケモンexはのぞく）」につけることができ、ついているかぎり、すべてのタイプのエネルギー2個ぶんとしてはたらく（特殊エネルギーの効果は含まれない）。\n\nこのカードをつけているポケモンの、相手のポケモンに与えるワザによるダメージは、すべて「-10」される。\n\n「進化ポケモン（ポケモンexはのぞく）」についていないなら、このカードをトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual ENERGY header",
        "Actual 特殊エネルギー label",
        "Actual ポケモンex exclusion qualifiers"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "completeVerticalPerimeterInspection": "Narrow but visiblegraybackground outside entireleftphysicaledge; broadergraybackground outside entirerightedge; continuousfullverticals/top/bottom/allcorners visible.",
      "qualityAdvisories": [
        "Small dark artwork speck/lines visible; materialorigin not certified, no retouch."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "b112a7214319d4c2c7b1f36a8d4b4418f5af78a5b4dc15fddbf9ead91344756a",
    "rawSourceWitnessInsertionSHA": "1b0b93b268c7b337db0b75de6b5b303eb76b016d3bc6b4bcb4e6df47b64dd099",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/double-rainbow-energy-75",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/corr562cdyytolajlzrp/1600.jpg",
      "literalOriginalUrlSha256": "fe19b87457cd2f790909ea769cb9dc53a6097bf9bde9c7e7310c73bc0a03e6a4",
      "canonicalPrintingId": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
      "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "canonicalSetCode": "PCG8",
      "languageCode": "ja",
      "canonicalAlias": "075",
      "printedCollectorNumber": "075/075",
      "printedSetMarkObservation": "Angular pointed setmark beside075/075.",
      "originalFileByteSha256": "0b40f6a1d3e3311b06b1557923e82fc42ded5af0c90b4847b10ad6650a44fd8a",
      "originalByteSize": 340563,
      "width": 1040,
      "height": 1464,
      "actualPrintedName": "Wレインボーエネルギー",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "013",
      "closedSourceHandoffSha256": "a1d2991c2f423bd37c70c414943a94caa6a646dc4f6063d365b1ee878865124a",
      "independentActualSourceReviewSha256": "6595353e6ca7046b030607101fece0e4c0fbcb954139ce3e04a74b433aa7f47f",
      "priorFiniteDecisionSha256": "eaf72c29563094f5fea5f00e9932a8cc5423c908cc619a5f58bb0168e31f1fb8",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": {
        "alias": "PCG8-075",
        "handoffSha256": "d4530fece80edb6ad367006a32fce51d2eee26b2ed1a5caa7a9a0d77c35031c8",
        "moduleSha256": "3b43cae88048f970cf4c5f031a0237c329192f0028c59dcdd514247c3bdeb433",
        "peerSha256": "df7c7116c2d41c923e2b9b58026a78bc7139fd813e664a334de69c8c94342878",
        "rawHistoricalPartition": {
          "accepted": 2,
          "held": 18
        },
        "operationalPartition": {
          "accepted": 3,
          "held": 17
        }
      }
    },
    "expectedVariantId": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": true,
    "rawHistoricalHolds": [
      "actual_printed_Energy_conflicts_with_cached_native_Trainer_category"
    ],
    "finiteEnergyCategoryQualification": {
      "exactAlias": "PCG8-075",
      "sourceProposalUnmodified": {
        "status": "INACTIVE_REQUIRES_ROOT_DECISION_AND_INDEPENDENT_APPROVAL",
        "exactBindingsCanonicalSha256": "92fd94165b5e3d38d9853e775361daf6138fc6763692a2f43f386dff54929fb4",
        "rawRowCanonicalSha256": "5c349399461d365d8f3484ac228d8c126d01f4d4e5f7ba560420b827ae1c6b58",
        "rawWitnessCanonicalSha256": "b112a7214319d4c2c7b1f36a8d4b4418f5af78a5b4dc15fddbf9ead91344756a",
        "rawWitnessInsertionSha256": "1b0b93b268c7b337db0b75de6b5b303eb76b016d3bc6b4bcb4e6df47b64dd099",
        "rawActualClass": "Energy",
        "retainedCachedNativeClass": "Trainer",
        "retainedCanonicalCategory": null,
        "rawSourceHandoffSha256": "a1d2991c2f423bd37c70c414943a94caa6a646dc4f6063d365b1ee878865124a",
        "assessmentHandoffSha256": "4ed203bb91557825c44d640ecefd32f1d9e20aa098c70066db2e309d34c5f48d",
        "physicalEdition": null,
        "physicalFinish": null,
        "metadataOrGlobalGuardChanged": false,
        "rootApprovalPresent": false,
        "independentApprovalPresent": false,
        "sourceSelectionApproved": false,
        "preparationApproved": false,
        "publicationApproved": false
      },
      "rootFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "rootFiniteQualificationHandoffSHA": "d4530fece80edb6ad367006a32fce51d2eee26b2ed1a5caa7a9a0d77c35031c8",
      "rootFiniteQualificationModuleSHA": "3b43cae88048f970cf4c5f031a0237c329192f0028c59dcdd514247c3bdeb433",
      "independentQualificationPeerSHA": "df7c7116c2d41c923e2b9b58026a78bc7139fd813e664a334de69c8c94342878",
      "rootFinitePreparationOnly": true,
      "metadataOrGlobalGuardChanged": false
    },
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "d9d3c6d574bc8ec6d912e87a3b6a7ffb4c7a41e6765581a441240ea04155d0ee",
    "rootDecisionRowCanonicalSha256": "aff7f2bc4b38c8d2ad8b53e61366d9e127ef8c97b01f806a64c1c31998c9d386",
    "actualCanonicalSha256": "b112a7214319d4c2c7b1f36a8d4b4418f5af78a5b4dc15fddbf9ead91344756a",
    "witnessSerialized": "{\"printedNativeName\":\"Wレインボーエネルギー\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"075/075\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Angular pointed setmark beside075/075.\",\"visibleFinishCues\":\"Normal-looking Energy frame/body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは、「進化ポケモン（ポケモンexはのぞく）」につけることができ、ついているかぎり、すべてのタイプのエネルギー2個ぶんとしてはたらく（特殊エネルギーの効果は含まれない）。\\n\\nこのカードをつけているポケモンの、相手のポケモンに与えるワザによるダメージは、すべて「-10」される。\\n\\n「進化ポケモン（ポケモンexはのぞく）」についていないなら、このカードをトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex exclusion qualifiers\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"completeVerticalPerimeterInspection\":\"Narrow but visiblegraybackground outside entireleftphysicaledge; broadergraybackground outside entirerightedge; continuousfullverticals/top/bottom/allcorners visible.\",\"qualityAdvisories\":[\"Small dark artwork speck/lines visible; materialorigin not certified, no retouch.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"Wレインボーエネルギー\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"075/075\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Angular pointed setmark beside075/075.\",\"visibleFinishCues\":\"Normal-looking Energy frame/body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは、「進化ポケモン（ポケモンexはのぞく）」につけることができ、ついているかぎり、すべてのタイプのエネルギー2個ぶんとしてはたらく（特殊エネルギーの効果は含まれない）。\\n\\nこのカードをつけているポケモンの、相手のポケモンに与えるワザによるダメージは、すべて「-10」される。\\n\\n「進化ポケモン（ポケモンexはのぞく）」についていないなら、このカードをトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex exclusion qualifiers\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"completeVerticalPerimeterInspection\":\"Narrow but visiblegraybackground outside entireleftphysicaledge; broadergraybackground outside entirerightedge; continuousfullverticals/top/bottom/allcorners visible.\",\"qualityAdvisories\":[\"Small dark artwork speck/lines visible; materialorigin not certified, no retouch.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "collector_number": "075",
        "card_native_name": "二重虹のエネルギー",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "set_code": "PCG8",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "collector_number": "075",
        "card_native_name": "二重虹のエネルギー",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:fe19b87457cd2f790909ea769cb9dc53a6097bf9bde9c7e7310c73bc0a03e6a4",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-miracle-crystal/double-rainbow-energy-75",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corr562cdyytolajlzrp/1600.jpg",
    "productId": "3439788",
    "setCode": "PCG8",
    "currentLabel": "二重虹のエネルギー",
    "currentEnglish": null,
    "printedName": "Wレインボーエネルギー",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "6b92879ce9628bed119ee732432589d87a7b6f64e263d52d1c742ff110a64ec2",
    "actualClass": "Energy",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "075/075",
    "artist": "Takumi Akabane",
    "variantId": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "0b40f6a1d3e3311b06b1557923e82fc42ded5af0c90b4847b10ad6650a44fd8a",
      "bytes": 340563,
      "width": 1040,
      "height": 1464,
      "rgbaSha256": "fc9d3764a3f24e8ce144fcd069f0702946563f091f21398ed6faa491eb3ce7ed"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "このカードは、「進化ポケモン（ポケモンexはのぞく）」につけることができ、ついているかぎり、すべてのタイプのエネルギー2個ぶんとしてはたらく（特殊エネルギーの効果は含まれない）。\n\nこのカードをつけているポケモンの、相手のポケモンに与えるワザによるダメージは、すべて「-10」される。\n\n「進化ポケモン（ポケモンexはのぞく）」についていないなら、このカードをトラッシュする。",
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "73c8c54f-ca86-411d-bc34-437d6bbae88a": {
    "printingId": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
    "alias": "048",
    "rawCanonicalSha256": "d241a1837bb109df37dbc91736af98906baa3390b5514c5edc9ad5d70eddcf4f",
    "bodyCanonicalSha256": "85410b9f397a967a3322071c5f7e5597ffe980aa285ba8dadba6659bcdcbc96f",
    "controlsCanonicalSha256": "7222458ccdd9bcbefe674a96a98976ae0838b1ae08c6aa5ad29ecfcb6c1f4543",
    "inputCanonicalSha256": "7e4763d1f85a4ad275c661f8c1b9db9b9f90951e5485818d3aad11b207fdc054",
    "preparedCanonicalSha256": "4137d1117375fa1f77e69b3e07f769ab438e684b56542d2a4a5987bdd5966d18",
    "entryCanonicalSha256": "c9bf5661b88dbb47208e0611e0d1a21707012f52bb2c5d4628e2e6f00b4cc32c",
    "everyRawPrintedWitness": {
      "printedNativeName": "ジュゴン",
      "printedCardClass": "Pokemon",
      "printedHP": 80,
      "printedType": "無色",
      "printedStage": "1進化",
      "printedEvolutionFrom": "パウワウ",
      "printedEvolutionPlacement": "パウワウから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "048/068",
      "printedArtist": "Atsuko Nishida",
      "setMarkVisible": "Black rounded double-lobed/wave-like setmark beside048/068.",
      "visibleFinishCues": "Light silver normal-looking body; physical finish uncertified.",
      "printedCopyright": "©2006 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header"
      ],
      "attacks": [
        {
          "name": "れいとうビーム",
          "cost": [
            "無色",
            "無色"
          ],
          "damage": "20",
          "effect": "コインを1回投げオモテなら、相手をマヒにする。"
        },
        {
          "name": "はねあがる",
          "cost": [
            "無色",
            "無色",
            "無色"
          ],
          "damage": "40+",
          "effect": "自分に［水］エネルギーが2個以上ついているなら、20ダメージを追加する。"
        }
      ],
      "abilities": [
        {
          "kind": "ポケボディー",
          "name": "デルタプロテクター",
          "effect": "このポケモンが、相手の「δ-デルタ種」のポケモンのワザによって受けるダメージは、「-40」される。"
        }
      ],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "雷",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色",
        "無色"
      ],
      "completeVerticalPerimeterInspection": "Both completephysicalsideedges continuouslyvisible through middle/lowercard with lightbluebackground outside; complete top/bottom/allcorners visible.",
      "qualityAdvisories": [
        "Fine printed/sampledtexture and bright illustration; fullcanvas is not certified card-region/native optical resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "3c4418eba5b38dc01d6a678b30ce403a9f0b0c44e156e357ff47be757f3a1fa7",
    "rawSourceWitnessInsertionSHA": "8bee1c01cc90e1339f44158f5e76cea03da9b53e549f8f9aa2ddd2322741413a",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-offense-and-defense-of-the-furthest-ends/dewgong-48",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/5fe60e22067800c719421ab40ec9e7525edbd5e3857f48426ebdee938de59e1b/1600.jpg",
      "literalOriginalUrlSha256": "6a684dfea92230be95ca6e404c3b8c77b89357808033a47b6f1c8e3e1c87174b",
      "canonicalPrintingId": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
      "canonicalSetId": "b5ef438a-ddcb-4093-8c9b-572639565af5",
      "canonicalSetCode": "PCG9",
      "languageCode": "ja",
      "canonicalAlias": "048",
      "printedCollectorNumber": "048/068",
      "printedSetMarkObservation": "Black rounded double-lobed/wave-like setmark beside048/068.",
      "originalFileByteSha256": "3739486c16f42b32410a07330d75121e775fd387e9871e2dab8689c3c873f041",
      "originalByteSize": 204515,
      "width": 854,
      "height": 1113,
      "actualPrintedName": "ジュゴン",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "013",
      "closedSourceHandoffSha256": "a1d2991c2f423bd37c70c414943a94caa6a646dc4f6063d365b1ee878865124a",
      "independentActualSourceReviewSha256": "6595353e6ca7046b030607101fece0e4c0fbcb954139ce3e04a74b433aa7f47f",
      "priorFiniteDecisionSha256": "eaf72c29563094f5fea5f00e9932a8cc5423c908cc619a5f58bb0168e31f1fb8",
      "combinedFiniteDecisionSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
      "holdOnlyProjection": null,
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "052ae4a3-808a-4626-90b1-a8947c6eee70",
    "finish": "normal",
    "isDefault": true,
    "recordedEnglish": null,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "additiveTupleQualification": null,
    "rowCanonicalSha256": "f8f3f924715a3e1694ec0ee2f4b460828f7e7b7bcc4389b252b1f240001bfa15",
    "rootDecisionRowCanonicalSha256": "94036e4e496df061e97a339f3db414a3949c93eecca186b5a17e6b1cfd8835cc",
    "actualCanonicalSha256": "3c4418eba5b38dc01d6a678b30ce403a9f0b0c44e156e357ff47be757f3a1fa7",
    "witnessSerialized": "{\"printedNativeName\":\"ジュゴン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"無色\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"パウワウ\",\"printedEvolutionPlacement\":\"パウワウから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/068\",\"printedArtist\":\"Atsuko Nishida\",\"setMarkVisible\":\"Black rounded double-lobed/wave-like setmark beside048/068.\",\"visibleFinishCues\":\"Light silver normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\"],\"attacks\":[{\"name\":\"れいとうビーム\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":\"コインを1回投げオモテなら、相手をマヒにする。\"},{\"name\":\"はねあがる\",\"cost\":[\"無色\",\"無色\",\"無色\"],\"damage\":\"40+\",\"effect\":\"自分に［水］エネルギーが2個以上ついているなら、20ダメージを追加する。\"}],\"abilities\":[{\"kind\":\"ポケボディー\",\"name\":\"デルタプロテクター\",\"effect\":\"このポケモンが、相手の「δ-デルタ種」のポケモンのワザによって受けるダメージは、「-40」される。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"雷\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"completeVerticalPerimeterInspection\":\"Both completephysicalsideedges continuouslyvisible through middle/lowercard with lightbluebackground outside; complete top/bottom/allcorners visible.\",\"qualityAdvisories\":[\"Fine printed/sampledtexture and bright illustration; fullcanvas is not certified card-region/native optical resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ジュゴン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":80,\"printedType\":\"無色\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"パウワウ\",\"printedEvolutionPlacement\":\"パウワウから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"048/068\",\"printedArtist\":\"Atsuko Nishida\",\"setMarkVisible\":\"Black rounded double-lobed/wave-like setmark beside048/068.\",\"visibleFinishCues\":\"Light silver normal-looking body; physical finish uncertified.\",\"printedCopyright\":\"©2006 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\"],\"attacks\":[{\"name\":\"れいとうビーム\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":\"コインを1回投げオモテなら、相手をマヒにする。\"},{\"name\":\"はねあがる\",\"cost\":[\"無色\",\"無色\",\"無色\"],\"damage\":\"40+\",\"effect\":\"自分に［水］エネルギーが2個以上ついているなら、20ダメージを追加する。\"}],\"abilities\":[{\"kind\":\"ポケボディー\",\"name\":\"デルタプロテクター\",\"effect\":\"このポケモンが、相手の「δ-デルタ種」のポケモンのワザによって受けるダメージは、「-40」される。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"雷\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"completeVerticalPerimeterInspection\":\"Both completephysicalsideedges continuouslyvisible through middle/lowercard with lightbluebackground outside; complete top/bottom/allcorners visible.\",\"qualityAdvisories\":[\"Fine printed/sampledtexture and bright illustration; fullcanvas is not certified card-region/native optical resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "collector_number": "048",
        "card_native_name": "デューゴン（デルタ種）",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    ],
    "staging": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "set_code": "PCG9",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "collector_number": "048",
        "card_native_name": "デューゴン（デルタ種）",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:6a684dfea92230be95ca6e404c3b8c77b89357808033a47b6f1c8e3e1c87174b",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-offense-and-defense-of-the-furthest-ends/dewgong-48",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/5fe60e22067800c719421ab40ec9e7525edbd5e3857f48426ebdee938de59e1b/1600.jpg",
    "productId": "3439845",
    "setCode": "PCG9",
    "currentLabel": "デューゴン（デルタ種）",
    "currentEnglish": null,
    "printedName": "ジュゴン",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "6a757a81c8fbf34c069665fee61fdcfae0a77e83c2a959669f59ff686a00d6a0",
    "actualClass": "Pokemon",
    "hp": 80,
    "type": "無色",
    "stage": "1進化",
    "evolvesFrom": "パウワウ",
    "collector": "048/068",
    "artist": "Atsuko Nishida",
    "variantId": "052ae4a3-808a-4626-90b1-a8947c6eee70",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "3739486c16f42b32410a07330d75121e775fd387e9871e2dab8689c3c873f041",
      "bytes": 204515,
      "width": 854,
      "height": 1113,
      "rgbaSha256": "62a1bccdc47e80047eaf62855abe5cb8d8ced3d4f1b97e7f379716418a16e1de"
    },
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "5c47811ea11af37512e2741e0f201bb820cd14d52c3976e9925bc5a052b7ec53",
  "decisionCanonicalSha256": "99e6ad3d8abce5bb373a26f6994ec97378bdd3f0901333ce6df2777b71409ab2",
  "approvedFileSha256": "34210b15423e8f9b002dc619b5b4c05c396510f7daeae909a0e5c757df447164",
  "decisionFileSha256": "e4c6e8fa4388b45c4361bad054c39fa5b2ab5c129e7a0ea24ec44309e7935c41",
  "validatorFileSha256": "9f7a132ec7c2e8f508d19d1869836a3cdb9b521e1c0723cde68fc87098ff7f75",
  "externalBindingFileSha256": "65e7faabea24c378950eae3e0f9f4b1524888c09c06506444e3e7dd5e0784e90"
};
export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()), 'Private/commercial/credential payload');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicProjection(item)]));
  }
  check(typeof value !== 'string' || !/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value), 'Private path/raw HTML/credential');
  return value;
}
export const publicationBody = publicProjection;


export function knownSource(id) { check(Object.hasOwn(expectedRows,id),'Outside exact PCG789 twelve'); return structuredClone(expectedRows[id]); }
const insertion=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function witnesses(values,k,stored) {
  for (const value of values) check(JSON.stringify(value) === k.witnessSerialized && insertion(value) === k.rawSourceWitnessInsertionSHA,'Exact original witness serialization, nested order and insertion SHA required');
  for (const sha of stored) check(sha === k.rawSourceWitnessInsertionSHA,'Stored insertion SHA changed');
}
export function validateActual(value,k) { check(JSON.stringify(value)===k.actualSerialized && canonicalHash(value)===k.actualCanonicalSha256,'Exact full direct source observations including nested order'); }
export function observed(value,key){const aliases={name:'printedNativeName',hp:'printedHP',stage:'printedStage',evolvesFrom:'printedEvolutionFrom',collector:'printedCollectorNumber',artist:'printedArtist'};return value[aliases[key]??key];}
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Frozen exact ten root authority');
 check(approved.rows.length===12&&decision.rowCount===12&&decision.privatePreparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.canonicalMetadataWritesAllowed===false&&decision.sourcePolicyWritesAllowed===false&&decision.rootOwnsQueueGitUploadPublisherAndLiveActions===true,'Finite conditional authority');
 for(const raw of approved.rows){const k=knownSource(raw.printingId),s=decision.rows.find(x=>x.printingId===raw.printingId);check(canonicalHash(raw)===k.rawCanonicalSha256&&s&&canonicalHash(s)===k.rootDecisionRowCanonicalSha256,'Whole immutable root rows');validateActual(s.actualPixelSignature,k);check(s.sourceSelectionApproved===false&&s.preparationApproved===false&&s.publicationApproved===false,'Historical false source flags');witnesses([raw.rawSourcePrintedWitness,raw.rootActualPrintedWitness,raw.actualPixelSignature],k,[raw.rawSourcePrintedWitnessInsertionSha256]);}return true;
}
export function validateSourceRow(raw,body,controls,input){
 const k=knownSource(raw.printingId);check(canonicalHash(raw)===k.rawCanonicalSha256&&canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(controls)===k.controlsCanonicalSha256,'Exact raw/body/controls');
 witnesses([raw.rawSourcePrintedWitness,raw.rootActualPrintedWitness,raw.actualPixelSignature,body.raw_source_printed_witness,body.root_actual_printed_witness,body.actual_pixel_signature],k,[raw.rawSourcePrintedWitnessInsertionSha256,body.raw_source_witness_insertion_sha256]);
 if(input!==undefined){check(canonicalHash(input)===k.inputCanonicalSha256,'Exact input');witnesses([input.source_body.raw_source_printed_witness,input.source_body.root_actual_printed_witness,input.source_body.actual_pixel_signature],k,[input.source_body.raw_source_witness_insertion_sha256]);}validateActual(raw.actualPixelSignature,k);return k;
}
export function validatePublishedWitness(body,row){
 const k=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===k.controlsCanonicalSha256,'Frozen full source body/controls resist joint forgery');
 witnesses([body.raw_source_printed_witness,body.root_actual_printed_witness,body.actual_pixel_signature],k,[body.raw_source_witness_insertion_sha256]);validateActual(body.actual_pixel_signature,k);
 check(row.set_code===k.setCode&&row.language_code==='ja'&&row.collector_number===k.alias&&row.card_native_name===k.currentLabel&&row.provider_id===k.sourceCardId&&row.image_url===k.imageUrl&&row.evidence.source_page_url===k.sourcePageUrl&&row.work_type==='CARDS','Exact current printing and original URL');
 check(body.accepted_category===null&&body.recorded_inventory_category===null&&body.source_variant_id===null&&body.required_asset_scope.variant_id===null&&body.required_asset_scope.printing_id===row.printing_id&&body.required_delivery_kind==='shared','Canonical nulls and shared source/asset scope');
 check(body.queue_controls.identity_controls.canonical_english_label_preserved===k.currentEnglish,'Exact per-row English label including lowercase jigglypuff');
 check(body.global_trainer_energy_guard_changed===false&&body.finite_energy_exception===k.finiteEnergyException,'No global Trainer/Energy waiver');
 if(k.finiteEnergyException)check(k.setCode==='PCG8'&&k.alias==='075'&&k.printingId==='c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5'&&body.actual_printed_category==='Energy'&&body.actual_native_category==='Trainer'&&(body.actual_pixel_signature.printedRules.match(/ポケモンex/g)||[]).length===2,'OnlyPCG8-075 exact new Energy qualification retains both Pokemonex exclusions');
 check(body.root_finite_authority.decision_file_byte_sha256===authority.decisionFileSha256&&body.root_finite_authority.preparation_approved===true&&body.root_finite_authority.conditional_future_publication_root_owned===true&&body.root_finite_authority.private_package_is_production_ready===false,'Finite root authority');
 for(const key of ['provider_native_resolution_certified','native_optical_gain_claimed','stackr_enlargement','source_wide_approval','vendor_licence_certified','physical_finish_certified','physical_edition_certified'])check(body[key]===false,'No invented physical/licence/provider/optical certificate');return k;
}
