import { createHash } from 'node:crypto';
const check = (condition, message) => { if (!condition) throw Error(message); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows = {
  "5a6e6094-b847-4e50-bfb5-f8dec149e07e": {
    "printingId": "5a6e6094-b847-4e50-bfb5-f8dec149e07e",
    "rawCanonicalSha256": "19ced4498c90ae49e1e176b1b03c66b22708bf7225d2fa0ebee6358a9666f149",
    "bodyCanonicalSha256": "99b5281b5683ebb37fdae1cefc77bebaf8a8c6cf7c85206dc92077e43a86e108",
    "controlsCanonicalSha256": "33567ca7c6c563980bd074981205ea149d4eccef292efe5b792d9fd7d946f9f1",
    "resultCanonicalSha256": "71518f4e7cd4d9222fde5bb60cd47559406f6de125f3fe48d42cbda6ad104a42",
    "actualCanonicalSha256": "dbdd729f36142ec7b4fce144be64377c61ffe23dd76276e00a364ac528008baa",
    "safePhotoCanonicalSha256": "0444806c0130034054e239bdb7463251a2c15e3ef3f1239142d9780529486eed",
    "production": [
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "00dbf2d3-a5cb-4e83-83bd-4eeef011d6bc",
        "finish_code": "normal",
        "printing_id": "5a6e6094-b847-4e50-bfb5-f8dec149e07e",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Porygon",
        "collector_number": "103b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      },
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "942e0c49-1234-4c4f-9af4-53bc522bade9",
        "finish_code": "reverse_holo",
        "printing_id": "5a6e6094-b847-4e50-bfb5-f8dec149e07e",
        "variant_code": "reverse_holo",
        "language_code": "en",
        "card_native_name": "Porygon",
        "collector_number": "103b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "00dbf2d3-a5cb-4e83-83bd-4eeef011d6bc",
        "finish_code": "normal",
        "printing_id": "5a6e6094-b847-4e50-bfb5-f8dec149e07e",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Porygon",
        "collector_number": "103b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      },
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "942e0c49-1234-4c4f-9af4-53bc522bade9",
        "finish_code": "reverse_holo",
        "printing_id": "5a6e6094-b847-4e50-bfb5-f8dec149e07e",
        "variant_code": "reverse_holo",
        "language_code": "en",
        "card_native_name": "Porygon",
        "collector_number": "103b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:254b7efe813d735b1d874e847257bc384e7d0555b872e2f18f8745f60c4111d6",
    "original": {
      "sha256": "80ce003685a84281d52ac2aa07a65d9fb3e63dfe94d01b8e4cb419e7bdec54e0",
      "bytes": 259136,
      "width": 1107,
      "height": 1527,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "20f8aaaf6276aeec3171744612493f6880060174d62bb4391b0c947a184a60b6"
    },
    "originalFile": "originals/80ce003685a84281d52ac2aa07a65d9fb3e63dfe94d01b8e4cb419e7bdec54e0.jpg",
    "rowCanonicalSha256": "a9e8fdb57c9a52d15dfbf1ec6c915a8e32c5876418012718b0497d3ac1043228",
    "publishedBodySha256": "917ef1104da63199b81738d654e8fbcf37f2d50b689ff1c38adb198e95812e71",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-aquapolis/porygon-103b",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/97326bac8c6e3ea7000a29710bf00b50324ee16a73756a8a73b4d37be2456802/1600.jpg",
    "alias": "103b",
    "name": "Porygon"
  },
  "9884a2e7-1d5d-4355-99c5-0fe2556c4837": {
    "printingId": "9884a2e7-1d5d-4355-99c5-0fe2556c4837",
    "rawCanonicalSha256": "6587182686e00d56fcbe76af17ab9f017121dbc763066e1cc2aeca7c4ba208f1",
    "bodyCanonicalSha256": "8badee03c5a274f7591c16d985f69bbc520e369856852766ee5adc4eba69085b",
    "controlsCanonicalSha256": "59e14a45740492cdd9ff935dbfdb27fceb3c10f78b1b4e94ce55aab37aa5d216",
    "resultCanonicalSha256": "cab1efd5d876112fc06fa20b54716dc85bdcc9dbeb30410f7a400260d27a357d",
    "actualCanonicalSha256": "e1ff820e229a0be45c7e7dd2983f123be8b8b9a123f1d7731f89bb74101e463c",
    "safePhotoCanonicalSha256": "1263c491859600721d5327bda8ed4550a452beebf0fd200ba6091939646b1ef9",
    "production": [
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "1fc97b9f-48eb-4be8-a29c-cd1844bc2757",
        "finish_code": "reverse_holo",
        "printing_id": "9884a2e7-1d5d-4355-99c5-0fe2556c4837",
        "variant_code": "reverse_holo",
        "language_code": "en",
        "card_native_name": "Mr. Mime",
        "collector_number": "95b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      },
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "6a922068-873d-46d8-b5d8-5539df9ce8a1",
        "finish_code": "normal",
        "printing_id": "9884a2e7-1d5d-4355-99c5-0fe2556c4837",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Mr. Mime",
        "collector_number": "95b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "1fc97b9f-48eb-4be8-a29c-cd1844bc2757",
        "finish_code": "reverse_holo",
        "printing_id": "9884a2e7-1d5d-4355-99c5-0fe2556c4837",
        "variant_code": "reverse_holo",
        "language_code": "en",
        "card_native_name": "Mr. Mime",
        "collector_number": "95b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      },
      {
        "set_id": "2cd06c25-7efb-442d-b1ff-8f00979d5fe4",
        "set_code": "ecard2",
        "game_code": "pokemon",
        "variant_id": "6a922068-873d-46d8-b5d8-5539df9ce8a1",
        "finish_code": "normal",
        "printing_id": "9884a2e7-1d5d-4355-99c5-0fe2556c4837",
        "variant_code": "normal",
        "language_code": "en",
        "card_native_name": "Mr. Mime",
        "collector_number": "95b",
        "catalogue_version_id": "d6bdab54-ec11-4b54-85a9-311d6ce3b2c8",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:1125ce624d88ae5627ad9d721a129b66798030f929ee6d6118691c2cb39dbcd3",
    "original": {
      "sha256": "5c2d2ec38eeb77868f24c058cb34ec44b05a62dda3718f7bbfe8ccff625507f9",
      "bytes": 130406,
      "width": 690,
      "height": 960,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "393b2ff11811ecb5b873910015fab8e090a6e54ddd2fbbedc7df896c7eb72f8a"
    },
    "originalFile": "originals/5c2d2ec38eeb77868f24c058cb34ec44b05a62dda3718f7bbfe8ccff625507f9.jpg",
    "rowCanonicalSha256": "fb624fc99ccf6ee5898479698adcfd9d8b71b3200f8ab9d8fab7fea8858fca7d",
    "publishedBodySha256": "edf32dab50d9a852e4e49697eb448a1e03814a4ecbb34d64606f9c224b1fb401",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-aquapolis/mr-mime-95b",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/jnwylq374y25p6dz/1600.jpg",
    "alias": "95b",
    "name": "Mr. Mime"
  }
};
export function knownSource(id) { const known = expectedRows[id]; check(known, 'Outside exact Aquapolis2'); return known; }
export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) check(!['pricing','prices','sellerPrices','marketplaces','pop_reports','provider_metadata_raw','raw_html','private_path','absolutePath'].includes(key), 'Private/commercial source payload');
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicProjection(item)]));
  }
  check(typeof value !== 'string' || !/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b/u.test(value), 'Private path/raw HTML');
  return value;
}
export const publicationBody = publicProjection;
export function validateActual(actual, known) {
  check(canonicalHash(actual) === known.actualCanonicalSha256, 'Exact accepted English body changed');
  check(actual.language === 'en' && actual.category === 'Pokemon' && actual.name === known.name && actual.hp > 0 && actual.stage === 'Basic' && actual.attacks.length > 0 && actual.artistReadCertain === true, 'English Pokemon body required');
  check(actual.printedCollectorNumber === known.alias + '/147' && actual.collectorSuffixReadCertain === true && actual.printedEReaderIdReadCertain === true && actual.exactNumberedBFrontIdentitySupported === true && actual.completeOuterFrameAndAllFourCornersVisible === true, 'Actual numbered b/eReader whole front required');
  check(actual.physicalFinishCertified === false && actual.physicalEditionCertified === false && actual.normalFinishInferredFromNonSparklingPhoto === false && actual.reverseFinishInferredFromSurfaceGrain === false, 'No physical finish/edition inference permitted');
}
export function validateSourceRow(raw, body, controls) {
  const known = knownSource(raw.printingId);
  check(canonicalHash(raw) === known.rawCanonicalSha256 && canonicalHash(body) === known.bodyCanonicalSha256 && canonicalHash(controls) === known.controlsCanonicalSha256, 'Exact raw/public/category evidence changed');
  check(raw.sourceCode === 'pricecharting' && raw.selectedSourceCardId === known.sourceCardId && raw.preparationApproved === false && raw.publicationApproved === false && raw.historicalSelectedSourceCardId === null, 'Source identity or historical authority changed');
  validateActual(raw.actualPixelSignature, known);
  return known;
}
export function validatePublishedWitness(body, row) {
  const known = knownSource(row.printing_id);
  publicProjection(body);
  check(canonicalHash(body) === known.bodyCanonicalSha256 && canonicalHash(row.evidence.queue_controls) === known.controlsCanonicalSha256, 'Pinned public source/body controls changed');
  validateActual(body.actualPixelSignature, known);
  check(body.requiredAssetScope.variant_id === null && body.requiredDeliveryKind === 'shared' && body.currentAuthority.privatePackageIsProductionReady === false && body.exactNormalPhotoClaimed === false && body.exactReverseHoloPhotoClaimed === false, 'Shared-front or historical authority changed');
  check(row.source_code === 'pricecharting' && row.provider_id === known.sourceCardId && row.image_url === known.imageUrl && row.evidence.source_page_url === known.sourcePageUrl, 'Literal PriceCharting provenance changed');
  return known;
}
