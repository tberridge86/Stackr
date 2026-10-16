import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "99d92c62-48a1-4f46-8c52-f8bd29aa7925": {
    "printingId": "99d92c62-48a1-4f46-8c52-f8bd29aa7925",
    "rawCanonicalSha256": "8a9e6b714a38ebe619d0d1475baa7d486e646c1f8133add26559ceb110c82ce7",
    "bodyCanonicalSha256": "f5ad6b81e7f51cadde2c909edf934c2ed3d09e38a60589026f4952aba5cb9d00",
    "controlsCanonicalSha256": "b34dc054d7703633e622d2666b76b10bb9087dd675ad3bb2217523223ea6b218",
    "rowCanonicalSha256": "c6b5cf386c9abd2244f29e4f19734e121ab0f502a8645eba662682cd02d6e97c",
    "actualCanonicalSha256": "a14135cff53564281957d8219260040e0ca31f32d4c5e421a4e87ab30016a7e3",
    "rootDecisionRowCanonicalSha256": "d6e443cbae0344bb344dd34a76781b6e160573cfd05a8de68934bfc2ade5390a",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "626589f6-6316-4bc7-a5fd-bb74b8e4e755",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "99d92c62-48a1-4f46-8c52-f8bd29aa7925",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:054:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "054",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "626589f6-6316-4bc7-a5fd-bb74b8e4e755",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "99d92c62-48a1-4f46-8c52-f8bd29aa7925",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:054:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "054",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:61300637e00bc4b093331ef847c4217719ade13ae4bb8c7dec13522612632e8b",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/kabutops-54",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/3fpauxxmjtsaapsc/1600.jpg",
    "productId": "3439628",
    "setCode": "PCG5",
    "alias": "054",
    "currentLabel": "カブトップス",
    "printedName": "カブトプス",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "006",
      "closedSourceHandoffSha256": "baed49569d4cfcc558ce8daf693fe3e8fe406dbc76c31d332bca4d8dee8a27de",
      "independentActualSourceReviewSha256": "20076a91c687a5f5877948b2b5bbb9f752304b2667720b6f1691f35873755555",
      "priorFiniteDecisionSha256": "998f6e02194e1cc71c71b689cb445bd8826cd79845c45e0750651f07ad176dc8",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": null,
      "finiteOperationalProjectionSha256": null,
      "independentFiniteProjectionReviewSha256": null
    },
    "sourceLineageCanonicalSha256": "f8a6c5a96a854cfd600ea56616b65882d57b96e0d070a86a4a2194d587c772bb",
    "finiteFossilException": false,
    "rawSourceReviewCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "finiteContractResolutionCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "actualClass": "Pokemon",
    "hp": 110,
    "type": "闘",
    "stage": "2進化",
    "evolvesFrom": "カブト",
    "collector": "054/086",
    "artist": "Mitsuhiro Arita",
    "variantId": "626589f6-6316-4bc7-a5fd-bb74b8e4e755",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "1aef481590a120ab907c90032de39a5bc1d7c92fad83fcf13f7137198c99e0d0",
      "bytes": 503534,
      "width": 1022,
      "height": 1434,
      "rgbaSha256": "d6f69ac8338088730c8d77ffa697b0c8467a40e1605ad9430ced3bf220eb91a7"
    },
    "observationsCanonicalSha256": "a14135cff53564281957d8219260040e0ca31f32d4c5e421a4e87ab30016a7e3",
    "entryCanonicalSha256": "00ca578cc91e50dfe9eb688e5a04ca45e12950163c712c97fdd48633d6c2d4fd",
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "a14135cff53564281957d8219260040e0ca31f32d4c5e421a4e87ab30016a7e3",
    "rawSourceWitnessInsertionSha256": "5f31baf77ee34b9a9e201f8c4260fef56b96797f9e370ff6060e7c27ee8a3d83",
    "rootActualWitnessCanonicalSha256": "a14135cff53564281957d8219260040e0ca31f32d4c5e421a4e87ab30016a7e3",
    "additiveActualPlacementSha256": "ddb2ac98c4c883df3d4c6ab3fa21be0a8e1938a5b5ae9368f76b322e7a15ba80",
    "actualEvolutionPlacement": "カブトから進化",
    "rawEvolutionPlacement": "カブトから進化",
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "3b42d0a6-58d9-440f-a4fa-5dedd29bd2c1": {
    "printingId": "3b42d0a6-58d9-440f-a4fa-5dedd29bd2c1",
    "rawCanonicalSha256": "c2fbd1f4b24e2d63765048e3e206e49bce1b903b67c22e8b4a73ca83ceeca084",
    "bodyCanonicalSha256": "5e9fd7c380f49d349c040f53c40c9a8e84b481dd90af3985d638c1112f263d45",
    "controlsCanonicalSha256": "c6c7beec96701fc05553ff9358deda03a815f1707f3b147c4e53af671446496a",
    "rowCanonicalSha256": "51f2f83f83b9d9a748829017a4ab9f9437e37c4dcf0654507f5430955cac3cd7",
    "actualCanonicalSha256": "a7523c02fd1c8b0ba36ab4a900b9f51341378cf58765c5f75400cdc312f8de97",
    "rootDecisionRowCanonicalSha256": "778ca7d77488db748aa4d3e42186cda165cba4fcdd7cc5b10af5ae1e8f624c55",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "ddf6a830-3656-4f5b-8da3-e9cfbc560d81",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "3b42d0a6-58d9-440f-a4fa-5dedd29bd2c1",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:072:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "072",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "ddf6a830-3656-4f5b-8da3-e9cfbc560d81",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "3b42d0a6-58d9-440f-a4fa-5dedd29bd2c1",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:072:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "072",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:b2d34101babf7b399430c38d8b3ef9a86a82fcdb5914248614bb4765050685d8",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/absol-72",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/refd29f4010b69927460b3652ea75e593200192a4f11bcfb6d4c6328fc034cc9896/1600.jpg",
    "productId": "3439646",
    "setCode": "PCG5",
    "alias": "072",
    "currentLabel": "絶対",
    "printedName": "アブソル",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": false,
    "rawSourceReviewCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "finiteContractResolutionCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "悪",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "072/086",
    "artist": "Midori Harada",
    "variantId": "ddf6a830-3656-4f5b-8da3-e9cfbc560d81",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "7cc5d4e4fbb7a20be902c7c9682dde8d2c0be82a6406a2c673a53ef02cf774e9",
      "bytes": 506646,
      "width": 1220,
      "height": 1600,
      "rgbaSha256": "f10a158a81fb391fbdb629c9b6350dbc2baaaaa1a8f08317937c9919e37fd16a"
    },
    "observationsCanonicalSha256": "a7523c02fd1c8b0ba36ab4a900b9f51341378cf58765c5f75400cdc312f8de97",
    "entryCanonicalSha256": "257ae0fbea7ecd5ac379840d1baded01084bb71dd86e6206a76c1f899d0d974e",
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "a7523c02fd1c8b0ba36ab4a900b9f51341378cf58765c5f75400cdc312f8de97",
    "rawSourceWitnessInsertionSha256": "701ce3ae417994cba2da03dc2e3107a87cdb49a0716b97485b3bb5d4f4b8ca3d",
    "rootActualWitnessCanonicalSha256": "a7523c02fd1c8b0ba36ab4a900b9f51341378cf58765c5f75400cdc312f8de97",
    "additiveActualPlacementSha256": "41544c8d0e3a6a71b203525afa02fbfd30155866704a3601343cacc0c0437e38",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "d375bdec-7d0e-46ff-a6b9-b156ed9af609": {
    "printingId": "d375bdec-7d0e-46ff-a6b9-b156ed9af609",
    "rawCanonicalSha256": "6987d63068f401bf08bc9b47e82a1ff1b09314b0e319a1f43d1e087cd0a1e900",
    "bodyCanonicalSha256": "8d9f2e90c5601134b9da90178948791a17d2877a2440282613856860c4a151e9",
    "controlsCanonicalSha256": "d1825ce7afe9f5e6f8a78809e80685d3e192c7796320036cc1f1f4391f77b328",
    "rowCanonicalSha256": "97d19da26472242379c787799525771bbd49a40406cbec4ddb88fdd356b1c989",
    "actualCanonicalSha256": "e627b97fa4a9f8a295e85e27ac345fc4ed5a4f3c34c040f8251370c80d6de0c2",
    "rootDecisionRowCanonicalSha256": "9e826f2126668f89a4e05bb5165323fe1f71912391b237b9c9bcc8b1273220f1",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "d71666c9-c454-4631-9227-4856ada8dd39",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "d375bdec-7d0e-46ff-a6b9-b156ed9af609",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:077:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "077",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "d71666c9-c454-4631-9227-4856ada8dd39",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "d375bdec-7d0e-46ff-a6b9-b156ed9af609",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:077:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "077",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:a6b00a82609adfbc976e9c6bfb6421e9ceeb00a492ab43e3c487dc5178cc67d8",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/claw-fossil-77",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/wxtzkrzlxkam3hvn/1600.jpg",
    "productId": "3439651",
    "setCode": "PCG5",
    "alias": "077",
    "currentLabel": "爪の化石",
    "printedName": "ツメの化石",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": true,
    "rawSourceReviewCanonicalSha256": "b5f176875683cc7d6188aa958b62288a151e04c004f75cb6d4bc91981cc17f95",
    "finiteContractResolutionCanonicalSha256": "fa69f57303810f681728e1a9f89ca09d518f229101dcded0fd48d38a7894a7c7",
    "actualClass": "Trainer",
    "hp": 40,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "077/086",
    "artist": "Ryo Ueda",
    "variantId": "d71666c9-c454-4631-9227-4856ada8dd39",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "80a8126ec1cbd48660d25971cce8d87a6b725d9e542f820ef4eb51b32ff74792",
      "bytes": 352761,
      "width": 987,
      "height": 1383,
      "rgbaSha256": "665cee716b88c5f5bf7d43900668e703c184af046406e7f79da3d80e614b170e"
    },
    "observationsCanonicalSha256": "e627b97fa4a9f8a295e85e27ac345fc4ed5a4f3c34c040f8251370c80d6de0c2",
    "entryCanonicalSha256": "bb9e6267d80b0ba21ef79a3cd97816265e1667ae684ffbd19ddb261f97187483",
    "abilityCount": 1,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "e627b97fa4a9f8a295e85e27ac345fc4ed5a4f3c34c040f8251370c80d6de0c2",
    "rawSourceWitnessInsertionSha256": "6dfe8a67e1d444819f97664d5fc448b0fd38d2f1e2ed78df3d194f346cb75801",
    "rootActualWitnessCanonicalSha256": "e627b97fa4a9f8a295e85e27ac345fc4ed5a4f3c34c040f8251370c80d6de0c2",
    "additiveActualPlacementSha256": "d215e975425d98356b439bad7e74d5b21680a17f3f974cc7d6b28127c220a613",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "このカードは「たねポケモン」として場に出すことができ、場にいるかぎり、［無色］タイプの「たねポケモン」としてあつかわれる。このカードは特殊状態にならず、にげるができない。このカードがきぜつしても、相手プレイヤーはサイドをとることができない。このカードの持ち主は、自分の番に、場からこのカードをトラッシュしてよい。",
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "54ab745b-392e-46a6-8480-b4dc593124a7": {
    "printingId": "54ab745b-392e-46a6-8480-b4dc593124a7",
    "rawCanonicalSha256": "81cfa8faae6e37b298b7e4cd691b50d6a5efc1d52dfd4655aad6e4842b68912e",
    "bodyCanonicalSha256": "06cba1ad69cfd97d6cb0957a930e4ce00beb2bfbbc66eca8cc460b19c0231646",
    "controlsCanonicalSha256": "86b580f1f4c2f196b6b348021fd163f65ea4b1810573de5df02b39baf5ecae86",
    "rowCanonicalSha256": "7b993c82a88ff0121c616f1e56f115b3d2eba4b01dfb8d1bcbf6b0326ea81071",
    "actualCanonicalSha256": "6b66b753056e87c1b1f396508cdc35f8a5fbfd63f1f95a78820e6b03f2a4cb49",
    "rootDecisionRowCanonicalSha256": "9128286a91112ec8f7cde17e46cfcee25a2b8a98dbb1f1d0ecd32f40a957a93d",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "a10ab207-e6d6-4928-ae33-867327a1898d",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "54ab745b-392e-46a6-8480-b4dc593124a7",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:078:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "078",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "a10ab207-e6d6-4928-ae33-867327a1898d",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "54ab745b-392e-46a6-8480-b4dc593124a7",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:078:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "078",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:eb0f79f70a005df21967ca554727b19d8bdc5c6067e39f297b728ca3be410db7",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/mysterious-fossil-78",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corrkqozukjbnmfyf362/1600.jpg",
    "productId": "3439652",
    "setCode": "PCG5",
    "alias": "078",
    "currentLabel": "神秘的な化石",
    "printedName": "なにかの化石",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": true,
    "rawSourceReviewCanonicalSha256": "cc5e65a5adb6bce91ebac8a5b232492d8318203e0d02c79781b7d6697f42812f",
    "finiteContractResolutionCanonicalSha256": "fc3a60d3928886ad4fc0d0bfeea4f7457a018fbf0284bbb509ce52ed01d37976",
    "actualClass": "Trainer",
    "hp": 50,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "078/086",
    "artist": "Ryo Ueda",
    "variantId": "a10ab207-e6d6-4928-ae33-867327a1898d",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "a2763347bb5a41905d1ea130bae478174c12543583e4e19634722e673f5db1d2",
      "bytes": 451385,
      "width": 1600,
      "height": 1600,
      "rgbaSha256": "c45b2d2fcc2af7b4408d5c16a9003816b717b7e34f9c314c9324ee82569d4421"
    },
    "observationsCanonicalSha256": "6b66b753056e87c1b1f396508cdc35f8a5fbfd63f1f95a78820e6b03f2a4cb49",
    "entryCanonicalSha256": "8b9df2d7a990daf955a06f04873b3c25a26cd2375324f46088583ee254a4c9ef",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "6b66b753056e87c1b1f396508cdc35f8a5fbfd63f1f95a78820e6b03f2a4cb49",
    "rawSourceWitnessInsertionSha256": "fa13a25a88b4d06aa3f5ee36d2820af7aadab6cb670011fba01b4f3a2cb9a803",
    "rootActualWitnessCanonicalSha256": "6b66b753056e87c1b1f396508cdc35f8a5fbfd63f1f95a78820e6b03f2a4cb49",
    "additiveActualPlacementSha256": "790506180dc35b7c802a02529b735a9486e02e0adfb79a6ee7d71012192492cf",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "このカードは「たねポケモン」として場に出すことができ、場にいるかぎり、［無色］タイプの「たねポケモン」としてあつかわれる。このカードは特殊状態にならず、にげるができない。このカードがきぜつしても、相手プレイヤーはサイドをとることができない。このカードの持ち主は、自分の番に、場からこのカードをトラッシュしてよい。",
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9": {
    "printingId": "f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9",
    "rawCanonicalSha256": "fb5d68b8f704dfac45affb3926d0217a48e12580da20e3f88894d1b532701bed",
    "bodyCanonicalSha256": "1635ab31fc8d6e3c9eea16f86467734410d528abea784d524698d4b2f27ddee7",
    "controlsCanonicalSha256": "89868702fa95f170b1a66cbb6c822a131aa7b5fe7a134741fff2dd7c7c7b6ad6",
    "rowCanonicalSha256": "4e48c62dc6b90e97b665a7ae2020ad0422dba7e68ac56b01b9d00f269881a724",
    "actualCanonicalSha256": "f1adee9a72ce409f4e486612c609fbfe92dabc712ac26f09d70607e3b0aee866",
    "rootDecisionRowCanonicalSha256": "51eaa463295176f48df82991036f22dfc0c76f937c65ecfe0834564f870b0f2f",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "79bced78-be34-4302-a910-cee858b410ff",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:079:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "079",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "79bced78-be34-4302-a910-cee858b410ff",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:079:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "079",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:9d0e5498240d36f81663345da5410b37fc0ff42d5a5fd6c51e3421d7fb629cca",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/root-fossil-79",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/7ehneb3eptyghl5c/1600.jpg",
    "productId": "3439653",
    "setCode": "PCG5",
    "alias": "079",
    "currentLabel": "根の化石",
    "printedName": "ねっこの化石",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": true,
    "rawSourceReviewCanonicalSha256": "0b5ae2b29d161e3a488ac17bd437a0ff101caf748dd969bdd128590fad8c7891",
    "finiteContractResolutionCanonicalSha256": "0d5d1fa300e53b2d8fe7a27ac6e8320c812c01aa8ced695974c82307158603ad",
    "actualClass": "Trainer",
    "hp": 40,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "079/086",
    "artist": "Ryo Ueda",
    "variantId": "79bced78-be34-4302-a910-cee858b410ff",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "2060e56662f5366e10b2a3d7bb3099a39d36e7223b225f0338e6f8fb938e85ca",
      "bytes": 72626,
      "width": 500,
      "height": 700,
      "rgbaSha256": "164b71bb6222909f09c864b605771bffde07732a6ba7b814995c6aaa71e2993c"
    },
    "observationsCanonicalSha256": "f1adee9a72ce409f4e486612c609fbfe92dabc712ac26f09d70607e3b0aee866",
    "entryCanonicalSha256": "c5c0ab132f89734c3f4ced9bbf3d01105910827091f365ba20594d15db38a63f",
    "abilityCount": 1,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "f1adee9a72ce409f4e486612c609fbfe92dabc712ac26f09d70607e3b0aee866",
    "rawSourceWitnessInsertionSha256": "f415e9ff9e687d9e9dd8480230d614196dc6003ae28dd7d83168e3557c08c18f",
    "rootActualWitnessCanonicalSha256": "f1adee9a72ce409f4e486612c609fbfe92dabc712ac26f09d70607e3b0aee866",
    "additiveActualPlacementSha256": "6d2142a578e0bfeb046376faee4486dca77f74a6b860f1bc08ed4119225e16fd",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "このカードは「たねポケモン」として場に出すことができ、場にいるかぎり、［無色］タイプの「たねポケモン」としてあつかわれる。このカードは特殊状態にならず、にげるができない。このカードがきぜつしても、相手プレイヤーはサイドをとることができない。このカードの持ち主は、自分の番に、場からこのカードをトラッシュしてよい。",
    "trainerSubtype": null,
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "495d3e13-53cf-4193-b897-892e492dcef1": {
    "printingId": "495d3e13-53cf-4193-b897-892e492dcef1",
    "rawCanonicalSha256": "bddbd97a24ae41f899c095bf2ccb1ecb936d04147df6cf9e1a55b6a5bcf6834a",
    "bodyCanonicalSha256": "c6a36dfe384a81efe5e725cbe5697bd1246f9d37c98e1750291c8952ff6780af",
    "controlsCanonicalSha256": "2e86858f8ddc559c1cfa99619b336e47c5c9cbfb100bb9e31c1645884327881a",
    "rowCanonicalSha256": "7acdeeefd2802bda58b50416b2954de99473d9f2bc767ce4cafb1d9652d80927",
    "actualCanonicalSha256": "b0e2d7500cca5bc8bc5cbc39e79514c39af23bdb33942e91b13c39c57ba925f0",
    "rootDecisionRowCanonicalSha256": "3de93d9872d37ab4c9ad2f118e329428a506888163a715f1c7eb7336fcd48ebd",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "78e7a14a-74c6-47ff-8454-c4284b4804b3",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "495d3e13-53cf-4193-b897-892e492dcef1",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:081:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "081",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "78e7a14a-74c6-47ff-8454-c4284b4804b3",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "495d3e13-53cf-4193-b897-892e492dcef1",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:081:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "081",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:5add5e6371ae36057465d55eedd33c8d0866d3419f4d8a372a985a98e4e67534",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/strange-cave-81",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corrd2xb3li3rfxlwbn5/1600.jpg",
    "productId": "3439655",
    "setCode": "PCG5",
    "alias": "081",
    "currentLabel": "奇妙な洞窟",
    "printedName": "妖しい洞窟",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": false,
    "rawSourceReviewCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "finiteContractResolutionCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "081/086",
    "artist": "Ryo Ueda",
    "variantId": "78e7a14a-74c6-47ff-8454-c4284b4804b3",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "4c4455af9208fe0fd572ad09fd0504d5ee389f5d1f8c55be9b8cb1ef740272b1",
      "bytes": 451690,
      "width": 1600,
      "height": 1600,
      "rgbaSha256": "08a17542876c961cc3a7cd26c06cc553daaf3fcf1194e46e990aa8010ac98035"
    },
    "observationsCanonicalSha256": "b0e2d7500cca5bc8bc5cbc39e79514c39af23bdb33942e91b13c39c57ba925f0",
    "entryCanonicalSha256": "74ce94dc3cfbb2e17b6d356c5ef0eacead643b07124a454cc3c8a1a0b959d078",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "b0e2d7500cca5bc8bc5cbc39e79514c39af23bdb33942e91b13c39c57ba925f0",
    "rawSourceWitnessInsertionSha256": "f46eb3f08a0cde41e8f274c94744efacbfa2c21e983747d6572de8e8d8fc2e83",
    "rootActualWitnessCanonicalSha256": "b0e2d7500cca5bc8bc5cbc39e79514c39af23bdb33942e91b13c39c57ba925f0",
    "additiveActualPlacementSha256": "50b5e7a16111afc5ec86b51e1d29ff2088cb1ec5625f4f517b8100e888f31abf",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "おたがいのプレイヤーは、それぞれ、自分の番ごとに1回、自分の手札から、「オムナイト」「カブト」「プテラ（ex）」「リリーラ」「アノプス」のうち、1枚を選び出し、自分のベンチに出してよい。（この効果によって場に出した「進化カード」は、「たねポケモン」としてあつかわれる。）\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。",
    "trainerSubtype": "スタジアム",
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "48be3163-e728-45e7-b7d5-e4b5d2267507": {
    "printingId": "48be3163-e728-45e7-b7d5-e4b5d2267507",
    "rawCanonicalSha256": "28a4ba38027fb86ce46d5901bc1f91b4d59e11d63d7439a9aad726c142db5e27",
    "bodyCanonicalSha256": "a018f4cbace3541139d27f472ca35ad1f0481c0abc956987f6a84fe0d1c67b83",
    "controlsCanonicalSha256": "19ce711799596c2b8e656a18c5a39df6a3326b12b5ae1c839c987a5ee238c18a",
    "rowCanonicalSha256": "c0b6c7168632252862d3d0bba0621f1dfeb4b39b7d675fd1dc6867a564f0dd78",
    "actualCanonicalSha256": "401651c13f00300bd4ad852195a8001b4c6e02c06e38c916415e8df7ec49a48a",
    "rootDecisionRowCanonicalSha256": "19edd473300c827ecf0d254636b0f127b0c18f644c51978b643321a82b35cdc6",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "50961470-7633-422f-8a47-197f20af5be5",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "48be3163-e728-45e7-b7d5-e4b5d2267507",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:082:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "082",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "50961470-7633-422f-8a47-197f20af5be5",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "48be3163-e728-45e7-b7d5-e4b5d2267507",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:082:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "082",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:4cdf40381d4465965de38961c738d265e73ff68ca160571052bfba7fb067fcc8",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/full-flame-82",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/34ybxcgrv5bmb4mq/1600.jpg",
    "productId": "3439656",
    "setCode": "PCG5",
    "alias": "082",
    "currentLabel": "フルフレーム",
    "printedName": "消えない炎",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": false,
    "rawSourceReviewCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "finiteContractResolutionCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "082/086",
    "artist": "Ryo Ueda",
    "variantId": "50961470-7633-422f-8a47-197f20af5be5",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "ad3e88bea140fa6b8b130530fb40921ebb455dca957729639aac008508035feb",
      "bytes": 68000,
      "width": 500,
      "height": 699,
      "rgbaSha256": "e1e88d2ce038f52a962f9a9b29bc674b1c8f95112b71fd0f36bbfa7526675e8d"
    },
    "observationsCanonicalSha256": "401651c13f00300bd4ad852195a8001b4c6e02c06e38c916415e8df7ec49a48a",
    "entryCanonicalSha256": "29543fab5969752ab016211077822061c9cfb0f4eb01ea1cd2e541c6d72d10e5",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "401651c13f00300bd4ad852195a8001b4c6e02c06e38c916415e8df7ec49a48a",
    "rawSourceWitnessInsertionSha256": "d606886fe28534d03ec59fe6dadd0e26e7d36e029e2e679c2a0fe1e312529dc2",
    "rootActualWitnessCanonicalSha256": "401651c13f00300bd4ad852195a8001b4c6e02c06e38c916415e8df7ec49a48a",
    "additiveActualPlacementSha256": "0b55cb1f0f3874eb22cd39aa01723e428325f801fc27751397d0a9678c3b842d",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "やけどのポケモンは、ポケモンチェックのときにのせるやけどのダメージカウンターの数が4個になる。やけどのポケモンが進化・退化しても、やけどは回復しない。\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。",
    "trainerSubtype": "スタジアム",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "060248e6-200d-4e55-9c59-693b622a2bb0": {
    "printingId": "060248e6-200d-4e55-9c59-693b622a2bb0",
    "rawCanonicalSha256": "c10939db89110b54f8d4929331ababe9b6834cc29a0dc6fc6f422680167734d5",
    "bodyCanonicalSha256": "27c6c9edfd8003c2cd6ee306190f7953bee5775aa8f1a46368acac07dcd03736",
    "controlsCanonicalSha256": "e41e10e493a3e2e5b488420250b252d4a8885b6e601c3279a08cae1e90e549b5",
    "rowCanonicalSha256": "d396bc5234fda4efe5af5bc2421cdd73058c01f1eb09555c05a76a7f2a4dc34c",
    "actualCanonicalSha256": "04a037a4b5f31b13dc718f8feb7b71e12f31732673bfdd89a3411aa5edbd9f0b",
    "rootDecisionRowCanonicalSha256": "93ab031a85e9750364f0041a22fae0987c6497bf42902567b714d71c8637644a",
    "production": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "1e5676ae-212e-4311-9a26-0fb18b7d280c",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "060248e6-200d-4e55-9c59-693b622a2bb0",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:084:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "084",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
        "set_code": "PCG5",
        "variant_id": "1e5676ae-212e-4311-9a26-0fb18b7d280c",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "060248e6-200d-4e55-9c59-693b622a2bb0",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:f8cb8c30-41dc-42a3-977a-23baba96fa69:084:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "084",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:df349ed039e3a7e3fd574faaed4795ae69626866fc6a3f0250ea4d90c7d9fbdc",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-mirage-forest/cursed-stone-84",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/uh34rolsdlxqxghb/1600.jpg",
    "productId": "3439658",
    "setCode": "PCG5",
    "alias": "084",
    "currentLabel": "呪われた石",
    "printedName": "呪われたほこら",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "007",
      "closedSourceHandoffSha256": "32f2761962345063ba01d03a2f52da002277b33c71875a9e34e8b82a0eb74667",
      "independentActualSourceReviewSha256": "9c611bc5c3cc9e999d1e1ea92a47ecd89f50856b089b42d998b3c4f0860bcdce",
      "priorFiniteDecisionSha256": "5f60b4d2d53a4336a81767dc8a26695c052f2e14a2aff18dfb4f3077374c3b4d",
      "combinedFiniteDecisionSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77",
      "finiteProjectionModuleSha256": "5f4aa2c07a243d6977174c0200845a0ee4f011a2fe68041ce7e915a66468eec9",
      "finiteOperationalProjectionSha256": "ad3d0e9ba3e52f1885dad411867c44d6e10fb68bf33e35445105b4236045efcf",
      "independentFiniteProjectionReviewSha256": "a88497cd804222950a654cfffb37e6d77b05af7cbe406ff44faa8375ed14698c"
    },
    "sourceLineageCanonicalSha256": "0f939fb88d61647d8375d9ae6870b45fd0b306a829be6433e232e1e4b71c81ab",
    "finiteFossilException": false,
    "rawSourceReviewCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "finiteContractResolutionCanonicalSha256": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "084/086",
    "artist": "Ryo Ueda",
    "variantId": "1e5676ae-212e-4311-9a26-0fb18b7d280c",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "8de54f528a843598606c69bf9fb2af28b72c8c10e213bd46b0b40c7cc973bc6d",
      "bytes": 71888,
      "width": 500,
      "height": 700,
      "rgbaSha256": "3eb4801abc1b6e4dd4bc0674fb00375df8a5d538cd28532a3257f7c84cb1a231"
    },
    "observationsCanonicalSha256": "04a037a4b5f31b13dc718f8feb7b71e12f31732673bfdd89a3411aa5edbd9f0b",
    "entryCanonicalSha256": "26ab0e5418e1eaa1592be98def158c3c6425613d7c8692eeda32d72714e77c13",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "04a037a4b5f31b13dc718f8feb7b71e12f31732673bfdd89a3411aa5edbd9f0b",
    "rawSourceWitnessInsertionSha256": "7050808431f8cbb49beaaa3c394bc84787d9e22868bb7832498be6bbb16ab841",
    "rootActualWitnessCanonicalSha256": "04a037a4b5f31b13dc718f8feb7b71e12f31732673bfdd89a3411aa5edbd9f0b",
    "additiveActualPlacementSha256": "0fecaa001fa9f360a65e5bcb9a97502d53218122aae0a560c6ef788ebb27c1d9",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "ポケモンチェックのたび、おたがいの「ポケパワー」を持つポケモン全員に、ダメージカウンターをそれぞれ1個ずつのせる。\nスタジアムは、自分の番に1回だけ、バトル場の横に出すことができる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。",
    "trainerSubtype": "スタジアム",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "caface0c958e91499388cc2a515d5e508eb9a467083e5499f8fa8fd27f8ebbc7",
  "decisionCanonicalSha256": "b49c2cd9f75f65e5256251f9090817a9afbf19c503815fe4464d9da32e0325c0",
  "approvedFileSha256": "ccc84806227629a97a97fc3ec4a0a66ccf9f32d2287a43f26fec41cf52eeabd5",
  "decisionFileSha256": "51d722e237e5f2e237dfa5aac51747efd75c7c932ac2199bfd8205353ea9cc77"
};
export function knownSource(id) {
  const value = expectedRows[id];
  check(value, 'Outside exact PCG5 waves006007 eight fronts');
  return value;
}

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

export function validateAuthorityPackets(approved, decision) {
  check(canonicalHash(approved) === authority.approvedCanonicalSha256 && canonicalHash(decision) === authority.decisionCanonicalSha256, 'Exact immutable root decision and derived eight-row projection required');
  check(approved.rows.length === 8 && decision.rowCount === 8 && decision.preparationApproved === true
    && decision.conditionalPublicationApproved === true && decision.canonicalOrSourcePolicyWritesAllowed === false
    && decision.rootOwnsAllQueueGitReleaseUploadPublisherAndLiveActions === true, 'Finite exact8 conditional root authority');
  for (const raw of approved.rows) {
    const k = knownSource(raw.printingId), original = decision.rows.find(r => r.printingId === raw.printingId);
    check(canonicalHash(raw) === k.rawCanonicalSha256 && original && canonicalHash(original) === k.rootDecisionRowCanonicalSha256,
      'Whole root raw and decision row binding');
    check(original.sourceSelectionApproved === false && original.preparationApproved === false && original.publicationApproved === false
      && canonicalHash(original.actualPixelSignature) === k.actualCanonicalSha256, 'Historical source-author flags stay false');
  }
  return true;
}

export function observed(value, key) {
  const aliases = { name: 'printedNativeName', hp: 'printedHP', stage: 'printedStage', evolvesFrom: 'printedEvolutionFrom', collector: 'printedCollectorNumber', artist: 'printedArtist' };
  return value[aliases[key] ?? key];
}

export function validateActual(signature, k) {
  check(canonicalHash(signature) === k.actualCanonicalSha256 && !Object.hasOwn(signature,'actualPrintedObservations'),
    'Exact direct printed observations, no invented historical wrapper');
  const a = signature;
  check(canonicalHash(a) === k.observationsCanonicalSha256 && a.printedNativeName === k.printedName
    && a.printedCardClass === k.actualClass && a.printedHP === k.hp && a.printedType === k.type
    && a.printedStage === k.stage && a.printedEvolutionFrom === k.evolvesFrom
    && a.printedCollectorNumber === k.collector && a.printedArtist === k.artist, 'Full actual Japanese name/body/footer');
  check(a.abilities.length === k.abilityCount && a.attacks.length === k.attackCount
    && a.printedPokemonExRule === k.exRule && a.printedRules === k.rules, 'Complete attacks/costs/effects/abilities/rules');
  if (k.actualClass === 'Trainer') {
    check(['printedType','printedStage','printedEvolutionFrom','printedEvolutionPlacement','printedPokemonExRule'].every(key => a[key] === null)
      && a.attacks.length === 0 && (a.printedTrainerSubtype ?? null) === k.trainerSubtype && a.printedRules.length > 0,
      'Actual Trainer subtype and complete rules; no invented Pokemon fields');
    if (k.finiteFossilException) {
      const fossils = {'d375bdec-7d0e-46ff-a6b9-b156ed9af609':[40,'するどいせきしつ'], '54ab745b-392e-46a6-8480-b4dc593124a7':[50,null], 'f1ccf730-c3d2-44b6-a59d-72c0f1f6f2b9':[40,'すいとるせきしつ']};
      const exact = fossils[k.printingId];
      check(exact && a.printedHP === exact[0] && a.abilities.length === (exact[1] ? 1 : 0)
        && (!exact[1] || a.abilities[0].kind === 'ポケボディー' && a.abilities[0].name === exact[1]),
        'Only three finite authentic fossil Trainers retain actual HP and abilities');
    } else check(a.printedHP === null && a.abilities.length === 0 && a.printedTrainerSubtype === 'スタジアム',
      'Ordinary Trainer guard unchanged outside exact fossil IDs');
  }
  check(!Object.hasOwn(a,'printedForm') && !Object.hasOwn(a,'printedNationalDex') && !Object.hasOwn(a,'printedSetCodeLiteral'),
    'Absent form/Dex/literal set code stay absent');
}

function separateWitnesses(body, k) {
  check(canonicalHash(body.raw_source_printed_witness) === k.rawSourceWitnessCanonicalSha256
    && body.raw_source_printed_witness_canonical_sha256 === k.rawSourceWitnessCanonicalSha256
    && body.raw_source_witness_insertion_sha256 === k.rawSourceWitnessInsertionSha256
    && createHash('sha256').update(JSON.stringify(body.raw_source_printed_witness)).digest('hex') === k.rawSourceWitnessInsertionSha256,
    'Unchanged raw witness, key order and original hashes');
  check(canonicalHash(body.root_actual_printed_witness) === k.rootActualWitnessCanonicalSha256
    && body.root_actual_printed_witness_canonical_sha256 === k.rootActualWitnessCanonicalSha256
    && canonicalHash(body.additive_actual_evolution_observation) === k.additiveActualPlacementSha256,
    'Separately hash-bound actual root evolution observation');
  check(body.raw_source_printed_witness.printedEvolutionPlacement === k.rawEvolutionPlacement
    && body.root_actual_printed_witness.printedEvolutionPlacement === k.actualEvolutionPlacement
    && body.additive_actual_evolution_observation.rawField === k.rawEvolutionPlacement
    && body.additive_actual_evolution_observation.rootActualLiteral === k.actualEvolutionPlacement
    && body.raw_source_witness_is_verbatim_certified === false && body.raw_source_witness_not_rewritten === true,
    'Raw direct observations remain unchanged; root whole-body reading separately bound');
  check(canonicalHash(body.raw_source_historical_flags) === canonicalHash({ sourceSelectionApproved: false, preparationApproved: false, publicationApproved: false }),
    'Historical false source flags retained');
}

export function validateSourceRow(raw, body, controls) {
  const k = knownSource(raw.printingId);
  check(canonicalHash(raw) === k.rawCanonicalSha256 && canonicalHash(body) === k.bodyCanonicalSha256
    && canonicalHash(controls) === k.controlsCanonicalSha256, 'Exact root raw/body/controls/current tuples');
  const urlHash = createHash('sha256').update(raw.sourceImageUrl).digest('hex');
  check(raw.selectedSourceCardId === 'pricecharting-image-url-sha256:' + urlHash
    && raw.rawProposedSourceCardIdPreserved === 'pricecharting-original-url-sha256:' + urlHash
    && raw.literalImageUrlSha256 === urlHash && raw.sourceProviderProductId === k.productId,
    'Two exact photo namespaces share literal URL identity; product ID is metadata only');
  check(raw.setCode === 'PCG5' && raw.languageCode === 'ja' && raw.category === null && raw.currentRecordedEnglishName === null
    && raw.requiredAssetScope.assetVariantId === null && raw.requiredAssetScope.sourceVariantId === null
    && raw.eligibleVariantIsDefaultFlag === k.defaultFlag && raw.currentActualApiDefaultVariantId === k.variantId,
    'Unchanged catalogue labels/nulls/default fallback/shared scope');
  check(raw.actualPixelSignatureSchema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Exact direct observation schema');
  check(canonicalHash(raw.sourceLineage) === k.sourceLineageCanonicalSha256 && raw.actualPrintedOwner === k.printedOwner && raw.actualPrintedNameQualifier === k.printedNameQualifier, 'Exact genuine source history and ownership/form distinction');
  check(raw.finiteFossilException === k.finiteFossilException && canonicalHash(raw.rawSourceReview) === k.rawSourceReviewCanonicalSha256 && canonicalHash(raw.finiteContractResolution) === k.finiteContractResolutionCanonicalSha256, 'Finite fossil history/projection retained');
  validateActual(raw.actualPixelSignature, k); separateWitnesses(body, k);
  return k;
}

export function validatePublishedWitness(body, row) {
  const k = knownSource(row.printing_id);
  publicProjection(body);
  check(body.global_trainer_guard_changed === false && body.finite_fossil_exception === k.finiteFossilException && canonicalHash(body.raw_source_review) === k.rawSourceReviewCanonicalSha256 && canonicalHash(body.finite_contract_resolution) === k.finiteContractResolutionCanonicalSha256, 'Exact finite fossil resolution preserves historical source holds/false flags without global changes');
  check(canonicalHash(body.source_lineage) === k.sourceLineageCanonicalSha256 && body.queue_controls.identity_controls.actual_printed_owner === k.printedOwner && body.queue_controls.identity_controls.actual_printed_name_qualifier === k.printedNameQualifier && body.photo_identity_projection.actualPrintedOwner === k.printedOwner, 'Genuine006/007 lineage and printed owner distinct from form');
  check(canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === k.controlsCanonicalSha256,
    'Whole immutable public body and controls resist joint forgery');
  check(body.actual_pixel_signature_schema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Public witness remains direct');
  validateActual(body.actual_pixel_signature, k); separateWitnesses(body, k);
  check(row.set_code === 'PCG5' && row.language_code === 'ja' && row.collector_number === k.alias
    && row.card_native_name === k.currentLabel && row.provider_id === k.sourceCardId && row.image_url === k.imageUrl
    && row.evidence.source_page_url === k.sourcePageUrl && row.work_type === 'CARDS', 'Exact current printing and original URL');
  check(body.accepted_category === null && body.recorded_inventory_category === null && body.actual_printed_category === k.actualClass
    && body.actual_native_category === k.actualClass && body.canonical_english_null_preserved === true, 'Actual class never fills null canonical metadata');
  const identity = body.queue_controls.identity_controls;
  check(identity.actual_printed_form === k.printedForm && identity.printed_national_dex === null && identity.printed_set_code_literal === null
    && identity.canonical_english_label_preserved === null && body.photo_identity_projection.actualPrintedForm === k.printedForm,
    'No invented form/Dex/English/set-code literal');
  check(body.required_asset_scope.printing_id === row.printing_id && body.required_asset_scope.set_id === row.set_id
    && body.required_asset_scope.variant_id === null && body.source_variant_id === null && body.required_delivery_kind === 'shared',
    'Null shared source/asset variant binding');
  check(body.root_finite_authority.decision_file_byte_sha256 === authority.decisionFileSha256
    && body.root_finite_authority.preparation_approved === true
    && body.root_finite_authority.conditional_future_publication_root_owned === true
    && body.root_finite_authority.private_package_is_production_ready === false, 'Finite root authority; private package is not live');
  for (const key of ['current_production_binding', 'current_staging_binding']) {
    const binding = body[key], variant = binding.variants[0];
    check(binding.printing.id === row.printing_id && binding.variants.length === 1 && binding.published_bindings.length === 1
      && variant.id === k.variantId && variant.variant_code === k.variantCode && variant.finish_code === k.finishCode
      && variant.is_default === k.defaultFlag && binding.published_bindings[0].variant_id === variant.id,
      'Full unchanged per-environment finish/default/lifecycle tuple');
  }
  check(body.shared_front_eligibility_does_not_authenticate_physical_edition === true
    && body.original_canvas_is_not_card_region_dimensions === true && body.unresolved_physical_qualifications.length > 0
    && body.source_provider_body_verbatim_agreement === false && body.new_source_requests === 0,
    'Physical/card-region/provider qualifications retained');
  for (const key of ['provider_native_resolution_certified', 'native_optical_gain_claimed', 'stackr_enlargement',
    'source_wide_approval', 'vendor_licence_certified', 'physical_finish_certified', 'physical_edition_certified']) {
    check(body[key] === false, 'No invented physical/licence/provider/optical certification');
  }
  return k;
}
