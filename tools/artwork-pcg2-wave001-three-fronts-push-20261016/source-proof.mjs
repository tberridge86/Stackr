import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "36710a9b-7b22-4412-b2a9-2fb4af5aeb7c": {
    "rawCanonicalSha256": "12f3be8b9d74cddbdd81fe05d2c1bd5a9f69e82b3b487437479a420e6603f808",
    "bodyCanonicalSha256": "af0a9af8a7ad5faa1fa6650393d2831e3b00eba73f985c41370534915817d170",
    "controlsCanonicalSha256": "bd9afaedcdb1c2527eb4b92aa7baec0269f4506a13bb22cbe8615679f6157f5b",
    "rowCanonicalSha256": "ec9b7609570aef4138e6b55da509438871b712450a5a408de38825ffefd4c529",
    "actualCanonicalSha256": "54590b5f51f70d29e0e6d90f060747aa0b02f5076b86d1e1c2cc6f1ed88fa7bb",
    "rootDecisionRowCanonicalSha256": "59503f2f573b077553ce352c769f596d7131ebe174aa8809c90fae960e84114d",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "fe011d15-fd0e-46ef-b420-d95348d67754",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "36710a9b-7b22-4412-b2a9-2fb4af5aeb7c",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:008:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "008",
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
        "variant_id": "fe011d15-fd0e-46ef-b420-d95348d67754",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "36710a9b-7b22-4412-b2a9-2fb4af5aeb7c",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:008:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "008",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:c779e166499e1173e010e40c23bc0140d598a77a6ca53c8a402595d09d670973",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/beautifly-8",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/fb5wlnohphod7fii/1600.jpg",
    "productId": "3439295",
    "setCode": "PCG2",
    "alias": "008",
    "currentLabel": "美しい",
    "printedName": "アゲハント",
    "printedForm": null,
    "actualClass": "Pokemon",
    "hp": 100,
    "type": "草",
    "stage": "2進化",
    "evolvesFrom": "カラサリス",
    "collector": "008/082",
    "artist": "Kagemaru Himeno",
    "variantId": "fe011d15-fd0e-46ef-b420-d95348d67754",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "861fbd4da10c9beb392818d5a8517cb8689ee6ad8fe5230c2068683aa694a360",
      "bytes": 147048,
      "width": 732,
      "height": 1025,
      "rgbaSha256": "4e3b5dd02bca9fd266e307a3196ba96d841fb4e2ad2a59ceceea7a334b325dc5"
    },
    "observationsCanonicalSha256": "0f37221fc61363ed64c9ac8c9ec46992c6bd7627d1ad37aaa0ead241d2d19746",
    "entryCanonicalSha256": "aa17e67a8840889c157c29a5f407a6d6a5191b0a23cdd4c824125b61b7ed46d8",
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "701d4b7946c746a586bddbc8b3bbae4678b74694689994fd0223b82bf0bfacb1",
    "rawSourceWitnessInsertionSha256": "8aad84a25716be2573185405355e4536492b4491d5942dd63928f2812a284eef",
    "rootActualWitnessCanonicalSha256": "0f37221fc61363ed64c9ac8c9ec46992c6bd7627d1ad37aaa0ead241d2d19746",
    "additiveActualPlacementSha256": "6bbc62fd1e5c850e17b05cf891d2837522c7e9965442da5e347e3152900a6b6a",
    "actualEvolutionPlacement": "カラサリスから進化",
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": true
  },
  "e6192b59-9593-4315-a414-591df5f3fe51": {
    "rawCanonicalSha256": "30cc66f6dcefd9cd2da3833cb971feda893febd637ffc41ae48ae2d54d5d9deb",
    "bodyCanonicalSha256": "12afdece60545606ee922f798cad76ef29bdc708e44a6d1fc7642b030ec602d5",
    "controlsCanonicalSha256": "5ef92f85671f2f0048c2472fad28273dba35a1ece2bc11108d4d1f7a4fff9d0d",
    "rowCanonicalSha256": "f8f6b4c60d4673d195b967e8629b22a94f9c26184b2cdc92bd0863e873ac8058",
    "actualCanonicalSha256": "387b65e8ae954a8568a518e131aadbbcf8b3025761caa1549c4e3fdc3491b899",
    "rootDecisionRowCanonicalSha256": "a172042ed9a93dba38a06da7affc1929b6f2d28cfd6a3a23c868d738e235b20e",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "bf6f9b6b-1597-4526-8104-adcc0e460d54",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e6192b59-9593-4315-a414-591df5f3fe51",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:010:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "010",
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
        "variant_id": "bf6f9b6b-1597-4526-8104-adcc0e460d54",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e6192b59-9593-4315-a414-591df5f3fe51",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:010:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "010",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:330999facfd17b50664a453cea055615f9c1a68a0a71b389f2dc9e4f30539db4",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/masquerain-10",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/corrzh2gd6riqnbbxfa3/1600.jpg",
    "productId": "3439297",
    "setCode": "PCG2",
    "alias": "010",
    "currentLabel": "仮面舞踏会",
    "printedName": "アメモース",
    "printedForm": null,
    "actualClass": "Pokemon",
    "hp": 60,
    "type": "草",
    "stage": "1進化",
    "evolvesFrom": "アメタマ",
    "collector": "010/082",
    "artist": "Mitsuhiro Arita",
    "variantId": "bf6f9b6b-1597-4526-8104-adcc0e460d54",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "373f4913a06262a776cce6813e6eceed3c100d6b1f6bf166bd2e3a47a7ab2c7c",
      "bytes": 355013,
      "width": 1200,
      "height": 1600,
      "rgbaSha256": "af73d2bd1d2d77296993b3708201f0c50da5a62184e6cdccef01264f62bb6451"
    },
    "observationsCanonicalSha256": "bf918fe94ce388d617d166d5ec946059211ffadf78c0a1c55616e1311baddc05",
    "entryCanonicalSha256": "87baa78857aec0a2cf466d772d3e2ff0326abfc32f251e93efe7457331242904",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "d1c75dc592a4f3a0b6b3a4087dc6a54893406b73b5bad4085241e0246d5b612a",
    "rawSourceWitnessInsertionSha256": "b01ffed74f5e83b102c364ec006a1900ad2f7e3eaf9e6e7ac9d493f09707ddc4",
    "rootActualWitnessCanonicalSha256": "bf918fe94ce388d617d166d5ec946059211ffadf78c0a1c55616e1311baddc05",
    "additiveActualPlacementSha256": "dc0070177a00044bc53193fa09382e44c048030479acfcc8fcd01ca86bf5fa3b",
    "actualEvolutionPlacement": "アメタマから進化",
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  },
  "c61d1e2b-a65c-4b2a-bce6-6f66d236b4fb": {
    "rawCanonicalSha256": "7ac10fc94ee34b0e3b3205145c3fac2836b757900185351e4b91717bd4b8bc42",
    "bodyCanonicalSha256": "f10c9ab4843c8b4d1561239d2028df0543537f2fd53425aa561ddec292d522d9",
    "controlsCanonicalSha256": "5bbd4a73bab9854019b2dfbd646f611fc6e1d12392e00081414e8d72fbe5e6c8",
    "rowCanonicalSha256": "4e4c074bccd7c0340ac79be200bef16e17825448eeab0ff384f60036eb950fa9",
    "actualCanonicalSha256": "47de812402838cd335d2e1da033804ce51c9113fab308c98dfa5452d545636bf",
    "rootDecisionRowCanonicalSha256": "e381a19e5acbf1b376d0bf58b52e3c45f9e254d1b2d9cfa55eadc5613e70903e",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "0ee290c9-af9e-4d82-8cd0-a0d15dbee95e",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c61d1e2b-a65c-4b2a-bce6-6f66d236b4fb",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:031:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "031",
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
        "variant_id": "0ee290c9-af9e-4d82-8cd0-a0d15dbee95e",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c61d1e2b-a65c-4b2a-bce6-6f66d236b4fb",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:031:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "031",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:2f8a21d9cfefbd0ec5007d061c7e7e95f1c1f41ed9ce1fa290f4e42becbaa574",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/corphish-31",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/wji2ibwhnmotp72b/1600.jpg",
    "productId": "3439318",
    "setCode": "PCG2",
    "alias": "031",
    "currentLabel": "コーフィッシュ",
    "printedName": "ヘイガニ",
    "printedForm": null,
    "actualClass": "Pokemon",
    "hp": 40,
    "type": "水",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "031/082",
    "artist": "Takao Unno",
    "variantId": "0ee290c9-af9e-4d82-8cd0-a0d15dbee95e",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "detail-page",
    "original": {
      "sha256": "0dc9046dab435e01ee2dc2d20d975633d67a403292f20e7c7bcd0e99e542ecc6",
      "bytes": 336694,
      "width": 988,
      "height": 1376,
      "rgbaSha256": "26318dd771f9f68b0cd3efb2c62d2b0fa919e185bcac241960407463b86939a5"
    },
    "observationsCanonicalSha256": "9b81bdf603067ca178dfe47fa61d6730e338164d72a16e084b8f9adb08885349",
    "entryCanonicalSha256": "4aad146024228ff65155a1704bc952aade4786c3047d7dcf4339c0bf386084c6",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null,
    "rawSourceWitnessCanonicalSha256": "9b81bdf603067ca178dfe47fa61d6730e338164d72a16e084b8f9adb08885349",
    "rawSourceWitnessInsertionSha256": "7eb884f8c8f08e890cf88b7580974e34619b8ff1ac00395bb1b39a76a9769705",
    "rootActualWitnessCanonicalSha256": "9b81bdf603067ca178dfe47fa61d6730e338164d72a16e084b8f9adb08885349",
    "additiveActualPlacementSha256": "86f5ab743bb9f4aaaf664d1065129f56ac72350deab5a31960e785ba3f2d9935",
    "actualEvolutionPlacement": null,
    "sourceHDCanvasSignal": true,
    "detailHDCanvasSignal": false
  }
};
const authority={
  "approvedCanonicalSha256": "496b02e70c79e2b2731527f89a4efed31c116f07be291e67b645db26bce7cef1",
  "decisionCanonicalSha256": "67aa1211fc06abf2834648cae8c0338569d1423733b5f31e8f8daf6a9f229812",
  "approvedFileSha256": "47d6562d64e659d75b642d6569f2b81e9ef99aaca662c94bb5a90353872065fa",
  "decisionFileSha256": "df4d3c3463b7555a662a8a1d2bed8cb2c949b4739e4b2fbec7c76ea6393b6347"
};
export function knownSource(id) {
  const value = expectedRows[id];
  check(value, 'Outside exact PCG2 wave001 three fronts');
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
  check(canonicalHash(signature) === k.actualCanonicalSha256 && signature.alias === 'PCG2-' + k.alias
    && signature.originalSha256 === k.original.sha256, 'Exact complete original pixel signature');
  const a = signature.actualPrintedObservations;
  check(canonicalHash(a) === k.observationsCanonicalSha256 && a.printedNativeName === k.printedName
    && a.printedCardClass === 'Pokemon' && a.printedHP === k.hp && a.printedType === k.type
    && a.printedStage === k.stage && a.printedEvolutionFrom === k.evolvesFrom
    && a.printedCollectorNumber === k.collector && a.printedArtist === k.artist, 'Full actual Japanese name/body/footer');
  check(a.abilities.length === k.abilityCount && a.attacks.length === k.attackCount
    && a.printedPokemonExRule === k.exRule && signature.completePrintedIdentityAndBodyReadable === true,
    'Complete attacks/costs/effects/abilities/rules');
  check(!Object.hasOwn(a, 'printedForm') && !Object.hasOwn(a, 'printedNationalDex')
    && !Object.hasOwn(a, 'printedSetCodeLiteral'), 'Absent form/Dex/literal set code stay absent');
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
  check(body.raw_source_printed_witness.printedEvolutionPlacement === null
    && body.root_actual_printed_witness.printedEvolutionPlacement === k.actualEvolutionPlacement
    && body.additive_actual_evolution_observation.rawField === null
    && body.additive_actual_evolution_observation.rootActualLiteral === k.actualEvolutionPlacement
    && body.raw_source_witness_is_verbatim_certified === false && body.raw_source_witness_not_rewritten === true,
    'Raw null placements remain null; root short literal remains separate');
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
  validateActual(raw.actualPixelSignature, k); separateWitnesses(body, k);
  return k;
}

export function validatePublishedWitness(body, row) {
  const k = knownSource(row.printing_id);
  publicProjection(body);
  check(canonicalHash(body) === k.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === k.controlsCanonicalSha256,
    'Whole immutable public body and controls resist joint forgery');
  validateActual(body.actual_pixel_signature, k); separateWitnesses(body, k);
  check(row.set_code === 'PCG2' && row.language_code === 'ja' && row.collector_number === k.alias
    && row.card_native_name === k.currentLabel && row.provider_id === k.sourceCardId && row.image_url === k.imageUrl
    && row.evidence.source_page_url === k.sourcePageUrl && row.work_type === 'CARDS', 'Exact current printing and original URL');
  check(body.accepted_category === null && body.recorded_inventory_category === null && body.actual_printed_category === 'Pokemon'
    && body.actual_native_category === 'Pokemon' && body.canonical_english_null_preserved === true, 'Actual class never fills null canonical metadata');
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
