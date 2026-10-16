import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows={
  "3c83ecfe-306a-4f64-8003-e455fb4be4f9": {
    "rawCanonicalSha256": "bf5353c231ffa089642f696c595924e592c6d711eac01321c72f005bd926f2ef",
    "bodyCanonicalSha256": "51e1808d7ea8fffa2c7ec9e34776a62e2e432be0b5ec49821efb2308caca5778",
    "controlsCanonicalSha256": "4e6aa212ca2fb4fb4fb546fc5184fb2c8ea612fb745a92f4d90d73aa701ce29f",
    "rowCanonicalSha256": "8ba3c4b3b33b04f7a65340729fd7c479dd8dc4b20e5e08f47187831add6132e3",
    "actualCanonicalSha256": "4d454618935f870abf035bdedaf6b5d37cf8ac79cf3fa158112c9a75b4b20604",
    "production": [
      {
        "set_id": "8063eabc-362a-4f15-a4ec-4ed73824252d",
        "set_code": "PCG1",
        "variant_id": "e2710b68-93f0-4cdd-8537-57a1e6046a0f",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "3c83ecfe-306a-4f64-8003-e455fb4be4f9",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8063eabc-362a-4f15-a4ec-4ed73824252d:034:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "034",
        "catalogue_version": "ja:magazine-promo-reconciliation-2026-09-27-v1",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      }
    ],
    "staging": [
      {
        "set_id": "8063eabc-362a-4f15-a4ec-4ed73824252d",
        "set_code": "PCG1",
        "variant_id": "e2710b68-93f0-4cdd-8537-57a1e6046a0f",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "3c83ecfe-306a-4f64-8003-e455fb4be4f9",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8063eabc-362a-4f15-a4ec-4ed73824252d:034:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "034",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:969e19616e3f1452f9c6429726dc26bcc9278d3fa712bdc627908020be2101ed",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-flight-of-legends/magikarp-34",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/e4f5d0d1c5bd803938a282a6d628a988fcb046b9f669ad452683ec8e333d2214/1600.jpg",
    "productId": "3439153",
    "setCode": "PCG1",
    "alias": "034",
    "currentLabel": "Magikarp",
    "printedName": "コイキング",
    "printedForm": null,
    "category": "Pokemon",
    "hp": 30,
    "type": "Water",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "034/082",
    "artist": "Atsuko Nishida",
    "variantId": "e2710b68-93f0-4cdd-8537-57a1e6046a0f",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "59f7953cd442973c464adc0d05f6267c3488f494fad34be911542c048c2d31d2",
      "bytes": 520296,
      "width": 1028,
      "height": 1411,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "21d7bbebc79c43bf831869c557285069f380b5eb6e6eb3fb58290cb64ad4d8f7"
    },
    "observationsCanonicalSha256": "395574d59d9f4ffe4992e7ce83728a94c962b7b2fc5c45919381374d3164619b",
    "entryCanonicalSha256": "724bcea07fecd8586c5389d06be1a65ea521aed5d986051125b3d4ab641a515d",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null
  },
  "aec39508-e7ed-4d3d-a876-51dc5f7c258e": {
    "rawCanonicalSha256": "12bc47777147a53e2cdde51c88a958174d0a59c6486d266645f210636a6afc53",
    "bodyCanonicalSha256": "2a23b487471857b3513724fb65f2d4ee08bff1bef11390ba1b1611ab2360b16c",
    "controlsCanonicalSha256": "93bc2e1af2c49ce212820616ecdcb7c457c7d775b1f4f1e9a359a64ff46d7da2",
    "rowCanonicalSha256": "061628ba8990991147c40de0bb1d3be9b26e9db8895d7082efb4f974bb48ef8e",
    "actualCanonicalSha256": "ca325b30c57338ce29fa3155757313e7dc7d4cdc3cd16609d1e7c56b6859f13f",
    "production": [
      {
        "set_id": "9fa08d47-d2cd-4829-85b6-819692a6850a",
        "set_code": "PCG2",
        "variant_id": "41385d11-8aac-4618-b8b0-b810bdfcaa8a",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "aec39508-e7ed-4d3d-a876-51dc5f7c258e",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:023:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "023",
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
        "variant_id": "41385d11-8aac-4618-b8b0-b810bdfcaa8a",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "aec39508-e7ed-4d3d-a876-51dc5f7c258e",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:9fa08d47-d2cd-4829-85b6-819692a6850a:023:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "023",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:216eb54cb14d91c43234a42350d520a86f72c65aa068c1105ba4a3f0902af8e0",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-clash-of-the-blue-sky/magikarp-23",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/d6d2e1d606137f572f172ea7a4f0fce814fcfba18ffb6efd78ef37f0d00a60ef/1600.jpg",
    "productId": "3439310",
    "setCode": "PCG2",
    "alias": "023",
    "currentLabel": "Magikarp",
    "printedName": "コイキング",
    "printedForm": null,
    "category": "Pokemon",
    "hp": 30,
    "type": "Water",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "023/082",
    "artist": "Hisao Nakamura",
    "variantId": "41385d11-8aac-4618-b8b0-b810bdfcaa8a",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "3b0688053bc0ba6ffc6b9ff5be8d391f944106b686bc92f3ff4dbacfa1c65782",
      "bytes": 476723,
      "width": 1026,
      "height": 1416,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "b42953441e4e938fe2a2e640d30e918e34fa9cce0737f73b6e0436c6c8277e71"
    },
    "observationsCanonicalSha256": "9f141f3d79b0f92cb812f6c4baab0a63199042536f6b27123fc135f8cb9beb3c",
    "entryCanonicalSha256": "4a63fcd5de22731cd110e2614c0032ca92571ce52fdb3af204280e6c767944f8",
    "abilityCount": 0,
    "attackCount": 2,
    "exRule": null
  },
  "db02f454-b7b4-497d-b2a0-a9e5ab074665": {
    "rawCanonicalSha256": "c111c4ac75fe0d62080b2af29b0fefb640da0982d698d07b7a0ba0c855e28e40",
    "bodyCanonicalSha256": "f31e78cea89f8734fc4f71ee0a88ede2ec227312924105b6050983b738c9124c",
    "controlsCanonicalSha256": "6300470e25439d14d1a5db2cbf3728b80eb56ca95983fa33273f245fed68f846",
    "rowCanonicalSha256": "b4cd2b573541f24e3e8b4fc891217b0917edff6a2f7db37edc22c3b0133fd4ce",
    "actualCanonicalSha256": "90390dc41661349403dedd26a4d0956f41034a254230a2e10bd5d8658a9b7888",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "1f58b1ed-c5fe-4d9b-9d05-a3f3cc24cd2e",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "db02f454-b7b4-497d-b2a0-a9e5ab074665",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:030:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "030",
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
        "variant_id": "1f58b1ed-c5fe-4d9b-9d05-a3f3cc24cd2e",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "db02f454-b7b4-497d-b2a0-a9e5ab074665",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:030:normal",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "030",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:0973053e12a282e02b519ab3d793d25c53b645468fbd018e4a21f274948f8d9f",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/delibird-30",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/67154956235a060c815fdc167a110259b888183ac554619e90042ed385817914/1600.jpg",
    "productId": "3439232",
    "setCode": "PCG3",
    "alias": "030",
    "currentLabel": "Delibird",
    "printedName": "デリバード",
    "printedForm": null,
    "category": "Pokemon",
    "hp": 70,
    "type": "Water",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "030/084",
    "artist": "Yuka Morii",
    "variantId": "1f58b1ed-c5fe-4d9b-9d05-a3f3cc24cd2e",
    "variantCode": "normal",
    "finishCode": "normal",
    "defaultFlag": true,
    "appLargeRole": "original",
    "original": {
      "sha256": "356e2b83bf079ff0070eda4fe340482c43f7fcd51fc53b8b3adec7a0ce893e7f",
      "bytes": 588107,
      "width": 1027,
      "height": 1409,
      "mime": "image/jpeg",
      "format": "JPEG",
      "rgbaSha256": "db00615ef226141662c0b0419176663a21383bb84e62102a0300cd18de86ebc1"
    },
    "observationsCanonicalSha256": "184be982699528085e24750d1172de625ab0212e3ee6d09b7f91848e9ecadbc4",
    "entryCanonicalSha256": "dc585ff3c06400e633d5d73a428cffa531a215cc10edf5abe77d175b90f825d4",
    "abilityCount": 1,
    "attackCount": 1,
    "exRule": null
  },
  "bd47b01b-2694-4e7a-a446-9c2f7a5cbba7": {
    "rawCanonicalSha256": "c1bb9a7442970d30c1108bf783d75cc2040350555ca1e1a6f83342fd0655e369",
    "bodyCanonicalSha256": "303e74ec83f9c1701c2484ecb2610996978fd9ea55f5d0ddd5ca92f827d094f9",
    "controlsCanonicalSha256": "ecfedc9b6d8238430d8c884b6ee2ea159545da5085b531e972fb5f9d0988b451",
    "rowCanonicalSha256": "1671ebf3ffe4d1c4b616d44fc70d97e8f1d62e6ac6f526c2f828e899530842f5",
    "actualCanonicalSha256": "51558677dd46c1d8aef43279c65277a4beac932d274551cbbc4f07f3df2d7aac",
    "production": [
      {
        "set_id": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
        "set_code": "PCG3",
        "variant_id": "d782e5b3-f7f7-4ac9-84ff-c9c6dfa05aca",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "bd47b01b-2694-4e7a-a446-9c2f7a5cbba7",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:060:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "060",
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
        "variant_id": "d782e5b3-f7f7-4ac9-84ff-c9c6dfa05aca",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "bd47b01b-2694-4e7a-a446-9c2f7a5cbba7",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:12f2bb10-ec15-4783-bc9b-c946546a1abc:060:holo",
        "language_code": "ja",
        "_column_presence": {
          "native_image_status": true,
          "same_artwork_as_variant_id": true
        },
        "collector_number": "060",
        "catalogue_version": "ja:tcgdex-796afd47e430-full-primary-2026-08-19",
        "native_image_status": "scan_acquisition_required",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      }
    ],
    "sourceCardId": "pricecharting-image-url-sha256:2434851e2989680db395e6991f4ab79e780509e41032763da98586d3d807ef60",
    "sourcePageUrl": "https://www.pricecharting.com/game/pokemon-japanese-rocket-gang-strikes-back/rocket%27s-hitmonchan-ex-60",
    "imageUrl": "https://storage.googleapis.com/images.pricecharting.com/ref7bdf51e640008c472afd8ac00a3ab553532c496a67f5aa4aa594e772b9e0b44e/1600.jpg",
    "productId": "3439262",
    "setCode": "PCG3",
    "alias": "060",
    "currentLabel": "Rocket's Hitmonchan ex",
    "printedName": "R団のエビワラーex",
    "printedForm": null,
    "category": null,
    "hp": 100,
    "type": "Darkness",
    "stage": "たね",
    "evolvesFrom": null,
    "collector": "060/084",
    "artist": "Mitsuhiro Arita",
    "variantId": "d782e5b3-f7f7-4ac9-84ff-c9c6dfa05aca",
    "variantCode": "holo",
    "finishCode": "holo",
    "defaultFlag": false,
    "appLargeRole": "original",
    "original": {
      "sha256": "9a2f6443bb670c35e8f7fb67a29d7346768277d3c877f52effd33f9ba87b23a1",
      "bytes": 360094,
      "width": 1218,
      "height": 1600,
      "rgbaSha256": "2791c7799c0ee8c626bffd3706fd2f1f7d89ca64ce8608a49c0d76384ac5051a",
      "mime": "image/jpeg",
      "format": "JPEG"
    },
    "observationsCanonicalSha256": "7fbdf560e68be9d8134dc21a2aeee77f04c51afdedf6426f0df06f487b07d24d",
    "entryCanonicalSha256": "c998f2cdfd93f96b677ae2ed6054ec1792c66ac8891ba316b8996f49d169aba1",
    "abilityCount": 1,
    "attackCount": 2,
    "exRule": "ポケモンexが きぜつしたとき、相手プレイヤーはサイドを2枚とります。"
  }
};
const authority={
  "approvedCanonicalSha256": "ea1feb965db76a1d30915359f689fbb71c78cd31ad364853fdbc39b98c9307d7",
  "decisionCanonicalSha256": "d9deb34df7f3eda7fabfe38aa7e2311e9a6464285460f0d6c09820de663f0487",
  "approvedFileSha256": "5976b3017578cbe04a0c6d57f54f8b98f3c857de37894ad5f2381e021e973b23",
  "decisionFileSha256": "7608cc5c480280744f3c8f8c503b3f0f94c7c23ff9f1a23aa897d419888e3007",
  "rootContextFileSha256": "d7ee6bd2932672edb17c93611e17bebef2c9bb8dd924b80482b81093eeddeaf5"
};
export function knownSource(id){const k=expectedRows[id];check(k,'Outside exact four Japanese shared fronts');return k;}
export function publicProjection(value){if(Array.isArray(value))return value.map(publicProjection);if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['price','prices','sellerprices','pricing','marketplace','marketplaces','pop_reports','population','provider_metadata_raw','raw_html','private_path','absolutepath','authorization','cookie','set-cookie','access_token','refresh_token','api_key','secret','password'].includes(key.toLowerCase()),'Private/commercial/credential payload');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}check(typeof value!=='string'||!/(?:^|[\s"'(<])[A-Za-z]:[\\/]|file:\/\/|<html\b|<script\b|Bearer\s+[a-z0-9_.-]{10,}|gh[pousr]_[a-z0-9_]{15,}|[?&](?:token|signature|access_token)=/iu.test(value),'Private path/raw HTML/credential');return value;}
export const publicationBody=publicProjection;
export function validateAuthorityPackets(approved,decision){
 check(canonicalHash(approved)===authority.approvedCanonicalSha256&&canonicalHash(decision)===authority.decisionCanonicalSha256,'Only exact root four-front authority accepted');
 check(approved.rows.length===4&&approved.priorThreeRowsCanonicalIdentical===true&&decision.preparationApproved===true&&decision.conditionalPublicationApproved===true&&decision.productionSourceChangesAllowed===0&&decision.approvedProjectionSha256===authority.approvedFileSha256,'Exact finite four-front root approval and zero source writes');
 check(canonicalHash(decision.expectedProductionRows)===canonicalHash([29,37])&&canonicalHash(decision.expectedStagingRows)===canonicalHash([19,28,19])&&decision.beforeQueryHasOnlyThese11Ids===true,'Exact eleven-ID four-front scope required');
 for(const r of approved.rows){const k=knownSource(r.printingId);check(canonicalHash(r)===k.rawCanonicalSha256&&r.requiredAssetScope.printingId===r.printingId&&(Object.hasOwn(r.requiredAssetScope,'variantId')?r.requiredAssetScope.variantId:r.requiredAssetScope.assetVariantId)===null&&decision.printingIds.includes(r.printingId)&&decision.variantIds.includes(k.variantId),'Exact raw printing/shared scope');}return true;
}
// Observe heterogeneous saved field names without rewriting the raw witness.
export function observed(a,key){const aliases={name:['printedNativeName','printedName'],hp:['printedHP','hitPoints'],stage:['printedStage','stage'],evolvesFrom:['printedEvolutionFrom','evolvesFrom'],collector:['printedCollectorNumber','collectorNumber'],artist:['printedArtist','artist']};for(const k of aliases[key]||[key])if(Object.hasOwn(a,k))return a[k];return undefined;}
export function validateActual(w,k){
 check(canonicalHash(w)===k.actualCanonicalSha256,'Complete original wrapped Japanese signature changed');const a=w.actualPrintedObservations;
 check(w.alias===k.setCode+'-'+k.alias&&w.originalSha256===k.original.sha256&&a&&canonicalHash(a)===k.observationsCanonicalSha256,'Full unchanged original observation keys and Japanese body required');
 check(observed(a,'name')===k.printedName&&a.printedForm===k.printedForm&&Number(observed(a,'hp'))===k.hp&&a.printedType===k.type&&observed(a,'stage')===k.stage&&observed(a,'collector')===k.collector&&observed(a,'artist')===k.artist&&a.abilities.length===k.abilityCount&&a.attacks.length===k.attackCount,'Exact printed identity, ability and attack counts required');
 check((a.printedPokemonExRule??null)===k.exRule,'Full printed ex knockout rule required');
 check(w.completePrintedIdentityAndBodyReadable===true,'Complete readable original required');
}
export function validateSourceRow(raw,body,controls){
 const k=knownSource(raw.printingId);check(canonicalHash(raw)===k.rawCanonicalSha256&&canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(controls)===k.controlsCanonicalSha256,'Exact root raw/body/controls/current tuples required');
 check(raw.requiredAssetScope.printingId===raw.printingId&&(Object.hasOwn(raw.requiredAssetScope,'variantId')?raw.requiredAssetScope.variantId:raw.requiredAssetScope.assetVariantId)===null&&raw.languageCode==='ja'&&raw.setCode===k.setCode&&raw.canonicalAlias===k.alias&&raw.category===k.category&&raw.currentNativeLabel===k.currentLabel&&raw.workType==='CARDS','Exact Japanese same-printing shared scope');
 check(raw.preparationApproved===false&&raw.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only false/null flags retained despite separate root preparation authority');
 check(raw.sourceProviderProductId===k.productId&&raw.selectedSourceCardId===k.sourceCardId&&raw.selectedSourceCardId==='pricecharting-image-url-sha256:'+createHash('sha256').update(raw.sourceImageUrl).digest('hex')&&raw.sourceProviderBodyVerbatimAgreement===false,'Literal photo identity separate from product; no provider-verbatim claim');
 check(raw.eligibleVariantIsDefaultFlag===k.defaultFlag&&raw.currentActualApiDefaultVariantId===k.variantId,'Sole normaltrue/holofalse and actual default IDs retained');validateActual(raw.actualPixelSignature,k);return k;
}
export function validatePublishedWitness(body,row){
 const k=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===k.bodyCanonicalSha256&&canonicalHash(row.evidence.queue_controls)===k.controlsCanonicalSha256,'Complete pinned Japanese witness and controls changed');validateActual(body.actual_pixel_signature,k);
 check(row.language_code==='ja'&&row.set_code===k.setCode&&row.collector_number===k.alias&&row.card_native_name===k.currentLabel&&row.work_type==='CARDS'&&row.provider_id===k.sourceCardId&&row.image_url===k.imageUrl&&row.evidence.source_page_url===k.sourcePageUrl,'Current canonical identity and literal source photo binding');
 check(body.accepted_category===k.category&&body.required_asset_scope.printing_id===row.printing_id&&body.required_asset_scope.variant_id===null&&body.photo_identity_projection.canonicalPrintingId===row.printing_id&&body.source_variant_id===null&&body.required_delivery_kind==='shared'&&body.actual_pixel_signature_canonical_sha256===k.actualCanonicalSha256,'Shared null source/asset scope and nested wrapper');
 const f=body.root_finite_authority;check(f.approved_file_byte_sha256===authority.approvedFileSha256&&f.decision_file_byte_sha256===authority.decisionFileSha256&&f.preparation_approved===true&&f.conditional_future_publication_approved===true&&f.private_package_is_production_ready===false,'Exact materialised root authority; private is not live');
 check(body.historical_authority.selected_source_card_id===null&&body.historical_authority.preparation_approved===false&&body.historical_authority.publication_approved===false,'Historical null/false source flags retained');
 for(const key of ['current_production_binding','current_staging_binding']){const b=body[key],v=b.variants[0],p=b.published_bindings[0];check(b.printing.id===row.printing_id&&b.variants.length===1&&b.published_bindings.length===1&&v.printing_id===row.printing_id&&p.printing_id===row.printing_id&&v.id===k.variantId&&p.variant_id===v.id&&v.is_default===k.defaultFlag&&v.finish_code===k.finishCode&&v.variant_code===k.variantCode&&p.finish_code===k.finishCode&&p.variant_code===k.variantCode,'Both current exact variant/default/finish tuples retained');}
 check(body.shared_front_eligibility_does_not_authenticate_physical_edition===true&&body.unresolved_physical_qualifications.length>0&&body.source_provider_body_verbatim_agreement===false&&body.canonical_native_label_preserved===true,'Physical and nonverbatim qualifications retained');
 for(const key of ['physical_finish_certified','physical_edition_certified','physical_material_authenticity_verified','unlimited_edition_certified','source_wide_approval','vendor_licence_certified','provider_never_resized_certified','native_optical_gain_claimed','stackr_enlargement','full_commercial_html_or_provider_json_included'])check(body[key]===false,'No invented licence/physical/provider/optical certification or raw private captures');return k;
}
