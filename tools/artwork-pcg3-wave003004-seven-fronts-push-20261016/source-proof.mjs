import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "a57a1f5c-8506-4f65-9f19-8ee9b95eb3a5": {
    "rawCanonicalSha256": "1971ebbf9c388499064565c8372c0e4a0c7b1fb0b40a4bcf2882fd44a565edba",
    "bodyCanonicalSha256": "4f6c064fb2fe79a14f9c482ebc05955168873471a8d7e85358bf8ef3c8f92158",
    "controlsCanonicalSha256": "dcd22e783095623834f0a5cfec5cedcb2f4f1f41ff2cefdedcf5939fe80fea21",
    "rowCanonicalSha256": "bc586d6d90e1437182538a61a9b513fe261c3f4610ab728f6e34bb32ffcece46",
    "actualCanonicalSha256": "e6682d6d57686bdcf477102c6fe3109ce2d98b114f0b5f00a25a338ebcf179a6",
    "rootDecisionRowCanonicalSha256": "d447a82d1f1fc8a2b60ba0295cf5b58a3e695841489561067d47c75e1d09070c",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "43e914e2-1614-4b86-81da-b1ef02613b36",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "a57a1f5c-8506-4f65-9f19-8ee9b95eb3a5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:003:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "003",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "43e914e2-1614-4b86-81da-b1ef02613b36",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "a57a1f5c-8506-4f65-9f19-8ee9b95eb3a5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:003:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "003",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:7e041a5d55ef5a4fab3ab20d41c88fcfae1230fd675168591310ce6d67f59eb5",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/grimer-3",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/huooimegywytpjrq/1600.jpg",
    "productId": "3439205",
    "setCode": "PCG3",
    "alias": "003",
    "currentLabel": "グリマー",
    "printedName": "ベトベター",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "003",
      "closedSourceHandoffSha256": "bc26a1d108c875571577624c327999cee8d8bbd1e319a0f6fc418697dd8244ef",
      "independentActualSourceReviewSha256": "da505c25d2d1fc7acbbe0826b73cce1c964477f6dff5103eb1b1ecb8de7cac86",
      "priorFiniteDecisionSha256": "2d17748cc6ef5884b2fd4d2048bf1de1f56afc2413eaebd02ee456492f57f9db",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "52d4db0dddcb59d2d92c24a514a46cb297df4bec06f946a5e813c8bf8dd473f9",
    "actualClass": "Pokemon",
    "hp": 50,
    "type": "草",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "003/084",
    "artist": "Aya Kusube",
    "variantId": "43e914e2-1614-4b86-81da-b1ef02613b36",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "e5a22da5fb3857fd2194c77e341a21dd818711556342feb5c409e59c778c3016",
      "bytes": 200218,
      "width": 776,
      "height": 1083,
      "rgbaSha256": "d7c1b841c2ca15e14ee343f57d6bc75d3d95cd394904d9edb105d415f43413b1"
    },
    "observationsCanonicalSha256": "e6682d6d57686bdcf477102c6fe3109ce2d98b114f0b5f00a25a338ebcf179a6",
    "entryCanonicalSha256": "e75707841283b831c05f635903606306c3308e72e8e72bffb1c1f2e88bb97134",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "e6682d6d57686bdcf477102c6fe3109ce2d98b114f0b5f00a25a338ebcf179a6",
    "rawSourceWitnessInsertionSha256": "98c10567fb2c9b1a6b19be9d2b4e5abdc20a75911d82fc971de3035aa9be28e1",
    "rootActualWitnessCanonicalSha256": "e6682d6d57686bdcf477102c6fe3109ce2d98b114f0b5f00a25a338ebcf179a6",
    "additiveActualPlacementSha256": "b0214e095350f2a79a8643f698f02b32c55191cccd54f09c889eb436ceed267d",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "2eb26020-fa19-4db2-b8e1-fb482d917a96": {
    "rawCanonicalSha256": "591add95f6fec0d4cbe3f1693da894430b994c53783ef913ecc5df3d18e54b68",
    "bodyCanonicalSha256": "ee9d94afc8af68d98d3ee579855c875b6be4f85cf19ba79bd7b4d4f088cb8903",
    "controlsCanonicalSha256": "f815e80ed93d53cd68de3ed458523131de6a2adb07358aa97f8d3941bf87cde8",
    "rowCanonicalSha256": "ce81865362bb33b13c56b55cfa460deec4c80219668515154ed9f9450956d91b",
    "actualCanonicalSha256": "e1c844b6684b6033b17dc0069c136523173ed76e4204f39b69b9d816f700ed60",
    "rootDecisionRowCanonicalSha256": "c329ae2d814d22d1a7e306da18e684be6e34d4a58ea77ec5900e6cdc00ca3f09",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "e83e4c2d-3df5-444e-8ef4-f06ebb9aa0e6",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "2eb26020-fa19-4db2-b8e1-fb482d917a96",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:009:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "009",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "e83e4c2d-3df5-444e-8ef4-f06ebb9aa0e6",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "2eb26020-fa19-4db2-b8e1-fb482d917a96",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:009:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "009",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:51060b79d918caa8e40dafa89a8abe78fb412fe21aa8d481a106ec2fec5a96a3",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/jumpluff-9",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/egenezswe7rp2enj/1600.jpg",
    "productId": "3439211",
    "setCode": "PCG3",
    "alias": "009",
    "currentLabel": "ジャンプラフ",
    "printedName": "ワタッコ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "003",
      "closedSourceHandoffSha256": "bc26a1d108c875571577624c327999cee8d8bbd1e319a0f6fc418697dd8244ef",
      "independentActualSourceReviewSha256": "da505c25d2d1fc7acbbe0826b73cce1c964477f6dff5103eb1b1ecb8de7cac86",
      "priorFiniteDecisionSha256": "2d17748cc6ef5884b2fd4d2048bf1de1f56afc2413eaebd02ee456492f57f9db",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "52d4db0dddcb59d2d92c24a514a46cb297df4bec06f946a5e813c8bf8dd473f9",
    "actualClass": "Pokemon",
    "hp": 90,
    "type": "草",
    "stage": "2進化",
    "evolvesFrom": "ポポッコ",
    "collector": "009/084",
    "artist": "Kyoko Umemoto",
    "variantId": "e83e4c2d-3df5-444e-8ef4-f06ebb9aa0e6",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "67df949bf1f8ab313b547daf6cba7f73c6d534a21f75f459a5f65c8b5ce2b431",
      "bytes": 182546,
      "width": 739,
      "height": 1035,
      "rgbaSha256": "0899d8e01ca775d920db079308689240cc3df0a5b4831c873217f11df53570fd"
    },
    "observationsCanonicalSha256": "e1c844b6684b6033b17dc0069c136523173ed76e4204f39b69b9d816f700ed60",
    "entryCanonicalSha256": "a97403bd65b89bb5cfeb48c2a1097dbd1b9e99fc0cc419c34653e3603a10fc3d",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "e1c844b6684b6033b17dc0069c136523173ed76e4204f39b69b9d816f700ed60",
    "rawSourceWitnessInsertionSha256": "b9b5015fe105554d4444b5bffad8994c48128d50261f56a0f0aec3cdf749b996",
    "rootActualWitnessCanonicalSha256": "e1c844b6684b6033b17dc0069c136523173ed76e4204f39b69b9d816f700ed60",
    "additiveActualPlacementSha256": "05e535fa1b1822fe44e6f8b33ca24b62ddc5268da0eb9fb7f9b67d99787453ee",
    "actualEvolutionPlacement": "ポポッコから進化",
    "rawEvolutionPlacement": "ポポッコから進化",
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "708e67fc-25b0-40f2-9b1d-8a58c3e4bca3": {
    "rawCanonicalSha256": "8c2fab129d05ccc8e0cbc40de0f4b7c43bb8a4957ae2f2cf30cfba2241a8f6f9",
    "bodyCanonicalSha256": "76a6f348dae555c160d2b52cc6413882d335373835e926e88d515c727e8a0073",
    "controlsCanonicalSha256": "8603f0a825f828e451734d33c2ec6769db3b017a94d0f4e5092bfcb2d03b3d2a",
    "rowCanonicalSha256": "996dba71e3829b15aac449d46323a426ce2aeb693e5a31efdcc9584b6390004e",
    "actualCanonicalSha256": "ae39f0efb1bc4d8c560d40d211375165c00e5425d24b9007bee50067cb44c2bf",
    "rootDecisionRowCanonicalSha256": "7dc81d5158d7a8526523753d4ea2fc54381141e0d11f311a5c1f33449d29c20d",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "9a526912-52c2-42b0-bb0f-35fd20195e74",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "708e67fc-25b0-40f2-9b1d-8a58c3e4bca3",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:037:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "037",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "9a526912-52c2-42b0-bb0f-35fd20195e74",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "708e67fc-25b0-40f2-9b1d-8a58c3e4bca3",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:037:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "037",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:dda56e8fc388ecc0302feb9df64c48a3b2bc70229632ba5d1150e5eefc1b73cc",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/dark-electrode-37",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/64i2bcvte3gxjmao/1600.jpg",
    "productId": "3439239",
    "setCode": "PCG3",
    "alias": "037",
    "currentLabel": "暗い電極",
    "printedName": "わるいマルマイン",
    "printedForm": "わるい",
    "printedOwner": null,
    "printedNameQualifier": "わるい",
    "sourceLineage": {
      "wave": "003",
      "closedSourceHandoffSha256": "bc26a1d108c875571577624c327999cee8d8bbd1e319a0f6fc418697dd8244ef",
      "independentActualSourceReviewSha256": "da505c25d2d1fc7acbbe0826b73cce1c964477f6dff5103eb1b1ecb8de7cac86",
      "priorFiniteDecisionSha256": "2d17748cc6ef5884b2fd4d2048bf1de1f56afc2413eaebd02ee456492f57f9db",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "52d4db0dddcb59d2d92c24a514a46cb297df4bec06f946a5e813c8bf8dd473f9",
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "雷・悪",
    "stage": "1進化",
    "evolvesFrom": "ビリリダマ",
    "collector": "037/084",
    "artist": "Kouki Saitou",
    "variantId": "9a526912-52c2-42b0-bb0f-35fd20195e74",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "90f28463e697afd7690154e3c6e5bb4deecffcb453ee0bc14a1a55697ae5f487",
      "bytes": 358807,
      "width": 1083,
      "height": 1525,
      "rgbaSha256": "59bedad79d467925dc101005a8293fa52be868f3c0d47c497b0a3065103f8770"
    },
    "observationsCanonicalSha256": "ae39f0efb1bc4d8c560d40d211375165c00e5425d24b9007bee50067cb44c2bf",
    "entryCanonicalSha256": "c37c2c27bff08864498f90b0b300a016704b2edb8680ef92ae2d60a9b805226c",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "ae39f0efb1bc4d8c560d40d211375165c00e5425d24b9007bee50067cb44c2bf",
    "rawSourceWitnessInsertionSha256": "4475cf966dcf21e03f252b59734b86f7f0310e7b36400bd08b200cb46a45ccad",
    "rootActualWitnessCanonicalSha256": "ae39f0efb1bc4d8c560d40d211375165c00e5425d24b9007bee50067cb44c2bf",
    "additiveActualPlacementSha256": "a31a7ff6420f57ee1736db1bb422f851f3c6b0bcdaf19ccc92945e0f4d9e8b57",
    "actualEvolutionPlacement": "ビリリダマから進化",
    "rawEvolutionPlacement": "ビリリダマから進化",
    "rules": "このポケモンは［雷］［悪］の2つのタイプを持つポケモンです。",
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "23691e78-3dc2-472a-9b4d-7ce679465da3": {
    "rawCanonicalSha256": "af02541cbdb22a9b2a98a7e539ce0f1a9afcdc8d79bfac7cf5d600534382e627",
    "bodyCanonicalSha256": "9bdbb11f500d5e9657ba090b399394d2d66a7455c9d5b29fd5f9cb0369c79c66",
    "controlsCanonicalSha256": "ffb6e5a6dd6a6e427a193e47dbce360bc9957f32875dae31e24bf6c3aec5dba7",
    "rowCanonicalSha256": "abe3d0872a92aa6475edf1f6e6f618e8684538371ca2ed941f6289dfe5153b41",
    "actualCanonicalSha256": "e9e739464fdf5cf7fdea3d2ad58e6a494cd9c046aca0289ef751ef499c7485d6",
    "rootDecisionRowCanonicalSha256": "2e8b3b29a22a8d11065fd28b692f809d5ec4bbb065bc6deaff01a3bc36ed26c0",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "bc2f8ac6-4e1b-4e02-ae6d-ceae71c3ca7a",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "23691e78-3dc2-472a-9b4d-7ce679465da3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:041:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "041",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "bc2f8ac6-4e1b-4e02-ae6d-ceae71c3ca7a",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "23691e78-3dc2-472a-9b4d-7ce679465da3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:041:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "041",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:cfeb4bf53e49f8c4d9f078ae12e4b7c4bdae284ddb6b12bb3c23bfb0e4a9f537",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/drowzee-41",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corrbp6otavpmnkdyr4c/1600.jpg",
    "productId": "3439243",
    "setCode": "PCG3",
    "alias": "041",
    "currentLabel": "ドロージー",
    "printedName": "スリープ",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "004",
      "closedSourceHandoffSha256": "b7e7d1673330b2e09ab208b8cd40280c28694e8b043569abd9abb43503e10ba9",
      "independentActualSourceReviewSha256": "ac4f2c66794419f2cd5d16d070de6b32603e8a30d8f6add2ad57568745d980d8",
      "priorFiniteDecisionSha256": "872785dde9255e9cec6832aa6ed5177f1737d4ab7dc4433e3f8c281c02e628b2",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "53fe11454a435a3ef08232f0085d960d18b818b56bb1f09ae37ba369af06e2e0",
    "actualClass": "Pokemon",
    "hp": 50,
    "type": "超",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "041/084",
    "artist": "Midori Harada",
    "variantId": "bc2f8ac6-4e1b-4e02-ae6d-ceae71c3ca7a",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "b47af5a93c458ec69c34d8701402f5f190e866a7f51b23a97065fb233e727e0a",
      "bytes": 213525,
      "width": 835,
      "height": 1155,
      "rgbaSha256": "74435f6f27cdcd10afa5bf7ad5d2af579e25e53599d49fc2f88217be2288eb16"
    },
    "observationsCanonicalSha256": "e9e739464fdf5cf7fdea3d2ad58e6a494cd9c046aca0289ef751ef499c7485d6",
    "entryCanonicalSha256": "70216e44c837c2fa6b1c7100bfe442f65f0b405f4262e16e12c9335aa3c57e48",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "e9e739464fdf5cf7fdea3d2ad58e6a494cd9c046aca0289ef751ef499c7485d6",
    "rawSourceWitnessInsertionSha256": "815ec86e011c5f9a4ff10967c1cba482ca150bb34b638bd0d043dc13b3fe76b9",
    "rootActualWitnessCanonicalSha256": "e9e739464fdf5cf7fdea3d2ad58e6a494cd9c046aca0289ef751ef499c7485d6",
    "additiveActualPlacementSha256": "149b65fedbcbf6b1d1626c2e6fa0f4c4c889fc00f2e53ff59023467db65e077e",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "2be19689-88c5-4d74-afab-2bf06f8ab994": {
    "rawCanonicalSha256": "ab4e75ef2689b8f2995898bbced8aa93319b87f899264caf852ed6b8ccad1bd6",
    "bodyCanonicalSha256": "85a55c536ccfd6fd7c9f833a0fada773bb885d71d34b34169a874ddcfdddcc2f",
    "controlsCanonicalSha256": "99a0910c6d88a1bd987e33eb54ceb1cac122209a381aaa6baf7ae28271c8862e",
    "rowCanonicalSha256": "5e562367e0881632e7502493147fd46dd0af3eb17b5d69e56496bf3971a3fe6f",
    "actualCanonicalSha256": "034ffab62cde98824e9a2851f818bdba316dc867b1e3f493aae88c0aa18536e9",
    "rootDecisionRowCanonicalSha256": "235b98f167c382b51817b8af23c69500ce8f81f1b26e8df4ae83352ef2ef9139",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "076b5d30-3cb6-446c-8003-3ee49e0a12dd",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "2be19689-88c5-4d74-afab-2bf06f8ab994",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:050:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "050",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "076b5d30-3cb6-446c-8003-3ee49e0a12dd",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "2be19689-88c5-4d74-afab-2bf06f8ab994",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:050:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "050",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:fc62a26c7a4e6f5e7f38cfaa85080dfad1328ece95d315ff39d8e3449ea73d9e",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/piloswine-50",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/73962ea78ea2a7d6afc91ff2a392dfe9df0cac7826d56b968d53f1bbee1d16b5/1600.jpg",
    "productId": "3439252",
    "setCode": "PCG3",
    "alias": "050",
    "currentLabel": "ピロスワイン",
    "printedName": "イノムー",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "004",
      "closedSourceHandoffSha256": "b7e7d1673330b2e09ab208b8cd40280c28694e8b043569abd9abb43503e10ba9",
      "independentActualSourceReviewSha256": "ac4f2c66794419f2cd5d16d070de6b32603e8a30d8f6add2ad57568745d980d8",
      "priorFiniteDecisionSha256": "872785dde9255e9cec6832aa6ed5177f1737d4ab7dc4433e3f8c281c02e628b2",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "53fe11454a435a3ef08232f0085d960d18b818b56bb1f09ae37ba369af06e2e0",
    "actualClass": "Pokemon",
    "hp": 100,
    "type": "闘",
    "stage": "1進化",
    "evolvesFrom": "ウリムー",
    "collector": "050/084",
    "artist": "Tomokazu Komiya",
    "variantId": "076b5d30-3cb6-446c-8003-3ee49e0a12dd",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "original",
    "original": {
      "sha256": "6c79ac1d638fdd2aea76cf38933621b2f1abb32a23d4724678ab043c2d6b8e0f",
      "bytes": 169108,
      "width": 782,
      "height": 1074,
      "rgbaSha256": "0694999180ef088e94cac13f71162a8752b9a6ebe40db7f1e55811e22a298526"
    },
    "observationsCanonicalSha256": "034ffab62cde98824e9a2851f818bdba316dc867b1e3f493aae88c0aa18536e9",
    "entryCanonicalSha256": "aa0db43d498a81b694e891cf6c5d17d59fc7910aaf60be372b336d95aafb6ebd",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "034ffab62cde98824e9a2851f818bdba316dc867b1e3f493aae88c0aa18536e9",
    "rawSourceWitnessInsertionSha256": "b97a342a11482fed4c66b7db620ecd4733b7cffdde28e18f1097b3c9608345ae",
    "rootActualWitnessCanonicalSha256": "034ffab62cde98824e9a2851f818bdba316dc867b1e3f493aae88c0aa18536e9",
    "additiveActualPlacementSha256": "745d0fe7035e7cb609bc70acba839aa70c969e88d6241e0ef882a2e1cce8fbf1",
    "actualEvolutionPlacement": "ウリムーから進化",
    "rawEvolutionPlacement": "ウリムーから進化",
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "1b6ca98a-873f-4fad-952d-5bd389c02a7b": {
    "rawCanonicalSha256": "ca81a33dbf9380859c029d4248fbfdc58de0f73a80bb98ecf77ba5cf36c8a202",
    "bodyCanonicalSha256": "5123613ea6cb5f0901aa7d622b59c22d6c6f7621e9a7f4c082de8e2ac02fe8ed",
    "controlsCanonicalSha256": "42cb94390988c0b8d433281d22f6a4bcc9e06f1e214117a0c74699872a01a33a",
    "rowCanonicalSha256": "9ac8064d2eaa2e22936fe2682799cbfb8cc14de4b467ea1ef466e78acc3855aa",
    "actualCanonicalSha256": "316f0f0612d3cb5b85bae92695d52ee1e6200ce032e7df88230f75fa0e503f37",
    "rootDecisionRowCanonicalSha256": "3f7316433070e66045b394b63853f384bef05befa9ae88b5f88a5269f71f294d",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "15b050d7-f502-4126-8d20-a6c8b4025ef2",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "1b6ca98a-873f-4fad-952d-5bd389c02a7b",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:065:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "065",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "15b050d7-f502-4126-8d20-a6c8b4025ef2",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "1b6ca98a-873f-4fad-952d-5bd389c02a7b",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:065:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "065",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:931635670ed19f1b3071745e5d13ac9b1e542b9bb22d7c39430d3e7e98cab521",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/rocket%27s-wobbuffet-65",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/refc1128699d4fe3a5d2d5f3c318f6e0d5df72131fd032153a40f7e8aef29cd32fb/1600.jpg",
    "productId": "3439267",
    "setCode": "PCG3",
    "alias": "065",
    "currentLabel": "ロケットのウォブバッフェット",
    "printedName": "R団のソーナンス",
    "printedForm": null,
    "printedOwner": "R団の",
    "printedNameQualifier": "R団の",
    "sourceLineage": {
      "wave": "004",
      "closedSourceHandoffSha256": "b7e7d1673330b2e09ab208b8cd40280c28694e8b043569abd9abb43503e10ba9",
      "independentActualSourceReviewSha256": "ac4f2c66794419f2cd5d16d070de6b32603e8a30d8f6add2ad57568745d980d8",
      "priorFiniteDecisionSha256": "872785dde9255e9cec6832aa6ed5177f1737d4ab7dc4433e3f8c281c02e628b2",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "53fe11454a435a3ef08232f0085d960d18b818b56bb1f09ae37ba369af06e2e0",
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "悪",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "065/084",
    "artist": "Mitsuhiro Arita",
    "variantId": "15b050d7-f502-4126-8d20-a6c8b4025ef2",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "352a502dec82b1ac1271232c1a56d5cd32e31c9391a9392002440b785277f24f",
      "bytes": 358888,
      "width": 1161,
      "height": 1600,
      "rgbaSha256": "5c86da46eb6256a03c4a80d94acb6c017bf997320859b9af0b892b8ca8d0ecce"
    },
    "observationsCanonicalSha256": "316f0f0612d3cb5b85bae92695d52ee1e6200ce032e7df88230f75fa0e503f37",
    "entryCanonicalSha256": "b22518b46f4dc2ddc4e642b760649161ceece452b95b46e22d545a0664baa824",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "316f0f0612d3cb5b85bae92695d52ee1e6200ce032e7df88230f75fa0e503f37",
    "rawSourceWitnessInsertionSha256": "0dce80bd6a183a3991ceb940753fd808e6ebc4442306a193575f473b28a27cf4",
    "rootActualWitnessCanonicalSha256": "316f0f0612d3cb5b85bae92695d52ee1e6200ce032e7df88230f75fa0e503f37",
    "additiveActualPlacementSha256": "a0e406b906757bc192b3e515b4fff95a6a80bf587808ae481f55e0b939f2728a",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "42e209b0-5d1a-4230-b1d7-a4257d6149ee": {
    "rawCanonicalSha256": "c8a5348c8c2d54b0f91a64cf7d3519b135c31e0bd37388f94141d3f702a10d4e",
    "bodyCanonicalSha256": "b407e568c3ce6e36b27a22af40b8c2f50c6a63543e3f5f2f44f36b8b28883ce3",
    "controlsCanonicalSha256": "4cc72e1f6ddc22e327193b8f2e2b34a25926ecdfc3973adfe830398555ebb265",
    "rowCanonicalSha256": "c14d61b56a3edc8599eefecbd65478ce1985394b231e5fe365209c754282bc52",
    "actualCanonicalSha256": "6fefb34531c37c0c56cf4625a549a114c33a73e76d181210c3a33f4bde1c68f1",
    "rootDecisionRowCanonicalSha256": "57c650ada5a35b79fa34f6753a7cd265b956de5adf6ca58a273ccda4ea26766f",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "b69d6245-6ec6-4891-a3a4-ae5fea4a419b",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "42e209b0-5d1a-4230-b1d7-a4257d6149ee",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:074:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "074",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "b69d6245-6ec6-4891-a3a4-ae5fea4a419b",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "42e209b0-5d1a-4230-b1d7-a4257d6149ee",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:074:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "074",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:82d76f2b803b7b77f1de30863ed267c175f9b2d67905e91ae22a9eb9e914e418",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/swoop-teleporter-74",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/exzudndlypwrfhgz/1600.jpg",
    "productId": "3439276",
    "setCode": "PCG3",
    "alias": "074",
    "currentLabel": "急降下！テレポーター",
    "printedName": "そっくり！テレポーター",
    "printedForm": null,
    "printedOwner": null,
    "printedNameQualifier": null,
    "sourceLineage": {
      "wave": "004",
      "closedSourceHandoffSha256": "b7e7d1673330b2e09ab208b8cd40280c28694e8b043569abd9abb43503e10ba9",
      "independentActualSourceReviewSha256": "ac4f2c66794419f2cd5d16d070de6b32603e8a30d8f6add2ad57568745d980d8",
      "priorFiniteDecisionSha256": "872785dde9255e9cec6832aa6ed5177f1737d4ab7dc4433e3f8c281c02e628b2",
      "combinedFiniteDecisionSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
    },
    "sourceLineageCanonicalSha256": "53fe11454a435a3ef08232f0085d960d18b818b56bb1f09ae37ba369af06e2e0",
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "074/084",
    "artist": "Katsura Tabata",
    "variantId": "b69d6245-6ec6-4891-a3a4-ae5fea4a419b",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "279d359d6b9495d1b6bcb21a552aecb5dd370e9f1179ecd8c1e779f4e15843d3",
      "bytes": 76033,
      "width": 500,
      "height": 700,
      "rgbaSha256": "1cf17474c454d63862fd34c201b8d8e90b5a404631da90659a7cda0613b89f81"
    },
    "observationsCanonicalSha256": "6fefb34531c37c0c56cf4625a549a114c33a73e76d181210c3a33f4bde1c68f1",
    "entryCanonicalSha256": "90027c77cf1884871c2402e3c0b55ad221c9dd742de6a3f5394811ca59a3b6f7",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "6fefb34531c37c0c56cf4625a549a114c33a73e76d181210c3a33f4bde1c68f1",
    "rawSourceWitnessInsertionSha256": "249937805314a70f538fd6836a55ccf377d914236839e1ed8a0719b38a470a9f",
    "rootActualWitnessCanonicalSha256": "6fefb34531c37c0c56cf4625a549a114c33a73e76d181210c3a33f4bde1c68f1",
    "additiveActualPlacementSha256": "6da81a953131f00360dbc39787686b2276d4ac72f3f88a4385c2e715b8865cab",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "自分の山札から「たねポケモン（ポケモンexはのぞく）」を1枚選び出し、自分の場の「たねポケモン（ポケモンexはのぞく）」と入れ替える（ついているカード、ダメージカウンター、受けている特殊状態・効果などは、すべてそのままで、そのポケモンは、入れ替えたカードのポケモンになる）。その後、入れ替えたカードをトラッシュする。山札を見た場合、その山札を切る。",
    "trainerSubtype": "ロケット団秘密メカ",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "a3c626f505e06c5f29c8743df5d9d15642d3c680c1cc77dd7080a17252e1766b",
  "decisionCanonicalSha256": "0e893acdc25ce05543b6831952811c6170db5a5298452e5881f6782d25dc57d5",
  "approvedFileSha256": "dc6e6c127985faa143797e35c71ead75e87cd2660a966551d99097269c25cc6b",
  "decisionFileSha256": "647ce73c16477d7824dab7ef5c76ebeff6eff6840032f45c5ad8f3d08abc59cc"
};
export function knownSource(id) {
  const value = expectedRows[id];
  check(value, 'Outside exact PCG3 waves003004 three fronts');
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
  check(canonicalHash(approved) === authority.approvedCanonicalSha256 && canonicalHash(decision) === authority.decisionCanonicalSha256, 'Exact immutable root decision and derived three-row projection required');
  check(approved.rows.length === 7 && decision.rowCount === 7 && decision.preparationApproved === true
    && decision.conditionalPublicationApproved === true && decision.canonicalOrSourcePolicyWritesAllowed === false
    && decision.rootOwnsAllQueueGitReleaseUploadPublisherAndLiveActions === true, 'Finite exact3 conditional root authority');
  for (const raw of approved.rows) {
    const k = knownSource(raw.printingId), original = decision.rows.find(r => r.printingId === raw.printingId);
    check(canonicalHash(raw) === k.rawCanonicalSha256 && original && canonicalHash(original) === k.rootDecisionRowCanonicalSha256,
      'Whole root raw and decision row binding');
    check(original.sourceSelectionApproved === false && original.preparationApproved === false && original.publicationApproved === false
      && original.rawClosedSourceWitnessMustRemainUnchanged === true, 'Historical source-author flags stay false');
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
    check(['printedHP','printedType','printedStage','printedEvolutionFrom','printedEvolutionPlacement','printedPokemonExRule'].every(key => a[key] === null)
      && a.attacks.length === 0 && a.abilities.length === 0 && a.printedTrainerSubtype === k.trainerSubtype
      && a.printedRules.length > 0, 'Trainer null Pokemon fields/subtype/full two rules');
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
  check(raw.setCode === 'PCG3' && raw.languageCode === 'ja' && raw.category === null && raw.currentRecordedEnglishName === null
    && raw.requiredAssetScope.assetVariantId === null && raw.requiredAssetScope.sourceVariantId === null
    && raw.eligibleVariantIsDefaultFlag === k.defaultFlag && raw.currentActualApiDefaultVariantId === k.variantId,
    'Unchanged catalogue labels/nulls/default fallback/shared scope');
  check(raw.actualPixelSignatureSchema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Exact direct observation schema');
  check(canonicalHash(raw.sourceLineage) === k.sourceLineageCanonicalSha256 && raw.actualPrintedOwner === k.printedOwner && raw.actualPrintedNameQualifier === k.printedNameQualifier, 'Exact genuine source history and ownership/form distinction');
  validateActual(raw.actualPixelSignature, k); separateWitnesses(body, k);
  return k;
}

export function validatePublishedWitness(body, row) {
  const k = knownSource(row.printing_id);
  publicProjection(body);
  check(canonicalHash(body.source_lineage) === k.sourceLineageCanonicalSha256 && body.queue_controls.identity_controls.actual_printed_owner === k.printedOwner && body.queue_controls.identity_controls.actual_printed_name_qualifier === k.printedNameQualifier && body.photo_identity_projection.actualPrintedOwner === k.printedOwner, 'Genuine003/004 lineage and printed owner distinct from form');
  check(canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === k.controlsCanonicalSha256,
    'Whole immutable public body and controls resist joint forgery');
  check(body.actual_pixel_signature_schema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Public witness remains direct');
  validateActual(body.actual_pixel_signature, k); separateWitnesses(body, k);
  check(row.set_code === 'PCG3' && row.language_code === 'ja' && row.collector_number === k.alias
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
