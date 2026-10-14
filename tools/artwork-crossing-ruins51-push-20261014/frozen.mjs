import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '5da9df04d1266be2a6b333a4e5d0b1e3192765f442f5a684bdfc295976e5850b';
export const APPROVAL_SHA = 'fb6069d84d3efef5817c8cd53fa436f7cdffcc66c937f03c0db5ed9211f38f52';
export const IDENTITY_TABLE_SHA = '82717270c28ec82df57d7ef9d39937e2893db6c96341b4e388389b8acb5c5570';
export const SAVED_TARGETS_SHA = '2ef3131174e1f5188d4bdf998c666950345f9ffba1402d2fda5393a94dbf7055';
export const SOURCE_MANIFEST_SHA = '5e800bd7427f4d654ca7912423d167a8ac0c86a23a7723aa663d8e398e38ae18';
export const ARCHIVE_SHA = '2bbfdde7b2cb5c7619bf272b24ec6cc3b90af1c4d24abb6cd405c98c18adc492';
export const ARCHIVE_ID = 641543488;
export const ARCHIVE_BYTES = 27170559;
export const FRONTS = 51;
export const QUEUE_ID = 'STACKR-JA-CROSSING-RUINS-20261014-051';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'e60f305b-5ad6-4964-b6c6-636788481ca5';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  handoff: 'f7610d61a4c2ccdeab8cba87cacd2eaca7edbe350e94c2e576228cc5a0a45ada',
  subset: '05c0f6681346d6b316958f30772b53c63f7fb7f167556b808a068e01854aeb22',
  validation: '2801854f21f2df027be70137f4e2bab4f631bcaa4c8b9d4ebc000558826d8ffc',
  decision: '9bff75f8339e88b45eb9b590484b4f8d876f72e355dd4293660f57684ddc47c0',
  unownApproval: 'd1bcbe07659f0e0b71ac79d91a84cdf547dece34b4f558b7bf99c33455fd7a99',
  unownReceipt: '0820a366b34ae46c9667e98230651f29a7be10740f44a7e2b4299b7a15cf7153',
  sourceChecksums: 'bab53e7c0e4dda55762b9fc60f57b146e411591d097c513f0fc8cd1f63e78ba8',
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
const exceptionAliases = ['015', '019', '025', '026', '027', '033', '036', '043', '045', '050'];
const energy = { '無': 'Colorless', '草': 'Grass', '炎': 'Fire', '水': 'Water', '雷': 'Lightning', '闘': 'Fighting', '超': 'Psychic', '悪': 'Darkness', '鋼': 'Metal' };
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "fc4df2af-fed5-4b97-bfad-13ff167bd154": {
    "alias": "001",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-1",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-1/large",
    "variant_id": "d4ca910d-3599-422a-880f-bab98b794818",
    "finish": "normal",
    "current_native_label": "キャタピー",
    "original_sha256": "d87615be5e70d9812e5f68c57a078d8477d61f2ec70c4a582cc47ef0e7ee6ef3",
    "metadata_sha256": "b3baa0374fdab500b6c6a37982444aa82077d9f276f8a4c65b9f404fcf741b53",
    "body_sha256": "8b502647b079cfc3386385e3e42ec323937e12edcd66c1154598cbf74c88c6f3",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "1e14d2c7-7819-4064-897b-0f62fb350e3b": {
    "alias": "002",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-2",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-2/large",
    "variant_id": "5498dbf1-2dc6-49a1-8bd8-ee421b1f28ac",
    "finish": "normal",
    "current_native_label": "雑草",
    "original_sha256": "61b472b800007786a055d33ab0bfcdd8bbaed31ef44802d6b59669c7a9f7ab06",
    "metadata_sha256": "b9fff6728525573cc5044180101a3a00467cecd94fb1ae7a7a9de69ea1add920",
    "body_sha256": "667c7c4a6cc4880d604dd1d99dbe85c35fae4a5f044cfed2765db0fb46258481",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 569,
    "height": 800
  },
  "5d38d13b-42e9-4180-baae-0820293248ac": {
    "alias": "003",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-3",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-3/large",
    "variant_id": "8ece48df-4c9f-410e-9c93-bb510cdc50aa",
    "finish": "normal",
    "current_native_label": "スパラク",
    "original_sha256": "1d2fbc13db3f3c14df057903c918978d18c24a567d971cdea3d44fcdc6f80c85",
    "metadata_sha256": "79e7826db47a777e33b5ffc888fd765e6fafdf87d24baa6a984f7e22807203da",
    "body_sha256": "7e7c41ea581ae51649d95c51e3b0a9e692a292175755bdc4c63b77fb1006d2eb",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "990dc300-7c8b-4bfd-9f72-12f0f4274fa9": {
    "alias": "004",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-4",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-4/large",
    "variant_id": "e90fb494-be2e-4ff6-800b-344cd52be70f",
    "finish": "normal",
    "current_native_label": "ホッピップ",
    "original_sha256": "873098fe9affcbf33ebfcd2f14c7ceeb97e2467205e732c95f38c828a07c56ff",
    "metadata_sha256": "5ce05d492a26285a9f2b2402172c8adb3ce65d16b367651fecf122138750e214",
    "body_sha256": "76c93c4724fe1429ddddce8c9211eca9638b4f247ff9053341c7b9e550e7814d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "354e211b-2ad0-4aeb-95e0-8d7fa9086239": {
    "alias": "005",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-5",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-5/large",
    "variant_id": "8ca66093-c03e-4ed2-92f5-ba3ab40c9507",
    "finish": "normal",
    "current_native_label": "Pineco",
    "original_sha256": "ec3970eae8177c264cc2390a6a8aa17b99da3efc89c738f737a8850b2d1e088b",
    "metadata_sha256": "e241cb9d3f5f06a7219330cc806c0972c24252628ee83fe086bffdd8cd2e717c",
    "body_sha256": "654084b13f3e5dd021b94b5ac5d9d47e306f1150be5b4c256262d80ffe6a0af5",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "038763cc-48e4-41ef-94ab-af34bd319894": {
    "alias": "006",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-6",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-6/large",
    "variant_id": "74283318-91d6-4b25-9888-78bf2e3930ae",
    "finish": "normal",
    "current_native_label": "メタポッド",
    "original_sha256": "60cf7a20db7e5efa739b2b84f9ddf57d27977abad0ba23be95b9d261e3a06848",
    "metadata_sha256": "21a7005990ed1ab42d06879eff9214a450ff854a1674e7b560bd45dd60a7f5f3",
    "body_sha256": "41cd84d454799cd3447ef3c22fdce200f4105f9f9e2e1150fe1bd3ba863ed52c",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "c2840ce2-20a7-40a5-82f3-7c920b35be46": {
    "alias": "007",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-7",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-7/large",
    "variant_id": "4b3538c0-8ce2-4786-b9a2-06c22c788948",
    "finish": "normal",
    "current_native_label": "カクナ",
    "original_sha256": "40b0ee5852739e442176521ecff3b7e281980991a35dab1d67d7300b869dc5f1",
    "metadata_sha256": "2436de64593c495b920f7615d6da1f5b341431f5b971b48149cebc2a8fa68ad8",
    "body_sha256": "24750dbf224a8f077fcd0230ad6a5b9be16b5f2b286a9b7bf4d6da6422069828",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "ebe6c1a3-681f-4661-9551-903415759b31": {
    "alias": "008",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-8",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-8/large",
    "variant_id": "21545e92-a15f-4561-bd8f-a48570074867",
    "finish": "normal",
    "current_native_label": "スキスター",
    "original_sha256": "72c6449fa10ec45673b25fb6099f282d6725309c410a58f294ed0c2951335215",
    "metadata_sha256": "8c015d0027f8964b9316a5e8fbbc4f9001c8d9c88f38ad11974dde0646d48e79",
    "body_sha256": "59bca62daa2a9760c4c27fa82df537f203dab3513ef6775bf118735fe155f595",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "25f09164-7dba-4a9c-a767-03479335194f": {
    "alias": "009",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-9",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-9/large",
    "variant_id": "673d9b78-caf0-42b5-b6cc-606a66c2ec02",
    "finish": "holo",
    "current_native_label": "蝶",
    "original_sha256": "18bfe787dd30b947459bb90e836dc245c3a4031e386ac476258beb2bd90d7c41",
    "metadata_sha256": "411392cfc23c8f8c2ca46e32dd3112f8e69ac1aa60bb01f3c30219fd4d7a2a65",
    "body_sha256": "e903cc8a4a7719cd15a5684aa76d5f347cc51afc5c02608b2367344c245b8916",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 565,
    "height": 800
  },
  "6e7b886f-24ef-4108-b378-814f849080e6": {
    "alias": "010",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-10",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-10/large",
    "variant_id": "81e84f48-6f51-421f-8276-764b7529bc39",
    "finish": "holo",
    "current_native_label": "beedrill",
    "original_sha256": "5486ffbe02142a2e54330ac6c4ffb51a9a6e72440d015fafa81b69b080fdba25",
    "metadata_sha256": "0c91c745ac98457f582e11819255dc5525808ad97e53e8c9fbc1b618be2ee099",
    "body_sha256": "ba65d69739b81472058e06ce3a11b3dc62f2fd5e04030208c245672d739ce502",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "250257b7-f357-4cf5-8241-792bfda49dac": {
    "alias": "011",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-11",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-11/large",
    "variant_id": "7db2a955-f93d-4123-acaa-598f0078a7f7",
    "finish": "holo",
    "current_native_label": "ヤンマ",
    "original_sha256": "081ebdda2205a85503f3eec4993c55d4e8527b4315b334e12cd510b2b1122891",
    "metadata_sha256": "6712e39b220d0965c8de294ba2481c0d23034bbae875a1930e26c55f8935dbb1",
    "body_sha256": "f8c94c892a674f7c3c57fabf115ad98d05028c06c79854a1b420ec06198b497f",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "3fadaafb-3c84-42bd-901a-ba61f3facca7": {
    "alias": "012",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-12",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-12/large",
    "variant_id": "c81433cd-84cc-4a9e-97b0-94f02b405532",
    "finish": "holo",
    "current_native_label": "ハウンドア（HR）",
    "original_sha256": "5dd50336f6310d7d1f24e844d76103fb9e0ccecf4abfe561362df437cc59b666",
    "metadata_sha256": "45d61df74ce3f0ef3fd399573fdca1e6bf1f55857e118c5d57de870b72acbbdf",
    "body_sha256": "cbde3b40707bf55b19451bdbb7e8331c5c7adaf07e3fb43010a12f2fa50427b6",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "49fee76b-7182-48f4-ac57-185461d9fd16": {
    "alias": "013",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-13",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-13/large",
    "variant_id": "63dfeb31-cd54-4324-ae33-0c420e905402",
    "finish": "normal",
    "current_native_label": "poliwag",
    "original_sha256": "b3ebc2efa269c99bfa28cf97c23bc5a945a654ed9854cbd6822d19c93bfdbcf8",
    "metadata_sha256": "e1c2933b0ca8e7bdd9da65cdb4bd2efc58ad1365da6ae6bb071a0dc47a52e17e",
    "body_sha256": "81f3bb0a3002dc44e104578c4b98daf128d884c12f7966f5f3ffca8f536577e9",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "31f74a77-9c1e-4f72-8cc8-d5a664e6b064": {
    "alias": "014",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-14",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-14/large",
    "variant_id": "a52df307-ee2b-46c4-bb6b-e64e03a1d475",
    "finish": "normal",
    "current_native_label": "カブト",
    "original_sha256": "88bdc3d8704cb750876e3ffa8a88300280f94aa1d0853b1348c724c1f5d9788e",
    "metadata_sha256": "a678255e401705fe435c8cceacf9989a056f64490a1a55f2e72d0261b6bc5734",
    "body_sha256": "2613cd8af321e71d52d3334937258511f3df5d1116c3384c5be5cbe796f93b5a",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 565,
    "height": 800
  },
  "30ea0f4d-2882-4b10-af78-48afdf58242c": {
    "alias": "015",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-15",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-15/large",
    "variant_id": "34a4cc0a-2cd9-4015-85a3-2e6747ce2e50",
    "finish": "normal",
    "current_native_label": "ウーパー",
    "original_sha256": "d17741e4839286b3c141fb1f23bcf9a2636d6af4b6aa51bd57d4dc24463eb18b",
    "metadata_sha256": "abf70f7a2fba4cdd0a811d1f532ce2bcc4d8ef1719c1f7b771f16d16fe2cb0bc",
    "body_sha256": "c2f29fda50b437869c00611c66b8d4b6b50ca5cd8844c3ea33743f603274919a",
    "discrepancies_sha256": "a54049021a192cd65752672280c4a6013a5e9339912d3aa52a7f54e8a6473c1c",
    "width": 570,
    "height": 797
  },
  "ce5c75d3-c6b5-41c3-86f2-f9cd7f095605": {
    "alias": "016",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-16",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-16/large",
    "variant_id": "ad53a5e7-bb82-461c-a755-8d00d2b4e92a",
    "finish": "normal",
    "current_native_label": "PoliWhirl",
    "original_sha256": "562ed536ab899085275aab1ade35c8291d4a2cbc7420ce7f5a1af791c9a89a49",
    "metadata_sha256": "454125fc2795be784067f4d8f7b1aabf2ffbda708a18eb1dbcc7da76c8a30621",
    "body_sha256": "20257b47ab75b2f2eedb4c6a333147ce2b3d990dfaf50b407c15ca3a6fad8c77",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 565,
    "height": 800
  },
  "caa50bee-ef23-4f59-bd02-b15f9cf4607c": {
    "alias": "017",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-17",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-17/large",
    "variant_id": "cb352fd5-b7fd-410f-9eb4-24d72ec4da1a",
    "finish": "normal",
    "current_native_label": "コルサラ",
    "original_sha256": "826dca9532659d03ae1e53dc699f1087951fc52dde91d2960eb6d08fbcb23b18",
    "metadata_sha256": "98961483442b9addced18b7d44764a05957e317b3f480226547593816cb1892f",
    "body_sha256": "cc06e91f55c1241de760e818117c633a89e67f146b1dd6a126634e8cf466a20b",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "542ffda6-fdca-4064-afc5-264d916b36ab": {
    "alias": "018",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-18",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-18/large",
    "variant_id": "c36d296f-e28e-4d6c-b78f-609003ad9222",
    "finish": "holo",
    "current_native_label": "カブトップス",
    "original_sha256": "a8f5c12de5ec6ec71673638cf68fff79cd2623359a16a7873e9c89f9167f315c",
    "metadata_sha256": "385542db570711a3459cb06a30c7c0fd15af1327740e34d7f185c794d40b9255",
    "body_sha256": "8404a15d28af4e51a26f199a41be70902018904baa0df742d18ca576ab4cbeb6",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 569,
    "height": 800
  },
  "aa5b2de7-83a0-4e51-9614-99a2ba59ec10": {
    "alias": "019",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-19",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-19/large",
    "variant_id": "85de8d1a-2e42-4032-a83b-deea694a0595",
    "finish": "holo",
    "current_native_label": "政治",
    "original_sha256": "90ae1729f3a68e0ccaf11ad9a85193d250ca02b1a0aa90055a0a2619fcf81d1f",
    "metadata_sha256": "c2c5e716b37a58998594a1f215ea664401d262aafb438796b7dff3a6404d9719",
    "body_sha256": "5bc43fd88d582325132bc83dc37fdb5e900f20b627fcf6ef8c0cb275379057a7",
    "discrepancies_sha256": "792f0806aa71ae08ddf7cdb8da308922be9413596bf5510d5dbb230aa609adf2",
    "width": 570,
    "height": 797
  },
  "fe81c808-6f32-4711-8487-8df4dc810493": {
    "alias": "020",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-20",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-20/large",
    "variant_id": "5ba8c677-d40d-404a-9563-5e9df531d62c",
    "finish": "normal",
    "current_native_label": "Mareep",
    "original_sha256": "57c6ad608105a851205b020d33e20e74805e233175ca10836dd2757cc8c0adc7",
    "metadata_sha256": "c5fa367313f57b3f27ee21c80373f48c7531220c5eec6c6c8578721f24157090",
    "body_sha256": "9fe6c8ad28ada0903d53c22b5317768ec0c0381152fb3f5efac8aa21dd299f4a",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 567,
    "height": 800
  },
  "287b6354-0064-462e-8caf-558a820344b0": {
    "alias": "021",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-21",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-21/large",
    "variant_id": "77264bd3-0f35-477a-86e5-f607be03aeb2",
    "finish": "holo",
    "current_native_label": "ダークライチュ",
    "original_sha256": "3ddf9e4b1de364d1fbe81704afdad42097a34e574be2006240935d253d2c8616",
    "metadata_sha256": "32c99a705667f6194d236eba2c5f46394cbeeade4043d660b30ce97760002087",
    "body_sha256": "c5e9c03b06c24a8972ce436921326d2f3d3071d833caaa300ae6d3ad52155c4c",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 567,
    "height": 800
  },
  "8720d2ac-f3fb-49dc-b99e-4eaf2cd7ad2d": {
    "alias": "022",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-22",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-22/large",
    "variant_id": "3fab6d84-e476-409f-8355-4c592ec7d015",
    "finish": "normal",
    "current_native_label": "natu",
    "original_sha256": "b0f4a04bd1ccf59d29ef7d76a24f99605b70836ae021b23c4b0fa0681b47cc58",
    "metadata_sha256": "6e47105a93198ff206a3a22416e8652005a8a7a900245bd0ca3c1b398f9d115c",
    "body_sha256": "38c65d918415f46702453abd948b5fa6e5373b3347fa26820db297f16b72ab8f",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "b2b26601-b13d-435a-aeab-c6f4c0549496": {
    "alias": "023",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-23",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-23/large",
    "variant_id": "bb87b7fb-9bdc-490c-93bf-6892f52fb590",
    "finish": "normal",
    "current_native_label": "未作外",
    "original_sha256": "569b7753651cc06ff1aa34cc16e22b55253c6a48e4e80cc99da9bf43701694cc",
    "metadata_sha256": "318f4568794ca30aaee5169a1157549e6662dac44302b36ce4c3e98e0a7980f4",
    "body_sha256": "f4a4293a44a7d505667d3a7b61e316b3d6f2bf3c11f983ddfb8b22cd89b0f65f",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 569,
    "height": 800
  },
  "a9ddee59-458a-4c58-8d05-76ffe611ae11": {
    "alias": "024",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-24",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-24/large",
    "variant_id": "5980370e-3311-4c3c-bc37-0bd6fe2ab6c9",
    "finish": "normal",
    "current_native_label": "xatu",
    "original_sha256": "d30ab0a83aa67427b719da3422c26a96605995fc762f016d058e06af1c7f4989",
    "metadata_sha256": "6aa0ba705be1a7c196d96686f4bb901ef06217fcf20be75070f0fd71af411433",
    "body_sha256": "a2057c2a5cc0e2e2c89e1fcad3b4fc62d5a65bdeb17cc2da1cbd306fb098b65a",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "1a4c65a1-c904-4710-808c-2723f2762a01": {
    "alias": "025",
    "batch_id": "JP-CARDS-007",
    "provider": "neo2_ja-25",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-25/large",
    "variant_id": "952da613-fe77-45c7-a7d8-0d67f36e628d",
    "finish": "normal",
    "current_native_label": "d",
    "original_sha256": "21943471e730d28eba4c5ab8c0c9bdb5d8abde7214fdb20a866fb35ee8ccb830",
    "metadata_sha256": "0bb4baa14d9271e77adf5eb24cfdab55c26589f379745649d56200eff0860a52",
    "body_sha256": "b540222d8d7c02e51b8c93a5e01a4a84eb5d795411a91b7946530241166b6d69",
    "discrepancies_sha256": "326e2ab841933bde89b93b842ada11ae057b726e0277b1cef0c05da47efdcc65",
    "width": 558,
    "height": 800
  },
  "35275d82-364f-46d4-8c91-e66867d9f1d2": {
    "alias": "026",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-26",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-26/large",
    "variant_id": "7769d736-4c79-467f-8739-5aa221542b86",
    "finish": "normal",
    "current_native_label": "f",
    "original_sha256": "6900f050b2d8b3af4e624087262dfe5e6bebd67684888806eb8d2df98605d6c1",
    "metadata_sha256": "c3be8733370a8f0f2006aa1419303ebde51370ce75e54b96638871d00b26aa91",
    "body_sha256": "acbbdd6edb80e3463670e688243da92bf79a8535f7a3b09949cecd2e4e1965d2",
    "discrepancies_sha256": "658cbb0927a14bd01a440632884ce5b588a03b99a4067709b46bd7cca7d357cc",
    "width": 570,
    "height": 799
  },
  "205d0c2b-1eec-4d3c-92f2-2414f7951c04": {
    "alias": "027",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-27",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-27/large",
    "variant_id": "0ebc49d9-fdfd-4b49-bf7f-c7c742708c03",
    "finish": "normal",
    "current_native_label": "未定のm",
    "original_sha256": "77959acb3602b6e6effb71dc1366cd775b09e71d1c8778471026fd22dbc77963",
    "metadata_sha256": "c1db2047b1a870f3b6585a8ce0e05881f3da4c109f84d2506731c93e35282262",
    "body_sha256": "497cf05773e962044f89de4c3196d747195503f67119ebb664ecc4c3fe9b6690",
    "discrepancies_sha256": "639d3ae2406cbebbe3817d2d5989eed08a2243c7aea05e4199edf0d4533555e1",
    "width": 570,
    "height": 799
  },
  "f6036b5e-ff0d-4458-b079-f7b498043d88": {
    "alias": "028",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-28",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-28/large",
    "variant_id": "45a5e60a-95f7-470e-a7f5-0acc86276a7a",
    "finish": "normal",
    "current_native_label": "Unown u",
    "original_sha256": "a9c98c6fcae2c214200b2ea6b2aca75e84799b8abb9732ca4cd9c5d715daaa0f",
    "metadata_sha256": "9f66890e96c18579c2a246900b1b69686ec4e212278643b8a752c5a89d503021",
    "body_sha256": "34f8ad81a3fdaf3131c5355d5b77077435486a8677bae877c6d7e6f74a49d223",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "92a52648-71c2-46c9-ad12-0518b8edea0e": {
    "alias": "029",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-29",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-29/large",
    "variant_id": "384da2ed-1b01-40e1-9a6e-06e30586da11",
    "finish": "holo",
    "current_native_label": "エスペオン",
    "original_sha256": "88ce086c2c0b86cde235a7a3477374d31a801ef95018641fe5a07ee642e06d0b",
    "metadata_sha256": "56a7e430ef6316ed9d2ad73eecf90dff8dce711593b340f1cebc05925f2e19ab",
    "body_sha256": "163c8dc2600b82326180f5cc899e011c13a3ba8fbafd10a39eaa023a78b6fc0b",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "829ed3a2-40c2-4eb8-8ef1-6bd1f1eaafab": {
    "alias": "030",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-30",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-30/large",
    "variant_id": "83bb840c-55c1-4c56-8f07-80f2d547a226",
    "finish": "holo",
    "current_native_label": "a",
    "original_sha256": "fdab70cd8625df4e4613f974cf8f7db86dffbc61b771f189456d91d18814b36a",
    "metadata_sha256": "955f30f297d5de496d43e9481ce60c5c1fff65236c878f63eaadc6bd4716647c",
    "body_sha256": "e0448bdc1e5f7dfbd7e962bea3b5c4e2c883f28f7d43e618a29780cf5ad13f8d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "0d3cfda7-ba87-45aa-98c4-ae398f97b3ba": {
    "alias": "031",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-31",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-31/large",
    "variant_id": "9585f5e9-caec-4ce8-a348-1fc30bc7c4d3",
    "finish": "holo",
    "current_native_label": "ウォブバフェット",
    "original_sha256": "99dc90c3df3724c5615ff0c9eab9c840a131fc7db6aad3f55cc4c57cb2e9e5f4",
    "metadata_sha256": "71657a3dd6a00bea7097c375c0b1bd07c7755750a0aabe75a671dd733dc092ff",
    "body_sha256": "5c7ffe2713b73b628e9da661db63ec988f46b9329e0d86db3b92794a9bbffe57",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "c5c4620d-ae3b-4fd3-be3c-d1013da2f802": {
    "alias": "032",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-32",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-32/large",
    "variant_id": "ad938db1-ecf8-4dfb-96ea-3b8f6d8764c8",
    "finish": "normal",
    "current_native_label": "オマニテ",
    "original_sha256": "2d76f4005d42b32f61dc1f23b44bddbd18672ae17e33067428954caba0fe741d",
    "metadata_sha256": "3069501a8f57dcdc2a792d1b2a7b3edc312eb25d0f8c4d3320d01f38d136fe0a",
    "body_sha256": "8ecf5994c3e61b3748bfe3c360ca22d4a4723ca5f8e765e80452807f69b76b37",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 565,
    "height": 800
  },
  "5750b389-e0e3-4e2e-9df9-43371b007d52": {
    "alias": "033",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-33",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-33/large",
    "variant_id": "54b4bb97-b28a-4dd0-9e04-f8a15731eabc",
    "finish": "normal",
    "current_native_label": "タイログ",
    "original_sha256": "772c2bcab857ac90f40045758784c423bf8c20c17f070e075479f05f5edf9794",
    "metadata_sha256": "a3a00fb6fb26fd715c6210cffbcaa4b913cd36b8b8d47552cfdb16be3b885eb1",
    "body_sha256": "2c931aafa0b14244c7b8135d6897b39dd06c3aff285cf85ed71aa1320b3505b7",
    "discrepancies_sha256": "a7fddfd8267c0f0080a681775160501b4b9a3a4ddc3226761a7c494d6e63c073",
    "width": 570,
    "height": 797
  },
  "230109e5-6200-465b-8bba-05992a8f027d": {
    "alias": "034",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-34",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-34/large",
    "variant_id": "5e111fde-5628-4150-a459-13b5a4a9f26c",
    "finish": "normal",
    "current_native_label": "幼虫",
    "original_sha256": "b10bf3477ba4838088eb7c91bf863903c0fb0d558ccbb0708c411780d3d9055d",
    "metadata_sha256": "4f925851773d1267ed3be15a4d67ec8d1e118522e263403a1d0253100b42425e",
    "body_sha256": "f915dd5bfa9f8dfe4b1e556dbcc068098f336fc165663953030b2765e7611a82",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "f95aa509-0da4-4eae-b729-88f4e91259e8": {
    "alias": "035",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-35",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-35/large",
    "variant_id": "6c7de8cc-d299-40ee-b8bf-eae85d4f658c",
    "finish": "normal",
    "current_native_label": "Omastar",
    "original_sha256": "8dd7fd62fbf6799514fa5399a94c16eaadd94e62d15d0e9386be4e7c8aa9ecb6",
    "metadata_sha256": "9d612dfa3cb5fd84d83b444eaf7c8e888e0db4ae96bd52df86ce71a4a8a52146",
    "body_sha256": "f6e3f75e610cd59654a715dbb95f9915fdc5903943e8b8bfe665e206d5a499ff",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "48faa124-75d9-421b-879f-6248214895bd": {
    "alias": "036",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-36",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-36/large",
    "variant_id": "c20af47a-39cb-43bd-a7fe-8d34edb8b522",
    "finish": "normal",
    "current_native_label": "Pupitar",
    "original_sha256": "93c94fdca99af97bb1c95a0cc340a3c990be2f0924323def44d50734a038cdd7",
    "metadata_sha256": "34990e550b1f0fbc0a3fcbe5ff3139d1ce1a8e9aa6544dbec0ca2421be533156",
    "body_sha256": "1b8301e3f83cc30b89b825553abbb84348365409a6f768f10c7fe7dfd83e2e49",
    "discrepancies_sha256": "8239dad89080f115ef776d8650a55b1f674952cd8316d195ada8146e50be9d2e",
    "width": 570,
    "height": 799
  },
  "131fbd39-8264-4f0e-9d77-9a32555771d2": {
    "alias": "037",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-37",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-37/large",
    "variant_id": "4bdfcbc2-40cd-4d14-aa85-077a97e8f900",
    "finish": "holo",
    "current_native_label": "Poliwrath",
    "original_sha256": "afc5c8489db005b067a62459108a34a01fb5db94f861d45e0c3a7123fd41228f",
    "metadata_sha256": "b4ea5a1e6fc007a3ac0563607c352665f0465c8d9826e2a7850207921af879fd",
    "body_sha256": "1008690695b9c2b52f1cf33a209b7e6950f50dd167db82de5279d9e818257c7a",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 797
  },
  "59744175-fdf9-4128-aea2-40dd80979c74": {
    "alias": "038",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-38",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-38/large",
    "variant_id": "a379fe5a-4457-4781-986c-63468c77a797",
    "finish": "holo",
    "current_native_label": "ヒットモントップ",
    "original_sha256": "a8e9b7702685461b97fc190bdf89c86c9727cb4e1ce63a5b950d19be20e7e9a2",
    "metadata_sha256": "f1a327d3eb9016838e59812b9609b15b9301d2369396d4166a694cf034a9bd73",
    "body_sha256": "44dd485e15ba8a5a3b487a5f885755e201036d69944f0dd04e05013403d8be9f",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 773
  },
  "7c53022e-45d6-431c-86ae-ecb034a81d95": {
    "alias": "039",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-39",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-39/large",
    "variant_id": "057c82d9-5e91-4196-b53e-e41bc0f85461",
    "finish": "normal",
    "current_native_label": "houndour（u）",
    "original_sha256": "5dfcde533d51a08c83386b7fd16c108f0bde8144cf8271c2a97277017ec7ce4c",
    "metadata_sha256": "05e447027b4a91f3419d86a461d1a08b401309920bef0351b637c2d296d70431",
    "body_sha256": "1a005dd12b0dcab92d6348651f5a8d3b31a831f9d0e58c947690ee6cc80b2568",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  },
  "1594fa7a-1649-42cc-80b5-95f3c966c2de": {
    "alias": "040",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-40",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-40/large",
    "variant_id": "bb5594be-3c5c-4a55-989c-78d1ff56e892",
    "finish": "holo",
    "current_native_label": "Umbreon",
    "original_sha256": "fe81caccfd1dfa83d74953b0f4089ee1d65dbb5db301758ed5a899d39c4671ca",
    "metadata_sha256": "06dd494dda76074eff54764652998242f2201af13f51eb988da4e0bf95a6feb9",
    "body_sha256": "9d60dfb3c434dc729ee07d9bbc901e24372a7eae33603456d213fc9c285f93d8",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "852246e2-5efd-45be-a7e0-01fb7b84b629": {
    "alias": "041",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-41",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-41/large",
    "variant_id": "9f64ba0e-59f6-42a8-9495-88f82e099630",
    "finish": "holo",
    "current_native_label": "猟犬",
    "original_sha256": "198beb7114fd7e1d9df288627499c71494fff946b30758b854d789141ee7328d",
    "metadata_sha256": "f6e4c5882cd4280d332c752b3e415f4c68d86a8ad52fa0fc23a930e069952cdb",
    "body_sha256": "0bac92957e684536848d23825b547df349f287099d0f827becd10f7967e1ef4d",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "ce011cea-4faa-48da-b5df-5f7d3b7dc09c": {
    "alias": "042",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-42",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-42/large",
    "variant_id": "f4746bd6-f20b-4e43-bdc5-1078879c81c5",
    "finish": "holo",
    "current_native_label": "タイラニター",
    "original_sha256": "0c740db15ceded1b02fbe600d8b67265e33860cf9bb9d9a516d274621a39bcf0",
    "metadata_sha256": "253801b51eb2b66b65c6add252af29368154cd532c59297352eddd4f525f05dc",
    "body_sha256": "005669bd8c262e698e070107add40d72c83b496958c40831adc312174b9cb204",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 569,
    "height": 800
  },
  "f5c74bc7-73e3-4a57-9137-74324482f92c": {
    "alias": "043",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-43",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-43/large",
    "variant_id": "a8a3dedc-c285-43fd-8c1e-47c23c26d134",
    "finish": "holo",
    "current_native_label": "マグナイト",
    "original_sha256": "df1f230bdce16011b5fdf93ebff8db7595adc4567c1f72454d32e535a893fb59",
    "metadata_sha256": "619c2cf766739510731a0506a205a8d70bb28a7cdc9ba1e3393dfca591650b8f",
    "body_sha256": "b525c80d4477ae8582787c8bdfd91d073f22002de5e6cca7fa5468e89dde9392",
    "discrepancies_sha256": "5fd59d7b25e3227f7f864c0a09ff4bec7eb571c68fe37bc862e3d326a5bf7ad9",
    "width": 567,
    "height": 800
  },
  "eadc1fec-a27e-4327-9509-1f89a2de5096": {
    "alias": "044",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-44",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-44/large",
    "variant_id": "01ba2084-f93e-4067-93c6-505741feea1c",
    "finish": "holo",
    "current_native_label": "forretress",
    "original_sha256": "323a9e446e286b506b5d0b50d42783110a53a421bc9d9bb9ffa929e48806d9ab",
    "metadata_sha256": "5ee3275d69da200e33aa94c16f59aee840b3b111569fda20699ee1e9f1b2e873",
    "body_sha256": "6deba6c5199ff3ebae376b0681754f460792b67b5910f63ce16ca8b3d0049bdd",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 794
  },
  "5637e211-9b42-4e1e-9ec2-460d2bee1331": {
    "alias": "045",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-45",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-45/large",
    "variant_id": "badd06c9-129d-4c7b-9620-a3b3b33fd6b7",
    "finish": "holo",
    "current_native_label": "Scizor",
    "original_sha256": "1ddb3776125ae805025a48d90370c72106848333ff8a716558bc5d7731cfea24",
    "metadata_sha256": "b9a0a3360a3e893200d8edb2342c62bcfa5abad06096f96d05c237f2b84b455f",
    "body_sha256": "f3e1616c3b9aa1a3eab310cef1fb5173519dd579fcbcfafce7ad27eaefab8603",
    "discrepancies_sha256": "eef31429686d77b4d691362f6597034d52ef96bd79f5220ac47c35d2f7ea41d5",
    "width": 570,
    "height": 794
  },
  "323967d0-c511-42af-bd2a-86388c46fc99": {
    "alias": "046",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-46",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-46/large",
    "variant_id": "16062450-876e-4453-971c-4f4ec63896ae",
    "finish": "normal",
    "current_native_label": "セントレット",
    "original_sha256": "d9cecd8e5d2a87f36ae17edbfbca05f058eb484a656bb34d690e4e82fe46c6ba",
    "metadata_sha256": "7eac275e97efaa9ee70c0e3a962c840a12b953a27fb4a2db30034e4e6ceb2407",
    "body_sha256": "84b07f50ab08a7152feecf480ed773dfa402bdbcac46c17c701cbeea48c88986",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 567,
    "height": 800
  },
  "f10b48c7-d57d-44f7-967c-092a26d51dc0": {
    "alias": "047",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-47",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-47/large",
    "variant_id": "ff874455-93f0-4cbb-991f-7841b3cf893f",
    "finish": "normal",
    "current_native_label": "ダンズパース",
    "original_sha256": "a634bad69d21593c4425373c9bc7ee5c3712a8f887ad7beb86d2b7f834991dc2",
    "metadata_sha256": "0269d4973eb1b636ee406d69cedb727ae1378ffe22f99119428d46308ecf2857",
    "body_sha256": "544a490e099a176bd2838926c49561fc0a281a687c726d61fdaa3eb79ddc2944",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 567,
    "height": 800
  },
  "dd5d1897-bb8e-4a30-aed6-46caf6dc9c56": {
    "alias": "048",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-48",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-48/large",
    "variant_id": "49371b1b-5a23-4d6a-9855-082256f47f27",
    "finish": "normal",
    "current_native_label": "Teddiursa",
    "original_sha256": "6705ad15c66a1ee72022d512e22ef43090e454cf41c69f5d5f2166f5a603d1ca",
    "metadata_sha256": "7cb2480a46a01d58f4f216c105a570f733478ec3264a40feb122097b9d066170",
    "body_sha256": "525eb2b4809c59b5a3deae026a1ea0667d255ca7cd288d22acc61d6d5c8a10d4",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 565,
    "height": 800
  },
  "9205301b-450a-45c3-b69e-af15bb40070a": {
    "alias": "050",
    "batch_id": "JP-CARDS-008",
    "provider": "neo2_ja-50",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-50/large",
    "variant_id": "f983d88a-5d07-4110-a1c2-f8ca551da35b",
    "finish": "normal",
    "current_native_label": "Igglybuff",
    "original_sha256": "1d1aab87d26eda11e316cff246cf121fabe5969a68133f7688678f78a1bc3197",
    "metadata_sha256": "0b25f4e785586a6e668980589ead7daf7b08ce9b5b8f4d251ceaba83d1230064",
    "body_sha256": "221278ad289548a835b59a06aadabade74803e74ee909ce6eb258406824b0a2b",
    "discrepancies_sha256": "4f20c963c810d6a9c39c8459391b54f1372ffe4b7cb180c030dfb496d97704f2",
    "width": 570,
    "height": 792
  },
  "06273caf-f634-4cfc-89ba-0bbe16d35cb6": {
    "alias": "051",
    "batch_id": "JP-CARDS-009",
    "provider": "neo2_ja-51",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-51/large",
    "variant_id": "b404327d-2a1d-4354-b958-fa02a28a5438",
    "finish": "holo",
    "current_native_label": "ウルサリング",
    "original_sha256": "7993a95b2fdab1bdc2dfbd57c1c5f9cd03337e2fa671b94c3a99f7f2d0e1432a",
    "metadata_sha256": "149f2fbf851bd906c0482a0ed8f13355ad040cbf74cb4c5033b2eff4f3233c08",
    "body_sha256": "c6107562a59bf47e9c37750252b2f367b8fce184523fac4ea28f2425cf552803",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 567,
    "height": 800
  },
  "a1064e4d-1a25-4098-acba-0e22733216f1": {
    "alias": "052",
    "batch_id": "JP-CARDS-009",
    "provider": "neo2_ja-52",
    "image_url": "https://images.scrydex.com/pokemon/neo2_ja-52/large",
    "variant_id": "703371d0-8572-4624-be11-dbf188af654e",
    "finish": "holo",
    "current_native_label": "Smeargle",
    "original_sha256": "f97801e19a564d96337e1d8214077c5641aeacc06f0ebdaf54f0b320b4fbaaee",
    "metadata_sha256": "0e4ecf61142517bfddeb18b888cb6f840fc16fd806ac6fe07f10b7166e47563a",
    "body_sha256": "bf7799216f17139c0dec29f4802baff2e932c68d0f0ece6386bcf38d268ee6b2",
    "discrepancies_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "width": 570,
    "height": 799
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-007",
    "JP-CARDS-008",
    "JP-CARDS-009"
  ],
  "saved_batch_tasks": 57,
  "eligible_fronts": 51,
  "by_batch": {
    "JP-CARDS-007": {
      "verified": 25,
      "held": 0
    },
    "JP-CARDS-008": {
      "verified": 24,
      "held": 1
    },
    "JP-CARDS-009": {
      "verified": 2,
      "held": 5
    }
  },
  "excluded_aliases": [
    "049",
    "053",
    "054",
    "055",
    "056",
    "057"
  ],
  "excluded": [
    {
      "printingId": "a00039a3-9121-49a7-b6d1-f2ec4a7d5608",
      "variantId": "7699421e-d760-4251-a090-40166235602b",
      "canonicalCollectorAlias": "049",
      "batchId": "JP-CARDS-008",
      "status": "wrong_language_original_rejected",
      "reason": "Wrong language/printing: English Neo Discovery 38/75; canonical target Japanese Neo2 alias049."
    },
    {
      "printingId": "03b21683-af68-4f9a-bbbd-647dec3d5b81",
      "variantId": "e0b949b2-2bc9-4aca-bdec-f1584ec3f011",
      "canonicalCollectorAlias": "053",
      "batchId": "JP-CARDS-009",
      "status": "canonical_trainer_body_art_identity_hold",
      "reason": "Canonical Trainer body/artwork bridge absent; complete source front/rules retained provisionally and not packaged."
    },
    {
      "printingId": "be1af7b3-7199-445e-89e3-2ad26f93ffc7",
      "variantId": "33605fc7-7329-4191-ab47-25a8b8dfedc4",
      "canonicalCollectorAlias": "055",
      "batchId": "JP-CARDS-009",
      "status": "canonical_trainer_body_art_identity_hold",
      "reason": "Canonical Trainer body/artwork bridge absent; complete source front/rules retained provisionally and not packaged."
    },
    {
      "printingId": "34a5728e-9e47-453f-8102-84259c8cdaf2",
      "variantId": "9de3a61b-28c7-4cfa-8167-2ee54b2f62e4",
      "canonicalCollectorAlias": "056",
      "batchId": "JP-CARDS-009",
      "status": "canonical_trainer_body_art_identity_hold",
      "reason": "Canonical Trainer body/artwork bridge absent; complete source front/rules retained provisionally and not packaged."
    },
    {
      "printingId": "9815742c-ab9c-47d5-a05e-8fa67d755b43",
      "variantId": "e9c77163-1fa9-417f-ac99-caa57cce0533",
      "canonicalCollectorAlias": "054",
      "batchId": "JP-CARDS-009",
      "status": "exact_wall_art_variant_unbound",
      "reason": "Two canonical wall artwork variants but only one observed Scrydex image pointer. TCGdex provides no art/artist/body/image metadata for either; provider ID/order/name cannot select the Kabuto or Aerodactyl front."
    },
    {
      "printingId": "4ec6bdf6-3a65-4dd6-a3d7-84ea96cb77d6",
      "variantId": "a4b5fd43-f9f0-494f-8fc8-e1dcc7398386",
      "canonicalCollectorAlias": "057",
      "batchId": "JP-CARDS-009",
      "status": "exact_wall_art_variant_unbound",
      "reason": "Two canonical wall artwork variants but only one observed Scrydex image pointer. TCGdex provides no art/artist/body/image metadata for either; provider ID/order/name cannot select the Kabuto or Aerodactyl front."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Crossing the Ruins printing');
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
  const actual = body.actual_identity_guards;
  const pixels = body.actual_pixel_observation;
  const provider = body.provider_metadata;
  check(evidence.source_metadata_sha256 === known.metadata_sha256 && row.objects[0].sha256 === known.original_sha256 && digest(Buffer.from(JSON.stringify(body))) === known.body_sha256, 'Pinned per-printing original/source/body guard changed');
  check(actual.language === 'ja' && actual.setCode === 'neo2' && actual.canonicalAliasIsPrintedNumber === false && actual.genericOtherRowsMayRelax === false && actual.sourceOriginalSha256 === known.original_sha256 && actual.sourceMetadataSha256 === known.metadata_sha256, 'Actual identity limits changed');
  check(actual.printedName === pixels.name && actual.printedHP === pixels.hp && actual.printedArtist === pixels.artist && actual.printedNationalDex === pixels.dex && isDeepStrictEqual(actual.orderedAttacks, pixels.attacks) && isDeepStrictEqual(actual.abilities, pixels.ability), 'Actual ordered pixel/body witnesses changed');
  check(Number(provider.hp) === actual.printedHP && isDeepStrictEqual(provider.dex, [actual.printedNationalDex]) && provider.id === row.provider_id, 'Provider HP/Dex/source binding changed');
  check(body.effects_are_observed_paraphrases === true && body.literal_full_body_transcription_claimed === false && pixels.attacks.every(attack => typeof attack.effect === 'string') && pixels.ability.every(ability => typeof ability.effect === 'string'), 'Provider text and actual effect paraphrases must stay distinct');
  const isException = exceptionAliases.includes(known.alias);
  check(isException === (body.actual_source_discrepancies.length > 0) && digest(Buffer.from(JSON.stringify(body.actual_source_discrepancies))) === known.discrepancies_sha256, 'Unplanned or changed source/pixel exception');
  check(provider.name === pixels.name || ['025', '026'].includes(known.alias), 'Unbound printed-name exception');
  check(provider.artist === pixels.artist || known.alias === '043', 'Unbound printed-artist exception');
  check(isDeepStrictEqual(provider.stage, [pixels.stage]) || ['033', '050'].includes(known.alias), 'Unbound stage/evolution exception');
  check(provider.attacks.length === pixels.attacks.length, 'Ordered attack count changed');
  for (const [index, attack] of provider.attacks.entries()) {
    const observed = pixels.attacks[index];
    check(isDeepStrictEqual(attack.cost.map(symbol => energy[symbol]), observed.cost), 'Ordered attack costs changed');
    check(attack.name === observed.name || (known.alias === '015' && index === 1 && attack.name === 'スイープビンタ' && observed.name === 'しっぽでたたく') || (known.alias === '019' && index === 0 && attack.name === 'おうふくびんた' && observed.name === 'おうふくビンタ'), 'Unbound printed attack-name exception');
    check((attack.damage ?? null) === observed.damage || (known.alias === '045' && index === 0 && attack.name === 'みねうち' && attack.damage === '?' && observed.damage === null && observed.effect === 'Half opposing remaining HP rounded down.'), 'Unbound printed damage exception');
  }
  if (known.alias === '043') check(provider.artist === 'K. Hoshiba' && pixels.artist === 'K. Hoshiba / CR CG gangs', 'Complete observed artist line required');
  if (known.alias === '045') check(pixels.attacks[1].damage === '20+' && pixels.attacks[1].effect === 'Two coins; add20 per heads.', 'Actual Scizor additive body must survive');
  if (['025', '026'].includes(known.alias)) {
    const correction = body.exact_df_correction;
    const form = known.alias === '025' ? 'D' : 'F';
    const ability = form === 'D' ? 'DARK df' : 'FIND';
    check(correction && correction.printingId === row.printing_id && correction.variantId === row.variant_ids[0] && correction.canonicalAlias === known.alias && correction.originalSha256 === known.original_sha256 && correction.metadataSourceHash === known.metadata_sha256 && correction.sourceUrl === row.image_url && correction.observedForm === form && actual.form === form && pixels.observedForm === form && actual.abilities[0].name === ability && isDeepStrictEqual(correction.fullBodyGuard.orderedAttackCost, actual.orderedAttacks[0].cost) && correction.fullBodyGuard.abilityEffect === actual.abilities[0].effect, 'Only exact approved D/F form and complete ability binding supported');
    check(pixels.actualEligiblePrintingAlias === known.alias && body.capture_association.originalRequestedCanonicalAlias !== known.alias && body.initial_metadata_candidate_association.sourceCardId !== row.provider_id, 'Original crossed candidate/request associations must remain historical evidence');
  } else check(body.exact_df_correction === null, 'Other rows may not inherit a D/F correction');
  const quality = body.quality;
  const edition = body.edition_evidence;
  check(quality.detailReadable === true && quality.hdOriginal === false && quality.upscaled === false && quality.wholePrintedFrontVisible === true && quality.outerScanEdgeIrregularitiesRetained === true && quality.aspectRatioIsCropProof === false, 'Whole unchanged readable front evidence required');
  check(edition.physicalEditionVerified === false && edition.physicalFinishVerified === false && edition.releaseYearInferredFromFooter === false && edition.copyrightLineReadableOrPresent === false && edition.copyrightDateClaim === null, 'Unsupported physical edition/finish/copyright claim');
  const support = body.source_variant_support;
  check(support.currentFinish === known.finish && isDeepStrictEqual(support.sourceNames, [known.finish === 'normal' ? 'normal' : 'holofoil']) && support.metadataLabelSupported === true && support.physicalProof === false, 'Provider finish label is not physical certification');
  check(evidence.artwork_scope === 'printing_front' && evidence.source_kind === 'third_party_original' && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false && evidence.owner_business_decision.kind === DECISION && evidence.owner_business_decision.source_wide_approval === false && evidence.owner_business_decision.human_review_required === false, 'Exact finite source decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === 'neo2' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.source_code === 'scrydex' && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 204, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 51, variants: 51, names: 102, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 31 && cards.filter(card => card.finish_code === 'holo').length === 20, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Crossing the Ruins plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 208 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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

export async function loadFrozen() {
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 153, object_references: 204, unique_image_members: 204, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
