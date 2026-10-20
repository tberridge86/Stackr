import { readFile } from 'node:fs/promises';
import { canonicalHash } from './source-proof.mjs';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertNoConflictingFronts, safePath, STAGE_JA } from '../artwork3303-publish-20260928/publish.mjs';
export { BINDING_FIELDS, SOURCE_FIELDS, selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
import { selectFields, DECISION, validateSourcePlan } from '../artwork-trainer-kit-push-20261013/frozen.mjs';
export { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';
import { indexObjects } from '../artwork-latios-trainer-kit-push-20261013/frozen.mjs';

export const COHORT_SHA = '8ca7378e5cbee652878fbe2464c30831cf81149e323b0d0122e42313f6b1975d';
export const APPROVAL_SHA = '24b284c664b95fb6bf14b6631436e6c8eb351c6cec6952eca7da65fd7b5bbf41';
export const IDENTITY_TABLE_SHA = 'cb0db4de7f23633a6791f51d973c69b535eb6dc7791b45352d3782c169130015';
export const SAVED_TARGETS_SHA = 'eb3745d39b9dd6349201fd25b8942c90162b9743128495bed0d5c61812a62aee';
export const SOURCE_MANIFEST_SHA = 'f4b948c773b872ecb0222e5c50fe61f75cb5c3a4f856605de10351a0fd5c9e81';
export const ARCHIVE_SHA = '94264a96aaef3170468cca55887b3cb9ae51935eda291076d09ff916c3aa9a8d';
export const ARCHIVE_ID = 641915513;
export const ARCHIVE_BYTES = 25305448;
export const FRONTS = 47;
export const QUEUE_ID = 'STACKR-JA-DARKNESS-20261014-047';
export const PRODUCTION_JA = '1a23b7a7-c50e-4601-9180-a25c950d27ea';
export const SET_ID = 'cdaacf04-0a7c-452d-acb0-e02ca3907106';
export const METADATA_FILES = ['manifest.json', 'receipts/preparation-summary.json', 'receipts/current-card-bindings.json', 'receipts/finite-decision.json'];
export const IDENTITY_FIELDS = ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name', 'catalogue_version_id', 'variant_ids', 'batch_id', 'source_code', 'provider_id', 'image_url'];
export const SOURCE_EVIDENCE = {
  "approvedProjection": "b5b45e75ccc71b8cab12abb9d9dd5b3a0d30e90489aaf46fdccb5fc399b19b0c",
  "decision": "b8a6f91bc142e7e55b050eccb4de7e1e3769750d982f09f324ced5c347e1298b",
  "handoff": "5a12a3ce854ba800a4a2d97695ab9c0b4366cf0813fae170c2ce9a919d3c8e1e",
  "independentSelection": "97acdbd7bf4e178c843d72fda7df6d7b652c87b2371179f7b7c992d27840b06e",
  "independentAcceptance": "3e1dc6bc37de6d3d7fc7795933620f430c873355beb327b9cc76f8983bbe7eb0"
};
const canonicalFields = IDENTITY_FIELDS.filter(field => !['source_code', 'provider_id', 'image_url'].includes(field));
const roles = ['original', 'card-grid', 'search-result', 'detail-page'];
// Generated only from the accepted immutable source subset, never from aliases/Dex arithmetic.
const knownPrintings = {
  "023302fe-cff9-4f6a-8488-bc5b79e1b9cf": {
    "alias": "001",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-1",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-1/large",
    "variant_id": "fc3b00ff-ee3f-4d28-b22d-e629412fc387",
    "finish": "normal",
    "current_native_label": "ヴェノナト",
    "original_sha256": "fc70f0bca0c8da8dde0e44bcd26bf940038160c0acd6c6df18f549c2e31f3e88",
    "metadata_sha256": "908057a43b40d9f005bf394138079ccd777f20c478d054dbca52beca9624be63",
    "body_sha256": "9ad9e752fcd6e8b086aa87ccde2ec4aa11f4b366cb08b48cc627f1b9e1750475",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "7bb9d03817c622c39f7970051df381821ddfbe033f75462352cad217de1add59",
    "source_signature_sha256": "9ce194b78cf4dfb98647c2b15fb872c89b613dcda38692c8e48b18d224c8f307",
    "provider_metadata_json_sha256": "d166b0f66c5f30f9fe967bc75c01fe6f5242df003a3a9ef8c9708a4ff4ecd1b6",
    "historical_source_row_sha256": "a6ad8d545ae01cda0520b72c98a528f7f708e9f9e53be6ec981bf463a284fbe9",
    "independent_selection_sha256": "02e9b6c28bdd203ec73fd66aa8dc76891db554bc8be20b8d2efec814413ea428",
    "width": 565,
    "height": 800
  },
  "f73d3074-e0d8-4e95-a934-ce3ce5d28cef": {
    "alias": "002",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-2",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-2/large",
    "variant_id": "cda5ea91-1576-4840-a2f0-e06bf64127a3",
    "finish": "normal",
    "current_native_label": "レディバ",
    "original_sha256": "3c1f6fa1579bb7720acdf3a5844860efc34f63bc008dc0957fec71950a16e3fe",
    "metadata_sha256": "1bae30c7ed9f3bda488aa832434173d1b4ab9d06d796bd852094917beaa11f50",
    "body_sha256": "22f42c0ab957ed98608f43bc191ec824e1d7bb6d2f1bf1d9bfb2ed9a5ad2196a",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "162f03b8b641c4410224077a2798d52cf9efb3be64f2fc3bcf15fe040dd52aae",
    "source_signature_sha256": "f95226486115077d6d556c7b7433cd011deb1b3c5f840b5c689bce63c848376b",
    "provider_metadata_json_sha256": "119c9541f376318828a7337c8fb05a314994f0d9cb8993053453cae865db9cdf",
    "historical_source_row_sha256": "423cea88ee65ee3949df0e5feeb1a33bfb9472aa4a6e9e6492032e0119e44510",
    "independent_selection_sha256": "86baf5db6bc7e4d1d6dccc3813d1828ee40ccf0d17692f575910467ce37d1486",
    "width": 570,
    "height": 799
  },
  "c5562e9d-25d5-4498-8b3a-5094559e0bcc": {
    "alias": "003",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-3",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-3/large",
    "variant_id": "0ca65d0b-eda2-48f7-ae04-571f60baa359",
    "finish": "normal",
    "current_native_label": "サンカーン",
    "original_sha256": "878fff3bc300fd4039b1aaf0cc842213a8e3155104580356600ccf5b4c266870",
    "metadata_sha256": "bfdfae039ca383eb398a146aabfbb8ee1435ad2debfb9900a365b477fc9db194",
    "body_sha256": "15ecc0a89a13da6a04c939f0ff974a68992b063e94f21d086324110c39d2bc05",
    "discrepancies_canonical_sha256": "c7f231f6f67514170a6cdfb4dad2b352d711588e97abbf21fb12cbc3a6fba08b",
    "actual_signature_sha256": "f39ce54603b127a4b957f40cc3da680f21d69c000e03982cd34e93ed3392738b",
    "source_signature_sha256": "51fd846c4138f20cda51debb34773644b1b20bc436fd8de516af0a62a3b37cd9",
    "provider_metadata_json_sha256": "439f277f32da9d64989466595ff3319de8336ec676dde9007328155e4e4cb721",
    "historical_source_row_sha256": "6f70d866051af6dbed1ddd558798156d5cab0fcdb87d1f7aa1fc0c0e046c7e1a",
    "independent_selection_sha256": "7e4514e46cb6305d8a93f5e62c555590740706c483d5db0c5fc640b37e898cc7",
    "width": 570,
    "height": 799
  },
  "22464ccc-a602-44ea-8d47-a7d9cb69dff0": {
    "alias": "004",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-4",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-4/large",
    "variant_id": "38ceaaf8-2467-405a-a337-a800adc335bf",
    "finish": "normal",
    "current_native_label": "軽いサンフロラ",
    "original_sha256": "3f4579e761e289fc663d1dc11d5d2dbeb4ba0ed22cf883e890084bf474965af6",
    "metadata_sha256": "ac7a793252d5773c349728c30d0b1ecd0d045c883b59451316d102e022526ec0",
    "body_sha256": "efe71449fa57d8acf107c452676657153b856192080802e60bc7446b63c14d68",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "a9ec5f52fac884adc1d68d6201aef7456dc2d1f3c31f21a45253cd8f859c98cb",
    "source_signature_sha256": "39a93548ea8895c3831799371c7b1cd5a277165e6f0db56e9890176ab228af67",
    "provider_metadata_json_sha256": "4e92e674333746912c9f5492633543eca8acec15318d882f83690c93f3f67d33",
    "historical_source_row_sha256": "59a74b51a8ec6d5aeb780eefba9d9f5f1a19180cd81136d5e1c446e2914aab7d",
    "independent_selection_sha256": "99e935f1ddd6a53ea3475a1aeeb06c2b5dd8ef9ec0195928619c2ad84807c3ef",
    "width": 569,
    "height": 800
  },
  "db0036e4-d7e0-4c28-9b2a-83f9cb0b2684": {
    "alias": "005",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-5",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-5/large",
    "variant_id": "e596c973-22f6-4c60-a01d-a23e42176f45",
    "finish": "normal",
    "current_native_label": "Pineco",
    "original_sha256": "52fee7a2aeb1b3eb8f2e99162c0a0559e91dbcbe30d976b9a872611674fd4839",
    "metadata_sha256": "5b6d0b23001a6b45d65ba6a6de880237d2774f93e3e2fd95e27c06c7c5b158ce",
    "body_sha256": "515c80be95bb88d776b959fdc9574f46a07112398b812cda8fa981fd3d760316",
    "discrepancies_canonical_sha256": "4ade4708c8c9886938e0c218c4bfa5ecd386afb41ebd9a928d53bc06a1078ebd",
    "actual_signature_sha256": "6e3f37ce0b4c78251743ab075df97ff5a9e7a5d581706189653f03e8c9a1cc0f",
    "source_signature_sha256": "9bc156b66dea7ec14511aea215e54fcb0638af2050d35d4e8357636b7d432e88",
    "provider_metadata_json_sha256": "ea6a98c2ebec728bc73a7879d299d892a9add9209fa71583c046364bf6b8ff9f",
    "historical_source_row_sha256": "41db769aba773676d0247262f6beeecd03f57d4922733e6a168df55e968c71ba",
    "independent_selection_sha256": "4045e0db94d2468e7873dd74d83ead3d9c863fe13fd28b89ed48680d3aa3c406",
    "width": 567,
    "height": 800
  },
  "c6648375-39c3-4c5f-8d08-ca80335ee709": {
    "alias": "006",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-6",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-6/large",
    "variant_id": "28108f7b-8580-4bbd-8905-729a2afd5529",
    "finish": "normal",
    "current_native_label": "軽い毒",
    "original_sha256": "f391370dd233b6e2673a555fda927ef23e9c890b4d83bf757c18f2f0105bdd0a",
    "metadata_sha256": "ff621002e5cfdd8bbd67287292f89adddef4f10da01e69ebe79063b8b33642ed",
    "body_sha256": "d943c7fd7902be65a498e27fb841997a1e9182938a1666593a5a0b39e5483ba4",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "a0cc6ee7981e7fb5434fc6309641397addb7001ca7dcf0dff67cc30b72d5aeec",
    "source_signature_sha256": "88a1535c29bdd3a810f9e3d31eec30eda5148adbb1959e94aed43b4c587645ea",
    "provider_metadata_json_sha256": "f1d4a39cc2cd8fa79db5dc3022dd2e0cd7ada9aa600479da453c98323b952a9b",
    "historical_source_row_sha256": "d322429c151cc635e4ffb07aa1ad0814af9f0c030fba016a75dc096598d85d26",
    "independent_selection_sha256": "e1c5f510e4610a6e4a323e3a064622fe443e69796fb1f2aeb0a9d9d37d61a3fc",
    "width": 570,
    "height": 797
  },
  "de670851-a500-460f-908e-dd094084b40a": {
    "alias": "007",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-7",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-7/large",
    "variant_id": "93824b0c-e3fb-490f-a023-704e23a2d431",
    "finish": "normal",
    "current_native_label": "スキスター",
    "original_sha256": "946ff306b575ac3cb949fd08e9c6abd64f3e285e3c79eef94fdf76ce68721002",
    "metadata_sha256": "575680b7b7d2d9b3acd36d241601524bf60d1358e7fc5cb222a41b3e2e27cf5b",
    "body_sha256": "866ef024b1f70a70d4d9947f2dd20162fc098a50e826e751849b71716060fc21",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "a12908e96fc5c049209bfbd5c2cfe27befafd663682b3812e3eae9bb7da058dd",
    "source_signature_sha256": "b238730b6b0084c92b222c733935528e9512ee55ddb6c9303d4d13d2db7868c6",
    "provider_metadata_json_sha256": "90e62761362472fae859cb0369f2d312cb382d9d01fa5294d7686b7b35ca2718",
    "historical_source_row_sha256": "8a09bdbce84452982e3e0e7aaa7a2cea044d962e38a68d0cfd3d2f3deb515eb3",
    "independent_selection_sha256": "ec5e26576c57737cb28be8d6923be9d219f3ab402de84f6323612321cec3a7a3",
    "width": 570,
    "height": 794
  },
  "48a3e688-64a0-447c-85cf-b3ea7fde9d63": {
    "alias": "008",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-8",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-8/large",
    "variant_id": "65baf5fa-6b5f-49b0-8119-c4bc172602f4",
    "finish": "normal",
    "current_native_label": "暗いforretress",
    "original_sha256": "3c35cf7fd6d886b884ed0b32b00f07552b9ca9e557384f1714af2a1447d8057a",
    "metadata_sha256": "0bd1ac767ef087db3bfbded56b6d59330f42ec6189d0a00377e041796cf0e032",
    "body_sha256": "e3ca2cfad528c97f0f0b62bfa166f5e4a8fa8a3c319d2d13fe0585641357c0a8",
    "discrepancies_canonical_sha256": "8188d6254d9192297426b8aa2df3114b2265086ce4023988e9d33d6b98ddc970",
    "actual_signature_sha256": "18055d5b29697a5662a4e82eb6cc116193ed751e1b150159a0f3f913ec455bd4",
    "source_signature_sha256": "beb9c735d92a2c51902060951c21931edcad2dbfcdf3d803be7c5eb85656db1c",
    "provider_metadata_json_sha256": "c2be155f7613d37b354ad738f455e2c38aaceea74d152c864203b82d6ecd4d1f",
    "historical_source_row_sha256": "f8e8f9effb28aed51c790923675b3a3bad0788efcd8756dd81786940d2fbcfaa",
    "independent_selection_sha256": "6d3a491e11b35e790b4ac25e9244774879cd1c901601d83084662ad291cdb52f",
    "width": 570,
    "height": 794
  },
  "e62c4889-cd4c-4d60-83a5-46343d7ece60": {
    "alias": "009",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-9",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-9/large",
    "variant_id": "c93b1e8a-cb31-4762-a159-94226e665629",
    "finish": "normal",
    "current_native_label": "ヘラクロス",
    "original_sha256": "6ff5b333cb1b7d0e9024b4d3c3c626784bf798fcb2c9977b707d0584b69bbe9b",
    "metadata_sha256": "e2d393c20dfa8ab67bcfbc71c1c74f7813fa34e166bbe9b0a6e7199bcd1dbad7",
    "body_sha256": "6b9b5681af8ee2370fcdd34f46543de44f5a332a337245aab760ba6153b46120",
    "discrepancies_canonical_sha256": "cb80201100f913c9d9e66e24756b54952345d0ffab1e08c6d1a6ceb1a2fb08b8",
    "actual_signature_sha256": "3b1c39befb3dcfe10435bf15584c3d58b2382d53b0d7f4854848d6634d0562f0",
    "source_signature_sha256": "1f9dc4f13bbef8e6d8c846b8fb7a4091255dacaf83a97c181e54ad7bd8f725ab",
    "provider_metadata_json_sha256": "1cb079e2f5af96f2c9ea80e5f65f103ad667cae6324509cca1a5cc22a02b1ffe",
    "historical_source_row_sha256": "a3264c4bdc6860a8ae9d7cae68943806725d0e4355e516c84b2fa9eb36869398",
    "independent_selection_sha256": "a3e05ef359833a4b99a819da4074f7547a5167a2fa8ee3e983a0a3e9611e6162",
    "width": 570,
    "height": 797
  },
  "c078c5e4-b1e2-49c5-8c55-374e7ba2d90c": {
    "alias": "010",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-10",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-10/large",
    "variant_id": "91c20dcb-26a1-4635-948f-ec70db937635",
    "finish": "normal",
    "current_native_label": "軽いレディアン",
    "original_sha256": "2abf147472855cd126ea16bcbe4441ec6021e1f188abfe5064f4dfe2e6a4a5f8",
    "metadata_sha256": "295fc7b247cfe622b3394fc45bd62b32c88a7f77e76731ea23e1a33dca6a70ba",
    "body_sha256": "6635e09357ae42e8747bf8d3043339efb7857e8771519fa9a030175dc370ec47",
    "discrepancies_canonical_sha256": "fb185ff5445fc012817f9a918d841a7105e54f2dd108b25370fe9f5c0ba160b1",
    "actual_signature_sha256": "5482fe1284ef21fcc7053dc1085442a8577b582dcd20a45f0140fdb323469868",
    "source_signature_sha256": "bc63b8e1d8c51821ee970ddb66710371b194006620024e4fa27a8491ae8a5706",
    "provider_metadata_json_sha256": "125483ca6f75660ec7ce057d94fc9dcb118f0a3f015d8f4fce428416a77da9ab",
    "historical_source_row_sha256": "1ed428dc746315104014efe8dca85324e2b8716a89287b48abbbc590e956d966",
    "independent_selection_sha256": "70fb51d722af3be010e87a30fb80c2818ed70f6427e3ca11fe7f473821f6bb3d",
    "width": 570,
    "height": 797
  },
  "3f8455f6-95fa-46ab-a63b-b3df30f6c7cf": {
    "alias": "011",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-11",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-11/large",
    "variant_id": "0ec268e4-acb8-470e-af22-e67d707426cf",
    "finish": "normal",
    "current_native_label": "ダークアリアドス",
    "original_sha256": "d148b75c89d77e583494fbfd0c90d36fe45d53aa4475a5cac6cc36d8c5373e35",
    "metadata_sha256": "baabfbba128cd741010e297a493d02a0ac40ccbb0617b978c1ce3e67456cf125",
    "body_sha256": "0ecd8592a85b018734954b940f48ab4ed6c2ed2fd49c31207191f0735c5cffae",
    "discrepancies_canonical_sha256": "b5c15d9f71e61fed551599d303a0c52e50a4ee56fb233adf91c28850ef186d7d",
    "actual_signature_sha256": "eeff5dabf0785e1590aae20b778e0c1c63c1d43e772a9bb9e8328a632546987c",
    "source_signature_sha256": "18b249498bf433331c854d164ad21850150f84a45616cd180656526b2994efce",
    "provider_metadata_json_sha256": "615620a7559bf803202804f4f777dd174a611f8d2950185813421ebb341923a0",
    "historical_source_row_sha256": "91663937b5ade2eec849de7e45b3fbb89b371b0b2cab1c25b8e7e1e4a5e24c90",
    "independent_selection_sha256": "2755697343794a192336a4d7765ffc9954d52e00357596dc92a68c217628b1ab",
    "width": 567,
    "height": 800
  },
  "9e470da3-3e88-482e-9005-d1d00ac6625d": {
    "alias": "012",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-12",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-12/large",
    "variant_id": "01bdfa70-9d51-4724-8222-b3257449e4b3",
    "finish": "holo",
    "current_native_label": "暗いクロバット",
    "original_sha256": "36c3dd04efd89955e10460e0d2abc4d7099157f1543e012b22dbee0ff9f2df0c",
    "metadata_sha256": "dbd3b0b6b0c15e930de8e8dd1d15993e678aa745838ac493c08c518bd302c4a5",
    "body_sha256": "ac10e429f0b8dc5fadc7305b78e0dceefb90a4411dda2ad0aa8b1b4004212b2c",
    "discrepancies_canonical_sha256": "d9ac09acdf06eee211fd8095fe84ef1059feefb89cf9e3376a53cc3366438340",
    "actual_signature_sha256": "2101d456a689c3cb0b1428f0d1a57654019335a4e29e26fec2f7d8b5fdb5e0d5",
    "source_signature_sha256": "8fdcc648b2cef8e6810d13b3a48d8f28ffa59df1311cfc3b01a9f25ae1fc5208",
    "provider_metadata_json_sha256": "0e6bcf58c792a0af2b5366a19546ef534469d0bb10bc308743808c0a3de120c5",
    "historical_source_row_sha256": "09370ac5e2adb1f8ef075262107d54424aecb639f9cf73a55b2bf05d76bcb6ba",
    "independent_selection_sha256": "ba396487a33e8a877f817618dd42aea1f2c8927a2df13d3d0e20aee22395f6f8",
    "width": 570,
    "height": 799
  },
  "4e952bf3-ba4b-4d7e-a0fc-131104400e1b": {
    "alias": "014",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-14",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-14/large",
    "variant_id": "a87d8b1f-9dd8-49f2-b412-c4eb227947fd",
    "finish": "normal",
    "current_native_label": "Vulpix",
    "original_sha256": "44b54ed731aafe4b2c70114d186e6dba492ab756665b77687c9eb1bbdb327fce",
    "metadata_sha256": "ac991df22be42d621b5e7765e113bbcf5c8c5e9efa2b398d9473b330e08978b0",
    "body_sha256": "8ba93973297a00b0a23afaeb36d2aa32b15a14bdff571446e29c9ded16622f14",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "7d0c2158c12e144c34046781008c00dc894575ab7dc4279160de9120f203c3a3",
    "source_signature_sha256": "72ff808627d116648963dd43942c14a130d1503c9064a4a73c6490d483d8dab3",
    "provider_metadata_json_sha256": "f468fa23c2603631cd4719a5ef17b0332983cb0b5455ea0dd83921fcef8d2653",
    "historical_source_row_sha256": "12fdfa1fbfc04b05931dc10719f484e3d1cc440abea8801a5f0cebd6ccfad103",
    "independent_selection_sha256": "a17ed7cf62e2c835db719a1726f5f21e392aa717497b07ff5645661f0b7b534e",
    "width": 570,
    "height": 799
  },
  "7f296993-3bf0-4c46-9727-0cba3265f65e": {
    "alias": "015",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-15",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-15/large",
    "variant_id": "13294e59-55be-4ad6-8e66-6a776c5522e5",
    "finish": "normal",
    "current_native_label": "うなり声",
    "original_sha256": "085e73d793808016638359aea0ca6caaf3ca925b459b00628bba0fadc0e913c8",
    "metadata_sha256": "f60281906aa92533deb1c366b37e95819c4f171b2fbd8debd39919d09d9fbaaa",
    "body_sha256": "667e56a9aec4ce8c50ef433786bff9427e8d96701b6e580bbc15c053dd2c43b4",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "e449088def06a9b9927df40629dd484869157e42a7bd284f8eda8c2c2c495a49",
    "source_signature_sha256": "5d920248e91949b26856746bf4bb9e8a78c7ace1287a4934161e147af261d5f9",
    "provider_metadata_json_sha256": "5ab21a6c6d4fedc8a5a419a1384b23c7b801f6f1f666cd70d4bc89df667504bc",
    "historical_source_row_sha256": "880bb3bb2fd7040e27a931f2066489f8153abf34bf2e7be5d2a126eae653175a",
    "independent_selection_sha256": "37c4d1adb5c0d9f2a77152556835797cf22f8add801b9bc899b6429c7edccb93",
    "width": 570,
    "height": 794
  },
  "1166b814-d044-46f0-8da7-519088986500": {
    "alias": "016",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-16",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-16/large",
    "variant_id": "e91172a9-b5c6-4e7f-b2ad-2f823922e22d",
    "finish": "normal",
    "current_native_label": "シンダキル",
    "original_sha256": "d213e7284746d40da7c326ebc30b98010c30b6e36066f9a7e2fcf727e94620ee",
    "metadata_sha256": "5ce0359f0000dcc472ce72f6152df8547db94a2e511721b7d3616ee97cbab275",
    "body_sha256": "1dddd49d75099540218338abbe22d18f870b7043d41a5dcbe5a5a3be75211cde",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "5adce6ef62e037109ef3d4aecdd15a90ba2cfafc34db64d060f48b0fa63f47ab",
    "source_signature_sha256": "1776e2fa6019abf626ebc6a2106756b6658fe424a711e4fdd81e329503446197",
    "provider_metadata_json_sha256": "4c63a999f1ea662da9408a4ebdd3903955da1772b7f817e3bc320e9b9b181e9b",
    "historical_source_row_sha256": "633099c53d35aa5dda76f682f2aec30bb59819ca2518947c72cbcca41f9f60c0",
    "independent_selection_sha256": "66fb3eb3b3526642a8daf805bb148d36acbd345f054e4a30770ddbfd780d4314",
    "width": 567,
    "height": 800
  },
  "090007c7-1ed6-4e71-bf4c-a74b25f04243": {
    "alias": "017",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-17",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-17/large",
    "variant_id": "ac31282d-b3ec-4b7e-b3e3-c56d9df970ab",
    "finish": "normal",
    "current_native_label": "slugma",
    "original_sha256": "82420a3561676649beea6ac6d09e615d37d6954a3c51e511e0a208b2fd9c653e",
    "metadata_sha256": "b6321248bbce5fac1b1ab92484acd99dc6e299c216c8294fe60a29ede3354699",
    "body_sha256": "a0fdc42c0db6c518fc4cd933219fd1d7ccd33ed2e594ba0ad07973949d12f881",
    "discrepancies_canonical_sha256": "fac224ca07fc3b4720c5f501a74ebeb848c722eca837629214e30daa07495d30",
    "actual_signature_sha256": "e5d339c785feb89f2d8bda582e637849ecf959c18491881e08f4442d128cfecb",
    "source_signature_sha256": "5c11adb8852045bd91d45af77a6bb9d5feb0e3c8f4636c8aad2d16ee725c10bc",
    "provider_metadata_json_sha256": "207a4be5a478f6b5fec188295ed7b37ee7d34cfece8723edcd7295cb37fdca08",
    "historical_source_row_sha256": "7e734933912b8e2df7efbb4b54ef8f999bd5edf6a29bd0139b0e89707917889a",
    "independent_selection_sha256": "b70e78c1b45e62ea32781abb652fffff1e75020e321b59d6e0a25f3b09569e0d",
    "width": 570,
    "height": 797
  },
  "689bf5ed-55be-4d96-b9f1-1f72a7501f11": {
    "alias": "018",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-18",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-18/large",
    "variant_id": "8b301198-6022-4084-8d01-8fbeb4abc022",
    "finish": "normal",
    "current_native_label": "軽いニネタール",
    "original_sha256": "1ab1abe1bef34040594874eebd47952d144788b67ed936312da8ad94a7e34076",
    "metadata_sha256": "96c21a6b87e62a7832141f38af6ebfc57404195e25d05f3678919dd9c657df2d",
    "body_sha256": "4b5ce817babc72731cb3c1fb72cce196db5ea7a0a17f17eb3daecd18094c1047",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "b6a715d457942744b5a332ca693265aaa48f8333abf5fc86bcbf21ed034ea6f9",
    "source_signature_sha256": "ea5d41e216c2da7b776c348b8bf20d8122282d1f3a78a58afcf2abe3a40333fe",
    "provider_metadata_json_sha256": "9c49fc57a421cb98bac8bc6d3b9395866fd6d65d63e130c3dc0656d1a084d635",
    "historical_source_row_sha256": "7cc18dbf233077745aa4e4c4fcf036d65e6d5f1c0277984118bf0d62b34c8eca",
    "independent_selection_sha256": "7a1284bddd03ad477185af61d9b9eb289f3dfdaf0797b74b8f25cc1ae7bf0170",
    "width": 569,
    "height": 800
  },
  "538357cf-0bb9-4c67-a4cf-323d277cf8ed": {
    "alias": "019",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-19",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-19/large",
    "variant_id": "924dd590-f060-400c-83ab-c0c0c6a4d8c1",
    "finish": "normal",
    "current_native_label": "軽いフレアロン",
    "original_sha256": "296d5718566a078d27307ed615782b6e61e2c18337cc73fb3f9da8d7e27c269d",
    "metadata_sha256": "ae120330f1615d59cd99569084ffa80be240893752ca2de2708c461f6af806be",
    "body_sha256": "c2398542e02fb23b45b6c8941a0a051b5265c89048d3414517b6f6f2baf39818",
    "discrepancies_canonical_sha256": "ff472534ecb34911b2344e27f6ec6e0505d4a2a0336ad5d197136cdfe342bb2e",
    "actual_signature_sha256": "a38ade154940165be7bab0e1ed13f9580dd7b3232c890836f39da19092c0a985",
    "source_signature_sha256": "ed7367e6cf2250fd59a5ff1f55f2fe7d7c134af4583db16cedee8d9cdc9cd411",
    "provider_metadata_json_sha256": "f85bec99fa3b1238f2074302f59c97148abd79a12ec96fdc931ce1743dbf69fa",
    "historical_source_row_sha256": "5d24787efc30f13a9aaea873a758dcb634828a860dc89948381c2f51290bf9ec",
    "independent_selection_sha256": "11330f29848c1bd1ee21d19e042e73c274b265e63b003ae5ad321e026a2a2d74",
    "width": 569,
    "height": 800
  },
  "970bdd85-231f-489f-8c4f-c2a54eb29c9b": {
    "alias": "020",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-20",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-20/large",
    "variant_id": "53c7b08f-9397-494e-91e1-d22efd38be44",
    "finish": "normal",
    "current_native_label": "ダークキラバ",
    "original_sha256": "cf2b9a95ba9bcae0f826cdb43973bb74893b812dede3ab68b72f0892a9ecbf04",
    "metadata_sha256": "77cde4a4490467d47f12b4b2e8c78f339cc38731b8f7aee6f1af0910f1dee01e",
    "body_sha256": "ceb8dccd9e441b352585fd7cea6fa7d5c2a116699b4b5b4f3d01e348aa74de94",
    "discrepancies_canonical_sha256": "4ec25d6dc0c41a8bc40e66e284efe6f7be1245aa9251fbfb79bd8c2344f24060",
    "actual_signature_sha256": "d7f54238343cc3e706b88b539cda20bb04e9c232bcaf165590867d17d815872d",
    "source_signature_sha256": "fe293b33a14b1a757881e1478fa5959cfbe3beabb44294bf52d250ab1d3748ec",
    "provider_metadata_json_sha256": "0855d79371cb95146d71dcb688c9092f9069120e512b97a6385a60cada880390",
    "historical_source_row_sha256": "6ab991f5f4f1ab0c1991791d2b37aa08a2ed534cc1296e63be8b22eb7c550a0e",
    "independent_selection_sha256": "e26b47f4ac87b92a03ba1f34036fba187672c4a56e26e4dc0e5426069de40876",
    "width": 569,
    "height": 800
  },
  "42a3c006-8cd1-47ef-a3a4-32b6af16a9e9": {
    "alias": "021",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-21",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-21/large",
    "variant_id": "7ec23321-f4ff-4845-b3bd-ecaf1600539a",
    "finish": "holo",
    "current_native_label": "軽アルカニン",
    "original_sha256": "55f59d8f547bbdbc7cb5dd91371492a15d728bec47b23c9b20acbe041c397c75",
    "metadata_sha256": "b97f2c3260b19951855797ceb4e8111f293adf4f82a404d7fec8092dbf2c1038",
    "body_sha256": "5d671c3bab9b2cbebe93d44292cd54dd3f106abe947afaa4284f2785cba97906",
    "discrepancies_canonical_sha256": "d1a815d989b465df9525aff412a3d4ecf433e61b299fafd3d85b80f835c2dd17",
    "actual_signature_sha256": "e24082b927734fcb8e006214c87b698c3d52d7bc0ade8cc08962221791752878",
    "source_signature_sha256": "557fe5b7539b29eb675f58e132e03c8f451050a09fbe23f3c7e8d89b1fe6fb5d",
    "provider_metadata_json_sha256": "ca6c550eade742673b354aaf5d87fa4ba8dde5802f3784056e88380ae50dd841",
    "historical_source_row_sha256": "18bc6923d49187be1b500271de6ff98e2da6d022b7a89fc1c451e9ccc24e04e5",
    "independent_selection_sha256": "f77df8d81508df2c89067c830fe079d7feb7a71dc4f6d999db693efee6e013c8",
    "width": 565,
    "height": 800
  },
  "7e236e5b-152b-4d5e-bdad-d4f61e3dff86": {
    "alias": "022",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-22",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-22/large",
    "variant_id": "112b7f6f-4aa3-4762-b77a-21f281778188",
    "finish": "holo",
    "current_native_label": "暗い染色",
    "original_sha256": "c60043c91a66ec6390c5040731a22c43d3de8352dbffe168d295da546452d597",
    "metadata_sha256": "b3fdc060f931f8fb00f3a20c4808fad83d3d3ef6f506863bf2957eebf28a2a87",
    "body_sha256": "32f1198d1f6c510aa261c63c704df45a5713c5c89cbb3e2c4dcb4e0df4aa0763",
    "discrepancies_canonical_sha256": "a9e47b6014633dfbe88c59fb0b238ffb01eea3fdb13d7ef3419a24c5d509a1b9",
    "actual_signature_sha256": "a442747555becab4ee841a2aa81824479dc7519084acb0c054ef657de9801c6a",
    "source_signature_sha256": "fa34f6d07bf9b28e61abb80f90335853f0b2775b437239baf3ef0be43e56bf07",
    "provider_metadata_json_sha256": "fcad9c54235665a2cc98aff2a31fde813e681be31161576416a051d36394efbd",
    "historical_source_row_sha256": "79c5604189206a1b45259138c4f227c771041de36a03cb37e0a4a5587d2e93f9",
    "independent_selection_sha256": "dd8e4dbccc00b4bd2512455f221e8ef36b2c7ffa22ae901ee3ac4fbb00c3775b",
    "width": 570,
    "height": 770
  },
  "6fb10223-3c74-4a2c-a846-ef4ebca07048": {
    "alias": "023",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-23",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-23/large",
    "variant_id": "dd97a97c-a1d7-4879-8bbc-d3dc5d01a765",
    "finish": "normal",
    "current_native_label": "ダークマグカルゴ",
    "original_sha256": "acc32e156045b0198db995b54067278cc468a03460c9457990d9fb6909c035e0",
    "metadata_sha256": "02e0fbdea97a5b0083b7f3943c8db33658857fb49c8b9b8e6e761e0e3b3ebbaf",
    "body_sha256": "ba9d3776ad4c48a1c7cc3b9cd05352a00f2396617d0d82610905a5838c127329",
    "discrepancies_canonical_sha256": "bad4066422b6c40c077ca9618031c8fdb3e8d7b6597fcddef9f1adb1cfcafcc6",
    "actual_signature_sha256": "f9f6f379f7a6a7a7548fe3f864010f28e7dcfbd74d2c41273584200186baaeae",
    "source_signature_sha256": "de1e84cc6277c86559ec26e8c8502d82ba8439d90d8d796c26fe456a64b6bc1f",
    "provider_metadata_json_sha256": "8bc54cafab1fc1c2a160e43c190831a324fd7ce44241bd71fd2647c599487b89",
    "historical_source_row_sha256": "dd0c48b333b2f8c20fdb3e1642f43eabee7d97b83bc28a8f406c055717bacb98",
    "independent_selection_sha256": "667e041d02e62a771dd273b497141b590ec8ea7faf7f48dd73d42143aae6314c",
    "width": 570,
    "height": 799
  },
  "22b4ef22-b503-4327-a6ee-16b72b5d9356": {
    "alias": "026",
    "batch_id": "JP-CARDS-013",
    "provider": "neo4_ja-26",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-26/large",
    "variant_id": "a3237d0b-0ec6-4e5b-9038-65fc3d1642d4",
    "finish": "normal",
    "current_native_label": "Psyduck",
    "original_sha256": "faa99f56b7d50cfeafe758086b5354870116ab05cecca74e85cd83231a815875",
    "metadata_sha256": "29c457442780fe84e462edc784879f1d7af14e3b99be59474e0cfc6d1968eb05",
    "body_sha256": "5e486d14ae53236a063b74ae8f8b9ebcb3e6801e6334aa5fe7ed65a2edafa83a",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "4823d1c5a9d90fdb5712860020934020dd8de15f6fc5a901c7980bde9f2763c3",
    "source_signature_sha256": "6545801fb5ae1e242efb1d913776575ebf80340ae206d1383f70bdf8c1a9927a",
    "provider_metadata_json_sha256": "5f165074045b236d32ce878ba8a1c133a36eaf8f9cdae4d25849e76bc4cd777f",
    "historical_source_row_sha256": "788e2e3fa0031e9e1bdb688f9540c4dd24c2bbed8122215fadd4d59107d0b4d0",
    "independent_selection_sha256": "a9798ab288a9837670ada12b9eacad7459db6f8492ba19640e12f466c25600a0",
    "width": 570,
    "height": 799
  },
  "005a529a-5e60-4c2c-a560-766c0daf11b9": {
    "alias": "027",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-27",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-27/large",
    "variant_id": "d42f4194-5fc2-4cfb-b331-f016c2bf6637",
    "finish": "normal",
    "current_native_label": "シール",
    "original_sha256": "a2613db3de6935c51e9fee637ced4e20265a056047cb8f207b348a18aebcb8bf",
    "metadata_sha256": "dae68bd3e013820284e11f2b4279d1e7fdc2df902528e92db955f4ce8982b55a",
    "body_sha256": "3e344efe934d173c20aedf9001c0a5bc5edb0c08b61b9a21077f6e2a5d59214f",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "909fc970dabb5682fcdc0bf69f20b919e88c740ce420d208a2399a24a9d19f2e",
    "source_signature_sha256": "25bb11be2030270a3adeaba4e0446c50592b7ef1b513e1c252323ad8bede0e08",
    "provider_metadata_json_sha256": "2c3be0320c7d53626700ec29b6c1471379c42aaf88d4ae1d9e6f6bde40200f3e",
    "historical_source_row_sha256": "4246bab2a0e6baed5984b92338a87198eb5dec9b032bf5d63a08f67f6b0ff0c9",
    "independent_selection_sha256": "82a21d4cba5a6ed0ef5437c0994cf3af2e7df64d2593188de96ff26b91d69174",
    "width": 564,
    "height": 800
  },
  "0832e342-c95e-4cc9-9d4c-3606b934ae4e": {
    "alias": "028",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-28",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-28/large",
    "variant_id": "506ff145-b92b-4201-b18f-a1693b3febe0",
    "finish": "normal",
    "current_native_label": "totodile",
    "original_sha256": "5b1d0a979787b645bb122f07a7cfdc50fef8ac57694cfc1d62e485a1de642d59",
    "metadata_sha256": "f6932b2227f5dd733959313b56116478958f18a3d0a1dcf7b596314f9873fd4a",
    "body_sha256": "a1c2c1308f041320c38262e68e134a34d2fe2a51673e4970d71141f5bb8cba91",
    "discrepancies_canonical_sha256": "8d979204821d5f4f2defb07aeb25f49138ad11cdc1b1dfcd8c6fa099335639b3",
    "actual_signature_sha256": "8b908cacbe9ddf0720695a8998d59436016ebb94b00be5dbf529d40bb0191bdf",
    "source_signature_sha256": "336eb3f660a71dc22a985a1a3859627a6f11f64a04f73bd054216eb1daf81ca0",
    "provider_metadata_json_sha256": "d62d33937f6fa53ebe675eab8af3eb6f3a6c2ac79eae3e2eb77e10743b8deb7d",
    "historical_source_row_sha256": "fb4df22e4b5509033ac5c0e1a40ecced18b7904d132752fd282bcadd5f2eb623",
    "independent_selection_sha256": "3d34d55c0930dd0bbf85a84fd49ed42ee38efc2e387d345d5c164ac61d19e08c",
    "width": 570,
    "height": 799
  },
  "458d3d55-e818-4083-a7ac-0b8f27a75faf": {
    "alias": "029",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-29",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-29/large",
    "variant_id": "f7d93577-085f-4547-8899-148418cf0c27",
    "finish": "normal",
    "current_native_label": "swinub",
    "original_sha256": "7eab48b2871335e5983eb4a707ed2f858ec3d56983c8d4b8ab238d5d0a7bae2f",
    "metadata_sha256": "66d06e9ea4e1925f59c716a1769a1b87848e46e8f5a66b17c231336535fd0717",
    "body_sha256": "d2117953a57e1a9183ceb617fd22148fa2ce13b03f1e6db3d642370cc614ab5c",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "908eba461eb5c5283f146391715223265628b019c5af6957b85bb5da1cd4fea7",
    "source_signature_sha256": "a5f642a897676930644114bdeaad5ac6190e43b2a77f4aa46ef713da45971fdc",
    "provider_metadata_json_sha256": "124b92efbcf3046d49193670bca5e5b902be1cea7313d34f90150abfad3f5a48",
    "historical_source_row_sha256": "c270293788071b834c3ca71040ad4da4a47c5c40600ff1dec1bf0c50fb4d376c",
    "independent_selection_sha256": "534ee53f415dcdfba13f7e6ac6f1ecbe5410e8e0803feca96c184c20eefab1d6",
    "width": 570,
    "height": 797
  },
  "f531d624-bd5e-4ffc-b853-d3a5a8a8b876": {
    "alias": "030",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-30",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-30/large",
    "variant_id": "0cad5176-3962-4d22-8437-e4df7cba14f8",
    "finish": "normal",
    "current_native_label": "REMORAID",
    "original_sha256": "90e693278bd38285336f6167d1a60dc58b9f189c6375f0c505607d779195c3b9",
    "metadata_sha256": "48096d96373d677e4b2c541b7d0447b7e08455052fbab8167275bb8bb346cf53",
    "body_sha256": "a174adf6e627b07ba310c9c90b2ab875b66f3c822520495ebc054ac12d731342",
    "discrepancies_canonical_sha256": "86a916331f6674b0da139d5797862f9e19d834a3de8a92647c56468a2a17ec68",
    "actual_signature_sha256": "59c969d1cb55defabfbd2405db5995ccd1843bfdf4436a8ebb8ec56a9f8a4f23",
    "source_signature_sha256": "26f25da4a08ca5f92895e3cad4a61a29774bafcbcf106a2b735709878d748245",
    "provider_metadata_json_sha256": "0cbcd584d763b550fbbb5e611e6884d6819384eba8b77b6d444550ab714e0e5e",
    "historical_source_row_sha256": "a268d87140137e44061db3ab1279913c2e4de06a95040ce123093f2d4a4538ea",
    "independent_selection_sha256": "f109fc8878b5ba6a7efe370ead17dcb40e501f254c5ec29e25e26ee1c938e299",
    "width": 570,
    "height": 794
  },
  "50b54a70-567a-444a-8426-6e5d3a9aec6e": {
    "alias": "031",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-31",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-31/large",
    "variant_id": "90011735-345b-43f9-9c5a-eb2a2d5b8ccf",
    "finish": "normal",
    "current_native_label": "マンティン",
    "original_sha256": "71a3fe49019c27fa2b7bb750c26123bc7fe696c96ce5d0e09f055ab13fcfb096",
    "metadata_sha256": "2b7ecbe0185dc38836ec6914e19630ae39e52995777e373c5b868890828256e2",
    "body_sha256": "cda84f56754d7b2dfe866b5ff02342f83be07db81102fc193a4c338ac5ed9c81",
    "discrepancies_canonical_sha256": "7a33c897330e2c376f1e3cdbe6208f24fa5352144750021af4723ec1b79caa01",
    "actual_signature_sha256": "79c28ae4e50eb77c5df2e6382d4d7e70196ea233e027c7177c0316bfdcebeb64",
    "source_signature_sha256": "bfc3403ed80f40e19a4715ed6abe0e3850edf27669c4ab005faef77456859183",
    "provider_metadata_json_sha256": "c290584a04df7d5aa8e115f9bb89233c6c2038a329e3111d448b826607ce7eee",
    "historical_source_row_sha256": "fab64d834d7a3e216125c0e5ccf2638ff8c07fdf574f4e1131164f6e389de1cd",
    "independent_selection_sha256": "dc6f19cb72a644307fb7a637429f6bc94da5a12101f5c6fffc37fe76aa896fe4",
    "width": 570,
    "height": 797
  },
  "f96a32eb-3f5d-4413-931d-fa21579e5f87": {
    "alias": "032",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-32",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-32/large",
    "variant_id": "8d2f4570-859d-4572-8392-b7213d5e6f83",
    "finish": "normal",
    "current_native_label": "ライトゴルダック",
    "original_sha256": "9c24a0401f36ec03aed7e4be8f41936d5aeac7c6500516ca7497af9da60454db",
    "metadata_sha256": "cb30d660df23af102c780219d88f502611c15464e887de253ce289fe4aff1dc5",
    "body_sha256": "3e9eb6d0cef648b966df2c8c906c95f4ac17a038e360edaf757b5fb35a6a052e",
    "discrepancies_canonical_sha256": "85972baa400878c79b5524ea0cc94c56475d12f3bd1adffb70c9d3353f15c8f6",
    "actual_signature_sha256": "1b895aebea7076bd52583886a8579eae531fea619c95c52ed9c11e3096d18e8f",
    "source_signature_sha256": "04eacfdaa1d50fad7f177c6c0431ee0c77f144d4d4cecd285c8a8bad2eee807e",
    "provider_metadata_json_sha256": "ce127fd368bcedba7e675689030b96dbf84f4f82fc07f92b87c6650778220c4d",
    "historical_source_row_sha256": "d15b21be0b6cd94a629381c7525534e111e82e4471238fa24d69a1b3b5d49d71",
    "independent_selection_sha256": "8a8cec37bd889a71a63b8e95b1b32a8d246f4cdecd6c6b6f7f6ac445d7e165b4",
    "width": 567,
    "height": 800
  },
  "5b8b91ea-7a2d-441a-ac5b-94539b2c2294": {
    "alias": "033",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-33",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-33/large",
    "variant_id": "600e113d-2513-4610-8b69-162ea0e056e8",
    "finish": "normal",
    "current_native_label": "軽いデューゴン",
    "original_sha256": "5c9bdd9ddf226f0aa8ee7dc7c7a0841354871e889ef1c79850b595bce8e3d2cb",
    "metadata_sha256": "1e9a7d73f822552756827cb5a283fbfb2b68ec8c0ab0c9f1e79dd0cb4c67ef89",
    "body_sha256": "da1f8c59ae991e51a59e51dde3424205de6f5af604c411cefc77b88e5f8df54e",
    "discrepancies_canonical_sha256": "77046b3cb9149368a198581a76d50ae3d0dbbaab170cf20b22e5491278c513db",
    "actual_signature_sha256": "dcdd5be38818c1749ad8f4ddd3e190abedff157e1116058c045db7aa0fc3c4d7",
    "source_signature_sha256": "353a6d37b78d78d575d86d790c504b52c35f6714c6ab3b09e2cf43a5aba54d3a",
    "provider_metadata_json_sha256": "dc1af624a881ccaf56066b565938b0ad3421851c0bb051aad4c68d11813c46a0",
    "historical_source_row_sha256": "d593884706f7ac6619a9ce88828422865a42230f0b9ec4892e780baff6a94e7d",
    "independent_selection_sha256": "920e26d235360537cb3c1f7dcb1f1381986eab8d5ac42b46ad1f2538d2425584",
    "width": 570,
    "height": 799
  },
  "3c145bdb-4d72-4fee-a117-d94a70ccf140": {
    "alias": "034",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-34",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-34/large",
    "variant_id": "463f77e1-4e1c-4287-9789-ef3d4ca507a3",
    "finish": "normal",
    "current_native_label": "軽いvaporeon",
    "original_sha256": "9aea86b2853162592386e38a2168c5962939d4e1599623170f8724d1ffaedde2",
    "metadata_sha256": "86cee648dae753a11ec68d354160921e26fe7fe077c33aa56e10c774ce344cfe",
    "body_sha256": "6a098594d6a7abf715bf293488cc01440bcf9ca74638d3c0fb3d6182f7bea82d",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "ea920688c3d8e4d89b43380fca877a558fdf2b020d527100598cc9c12ab7106b",
    "source_signature_sha256": "d6db0ab9abe0ac71a089d972071f9ac6abfae5f2295063eaef866bd4ac53a92c",
    "provider_metadata_json_sha256": "709ffc63b28f1a6692745b8b7e92da4bf78210f8397450d61f17b92b7984642b",
    "historical_source_row_sha256": "60a89898625e1f1375a020f87653c0b902729902d67970aa5055420835b6c897",
    "independent_selection_sha256": "9bdcd3b1adb1573c72bf0b21b4d882cb009d50e1d5c787c248c4be93178619c0",
    "width": 567,
    "height": 800
  },
  "f3ad0b96-5525-46a8-bac9-0ac187f66d4e": {
    "alias": "035",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-35",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-35/large",
    "variant_id": "032211a5-9f3b-4be4-9b8a-55e13941a82e",
    "finish": "normal",
    "current_native_label": "暗いオマニテ",
    "original_sha256": "410f5b869b4ba83180e1ac809dfc9867aa0d9ff5d2d36f8c9c8933564d23dcc8",
    "metadata_sha256": "9b006878cd2b9e468d40ca3f012c78081e718d695c63887bbb8ff8989efce72a",
    "body_sha256": "8d213e56013a4166ff58e99cf2ac9992c4032538eb01e5ff134de26e868a4663",
    "discrepancies_canonical_sha256": "11db5d93e0150b50d3b9e1fb71937d9bd78f3cb43fcb2728a3b4f6c3a3e65909",
    "actual_signature_sha256": "2c97d0236049494781ad58281649f31be8e730713b0e729e13c1c788c93dcd4d",
    "source_signature_sha256": "8bebe17bef4eaa8069b1238d5d159ef9ae285ef69f61d12abe904db50ed81c03",
    "provider_metadata_json_sha256": "1c2e90404bfd75df005c4d6cdeceb3708121d55f6339102ca6fba00735c6b14f",
    "historical_source_row_sha256": "ebe19f6af1ecc300dd99c4ed8ce362c56328c1c4104db53fda4e512fbf08141d",
    "independent_selection_sha256": "3b8bb831fb50bbe733bfa40bcb7f714c7fae3d1ec3bf8b337f32ed52db882a6d",
    "width": 570,
    "height": 799
  },
  "2994a221-7c66-4864-b25a-2c5bd57ebaa2": {
    "alias": "036",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-36",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-36/large",
    "variant_id": "ba52d81a-b59c-4f2a-8a05-79b98549ae8f",
    "finish": "normal",
    "current_native_label": "暗いワニ",
    "original_sha256": "8e95cee98f542116eeada30b6828e36d1ecc171c990ae089bf73d183c833cdcb",
    "metadata_sha256": "feb49b9fc196bcc858ccbdf215e8e8011f4e52c083f6ca75281a9b24b09e67d9",
    "body_sha256": "69eb15853058d6d5ab12ea7fcb75b5eff1bbb6441524cd72f14e09b4607ff3fe",
    "discrepancies_canonical_sha256": "3d31d049d6f3031ae8da925ed5c0808de988e8422a8e5f9883169e8f736e1f91",
    "actual_signature_sha256": "8281270815b789dd0770cc8299c40a44a7f95a083ffca49cb5eca33758a0e72b",
    "source_signature_sha256": "556a01104300a1de5497844d65eaa377240c88a265adad6fdfdf2c994e2d5e83",
    "provider_metadata_json_sha256": "94db71d0341a6bbcb04f650f94e88a3fc9154ee35661e82664c85a552aad61cf",
    "historical_source_row_sha256": "85a186ebd31c381d1f87589a485a18e1fdcac980a1400941b43d12e27aa4fd4b",
    "independent_selection_sha256": "5f06af58a2f7b35af98e70696ea0fa14eba0533a0ba01db65430256aa705e0ee",
    "width": 570,
    "height": 797
  },
  "65cc248d-f447-4153-aee6-5c52b1926a26": {
    "alias": "037",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-37",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-37/large",
    "variant_id": "95f57aec-7f4c-4468-95e1-757488c19340",
    "finish": "normal",
    "current_native_label": "ダークオクタリリー",
    "original_sha256": "bfc9bbb91f31bb4a655008f809ed645a229f3e88454c5fa55ebcb1fb59379b3f",
    "metadata_sha256": "f9c8edd19f8b4c446228ea1796b40dcb31a2114ced927e81314d656df962ed5a",
    "body_sha256": "4354a6b2e9b4a2a5d3f795ce1b064e54e084d8ced1182bed073d0c9e9b8b459b",
    "discrepancies_canonical_sha256": "2cf4b5208f54f1224062bbd78935a49aa5a7387dd7e952d269f2acb64e853c93",
    "actual_signature_sha256": "c221d81820f45313d8c68a62306502f3a9cb6e71b1f63a90d23ab8fa1d10ea8c",
    "source_signature_sha256": "651c12a625b7d6ab434fff7dd7be74cf64ff09ffd0b84acc5fdd3a18f26ea29c",
    "provider_metadata_json_sha256": "74c60919aa6f7892b07eae41d6d55988877a3ae15b5728738b4b4aaaf3c339ff",
    "historical_source_row_sha256": "8c10b1a9752941b748db73a33717b5ad029f6261601b37b2c8e290902cd9cd20",
    "independent_selection_sha256": "a045f0ddb52f33dc2c78cf40f43835f55304aab83f9e73d65782a7280b529d94",
    "width": 562,
    "height": 800
  },
  "1b0ba070-2d3d-4e23-9786-0b7a7571564f": {
    "alias": "038",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-38",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-38/large",
    "variant_id": "ee67a479-fef1-4502-a410-af5ca418a150",
    "finish": "normal",
    "current_native_label": "ダークオマスター",
    "original_sha256": "3a0cabd86bf8bb9bfbdfbc14b7b86171220cb0af50ec5c91e3dce1811da60d6f",
    "metadata_sha256": "23266532d9d27af7888d20c2f4b0380e894a887416cf45b91582ac9a7e3e66a9",
    "body_sha256": "a5e636fc5906eec3bc6c344b0738dd2c64b3ba965875c669d1be85d50cf04642",
    "discrepancies_canonical_sha256": "17ac7ddb89d5c5d1c946d9f26cb84f0998f12ef478b549f6b784b7a80c0ca340",
    "actual_signature_sha256": "4b5b025fde50a570886bb91b95ae22b1d3281f90be374f90b1e26ad9780e3186",
    "source_signature_sha256": "03ed623fac4fd32a7f5c26c5b091444c5656b24dfce21dbf2402684819d3f087",
    "provider_metadata_json_sha256": "f7c492d39d595f7c4db96bf2b45ed68deddd93a5d1438dd3903eb2fdf30265ca",
    "historical_source_row_sha256": "00fc6acbcfaea817604b32afae6decf93193ff01141a22c72179e3653d9d381e",
    "independent_selection_sha256": "87949581483f1fd84f68f05d5c2eace1c8df473436b921ab1758b72be733169a",
    "width": 565,
    "height": 800
  },
  "ba36fcd5-fa76-4851-96d4-0895458f7b2b": {
    "alias": "039",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-39",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-39/large",
    "variant_id": "e500c6c0-ac3d-48d5-88ac-a5da896aa1ed",
    "finish": "holo",
    "current_native_label": "暗いferaligatr",
    "original_sha256": "15ed22725db3c8818de7cc271d4d798a026e00038587a33591d9370f21b35f01",
    "metadata_sha256": "8d3028819334a3515b4dc43369eb88e00a6a0f99fd2e645442b80f72911c3161",
    "body_sha256": "fb996679a9df9e8baa9a201a6c533332582a50ec5d993cdc4f3e2fe88d540998",
    "discrepancies_canonical_sha256": "7344beff3f3098fc617b35a7f1b01e082216c1441c645e1e5faf75bd2cee2fe9",
    "actual_signature_sha256": "05d82b0854d086a50d58b8a9d53ae997c4784b7053b8448d978ac0eab0ed8a0a",
    "source_signature_sha256": "75f1fc437f91e1921e9e30f4cb009235530080c03b90c894b480d6cf1b682d6f",
    "provider_metadata_json_sha256": "89d4f91f36b98750fbbdf086a797f738c22472ede2bab3ba528184352936731b",
    "historical_source_row_sha256": "95f436d4a2eebeb088235cb774cd2de5cb56a19db4faba7bbeb5d3dc321f408e",
    "independent_selection_sha256": "92f13388ed55d94931a6a4ca63a3de65f5dd7f933e2f23d6bde965d4333aaeda",
    "width": 570,
    "height": 794
  },
  "4ca2215c-8a70-4b02-baeb-4e817b02cba8": {
    "alias": "040",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-40",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-40/large",
    "variant_id": "43b52997-01a2-4413-b983-66becbeec1b9",
    "finish": "holo",
    "current_native_label": "軽いアズマリル",
    "original_sha256": "f5ebde6ce76c30259872b4ad24067b7514d9739608d8e95410980c850abff352",
    "metadata_sha256": "d8056d9a23a3a73930ae43ba9f5f8c4516e501e6910c7630bc51d44238b08c59",
    "body_sha256": "9333609aa0c32796c2fbf96e793b7c2c573f52fc2d7e4f0c0d3725de309e2b6c",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "3e6af9c01177d4acf5d74495aa4fa8e0b2c31c96d6c52d95663379f0fcc97bdc",
    "source_signature_sha256": "78554c7580e799a926d835a8f7b9d70a2ff8023811e81e84f11a1fae2c3a97c0",
    "provider_metadata_json_sha256": "a048f82a42c55c22f8bd094c4220ed120443d284ceb9de8d73270e61e0afb423",
    "historical_source_row_sha256": "bd9761f85c4a6c7688e20ea7f1fe118364572d41d628b99ff9fe9bcf391f4f53",
    "independent_selection_sha256": "132e5fbf4159cc01333c710ee19f293e7cfed560d9ccf487111029c4a4c84cbf",
    "width": 569,
    "height": 800
  },
  "13bb100d-8053-4544-9a45-2714644c7d92": {
    "alias": "041",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-41",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-41/large",
    "variant_id": "477efbc7-176e-4097-9acd-48b6625ce83f",
    "finish": "normal",
    "current_native_label": "軽いピロスワイン",
    "original_sha256": "782673fa9fb38b63b266dc9f8c4bce76edf8098183291404db05b01bf13be318",
    "metadata_sha256": "f8a5bf7239c90e08d094fbfc56bc91f2c555a6368c15f24679a762e029d3ac59",
    "body_sha256": "4b64eefb6eef7b99903a9152609ed1700db60879918283b6bbda5396c2ba2111",
    "discrepancies_canonical_sha256": "ef920ede3c040b85deed0b91cc760b8bb6f9b6f985cd754fdbfc48920a018954",
    "actual_signature_sha256": "594535ca173ddfbe906b5f4ce03ad9dc0a53ff9ccf0795a24e271fb7ee7b43d4",
    "source_signature_sha256": "cdbff098d3642ee74e7f2a55508a48b2db01a83f1ea0fbb82e6ba64496d601b2",
    "provider_metadata_json_sha256": "ae4568d9a101bafe457ade91e4078ced13215d576f54117fba22a6cea7c31edb",
    "historical_source_row_sha256": "f9cd78da120fc230d59447049b23021dc4b1004c7d77fe18f4da55aad7797762",
    "independent_selection_sha256": "80e629ab0ff3d650ef5bc0268e137b779807da55385b149b5e25758e770aecb0",
    "width": 567,
    "height": 800
  },
  "5d33fbeb-2e77-4c62-9da9-20b44d948979": {
    "alias": "042",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-42",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-42/large",
    "variant_id": "f053371e-f2b3-4c9f-9add-3da7e366f0a8",
    "finish": "normal",
    "current_native_label": "Mareep",
    "original_sha256": "8c00e361fa93e0ebd8ee52e86f5eca018335b9f4e137585d52fca145b5358656",
    "metadata_sha256": "353accccd06da53fcfcb7bfab3644d7b1975133591d87eaf7c7888fb1c0d6ea9",
    "body_sha256": "0c99bdd17da832934e514dca99c1a6e9b9d36d52dc6f5354cb18e46e36900925",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "8bd937b523046f54f511efce133a32e900aa7df011af1dea9e78fabe4c5044bb",
    "source_signature_sha256": "bb238cce6146349a898c79d561ae00c276ce207be5ad4de58690edba8e6153d9",
    "provider_metadata_json_sha256": "73af5c960e6d37117b61635d06e2e5f6ae8b14e9116e4ddf47e0df198f6d1953",
    "historical_source_row_sha256": "e542fe3f75dec64c5ba68944dc0aedc0a36d58bc9165d77b1dc5ab06b012894c",
    "independent_selection_sha256": "0b033c267b348b0771f022c06769e2f9f7c69b486523b5bd478fda8aee8101f1",
    "width": 570,
    "height": 797
  },
  "566f12a7-3648-4b91-953d-7f70bfa3054f": {
    "alias": "043",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-43",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-43/large",
    "variant_id": "27ced3a5-9824-45ef-89e6-189e3552d7de",
    "finish": "normal",
    "current_native_label": "ライトジョルテオン",
    "original_sha256": "0ae681d2221eac36d6e73a502ea15fdb3e7a0655bf1ffa284fd0ae3cf377735c",
    "metadata_sha256": "4c013748351a794e0132f2dc45473300795c0d47e16064c6029ffe5b8e87aac2",
    "body_sha256": "9ec79ab4b81272fa8a5ddfdc762b0e2528ee1341fbe789cc9de02fbd48c0a9d1",
    "discrepancies_canonical_sha256": "8f387c783fa31172861a4f255d1d06f28038a088a462ad8b9c8deccab473c35b",
    "actual_signature_sha256": "d00bd83eb0b42c792627a3b3b7526bafb774866bb2922e64a7dceabb75dd5c99",
    "source_signature_sha256": "6fa9a25db061c294503928dff0a59326c0a001ad0cef928021eaf3e44a31be6f",
    "provider_metadata_json_sha256": "7ebac0274ebb52b69f43e82b0bb173f67f1c102b189dcbeb263f5e86ded5c1ed",
    "historical_source_row_sha256": "e637a0124f42bf630125a43223233b47fe281f91aef8b75418c0a15e8e4d13b6",
    "independent_selection_sha256": "1e3186514bea62e36ded6ab13db14450f23722242b9b15b737630a2aadd5e240",
    "width": 570,
    "height": 799
  },
  "c5acef12-3863-4bdd-8f00-7c749034ccc9": {
    "alias": "044",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-44",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-44/large",
    "variant_id": "78e8e704-0d06-4509-a64e-7b013744e1b5",
    "finish": "normal",
    "current_native_label": "暗いフラフィ",
    "original_sha256": "83a50e039987ede7e268aeaeab136eef961bbdd8294c8977813776e62385d6f8",
    "metadata_sha256": "5c7a0c42bb03a959ed8095f35c0d571e1d095345051365608878b5a3763fa46a",
    "body_sha256": "7cda3bae40fc93d87203c01e77b8506a3311f2d05c69170ac6eba9f88867bded",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "4e24bb50e0023583c96174421fcd5359ca856c63083a810ef24643a560935d6c",
    "source_signature_sha256": "3fcf6a922ba639333a7a7d5f68d7e57c8a324c61c56a5a22f5c7e2274819e279",
    "provider_metadata_json_sha256": "7a2ef26761c223e70a7dfb7ff7466c5436a9543cd26332dc8a7d16b4f167839d",
    "historical_source_row_sha256": "5bed97f83f2ef063f3c494d77a8b0f21f51b3cb9b56afc866e06abb5aadcf383",
    "independent_selection_sha256": "1791695df86180cf71533e0201fa0ca726a55017c3a9dfeea7faf36d1c5a4461",
    "width": 569,
    "height": 800
  },
  "7f2a2b41-1e8a-4173-94db-85cff0db56de": {
    "alias": "045",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-45",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-45/large",
    "variant_id": "d7f9b7c5-65b5-4b19-9af2-d4672b2dcef5",
    "finish": "normal",
    "current_native_label": "ライトラントン",
    "original_sha256": "c9e0a75a0861099306bf82669e142c739f66923f8cd5fa525df8d78622fb097d",
    "metadata_sha256": "114280f2104645b8d04361817ec02fe247c2e0160fa0a3d4eb29da61a594b4a9",
    "body_sha256": "b96792a76638b97cb2afe640340dbbc4f70c2b3f98608aaeb48fe147bae2b13e",
    "discrepancies_canonical_sha256": "dd93cdddbc386abd7f184af86e7a1dee650e19b53af7b8e0443a69bab0acb3a6",
    "actual_signature_sha256": "3c5482f932beac8369b16bd91cb5ae51ce4c33237c56662daa6bbeeb6b6861eb",
    "source_signature_sha256": "22dbd51f949f13e3ce9cb25369cc445695e5b6930dbe6ca0593da057dbabcd58",
    "provider_metadata_json_sha256": "f3e80247f5a07d43bc1e947c6c554bb06b627e4259112789f6460d8ee3d9358f",
    "historical_source_row_sha256": "0e2d78117839d9b192f3beddfa8c44a881825a64279e25a69fc105efb899e547",
    "independent_selection_sha256": "2213ee536b31ef4bc97f8105e182a55a8e9a6787743c97fb3df86f7a443f60f3",
    "width": 569,
    "height": 800
  },
  "32681257-abbe-4aef-964c-61a029924e69": {
    "alias": "046",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-46",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-46/large",
    "variant_id": "9fb79a89-6286-4ea0-a948-538400dddd1f",
    "finish": "holo",
    "current_native_label": "暗いアンファロ",
    "original_sha256": "3efebdece976bbbe91fba90c5b436de5fb1d8c62892d3a75e651fbb3b1e86a8d",
    "metadata_sha256": "dbdd814a8bcd4c2901b7c7f4ebaa45af62444e4999bb171df0e40fddb5a96006",
    "body_sha256": "ffe7d67e0836f5f7a6b02ac0f4bf2c92ccf95e898a4dbb4905b80936882eef30",
    "discrepancies_canonical_sha256": "f5cf7e16d2a6255faec15b385072ac17de299f642aa7d8023cd8cba0bc4ee322",
    "actual_signature_sha256": "8a5a6ced0d6f36155040a679e53c5f2c3899d9a97465c7e7bc464345cad49bfc",
    "source_signature_sha256": "e2f71ba2e8733c1d77d8f207c95b329d9e664d38ec2c5fed4964101b3c169249",
    "provider_metadata_json_sha256": "385f023031494ec559f5defae4e0404a4984f1916cc87e18ce9b34c445a36626",
    "historical_source_row_sha256": "38ed630d4adec175a2ced74403d48709764fb782bf00477a12ef287a8aa1e815",
    "independent_selection_sha256": "787a0af9fc11a4cc52d5cc25a0276f3afa9c2542575df1b99e63c3a845bdf315",
    "width": 567,
    "height": 800
  },
  "e38914d3-de36-4bb9-b58d-17d854a747b0": {
    "alias": "048",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-48",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-48/large",
    "variant_id": "0f4b93f2-b589-405e-9b80-93fc4f681ac0",
    "finish": "normal",
    "current_native_label": "ガストリー",
    "original_sha256": "64f3723a88b19527b84f40cdc5d6bd8761d4bd26890859a3dc22e34f38418052",
    "metadata_sha256": "b736683173310d1b251b7d6b22756e9dc74f43ad372a60283d8cab5fd0c0dcea",
    "body_sha256": "f42ad821604e6535a5c8a097d8adee2f319be9eacce0cc3db64e8f07fa65f164",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "63d983bb9459d5ecb83daf4443d09bcd2739d35af75319706381e656501c356a",
    "source_signature_sha256": "f869d46da6074407af262ee67434a8c73e36b826741fae73e0528c2a55292f8b",
    "provider_metadata_json_sha256": "655deffe0598057528f45274d409b2454547d9381eed3af6b02713f502e99b85",
    "historical_source_row_sha256": "7923713293968a58855a0db58d2fcab8af59b0eb1f9068c03f1875da6623614f",
    "independent_selection_sha256": "7d1637b801ad9af677aba99eefc9e9ced0f0e6f71e2cf652830401910d56ac2d",
    "width": 570,
    "height": 799
  },
  "02231ac2-7cc3-48e8-b8d4-51632a695c1a": {
    "alias": "049",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-49",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-49/large",
    "variant_id": "f05e5230-27c1-4f0e-a4a6-72def8644981",
    "finish": "normal",
    "current_native_label": "exeggcute",
    "original_sha256": "c2337b9b054bb42f7fb7b7ce09cf50cb24375ab9a7df901e98ecf0a3a84c4301",
    "metadata_sha256": "aebf968614bc66cc12c88dc04188af0314fa55f79d5bdd84404518fdd64509fd",
    "body_sha256": "8dc232b5aeef21067863eff8c424febc70ca82e7faf8fac8dc0a7335262465ef",
    "discrepancies_canonical_sha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    "actual_signature_sha256": "a8587155fed9dc90cdcd097cf1fb9219d4b0193afa9675e680e767251fb13246",
    "source_signature_sha256": "42d4294d96de158c23bea0a039c8638e8ee83361629c8c342cbdaa04d21e9089",
    "provider_metadata_json_sha256": "eb6dddcdcfcef6193b2a459fdaccac41cfee2640e6365888dc4840e299737850",
    "historical_source_row_sha256": "3f2a7b80cb8f44d6129afe228f4fc4fe76591efd92774aea810b04f65adef1c8",
    "independent_selection_sha256": "de9fad29f80839b15fa48b97ff3bc46962031dc58c4cb04ffc0c85417b68a803",
    "width": 565,
    "height": 800
  },
  "410de32c-925f-449e-8318-4ab754d730a1": {
    "alias": "050",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-50",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-50/large",
    "variant_id": "8534f880-506f-465a-ad8a-334ff7b11712",
    "finish": "normal",
    "current_native_label": "l",
    "original_sha256": "abcf46c5011e52fa23c7f7d82e40fc968714efbbc4ac0b23dc65e9afba2e417c",
    "metadata_sha256": "323d100459e21a1b35aef8cb6a33cdd37b8966e372e9639578645f9eb506bce3",
    "body_sha256": "807379abcccf9e7bf2fb997b2fd27952f702e502959b2999251eaf3e31578839",
    "discrepancies_canonical_sha256": "d2ee1779ecf9bd04071e6978fbc3ad5be57210459618e04ff492f1a01af45f20",
    "actual_signature_sha256": "bc8c3e59f6bc910df794ff164f85523b3ffcfd266492d4daa8a2328442e9ab98",
    "source_signature_sha256": "dcf00688d7d33adc41ec80b87123a34e6c2567803d6a3f0681f1c6a81907bb08",
    "provider_metadata_json_sha256": "5ada3eabfb82ca35bf8a24fc5ea7671d77b19c7e0a8f60f1f167d48ad4a81847",
    "historical_source_row_sha256": "5728f2dcfed047cd5ec07a39bd35c18583c15df3a32aa7b021349fb61424eb1f",
    "independent_selection_sha256": "745334728b143e67b163e847288d0c612b87b3639ad46655ca3ce39ca8344189",
    "width": 570,
    "height": 799
  },
  "c9967525-6d18-4be6-b2af-6c6cb621ff82": {
    "alias": "051",
    "batch_id": "JP-CARDS-014",
    "provider": "neo4_ja-51",
    "image_url": "https://images.scrydex.com/pokemon/neo4_ja-51/large",
    "variant_id": "120bbe2a-78e1-4fdf-b26d-3617cecf0b8d",
    "finish": "normal",
    "current_native_label": "s",
    "original_sha256": "47230de2c902d0d2d8ed1dce82d7bd77181291ad503900c748b3a080b6062409",
    "metadata_sha256": "0e5dc459ac22542d3f35b0578aa4b4bcee610e81558d23d51355d8f080e57ce7",
    "body_sha256": "07cec61c4b4637e1c51309c4fcaa6407d1d6d69b3cb6847cfeb5bbd727df31ce",
    "discrepancies_canonical_sha256": "95a5f50bb811e639216896003f977efc29d517f1209cfd0cd4d43a8e32cb9840",
    "actual_signature_sha256": "2e5207947f2aeff07bf298555c94e3e60d0a98c12c4d757fe798ad244bd3af90",
    "source_signature_sha256": "660b80c7c41ac642187e423ed721b9e4c902aafbdbec82a7bf9f6003d395eb65",
    "provider_metadata_json_sha256": "54374125f12ee3e5f1a52c25ae23143339421a7c15f0ead193ac53e8ff393da1",
    "historical_source_row_sha256": "3e509a795e76d608bcfb041bbabf2f9328b3d219e92897ee0858b51a7b233fe7",
    "independent_selection_sha256": "ccc25c72017f2cc4ac1c9fc90a0b0bfcbb7b65d15127144503b319e290723c09",
    "width": 565,
    "height": 800
  }
};
const deliveryScope = {
  "fixed_batch_ids": [
    "JP-CARDS-013",
    "JP-CARDS-014"
  ],
  "saved_batch_tasks": 50,
  "eligible_fronts": 47,
  "by_batch": {
    "JP-CARDS-013": {
      "verified": 23,
      "held": 2
    },
    "JP-CARDS-014": {
      "verified": 24,
      "held": 1
    }
  },
  "excluded_aliases": [
    "013",
    "025",
    "047"
  ],
  "excluded": [
    {
      "printingId": "2abd45f8-701b-4abf-9b0f-3187f9bc9ca3",
      "variantId": "f4a68868-34ec-4f04-834b-882734be2557",
      "canonicalCollectorAlias": "013",
      "currentFinish": "normal",
      "sourceVariants": [
        "holofoil"
      ],
      "original": null,
      "imageRequests": 0,
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision."
    },
    {
      "printingId": "e6be6557-f642-4261-975d-a400b4e895a5",
      "variantId": "270bf197-e85b-4e1a-931a-237f19900a3c",
      "canonicalCollectorAlias": "025",
      "currentFinish": "normal",
      "sourceVariants": [
        "holofoil"
      ],
      "original": null,
      "imageRequests": 0,
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision."
    },
    {
      "printingId": "9845653d-468c-47ed-9b99-252ff26a4efa",
      "variantId": "5b4ca223-86e6-411d-9dd9-4b663c0b1b28",
      "canonicalCollectorAlias": "047",
      "currentFinish": "normal",
      "sourceVariants": [
        "holofoil"
      ],
      "original": null,
      "imageRequests": 0,
      "reason": "Current normal finish conflicts with source holofoil metadata; outside finite capture decision."
    }
  ],
  "outside_fixed_cohort": [
    {
      "alias": "024",
      "reason": "Previously complete; explicitly outside this exact47 source/acquisition scope."
    }
  ],
  "whole_batch_completion_asserted": false
};

function knownFor(row) {
  const known = knownPrintings[row.printing_id];
  check(known && row.collector_number === known.alias && row.provider_id === known.provider && row.variant_ids.length === 1 && row.variant_ids[0] === known.variant_id && row.batch_id === known.batch_id, 'Unknown or relabelled Darkness printing');
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
  const actual = body.actual_pixel_signature;
  const pixels = body.actual_pixel_observations;
  const source = body.source_signature;
  check(evidence.source_metadata_sha256 === known.metadata_sha256 && row.objects[0].sha256 === known.original_sha256 && digest(Buffer.from(JSON.stringify(body))) === known.body_sha256, 'Pinned exact original/source/public-body changed');
  check(body.generic_other_rows_may_relax === false && body.provider_metadata_raw_html_sha256 === known.metadata_sha256 && body.provider_metadata_canonical_json_sha256 === known.provider_metadata_json_sha256 && canonicalHash(body.provider_metadata) === known.provider_metadata_json_sha256, 'Full raw provider JSON and raw HTML provenance changed');
  check(body.source_signature_sha256 === known.source_signature_sha256 && canonicalHash(source) === known.source_signature_sha256 && body.actual_pixel_signature_sha256 === known.actual_signature_sha256 && canonicalHash(actual) === known.actual_signature_sha256 && canonicalHash(body.provider_metadata_discrepancies) === known.discrepancies_canonical_sha256, 'Untouched source/actual signature or discrepancy changed');
  check(body.historical_source_handoff_row_canonical_json_sha256 === known.historical_source_row_sha256 && canonicalHash(body.independent_selection) === known.independent_selection_sha256 && body.current_acceptance.source_card_id === row.provider_id && body.current_acceptance.independently_accepted === true, 'Historical source record or independent current selection changed');
  check(actual.originalSha256 === known.original_sha256 && actual.actualLanguage === 'ja' && actual.nativeName === pixels.printedJapaneseNameObserved && actual.hp === pixels.hpObserved && actual.artist === pixels.artistObserved && actual.nationalDex === pixels.printedNationalDexNumberObserved && actual.retreat === pixels.retreatSymbolsObserved && actual.printedNumberIsNationalDex === true && actual.canonicalCollectorAliasIsNotPrintedNumber === true && isDeepStrictEqual(actual.abilities, pixels.abilitiesObserved) && isDeepStrictEqual(actual.rules, pixels.rulesObserved), 'Accepted actual body/identity witness changed');
  check(source.sourceCardId === row.provider_id && body.provider_metadata.id === row.provider_id && isDeepStrictEqual(actual.orderedAttacks.map(attack => attack.cost), source.orderedAttacks.map(attack => attack.normalisedCosts)) && isDeepStrictEqual(actual.orderedAttacks.map(attack => attack.damage), source.orderedAttacks.map(attack => attack.sourceDamage)), 'Ordered source/actual cost and damage bridge changed');
  const controls = body.queue_controls;
  check(controls.identity_controls.canonical_alias === known.alias && controls.identity_controls.current_native_label === row.card_native_name && controls.identity_controls.verified_printed_native_name === actual.nativeName && controls.identity_controls.printed_national_dex === actual.nationalDex && controls.source_qa.original_sha256 === known.original_sha256 && controls.source_qa.source_metadata_sha256 === known.metadata_sha256 && controls.source_qa.actual_pixel_signature_sha256 === known.actual_signature_sha256, 'Actual top-level Japanese queue projection changed');
  if (['008', '046', '050', '051'].includes(known.alias)) check(body.historical_association.capture_mode === 'quarantine_comparison_only' && body.independent_selection.comparisonResolution, 'Historical comparison requires exact independent resolution');
  if (['050', '051'].includes(known.alias)) check(body.historical_association.selected_source_card_id === null && actual.hp === 50 && Number(source.hp) === 40 && actual.rules[0].text.includes('4枚'), 'Historical null Unown selection and actual HP/header required');
  if (known.alias === '051') check(actual.form === 'S' && isDeepStrictEqual(actual.orderedAttacks[0].cost, ['Psychic', 'Colorless']) && actual.orderedAttacks[0].damage === '20' && actual.retreat === 1 && body.approved_actual_pixel_guard.includes('Psychic plus Colorless'), 'Current S guard must never inherit historical two-Psychic typo');
  if (known.alias === '050') check(actual.form === 'L' && actual.abilities[0].criticalNativeText.includes('相手の山札'), 'Actual L opponent-deck shuffle required');
  for (const key of ['copyrightOrDateLineVisible', 'copyrightYearInferred', 'editionStampVisible', 'editionOrDistributionCertified', 'materialFoilFinishCertified', 'actualSourcePixelsGeneratedOrUpscaled']) check(pixels[key] === false, `Unsupported physical/copyright claim: ${key}`);
  check(body.source_variant_support.currentFinishCode === known.finish && body.source_variant_support.physicalFinishVerified === false && body.physical_edition_verified === false && body.physical_finish_verified === false, 'Current metadata finish is not physical certification');
  check(evidence.artwork_scope === 'printing_front' && evidence.source_kind === 'third_party_original' && evidence.exact_finish_verified === false && evidence.physical_edition_verified === false && evidence.vendor_licence_verified === false && evidence.owner_business_decision.kind === DECISION && evidence.owner_business_decision.source_wide_approval === false && evidence.owner_business_decision.human_review_required === false, 'Finite exact artwork decision changed');
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
  check(new Set(rows.flatMap(row => row.variant_ids)).size === FRONTS && new Set(rows.map(row => row.objects[0].sha256)).size === FRONTS && indexObjects(rows).size === 188, 'Duplicate identity/original or changed object scope');
  for (const environment of ['production', 'staging']) {
    const cards = plan.binding_expectations[environment];
    check(cards.length === FRONTS && new Set(cards.map(card => card.variant_id)).size === FRONTS && isDeepStrictEqual(plan.scope_counts[environment], { printings: 47, variants: 47, names: 94, sets: 1 }), 'Scoped metadata count changed');
    for (const row of rows) {
      const card = cards.find(card => card.printing_id === row.printing_id);
      const known = knownFor(row);
      check(card && card.variant_id === row.variant_ids[0] && card.game_code === 'pokemon' && card.same_artwork_as_variant_id === null && card.variant_code === known.finish && card.finish_code === known.finish && card.catalogue_version_id === (environment === 'production' ? PRODUCTION_JA : STAGE_JA), 'Current singleton variant/finish/version changed');
      for (const field of ['printing_id', 'set_id', 'set_code', 'language_code', 'collector_number', 'card_native_name']) check(card[field] === row[field], `Current binding changed: ${field}`);
    }
    check(cards.filter(card => card.finish_code === 'normal').length === 41 && cards.filter(card => card.finish_code === 'holo').length === 6, 'Finish metadata counts changed');
  }
  for (const production of plan.binding_expectations.production) check(isDeepStrictEqual({ ...production, catalogue_version_id: STAGE_JA }, plan.binding_expectations.staging.find(card => card.variant_id === production.variant_id)), 'Only staging catalogue version may differ');
  assertNoConflictingFronts(rows);
  return rows;
}

export function validatePlan(bytes, table) {
  check(digest(bytes) === COHORT_SHA, 'Frozen Darkness plan changed');
  const plan = JSON.parse(bytes);
  check(plan.schemaVersion === 1 && plan.queue_id === QUEUE_ID && plan.source_manifest_sha256 === SOURCE_MANIFEST_SHA && plan.identity_table_sha256 === IDENTITY_TABLE_SHA && plan.saved_targets_sha256 === SAVED_TARGETS_SHA && isDeepStrictEqual(plan.source_evidence, SOURCE_EVIDENCE), 'Frozen exact source/subset evidence changed');
  check(ARCHIVE_ID > 0 && plan.archive.id === ARCHIVE_ID && plan.archive.sha256 === ARCHIVE_SHA && plan.archive.byte_size === ARCHIVE_BYTES && plan.archive.file_count === 192 && isDeepStrictEqual(plan.archive_metadata.map(entry => entry.file), METADATA_FILES), 'Exact immutable archive/metadata changed');
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
  check(ARCHIVE_ID > 0 && /^[a-f0-9]{64}$/u.test(COHORT_SHA) && FRONTS === 47, 'Exact accepted Darkness archive and final freeze required');
}

export async function loadFrozen() {
  requireFinalFreeze();
  const saved = validateSavedTargets(await readFile(new URL('./saved-targets.json', import.meta.url)));
  const table = validateIdentityTable(await readFile(new URL('./identity-table.json', import.meta.url)), saved);
  const plan = validatePlan(await readFile(new URL('./plan.json', import.meta.url)), table);
  const approval = validateApproval(await readFile(new URL('./approval.json', import.meta.url)));
  const receipt = { cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, fronts: FRONTS, derivative_references: 141, object_references: 188, unique_image_members: 188, decision_type: DECISION, vendor_licence_verified: false, source_wide_approval: false, artifacts: [{ id: ARCHIVE_ID, sha256: ARCHIVE_SHA, size_in_bytes: ARCHIVE_BYTES }] };
  return { plan, rows: plan.rows, approval, receipt, table, saved };
}
