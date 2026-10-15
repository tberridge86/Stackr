import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '8fbc44ccb8529893f365c8f5fc79a4c39718eb495a43e6800c000551da8c7eff';
export const APPROVAL_SHA = '4136335d75d6c5ad43096386735edc65f1a080cb7ae36aaeb3c00a042beddcc3';
export const IDENTITY_TABLE_SHA = 'fe7f94cf0ef8380eb069e2e83eef347fdf8316d482a8ce95019011e9d9b285a1';
export const SAVED_TARGETS_SHA = 'd9a048c8b176efcda01bfa84fe325683b5aeded65650d681b04c8133b73b1e93';
export const SOURCE_MANIFEST_SHA = '4fa6a69374a60b6e9153c6848f8fdc89573cb0b8ee74ed331d050145baaebe2c';
export const ARCHIVE_SHA = '55979f2045cd46b2edbfca1d0a6e64ffff5fd492cdf9fd8ebe95e4d3144e4200';
export const ARCHIVE_ID = 644418419;
export const ARCHIVE_BYTES = 11701598;
export const FRONTS = 21;
export const QUEUE_ID = 'STACKR-JA-NEO1-FINAL-FRONTS-20261015-021';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "4401e4bdc1a108bad633d0fa57153458dd94425f3fab87354a499150b11ac21f",
  "finiteDecision": "e87071af2f7c5d4e2c464b7a322205a8fc59d3cbcf47ff5e7d2301e321619ead",
  "independentSelection": "91d78cd79d853360a829d0b6b9a20d71e4ed5772e3f93c36411f1c22ffe34084",
  "independentPrivateReview": "6f45d674a9540615254108744af466befc4813b4cb1824afd6e8482452eeb99a"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "f6a9151d-3aa1-4f32-ab52-2e73316d7c4d": {
    "alias": "076",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-76",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-76/large",
    "variant_id": "feb2a7b6-22b0-4b94-92ed-aed61b6e1608",
    "finish": "normal",
    "current_native_label": "ポケモンマーチ",
    "original_sha256": "8b1720b3ac5d49dfef588d3757665947738e4d4f2236f8b759b33d402537d27a",
    "original_mime": "image/webp",
    "body_sha256": "29c70413ab843ef0fa4a979255bf90e24fe1426a8b282c481826f03d819c3bab",
    "width": 567,
    "height": 800
  },
  "320b46c3-0fe0-4fb2-a2d2-3009e5ceff77": {
    "alias": "077",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-77",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-77/large",
    "variant_id": "9671cb36-1ee2-4a35-9a62-bc057bfd3727",
    "finish": "normal",
    "current_native_label": "Moomooミルク",
    "original_sha256": "88f7798a26302788df3a677365ced03a1a854e0f92c4803e51dea6a9e3fb2495",
    "original_mime": "image/webp",
    "body_sha256": "df2f53d9b909b9346e96cd57e2bd4001dabf0220f099a17c598ff40b66474bde",
    "width": 570,
    "height": 799
  },
  "1f2168ef-df8d-4117-891f-777b6bfe0b44": {
    "alias": "078",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-78",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-78/large",
    "variant_id": "3b6ed714-f899-46dc-b34f-0be351f24abd",
    "finish": "normal",
    "current_native_label": "エルム教授",
    "original_sha256": "c824ec6fa5a5014653569ebecad557a9261c728c77099eeba992bdaff1f55402",
    "original_mime": "image/webp",
    "body_sha256": "8632549f3db56020d9c5aa32f169ce5fdbddc6e6671f9547c86d67dd0dd41fb3",
    "width": 570,
    "height": 799
  },
  "0f000159-0bf6-466b-bdc3-cd7b8593facc": {
    "alias": "079",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-79",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-79/large",
    "variant_id": "42c104ef-3c90-4285-83e0-89dc3dcc369f",
    "finish": "normal",
    "current_native_label": "ゴールドベリー",
    "original_sha256": "83b3fd407a7e93e8c280820b82a40e9f8386126083b2f71fc638dca1c582e3d5",
    "original_mime": "image/webp",
    "body_sha256": "d3177b5590b9f047c7ee834853632a1a5fbd6eae58679cc746c90400125d9cc1",
    "width": 570,
    "height": 797
  },
  "b18b7060-9a5a-45d5-bfc2-e02646a7515e": {
    "alias": "080",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-80",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-80/large",
    "variant_id": "bf205081-425d-4075-a9e5-dd03a966fbc0",
    "finish": "normal",
    "current_native_label": "カードフリップゲーム",
    "original_sha256": "23c2582093e63a0982c40b7c856f1be24b9749e7427f807987407636f8ed1f0e",
    "original_mime": "image/webp",
    "body_sha256": "11c70a5333384c975a53aae27aacf59d6c61981ab2fc4ac25f0924d71d8dd828",
    "width": 569,
    "height": 800
  },
  "3f189403-dddb-4191-bb5c-35b776d51c48": {
    "alias": "081",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-81",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-81/large",
    "variant_id": "321f6fa2-ffa1-40f9-96f5-093c054c0134",
    "finish": "normal",
    "current_native_label": "ミラクルベリー",
    "original_sha256": "ded2e9a1c262a3c174d3a7fe03525ab62545544b5aacbe908ab6400a3f0d9d25",
    "original_mime": "image/webp",
    "body_sha256": "72ef8776083b6133219ef1f91f8df798c834feae4969bbb084a000c1f9ca6dbf",
    "width": 570,
    "height": 799
  },
  "e26afa98-1bdb-4e1a-841e-05a5028f9de1": {
    "alias": "082",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-82",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-82/large",
    "variant_id": "a16e28ac-3084-4e22-bf2e-a7971fd705d9",
    "finish": "normal",
    "current_native_label": "新しいpokedex",
    "original_sha256": "8e29dbbe9506d7c2d6d1e690b570a32ab57e5a9c300f03a0965b2970c358c1c8",
    "original_mime": "image/webp",
    "body_sha256": "237c7d51f9f573a8ac2cc76827c821fcadf7c0cbecce923210703a34fee9e9d8",
    "width": 570,
    "height": 799
  },
  "6b63e8ca-61d8-461a-877c-151172f83146": {
    "alias": "083",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-83",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-83/large",
    "variant_id": "74b0cfc9-a1ed-4d92-a859-e9d5091ba356",
    "finish": "normal",
    "current_native_label": "スーパースクープアップ",
    "original_sha256": "1ba24f2e918d36fbf5684fee37dbea4f6933fda1c28c2abc3d9256bdf4e5933c",
    "original_mime": "image/webp",
    "body_sha256": "05da83d0e6c354d999d70f89b9398e9c1f8afe340c1cecf58b6672c8729dd48b",
    "width": 570,
    "height": 799
  },
  "559eae55-5efd-40b6-b009-06be5f4f0098": {
    "alias": "084",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-84",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-84/large",
    "variant_id": "d70e8d92-ecce-4299-ab02-3209c1c82df7",
    "finish": "normal",
    "current_native_label": "ビルのテレポーター",
    "original_sha256": "47c3c04abc7856fd05439eba5046a04edee88e52eb03a3ce76d07cdefd55c48f",
    "original_mime": "image/webp",
    "body_sha256": "91e91117332fe355317c2f6ff7a0cb22dbe451093e719dba954a9ba65dc23b72",
    "width": 570,
    "height": 799
  },
  "dabf24bc-301c-4836-b2c8-c72b3f218029": {
    "alias": "085",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-85",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-85/large",
    "variant_id": "3cc88d1c-9124-4b89-8801-07986f407bb0",
    "finish": "normal",
    "current_native_label": "スプラウトタワー",
    "original_sha256": "c654d1776ecd42857e04446c69e5ae3305beb1148bc1dc39d4fb73a76046812c",
    "original_mime": "image/webp",
    "body_sha256": "91793fbd28a48b578a2cd6fb8cde2fa07b325ef0cb566607342aef834cf85edf",
    "width": 569,
    "height": 800
  },
  "913471d6-7c94-4ec3-b3bd-066910afebf3": {
    "alias": "086",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-86",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-86/large",
    "variant_id": "3f6f22cd-6317-47ad-be2e-1009613d2388",
    "finish": "normal",
    "current_native_label": "ecogym",
    "original_sha256": "07c7229813781a0e8991b6400b3c5cd7eb075b0696f4fbe1d009460e93b3a7d2",
    "original_mime": "image/webp",
    "body_sha256": "6f8f090e5fa7320fa01cd02a0f6a6119e9703619712993bf7d9176eeef35e2d1",
    "width": 569,
    "height": 800
  },
  "ea7f6a6e-10db-4ded-9221-db129a21c6b8": {
    "alias": "087",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-87",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-87/large",
    "variant_id": "fc576d84-bdf1-47d5-aacc-f66e932f80ff",
    "finish": "normal",
    "current_native_label": "エネルギー電荷",
    "original_sha256": "6b48ace4bb3c8581ef06edfa38efdc549b2774f75820031878a546116cfa2fe8",
    "original_mime": "image/webp",
    "body_sha256": "d7e1b84c5c92ae7633a29b0a09701fbc440bc33d3d45d68920f1e6631d898b82",
    "width": 567,
    "height": 800
  },
  "a071b7ae-3d85-4259-b58f-abaa0b30d666": {
    "alias": "088",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-88",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-88/large",
    "variant_id": "e9fbbf70-8354-4160-a6fa-2a2c5a782309",
    "finish": "normal",
    "current_native_label": "フォーカスバンド",
    "original_sha256": "26c320347b75881f4b6848f45a76d1a8b08d76752547fb8e639ffee33edb36c0",
    "original_mime": "image/webp",
    "body_sha256": "1f13aa955fa9df7001228d876cb4fe5b0bf5b3d9b71ab041c78bceb44d6f15d6",
    "width": 570,
    "height": 797
  },
  "80fe609b-0b7f-4c73-aa28-4e146a91880c": {
    "alias": "089",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-89",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-89/large",
    "variant_id": "0c9cf82c-f89d-4c8a-9f92-f8c35f0d8c07",
    "finish": "normal",
    "current_native_label": "メアリー",
    "original_sha256": "6819727b8d72775bd66c0f1f143ae93818011d0ede84070f706f442cc1bce137",
    "original_mime": "image/webp",
    "body_sha256": "07bfbeb12e9b9621eef75b26aefbb2b98d932c04753a5dfc97d67b0b2130eab1",
    "width": 569,
    "height": 800
  },
  "3bdfd2dd-68db-41c8-8f59-4f384abe40d1": {
    "alias": "090",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-90",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-90/large",
    "variant_id": "55c56176-49d5-4e7f-a7d4-f5be8afbb8b6",
    "finish": "normal",
    "current_native_label": "アーケードゲーム",
    "original_sha256": "70c57ce57c50ddead255294f07adb3beafbfe336746c0b6a050d33830cf4be5a",
    "original_mime": "image/webp",
    "body_sha256": "a322307c3a9dae50a7487b819a15f6cd524906125d64b4fef5b2f777649153a3",
    "width": 570,
    "height": 789
  },
  "40a02759-7075-4330-8189-0014f4ab56de": {
    "alias": "091",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-91",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-91/large",
    "variant_id": "cbca8d53-d47f-41b7-8414-d06d0d430761",
    "finish": "normal",
    "current_native_label": "タイムカプセル",
    "original_sha256": "20b91a9aac2214b772ee9b917c29fd69c39057cd884f7f039124a3862e47bb0c",
    "original_mime": "image/webp",
    "body_sha256": "eb986b5d6fe8bbbd08c5e4ebd9b5d88fa65aafaad0e6481e759e6d15afe0e4fc",
    "width": 569,
    "height": 800
  },
  "fd57df1c-6369-4e10-94ad-9d644615049e": {
    "alias": "092",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-92",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-92/large",
    "variant_id": "f0f2ed7b-d295-4c01-b1d4-a31e435c0eb8",
    "finish": "normal",
    "current_native_label": "スーパーエネルギー検索",
    "original_sha256": "2ae0358c310f26da7d4626be4c6e2d5469175718c15c9159e0badba9f9230af2",
    "original_mime": "image/webp",
    "body_sha256": "4325bc7e9e257be6b42e87b64cb168ca3f410e9575ecae0005faf961ae353d8f",
    "width": 569,
    "height": 800
  },
  "97730ebb-67a6-4198-9b9c-fa9ec44356c7": {
    "alias": "093",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-93",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-93/large",
    "variant_id": "c38cdcda-b1e7-4050-b11b-f8e2ad12fff9",
    "finish": "normal",
    "current_native_label": "ポクギア",
    "original_sha256": "d57cd80d3c9ad3007edecd69a159d992b30145558b2b17cbbabd5a7ee34f6da4",
    "original_mime": "image/webp",
    "body_sha256": "b12ae9c85086efdb6ce342ad409c33d4f93a4def108aedc50d06c549373b754b",
    "width": 569,
    "height": 800
  },
  "b1ea5735-21f8-4e8f-8c8b-4931f44105e4": {
    "alias": "094",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-94",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-94/large",
    "variant_id": "741a2971-a9c6-49c5-b00e-f14d0561b76e",
    "finish": "normal",
    "current_native_label": "闇のエネルギー",
    "original_sha256": "4e42c47527231833914f6a5dbf002727c1bb5bcb55cfa6e756a141edbe868150",
    "original_mime": "image/webp",
    "body_sha256": "7c4774bc4fbec87b28fbedfcd866d705abcf92628fc17f530c990d58457cdaee",
    "width": 570,
    "height": 794
  },
  "b1188cfd-978b-4240-aa7b-872265d12a87": {
    "alias": "095",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-95",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-95/large",
    "variant_id": "9ad16e3f-b962-4315-a030-ae2abeb8ccc2",
    "finish": "holo",
    "current_native_label": "金属エネルギー",
    "original_sha256": "42bde40e6cba1155f42548de32841d0945683a2a146d928dd0d07d0e54e217c0",
    "original_mime": "image/webp",
    "body_sha256": "3e67ed0731a2abf063356ebc142e154492f968e99751d4ff97a978cdc1e0626a",
    "width": 570,
    "height": 797
  },
  "bd3707fe-0f86-4175-930b-919c1da41850": {
    "alias": "096",
    "batch_id": "JP-CARDS-006",
    "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
    "set_code": "neo1",
    "source_code": "scrydex",
    "provider": "neo1_ja-96",
    "image_url": "https://images.scrydex.com/pokemon/neo1_ja-96/large",
    "variant_id": "b77d1c12-0877-4aef-b33a-362ab9a6665a",
    "finish": "normal",
    "current_native_label": "エネルギーをリサイクルします",
    "original_sha256": "264a34d303a470a055d903a1355f959291ad96c5ca8af9bd3b79f1578d857737",
    "original_mime": "image/webp",
    "body_sha256": "c6fbbe8c7f24bb9cb4a7bb7e8b56c060710f60301f9cb4a9820fd88cd0f8080a",
    "width": 567,
    "height": 800
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-006"
  ],
  "saved_batch_tasks": 21,
  "eligible_fronts": 21,
  "by_batch": {
    "JP-CARDS-006": {
      "verified": 21,
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
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Neo1 final printing');
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
  check(isDeepStrictEqual(plan.source_counts, { scrydex: 21 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 84, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 21, variants: 21, names: 42, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 20 && cards.filter(card => card.finish_code === 'holo').length === 1, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Neo1 final plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 88 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 21, 'Exact accepted Neo1 final archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 63, object_references: 84, unique_image_members: 84, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
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
];
export function validateSourcePlan(plan) {
  check(SOURCE_CHECKPOINT_SHA && plan.source_policy_checkpoint_sha256 === SOURCE_CHECKPOINT_SHA, 'Fresh postLegacy8 V2 full-source checkpoint required');
  check(isDeepStrictEqual(plan.source_policies, existingSourcePolicies) && isDeepStrictEqual(plan.new_sources, { production: [], staging: stagingSourceFixtures }), 'No new production source or existing policy change permitted');
  for (const source of [...plan.source_policies.production, ...plan.new_sources.staging]) check(SOURCE_CODES.includes(source.code) && source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.deprecated_at === null, 'Unknown/active/sourcewide provenance rejected');
}
