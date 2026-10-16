import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "44c0fd56-5d24-4545-9a11-313bf3252953": {
    "rawCanonicalSha256": "bf52fd39f3ab36fa7e23fe0c4e4eef87d665f993057725b8b657a0d7c5217784",
    "bodyCanonicalSha256": "bd59519c3ecb8f61b51a197296ad080a48d0e948e4b154ccc7e77d7cff0399fd",
    "controlsCanonicalSha256": "8009308c7313ee6fa755bcd4dbc304cfdf3c49cec8396aac8a9a86f98f0ee1aa",
    "rowCanonicalSha256": "b0a5f8f8c9d9f288c206022b29787512944847d90010a909c906cecc901ae807",
    "actualCanonicalSha256": "624894f1265568f95d90ef9e89ade8bc9beaf3be531e272c5de5941bdc20b550",
    "rootDecisionRowCanonicalSha256": "08cb51b46da78d28d0a95e3b5f43b94fb54c6e0a58c30c8ee55d8eb8db924522",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "2f074dd6-a27f-4dfd-9ccb-5d741daa5dd4",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "44c0fd56-5d24-4545-9a11-313bf3252953",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:056:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "056",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "2f074dd6-a27f-4dfd-9ccb-5d741daa5dd4",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "44c0fd56-5d24-4545-9a11-313bf3252953",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:056:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "056",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:fc22ed3ec743face58b9b9774b97a2fef3d940b8457e3f509b984fc47722490b",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/swellow-56",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/rpjwhp7pndkrh3pw/1600.jpg",
    "productId": "3439343",
    "setCode": "PCG2",
    "alias": "056",
    "currentLabel": "スウラー",
    "printedName": "オオスバメ",
    "printedForm": null,
    "actualClass": "Pokemon",
    "hp": 70,
    "type": "無色",
    "stage": "1進化",
    "evolvesFrom": "スバメ",
    "collector": "056/082",
    "artist": "Midori Harada",
    "variantId": "2f074dd6-a27f-4dfd-9ccb-5d741daa5dd4",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "8cdd607508f65319b4fc51a9855e2d40663c501e9d079348e6a3170a2c07a6f1",
      "bytes": 73465,
      "width": 500,
      "height": 700,
      "rgbaSha256": "3b3bf046554ae9410053252eae12e9b7475110a32a4c3a7ec6278322907023d6"
    },
    "observationsCanonicalSha256": "624894f1265568f95d90ef9e89ade8bc9beaf3be531e272c5de5941bdc20b550",
    "entryCanonicalSha256": "1a6d8248c3f9c913bb3c60543e4ed1b0a2a01520bb4b95049e9c3c62a6b1b028",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "624894f1265568f95d90ef9e89ade8bc9beaf3be531e272c5de5941bdc20b550",
    "rawSourceWitnessInsertionSha256": "977facff67c724a9865d423ab49f1d7773e3ead3d352cb6cfd7a0cd5341c5183",
    "rootActualWitnessCanonicalSha256": "624894f1265568f95d90ef9e89ade8bc9beaf3be531e272c5de5941bdc20b550",
    "additiveActualPlacementSha256": "f2406b2a6b44f778c9fa6635f182e1b3e99fc7ccffe359bb115a824c05188f7c",
    "actualEvolutionPlacement": "スバメから進化",
    "rawEvolutionPlacement": "スバメから進化",
    "rules": null,
    "trainerSubtype": null,
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "e1d523e5-69ea-4e97-858d-1e65d4a07cd5": {
    "rawCanonicalSha256": "e001a0ec19106d681aa43d2456334efc83686f79f509df15570fa766b25ff6e3",
    "bodyCanonicalSha256": "537b11b10070e2601f209a0b0874baa872cc0db875cdb7f3ad629b11cbaebdca",
    "controlsCanonicalSha256": "59f9f2068604b414fc2b888b03fc17a19b855429f59e6c3c9206cd2a4a26bdc2",
    "rowCanonicalSha256": "1e3f5f121f41eddcaa5de6d8998e0bd0c8558d2724d8243c1e36b771d93d53a4",
    "actualCanonicalSha256": "d5aa92b1c145c8a024e4f179396726448a99d0a32e1caa9b9b9ae5b82e7ded34",
    "rootDecisionRowCanonicalSha256": "e5b0f50afffb242738d32907c32c69326ba9f255f5046735a547370a1e314444",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "a61ef170-e692-4768-a4ec-4276dd681ee5",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e1d523e5-69ea-4e97-858d-1e65d4a07cd5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:077:normal",
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
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "a61ef170-e692-4768-a4ec-4276dd681ee5",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e1d523e5-69ea-4e97-858d-1e65d4a07cd5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:077:normal",
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
    "sourceCardId": "pricecharting-image-url-sha256:9bfd0879c111624164eb0333ee9e4b324e8ae14c5174486586ab6901c4944635",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/crystal-shard-77",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/v3ako3ujrssuaqyb/1600.jpg",
    "productId": "3439365",
    "setCode": "PCG2",
    "alias": "077",
    "currentLabel": "クリスタルシャード",
    "printedName": "水晶のかけら",
    "printedForm": null,
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "077/082",
    "artist": "Jungo Suzuki",
    "variantId": "a61ef170-e692-4768-a4ec-4276dd681ee5",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "0b41d505ab20bfbbd4815e1cec624cbb369173dbab19ff7205a4c342f37f71b1",
      "bytes": 79245,
      "width": 500,
      "height": 700,
      "rgbaSha256": "fe37b51cd1b933b663a13874e30576b9a7b1374d2544b008cccf9a6357b1cc3d"
    },
    "observationsCanonicalSha256": "d5aa92b1c145c8a024e4f179396726448a99d0a32e1caa9b9b9ae5b82e7ded34",
    "entryCanonicalSha256": "57b4b676709307c2f26a5a5a67d578a265d55852b5ade27926ada443fffd36b8",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "d5aa92b1c145c8a024e4f179396726448a99d0a32e1caa9b9b9ae5b82e7ded34",
    "rawSourceWitnessInsertionSha256": "6fc6b51ec1fb95dfbea9ead6e507958611431d604a609b6d68a5f5a1c62ece7f",
    "rootActualWitnessCanonicalSha256": "d5aa92b1c145c8a024e4f179396726448a99d0a32e1caa9b9b9ae5b82e7ded34",
    "additiveActualPlacementSha256": "06e5bbe0bc2ab1946610e1a9f4e3ff9266418ab2c2dd0bc01a18a2ac0b1af980",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "このカードをつけているポケモンのタイプは、★になる。このカードをつけているポケモンがワザを使った番の終わりに、このカードをトラッシュする。\nポケモンのどうぐは、自分のポケモンにつけて使う。すでにポケモンのどうぐをつけているポケモンには、つけることができない。",
    "trainerSubtype": "ポケモンのどうぐ",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  },
  "2af65062-f444-40b2-810a-233ee09da5b3": {
    "rawCanonicalSha256": "9b29760fda48fc97695f1460881f286cd54bb0e9d774cc05bbbb8c0d2710e0b9",
    "bodyCanonicalSha256": "8d5953d6fd76fa8acd954a531f5fd6ecc1b3baaae79c76af8b94c31070572057",
    "controlsCanonicalSha256": "e00b5d7a27009954b50baf37e2c655428cc6e5c178cd1a445e8fb669f670f3f3",
    "rowCanonicalSha256": "a1afaa1b89030dba299aef07e96e8d8764953f18678698aa3236d2000c55ae46",
    "actualCanonicalSha256": "b27101518ef0af53a8e7f47f8a450a47e6970ea47ff2cdb5358d707e5649c946",
    "rootDecisionRowCanonicalSha256": "c417d0af9faa1c434a37cfaaadfcbf8a1c8a71648fd0e590155eff553fa608c7",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "cc9f78f5-8239-49a5-af99-fb39b3f9fdba",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "2af65062-f444-40b2-810a-233ee09da5b3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:079:normal",
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
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "cc9f78f5-8239-49a5-af99-fb39b3f9fdba",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "2af65062-f444-40b2-810a-233ee09da5b3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:079:normal",
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
    "sourceCardId": "pricecharting-image-url-sha256:b5bed6b9bf1ce9892dfcf7589ba4398d781ac1211b020b6685ed9d6b9f218e4a",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/meteor-falls-79",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/zpcyu3skqk2wt6nq/1600.jpg",
    "productId": "3439367",
    "setCode": "PCG2",
    "alias": "079",
    "currentLabel": "流星滝",
    "printedName": "流星の滝",
    "printedForm": null,
    "actualClass": "Trainer",
    "hp": null,
    "type": null,
    "stage": null,
    "evolvesFrom": null,
    "collector": "079/082",
    "artist": "Ryo Ueda",
    "variantId": "cc9f78f5-8239-49a5-af99-fb39b3f9fdba",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "91ba253548f790cb4f21fa7e509ef5b257fb2531bd92b32960d05258df3935a5",
      "bytes": 79494,
      "width": 500,
      "height": 700,
      "rgbaSha256": "ad14ecaaa04dfc565ce709a5fb9859c20928d64beb0d922478d38915b193e627"
    },
    "observationsCanonicalSha256": "b27101518ef0af53a8e7f47f8a450a47e6970ea47ff2cdb5358d707e5649c946",
    "entryCanonicalSha256": "a2247af73f6800dd54a151c92e99800b4b2117d7898d1b702dbab47fbcc8a1f0",
    "abilityCount": 0,
    "attackCount": 0,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "b27101518ef0af53a8e7f47f8a450a47e6970ea47ff2cdb5358d707e5649c946",
    "rawSourceWitnessInsertionSha256": "7675bdb1176b643034c0b1ecf6cc180c393087430b24b5e03d8dcc5b149d6159",
    "rootActualWitnessCanonicalSha256": "b27101518ef0af53a8e7f47f8a450a47e6970ea47ff2cdb5358d707e5649c946",
    "additiveActualPlacementSha256": "53b2db678f76c4894736f4adc75c20aa2b384dbd09c7c8978d449893b3bf48f1",
    "actualEvolutionPlacement": null,
    "rawEvolutionPlacement": null,
    "rules": "おたがいのバトル場の、「進化ポケモン全員（ポケモンexはのぞく）」は、進化する前に持っていたワザを、そのポケモンのワザとして使うことができる（そのワザに必要なエネルギーが、そのポケモンについていないなら、使うことはできない）。\nスタジアムは、バトル場の横に出して使う。別のスタジアムが場に出たなら、このカードをトラッシュする。",
    "trainerSubtype": "スタジアム",
    "sourceHDCanvasSignal": false,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "cb09ab9c331bb7ef4b3e6e05f5f5bbd81a51306ef6171ad6586a4258d39525d2",
  "decisionCanonicalSha256": "fb920f778aadeb77d2c20785beb8b6236b26aabfba76d5b3bccf604439adfb9e",
  "approvedFileSha256": "2aaad4065081121ae0cb1feb3875fe80544f654d3931e1b1f978bf8659f83178",
  "decisionFileSha256": "2dc42c9600d0c921cbe8cb625cca8410aa8dccf7f43a9ca45c49b65ea67e0d10"
};
export function knownSource(id) {
  const value = expectedRows[id];
  check(value, 'Outside exact PCG2 wave002 three fronts');
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
  check(approved.rows.length === 3 && decision.rowCount === 3 && decision.preparationApproved === true
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
      && a.printedRules.split('\n').length === 2, 'Trainer null Pokemon fields/subtype/full two rules');
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
  check(raw.setCode === 'PCG2' && raw.languageCode === 'ja' && raw.category === null && raw.currentRecordedEnglishName === null
    && raw.requiredAssetScope.assetVariantId === null && raw.requiredAssetScope.sourceVariantId === null
    && raw.eligibleVariantIsDefaultFlag === k.defaultFlag && raw.currentActualApiDefaultVariantId === k.variantId,
    'Unchanged catalogue labels/nulls/default fallback/shared scope');
  check(raw.actualPixelSignatureSchema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Exact direct observation schema');
  validateActual(raw.actualPixelSignature, k); separateWitnesses(body, k);
  return k;
}

export function validatePublishedWitness(body, row) {
  const k = knownSource(row.printing_id);
  publicProjection(body);
  check(canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === k.controlsCanonicalSha256,
    'Whole immutable public body and controls resist joint forgery');
  check(body.actual_pixel_signature_schema === 'DIRECT_PRINTED_OBSERVATIONS_NOT_WRAPPED_SIGNATURE', 'Public witness remains direct');
  validateActual(body.actual_pixel_signature, k); separateWitnesses(body, k);
  check(row.set_code === 'PCG2' && row.language_code === 'ja' && row.collector_number === k.alias
    && row.card_native_name === k.currentLabel && row.provider_id === k.sourceCardId && row.image_url === k.imageUrl
    && row.evidence.source_page_url === k.sourcePageUrl && row.work_type === 'CARDS', 'Exact current printing and original URL');
  check(body.accepted_category === null && body.recorded_inventory_category === null && body.actual_printed_category === k.actualClass
    && body.actual_native_category === k.actualClass && body.canonical_english_null_preserved === true, 'Actual class never fills null canonical metadata');
  const identity = body.queue_controls.identity_controls;
  check(identity.actual_printed_form === null && identity.printed_national_dex === null && identity.printed_set_code_literal === null
    && identity.canonical_english_label_preserved === null && body.photo_identity_projection.actualPrintedForm === null,
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
