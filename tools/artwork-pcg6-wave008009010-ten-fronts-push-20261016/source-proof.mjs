import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d": {
    "printingId": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
    "alias": "007",
    "rawCanonicalSha256": "91f163f75e3b3496d72cfa6e3c1d561eb52705e96ac3351b3d9b8bb719e1cc0a",
    "bodyCanonicalSha256": "3be33e48bc408688a8aebd83d8826795f531691d6f6002afae5cf5e0a2e765ae",
    "controlsCanonicalSha256": "3bc2e01fa22dd0401a4e6e761603c64e0eededbd765dd591fe47b4076b36d709",
    "inputCanonicalSha256": "66358eaab54e7bdb8c6f809a56340c5c1dd7e30ce90dd18004fe469ff1e86b96",
    "preparedCanonicalSha256": "0ceaca1dba6082a51d0588d54e03ce5a2e2af8bd1d2de4e5edcca74ca670f27c",
    "entryCanonicalSha256": "2f213c0f89204251ee32b06f7e7210b9eeafc49bd4eb1bbed888d68aacd397a4",
    "everyRawPrintedWitness": {
      "printedNativeName": "メタモン",
      "printedCardClass": "Pokemon",
      "printedHP": 60,
      "printedType": "草",
      "printedStage": "たね",
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "007/086",
      "printedArtist": "Yuka Morii",
      "setMarkVisible": "Black tower-like Holonmark beside007/086; complete mark/fraction visible.",
      "visibleFinishCues": "Green normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actualメタモン fullnativeheader",
        "Distinctgrass HP60/どくどくcost/body/YukaMorii face corroborates cached007 record; no printedformname invented"
      ],
      "attacks": [
        {
          "name": "どくどく",
          "cost": [
            "草",
            "無色"
          ],
          "damage": null,
          "effect": "相手をどくにする。このワザでどくになったポケモンは、ポケモンチェックのときにのせるどくのダメージカウンターの数が2個になる。"
        }
      ],
      "abilities": [
        {
          "kind": "ポケパワー",
          "name": "メタモる",
          "effect": "このパワーは、自分の番に1回使うことができる。自分の山札から「メタモン」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどし、その山札を切る。「メタモる」は、自分の番の中で1回だけ。"
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
        "Printed/sampled surface texture visible; canvasdimensions not provideroptical/cardregion certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "2adda70e2d0a1008c2cb341672c838d1bafdeceec6d04b96b4183f7033d00d35",
    "rawSourceWitnessInsertionSHA": "147a5886f0bbb489c0cca1c7a50a044fa9fd8991ab6e9510709baa677ceeac0a",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/ditto-7",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/rilhqvlo6ck6vo7p/1600.jpg",
      "literalOriginalUrlSha256": "b12e5e471293055585bbf9809175b3077c48b61160210ec0ab666353a448c185",
      "canonicalPrintingId": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "007",
      "printedCollectorNumber": "007/086",
      "printedSetMarkObservation": "Black tower-like Holonmark beside007/086; complete mark/fraction visible.",
      "originalFileByteSha256": "92f0a9ae502e57c7b2022f1ab0ee46f13d506de9b632abb4396215434888cf04",
      "originalByteSize": 463584,
      "width": 1092,
      "height": 1529,
      "actualPrintedName": "メタモン",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "008",
      "closedSourceHandoffSha256": "4f600dd25d3ffdb2744a140921a2bc71cc0e922a3c7fec12ea67dde4086e5762",
      "independentActualSourceReviewSha256": "59955361dc218092e491465947bd5bdf02e25eaf880b37c81e634e96f3addcfe",
      "priorFiniteDecisionSha256": "ae9fa3fa807f3d59f66742d77af7c3980bf362dfbc823957e239663599eade54",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "63ceabb3d1c7969fe3ef07d2c7446fde98c6f5d91f3afec2c7e8df5e16c2f00b",
    "rootDecisionRowCanonicalSha256": "fb90488b9f9962654ec7c8a7f0bfa3a11223b3805e3bf2ff4b7fc3c8b52b3fe3",
    "actualCanonicalSha256": "2adda70e2d0a1008c2cb341672c838d1bafdeceec6d04b96b4183f7033d00d35",
    "witnessSerialized": "{\"printedNativeName\":\"メタモン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":60,\"printedType\":\"草\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"007/086\",\"printedArtist\":\"Yuka Morii\",\"setMarkVisible\":\"Black tower-like Holonmark beside007/086; complete mark/fraction visible.\",\"visibleFinishCues\":\"Green normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actualメタモン fullnativeheader\",\"Distinctgrass HP60/どくどくcost/body/YukaMorii face corroborates cached007 record; no printedformname invented\"],\"attacks\":[{\"name\":\"どくどく\",\"cost\":[\"草\",\"無色\"],\"damage\":null,\"effect\":\"相手をどくにする。このワザでどくになったポケモンは、ポケモンチェックのときにのせるどくのダメージカウンターの数が2個になる。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"メタモる\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札から「メタモン」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどし、その山札を切る。「メタモる」は、自分の番の中で1回だけ。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; canvasdimensions not provideroptical/cardregion certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"メタモン\",\"printedCardClass\":\"Pokemon\",\"printedHP\":60,\"printedType\":\"草\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"007/086\",\"printedArtist\":\"Yuka Morii\",\"setMarkVisible\":\"Black tower-like Holonmark beside007/086; complete mark/fraction visible.\",\"visibleFinishCues\":\"Green normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actualメタモン fullnativeheader\",\"Distinctgrass HP60/どくどくcost/body/YukaMorii face corroborates cached007 record; no printedformname invented\"],\"attacks\":[{\"name\":\"どくどく\",\"cost\":[\"草\",\"無色\"],\"damage\":null,\"effect\":\"相手をどくにする。このワザでどくになったポケモンは、ポケモンチェックのときにのせるどくのダメージカウンターの数が2個になる。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"メタモる\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札から「メタモン」を1枚選び出し、このポケモンと入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、このポケモンは、入れ替えたカードのポケモンになる）。その後、このカードを自分の山札にもどし、その山札を切る。「メタモる」は、自分の番の中で1回だけ。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"炎\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; canvasdimensions not provideroptical/cardregion certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "collector_number": "007",
        "card_native_name": "同上",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "collector_number": "007",
        "card_native_name": "同上",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:b12e5e471293055585bbf9809175b3077c48b61160210ec0ab666353a448c185",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/ditto-7",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/rilhqvlo6ck6vo7p/1600.jpg",
    "productId": "3439493",
    "setCode": "PCG6",
    "currentLabel": "同上",
    "printedName": "メタモン",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "3949b7c058637407457fec7dca941d0ff658710d8d021ba6179b83e985e83205",
    "actualClass": "Pokemon",
    "hp": 60,
    "type": "草",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "007/086",
    "artist": "Yuka Morii",
    "variantId": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "92f0a9ae502e57c7b2022f1ab0ee46f13d506de9b632abb4396215434888cf04",
      "bytes": 463584,
      "width": 1092,
      "height": 1529,
      "rgbaSha256": "3e8682912735ab759794daf39966ee98cff5666c1795152351ee14160e6f63e2"
    },
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "faebe598-d6b1-4240-bcee-ba9dddf47bca": {
    "printingId": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
    "alias": "020",
    "rawCanonicalSha256": "c0987283c5fd4b2f55bff7543a06b06319bc3fdae1a6028eccf308526bffd3ee",
    "bodyCanonicalSha256": "b1b7efe533d26c2eea7410e5d69364e27b8feff2b259bb1706327486b6aeb0b5",
    "controlsCanonicalSha256": "4611ca262d00f9de2336846469be5602809222d176bd6e69fd013cf135c483ff",
    "inputCanonicalSha256": "a812bc0a44f44736877683f4f29a561825eccfb50eb5fa16a49719cfd419f9c6",
    "preparedCanonicalSha256": "a4e57808e3151a09160a1f4433e93648767d5eb264bada8695d3d3ee3c3331e1",
    "entryCanonicalSha256": "61fcbf276f06ba484b4680c3760f02104da30610e1db3e174909ed4c91c3b880",
    "everyRawPrintedWitness": {
      "printedNativeName": "バンギラス",
      "printedCardClass": "Pokemon",
      "printedHP": 120,
      "printedType": "炎・鋼",
      "printedStage": "2進化",
      "printedEvolutionFrom": "サナギラス",
      "printedEvolutionPlacement": "サナギラスから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "020/086",
      "printedArtist": "Mitsuhiro Arita",
      "setMarkVisible": "Blacktower-like Holonmark beside020/086.",
      "visibleFinishCues": "Silver/rainbowframe and darkillustration; currentholo/defaultFALSE retained, physicalfinish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。"
      ],
      "attacks": [
        {
          "name": "デルタクラッシュ",
          "cost": [
            "炎",
            "鋼",
            "無色"
          ],
          "damage": "50+",
          "effect": "のぞむなら、自分のエネルギーを1個トラッシュしてよい。その場合、20ダメージを追加する。"
        }
      ],
      "abilities": [
        {
          "kind": "ポケパワー",
          "name": "クラッシュドロー",
          "effect": "このパワーは、自分の番に1回使うことができる。自分の山札の一番上のカードをオモテにして、そのカードが基本エネルギーなら、自分のポケモンにつける。違うなら、ウラにして、その山札の上にもどす。このポケモンが特殊状態なら、このパワーを使うことはできない。"
        }
      ],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "symbolNotation": "Bracketsdenote actual printedtype symbols, notprintedJapanesewords.",
      "printedWeakness": "草",
      "printedResistance": null,
      "printedRetreatCost": [
        "無色",
        "無色"
      ],
      "qualityAdvisories": [
        "Native500x700canvas belowHDdimension signal retained; darkillustration/readablebody notnativeoptical certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "05cef5326f1a692da17d8c2006e2ea83bb3429d1fd4fe3f29ac9d59000d64209",
    "rawSourceWitnessInsertionSHA": "2ca336fa75ee54bbe5d011c24acaf3686f0762cd604c7645f6126d30645098d7",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/tyranitar-20",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/u2nwj5jdbqijuu6g/1600.jpg",
      "literalOriginalUrlSha256": "c391fa924e9246c1804640dcb9a4fbf2d1462d521c8089cf404b5c3638b6a6ed",
      "canonicalPrintingId": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "020",
      "printedCollectorNumber": "020/086",
      "printedSetMarkObservation": "Blacktower-like Holonmark beside020/086.",
      "originalFileByteSha256": "d62eeb4c8a0bae029a940e140646c7e783ef603b1f3e6ea5ae2ae8f2bfa9df20",
      "originalByteSize": 89392,
      "width": 500,
      "height": 700,
      "actualPrintedName": "バンギラス",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "008",
      "closedSourceHandoffSha256": "4f600dd25d3ffdb2744a140921a2bc71cc0e922a3c7fec12ea67dde4086e5762",
      "independentActualSourceReviewSha256": "59955361dc218092e491465947bd5bdf02e25eaf880b37c81e634e96f3addcfe",
      "priorFiniteDecisionSha256": "ae9fa3fa807f3d59f66742d77af7c3980bf362dfbc823957e239663599eade54",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
    "finish": "holo",
    "isDefault": false,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "fb8eac87644f645b9ad117beb09fc5fc1bbba9477706d22f4adcba353fb8ccf1",
    "rootDecisionRowCanonicalSha256": "b472d5b4b1be903cbe041fa5ce7365b2655e137aabf6a1e7990ee7289d5815bd",
    "actualCanonicalSha256": "05cef5326f1a692da17d8c2006e2ea83bb3429d1fd4fe3f29ac9d59000d64209",
    "witnessSerialized": "{\"printedNativeName\":\"バンギラス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":120,\"printedType\":\"炎・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"サナギラス\",\"printedEvolutionPlacement\":\"サナギラスから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"020/086\",\"printedArtist\":\"Mitsuhiro Arita\",\"setMarkVisible\":\"Blacktower-like Holonmark beside020/086.\",\"visibleFinishCues\":\"Silver/rainbowframe and darkillustration; currentholo/defaultFALSE retained, physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"デルタクラッシュ\",\"cost\":[\"炎\",\"鋼\",\"無色\"],\"damage\":\"50+\",\"effect\":\"のぞむなら、自分のエネルギーを1個トラッシュしてよい。その場合、20ダメージを追加する。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"クラッシュドロー\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札の一番上のカードをオモテにして、そのカードが基本エネルギーなら、自分のポケモンにつける。違うなら、ウラにして、その山札の上にもどす。このポケモンが特殊状態なら、このパワーを使うことはできない。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"symbolNotation\":\"Bracketsdenote actual printedtype symbols, notprintedJapanesewords.\",\"printedWeakness\":\"草\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"qualityAdvisories\":[\"Native500x700canvas belowHDdimension signal retained; darkillustration/readablebody notnativeoptical certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"バンギラス\",\"printedCardClass\":\"Pokemon\",\"printedHP\":120,\"printedType\":\"炎・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"サナギラス\",\"printedEvolutionPlacement\":\"サナギラスから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"020/086\",\"printedArtist\":\"Mitsuhiro Arita\",\"setMarkVisible\":\"Blacktower-like Holonmark beside020/086.\",\"visibleFinishCues\":\"Silver/rainbowframe and darkillustration; currentholo/defaultFALSE retained, physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"デルタクラッシュ\",\"cost\":[\"炎\",\"鋼\",\"無色\"],\"damage\":\"50+\",\"effect\":\"のぞむなら、自分のエネルギーを1個トラッシュしてよい。その場合、20ダメージを追加する。\"}],\"abilities\":[{\"kind\":\"ポケパワー\",\"name\":\"クラッシュドロー\",\"effect\":\"このパワーは、自分の番に1回使うことができる。自分の山札の一番上のカードをオモテにして、そのカードが基本エネルギーなら、自分のポケモンにつける。違うなら、ウラにして、その山札の上にもどす。このポケモンが特殊状態なら、このパワーを使うことはできない。\"}],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"symbolNotation\":\"Bracketsdenote actual printedtype symbols, notprintedJapanesewords.\",\"printedWeakness\":\"草\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\",\"無色\"],\"qualityAdvisories\":[\"Native500x700canvas belowHDdimension signal retained; darkillustration/readablebody notnativeoptical certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "collector_number": "020",
        "card_native_name": "ティラニター（デルタ種）",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "collector_number": "020",
        "card_native_name": "ティラニター（デルタ種）",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:c391fa924e9246c1804640dcb9a4fbf2d1462d521c8089cf404b5c3638b6a6ed",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/tyranitar-20",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/u2nwj5jdbqijuu6g/1600.jpg",
    "productId": "3439506",
    "setCode": "PCG6",
    "currentLabel": "ティラニター（デルタ種）",
    "printedName": "バンギラス",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "3949b7c058637407457fec7dca941d0ff658710d8d021ba6179b83e985e83205",
    "actualClass": "Pokemon",
    "hp": 120,
    "type": "炎・鋼",
    "stage": "2進化",
    "evolvesFrom": "サナギラス",
    "collector": "020/086",
    "artist": "Mitsuhiro Arita",
    "variantId": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "d62eeb4c8a0bae029a940e140646c7e783ef603b1f3e6ea5ae2ae8f2bfa9df20",
      "bytes": 89392,
      "width": 500,
      "height": 700,
      "rgbaSha256": "402fb348ad516ce833befedcbc93e80a1ce3be6038128263f9a1e23213020dd3"
    },
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "bcb2a732-f043-4eac-a767-6515f1c5408d": {
    "printingId": "bcb2a732-f043-4eac-a767-6515f1c5408d",
    "alias": "021",
    "rawCanonicalSha256": "996697fce5b490f66f4ee94b2c9b202ed7fcf45e6d5e7ddc6dfd4088ef74cee6",
    "bodyCanonicalSha256": "17285901d3040665cdc186f36ead0c3613fc1eed4a01f694431c062ce8f84b29",
    "controlsCanonicalSha256": "9cdabdaa0869a4e39c289ac2ccb9ebd7f4443ad7912bec49dc2dc4586884d57a",
    "inputCanonicalSha256": "1c9fcd42dd6c355d193d6dcb6a3d830487e68ca02a745addb92405d2b2da8abd",
    "preparedCanonicalSha256": "da5a58f52e0f57cb74f5aa16cb1262dd20d6a53aacf9a40cb252f05281b6d7e9",
    "entryCanonicalSha256": "3601291d56e94ae62848f3fbf34fc7d0c94800ca40e1bea729bec6697ca434cc",
    "everyRawPrintedWitness": {
      "printedNativeName": "ボーマンダ",
      "printedCardClass": "Pokemon",
      "printedHP": 110,
      "printedType": "炎・鋼",
      "printedStage": "2進化",
      "printedEvolutionFrom": "コモルー",
      "printedEvolutionPlacement": "コモルーから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "021/086",
      "printedArtist": "Ryo Ueda",
      "setMarkVisible": "Blacktower-like Holonmark beside021/086.",
      "visibleFinishCues": "Rainbow/silverframe and diagonalpatternbody; currentholo/defaultFALSE retained, physicalfinish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。"
      ],
      "attacks": [
        {
          "name": "ほのおのまい",
          "cost": [
            "炎",
            "無色"
          ],
          "damage": "30",
          "effect": "自分のトラッシュから［炎］エネルギーを1枚選び出し、自分のポケモンにつける。"
        },
        {
          "name": "デルタブラスト",
          "cost": [
            "炎",
            "鋼",
            "無色",
            "無色"
          ],
          "damage": "100",
          "effect": "自分の［鋼］エネルギーを1個トラッシュする。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "symbolNotation": "Bracketsdenote actual printedenergy/type symbols, notprintedJapanesewords.",
      "printedWeakness": "無色",
      "printedResistance": [
        "炎-30",
        "闘-30"
      ],
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Printed/sampled surface texture visible; wholecanvas dimensions notcardregion/nativeoptical certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "4e945bcb4c0c735b8cc1a1106ce329efddbe0cb3bcc1a5c5f02f14b0ce3d17eb",
    "rawSourceWitnessInsertionSHA": "fdfc99bbc4b43ef12f163429ed686f33e066d5c498d37e2deca135a6656de170",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/salamence-21",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/93abcc9e43a3b40006094f2d32e8627b6f5512f1aa437bd8e8d4f04fcde8c0f1/1600.jpg",
      "literalOriginalUrlSha256": "85d85af671a17a36c6e73fdfd3f51002f031e3f14cb4fb44c4dfa1174e727f2a",
      "canonicalPrintingId": "bcb2a732-f043-4eac-a767-6515f1c5408d",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "021",
      "printedCollectorNumber": "021/086",
      "printedSetMarkObservation": "Blacktower-like Holonmark beside021/086.",
      "originalFileByteSha256": "d16d784f3652f194fab963b95660e9fed4317715a8630c9cb0819e305186421e",
      "originalByteSize": 323665,
      "width": 1142,
      "height": 1600,
      "actualPrintedName": "ボーマンダ",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "008",
      "closedSourceHandoffSha256": "4f600dd25d3ffdb2744a140921a2bc71cc0e922a3c7fec12ea67dde4086e5762",
      "independentActualSourceReviewSha256": "59955361dc218092e491465947bd5bdf02e25eaf880b37c81e634e96f3addcfe",
      "priorFiniteDecisionSha256": "ae9fa3fa807f3d59f66742d77af7c3980bf362dfbc823957e239663599eade54",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "6451b1a6-b023-402b-822f-3409512df5d9",
    "finish": "holo",
    "isDefault": false,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "9d9385eb23df3665ceecb8bb3ecc8ef7febd60c611c5bdc4e0ad612eab3c969d",
    "rootDecisionRowCanonicalSha256": "258f624ffe52ddf683d1a42017956f4d3b3187823cf6b64337bd1a40b1e12c53",
    "actualCanonicalSha256": "4e945bcb4c0c735b8cc1a1106ce329efddbe0cb3bcc1a5c5f02f14b0ce3d17eb",
    "witnessSerialized": "{\"printedNativeName\":\"ボーマンダ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":110,\"printedType\":\"炎・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"コモルー\",\"printedEvolutionPlacement\":\"コモルーから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"021/086\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Blacktower-like Holonmark beside021/086.\",\"visibleFinishCues\":\"Rainbow/silverframe and diagonalpatternbody; currentholo/defaultFALSE retained, physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"ほのおのまい\",\"cost\":[\"炎\",\"無色\"],\"damage\":\"30\",\"effect\":\"自分のトラッシュから［炎］エネルギーを1枚選び出し、自分のポケモンにつける。\"},{\"name\":\"デルタブラスト\",\"cost\":[\"炎\",\"鋼\",\"無色\",\"無色\"],\"damage\":\"100\",\"effect\":\"自分の［鋼］エネルギーを1個トラッシュする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"symbolNotation\":\"Bracketsdenote actual printedenergy/type symbols, notprintedJapanesewords.\",\"printedWeakness\":\"無色\",\"printedResistance\":[\"炎-30\",\"闘-30\"],\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; wholecanvas dimensions notcardregion/nativeoptical certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ボーマンダ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":110,\"printedType\":\"炎・鋼\",\"printedStage\":\"2進化\",\"printedEvolutionFrom\":\"コモルー\",\"printedEvolutionPlacement\":\"コモルーから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"021/086\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Blacktower-like Holonmark beside021/086.\",\"visibleFinishCues\":\"Rainbow/silverframe and diagonalpatternbody; currentholo/defaultFALSE retained, physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［炎］［鋼］の2つのタイプを持つポケモンです。\"],\"attacks\":[{\"name\":\"ほのおのまい\",\"cost\":[\"炎\",\"無色\"],\"damage\":\"30\",\"effect\":\"自分のトラッシュから［炎］エネルギーを1枚選び出し、自分のポケモンにつける。\"},{\"name\":\"デルタブラスト\",\"cost\":[\"炎\",\"鋼\",\"無色\",\"無色\"],\"damage\":\"100\",\"effect\":\"自分の［鋼］エネルギーを1個トラッシュする。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"symbolNotation\":\"Bracketsdenote actual printedenergy/type symbols, notprintedJapanesewords.\",\"printedWeakness\":\"無色\",\"printedResistance\":[\"炎-30\",\"闘-30\"],\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; wholecanvas dimensions notcardregion/nativeoptical certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "collector_number": "021",
        "card_native_name": "サラメンス（デルタ種）",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "collector_number": "021",
        "card_native_name": "サラメンス（デルタ種）",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:85d85af671a17a36c6e73fdfd3f51002f031e3f14cb4fb44c4dfa1174e727f2a",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/salamence-21",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/93abcc9e43a3b40006094f2d32e8627b6f5512f1aa437bd8e8d4f04fcde8c0f1/1600.jpg",
    "productId": "3439507",
    "setCode": "PCG6",
    "currentLabel": "サラメンス（デルタ種）",
    "printedName": "ボーマンダ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "3949b7c058637407457fec7dca941d0ff658710d8d021ba6179b83e985e83205",
    "actualClass": "Pokemon",
    "hp": 110,
    "type": "炎・鋼",
    "stage": "2進化",
    "evolvesFrom": "コモルー",
    "collector": "021/086",
    "artist": "Ryo Ueda",
    "variantId": "6451b1a6-b023-402b-822f-3409512df5d9",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "d16d784f3652f194fab963b95660e9fed4317715a8630c9cb0819e305186421e",
      "bytes": 323665,
      "width": 1142,
      "height": 1600,
      "rgbaSha256": "02a883278ecdfcbc52ebb5bd33471467d63f7f46297fe4f4752f9d5296f09782"
    },
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "fc9ae1df-0f27-470e-a866-3178f51b68c4": {
    "printingId": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
    "alias": "044",
    "rawCanonicalSha256": "fbec56695d5a255544e52a44c8bbab6ff75459e8ddb3e2ff3b6365b7e030c763",
    "bodyCanonicalSha256": "7372597b9b9edec24a48cdcddcaefe5a964f51c18be145d40a6dc71be73187c2",
    "controlsCanonicalSha256": "0a9e6a8934f300e31ad9a2f4c9483cbbb0ec0988cdcfa125374322305174ce10",
    "inputCanonicalSha256": "0a75c556c509fd3ab414b0d183e8ea7798a70a60f0feb73c3ab88279dfebb239",
    "preparedCanonicalSha256": "2f32a9026dc87c6c0cd6c983ea388c70ced842aa434e15ee8a3f37c9680e9f53",
    "entryCanonicalSha256": "680bc1960cacdfd40931a9826bfc80048380be3d5fb3e1a1314f71071a9a3a45",
    "everyRawPrintedWitness": {
      "printedNativeName": "スリープ",
      "printedCardClass": "Pokemon",
      "printedHP": 50,
      "printedType": "超",
      "printedStage": "たね",
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "044/086",
      "printedArtist": "Tomokazu Komiya",
      "setMarkVisible": "Blacktower-like Holonmark beside044/086.",
      "visibleFinishCues": "Purple normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [],
      "attacks": [
        {
          "name": "かなしばり",
          "cost": [
            "超"
          ],
          "damage": null,
          "effect": "相手の持っているワザを1つ選ぶ。次の相手の番、このワザを受けた相手は、そのワザを使うことができない。"
        },
        {
          "name": "ずつき",
          "cost": [
            "無色",
            "無色"
          ],
          "damage": "20",
          "effect": null
        }
      ],
      "abilities": [],
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
        "Printed/sampled surface texture visible; dimensionsnotprovideroptical/cardregion certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "27770582ed9dba5cc0acc05dd393220244cc5a9c5405931996c99ea72ec27a8e",
    "rawSourceWitnessInsertionSHA": "5ea2f9600177e09b3808a52bcb8e42cba0efadab527336b7f137097ebb29d441",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/drowzee-44",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/us4h4cdsxukvq27z/1600.jpg",
      "literalOriginalUrlSha256": "62d2258c5d1017f962ea645fb763c32cb13436d6ccadb33339bbddc3762b8b37",
      "canonicalPrintingId": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "044",
      "printedCollectorNumber": "044/086",
      "printedSetMarkObservation": "Blacktower-like Holonmark beside044/086.",
      "originalFileByteSha256": "79a4fc0c159a9a61be19247ffdc5c096967e0eb600c127728f2b0d6ff64977b3",
      "originalByteSize": 496353,
      "width": 1026,
      "height": 1432,
      "actualPrintedName": "スリープ",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "009",
      "closedSourceHandoffSha256": "d3254352263f9938509cc7b899c4947c617bb92d6f37c35c6dc46da300e7bfd5",
      "independentActualSourceReviewSha256": "2b28acbbd0298df871300839787ae064069cbb843f3f3fb8e19d16d504bc1ea1",
      "priorFiniteDecisionSha256": "98b69c75b155971a789fef0a2967f9abc2c60a193d3210a0e098eb5e27486dab",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "32577dac-0959-40b9-9eb6-879c52dd3c93",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "5cc8d2f8c744541ee1c9b9a4bcfbddb88f283f58e97ee538cd2caae18836e343",
    "rootDecisionRowCanonicalSha256": "1f209f34798eeb858761a61c24c5ae78e2d56a05194d4c464651d4abfff3d637",
    "actualCanonicalSha256": "27770582ed9dba5cc0acc05dd393220244cc5a9c5405931996c99ea72ec27a8e",
    "witnessSerialized": "{\"printedNativeName\":\"スリープ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":50,\"printedType\":\"超\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"044/086\",\"printedArtist\":\"Tomokazu Komiya\",\"setMarkVisible\":\"Blacktower-like Holonmark beside044/086.\",\"visibleFinishCues\":\"Purple normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"かなしばり\",\"cost\":[\"超\"],\"damage\":null,\"effect\":\"相手の持っているワザを1つ選ぶ。次の相手の番、このワザを受けた相手は、そのワザを使うことができない。\"},{\"name\":\"ずつき\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":null}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; dimensionsnotprovideroptical/cardregion certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"スリープ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":50,\"printedType\":\"超\",\"printedStage\":\"たね\",\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"044/086\",\"printedArtist\":\"Tomokazu Komiya\",\"setMarkVisible\":\"Blacktower-like Holonmark beside044/086.\",\"visibleFinishCues\":\"Purple normal-lookingbody withoutclearfoilpattern; physicalfinish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[],\"attacks\":[{\"name\":\"かなしばり\",\"cost\":[\"超\"],\"damage\":null,\"effect\":\"相手の持っているワザを1つ選ぶ。次の相手の番、このワザを受けた相手は、そのワザを使うことができない。\"},{\"name\":\"ずつき\",\"cost\":[\"無色\",\"無色\"],\"damage\":\"20\",\"effect\":null}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"超\",\"printedResistance\":null,\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Printed/sampled surface texture visible; dimensionsnotprovideroptical/cardregion certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "collector_number": "044",
        "card_native_name": "ドロージー",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "collector_number": "044",
        "card_native_name": "ドロージー",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:62d2258c5d1017f962ea645fb763c32cb13436d6ccadb33339bbddc3762b8b37",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/drowzee-44",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/us4h4cdsxukvq27z/1600.jpg",
    "productId": "3439530",
    "setCode": "PCG6",
    "currentLabel": "ドロージー",
    "printedName": "スリープ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "2232feeed96cfa54eb4c31ee3098a3f0e6100ed701b2e2610ec54f6f7849d6ed",
    "actualClass": "Pokemon",
    "hp": 50,
    "type": "超",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "044/086",
    "artist": "Tomokazu Komiya",
    "variantId": "32577dac-0959-40b9-9eb6-879c52dd3c93",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "79a4fc0c159a9a61be19247ffdc5c096967e0eb600c127728f2b0d6ff64977b3",
      "bytes": 496353,
      "width": 1026,
      "height": 1432,
      "rgbaSha256": "57f11f25f8a6a2af395e4a20fe3fc0d7db4ce710e418f23afc5d5c25b7a90d82"
    },
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "701a96ec-0100-41ea-b324-b6adc450fb2f": {
    "printingId": "701a96ec-0100-41ea-b324-b6adc450fb2f",
    "alias": "070",
    "rawCanonicalSha256": "29c336c19d8e44916dae0d4ba6aa7383cfc6706bd6fc0c813b71e1a81a01bad3",
    "bodyCanonicalSha256": "aca0ac41e10fd6fc23a9066aadef93ababf4da7c283d8f7bc8fdd0c3ed0be485",
    "controlsCanonicalSha256": "8e4f08225d546e79b394407f0f98053cff7306f2cfbc36de2ec6b5969c1bd5fe",
    "inputCanonicalSha256": "dabb36fd3777fa28ba012016c39df5d24a73270d2077d8f77ff27a77d37fa01c",
    "preparedCanonicalSha256": "bba8a663df36c9d69748e4bcf2a3e942aae8fb928d2784c2b97e8c71812e53c2",
    "entryCanonicalSha256": "8aea4d03c00b65cb116da53ca5c78b3bf93152358b6860faa68f2e5d76384736",
    "everyRawPrintedWitness": {
      "printedNativeName": "グラエナ",
      "printedCardClass": "Pokemon",
      "printedHP": 70,
      "printedType": "悪・鋼",
      "printedStage": "1進化",
      "printedEvolutionFrom": "ポチエナ",
      "printedEvolutionPlacement": "ポチエナから進化",
      "printedPokemonExRule": null,
      "printedCollectorNumber": "070/086",
      "printedArtist": "Hajime Kusajima",
      "setMarkVisible": "Black Holon tower-like setmark beside070/086.",
      "visibleFinishCues": "Reflective rainbow perimeter and silver patterned body; actual physical finish not certified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": null,
      "printedSpecialIdentityMarkers": [
        "Actual δ-デルタ種 header",
        "このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。",
        "Actual ポケモンex qualifier in first attack effect"
      ],
      "attacks": [
        {
          "name": "デルタファング",
          "cost": [
            "悪",
            "無色"
          ],
          "damage": "20",
          "effect": "相手がポケモンexなら、次の相手の番、このワザを受けた相手は、ワザを使うことができない。"
        },
        {
          "name": "むらがる",
          "cost": [
            "鋼",
            "無色"
          ],
          "damage": "10×",
          "effect": "自分の場の、［悪］タイプまたは［鋼］タイプを持つポケモンの数×10ダメージ。"
        }
      ],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "printedWeakness": "闘",
      "printedResistance": "超 -30",
      "printedRetreatCost": [
        "無色"
      ],
      "qualityAdvisories": [
        "Visible fine printed/sample surface texture; original canvas is not certified card-region/native optical resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "b34eedcfd84ca799995c85ed29d7be3b456b0fbc8c1abc76c45fdb53925831cd",
    "rawSourceWitnessInsertionSHA": "d6ad8b90579332bf0091304d80e3c76789f8ce5cc4522d9d63f9df60f99a83c7",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/mightyena-70",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/ttsyfo7b4222sxhb/1600.jpg",
      "literalOriginalUrlSha256": "a7863155f818a311d0e1d8dae7b00cb1d2f5d4a36f5f02d86fb9384634f7334c",
      "canonicalPrintingId": "701a96ec-0100-41ea-b324-b6adc450fb2f",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "070",
      "printedCollectorNumber": "070/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside070/086.",
      "originalFileByteSha256": "70e1ee903f0b04aaea0cb6e673f6e424a762fa105d01f89dcbcb7b3fd7567b19",
      "originalByteSize": 568615,
      "width": 1113,
      "height": 1562,
      "actualPrintedName": "グラエナ",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
    "finish": "holo",
    "isDefault": false,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "1bf21592c6b2d242bc2ad03f939186d85ab70799b38605935b54438867e07e05",
    "rootDecisionRowCanonicalSha256": "4313802474b7e44c875a514ed2093e1a69bea3f706df429b926f89808ee20ebc",
    "actualCanonicalSha256": "b34eedcfd84ca799995c85ed29d7be3b456b0fbc8c1abc76c45fdb53925831cd",
    "witnessSerialized": "{\"printedNativeName\":\"グラエナ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":70,\"printedType\":\"悪・鋼\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"ポチエナ\",\"printedEvolutionPlacement\":\"ポチエナから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"070/086\",\"printedArtist\":\"Hajime Kusajima\",\"setMarkVisible\":\"Black Holon tower-like setmark beside070/086.\",\"visibleFinishCues\":\"Reflective rainbow perimeter and silver patterned body; actual physical finish not certified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。\",\"Actual ポケモンex qualifier in first attack effect\"],\"attacks\":[{\"name\":\"デルタファング\",\"cost\":[\"悪\",\"無色\"],\"damage\":\"20\",\"effect\":\"相手がポケモンexなら、次の相手の番、このワザを受けた相手は、ワザを使うことができない。\"},{\"name\":\"むらがる\",\"cost\":[\"鋼\",\"無色\"],\"damage\":\"10×\",\"effect\":\"自分の場の、［悪］タイプまたは［鋼］タイプを持つポケモンの数×10ダメージ。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"闘\",\"printedResistance\":\"超 -30\",\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Visible fine printed/sample surface texture; original canvas is not certified card-region/native optical resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"グラエナ\",\"printedCardClass\":\"Pokemon\",\"printedHP\":70,\"printedType\":\"悪・鋼\",\"printedStage\":\"1進化\",\"printedEvolutionFrom\":\"ポチエナ\",\"printedEvolutionPlacement\":\"ポチエナから進化\",\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"070/086\",\"printedArtist\":\"Hajime Kusajima\",\"setMarkVisible\":\"Black Holon tower-like setmark beside070/086.\",\"visibleFinishCues\":\"Reflective rainbow perimeter and silver patterned body; actual physical finish not certified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":null,\"printedSpecialIdentityMarkers\":[\"Actual δ-デルタ種 header\",\"このポケモンは［悪］［鋼］の2つのタイプを持つポケモンです。\",\"Actual ポケモンex qualifier in first attack effect\"],\"attacks\":[{\"name\":\"デルタファング\",\"cost\":[\"悪\",\"無色\"],\"damage\":\"20\",\"effect\":\"相手がポケモンexなら、次の相手の番、このワザを受けた相手は、ワザを使うことができない。\"},{\"name\":\"むらがる\",\"cost\":[\"鋼\",\"無色\"],\"damage\":\"10×\",\"effect\":\"自分の場の、［悪］タイプまたは［鋼］タイプを持つポケモンの数×10ダメージ。\"}],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"printedWeakness\":\"闘\",\"printedResistance\":\"超 -30\",\"printedRetreatCost\":[\"無色\"],\"qualityAdvisories\":[\"Visible fine printed/sample surface texture; original canvas is not certified card-region/native optical resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "collector_number": "070",
        "card_native_name": "マイティエナ（デルタ種）",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "collector_number": "070",
        "card_native_name": "マイティエナ（デルタ種）",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "variant_code": "holo",
        "finish_code": "holo",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:a7863155f818a311d0e1d8dae7b00cb1d2f5d4a36f5f02d86fb9384634f7334c",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/mightyena-70",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ttsyfo7b4222sxhb/1600.jpg",
    "productId": "3439556",
    "setCode": "PCG6",
    "currentLabel": "マイティエナ（デルタ種）",
    "printedName": "グラエナ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "c384301e563f58a8f37509caf1a29301982c79fc0abf7b1405a64c1a050c0a0e",
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "悪・鋼",
    "stage": "1進化",
    "evolvesFrom": "ポチエナ",
    "collector": "070/086",
    "artist": "Hajime Kusajima",
    "variantId": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "70e1ee903f0b04aaea0cb6e673f6e424a762fa105d01f89dcbcb7b3fd7567b19",
      "bytes": 568615,
      "width": 1113,
      "height": 1562,
      "rgbaSha256": "b8fffd5ddd232b258161c0ed220866b5ab31636a24602f791dd5611ca6510a78"
    },
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rules": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "7734f437-9514-4c5a-ace5-7359a60216ad": {
    "printingId": "7734f437-9514-4c5a-ace5-7359a60216ad",
    "alias": "078",
    "rawCanonicalSha256": "757f2fe67b9f67b7cb4fc36c3c20b0a15e73fc05b5fd30ee3df550c800a65666",
    "bodyCanonicalSha256": "357bcb7b509b1c66ad9632ff99b2ea950a7d561a75f142d20a79af7843cf8732",
    "controlsCanonicalSha256": "c25f85d804fbcdde4ee86590eff6c2d259096caabd43947835359c0d20a7525c",
    "inputCanonicalSha256": "4e4a190f4af0cff205ce8ef1f1307d926ecdd2f2bc5fcc62369468c61f1eb611",
    "preparedCanonicalSha256": "d8fe82767b9b8d58871a5f17972f634d9b94980f4aa0eedd81379c50b8e3e2fc",
    "entryCanonicalSha256": "e420a8122897b2ef2bf1e6e229750828ff29619c60e2a1d9a7bfc9d9d7deb6fe",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンの研究員",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "078/086",
      "printedArtist": "Kanako Eo",
      "setMarkVisible": "Black Holon tower-like setmark beside078/086.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分の山札から、「δ-デルタ種」のポケモン、または、［鋼］エネルギーを1枚選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual サポーター header",
        "Actual「δ-デルタ種」 qualifier in rules"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide source canvas is below genericHD width signal; no enlargement or native optical certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "20e7f5dd70b97748c5fea929b7e63f3efda40714c54ac090adfb50600b428c20",
    "rawSourceWitnessInsertionSHA": "897234937deb3876d19c821ed8580eb7c3bb9f791a0a7123f40dcf7a31296695",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-researcher-78",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/tpmjakdc3zwa5m7t/1600.jpg",
      "literalOriginalUrlSha256": "7208ced4c9c8f06b3e747e1c5d7a3688008e761e7190b4e2c4a1267498e29ee1",
      "canonicalPrintingId": "7734f437-9514-4c5a-ace5-7359a60216ad",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "078",
      "printedCollectorNumber": "078/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside078/086.",
      "originalFileByteSha256": "fc4bf0d3fdc44d675f1e62304ede414956a82f130285b9473ba8d8543af6da02",
      "originalByteSize": 78899,
      "width": 500,
      "height": 698,
      "actualPrintedName": "ホロンの研究員",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "33542dbb-3aee-4441-bc34-15d6c1743acc",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "dceb173cf729507b107722c09b09e1c51b20ed19eb7d291dcc184353d4b0b747",
    "rootDecisionRowCanonicalSha256": "b12d5bbcde5b08f91e810075dd21049379fc7cdc725ad5efff3265bd07f7f457",
    "actualCanonicalSha256": "20e7f5dd70b97748c5fea929b7e63f3efda40714c54ac090adfb50600b428c20",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンの研究員\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"078/086\",\"printedArtist\":\"Kanako Eo\",\"setMarkVisible\":\"Black Holon tower-like setmark beside078/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分の山札から、「δ-デルタ種」のポケモン、または、［鋼］エネルギーを1枚選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\",\"Actual「δ-デルタ種」 qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide source canvas is below genericHD width signal; no enlargement or native optical certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンの研究員\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"078/086\",\"printedArtist\":\"Kanako Eo\",\"setMarkVisible\":\"Black Holon tower-like setmark beside078/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分の山札から、「δ-デルタ種」のポケモン、または、［鋼］エネルギーを1枚選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\",\"Actual「δ-デルタ種」 qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide source canvas is below genericHD width signal; no enlargement or native optical certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "collector_number": "078",
        "card_native_name": "ホロン研究者",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "collector_number": "078",
        "card_native_name": "ホロン研究者",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:7208ced4c9c8f06b3e747e1c5d7a3688008e761e7190b4e2c4a1267498e29ee1",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-researcher-78",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/tpmjakdc3zwa5m7t/1600.jpg",
    "productId": "3439564",
    "setCode": "PCG6",
    "currentLabel": "ホロン研究者",
    "printedName": "ホロンの研究員",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "c384301e563f58a8f37509caf1a29301982c79fc0abf7b1405a64c1a050c0a0e",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "078/086",
    "artist": "Kanako Eo",
    "variantId": "33542dbb-3aee-4441-bc34-15d6c1743acc",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "fc4bf0d3fdc44d675f1e62304ede414956a82f130285b9473ba8d8543af6da02",
      "bytes": 78899,
      "width": 500,
      "height": 698,
      "rgbaSha256": "5ec73bb490c695185d813fd80ea5940cea64ba151ca651f045d4c48a69fb6c64"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分の山札から、「δ-デルタ種」のポケモン、または、［鋼］エネルギーを1枚選び出し、相手プレイヤーに見せてから、手札に加える。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "bafca88a-6810-411a-8a1f-ca250618a502": {
    "printingId": "bafca88a-6810-411a-8a1f-ca250618a502",
    "alias": "080",
    "rawCanonicalSha256": "2c4779189a5d2653f209b3fb3dc2a125ef2390a0c5ad59cbf02dbbbf47e4e268",
    "bodyCanonicalSha256": "3b626a0256990c7f7c754efc86e2e516aaefbe36a3b2c932e42a1d0e03cd2b2c",
    "controlsCanonicalSha256": "b248256d9c0aa10eacc8733da268f9e8dc92d583c696076e1d384b12335f30c9",
    "inputCanonicalSha256": "3bd5010f46eb6dcbfd11de7579cd8d10a028f6855036df66cdaa46994062f0ee",
    "preparedCanonicalSha256": "811f717e61a1d651c7b7844c43691b8f8b2b5b5c2ca7fa5b162691d249b6f04b",
    "entryCanonicalSha256": "b049d94c1eefe749898ddb1de7a5bcb8ef8a5cc049a2be804690498a276c208d",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンの農夫",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "080/086",
      "printedArtist": "Kouki Saitou",
      "setMarkVisible": "Black Holon tower-like setmark beside080/086.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分のトラッシュから、「ポケモン」を3枚と「基本エネルギー」を3枚選び出し、相手プレイヤーに見せてから、自分の山札にもどす。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual サポーター header"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide complete source canvas below genericHD signal; not enlarged or certified native optical/card-region resolution."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "c9b38975d01e220a04fb1964fb9fb8c30c0ae2f81c398299d4c94d0d7f967b4b",
    "rawSourceWitnessInsertionSHA": "87b82f3092ca7b3c33d9734f7bde452f4ce228126f5e330d2602dda5d4072ed6",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-farmer-80",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/7jsgpvtenieodcqg/1600.jpg",
      "literalOriginalUrlSha256": "09488e73bb024ba87d41275530277db99b5f69b4e3040d7f93b89dbc7fb3e595",
      "canonicalPrintingId": "bafca88a-6810-411a-8a1f-ca250618a502",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "080",
      "printedCollectorNumber": "080/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside080/086.",
      "originalFileByteSha256": "781351651d711f7109428932aa60ad1a81205bf5c1125fec7de2e928211b2533",
      "originalByteSize": 75672,
      "width": 500,
      "height": 699,
      "actualPrintedName": "ホロンの農夫",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "f9a06055d6a1c8d0741a0a77618cd4f62f298da94538c8643aed9c17c78ab770",
    "rootDecisionRowCanonicalSha256": "a955dba8c7aa88607f63411e2758a8026631a747ffa451fd739a8e4f8dd637f4",
    "actualCanonicalSha256": "c9b38975d01e220a04fb1964fb9fb8c30c0ae2f81c398299d4c94d0d7f967b4b",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンの農夫\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"080/086\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Black Holon tower-like setmark beside080/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分のトラッシュから、「ポケモン」を3枚と「基本エネルギー」を3枚選び出し、相手プレイヤーに見せてから、自分の山札にもどす。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete source canvas below genericHD signal; not enlarged or certified native optical/card-region resolution.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンの農夫\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"080/086\",\"printedArtist\":\"Kouki Saitou\",\"setMarkVisible\":\"Black Holon tower-like setmark beside080/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\\n\\n自分のトラッシュから、「ポケモン」を3枚と「基本エネルギー」を3枚選び出し、相手プレイヤーに見せてから、自分の山札にもどす。その後、その山札を切る。\\n\\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual サポーター header\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete source canvas below genericHD signal; not enlarged or certified native optical/card-region resolution.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "collector_number": "080",
        "card_native_name": "ホロン農家",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "collector_number": "080",
        "card_native_name": "ホロン農家",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:09488e73bb024ba87d41275530277db99b5f69b4e3040d7f93b89dbc7fb3e595",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-farmer-80",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/7jsgpvtenieodcqg/1600.jpg",
    "productId": "3439566",
    "setCode": "PCG6",
    "currentLabel": "ホロン農家",
    "printedName": "ホロンの農夫",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "c384301e563f58a8f37509caf1a29301982c79fc0abf7b1405a64c1a050c0a0e",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "080/086",
    "artist": "Kouki Saitou",
    "variantId": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "781351651d711f7109428932aa60ad1a81205bf5c1125fec7de2e928211b2533",
      "bytes": 75672,
      "width": 500,
      "height": 699,
      "rgbaSha256": "cf3387f2c43e7cf7e3e080464e8e8f7d19dda5f2d2ed42357631951f2f2af272"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の手札からカードを1枚トラッシュしなければ、このカードを使うことはできない。\n\n自分のトラッシュから、「ポケモン」を3枚と「基本エネルギー」を3枚選び出し、相手プレイヤーに見せてから、自分の山札にもどす。その後、その山札を切る。\n\nサポーターは、自分の番に1回だけ使うことができる。使ったら、自分のバトル場の横におき、自分の番の終わりにトラッシュする。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "6176b1d7-f194-4edb-a627-c0a73fa04f5b": {
    "printingId": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
    "alias": "083",
    "rawCanonicalSha256": "1a9142516e27952777356d5f41b8a9211f6326de826cec8cb1c928567e5f3563",
    "bodyCanonicalSha256": "b13a8f80fe61e54202fdea2eaf6730d600bf8b2c3a5b18d87c800590635bc8da",
    "controlsCanonicalSha256": "0caf132ddd6cd38212a8ee4517f03a1cba3b9ee01fb98c252328fe9d92f7d6d3",
    "inputCanonicalSha256": "d1d2d0de5dd9f3b4e25f2d4bb1a1be526eca5d477a86ea7bd6eb99699e9884bb",
    "preparedCanonicalSha256": "6506c905435e5199fbcd186451cceec25f5a65bfdc11598cb8fa84e4b4d499bf",
    "entryCanonicalSha256": "08a5010d5cf92d45e1e588f337216a70d60b1915e5213acac00d767496b7caa4",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンの廃墟",
      "printedCardClass": "Trainer",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "083/086",
      "printedArtist": "Ryo Ueda",
      "setMarkVisible": "Black Holon tower-like setmark beside083/086.",
      "visibleFinishCues": "Silver normal-looking Trainer frame; physical finish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "自分の場に「δ-デルタ種」のポケモンがいるプレイヤーは、それぞれ、自分の番ごとに1回、自分の山札からカードを1枚引いてよい。その場合、自分の手札からカードを1枚選び出し、トラッシュする。\n\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。",
      "printedSpecialIdentityMarkers": [
        "Actual スタジアム header",
        "Actual「δ-デルタ種」 qualifier in rules"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide complete original below genericHD canvas signal; no enlargement or native optical certificate."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "a59447a620bb03441f538860e13c78e092a7c68f70ed7c26506e3bc6102d83a4",
    "rawSourceWitnessInsertionSHA": "6b84f5c160744320df028464c7880bf9cfab66e010583927b73cfc0ac81668ed",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-ruins-83",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/ktozgs6qv2bpkkjj/1600.jpg",
      "literalOriginalUrlSha256": "1c802c238faaf5ac9cc2eee16f50d0dc694d9a0a056c6fb8b71aa771e45b9caa",
      "canonicalPrintingId": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "083",
      "printedCollectorNumber": "083/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside083/086.",
      "originalFileByteSha256": "81500d92dcd34fbc7871b3fe5573b1a0e1aeee11042d1f9719c7a71d454a8596",
      "originalByteSize": 76580,
      "width": 500,
      "height": 701,
      "actualPrintedName": "ホロンの廃墟",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": null
    },
    "expectedVariantId": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": false,
    "rawHistoricalHolds": [],
    "finiteEnergyCategoryQualification": null,
    "rowCanonicalSha256": "e829de3de5520743913b9b441a7639babef8748325e1e1515d707ed756660e4b",
    "rootDecisionRowCanonicalSha256": "91eaf7c5c7da46e6b9b2786e1923941e4da10d1b8e5488c40d6ddf2dfad4a75d",
    "actualCanonicalSha256": "a59447a620bb03441f538860e13c78e092a7c68f70ed7c26506e3bc6102d83a4",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンの廃墟\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"083/086\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Black Holon tower-like setmark beside083/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の場に「δ-デルタ種」のポケモンがいるプレイヤーは、それぞれ、自分の番ごとに1回、自分の山札からカードを1枚引いてよい。その場合、自分の手札からカードを1枚選び出し、トラッシュする。\\n\\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual スタジアム header\",\"Actual「δ-デルタ種」 qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete original below genericHD canvas signal; no enlargement or native optical certificate.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンの廃墟\",\"printedCardClass\":\"Trainer\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"083/086\",\"printedArtist\":\"Ryo Ueda\",\"setMarkVisible\":\"Black Holon tower-like setmark beside083/086.\",\"visibleFinishCues\":\"Silver normal-looking Trainer frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"自分の場に「δ-デルタ種」のポケモンがいるプレイヤーは、それぞれ、自分の番ごとに1回、自分の山札からカードを1枚引いてよい。その場合、自分の手札からカードを1枚選び出し、トラッシュする。\\n\\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。\",\"printedSpecialIdentityMarkers\":[\"Actual スタジアム header\",\"Actual「δ-デルタ種」 qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide complete original below genericHD canvas signal; no enlargement or native optical certificate.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "collector_number": "083",
        "card_native_name": "ホロン遺跡",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "collector_number": "083",
        "card_native_name": "ホロン遺跡",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:1c802c238faaf5ac9cc2eee16f50d0dc694d9a0a056c6fb8b71aa771e45b9caa",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-ruins-83",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ktozgs6qv2bpkkjj/1600.jpg",
    "productId": "3439569",
    "setCode": "PCG6",
    "currentLabel": "ホロン遺跡",
    "printedName": "ホロンの廃墟",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "c384301e563f58a8f37509caf1a29301982c79fc0abf7b1405a64c1a050c0a0e",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "083/086",
    "artist": "Ryo Ueda",
    "variantId": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "81500d92dcd34fbc7871b3fe5573b1a0e1aeee11042d1f9719c7a71d454a8596",
      "bytes": 76580,
      "width": 500,
      "height": 701,
      "rgbaSha256": "21eb3c00967a5ab3e2ae9952e5e5843a78a49780e545e228136ba389e45fd1c8"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "自分の場に「δ-デルタ種」のポケモンがいるプレイヤーは、それぞれ、自分の番ごとに1回、自分の山札からカードを1枚引いてよい。その場合、自分の手札からカードを1枚選び出し、トラッシュする。\n\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "cc1681cb-030e-4d1e-a144-d68ff927f111": {
    "printingId": "cc1681cb-030e-4d1e-a144-d68ff927f111",
    "alias": "085",
    "rawCanonicalSha256": "64c0cb3889d3dd4cf266c936cf8b9f02db081cdd2210e17b9cb97dfcf7d83a4a",
    "bodyCanonicalSha256": "97b3eb84546635cd96b87131d9ca817d8978a34ebfa78a4723525af319ad3306",
    "controlsCanonicalSha256": "c4c188c55a26c5026a2dd404ac5a28c0494a217735b01ddbc1cdc32bd67d218f",
    "inputCanonicalSha256": "044db89b222c662ee150f1aa80b94e907ae09c8f62d4a47268ae9aa109e58c62",
    "preparedCanonicalSha256": "b053c5bf15cdc1efbfda5058b4c77df7592de60722db302b7e732c4c8129c125",
    "entryCanonicalSha256": "9bb45eb5564df24bda258dfe9f91e730fa59ec21bfd888b322cf9b926c264d20",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンエネルギー SYN:FF",
      "printedCardClass": "Energy",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "085/086",
      "printedArtist": "Takumi Akabane",
      "setMarkVisible": "Black Holon tower-like setmark beside085/086.",
      "visibleFinishCues": "Silver normal-looking Energy frame; physical finish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "このカードは［無色］エネルギー1個ぶんとしてはたらく。\nこのカードをつけているポケモンに、\n［炎］の基本エネルギーがついているなら、そのポケモンの弱点は、すべてなくなる。\n［闘］の基本エネルギーがついているなら、そのポケモンのワザは、相手のポケモンの抵抗力に関係なく、ダメージを与える。\nこのカードがポケモンexについているなら、これらの効果はなくなる。",
      "printedSpecialIdentityMarkers": [
        "Actual ENERGY header",
        "Actual 特殊エネルギー label",
        "Actual ポケモンex qualifier in rules"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide source canvas below genericHD advisory; no enlargement or optical certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "ac48ac36e7125c06d769cf5c321643ec96f9a4ad02217c886eea2a72af66a847",
    "rawSourceWitnessInsertionSHA": "b98ca852b351796f559761c92db348db1ff5b070ff5d65591e097d835316e64c",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-energy-ff-85",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/siozadnkxueyg7vk/1600.jpg",
      "literalOriginalUrlSha256": "e51e472f347e321eab8044fb0981b30819f60bcae17fccbe1f75279c73dff8aa",
      "canonicalPrintingId": "cc1681cb-030e-4d1e-a144-d68ff927f111",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "085",
      "printedCollectorNumber": "085/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside085/086.",
      "originalFileByteSha256": "8c5413a4e6f2ab2ed133db9481b393d01992922d4ac0aeaa3a0b2f47dffcba7f",
      "originalByteSize": 72830,
      "width": 500,
      "height": 698,
      "actualPrintedName": "ホロンエネルギー SYN:FF",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": {
        "handoffSha256": "ce221f8c00579866edd4c715ae22cf4d25abe679708972ea4a183bff0bcb6a7c",
        "moduleSha256": "07ad55e7c9ff251c0a0aa46bc06f0718d8eaa88c4fac790e56e7f3bea051b1da",
        "peerSha256": "884d6d5875e04125bc8fea1bd715379c683e0f7259d1b8c89c66b6be420dd8df",
        "rawHistoricalPartition": {
          "accepted": 4,
          "held": 16
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        }
      }
    },
    "expectedVariantId": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": true,
    "rawHistoricalHolds": [
      "actual_printed_Energy_conflicts_with_cached_native_Trainer_category"
    ],
    "finiteEnergyCategoryQualification": {
      "exactBindingsCanonicalSha256": "d5c41ee03f479fc4fee2e77a331d23f330a4eab4d33527c01a670f222380ccc3",
      "rawRowCanonicalSha256": "b38fe50956b7b249b0daa1464624ff47fb1575c95a005c7f135578c2a4149208",
      "rawActualClass": "Energy",
      "retainedCachedNativeClass": "Trainer",
      "retainedCanonicalCategory": null,
      "sourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "metadataOrGlobalGuardChanged": false,
      "requiresSeparateRootDecisionAndPrivateContractReview": true
    },
    "rowCanonicalSha256": "0dcfdec201884d3c828de4f53a4b7608d036067af15370ef6bb0f30ba3243a45",
    "rootDecisionRowCanonicalSha256": "017986108bf51c4c937cd663dfded34c48f7c626ae4feee02e2a2ac9523dfa6b",
    "actualCanonicalSha256": "ac48ac36e7125c06d769cf5c321643ec96f9a4ad02217c886eea2a72af66a847",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンエネルギー SYN:FF\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"085/086\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Black Holon tower-like setmark beside085/086.\",\"visibleFinishCues\":\"Silver normal-looking Energy frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは［無色］エネルギー1個ぶんとしてはたらく。\\nこのカードをつけているポケモンに、\\n［炎］の基本エネルギーがついているなら、そのポケモンの弱点は、すべてなくなる。\\n［闘］の基本エネルギーがついているなら、そのポケモンのワザは、相手のポケモンの抵抗力に関係なく、ダメージを与える。\\nこのカードがポケモンexについているなら、これらの効果はなくなる。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide source canvas below genericHD advisory; no enlargement or optical certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンエネルギー SYN:FF\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"085/086\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Black Holon tower-like setmark beside085/086.\",\"visibleFinishCues\":\"Silver normal-looking Energy frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは［無色］エネルギー1個ぶんとしてはたらく。\\nこのカードをつけているポケモンに、\\n［炎］の基本エネルギーがついているなら、そのポケモンの弱点は、すべてなくなる。\\n［闘］の基本エネルギーがついているなら、そのポケモンのワザは、相手のポケモンの抵抗力に関係なく、ダメージを与える。\\nこのカードがポケモンexについているなら、これらの効果はなくなる。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide source canvas below genericHD advisory; no enlargement or optical certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "collector_number": "085",
        "card_native_name": "ホロンエネルギーff",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "collector_number": "085",
        "card_native_name": "ホロンエネルギーff",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:e51e472f347e321eab8044fb0981b30819f60bcae17fccbe1f75279c73dff8aa",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-energy-ff-85",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/siozadnkxueyg7vk/1600.jpg",
    "productId": "3439571",
    "setCode": "PCG6",
    "currentLabel": "ホロンエネルギーff",
    "printedName": "ホロンエネルギー SYN:FF",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "314c8732a97562ba1fae7bbd8d4e2df3a0c83658a63a72e7e41381bb1cc90f90",
    "actualClass": "Energy",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "085/086",
    "artist": "Takumi Akabane",
    "variantId": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "8c5413a4e6f2ab2ed133db9481b393d01992922d4ac0aeaa3a0b2f47dffcba7f",
      "bytes": 72830,
      "width": 500,
      "height": 698,
      "rgbaSha256": "fdafcca34d0fd7e63f165df05048ef41a84778cb22edf41dbee1c139f415e2b0"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "このカードは［無色］エネルギー1個ぶんとしてはたらく。\nこのカードをつけているポケモンに、\n［炎］の基本エネルギーがついているなら、そのポケモンの弱点は、すべてなくなる。\n［闘］の基本エネルギーがついているなら、そのポケモンのワザは、相手のポケモンの抵抗力に関係なく、ダメージを与える。\nこのカードがポケモンexについているなら、これらの効果はなくなる。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "335d5820-4616-49be-89ff-5c8f494e1940": {
    "printingId": "335d5820-4616-49be-89ff-5c8f494e1940",
    "alias": "086",
    "rawCanonicalSha256": "d859f066e42b1e1aa8fa29a87f679ca2263e2eed68d296cadca4f29b0259b353",
    "bodyCanonicalSha256": "b716fcf0077b027fbc23dda80bf778672a959cbc1f8bb81f47407abeb38c78da",
    "controlsCanonicalSha256": "a9ef98095763a84a241e950eae406c38c95a7f130fd48f3f7a767d9b43c5c869",
    "inputCanonicalSha256": "ea3e7225b2372bb2bdb2073116fce3ff38f313b3964228375e876769e2cfd47f",
    "preparedCanonicalSha256": "3d907250fc1ca4d830fe57abc73ef54e39b0f3f7043ec776ff4cdd10a942cd19",
    "entryCanonicalSha256": "64396c0a9e33acbef9a85ad2c44d53cda58f9d88b7b5b13ac1e9ddd5246a05c9",
    "everyRawPrintedWitness": {
      "printedNativeName": "ホロンエネルギー SYN:WP",
      "printedCardClass": "Energy",
      "printedHP": null,
      "printedType": null,
      "printedStage": null,
      "printedEvolutionFrom": null,
      "printedEvolutionPlacement": null,
      "printedPokemonExRule": null,
      "printedCollectorNumber": "086/086",
      "printedArtist": "Takumi Akabane",
      "setMarkVisible": "Black Holon tower-like setmark beside086/086.",
      "visibleFinishCues": "Silver normal-looking Energy frame; physical finish uncertified.",
      "printedCopyright": "©2005 Pokémon/Nintendo/Creatures/GAME FREAK",
      "printedRegulationMark": null,
      "printedRules": "このカードは［無色］エネルギー1個ぶんとしてはたらく。\nこのカードをつけているポケモンに、\n［水］の基本エネルギーがついているなら、そのポケモンは、相手のワザによる効果を受けない。\n［超］の基本エネルギーがついているなら、そのポケモンのにげるに必要なエネルギーは、すべてなくなる。\nこのカードがポケモンexについているなら、これらの効果はなくなる。",
      "printedSpecialIdentityMarkers": [
        "Actual ENERGY header",
        "Actual 特殊エネルギー label",
        "Actual ポケモンex qualifier in rules"
      ],
      "attacks": [],
      "abilities": [],
      "allFourOuterPerimetersAndCornersVisible": true,
      "editionStampObserved": false,
      "foreignWatermarkObserved": false,
      "apparentFinishConflict": false,
      "qualityAdvisories": [
        "Native500-wide sourcecanvas below genericHD advisory; no enlargement or optical certification."
      ]
    },
    "rawSourceWitnessCanonicalSHA": "8c181500a229854d2b08408287542d6640323fc1d463e838dee4da5d883d9730",
    "rawSourceWitnessInsertionSHA": "bc60affab5b8b7f1623ffcc2873b3d03b5bb73e996a4889e290c43cdca2b64b2",
    "sourcePointer": {
      "sourceCode": "pricecharting",
      "sourceDetailUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-energy-wp-86",
      "literalOriginalUrl": "https://storage.googleapis.com/images.pricecharting.com/n2657c5an3fvsh27/1600.jpg",
      "literalOriginalUrlSha256": "f464eb4a0a9a0b547c9ea905ec3b8e647eb5fe23a3f69974bb1a443eb14c809f",
      "canonicalPrintingId": "335d5820-4616-49be-89ff-5c8f494e1940",
      "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "canonicalSetCode": "PCG6",
      "languageCode": "ja",
      "canonicalAlias": "086",
      "printedCollectorNumber": "086/086",
      "printedSetMarkObservation": "Black Holon tower-like setmark beside086/086.",
      "originalFileByteSha256": "cd88e8b85acd91ea917a4aa1521cbd567df1c29960c9c15ffaa0595e5d7c63b5",
      "originalByteSize": 65452,
      "width": 500,
      "height": 700,
      "actualPrintedName": "ホロンエネルギー SYN:WP",
      "physicalEditionCertified": false,
      "physicalFinishCertified": false
    },
    "sourceLineage": {
      "wave": "010",
      "closedSourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "priorFiniteDecisionSha256": "1e222e22085524a99019dfb859b7ac7105fbab65ef50704fe39992bbcd03a06b",
      "combinedFiniteDecisionSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
      "finiteEnergyQualification": {
        "handoffSha256": "ce221f8c00579866edd4c715ae22cf4d25abe679708972ea4a183bff0bcb6a7c",
        "moduleSha256": "07ad55e7c9ff251c0a0aa46bc06f0718d8eaa88c4fac790e56e7f3bea051b1da",
        "peerSha256": "884d6d5875e04125bc8fea1bd715379c683e0f7259d1b8c89c66b6be420dd8df",
        "rawHistoricalPartition": {
          "accepted": 4,
          "held": 16
        },
        "operationalPartition": {
          "accepted": 6,
          "held": 14
        }
      }
    },
    "expectedVariantId": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
    "finish": "normal",
    "isDefault": true,
    "finiteEnergyException": true,
    "rawHistoricalHolds": [
      "actual_printed_Energy_conflicts_with_cached_native_Trainer_category"
    ],
    "finiteEnergyCategoryQualification": {
      "exactBindingsCanonicalSha256": "d5c41ee03f479fc4fee2e77a331d23f330a4eab4d33527c01a670f222380ccc3",
      "rawRowCanonicalSha256": "515b184e6d07159358d3ddae07a0c881bf15f9a3c6d97bee6259e5e4cc8c0c9a",
      "rawActualClass": "Energy",
      "retainedCachedNativeClass": "Trainer",
      "retainedCanonicalCategory": null,
      "sourceHandoffSha256": "16c4ad34320966b94ea449e9fbe9dba6c59d8d23475db0f746a2d64b3f73ca5f",
      "independentActualSourceReviewSha256": "87cf8a63286e0c1bd367ed5454968042022ba179b5511976a4a7384f2b8f84d5",
      "metadataOrGlobalGuardChanged": false,
      "requiresSeparateRootDecisionAndPrivateContractReview": true
    },
    "rowCanonicalSha256": "99bd8d892391dede284ef95239da3eb20d37c83dfc35ce00569907359843443c",
    "rootDecisionRowCanonicalSha256": "f47613ec0fba05a728520fc9328fce65be5b457b10a0afacd6b1353a01cef9cc",
    "actualCanonicalSha256": "8c181500a229854d2b08408287542d6640323fc1d463e838dee4da5d883d9730",
    "witnessSerialized": "{\"printedNativeName\":\"ホロンエネルギー SYN:WP\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"086/086\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Black Holon tower-like setmark beside086/086.\",\"visibleFinishCues\":\"Silver normal-looking Energy frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは［無色］エネルギー1個ぶんとしてはたらく。\\nこのカードをつけているポケモンに、\\n［水］の基本エネルギーがついているなら、そのポケモンは、相手のワザによる効果を受けない。\\n［超］の基本エネルギーがついているなら、そのポケモンのにげるに必要なエネルギーは、すべてなくなる。\\nこのカードがポケモンexについているなら、これらの効果はなくなる。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide sourcecanvas below genericHD advisory; no enlargement or optical certification.\"]}",
    "actualSerialized": "{\"printedNativeName\":\"ホロンエネルギー SYN:WP\",\"printedCardClass\":\"Energy\",\"printedHP\":null,\"printedType\":null,\"printedStage\":null,\"printedEvolutionFrom\":null,\"printedEvolutionPlacement\":null,\"printedPokemonExRule\":null,\"printedCollectorNumber\":\"086/086\",\"printedArtist\":\"Takumi Akabane\",\"setMarkVisible\":\"Black Holon tower-like setmark beside086/086.\",\"visibleFinishCues\":\"Silver normal-looking Energy frame; physical finish uncertified.\",\"printedCopyright\":\"©2005 Pokémon/Nintendo/Creatures/GAME FREAK\",\"printedRegulationMark\":null,\"printedRules\":\"このカードは［無色］エネルギー1個ぶんとしてはたらく。\\nこのカードをつけているポケモンに、\\n［水］の基本エネルギーがついているなら、そのポケモンは、相手のワザによる効果を受けない。\\n［超］の基本エネルギーがついているなら、そのポケモンのにげるに必要なエネルギーは、すべてなくなる。\\nこのカードがポケモンexについているなら、これらの効果はなくなる。\",\"printedSpecialIdentityMarkers\":[\"Actual ENERGY header\",\"Actual 特殊エネルギー label\",\"Actual ポケモンex qualifier in rules\"],\"attacks\":[],\"abilities\":[],\"allFourOuterPerimetersAndCornersVisible\":true,\"editionStampObserved\":false,\"foreignWatermarkObserved\":false,\"apparentFinishConflict\":false,\"qualityAdvisories\":[\"Native500-wide sourcecanvas below genericHD advisory; no enlargement or optical certification.\"]}",
    "production": [
      {
        "game_code": "pokemon",
        "language_code": "ja",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "collector_number": "086",
        "card_native_name": "ホロンエネルギーwp",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
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
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "set_code": "PCG6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "collector_number": "086",
        "card_native_name": "ホロンエネルギーwp",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "variant_code": "normal",
        "finish_code": "normal",
        "same_artwork_as_variant_id": null,
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:f464eb4a0a9a0b547c9ea905ec3b8e647eb5fe23a3f69974bb1a443eb14c809f",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-holon-research/holon-energy-wp-86",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/n2657c5an3fvsh27/1600.jpg",
    "productId": "3439572",
    "setCode": "PCG6",
    "currentLabel": "ホロンエネルギーwp",
    "printedName": "ホロンエネルギー SYN:WP",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineageCanonicalSha256": "314c8732a97562ba1fae7bbd8d4e2df3a0c83658a63a72e7e41381bb1cc90f90",
    "actualClass": "Energy",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "086/086",
    "artist": "Takumi Akabane",
    "variantId": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "cd88e8b85acd91ea917a4aa1521cbd567df1c29960c9c15ffaa0595e5d7c63b5",
      "bytes": 65452,
      "width": 500,
      "height": 700,
      "rgbaSha256": "77005e099a0239fa9885e4f492d3dc2b0a73529b4e9f3601baae8eddaa97f7a8"
    },
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rules": "このカードは［無色］エネルギー1個ぶんとしてはたらく。\nこのカードをつけているポケモンに、\n［水］の基本エネルギーがついているなら、そのポケモンは、相手のワザによる効果を受けない。\n［超］の基本エネルギーがついているなら、そのポケモンのにげるに必要なエネルギーは、すべてなくなる。\nこのカードがポケモンexについているなら、これらの効果はなくなる。",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "d3702027d6d81a22384907664abceb9ef439cfc81471013bd0d115f9b018e96b",
  "decisionCanonicalSha256": "8b774ae875e4864dafc57b0c50e2b2a5c8fd5417fb0de0298c3517d0ade3171e",
  "approvedFileSha256": "61484eb4abfe5ce7787ad5fa6752efb034c8e1b95ae90b007aa5a8c299d32a87",
  "decisionFileSha256": "42474a9c27107d72404a5a1c40a840ddc5b03a5faee2947b3ea001ac49d8497b",
  "validatorFileSha256": "8d234aae1a181aa47da915f71d3091ffed8237f56295b5cf298daa341157c479",
  "v2ExternalBindingFileSha256": "e5ea926d9fc6ef91bfcf94b998800ce2a6d1f659c2a373982344f9b4722c9a35"
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


export function knownSource(id) { check(Object.hasOwn(expectedRows,id),'Outside exact PCG6 ten'); return structuredClone(expectedRows[id]); }
const insertion=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function witnesses(values,k,stored) {
  for (const value of values) check(JSON.stringify(value) === k.witnessSerialized && insertion(value) === k.rawSourceWitnessInsertionSHA,'Exact original witness serialization, nested order and insertion SHA required');
  for (const sha of stored) check(sha === k.rawSourceWitnessInsertionSHA,'Stored insertion SHA changed');
}
export function validateActual(value,k) { check(JSON.stringify(value)===k.actualSerialized && canonicalHash(value)===k.actualCanonicalSha256,'Exact full direct source observations including nested order'); }
export function observed(value,key){const aliases={name:'printedNativeName',hp:'printedHP',stage:'printedStage',evolvesFrom:'printedEvolutionFrom',collector:'printedCollectorNumber',artist:'printedArtist'};return value[aliases[key]??key];}
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Frozen exact ten root authority');
 check(approved.rows.length===10&&decision.rowCount===10&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.canonicalOrSourcePolicyWritesAllowed===false&&decision.rootOwnsAllQueueGitReleaseUploadPublisherAndLiveActions===true,'Finite conditional authority');
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
 check(row.set_code==='PCG6'&&row.language_code==='ja'&&row.collector_number===k.alias&&row.card_native_name===k.currentLabel&&row.provider_id===k.sourceCardId&&row.image_url===k.imageUrl&&row.evidence.source_page_url===k.sourcePageUrl&&row.work_type==='CARDS','Exact current printing and original URL');
 check(body.accepted_category===null&&body.recorded_inventory_category===null&&body.source_variant_id===null&&body.required_asset_scope.variant_id===null&&body.required_asset_scope.printing_id===row.printing_id&&body.required_delivery_kind==='shared','Canonical nulls and shared source/asset scope');
 check(body.global_trainer_energy_guard_changed===false&&body.finite_energy_exception===k.finiteEnergyException,'No global Trainer/Energy waiver');
 if(k.finiteEnergyException)check(['085','086'].includes(k.alias)&&body.actual_printed_category==='Energy'&&body.actual_native_category==='Trainer'&&body.actual_pixel_signature.printedRules.includes('ポケモンex'),'Only085086 finite Energy printed rules retain Pokemonex restriction');
 check(body.root_finite_authority.decision_file_byte_sha256===authority.decisionFileSha256&&body.root_finite_authority.preparation_approved===true&&body.root_finite_authority.conditional_future_publication_root_owned===true&&body.root_finite_authority.private_package_is_production_ready===false,'Finite root authority');
 for(const key of ['provider_native_resolution_certified','native_optical_gain_claimed','stackr_enlargement','source_wide_approval','vendor_licence_certified','physical_finish_certified','physical_edition_certified'])check(body[key]===false,'No invented physical/licence/provider/optical certificate');return k;
}
