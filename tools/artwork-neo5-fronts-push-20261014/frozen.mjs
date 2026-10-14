import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '2c61460916256e54919c34f4c36a97525a3664bf3b43bc7617609e22de7c402e';
export const APPROVAL_SHA = 'cc6bd02b2b653a67bc1546c846090029019d7f9f34431c3f411562e0c609fc59';
export const IDENTITY_TABLE_SHA = '7f23b89ab91ae561a188a728ecb9accff8fadd4fd0425c6a8c038b2d6ae8feeb';
export const SAVED_TARGETS_SHA = 'cd64bc1d994b29164cc6b070a6a3f63fb8dcb359d03565819798ef6c842fa8ac';
export const SOURCE_MANIFEST_SHA = 'fa397271f673a3318f59aa08128d16d1e81419b51e2222ada9da43516148e8eb';
export const ARCHIVE_SHA = '748d784ec52b09b818095d8504faa1e14433a12aafdc8272efbc8ed8f17281f7';
export const ARCHIVE_ID = 641447526;
export const ARCHIVE_BYTES = 11890305;
export const FRONTS = 22;
export const ORIGINAL_HANDOFF_SHA = 'aae43f61c4ec4e402dedb589478aff839d8a700480d4b70406fa50c0876d37c9';
export const METADATA_TARGETS_SHA = 'a0d6c1f043e9a2bc0a5510200fb99f352d2096ff4ff10704739708a8d3d41a5d';
export const FINITE_DECISION_SHA = 'f795788f88483f5be7cc8403b8a353f38e23a91416dd60d5c3f8da526f0f7e6d';
export const ROOT_SCOPE_SHA = '6cc9a33c7b1fb871959ff97a6af1cd0a12bee7e65f93f249c7f2dfe4ba393441';
export const READER_RECOVERY_SHA = 'f4b732955ec07b9f0544cdf9cff255d1a2c01225efc72cdb50f2173a2b6d55b8';
export const QUEUE_ID = 'STACKR-JP-NEO1-20261014-022';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = '769fa22e-e603-41a8-b62b-920a4abc660b';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Populated from the inspected manifest; provider IDs are not guessed from Dex numbers.
const knownPrintings = {
  "eca39411-d895-4482-8d65-1aa6e03fe947": {
    "alias": "051",
    "provider": "neo1_ja-51",
    "variant_id": "9e527401-52a1-470e-8acb-d99657c7bd1c",
    "finish": "normal",
    "dex": "No.185",
    "printed_native_name": "ウソッキー",
    "current_native_label": "sudowoodo",
    "original_sha256": "2a9d89f08a47c236a81bcb77f29c08eda45461d27a0f060c7b9e345e17c6bd3c",
    "metadata_sha256": "705088b0f2827dd55213b61b3ce812459fd03da8d3144c6251fd11bf98fcb712",
    "metadata_attacks_sha256": "13f14943bd2d8d35dc524c4030a72e717a71119510f3cc96f3c178330bcaf2ea",
    "source_body_sha256": "f8c7ced1d692a422377b7eb4042c5447919fd97f1c26b337c8fce935ee71eb38"
  },
  "18846511-394c-4a23-a456-9f58222c2997": {
    "alias": "052",
    "provider": "neo1_ja-52",
    "variant_id": "da03a350-db35-4d09-9a35-7cf81a6643dd",
    "finish": "normal",
    "dex": "No.207",
    "printed_native_name": "グライガー",
    "current_native_label": "グリガー",
    "original_sha256": "00f7a73a240c6b93920891809f011c6732ababf64e96c62037948570aae35862",
    "metadata_sha256": "fca71b99c8eb73c139b025d726786dc054469f3b0139490f8090112f8b81b5c4",
    "metadata_attacks_sha256": "b008cc68ee59d1e42e729f8bf358b14bbff561a3621cf984b862ee72e89ddb5e",
    "source_body_sha256": "9b523fe5442e7e6f35ae5241183ae19786e13f05fbae5749c970baa5e740c542"
  },
  "6d3ab9b6-8590-4832-9a4f-28451bfa959e": {
    "alias": "053",
    "provider": "neo1_ja-53",
    "variant_id": "42cbc90b-e398-4d35-8692-20ce0aaa4d88",
    "finish": "normal",
    "dex": "No.231",
    "printed_native_name": "ゴマゾウ",
    "current_native_label": "ファンピー",
    "original_sha256": "318d4ce2501a5c7c0b370e97ba41535051847af6e0df5b423aca394262a1443c",
    "metadata_sha256": "b786f8110b1d2918419d135dbae2c2c2d913fd8d60cc3fe9aed55886e849a5c7",
    "metadata_attacks_sha256": "b889881f77722c85e2a0fc062bb53c53969a21a848499ca32e32afc79314307f",
    "source_body_sha256": "0ddf2dcfef57241a3a6cc159c1b7eecedb4ae3210c82685f48aef8833d45310f"
  },
  "754c26cf-68bb-4296-a816-ef0bfdb0db40": {
    "alias": "054",
    "provider": "neo1_ja-54",
    "variant_id": "d3a65311-b137-478d-8549-5efc62a915cb",
    "finish": "normal",
    "dex": "No.232",
    "printed_native_name": "ドンファン",
    "current_native_label": "ドンファン",
    "original_sha256": "ad629cc06bb5d0c6cf4fe02f763115e01705a697ac093d24e89682091ba2450e",
    "metadata_sha256": "a436f8bd4b733b89d852f827cce81fd6bd7570cd1fc2f1541172e9de3bfad62a",
    "metadata_attacks_sha256": "d967f51f7414a7cef8f8e9dce5b131740a3a11e5bbde12b060402bff06416be1",
    "source_body_sha256": "6722177a059e06beca8ed88de0f8d0fcc90aa7684d1dd2a20fa4762679efb192"
  },
  "10ac49ce-527b-4455-9853-086b447fca7d": {
    "alias": "055",
    "provider": "neo1_ja-55",
    "variant_id": "ebea8864-77e5-4220-aa22-c527942cf3de",
    "finish": "normal",
    "dex": "No.198",
    "printed_native_name": "ヤミカラス",
    "current_native_label": "マークロウ",
    "original_sha256": "79bda474037301f197642c5b1f1020cfdc2a999064a24c619336010f4cd0d5f4",
    "metadata_sha256": "5902ff39c2f7fdca8a1966b78ba842178b2fb7449828b37130d502fcde29dbf5",
    "metadata_attacks_sha256": "ce71355f4b669506cbd003d937a0df8ecffd762b2acfb87b2bc95d2eeb97c3e6",
    "source_body_sha256": "c22ef70b820c82363e89474c370a2e612b3982ddb4f6eb1e1fb3d503fddc1450"
  },
  "0e993e93-502f-4ef4-958f-77414e5b45aa": {
    "alias": "056",
    "provider": "neo1_ja-56",
    "variant_id": "48f843c1-2301-46da-a44d-4141ba9acbcf",
    "finish": "normal",
    "dex": "No.215",
    "printed_native_name": "ニューラ",
    "current_native_label": "スニーエル",
    "original_sha256": "2eb1dbbbf5b9394d1568c664017fe61963f13e36eb85012a092caeed7af6c7f7",
    "metadata_sha256": "0227652ddde267a81f7b4eccae38f3657ca3cf0339e02ddd0896a6841799ec31",
    "metadata_attacks_sha256": "695283c7a0cf9ee95e934f8d67a3c151b6653302ea896c0895b0d029410eedf6",
    "source_body_sha256": "6746e82ad959e34b3e4f2ec46b8b129726fd3809df118dbd73ae90cbed1395b9"
  },
  "b950e929-e093-4f8b-b2fd-c956905fcaef": {
    "alias": "057",
    "provider": "neo1_ja-57",
    "variant_id": "1e5daf71-2dd5-4a59-bb58-42fcc5988cb4",
    "finish": "holo",
    "dex": "No.208",
    "printed_native_name": "ハガネール",
    "current_native_label": "Steelix",
    "original_sha256": "8b161eb022bbc769f0b1c2f7517f31f52e8a30ec806d8bf478aeedbe6c73b061",
    "metadata_sha256": "14d5029e2e8032d1997beb234ada5cdf4476dde652fb1ddd78b26b76c7d2e66a",
    "metadata_attacks_sha256": "1e956f252a7f82a78b5eed9744d6793cf9e5540a85c1ce412ed829cd035869cf",
    "source_body_sha256": "3e6ee8b2634879463810f33f6cf1abefd22fba46e57bc4cb4a738f3627c4f73c"
  },
  "9cc050ef-28f7-4955-b6a4-1404a077b241": {
    "alias": "058",
    "provider": "neo1_ja-58",
    "variant_id": "895d1351-538e-4e7e-832d-24a769406ad8",
    "finish": "holo",
    "dex": "No.227",
    "printed_native_name": "エアームド",
    "current_native_label": "スカルモリー",
    "original_sha256": "df55e92379fc7d7f18aafba4e4191551de8ebbeea897d0935838048413a88210",
    "metadata_sha256": "9f273dac6824a075de67e25d0c0b4908a68ff897b07e61140bdbcf70840528ff",
    "metadata_attacks_sha256": "2fc1369a04562a05e41c72523046b7040bf0c7cded0b2c666a7dcf02c715905d",
    "source_body_sha256": "0396c2f119b0028bfc5c1b629c543695c0f35957494824948a9d8e45d46ac364"
  },
  "fed0b8ce-1074-4600-aeb9-07a7b1a998ec": {
    "alias": "059",
    "provider": "neo1_ja-59",
    "variant_id": "e95bff2e-9769-49a1-b472-ce8fee045d21",
    "finish": "normal",
    "dex": "No.161",
    "printed_native_name": "オタチ",
    "current_native_label": "セントレット",
    "original_sha256": "c6d1e3ff667818246f59e01b2b7f040ca3fa6db2afabe8fa90c3ff1ff27b3653",
    "metadata_sha256": "da29bb4e0b7cc6abe94b2c701261643d62c98e428a4159a01c8cc7d4030427e6",
    "metadata_attacks_sha256": "9697397052eb1ca33add1ee3d9f9f31ac80c752962a51ee72fa2392d38fa0685",
    "source_body_sha256": "353ccbf220a5a06ba63277c950a8ae3ca28a10fad101332e7dc03f355d61e883"
  },
  "6e1d67e2-5584-4b97-9685-5babc78e3fa8": {
    "alias": "060",
    "provider": "neo1_ja-60",
    "variant_id": "ce09c865-e5ba-4a0c-ae9a-f33a9ef82d47",
    "finish": "normal",
    "dex": "No.163",
    "printed_native_name": "ホーホー",
    "current_native_label": "hoothoot",
    "original_sha256": "6b1d6d56996baa5ee2d7ad997393ecbdd2a2a816a38aed0631789bbd97350da7",
    "metadata_sha256": "2966ed0bf0b959fd63b816a2194719148e257223850c2bd1fa3316d7ea5d4e57",
    "metadata_attacks_sha256": "18695ed13972ca9293bf555392a7465c9fbd20e798e9262f6b7c2e6bbd70c322",
    "source_body_sha256": "038c62fadfabd64926674176054a00a39493d38d8fb485cd49fbf60faf364354"
  },
  "a2a24b14-ce0e-4020-b092-12a0bf90ca87": {
    "alias": "061",
    "provider": "neo1_ja-61",
    "variant_id": "28df9f76-8293-4830-b831-7e6ffa6822b4",
    "finish": "normal",
    "dex": "No.209",
    "printed_native_name": "ブルー",
    "current_native_label": "Snubbull",
    "original_sha256": "c208a8e70355138f37373c4267cf4e288885dc3febf51775767e19491695c0c2",
    "metadata_sha256": "7d8ff43115aa89b31b403c6ef0495236a5cc5eb6d5189a933e500d9fc07f566b",
    "metadata_attacks_sha256": "9131b7d023b02bc8dc51aaa9e093151245c790f0aa363f2b811f4b0207a99fcd",
    "source_body_sha256": "b0a43d22a6748fb83ffcd151f0636227527cbb360622e52250df93a7ec11e7df"
  },
  "6fc73fcf-b89e-48b7-85a4-3946510165fb": {
    "alias": "062",
    "provider": "neo1_ja-62",
    "variant_id": "a7044cb2-c380-4d5c-83b8-3ec88c642fc1",
    "finish": "normal",
    "dex": "No.234",
    "printed_native_name": "オドシシ",
    "current_native_label": "スタントラー",
    "original_sha256": "6effa989070887d3751b4e8f59dd7a26f194e6e94e1bde4aff343a7287594f7a",
    "metadata_sha256": "e935ed005411972e773df187c87f37078ec5d6199b607c43239e5afe26379304",
    "metadata_attacks_sha256": "3dd679a53656d9e3f38c3c63326a7a3189d2b1d797d270f6ec20acac903b1fc8",
    "source_body_sha256": "1a5310d157a4ac8d5f971d4dfac9b94648a2d2bb6148d9e26bb22ea503237fa4"
  },
  "73db5808-2875-44ab-93ea-9d2c8bdd2f2b": {
    "alias": "063",
    "provider": "neo1_ja-63",
    "variant_id": "08fbf8fe-87b9-47b3-b74d-312781b3aa0b",
    "finish": "normal",
    "dex": "No.035",
    "printed_native_name": "ピッピ",
    "current_native_label": "クリーフ",
    "original_sha256": "99e43161d4bf7fb2e36c4c8a32acdc62ab459e51626bd29cf6beade61a4fd262",
    "metadata_sha256": "825725a3c1482aa8cd6a0d5d207bf68561ae376feb71a31207c1cad0056be510",
    "metadata_attacks_sha256": "de044680fa93b24eed23073f3659660a7989c29fe07d784c666c03c57439cbd5",
    "source_body_sha256": "e407e5bc6d0b93157c8186c12d5481febd6bf5446847e79d1119de87b224fce7"
  },
  "62bae39a-d38c-4af3-83e9-eb884e17191d": {
    "alias": "064",
    "provider": "neo1_ja-64",
    "variant_id": "241fd141-49c0-428a-9246-767ef8183abc",
    "finish": "normal",
    "dex": "No.162",
    "printed_native_name": "オオタチ",
    "current_native_label": "Furret",
    "original_sha256": "446e42e1b5d71364b004d767d6286fa7a893302eadf69d75caf8e07d452adb87",
    "metadata_sha256": "655b65afe10db59b4e8f725384cf6cac4ff62387a4a71611cb09d1f5f74bac6c",
    "metadata_attacks_sha256": "5435c0b8fd0639207ff6b6cb5adc399a850c62f386cc5fbaf5b581340d247b1e",
    "source_body_sha256": "7d4bea31ed20aa1436b6bbef2088e26ac13027de6bbbbd83f34ecd5ae5c06f58"
  },
  "e3c9c2ed-ee92-465f-a7c2-90f00be493bc": {
    "alias": "065",
    "provider": "neo1_ja-65",
    "variant_id": "c935ab13-88ea-433b-a343-9a18f614d8a4",
    "finish": "normal",
    "dex": "No.164",
    "printed_native_name": "ヨルノズク",
    "current_native_label": "ノクトウル",
    "original_sha256": "5812f0d4fa3616905e49a79628bdf102d274d9a53ed7f143f55a70795891a8b8",
    "metadata_sha256": "053a04f3e18a38b36199b1f711e569b374fd3e35ec4bded5a7c78c978098a121",
    "metadata_attacks_sha256": "c68d3d45fe77743bd52e9ddb0ff7dcc3f68a0d410ad91cbe851201d31d4fd901",
    "source_body_sha256": "74024a51d6bd5f8b15afa25b39b42779facfb423185d96200e3e8905127db452"
  },
  "fee3b7f6-e9c3-414c-942f-89748ad44032": {
    "alias": "066",
    "provider": "neo1_ja-66",
    "variant_id": "4ddb38a3-4753-4e1c-a998-ccb1702a812d",
    "finish": "normal",
    "dex": "No.175",
    "printed_native_name": "トゲピー",
    "current_native_label": "togepi",
    "original_sha256": "9a8c1989ac89f0a2b94d699d22407583e8e97aefbb065e3b2c26f93f53446cd8",
    "metadata_sha256": "3f107b4fb41e9ff268e56b3d5b7d32736291e22f4eecf422bdfa2de05d09d6c7",
    "metadata_attacks_sha256": "76c91684cba73307adc8becf2f790f3afa9d6dc29e7db336f53d76229ee12b12",
    "source_body_sha256": "eb172e7e45719740e6c17c1b63a7eb3cbd48db9d2c9a5dd49c4e5e378b023bad"
  },
  "ca953242-537f-4839-aa41-c761dc2169e8": {
    "alias": "067",
    "provider": "neo1_ja-67",
    "variant_id": "cc45f170-4a18-46e5-b542-5f73a4c9c328",
    "finish": "normal",
    "dex": "No.190",
    "printed_native_name": "エイパム",
    "current_native_label": "aipom",
    "original_sha256": "fdc49099f090b5c4ec2598934e04d1969eded4a0813791db80accb6f7a6ffdf9",
    "metadata_sha256": "da76640738b83907547ff9c3887803409914fb1a6da28f95342c53779908e33a",
    "metadata_attacks_sha256": "02bb329aeb6e96c637d49904a2368a2d98ef63d47b0a22f9cabf300aaf28be82",
    "source_body_sha256": "4c1f66974f162837cd293e0368b8ea82ee3eed29d5792448ef852e5efe7a124a"
  },
  "37fb4303-a9cf-434e-95fd-26efdd7b46ff": {
    "alias": "068",
    "provider": "neo1_ja-68",
    "variant_id": "7d20075c-40d2-4778-977c-8bdc55165e1a",
    "finish": "normal",
    "dex": "No.210",
    "printed_native_name": "グランブル",
    "current_native_label": "グランブル",
    "original_sha256": "09a9164de9d770b19b09eb30ca988b326352e592a91c2c5177d66e9ab376b6d4",
    "metadata_sha256": "f3f76ae79f98ce6ed0b24b2c134af482efabbce5bca3a516043469d020dd90ae",
    "metadata_attacks_sha256": "a561b6ec3142de3d65943b556dd5ab3442fdcbd682ce288e0cf331ceb9cd22cc",
    "source_body_sha256": "e97a4656f1f910f5349a8d6b53ffa0d38dffe87a7b693ff17f58299963db0e7e"
  },
  "9548140e-6a06-4cc8-925f-602f5bc5b739": {
    "alias": "069",
    "provider": "neo1_ja-69",
    "variant_id": "bc44bcd5-d986-4efc-a4bf-02d8d392fca0",
    "finish": "normal",
    "dex": "No.241",
    "printed_native_name": "ミルタンク",
    "current_native_label": "ミルタンク",
    "original_sha256": "3b42e3215b44f3410c68543db836458564943765af97f97781511f3235f466c5",
    "metadata_sha256": "93f60a98178247fe943efc704ca769b9e2450b30e685033045995a5559b07315",
    "metadata_attacks_sha256": "53b81acf21cc87a98ba62e68c45755dc79ac4e7a41158e505d0ce581974647d4",
    "source_body_sha256": "3b6028a4340231222be805b1ef946cee5093930777e45159097efae0c01d662d"
  },
  "901d689a-4ab9-46f9-ab17-36b32d03da88": {
    "alias": "070",
    "provider": "neo1_ja-70",
    "variant_id": "d5ab7535-d80b-479e-8258-698f403e9a70",
    "finish": "normal",
    "dex": "No.173",
    "printed_native_name": "ピィ",
    "current_native_label": "クレファ",
    "original_sha256": "3524a240b426cb2575ada8701affc7cc5f17cd3b1cbf71dcc0b656f0dae209f1",
    "metadata_sha256": "316281712177ac0342562d71a4df0f2caa92d17967f595dfb3af5279e462da51",
    "metadata_attacks_sha256": "def294d0febff4996ec97251aacf9f754f90b09892138ba9cab9296bb149dd09",
    "source_body_sha256": "88e0b712f382e1d6c473f407719173bfca7dd4bf10b5c4e87f60463c364feb4c"
  },
  "5165052b-26fd-42da-879c-e28945be12cb": {
    "alias": "071",
    "provider": "neo1_ja-71",
    "variant_id": "ff171759-55d6-4878-9201-82cede7dd22d",
    "finish": "holo",
    "dex": "No.176",
    "printed_native_name": "トゲチック",
    "current_native_label": "togetic",
    "original_sha256": "c64283f7fe07419ac7b47bba0d4bf07af9d4f48b85db4005e90ebff440955da8",
    "metadata_sha256": "4fe3eda0080948aaaeadaab8f76b591814e37c3e192bda0a7949c9a5407f27d1",
    "metadata_attacks_sha256": "e770ff14be961977007e85774c4eb108f94c9d646bfc6bf08db8801284f63844",
    "source_body_sha256": "0af8681b0432f47953df1180b63917e5d823ae172134d5478ca9733d8bb0bfa0"
  },
  "c86cc4f0-b598-4850-8c81-8f7f81a9caa5": {
    "alias": "072",
    "provider": "neo1_ja-72",
    "variant_id": "e7cb3a07-ff35-47df-a51f-edbe24f805d2",
    "finish": "holo",
    "dex": "No.249",
    "printed_native_name": "ルギア",
    "current_native_label": "ルギア",
    "original_sha256": "e4557d8dd8fec415b51f98d083b520ca6f562c7b2262cd097bf76e97e40937d1",
    "metadata_sha256": "a5d0dd5e54b2bb18cac8331575930add3242721f3dc79e11206fc48a1eb4886f",
    "metadata_attacks_sha256": "036eff404cdb499a6581ea13111ea693de8c93f9bbbd01380f006327dd7b7731",
    "source_body_sha256": "f7567e103de9300b48cfd122dfb2a46b7a0499bc8d0014ae48137f0202b3f2e9"
  }
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id, 'Unknown or relabelled Neo printing');
  check(row.card_native_name === known.current_native_label, 'Current native label must be preserved');
  return known;
}

export function validateSavedTargets(bytes) {
  check(digest(bytes) === SAVED_TARGETS_SHA, 'Saved fixed batch identities changed');
  const saved = JSON.parse(bytes);
  check(saved.length === FRONTS && new Set(saved.map(row => row.printing_id)).size === FRONTS, 'Wrong saved fixed batch size');
  return saved;
}

export function validateIdentityTable(bytes, saved) {
  check(digest(bytes) === IDENTITY_TABLE_SHA, 'Frozen identity table bytes changed');
  const table = JSON.parse(bytes);
  check(table.length === FRONTS && new Set(table.map(row => row.printing_id)).size === FRONTS, 'Wrong exact identity table scope');
  for (const row of table) {
    const previous = saved.find(target => target.printing_id === row.printing_id);
    check(previous && isDeepStrictEqual(selectFields(row, canonicalFields), selectFields(previous, canonicalFields)), 'Identity outside saved fixed batch');
    const known = knownFor(row);
    check(row.printed_native_name === known.printed_native_name && row.printed_national_dex === known.dex, 'Printed Japanese identity changed');
  }
  return table;
}

function validatePrintedDamage(row) {
  const { source_body: body, source_metadata_sha256: metadataSha } = row.evidence;
  for (const [index, attack] of body.metadata_attacks.entries()) {
    if ((attack.damage ?? null) === body.attack_damage[index]) continue;
    const witness = body.formula_only_damage_witness;
    const discrepancy = body.provider_metadata_discrepancies.find(item => item.attackIndex === 1 && item.reason === 'source_formula_copied_into_damage_field_without_separate_printed_numeric_glyph');
    check(row.printing_id === '754c26cf-68bb-4296-a816-ef0bfdb0db40' && row.collector_number === '054' && row.provider_id === 'neo1_ja-54' && index === 0 && row.objects[0].sha256 === 'ad629cc06bb5d0c6cf4fe02f763115e01705a697ac093d24e89682091ba2450e' && metadataSha === 'a436f8bd4b733b89d852f827cce81fd6bd7570cd1fc2f1541172e9de3bfad62a' && body.metadata_attacks_sha256 === 'd967f51f7414a7cef8f8e9dce5b131740a3a11e5bbde12b060402bff06416be1', 'Unbound printed damage exception');
    check(attack.name === 'じたばた' && isDeepStrictEqual(attack.cost, ['闘']) && attack.damage === '10×' && attack.text === '自分にのっているダメージカウンターの数×10のダメージ。' && body.attack_damage[index] === null && body.printed_attack_names[index] === 'じたばた', 'Donphan ordered attack/formula bridge changed');
    check(isDeepStrictEqual(witness, { attack_index: 1, formula_visible_in_body: true, numeric_damage_glyph_absent: true, observed_body_formula: attack.text }) && discrepancy?.sourceNativeAttackName === attack.name && discrepancy.sourceDamage === '10×' && discrepancy.observedPrintedDamage === null && discrepancy.formulaVisibleInBody === true && discrepancy.observedBodyFormula === attack.text && discrepancy.pixelResolution === true && discrepancy.canonicalCorrection === false, 'Actual Donphan formula-only damage witness changed');
  }
}

function validateEvidence(row, expected, known) {
  const evidence = row.evidence;
  const printed = evidence.printed_identity;
  const pixels = evidence.pixel_identity;
  const body = evidence.source_body;
  check(evidence.source_url === row.image_url && evidence.provider_id === row.provider_id && evidence.artwork_scope === 'printing_front', 'Source front evidence changed');
  check(evidence.source_metadata_sha256 === known.metadata_sha256, 'Retained per-printing metadata hash changed');
  check(printed.canonical_alias === known.alias && printed.printed_national_dex === known.dex && printed.verified_printed_native_name === known.printed_native_name && body.printed_dex_number === known.dex && body.printed_name === known.printed_native_name, 'Printed National Dex/name crosswalk changed');
  check(printed.canonical_alias_is_not_printed_national_dex === true && printed.current_native_label_not_used_for_match === true && printed.current_native_label === row.card_native_name, 'Catalogue alias cannot substitute for printed National Dex; current label remains separate');
  check(printed.known_native_label_defect_retained_without_write === (known.current_native_label !== known.printed_native_name), 'Known label defect must remain explicit');
  check(body.hp === evidence.source_signature.hp && evidence.source_signature.dex.length === 1 && known.dex === `No.${String(evidence.source_signature.dex[0]).padStart(3, '0')}` && body.rules_or_attack_text_visible === true && typeof body.artist === 'string' && body.artist.length > 0 && Array.isArray(body.attack_costs) && Array.isArray(body.attack_damage), 'Inspected Japanese body/signature evidence required');
  check(digest(Buffer.from(JSON.stringify(body))) === known.source_body_sha256, 'Frozen inspected source body/ordered attack bridge changed');
  check(Array.isArray(body.metadata_attacks) && Array.isArray(body.provider_metadata_discrepancies) && isDeepStrictEqual(body.metadata_attacks.map(attack => attack.cost), body.attack_costs) && body.provider_metadata_discrepancies.every(discrepancy => discrepancy.pixelResolution === true && discrepancy.canonicalCorrection === false), 'Retained provider discrepancy or ordered attack bridge changed');
  check(body.metadata_attacks_sha256 === known.metadata_attacks_sha256 && digest(Buffer.from(JSON.stringify(body.metadata_attacks))) === known.metadata_attacks_sha256, 'Retained ordered metadata attacks hash changed');
  validatePrintedDamage(row);
  const support = body.source_variant_support;
  const providerFinish = known.finish === 'normal' ? 'normal' : 'holofoil';
  check(support.currentFinish === known.finish && support.providerVariant === providerFinish && isDeepStrictEqual(support.sourceNames, [providerFinish]) && support.metadataLabelSupported === true && support.physicalProof === false, 'Retained source variant label evidence changed');
  check(body.neo_expansion_symbol_observed === true && typeof body.rarity_mark === 'string' && body.rarity_mark.length > 0 && Array.isArray(body.metadata_attacks) && body.metadata_attacks.length === body.attack_costs.length && body.attack_damage.length === body.attack_costs.length && Array.isArray(body.provider_metadata_discrepancies), 'Retained body/cost/damage witnesses required');
  for (const field of ['whole_original_inspected', 'full_frame_visible', 'name_number_and_symbol_readable', 'fine_print_readable']) check(pixels[field] === true, `Readable whole original required: ${field}`);
  for (const field of ['copyright_or_date_line_visible', 'copyright_year_inferred', 'edition_stamp_visible', 'edition_or_distribution_certified', 'material_foil_finish_certified']) check(pixels[field] === false, `Unsupported copyright, edition or material claim: ${field}`);
  check(pixels.physical_card_or_material_not_observed === true && pixels.source_image_does_not_certify_physical_finish === true && typeof pixels.source_image_has_rendered_foil_like_background === 'boolean', 'Source image cannot certify physical material');
  check(!Object.hasOwn(pixels, 'copyright_year') && !Object.hasOwn(body, 'copyright_year'), 'No visible copyright year; release date cannot be inferred');
  const limits = evidence.identity_limits;
  check(limits.printed_national_dex_is_not_catalogue_alias === true && limits.native_label_repair_proposal_retained_separately === (known.current_native_label !== known.printed_native_name) && limits.physical_edition_certified === false && limits.physical_finish_certified === false && limits.copyright_year_inferred === false, 'Identity limitations changed');
  const checks = evidence.identity_checks;
  check(checks.savedMetadataMatched === true && checks.currentProductionCardBindingMatched === true && checks.printedNationalDexOpticallyVerified === true && checks.canonicalAliasIsNotPrintedNationalDex === true && checks.physicalFinishVerified === false, 'Source/current identity checks changed');
  check(evidence.exact_finish_verified === false && evidence.vendor_licence_verified === false && evidence.physical_edition_verified === false, 'Unsupported physical finish, edition or vendor licence');
  const decision = evidence.owner_business_decision;
  check(decision.kind === DECISION && decision.source_wide_approval === false && decision.human_review_required === false && decision.vendor_licence_verified === false, 'Finite business decision scope changed');
  check(digest(Buffer.from(JSON.stringify(evidence))) === expected.evidence_sha256, 'Frozen inspected source evidence changed');
}

export function validateRows(plan, table) {
  const { rows } = plan;
  check(rows.length === FRONTS && new Set(rows.map(row => row.printing_id)).size === FRONTS && table.length === FRONTS, 'Wrong frozen printing scope');
  check(isDeepStrictEqual(plan.source_counts, { scrydex: FRONTS }), 'Source counts changed');
  check(isDeepStrictEqual(plan.delivery_scope, { fixed_batch_id: 'JP-CARDS-005', saved_batch_tasks: 25, eligible_fronts: FRONTS, excluded_printing_ids: ['60c39900-94fe-420b-b997-60e9c64f3491', '56ae4a00-656c-4564-8d7a-831db2900857', '331a9eb6-75c4-47f1-97c8-ad2c55884ba3'], excluded_aliases: ['073', '074', '075'], exclusion_reason: 'Three Trainer aliases lack exact canonical-to-source identity evidence', whole_batch_completion_asserted: false }), 'Fixed batch delivery scope changed');
  const indexed = new Map(table.map(row => [row.printing_id, row]));
  check(indexed.size === FRONTS, 'Duplicate identity table entry');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = indexed.get(row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)), 'Frozen source identity changed');
    check(row.language_code === 'ja' && row.source_code === 'scrydex' && row.set_code === 'neo1' && row.set_id === SET_ID && row.catalogue_version_id === PRODUCTION_JA && row.batch_id === 'JP-CARDS-005', 'Only exact Japanese Neo1 batch supported');
    for (const key of ['printing_id', 'set_id', 'catalogue_version_id']) check(uuid.test(row[key]), 'Invalid canonical identity');
    check(uuid.test(row.variant_ids[0]) && row.image_url === `https://images.scrydex.com/pokemon/${known.provider}/large`, 'Invalid variant or observed image URL');
    validateEvidence(row, expected, known);
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Incomplete original and derivatives');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === expected.original_width && original.height === expected.original_height, 'Per-printing original changed');
    check(original.width >= 360 && original.height >= 504, 'Source below minimum readable detail quality');
    check(original.width <= 570 && original.height <= 800, 'This batch has no verified HD originals');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0, 'Invalid bounded object evidence');
      const extension = 'webp';
      check(object.mime_type === `image/${extension}` && object.file === `objects/${object.sha256}/${object.role}.${extension}`, 'Object path or MIME changed');
      check(object.width <= original.width && object.height <= original.height, 'Upscaled derivative');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS, 'Duplicate variant or original printing identity');
  check(indexObjects(rows).size === 88, 'Exact unique image member count changed');
  for (const environment of ['staging', 'production']) {
    const bindings = plan.binding_expectations[environment];
    check(bindings.length === FRONTS && new Set(bindings.map(card => card.variant_id)).size === FRONTS, 'Wrong binding cohort');
    for (const row of rows) {
      const found = bindings.filter(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(found.length === 1 && found[0].variant_id === row.variant_ids[0], 'Singleton variant binding changed');
      const card = found[0];
      check(card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish, 'Current supported metadata finish changed');
      for (const field of ['language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Frozen binding changed: ${field}`);
      check(card.catalogue_version_id === (environment === 'staging' ? STAGE_JA : PRODUCTION_JA), 'Wrong environment-specific Japanese version');
    }
    check(bindings.filter(card => card.finish_code === 'normal').length === 18 && bindings.filter(card => card.finish_code === 'holo').length === 4, 'Eighteen normal/four holo metadata scope changed');
    check(isDeepStrictEqual(plan.scope_counts[environment], { printings: FRONTS, variants: FRONTS, names: FRONTS * 2, sets: 1 }), 'Snapshot scope counts changed');
  }
  for (const production of plan.binding_expectations.production) {
    const staging = plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id);
    check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, staging), 'Only staging version may differ');
  }
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Neo plan bytes changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA, 'Wrong exact queue/source identity');
  check(plan.original_handoff_sha256 === ORIGINAL_HANDOFF_SHA && plan.exact_metadata_targets_sha256 === METADATA_TARGETS_SHA && plan.finite_decision_sha256 === FINITE_DECISION_SHA && plan.root_request_scope_sha256 === ROOT_SCOPE_SHA && plan.reader_recovery_decision_sha256 === READER_RECOVERY_SHA, 'New finite decision or separate reader recovery evidence changed');
  check(plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 92, 'Frozen archive changed');
  check(isDeepStrictEqual(plan.archive_metadata.map(metadata => metadata.file), METADATA_FILES) && plan.archive_metadata.every(metadata => /^[a-f0-9]{64}$/u.test(metadata.sha256) && metadata.byte_size > 0 && metadata.byte_size < 12000000), 'Frozen metadata members changed');
  validateRows(plan, table);
  validateSourcePlan(plan);
  return plan;
}

export function validateApproval(bytes) {
  check(digest(bytes) === APPROVAL_SHA, 'Frozen owner decision bytes changed');
  const approval = JSON.parse(bytes);
  check(approval.approved === true && approval.store_resize_display === true && approval.fronts === FRONTS && approval.cohort_sha256 === COHORT_SHA && approval.language_code === 'ja' && approval.decision_type === DECISION && approval.source_wide_approval === false && approval.human_review_required === false && approval.vendor_licence_verified === false && approval.owner_instructions.length === 2 && approval.approved_at === '2026-10-14', 'Wrong finite business decision');
  check(approval.finite_decision_sha256 === FINITE_DECISION_SHA && approval.root_request_scope_sha256 === ROOT_SCOPE_SHA && approval.reader_recovery_decision_sha256 === READER_RECOVERY_SHA && isDeepStrictEqual(approval.source_counts, { scrydex: FRONTS }), 'New exact finite decision cannot inherit a previous cohort approval');
  check(isDeepStrictEqual(approval.owner_instructions, ['Gather batch JP-CARDS-005, Tif, then keep working through the remaining batches and put each verified batch live in production.', 'all the missing images i gave links to']), 'Current owner task scope changed');
  return approval;
}

export async function loadFrozen() {
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, saved_targets_sha256: SAVED_TARGETS_SHA, identity_table_sha256: IDENTITY_TABLE_SHA, fronts: FRONTS, derivative_references: 66, object_references: 88, unique_image_members: 88, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
