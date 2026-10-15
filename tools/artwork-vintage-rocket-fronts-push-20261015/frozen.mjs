import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '68b4a260e25ac4e92c21c0f334c43aed58c0fedc1caaaeb409df07c37277ffd6';
export const APPROVAL_SHA = 'ac6e33f75c8f4a8781f4baec28d5d6d5137b8c86db546f8d3c15cfde98a62c6e';
export const IDENTITY_TABLE_SHA = 'bc0619e998fabb9725c7199c69b735c4f75d595c918bed05059bb926ab28a49d';
export const SAVED_TARGETS_SHA = 'e7c27f5d3c1f6e2ace4bb8835cc15f47377817cc2974815760427fc0fd2b0d1d';
export const SOURCE_MANIFEST_SHA = 'ecb956a23503c2de324f97eec3d218251427ef99699187e39dac035803c3f046';
export const ARCHIVE_SHA = 'abe19c1c0dae857d1cd5d28ef8a50d3adc213c40d79fb431b7e6cefd399b3fea';
export const ARCHIVE_ID = 644510720;
export const ARCHIVE_BYTES = 10282029;
export const FRONTS = 64;
export const QUEUE_ID = "STACKR-JA-VINTAGE-ROCKET-FRONTS-20261015-064";
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "0f9ef24dc26337b74a4e5331237a1508c8350ac1ba045e229bef573b5eb760e8",
  "finiteDecision": "60d9a13ac164fa46fdef9c5dd7460ef51ea41abe8f744a759aecc8212a05630c",
  "independentSelection": "f1b766f0fd30c890cc4b8de5dab3a61b6a76be2f331e8a7a312ca222e9d3ff1c",
  "independentPrivateReview": "5b473cc53d73887f8285915620097ffb2042b0759e40adb77263cfa485d9b1e0",
  "sourcePolicyCheckpoint": "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "ca03149a-3266-4b49-ac2d-8392972393a7": {
    "alias": "001",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:05a3583f4cbb4d6cdf6a41f679bb33acf503aef12dbaa70815aec2ceda507a15",
    "image_url": "https://den-cards.pokellector.com/315/Ekans.B04.1.38260.png",
    "variant_id": "d16b2f77-a410-465a-8871-e5a8c8d95b01",
    "finish": "normal",
    "current_native_label": "アーボ",
    "original_sha256": "d2c97da5cdd6541622c60d6b0c5cbb8c655d49e119353dd91b519b25e69af9ad",
    "original_mime": "image/webp",
    "body_sha256": "c504951bc730ecd7b72ab01d62d70ee73a4e452542a96a69f2abb13924ff5d0b",
    "width": 565,
    "height": 800
  },
  "a8d7d0c7-58c4-42cf-b8b7-d4e4c12c2c96": {
    "alias": "002",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:06bf8754848cb064cb6dc84d2868c081a64bded58e07d8e15dab95c9cf84d512",
    "image_url": "https://den-cards.pokellector.com/315/Zubat.B04.2.38261.png",
    "variant_id": "be16f81e-287a-47c6-9ad0-9e718cbda669",
    "finish": "normal",
    "current_native_label": "ズバット",
    "original_sha256": "302ca8fbc01b735d4d04f315244948b898a0250e9fa9e1c821e6de12ce7996a8",
    "original_mime": "image/webp",
    "body_sha256": "1ff265230e4ea5d107b5dfabb69cb267c93d7c98becc63cf7bf2dad86476abdd",
    "width": 570,
    "height": 797
  },
  "62360437-7dc0-44c7-b184-981cf8a72616": {
    "alias": "003",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:ec7bfda8408169aea90f89929c20b203301336d2fcc54d1b37036556b28c634d",
    "image_url": "https://den-cards.pokellector.com/315/Oddish.B04.3.38262.png",
    "variant_id": "2c051949-7014-47d8-aa8e-a96d0f1bcd6a",
    "finish": "normal",
    "current_native_label": "ナゾノクサ",
    "original_sha256": "15e78ffd0cdc6920ea80ce754b902fd6572b7bfe51588a6a962d5a638e7996c8",
    "original_mime": "image/webp",
    "body_sha256": "a61ce0f12cd04eabe74ba45a63098bd0117a44bb43fe8b9f4fd9d5e58ea69137",
    "width": 570,
    "height": 794
  },
  "a50bcb36-e3f4-4da5-97ce-c7a48564d3ad": {
    "alias": "004",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3e7b3bd61df43007326d10da9f336285eb30929663474083e55b9e1b7b9d6b6d",
    "image_url": "https://den-cards.pokellector.com/315/Grimer.B04.4.38263.png",
    "variant_id": "45856a98-ed4b-4882-b2ee-0a0d501e548d",
    "finish": "normal",
    "current_native_label": "ベトベター",
    "original_sha256": "d85a8abe93f6e39b351afcbad21175ca90f671cc109497834b018f1d713fd5ac",
    "original_mime": "image/webp",
    "body_sha256": "a67067a2165d759ca4e793d256813a739bf3bea8343c307194c36c28f1c4b8de",
    "width": 570,
    "height": 799
  },
  "e7d1f707-c9c3-45f3-9295-c93769a10192": {
    "alias": "005",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:85fe02c9286274067a9485baebfd0f44c9e1339f0582133c74b0eb8580969da4",
    "image_url": "https://den-cards.pokellector.com/315/Koffing.B04.5.38264.png",
    "variant_id": "e08929c3-a7be-4463-b86f-823e2fec75df",
    "finish": "normal",
    "current_native_label": "ドガース",
    "original_sha256": "acf66eaf7889dfb888896c45821a65e0e056d6561a860bb291f01b263ab13bff",
    "original_mime": "image/webp",
    "body_sha256": "cc12b3b27b3d923018b2e69e0355a89b5656f2e11e84b3ff01878ad10412ae72",
    "width": 570,
    "height": 799
  },
  "4f3976bb-9646-4045-badf-4901fb8297f6": {
    "alias": "006",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:eff95b9f7b1012419d306876c3329638d4cf6a92caf0f252a936f5b5ad5dfcd3",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Gloom.B04.6.38265.png",
    "variant_id": "c3bc559d-6df9-4d61-866d-f135c49ee49e",
    "finish": "normal",
    "current_native_label": "わるいクサイハナ",
    "original_sha256": "539bf7631f90bc77750c473ffae8b086b55712f6174470025789cff6b8107fc8",
    "original_mime": "image/webp",
    "body_sha256": "ea260e9ccb1620cfc95991d1260594d94ef5527d1ddd25cb8e26af4efae19b18",
    "width": 567,
    "height": 800
  },
  "fac49d8e-96f5-49a0-8916-3f9041dc93fe": {
    "alias": "007",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:37149bba9776aef5e87442ce25c692a7864e8ddcdbcf477f8219b849fc2c6e48",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Muk.B04.7.38266.png",
    "variant_id": "2069d307-dcdf-4668-a8f7-d612c4d7875c",
    "finish": "normal",
    "current_native_label": "わるいベトベトン",
    "original_sha256": "b7de20b61ee8616e25b90b03902c0dc2376883fb9693a4f5d0aee23edb2d4af0",
    "original_mime": "image/webp",
    "body_sha256": "b7fe8ef05c13cccf1bd44745c5aceb393a58ce7460f85042d13b6d9a42967c81",
    "width": 569,
    "height": 800
  },
  "911037b3-bf39-4dc8-919c-525910c1c409": {
    "alias": "008",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:8592c68e1ae17dfc7e7a6e7755110df62ab02223d84d15d738dc177a225c08ca",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Arbok.B04.8.38267.png",
    "variant_id": "539d0279-5d43-4423-891a-3dd5af07cfaa",
    "finish": "holo",
    "current_native_label": "わるいアーボック",
    "original_sha256": "b2538b93ea27ffe0470679c0a29341a5eb6c8485eef5475273dc2364fad8d329",
    "original_mime": "image/webp",
    "body_sha256": "fffd93e894b20fc9317cf44aad13b2982c0c5638e73042d05159d6c6b94f86fd",
    "width": 567,
    "height": 800
  },
  "61be7103-7d71-48a8-a6f8-63f8aa8cb5ff": {
    "alias": "009",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7c689b8a2a2e1dcc9d0bb0bf38590757fd2bb3358ddf1b82a8f22dbe7f0dead6",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Golbat.B04.9.38268.png",
    "variant_id": "6bffd1ed-79eb-4366-8b6e-71d61b6a3191",
    "finish": "holo",
    "current_native_label": "わるいゴルバット",
    "original_sha256": "6924a980f56beb81bd514ca2292cfb20102c6d2a731a77ae29f4957e161cce09",
    "original_mime": "image/webp",
    "body_sha256": "689bebbaa0edd853145dc3aae1270fce6ed757c3b351b4a7b8d45ac12e5433d9",
    "width": 565,
    "height": 800
  },
  "9aa2f046-1872-45bc-a2e3-e6eae562cb8a": {
    "alias": "010",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6ca6f6eaaad0649c22db73c0cd5558e92fc7de4b798ec7327711a5573d206198",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Vileplume.B04.10.38269.png",
    "variant_id": "9c474167-9ae7-4a23-849f-6685cd80ef95",
    "finish": "holo",
    "current_native_label": "ラフレシア",
    "original_sha256": "8e3003a86e6327e9768f0ae01bff8526a69a6fc1c219c23146ed5e6a967a9ad6",
    "original_mime": "image/webp",
    "body_sha256": "ff60c114b7b60fbeb7ab56e16a3f50bc95f0559ac6735640769a0c99e84f8064",
    "width": 565,
    "height": 800
  },
  "f573649b-b750-44b4-9a87-acf2ed685411": {
    "alias": "011",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:ff492b416635830a4779f2349fd7f4b2cf4e9c45215bf820cdf21c9aaaf94c12",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Weezing.B04.11.38270.png",
    "variant_id": "7ef54435-e989-4687-af86-9a987a9e3a6b",
    "finish": "holo",
    "current_native_label": "わるいマタドガス",
    "original_sha256": "945254079249da9ddb561fae0edaf50ec9789fc953ea9985aa4f6f8ef7d4119b",
    "original_mime": "image/webp",
    "body_sha256": "19a0683c153d41326e76e1ff81a6ff5ec3a069b32da7dd3d45cc5c183898cfee",
    "width": 565,
    "height": 800
  },
  "f8abeb79-f853-4d47-87c6-1d124623cc3e": {
    "alias": "012",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1738dac5efe5415815a6de113b66f18620b19c2fe53405c4abfe93ef250150ce",
    "image_url": "https://den-cards.pokellector.com/315/Charmander.B04.12.38271.png",
    "variant_id": "e815a2fe-9cf7-4020-aeaf-e5f8896a8e67",
    "finish": "normal",
    "current_native_label": "ヒトカゲ",
    "original_sha256": "138335ce30b4a5688bf793e36248c78e3fc418863c9ba1743441c149d83fa42e",
    "original_mime": "image/webp",
    "body_sha256": "642390ec4f9007c211fd6f075db16d95f8ad30978720714f90b113148da12f2c",
    "width": 570,
    "height": 799
  },
  "2cdc867f-ac15-4898-83fd-ff664ff518dc": {
    "alias": "013",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6813079dfb0e1da94d93884367d08d567387c4425a1471ecc8cc8eda3bda5458",
    "image_url": "https://den-cards.pokellector.com/315/Ponyta.B04.13.38272.png",
    "variant_id": "d43c384d-9986-4013-a06e-6f70634bd869",
    "finish": "normal",
    "current_native_label": "ポニータ",
    "original_sha256": "66d1b4a586d93a2942b6c3f1378b83384391e67c467fab9fe0726d89759a4547",
    "original_mime": "image/webp",
    "body_sha256": "0ca19a66ff91185dc24601a64c042e2859afd38259d139e57d58c8b15cc793c3",
    "width": 565,
    "height": 800
  },
  "ad7733ff-c0cb-4b8b-af56-b7a2a173de9b": {
    "alias": "014",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:060a6775b928c99da463f08977d34254a35c660d5364d7d0d5be469dd36add18",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Rapidash.B04.14.38273.png",
    "variant_id": "490d7c0a-5cf7-4046-9bc2-bd69c8c004e3",
    "finish": "normal",
    "current_native_label": "わるいギャロップ",
    "original_sha256": "214792e1e37f839efdf8187fc65290efa4feac700b5ad7250a7a2f74891ef853",
    "original_mime": "image/webp",
    "body_sha256": "14169df92516b15a4ab7e902558a41338f701eaca9f53a6a30f56a9a1bd33abe",
    "width": 570,
    "height": 797
  },
  "b71e6ef2-84a3-4c26-b2f8-8d2c4cc932b7": {
    "alias": "015",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:ccfea76d1626c082923ae21cd05d74cadfd0b49558eb54a64a4dfe25e6abbe99",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Charmeleon.B04.15.38274.png",
    "variant_id": "f77c3287-ee41-42ce-8bfa-5eb33c86c9a0",
    "finish": "normal",
    "current_native_label": "わるいリザード",
    "original_sha256": "3722a75540c8a8664e38fbfc467396b9f8ad7f4fb1628fb60a2f861c1cbafe05",
    "original_mime": "image/webp",
    "body_sha256": "37044c8e11122e2785963703879804c659397c2e2f6a5d4bbb7a689cdba5f2a6",
    "width": 567,
    "height": 800
  },
  "5e2afa4c-bbc5-4e40-b981-80da28c1c3c1": {
    "alias": "016",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:47bde540b4cee47cd159b6d144130a970ff5b04262a5c8cd67bf8583cbbf0be8",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Flareon.B04.16.38275.png",
    "variant_id": "a90b0b5c-4e48-446c-ab13-ffb3f5436612",
    "finish": "normal",
    "current_native_label": "わるいブースター",
    "original_sha256": "fcc889a932ca3f2b067d3b59234b0b11f3ae45bde41616d67e7b069d19c047f7",
    "original_mime": "image/webp",
    "body_sha256": "dbbfee95913f882718b86010cf7470855a52bf3e8b286df31dba9f0b8ce0e382",
    "width": 567,
    "height": 800
  },
  "ad06b0e2-5b0e-4e50-a205-81fe66824a8a": {
    "alias": "017",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:b8d7b939f3fbe0accdbec3b219a9284adc291d7558dbb72f5e995b0a2b3b75c2",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Charizard.B04.17.38276.png",
    "variant_id": "5e8e2075-a87b-4f70-ae88-8351b5c325f9",
    "finish": "holo",
    "current_native_label": "わるいリザードン",
    "original_sha256": "092b4e7d704757b8a3bc504cf79c4ef8bde856f0f6a8af5af742062d8a46cc4d",
    "original_mime": "image/webp",
    "body_sha256": "30b5b7f8be0e0fa84382fbe38ce12d98b8035511b15eccb402fd06bf2ded30d8",
    "width": 570,
    "height": 799
  },
  "2c2201b1-d448-4772-89e4-5595deba6f03": {
    "alias": "018",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:d83ea462927e59ca451fc8424ac8812b5956185f3ee0cebce55868ac3e579811",
    "image_url": "https://den-cards.pokellector.com/315/Squirtle.B04.18.38277.png",
    "variant_id": "e04c8495-da43-44e5-a435-f94397db38bd",
    "finish": "normal",
    "current_native_label": "ゼニガメ",
    "original_sha256": "62b9e9fad3885955be4b4988deb05f0c8ed5fcb561a158eb459c6a4416e51aff",
    "original_mime": "image/webp",
    "body_sha256": "956e4529c02b2de5a972bbe3b94db7ea0869f7a20e0406ce49246c0120763d39",
    "width": 570,
    "height": 797
  },
  "20c21745-7b39-4410-9665-4f4352fda131": {
    "alias": "019",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:d11ddcecfa2ab523a1c9b3ded25f036f4c72d6bddd84873e8cb52b138c16e7bb",
    "image_url": "https://den-cards.pokellector.com/315/Psyduck.B04.19.38278.png",
    "variant_id": "ed7ec8ac-6e4a-4836-bfda-f838197f2445",
    "finish": "normal",
    "current_native_label": "コダック",
    "original_sha256": "acaa04685877a12e6028ce82ce7dcac3ab0a6b832ba9a8dfc65b0e91c8942b26",
    "original_mime": "image/webp",
    "body_sha256": "57da2e88643c4986a46f2c9c19488fb9b6f4f797c2bd1836c5f147758a4c33fa",
    "width": 570,
    "height": 797
  },
  "dd477de9-fb64-4e73-a34c-e309f1de613d": {
    "alias": "020",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:5c332e5c16e717d74ec78def5aa04ae256499f0e40376bfa476a597f6dc284c5",
    "image_url": "https://den-cards.pokellector.com/315/Magikarp.B04.20.38279.png",
    "variant_id": "12c5461f-ed74-400d-a7aa-e9e8a771d4fc",
    "finish": "normal",
    "current_native_label": "コイキング",
    "original_sha256": "546e46d2136b525156014cb82891304c3f5467771b84ab1c91d7ff96bf11bd2d",
    "original_mime": "image/webp",
    "body_sha256": "59d7531cd8aed3a1e36ec9f61be0d02b98d70796c89fd5b2383aabce0f7f926d",
    "width": 570,
    "height": 799
  },
  "0d85dc4d-80c7-4b32-b682-eb9d169339ff": {
    "alias": "021",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1af1f5121c08d5ddc462d1a3e46e38b782d9baa31073b3291a747c27264c9296",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Wartortle.B04.21.38280.png",
    "variant_id": "d0134c61-4521-4054-8790-32eba75da8ce",
    "finish": "normal",
    "current_native_label": "わるいカメール",
    "original_sha256": "f4e791429d25fd1eeafac326ed02d0a0be4f7945ba4637ab44ec6edb9e2d56ed",
    "original_mime": "image/webp",
    "body_sha256": "48be67e60dd9d404ad66579648e6ef0d7d5f07241e4b5db16ce9ebc3b7373b6e",
    "width": 567,
    "height": 800
  },
  "b6cdcc07-f1a3-4fa2-90f2-f4b18c9a6c3f": {
    "alias": "022",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:8f3d68e0471cb860bbd8f5e7a507a27bcd73fab1383fc7fae7f54d264e20825c",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Golduck.B04.22.38281.png",
    "variant_id": "588f602c-a397-4205-b2ad-666f10cbe871",
    "finish": "normal",
    "current_native_label": "わるいゴルダック",
    "original_sha256": "f1248512bb2b357931cad92eee53d9bc0e45d84056a3255f71def724a567790e",
    "original_mime": "image/webp",
    "body_sha256": "7a5327f135b2a96676019d10849385f99095f8775184388e3150e22ebed17bb1",
    "width": 570,
    "height": 797
  },
  "840a8799-be3a-476b-8322-f07b28d236d0": {
    "alias": "023",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:074298f57bb624b0b875b4e86a70c1ab786b6ff7d227d780820c5267ff32085e",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Vaporeon.B04.23.38282.png",
    "variant_id": "7763afdb-37f2-4dab-b3a9-079099e387c1",
    "finish": "normal",
    "current_native_label": "わるいシャワーズ",
    "original_sha256": "506a37ac7c256cf52bca370ae8a6be4bd7886a87f4abbc4d73706a71955778c1",
    "original_mime": "image/webp",
    "body_sha256": "45869060acc0f7531e8e57627be7edae0018303474fee0f3dc668bb0329f463a",
    "width": 570,
    "height": 799
  },
  "b60de9f1-b893-4ae6-9dd1-7ac07af6b6ae": {
    "alias": "024",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:216aa75576d40bb65988a0889a31cd51e1028beddd60fa58e009f3c0212e7dd5",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Blastoise.B04.24.38283.png",
    "variant_id": "7304d44f-a8b3-4c28-8558-e91f45bbee8a",
    "finish": "holo",
    "current_native_label": "わるいカメックス",
    "original_sha256": "b65601f1cf58449f4f50c8c223494ae4aae67aba0f4fd1d106dc3f565ee226f1",
    "original_mime": "image/webp",
    "body_sha256": "7b7e66f502a44af530c2e6ec3b84665ff47af4da702e9dbfa2ba1ec811c95904",
    "width": 570,
    "height": 799
  },
  "9fbbb1b3-e492-43ff-a497-54701ca7e6be": {
    "alias": "025",
    "batch_id": "JP-CARDS-055",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1e446a3588cdc15f424d545ed17f4ed124ca412ef6bce5b1cf06d7938e4f0e1f",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Gyarados.B04.25.38284.png",
    "variant_id": "929db8ec-101d-4240-8827-f8c54eb8e42f",
    "finish": "holo",
    "current_native_label": "わるいギャラドス",
    "original_sha256": "7912f20c57bd1268b8174ac3ba9451dbd52b54d7a5a70933f8e00fef5169934c",
    "original_mime": "image/webp",
    "body_sha256": "4ad3d3600d69b0d378be9120babc46678a78856b07e96fb6b6ed09c350f0bfc5",
    "width": 570,
    "height": 799
  },
  "bd9c7455-3bfa-4b16-849b-aad17a8d0c9b": {
    "alias": "026",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:306acb9f8c0d84b73fe9bbe424be806659dbb6893c01650a0a10018469c8e6b3",
    "image_url": "https://den-cards.pokellector.com/315/Magnemite.B04.26.38285.png",
    "variant_id": "10f28026-a189-4246-85a9-ba1d07d92af5",
    "finish": "normal",
    "current_native_label": "コイル",
    "original_sha256": "8d77c57a51b9d7de8315c510d63800a74c606b55a9ab9c6a3d513c30b2d5c6f0",
    "original_mime": "image/webp",
    "body_sha256": "4bb1504026fe055ade0e938e182f391fa0a540fcd5e2d586176b404a28f4c9a7",
    "width": 570,
    "height": 799
  },
  "057eace6-c3b6-4512-a908-8478a66f90a3": {
    "alias": "027",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2b96320236a63c2dc477a2009e43718725f646df863aab09164fed7e1f62c200",
    "image_url": "https://den-cards.pokellector.com/315/Voltorb.B04.27.38286.png",
    "variant_id": "d366bc79-360d-4d3c-b23f-82bb80acb68b",
    "finish": "normal",
    "current_native_label": "ビリリダマ",
    "original_sha256": "acbaeec087518b9b314d7c58fb371fbb6e97b4ddfefc6568638e0c97c51006a1",
    "original_mime": "image/webp",
    "body_sha256": "2cbfe4410395613dd04ec6162efd31959f63f3be636ddf20d4cf200273e6e486",
    "width": 570,
    "height": 799
  },
  "5a112731-689f-499e-bed3-87f1db5fe06d": {
    "alias": "028",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:95203c064f42a908ae8e925e36096295476254a80767ec90d6df6d070956f034",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Electrode.B04.28.38287.png",
    "variant_id": "4024a280-285e-4075-9c22-6382ee9daa6e",
    "finish": "normal",
    "current_native_label": "わるいマルマイン",
    "original_sha256": "13e2b7a74bcfe4f6482a633a42a06e032f43aee3b128800c26215a3a35c540a0",
    "original_mime": "image/webp",
    "body_sha256": "38cc0310701a9342c8302a4a05f48e45afe482e9ff6dd7cb50ef2741e15ccb17",
    "width": 570,
    "height": 794
  },
  "8096cd03-ee6f-4a2d-803e-0dc1213e53e5": {
    "alias": "029",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:a0ebb1e5b1eb0b18e04693d702d4ba510bae0f0282ceb7d3a8dac6e272223f31",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Jolteon.B04.29.38288.png",
    "variant_id": "1e841b53-a189-4398-87b4-695010753041",
    "finish": "normal",
    "current_native_label": "わるいサンダース",
    "original_sha256": "5d65291709a26924783c476b15ddb4e00f30cbc09b473020fb27ed9bfbe01b56",
    "original_mime": "image/webp",
    "body_sha256": "39b8f6b0d573d5a5587ee8f76d93f15f00fa63eed620fec3222ecde7ef3fcd16",
    "width": 569,
    "height": 800
  },
  "3ff92b59-9b60-4cb0-b198-5ae562e726c9": {
    "alias": "030",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:716b788c2aaeaf6d66014e6c98effd723940616774c871783a7b70ac8bc6bda5",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Magneton.B04.30.38289.png",
    "variant_id": "9ea0086d-df42-4668-819b-be51893b6714",
    "finish": "holo",
    "current_native_label": "わるいレアコイル",
    "original_sha256": "650b27d2ebed7017dbeaee0ee9264f168190811f88ab0e25f4d1239222dda271",
    "original_mime": "image/webp",
    "body_sha256": "b35ea81d52b658317a276795645bbfff87b3e41fd1c26cf57c65839576a7a56c",
    "width": 570,
    "height": 799
  },
  "a4cc4880-70f9-40a5-bd74-8381a62fd06a": {
    "alias": "031",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2dc20330935bf85912253e2349238b6bbe51866f5b5ef6aee0d22563648444fa",
    "image_url": "https://den-cards.pokellector.com/315/Abra.B04.31.38290.png",
    "variant_id": "f3742726-172f-4afa-843d-62167c3dcc89",
    "finish": "normal",
    "current_native_label": "ケーシィ",
    "original_sha256": "451e44278b921a2c117b1b3f30c58693d506395fe64882ac6dd66e83d3d2ae99",
    "original_mime": "image/webp",
    "body_sha256": "571ac1f1d53eee6e4d508e13d66ba8b4400019937de6047957ad4eb773e64153",
    "width": 570,
    "height": 797
  },
  "3341bcc8-1a84-4734-9fc0-66d62a86b038": {
    "alias": "032",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3797a3394fba15d00802dbb6e0145eb620daddd4f9aa06df2f745e71d1231109",
    "image_url": "https://den-cards.pokellector.com/315/Slowpoke.B04.32.38291.png",
    "variant_id": "e556c15a-9029-4a41-90f1-937872943f88",
    "finish": "normal",
    "current_native_label": "ヤドン",
    "original_sha256": "f76808e2c3e192a9902f2836b022c20af43c7f0c29c9a2ca262bbdf694431039",
    "original_mime": "image/webp",
    "body_sha256": "8c8738de310b6ad495cd24fc5c31407ea6e382ea26d8276f25f6e8751ce00d0c",
    "width": 567,
    "height": 800
  },
  "04a8d97e-ebde-4119-ba8b-78f159f6a4e6": {
    "alias": "033",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:39a5adeb5ed6bf1e8a24f69a0471307da412ebe796fc1487232e7d3fcd0127cc",
    "image_url": "https://den-cards.pokellector.com/315/Drowzee.B04.33.38292.png",
    "variant_id": "42996941-eb5d-4c66-8e1b-710e29114eb9",
    "finish": "normal",
    "current_native_label": "スリープ",
    "original_sha256": "64094bf167e52410d5000302c1c691e0f5f4af39bb2b1f01e131a9289dce0f5e",
    "original_mime": "image/webp",
    "body_sha256": "d19cfd295a5f084514f4ceb0a9d440a5833f01a95d54c30a8db2843c0976e0d0",
    "width": 570,
    "height": 799
  },
  "a8af3759-3cd8-4909-8ecb-3013ba4e9716": {
    "alias": "034",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1acbe4437b15df330c4df64d2a8c68b8c5b2e5db3e29ed1010c7a87b920d3c2d",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Kadabra.B04.34.38293.png",
    "variant_id": "1d0d8142-9b48-4dd9-a128-702b7fe56b48",
    "finish": "normal",
    "current_native_label": "わるいユンゲラー",
    "original_sha256": "12c3517184ce77c8ace8bd9bb38e7188c2f46c650aca7687a9eb80c57d632888",
    "original_mime": "image/webp",
    "body_sha256": "2a4b67e0576f9c61b9f52125bad6719afe3305056bd64a96f8c083476b43b9eb",
    "width": 570,
    "height": 797
  },
  "dfe04a89-cc36-4d0c-b7c8-6f0487b99b8c": {
    "alias": "035",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:30b6724dcd3c77dec5cd246778ad76009f693ca821e47f1d2965d35ac0365423",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Alakazam.B04.35.38294.png",
    "variant_id": "e5157066-62bc-40d5-8749-748792c3c75d",
    "finish": "holo",
    "current_native_label": "わるいフーディン",
    "original_sha256": "bc42ebe6ff1d75872d80c4addd8605f6f99fbe6652c9b9d9a7df6b8a802ed384",
    "original_mime": "image/webp",
    "body_sha256": "0702fd67f9c8d6d4a90d3951e14922591c25ba575a96df2a61248e9916f223ea",
    "width": 567,
    "height": 800
  },
  "8a67147d-8fec-453b-bf73-11901bb28f4d": {
    "alias": "036",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:5d705a318357feed053d4cb0ef0883924a2271d48f09e4fafbc1691e2c7f2c0f",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Slowbro.B04.36.38295.png",
    "variant_id": "dabb3976-a40d-42aa-828c-fab6006818b7",
    "finish": "holo",
    "current_native_label": "わるいヤドラン",
    "original_sha256": "bdab2d0eb761cbdb36a8890652366d1024366575701a96522a56ffdc007fa1d2",
    "original_mime": "image/webp",
    "body_sha256": "98af83fbc8e231cea947df47f6b24a70bd0081634e60bd7526195306737371a3",
    "width": 570,
    "height": 799
  },
  "504a3ee0-704e-43c7-a41e-fdf7f6403ffe": {
    "alias": "037",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:76153e39d1c64b3b9f74567fadd558c75e52213b179bce32ba669f88cc90964d",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Hypno.B04.37.38296.png",
    "variant_id": "34e8431e-523c-41b0-8c33-4ee69cbcb9d2",
    "finish": "holo",
    "current_native_label": "わるいスリーパー",
    "original_sha256": "e48146d0885e4a419f53ac92cb0e73b2ffc9f76780914175f39b563770ef0818",
    "original_mime": "image/webp",
    "body_sha256": "70701db6fdbe947f47f5fcf7f99246323823ec34e6653eb45b86c756869bc26d",
    "width": 570,
    "height": 799
  },
  "bf63a267-79b8-4852-b49c-d3c3099a02c9": {
    "alias": "038",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7ffd1e8ab9af34580d6c829f0593fc28314f87b9137874987eefde95d35c435d",
    "image_url": "https://den-cards.pokellector.com/315/Diglett.B04.38.38297.png",
    "variant_id": "c17188f2-3894-461f-a629-6cd3788d461c",
    "finish": "normal",
    "current_native_label": "ディグダ",
    "original_sha256": "fdcb2c08bab8b3effa15982aad380e65c2dab6db41f64df879c037fb2b167374",
    "original_mime": "image/webp",
    "body_sha256": "989c2d8db5caa64b449c5c9e871c238b127bcf7ffce2ecdcee1e9cd51cc4eeae",
    "width": 570,
    "height": 797
  },
  "618ebb3f-e779-4722-a3af-761eef9e01c4": {
    "alias": "039",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:4c13a5d697ae22e25afa4ee51f7fc235dd8a67cc635aaf464b06033be6d93528",
    "image_url": "https://den-cards.pokellector.com/315/Mankey.B04.39.38298.png",
    "variant_id": "830e66d4-3d98-4ff3-9ada-82a37d58d424",
    "finish": "normal",
    "current_native_label": "マンキー",
    "original_sha256": "6dd9fee6f17c9ae5c56d3d0c41f43e213d4793e4dfadd75359bdd08f4adfe309",
    "original_mime": "image/webp",
    "body_sha256": "109c103acbdb242617b5d74309338ae9565a3ffb6e1b1f107acd4331327a7c88",
    "width": 570,
    "height": 799
  },
  "00140729-82c3-457e-beff-45822ef27d34": {
    "alias": "040",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e67c62fffbdc7657024cc18f2707e0cf23d234cdf551a495787176e5ad74eb4c",
    "image_url": "https://den-cards.pokellector.com/315/Machop.B04.40.38299.png",
    "variant_id": "b3c50bbd-b7cf-4d0e-8377-798d705a66c7",
    "finish": "normal",
    "current_native_label": "ワンリキー",
    "original_sha256": "87a0665d5dedab1d37fd55a283e05a23f3f16e109523af4c7839359c2b1c1ab0",
    "original_mime": "image/webp",
    "body_sha256": "dac2687f7f85d20a0889cd4b794029e9e86499c6890a9ff37d0e23bc7a253dae",
    "width": 570,
    "height": 794
  },
  "4d8eb5b8-ebdf-41d8-90b1-4b12da43736c": {
    "alias": "041",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:0d4c3486ea39cdba0465099feb483c8e33868600068dcf338771c92cebfe3632",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Primeape.B04.41.38300.png",
    "variant_id": "9b3c049c-9454-4472-887f-0cd43e2cc3c6",
    "finish": "normal",
    "current_native_label": "わるいオコリザル",
    "original_sha256": "ee8e9456177198acc2c4988c758dd17901d66f4ee7f9528de28cb09723c4c261",
    "original_mime": "image/webp",
    "body_sha256": "1a1237625251c43b0e234b85c8f8dea139516074c18833b82b8812011e109637",
    "width": 564,
    "height": 800
  },
  "ee9ef06d-ed16-44f5-a688-7f140ecc67fc": {
    "alias": "042",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:80d90dbe9d0f21e4fb66959b32c665cb7e139045d136b746d53a4f9c22d1f614",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Machoke.B04.42.38301.png",
    "variant_id": "e1e1cf0b-0b2b-44f7-bae4-dac403c91220",
    "finish": "normal",
    "current_native_label": "わるいゴーリキー",
    "original_sha256": "d80abdf1a56a8fb8d45c15b23e0327719907edab32a072d6800a9fda4a282198",
    "original_mime": "image/webp",
    "body_sha256": "3d6b339720cc52fce0d7e6198e8d40c023b7a2d1dd30de322fe37c08425de55e",
    "width": 565,
    "height": 800
  },
  "22892c66-ea84-48cb-8c5a-bc5f9184f38f": {
    "alias": "043",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3a0e1d71fd80de8636607668e99fa1fafd23b28d9ca887e4143932d0ae24045f",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Dugtrio.B04.43.38302.png",
    "variant_id": "68b77d48-5a87-448a-9d48-38c6e0bd2783",
    "finish": "holo",
    "current_native_label": "わるいダグトリオ",
    "original_sha256": "6b2fd8019a6af8a8f76eb94d7b49ea224bfaefd9bdfb3edd4c1d73d66daf43d1",
    "original_mime": "image/webp",
    "body_sha256": "0c3d51d88f5efd475a321d5ccfc2643d148957aa6bda42e224a95c8fdb89032d",
    "width": 560,
    "height": 800
  },
  "1873535d-6b24-4634-829c-858e04699237": {
    "alias": "044",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:10ca482f9c2414a8576204127ca65ca75d5c2cce77ea7eef3a360f4189cab9f9",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Machamp.B04.44.38303.png",
    "variant_id": "d50cdf98-5c51-471c-8ff0-73d3b9e351c3",
    "finish": "holo",
    "current_native_label": "わるいカイリキー",
    "original_sha256": "de68ba69a4ee823e8dbb8918b6bd6463d78b10c6874fce91ef672de718a8c26a",
    "original_mime": "image/webp",
    "body_sha256": "7d0d5c0f7d695c9e5ee8f21f2234b6568148111ea78db5a6a124b81603d2d3af",
    "width": 569,
    "height": 800
  },
  "1c236872-1ec2-4219-8d8e-cae27c9f54aa": {
    "alias": "045",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:d705908e5e933422c56183006429313f309934700b08344eda40804cba6145d0",
    "image_url": "https://den-cards.pokellector.com/315/Rattata.B04.45.38304.png",
    "variant_id": "e15288db-d8e0-4cc2-848b-ac39239a078c",
    "finish": "normal",
    "current_native_label": "コラッタ",
    "original_sha256": "82467c72cf776b159324ff8516460d248842b1c6ce28eabd40f8fbaadd4667cc",
    "original_mime": "image/webp",
    "body_sha256": "587f8b019d6332c16df89eb2e8d585e66adbfd426d1765b2629b8ff86d7aef4e",
    "width": 570,
    "height": 797
  },
  "1c29e3c7-adda-42cd-9130-109c097e9ef8": {
    "alias": "046",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:008cad1326996a1f115d366ab1244be98095f7235cf0a8f52d435c8e40325147",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Raticate.B04.46.38305.png",
    "variant_id": "039c421f-1577-48a0-a575-516f1153d7d3",
    "finish": "normal",
    "current_native_label": "わるいラッタ",
    "original_sha256": "97e22f5a8ce29e2b45d093d013ee78c8051f53a8b8d376763a7b783ae656bf89",
    "original_mime": "image/webp",
    "body_sha256": "babfb490124c4dca2b5932d8b3090a245320c020106f531e775ffe90ecd8c4d0",
    "width": 570,
    "height": 797
  },
  "a333987e-5e47-44ef-88ad-d653a18bf839": {
    "alias": "047",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:59e20445e2aa47ceba3f265c9609b013df296e97bee55c9ea990417b600de4ea",
    "image_url": "https://den-cards.pokellector.com/315/Meowth.B04.47.38306.png",
    "variant_id": "3fbe514b-66dc-4e30-ac30-1f746d8f368c",
    "finish": "normal",
    "current_native_label": "ニャース",
    "original_sha256": "18889baeb27141119c588665ba4e91db27d5bc10760d717c0fb21ba9451ba94f",
    "original_mime": "image/webp",
    "body_sha256": "31ae73690caf41b42a74cec60fae3d78693157dd95808962984e0d44b88c57f8",
    "width": 567,
    "height": 800
  },
  "787d1903-d15f-4556-8539-d43e500bc2eb": {
    "alias": "048",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:82fb66dab32eb18c6111da7262bb769c8ac96e0e44d192350e659bb700ebbeb2",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Persian.B04.48.38307.png",
    "variant_id": "09f43161-0244-437c-be15-2f9c8f55253e",
    "finish": "normal",
    "current_native_label": "わるいペルシアン",
    "original_sha256": "a2df974e6db32444271b9c5559dba5ac68090d6626d0c7e9cda268c553a70aee",
    "original_mime": "image/webp",
    "body_sha256": "1e0146c602ee3896d54fd34faa91a4da741f20f1898161e374a8b04def36001f",
    "width": 570,
    "height": 799
  },
  "6799fae2-eab4-439e-885f-6175cf8cd044": {
    "alias": "049",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:ab1d2365fef7cf5f5d7e16126bdd24b37bf8ae050ab86bb36ad20e88be897946",
    "image_url": "https://den-cards.pokellector.com/315/Eevee.B04.49.38308.png",
    "variant_id": "3e575487-2226-4f06-aded-720fc16bd04e",
    "finish": "normal",
    "current_native_label": "イーブイ",
    "original_sha256": "93aa25f01c2d421b14618f474c2debf1b7ddbcc6d4351dc9ae3e0139b58e15ca",
    "original_mime": "image/webp",
    "body_sha256": "7a16417d65047cf1faf7c244b34c6a9bdb0ad2df96bc5fbc613e58aaaa292f26",
    "width": 570,
    "height": 799
  },
  "cfdb64b1-a45b-4a2e-8fba-720792b2555f": {
    "alias": "050",
    "batch_id": "JP-CARDS-056",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:26d70419f2ca7d39bc92ea64b0c674728dc92ed5ead3185cee08da15a3bb9ad1",
    "image_url": "https://den-cards.pokellector.com/315/Porygon.B04.50.38309.png",
    "variant_id": "1d696ff5-7440-48dc-ab86-99202b6a9803",
    "finish": "normal",
    "current_native_label": "ポリゴン",
    "original_sha256": "67c964a370d5432306020a4ece7ae4c6504536e2f974dad2629188b94cf896c9",
    "original_mime": "image/webp",
    "body_sha256": "5ee97da9ca85c152516f13b7a3a4b99c7d32eeff3592804fe147b545948cb6e1",
    "width": 570,
    "height": 797
  },
  "df2a6c59-26d8-4cec-a60f-3b5dffecd032": {
    "alias": "051",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7f65b89da3a42ebb7018e1e3c383eede65946baaa8a842c47aae7a12f8acd6ee",
    "image_url": "https://den-cards.pokellector.com/315/Dratini.B04.51.38310.png",
    "variant_id": "d507d1cf-13c1-4424-aedc-734df301c482",
    "finish": "normal",
    "current_native_label": "ミニリュウ",
    "original_sha256": "454db3a267d4416fd51eccbe688264f50cd54913247fa1fa39cef48b7749cd58",
    "original_mime": "image/webp",
    "body_sha256": "418cb3489bd6c011d4e131e763437797607b3111042a71d3f8f291b940348740",
    "width": 570,
    "height": 799
  },
  "3b40bba0-6a7c-4e45-bfc8-cae2f9b39d85": {
    "alias": "052",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:bacf202d4f94611d485cd9fc79b9b15a7e6bb87d297fccffd704d3325cafd3b7",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Dragonair.B04.52.38311.png",
    "variant_id": "41403607-4dce-4210-aebb-9d7faa6af613",
    "finish": "normal",
    "current_native_label": "わるいハクリュー",
    "original_sha256": "0329ae8513081fdc3823ffe235d11e69e8ca7012ce5bbe17b25bc5f79c68eb57",
    "original_mime": "image/webp",
    "body_sha256": "756edd6d24c75331ab7d94312589f5250b2503067bb772996bdb00cbebe2e569",
    "width": 570,
    "height": 799
  },
  "8bc60440-cf31-48fa-a0ff-8219cb1fd613": {
    "alias": "053",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:40b8443b5a07d6677bd46a042f1ca375a9115015a90bbb83c78b9fc199245947",
    "image_url": "https://den-cards.pokellector.com/315/Dark-Dragonite.B04.53.38312.png",
    "variant_id": "026b67c9-255b-4740-a320-49ba2c57dadf",
    "finish": "holo",
    "current_native_label": "わるいカイリュー",
    "original_sha256": "dd094fb822a0d5665d4b6dac87a3b1920bfcf346b77ff2b1d2ad2c7502ea35b4",
    "original_mime": "image/webp",
    "body_sha256": "d55800a3ef5837fae6b3a7340e5c745847b95b3375635d9d686e3488c896ceaa",
    "width": 570,
    "height": 780
  },
  "73943d5e-b40e-4f7d-8cb2-110fb91d7ce7": {
    "alias": "054",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:ba584b7956393e2a58d8ab712f20bd191d1c61ef2d7378ab038842990e6edd04",
    "image_url": "https://den-cards.pokellector.com/315/Sleep.B04.54.38313.png",
    "variant_id": "dec52b6b-a126-4793-988a-f7a186b926d7",
    "finish": "normal",
    "current_native_label": "ねむれ!ねむれ!",
    "original_sha256": "27ca07ad1b7408b6d80add5f2cbc3a8f7ea96ed1926570d26f54ca1bf0cd95e6",
    "original_mime": "image/webp",
    "body_sha256": "b83d76c065b5d7e1952160ccae59a5632c25676defdde0e35dc0642acb3bd7af",
    "width": 570,
    "height": 794
  },
  "f13903cb-2193-4f2c-a923-ef19c919e040": {
    "alias": "055",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:48a2bddfb45b20220ced97ee0e858284c2d03edecd0ad50894da65094d9575c1",
    "image_url": "https://den-cards.pokellector.com/315/Digger.B04.55.38314.png",
    "variant_id": "d37b3d7e-a08a-4880-b792-dd13ccdf0222",
    "finish": "normal",
    "current_native_label": "バトル場は穴だらけ!",
    "original_sha256": "58033776cac9d28218ca9b01dd5da3a40fe0b2b76e3ecf8675d2fe12fd38415e",
    "original_mime": "image/webp",
    "body_sha256": "52a0ea3b28d8ff35f581f20a9dd121cea9f041d997843bd5a47ec748c9cafd75",
    "width": 569,
    "height": 800
  },
  "579e86a7-1693-4c61-840b-aac92c3ae109": {
    "alias": "056",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e0add863e712d1bbff5f6471c33bd78ce38bb5d75685adcd261b63aaa3d0f887",
    "image_url": "https://den-cards.pokellector.com/315/Goop-Gas-Attack.B04.56.38315.png",
    "variant_id": "36d5b460-0e54-4fe5-aa69-87eb4113a171",
    "finish": "normal",
    "current_native_label": "まきちらせ!ベトベトガス",
    "original_sha256": "65399db33c008ce56accd54b3468beebcafb79aab65f78ae7719d35f10616152",
    "original_mime": "image/webp",
    "body_sha256": "84d353efb37dd4693132eaf78a44afb7addc56e1bf331ac2138e9de8a06b9745",
    "width": 570,
    "height": 799
  },
  "0e9d770d-3237-4171-9872-d86d9ff24fd5": {
    "alias": "057",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:b331a86c8a6164a5f5abc19c4d5c9c6c5a899e0824026bc99ac8fa169fb583c5",
    "image_url": "https://den-cards.pokellector.com/315/Nightly-Garbage-Run.B04.57.38316.png",
    "variant_id": "ca08beaa-681f-4220-a6ac-e41f5e4d5ff7",
    "finish": "normal",
    "current_native_label": "夜の廃品回収",
    "original_sha256": "108e438ef65a675db11225502bf61f8190c80da8fba61585c036a81b5b947c3d",
    "original_mime": "image/webp",
    "body_sha256": "cc151ba4bc5600600045dc2ab327cf029aeef416d1a5401741ec28854dfe2664",
    "width": 570,
    "height": 799
  },
  "0914a578-dab4-4428-89ad-ef06e17d9f95": {
    "alias": "058",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:94dd91fc8c69b6d30e19cafe972610970775eb25e37c362620bde2b663fb8580",
    "image_url": "https://den-cards.pokellector.com/315/Challenge.B04.58.38317.png",
    "variant_id": "19153208-443b-423d-ae0d-9adba3aa2e84",
    "finish": "normal",
    "current_native_label": "たたきつけろ!挑戦状",
    "original_sha256": "d3e5bbbd3557a38b1e502a7d71c1735a23b3ac33ae7b661fc6308cec52be85d8",
    "original_mime": "image/webp",
    "body_sha256": "6e32b5eb97256d2edffabdc76321c590db27e91957b5dc03deed455763ec1725",
    "width": 564,
    "height": 800
  },
  "ec2cd85a-b6b4-4dc7-907f-801b86bedb6e": {
    "alias": "059",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3ebec512acbbcd82e860f962d7c0bbb007fecfacf57dd511c6f597a5a6122ad9",
    "image_url": "https://den-cards.pokellector.com/315/Imposter-Oaks-Revenge.B04.59.38318.png",
    "variant_id": "0e482bd4-c53d-45af-8adf-8067cfbd3288",
    "finish": "normal",
    "current_native_label": "にせオーキドの逆襲",
    "original_sha256": "ac75fa2d0c947e1ccd2e68eefbc69a696503094bb19894c518c3cf3a03c8c04f",
    "original_mime": "image/webp",
    "body_sha256": "7f8ea230c5ab06fdaed4f7c31f125f3dbe4a141d8bc84de2a558b71c0257f990",
    "width": 570,
    "height": 799
  },
  "d21b4883-c63a-4ad3-8eef-a765eecec604": {
    "alias": "060",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e539feae5e74817c0fd26e144b5ed77e4ddf4d15864279be6676b3885fcee9a2",
    "image_url": "https://den-cards.pokellector.com/315/The-Bosss-Way.B04.60.38319.png",
    "variant_id": "c1139cc3-ec0c-4e87-82d5-88c95905722b",
    "finish": "normal",
    "current_native_label": "ボスのやりかた",
    "original_sha256": "9241fc833c39353af9bc898090d0fa3edbe85bd115acf43fe85f419a986ba6fc",
    "original_mime": "image/webp",
    "body_sha256": "3ac713d61414239eeb3c7c382d6e03d167ff4d809a9ef1dd6b3d9a917ace588d",
    "width": 570,
    "height": 799
  },
  "c09c6d3c-2ebe-4ef3-adfc-139b745f8eda": {
    "alias": "061",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c2d88c7be51b2e671d6ac5c0db1bf47a963fcf0e81b92cd97a493f52e66c21b4",
    "image_url": "https://den-cards.pokellector.com/315/Rockets-Sneak-Attack.B04.61.38320.png",
    "variant_id": "f8d48a22-8e12-4e39-aff7-6a951da50f46",
    "finish": "holo",
    "current_native_label": "ロケット団のおねーさん",
    "original_sha256": "0df653d4ccebbede73c9745e6e839b90092bcbee3a7345b027358af1fad1299d",
    "original_mime": "image/webp",
    "body_sha256": "8112afba190f71ce9c11ff030cbc7ecb33af5edb054ce1ca3529a656cab8cceb",
    "width": 570,
    "height": 799
  },
  "f5b9cfe9-3ea2-4fc7-a273-c154eed138d9": {
    "alias": "063",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:b253019a5589f4e18b5a980a40ca796338a965f0ca6be56318016cbfd7625bc2",
    "image_url": "https://den-cards.pokellector.com/315/Potion-Energy.B04.63.38322.png",
    "variant_id": "6321cb6c-e76d-40f5-9723-220303648ab2",
    "finish": "normal",
    "current_native_label": "きずぐすり配合エネルギー",
    "original_sha256": "e7a2d9dca91b1f6f6ff568f7dbadceb31807086a14af564f41432aaaaa70c4fe",
    "original_mime": "image/webp",
    "body_sha256": "80cbe9392aea8ec0f21bb75962fe36d99d97c0ce482537bdee5c3874f04d15f0",
    "width": 567,
    "height": 800
  },
  "1e35d779-96b5-45db-87d5-0150ae1f482c": {
    "alias": "064",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2f3c37d79afb128b225e4c7faedb11bbceac427491bb04415188ea8886e9a5a7",
    "image_url": "https://den-cards.pokellector.com/315/Full-Heal-Energy.B04.64.38323.png",
    "variant_id": "a3a12366-6e36-483d-909a-c7b0a803260b",
    "finish": "normal",
    "current_native_label": "なんでもなおし配合エネルギー",
    "original_sha256": "1435d5257ca3aaee7084005f5bc6c7722bf41ccecab312ba6c42b19a0b031440",
    "original_mime": "image/webp",
    "body_sha256": "cb809e7e73de79285ce976506cdbeba59504dcbc77ffa67b1754086181a00dff",
    "width": 570,
    "height": 799
  },
  "c1f4918d-57b6-4e02-a1b8-080824860140": {
    "alias": "065",
    "batch_id": "JP-CARDS-057",
    "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
    "set_code": "PMCG4",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7edb4fa0cd7d6ee8534f40c4e44b575258bb7d102035f056b3de467450224c4f",
    "image_url": "https://den-cards.pokellector.com/315/Rainbow-Energy.B04.65.38324.png",
    "variant_id": "b8fe0692-cf20-4af7-ab82-8b33d62ded0a",
    "finish": "holo",
    "current_native_label": "レインボーエネルギー",
    "original_sha256": "ad6f5d79b6aca3c60913554cc471e456937d8058cf4f68ab034f0c493dd6c4dc",
    "original_mime": "image/webp",
    "body_sha256": "01e21761e3bc0a37903e924361b7ce163e07731b389cfa2cdd4cfa8023c98655",
    "width": 570,
    "height": 799
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-055",
    "JP-CARDS-056",
    "JP-CARDS-057"
  ],
  "saved_batch_tasks": 65,
  "eligible_fronts": 64,
  "by_batch": {
    "JP-CARDS-055": {
      "verified": 25,
      "held": 0
    },
    "JP-CARDS-056": {
      "verified": 25,
      "held": 0
    },
    "JP-CARDS-057": {
      "verified": 14,
      "held": 1
    }
  },
  "excluded_aliases": [
    "062"
  ],
  "excluded": [
    {
      "printingId": "60478fbb-50c8-4d7e-b980-36e4166262a0",
      "alias": "062",
      "reason": {
        "reason": "Two existing normal/holo variants without a declared same-artwork link; one observed photo cannot establish both exact finish bindings. Preserve both current variants and retain this specific exception.",
        "printingId": "60478fbb-50c8-4d7e-b980-36e4166262a0",
        "canonicalAlias": "062",
        "currentVariants": [
          {
            "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
            "set_code": "PMCG4",
            "game_code": "pokemon",
            "variant_id": "86bacb3e-94f6-4dcd-98a2-b822e9c40197",
            "finish_code": "normal",
            "printing_id": "60478fbb-50c8-4d7e-b980-36e4166262a0",
            "variant_code": "normal",
            "language_code": "ja",
            "card_native_name": "ロケット団参上!",
            "collector_number": "062",
            "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
            "same_artwork_as_variant_id": null
          },
          {
            "set_id": "e00ac7f7-8690-407d-a011-5bc5ced0ffca",
            "set_code": "PMCG4",
            "game_code": "pokemon",
            "variant_id": "eb243689-65c6-491f-8033-4de86c8dadbd",
            "finish_code": "holo",
            "printing_id": "60478fbb-50c8-4d7e-b980-36e4166262a0",
            "variant_code": "holo",
            "language_code": "ja",
            "card_native_name": "ロケット団参上!",
            "collector_number": "062",
            "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
            "same_artwork_as_variant_id": null
          }
        ],
        "sourcePhotoCount": 1,
        "sourceNormalAndHoloFlagsAreNotProof": true,
        "entirePrintingExcluded": true,
        "action": "Obtain separately verified normal and holo Japanese ロケット団参上! fronts with exact source/finish evidence for the two existing variant IDs. Retain both variants and all metadata until that evidence is established."
      }
    }
  ],
  "outside_fixed_cohort": [],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Vintage Rocket printing');
  check(row.card_native_name === known.current_native_label, 'Current native label must be preserved');
  return known;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved subset size');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong identity table scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    const known = knownFor(row);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)) && row.original_sha256 === known.original_sha256 && row.body_sha256 === known.body_sha256, 'Identity outside accepted fixed subset');
  }
  return table;
}

function validateBody(row, known) {
  check(digest(Buffer.from(JSON.stringify(row.evidence.source_body))) === known.body_sha256, 'Exact source/public body changed');
  validatePublishedWitness(row.evidence.source_body, row);
  const e = row.evidence;
  check(e.artwork_scope === 'printing_front' && e.source_kind === 'third_party_original' && e.exact_finish_verified === false && e.physical_edition_verified === false && e.vendor_licence_verified === false && e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false, 'Finite artwork decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { pokellector: 64 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${object.mime_type === 'image/jpeg' ? 'jpg' : 'webp'}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 256, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 64, variants: 64, names: 128, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 48 && cards.filter(card => card.finish_code === 'holo').length === 16, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Vintage Rocket plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 260 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen finite approval changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'ja' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && isDeepStrictEqual(approval.source_evidence, SOURCE_EVIDENCE), 'Exact eligible-subset approval changed');
  return approval;
}

export function requireFinalFreeze() {
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 64, 'Exact accepted Vintage Rocket archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 192, object_references: 256, unique_image_members: 256, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}

export const SOURCE_CODES = ['scrydex', 'pokellector'];
export const SOURCE_FIELDS = ['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes', 'deprecated_at'];
export const SOURCE_CHECKPOINT_SHA = "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9";
export const EXISTING_SOURCE_ROW_HASHES = {
  "pokellector": "4a2a381f7146c0bfa0201c62e91e7682f18da6597c4743f23414f3606a942a71",
  "scrydex": "25af5b50521e6fd0942764536f62b0c53c3e72c69c874916241af47735407929"
};
const existingSourcePolicies = {
  "production": [
    {
      "code": "pokellector",
      "display_name": "Pokellector (owner supplied Japanese card fronts)",
      "source_type": "image",
      "base_url": "https://jp.pokellector.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
      "deprecated_at": null
    },
    {
      "code": "scrydex",
      "display_name": "Scrydex",
      "source_type": "image",
      "base_url": "https://scrydex.com",
      "licence_status": "under_review",
      "attribution_required": true,
      "active": false,
      "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
      "deprecated_at": null
    }
  ],
  "staging": []
};
const stagingSourceFixtures = [
  {
    "code": "pokellector",
    "display_name": "Pokellector (owner supplied Japanese card fronts)",
    "source_type": "image",
    "base_url": "https://jp.pokellector.com",
    "licence_status": "under_review",
    "attribution_required": true,
    "active": false,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
    "deprecated_at": null
  }
];
export function validateSourcePlan(plan) {
  check(SOURCE_CHECKPOINT_SHA && plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA, 'Fresh postLegacy8 V2 full-source checkpoint required');
  check(isDeepStrictEqual(plan.source_policies, existingSourcePolicies) && isDeepStrictEqual(plan.new_sources, { production: [], staging: stagingSourceFixtures }), 'No new production source or existing policy change permitted');
  for (const source of [...plan.source_policies.production, ...plan.new_sources.staging]) check(SOURCE_CODES.includes(source.code) && source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null, 'Unknown/active/sourcewide provenance rejected');
}
