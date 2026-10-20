import { readFile } from 'node:fs/promises';
import { canonicalHash, validatePublishedWitness } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '00621bdb7805bf6f6f1b83c2cbd24434b76ce5a3a4474e1239a4756359158e1a';
export const APPROVAL_SHA = '89e80d8e30d6c1b46a67613fa3439fc91559c0618a30286daeaa0b16aa23bf6a';
export const IDENTITY_TABLE_SHA = 'b35b90ab3724eb66208be7471accc83bb3a3366b47ca18e2413157fe2bc3e7ab';
export const SAVED_TARGETS_SHA = '294a9dc6a5c0d6e7fe3addb441037a5fe54a8f257212c7131fb2dd93834f8a55';
export const SOURCE_MANIFEST_SHA = '180639647a435f809d92a5f9af86dd6a16f68b6418b5644cd9e1519c8e0b6427';
export const ARCHIVE_SHA = 'ead3e436275a86154f4eb91bf9cf1085de4768ed9367dc22a71f651cbcbfa326';
export const ARCHIVE_ID = 644847675;
export const ARCHIVE_BYTES = 77385268;
export const FRONTS = 93;
export const QUEUE_ID = "STACKR-JA-LEADERS-STADIUM-FRONTS-20261015-093";
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "633843feccd2d1a16a28c414d28c73903b80b232813a3a64f0ab6e2ece5feb5a",
  "finiteDecision": "afcaee27e95709047280e01dc7f40d7f2288a6ea9a0a7f6555965616abfd750b",
  "independentSelection": "653cdd1b4c658898fba051d1d9da29fbf07aa37b0aa2537abc701661cbcaa0cf",
  "independentReview": "996f9a93b3ae19afb7a11b6070475a3f91d678c22e28b35da21e0e792c0868fb",
  "sourcePolicyCheckpoint": "2013e3ecdb0bf05501b2cc7a66733c73e20ba80b3a7876e5d0442f1a32eb00e9",
  "ownerPermissionAttestation": "7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "8b34bb82-aa98-48bf-a9fb-8935d9857345": {
    "alias": "001",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2f2c96710d5890753af8bb9a53282d68e1d4867a61482bb216555a917314d022",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Zubat.B05.1.38325.png",
    "variant_id": "09c581d9-69a5-4d1b-95b6-63a7eb0bcb12",
    "finish": "normal",
    "current_native_label": "タケシのズバット",
    "original_sha256": "8192bb553d0c536f33e19709d83d5ae25db2ab7b1bd3b2fd74b7e1d91b33fff8",
    "original_mime": "image/png",
    "body_sha256": "08b98f9c5e828ead569d5986ed48097e541f60b37581a74d59a5494b9e0a1764",
    "width": 570,
    "height": 797
  },
  "36142f8b-2935-4a9b-84f1-e1c182af2b5d": {
    "alias": "002",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:5969468bdb110b6e1f0006c28f35ac2c59c06a2b3e706599c22b8f1152b17006",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Oddish.B05.3.38327.png",
    "variant_id": "1b627633-18c6-4817-9979-47713d32b223",
    "finish": "normal",
    "current_native_label": "エリカのナゾノクサ",
    "original_sha256": "192ce33b135dbf9809638c7b6a43a0e3a4f1bd1ef36f2f444b7e4cc7bd941d34",
    "original_mime": "image/png",
    "body_sha256": "393836c09beb9ec8ff1c59d9ba8f35d07ad8c3830499bb4eb0866b80643a088e",
    "width": 570,
    "height": 794
  },
  "b346aaf7-ac4b-48a8-8abf-3e98eb4d49b9": {
    "alias": "003",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:761f61c9f9672f4605266b39606e19e9580779968a13967a629b14e2f0ab4479",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Oddish.B05.2.38326.png",
    "variant_id": "fa8dfe16-210d-4307-a8d8-ef4533224334",
    "finish": "normal",
    "current_native_label": "エリカのナゾノクサ",
    "original_sha256": "0b476c32134d05a5b9f366720b6437271e14bfeb229e6ed658551a7e2e2ca85d",
    "original_mime": "image/png",
    "body_sha256": "8a95bd1f3097ab8713c1fd312fdd5a5c827e31c90419969e4b34d1a1625bb1f6",
    "width": 570,
    "height": 799
  },
  "30c67781-bb63-4751-83da-f01b6204b61a": {
    "alias": "004",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e7970bb60954b56e2aa3da6d47d5ad3aa8a0ec175ff0bd80d8d160408d8c8db3",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Paras.B05.4.38328.png",
    "variant_id": "01c745a1-7f18-4f37-8bff-bf0e07ace9a8",
    "finish": "normal",
    "current_native_label": "エリカのパラス",
    "original_sha256": "c1ceada0462fd12cfa1cf8773edc7e2915425299bf696e7ad6e848917af1e052",
    "original_mime": "image/png",
    "body_sha256": "e78f84cc28686efef74ce24f89bf9ba9691182ececa1e509d91a7798d727ac50",
    "width": 565,
    "height": 800
  },
  "5f824d8f-5492-4e11-88a9-468a2b2f2cd1": {
    "alias": "005",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:bb59f2740613113c4f3d4b5ec227bc2e3ff60ba4335b79e5a707efbae5ea74fc",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Bellsprout.B05.5.38329.png",
    "variant_id": "b0e9e0ad-51f1-4c91-8611-5407ce5969ef",
    "finish": "normal",
    "current_native_label": "エリカのマダツボミ",
    "original_sha256": "befdc5ac3131dd7e09b6789a68f07ce665c9028a27ad22f54a0ddf73f2385b38",
    "original_mime": "image/png",
    "body_sha256": "e4c4dd82108bab2a082553943dc3b81a847bcd181152802e071e239212e363f3",
    "width": 565,
    "height": 800
  },
  "a3a3d7bc-eb64-4803-b492-52a4b7b1a141": {
    "alias": "006",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:694ac299e03c895f617ec017d665450eb75b92bf4d7b14307498824d5df3f01b",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Tangela.B05.6.38330.png",
    "variant_id": "938ebc02-e30c-4013-a8a1-4587a879a350",
    "finish": "normal",
    "current_native_label": "エリカのモンジャラ",
    "original_sha256": "d033a8d7b113116bab0553dd703aa5bd431817faa25a922f0a973d67836c54cd",
    "original_mime": "image/png",
    "body_sha256": "bde106a8a05bce2885ba0d468135ddf0807cca41784aef0093bc46104bb87f43",
    "width": 570,
    "height": 794
  },
  "4986e21b-1033-4bf1-ba1b-4860c5688353": {
    "alias": "007",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:4be6c4dd3efdd27be1ceb86b22d85cf2a6d995751b418cd4e5be759515ac678b",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Bulbasaur.B05.7.38331.png",
    "variant_id": "6ff8d6fe-0548-422c-9c6a-f95edc5cbea3",
    "finish": "normal",
    "current_native_label": "エリカのフシギダネ",
    "original_sha256": "6ae1262e4d0f15cefd2c2b760cf0d1d5dde241c9a63f97bd50a02a4da5813a2e",
    "original_mime": "image/png",
    "body_sha256": "50f0cda69b1d2d67d5009dc9681210106ab88035261a5282f3fd5fd8c86c6035",
    "width": 570,
    "height": 794
  },
  "6c0b47c3-f423-42f3-ab4d-5c3fe56b244d": {
    "alias": "008",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:12903ac02d23557988f11dc71dc17b8497d9cda1c8ce72a28a38fa252b907940",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Golbat.B05.8.38332.png",
    "variant_id": "eb5226e8-c6b0-4779-ac6c-1a88a7e31755",
    "finish": "normal",
    "current_native_label": "タケシのゴルバット",
    "original_sha256": "c8da2f8807ec347fb0ba3a82a2f52589db494757467d328e93ee3a16a0106703",
    "original_mime": "image/png",
    "body_sha256": "915d8aa0dd00ce2e9e89f201555a6b2edb0fd258b7606850b24faffe3a53cb2c",
    "width": 567,
    "height": 800
  },
  "d2079560-19af-415d-ac55-8c4b216f4b7b": {
    "alias": "009",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:108427a8c51d66260cb4f7d871b39570654511a5e1a37fc123462efca5c1f37d",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Gloom.B05.9.38333.png",
    "variant_id": "51ea278b-8560-486d-b495-97cc891fde58",
    "finish": "normal",
    "current_native_label": "エリカのクサイハナ",
    "original_sha256": "284875d0e13cb0ca346b05c4f49ca1a9b578026a023aeeafda422b667938ce2e",
    "original_mime": "image/png",
    "body_sha256": "09ff9a2e316f4ff025311199c512b39d5efc0233901589249adf0e55e23fc00f",
    "width": 570,
    "height": 799
  },
  "705eb2f0-c104-469f-af06-e442445af348": {
    "alias": "010",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c63a122e8e5cc018aa09d15e4d3ef899d0bccd8b068d06f6dcd498ce8625f4f8",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Bellsprout.B05.10.38334.png",
    "variant_id": "9a72f14f-0f3f-4b14-96df-ef73057c2f17",
    "finish": "normal",
    "current_native_label": "エリカのマダツボミ",
    "original_sha256": "a4f1248a1148abe372772c4ab5e12ecf026f897b63784f148fb087001da89de6",
    "original_mime": "image/png",
    "body_sha256": "fd8246e781971fc6b46dfa7a07700548a4c470f3c01ee6600e53258922836df0",
    "width": 570,
    "height": 799
  },
  "f4cfcd88-ef21-4c2b-8ea4-eaefc0dbfd83": {
    "alias": "011",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:572b9ad3a13605aa271a90003b0264d5a61c6b2360a5a8e82b4da10edc560034",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Weepinbell.B05.11.38335.png",
    "variant_id": "f6707640-abee-4fb6-b8f0-9e6abcc5136e",
    "finish": "normal",
    "current_native_label": "エリカのウツドン",
    "original_sha256": "15aea3c05ac6fad1c220828abaf902ddff8f41cfb80e268e96dd9f124b7b57a8",
    "original_mime": "image/png",
    "body_sha256": "622ff546ef322141ed5f46f3a6eb6d5598b3261127102a3ea8fd7ec0c847b92f",
    "width": 565,
    "height": 800
  },
  "f58416db-f0f1-4669-bf21-e5bd021d7858": {
    "alias": "012",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:cf2e5acb5beef4a9c770b753ae7bfb4a1d17eef78e6453ea5f575902e31fb43e",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Exeggcute.B05.12.38336.png",
    "variant_id": "b197c8e2-a10f-4d5b-ba9d-ea06de9bcb04",
    "finish": "normal",
    "current_native_label": "エリカのタマタマ",
    "original_sha256": "4b68fb4d5482e23af228797b0ee828e6135ee942662faa942162d7d22cbea801",
    "original_mime": "image/png",
    "body_sha256": "320b077132b17b3a992d49b04a6d588feddda9f7963a64b2aeb8347f5b974919",
    "width": 570,
    "height": 794
  },
  "53e4845c-85b6-4661-a36e-7abd856af0c7": {
    "alias": "013",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:bbc23b77d6ae5ae99a3d7a56e010cb605e685b23ea4e06b19e574295454e06c0",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Exeggutor.B05.13.38337.png",
    "variant_id": "2a1333f8-956b-43d9-b5c3-04874ecfa14d",
    "finish": "normal",
    "current_native_label": "エリカのナッシー",
    "original_sha256": "6a4606246a677e51ddcc80a107ea7a42368a0c9432aacf3d118efb08a2590719",
    "original_mime": "image/png",
    "body_sha256": "fe9c1270f307e2149d5fb83eaabf2c71e4e1f6789e942e110fd68c87b6e13741",
    "width": 565,
    "height": 800
  },
  "d13ad6a0-8456-4b48-b743-047c7c6ed323": {
    "alias": "014",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:45f85a6df68400968b70d1673f30e343eb2440dfef1ef03c604100eb5d32bfac",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Vileplume.B05.14.38338.png",
    "variant_id": "bf1e5431-539f-41de-bbb3-67a051b0a63f",
    "finish": "holo",
    "current_native_label": "エリカのラフレシア",
    "original_sha256": "a5f4813844ad47b9385fac8ba1946faedf071ff2780e07d82c72db23b5e714b8",
    "original_mime": "image/png",
    "body_sha256": "cded0f0ffe4381677b389652e058e672db4d36da17a7f779c0f10a6fe5fcbe59",
    "width": 542,
    "height": 800
  },
  "7c59b07d-c2fe-43b6-a6ee-ecfd0e0ee72f": {
    "alias": "015",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:492c3f29439de7938cfa4fef8108c8fd297a1bf29ffbfc6e522e39c87535fbe2",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Victreebel.B05.15.38339.png",
    "variant_id": "744173b8-a4b6-4dae-adce-d3454dd0aad2",
    "finish": "normal",
    "current_native_label": "エリカのウツボット",
    "original_sha256": "f630ca1c412a2f5aace56b968035f1c32d77e16804132b218e1d52bca7929a38",
    "original_mime": "image/png",
    "body_sha256": "51401eb577556ddaa308b20d740b267615d156071bb7d443d00d5632c1ae1d3c",
    "width": 570,
    "height": 794
  },
  "4ebf60a0-838d-46e7-b634-b9cd45e9109c": {
    "alias": "016",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:952a9154b65f4dfc200768842b3c316e4609c07d93ed899a7a72709929e219b0",
    "image_url": "https://den-cards.pokellector.com/316/Rockets-Scyther.B05.16.38340.png",
    "variant_id": "8d561a39-b2d3-4591-9a61-a73aa007f430",
    "finish": "holo",
    "current_native_label": "R団のストライク",
    "original_sha256": "7308e2f58395d6174e00b1d44aaef91f2a67b7ad4db4e1acdab876a2e9e591ac",
    "original_mime": "image/png",
    "body_sha256": "2cc355e4ce567875bb0c480100c729c20a60543df763dc1fc897dfc56f5df223",
    "width": 569,
    "height": 800
  },
  "dc5d71a7-7618-4ffc-974e-15ee78ce96e3": {
    "alias": "017",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7e552261f1d3afbef49c7c9e8071fe8ab0db92f2a2f5356b5a7d056a00363492",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Vulpix.B05.18.38342.png",
    "variant_id": "964dff70-9da7-4880-aff2-9259c0b9d88b",
    "finish": "normal",
    "current_native_label": "タケシのロコン",
    "original_sha256": "bc66ba6b27ac4c080fe175584e88c93152f131e5d790f0784ceb12f263d2412d",
    "original_mime": "image/png",
    "body_sha256": "9812f7b83a473ce7ccae9ed5fc1147d7f26724b5dddbfa9f2577dffd0a6aebfe",
    "width": 565,
    "height": 800
  },
  "1180b8d4-f8f0-436c-bba5-142ec7ccf4ac": {
    "alias": "018",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:088e9823aa763fe0ff321f3baca661ca7385fdbbeaf0859baf19d994b17cf4c0",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Vulpix.B05.17.38341.png",
    "variant_id": "5d5011ce-f652-4edc-a7cd-98b16293d3a8",
    "finish": "normal",
    "current_native_label": "タケシのロコン",
    "original_sha256": "5e1bb8a7c973af1019e68242c3796d01fe78b975e81d48481963b5f56fce06bb",
    "original_mime": "image/png",
    "body_sha256": "2b640a5c6edd762f863a9ff1d5086477ad91b2462bb1c14e38ff3a436cccc183",
    "width": 570,
    "height": 799
  },
  "ab1affb7-28cc-469f-b5f3-f58692793db3": {
    "alias": "020",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6d95a5c4bafbc2d181936591c41e6521cf16320550ac6906753968c60813f44e",
    "image_url": "https://den-cards.pokellector.com/316/Rockets-Moltres.B05.20.38344.png",
    "variant_id": "9348ab68-7216-49c1-b6f0-e84556f22d8f",
    "finish": "holo",
    "current_native_label": "R団のファイヤー",
    "original_sha256": "54b1581656782015c668dedd066ef6e59c3b5438ebc2542102bbc0825abbd5c5",
    "original_mime": "image/png",
    "body_sha256": "adc22f42a638661bede9ccf120cebcb1f0af354daaa05de827198c2c17d1f1c8",
    "width": 570,
    "height": 799
  },
  "71afc76e-6c15-4631-ad44-245e8e377867": {
    "alias": "021",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:09119e547539ff3273bb47cc6b472154a1aa7823d15146b41ce8c51ecdb1c141",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Psyduck.B05.21.38345.png",
    "variant_id": "4e873de1-cac4-4570-be4e-92f368b96326",
    "finish": "normal",
    "current_native_label": "カスミのコダック",
    "original_sha256": "905042a76e8400d23b424e0b4726d5e46ed573ecb21035b7273e498b28b74cd8",
    "original_mime": "image/png",
    "body_sha256": "fa9bf274b674415255d0826b174feb89311e4943b3c349f0a8a28ec373a215c2",
    "width": 570,
    "height": 797
  },
  "2d29a377-0cbc-4bbf-96e8-70dc9c75f11d": {
    "alias": "022",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:06019bc33de2057bc7b922c4beb85d008ab188baa8f62397db2575d3aff9b78f",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Poliwag.B05.22.38346.png",
    "variant_id": "4393a8f9-abe6-41a8-b974-1a82e1ee889b",
    "finish": "normal",
    "current_native_label": "カスミのニョロモ",
    "original_sha256": "8d0adf20d37941bf893d8e8e28a011626f21d34ae725e6247b4a982a881a8a5c",
    "original_mime": "image/png",
    "body_sha256": "5de5e6127a42930af45ce02dc5c51025f5e673b867ba25cf917c54d8fc5110ee",
    "width": 570,
    "height": 799
  },
  "bd119be1-f98a-4336-92be-fcdc192f12f3": {
    "alias": "023",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:448edb7dd806c68a980603433838903382800a19baf0feaf1e4cc74ec191c206",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Seel.B05.23.38347.png",
    "variant_id": "6866fd53-6a5b-4136-b347-69ef5225cd0f",
    "finish": "normal",
    "current_native_label": "カスミのパウワウ",
    "original_sha256": "4a254de9d02b45a89f85c1fdace9d3304604a8b5b762fae47e0b96eacaf42be8",
    "original_mime": "image/png",
    "body_sha256": "bbf8d12bc747c404c6b3f53f33537f75eca08941ace90c0d992671ac39a4e454",
    "width": 567,
    "height": 800
  },
  "397787c9-b2cb-46c6-bcdf-62f926ab1bf9": {
    "alias": "024",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:41ee1131687eb462c9ef2b97bd8fa121efbd65675bc0aabee64375e0fd745c3c",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Horsea.B05.24.38348.png",
    "variant_id": "93ade380-6b55-4fd4-bc2a-092185f7430c",
    "finish": "normal",
    "current_native_label": "カスミのタッツー",
    "original_sha256": "6496308d081a5c4b9a5c653db2ac6c85a6f67f441d30ff5ab1096c812768e97a",
    "original_mime": "image/png",
    "body_sha256": "eab4530e89beefb1d99dbc3665e404ce7ed5f8e902f6bfd9593b7f66c3aebc90",
    "width": 570,
    "height": 799
  },
  "e73e79cb-8075-4680-a000-0e1ed250622b": {
    "alias": "025",
    "batch_id": "JP-CARDS-058",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:cac565906d3034afdd9f7d247d27f56b482e5a648f5c29dfc0895bf566bb2635",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Horsea.B05.25.38349.png",
    "variant_id": "2b6fa294-a808-454c-a607-55a4001c3ccf",
    "finish": "normal",
    "current_native_label": "カスミのタッツー",
    "original_sha256": "f712a52283210e98a6c9641c431dc9e1cf3ce0fdae19f23b00007b4270c7c43a",
    "original_mime": "image/png",
    "body_sha256": "483959ae5441c647dd34208a3c84959c18ed504867f7057b705bc4304211df50",
    "width": 570,
    "height": 797
  },
  "c100416f-2d45-4374-923a-e88158df4c90": {
    "alias": "026",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:45c246d1ac0d847ab4d562393d46e0564661958153c22c88b48da4adfc7d75f5",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Goldeen.B05.26.38350.png",
    "variant_id": "36615818-a709-415a-8379-9b4cbc680b7a",
    "finish": "normal",
    "current_native_label": "カスミのトサキント",
    "original_sha256": "311b52b322a70015a955c044dec10d5d5df80facc40fe609ea67b46e45d2fbac",
    "original_mime": "image/png",
    "body_sha256": "9464b7660fe8b8bc4ff4dc888fe00aca5f4d3f6152b990ecc4915f65a34391b0",
    "width": 570,
    "height": 794
  },
  "d96239e2-8752-4aa3-8ed4-95d82b0e2ddf": {
    "alias": "027",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:9e382be83012da64ac08400c7b6c3f611344a5a78dba15d07cb959d842628356",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Staryu.B05.27.38351.png",
    "variant_id": "5a59bbfd-00a7-40dc-9e01-f985f1b2d71a",
    "finish": "normal",
    "current_native_label": "カスミのヒトデマン",
    "original_sha256": "16b06978aeff6ac0a81dfa3cd53f00e247b4c99bb0821b57b259ca61abb6bacd",
    "original_mime": "image/png",
    "body_sha256": "86e9d5f3aef4b1a4df7832fa48c055d73f89156b335d28250121516fc3f2b56c",
    "width": 570,
    "height": 797
  },
  "c4bc585b-8c63-4cc6-8f73-2d051c09eef3": {
    "alias": "028",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3dfc6276b5c12a5c0798f0b097e11f4e14edcb9edc5e662738c3f1dab8561b0a",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Magikarp.B05.28.38352.png",
    "variant_id": "de09c53c-b0a4-42ff-9e84-3c3072281f33",
    "finish": "normal",
    "current_native_label": "カスミのコイキング",
    "original_sha256": "71e4925d54f6c1f8d32128ba50f8cf658a824a0d5a75e2dba7258ab2184e2eed",
    "original_mime": "image/png",
    "body_sha256": "f7a9c8ef335718f46c2a3927c6cfbcef1a662b21742f9c278f17c80c6c64a151",
    "width": 567,
    "height": 800
  },
  "d57a7a1f-25a1-4b80-8c04-709a71b5863a": {
    "alias": "029",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:8fa87eabd5f50302dc0350d68a92a393459626a51539ebb98cb39a30ce8f2a12",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Poliwhirl.B05.29.38353.png",
    "variant_id": "3dbb51dd-d80f-4393-936d-eeed7854f0d1",
    "finish": "normal",
    "current_native_label": "カスミのニョロゾ",
    "original_sha256": "9c91dc3f1b02a45bc48ffc233e2ebc8e784ccf4e66e0611db69d156ad29dc037",
    "original_mime": "image/png",
    "body_sha256": "e879c68a926c716f0ff3e4c5a404b8920d7b1c0b73f48882c86cb72e2d76970e",
    "width": 551,
    "height": 800
  },
  "6856a355-8cae-4bb0-a17c-8a82e269239e": {
    "alias": "030",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:840d6adec8816e036abc986947320b425f3c38520c105d57b028041cec83c8e3",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Tentacool.B05.30.38354.png",
    "variant_id": "c6571c8a-403a-41a8-8c26-c68ed32f6ac3",
    "finish": "normal",
    "current_native_label": "カスミのメノクラゲ",
    "original_sha256": "e411338ba98a2da5175dd3ab5b47db9b579d14b0131b89f53b3cb10f765fabd8",
    "original_mime": "image/png",
    "body_sha256": "c9f9a109e74638b57d7c050c0f3510483dbc2ff193d719db4b838384c9a2f30f",
    "width": 570,
    "height": 799
  },
  "5d6043ee-ab2b-403b-b96b-2468d7d924ba": {
    "alias": "031",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:228eb0ee706b4da20287850f2a6c550349d2e2af7a944b9d5c3b2416f1d00225",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Dewgong.B05.31.38355.png",
    "variant_id": "a5982a5e-0878-4896-8686-7880dafd6a15",
    "finish": "normal",
    "current_native_label": "カスミのジュゴン",
    "original_sha256": "ce5b84c592cf06b302b5609fbe185bf284e857e032cedba78ba174498f7768d1",
    "original_mime": "image/png",
    "body_sha256": "b3cdc6e56c7bfb6668899b4f6e8500f02e5911b19620e27baebf58a3142e4f82",
    "width": 570,
    "height": 799
  },
  "f9f6612d-0817-4f7f-aa70-99764a5bb1b7": {
    "alias": "032",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:77f457126335ffca850f0a8b8fcafb3abd5ca56c7f97b90336d5ca23f72e823f",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Golduck.B05.32.38356.png",
    "variant_id": "659dcd2f-f1ae-464c-88f3-4341293600d8",
    "finish": "holo",
    "current_native_label": "カスミのゴルダック",
    "original_sha256": "0c2a27e9e8eaceeefd699e620ef00c61b26ce29de57d38a01f3dddc245637dd4",
    "original_mime": "image/png",
    "body_sha256": "a5ea81fa3e830d13f6d45cff428f91b2d86f91e7146df3659990b8dbc2832b82",
    "width": 569,
    "height": 800
  },
  "8e92f4b8-86fe-4307-99d2-c9a072546fa5": {
    "alias": "033",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:24991c11f9b81273d1aa49e4492c1622b0b56414a158f8220aad2d6d1bee6eaa",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Tentacruel.B05.33.38357.png",
    "variant_id": "3e82b141-f659-4aa7-bdc5-6cf5575ddf59",
    "finish": "holo",
    "current_native_label": "カスミのドククラゲ",
    "original_sha256": "e40466549da1e14ed52480d3ec8df87349efb5449c3cc1cf51dd91c084231098",
    "original_mime": "image/png",
    "body_sha256": "e4897e6644026865fc36ee0c21fcb0c07e5d741cfff554d64d7df2110e2b513b",
    "width": 570,
    "height": 797
  },
  "60e39fa8-94fd-4432-af69-e51b1b5cfda7": {
    "alias": "034",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:58cee0b2fee57c6ba4c328bbf9bbb611880912636849d170a3b7624829c17df2",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Seadra.B05.34.38358.png",
    "variant_id": "18068763-8624-4037-a5c2-1e595bf509d4",
    "finish": "holo",
    "current_native_label": "カスミのシードラ",
    "original_sha256": "554c4a37a47399f006fc9827d614e75cdef33484f102abcf10630950f9e54ac8",
    "original_mime": "image/png",
    "body_sha256": "2bb667ed89fc56c27befcb3f3bc069b7f61e16f190323f6dc1a52e7c70b129f4",
    "width": 570,
    "height": 794
  },
  "c8b3a98b-f43d-4e6f-abe2-3faf079a824c": {
    "alias": "035",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:5b1062a597fc2d697477c1e50a59d2f4f2f2672fa9c8f0b516ec5f37f78fc863",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Gyarados.B05.35.38359.png",
    "variant_id": "c1ee2e01-c0bc-4f3b-ba7f-29d4a56946f9",
    "finish": "holo",
    "current_native_label": "カスミのギャラドス",
    "original_sha256": "a99c652fbc3961cf3392023b329e8b0db7af388e8354e72927b503982ab322a4",
    "original_mime": "image/png",
    "body_sha256": "cd100671e023358ad98549f4b8e2eda2f0296a3d986e60107726f9dcb238a41d",
    "width": 570,
    "height": 799
  },
  "88a0c0c2-d6b4-45a3-939b-755e464065f9": {
    "alias": "036",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2ad090623a7ebbb31535ad16c5955b92bae40577d28e496d042365947c6433b4",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Pikachu.B05.36.38360.png",
    "variant_id": "8ede9756-bdbd-4851-8e36-bd77e89dde2c",
    "finish": "normal",
    "current_native_label": "マチスのピカチュウ",
    "original_sha256": "59599419144a686157c04d62cd87b82ae466d56c42a6920204f604b7e009eedc",
    "original_mime": "image/png",
    "body_sha256": "fa8453cc431cdfc22fcf6b3f6c97bb6996320ec0ea0e13e0baaf488e8bb3e2b8",
    "width": 570,
    "height": 797
  },
  "b2966616-07a3-4671-87d5-a701d078026d": {
    "alias": "037",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6b128170189aed0d358f5160f7fb3492d2a5f7ec08b1b77aab67023be8e34049",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Magnemite.B05.37.38361.png",
    "variant_id": "c8099e0e-61ad-4a3e-824e-b201b5241bb0",
    "finish": "normal",
    "current_native_label": "マチスのコイル",
    "original_sha256": "3452e3c5bc9af82f9779bb9b4e0610a50f0199a07f38b2e23c7c455e3d39cb99",
    "original_mime": "image/png",
    "body_sha256": "211fc21cf43d7f631a4b013728b281b4e4867e17e473ac187b3a979afdb0fda7",
    "width": 567,
    "height": 800
  },
  "69d0d689-59ef-4871-940b-9e9b77920429": {
    "alias": "038",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c887b78dd874403f8148275a349135b1692b144723455cb221e170402022a34f",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Voltorb.B05.38.38362.png",
    "variant_id": "7e68b504-45da-4d57-ae12-36832d38daaf",
    "finish": "normal",
    "current_native_label": "マチスのビリリダマ",
    "original_sha256": "8b05d70e838e062e819a802d8bc16599cdbf8e3e5d043e4788cad5fee863d0a6",
    "original_mime": "image/png",
    "body_sha256": "e4317eb3d1d49eb827e009e844cda635fa911814c5b6f226dc2bf2a9dc1b2f54",
    "width": 570,
    "height": 797
  },
  "cbc36376-592a-4f06-b3fb-7a06cc5c2751": {
    "alias": "039",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:0dde41203591ea0d3a5c14c3055ba9325c3a86efd161afbf37270448155e3ed3",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Magnemite.B05.39.38363.png",
    "variant_id": "37332822-92e7-41b4-b1fb-2141adb3ba30",
    "finish": "normal",
    "current_native_label": "マチスのコイル",
    "original_sha256": "1dbd0c4c8294df2a562cc64b9483da5b09c61b7b4ae07beadc1be0b69b083f2a",
    "original_mime": "image/png",
    "body_sha256": "4ede71b363fadbbe943c017790b17f40e676ee69458c386c79972ca63cbc0122",
    "width": 570,
    "height": 799
  },
  "19fbd0a2-6917-4ba2-82ba-f6e619d43079": {
    "alias": "040",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:f9cdfd7ec86ed54d852268a44481731faf3efb76bcf5a9483a5e3a11903dd6b8",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Magneton.B05.40.38364.png",
    "variant_id": "5a2218e6-cb92-4a30-b024-154a086ce120",
    "finish": "holo",
    "current_native_label": "マチスのレアコイル",
    "original_sha256": "d0c21fabc02afeb850201fb2e1d9f4259eb87a9e3be9a93e519f0cc116ed1ac4",
    "original_mime": "image/png",
    "body_sha256": "4f3ee5ea653dcf699419875dde86cbb15df5d1269e3b2418bb2df268934b0564",
    "width": 570,
    "height": 797
  },
  "2633e535-b348-4d62-8f32-5e5b5031e207": {
    "alias": "041",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:bd86ca1dcb6a26fb3d02ec1e541cb43b6b4d05da5a789e8248cec22c13e12e8f",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Electabuzz.B05.41.38365.png",
    "variant_id": "47f8c022-30e4-4276-8fd0-aa44cb6d785e",
    "finish": "holo",
    "current_native_label": "マチスのエレブー",
    "original_sha256": "29ee700a8661ffc30e5208ac5bb20108ba762252d0a8b2c15071728d08083054",
    "original_mime": "image/png",
    "body_sha256": "18e785beab6d8becf27b9b4d4ef105d980ec24fd4213d6b0ee296726e9c1f963",
    "width": 570,
    "height": 799
  },
  "f3e48361-c0c7-4e04-af28-43af9084370c": {
    "alias": "042",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1b891be15b3d5e18ec9139abab46b9fd8573187ac8d349e52fbeaeb5179fe5b2",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Jolteon.B05.42.38366.png",
    "variant_id": "0d3e2840-901e-4124-8998-95a34bc476cc",
    "finish": "normal",
    "current_native_label": "マチスのサンダース",
    "original_sha256": "8c68c60987aa121a9a2fda2b6a24858c6bddfba640e35cdce94c68e051d5e362",
    "original_mime": "image/png",
    "body_sha256": "b9a7a0c674882d55c207917bbcfc557d0fc2c2bbc2c92213280eb1a32b7d4110",
    "width": 565,
    "height": 800
  },
  "2b07dab8-f37f-40b3-9c61-fea1fb31a8a2": {
    "alias": "043",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:f8c501015328bfa50744cd3637cd3bbd4d1479039e38c863aa265a079fb00995",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Sandshrew.B05.43.38367.png",
    "variant_id": "c666e00b-1733-4807-8511-4b18e73088a8",
    "finish": "normal",
    "current_native_label": "タケシサンド",
    "original_sha256": "9906518b8b263a1dda172c2bc8791a430be4a68e151ee1ed8d9bbf0472fd2a5b",
    "original_mime": "image/png",
    "body_sha256": "bc2b3755fb96334cdc80574dfe63c06ea95a44dba54c9ac2eb37808d1c69114e",
    "width": 570,
    "height": 792
  },
  "24666af1-dc65-434a-8a1c-d4c61f8f061f": {
    "alias": "044",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:7f9fde3a09e6999f56c99a07fd9b7691ce84f38a330c28ea79214d71f4a6437f",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Diglett.B05.44.38368.png",
    "variant_id": "4b6d1588-c165-4f20-81e5-827d95df9fe4",
    "finish": "normal",
    "current_native_label": "タケシのディグダ",
    "original_sha256": "775bf3b2569629e0cc998fb817d7772abd5371caf226f9b86cef2c7cd328bcdc",
    "original_mime": "image/png",
    "body_sha256": "60409eaf733cd224f01837ef64974027a627b1d822cd8c453e62eb7fbcbb5717",
    "width": 567,
    "height": 800
  },
  "94d209d2-6d8b-468d-9039-66015d3a47cb": {
    "alias": "045",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:cb5351341cf761599b54a41e8d9470a8dc3fcb107d64a256ddc088e4a3c19090",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Mankey.B05.45.38369.png",
    "variant_id": "62647541-33a6-4a2c-ab3c-3e7f29baef5d",
    "finish": "normal",
    "current_native_label": "タケシのマンキー",
    "original_sha256": "4050ac5c82e9bf5dfcfabb3652fdba072c674f01901bb3f9916350b626936f30",
    "original_mime": "image/png",
    "body_sha256": "55bc856295bf5e42c7bd5e2075a83bf596e7717da2c072428c5410e329341dd3",
    "width": 569,
    "height": 800
  },
  "98b73d6c-08e2-4fc5-80ea-be1f304504c9": {
    "alias": "046",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1999cc19dd0f374cf5ca53d176b832e1b4f4de9162f181beac80a10d5ec0b675",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Geodude.B05.46.38370.png",
    "variant_id": "32645944-3d4b-422c-9318-efbce1a2a184",
    "finish": "normal",
    "current_native_label": "タケシのイシツブテ",
    "original_sha256": "890bbe31a78216112ea220cb0bb33c146106fac5dfaf5619caa1498490a63d4b",
    "original_mime": "image/png",
    "body_sha256": "0443a4b955e192a2c606d446c025e009473110ed6d8403ab8fac8f98e6e194b4",
    "width": 570,
    "height": 797
  },
  "ab19523f-1628-4c8e-ae49-c217fae8a43f": {
    "alias": "047",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2ddbc58ea3400a911427030ff45246f5fa6e8bb03579ef7ddf446696539cd0a7",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Geodude.B05.47.38371.png",
    "variant_id": "b83b7c21-a84b-467d-b84a-dac8171257ab",
    "finish": "normal",
    "current_native_label": "タケシのイシツブテ",
    "original_sha256": "9865da7ea08fa01cfe6502644fdb4f8ab173d50a493b72701a39cd1c50b227ff",
    "original_mime": "image/png",
    "body_sha256": "acac3fd90df41be4386d582bb62ec6bca2da9ade6721e28098ab8dbc90f9d023",
    "width": 570,
    "height": 794
  },
  "1c2fb849-fb31-4a6f-b680-e4e18e812222": {
    "alias": "048",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:67aa8cdb6bade37e11a7ba9ad7f2245c4836489a631254cf4c5d794db3fb8c1b",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Onix.B05.48.38372.png",
    "variant_id": "edeb4bce-b728-4b17-9589-3dc3f10f85bf",
    "finish": "normal",
    "current_native_label": "タケシのイワーク",
    "original_sha256": "eb34a4342e67b2cc62ab8e7198bd44bc2b1c70221a8baa735f59686b576bffae",
    "original_mime": "image/png",
    "body_sha256": "17e1a90b31edfd2f685576d3c70976d7cdec061b071854cce179a9de1fa9f2b0",
    "width": 570,
    "height": 797
  },
  "98762add-6e3a-47df-9c85-23bbe8e468a2": {
    "alias": "049",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:af112f3a4b8bb951a1d59122424367537bf8ed18692176e17c2b31c3ea8f8c1c",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Rhyhorn.B05.49.38373.png",
    "variant_id": "619e7b07-5e1a-4534-811e-b946c44c8812",
    "finish": "normal",
    "current_native_label": "タケシのサイホーン",
    "original_sha256": "f0f9ff1893114d55d33e439e316d0932f0ab8528c8e92aecfe659e4a9fa5b247",
    "original_mime": "image/png",
    "body_sha256": "2c668619ce996dd23986e46d59349baadb08ce61712dd440def141963282aec5",
    "width": 569,
    "height": 800
  },
  "aed61b4c-0067-4d04-b33b-5368aba4735d": {
    "alias": "050",
    "batch_id": "JP-CARDS-059",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6de7edc4ba0498b8949734ffbf194bd0d72f18dbba9c336a60967ce7577641e8",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Sandslash.B05.50.38374.png",
    "variant_id": "50e4bdbb-0638-4b62-9473-f1a5a623a8c5",
    "finish": "normal",
    "current_native_label": "タケシのサンドパン",
    "original_sha256": "2362bafd3191a53e29f0b2291d9ed0c0d6ccf2d113a733f29b2d034cb60b6d26",
    "original_mime": "image/png",
    "body_sha256": "ffa10f930064674e91d38bcc9bad18b95879d14b6cadbc1cc1b9f01cad85a7db",
    "width": 570,
    "height": 799
  },
  "487016ea-94d8-44c5-afb3-d5b85cd03d48": {
    "alias": "051",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:05425192c8e1611a5dd933aae90225cbd6e0692ab884f8a5acbbb59742dc20f2",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Primeape.B05.51.38375.png",
    "variant_id": "d8a90e71-a4d1-443c-bcef-bc6c687245a6",
    "finish": "normal",
    "current_native_label": "タケシのオコリザル",
    "original_sha256": "b342bb4d47afcfd6dbf02f3c8874f402283c2811efdb9cf6a6023d071dbbd364",
    "original_mime": "image/png",
    "body_sha256": "016a029674f0cf03da500921d07083328d5f8c1ae7c26902c8bb27eef806701d",
    "width": 565,
    "height": 800
  },
  "592ef943-84f1-45bf-8f29-3a4194b89688": {
    "alias": "052",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:d640c568bcd048873d4e6963739a8aac4b8595e2f417a5bc63a646aa8ed8cd60",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Graveler.B05.52.38376.png",
    "variant_id": "b63814af-4f21-4555-be8e-d67dcdfcaf86",
    "finish": "normal",
    "current_native_label": "タケシのゴローン",
    "original_sha256": "e7fc1aa67ed989d0e5d2c33296e571d632bac5c5d5db111d6fe4385f972e2b89",
    "original_mime": "image/png",
    "body_sha256": "c49446c26813724c29e488928ff9d464d8c5dbca42799d9d49dba8c47054b5a1",
    "width": 570,
    "height": 794
  },
  "b308e2ae-c578-4fa5-b3f2-80335b3aed86": {
    "alias": "053",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e26d2076a1333bfe2f30f2637642c3f6bcecf835857e5056270a546cffd31a0a",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Golem.B05.53.38377.png",
    "variant_id": "2d625201-d0e6-43ba-a899-6bbb5431452a",
    "finish": "normal",
    "current_native_label": "タケシのゴローニャ",
    "original_sha256": "6128ad2102f0a6638a7757ca273696e93401857312590dbc83637cca8965e3d0",
    "original_mime": "image/png",
    "body_sha256": "8179fd9549d0eff0378b55191956761a1dc91589018712df573732fef094bedd",
    "width": 567,
    "height": 800
  },
  "bf386d48-c854-4cf7-b2b0-4c3f73da2faf": {
    "alias": "054",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:9af2b461eda28232b6fa9d11bbd177c7a82da49a17b567ba1d43335a2ce1f00b",
    "image_url": "https://den-cards.pokellector.com/316/Rockets-Hitmonchan.B05.54.38378.png",
    "variant_id": "9a76d90d-003e-463b-96a4-c6edadd989f6",
    "finish": "holo",
    "current_native_label": "R団のエビワラー",
    "original_sha256": "cd29b87d4f9850a5ed9b0590c5591f8c9bf4b6b637643e126cc7fa068f92ab1e",
    "original_mime": "image/png",
    "body_sha256": "d63c7db460ac33f64059e869bff5029859b4fa4bddb1033e9211b9266cf83912",
    "width": 570,
    "height": 797
  },
  "71aa93fd-8ce0-4a84-ad4f-a3ec623ba7b9": {
    "alias": "055",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c8b6b0ddef7b349e7e38f7e68fa36a5442c461d01c1572c07ccb75c90810f31d",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Rhydon.B05.55.38379.png",
    "variant_id": "0467dbc5-3140-4d38-b367-bc9711b7a3e4",
    "finish": "holo",
    "current_native_label": "タケシのサイドン",
    "original_sha256": "d23f73e9ca4df3c394461da8382a5bc0200af268270e82f737a19c995f17c790",
    "original_mime": "image/png",
    "body_sha256": "806419b3b74012c283ca26f304b7072f8b5363b7765389467e0136e99a93cf41",
    "width": 570,
    "height": 799
  },
  "8ae4516f-303e-4d72-943d-65ad24efc1b6": {
    "alias": "056",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3da6505e412fe15f20ec329c85f2193d6191c03824e23b4135e52aee7092f7e9",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Rattata.B05.56.38380.png",
    "variant_id": "df244de8-9a2f-40dc-a9e3-8144b2745a5d",
    "finish": "normal",
    "current_native_label": "マチスのコラッタ",
    "original_sha256": "06d27a69163dd94128b361b218f092ea50c3ca3b5ea3e055fb501e5359d13c8d",
    "original_mime": "image/png",
    "body_sha256": "8e22c148d91fff2a22597f1b251b2935529a565ac8dc45aedf2ba5fb231fd4ef",
    "width": 570,
    "height": 794
  },
  "cba8cdb6-cacb-4849-b303-3787a609415e": {
    "alias": "057",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:452dbf60fdcf89f75ecbc1fc05c8d49a1ae06b75eb450db0f7ae794c33c01faf",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Spearow.B05.57.38381.png",
    "variant_id": "26d64d66-a730-4970-802a-8504b2cd05fc",
    "finish": "normal",
    "current_native_label": "マチスのオニスズメ",
    "original_sha256": "4903780015c0ebcf7c35f8e89c35b3ea96091dde4aa34a979fbf57bfce9849d2",
    "original_mime": "image/png",
    "body_sha256": "a0b1c4a195a17d8cf2e3ea61491aec8913e121eb08c100e84a2b3ed5c11180d3",
    "width": 565,
    "height": 800
  },
  "cdac3a67-8949-451b-aa36-834809726a68": {
    "alias": "058",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:057cf0d5d72fea074a45784c9bea52cee0f07c4a21ace2eef2b5343d099756bc",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Jigglypuff.B05.58.38382.png",
    "variant_id": "775198e5-24b0-48a3-8763-2055d7f20b9f",
    "finish": "normal",
    "current_native_label": "エリカのプリン",
    "original_sha256": "a5249b3e79a0e3ae8838ae63eb3406eda744d0c5eb214b3d52af6e8944c85577",
    "original_mime": "image/png",
    "body_sha256": "b2f45ca68ae3b55ce950d6212debea8c8de9b6ad81c9004d7a2bc3d7d47e8dd3",
    "width": 570,
    "height": 794
  },
  "cc341b93-2675-469b-b04b-43b9c017e728": {
    "alias": "059",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e0e77ba111095fe977b6d1b10b81ee12496a4ba92ac5f356fdf5557e90172b3c",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Raticate.B05.59.38383.png",
    "variant_id": "4f028623-1818-4017-b169-43cce6f6102b",
    "finish": "normal",
    "current_native_label": "マチスのラッタ",
    "original_sha256": "b90fe5fce7ac6f6ac8cd2f239d19a3acc758f7c0d5da479cee0f1a32df593fdb",
    "original_mime": "image/png",
    "body_sha256": "dba75413a871cd4a5c9d79d8ae6c02df6bec81e0077e6bb045b6e2f9a0f1c3e4",
    "width": 567,
    "height": 800
  },
  "ec9defe6-4809-4e4c-82a0-d4bc77b5aa51": {
    "alias": "060",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:d79f52f0fd2451b8351ccb930a991afa9475424a54049fc3c895c8f323fdb40d",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Clefairy.B05.60.38384.png",
    "variant_id": "2cc09b07-747a-4987-af23-98a864c00f8a",
    "finish": "normal",
    "current_native_label": "エリカのピッピ",
    "original_sha256": "81c0c0fd4bd15dd99056e7847b82a0bfe6a2e334520c87bb9b666c436ae44c1d",
    "original_mime": "image/png",
    "body_sha256": "9eb9713fc401d53e13a15387113e954ae1abd75f7c4326fb8cf8becf2ed169bd",
    "width": 565,
    "height": 800
  },
  "3eec3ab8-015c-47a9-93a0-cbe683e534ab": {
    "alias": "061",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:185103c687e6a830c67b6c0d219bf60bed7defa6feb2003198209b6fd83e7256",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Lickitung.B05.61.38385.png",
    "variant_id": "96079bac-d28b-4173-9faf-7dc941b8ad00",
    "finish": "normal",
    "current_native_label": "タケシのベロリンガ",
    "original_sha256": "ba86bf1f905bfe76018d133b4fd1f7e0cb074748ac5e20d4840fd778449b0394",
    "original_mime": "image/png",
    "body_sha256": "986e29ed20ae0e085e3ce66ef343e80ca8f353c779fd44b20fa8044b29ff7fa2",
    "width": 567,
    "height": 800
  },
  "210b799e-3284-4edc-8e26-d9bda681e0ed": {
    "alias": "062",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:23c2a6b3bb7687ee8027bb58fb81ed855a5f07ab1c74d054236028dae949586a",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Eevee.B05.62.38386.png",
    "variant_id": "5a0754bb-2632-43ca-bd38-a1e998d3851f",
    "finish": "normal",
    "current_native_label": "マチスのイーブイ",
    "original_sha256": "5b711d45286f829bf078b9f8ba21a8b0572d82d4226747c33e4a8389c7294a7a",
    "original_mime": "image/png",
    "body_sha256": "1af629e90e12fbe397396382f28d43002946618800bbde4fb29aba6a13dec1c0",
    "width": 570,
    "height": 797
  },
  "9f8bc589-208f-4062-9ce3-d1da15ca656b": {
    "alias": "063",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:c0b585fc489ac91b7204f0ce150fc0e47a2c5a961b45a275796edf27c594eba5",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Dratini.B05.63.38387.png",
    "variant_id": "26b79268-5202-4443-bf90-c200a45cfad3",
    "finish": "normal",
    "current_native_label": "エリカのミニリュウ",
    "original_sha256": "d5b4419ce529c59c67c209cdec192c130b3667c4485c5bef54241543b84863bb",
    "original_mime": "image/png",
    "body_sha256": "561c99c817fe5a6e30e291a5963bf07ef97f200a2ad6202a840f269a4af6ec46",
    "width": 570,
    "height": 799
  },
  "e1b13319-5857-42b4-a16f-3d58736c9fb4": {
    "alias": "064",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:26e54aa741a54e25b87921e3adbd244baf00dbf2a56dad459bd18428ef697a1c",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Fearow.B05.64.38388.png",
    "variant_id": "fba1a31a-5313-4d9c-ade0-98a9176a00e1",
    "finish": "holo",
    "current_native_label": "マチスのオニドリル",
    "original_sha256": "04b04a95cce46476ebeaacb26c9f138e83dfa60cfd28535402b05a9f6aca8fd3",
    "original_mime": "image/png",
    "body_sha256": "97440c35f7209494e8c1ab814e5748cf89b7776f02355b3ba8d3b97f64c4d04a",
    "width": 570,
    "height": 799
  },
  "05d76aa4-e339-4af3-8f43-043ce9e8071f": {
    "alias": "065",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:75287338068f8cf102ebf7c8ff8fdd4679937b8bce0c4210233896fd145f13de",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Clefable.B05.65.38389.png",
    "variant_id": "c3d5ab3d-bcbb-4f85-a2c9-068b215d3e9a",
    "finish": "holo",
    "current_native_label": "エリカのピクシー",
    "original_sha256": "54d2b93ff501f5e9ec9c6036ea3a8584ff7c542b08ca8a08baa8a876ed9847e7",
    "original_mime": "image/png",
    "body_sha256": "8e30eeb2cc7e255c496b77f9ab45befc690c6845ef897b733a6e143a9ae69abe",
    "width": 546,
    "height": 800
  },
  "de1f698b-d071-481c-9775-1d743af7ff48": {
    "alias": "066",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:b4383968f5a69378c951899f77778229d3957381be7f8de8946bbc80a9bde106",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Dragonair.B05.66.38390.png",
    "variant_id": "976e015c-37c3-406c-bcb9-62e541801b65",
    "finish": "holo",
    "current_native_label": "エリカのハクリュー",
    "original_sha256": "144faff8379bf745ff7ce3aa98c8ff681251ebe72516f42ca2b98e85e575d9d3",
    "original_mime": "image/png",
    "body_sha256": "538d8eddd7c792b6bc820fc1bf317e74e638854a560d9bd75b48b47a72196e24",
    "width": 567,
    "height": 800
  },
  "047c2f1a-4ee9-440a-9afc-64878f4a3cfb": {
    "alias": "067",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3700afee8bd25897e6da354723e51b729771e0b174b97573ea3f497d6615eb23",
    "image_url": "https://den-cards.pokellector.com/316/Energy-Flow.B05.67.38391.png",
    "variant_id": "08ad2fcb-287d-4593-bdf4-b72e65d81044",
    "finish": "normal",
    "current_native_label": "エネルギーサーキュレート",
    "original_sha256": "ef6fd76bf282646a17eb2640240e9f73d76088527b85a1e9f63b09f1da1ea011",
    "original_mime": "image/png",
    "body_sha256": "410fbf4e4d5f4a499c6b5b69eee06fcab4cee9aa53bec49ebe0a53d7c02b509e",
    "width": 567,
    "height": 800
  },
  "9ebfd460-5f65-44e8-8bf1-9c71d9f4b544": {
    "alias": "068",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:80eaf74ca1c6e02ead43adcfb9fddfc53f011af71dac49b166e14e407bb5f330",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Duel.B05.68.38392.png",
    "variant_id": "056f5ddd-7433-472f-8820-98aaee7d08d1",
    "finish": "normal",
    "current_native_label": "カスミの勝負",
    "original_sha256": "4b9f69acedb269fbac44581f403423fb42b8ac9625b601ef133e647110e36f01",
    "original_mime": "image/png",
    "body_sha256": "8304ddd409ef2f99dea76ea0a6779ab7aa51f4e88d13b1f7a83750813c7a03d6",
    "width": 570,
    "height": 794
  },
  "f3db9301-88c1-48d2-a5f3-3a96086369dd": {
    "alias": "069",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:98a5189849ac72d193d10d7dfc483705eb60d0fd14fbf3f91f09bcb4480a0bc8",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Tears.B05.69.38393.png",
    "variant_id": "4562eb01-52f5-4953-a2c2-cd4e34028340",
    "finish": "normal",
    "current_native_label": "カスミのなみだ",
    "original_sha256": "8e0b4b7a62dbc1f15370e3c35b7c675f9231d79426dceb9da9dca276657d4ba6",
    "original_mime": "image/png",
    "body_sha256": "72ea7eb9ff3f291fc66796c345f39f7c8013a1b394adcb1fef2a3df9586a7df0",
    "width": 567,
    "height": 800
  },
  "292bb20b-0e86-4ce5-9ee4-0e32368bd4cb": {
    "alias": "070",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:60121f537e2e48cb6b7c79c3beeda1d04387e5891d10426e093c07db14687e09",
    "image_url": "https://den-cards.pokellector.com/316/Narrow-Gym.B05.70.38394.png",
    "variant_id": "338005f0-dc0a-46f1-9bac-724b4653852c",
    "finish": "normal",
    "current_native_label": "せまいジム",
    "original_sha256": "0bf5a14dae2925800d564775feb6cf5f184a3a99fd31b17995b93ff5a89d370e",
    "original_mime": "image/png",
    "body_sha256": "706a1c3d1e87a7d8f5dec2b3ab2ec225136a1aab5ebc6d8d8f58ad1d70b1b434",
    "width": 569,
    "height": 800
  },
  "3df25227-2e10-46d6-9df2-400eac043e0d": {
    "alias": "071",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:fe88c2f5d3ef4133dfd9ca4e4a962b2c916c39a59292806469b7104ca72b88ce",
    "image_url": "https://den-cards.pokellector.com/316/Recall.B05.71.38395.png",
    "variant_id": "a6bcb66d-9004-4c84-a6a5-39671666ad13",
    "finish": "normal",
    "current_native_label": "思い出させる",
    "original_sha256": "8bae66fd2caf805e168db10a29d8e09d41a03f02e018e05300f5a5cae63e43ef",
    "original_mime": "image/png",
    "body_sha256": "5aec6a36978f907b585b88354003cf8d739ffda2ef634a87d9d860f11afcee63",
    "width": 570,
    "height": 797
  },
  "33ebf4c6-47e3-45e5-981a-b74aed949941": {
    "alias": "072",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2e08394a38499a606339b0d1897649997e7c1c91b18ad4b940e0b5380acf45ed",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Maids.B05.72.38396.png",
    "variant_id": "684fa5a7-ee88-49a7-b231-61c421caa2ea",
    "finish": "normal",
    "current_native_label": "エリカのお付き",
    "original_sha256": "dbf4864fa3bc70b010e2d1f3d1fb749f009d57580ee233452f80024bca5ba454",
    "original_mime": "image/png",
    "body_sha256": "eb54e98df02ae3c82d3c632f0fb505679162042836fd817f862b73c56128531b",
    "width": 565,
    "height": 800
  },
  "a5a6bce6-ad9b-4d15-bbbf-5fde54aa064c": {
    "alias": "073",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:80b1ce0d61b08f94fe5ea41fd8ecdd2d024b3a9a244459332c9e3535d0780e0e",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Perfume.B05.73.38397.png",
    "variant_id": "a5615457-8981-4c06-9682-b80c8747c211",
    "finish": "normal",
    "current_native_label": "エリカの香水",
    "original_sha256": "25057121235bba5d232e0cdf5c6e9e21d82f633d1888481bc0e2bd4528dcc880",
    "original_mime": "image/png",
    "body_sha256": "d0e6b0521e4b68259acede0ed6f333abb88459f681bd64085c59af82ec36ec91",
    "width": 569,
    "height": 800
  },
  "8e37159d-fe57-4af0-9903-2ebedcca199e": {
    "alias": "074",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:617d1d270b45f1b0a180bb10616220288f90cc3b232da8f45184f6a050850655",
    "image_url": "https://den-cards.pokellector.com/316/Charity.B05.74.38398.png",
    "variant_id": "3aff1c02-463e-4340-b09a-847bd8967f26",
    "finish": "normal",
    "current_native_label": "お上品攻撃",
    "original_sha256": "5ac8dd07f67c88c62964b0fa2f80464753846163806e5e7f64d16de0afab8a08",
    "original_mime": "image/png",
    "body_sha256": "cdb49aa767776dddbdf0c2fbfe18e46a54bf4a44f327bc3a2fc6aff6b10b73ba",
    "width": 570,
    "height": 799
  },
  "3f5e9815-8838-425c-9622-aaa6785bc984": {
    "alias": "075",
    "batch_id": "JP-CARDS-060",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:e97dcd70bb0eb41fb9b89481c3555a155823e15b5372ce844cf2f6818dd0dbda",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Wrath.B05.75.38399.png",
    "variant_id": "3f11570b-3c14-4eb7-9ad2-cc2519cffc11",
    "finish": "normal",
    "current_native_label": "カスミのいかり",
    "original_sha256": "f6a7c3c7a5ebcdd88c824637f51dfe9ace49829e8e112b18074633e7bcc0e955",
    "original_mime": "image/png",
    "body_sha256": "6e96905106c4067acbf78beaae2017a72582816dab643a7ac58779df6b89c208",
    "width": 570,
    "height": 797
  },
  "7034839f-9217-49fc-ac65-ebeaa32df916": {
    "alias": "076",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:2f8e8c7060f6312b319f356ad8ebd8aa96b7daa26012f3469bde06c73a2c6d68",
    "image_url": "https://den-cards.pokellector.com/316/Vermilion-City-Gym.B05.76.38400.png",
    "variant_id": "e4b34212-65f9-4250-ba29-e44046732b08",
    "finish": "normal",
    "current_native_label": "クチバシティジム",
    "original_sha256": "c458a18df95fbda74748617a0f84ba0b80d579083eef7adb6265d4540543849d",
    "original_mime": "image/png",
    "body_sha256": "027f8ba5c20fab6fd8b29a7ead96a1f9c54f81e2f9525e4b956814d67d3746e9",
    "width": 564,
    "height": 800
  },
  "69bbb142-4e8d-488a-a8f7-5dc9da1d30ea": {
    "alias": "077",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:41a68fe8997d8ae971042a8f4d09aa03043105ee751b9bae8552a24ffb05d263",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Training-Method.B05.77.38401.png",
    "variant_id": "5c5bb311-c057-411f-8514-3bfe2bfe9239",
    "finish": "normal",
    "current_native_label": "タケシの育て方",
    "original_sha256": "558d474210be9ba4e03c1ae5db3d426ec90d6e3725f1116409ec1462811ed643",
    "original_mime": "image/png",
    "body_sha256": "ddb7207d9ea525c76c10b99d231bb53145b16aca1207d1df87eeb8d6ce3cd025",
    "width": 570,
    "height": 797
  },
  "0d9e77d0-3cb0-4f3e-9587-f8c1b414c36d": {
    "alias": "078",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:3234525dc3dbf004e8b74c2e0ddd8c1e79372a6fe5374ff8a3c384be88664ba5",
    "image_url": "https://den-cards.pokellector.com/316/Celadon-City-Gym.B05.78.38402.png",
    "variant_id": "0afae1e1-b7bf-4875-96dc-f3d50389115b",
    "finish": "normal",
    "current_native_label": "タマムシシティジム",
    "original_sha256": "a57a47c3f66211bf30cc338983ff8b0fee29f101bc6dc8a745c102ae054a87d5",
    "original_mime": "image/png",
    "body_sha256": "77cf03a7d69f07a30eb758353a29cd3a14af7caef0d8d1d6ebfd83baeb1bda1e",
    "width": 570,
    "height": 799
  },
  "247c6e8d-e3f6-4808-982d-73b436f27edf": {
    "alias": "079",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:bc3faab4946c4856b9f97d3dc44f4cd5c4ec07cc279d7f22787f36ddd4c31044",
    "image_url": "https://den-cards.pokellector.com/316/Pewter-City-Gym.B05.79.38403.png",
    "variant_id": "f38df99f-c42e-4ae8-89e4-8b7feaf21023",
    "finish": "normal",
    "current_native_label": "ニビシティジム",
    "original_sha256": "495d12a124f87903af810df6e4fe099ba3f4fba6bdcdcd8313ab9b2fbcb41291",
    "original_mime": "image/png",
    "body_sha256": "3012e336beafcd5aadd8e5289850b7481c2fc00d00bcb73e5b71b63d44f2b4e4",
    "width": 567,
    "height": 800
  },
  "32eaf924-7c78-402e-9c6c-6e1a7de27672": {
    "alias": "080",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:9997f00d12a68d23c87c0cbc414fd493e58d4930181dc4f06cac8ad3cb2d9d36",
    "image_url": "https://den-cards.pokellector.com/316/Cerulean-City-Gym.B05.80.38404.png",
    "variant_id": "fd17d30f-10ae-45d9-9ba3-fee3dece6f60",
    "finish": "normal",
    "current_native_label": "ハナダシティジム",
    "original_sha256": "0fb460cc7ffdbbcbd3e0cba54b101753c70d1be5c560c13636b9ad0ae6c36086",
    "original_mime": "image/png",
    "body_sha256": "5728bafd8b5e38f08f85b8ef886335f161895041c390db1dbfaccf7a51fe57e0",
    "width": 570,
    "height": 797
  },
  "d123e9c3-5fbc-43d8-abd9-394e82cea9d9": {
    "alias": "082",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:110da2229c7d2efd26f57a9cd364f9fb8801acb6cc2851d5e5b377d107588c19",
    "image_url": "https://den-cards.pokellector.com/316/Good-Manners.B05.82.38406.png",
    "variant_id": "bfd3cf8f-18f8-44b1-b769-1c2c18cb4d5a",
    "finish": "normal",
    "current_native_label": "礼儀作法",
    "original_sha256": "28c21de53d687bab733cb2eca6d0d03f21af8d9188173ce975f142f59a71ab70",
    "original_mime": "image/png",
    "body_sha256": "11e80bf8ad56066dbc7aaa8fe5aa7047c29cb8f8df99d03b5138bae1f0fa1a39",
    "width": 565,
    "height": 800
  },
  "7a84d65f-5273-4497-ab6c-c8af38a95b50": {
    "alias": "083",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:5a07292a187406f74044007da9b846f01346d81aac3bf90d3f312c1da6b396c8",
    "image_url": "https://den-cards.pokellector.com/316/Erika.B05.83.38407.png",
    "variant_id": "e506358f-c230-4141-b3bb-fb2fe5e28fc1",
    "finish": "normal",
    "current_native_label": "エリカ",
    "original_sha256": "a46f0e3444775c4f600f0e410732db1e3c6e2fbf1438f3162fc0b7b28b512780",
    "original_mime": "image/png",
    "body_sha256": "4b9add4a795618d53d95bfb0abb6a550bc5a61e2c0509349f010a0ead96f935d",
    "width": 565,
    "height": 800
  },
  "112290e8-6e3b-4337-8ea8-de10366f8f8c": {
    "alias": "084",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:78d76fed19f5083157d64e44f2b82b70d3c55c3ba494801834b682fbcf96f9ce",
    "image_url": "https://den-cards.pokellector.com/316/Erikas-Kindness.B05.84.38408.png",
    "variant_id": "d6436c3c-1630-4b9d-9903-966f43d910ad",
    "finish": "normal",
    "current_native_label": "エリカの親切",
    "original_sha256": "aa40dd8123e0fcb3b1f97e746ab723a68ae4e87aaf703e966b80c9a0f32e670d",
    "original_mime": "image/png",
    "body_sha256": "09c98a75d8d5237b356455d9bc97ac7c5ba3ecc0ed8193c1abaef63ccf439c26",
    "width": 567,
    "height": 800
  },
  "08d3c8d5-2f31-4f28-a83f-03e0787f5db1": {
    "alias": "085",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:190e510c6a91157ccb6bf771ef2fb4a9a9f52acdd656d2f7440199f0172eeeaf",
    "image_url": "https://den-cards.pokellector.com/316/Misty.B05.85.38409.png",
    "variant_id": "d1a4905a-9118-4d0c-b680-a2280b8694f9",
    "finish": "normal",
    "current_native_label": "カスミ",
    "original_sha256": "96588e75ab46719b3d5f44fdfa11744dcc980a8a63b21afe2c6de4b48eebae32",
    "original_mime": "image/png",
    "body_sha256": "bc14e4a909a6137b1de499651064698a4da5cbfd885ba3b56d66997713ccd7c7",
    "width": 570,
    "height": 799
  },
  "071f05d0-e519-44e9-8d45-e687a3841dbb": {
    "alias": "086",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:6b96a02f1b1bd3163f5e0136e669796bdb2fe4602b3f2205f3325435956c285f",
    "image_url": "https://den-cards.pokellector.com/316/Mistys-Wish.B05.86.38410.png",
    "variant_id": "bf2f0d71-3274-4a1a-86df-15db1c3af0b2",
    "finish": "normal",
    "current_native_label": "カスミのわがまま",
    "original_sha256": "7780ef3d3505d1f893a6b1074704871fba79572e0a9825208acd49a42850d559",
    "original_mime": "image/png",
    "body_sha256": "ecf3549d335b2d04eee738157addb04515aab22b0d77ff8560e7bd7b73fb295d",
    "width": 570,
    "height": 799
  },
  "ac9fea65-2529-4bd5-976e-36fdb09d4cb9": {
    "alias": "087",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:a0e9bc294433252e8674f9db67355610ff87046fc7c0664b539e0af8a4a91a47",
    "image_url": "https://den-cards.pokellector.com/316/Chaos-Gym.B05.87.38411.png",
    "variant_id": "535ef2e5-66e8-4624-9c3b-56e61524fb87",
    "finish": "normal",
    "current_native_label": "錯乱ジム",
    "original_sha256": "5beae5cea5bdeb869403554942324f43fdcb2e34fc384370afb274dd902f28db",
    "original_mime": "image/png",
    "body_sha256": "702f9704802736fa53d28143f4d845e1770a0250b089712bb7252327c55168b2",
    "width": 569,
    "height": 800
  },
  "222c924a-a878-4a1f-98be-4f0aa894f731": {
    "alias": "088",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:9606dad6c220aff1df13869165ba9e1fa83b81bd6aba3f5f660c434ebbeaebf6",
    "image_url": "https://den-cards.pokellector.com/316/Secret-Mission.B05.88.38412.png",
    "variant_id": "0a232d41-e4e8-4c74-8c19-5672b3015dd1",
    "finish": "normal",
    "current_native_label": "スパイ作戦",
    "original_sha256": "aae93e3a1db1ed49bceb387611fd67701f13cd074eed819ff6043813a5e0a05c",
    "original_mime": "image/png",
    "body_sha256": "88463a996b620a37c632c8a6b4268300426f47dbac6ae97bc19754f476616255",
    "width": 570,
    "height": 794
  },
  "2cb73722-9e80-410b-ac85-444695e6ed83": {
    "alias": "089",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:8a032875bbe6393b39d8ee395f237b53b64cba01dca382d5b2b68ee2db92505a",
    "image_url": "https://den-cards.pokellector.com/316/Brock.B05.89.38413.png",
    "variant_id": "7f6a9993-6060-44e1-af65-f0e183ff6474",
    "finish": "normal",
    "current_native_label": "タケシ",
    "original_sha256": "0083cdfc55099de75370652494af7741fda90f312b94346bcacecebff144865e",
    "original_mime": "image/png",
    "body_sha256": "a84ef98a51665faee17807c991976ed2534bd33f177d0763c6b1c2fc0d771ef7",
    "width": 570,
    "height": 794
  },
  "8258b832-da4d-4e6f-a26c-223f85a71242": {
    "alias": "090",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:f0a1a7668e1bf56f204bc618367e25909c0236c377205f2f2bf9f8cf09981203",
    "image_url": "https://den-cards.pokellector.com/316/Brocks-Protection.B05.90.38414.png",
    "variant_id": "8bba416f-1b54-434e-abaf-e0a5c6c08b96",
    "finish": "normal",
    "current_native_label": "タケシの保護",
    "original_sha256": "ee027ef28b5ae1181c7ebdd448175a018a78c85687e9de28fbf2bfac930e0400",
    "original_mime": "image/png",
    "body_sha256": "aa4a85a7e6e4238ba7c1157f7706224934d09cb750a9a49d8de52228fa0d74c8",
    "width": 570,
    "height": 799
  },
  "43d2a120-d663-45ee-a907-09584991bd0d": {
    "alias": "091",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:1c87259e463f30286a9a5563857a037db4889330484e882f5a701041d8ccb3fb",
    "image_url": "https://den-cards.pokellector.com/316/Resistance-Gym.B05.91.38415.png",
    "variant_id": "b217e89c-45be-4239-97ff-9abf605e4c95",
    "finish": "normal",
    "current_native_label": "抵抗力低下ジム",
    "original_sha256": "1127c4f179f073d41c857b0cac112538e48e098b5c33b235545c0157d5e3c500",
    "original_mime": "image/png",
    "body_sha256": "cbb7968091656783255f7d3360e309f6fa1734b4eaf2212f49cff6f122b00659",
    "width": 564,
    "height": 800
  },
  "9c97a55c-b9fb-4d35-b8d6-62ed011005fa": {
    "alias": "092",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:f9d64cac98b260cd5483078ff47a909358cbfe0ecf3719146a763b5ea0c08e88",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surge.B05.92.38416.png",
    "variant_id": "31781007-2d71-49de-b50f-02c9e5f0728d",
    "finish": "normal",
    "current_native_label": "マチス",
    "original_sha256": "1ddd7bd403cd3b0f8956cf202a4fb7760b9dc928852d879671f6248d4e51d2da",
    "original_mime": "image/png",
    "body_sha256": "1b185a5924381db60ab3091b806b6e63f01409f3397f9aee39093d863e2c7dce",
    "width": 565,
    "height": 800
  },
  "e6e9db92-27bf-41ff-b89d-03b6e0e5a568": {
    "alias": "093",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:b905df07f102553f71e353937fcc3cec1cfae67b403dc0113b25df029ac4a42f",
    "image_url": "https://den-cards.pokellector.com/316/Lt-Surges-Secret-Plan.B05.93.38417.png",
    "variant_id": "b5f347f2-da05-4459-acb3-77207f7af684",
    "finish": "normal",
    "current_native_label": "マチスの秘策",
    "original_sha256": "3d1cdc4b9682676a865bfa153b0b9d94133a4c5100dda15da7d9fcec22e32528",
    "original_mime": "image/png",
    "body_sha256": "34a831bda7762a9b8f969349589590895a5d281ba9372e1edff74b6bf935e5ae",
    "width": 570,
    "height": 799
  },
  "52a5779d-362b-46a3-bc02-e8eeaf487369": {
    "alias": "094",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:058e3ba67bad3eab8589ce413ba3069ecf61080cd2b267ef30842a7cb1ab07af",
    "image_url": "https://den-cards.pokellector.com/316/No-Removal-Gym.B05.94.38418.png",
    "variant_id": "b9aa2d2a-15c7-4e1b-b1ba-15a71f37f35f",
    "finish": "normal",
    "current_native_label": "リムーブ禁止ジム",
    "original_sha256": "d9dcb15b6d966e53be189a374ee3b93c12a6d0d2802cde01e509da97b5cf5728",
    "original_mime": "image/png",
    "body_sha256": "f5bf1a05621cbea198facd2f3848313036785ffd63ea94a8eb338451368a143b",
    "width": 570,
    "height": 799
  },
  "8d455ad5-bbe3-4a5b-9f97-2630f63122e5": {
    "alias": "095",
    "batch_id": "JP-CARDS-061",
    "set_id": "c24a6f11-2b12-4dbd-8d50-61f17e8e6a4f",
    "set_code": "PMCG5",
    "source_code": "pokellector",
    "provider": "pokellector-image-url-sha256:46cdec948c391c04c5b8a3eebb13e60fe922d907816deb1eb8aa531ba07b2e7c",
    "image_url": "https://den-cards.pokellector.com/316/The-Rockets-Training-Gym.B05.95.38419.png",
    "variant_id": "1f09d476-1de7-4dff-8f27-1740216d88aa",
    "finish": "normal",
    "current_native_label": "ロケット団の特訓ジム",
    "original_sha256": "288e53d844035fa4f30722eebf3281280bc9b984f35de7b2dde770ed59d4ae27",
    "original_mime": "image/png",
    "body_sha256": "2e799a02eef438bce7f3fcddc36934edc089744e81f58ffff7331735ac2c8a77",
    "width": 565,
    "height": 800
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-058",
    "JP-CARDS-059",
    "JP-CARDS-060",
    "JP-CARDS-061"
  ],
  "saved_batch_tasks": 96,
  "eligible_fronts": 93,
  "by_batch": {
    "JP-CARDS-058": {
      "verified": 24,
      "held": 1
    },
    "JP-CARDS-059": {
      "verified": 25,
      "held": 0
    },
    "JP-CARDS-060": {
      "verified": 25,
      "held": 0
    },
    "JP-CARDS-061": {
      "verified": 19,
      "held": 2
    }
  },
  "excluded_aliases": [
    "019",
    "081",
    "096"
  ],
  "excluded": [
    {
      "printingId": "f732147f-deef-4c65-a092-4ed2e7bbfcad",
      "canonicalAlias": "019",
      "reason": "Frozen independent source/quality hold; outside exact93 approval."
    },
    {
      "printingId": "58053385-0e6d-45a1-b7aa-ba11abe75091",
      "canonicalAlias": "081",
      "reason": "Frozen independent source/quality hold; outside exact93 approval."
    },
    {
      "printingId": "99246359-6f35-43db-9f85-2ccca99bceec",
      "canonicalAlias": "096",
      "reason": {
        "code": "missing_lower_outer_border",
        "evidence": "The displayed570x773 original ends in the grey artist/footer area. The lower yellow outer border and lower rounded card corners are absent; a complete physical front cannot be certified.",
        "action": "Obtain an exact approved complete Japanese ロケット団のワナ front showing the entire bottom yellow border and lower corners. Recheck actual native rule/artist/art/set/current holo tuple; do not pad, upscale or generate the absent edge."
      }
    }
  ],
  "outside_fixed_cohort": [],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Leaders Stadium printing');
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
  check(isDeepStrictEqual(plan.source_counts, { pokellector: 93 }) && isDeepStrictEqual(plan.delivery_scope, deliveryScope), 'Fixed partial delivery scope changed');
  for (const row of rows) {
    const known = knownFor(row);
    const expected = table.find(entry => entry.printing_id === row.printing_id);
    check(expected && isDeepStrictEqual(selectFields(row, IDENTITY_FIELDS), selectFields(expected, IDENTITY_FIELDS)) && row.language_code === 'ja' && row.set_code === known.set_code && row.set_id === known.set_id && row.catalogue_version_id === PRODUCTION_JA && row.source_code === known.source_code && row.image_url === known.image_url, 'Frozen exact source/canonical identity changed');
    check(row.objects.length === 4 && row.objects.every((object, index) => object.role === roles[index]), 'Complete original and three display roles required');
    const original = row.objects[0];
    check(original.sha256 === known.original_sha256 && original.sha256 === expected.original_sha256 && original.width === known.width && original.height === known.height && original.width >= 360 && original.height >= 504 && original.width <= 570 && original.height <= 800, 'Original identity/detail dimensions changed');
    for (const object of row.objects) {
      check(object.artifact_id === ARCHIVE_ID && /^[a-f0-9]{64}$/u.test(object.sha256) && Number.isInteger(object.byte_size) && object.byte_size > 0 && object.byte_size < 12000000 && Number.isInteger(object.width) && Number.isInteger(object.height) && object.width > 0 && object.height > 0 && object.width <= original.width && object.height <= original.height && object.mime_type === (object.role === 'original' ? known.original_mime : 'image/webp') && object.file === `objects/${object.sha256}/${object.role}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[object.mime_type]}`, 'Invalid, altered or enlarged immutable object');
      safePath('/packages', `${object.artifact_id}/${object.file}`);
    }
    validateBody(row, known);
    check(digest(Buffer.from(JSON.stringify(row.evidence))) === expected.evidence_sha256, 'Frozen exact source evidence changed');
  }
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 372, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 93, variants: 93, names: 186, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 79 && cards.filter(card => card.finish_code === 'holo').length === 14, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Leaders Stadium plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 376 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 93, 'Exact accepted Leaders Stadium archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 279, object_references: 372, unique_image_members: 372, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
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
