import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = 'fa059bf9425ef17f9d7074ca63963044e7b701d7cd79957e31c302938660435c';
export const APPROVAL_SHA = 'fb7cee357913e7c8fd1e20c90833edce4ebc5960b3382bafabbe2f4df5b9e261';
export const IDENTITY_TABLE_SHA = '2ac7578723759f3ee24b71aac60e8b959ab101bc302501bc20fdc952df2402fd';
export const SAVED_TARGETS_SHA = 'b0ed09074bfb7460f4d196f4aff40145d676bcdb77f1ef1be273d073fd44d54d';
export const SOURCE_MANIFEST_SHA = '4b78f263710ca2d8a62f59961197506dfeff150f74cdae7ae573d0e4642e1d9b';
export const ARCHIVE_SHA = 'ee73b4b0d1cde569af94fa186b2f69c7ce7cf40aa333b368e9272da2cc882f42';
export const ARCHIVE_ID = 641737169;
export const ARCHIVE_BYTES = 26147290;
export const FRONTS = 48;
export const QUEUE_ID = 'STACKR-JA-AWAKENING-20261014-048';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'a15481a7-410b-4a98-8695-3bba0db9d226';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "handoff": "9abf4e61ead2de64404e2fd63385c0e910d464093e312076d67b97ae91c882e7",
  "subset": "688ff4b1e3bca8d7e0b792b0ada3a4347de8e5922426d91d93ffe674cf9db7dd",
  "validation": "9f4a7bcf67b0372ef67ece7f36bc3aded9a330ea70953779ab04a19fed88a634",
  "reconciliation": "49bc5d6a8b88f5c26108b19ab0fae0d17f5514e7f89bc9957b11237dc7af1865",
  "independentAcceptance": "27b5295076b3f54bd09f6d8ae1e89600581dea360df64b83da8a19229f152358",
  "decision": "e61b7a9f0595e6bb18f1d3e6488644743f65f22431af9be3fb8df2d43e82580b"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "2b09d7d4-ab40-4a08-9bea-8623525df2f1": {
    "alias": "001",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-1",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-1/large",
    "variant_id": "d0f17f7f-579b-4f6a-a59a-25fedf27ee98",
    "finish": "normal",
    "current_native_label": "Zubat",
    "original_sha256": "1a0769e62657bcaf6e5882e81b231785f9d231f210c9f8251c3f9ca6b984ddf3",
    "metadata_sha256": "c83571569d93a1027b8ae4929c4f8f03add94f6af846a2b05d3ab57a0a177ce6",
    "body_sha256": "9eaf6947dc618d2bfcf4ec6c05db2c096fccf770a0e55b5561db0f7be1d2e7cc",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "274e8f2a8c1c2bd00eec5135db12ac93c0ec614ffeceb3a94224301871c47263",
    "width": 567,
    "height": 800
  },
  "54b05a6c-c70d-46d3-94e9-68332f08a33c": {
    "alias": "002",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-2",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-2/large",
    "variant_id": "82d54d78-7104-4cb3-9e60-f881be254059",
    "finish": "normal",
    "current_native_label": "パラ",
    "original_sha256": "f336b5f67ba6ab3be7c639ae90228db3e61e98cf0f66d4db5f2ee3c1eb4ef7ac",
    "metadata_sha256": "3aeb0539bbf036992d43c96788f22c6e8e66d93a9bcec39a73a295579b47654a",
    "body_sha256": "49199f85adb969f685e5d6dce870c901d985b03328665d36d60ffd63f575293d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "95ecdd874b56f067cd165fd11c285f63cd6a8ed949a87da4f883240db8599285",
    "width": 567,
    "height": 800
  },
  "66521124-972c-468c-8d8e-8f968946bdfa": {
    "alias": "003",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-3",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-3/large",
    "variant_id": "5bad25ba-2097-43bf-9caa-47262ec2a763",
    "finish": "normal",
    "current_native_label": "スキプルーム",
    "original_sha256": "d41799020b36d4433bf80f97adef9893155d334374b2f148dd9e7a0687b96341",
    "metadata_sha256": "adaeb8aaeec94a2934b5db7d199f732f8782c63c1ff6f3400574a2f4668a7fb6",
    "body_sha256": "53dbed52b5ffe768874cfb449965f12748d912d58168d4baef94082d053e895c",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "270f3cc28737ffe1b87a415ba253a729b47c80b742c31b7be2f6926166c41364",
    "width": 567,
    "height": 800
  },
  "6041ceec-3391-4ba7-ba00-337a593461b5": {
    "alias": "004",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-4",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-4/large",
    "variant_id": "f2560c64-76fa-42f9-89aa-f39fc9e59997",
    "finish": "normal",
    "current_native_label": "ゴルバット",
    "original_sha256": "14be883bf48ce7fee59315222c25446013d316859b93f83eeab1bf0c8ab9eed1",
    "metadata_sha256": "efbc5c90a4a0b6b71eab18628e4d316c1b639e27729d0d03085555fe343f3351",
    "body_sha256": "f62f8a3c400d50f36d03f50613bee2c116260c91fde6de66f79e4edea4bff928",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "57376cd7646e514fdb6e395afc9e5175aa4d6d3504512b273818fca18e069e2d",
    "width": 570,
    "height": 799
  },
  "d015a2b9-40fd-4ef7-a296-e4bafbcea2a8": {
    "alias": "005",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-5",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-5/large",
    "variant_id": "5fda53d3-f137-410d-83ea-53e8ee1faf80",
    "finish": "normal",
    "current_native_label": "パラセクト",
    "original_sha256": "06f911e7d942f5f20be98e9d71c8780ab82e0f5d5fd2a5745d8c1d07a1a4de65",
    "metadata_sha256": "49394dff62389210f37005772609335873b7ccb683e0a9e254d36a207c94a36c",
    "body_sha256": "067d2a4ad7116970284ce8a27be0834373a285bda15fac1d80fe42df98ed91c6",
    "discrepancies_sha256": "1eac81752ea70e5ad0536db29ff2028f54e80e0f28f0eb5454151b48281711e0",
    "actual_signature_sha256": "e2698f17f09fd74dc9ace3a1fe03baeb16d5169db08675d71f7aeb8b4b69cd1a",
    "width": 570,
    "height": 797
  },
  "760cfd36-6350-495d-87da-2258d0b006c9": {
    "alias": "006",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-6",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-6/large",
    "variant_id": "bb327501-1bf8-4ffa-82d1-bd4e640de98a",
    "finish": "holo",
    "current_native_label": "クロバット",
    "original_sha256": "a36e0eae041694241214d74da2a8eb5ddfa4574185bc53fd251dc1242ddd32bc",
    "metadata_sha256": "90d4f7fce7cd3688345b58d7f4e63f97fee8248f893a8e3adc9d78f019e3cb59",
    "body_sha256": "813e55b189a838ff0baaa26a55b9fa67c28a1837e8ebd5b3d91dcec6ae142ce5",
    "discrepancies_sha256": "8551ef4fc454e14804509ae2968f33a4ac728c4e58b050544ea2fb7491abfd43",
    "actual_signature_sha256": "72f542726bf1efb49c7ae6e1900063a226c94cf2b0421ecdd6a85cbfdf7614e9",
    "width": 567,
    "height": 800
  },
  "4e241b63-5d40-41b6-8f4a-7405664b9786": {
    "alias": "007",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-7",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-7/large",
    "variant_id": "bd374770-5cd7-4782-9ff0-37a6f81dbcea",
    "finish": "holo",
    "current_native_label": "ジャンプラフ",
    "original_sha256": "a598d9dcb0f8d20b63b3ac06d5c47ebbd04c6b7703bc3b343324e3827d2d2526",
    "metadata_sha256": "2c096944682efba4a695a3f616814c2219b3481b8ca4657ecc0f2f90c74c1018",
    "body_sha256": "344ddd8e5ce1ab994e5853204d387b576ca6f762291210fed5da879fc595d4f3",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "8a9fafa6cf3e200f11c322f41923f9024a3290701a25963f7a3d6b7e2179b404",
    "width": 570,
    "height": 797
  },
  "ffb6933d-d61b-4de4-b7f3-e1438246b2ec": {
    "alias": "008",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-8",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-8/large",
    "variant_id": "510fc0ee-47df-4a52-9a12-f6ef95c1e88a",
    "finish": "normal",
    "current_native_label": "slugma",
    "original_sha256": "1ced3dc53c619f56896824a0139e36b25db5b8289c322e96261c6252e7ff424f",
    "metadata_sha256": "0ab0ce7552f6ed2817268d86a049e48a837cffc659a7006ac354c8450e3a6059",
    "body_sha256": "420e2a9f7e99b6a3ae7d10a11c5f00765b938a095a99703aee34db8df76d74af",
    "discrepancies_sha256": "6afaf07396c7c27414d8f328f4daefbf21d1fe02b9e77dd8e4ae1ca0404eab85",
    "actual_signature_sha256": "508fdd2a446666f9f2e60aa8bb3e8354897e5e5dcb28d0c80805ff617cd7dd8a",
    "width": 570,
    "height": 797
  },
  "211626d5-7512-426e-89f8-ad4698d2c974": {
    "alias": "009",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-9",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-9/large",
    "variant_id": "e69e84dc-8a34-4d57-b3f8-ab9afd77ed0c",
    "finish": "normal",
    "current_native_label": "マグカルゴ",
    "original_sha256": "a3983f4cf1e59994dd23f9390110342ea921fac17d9abe8761644504d0163f17",
    "metadata_sha256": "44867b8aa37c6dd04d6fd885b2c471919d47baaf13559f9f4addb977fb0615dc",
    "body_sha256": "064cb5de0d57217c2b27c1a40028cd790630cfd302a7e7c9ded1226c77938a38",
    "discrepancies_sha256": "625c7fc594ec6f4099349f958d9be1ee658c0cac66cbc38d7441a5dddbf985ca",
    "actual_signature_sha256": "ed1dcac56f67117faa11f0db072cad74d7a78ddefedc0061dd63ba41e4f9aaf2",
    "width": 570,
    "height": 794
  },
  "b6342158-8305-4b89-b0f4-7f546ac3d6b3": {
    "alias": "010",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-10",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-10/large",
    "variant_id": "24e8e80b-2ebf-4a2a-83bd-c445d50f2d13",
    "finish": "holo",
    "current_native_label": "entei",
    "original_sha256": "4f11c371da6ee337eb3c682326829c973a30509150bf0fe8a52d116a49c091cd",
    "metadata_sha256": "f3eaf9643bd303ac2a46aea7efe77352e57c771926e79584887fab558b85b3a7",
    "body_sha256": "6b461cb1d8e8e13514854186262690a80148cd1007ac24b29bdf356ccd400425",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "f12e35f3d6cb79533cfc99e042ad62245c19212bbb5273b6d14253459f2fd3b6",
    "width": 570,
    "height": 794
  },
  "2f3c0624-1e65-4873-8591-bd60e7e74cba": {
    "alias": "011",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-11",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-11/large",
    "variant_id": "a71958d1-7a5f-4c40-bad1-6a79b393f3f1",
    "finish": "holo",
    "current_native_label": "ho-oh",
    "original_sha256": "728f4c54f793a45a6f526ed56005e5c672356c54b0b5289b4b382905fab67d94",
    "metadata_sha256": "41e43314db1ef2195399d6128fe175568be30f8805faaba90d0a7c3e8cd9af29",
    "body_sha256": "d0d6ce85e89c3b433dcbbbfd85a729d124750fee12d5f8a546dff5c2ffd1743d",
    "discrepancies_sha256": "5b84a1011e7b5d8de8af30c25f695fe77364b537335861f15a0573837e17cc5f",
    "actual_signature_sha256": "77a7d6335fbea7e9e06ca84009515c74d575bd3a874d828a60db2a76b13f7f2d",
    "width": 570,
    "height": 797
  },
  "aa173ef2-e685-41f4-a2e8-0f8b206dccc5": {
    "alias": "012",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-12",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-12/large",
    "variant_id": "621761fe-4f17-48a2-917b-020cc29093ea",
    "finish": "normal",
    "current_native_label": "ゴールデン",
    "original_sha256": "ad356733c372e3a4525db6f35425d41c803d43846f909b7723e4c8439fefde46",
    "metadata_sha256": "e7e05328a1e88a94ef3f8ed8dcd0d7a926c17bd30ffe4ba7c3b1b2b435c875d0",
    "body_sha256": "52d2547c5a88e5c523ade4c233184b04e4197a40062efef0aa614c1ef575b087",
    "discrepancies_sha256": "6b2ec8f84c8832169accf18c483f722235824295fad4c8ea29881d5ab4f07dcb",
    "actual_signature_sha256": "2737c95e8e4a71d0e8fb537a3bdf9bb34cca73dfc4095d1ed732f5b1d4902348",
    "width": 570,
    "height": 794
  },
  "ce5fe735-ceec-4012-9e20-afa43d9ce186": {
    "alias": "013",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-13",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-13/large",
    "variant_id": "3f24dba4-2028-4c90-9929-9bd5cf305677",
    "finish": "normal",
    "current_native_label": "staryu",
    "original_sha256": "b8c18169b8ac8954d4b5b02b59a3ec7304a19fea4e3b4742fc748224b5ca10af",
    "metadata_sha256": "a81865592be92b7c2fdc76a58bd38d5f3e2576cae13e4ccf34b5c9d43485a96c",
    "body_sha256": "8b1ede9e8ff6d8cebf6ac2c53ed03af03926652f83beec1d2f08708de832c2ca",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "05490b1b8f84be9570e490c96118f65439cf8693886719d83c50e165f95460e7",
    "width": 570,
    "height": 797
  },
  "9c165b78-9965-4ef3-abdc-26be537c49cd": {
    "alias": "014",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-14",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-14/large",
    "variant_id": "44768cce-d0d1-440c-bf09-41a390a79a9b",
    "finish": "normal",
    "current_native_label": "quagsire",
    "original_sha256": "7345bb40e3138525da703edc415c0b2c3941894aa8de2aa60fef66b4d93c722b",
    "metadata_sha256": "46bc72a878fbe27c4f85605752daf8aaab51a98cd071188065535f59f0aca8d4",
    "body_sha256": "c601c099675009ca92d6e52193218708063f942b3ad5143b7d78f1f87f0ddbb5",
    "discrepancies_sha256": "276f5502c15c9d8a5e912717d14b5b93561ba778c6bce6a2e389d374b0d3f79a",
    "actual_signature_sha256": "66f830af3f08fb21d36af36e8fc0ee500ac11ef7165dc71e8ac155e5ddfca20d",
    "width": 570,
    "height": 797
  },
  "d6bef590-c0de-48ff-84b4-8338d8db105c": {
    "alias": "015",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-15",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-15/large",
    "variant_id": "efe25496-e929-4d65-ac5a-ce267becfcb2",
    "finish": "normal",
    "current_native_label": "qwilfish",
    "original_sha256": "813fdf8c79b8d44a56445a861b73f4c767743020dfbbaf0530985cd18891f2fa",
    "metadata_sha256": "c32276c696dd0570fb167b1a1ccfb35ad97346bf843ec9118464c91c3625fbb6",
    "body_sha256": "a0bc823b5cc205043c8376a937eb882e6974002f31091a81cd9c099ea7259320",
    "discrepancies_sha256": "a8b335c2f7f6f2fb40f33d93461c81fa5f7487a9764a1985edf7a78ec2108e2e",
    "actual_signature_sha256": "70e7be394e4b79c68cf2b889de711f86bf96ebb69ac6664603ad378f03cba420",
    "width": 565,
    "height": 800
  },
  "141fe229-2a4f-450e-afd8-dbd197d0e991": {
    "alias": "016",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-16",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-16/large",
    "variant_id": "ce9ed72a-6f92-4dae-afd9-1eddb762945d",
    "finish": "normal",
    "current_native_label": "REMORAID",
    "original_sha256": "21d52af305530e068e0e1d1157d36d3ce7d59bb57101fec8703edd78567279a2",
    "metadata_sha256": "f6a6d5fb9e0f18a8644eef4a11d12b8f9f7de38e6cd35221aa4f495b2367bffa",
    "body_sha256": "d3d6168fc9ac15692787b4e949bcfe9f6484ac87e515badf6dd209e7c7664bb0",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "52364cac2348a247ad03f35c74a7ec36da6ff0b2efa9792fb8c90243449b1536",
    "width": 570,
    "height": 797
  },
  "47023fea-b557-4da2-b366-2bc1bd1edf26": {
    "alias": "017",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-17",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-17/large",
    "variant_id": "174d146f-8326-4c85-8e93-c23599e53ebb",
    "finish": "normal",
    "current_native_label": "航海",
    "original_sha256": "2a31b8135abae11d8f65e882a4b30c78eac4b73b6eab9a976853bceaf875f7d9",
    "metadata_sha256": "8f2e6aa0e2b6e0a18de44e5f8de04ec46752bc9597f41691fe756c1d6954a494",
    "body_sha256": "5cff130a93212c50d460780a0b07f1a158b735d3e36a4abfd7c42728a60631ad",
    "discrepancies_sha256": "d7c4518220c08cba8d62945b5d65f26c09a425c459fa4e3ea29cca3646ab6959",
    "actual_signature_sha256": "bf9abccc112b03cdde802d5d07cc67cb10340d4e44d32f0ffacfcf0333beb834",
    "width": 570,
    "height": 799
  },
  "3c75d70a-f67e-4be9-b36a-1499f9e95ad2": {
    "alias": "018",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-18",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-18/large",
    "variant_id": "96520edf-43e7-4d7e-9d56-c2d5210bc81d",
    "finish": "normal",
    "current_native_label": "ジンクス",
    "original_sha256": "1f04bc831d459dd895d3994be5b1bfbc68181fe74bb7519f459c456b569dc665",
    "metadata_sha256": "8e0ac8728a9503211e237aa8550a0bcdf2f579841f85f21c16c961c5d1137efa",
    "body_sha256": "8f98c340fda36034e5f1844b514c7c83fe0fafaecd516ac56431aba8bb22a293",
    "discrepancies_sha256": "0b1a70edcb451d19970ce6115bcb0e7068ad585273b3f8a5da42f3042c6f542f",
    "actual_signature_sha256": "5976c26470003d13695b48e846bd4f1ec1493a11a17c2e66e8738bc8efe44d55",
    "width": 567,
    "height": 800
  },
  "9f7e11ff-21b8-4deb-a4f3-0e9500ce16d9": {
    "alias": "019",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-19",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-19/large",
    "variant_id": "bad76405-ef43-4baf-b33c-210eafb7316f",
    "finish": "normal",
    "current_native_label": "オクリリー",
    "original_sha256": "50662fa0a8fb36992544b9b24f90525ea47466884f95f107584a988cdd41781a",
    "metadata_sha256": "870fb1a0522eff5e4f61b17b2d9a60f2e267fcf1154b273b6395cdfc6a0e026c",
    "body_sha256": "146462aeee72951e0884d04d5ed5a30aafeb6dd5baabd00c8ba32a59b6799899",
    "discrepancies_sha256": "69303f3fcb5d389c8057670bb00b41ef43deac6cd1b3e6296379cffbbd58fee0",
    "actual_signature_sha256": "81d21bce522bbc0a81876d936d3d8dbe8f009726a762588886474eab7cc8616d",
    "width": 570,
    "height": 799
  },
  "f921bbfa-9540-43a1-9794-bbd0f053a098": {
    "alias": "020",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-20",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-20/large",
    "variant_id": "9be7ba71-2d59-4b28-a60d-f9d9155a515a",
    "finish": "holo",
    "current_native_label": "キングドラ",
    "original_sha256": "5f43e4a434f5c8400e7721965c6f7750ce40663216a81d0bdada93e68d27c2e0",
    "metadata_sha256": "b112544f0ea710ad454a9d4df60699bce68d2fb1142f77df287f14119977e1a8",
    "body_sha256": "6ea5303dc61e765e08682e95253aae72f84fcec3d84bb518af998ff1053946a0",
    "discrepancies_sha256": "470042cdb5361752ace445cc18c5516b54d8e80787728942cb023a19c7b26a45",
    "actual_signature_sha256": "e88f2e32be31893d4bfb193ac7bd71e538d411826c46987d1c1edcf4b00b7cc2",
    "width": 570,
    "height": 799
  },
  "229f62af-038d-4480-b03d-56a895ccbd93": {
    "alias": "021",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-21",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-21/large",
    "variant_id": "2219b242-6dc3-450b-94a4-8cb3f0079c6e",
    "finish": "holo",
    "current_native_label": "suicune",
    "original_sha256": "e151c1b60895a061d01f663c7d34cc811e8e5c1beb640e88e772cea969efd48b",
    "metadata_sha256": "719af5a2b0f8fda4491d5f17b9e5457a801ed1267727af191fcf4f45fb41b753",
    "body_sha256": "7eb912827815dd122b200a3bfe44f354988b70bcdf40b75d1b9b3840fee9eeb0",
    "discrepancies_sha256": "e20876d8838a1d412a13eeae791fad192966101a5cb87fba55b223212250b54e",
    "actual_signature_sha256": "146cc98e0f9b1feb9231f6e34b8ec382b760d0aa2934ef79b8fa6284c41d4aaf",
    "width": 570,
    "height": 797
  },
  "0caf8861-03a5-4903-bb53-2a36eeb31881": {
    "alias": "024",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-24",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-24/large",
    "variant_id": "945d95e2-2838-4665-9841-233e67588fa5",
    "finish": "normal",
    "current_native_label": "チンチョウ",
    "original_sha256": "a313ce08d75cc3c465b7e88c997f9277d3ec3b8ea293f8605853fc2dadd3aaad",
    "metadata_sha256": "3b4a4c2b6349a9b7787fc347fdcf78fc1b6c90dd66073105e099c928839fb1c0",
    "body_sha256": "6ae923cab87cc4a04030fe5c19cbf51859f36f2c9cb51598822b7deb98ab005f",
    "discrepancies_sha256": "d5b84e89966e693eb706f0c436f9ee4f8ef41f028d237651158674698ee2a757",
    "actual_signature_sha256": "30c0ee121f98ff39088f9b1d8b8bf8deff1c175f76e0a9386d8f240ed42ab428",
    "width": 567,
    "height": 800
  },
  "47455a4d-785e-4763-b050-fc6305b487af": {
    "alias": "025",
    "batch_id": "JP-CARDS-010",
    "provider": "neo3_ja-25",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-25/large",
    "variant_id": "829de6f9-df80-4475-8c54-b49723de3377",
    "finish": "normal",
    "current_native_label": "ライチュ",
    "original_sha256": "70c1038de777e357dc88b9c2423d4de688df5a87b61dece8bb14b605ce9f2b8d",
    "metadata_sha256": "d00230c9068d8e1ff6cb87d3f0d0989cc12bdd723359a105acc6c4ce018e802a",
    "body_sha256": "2dab6469bcbed083d483a7ba7c94883509bd3f2728f590625753f2c2b9677d66",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "ad8fdf54e0e3a8bf89b52e8c5c338d6783689a824c28222e607ea673a029b5bc",
    "width": 567,
    "height": 800
  },
  "ea8f1d7c-75af-4f80-859c-55c4f0a15421": {
    "alias": "026",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-26",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-26/large",
    "variant_id": "a474e8c3-e056-458e-a1a6-1d7fc652efb2",
    "finish": "normal",
    "current_native_label": "ラントン",
    "original_sha256": "4df2adc87a473d7229b3ac55012fa62e5d6486c760a94d180ef679fd6ef0f903",
    "metadata_sha256": "74dc09e536621d63bd325819c3a4229d2b17cad370aafd4fa36afbad331ac2b4",
    "body_sha256": "f81dfa8fae66a6452004f4b7abac2b818f47bc1775dd8cab5f58e0f7ad9544ba",
    "discrepancies_sha256": "c86fc68bfe69699eac425e98bb7e8762d8198226f3d933480efcb07873fc6ba2",
    "actual_signature_sha256": "4cd47a5327e3f48084771049c55e2d10c0565ec1cc2d43a9aa10115ddce524a6",
    "width": 570,
    "height": 799
  },
  "b64a8dee-2349-49a4-ad2b-c23253e7bb29": {
    "alias": "027",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-27",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-27/large",
    "variant_id": "6277ac3c-b57d-4cd0-b9be-de64366aa79e",
    "finish": "normal",
    "current_native_label": "フラフィー",
    "original_sha256": "dd986a070f05d3ddea36b4577fc752149a6f5c7830cc02946d32d61adbb5a64c",
    "metadata_sha256": "70a079f68efd7660494b9ebb7656dc9f18469a5f5f3cf78e7e4f16f43fbf242b",
    "body_sha256": "8ca7e27bfbe9f41dfa6c3b6f3b431fc5a2a14e3990259e91d3ea5a5c498d0ca1",
    "discrepancies_sha256": "9596eb666c16699564f1e049db0c3e6c23b2baaf6d2b38d4aee03c2d95fe0d9d",
    "actual_signature_sha256": "569a5a6eb428c918b5523d5c9d2caabf1b8394249fcfdb98cd3ed92802ddc695",
    "width": 570,
    "height": 797
  },
  "f9e20313-ca01-47c3-bee6-976cf9ba379e": {
    "alias": "028",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-28",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-28/large",
    "variant_id": "593914cc-0e30-44a7-b458-b6f7c2d92e4b",
    "finish": "holo",
    "current_native_label": "アンファロス",
    "original_sha256": "152090ab1621a38ed379fe1871605c4aa78ad64604996637012c3c647607ea29",
    "metadata_sha256": "eb89bc61fc21c845641cb7a1aa35d7791158524fd99ca8eb0852f615e99e0664",
    "body_sha256": "37ebec23c41bc528e7334488d91b7de6da18b471f599a11c3214357e65f6346a",
    "discrepancies_sha256": "21884b0a1b28a05f8e1419cb8100c98a1f0304055a4e6cb3d2475b8101085519",
    "actual_signature_sha256": "7d6cc1b95e9362748c461ef310fb0c444f5627657e3a8dd881fc9fb757b76bde",
    "width": 570,
    "height": 799
  },
  "7e0fb675-eddf-4d5d-bc8f-d059fcdf59fe": {
    "alias": "029",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-29",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-29/large",
    "variant_id": "3da8fa88-b8d9-43f9-a8ba-211615f6e562",
    "finish": "holo",
    "current_native_label": "ライコウ",
    "original_sha256": "c15a2c7b63900b6626adb9ba965c0e28d0003b4a704c87d75ec9e40a6da81bb3",
    "metadata_sha256": "aaca416dbed8af47f1370267b683d77348381bda66ce8acf66f37f5a12849a09",
    "body_sha256": "43e7a0e67de06d6b8a74b8c5c5a3e972d4ceca90071da60ee5c52f5c705b848e",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "44d48faff8fac2dc5128208539b62baaeafa0c316d6217ba040c43760b98727e",
    "width": 570,
    "height": 797
  },
  "b8c221fb-9ada-4b03-91d8-9deef7a1c18f": {
    "alias": "030",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-30",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-30/large",
    "variant_id": "b81623a1-17a5-4cd1-bf9f-11acde4f714f",
    "finish": "normal",
    "current_native_label": "k",
    "original_sha256": "f925c65bf447e90e1559b3c84728f8911cf9e7c3830a0ef1a16c585f858f9558",
    "metadata_sha256": "b034c8fd01d208c2cf04b77a14badc866798f8cea410401c7fb94f0fc23f548b",
    "body_sha256": "87b5368f732072304a4cb6d23566656e51865dda5a1568eb46bcf6ec65841dc5",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "32f1a6a84e200c5d81905a2939b0d1957e452662e708682201dee7c5fc22bcb7",
    "width": 565,
    "height": 800
  },
  "d4f60bf7-4309-4463-827b-f31f9fa2089f": {
    "alias": "031",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-31",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-31/large",
    "variant_id": "936e7b1f-f1c6-49b3-835f-941477c3999f",
    "finish": "normal",
    "current_native_label": "スムーチュム",
    "original_sha256": "69a469d5be849f6d5d19b5d239d8dd8908743884f1bf6b96c3a6b61a073f4e19",
    "metadata_sha256": "685672fec344233e40abd0e819416dca2943e2794040ca9b538ee2216f60eb51",
    "body_sha256": "804441f3a9f4a0067d8e99638fb1afc6c499dfaca597d7a07264a7dc9dbc7429",
    "discrepancies_sha256": "0f38ba2e7c423604b4931c4d6cbf3fbad272c3271445e48cc5da26c7e2a1b820",
    "actual_signature_sha256": "5569aaaea8e84faf4d41638ba9641e0380af1a70a6cd010acccb94a13c410d65",
    "width": 569,
    "height": 800
  },
  "d3f49f5b-9764-4fad-a346-1569f74249aa": {
    "alias": "032",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-32",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-32/large",
    "variant_id": "0530f72c-dfab-4ca2-8045-46e434ddbd82",
    "finish": "normal",
    "current_native_label": "b",
    "original_sha256": "b595da7f3ba50ead1070407acb9925aa3f2a846254b1aebe7cf229947ce16978",
    "metadata_sha256": "23304f52a6ba5d1c54eec70ae0f54c818acf02e722b7086e01662e5617f69d8d",
    "body_sha256": "11c64634134d48909f8aaf5dca5e32e6ca8b87d9523181e9e0ed4dcd3ae3c32c",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "2b7d9efac56a96e0563ac0c5c9d7334f667e420f1f1818208ba81ef81e6a0ba5",
    "width": 570,
    "height": 794
  },
  "1fe2dcfe-a51e-4269-b277-3dc25d154b7c": {
    "alias": "033",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-33",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-33/large",
    "variant_id": "ceaa663b-7c73-4072-90e8-18a4cc5ad032",
    "finish": "normal",
    "current_native_label": "yなしy",
    "original_sha256": "00d1aef3302a0ad555531872e510e1ebb7eaa3d55e01ee5c28d11d3cb75d9ce8",
    "metadata_sha256": "2fb10aa7819e00b8162eb21696bd349e5816c1fb898103665fc09ff1bdf7ae86",
    "body_sha256": "5f0804f83b4eaae645b9c3e7efce51d44e2c269187c487de0748ab40eeaeda6d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "31b93b5acfac909da5a693a0b3561c2b74954e0b6486d76c7d10dcd15e14201d",
    "width": 570,
    "height": 799
  },
  "fc8c4acd-6201-408e-b2eb-2a21205bf52b": {
    "alias": "034",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-34",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-34/large",
    "variant_id": "5f608ee8-0455-46d4-9569-5406ac262237",
    "finish": "holo",
    "current_native_label": "スターミー",
    "original_sha256": "ae52e32e8ada189b049efc19fefeab424d385eabacd31fa0dcf1fc3ce340ab1d",
    "metadata_sha256": "5f5f5af4329ab8e09a837d4fd9622caff1868ea85ee5a53aad85a1aa317f1573",
    "body_sha256": "4bbf5d496c85619b1edd033e3705526fa859f224c5270baec643ebc2768bab0a",
    "discrepancies_sha256": "2c51c747de3e5452fccf5395c90318e14a33c4547d4f20293548f50523c618a2",
    "actual_signature_sha256": "e5b90caf6bcd4abd917d5029a58450189a29610e499c5aeac33920da35a6be3e",
    "width": 565,
    "height": 800
  },
  "5ad99007-b298-4e81-aae2-e24280f58a40": {
    "alias": "035",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-35",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-35/large",
    "variant_id": "8b4ad71b-a5bc-4574-8bce-8ce22118f9df",
    "finish": "holo",
    "current_native_label": "ミスレアヴァス",
    "original_sha256": "22e2617f6dcab20fa6dc015f4d58cacca86638f81f89f6639170f45c585a793c",
    "metadata_sha256": "2f3fa753d5f188a630251ba1fcd7c6d48f369ad56887de40c8708e755f351c35",
    "body_sha256": "be31ef225b03abd3ddd8957098146e739104ebc47be4c5e30541eef4069e6b4d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "821c02eb29f5c246442dcd4e52b9475019c3d8b52e0f282fb051a2dccf054530",
    "width": 569,
    "height": 800
  },
  "0b059322-29c9-439e-8d1c-8a5d4ed2bce6": {
    "alias": "036",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-36",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-36/large",
    "variant_id": "626afe18-2c57-4986-ba8b-add8a90c1714",
    "finish": "holo",
    "current_native_label": "セレビ",
    "original_sha256": "2ac9cf4eb5283d0279c7298291839cf32d3eaac4a5d041664c8c69c7b1103111",
    "metadata_sha256": "23c2c6635baeafe0a3ed55537320db0c7a630cc0ce07d02a580f10593bf79609",
    "body_sha256": "e010cdd1d3cf4d5b9e65374c3fd7750385d6dff781013021999ec100a9dd4991",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "c452c99a81522c94e67cfbdd355055266b04fa229b8fe8975be3dd8c8dcf332a",
    "width": 570,
    "height": 799
  },
  "5e09c578-6cc4-486b-9a6c-933ec6f7da73": {
    "alias": "037",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-37",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-37/large",
    "variant_id": "ca4a35ff-30d7-417f-bc36-d2cc061e391c",
    "finish": "normal",
    "current_native_label": "ジオドード",
    "original_sha256": "06b55f8c2316acaa27090aa0d951b385151afd7e34d73fe64f3aa7abe11166c2",
    "metadata_sha256": "c50f103c6f6dc9f18c615508e8bf22d266dadbbf32725469b4c535afdacee7c3",
    "body_sha256": "c966194fca5d5c5d4f2eea832464f7417dd7844716381022f25fe2770752b787",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "99f4f776fda0d349d5096a8cd4b88bb0a280554ea0e470de6c27ff199fb5501b",
    "width": 570,
    "height": 794
  },
  "9db994e0-b210-433b-9d48-8572190de3a5": {
    "alias": "038",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-38",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-38/large",
    "variant_id": "366c1127-5bc4-45ba-8df7-1b5e359a4a1f",
    "finish": "normal",
    "current_native_label": "swinub",
    "original_sha256": "28a3dbf58b42c468105d526db312862761a3b95cb1d457c91b0390c978115f32",
    "metadata_sha256": "bd51387e98b41092bc3ed5c7a608c20bb4dcf097ad952109bcc6228aae19aa07",
    "body_sha256": "5ebe95ec26eb6b7bb30508c16b63ad0ec9199b1607e8f3b5bfdaa9f357e58a7a",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "0aa7187764aa6f2048f28d9b3a047700ebfb936e555b0447e3f7e4048209c2a0",
    "width": 570,
    "height": 799
  },
  "7d2d1775-08f3-4b86-bb3d-539ec312d9e8": {
    "alias": "039",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-39",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-39/large",
    "variant_id": "30170607-3c47-4080-a608-e641f7530f04",
    "finish": "normal",
    "current_native_label": "砂利",
    "original_sha256": "44098484cf418c1c0f60f945dae7edaf883212c0197443e3f9159ee5f1d37b03",
    "metadata_sha256": "4f725a4b1cb73620d8a2b4a77b4fc9cd5f393f14c6554c17eabfaeddbfda90b3",
    "body_sha256": "f31bda8d60113c27bb986b688c415f2aedc9975035230f897c5b33e05074a8ef",
    "discrepancies_sha256": "6c6064e37531be062b776dd69d08dc0aaa40b6feb3169ec4570c993265b19427",
    "actual_signature_sha256": "03fc07f7709201ce8f01d287cb5b279ade7da3dbe6bb01753da5a49e25a59b6f",
    "width": 569,
    "height": 800
  },
  "c07a20c5-1d38-4c13-a2d5-574da1099701": {
    "alias": "040",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-40",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-40/large",
    "variant_id": "163f2abf-4b5d-448a-8052-77089d793aa3",
    "finish": "normal",
    "current_native_label": "シャックル",
    "original_sha256": "4874a14556bcb4bbc1a4742d341601c051ab8b6eb9f48101acae67a72fef07bf",
    "metadata_sha256": "2eeeace2d67fe7352ed8ba851d46350f67b5d385cd347ed5c2330d27bd30be25",
    "body_sha256": "5b27257d4bf1df0ae5422adcfa83fca2d42b69899c5506e40d873c61a2632078",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "b20d811247601d2d679b7a4be63a77295bf09e40b8914f30c9667e47bd1a8681",
    "width": 570,
    "height": 797
  },
  "4a5d0bda-dbc3-4772-ae25-30db1aea4fe6": {
    "alias": "041",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-41",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-41/large",
    "variant_id": "73b5b758-1f14-482b-a2ec-2c23b9510070",
    "finish": "normal",
    "current_native_label": "ピロスワイン",
    "original_sha256": "bc6a43b7a8e0e385844d3eff5f8d3e71915cef60330bc8352a9320c1412192ce",
    "metadata_sha256": "d83d32b5b10622900792215bc2e3e95fda976c5c258ebdff076643f0b1b8a0e7",
    "body_sha256": "7cd3b5ab6872f997bc4c017f5aa129d279e96f82845f6c6dec2d468810c611ae",
    "discrepancies_sha256": "a00e8fd433d6f378012822e906d9b5b51524f76a70afc4c922d6bf72cfb47451",
    "actual_signature_sha256": "6b326af78901fe9eda33b2738547f6493db5238274b5038806aec11030ae9ad9",
    "width": 570,
    "height": 797
  },
  "d3fafe2c-e2d4-44a2-b4fe-0c3bc806a675": {
    "alias": "042",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-42",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-42/large",
    "variant_id": "dfaf5212-d767-4763-a795-660aa8f11804",
    "finish": "holo",
    "current_native_label": "アエロダクチル",
    "original_sha256": "ba88b6a64f321327a7765369305f0af51efb6716fc1f6e1f464e993abe15f68a",
    "metadata_sha256": "f3f8bfeca8af88c496e9c90c1d8a0b6619b9bb58db13252201ae51f9779c8c6b",
    "body_sha256": "6c41751095e55102622bb741f3cedc9d198019a878311a35b8d2d8efcd2c7111",
    "discrepancies_sha256": "b8dcbc855bc12e1c4128aea2f168c518d53b70dc8cd0f44498a21baff5f6e077",
    "actual_signature_sha256": "75f89bec8a152fcc1f21ea7367038ad83737171f8b3e98c4cfb2bce7ec2d32d1",
    "width": 570,
    "height": 797
  },
  "d5dfdea5-b83c-4ad5-85ed-a01b205601b2": {
    "alias": "043",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-43",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-43/large",
    "variant_id": "59b0de97-5652-4372-9258-0e2cfbbc2f65",
    "finish": "normal",
    "current_native_label": "マークロウ",
    "original_sha256": "450aef20662534fe8d4e8ad343815d597040d212dd71b0446ccbc326ccbfbde8",
    "metadata_sha256": "6aea09ee75e80cf4a37479cf54c3f28025efc51d4c82869908e4103b02b1338d",
    "body_sha256": "db764476521cc3dd5842e7642b71dc7c9ca74244f9fa67c0583df5166f9ed028",
    "discrepancies_sha256": "1f3e09b457040b6899a3ce1201dd0c2c5d607b00dcf60f575267cb8af1bbd0b3",
    "actual_signature_sha256": "32f4625707e49cc9532072e81d15c03ea36c36c4bbe1542af85432e7483790a5",
    "width": 570,
    "height": 799
  },
  "18389dc6-f894-4662-a30b-f00c1cd0813a": {
    "alias": "044",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-44",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-44/large",
    "variant_id": "ac74bcac-d269-42e2-89b4-6b0492c9d654",
    "finish": "holo",
    "current_native_label": "猟犬",
    "original_sha256": "b9c0ddc82e11785f41a933211b5c6784658506eb7b0cc764cfa10c6492d0b23e",
    "metadata_sha256": "222fe554987e15ae54f6862f8a499bbb7e323f61686073a97eee12439bd26e2b",
    "body_sha256": "d3004ed4c57fbab9df3e0831e45169fb70ac30b2c88e4cf08c0b84c5f19d0dc9",
    "discrepancies_sha256": "c6b2db2be4ee489b22dda007045e6a1e6f2b36e2e7efc268029bd571d0d7e99b",
    "actual_signature_sha256": "30b42d9ab9ebdac7ddd94f2c3008432b6ba0a04dec3e85a4069371a2a301b236",
    "width": 565,
    "height": 800
  },
  "20f5c456-69f3-40ff-812e-bf3bd8904bdc": {
    "alias": "045",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-45",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-45/large",
    "variant_id": "27754172-2f63-4bbb-848c-f0a5025150a5",
    "finish": "holo",
    "current_native_label": "マグネトン",
    "original_sha256": "415aef558e8a0fe4a4c4e743d7d09f286a55e2dc46a55f2813483c1d7e807d8d",
    "metadata_sha256": "d00167d7fea894053b041787d0814b85808d22ce3d26026c4695156b42aa77f8",
    "body_sha256": "51ec09b4678fdd801db8eccd8b44ee83809f41de4c9ec6dcff86e2553d06eb40",
    "discrepancies_sha256": "bbf1fe4164438f0ce906cfad746c85af12e02e0085bacb49781b32da937934aa",
    "actual_signature_sha256": "52ad0dbfa20042b6884d748d284ed7aa9da5efab32514b74742b3e3ed504b67a",
    "width": 570,
    "height": 794
  },
  "5fdeb038-749b-4d43-9b95-85a04ddec5e3": {
    "alias": "046",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-46",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-46/large",
    "variant_id": "92bf95c4-88b1-47b5-9ef2-3d7092bd08ce",
    "finish": "normal",
    "current_native_label": "Farfetch'd",
    "original_sha256": "8b768348e4157196f6232eda3bf0ccbc0b1415306b5c4fb9caf9df859465ec04",
    "metadata_sha256": "46cad1f6fb32518615fc92e85bfa3e8ec77c3012a3d2c506d25e7e8e010c2e0b",
    "body_sha256": "fc915e532b05776c88e233623821cda5dd4bb87133f6a554f62c11fc8d0afa74",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "cc4eef11419fe3a3044759bc6909b4e0250867fbb60ba9d0da56429b5545ff37",
    "width": 567,
    "height": 800
  },
  "492aea4a-d714-4aea-ace5-079b0d77541d": {
    "alias": "047",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-47",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-47/large",
    "variant_id": "2495b5ae-f620-467a-bffd-0059dde5bc66",
    "finish": "normal",
    "current_native_label": "aipom",
    "original_sha256": "067829ff8888f5d338b69b7a7ceefafb47d14b6be4f5168a9dd26a486466f7ad",
    "metadata_sha256": "a42e6a85ec17549d94dd0bb2ae18bdfc8a1c4055f42feb471f83a9e6d5613fcd",
    "body_sha256": "3d5221d5d12f24861e236b6d277a1db569ab5addc3b09269e16913cbdceedfed",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "0cc43ebaa6972a278f34d2c4ab49c4a365faf1874599eae0ef5cf1aa4a709052",
    "width": 570,
    "height": 794
  },
  "882253f3-1777-43b7-b00a-0fb8cca837ab": {
    "alias": "048",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-48",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-48/large",
    "variant_id": "241c6941-6d0b-41b5-bb70-b2335fbbbb37",
    "finish": "normal",
    "current_native_label": "Snubbull",
    "original_sha256": "6af6662e56ac22ff478abcab7405bd9e43860aef20487b8d9068f7851782cfd6",
    "metadata_sha256": "4b33e8c80bcc3b91acb2f176ff9b17f089c25dd05dfe170e90c08315e38b1f6d",
    "body_sha256": "ca84409673437cb1c7a3797be47389658345aca946c19ee3a41a60b22b5b7fbf",
    "discrepancies_sha256": "f3c81f372e6b4ea5fe8ec8116206bd7dc2f6ef9bfeccfe61f70835fc1042867e",
    "actual_signature_sha256": "ebe4d4e9b2dfef0740627f9cbcbd506550e4df52b20c5d686f5f9df26842463b",
    "width": 570,
    "height": 797
  },
  "ea322429-4ce0-4952-9d05-a1843672ca23": {
    "alias": "049",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-49",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-49/large",
    "variant_id": "d9d128e8-bfdc-4f65-8566-c63a4f67cbbb",
    "finish": "normal",
    "current_native_label": "スタントラー",
    "original_sha256": "730948a61face200e58848052d86513c5e72098844f6979585d45689bf9a10e4",
    "metadata_sha256": "9d08eb0749a639596d0595200ae9470b9ffbc149757757898ab81ec8d998923c",
    "body_sha256": "235d0a6385e0b4475d815e911bbbec13dda96c232beb30d33a5fa59a7bfdade9",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "446af56f66a84b2f11b61243c325460f69a631916ac9ab0b1a87a32b7b312c11",
    "width": 569,
    "height": 800
  },
  "8ca14b05-cb7d-4c0a-a8dc-0ec279be5969": {
    "alias": "050",
    "batch_id": "JP-CARDS-011",
    "provider": "neo3_ja-50",
    "image_url": "https://images.scrydex.com/pokemon/neo3_ja-50/large",
    "variant_id": "f0ad6c7e-1f40-4975-a2cf-b5447ddf64c8",
    "finish": "holo",
    "current_native_label": "Delibird",
    "original_sha256": "775b6b8e27bb0f3a38d707256fda2ccf834d417d663d964b26acb10288fc4485",
    "metadata_sha256": "26a47de144bc571368c645d6d20e394e2500c6698a04fd4dbe5ae19807301418",
    "body_sha256": "10cd989b04b40eb5fdb602f02a8286791c213458b1ca89d047b607bcb504871d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "8d46aec204e4857c37b8832c9f96bee4b5f6c9c575f6bd55f901c60d649610c5",
    "width": 570,
    "height": 797
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-010",
    "JP-CARDS-011"
  ],
  "saved_batch_tasks": 50,
  "eligible_fronts": 48,
  "by_batch": {
    "JP-CARDS-010": {
      "verified": 23,
      "held": 2
    },
    "JP-CARDS-011": {
      "verified": 25,
      "held": 0
    }
  },
  "excluded_aliases": [
    "022",
    "023"
  ],
  "excluded": [
    {
      "batchId": "JP-CARDS-010",
      "itemId": "card:6ae241f2-dd9d-4dfa-8702-33c7943eb8bb",
      "printingId": "6ae241f2-dd9d-4dfa-8702-33c7943eb8bb",
      "variantId": "28a38922-e670-44f2-9411-57851dd0440a",
      "canonicalCollectorAlias": "022",
      "currentNativeName": "輝くマジカルプ",
      "sourceNativeName": "ひかるコイキング",
      "currentFinish": "normal",
      "sourceVariants": [
        "holofoil"
      ],
      "reason": "Source/current finish conflict remains; no original requested.",
      "imageRequests": 0
    },
    {
      "batchId": "JP-CARDS-010",
      "itemId": "card:cb25e9b7-2a2b-4c36-93c4-cd12d27b4371",
      "printingId": "cb25e9b7-2a2b-4c36-93c4-cd12d27b4371",
      "variantId": "d38b8000-2f44-419a-9405-0c81d2543e3f",
      "canonicalCollectorAlias": "023",
      "currentNativeName": "輝くギャラドス",
      "sourceNativeName": "ひかるギャラドス",
      "currentFinish": "normal",
      "sourceVariants": [
        "holofoil"
      ],
      "reason": "Source/current finish conflict remains; no original requested.",
      "imageRequests": 0
    }
  ],
  "outside_fixed_cohort": [
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:6ad6da5c-02cb-45e1-ab7a-2de25855dbf4",
      "printingId": "6ad6da5c-02cb-45e1-ab7a-2de25855dbf4",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "051",
      "currentNativeName": "Porygon2",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:ab2c259c-353a-4317-b075-83f28a24fab2",
      "printingId": "ab2c259c-353a-4317-b075-83f28a24fab2",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "052",
      "currentNativeName": "ブリッシー",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:ecd63564-d5d4-402d-b28d-95011e2a9107",
      "printingId": "ecd63564-d5d4-402d-b28d-95011e2a9107",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "053",
      "currentNativeName": "古い棒",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:f03f92e7-086a-4ec9-8281-e3c88906d13d",
      "printingId": "f03f92e7-086a-4ec9-8281-e3c88906d13d",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "054",
      "currentNativeName": "ヒーリングフィールド",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:05ec5ae6-bfb8-41b1-a65b-acb7ce4c3585",
      "printingId": "05ec5ae6-bfb8-41b1-a65b-acb7ce4c3585",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "055",
      "currentNativeName": "バルーンベリー",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:6196aadb-f7bc-4449-8fd3-254987e292f8",
      "printingId": "6196aadb-f7bc-4449-8fd3-254987e292f8",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "056",
      "currentNativeName": "ポケモンブリーダーフィールド",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    },
    {
      "batchId": "JP-CARDS-012",
      "itemId": "card:56fc9f48-441c-40da-b1a7-29fdbd5300c4",
      "printingId": "56fc9f48-441c-40da-b1a7-29fdbd5300c4",
      "setId": "a15481a7-410b-4a98-8695-3bba0db9d226",
      "setCode": "neo3",
      "languageCode": "ja",
      "canonicalCollectorAlias": "057",
      "currentNativeName": "ロケットの隠れ家",
      "reason": "Outside the bounded 50-card metadata cohort. No card detail or image request made for this row."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Awakening printing');
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
  const evidence = row.evidence;
  const body = evidence.source_body;
  const pixels = body.actual_pixel_observations;
  const source = body.source_signature;
  check(evidence.source_metadata_sha256 === known.metadata_sha256 && row.objects[0].sha256 === known.original_sha256 && digest(Buffer.from(JSON.stringify(body))) === known.body_sha256, 'Pinned per-printing original/source/body guard changed');
  check(body.generic_other_rows_may_relax === false && body.effects_are_observed_paraphrases === true && body.literal_full_body_transcription_claimed === false, 'Actual body and provider text distinctions changed');
  check(body.actual_pixel_signature_sha256 === known.actual_signature_sha256 && body.provider_metadata.rawSha256 === known.metadata_sha256 && digest(Buffer.from(JSON.stringify(body.provider_metadata_discrepancies))) === known.discrepancies_sha256, 'Exact source/pixel discrepancy witness changed');
  check(source.sourceCardId === row.provider_id && source.nativeName && pixels.actualLanguageCode === 'ja' && pixels.printedDexNotCanonicalCollectorAlias === true && Number(source.hp) === pixels.hpObserved && isDeepStrictEqual(source.nationalDex, [pixels.printedNationalDexNumberObserved]), 'Actual source HP/Dex/language identity changed');
  check(isDeepStrictEqual(pixels.attackCostsObserved, source.orderedAttacks.map(attack => attack.normalisedCosts)) && isDeepStrictEqual(pixels.attackDamageObserved, source.orderedAttacks.map(attack => attack.printedDamageCandidate ?? null)), 'Actual ordered attack cost/damage changed');
  const controls = body.queue_controls;
  check(controls.identity_controls.canonical_alias === row.collector_number && controls.identity_controls.verified_printed_native_name === pixels.printedJapaneseNameObserved && controls.identity_controls.current_native_label === row.card_native_name && controls.identity_controls.canonical_alias_is_not_printed_national_dex === true && controls.source_qa.original_sha256 === known.original_sha256 && controls.source_qa.source_metadata_sha256 === known.metadata_sha256 && controls.source_qa.actual_pixel_signature_sha256 === known.actual_signature_sha256, 'Top-level JA queue control projection changed');
  if (known.alias === '011') check(pixels.artistObserved === null && pixels.artistReadCertain === false && source.artist === 'Kimiya Masago' && body.append_only_credit_clarification.printedArtistText === null, 'Ho-oh observed artist must remain optically uncertain');
  if (known.alias === '034') check(pixels.artistObserved === 'Keita Komatsuya / CR CG gangs', 'Complete Starmie artist credit required');
  if (known.alias === '045') check(pixels.artistObserved === '"Big Mama" Tagawa / CR CG gangs', 'Complete Magneton artist credit required');
  for (const key of ['copyrightOrDateLineVisible', 'copyrightYearInferred', 'editionStampVisible', 'editionOrDistributionCertified', 'materialFoilFinishCertified', 'actualSourcePixelsGeneratedOrUpscaled']) check(pixels[key] === false, `Unsupported physical/copyright claim: ${key}`);
  const support = body.source_variant_support;
  check(support.currentFinishCode === known.finish && support.currentVariantCode === known.finish && isDeepStrictEqual(support.sourceVariantNames, [known.finish === 'normal' ? 'normal' : 'holofoil']) && support.supportsCurrentMetadataVariant === true && support.physicalFinishVerified === false, 'Provider finish label is not physical certification');
  check(evidence.artwork_scope === 'printing_front' && evidence.source_kind === 'third_party_original' && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false && evidence.owner_business_decision.kind === DECISION && evidence.owner_business_decision.source_wide_approval === false && evidence.owner_business_decision.human_review_required === false, 'Exact finite source decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === 'neo3' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.source_code === 'scrydex' && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === 'image/webp' && object.file === `objects/${object.sha256}/${object.role}.webp`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 192, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 48, variants: 48, names: 96, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 33 && cards.filter(card => card.finish_code === 'holo').length === 15, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Awakening plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 196 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 48, 'Exact accepted Awakening archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 144, object_references: 192, unique_image_members: 192, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
