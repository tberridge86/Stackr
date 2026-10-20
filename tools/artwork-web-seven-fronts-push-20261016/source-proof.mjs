import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "7b63e002-ca85-4d4d-be9d-fbaa54f6b959": {
    "rawCanonicalSha256": "8dfbfd3c2155585995ebc8e372fa625b7d3039890d46de802167a49e1902132a",
    "bodyCanonicalSha256": "fb4d23a95de21e9f5a63d6236c08139acf1aa2d31de6f39806e56b27816e2d98",
    "controlsCanonicalSha256": "9cb1409d05f6e82fa4296b5e3e2d2cddc1d58c02a9899a260065762eca2510ae",
    "rowCanonicalSha256": "0e85c4c1b5b44d6fa874139a85204a671999d81c1ed25d5a26862fda3b1351ad",
    "actualCanonicalSha256": "be4ace97c830e0a544279fcfec3759c8f6aa949f84dc258620de4f5e63b05b64",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "63a7646e-f0e5-48c3-967f-f2a222992bcb",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7b63e002-ca85-4d4d-be9d-fbaa54f6b959",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:007:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "007",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "63a7646e-f0e5-48c3-967f-f2a222992bcb",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7b63e002-ca85-4d4d-be9d-fbaa54f6b959",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:007:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "007",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:8025c373e49be6a5aa12006a0d90c70e536fd067923861f6808328c45fd4bb59",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/charmeleon-7",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/e584001619e0a9c1a239f8cd34ddf57d01efb4e421149f750b8ee6c16897b837/1600.jpg",
    "productId": "3438190",
    "setCode": "web1",
    "alias": "007",
    "currentLabel": "チャームレオン",
    "printedName": "リザード",
    "printedForm": null,
    "category": null,
    "actualClass": "Pokemon",
    "hp": 80,
    "type": "Fire",
    "stage": "1進化",
    "evolvesFrom": "ヒトカゲ",
    "collector": "007/048",
    "artist": "Mitsuhiro Arita",
    "variantId": "63a7646e-f0e5-48c3-967f-f2a222992bcb",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "6359fa57e77511c7a4cc24e9bee16c8a3bbd6944f4bcd1f1e3cb5140e4a7fc7f",
      "bytes": 554004,
      "width": 1200,
      "height": 1600,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "cf0a42d79f2dd47da688d8f7f2f23fb105cfdb27338f435806ad11d5a1758767"
    },
    "observationsCanonicalSha256": "f04ae7e93440d324af89d8885821ea89a277b3b7efc07fe3057163b93854ae7a",
    "entryCanonicalSha256": "2cd150691f553aa5761419308111055bba9a65dcd6e527f72c77ea09a4f07e4d",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "13e535b9f0978f97289875c6bdc211bb7af045213a8bc40df447ff51a5df70d2",
    "rawSourceWitnessInsertionSha256": "605b5bad24ee13f50efbeba7bcb33da6b6be897f6ff4021f0bdb36f7bc27abab",
    "rootActualWitnessCanonicalSha256": "f04ae7e93440d324af89d8885821ea89a277b3b7efc07fe3057163b93854ae7a",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "0392bdb197728c6eb8a91f25515c57058c0e1c8b4230566721eaf18a6f439e79"
  },
  "221185d3-e4f8-4669-b339-5f06c86c0d50": {
    "rawCanonicalSha256": "4e106edb1c1c54341e258c04a0823e5445a02d18d88b288d74984033b244447e",
    "bodyCanonicalSha256": "4680562a35df0cba271ec06b60fa9a7c990442d52eb71ca8c726d926d7fb700b",
    "controlsCanonicalSha256": "d7cf3f5c92904ca25dbc991864a3125a4af09ab01720cac8e234f9a84818d5dd",
    "rowCanonicalSha256": "47efaadb3dd379bcdfcf4b28bdb09a635ad65e7c2175f31afd9e0fb59bd68220",
    "actualCanonicalSha256": "15d17fb1291853eecc9f101b37cfc624f39dc0a591f0dd765192a55d3820509b",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "b4c11fcc-df60-4b5e-ad4f-32f861555c7f",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "221185d3-e4f8-4669-b339-5f06c86c0d50",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:025:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "025",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "b4c11fcc-df60-4b5e-ad4f-32f861555c7f",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "221185d3-e4f8-4669-b339-5f06c86c0d50",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:025:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "025",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:f5f108c16d6561cc1e747b367859046032abc5b8393528cd7892bfdc33688d51",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/surfing-pikachu-25",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/dcyozyfpn33u4qtq/1600.jpg",
    "productId": "3438208",
    "setCode": "web1",
    "alias": "025",
    "currentLabel": "サーフィンピカチュ",
    "printedName": "なみのりピカチュウ",
    "printedForm": "なみのり",
    "category": null,
    "actualClass": "Pokemon",
    "hp": 50,
    "type": "Lightning",
    "stage": "たねポケモン",
    "evolvesFrom": null,
    "collector": "025/048",
    "artist": "Toshinao Aoki",
    "variantId": "b4c11fcc-df60-4b5e-ad4f-32f861555c7f",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "1adbcd4a234d8afd00df3bc781d30cbce823b959df22399e28aa023eacf7ba88",
      "bytes": 307837,
      "width": 1162,
      "height": 1600,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "ce519a127798578c72a2878021a8c8671dc13d8bac4e803b2ba6ddbb70dc9728"
    },
    "observationsCanonicalSha256": "0604ed45cb5d4c6c7ec7964dd3dc4094073345ac760d9c5e45d3ad22a582e65d",
    "entryCanonicalSha256": "893fb0a42c898cd2c0dce71e4875c4cbc521278dbd7989eacd8e902a004112f2",
    "abilityCount": 0,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "0604ed45cb5d4c6c7ec7964dd3dc4094073345ac760d9c5e45d3ad22a582e65d",
    "rawSourceWitnessInsertionSha256": "0d574b2ddd84c472558f1501d148265efcd9c9a9825fa52eb0deb4e6451c8761",
    "rootActualWitnessCanonicalSha256": "0604ed45cb5d4c6c7ec7964dd3dc4094073345ac760d9c5e45d3ad22a582e65d",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "0392bdb197728c6eb8a91f25515c57058c0e1c8b4230566721eaf18a6f439e79"
  },
  "7bab8d58-4c34-47a8-a07f-b34c8ab0bd98": {
    "rawCanonicalSha256": "a7b95a639a7f30b5dc2cabd49e8e5bbe0091a630366a92d08c8acf1f8cb8da71",
    "bodyCanonicalSha256": "a79688f245b9ef10fe2980f4e1956c439c290795ea23de58b05586dc7fa3515f",
    "controlsCanonicalSha256": "a31661a140374fa67e22858cefa81a41c656a4289ee3053cd4ceee81b6c5e80c",
    "rowCanonicalSha256": "001a9751534e1396c30f601a5906c8026fede58a1d22392da8cb2731e7876b9f",
    "actualCanonicalSha256": "8735746b977e7a0787b093d7ed574417f041c63d94f394f05ed6ba50df1f8380",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "bfe40325-ca29-4c73-8917-194c4f83dc88",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7bab8d58-4c34-47a8-a07f-b34c8ab0bd98",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:036:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "036",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "bfe40325-ca29-4c73-8917-194c4f83dc88",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7bab8d58-4c34-47a8-a07f-b34c8ab0bd98",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:036:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "036",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:361e077f18538537629ba063711b9ac652100781955e66c82ca2403e0b4dceb9",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/raichu-36",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/nl26jcc3aji763o6/1600.jpg",
    "productId": "3438219",
    "setCode": "web1",
    "alias": "036",
    "currentLabel": "ライチュ",
    "printedName": "ライチュウ",
    "printedForm": null,
    "category": null,
    "actualClass": "Pokemon",
    "hp": 80,
    "type": "Lightning",
    "stage": "1進化",
    "evolvesFrom": "ピカチュウ",
    "collector": "036/048",
    "artist": "Ken Sugimori",
    "variantId": "bfe40325-ca29-4c73-8917-194c4f83dc88",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "380c50eb1d97db5a39bf76d341675571851217f22b28cefe3ba914b2062f8fae",
      "bytes": 188937,
      "width": 745,
      "height": 1045,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "7090a9765fd7fcbf270d6c831909fdadc9f908af184f13ea624679c55b05d9b9"
    },
    "observationsCanonicalSha256": "339fd2a7352f7702bad085e015ed0485ca0343e4a01d0fd4417c84dc7166e6ad",
    "entryCanonicalSha256": "8997eab88155011af3d2c636ae2fc48fd78430e61766b40fbda97193d5ba0496",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "339fd2a7352f7702bad085e015ed0485ca0343e4a01d0fd4417c84dc7166e6ad",
    "rawSourceWitnessInsertionSha256": "85411495d86f3bf178aa40359ba251829145b471f3fed49a1c25d1b0ec319315",
    "rootActualWitnessCanonicalSha256": "339fd2a7352f7702bad085e015ed0485ca0343e4a01d0fd4417c84dc7166e6ad",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "fa1ff046b96e16270475fbc839905030eb3e272e6cfcd349241c05dd8a392b69"
  },
  "2229f37c-46cb-4cb5-9e3c-22b10735ec5c": {
    "rawCanonicalSha256": "6206ddb6f6daf86e359ab2ec16e7aac8c729048c615df19af182f212d8a31956",
    "bodyCanonicalSha256": "2e912823a3ebbe2dacd747ec897227d4afe3cec13cbac0e8901cc9eae6c5f80c",
    "controlsCanonicalSha256": "9a887bf18b9758a646ca904ec0b540d9e25bb56779c0af86526cfcf848f354e1",
    "rowCanonicalSha256": "ff3f0ce7356fcfa52a282b7688d1aea937e3a82c742d3810be32660f1dbcef06",
    "actualCanonicalSha256": "b310060f98406ab832fd7bd54079cb5be4e3c3733114a85862993746f087e561",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "96b4e038-d8b8-4d7b-85a5-3ba621001f61",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "2229f37c-46cb-4cb5-9e3c-22b10735ec5c",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:038:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "038",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "96b4e038-d8b8-4d7b-85a5-3ba621001f61",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "2229f37c-46cb-4cb5-9e3c-22b10735ec5c",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:038:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "038",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:b8dfac137447cc31ebf4870ec6394412b99d2eec1716074f4c9dff4ddb32d4c9",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/dragonite-38",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/9519a47ffd2c163c2efba04334662b0ebfcbd735945eb4c24765c85db046d0a4/1600.jpg",
    "productId": "3438221",
    "setCode": "web1",
    "alias": "038",
    "currentLabel": "ドラゴナイト",
    "printedName": "カイリュー",
    "printedForm": null,
    "category": null,
    "actualClass": "Pokemon",
    "hp": 90,
    "type": "Colorless",
    "stage": "2進化",
    "evolvesFrom": "ハクリュー",
    "collector": "038/048",
    "artist": "Toshinao Aoki",
    "variantId": "96b4e038-d8b8-4d7b-85a5-3ba621001f61",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "d636ee4d10532d7924e5b42cceb3de397d4f930cccb41afa7de3757e09d231d0",
      "bytes": 167503,
      "width": 845,
      "height": 1159,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "7d3a0ce96606b995ab916b63d60b6bb5fe223c28200960af02a6d2e93ef2504d"
    },
    "observationsCanonicalSha256": "b935db7465e2588e4952eceb12395890dbe47cd752bbb31903a7c5326b368cef",
    "entryCanonicalSha256": "fbf7f0df626425fc7ebc95d489ddfd9c0b381f6b1b93dfe33b05d42a3089ef97",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "b935db7465e2588e4952eceb12395890dbe47cd752bbb31903a7c5326b368cef",
    "rawSourceWitnessInsertionSha256": "0143a5ad6be798808cec338a191d48a4e37f56eacddc6093c08889b7e89ac471",
    "rootActualWitnessCanonicalSha256": "b935db7465e2588e4952eceb12395890dbe47cd752bbb31903a7c5326b368cef",
    "actualPrintedAbilityLogo": "ポケパワー",
    "rootAdditiveObservationSha256": "fa1ff046b96e16270475fbc839905030eb3e272e6cfcd349241c05dd8a392b69"
  },
  "96fe50ae-f69c-4ddb-a401-fa7d97c9ad46": {
    "rawCanonicalSha256": "8893228ae6553368f1bd7bd81f9717a4b840cf783810dacea0ee31d8c5249017",
    "bodyCanonicalSha256": "b9a393a8ed9af739bc9f7616115996f5b881b2443ba1bf7d212157350796c837",
    "controlsCanonicalSha256": "4ccfe540e8d8942c58c27e444163b2fdf6dab0c3b9bac71daf4f298d94dea856",
    "rowCanonicalSha256": "00f75d700e5ddcdae3ae8f8a45a783c5f86a8a0856d25e43bd5c4c383ef205e8",
    "actualCanonicalSha256": "beb73ab56cc6f497b1a8f712a753d2194fb404055b29b348876e7479667be029",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "79e20e98-58f0-4275-bfd2-78d72f52c24c",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "96fe50ae-f69c-4ddb-a401-fa7d97c9ad46",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:040:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "040",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "79e20e98-58f0-4275-bfd2-78d72f52c24c",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "96fe50ae-f69c-4ddb-a401-fa7d97c9ad46",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:040:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "040",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:866a95773acb4f52d0e41a403ff8efbb11722794f54c730ac565fa98426ce9a6",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/rocket%27s-sneak-attack-40",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/qks6j7y53asg4f4x/1600.jpg",
    "productId": "3438223",
    "setCode": "web1",
    "alias": "040",
    "currentLabel": "ロケットのスニーク攻撃",
    "printedName": "ロケット団のおねーさん",
    "printedForm": null,
    "category": null,
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "040/048",
    "artist": "Ken Sugimori",
    "variantId": "79e20e98-58f0-4275-bfd2-78d72f52c24c",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "1f55aa7203602af261cae926f161816f1fd893bcf5fb4464835e336d6787c962",
      "bytes": 182299,
      "width": 731,
      "height": 1026,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "995f224c3c964cc8ed7ed6239a99926d365258276d08f8f4355177ff307671d4"
    },
    "observationsCanonicalSha256": "33ee3b8d9e9c10231e0773807dfdb76a0f62342510e2dc40aa8ec4ed86f3c188",
    "entryCanonicalSha256": "5cdbf31b5649821238d5fbe83a9e09c9c1afaf8e1dab25eeba11f6487e08b480",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "33ee3b8d9e9c10231e0773807dfdb76a0f62342510e2dc40aa8ec4ed86f3c188",
    "rawSourceWitnessInsertionSha256": "5a86cd5a890044c7ec02432faebf87bb2ace23188b2f83e9ab3dddad8371d9d7",
    "rootActualWitnessCanonicalSha256": "33ee3b8d9e9c10231e0773807dfdb76a0f62342510e2dc40aa8ec4ed86f3c188",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "fa1ff046b96e16270475fbc839905030eb3e272e6cfcd349241c05dd8a392b69"
  },
  "1f42fce8-0f6a-48bd-ad47-8b0217f7db53": {
    "rawCanonicalSha256": "363d0d2e0d7f3332b1f7d8b42839163b40059513f666ec3847617f890c427060",
    "bodyCanonicalSha256": "c336ec91586f6c8c3d9e07ad4e8209ae82df97e621fdd95bbef5f42768432eee",
    "controlsCanonicalSha256": "0af6c1270e04dd02b6d4ce72384d8da13479a8345e8f78d7ae991ce7a4651fec",
    "rowCanonicalSha256": "2301728de4421d5d12a48ccb2af3979bf50a53c73629a7601535b17486f87153",
    "actualCanonicalSha256": "ee66e3a9d3f7ba060932b601d9f023630dd4960c3a77da2174118518685f39f7",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "65789ad6-bc36-46d8-a06d-68cac9ec0a5e",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "1f42fce8-0f6a-48bd-ad47-8b0217f7db53",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:046:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "046",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "65789ad6-bc36-46d8-a06d-68cac9ec0a5e",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "1f42fce8-0f6a-48bd-ad47-8b0217f7db53",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:046:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "046",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:55616df61cdeda7d40274f0ba86bbc0bd7c4723320281c05d2e000122abda2ad",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/zapdos-46",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/4lzqgvdhi3xormtw/1600.jpg",
    "productId": "3438229",
    "setCode": "web1",
    "alias": "046",
    "currentLabel": "ザプドス",
    "printedName": "サンダー",
    "printedForm": null,
    "category": null,
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "Lightning",
    "stage": "たねポケモン",
    "evolvesFrom": null,
    "collector": "046/048",
    "artist": "Naoyo Kimura",
    "variantId": "65789ad6-bc36-46d8-a06d-68cac9ec0a5e",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "efe1a9492cf1a0d6af2c612fbeb81571a380ec3c24a962c4b69d9ec564c4fad7",
      "bytes": 125230,
      "width": 748,
      "height": 1053,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "86ffd4e34f43fb9e986eda0002fa641c81384d06604f94f316cd600bf183e597"
    },
    "observationsCanonicalSha256": "ce2ba04bceeb159ce8896841a07183323084fc7bec3fd5c0907f576b2e2888a7",
    "entryCanonicalSha256": "5c2036ab18a4dcb95348acfbd538a1559f1edcb35a399d8764cc95521259d8a4",
    "abilityCount": 0,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "ce2ba04bceeb159ce8896841a07183323084fc7bec3fd5c0907f576b2e2888a7",
    "rawSourceWitnessInsertionSha256": "59175bef98610dc5cbfb137d035b5f5b07fe00b5e049ed17a54db299128aa87e",
    "rootActualWitnessCanonicalSha256": "ce2ba04bceeb159ce8896841a07183323084fc7bec3fd5c0907f576b2e2888a7",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "f6ac7c6d0d9f0ec40a76d6426d52a65fcfec8865bfe9cebdd60960e4fac077d6"
  },
  "fe52e1d7-ea84-4456-b139-61f4c83d1de2": {
    "rawCanonicalSha256": "71c17338f7d676c2a4abfca8d6124866201a46e188fdd553dcba0c62c8485ddf",
    "bodyCanonicalSha256": "6a28be7d7ab387f3517d0d18dadf7dbfced1e54bd2aff885bb8058fd883ebd54",
    "controlsCanonicalSha256": "68f25c8fa62aecdfdebce50f8f50e273d882e1b6389a95287291312f8904dec4",
    "rowCanonicalSha256": "99e413a61a4766b428aed504a46af6f94d06161003210de1f642394dedd7ded8",
    "actualCanonicalSha256": "3c5e64ff52db6970301b9694b6f5b8c92ceb6a2c741846a499c47922927375c0",
    "production": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "598ec080-7293-417b-95a5-a1e5a0909f80",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "fe52e1d7-ea84-4456-b139-61f4c83d1de2",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:048:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "048",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "cdb922a5-eaec-4696-ae6f-3ad4d263c66b",
        "set_code": "web1",
        "variant_id": "598ec080-7293-417b-95a5-a1e5a0909f80",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "fe52e1d7-ea84-4456-b139-61f4c83d1de2",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:cdb922a5-eaec-4696-ae6f-3ad4d263c66b:048:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "048",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:6a66f8bc5a37959a168af59de4c9294650c084572e7c6c2e1190980f62aabcd5",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-web/machamp-48",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/e76c14c1439f4b9d87668f04afde9c1152ff7d5130a7bb706d70b986dc827904/1600.jpg",
    "productId": "3438231",
    "setCode": "web1",
    "alias": "048",
    "currentLabel": "マチャンプ",
    "printedName": "カイリキー",
    "printedForm": null,
    "category": null,
    "actualClass": "Pokemon",
    "hp": 90,
    "type": "Fighting",
    "stage": "2進化",
    "evolvesFrom": "ゴーリキー",
    "collector": "048/048",
    "artist": "Tomokazu Komiya",
    "variantId": "598ec080-7293-417b-95a5-a1e5a0909f80",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "3c2ccbbc76085052edeead642d887c045132bc22835f46efe950780c8104250f",
      "bytes": 202668,
      "width": 718,
      "height": 1024,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "55b58566961b55ba62084a7dbcb5677cd940fc6d2e391b9a97b7be382353e15e"
    },
    "observationsCanonicalSha256": "6881f6639b5a44e24f4d42ae8189d96884f3d089783162a4639d40d89f8c8d98",
    "entryCanonicalSha256": "3b0a8ab5087a6fa304d30b7e0202a7dec434ce8a5ba684e7f4d09d537536dad6",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "6881f6639b5a44e24f4d42ae8189d96884f3d089783162a4639d40d89f8c8d98",
    "rawSourceWitnessInsertionSha256": "fb8c48708d14cab3f4a5ac665a25733dc18b6eef420f9d7af06f9c06e6879868",
    "rootActualWitnessCanonicalSha256": "6881f6639b5a44e24f4d42ae8189d96884f3d089783162a4639d40d89f8c8d98",
    "actualPrintedAbilityLogo": null,
    "rootAdditiveObservationSha256": "f6ac7c6d0d9f0ec40a76d6426d52a65fcfec8865bfe9cebdd60960e4fac077d6"
  }
};
const authority={
  "approvedCanonicalSha256": "33f847a701f8eddd963d7c1cecec197e69e36e9fd79ba7eaaf73d9395eb05a47",
  "decisionCanonicalSha256": "dec7acad60b6bd73be5ba9ce54a78d6a0e8da8c70fb5568922baf2ceb1219095",
  "approvedFileSha256": "ebcd8e328e76a92eabd405d582b87a65c4b3f66f66c226c1aa360c8ee2592fa0",
  "decisionFileSha256": "aefe0b3acfb003468bd87244fd440b8639ec71546b8df2f3bfac3844a2e2363d",
  "rootContextFileSha256": "5bea0fdc6c762a23a2b19215952eb3734487a0c71106b320c993eea0d3c8b319"
};
export function knownSource(id) {
  const row = expectedRows[id];
  check(row, 'Outside exact seven Japanese Web shared fronts');
  return row;
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
  check(canonicalHash(approved) === authority.approvedCanonicalSha256 && canonicalHash(decision) === authority.decisionCanonicalSha256, 'Exact final root seven-front authority required');
  check(approved.rows.length === 7 && decision.preparationApproved === true && decision.conditionalPublicationApproved === true && decision.productionSourceChangesAllowed === 0 && decision.approvedProjectionSha256 === authority.approvedFileSha256, 'Exact finite authority and zero source changes');
  check(canonicalHash(decision.expectedProductionRows) === canonicalHash([33,47]) && canonicalHash(decision.expectedStagingRows) === canonicalHash([29,44,29]) && decision.beforeQueryHasOnlyThese15Ids === true, 'Exact fifteen-ID preservation scope');
  for (const raw of approved.rows) {
    const k = knownSource(raw.printingId);
    check(canonicalHash(raw) === k.rawCanonicalSha256 && raw.requiredAssetScope.printingId === raw.printingId && raw.requiredAssetScope.assetVariantId === null && raw.requiredAssetScope.sourceVariantId === null && decision.printingIds.includes(raw.printingId) && decision.variantIds.includes(k.variantId), 'Exact original printing/shared variant scope');
  }
  return true;
}

// Raw observation keys stay intact; these getters never manufacture a form or Dex.
export function observed(value, key) {
  const aliases = {name:['printedNativeName','printedName'], hp:['printedHP','hitPoints'], stage:['printedStage','stage'], evolvesFrom:['printedEvolutionFrom','evolvesFrom'], collector:['printedCollectorNumber','collectorNumber'], artist:['printedArtist','artist']};
  for (const field of aliases[key] || [key]) if (Object.hasOwn(value, field)) return value[field];
  return undefined;
}

export function validateActual(witness, k) {
  check(canonicalHash(witness) === k.actualCanonicalSha256, 'Complete original wrapped Japanese signature changed');
  const a = witness.actualPrintedObservations;
  check(witness.alias === k.setCode + '-' + k.alias && witness.originalSha256 === k.original.sha256 && a && canonicalHash(a) === k.observationsCanonicalSha256, 'Full unchanged observation keys and Japanese body');
  check(a.printedNativeName === k.printedName && a.printedCardClass === k.actualClass && a.printedCollectorNumber === k.collector && a.printedArtist === k.artist && a.setMarkVisible === 'Web logo' && a.printedBodyId.startsWith('Y-'), 'Exact printed name/class/footer/Web identity');
  check(!Object.hasOwn(a, 'printedForm') && !Object.hasOwn(a, 'printedNationalDex') && !Object.hasOwn(a, 'printedSetCodeLiteral'), 'Absent raw form/Dex/set-code keys must remain absent');
  check(a.abilities.length === k.abilityCount && a.attacks.length === k.attackCount && a.printedPokemonExRule === k.exRule, 'Complete ability, attack and rule body');
  if (k.actualClass === 'Pokemon') {
    check(a.printedHP === k.hp && a.printedType === k.type && a.printedStage === k.stage && a.printedEvolutionFrom === k.evolvesFrom, 'Exact Pokemon body fields');
  } else {
    for (const key of ['printedHP','printedType','printedStage','printedEvolutionFrom','printedPokemonExRule']) check(a[key] === null, 'Trainer Pokemon-only fields must stay null');
    check(a.printedTrainerSubtype === 'サポーター' && a.printedRules.split('\n').length === 2 && a.attacks.length === 0 && a.abilities.length === 0, 'Trainer supporter and both complete rules');
  }
  if (k.alias === '038') check(a.abilities[0].kind === 'ポケパワー' && a.abilities[0].printedKindHeader === '特殊能力', 'Dragonite actual power and small header');
  check(witness.completePrintedIdentityAndBodyReadable === true, 'Complete readable unchanged original');
}

function validateSeparateWitnesses(body, k) {
  check(canonicalHash(body.raw_source_printed_witness) === k.rawSourceWitnessCanonicalSha256 && body.raw_source_printed_witness_canonical_sha256 === k.rawSourceWitnessCanonicalSha256 && body.raw_source_printed_witness_insertion_order_sha256 === k.rawSourceWitnessInsertionSha256, 'Raw source witness and both original hashes');
  check(createHash('sha256').update(JSON.stringify(body.raw_source_printed_witness)).digest('hex') === k.rawSourceWitnessInsertionSha256 && canonicalHash(body.root_actual_printed_witness) === k.rootActualWitnessCanonicalSha256 && body.root_actual_printed_witness_canonical_sha256 === k.rootActualWitnessCanonicalSha256, 'Separate raw insertion order and actual root witness');
  check(body.raw_source_witness_is_verbatim_certified === false && body.raw_source_witness_not_rewritten === true, 'Raw source witness remains unrewritten and uncertified verbatim');
  if (k.alias === '007') {
    check(body.raw_source_printed_witness.printedEvolutionPlacementRule === '自分の場のヒトカゲの上に重ねて出す。' && body.root_actual_printed_witness.printedEvolutionPlacementRule === '「たねポケモン」の上に重ねて進化させます。', 'Historical paraphrase and separately read exact placement literal');
    check(body.additive_actual_placement_correction.companion_byte_sha256 === '5715565257cf7211c35acde90db026a497f315d0f7c9ec994baab2b1a6199d51' && body.additive_actual_placement_correction.corrected_field === 'printedEvolutionPlacementRule', 'Exact independent additive correction companion');
  } else check(body.additive_actual_placement_correction === null && k.rawSourceWitnessCanonicalSha256 === k.rootActualWitnessCanonicalSha256, 'Other six raw/root witnesses unchanged');
}

export function validateSourceRow(raw, body, controls) {
  const k = knownSource(raw.printingId);
  check(canonicalHash(raw) === k.rawCanonicalSha256 && canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(controls) === k.controlsCanonicalSha256, 'Exact root raw/body/controls/current tuples');
  check(raw.requiredAssetScope.printingId === raw.printingId && raw.requiredAssetScope.assetVariantId === null && raw.requiredAssetScope.sourceVariantId === null && raw.languageCode === 'ja' && raw.setCode === k.setCode && raw.canonicalAlias === k.alias && raw.category === null && raw.recordedInventoryCategory === null && raw.currentNativeLabel === k.currentLabel && raw.workType === 'CARDS', 'Exact saved null category/shared printing scope');
  check(raw.preparationApproved === false && raw.publicationApproved === false && raw.historicalSelectedSourceCardId === null, 'Historical source null/false flags stay unchanged');
  check(raw.sourceProviderProductId === k.productId && raw.selectedSourceCardId === k.sourceCardId && raw.sourceImageUrl === k.imageUrl && raw.selectedSourceCardId === 'pricecharting-image-url-sha256:' + createHash('sha256').update(raw.sourceImageUrl).digest('hex') && raw.sourceProviderBodyVerbatimAgreement === false, 'Literal photo identity distinct from product ID');
  check(raw.actualPrintedForm === k.printedForm && raw.safePhotoIdentityProjection.actualPrintedForm === k.printedForm && controls.identity_controls.actual_printed_form === k.printedForm, 'Exact observed form across raw/photo/controls');
  check(raw.eligibleVariantIsDefaultFlag === k.defaultFlag && raw.currentActualApiDefaultVariantId === k.variantId, 'Five normal TRUE and two holo FALSE current fallback variants');
  validateActual(raw.actualPixelSignature, k);
  validateSeparateWitnesses(body, k);
  return k;
}

export function validatePublishedWitness(body, row) {
  const k = knownSource(row.printing_id);
  publicProjection(body);
  check(canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === k.controlsCanonicalSha256, 'Complete pinned Japanese witness and source controls changed');
  validateActual(body.actual_pixel_signature, k);
  validateSeparateWitnesses(body, k);
  check(row.language_code === 'ja' && row.set_code === k.setCode && row.collector_number === k.alias && row.card_native_name === k.currentLabel && row.work_type === 'CARDS' && row.provider_id === k.sourceCardId && row.image_url === k.imageUrl && row.evidence.source_page_url === k.sourcePageUrl, 'Canonical identity and exact literal source photo');
  check(body.accepted_category === null && body.recorded_inventory_category === null && body.actual_printed_category === k.actualClass && body.actual_native_category === k.actualClass && body.canonical_english_null_preserved === true, 'Canonical category/English stay null independently of actual class');
  const identity = body.queue_controls.identity_controls;
  check(identity.actual_printed_form === k.printedForm && body.photo_identity_projection.actualPrintedForm === k.printedForm && identity.printed_national_dex === null && identity.printed_set_code_literal === null && identity.canonical_english_label_preserved === null, 'Exact separate form and absent Dex/set-code/English observations');
  check(body.actual_printed_ability_logo === k.actualPrintedAbilityLogo && body.root_additive_whole_original_observation_byte_sha256 === k.rootAdditiveObservationSha256, 'Additive actual ability observation');
  check(body.required_asset_scope.printing_id === row.printing_id && body.required_asset_scope.set_id === row.set_id && body.required_asset_scope.variant_id === null && body.photo_identity_projection.canonicalPrintingId === row.printing_id && body.source_variant_id === null && body.required_delivery_kind === 'shared' && body.actual_pixel_signature_canonical_sha256 === k.actualCanonicalSha256, 'Shared null source/asset scope and complete wrapper');
  const finite = body.root_finite_authority;
  check(finite.approved_file_byte_sha256 === authority.approvedFileSha256 && finite.decision_file_byte_sha256 === authority.decisionFileSha256 && finite.preparation_context_byte_sha256 === authority.rootContextFileSha256 && finite.preparation_approved === true && finite.conditional_future_publication_approved === true && finite.private_package_is_production_ready === false, 'Exact finite root authority; private package is not live');
  check(body.historical_authority.selected_source_card_id === null && body.historical_authority.preparation_approved === false && body.historical_authority.publication_approved === false, 'Historical source-only null/false authority');
  for (const key of ['current_production_binding','current_staging_binding']) {
    const binding = body[key], variant = binding.variants[0], published = binding.published_bindings[0];
    check(binding.printing.id === row.printing_id && binding.variants.length === 1 && binding.published_bindings.length === 1 && variant.printing_id === row.printing_id && published.printing_id === row.printing_id && variant.id === k.variantId && published.variant_id === variant.id && variant.is_default === k.defaultFlag && variant.finish_code === k.finishCode && variant.variant_code === k.variantCode && published.finish_code === k.finishCode && published.variant_code === k.variantCode, 'Both complete current finish/default/lifecycle tuples');
  }
  if (k.alias === '048') check(k.original.width === 718 && k.original.height === 1024 && body.quality_qualification.source_hd_canvas_signal === false, 'Machamp718 width advisory retained without enlargement');
  check(body.shared_front_eligibility_does_not_authenticate_physical_edition === true && body.unresolved_physical_qualifications.length > 0 && body.source_provider_body_verbatim_agreement === false && body.canonical_native_label_preserved === true, 'Physical, native label and nonverbatim qualifications');
  for (const key of ['physical_finish_certified','physical_edition_certified','physical_material_authenticity_verified','unlimited_edition_certified','source_wide_approval','vendor_licence_certified','provider_never_resized_certified','native_optical_gain_claimed','stackr_enlargement','full_commercial_html_or_provider_json_included']) check(body[key] === false, 'No invented licence/physical/provider/optical certification or raw captures');
  return k;
}
