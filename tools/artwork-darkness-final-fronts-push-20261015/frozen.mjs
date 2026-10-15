import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '6fd3c62cef8c21ea33743bd281470ca9ff55186347f345354f91e7ac566fe155';
export const APPROVAL_SHA = '8ceea85f315f177aad545b35da080a32d3aade5d74bf47760a737d8f774cabb5';
export const IDENTITY_TABLE_SHA = 'e13e91d15eca98032269d45cb6d8cd2ad845930ea6a9b9ec51bc9e74dedf6e08';
export const SAVED_TARGETS_SHA = '65cb59b1e6020cd16a184eca5a50a3571191b6ace57b2b547db6406c0792518b';
export const SOURCE_MANIFEST_SHA = '98b24bb530ddb280ce4196728c062135f9be9b86434258836eeac9a7633c5ae1';
export const ARCHIVE_SHA = '923b56b7ba4c349aa31fdaa7e9e71aa9307d933b6604dddaf394257c550503f8';
export const ARCHIVE_ID = 642982354;
export const ARCHIVE_BYTES = 6639659;
export const FRONTS = 13;
export const QUEUE_ID = 'STACKR-JA-DARKNESS-FINAL-20261015-013';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'cdaacf04-0a7c-452d-acb0-e02ca3907106';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "ce963e5abed6043cb918f9b3dc1f0ccc402dbcb370cfaf963f2243b526fb3ebd",
  "decision": "5e9d786c4feb935071776266e42f83bf25d43f1620d76faddabd6caca477e27c",
  "source12Handoff": "e6bc310c71e25c91df4900e75d0ed2ada65e20b02779d1889a4678b764374b02",
  "source110Handoff": "a6f32becfd53f51e2c2fd98f0eb31bb33c6c48053a15901b8078c164ac381b03",
  "selection12": "1d17d436f1bd9d2382b661c388300763883ed0338fd2ed55d4a373a2d91c1fb1",
  "review12": "f521d577476b7be6e858eb683ae42a8d557437ddbad24d0ffa1a9d5f90032a24",
  "selection110": "b80acc2a2f92dbad8f68ac8905fb6e7a2e68892cf28e10e8a9a1c54ed08a7a83",
  "review110": "43846928060053e198d7460ece9e81bf25fe4ce2e9d1e8bd59eb04db83649ffb"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "321e1cd2-8677-4e61-a1d7-3a9f47bcafb0": {
    "alias": "102",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-102",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-102/large",
    "variant_id": "10bda5e3-e914-4519-bd6d-4ee49eae442d",
    "finish": "normal",
    "current_native_label": "エネルギー増幅器",
    "category": "Trainer",
    "original_sha256": "ecc92984cee59268439066aa700bfdd2642aa78500028315d666c43b92e59359",
    "metadata_sha256": "256cf26f63071c7f8bf03a659dc6364882d522415b56c5c46a608ca9fe8596ce",
    "body_sha256": "2fa00a118c11ee02033a42a26315831f02d85cf57eb96c28570985c1f4484a3d",
    "actual_signature_sha256": "303f1a8ab6fd6f786039b26b2ed7ad59fd9003bea1adc7d4a8d32e510d7d21e0",
    "historical_actual_sha256": "303f1a8ab6fd6f786039b26b2ed7ad59fd9003bea1adc7d4a8d32e510d7d21e0",
    "source_signature_sha256": "0232f57bffc275a73a628bffcb9ca43e23b3cd45795f2ed742155b15021ced87",
    "provider_identity_projection_sha256": "f5c868658d4b3591e6840ecb9e67dbd47da29e49a2f7746f59550aed1f23bcac",
    "full_captured_json_sha256": "b252a304cc4dea6f49290d6e2cb78628e54504b6672aeab82efe140f82c40d6b",
    "historical_source_row_sha256": "8399d045f818d0c0f9b755b1e92f7038018d3a0478b05a397dc015cf7770743d",
    "approved_projection_row_sha256": "399f212f2c3e833661ebfe3f744ace6f1b46635818b690aac8454adec02401da",
    "raw_selection_sha256": "1dda340d89fd924d67af74e7062a29f97178a869c171707e1de374976d2d4b0e",
    "public_selection_sha256": "23f800e8d4e4f9b18f5f73b05e19407554213d65e2567c6df39fb4f1d9b88580",
    "width": 570,
    "height": 799
  },
  "53329b0c-0a4e-4bd8-a800-11c349d6f5d7": {
    "alias": "103",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-103",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-103/large",
    "variant_id": "269f8c0c-92d1-47b8-b06a-8a34a1214326",
    "finish": "normal",
    "current_native_label": "反撃の爪",
    "category": "Trainer",
    "original_sha256": "fa76f889552b3d75de4ca2ce9f44287a8164345149dc596856c6c0193f16cd23",
    "metadata_sha256": "140bff6945f39df7f448cc8425d0759b97555673d123fc3502e9566e07930db6",
    "body_sha256": "da9f0dd82222e88cedd154d3c0192bff50ea195bdc55fcf8df2203340de5069a",
    "actual_signature_sha256": "9e06499f347e70d08a779de11c8027d3c17b0bffb57bedb01b60badcb9332902",
    "historical_actual_sha256": "9e06499f347e70d08a779de11c8027d3c17b0bffb57bedb01b60badcb9332902",
    "source_signature_sha256": "4f2be64a44734f44028ef18dc4cde91ccc79d3ce4bfb4563bd0437aa2a1a6965",
    "provider_identity_projection_sha256": "d28b70ef66c83170a382ff74c82ce9f6863344138a00e5e1a4993915c45d3d44",
    "full_captured_json_sha256": "87c367dfbeb92aa86c4c673db76c0b8339e341dfb3f93776ed4608718d7cdf6f",
    "historical_source_row_sha256": "e67e1c7056065354c352c2c03e877f7e3d642a7833e27c6b63d92e9d0af16f37",
    "approved_projection_row_sha256": "cfb8ac9d14b993cf0099920f4fdd7a0693c57f30b7583a78758edbff59692a20",
    "raw_selection_sha256": "61c484d760da02a54cd0d868e0e4a5e5e315588627f8353f809c7430e18b732e",
    "public_selection_sha256": "b9018e68ac8f3306d7cf59acddec3085ad6b0b5a8e634b132b585928e79029d0",
    "width": 567,
    "height": 800
  },
  "3d3c9971-cd1a-4dbe-a659-8e4fffd669f2": {
    "alias": "104",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-104",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-104/large",
    "variant_id": "70d44586-048d-41d1-a65d-a420daf26e60",
    "finish": "normal",
    "current_native_label": "拡大鏡",
    "category": "Trainer",
    "original_sha256": "c449ddd89086b8690d13c0d6e0027381414751c93757c89a6e12c29f6d6d0440",
    "metadata_sha256": "cf5fb5f6f53258d19490305f9da49d7a2f55ef2bf640c5ea6918fe971c3fdfec",
    "body_sha256": "8a1a01e3f6d53598cf414dcef91d9a705ea29f8d09f460c70a4bf638726fccfa",
    "actual_signature_sha256": "2d3fdb0ef2826943e2293bd93e81c580e6b4404826efdaab5f62f6c3744baf1c",
    "historical_actual_sha256": "2d3fdb0ef2826943e2293bd93e81c580e6b4404826efdaab5f62f6c3744baf1c",
    "source_signature_sha256": "ccc9649f798c1507b539b1ef69e4400ecf30e8505ab4c4346ec67f6756752d27",
    "provider_identity_projection_sha256": "f4ed084c787cd9f10038889ba0631e716ff7ac259c284dc06e0f63530218e63a",
    "full_captured_json_sha256": "e9aae2c53fd592f6bc0962bfb15a40132ef2ed520466ce4a74e40091d7e88766",
    "historical_source_row_sha256": "b3bec92df3a755f65ad15d36388b0a7136f2cee7d00dabebcb27872c156e3ccb",
    "approved_projection_row_sha256": "f16bf2208fecfb58a83548d0876051442ee30a5db2655dbe08c532d2721fae2b",
    "raw_selection_sha256": "ebe16e1930341abcab23a3c02c0ff800a89373dcb2226636927b2218b0c6874b",
    "public_selection_sha256": "141f4957a27355c159840baf9346015ac33a6176b6cd32868d6aa57f3a460805",
    "width": 570,
    "height": 794
  },
  "ac2058d9-5f2c-464c-83dc-86145472f4b4": {
    "alias": "105",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-105",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-105/large",
    "variant_id": "9241f36a-931e-4b6e-914a-db6035c09052",
    "finish": "normal",
    "current_native_label": "ポケモンパーソナリティテスト",
    "category": "Trainer",
    "original_sha256": "142bfb42e99f36a6ee81d22e5be4c6ef3d522d286a7936b6d78b54173a82b9c5",
    "metadata_sha256": "67c8a10bd2ef6202cfbab827f85bb7e853432fffac37ef86d8d031600caf7743",
    "body_sha256": "93d318c0e73e3539c22616ca15eaf27582e741cc00c9cbb61966da1e95039f5a",
    "actual_signature_sha256": "cf38465f2b56528596392cc90e6562da35703cb5b34a21e2c313ed5331220424",
    "historical_actual_sha256": "cf38465f2b56528596392cc90e6562da35703cb5b34a21e2c313ed5331220424",
    "source_signature_sha256": "2dbf0499e758f1a5ccab5ccdb461fe107d6973918c39a4e84fa54d4255d37a66",
    "provider_identity_projection_sha256": "abb1f5f82a9c32c8c1e16adbfd33f7100c28e87ec9797f17686f98b18f2cf20d",
    "full_captured_json_sha256": "eca19bd07ff748807d7adc6359100159588a236426b4cbb02a89f31352d7770e",
    "historical_source_row_sha256": "af33d72cf636b9e612ea2e93dcbe7d74b6b55578df21e7b6e3bd2a37c0b93571",
    "approved_projection_row_sha256": "e91953e03b4ce0e8a02767f400f7ab3cf01fbcb93e4509b1b40851a848dec630",
    "raw_selection_sha256": "562894351474dcdbde1160171df508f8b7b8b70bdc474a7bdce99da970f367e5",
    "public_selection_sha256": "55f6832f07d1dad1f246d304e071be43951088ac48fa8347f5b11e0416ca48ca",
    "width": 570,
    "height": 797
  },
  "643d3366-7047-459b-b7ef-0a4278785e4e": {
    "alias": "106",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-106",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-106/large",
    "variant_id": "5c58884b-9958-4ba1-8430-af73c0cab9f1",
    "finish": "normal",
    "current_native_label": "ラッキースタジアム",
    "category": "Trainer",
    "original_sha256": "5dee062f5a127cb54f2509044f913e6b65b6aec2e04fd22b40162686db90f658",
    "metadata_sha256": "f6260aeafe7a4e25ad3c49eb41f57a18440f502beae65341ded3fca11a17905c",
    "body_sha256": "13cf0e7841716e3388df9afbcb3bc43448fc5801d0e37840a302cce40d7cfebb",
    "actual_signature_sha256": "19fb10e869832e0f98153327f30daa18f874c7fa89fcd957b1438a2bddd1b993",
    "historical_actual_sha256": "19fb10e869832e0f98153327f30daa18f874c7fa89fcd957b1438a2bddd1b993",
    "source_signature_sha256": "55472d186a71c68a7e03f28854973f11787ce69ff5f80a34daba5cf50791b8d1",
    "provider_identity_projection_sha256": "4ed36714d06cb05e62dbd0087f3ebedf540ab97fcee1e823774b7df49a151001",
    "full_captured_json_sha256": "f101d9dc88ed611e5759b9478599186e4af54f09204991e9b85eb56fcd70f8b1",
    "historical_source_row_sha256": "4d71412bcc9298d4b26b9da7407ccdb0f2c9083859a7b1baf6fd394e51914136",
    "approved_projection_row_sha256": "022c0ae51919ba67f668e4492722af1abfe5c0495fa5158356808a59dfc64454",
    "raw_selection_sha256": "46dd7cdd753bab696f39a4b902dc2a4835d26fd1280a07a1514fa64b324ec02e",
    "public_selection_sha256": "52effb5d02103eb8be48f1e7202249ba4ea5edc42096d6b9cf4315fbc0800916",
    "width": 567,
    "height": 800
  },
  "9f2ec684-fa0d-4308-86b1-cc11a4cd4d54": {
    "alias": "107",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-107",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-107/large",
    "variant_id": "e57c0e22-231e-4ea1-8d70-0272f5b0dd69",
    "finish": "normal",
    "current_native_label": "チームロケットの邪悪な行為",
    "category": "Trainer",
    "original_sha256": "48c742aec2886ec480fb63afa11b0dadb276373bd6d2050c55a690b2cff12bf0",
    "metadata_sha256": "92b6aea48e66b63365e14199939d51087698da9548e9fc294f2c0fb7ddeb7e0a",
    "body_sha256": "2457acff7f7e878432d65da0399e65864eeec1a96d303b7e6aac70c577c05a5f",
    "actual_signature_sha256": "39a779ee74aa9b8e615f0c6308846bb0f6a32103db7ed8fd57eeca8ba3a883b1",
    "historical_actual_sha256": "39a779ee74aa9b8e615f0c6308846bb0f6a32103db7ed8fd57eeca8ba3a883b1",
    "source_signature_sha256": "5d62dca5b8848b6a0ae1e3706f1192f4d035b2b4ef96dd3ec168e984a131104d",
    "provider_identity_projection_sha256": "2d49c137c9fe778ea0c7e85e7858c8edd0425afcc340dc0b90e4e78dac63fabd",
    "full_captured_json_sha256": "15e45599f60e8673d5fc3e1cb248693e7471684edc5cbd87aa5f7b13da337c88",
    "historical_source_row_sha256": "ca16c46ff654164c9d86e8a1c7a413e3388084777bac353e09f6fa31cc2d56bc",
    "approved_projection_row_sha256": "dff0970928565bae25d93292951023e5e3263a2447a6ab78fdeaa923796d040f",
    "raw_selection_sha256": "7896c37335b825e06aa6c112c15dec1843a9c19dc47745a643877e51ec58c48e",
    "public_selection_sha256": "9f433993193abf55aa56f2aee2485dfb01920ed3349e337c2071b7d001c31805",
    "width": 570,
    "height": 799
  },
  "a210caa0-de01-4caf-aa35-1367a99723f1": {
    "alias": "108",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-108",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-108/large",
    "variant_id": "f4a81b91-eba3-4ad6-9d64-eeb19384d48a",
    "finish": "normal",
    "current_native_label": "思考ウェーブマシン",
    "category": "Trainer",
    "original_sha256": "c750ef6460a2d090b98d996d6aeacb2e5f1afbf45aa5d0e518eca6c5858a28ea",
    "metadata_sha256": "e5f0726053751e71c09a314434bb7128f44482c7a9c7ed340fe12e50aeb5b9f9",
    "body_sha256": "9015f08942db9f0c1692971fb330a36fdd97756b9ae453814f7625f1aeeb87de",
    "actual_signature_sha256": "aaf6bffb8829552698661c5df3ff9ec42849a1292bf15a402270db6be225b46a",
    "historical_actual_sha256": "aaf6bffb8829552698661c5df3ff9ec42849a1292bf15a402270db6be225b46a",
    "source_signature_sha256": "41af9613d5c9a60e7e02bedba408115db92257307ec8e88ad2800f0d9b4dc70f",
    "provider_identity_projection_sha256": "cd86238d4884a9ce4924fb867b3f496e71ef9692059681987657ba651d9ebe73",
    "full_captured_json_sha256": "70cffa9550e1f167ea25bbc7254b7a0b5ee734a17e1b6b581873fa9c4df211cf",
    "historical_source_row_sha256": "a02a32f14d61598004c2885191e590649a39cfb6678a69daff80758ad25e2f9d",
    "approved_projection_row_sha256": "befa5e66e3674ae1b5390905cceadd103f42e7edd01975d09c529e3984e81107",
    "raw_selection_sha256": "261716411d961d0022a117eab1a0508afe21ed5c742b4a224b66168d76dc5a0f",
    "public_selection_sha256": "deb75c911ca16ac5e29c432d70be87bc8d432d04df40055f0217af2596a8b3de",
    "width": 570,
    "height": 797
  },
  "a61b14c6-e3f0-45b6-8b8e-09b175969400": {
    "alias": "109",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-109",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-109/large",
    "variant_id": "f20b6f01-d00d-43b2-8222-1248d003d52c",
    "finish": "normal",
    "current_native_label": "exp。共有",
    "category": "Trainer",
    "original_sha256": "4bb18b87b3a66a534f6df2182a1dde6f8593be165f58592016906b0367e7ec8e",
    "metadata_sha256": "5b239d0febdc1f9977cf806ef405e021a6fcfa78fc6e9d134c377d596b46f46f",
    "body_sha256": "275b0a7b06edc4ff54ec47266aba632d05f90e59bdb847449281d93747f52e6d",
    "actual_signature_sha256": "0530a06d0d4f7cb00b4d268d1bd7fdd0b14f07d222659fcb07b2a5f6610a0a01",
    "historical_actual_sha256": "0530a06d0d4f7cb00b4d268d1bd7fdd0b14f07d222659fcb07b2a5f6610a0a01",
    "source_signature_sha256": "86643cd2f583555ce74aaafee009814781b04d3ea7a56a5e3ee2cd25bb2d7c66",
    "provider_identity_projection_sha256": "39a3bec200daaa6104009a5921d9700799985ba1dceefcf88dbe5fd21aa34baf",
    "full_captured_json_sha256": "c1c1cbc2cfd0b088be2f3d874abdde6d7eb614f78992284fb882332e7bcb6c52",
    "historical_source_row_sha256": "14cd4c0eca88e9deaa4cfd4be9bced27eff4b1de90675c0ccd1d44c193e25504",
    "approved_projection_row_sha256": "2b01bdeb096d679c6cc9677fad8a2c5ee0bf776812538a0d2642a672f38d0997",
    "raw_selection_sha256": "1c09f86769d45cbdff52de88e5d54008bbf4ca36754824cf7fb120150230ff7b",
    "public_selection_sha256": "bfd47c9cb497e7080b0514c0754c493491046bdd19a17ae61bb1fec1333a5365",
    "width": 569,
    "height": 800
  },
  "9d182887-d279-4aa8-bfd4-7c3c53ddd834": {
    "alias": "110",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-110",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-110/large",
    "variant_id": "b3263116-6453-43e3-b209-953e6706ce3e",
    "finish": "normal",
    "current_native_label": "壊れた地上ジム",
    "category": "Trainer",
    "original_sha256": "e2f100fee5ddefeef34f4c0f50ec745515abecee7e8449a8c4cf7820f1764844",
    "metadata_sha256": "e3dfd21182018443ad3521e0789367e8b75302bdca5a3bb9f5c0f76ed1423a5e",
    "body_sha256": "4bd69dfabcfa879435cb0612dd463cbe6df132bd313c56560859b1824fb780a1",
    "actual_signature_sha256": "9791aac89fecdd296ef9aed811695ef5bbbe75e86b80595e80f146cfa9fd0776",
    "historical_actual_sha256": "9791aac89fecdd296ef9aed811695ef5bbbe75e86b80595e80f146cfa9fd0776",
    "source_signature_sha256": "5a4f2838a028da428786268c93e259a15302223a7812699c9b5d23045669f110",
    "provider_identity_projection_sha256": "838de5f4216e9967ff0225cb58e73d8834fc06e23a959fade599314132848c07",
    "full_captured_json_sha256": "f86665f90f11f19ae21941939e9756ea2ec84cd5f23c86f71787729087f47718",
    "historical_source_row_sha256": "4a3bbae6385b69a3473100498c48a7caae50a0c595064738d39c03dec1e752b4",
    "approved_projection_row_sha256": "d54f1355b251d99af47ddb1838f5e89f361fcaea86db63b95e3aeaa3d07a75ef",
    "raw_selection_sha256": "87d9d480d612f883042b3f489415f2d99f9cf8112344c47d3bf12809e11bbf18",
    "public_selection_sha256": "4157925d3636e850288ca4b17f2e166f6068ebff08c5fa14ffefecae9bfe48d0",
    "width": 565,
    "height": 800
  },
  "8b7bdb6b-ae3b-4b2b-8965-013c218b5766": {
    "alias": "111",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-111",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-111/large",
    "variant_id": "718cd280-e3dc-4817-b1b2-059ea8a8306a",
    "finish": "normal",
    "current_native_label": "詐欺師オーク教授の発明",
    "category": "Trainer",
    "original_sha256": "70e34a8973615ac20266da169456ec063b51c25626cfbac6fe6aca2d957936e0",
    "metadata_sha256": "cd58d6d85a95c5a2290ddbb7f389b3f4719f24038bb2f26ad696499f68f3e7dc",
    "body_sha256": "6a141221962ae01c67ba589e86e77807f56aaf8e94f27bae26fdbe890243ca2b",
    "actual_signature_sha256": "0e4c01aa7259db480695d318b35f59fef8cdac632c3a237d2a76ce4ac8b954ab",
    "historical_actual_sha256": "0e4c01aa7259db480695d318b35f59fef8cdac632c3a237d2a76ce4ac8b954ab",
    "source_signature_sha256": "d5470bf0faf1520e87fda3a14120c8997205c47ecc37203f71a3d2b39971d5fb",
    "provider_identity_projection_sha256": "0e8c1bd01be9bec5e6e0cdc75503d89f7d21f283ea0fc380b5eb979b95cac9af",
    "full_captured_json_sha256": "c203f3c9d1afe48e7a95b1dd2878191c68fc20bd76992d82f5e9aba9752d8518",
    "historical_source_row_sha256": "c1620fce0af74c81d1cae36d7e4b126123d7c98d7b9da9bef4168056858b0d2b",
    "approved_projection_row_sha256": "5ea0d4130ec0f768de2acd95417138e884b7ed11c860eaa1c04832349b1f79e8",
    "raw_selection_sha256": "067f6748fec9545958e6f0b5b59db99102ae7d0e3f555dd0a190fd26798e1028",
    "public_selection_sha256": "ecc46e26945c60e48479b8b3dee7bfab10edaef8d2d051550aebcd35eff8e786",
    "width": 570,
    "height": 794
  },
  "3cea11be-02b2-4f43-b394-270fc6cf752e": {
    "alias": "112",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-112",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-112/large",
    "variant_id": "de289be1-707f-4405-850c-c760ce86faab",
    "finish": "normal",
    "current_native_label": "ラジオタワー",
    "category": "Trainer",
    "original_sha256": "ac013fd3b3e6d70df10731a07b3e33e9d0e099623ad98a61f1e4695e730bed3a",
    "metadata_sha256": "1c80d5babe3403e3ba0093605f27d484efed643568a0180a6b11593fb8c2115a",
    "body_sha256": "13b82c4342783a01b49990aebbf709b122327bae3b9b3dd5a21988bfa4c34664",
    "actual_signature_sha256": "d2724114cabf99561c5de1dfe420ea84abe903ad55bb49d815c529366589f127",
    "historical_actual_sha256": "d2724114cabf99561c5de1dfe420ea84abe903ad55bb49d815c529366589f127",
    "source_signature_sha256": "d8b30104b4d8cf0268d34019cbc193cd7938c7f7cab6acca3276bce01db5afba",
    "provider_identity_projection_sha256": "633851a2080a54d98d689027eb8abddb359c069302169ab009035f486ade0c0b",
    "full_captured_json_sha256": "a3d0dcd80c8faa36a11d143fdf846811e739d7dba21ebcbed4c580112f30985e",
    "historical_source_row_sha256": "f0c53b001ca1791ee372b5e6b6bb7965841234d3397fffc1e0f4680483228adf",
    "approved_projection_row_sha256": "31ea1b6935af67c9f38eef01e870106526081624f811a9ca7a1358de9b0da124",
    "raw_selection_sha256": "553acb1f4921bce05bbd1f963f1375476f093d35448dad44ee5676245d86c516",
    "public_selection_sha256": "4f98d914c1a9775da0f08b5a5093bfb646a3e24b6b884f3bd5e359a87af75c10",
    "width": 570,
    "height": 799
  },
  "6c0f9c08-1fc4-4f4e-8c01-bf9db820e06a": {
    "alias": "113",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-113",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-113/large",
    "variant_id": "43e4450e-f35b-482d-987c-64b0a546f1f5",
    "finish": "holo",
    "current_native_label": "奇跡のエネルギー",
    "category": "Energy",
    "original_sha256": "22754251005f8d21b4e358a059829850c7b795fc76f5a67d84dd1b49f7faecf3",
    "metadata_sha256": "9c1ef2c5a314f2713ecd6c6fe0401b68f307c3295a63565413c31a7663350048",
    "body_sha256": "1aaf9bc0f2cfc0edd7f3ad4f0dca36cd84e94ce1755e94ba42105d218287ee57",
    "actual_signature_sha256": "b0b19ee0e35f05df2bf0c687a12eb3f2008a12aabce3ef120abac943f29b3add",
    "historical_actual_sha256": "b0b19ee0e35f05df2bf0c687a12eb3f2008a12aabce3ef120abac943f29b3add",
    "source_signature_sha256": "93cae492f44abe240b5bfc85cab87fa73046292a126697be4f07f86badca9d42",
    "provider_identity_projection_sha256": "80a885127d2d86a493b2da2107305db330382774c1a2759242e4732a4bb30a15",
    "full_captured_json_sha256": "a44fb3f07a8b97a5fb0cc70fe59bb6e24300b6ae8fcb498d9d16d475f21450f0",
    "historical_source_row_sha256": "eda80cbe7b8f00fb0526ebeec4f0750605c2d825c42289bbc81246baf7620b95",
    "approved_projection_row_sha256": "52f050708a34f57574d0f1d9cb422e5c1612262849c21ee839b935d4731f558b",
    "raw_selection_sha256": "ba0ad7c75fffd37acbaa44178dcd55f88fca7ce77f51d9804d10c7b101925bf7",
    "public_selection_sha256": "41223efe3a048f19dcf467a6ea72618b4941d1191ed80364686547c18d6e7374",
    "width": 567,
    "height": 800
  },
  "b1b031a2-2e81-4602-90ad-57cab1a04ef0": {
    "alias": "229",
    "batch_id": "JP-CARDS-017",
    "provider": "neo4_ja-24",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-24/large",
    "variant_id": "ae5bf6c7-5706-40ed-9042-330ab173dbe5",
    "finish": "holo",
    "current_native_label": "暗い猟犬",
    "category": "Pokemon",
    "original_sha256": "130986ffbfc32ce1e6f9201aba739c68b4c80b66f5f5d1cadc7c3887561adb30",
    "metadata_sha256": "9d549d7eeb931ff4d38400d958ce342218492707701c0ccaac3e62f45f03aae8",
    "body_sha256": "ecba51ecda1b293c65a5c385efa2f0efd8203489ffe91b00e77585eba07525ae",
    "actual_signature_sha256": "8995d438180baf5e99764502e053748ebbd73c4f109461b285e9381c3c5643ec",
    "historical_actual_sha256": "8995d438180baf5e99764502e053748ebbd73c4f109461b285e9381c3c5643ec",
    "source_signature_sha256": "9db7ce5cc16fd52961a0625f82230a6135fc1188c37f92d29aba32d039c98c60",
    "provider_identity_projection_sha256": "efe9d6c644040b6c0c874fb7f10bf4b9c224fbaaa3a0315fe001bc35d9f66eb1",
    "full_captured_json_sha256": "d51229ba69e94a8de6d74130e70a61fd4b1115b07e025da8cc3f8ba2a0137d52",
    "historical_source_row_sha256": "831e100fa61fbc06f31f47931ccc126ce3e2f680300445c48db2d5869c985df8",
    "approved_projection_row_sha256": "b3546fa09c08ca5e3c7df3c29bcfab12a836ba2446411c4682d9c940de0555d8",
    "raw_selection_sha256": "2b325e5cd652c3eca44505c391f8dcc3df346d2227e823bb0950fbd2254da142",
    "public_selection_sha256": "b675a4176a6b5292ed92e3cf1dfcd58c75badc6c2242260ea2f2b7dcfc755571",
    "width": 570,
    "height": 794
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-017"
  ],
  "saved_batch_tasks": 13,
  "eligible_fronts": 13,
  "by_batch": {
    "JP-CARDS-017": {
      "verified": 13,
      "held": 0
    }
  },
  "excluded_aliases": [],
  "excluded": [],
  "outside_fixed_cohort": [],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Darkness final printing');
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
  const e = row.evidence, b = e.source_body;
  check(digest(Buffer.from(JSON.stringify(b))) === known.body_sha256 && e.source_metadata_sha256 === known.metadata_sha256 && b.accepted_category === known.category, 'Exact mixed-category source/public body changed');
  check(b.provider_metadata_raw_html_sha256 === known.metadata_sha256 && b.provider_metadata_full_captured_json_sha256 === known.full_captured_json_sha256 && b.provider_metadata_identity_projection_sha256 === known.provider_identity_projection_sha256 && canonicalHash(b.provider_metadata_identity_projection) === known.provider_identity_projection_sha256, 'Raw provenance and derived identity projection changed');
  check(b.actual_pixel_signature_sha256 === known.actual_signature_sha256 && b.historical_actual_pixel_signature_sha256 === known.historical_actual_sha256 && b.source_signature_sha256 === known.source_signature_sha256 && b.historical_source_handoff_row_canonical_json_sha256 === known.historical_source_row_sha256 && b.approved_projection_row_canonical_json_sha256 === known.approved_projection_row_sha256, 'Historical handoff row and accepted projection/signatures changed');
  check(b.independent_selection_raw_canonical_json_sha256 === known.raw_selection_sha256 && b.independent_selection_public_canonical_json_sha256 === known.public_selection_sha256 && b.current_acceptance.source_card_id === known.provider && b.current_acceptance.independently_accepted === true && b.current_acceptance.category === known.category, 'Exact current independent acceptance changed');
  validatePublishedWitness(b, row);
  check(b.generic_other_rows_may_relax === false && b.physical_edition_verified === false && b.physical_finish_verified === false && b.source_variant_support.currentFinishCode === known.finish && b.source_variant_support.physicalFinishVerified === false, 'Unsupported physical/generic exception claim');
  check(e.artwork_scope === 'printing_front' && e.source_kind === 'third_party_original' && e.exact_finish_verified === false && e.physical_edition_verified === false && e.vendor_licence_verified === false && e.owner_business_decision.kind === DECISION && e.owner_business_decision.source_wide_approval === false && e.owner_business_decision.human_review_required === false, 'Finite exact artwork decision changed');
}

export function validateRows(plan, table) {
  const rows = plan.rows;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen subset size');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === 'neo4' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.source_code === 'scrydex' && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 52, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 13, variants: 13, names: 26, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 11 && cards.filter(card => card.finish_code === 'holo').length === 2, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Darkness final plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 56 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 13, 'Exact accepted Darkness final archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 39, object_references: 52, unique_image_members: 52, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
