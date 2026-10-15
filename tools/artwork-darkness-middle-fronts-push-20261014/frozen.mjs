import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = 'a7a4a4d1c3383aa65ad2b5227aee13fb6475ba4b53196bdfe713a6d6504de2c7';
export const APPROVAL_SHA = '0b0a39c5ae491c434901c8189cdac83e2414626ead48553212cc45e9fc4f8906';
export const IDENTITY_TABLE_SHA = '907a40f09fc4a173f90bb5c76c6fd766fdf15e1f3dba70c7e49a5158e331aedc';
export const SAVED_TARGETS_SHA = '3d5dfd1959dda693c8b3200877d4662738bd92427db8276df34a32e608c7a65a';
export const SOURCE_MANIFEST_SHA = 'ccc76e280ec3a0759fcee5a59d13a9d93b8f970b06668a737a8b7524e9ee2ba9';
export const ARCHIVE_SHA = 'f39eb2bc2f293d8dd44717f75f228cbc731adfb4e129b6862cafc28166404105';
export const ARCHIVE_ID = 642427555;
export const ARCHIVE_BYTES = 23840429;
export const FRONTS = 45;
export const QUEUE_ID = 'STACKR-JA-DARKNESS-MIDDLE-20261014-045';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'cdaacf04-0a7c-452d-acb0-e02ca3907106';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "96b7917908958b611e16a77449e9f4c0d02dc2bbf44467f494b7a36005bdb878",
  "decision": "4fbf11bdd460fba47075d3ba9af1ae60fa527a589d2caeadd165e9efa37a9a45",
  "handoff": "9031789fb820d4030f67ffd62afdd90cbd72d13577ad310c1422a09a5132b582",
  "pokemonSelection": "ea9297bbc799ca103789c55b93f2c441a7ff4cd8b2efaf397342a685589304ee",
  "pokemonAcceptance": "c66a500fdf6adb4f65a5c4f8bb1a19f75f10c63fb6adf9e9310595899cc53c91",
  "trainerSelection": "2a9af4515a895e3407b576f85560e7509fc7a72586d2aacf0bdde4f9a8be2ec6",
  "trainerAcceptance": "6310d424d16afb1fe7c4fd5bc829e95382e2bcade4a54d9af48331b4bb6d874c",
  "metadata": "93efb6346dc23719b32ce9ce7a374aa84fd257babe2f018361bbc60eb58de5ab",
  "sourceValidation": "58325f0c562af140d52f840e8ada8c56325f957f86d89d98e4e567228828e38b"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "462672f2-f544-435e-92f5-3a4388934462": {
    "alias": "052",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-52",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-52/large",
    "variant_id": "8d5ebbab-8389-4c25-bb86-310212e96744",
    "finish": "normal",
    "current_native_label": "未定のt",
    "category": "Pokemon",
    "original_sha256": "e861f73981f12bb733db2ddd10c94175771930e931133639e640707826535fe3",
    "metadata_sha256": "0621b1c38bd5017e5812e65cf1b3d73eb18246bddea7603e234b0c0bd713b69f",
    "body_sha256": "70be9470cde70c046821ffde65af9128d44979e8bccbe73fe07ee0e09df2b4b0",
    "actual_signature_sha256": "12358ab50aaf02f146c8e78aeddf2290cab6f1d7f309f049f67a1ea4db592c45",
    "historical_actual_sha256": "12358ab50aaf02f146c8e78aeddf2290cab6f1d7f309f049f67a1ea4db592c45",
    "source_signature_sha256": "fe29e7fd1f0abf8fc176c6184544b65c750b08d170665d3ccdc4a2c29c6978ce",
    "provider_identity_projection_sha256": "5063de89cb6c8173037996a451decaa716fc5fc0fa2a94e7e2c19a45d6e5b0ec",
    "full_captured_json_sha256": "abe37b6decf303138fc4b6f3bc5d09097f449b0f2c3fcc9b343b7c038b2ee081",
    "historical_source_row_sha256": "2281cbdb60284d57b88cd66d724c9debee5374ac464cf6fad622553b04641b91",
    "approved_projection_row_sha256": "8d9dfd37faaaceb3dbbd6a1d925dadd7d0383b87a6c10af00440b7a181867472",
    "raw_selection_sha256": "f145226f54a63af831b9036a0403b5877d81d239ca1d1b29fd79a6910df39f77",
    "public_selection_sha256": "e421d20939b5dbe9234e86a75bec8320af2667cba8be86c21eca2eca50dd7d00",
    "width": 570,
    "height": 794
  },
  "8e16b941-5157-4938-954e-208ccc12e12f": {
    "alias": "053",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-53",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-53/large",
    "variant_id": "d0ac6500-55bc-4ab8-9fe4-84c294b59437",
    "finish": "normal",
    "current_native_label": "v",
    "category": "Pokemon",
    "original_sha256": "b6fac23ad1ae83874f21afb0e856b83cb1e7f6f7ac1e260385e50cf22403186b",
    "metadata_sha256": "f9d5b922a3dcf293c416d95193631234825502d2470b823c314793c7f4ce1a12",
    "body_sha256": "68522bda4d5502ecf590af72a7e83075fdbe7e21631259fced5d487d43edf970",
    "actual_signature_sha256": "28e81815aec165e16c9a5f2e83341bd83a7b2c3191cac590b896e08c96d5f17f",
    "historical_actual_sha256": "28e81815aec165e16c9a5f2e83341bd83a7b2c3191cac590b896e08c96d5f17f",
    "source_signature_sha256": "d8119b1b0713c7e5da03db486b2f52d34edf761b55c2b11ba5f5e3e18e7c5492",
    "provider_identity_projection_sha256": "d65d1932e8b6322cec2bb99076b4e2d2c6bc762070d8c565fbd6a29075b87d9b",
    "full_captured_json_sha256": "e544871d1849f6e16f09e18b1a62c150e2432c8989d49031487bcda89353e286",
    "historical_source_row_sha256": "07bdd81004cc798906b84dae49efe3b797fa739e1754f89029539fd9c5793596",
    "approved_projection_row_sha256": "4d09ca3cffb4a06b86a0c8c107ab2587080ae81137f500c787c53dcef6dda0ed",
    "raw_selection_sha256": "9f7100ad7f5abfb538882e980cf6d113c113015deb82350bee5fb5db783f2e85",
    "public_selection_sha256": "086ed450038249f2f00c196b117406cf4c279b96afb37cee57ca10f038205c14",
    "width": 570,
    "height": 797
  },
  "2e75b01c-95b8-4af7-8047-b592f8f60c82": {
    "alias": "054",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-54",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-54/large",
    "variant_id": "e5b2d5c4-a86c-4c2d-bfbf-b2bebd075069",
    "finish": "normal",
    "current_native_label": "軽いスローブロ",
    "category": "Pokemon",
    "original_sha256": "30def4b80a37ef33ad671ed1e699539752c133b52ae807a59bb5f80a323a43df",
    "metadata_sha256": "dafff06398091f7669bb8c679bc3b574d85144f4e87a0ab1c817f40341eca34a",
    "body_sha256": "f8963acf18f04dca86d3a71f279473859f3fe04a7600f59d62fa3c167b3e79f7",
    "actual_signature_sha256": "3f02819327616171527787c27a16583565876db1b01205b713d2dc3d87735611",
    "historical_actual_sha256": "3f02819327616171527787c27a16583565876db1b01205b713d2dc3d87735611",
    "source_signature_sha256": "c48c81bbff3f12ae1442ed8865b72466f10d62eb0ea62fc217784886e7703d9e",
    "provider_identity_projection_sha256": "cf2684c15815efb28ba76865a857db787a2baae86bac246639a95b2f346c22df",
    "full_captured_json_sha256": "0a4011f9a33bcfd21b9d8a122d3c87f5a8a2292e073c7a046cf23e7bf487a8c1",
    "historical_source_row_sha256": "a252db65d927e4aeb7bbcf55a14a0bf73f741f4e05fc451f7565b90945ec16e0",
    "approved_projection_row_sha256": "cd677667333a6a84d729e72905761d589aaa7bdd78bd2af3ce22f3486acfd91f",
    "raw_selection_sha256": "87c7f3c43db1c347c3f892ca46c4455221f9fd11645a3625220e04f04f2c9e68",
    "public_selection_sha256": "23ee66741ada25d0311ce0f70274755c662df27dad06a31e9dffa239a9977724",
    "width": 569,
    "height": 800
  },
  "3ee006fb-4dec-4375-a63f-26dca95cfc91": {
    "alias": "055",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-55",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-55/large",
    "variant_id": "345b67fa-a8a4-4b10-9187-ee0bf91f02b3",
    "finish": "normal",
    "current_native_label": "暗いハンター",
    "category": "Pokemon",
    "original_sha256": "a9138f49295cd7b4593ccb3450d126dc9e22919149051e132f174de3691b1286",
    "metadata_sha256": "401fb363cacb7df1e520e41e9e1e05248e2fb64dfe5b3451bb627459003f7e73",
    "body_sha256": "ae4792a79b02db2fe0466e944c4259f1664080b95a638669c5ffc880cc842065",
    "actual_signature_sha256": "a2bb2a36e51973a42ad09db0b427078e48ab4c1310bf89a8608ebe4aba85a7e4",
    "historical_actual_sha256": "a2bb2a36e51973a42ad09db0b427078e48ab4c1310bf89a8608ebe4aba85a7e4",
    "source_signature_sha256": "15b25df7bbcd619dc52d7e0090619e49b9dcb9e776940abf8b1aecc8254ed852",
    "provider_identity_projection_sha256": "1c62142d39044e8dd86f355228bca6a0ac825fd061fb8b7717232de93f98e0d6",
    "full_captured_json_sha256": "d4eb540c5982c40bdb5a5f5b10ab1ff1853a4a1832e8191d76267a4c38d823aa",
    "historical_source_row_sha256": "bcbb7c4ab3e6ecd8f2d02d764ff42621869728ae9f08798c448025cf46a8d0b1",
    "approved_projection_row_sha256": "82ff0adda1caa6ff43684fc49427d69f2018daf70534650ef87a1a8bc05c083e",
    "raw_selection_sha256": "c7b1a2de88ce52317cb19c8fa531c325eb3167a91811f15de7de6ea1eb15ac3a",
    "public_selection_sha256": "a0d000c2d07b5b5b4e0b3b04fcf59fc189b8843717cb3db94841fcc3590c0803",
    "width": 570,
    "height": 794
  },
  "7f16590a-c0f2-4a2c-a507-7d9a16c48c18": {
    "alias": "056",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-56",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-56/large",
    "variant_id": "9f157f40-75fa-404e-9dcc-97be9284e56f",
    "finish": "normal",
    "current_native_label": "暗いexeggutor",
    "category": "Pokemon",
    "original_sha256": "021b407016bd73953df3d5246aebc93041c8bdad319db6f85eb6382b7efa4ec1",
    "metadata_sha256": "92cc0916dce3c1217b70a7e51e9d5a2e8b4821ee55983ba3267dc609197b3fb8",
    "body_sha256": "218f191a8f5d30b9d7c03a7f82922ea90a296b5d82678f232f89f68bcbc7b65e",
    "actual_signature_sha256": "84e79e368bf4ec19f3c8e5ba277fae99c1fd48d4a0c096e4e4752011501b8ffd",
    "historical_actual_sha256": "84e79e368bf4ec19f3c8e5ba277fae99c1fd48d4a0c096e4e4752011501b8ffd",
    "source_signature_sha256": "787cf106f3084ddae8c128c6d0e9f63ddeef73be488f7bb681c21272809411e0",
    "provider_identity_projection_sha256": "70c0d4ee241f6a50a46c28ea4aa23c8680a510277c136fa1c7ba7bdd18b429e3",
    "full_captured_json_sha256": "3b3148f46f06d0e5e3a69488938dc554f9ee7100fcbb2452e37f367770cc92b9",
    "historical_source_row_sha256": "e16556fc421ed3683be1a7a7b4fa5a4fdf522c6cf37cf9fc8d9e7191fd6bf0b3",
    "approved_projection_row_sha256": "7ca42843a29593fef7ee280b74cfea3cad9824e3bb010e4684c9c1af821539a6",
    "raw_selection_sha256": "d2fa578fee818b5b9e00fc4092eea13b4a2e04a7a0aa2cd5d5ac95f96d86d074",
    "public_selection_sha256": "a8ee7f5f6265e7fcc1d579dc3bd6ea48c01d1709c75499ca2092cffbaac899fa",
    "width": 570,
    "height": 797
  },
  "adb670cf-5d1c-49a0-8670-f2e374da9c01": {
    "alias": "057",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-57",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-57/large",
    "variant_id": "90da4d3a-57dc-43a1-8608-3037d29c78e5",
    "finish": "normal",
    "current_native_label": "c",
    "category": "Pokemon",
    "original_sha256": "5f9a26f7e55fb3aecf72213b62d33b37142e0db61c3341b7e71ed0abd5b6ccab",
    "metadata_sha256": "f73b348b110ff4ae0737a10d700f3c4c8dc1b4b43bf7993351c1ba372acdef51",
    "body_sha256": "4d766079fc4d00df8b9a45c25c1fa6ec0373eddeed4ea413afaf8848a6403ffd",
    "actual_signature_sha256": "4dca086b20769e3e32cd81404220492dfe6015c1763a2241d0afa9626492dc09",
    "historical_actual_sha256": "4dca086b20769e3e32cd81404220492dfe6015c1763a2241d0afa9626492dc09",
    "source_signature_sha256": "2f4cb2ed16f1e96a1b24dfeed6b39bbb62434aeb7165599bbeee266176a95221",
    "provider_identity_projection_sha256": "cc30fd7c8a972a6393e2816075b5023274f95e0a1b88ad630f46d8f52b5c954f",
    "full_captured_json_sha256": "7be4a8357e5758138a9f91217bcc55d621310a5a17ae385857b294b7736934a8",
    "historical_source_row_sha256": "53d46f3f019731180ea8c51391ba63d73da02f4cc8368fdf16a1661945f0a48d",
    "approved_projection_row_sha256": "319475defeb6ce6e83193084d38c1a734f55d07bd918c27048beb42bf7e78591",
    "raw_selection_sha256": "49fb5b6ec73115d53b28afb7b1e0cdf31d6093b24949cb416abb9686880b4d8f",
    "public_selection_sha256": "127318744ab64df98f102715203be20d33cfde678d2b7f425fea8a222193cff6",
    "width": 567,
    "height": 800
  },
  "35a270e9-9ac6-46bf-96cd-a48269efae97": {
    "alias": "058",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-58",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-58/large",
    "variant_id": "71416caa-0dad-4246-8594-ea150492f260",
    "finish": "normal",
    "current_native_label": "未定のp",
    "category": "Pokemon",
    "original_sha256": "8fe80c1b6f060f35adcd9e915143e4b86f07ab263b987fbd76e3c74d6e462277",
    "metadata_sha256": "3c4fc9a8bdf13417f46e6386f81b12bd15e30ae20d6e8193e8bfdd1bd5f11630",
    "body_sha256": "86edd4b96c8377ab6ec0318c9b00c6a0333a38af1d9fca2abf5db1714d8bc0f7",
    "actual_signature_sha256": "792e38961852d4b9cb3af61dbbee9c7689e28ac7c44017c958c6a294234356cc",
    "historical_actual_sha256": "792e38961852d4b9cb3af61dbbee9c7689e28ac7c44017c958c6a294234356cc",
    "source_signature_sha256": "e412e8d0484166631795e79c4fd51bdcd76c5cad8392ec9308e5e17793604709",
    "provider_identity_projection_sha256": "f66b218f25bd7b39da2bee3fefefef689c64a153b3892b1e7a18d74b7d0e65c6",
    "full_captured_json_sha256": "7d10ce40c092f0975cc40e92262cfbc23db88a813e39895cc85b7e43b025a76d",
    "historical_source_row_sha256": "1935005730ddf3613bf0276b85c093e06aae05b0abcb195e3c03c62beeb0c2c5",
    "approved_projection_row_sha256": "04437eb4a72f0375ce09260357759d13e98a73083ddb31b4010fb6c4b9a6b22c",
    "raw_selection_sha256": "41ac38e9a180f7c4a389f08b6978b6d3f5215f5ce79ae820dc1246b1d4faacb7",
    "public_selection_sha256": "6cbd62a812ce27e07b8d03389fb2c55151084b399b1cb6bdb72094cfa5a7edf3",
    "width": 570,
    "height": 794
  },
  "9cb82cff-8a30-4d1f-abc0-090c5d827cf7": {
    "alias": "059",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-59",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-59/large",
    "variant_id": "c61bde9e-ca1c-46ee-9b2f-734da330ca77",
    "finish": "normal",
    "current_native_label": "Q",
    "category": "Pokemon",
    "original_sha256": "ab6dec1c7bf79a21c32ea009193470f4a71b0910c35260c6ceff0b4eec721b1e",
    "metadata_sha256": "cc9a871fa418ac3763300e4245b94570395346c59c35a677444cbe2eaee5e713",
    "body_sha256": "bb90d7b2ff891d74c74217c97ef5ad4f699f6e43eddad86c8291beafce3f9f91",
    "actual_signature_sha256": "588bce9d30fe53fc9023d7d34b8952e40ed03f9de227de49a99201a6f650c05c",
    "historical_actual_sha256": "588bce9d30fe53fc9023d7d34b8952e40ed03f9de227de49a99201a6f650c05c",
    "source_signature_sha256": "0afabe2f6b791785d9a2d7042218f56593f52590d5cd2958ae0d7c17a321abe8",
    "provider_identity_projection_sha256": "5dfa8183afa501e9d263232d110c790ad96a91158a80aaaf085a4a8d57223cb3",
    "full_captured_json_sha256": "6d616b652be1027be93f3829bb0117b9277974f653310f1da60a3adbbee28652",
    "historical_source_row_sha256": "79ec64e3af8091d4ce26854767a329a726f9555a9332937084dcd4fee45a7457",
    "approved_projection_row_sha256": "605ae75d1ab8abe84cfa459a0a7d92e0e81b14b9d9240966a8ba6bebdf74f182",
    "raw_selection_sha256": "29dc64da5f0f3f8aa833f1673121c67e22ae8a26f1c5f9542d604bf3c9867ef5",
    "public_selection_sha256": "8c9d7e03119278601723a7e901a9c1538743b4cc879057d3216df91447fcb184",
    "width": 570,
    "height": 797
  },
  "5d68e873-c3f1-4a4a-a500-3662e662ffb1": {
    "alias": "060",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-60",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-60/large",
    "variant_id": "9a8f7d32-e652-425f-9db2-398e50d3809f",
    "finish": "normal",
    "current_native_label": "ZなしZ",
    "category": "Pokemon",
    "original_sha256": "56a6f93555ba045d7d1b987ceabc5c4a6c5cfe9618b1faf553e684585ca39c4f",
    "metadata_sha256": "894212d8df2d1290160847944946b0d2225c127eb294b01e48445b1b24bb9dd1",
    "body_sha256": "364291e5b10dd2984d0b831505dea742931bd43f1023f0546da039fcea57bc5c",
    "actual_signature_sha256": "43757e15da711ddfa552161028e0904180543bd3ae101dc08e7f99690b248df5",
    "historical_actual_sha256": "43757e15da711ddfa552161028e0904180543bd3ae101dc08e7f99690b248df5",
    "source_signature_sha256": "3a9c218d1eeaf2be5379cebfd3f796a192b55d0321e369c4bb3820943194f9b0",
    "provider_identity_projection_sha256": "eac6d54bbeb3ebb5366fdf26d406d24df1771712359c51e1258383cbf9849d30",
    "full_captured_json_sha256": "97ab96b81241ec87a250b9cead2def79ca00059b40b3b19cbb23e89b668f8a1c",
    "historical_source_row_sha256": "9a2145f397745586499da5c9f930c59e3ed498ef6337ce14ae2d6f568635f5b0",
    "approved_projection_row_sha256": "d86bd018bb05d8b94be88bc214a4e5e1858149bf7d299fe951c0400df3fa1aee",
    "raw_selection_sha256": "802e387ec83ca206606377b0254d2d3c5b65b0fa0efae51288c0ddd924a67ce7",
    "public_selection_sha256": "56b5dbf331a856518702e3f3e705db76d202ca355cbe8928cc74fc1ddda00b48",
    "width": 567,
    "height": 800
  },
  "80c5425c-2fa0-4a3c-b840-a073aa1ac76d": {
    "alias": "061",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-61",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-61/large",
    "variant_id": "90780bee-bd54-4f84-9329-af1924992890",
    "finish": "normal",
    "current_native_label": "暗いスローキング",
    "category": "Pokemon",
    "original_sha256": "f06194912881c260f417e78883b58b30625871612e2b2519a57fe61f0810e072",
    "metadata_sha256": "52db76fdf0ec5930393fdf80993b4e024a10917591612605b0894261782e3618",
    "body_sha256": "ce0a9390e0537fef0fdc7ea413b14707d2660a1d865e71137f2487639a5b9e6d",
    "actual_signature_sha256": "0a92c7f33f916a77fcb5924eec10b3e22aa02f90b89f9e48bc512bf41949a262",
    "historical_actual_sha256": "0a92c7f33f916a77fcb5924eec10b3e22aa02f90b89f9e48bc512bf41949a262",
    "source_signature_sha256": "5061a696e42b92c1b058181c296bc4a994ba4428d15d20aba38ab04a72518dd2",
    "provider_identity_projection_sha256": "4f7e704e0e594d4533715d7c054d0100ee02a4758d8a225a7b4decd5c19de7fe",
    "full_captured_json_sha256": "fc9984c2f65b51cf819fa0e4b8d366f3c58bc29e24309208e7a77cd14618277f",
    "historical_source_row_sha256": "f09d8b77bb2309a6357e2497b5827ea9b5cc19dfb263e0e2eb59ac192297cf9a",
    "approved_projection_row_sha256": "ece5c66db74190a547e7e4d0432cafaaf82ed9f1fd38b8ade285dfd2e76becbc",
    "raw_selection_sha256": "9c734c1110344f69370748b2c3b829b73f620436316520c10fbf21118852bc6a",
    "public_selection_sha256": "d76593d91a0c7c1025dbdfe5a0a7c7efd773e7764e6f5c25cc579ad82bd14744",
    "width": 570,
    "height": 797
  },
  "f51a919b-a2c8-4036-b22e-b7f33e951eef": {
    "alias": "062",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-62",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-62/large",
    "variant_id": "a842e390-788f-47b7-b8ce-c16982154506",
    "finish": "normal",
    "current_native_label": "g",
    "category": "Pokemon",
    "original_sha256": "edf362add148c5ea8b489580ce02f571ba4e488d3a6cdd7b61830daef1939c77",
    "metadata_sha256": "b2db2e1896c24378f15ca68f5cc79fd116778ada66007c14945fb5eba08204f2",
    "body_sha256": "07de2e64e815a59f8ad265738fdd54b9eda25b858324b9c1a8d6e2768c7f81bf",
    "actual_signature_sha256": "a6f75658f75c917b7919193a00462c94416e1372559a4c47fd5f88d1310dda8b",
    "historical_actual_sha256": "a6f75658f75c917b7919193a00462c94416e1372559a4c47fd5f88d1310dda8b",
    "source_signature_sha256": "c0bb7075bf0776f2a4004db6e1cbe2206b45e116be8bcbeffd0962300fef4a18",
    "provider_identity_projection_sha256": "381d6640fdbfac7ca4186af75fe96b58bbabd889862acc7ac5060ecc72495c46",
    "full_captured_json_sha256": "395d546099d68bcd172864eea3b86e0674c898be1f2544e7e20bc57a4e6587f7",
    "historical_source_row_sha256": "0a8f6c70493697ad6ee93d325fb3a93cbc4da9769136ef4908f3d6944fcce201",
    "approved_projection_row_sha256": "6d175b2d2b4f091d0941a13aaa149c36fd8c433e7b06261466d5f17ee579a260",
    "raw_selection_sha256": "2133a4d49fbbbf7134cfcaa5460d315150c61528453d49a412fda169a299053f",
    "public_selection_sha256": "ed90018f17b932a05b4a9906783e53ac5c19c36fc346c6afa52cb7b3306321ea",
    "width": 570,
    "height": 797
  },
  "f1dbdd12-b561-46f9-a172-e3c61dde8ede": {
    "alias": "063",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-63",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-63/large",
    "variant_id": "c6faa1ac-6218-4f21-a462-4aba2a584b4a",
    "finish": "normal",
    "current_native_label": "hなしh",
    "category": "Pokemon",
    "original_sha256": "d462537f45fbbc0811640502750eb0c6bb6c694ff49bddd01a846f8600400877",
    "metadata_sha256": "2a98618211d79e19bbd4a93385fc9225fe77ebacf6b53668b9396fdca0242bd1",
    "body_sha256": "063bf5b4e2b9af46980b8ba8a486677dd023265a22def0f15d3b50b499ff5ef6",
    "actual_signature_sha256": "16b999387266ca38fbac49051074eaf1d34d1b095fd28676dfe40ab2c0f14bf1",
    "historical_actual_sha256": "16b999387266ca38fbac49051074eaf1d34d1b095fd28676dfe40ab2c0f14bf1",
    "source_signature_sha256": "c1cc45c0a97350f8c7464e5458cd49b816f04ea5689c5ff1a2bae756e3455edf",
    "provider_identity_projection_sha256": "64c3f33c65a376f4f72f6078a3330853e4d1d119542dc5618b4db4338e5b7d74",
    "full_captured_json_sha256": "637dd8da0faafc4906c5ca2499170c7b3a7e8365aae661da7bae9053fcbfeb9c",
    "historical_source_row_sha256": "802e93e9bfe596cadd63fb2a8c46b8ef302f398fa7d70625e796127868171c6e",
    "approved_projection_row_sha256": "d432fde3a50617c502fdfed2e90d5a8479f3d9df1c5a38732e3ad5021ac6b3bb",
    "raw_selection_sha256": "0ec6fcec8148351c94cf075d9a2849f7cee45f44f42d874c9c2ec1e80f304696",
    "public_selection_sha256": "e269b5c07bcaa39174e0c4828251da6ea913631d027084e36d712a26296d3f56",
    "width": 570,
    "height": 799
  },
  "a71aa134-7cee-475f-863c-54c0c37ed5b9": {
    "alias": "064",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-64",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-64/large",
    "variant_id": "236da421-5566-4094-b1c8-1e0e7873bceb",
    "finish": "normal",
    "current_native_label": "w",
    "category": "Pokemon",
    "original_sha256": "d33bcddca45fb80a3febff687fcb146b9cf990da69c90dd8ed82b33a54cd5a96",
    "metadata_sha256": "170b042f97c8ef42226bbe4793eb7110ec4a3106428b0719d9592afc4536b0e1",
    "body_sha256": "33d2c1ca4cf5b1d0f57e1fd850f8a7e53966d8b1f5e4a451c9255f154ff9bdae",
    "actual_signature_sha256": "eda84fe86ff9917de61ea90114f0ea81ef623a4c94dcaaa8c35230b6eba47371",
    "historical_actual_sha256": "eda84fe86ff9917de61ea90114f0ea81ef623a4c94dcaaa8c35230b6eba47371",
    "source_signature_sha256": "d258693d869210973420def2500a8f51ca0ca27cdada87a82e5437dad7cf13f0",
    "provider_identity_projection_sha256": "31e3436af5977fe21638da751eeeb5b82077861aa92c7031847ea2ee367b8e45",
    "full_captured_json_sha256": "6fc403e28fa939605353dbaa51a92ab6211cabaa252b4849c2e7efaac967b7bd",
    "historical_source_row_sha256": "18550f9632e42c05b1079a7c2c5837d7d2d9181ca0f13495524ac2629be0de02",
    "approved_projection_row_sha256": "8f594fd42c954191c3f80943905590e9f16af9c952124150f8eea386e4cb2f1b",
    "raw_selection_sha256": "67f33adde69df4e515256d62fa9237658bb45d3f9ddd76c26bbc29da2cfeb69d",
    "public_selection_sha256": "4a77979504ff63f5fb222552963d11a02945b73f22471dccdc09361aa66153dd",
    "width": 565,
    "height": 800
  },
  "fd2bf54f-9150-4b44-a00a-bdd132c7c710": {
    "alias": "065",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-65",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-65/large",
    "variant_id": "77f384e8-4406-4336-aa8c-9e2136c906ce",
    "finish": "normal",
    "current_native_label": "未作たx",
    "category": "Pokemon",
    "original_sha256": "8131b99c17686b3dff52a01a89d2418acf0bebd7e953135a4d708f43bb0e8515",
    "metadata_sha256": "36a3e0bd30d2cfffbf2242b2b6d1f462c1a3a603962828a6a536239146a6d548",
    "body_sha256": "93c42f019f5287e4be0a933c3edd6d1c90ca43e349dfcb7a8f0560c2049c8598",
    "actual_signature_sha256": "324a4b6254b329efc442892cfb54f9436822c327d4da0bbd767af60dd72892be",
    "historical_actual_sha256": "324a4b6254b329efc442892cfb54f9436822c327d4da0bbd767af60dd72892be",
    "source_signature_sha256": "9ca85a1b9bdf341520e510fd12ec6d373bfc95c7bb6b1bae94474ff459983a08",
    "provider_identity_projection_sha256": "535b2a7a11ed3804524c5eb987413391e7b098d4dcbc452ba31915a510c11771",
    "full_captured_json_sha256": "55e860b4afe9e95a8de1902e48174b9442163d475a9c6588d39abfe172cb5937",
    "historical_source_row_sha256": "d384ff414fa133999c91724553d7afb6260169723373f61367dd8a31bd8b1d23",
    "approved_projection_row_sha256": "c81337925612f64fe41882047fba1f3de28f0239cc43a17a3ed69dc3bd94afe5",
    "raw_selection_sha256": "6aac8dbcecca3c8305984256f8264d1b37717b1f43130b792c51fe7bc59321f5",
    "public_selection_sha256": "220ab827dd632fccc13fdd9fa9439584debeec8e754946bbb7025fe7d5254296",
    "width": 570,
    "height": 794
  },
  "1beb4bf9-9cde-4851-9804-ed9cce9f152e": {
    "alias": "066",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-66",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-66/large",
    "variant_id": "d2a21eed-92f3-4b40-ab4c-e61cb248d1b3",
    "finish": "holo",
    "current_native_label": "ダークジェンガー",
    "category": "Pokemon",
    "original_sha256": "4503ecd70959c5bd4a54033788984881040d20d1baa2ded251daef9faff71602",
    "metadata_sha256": "91430103da5be4116fe45962f7fdff0c759a1dce879d38f0db94703c6830c0c6",
    "body_sha256": "467da99709e94b059c98c7084abc70b057f1e24e8eaa41588c296d8a09d493a1",
    "actual_signature_sha256": "1b49df8d6be6d986d609d290a2e65e0850f18ff44973d659228a1d934737ef9f",
    "historical_actual_sha256": "1b49df8d6be6d986d609d290a2e65e0850f18ff44973d659228a1d934737ef9f",
    "source_signature_sha256": "9d674d9e2b43e92712da37b2d29e6568230086a59209d0049ef98fd6e87ade61",
    "provider_identity_projection_sha256": "e466a8d41a20137257389187c9f9c8ff0d80e01cdf2e46a26cb691bf5da51a55",
    "full_captured_json_sha256": "f6a05843a30a54fc898b19c586a2522535e900ab10d94edf519ad63a6d19ade5",
    "historical_source_row_sha256": "6ea83a9b8301c7bc1fa60f14e6c4158fc867a00f7a9de88c7a633e1c8eab1101",
    "approved_projection_row_sha256": "f9e9bf2fc7c13dcf8d26ee21e6e300f5d4e3e895d60162c4ce03243c1fafbd0a",
    "raw_selection_sha256": "80040c03481bbdb2c8b29817b29ec6f089fadfdc9675d5a71a75a169d666568b",
    "public_selection_sha256": "b14d7c9b8a2fe6d1091e64b786862d8309fa095d10a2372e7e01e1d1d761f119",
    "width": 570,
    "height": 799
  },
  "e84ab0ae-ceb0-4211-8787-dc2708296a8f": {
    "alias": "067",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-67",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-67/large",
    "variant_id": "c7eaae14-3908-41b1-9d03-334eecbe3d2e",
    "finish": "holo",
    "current_native_label": "暗いエスペオン",
    "category": "Pokemon",
    "original_sha256": "b7bca750729d5805ba2589a5bee4faaab26b4e9785a773a8b3709d72724dfeb5",
    "metadata_sha256": "d4a73d5d89086ce4a22ba39ef3fa0da60030e1cfef90391351cfe8f0ef850764",
    "body_sha256": "9b99133b0e345e0eeed9586e68994a51e8ff5a0ae744b48d986d87675b8c32ab",
    "actual_signature_sha256": "64defae15356977678cb998325d22d55243aaaaa3afce04f2ea34b5c6bc2a106",
    "historical_actual_sha256": "64defae15356977678cb998325d22d55243aaaaa3afce04f2ea34b5c6bc2a106",
    "source_signature_sha256": "14322ae5bab1e26f8457210c721102556d43d8857d0bafda280391cb72f549a3",
    "provider_identity_projection_sha256": "aed7e255a1bc3d99719108590573762abad53efe5b76425442c23c5e02456c48",
    "full_captured_json_sha256": "2ee406f198a4ca3423db1b03495a4846acec22079b294f69a34fc0d5566889f2",
    "historical_source_row_sha256": "fdd7f57f055f618109bad5a299b963ab660ed40b6e09b409782b643e6e214a28",
    "approved_projection_row_sha256": "ee4474f58f3e6fabae9f5e66820d799db6b546b12cd027d60ad8770c381c7388",
    "raw_selection_sha256": "886ebcf7aa6d3a123520989cca32900cf342141fa4297f3a9a2364ef47001787",
    "public_selection_sha256": "a15e0366482e40c0f4b9eac82a28446dd47949dd44962c9574714154e6487f73",
    "width": 570,
    "height": 799
  },
  "5f91ad11-0be9-46c2-b448-26e9d40c1f0c": {
    "alias": "069",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-69",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-69/large",
    "variant_id": "00180499-760f-4ca6-8fd9-e039393a0fe2",
    "finish": "normal",
    "current_native_label": "マチョップ",
    "category": "Pokemon",
    "original_sha256": "b93a7b0337a57369de564f8027a77a657fa5e52d5e6ec4461ce64b78aba55522",
    "metadata_sha256": "ced64f80f5f2fe6d7dba827ee2d4cbee24781326dc7aa7c5c72923328ec4f67b",
    "body_sha256": "1794cf7e20d90c7d8df984e9c5bb1bf23d22aafbae112d290c0f6d41adfbebb8",
    "actual_signature_sha256": "6664bb0390d4b6966812e08c38dfcfbf2812ce37262816eb90e8731c0283568e",
    "historical_actual_sha256": "6664bb0390d4b6966812e08c38dfcfbf2812ce37262816eb90e8731c0283568e",
    "source_signature_sha256": "03cfdb669dc22a719108e974af10e5da2a6a33cf8b3df7ac97d6dbf2d3df631a",
    "provider_identity_projection_sha256": "f37566559bc9abe738b22b8c94fc8348105e8987cdfc620dc39f5560643fd0b7",
    "full_captured_json_sha256": "a12272d532111e8300bb151f495616e8a883586d14e1c86d9d8cf88748dde25c",
    "historical_source_row_sha256": "d5017da930f333d62cb7fb0741341f12e5f0ca67246187cdbd679f30146fd882",
    "approved_projection_row_sha256": "50c77b2f0c68c2381975d0da6617a105512c057d82d072bc810287da454c167c",
    "raw_selection_sha256": "e0440010ffb6a6ab0d7c1775db68c1cdd25560aadc679bcaeb59ee9baf238d29",
    "public_selection_sha256": "8699efe7d3ca4f9740eb2ddf37b16b9e3ed40cb59662d84208692fc1978c3831",
    "width": 570,
    "height": 797
  },
  "c06efa9c-8b60-44b4-81cc-7ccff4497ece": {
    "alias": "070",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-70",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-70/large",
    "variant_id": "52a895a6-db10-412b-a085-50fffbe5e6fc",
    "finish": "normal",
    "current_native_label": "ヒットモンチャン",
    "category": "Pokemon",
    "original_sha256": "2b05cffc84d0cad6e7d1129e906058737e6dbcb00881aa3a000707602ae7179e",
    "metadata_sha256": "7fd6c426201ed05d9718e62aca130ea9a3b4871acf08a912595c3dcc9a43d71d",
    "body_sha256": "11d6133f065878cf12da1260fe4822a2e10911cda05cdc311bf1392eda962702",
    "actual_signature_sha256": "1b8d4ff3f817e2952101ab49659ce4aa2735712bd008acf80266fe53ac88d44f",
    "historical_actual_sha256": "1b8d4ff3f817e2952101ab49659ce4aa2735712bd008acf80266fe53ac88d44f",
    "source_signature_sha256": "cc0903664f0909d3e613eca427481996d31287c977bce250cb0240d22f0a0981",
    "provider_identity_projection_sha256": "8fb8425f8eaf71d752a6791942a46400abb68ae69f1dae3c9a125264d8309142",
    "full_captured_json_sha256": "844125059287b14078fed2af15ec424dfd18ba04bea20f221309bc8229b979e6",
    "historical_source_row_sha256": "e5c27e85d6d39d16f17959f205aa05dd307bcfb0e22f651d277bec5fa85b14e7",
    "approved_projection_row_sha256": "7617c1b7d2ddd56286a7d485e56cfb783ba66ee7f4a5cea141095806ba55da88",
    "raw_selection_sha256": "5785fb6b62a3c3a1961ba0788bb60d816e80ec0c9f3b8280f4d0570662a12155",
    "public_selection_sha256": "c203417a68682f95e9968bdb4e5efc74811d91101d80d56a407e365f640866b6",
    "width": 569,
    "height": 800
  },
  "02ff0c1f-868f-4d7a-9070-af28c644806c": {
    "alias": "071",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-71",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-71/large",
    "variant_id": "4170cbfb-c1ef-4ab3-a9a8-747850917fde",
    "finish": "normal",
    "current_native_label": "グリガー",
    "category": "Pokemon",
    "original_sha256": "31346923aa855c5358bc52b0b02266fc09349d9af003110261753eb48bc5568b",
    "metadata_sha256": "6b467f1270ab6c839dafc6d8f4d2adb2f7c614be581873b0c2dfff88a255e1d7",
    "body_sha256": "4ec38f831de83ba27272e3a3cd837a7579673c7b3ff177b67637563a0ebba8cf",
    "actual_signature_sha256": "3c36f20f1070b27a9614dcd6680e7d3d25c2782d746c0cdbf26503bd34b63e16",
    "historical_actual_sha256": "3c36f20f1070b27a9614dcd6680e7d3d25c2782d746c0cdbf26503bd34b63e16",
    "source_signature_sha256": "e9dad81e7cfd4624a4cf807966ab426f36d0e6c5a76f9c4ff81815bbc4cdd208",
    "provider_identity_projection_sha256": "783cdf5b8a341fb21edcf2b6c6176af5d4d2b6164aa4d1b9cd8ce499b3167194",
    "full_captured_json_sha256": "e49685eecc0d3998654b291e5223b63a2cd605447802ff29fb2ee60585f6155a",
    "historical_source_row_sha256": "3965912f3af9716ec360f29efd519812e9fb33d150f026ee1aba32ab13bcf281",
    "approved_projection_row_sha256": "be9a81910b8f9d965eaea5fa0c1bc32e319b7c8a227a9f026e392ea7c24068b1",
    "raw_selection_sha256": "ae26a2cc8716d9fdbb6b9d88d5981f7a567701894e50eb7617b85f5c8cf40c90",
    "public_selection_sha256": "8bf8a8cf1631d152ab8461a02bcbc8cc7663537bde78d3e1c8a01093314e4ea9",
    "width": 570,
    "height": 799
  },
  "16db09e5-a45f-475e-808a-d6c6b9ee7ca0": {
    "alias": "072",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-72",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-72/large",
    "variant_id": "b233079d-dede-45b0-bc02-66846efd5d0f",
    "finish": "normal",
    "current_native_label": "ファンピー",
    "category": "Pokemon",
    "original_sha256": "f32fadca66db25631422d76792dc5261f9924e442978bc4eb049035716b253d3",
    "metadata_sha256": "8c0d8b0d50b9ebb6aa2a529ea875fa60818de58abcfbe814900b19deb564f42e",
    "body_sha256": "9988cf7a46869cafaaa0cc99d4fe1a3c5be46192deb9feb8f3d8cc4ed44bd6d2",
    "actual_signature_sha256": "92cdf62b5f72b6132a9713a8d4490e9b2e1e0abdfb5655db3395e4f96d323a10",
    "historical_actual_sha256": "92cdf62b5f72b6132a9713a8d4490e9b2e1e0abdfb5655db3395e4f96d323a10",
    "source_signature_sha256": "4fbd4b929cff51ce20dcdb009b7987d1a3f2235791ca68945c59f2a60df6182d",
    "provider_identity_projection_sha256": "eddaa4ad16c6149a378179cffbf5d8f84cf415da5a2fc12bcf86399ea682ecee",
    "full_captured_json_sha256": "620bdd605871349ba4c6a310f2545adc84eba1a961578a359b328fdfb08cc10e",
    "historical_source_row_sha256": "fee1899db123ab0d7eaea5027dc4175e10c6fc3a1a1c0a06531e85f2740bad49",
    "approved_projection_row_sha256": "2f08ef440e412e9c57a56eae223266eeceb2a095ced2484ddc0986cae8c73187",
    "raw_selection_sha256": "221d9816c527085dacbd0739321545cf420a9dbfd72e84febe9df4a1dd42cfb9",
    "public_selection_sha256": "46ff745f734bebf834841999647cbe53f9af49474b12eefc81f57646e9802b84",
    "width": 570,
    "height": 797
  },
  "3bf1dc02-e1af-4273-83e0-850640e41aef": {
    "alias": "073",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-73",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-73/large",
    "variant_id": "4ba023d7-8518-40c4-b661-6d8f3099dd7a",
    "finish": "normal",
    "current_native_label": "幼虫",
    "category": "Pokemon",
    "original_sha256": "db6c66643198c112b2508c578c11b1e182d51c484ee17e9626e2d7b2d54467a3",
    "metadata_sha256": "7c45b9166e0c5fdc6cd72673f8f1409d8603c71992cfde24d2247f6ec99b15ba",
    "body_sha256": "940d87c13b812270532da6724050718df483719e42add1ba8974ab0525272be3",
    "actual_signature_sha256": "59d5c9832668192d8f10a14affa172c2595e017b963420a24ad3f0cf93c54390",
    "historical_actual_sha256": "59d5c9832668192d8f10a14affa172c2595e017b963420a24ad3f0cf93c54390",
    "source_signature_sha256": "0fd3252a40e67c091ff42e5821d18f3c53674ff493910e66df13f695c90ba5ac",
    "provider_identity_projection_sha256": "5fe4964eb384326650076af4542cdb067e129b7bbd01c16105177ab2ff9f2dc5",
    "full_captured_json_sha256": "a49a8a35dd913da3d96d03921502fce88c1ffa4a796f6dbcdad32786320a4c56",
    "historical_source_row_sha256": "7c153eca1cce89edea20fc6663bed5ec7fa26243a56439cf1efadb1838c856cb",
    "approved_projection_row_sha256": "f4627501f490fc38fd4fe46c74dc93567f67bec766458a4cc149184c6f179b81",
    "raw_selection_sha256": "4360a089128dd1fdc1df710873846936b8b070b274460b85995254be625cdcae",
    "public_selection_sha256": "bb0a262df31832c7ba89578fc2cd5475e3053c9aad1f22289f035a4f808461bf",
    "width": 565,
    "height": 800
  },
  "cb737d1c-773a-46d6-8c14-63d635ff66c2": {
    "alias": "074",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-74",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-74/large",
    "variant_id": "4705016b-3f1b-4cf5-a922-41ade8296b7a",
    "finish": "normal",
    "current_native_label": "ライトマチョーク",
    "category": "Pokemon",
    "original_sha256": "2efb9e2117750eb99053de35a303ddc9c26b5a147cf5ca687d70a73e1b5abc1c",
    "metadata_sha256": "8859c9376c7186e1bd44b22c70f1f44046857d4336438ebc9bfe884cb2797af8",
    "body_sha256": "6c62807a43060dbd8f98eaae3abf894050c2e88cca0c273891c6f290bfcdbe42",
    "actual_signature_sha256": "4c869791c0ad0dbd76ae4a8e155b28bab2b579711f4f2680279de2d9f31527e7",
    "historical_actual_sha256": "4c869791c0ad0dbd76ae4a8e155b28bab2b579711f4f2680279de2d9f31527e7",
    "source_signature_sha256": "32efb37b5bbe11471fbfe7efb7d3d99fbe18cb2bc7437a6b1da245b9bccc3af5",
    "provider_identity_projection_sha256": "4044e22db84d1899b9a743fa895ca851abdb2ee807a315f516ce10bc21606c6e",
    "full_captured_json_sha256": "08fb4d44139cdc3b5206a2bf47b67a70581896c905631412ae090e5ecc36a2bd",
    "historical_source_row_sha256": "2a833a4988f9973ea3298166a0ec245eefc5df8dc35111745f5bd2c8def0a1b1",
    "approved_projection_row_sha256": "58d7058dab6b67098883ad581627f7674364f4cb7bdf98f0b70cce791275dc61",
    "raw_selection_sha256": "4de86eb7efb3f340b2ae96ab5c1cdfcf72bd5be96d8c392edc17f27c3a91ece0",
    "public_selection_sha256": "8d4ac32cf664d6da3b6400fbfd5dc3f902942715c1bb55f3c05fdb1c536fa56a",
    "width": 569,
    "height": 800
  },
  "1f911717-7151-4f6e-8847-226e14168741": {
    "alias": "075",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-75",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-75/large",
    "variant_id": "d6a71723-dfd2-4de9-a7ad-07380a94c15e",
    "finish": "normal",
    "current_native_label": "Hitmonlee",
    "category": "Pokemon",
    "original_sha256": "3ae06e7def6ea1644cd995635b190cc616c9f484730930bf31295345b589bc9f",
    "metadata_sha256": "597a14436706d1eb7e65ba9b191e51dc164ea41fbeddc37b198459b19b6615aa",
    "body_sha256": "58128c6b5b8a2ec0d50e072cd1d415dd7f36402dc855cf33de7b62ddbc7af57c",
    "actual_signature_sha256": "f4d162e5dc6348fa8acee28eb7f3dae2e44b2671e2c60492f6a1b03540f13a55",
    "historical_actual_sha256": "f4d162e5dc6348fa8acee28eb7f3dae2e44b2671e2c60492f6a1b03540f13a55",
    "source_signature_sha256": "eef6571f21e83f576a0c05f1ce62a48e2e74a53e2b061164894389f79e19e683",
    "provider_identity_projection_sha256": "616b223c324917065ab2c45b76b8bdbd101466c24fcf44af5ac17eca01f27af6",
    "full_captured_json_sha256": "b1abee447b1e0b197295dae81f02ce1254cfa22e5848b70ce3719961409aa276",
    "historical_source_row_sha256": "9debb1311e5de76c6443f42797886bf05b192fcc604972e888dafd0f6fd1ce05",
    "approved_projection_row_sha256": "1bd17aba03d7041acf448834825123771e8be1a35fd507445d04a6b8770acbe8",
    "raw_selection_sha256": "e55e670dae417df40765b979261a778869d28c219809e036d36f621b504a4d96",
    "public_selection_sha256": "19b061c445cdf60eb37d43a6761a613b868a592423c6fa7719df7a1a64031c88",
    "width": 570,
    "height": 799
  },
  "98fbaf55-8394-46ed-8aa8-d45f53282ff8": {
    "alias": "076",
    "batch_id": "JP-CARDS-015",
    "provider": "neo4_ja-76",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-76/large",
    "variant_id": "3d930c37-3bd4-4c31-bdb4-c62b691402a2",
    "finish": "normal",
    "current_native_label": "ダークプリター",
    "category": "Pokemon",
    "original_sha256": "44f50d911e94dde5503cd98d594cd70ca44ee31d088ec43dcca4b6940e25e372",
    "metadata_sha256": "e6b42269387aee8c53e40fcfdcd650b070e8a28f1dd2c94a4d168f910f4d53df",
    "body_sha256": "ebdef0c405a3aa353b3de74a6d0d4320abb46b7e53854da2846e01ff3195d9c5",
    "actual_signature_sha256": "b9c555de2577e21a7bccd975e2640f8933cb6d2778bf10a9d06772b6d1f39f6d",
    "historical_actual_sha256": "b9c555de2577e21a7bccd975e2640f8933cb6d2778bf10a9d06772b6d1f39f6d",
    "source_signature_sha256": "e15e8035e3704b97541985b2940aa1dd894deb3c8d446d1f746bfd081c9ec8a9",
    "provider_identity_projection_sha256": "0fb22471ac8854296bea6823199bd139758cd60019074b1e94b8dbec2cb01b54",
    "full_captured_json_sha256": "f180918ce2147624a8c3b1725d1071d7fbf7d79c4189b6c288beef79180ec578",
    "historical_source_row_sha256": "7909ea137b7ff66d8301da0bc44c6abe9a8ce4854674a47b29fc0766b90a3cec",
    "approved_projection_row_sha256": "3dc36207d9bcd9586bbea73f4c2b8046b6b2d6248f332cca09ae896a9ec0fc0d",
    "raw_selection_sha256": "7c391a679d8e0c289b658ca6d2c7689e847ea98527f25717670fc2ef404d2268",
    "public_selection_sha256": "dcc134228517d5be9d357254d9a922c1481e382690509d05e02b62dce93780c0",
    "width": 570,
    "height": 797
  },
  "d4723085-ec9c-44af-ae8a-072d3ad18a73": {
    "alias": "077",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-77",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-77/large",
    "variant_id": "96c7d65e-5383-4120-ba08-7f31d19c7e00",
    "finish": "normal",
    "current_native_label": "軽いマチャンプ",
    "category": "Pokemon",
    "original_sha256": "ceec12a398a7d0f39007034b07686c0d30192d2de910d20b7c5b33338f632355",
    "metadata_sha256": "c052a56bf94ba17cf33fa4d468d824d8cbae8ab1287472afbb00ddcc87ac316a",
    "body_sha256": "a37b2d54849bc0f7a2931ce062dbffe644be5b9ae4a0b6c6303258a6cf876b3d",
    "actual_signature_sha256": "00e1ec7f414832bee23135175c24257c48e472e865cd4feb9b0aea8da195d147",
    "historical_actual_sha256": "00e1ec7f414832bee23135175c24257c48e472e865cd4feb9b0aea8da195d147",
    "source_signature_sha256": "89c3872aaba04f8b8092a112b94e08667eec2da6bb272c1b7e9357127afcff31",
    "provider_identity_projection_sha256": "cf349953804a1a1bfad99f959861727be056f66e3a0cafb466101e7897bb025a",
    "full_captured_json_sha256": "01f325ee726a4c080cb78fff3890a1f8d042e6267a7f241b2ea78329c250e87d",
    "historical_source_row_sha256": "da2f2043c9f4390e0bd4bb1e7cfe676b9a87fbe975e85f91e45df93279bbd46a",
    "approved_projection_row_sha256": "8a114a7a34dd802bfea104097dfabfb63d0f2ee6b0324f68f96a5cde5abea464",
    "raw_selection_sha256": "64d4ca7c547900bc7e62688ec7d2c426c616442c51c00b68d91f6ba57a3e681c",
    "public_selection_sha256": "49077f0e1706810d43c44cf722e0fe9d9dc44a57fabe530aa962694b6d867b06",
    "width": 570,
    "height": 794
  },
  "3e5331dd-6de8-4a88-8311-cad5b9c2fb98": {
    "alias": "078",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-78",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-78/large",
    "variant_id": "b5cf1c6f-1ee1-42b3-8171-a380285993f2",
    "finish": "holo",
    "current_native_label": "ダークドンファン",
    "category": "Pokemon",
    "original_sha256": "480e4737229f4529fd742f7d4bd05eaebc60d8ebbb2b8c7f0d7754812245cd16",
    "metadata_sha256": "074088ba5725d811e06abe6a38bbb1cd3ffe97b3900a5ed3454460c96bd3b8da",
    "body_sha256": "b6c621128a36a5075b89018c0966531555774672bed3b23b086ef5edf6a90fc5",
    "actual_signature_sha256": "3706baf15530c7ed6db7e844a51e9e8f39204b5a0a77294b85f1cb1cc48efea9",
    "historical_actual_sha256": "3706baf15530c7ed6db7e844a51e9e8f39204b5a0a77294b85f1cb1cc48efea9",
    "source_signature_sha256": "e23b59e2784f66c1b654528d3af44f3be92a1af3469a6fabc96a119c0171430c",
    "provider_identity_projection_sha256": "2f5e25b9cfde1902a324f161b3d049c7fa20c598a21c55b19d0e4de854599b8a",
    "full_captured_json_sha256": "16e8f8a2e9952e38a69a2bec02196b2ac02b33468e3546aa0dd14b8b30dcccb6",
    "historical_source_row_sha256": "d5205365e176a7341562623060a52e022abd4e3fbafc4b4a0805012bdf3ec8ad",
    "approved_projection_row_sha256": "05a95daed6c675c163ea765f485ae043d2ad822f81ec3938f6032d8024b777b4",
    "raw_selection_sha256": "7aaeda0a566bf568165f8384d024ac8ef2e977ba83ce2cd2bf1b81a4df55f5aa",
    "public_selection_sha256": "518e610054bd576032b524615f4e6145da3860d10f13b72da5d73e1a9aa43b84",
    "width": 570,
    "height": 797
  },
  "6b4eb085-272d-49b1-9637-23902f4db60d": {
    "alias": "079",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-79",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-79/large",
    "variant_id": "d2dae672-59c0-44e6-b61a-32a7a3512a2d",
    "finish": "holo",
    "current_native_label": "ダークタイラナター",
    "category": "Pokemon",
    "original_sha256": "e689a994b6d7dd65889e49c1501cd65ff374192c4d1b9dbfca3cf2e714a6d544",
    "metadata_sha256": "8ab3c8e4ba3a1a2fd7fe598463d953fc701eb7f55366d949b8147a029c7b8684",
    "body_sha256": "445a3da9fc9e10aec457e076e907076e4910e07b2ed5f4e8fc1b869df2552799",
    "actual_signature_sha256": "c3447df58edecea53a0c03c06e885eca72753f8e66e2f6230c4cb4108f21c8ff",
    "historical_actual_sha256": "c3447df58edecea53a0c03c06e885eca72753f8e66e2f6230c4cb4108f21c8ff",
    "source_signature_sha256": "80c289beaf1f7c1ddebb00997892b31a1b2a707bdfad661c69c1e5b8467a401c",
    "provider_identity_projection_sha256": "a06c06328dd87aea61eb6a92e04f97e1074d71d56ee16834749dc2cf67fbd926",
    "full_captured_json_sha256": "bc5ac7dd539adb83c83ec3e42c11a84ec447f56c9922d456665f8dcca4a8183c",
    "historical_source_row_sha256": "55a2e2a4d2187a5fb494f2b22f9d531622044d50698fd50ed2d31871ff164e0e",
    "approved_projection_row_sha256": "f8513ce39a14eebc28d31059e93faf4fb923d8ba44044dada35dee42d832ee58",
    "raw_selection_sha256": "6654eb56f82e706e74d630351a7677dcc825792fa9e4af10559190e3f60e0395",
    "public_selection_sha256": "24e3b72e1f088b2837a5a246315a6e1e6dd45181ea1fe33a275dfbf01564d5c7",
    "width": 570,
    "height": 799
  },
  "5601f9cb-980a-4d76-bbbd-88ff23ee8ec9": {
    "alias": "081",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-81",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-81/large",
    "variant_id": "4917e3d9-9122-4a07-89dc-6819409dffa1",
    "finish": "normal",
    "current_native_label": "猟犬",
    "category": "Pokemon",
    "original_sha256": "da738baa2e863109e866568296a1f96646fc1edecd830cc7b8108653c34b3de0",
    "metadata_sha256": "ed61a16e6e5cafaf1fa103aa5e74205b787882ae428746492d31005502cecd72",
    "body_sha256": "e0ec1eb342191cee998c2021894a36a3ec87402fed24dded75a7a2592c5e0c66",
    "actual_signature_sha256": "0c96180f6a5221819dc08e1f77c579f0113cf5ac931db640145cc3fd528f4bd8",
    "historical_actual_sha256": "0c96180f6a5221819dc08e1f77c579f0113cf5ac931db640145cc3fd528f4bd8",
    "source_signature_sha256": "c5b8e99dfe607a5e0d00fab004613e2bba396974d373e33ecd4f878fc7fb159d",
    "provider_identity_projection_sha256": "f6dab21e62b39ad9624bcf8118efa88ca6c022dc41762a8086086558fe3e8963",
    "full_captured_json_sha256": "c6f63a5cdb1c2facff4cd23c2b5aa6b61ee09d4af18becdb1006f1a99a13b11b",
    "historical_source_row_sha256": "70e50ce95e0abc3b9bbfa0f85c4fc0ac03e82522cf602e08050755f0f026e810",
    "approved_projection_row_sha256": "ccc296dac182f2663d17d6d50bc934c13836bc377688787ac38a7ad65990b89d",
    "raw_selection_sha256": "738d1da3fdf269fdcfc1c4c15472edfa1d3ad56106e59b0aeef7108aa0b3b3ae",
    "public_selection_sha256": "459ff98fced983002b85760901748e736f7ef58d51a99273c799e43287ec1cc7",
    "width": 570,
    "height": 794
  },
  "235190f9-9e87-4f98-8e23-078f57627b5a": {
    "alias": "083",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-83",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-83/large",
    "variant_id": "42a45bf9-6bfe-4c54-8965-566b8ead6ba8",
    "finish": "holo",
    "current_native_label": "ダークシゾール",
    "category": "Pokemon",
    "original_sha256": "67e553b2e59c77b662b9115456dd75e635eb14c676004d8f86d132d9910a33ae",
    "metadata_sha256": "1d87f4f34664aed4fbd408a0a9ed6835b2055897d7167cd34a33bae3d34f3e1f",
    "body_sha256": "1aa82684a4d2b7d2a8672dc881ae7247fa5981ed38749c648e19464a771ec7ba",
    "actual_signature_sha256": "718a5e8542820c0346f737e30d2ba72c879f22a0603d3fae61205ee9d6970497",
    "historical_actual_sha256": "718a5e8542820c0346f737e30d2ba72c879f22a0603d3fae61205ee9d6970497",
    "source_signature_sha256": "e3b0e1a9a815222feb2a729926a60dbc1a8998c04a69236f89b11c2e157d802f",
    "provider_identity_projection_sha256": "8acf733e5b35a2a012886fd2cf41205d43507f8ecf8d92152385827c0644d52f",
    "full_captured_json_sha256": "31ba81e91dd3becf8ceaecaa611a75464977c43a2bff94f15d566e6d522da606",
    "historical_source_row_sha256": "317eaa2639ed5ae86389b4faa877cf0efe687b3899b25d17c51f9ab75a1aa390",
    "approved_projection_row_sha256": "b8782fca831824baedadef8b4b44902299e6093632b7732bca5f40a5908d033b",
    "raw_selection_sha256": "ae545c2152068238ebe60d4488f915f04c464ceda4545ef732f119ff58a2d1a1",
    "public_selection_sha256": "da8a47311a18102133027dd628f597cfe812e0f90f14e73799c818bebda1dab2",
    "width": 565,
    "height": 800
  },
  "f2978a3c-ad67-4e5b-bea9-a3546887e5c9": {
    "alias": "085",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-85",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-85/large",
    "variant_id": "b44cd1f9-fcff-4f6e-adc2-286e78e2dd70",
    "finish": "normal",
    "current_native_label": "jigglypuff",
    "category": "Pokemon",
    "original_sha256": "880c790371fef0863d0572f59335d7532b41dc8b0ffb21f709c8cf45e017e3e9",
    "metadata_sha256": "38f70e9720df417f9fc5ddf231dd29cc3f1aadb8dc5e07e501bb6e4e1e7820fa",
    "body_sha256": "e008c86772d39233044e8e243c297ac60bd3e5a0df05d4557141f1afebacfb82",
    "actual_signature_sha256": "56b42a92899b31e456923f1bfc8156e13f10bc3a9aa27a0ed75c09db2b8fffba",
    "historical_actual_sha256": "56b42a92899b31e456923f1bfc8156e13f10bc3a9aa27a0ed75c09db2b8fffba",
    "source_signature_sha256": "7ade786392caa3ed1f0b068d31a0a0cee2d35df16a6053c07109f048726867e0",
    "provider_identity_projection_sha256": "ed554017bef50c101cdc7684f8e9e3ff6c088b50c3d87d4cf7c97facaffa6894",
    "full_captured_json_sha256": "f43baba23a41b0d089dc014efde872866d95a8810a3939a374d1189d261572b3",
    "historical_source_row_sha256": "0859d372da5c5dd850479aa56d9fc6e96c0c2f77f24738c355aa02fd82f70894",
    "approved_projection_row_sha256": "69fa1dedc546ee89487fe32c8afc4f80b478c092463e848fc822a5f561c3bcf0",
    "raw_selection_sha256": "0688492ec43abe0cc6579148d9712b994d2bc94fdb9e2bb11185b22a92e01769",
    "public_selection_sha256": "c317670a641853066c537868acd388f7937858f8c479b30601223673abb03444",
    "width": 570,
    "height": 794
  },
  "8e35f2a3-1a90-45c3-8766-bca908ce7bdb": {
    "alias": "086",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-86",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-86/large",
    "variant_id": "8785a065-b4d4-479b-9aa1-d85a9128ed02",
    "finish": "normal",
    "current_native_label": "ポリゴン",
    "category": "Pokemon",
    "original_sha256": "83ece69a8003fda16d7df5ef8b2c18323370f65ca734ca189721181d96f90d7b",
    "metadata_sha256": "a0d46b1cb5141715ba75b3aa65e0cc9759acb779c2c653814708fcb7a8783108",
    "body_sha256": "cb9a7cca3b2479b9b537ec6fb859ddeb4523066e9fc61274dfc9880fd2b3ac4b",
    "actual_signature_sha256": "feb2a61e7f8404819fc2526e5d72ae9c9e987c1891c3818625fa8b42157336d0",
    "historical_actual_sha256": "db249917e62ca7a840217477df18db04b77d98b242ae20807e79b2ac3224ae71",
    "source_signature_sha256": "9c114d697872214f66f765c7266a64a69882df5801cdd682cdae19917e374a99",
    "provider_identity_projection_sha256": "50f91f513c66d63941fd532550837c6310fd478c2b379fb4dd0502dcc51ca6cb",
    "full_captured_json_sha256": "e06cc1be0bc50bac4c0cd4bbf11123aceda7be2ef20a0cef31bf387f032f8d03",
    "historical_source_row_sha256": "9fb9bc0f2ef2c088a571d72efd6556fc4ab97288b4935ca89ddb6dc4e30cabe7",
    "approved_projection_row_sha256": "bc8d84a7e0c0358f83cdb8d5b83e9f4a750945eddabf18c26eb527ee706a20cf",
    "raw_selection_sha256": "76a23ac660d68bc7a3a42b88c1860c6c32dced35de8bf11197ac11e3a273f911",
    "public_selection_sha256": "cf580dc9b6578c5eb027b50f9ae41b53e268413aabbc4d5022f11cb2e9535bab",
    "width": 567,
    "height": 800
  },
  "d04781e7-5e12-47cd-b670-795c18aa2ad4": {
    "alias": "087",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-87",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-87/large",
    "variant_id": "13302cdb-7485-4096-8224-8f3c770d8734",
    "finish": "normal",
    "current_native_label": "ドラチーニ",
    "category": "Pokemon",
    "original_sha256": "92def39c0b2d349e48edb7dfae33108bf222fa0287b7aec1d6056eb73e60505c",
    "metadata_sha256": "c5708d658a6b070e8d9d4750bccbc5875cc92dcb34075da0a44bdcc6f606b742",
    "body_sha256": "04bc9df9e5219d31954730089f5a0db56de59a21a34d3bb0e12305a46af58fde",
    "actual_signature_sha256": "9c2de939a946c07bfc216db97e26d1b027ac67c6179fa855db3b9f6a5116fa1c",
    "historical_actual_sha256": "9c2de939a946c07bfc216db97e26d1b027ac67c6179fa855db3b9f6a5116fa1c",
    "source_signature_sha256": "3ce01cd823a92adc1924c613772dd1ce705299aa3a4e4ece4bb753342c864c3e",
    "provider_identity_projection_sha256": "87bf73bff64e65c1d8c33ec1ac938c8932141ed3b4c5030d51afb8af9fba9522",
    "full_captured_json_sha256": "c1f95856afcce26c3a941d7cba09a1545676068c4e68cf9f701f9de6110b9d86",
    "historical_source_row_sha256": "76c88874d2599c6d6787bab906887a81668a34ccf651babae231bc592867b89f",
    "approved_projection_row_sha256": "0b8b8e1a3a351a8b403e77044531415964e203c42d28b697771b697fad962549",
    "raw_selection_sha256": "38d7b0f0da27350ca8ca4f8fa463dab6454fcd484993e5f55930b67b42f5bc08",
    "public_selection_sha256": "b1e69cd3962d0b8aaf27b2b67f40b2a8efbcd8060123efadb14db9070e611c04",
    "width": 570,
    "height": 794
  },
  "cb5b2bca-d81e-4dd3-bb77-7485089c0366": {
    "alias": "088",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-88",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-88/large",
    "variant_id": "c0b75584-75a6-45f2-b761-348414b112e3",
    "finish": "normal",
    "current_native_label": "togepi",
    "category": "Pokemon",
    "original_sha256": "2d84064f0bc7d7ce0fa967b23f1e5789c062bbcadb5bc8b731cc3e0a6a4a3ee7",
    "metadata_sha256": "aeb7ed60f53275b690b78b4439f225b9639fbe319395698c2bad5185e5a96126",
    "body_sha256": "2d2db71eac1b1378f92aa239137405944ee3a5b7a11bb6d5db47614c384c7f0a",
    "actual_signature_sha256": "e39406c52c194de3a1e6a33fe0c7945a4d61b93af02757f9bf36efeea29995cc",
    "historical_actual_sha256": "e39406c52c194de3a1e6a33fe0c7945a4d61b93af02757f9bf36efeea29995cc",
    "source_signature_sha256": "03fc832ea0232b4eb2a8c9e338ec330ae0c42e14958ddd6be9787ba41a629c51",
    "provider_identity_projection_sha256": "68c3fe263b6872a4da046a626dd0f97a5ecaa513618fb3ad56dfacabd4f8801a",
    "full_captured_json_sha256": "bdaddbe7dfc58cc3e6f5febfb948c912593eef2defd6c2bb307d22b50d626399",
    "historical_source_row_sha256": "bebd00aa99eb6e23874094426da4b08723f67a5d993997227263cec92a7a8262",
    "approved_projection_row_sha256": "afe00d9280e531401ff72fec7651e781138aee5d275387e4691961b69740d8df",
    "raw_selection_sha256": "0e13d6b5ce60e462aeea5744b58fd88ed1345cb706909318ce873bc55c6e1864",
    "public_selection_sha256": "ff847258f2660923fb06c38da9709ee7a6aa3c3874849ad10191e0dcd53c6a11",
    "width": 570,
    "height": 792
  },
  "f10aea3f-8848-4d1d-8ca4-9b442cff54d5": {
    "alias": "089",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-89",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-89/large",
    "variant_id": "c0b5ca3e-bbeb-491a-a58e-f6e98604feba",
    "finish": "normal",
    "current_native_label": "Girafarig",
    "category": "Pokemon",
    "original_sha256": "d54fb2ea2092917a941d06b2f67a3f05ad4e3a5191199984d659abbc2622cbcb",
    "metadata_sha256": "38415f7ca52bcadca2c8e322e902cb85d4c84077e0a4a3c0fdfd8b8a9889fca9",
    "body_sha256": "6bf4d27040f6b1fa1d951277ccb42667ab4f51e2fc66594b47a141c94a2cb491",
    "actual_signature_sha256": "9dc59ed76c6d5565b3541bdeaee66549b8759ff30b4bfe8b3bdfe393814b57b4",
    "historical_actual_sha256": "9dc59ed76c6d5565b3541bdeaee66549b8759ff30b4bfe8b3bdfe393814b57b4",
    "source_signature_sha256": "65e141a282cc792f56e444c6eddc48a36ad3f6b0555052c01827ef4a2e92b82d",
    "provider_identity_projection_sha256": "732c07252fe70f488d178427cd36b3168db8b514ca78bdd71ad6903813c2d93a",
    "full_captured_json_sha256": "3d1a6a3e257a3047497259735976e6adf1ea0743787e9290b99ccfa9f56a8f8c",
    "historical_source_row_sha256": "c431dc2f132c729b5abd9a28de2ed0bd7f198c02eca08b8681c16b9a60e7d331",
    "approved_projection_row_sha256": "6288068bfb1065a38d79ddf0a939553fea7671a877d70e4ade933b9ef2facafb",
    "raw_selection_sha256": "2ab0037c439dad2efd1af0753bf33a467bab054f6f9af7b2549807a71da7e1dc",
    "public_selection_sha256": "43e1dfe5ae070f8d63db7ffe5fc0fd16326887a21b689f114849fd8bd5f90e02",
    "width": 569,
    "height": 800
  },
  "e09b03e5-6d2c-434f-9d1c-02349802641e": {
    "alias": "090",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-90",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-90/large",
    "variant_id": "d72085c4-6c4a-42f2-b306-f55fee035366",
    "finish": "normal",
    "current_native_label": "軽いウィグリティフ",
    "category": "Pokemon",
    "original_sha256": "1dc72e140856aefacc6ae022eadfc39d3b1a53801b8cd557c1da8e859b3e0240",
    "metadata_sha256": "ee3058b732950d4368fb412f7d3dbbfc480522ed2e6d60de028b937c19790bf3",
    "body_sha256": "837c7b0dd1957b19f8c45ff16a634cc42536fe8c1cab4bf97dfb8a0663dca468",
    "actual_signature_sha256": "73220c81c81b91f4bcee34516da9753031335d5d1e2230bcebca83eeebf798e4",
    "historical_actual_sha256": "73220c81c81b91f4bcee34516da9753031335d5d1e2230bcebca83eeebf798e4",
    "source_signature_sha256": "4ab96efbbaf0d5455852bac26012703a5de0f4f2502bba926df416594a7432ac",
    "provider_identity_projection_sha256": "b637f17c37d4fdcb953d283269e6e66cbf8bcb736d5046691747efdca51a39cc",
    "full_captured_json_sha256": "e9a2125e6914ab8f9b271ef42cc546edf005d95c417d56191be1441ef0c7e1f5",
    "historical_source_row_sha256": "7896afb99789a9b7a101f1153dd697d40ccc5cb554bd70b8876cab82fa36964a",
    "approved_projection_row_sha256": "c85adaf3d4f8fde4c642ce9190d9d1af05ab2edd414467451f041eab9d2d95d3",
    "raw_selection_sha256": "5c4ac88dd16851d57bea54e0a753de41bf75c80159b925c1a32ac99bdae1507d",
    "public_selection_sha256": "2e3f34cadf1cad80593959455f9c89db623be910faadc38fdeb3efa440e099fb",
    "width": 565,
    "height": 800
  },
  "b0e3b4a4-d025-4c7e-a849-97a107ee24f9": {
    "alias": "091",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-91",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-91/large",
    "variant_id": "10607154-e5f7-479d-aa00-ebda9176c42c",
    "finish": "normal",
    "current_native_label": "ダークウィッグラット",
    "category": "Pokemon",
    "original_sha256": "d59f811729976610a8739f5e0582525c403ed0780c95103a4b25fc9a47cb2a16",
    "metadata_sha256": "0bd34968835d875932686e136013f1ed534e65b5eb8335f68e30efaa9017aee7",
    "body_sha256": "23e6ac7e5a9501aecf128e27ef28e1faa64693ef4a5b50091a7fd782c656a567",
    "actual_signature_sha256": "c87bc236f46caabe5ff5b70ae24cc81ff2c5075ac2e881ebb3268fa9529123d5",
    "historical_actual_sha256": "c87bc236f46caabe5ff5b70ae24cc81ff2c5075ac2e881ebb3268fa9529123d5",
    "source_signature_sha256": "e904d4288694a1528c878576a601e3b9d795bb65244526a2d12b1a93b8275bdd",
    "provider_identity_projection_sha256": "0e41535a60390c5c76328b93bb9d85a9da70105348453892f8bede51d028ca0f",
    "full_captured_json_sha256": "759009d11f563d1d16afe80fcf046c057b206f2ab605c97f1acbac4420179649",
    "historical_source_row_sha256": "c506faf8592ad823d656b015721c194799ecf8164a9847c0f0a6d74c5b5dc062",
    "approved_projection_row_sha256": "0550037891d93f86756b5303117bc1527dd22278bc616a5eed7a77d04d0096d9",
    "raw_selection_sha256": "4ed5894b3399dd0334f5f70289c18a1dce88ae85dc1c5077a01f71ad1ce8c625",
    "public_selection_sha256": "b16fb43c6540d4650f929cc7bc45d46b3249e892a7f8c420b42cb23caeba5a36",
    "width": 570,
    "height": 794
  },
  "ec558d10-fab4-4d34-922c-3635a8e97e09": {
    "alias": "092",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-92",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-92/large",
    "variant_id": "3312f218-21b4-4576-8974-6ef266f5a55b",
    "finish": "normal",
    "current_native_label": "チャンジー",
    "category": "Pokemon",
    "original_sha256": "4eef57a9904d2c47a1de9779866ae29e92a4a2017b2a0f107eff72670f9cde99",
    "metadata_sha256": "ae5c4a2837a7fa9ccaddae7f265293809fde7ee12affcec4e2ad9194c51b9ef0",
    "body_sha256": "49947082914a666706680bf504641f8c9e272b619262ce6f1f3190faf16c1813",
    "actual_signature_sha256": "2a1d58d70d74a466abb3bcc6457de20d917f5e0ea4a19c66b27d7ab11f0e7f1f",
    "historical_actual_sha256": "2a1d58d70d74a466abb3bcc6457de20d917f5e0ea4a19c66b27d7ab11f0e7f1f",
    "source_signature_sha256": "a8d752b31aa7006951f2fd039c0374a0884b85de1af739ff87caedabdc1dc9ef",
    "provider_identity_projection_sha256": "22113c510de8ac127fcff70061901f1f3d4ed03974e985779c44521760c650f0",
    "full_captured_json_sha256": "01d534fc97c53167bab777b01ae033162b9d64300ae40cae94e2822f45cc25b6",
    "historical_source_row_sha256": "a5cc992923bdfcce0290e7b8410730363afa828cff0780bc7c93544285e5ca5d",
    "approved_projection_row_sha256": "1a177e1111fd8bf9a4aa4d977488cfd911bb282e4a7e9bacad9625864983cca1",
    "raw_selection_sha256": "ab1153dcd692b98ef6060e3f1646af227171a6c4e6eb1226edc043eb41199254",
    "public_selection_sha256": "b539d368f051829dccfc83cbdae5c411fae3ecbff8153e2fd9e60ce1eb8d824b",
    "width": 570,
    "height": 797
  },
  "9b9cb940-c924-44e8-9757-464904ccb4d1": {
    "alias": "093",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-93",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-93/large",
    "variant_id": "82884367-3e30-4120-8a28-dc02312191e1",
    "finish": "normal",
    "current_native_label": "ライトドラゴンエア",
    "category": "Pokemon",
    "original_sha256": "0902de4526b3dd0814ecd037b6276ad2c04f31aa469bbe5beb3667bdabad1d25",
    "metadata_sha256": "2573613d2889b72c36c18e2fd352b294c5bfc31eaf558811ec1938240c158596",
    "body_sha256": "86e575d5ee2d99a2417dd7450ebd72359f1a63f6dec9fa9bdc6b4cc7fb12cc41",
    "actual_signature_sha256": "7f7750cbf431e9e91bcf643527d9b0a3d8e125559fb4075659e3223ee84c2d0f",
    "historical_actual_sha256": "7f7750cbf431e9e91bcf643527d9b0a3d8e125559fb4075659e3223ee84c2d0f",
    "source_signature_sha256": "85dd4dcb753f1510bec218eaffbf7788dad7ad8582290c1ac74657e3a448fd17",
    "provider_identity_projection_sha256": "a97dfad33a7b64b2a2b56739a6ce042cf6b36d240f10929bb721c0b154cfa89c",
    "full_captured_json_sha256": "8256d683bb8e480d982b4a73a63d77d34b7a9acde8ddbf56de543fa023837f89",
    "historical_source_row_sha256": "7a37d449e1a190a7545eeffec5de5826c233376ee2b37fbcfcb4b0361eef8d5f",
    "approved_projection_row_sha256": "3cae76a18491b2a0144678887293544c460bd97c8b558d62bb0fac1626881805",
    "raw_selection_sha256": "4fa3cbcde9461afb02b679b129c8068fce411746be76f024f84d2bb6bdf66d20",
    "public_selection_sha256": "847331b9c4a8597cdc4ac12646a069de468dfac059874a5f3a7546f36087ef4b",
    "width": 569,
    "height": 800
  },
  "322a894a-2bde-4d8e-9af7-39328fd39108": {
    "alias": "094",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-94",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-94/large",
    "variant_id": "4c79fb2b-1c6d-48de-a63f-a91a181831ca",
    "finish": "holo",
    "current_native_label": "軽いドラゴナイト",
    "category": "Pokemon",
    "original_sha256": "d488d13fe6c98b4371997824dde1312058ca4e86418bd6b6f12219699c41b2f8",
    "metadata_sha256": "f28e822879840a5f8ba56ac50448d564fe2f5db2660869e39be39c74efbf3004",
    "body_sha256": "cf219cf56f334c22ae8a2efd3b1b78eea761447cc3eb69af4d1124f98673d311",
    "actual_signature_sha256": "2258be436a5849bb5eda8046914c4b41cf3d661e86d9ccbb769419d7542781e4",
    "historical_actual_sha256": "2258be436a5849bb5eda8046914c4b41cf3d661e86d9ccbb769419d7542781e4",
    "source_signature_sha256": "2ffcd8a01206664cbaaf805014f76d536aba0c46ae484811c4d0c103a81278d9",
    "provider_identity_projection_sha256": "f117bc71f869ce519038081db0a41e79430dd1ab4f69414bd737b50225028a6c",
    "full_captured_json_sha256": "55c2eaa9108f77597e969d496777e6922cfa1d0c557e67a3b427dda2e234a6c6",
    "historical_source_row_sha256": "c1c407bdccc0c56e56185eb7f47cc9ce274715e68fd32f0da637af4623ccb245",
    "approved_projection_row_sha256": "8ee23c86008230c85edbe031fd979c8d2c7736ef638be27ef78444c9a2234b22",
    "raw_selection_sha256": "8c66749fb4f44f47bed9ebf5a40cab4da44757ed4442b1f85efc9a1a064f3954",
    "public_selection_sha256": "440ef3b84e3344a5d2f2612eca1d59f2ab477f47cf5993315a74d6569f0104f8",
    "width": 570,
    "height": 797
  },
  "66c78deb-b48f-4c38-b3fe-3caa693b220a": {
    "alias": "095",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-95",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-95/large",
    "variant_id": "4a897634-8e36-412c-aece-65f30da9168e",
    "finish": "holo",
    "current_native_label": "光から光",
    "category": "Pokemon",
    "original_sha256": "f4960f1ac03936eba0e4d1a3adc179b544484de3a1447949d8d954a63fc02510",
    "metadata_sha256": "7a8921ba2155298dd7736cf5c3beca75ab3e5137537dbd645b5a0381923a5a56",
    "body_sha256": "5ba9d1c3ab91b93b109c3bf27af2fa6ba9e544e37107b665eca84695e9d5aa7f",
    "actual_signature_sha256": "c82b55fa49d78b3fbb14708a04859b22a1fe5f54521f0c9a7c331476a7be3546",
    "historical_actual_sha256": "c82b55fa49d78b3fbb14708a04859b22a1fe5f54521f0c9a7c331476a7be3546",
    "source_signature_sha256": "f2ebef7439c6537c8fcc1f6fc8a6a9dcb23814b6741e57bce0512b382991cfe4",
    "provider_identity_projection_sha256": "23c299a4f90783df764f48774337491ef16524dd83b9652c5bffd12556ee430d",
    "full_captured_json_sha256": "32fa568a69e8b31845aa91c721d0b34a844788e28e1d5cbc93037d5989009338",
    "historical_source_row_sha256": "157d7a69d54a9c9e833aa3569726bc6a27cf93d7b44c8f0019c2e17bbe1b59e2",
    "approved_projection_row_sha256": "8140e5d33f0600c5d47555712829a86aa0528e0c7db5023ee6b4be2e01599fc6",
    "raw_selection_sha256": "31e6f42a613163c0e53aee91117e19126f1bddfa592113926fff5cf0111186a0",
    "public_selection_sha256": "e29c5881faf34e4f9d9f16621688233aa10dd76d180daa18f75b6bfd3dede3aa",
    "width": 569,
    "height": 800
  },
  "33b1aa83-3fd7-44b4-ab6c-c27cdba89c2a": {
    "alias": "096",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-96",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-96/large",
    "variant_id": "139a9d0d-426c-4767-b168-018490c426c9",
    "finish": "normal",
    "current_native_label": "暗いウルサリング",
    "category": "Pokemon",
    "original_sha256": "a2b1366ae45385180300e9317247da3b5686f0443e2af92d4149ad2e0399f5bd",
    "metadata_sha256": "bf3e579ad7f2bd36e3a2fcd973caba3abd976af77703076e576933a871074240",
    "body_sha256": "d116231f8ce2cee0345600dff1dd822ee980af152d3cd4ecca6e6fc9899ab26f",
    "actual_signature_sha256": "f7f7cd6d32f48901b113ea1b1e9ffd3d48e5a6657f15c67bad39e7747c34b4a1",
    "historical_actual_sha256": "f7f7cd6d32f48901b113ea1b1e9ffd3d48e5a6657f15c67bad39e7747c34b4a1",
    "source_signature_sha256": "728f31ae079f13db66859570525414c479ecb66bd791a7c9441803de5278d41a",
    "provider_identity_projection_sha256": "00e7daa5a3a267121d4f5c344b8ebe708e7aa6f23e455a1cf781c7d6dfc1d1fa",
    "full_captured_json_sha256": "e61ab4aa609a63d42a5e3369c4bb93562ac92061d22be5c028aa5ddc25c21970",
    "historical_source_row_sha256": "f81a191b5db1cd29f4f4134e864a9da7c631d381f2b78848d661cb1f5f05c64c",
    "approved_projection_row_sha256": "4e4991ed3f9ddf99d8129606297737feca0ea5b87b981b4df7c9018bd2dee163",
    "raw_selection_sha256": "1c9d22fd26afe3ac80b8a7d20f119891016a39bec143eca816d1a90231280e65",
    "public_selection_sha256": "7329501a642d1675bd21dbaa3500f00c7ae443ba9aff8fa9d3186ccaf3ffc878",
    "width": 570,
    "height": 799
  },
  "77d7edf5-3e6f-492f-8983-484fbc1be9b1": {
    "alias": "097",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-97",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-97/large",
    "variant_id": "8ad946af-9506-4646-a2e6-fbd4098e460d",
    "finish": "holo",
    "current_native_label": "Dark Porygon2",
    "category": "Pokemon",
    "original_sha256": "5abb62645e3ca7c42f9047c02e7da5a1dbf98f9030608c3a32b100e986a0d4a7",
    "metadata_sha256": "fc158a4dcb2ee201563230ce8b5150c0644008a46ddfb23cdd952f940b278d0e",
    "body_sha256": "7fdade7f402bf8500f8370db183ba398f3d9ebb641ac5dfc2ff9f6fbee07596b",
    "actual_signature_sha256": "488808986f17b6d16b51da002494e7747629c78c517cf744d75974d80dfeae45",
    "historical_actual_sha256": "488808986f17b6d16b51da002494e7747629c78c517cf744d75974d80dfeae45",
    "source_signature_sha256": "9afd364953345cf5b6238b1afa1b7cb362d24d6ac84dae877ddfa090afff0ef8",
    "provider_identity_projection_sha256": "ed689d911b5e92f16b0133f7e65faea96c6b4b607c3611975c583eb8c6ee1fcd",
    "full_captured_json_sha256": "40385f64c608787a40dc969c94be5103f12a6753cc01233f0205f3577d76b30a",
    "historical_source_row_sha256": "4d3a145ffb06bd3b5ae35ffb4fc87aa3e097fa7dd3f75dc915552e30bda5226d",
    "approved_projection_row_sha256": "1dbe2f6c9c30f92f81943ca0398d31f13230195bd27793eaf69ff591d83329df",
    "raw_selection_sha256": "ea0a3d2fc94054620127db56639a98d96f76abb95771727f1c4b9dfd36e2b57f",
    "public_selection_sha256": "fa6cdb0511cd4d3bcd870485a07d42897db3502a449e94066ad368a004d56072",
    "width": 570,
    "height": 792
  },
  "da4fefcb-00d3-465f-965d-325e0bc98d25": {
    "alias": "099",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-99",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-99/large",
    "variant_id": "0f76dacb-a82d-4876-b6c9-93cb53425f82",
    "finish": "normal",
    "current_native_label": "粉末を癒します",
    "category": "Trainer",
    "original_sha256": "a15ad4f1342048977818e72a83f2c17ea65803736908fde8162196f5acf7777a",
    "metadata_sha256": "19bd853ab7c56e782a8024b29eac226ea061522e05442ba0e687ec88c0e27166",
    "body_sha256": "eb4a6f3e9471c5ab7762d84259c0c418a8e63eb4de1ddf319dbe17a182ca23ad",
    "actual_signature_sha256": "a33a004c009b5b6ebaa40c24eeeca013f7207192aec414c9bca739b9a9c5e285",
    "historical_actual_sha256": "08612032b146d5ca9d733343908a6ef99ef54e41e67f5088573c72502d8a77e6",
    "source_signature_sha256": "eb2a763eaa93922271f7511d548e3eb6c508b16b95838bff4142d8ac2aa92cef",
    "provider_identity_projection_sha256": "38454b7813fc61a6cd29d3c465aa530b7758e8538670ed3b8caf9ed5e4178826",
    "full_captured_json_sha256": "84f7f14463fa4b409d67563e454a1fc9d2cc9ea9840d73557487746c3a4e95cd",
    "historical_source_row_sha256": "0f0f9868549f543ace6695bad3054e4c7bb84e1d52dd4fad98eaae54171c536d",
    "approved_projection_row_sha256": "06ebe284c0101020e2313ee7b88902a123cbc6621ba2dd6aa8114d71904a5ed5",
    "raw_selection_sha256": "f1f5e41d8a0b0817a9102bb54c66fdc26b5f0a9f4c4dfc20a497f51b33faf029",
    "public_selection_sha256": "c97916d0922e22ccc59a03e9129ff8039085c6e274696b344b91fcda160ca644",
    "width": 570,
    "height": 799
  },
  "c5413601-e5a9-4724-bcdd-aabaae49d0e6": {
    "alias": "100",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-100",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-100/large",
    "variant_id": "d3a1aaf5-6da9-4e42-91a1-8bec10862bc5",
    "finish": "normal",
    "current_native_label": "ビルからのメール",
    "category": "Trainer",
    "original_sha256": "3ffb30dc5b80957615c167ac46fda81c4654c6faf029be70bfdf888df85b8437",
    "metadata_sha256": "6f99969dce68d87d94c32cec64200b2285ce8be9d73d248139ef6834a97640da",
    "body_sha256": "8b2bbdb34223f6fd3c0495a0fce80ff2ce52934980c5f4c30635d25bd329e1d6",
    "actual_signature_sha256": "bc1e9f2f2ba659ac1e3b9c5d5eac1ad2223d047989a71a5d1f45bd9124aa36fc",
    "historical_actual_sha256": "0dfbb86fb60f13388639e2674bf2f7273a3d30bbd1d9ac023f5ba415fab2947f",
    "source_signature_sha256": "e128d81ff6f6809efb3762231a11456614f5b5a13fe505ade3173255eca06f96",
    "provider_identity_projection_sha256": "58528c647630d0c7020b7eeafbe0aed7eaf3c96f2c4cf6c95d361e7582ee6878",
    "full_captured_json_sha256": "cee959e18774601688a8fee1bceafd4ab67d74cd6beeb17757173040c4785cd8",
    "historical_source_row_sha256": "25170ab78b2e943395edff2662753fffcae5e640d69969270e2698c49d616d07",
    "approved_projection_row_sha256": "6b25b90445fb9128ffb3f3074aab230ab2f3726cafea43c13536cb35031474dc",
    "raw_selection_sha256": "9c1a8ffa13e592b6174871628c395493919512aaeb07aa7b58d32aaf19b3b506",
    "public_selection_sha256": "1bdb4a26aff7a97181f4ca5693473bb7fd6322822ee57dd4f7a037a9f971cf83",
    "width": 567,
    "height": 800
  },
  "1445e2ba-a0e9-4e39-ae07-4a4326ba4ccd": {
    "alias": "101",
    "batch_id": "JP-CARDS-016",
    "provider": "neo4_ja-101",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-101/large",
    "variant_id": "904a1dc6-3e3f-4ed0-9476-a105fb5bdda0",
    "finish": "normal",
    "current_native_label": "エネルギースタジアム",
    "category": "Trainer",
    "original_sha256": "6d1700d12fb736f07a0b9350821fbc222d3b594cfb69a3a1e0420f85911dbc85",
    "metadata_sha256": "d68acfed00a713deb262841168efd2046f9c0424b308ce90fa982e575027df67",
    "body_sha256": "ce6eeaa9fb6c5b6bf84ef5fbe2383aa70d067e94b75cd7cdba14ef35b977a2b2",
    "actual_signature_sha256": "e3e0ae18571dac74813f9c99c2b1e07062a0c24b7a247dc97ed9eeb37484f4c6",
    "historical_actual_sha256": "cc4cde485d28918e8674aad8f586d588457c0762ac14a98f1ebc5b4290ddd8c3",
    "source_signature_sha256": "ff0c4a8f7d2f1c28dcb76e90f4a9b68df58d94dd1e5a180d49f61dfede4b2cdc",
    "provider_identity_projection_sha256": "b3ba2106cf944c497ecc65a21af2eff6ce50f9fef013befbda64a8a2ed8ec871",
    "full_captured_json_sha256": "e5849f0c27ffc11973049d9f1ce4dd14fd94a34afed249061437afc067aa71bb",
    "historical_source_row_sha256": "4f58518aa8f023a71eec7411b6e083f326a27a1ee5498549f57f6fe90958f1ce",
    "approved_projection_row_sha256": "f0d6ed4d6d6201f969ed44b38d368519a9aca4002b50faba7c32019083eba3e5",
    "raw_selection_sha256": "a916cc752ae94108fea1a4d8f3029f896a615eb94bc04bdb87621ef7d9026a3b",
    "public_selection_sha256": "b49a21cb90c52e1650949f70c3c56115bf27b5e31e9e43eb93a810b70c816098",
    "width": 570,
    "height": 799
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-015",
    "JP-CARDS-016"
  ],
  "saved_batch_tasks": 50,
  "eligible_fronts": 45,
  "by_batch": {
    "JP-CARDS-015": {
      "verified": 24,
      "held": 1
    },
    "JP-CARDS-016": {
      "verified": 21,
      "held": 4
    }
  },
  "excluded_aliases": [
    "068",
    "080",
    "082",
    "084",
    "098"
  ],
  "excluded": [
    {
      "batchId": "JP-CARDS-015",
      "itemId": "card:0464cc14-2b69-40f1-a65b-819e8cddb311",
      "printingId": "0464cc14-2b69-40f1-a65b-819e8cddb311",
      "variantId": "5220a90c-7040-433d-9421-33c01255ae6a",
      "canonicalCollectorAlias": "068",
      "currentNativeName": "輝くミュウツー",
      "currentCanonicalProductionVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "5220a90c-7040-433d-9421-33c01255ae6a",
        "finish_code": "normal",
        "printing_id": "0464cc14-2b69-40f1-a65b-819e8cddb311",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くミュウツー",
        "collector_number": "068",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      },
      "currentCanonicalStagingVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "5220a90c-7040-433d-9421-33c01255ae6a",
        "finish_code": "normal",
        "printing_id": "0464cc14-2b69-40f1-a65b-819e8cddb311",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くミュウツー",
        "collector_number": "068",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      },
      "candidateSourceCardId": "neo4_ja-68",
      "selectedSourceCardId": "neo4_ja-68",
      "sourcePageUrl": "https://scrydex.com/pokemon/cards/shining-mewtwo/neo4_ja-68?variant=holofoil",
      "observedImageUrl": "https://images.scrydex.com/pokemon/neo4_ja-68/large",
      "sourceVariantSupport": {
        "currentVariantCode": "normal",
        "currentFinishCode": "normal",
        "sourceVariantNames": [
          "holofoil"
        ],
        "supportsCurrentMetadataVariant": false,
        "globalFrontNotPerVariantProof": true,
        "physicalFinishVerified": false
      },
      "holds": [
        {
          "code": "source_current_finish_conflict",
          "currentVariant": "normal",
          "currentFinish": "normal",
          "sourceVariants": [
            "holofoil"
          ],
          "sourceRarity": "レアホロ",
          "sourceRarityCode": "★H",
          "action": "Exclude from later original capture unless exact current/source finish identity is independently resolved. No catalogue correction or physical foil claim."
        }
      ],
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision.",
      "original": null,
      "imageRequests": 0,
      "actualPixelsInspected": false,
      "eligibleSourceOriginalForIndependentReview": false,
      "preparationApproved": false,
      "publicationApproved": false
    },
    {
      "batchId": "JP-CARDS-016",
      "itemId": "card:01f67252-c150-4653-b9d0-426c66aee027",
      "printingId": "01f67252-c150-4653-b9d0-426c66aee027",
      "variantId": "6245ff29-5fd2-4a5f-9e1c-9730d5d2c0e9",
      "canonicalCollectorAlias": "080",
      "currentNativeName": "輝くカブトップ",
      "currentCanonicalProductionVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "6245ff29-5fd2-4a5f-9e1c-9730d5d2c0e9",
        "finish_code": "normal",
        "printing_id": "01f67252-c150-4653-b9d0-426c66aee027",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くカブトップ",
        "collector_number": "080",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      },
      "currentCanonicalStagingVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "6245ff29-5fd2-4a5f-9e1c-9730d5d2c0e9",
        "finish_code": "normal",
        "printing_id": "01f67252-c150-4653-b9d0-426c66aee027",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くカブトップ",
        "collector_number": "080",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      },
      "candidateSourceCardId": "neo4_ja-80",
      "selectedSourceCardId": "neo4_ja-80",
      "sourcePageUrl": "https://scrydex.com/pokemon/cards/shining-kabutops/neo4_ja-80?variant=holofoil",
      "observedImageUrl": "https://images.scrydex.com/pokemon/neo4_ja-80/large",
      "sourceVariantSupport": {
        "currentVariantCode": "normal",
        "currentFinishCode": "normal",
        "sourceVariantNames": [
          "holofoil"
        ],
        "supportsCurrentMetadataVariant": false,
        "globalFrontNotPerVariantProof": true,
        "physicalFinishVerified": false
      },
      "holds": [
        {
          "code": "source_current_finish_conflict",
          "currentVariant": "normal",
          "currentFinish": "normal",
          "sourceVariants": [
            "holofoil"
          ],
          "sourceRarity": "レアホロ",
          "sourceRarityCode": "★H",
          "action": "Exclude from later original capture unless exact current/source finish identity is independently resolved. No catalogue correction or physical foil claim."
        }
      ],
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision.",
      "original": null,
      "imageRequests": 0,
      "actualPixelsInspected": false,
      "eligibleSourceOriginalForIndependentReview": false,
      "preparationApproved": false,
      "publicationApproved": false
    },
    {
      "batchId": "JP-CARDS-016",
      "itemId": "card:a60cc68b-374e-46da-8caf-05264589ea9c",
      "printingId": "a60cc68b-374e-46da-8caf-05264589ea9c",
      "variantId": "25abbfaf-57b2-4ee5-be36-e2eb2e1940b9",
      "canonicalCollectorAlias": "082",
      "currentNativeName": "輝くタイラニター",
      "currentCanonicalProductionVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "25abbfaf-57b2-4ee5-be36-e2eb2e1940b9",
        "finish_code": "normal",
        "printing_id": "a60cc68b-374e-46da-8caf-05264589ea9c",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くタイラニター",
        "collector_number": "082",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      },
      "currentCanonicalStagingVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "25abbfaf-57b2-4ee5-be36-e2eb2e1940b9",
        "finish_code": "normal",
        "printing_id": "a60cc68b-374e-46da-8caf-05264589ea9c",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くタイラニター",
        "collector_number": "082",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      },
      "candidateSourceCardId": "neo4_ja-82",
      "selectedSourceCardId": "neo4_ja-82",
      "sourcePageUrl": "https://scrydex.com/pokemon/cards/shining-tyranitar/neo4_ja-82?variant=holofoil",
      "observedImageUrl": "https://images.scrydex.com/pokemon/neo4_ja-82/large",
      "sourceVariantSupport": {
        "currentVariantCode": "normal",
        "currentFinishCode": "normal",
        "sourceVariantNames": [
          "holofoil"
        ],
        "supportsCurrentMetadataVariant": false,
        "globalFrontNotPerVariantProof": true,
        "physicalFinishVerified": false
      },
      "holds": [
        {
          "code": "source_current_finish_conflict",
          "currentVariant": "normal",
          "currentFinish": "normal",
          "sourceVariants": [
            "holofoil"
          ],
          "sourceRarity": "レアホロ",
          "sourceRarityCode": "★H",
          "action": "Exclude from later original capture unless exact current/source finish identity is independently resolved. No catalogue correction or physical foil claim."
        }
      ],
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision.",
      "original": null,
      "imageRequests": 0,
      "actualPixelsInspected": false,
      "eligibleSourceOriginalForIndependentReview": false,
      "preparationApproved": false,
      "publicationApproved": false
    },
    {
      "batchId": "JP-CARDS-016",
      "itemId": "card:231446a3-1542-450f-a591-51540bfdfe15",
      "printingId": "231446a3-1542-450f-a591-51540bfdfe15",
      "variantId": "733b1324-1aef-4ca0-a598-cd01ba03bbb6",
      "canonicalCollectorAlias": "084",
      "currentNativeName": "Shining Steelix",
      "currentCanonicalProductionVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "733b1324-1aef-4ca0-a598-cd01ba03bbb6",
        "finish_code": "normal",
        "printing_id": "231446a3-1542-450f-a591-51540bfdfe15",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "Shining Steelix",
        "collector_number": "084",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      },
      "currentCanonicalStagingVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "733b1324-1aef-4ca0-a598-cd01ba03bbb6",
        "finish_code": "normal",
        "printing_id": "231446a3-1542-450f-a591-51540bfdfe15",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "Shining Steelix",
        "collector_number": "084",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      },
      "candidateSourceCardId": "neo4_ja-84",
      "selectedSourceCardId": "neo4_ja-84",
      "sourcePageUrl": "https://scrydex.com/pokemon/cards/shining-steelix/neo4_ja-84?variant=holofoil",
      "observedImageUrl": "https://images.scrydex.com/pokemon/neo4_ja-84/large",
      "sourceVariantSupport": {
        "currentVariantCode": "normal",
        "currentFinishCode": "normal",
        "sourceVariantNames": [
          "holofoil"
        ],
        "supportsCurrentMetadataVariant": false,
        "globalFrontNotPerVariantProof": true,
        "physicalFinishVerified": false
      },
      "holds": [
        {
          "code": "source_current_finish_conflict",
          "currentVariant": "normal",
          "currentFinish": "normal",
          "sourceVariants": [
            "holofoil"
          ],
          "sourceRarity": "レアホロ",
          "sourceRarityCode": "★H",
          "action": "Exclude from later original capture unless exact current/source finish identity is independently resolved. No catalogue correction or physical foil claim."
        }
      ],
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision.",
      "original": null,
      "imageRequests": 0,
      "actualPixelsInspected": false,
      "eligibleSourceOriginalForIndependentReview": false,
      "preparationApproved": false,
      "publicationApproved": false
    },
    {
      "batchId": "JP-CARDS-016",
      "itemId": "card:b5e141c0-92ff-4a00-bd86-b5efd266dbe4",
      "printingId": "b5e141c0-92ff-4a00-bd86-b5efd266dbe4",
      "variantId": "5d889d1d-f758-4e0d-b29d-6676f8f5f417",
      "canonicalCollectorAlias": "098",
      "currentNativeName": "輝くノクトウル",
      "currentCanonicalProductionVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "5d889d1d-f758-4e0d-b29d-6676f8f5f417",
        "finish_code": "normal",
        "printing_id": "b5e141c0-92ff-4a00-bd86-b5efd266dbe4",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くノクトウル",
        "collector_number": "098",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
        "same_artwork_as_variant_id": null
      },
      "currentCanonicalStagingVariant": {
        "set_id": "cdaacf04-0a7c-452d-acb0-e02ca3907106",
        "set_code": "neo4",
        "game_code": "pokemon",
        "variant_id": "5d889d1d-f758-4e0d-b29d-6676f8f5f417",
        "finish_code": "normal",
        "printing_id": "b5e141c0-92ff-4a00-bd86-b5efd266dbe4",
        "variant_code": "normal",
        "language_code": "ja",
        "card_native_name": "輝くノクトウル",
        "collector_number": "098",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
        "same_artwork_as_variant_id": null
      },
      "candidateSourceCardId": "neo4_ja-98",
      "selectedSourceCardId": "neo4_ja-98",
      "sourcePageUrl": "https://scrydex.com/pokemon/cards/shining-noctowl/neo4_ja-98?variant=holofoil",
      "observedImageUrl": "https://images.scrydex.com/pokemon/neo4_ja-98/large",
      "sourceVariantSupport": {
        "currentVariantCode": "normal",
        "currentFinishCode": "normal",
        "sourceVariantNames": [
          "holofoil"
        ],
        "supportsCurrentMetadataVariant": false,
        "globalFrontNotPerVariantProof": true,
        "physicalFinishVerified": false
      },
      "holds": [
        {
          "code": "source_current_finish_conflict",
          "currentVariant": "normal",
          "currentFinish": "normal",
          "sourceVariants": [
            "holofoil"
          ],
          "sourceRarity": "レアホロ",
          "sourceRarityCode": "★H",
          "action": "Exclude from later original capture unless exact current/source finish identity is independently resolved. No catalogue correction or physical foil claim."
        }
      ],
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision.",
      "original": null,
      "imageRequests": 0,
      "actualPixelsInspected": false,
      "eligibleSourceOriginalForIndependentReview": false,
      "preparationApproved": false,
      "publicationApproved": false
    }
  ],
  "outside_fixed_cohort": [
    {
      "batchId": "JP-CARDS-017",
      "reason": "Final13 tasks are outside this finite decision."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Darkness middle printing');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 180, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 45, variants: 45, names: 90, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 37 && cards.filter(card => card.finish_code === 'holo').length === 8, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Darkness middle plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 184 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 45, 'Exact accepted Darkness middle archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 135, object_references: 180, unique_image_members: 180, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
