// Finite independently accepted21; no generic source/body exceptions.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
const check = (value, message) => { if (!value) throw Error(message); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows = {
  "f6a9151d-3aa1-4f32-ab52-2e73316d7c4d": {
    "alias": "076",
    "category": "Trainer",
    "provider": "neo1_ja-76",
    "row": "6f20c78fd4fe06b23c6346d0aeab1be1f60589040440d3ff7d091dce16d5a2a6",
    "peer": "fd07328490e6ea9aa64e0cc1a530fd002316b24132a69d00123051f773143c5f",
    "publicPeer": "610b5ab63f5839448e301c9ee2fb254092afec0a524cf11f9c55a851a82aafdd",
    "original": "8b1720b3ac5d49dfef588d3757665947738e4d4f2236f8b759b33d402537d27a",
    "reference": "919a7f77ef595d89bd508c794000eb8ccd1836689d6d07c116479214028ed317",
    "actual": "3f97411becb91bad274e832932c19b405f98ed4668cf808d11cf308db13eeb36",
    "metadata": "259df169e637e723ee92ea658575ee0e8cbc2ec0473d630948513487c5c25e56",
    "source": "da410992fc35d3b7acd586660e81fba3e6a4e97555d897b44ca860c0e3b6e0f0",
    "identity": "da410992fc35d3b7acd586660e81fba3e6a4e97555d897b44ca860c0e3b6e0f0",
    "observations": "2a64e9d95e7c1b3bdceae9a48804be57a24d6511c28824d39d9a4a65079e7109",
    "publicObservations": "c40d280b129a1c14c523ffd7ceeb6a66716f6d1e2499f14e1bd9acd68f8f2e43",
    "parsedFile": "a3849b2fba57f8e071cb75645aae324f7108c43424d03e3e9a1464fb433d39aa",
    "fullCanonical": "9a8480d5d470c37efad6cf338745c174e48d6cffe0de841f76f8482004797c67",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-76/large"
  },
  "320b46c3-0fe0-4fb2-a2d2-3009e5ceff77": {
    "alias": "077",
    "category": "Trainer",
    "provider": "neo1_ja-77",
    "row": "cf0f54ab706699d079e7052c3ea6396b6288169293717d6160ffe7fc8e36fffa",
    "peer": "be892ac49e09548f939ba71aab2c3d449973c342af341a25e6e97874635a9171",
    "publicPeer": "a512801078e7c93fb0fba68c05101ca77b33a32d67de88659feb82d1853a86ff",
    "original": "88f7798a26302788df3a677365ced03a1a854e0f92c4803e51dea6a9e3fb2495",
    "reference": "35946cfde3b9636deb7158a4f271ea124b93203b58efa2a8df0ebed493779375",
    "actual": "d6093a468e74420f1e96e237e989f8da983979e4a20d8de7e2927de8797f02ee",
    "metadata": "a073ad96c090edb43694ea6807f040fe1d41cef6e245d0285815f6a3f112ff99",
    "source": "60bd970d288d4c287cb46e7a5e6ec1f9bd571902539c270b4a76d2d497d40baf",
    "identity": "60bd970d288d4c287cb46e7a5e6ec1f9bd571902539c270b4a76d2d497d40baf",
    "observations": "504a95fadefdc6eb11ffdacb0e747e866e69e0673fa7ce14823f2d4c51c4bc2d",
    "publicObservations": "fd9a498754f990d999038af4fa5638be7bd13c565e472093623709c0e91ef708",
    "parsedFile": "6453c717e0b63b2111843e301812234105ef20c6befbc1287110207bd3b633df",
    "fullCanonical": "fe2426e52e5e0cdec8463337c8076ef2773acfba2443dded1b2bc211566489ed",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-77/large"
  },
  "1f2168ef-df8d-4117-891f-777b6bfe0b44": {
    "alias": "078",
    "category": "Trainer",
    "provider": "neo1_ja-78",
    "row": "d7b61159edd211cca6e0d4131947d566793a841a843891f80ab646000a8b4949",
    "peer": "713f3dbba0cab9fd09b11837f264b40ce1147bdc9917b018c35090a6ac4a2110",
    "publicPeer": "2cd0fb46e58fa48d7d0727ecc1f76adfafb31b01e5430d502227bcf9a2cc2b42",
    "original": "c824ec6fa5a5014653569ebecad557a9261c728c77099eeba992bdaff1f55402",
    "reference": "abf7d1116a2d9651c7489acc33bfeefc4195d9d3fcf29229fa02b2db32ca9d01",
    "actual": "dcbc9bc2e80c37ab420db15e78cb265ad62cc0e6dd364527992f0558992643cd",
    "metadata": "f9c9126ff27e30a7765efffd6a3bf5d19492d2b299e14c07a6eb8bdb53051284",
    "source": "a38a1c1561224a363b53209fcd10b7b17f1973b87b53e3fd8f55cf1dd90f20c9",
    "identity": "a38a1c1561224a363b53209fcd10b7b17f1973b87b53e3fd8f55cf1dd90f20c9",
    "observations": "96f9be10819f0ad61303058cd9d9c643d26c5ae55d4cbd5b481822046e43a6bc",
    "publicObservations": "4a9ab23d9ec096ba00bdc769e472c4e635f7bc43e9dbb0748799017846cfabe4",
    "parsedFile": "5dea401afca13ef8566923cc9a0b0ad9ef06884198a57800062ff1b1690f24e9",
    "fullCanonical": "7110a9bb1b0522abc6c9f67bb0a80f4bd8105e4c014028c0ddc4a7ff5270214f",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-78/large"
  },
  "0f000159-0bf6-466b-bdc3-cd7b8593facc": {
    "alias": "079",
    "category": "Trainer",
    "provider": "neo1_ja-79",
    "row": "41e7b6844a61e6d03d3815974b29af625a2e890d3bba9770207a3bb0f25ebd59",
    "peer": "de70c513017dabf21a16aef1bda3f6e4059666550ba368fcd35de369b112556f",
    "publicPeer": "140fdb97763ac6692967550d242350daebf2829b6aa04643f5b8483b7b0d76fb",
    "original": "83b3fd407a7e93e8c280820b82a40e9f8386126083b2f71fc638dca1c582e3d5",
    "reference": "be9471c56da6963cf592940168446ccc78119839b4857a177a018852caf3fc8a",
    "actual": "5c42a39b3f50a734448e4ef5ceece3d70c6b5ab229592966908477d5484ca571",
    "metadata": "14170d1ee92c58446d9f02c8afbbff779e53ae2a3be32d48d28bec0d645b07b5",
    "source": "fcdf8af8eb25ad591028d7f9aace8764e6df55797c6fac967b794af23d9d404e",
    "identity": "fcdf8af8eb25ad591028d7f9aace8764e6df55797c6fac967b794af23d9d404e",
    "observations": "c1fdf03c843107eeb6445e7a9b69fddd70ef2554d71ce9ba865c2435f3f4591a",
    "publicObservations": "254dbc8b7abfa44c4a60d139a567a8620ee8593a0b29a22e84d591a4e96d37b3",
    "parsedFile": "6b6fe2da12794c8ebff2a30af20d1e8ca3fc2fbc4babead166fcaa88bb07398f",
    "fullCanonical": "2325c455aa929a17679ebe02f13ff487a34646b52ca191933d05185acf81b11e",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-79/large"
  },
  "b18b7060-9a5a-45d5-bfc2-e02646a7515e": {
    "alias": "080",
    "category": "Trainer",
    "provider": "neo1_ja-80",
    "row": "e489342202471e4907482823532f0ffa18f44e3bafd68bbab88e1293841a9599",
    "peer": "da3d2f95dc50304f4f53f22bdaec6963a233233cd7b85e60d025a6c53dc679b7",
    "publicPeer": "1da54e2ee13500f126b0e94273c27a31041717194702ff5ae5a960f8ade77730",
    "original": "23c2582093e63a0982c40b7c856f1be24b9749e7427f807987407636f8ed1f0e",
    "reference": "5d90d5a9fd40420f1002e3109fcf20706229b2b8a629a8c3ef729f72afa9552d",
    "actual": "f910f773b7c16cbe59e5ac479737553c702b412623e47240dec0be188cb6d7b9",
    "metadata": "f73639000fdf4e30eb6368667fc8f0cd965e7c31cfbd227b5d9aeddd8ec86420",
    "source": "7c3f0f1b40e075cc567c03ec5793a4bef9053a42b4660e132830b15a667615b1",
    "identity": "7c3f0f1b40e075cc567c03ec5793a4bef9053a42b4660e132830b15a667615b1",
    "observations": "58852472f94baabe463c89e61cf8e931f746421d62f13d7e54023f80566abffc",
    "publicObservations": "dbcd8802a4daf080853bf819ede30a59c038398bf3661f99cfcdc0dc989ef959",
    "parsedFile": "ea17cbfda7bda83b5427b1eb2d306e6573b9f84c04c4bbaae4c5368db3093ace",
    "fullCanonical": "261954ef54fb62fd86aa293ced7812cb2b2fb9f13cfea21674e88e882f3e4fc2",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-80/large"
  },
  "3f189403-dddb-4191-bb5c-35b776d51c48": {
    "alias": "081",
    "category": "Trainer",
    "provider": "neo1_ja-81",
    "row": "cefb175d9759efc35bc33a0c22fdd777fd2683efb7eb69464f41f03dec135269",
    "peer": "fd7cbab454b6e6b05f7f0e9ed8421181f2377e489287f6e19bf0c0cf00d2937d",
    "publicPeer": "3567895d23d4b71818b044733e29f5a3b0bcbcc5b14b2109044509f6f57d812c",
    "original": "ded2e9a1c262a3c174d3a7fe03525ab62545544b5aacbe908ab6400a3f0d9d25",
    "reference": "89991af8bf40b8065b1f65c4770ddcaf269697f0f871e2dd00f356e582ff516d",
    "actual": "db408045099ae348412a34fa00bcc3a7a0069d97d8c9be24493f49e4c313d0fc",
    "metadata": "5278ba94c99a162cd115f4a8505f247a3f0a195cc4a333a537b979a6444b9158",
    "source": "e638f1b59917d9740f5a21cd832d8013220874b02437094077536c9c6211e6f8",
    "identity": "e638f1b59917d9740f5a21cd832d8013220874b02437094077536c9c6211e6f8",
    "observations": "81a5ccf122ca5f6c92181537282440d93ac7b0ffbb8c0178cefb7b9a3192443f",
    "publicObservations": "d7af83326675e4029489a826b4681b2ff22541b817e480fcba517f6ba2347d0a",
    "parsedFile": "b8c73903e1c23a9010629ff1c820bc106f7d66e6e10ee52f752ec0884316a913",
    "fullCanonical": "a82071edb2d582857024dd5835a0f239f9219130411189fe46f24d209a2488db",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-81/large"
  },
  "e26afa98-1bdb-4e1a-841e-05a5028f9de1": {
    "alias": "082",
    "category": "Trainer",
    "provider": "neo1_ja-82",
    "row": "d266750151c3f25e6309d6c3737b7fde5f9c2df1e88a4a6e166e2b89fc99bcc5",
    "peer": "c1962527bc730e35d6a3a3b104ab60309b30fc3ff01251f938ab3ce792737324",
    "publicPeer": "1a65ee50776108290b77f4fad2df1b98291e7fba01210c51c05b70b66119a35b",
    "original": "8e29dbbe9506d7c2d6d1e690b570a32ab57e5a9c300f03a0965b2970c358c1c8",
    "reference": "bc519b113dac2207c7f53ac78bec48d3c86676e166af6f11de785f299f20108e",
    "actual": "3c295ab48dbd0b7e8ffd6827d62e156088794ef1ccaf30d2358dc4924d92b84e",
    "metadata": "a297c57e30444097136f9bede395eab4d212b66af1ed244f033429c8737249d3",
    "source": "44d4b96214c0260cb40a8f2161ff637bb4eed93d6798fb2dcc8b3761a07af4e7",
    "identity": "44d4b96214c0260cb40a8f2161ff637bb4eed93d6798fb2dcc8b3761a07af4e7",
    "observations": "d58f624d9d68d45e6c5e3870eb39f2dadf50bfc96008622c915d6fd37a09d16c",
    "publicObservations": "bc277af673e93fa02e154137c301ad2b25fe8e11c8b8933976d5c1cbeee3eb32",
    "parsedFile": "941c7beb771756e637bb8f75f3e5b23069c9cde80d21c658c237dfc5bf40f1fe",
    "fullCanonical": "738d9022dcea68a8ac48bbb551c89631f4c12297713dc5b5ac507157f733e1ec",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-82/large"
  },
  "6b63e8ca-61d8-461a-877c-151172f83146": {
    "alias": "083",
    "category": "Trainer",
    "provider": "neo1_ja-83",
    "row": "8929897522679dd93e3e92caa7a9ca9fc22d6898e161e684c2f1bece2f265c1b",
    "peer": "0d10d1ce68697183deb23b10298ccd2f6937565d09e764eced37984bf0f253ef",
    "publicPeer": "dc8b534f9ae3474492002dfacd155070d1e113fcb02c495c337d1b26de7754fd",
    "original": "1ba24f2e918d36fbf5684fee37dbea4f6933fda1c28c2abc3d9256bdf4e5933c",
    "reference": "e1e3c72bd31a85bafe7cd882e04fa30e70f8983e4846b579bc8ec32efc7418c9",
    "actual": "b3ba681f06e2788cba5f99c64f521447cc8ffce0b307bc0870b694c0859d5283",
    "metadata": "a6f110a34e331b61ebccb6759b2cad4e42b7013322152a501371c28c334e8970",
    "source": "9c4c1fcc3d8f7e8f653126d4d48d0090d78d5143a4db3563bed14638c32e7a77",
    "identity": "9c4c1fcc3d8f7e8f653126d4d48d0090d78d5143a4db3563bed14638c32e7a77",
    "observations": "b0f1e41e32add73e4e2f867c6ca01ec41a10b7453a9bfd620f54565281e56301",
    "publicObservations": "850f036cc90188e73375fdb3278a8d7f22183b7137f5d205e826b2c51e12f7bd",
    "parsedFile": "ce5f35e8dc7860e0735fe75586e5f0d184ab84c8e5f312c6f4e957ff532c75d8",
    "fullCanonical": "f7dac92e0efab9e14e4268cf236f80ea3c3b3fd699b8a7d6eb12d4ae2654e358",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-83/large"
  },
  "559eae55-5efd-40b6-b009-06be5f4f0098": {
    "alias": "084",
    "category": "Trainer",
    "provider": "neo1_ja-84",
    "row": "87f8e6de30f8004d3cd7d46a66dba1630ddbd8884715725526cab066953ac808",
    "peer": "59e2a8eb1c018ec0b0de94c8878b44ac6b63ff9c9c4e275ffd174f2a6d332170",
    "publicPeer": "b36175e823a75247d5d8938ce6c58c506c1a8654a755c82770c85d15f1ca3f90",
    "original": "47c3c04abc7856fd05439eba5046a04edee88e52eb03a3ce76d07cdefd55c48f",
    "reference": "d114a79ef34f84c6d83de6ffd033547b4e48a5847c360b688942121e10ecb2fa",
    "actual": "6f56e92cd50d0aa2f6e075ffa0e1cbd8d4f5af6570908639923d50a088967610",
    "metadata": "fadde8d33b2f95fc37e0a5d1e7297a7e0abadb826270ce96fdc9f2d181b88411",
    "source": "a5bc33a1ac689de27153e67fe1f6bc564e71dd2163fa3bbd76f22a7acf4b2823",
    "identity": "a5bc33a1ac689de27153e67fe1f6bc564e71dd2163fa3bbd76f22a7acf4b2823",
    "observations": "40976ee4f8f30d981eb6aefef5065d868130c612fe72902e2c1c720a3fffe639",
    "publicObservations": "4a3f7bb9c4966f6c2284a2b8bead860fad63f90c6327c3440d05f7ced87a1901",
    "parsedFile": "c2f9311a021df1f946a6aab72695137914602c12f3dd406ceddf6bfdd832152d",
    "fullCanonical": "369d59d16565d08d9c8bad8d898ac0eda24ef46846107492a0e53f9065e0d58b",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-84/large"
  },
  "dabf24bc-301c-4836-b2c8-c72b3f218029": {
    "alias": "085",
    "category": "Trainer",
    "provider": "neo1_ja-85",
    "row": "0945585ed96e4b031a277528ca9ad46df71eb95aaabaee137ed7d33425156207",
    "peer": "e6d1779bceddfabe51ec21fe1c9fc4a29307c89c298bdfc106c07760d3ba9ccf",
    "publicPeer": "69817b6e4ad7d5b5b007230909a90303f655b092897bfdcf0702d544f9544b66",
    "original": "c654d1776ecd42857e04446c69e5ae3305beb1148bc1dc39d4fb73a76046812c",
    "reference": "9e4d1083c913715db736032271512b498b316dd4fa76552db3cbb8f2f26c6d91",
    "actual": "df68c33b7e395d0a6cd462c50aec94c90dee63bc578320e85557f327acd113f0",
    "metadata": "3b0cb1b70e0fca31d9cc58e29f704bcfba05b0c945899c4111d371fac84a2ea5",
    "source": "3fbe32ee954ed58c382261532f17770616786c11da508563c027fbf4caac23de",
    "identity": "3fbe32ee954ed58c382261532f17770616786c11da508563c027fbf4caac23de",
    "observations": "e44cf6ab312060df493dea02ddda691fd8e45471f6e68cf03d88b6a8ab6d90f8",
    "publicObservations": "87560b18ded7237e6c1b7e206ba0441b608f070878899e62f61829f01e5cd42b",
    "parsedFile": "2215e338f5c2a377b224543859d75132685db3e4cf930c1a6c0d29b04c76b33a",
    "fullCanonical": "e2a89bb97c933e362ce138c9767bc44e15491d2ecb70b9916587cede2c252365",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-85/large"
  },
  "913471d6-7c94-4ec3-b3bd-066910afebf3": {
    "alias": "086",
    "category": "Trainer",
    "provider": "neo1_ja-86",
    "row": "730e398f00c8b53985bd5150c4608a7aadaae50ee077927206e28d7945f0fbbb",
    "peer": "fa8143e95a9289663d20bc4e63f86b0875456a1f6710e3b14bcd1f99712d4234",
    "publicPeer": "900f605b7c1d37ebb819dc3ffb35ee7d181e7e76ee5cc9833ab0767913bc1819",
    "original": "07c7229813781a0e8991b6400b3c5cd7eb075b0696f4fbe1d009460e93b3a7d2",
    "reference": "1c414256b413631429dfb24d718015ed96553b9d4b2226b17cf6b95ba8b58b8a",
    "actual": "99a29fc0eceddcd13ccc7f48a193649585e8877f714d54e9a462a4ea7c96d8e2",
    "metadata": "dba2de0164ad7b00f75d5c571a8ca7410d77705e38fac8c09cd70a340c1a4aed",
    "source": "7bfaee402a940603a8a6c627e0b41a96112eea565daf560fffc9011adbb3d0c5",
    "identity": "7bfaee402a940603a8a6c627e0b41a96112eea565daf560fffc9011adbb3d0c5",
    "observations": "43012584bd496183e4370d5aba31f3bcfca0c769f0e281d1b26d31c3b899f54b",
    "publicObservations": "7bd533676ba9fec2c87a6415c5893a8ddbb0598d281be71b5c3efbd744f3c88d",
    "parsedFile": "5bc99ecb9d209d3cbf1b546f7c489e9d8c79c87042280353aa7156cc82bf8362",
    "fullCanonical": "288e17458c8f5f0f4b7ad379d43abd5b915e23f439a99f3c587445c6f984c4e2",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-86/large"
  },
  "ea7f6a6e-10db-4ded-9221-db129a21c6b8": {
    "alias": "087",
    "category": "Trainer",
    "provider": "neo1_ja-87",
    "row": "d88c089d8851ee8c4e591e72d8b8e9cc8bb25c18657b4cd51bdeb4281b074b08",
    "peer": "c640f3361e6af30fbfb7ce7600fd2177cc604f4c32db5d344443eab7b6d8f563",
    "publicPeer": "2206c6dbb91202f91d42670fd2ede29fbeb34e292b7ce9232e22e246560c5897",
    "original": "6b48ace4bb3c8581ef06edfa38efdc549b2774f75820031878a546116cfa2fe8",
    "reference": "1d231e5e3cdd7f2522bf31180b04f0767d40a41bd81fa27156fc3d7231b0b8d4",
    "actual": "52a7d4c5c66f0efe29b56381b68835b75749e43e7388298d8cb8fd774aba6678",
    "metadata": "3a41fff533f1c0629a42b2adbd5f78968541600e747406eaddbd011320ac6eda",
    "source": "5f63be271272a6829e0923a39fcca8539195541e82529d4c0453db5fa4856ad2",
    "identity": "5f63be271272a6829e0923a39fcca8539195541e82529d4c0453db5fa4856ad2",
    "observations": "19ab198873b8e23c66d125a3e59f72ef8381742090cf2872ac25d3f2c1c9bab2",
    "publicObservations": "3b3e11c0c4ce4237fbed48dce8ba13a929cacc2ecb85b9be716756e9a4d1853b",
    "parsedFile": "db7c2b10604e31bc2adfb31b630d2d27e1da0e8bef5b6ac995c4c8ad6e94071a",
    "fullCanonical": "c4eb2952265a4f63e527202c14d5bda16c290fab625f0ee89ee6e23c8a9646b8",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-87/large"
  },
  "a071b7ae-3d85-4259-b58f-abaa0b30d666": {
    "alias": "088",
    "category": "Trainer",
    "provider": "neo1_ja-88",
    "row": "c226ff1f59df7fd17c82d37826817269a91af6716fb81d5c4407f16e9d1b352e",
    "peer": "02c3bf78f500012f28c0abbd1df5264166a9e67a218a634dbb9a91bedfd150dc",
    "publicPeer": "07d85db6f2e04be4c1016a2bd48edca279d1528e35fc39b7cab64421c2ee3fa9",
    "original": "26c320347b75881f4b6848f45a76d1a8b08d76752547fb8e639ffee33edb36c0",
    "reference": "d275017d91770edf8d573dcaf18e25f38a039175413b6624188fae393e32f805",
    "actual": "0288c8fc5f131b1b2f3b49dc79d96fb828e06f3727ad8892a7d0586487626eae",
    "metadata": "06ec7de9a51139e6bd2a100b81a261b007bb3e796f8170b03307afa7f6cee293",
    "source": "e8eb054f043a7fa3292b0af5e93a78664d6058ee6db6631d68d715fbf710ce6a",
    "identity": "e8eb054f043a7fa3292b0af5e93a78664d6058ee6db6631d68d715fbf710ce6a",
    "observations": "6afce4668de841958c16d2559f5e917f89a66e64dd22cd8bbab0941f1af2d15e",
    "publicObservations": "b6d972e700206178d9e05406aae3e614701d1d8c1deccd03e5bafe4e565eb625",
    "parsedFile": "e8f4de2ae95c36fbaac21cbe33dee0b09aff6e7ae21d56cb62d70be1b11b4753",
    "fullCanonical": "3e9eae0d2d72699bce07f1ff1a2dbe8f6f2a85388020d92b26d62a7137bd9e7a",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-88/large"
  },
  "80fe609b-0b7f-4c73-aa28-4e146a91880c": {
    "alias": "089",
    "category": "Trainer",
    "provider": "neo1_ja-89",
    "row": "bffce14339e494dfbf7a5913f7e238672bbcb14fc850df2a6fd1b21fcf54dde2",
    "peer": "9e02b1612edd2772fe0cc24f29f4a35b6792c1239b2822f1b35eb91d53995487",
    "publicPeer": "7cc72207dbb097393b555f36f0fe964a4116ec74b0e71340c3c8c4f0cd269d59",
    "original": "6819727b8d72775bd66c0f1f143ae93818011d0ede84070f706f442cc1bce137",
    "reference": "c2c5d27c53e603fad4c49b944320076bb914c1e5a87249d63ce1ee257c6c83d9",
    "actual": "5ca6f1d21711fc4f0fcb3736aa5fd5dcc4fb072e33fd0909cd9ba252abd0741f",
    "metadata": "f19d2b3bfda2397e43efc3da273e960bb679f5039932a1b582b897a55e58ef9c",
    "source": "f241f282aea6106fe9210291e47ff8127e5c7184c128c46670539f7945408de6",
    "identity": "f241f282aea6106fe9210291e47ff8127e5c7184c128c46670539f7945408de6",
    "observations": "2cb3f90ec75b45322a1f20957c2000da775bfe7d1821742b3f3fd64ab8883720",
    "publicObservations": "47ab97ce4bb608f1d81fb95eb8ec518a58cbb2051ce115fb24595d69003d24dc",
    "parsedFile": "050087711496e54e15c3ed25fc7045cd576c92b7a598163c3487d7283a5fcc75",
    "fullCanonical": "552b3dddfe58ba3b1f4d0313edf092bf862dbf7d3b5161b98f17c7de1b47851a",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-89/large"
  },
  "3bdfd2dd-68db-41c8-8f59-4f384abe40d1": {
    "alias": "090",
    "category": "Trainer",
    "provider": "neo1_ja-90",
    "row": "ed4112f00eb738dc30ef321925355c40d0f94ec7ed119cd8197d7a266fb45554",
    "peer": "8890ec5ca0268518e85a1203441d421ad7ed6d4bf19195590e4a130c42799745",
    "publicPeer": "ac29cec123a65a609c5c466589ce2c1699311cf4c6f8f6998131aa7faf4029f1",
    "original": "70c57ce57c50ddead255294f07adb3beafbfe336746c0b6a050d33830cf4be5a",
    "reference": "c45e3a97e813cdcc26b67090db17125992d4a6e95830af202abae88bc2b98603",
    "actual": "e1d54dd0e383c7b988b0ed6b697cac79a86de3168e7d69d482c6c3e57e32e2f1",
    "metadata": "e2c8a08bd91f04ace228cbb999fcd9218f61415c8845d91c19a9810e78deb545",
    "source": "6d46a7f8832637158c9fce85cf5ab6e158791cd2f01f200496c47d0d29fb7ec7",
    "identity": "6d46a7f8832637158c9fce85cf5ab6e158791cd2f01f200496c47d0d29fb7ec7",
    "observations": "288775f493303de457b543ad229053d61414ba7c2526bc0ca8d246b98c1844d5",
    "publicObservations": "7ada1766d26b93307a0a751ebf18138424bee42197216661d6edef8af1c2ee2c",
    "parsedFile": "53237cf03d375f2da508c52e058e92f9f02fa468e5b7b71148828655fb5bcd7b",
    "fullCanonical": "3aae40e408d8f553dccb9a2b2d06beee64719faee64b29aa29f875d887e4eaf8",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-90/large"
  },
  "40a02759-7075-4330-8189-0014f4ab56de": {
    "alias": "091",
    "category": "Trainer",
    "provider": "neo1_ja-91",
    "row": "d1e2a7fa5ae82e501f803a49b5d081eee30fe459d377a144f80838316853f0b0",
    "peer": "82b99f45953e20ff71ff04f0dd097f1ca2f17a784ad5e66811753159ec09db74",
    "publicPeer": "638ea273d1ceb7317e86d030151b39c0045ddeb1454be08f3ec4be44a3929e58",
    "original": "20b91a9aac2214b772ee9b917c29fd69c39057cd884f7f039124a3862e47bb0c",
    "reference": "6b559466deef73f92435190b2a1faf33110e36218c2b38f104d68056450a935e",
    "actual": "f585eccf755140759ae95a533fbcc66c23dd125bb3841ed3ea15385316fb70fa",
    "metadata": "6919f75b5cd554f6446188fdc5f3df63283bd18f16e9adc0309543c5c9f505bf",
    "source": "dcaa7f1f461b20f674e203099a2e5122298d1e14396a3a022e6c5dfe4b291f7f",
    "identity": "dcaa7f1f461b20f674e203099a2e5122298d1e14396a3a022e6c5dfe4b291f7f",
    "observations": "e2454669b70639ad3247a897f609db18f802a418d26339ec7c37360a74026dc7",
    "publicObservations": "0b3f4b4152b36e0cc51df330f2ae751a0a816b906f9e97e6868d86263732ff2e",
    "parsedFile": "9563fbd7a1a1d00cde8e6f0508b2e51e2528bdec15a4074a3135ea278a1fdd1e",
    "fullCanonical": "34a9e03f6ad6130ee22c9fdd91617497d2009afcb416b4e28c5a3c3cb9ce5484",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-91/large"
  },
  "fd57df1c-6369-4e10-94ad-9d644615049e": {
    "alias": "092",
    "category": "Trainer",
    "provider": "neo1_ja-92",
    "row": "aaf90b5a5c53ed6367fb323327000783fa5364c1a886055b9f34be93d901c30b",
    "peer": "fb1641daf3e55fe8abc1f62be91506c329c707b9688e40601771308da3e69f32",
    "publicPeer": "c870b5252a6f7f1062e3a8f1e504fe0a78a8580620705c81cf577aa22f904b46",
    "original": "2ae0358c310f26da7d4626be4c6e2d5469175718c15c9159e0badba9f9230af2",
    "reference": "17b9af742e3dfee12c76856f151fe9f97a2bcd46e299f34b126d26b06685bba1",
    "actual": "056058363b7be609eea2f931c6a2c4a73cddba2ce1e5105fd7f1d9b632245883",
    "metadata": "d8d1b856af97e7915ffb889d5d59d8e7eedb9d7c26b6a7a56153dca9e41884e5",
    "source": "85868fbaf9ffcf9728883c2dce38896fa13c301b0309c1f44f7cb042e2efe569",
    "identity": "85868fbaf9ffcf9728883c2dce38896fa13c301b0309c1f44f7cb042e2efe569",
    "observations": "863a2b57d15b3a300907a1d3506aca8e655bc4aa2a4f1bbfb6605b4a56291919",
    "publicObservations": "329be9bc04b2a8b483f03bc228e163cd590ce76bcdf15896170fe056e456828e",
    "parsedFile": "9775ea97eb8ae8821ccfeb790c31b3875ffa389dbc67a698de98bad71b3e2498",
    "fullCanonical": "5aad84cf225d8d79c4f8dd228c0045647ffc6175cc19b5915c7a678dec75bb62",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-92/large"
  },
  "97730ebb-67a6-4198-9b9c-fa9ec44356c7": {
    "alias": "093",
    "category": "Trainer",
    "provider": "neo1_ja-93",
    "row": "a83372992b67fe4a49eeb4c6ddbb7b7c2e442bcab8876c29eb170dc1116dd201",
    "peer": "764c301f6c847e2f951dced7468fc87d086e720bc14cc3ecf19828823a0d7ec7",
    "publicPeer": "dea511d8c761960a2d5c4a3c3ab4f76a4e6a43af82cb1a5646638b757d11edee",
    "original": "d57cd80d3c9ad3007edecd69a159d992b30145558b2b17cbbabd5a7ee34f6da4",
    "reference": "aa16e3acd10cece15151e216be004f9ebdad72b4ccf631028f0e04e08f998fc8",
    "actual": "231f039f321729273db8677c922c67d5bade8a5fd6531bfa33dc8f8ec4c7ec95",
    "metadata": "d969b537838c5708ef657bcc5b31ceb01fab1a6b6a526d4ebed859b0f4c1005b",
    "source": "913611ef67b733783ee58a3ee8dca88e75ce95b5ef3acbc2a66d78a6a8fd0319",
    "identity": "913611ef67b733783ee58a3ee8dca88e75ce95b5ef3acbc2a66d78a6a8fd0319",
    "observations": "ee1f28a1b90d9eca1ed09f906c45bcd0102d740d34ebe39ea6e7b872a6390b19",
    "publicObservations": "ac3c3fff4d5ce3c98f35d7f1d29a5980346ffc6025f2fc9f2499aa0bb776417d",
    "parsedFile": "a23a34c4e29964e23e67a59c3c66cd1063d926fb88fc9771e3ef22648166835e",
    "fullCanonical": "22a7f6ab487f6aaf7e01d98ee225a144298e3590560d055dfe9accd8e1baea54",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-93/large"
  },
  "b1ea5735-21f8-4e8f-8c8b-4931f44105e4": {
    "alias": "094",
    "category": "Energy",
    "provider": "neo1_ja-94",
    "row": "7ee9814a4bfdd5fa43827427aa15226f217bac28eb29b616b8ed50e707aa3ee9",
    "peer": "3448314d5d5d5d73706c6d9d286f8b6bc15bbffe976328c69c4f3e8a73c3aa23",
    "publicPeer": "9a38c276bd4ff3c08682b2d150df653787b0dcbd1b70d4618063eac06390ee43",
    "original": "4e42c47527231833914f6a5dbf002727c1bb5bcb55cfa6e756a141edbe868150",
    "reference": "77b556c8cda6ae39186b684499bad5cc7fd74e9fd0111640560d45668ee63a72",
    "actual": "6d0b5400583145492a5f213f24aae36c155f1186ab1bd88e6afe26069d8d6918",
    "metadata": "1234a18717aa53557e5884a16b1a23f82b4e3812d9dca4657d726ea028e9b1bf",
    "source": "0bc03ae8016c37aa98f73a1116476e2eb847c80592ec28cdb094451684d95f33",
    "identity": "0bc03ae8016c37aa98f73a1116476e2eb847c80592ec28cdb094451684d95f33",
    "observations": "511859983dd3f0099599198d98105aa44c822ca1ce143f82a19a937fa0801e59",
    "publicObservations": "645dcf9fe6a03ddcf59d126d332eeb8fab58c91cf215123eae50baef4879e23c",
    "parsedFile": "f20788261037c78ac050011bad410d8bbc9897729df426dac0b5b77c50f9bd22",
    "fullCanonical": "170bbbe706e5eb4d50bb74000b3496e552341d2b7871b7a07efa2374c54f848b",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-94/large"
  },
  "b1188cfd-978b-4240-aa7b-872265d12a87": {
    "alias": "095",
    "category": "Energy",
    "provider": "neo1_ja-95",
    "row": "acfdc96d27524551556fa298348db48563693a6109f438c06d5a474f15a1b4be",
    "peer": "e5de05b27848d3e9fc3ebff65e455fa0c2f0bf425c93f3d33cbffd0289f30796",
    "publicPeer": "f8a99700b523f7e082422a6a69205d95a49b6a02e479a85c0d26cf1a874112f8",
    "original": "42bde40e6cba1155f42548de32841d0945683a2a146d928dd0d07d0e54e217c0",
    "reference": "2bee759fa8b5906ec81fe5cdfe945db38bdd6b8496e1f6a8f8ed13470cb2a17c",
    "actual": "8dc7c92e0a296ba5c77d7a3a29862c1d6247b0085ecf753c1b119a43c8cd2680",
    "metadata": "a760bdbfad10808eeefcf1a9e058cd005b4438ec93d31b6fce8992af76372e09",
    "source": "6dab01e3d5128e44ba8a3af632c357ff1509e351ef97e407f7689625de6e4459",
    "identity": "6dab01e3d5128e44ba8a3af632c357ff1509e351ef97e407f7689625de6e4459",
    "observations": "b984430d2e025714c026621d66a9ee88bc2a3fd933d4e73cd42037a39a4cb012",
    "publicObservations": "3c319881f4552466d2caceca15bccab05a5e9df5ed40e449d2d009425b8a4831",
    "parsedFile": "4f5e0d25a93f8eaf49ef676a4ff58246d1274c139262a265d4ab0f6db4f9950c",
    "fullCanonical": "ac36797810588f21a6f46fa63ef745bf3d23175445d0f2d1a9f563d4a49a8a0b",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-95/large"
  },
  "bd3707fe-0f86-4175-930b-919c1da41850": {
    "alias": "096",
    "category": "Energy",
    "provider": "neo1_ja-96",
    "row": "28e728b1d023e69748dd652d671249bb7c6f8d023325202596fde83e02a8e271",
    "peer": "37f00940d2824b5a9148ee4792f76a46da6fe123c2a61fc3f136f7bb224d293a",
    "publicPeer": "998853f08d97ccd6b2f7cbab4ec7e828452b0a61c9a62b51e637c885fc1f8443",
    "original": "264a34d303a470a055d903a1355f959291ad96c5ca8af9bd3b79f1578d857737",
    "reference": "cab97aaedfaa106a4f77810957bfe7644a92f680b89d63c04bf52f5d9c1fe2f1",
    "actual": "386f4747d9e492da664ef98a334d522d4cd9d57942284c0718fdafe77847979c",
    "metadata": "9f952f896a22f911a51cce81d62b36337865758c8094eb89d6d7993faf8b6985",
    "source": "573bc437fe8b35ce4d0860d8fe9077bf1ee3d9cae5c3237c3bc901255d489c14",
    "identity": "573bc437fe8b35ce4d0860d8fe9077bf1ee3d9cae5c3237c3bc901255d489c14",
    "observations": "406e80aaf687c09fc6cf05c935eb2594dc06121ef2e45ff7ba2a79ce9c7ebc99",
    "publicObservations": "912da83a9672296213c7230034ba6efcb77c79b1ee5a94aa6a956bb902720629",
    "parsedFile": "df7ab84ea4a6c7fff1cf9ddf1d95ec7115412a70c07dac4f36646ff0a6c03b63",
    "fullCanonical": "e59d48e2417b22eacfdde2932a1e6997cf3b5ff63b75220b193b196dd8cdc25d",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-96/large"
  }
}; // Populated only from root's exact accepted21.
const privateKeys = new Set(['path', 'absolutePath', 'rawPath', 'receiptPath']);
const commercialKeys = new Set(['pricing', 'prices', 'marketplaces', 'pop_reports', 'provider_metadata', 'privateFullNativeCapturedMetadata']);
export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key, nested]) => {
    if (privateKeys.has(key) && typeof nested === 'string' && /^[A-Za-z]:[\\/]/u.test(nested)) return false;
    check(!commercialKeys.has(key), 'Private full/commercial provider data must stay offline');
    return true;
  }).map(([key, nested]) => [key, publicProjection(nested)]));
  check(typeof value !== 'string' || !/(?:^|\s)[A-Za-z]:[\\/]/u.test(value), 'Private local path in public projection');
  return value;
}
export const publicationBody = body => publicProjection(body);
export const peerPublicKeys = ['batchId', 'printingId', 'variantId', 'setId', 'setCode', 'languageCode', 'canonicalCollectorAlias', 'category', 'canonicalAliasIsNotPrintedCollectorNumber', 'currentNativeLabel', 'currentNativeLabelRetained', 'currentNativeLabelUsedForExactMatch', 'currentProductionBinding', 'currentStagingBinding', 'currentVariantCode', 'currentFinish', 'candidateSourceCardId', 'independentlySelectedSourceCardId', 'sourceProvider', 'selectedSourceCode', 'sourcePageUrl', 'sourceImageUrl', 'sourceRawHtmlSha256', 'sourceSignatureSha256', 'sourceFullCapturedJsonFileSha256', 'sourceFullCapturedJsonCanonicalSha256', 'sourceIdentityProjectionCanonicalJsonSha256', 'historicalCandidateRowCanonicalJsonSha256', 'historicalSelectedSourceCardId', 'historicalRootProposalRowCanonicalJsonSha256', 'historicalRootAcceptedCategory', 'historicalRootArtist', 'historicalRootArtwork', 'historicalPreparationApproved', 'historicalPublicationApproved', 'acceptedActualPixelSignature', 'acceptedActualPixelSignatureSha256', 'acceptedPixelObservations', 'acceptedPixelObservationsCanonicalJsonSha256', 'independentDirectObservation', 'referenceEvidence', 'sourceProviderDiscrepanciesRetained', 'qualityComparison', 'sourceVariantSupport', 'acceptedSourceImageProvider', 'referenceImagesForProduction', 'sourceSwitchApproved', 'exactArtworkSourceIdentityAccepted', 'eligibleSourceOriginal', 'sourceSelectionOnly', 'physicalEditionVerified', 'physicalFinishVerified', 'vendorLicenceVerified', 'underlyingCopyrightLicenceVerified', 'sourceWideApproval', 'preparationApproved', 'publicationApproved', 'catalogueEdits', 'liveWrites'];
export const projectPeer = row => publicProjection(Object.fromEntries(peerPublicKeys.map(key => [key, row[key]])));
export function knownSource(printing) { const known = expectedRows[printing]; check(known, 'Outside exact Neo1 final21'); return known; }

export function validateActual(actual, known) {
  check(canonicalHash(actual) === known.actual, 'Exact accepted actual category/native rules/artist/form changed');
  check(actual.languageCode === 'ja' && actual.category === known.category && actual.fullArtRulesCreditAreaAndFrameVisible === true && actual.sourceOriginalSha256 === known.original && actual.referenceOriginalSha256 === known.reference, 'Exact complete Japanese reference/source original witness required');
  for (const field of ['printedCollectorNumber', 'printedNationalDex', 'nationalDex', 'hp', 'pokemonStage', 'retreatCost']) check(actual[field] === null, `Unnumbered non-Pokemon borrowed field: ${field}`);
  check(actual.canonicalAliasIsPrintedNumber === false && actual.canonicalAliasIsNationalDex === false && actual.pokemonFieldsNotApplicable === true && same(actual.orderedAttacks, []), 'No borrowed Pokemon/Dex/printed collector identity');
  check(actual.nativeRulesTranscribedFromBothViewedFronts === true && actual.nativeRules.length > 0 && actual.nativeRulesText === actual.nativeRules.join('\n'), 'Whole accepted native rule body required');
  check(actual.rarityMark === null && actual.rarityReadCertain === false && actual.physicalEditionCertified === false && actual.physicalFinishCertified === false && actual.copyrightYear === null, 'Optical rarity/physical/year uncertainty must remain qualified');
  if (known.alias === '081') check(actual.artist === null && actual.artistReadCertain === false && actual.artistFullPrintedCredit === null && actual.artistVisibleCreditFragments.includes('/CR CG gangs') && actual.artistQualification, 'Only081 optically qualified null credit accepted');
  else check(actual.artistReadCertain === true && actual.artist && actual.artistFullPrintedCredit, 'Full accepted printed artist credit required');
  if (known.category === 'Energy') {
    check(['094', '095', '096'].includes(known.alias) && actual.printedHeader === 'ENERGY' && actual.printedSubtype === '特殊エネルギーカード' && actual.nativeRules.length === 3 && actual.energyProvided.units === 1, 'Exact dedicated Special Energy body required');
    const type = { '094': 'Darkness', '095': 'Metal', '096': 'Colorless' }[known.alias];
    check(actual.energyProvided.type === type && actual.toolCommonClausePresent === false && actual.stadiumCommonClausePresent === false, 'Energy form/colour/body changed');
  } else {
    check(known.category === 'Trainer' && actual.printedHeader === 'TRAINER' && actual.energyProvided === null, 'Positive Trainer header/body required, including092');
    if (actual.printedSubtype === 'ポケモンのどうぐ') check(actual.toolCommonClausePresent === true && actual.nativeRules.length >= 2, 'Whole Tool common clause required');
    if (actual.printedSubtype === 'スタジアムカード') check(actual.stadiumCommonClausePresent === true && actual.nativeRules.length >= 2, 'Whole Stadium common clause required');
    if (known.alias === '087') check(actual.nativeRulesText.includes('最大2枚') && !actual.nativeRulesText.includes('見せ'), 'Actual087 maximum2/no reveal rule required');
  }
}

export function validateSourceRow(raw, peer) {
  const known = knownSource(raw.printingId);
  check(canonicalHash(raw) === known.row && canonicalHash(peer) === known.peer, 'Pinned root positive projection or historical peer row changed');
  check(raw.rootFiniteSourceEligibilityAccepted === true && raw.exactArtworkSourceIdentityAccepted === true && raw.eligibleSourceOriginal === true && raw.selectedSourceCode === 'scrydex' && raw.independentlySelectedSourceCardId === known.provider, 'Root exact source acceptance required');
  check(raw.original.sha256 === known.original && canonicalHash(raw.sourceSignature) === known.source && canonicalHash(raw.sourceIdentityProjection) === known.identity && canonicalHash(raw.acceptedPixelObservations) === known.observations, 'Original/raw/source/body witness changed');
  validateActual(raw.acceptedActualPixelSignature, known);
  return known;
}

export function projectSourceBody(raw, peer, parsedCapture) {
  const known = validateSourceRow(raw, peer);
  check(parsedCapture.sha256 === known.parsedFile && parsedCapture.canonicalSha256 === known.fullCanonical, 'Private parsed file and historical canonical contracts changed');
  const selection = projectPeer(peer), pixels = publicProjection(raw.acceptedPixelObservations);
  return {
    contract: 'stackr-ja-neo1-final21-identity-v1', accepted_category: known.category,
    provider_metadata_identity_projection: raw.sourceIdentityProjection,
    provider_metadata_identity_projection_sha256: known.identity,
    provider_metadata_raw_html_sha256: known.metadata,
    provider_metadata_full_captured_json_file_sha256: known.parsedFile,
    provider_metadata_full_captured_json_canonical_sha256: known.fullCanonical,
    historical_standalone_captured_json_file_sha256: null,
    provider_capture_contract: 'Complete unmodified captured JSON saved privately from exact review JSON Pointer, independently checked against retained HTML. New pretty-LF standalone file bytes have their own SHA; raw HTML, sorted compact JSON canonical SHA and safe identity whitelist SHA are distinct. Full review/commercial fields remain offline.',
    source_signature: raw.sourceSignature, source_signature_sha256: known.source,
    actual_pixel_signature: raw.acceptedActualPixelSignature, actual_pixel_signature_sha256: known.actual,
    historical_association: { selected_source_card_id: raw.historicalSelectedSourceCardId, preparation_approved: raw.historicalPreparationApproved, publication_approved: raw.historicalPublicationApproved, root_category: raw.historicalRootAcceptedCategory, root_artist: raw.historicalRootArtist, root_artwork: raw.historicalRootArtwork, candidate_row_canonical_json_sha256: raw.historicalCandidateRowCanonicalJsonSha256, root_proposal_row_canonical_json_sha256: raw.historicalRootProposalRowCanonicalJsonSha256 },
    approved_projection_row_canonical_json_sha256: known.row,
    independent_selection_raw_canonical_json_sha256: known.peer,
    independent_selection_public_canonical_json_sha256: canonicalHash(selection), independent_selection: selection,
    independent_projection_contract: 'Explicit identity/current/source/signature/observations/reference/history/qualification whitelist; only named absolute private path fields stripped. Complete private peer row hash remains separate; historical null/false flags do not authorize preparation.',
    pixel_observations: pixels, pixel_observations_raw_canonical_json_sha256: known.observations, pixel_observations_public_canonical_json_sha256: canonicalHash(pixels),
    provider_discrepancies_retained: publicProjection(raw.sourceProviderDiscrepanciesRetained),
    current_acceptance: { independently_accepted: true, source_code: 'scrydex', source_card_id: known.provider, original_sha256: known.original, category: known.category },
    source_variant_support: publicProjection(raw.sourceVariantSupport),
    generic_other_rows_may_relax: false, vendor_licence_verified: false, sourcewide_approval: false, physical_edition_verified: false, physical_finish_verified: false,
  };
}

export function validatePublishedWitness(body, row) {
  const known = knownSource(row.printing_id);
  publicProjection(body);
  check(row.source_code === 'scrydex' && row.provider_id === known.provider && row.image_url === known.imageUrl && body.contract === 'stackr-ja-neo1-final21-identity-v1' && body.accepted_category === known.category, 'Exact source/category identity changed');
  check(body.approved_projection_row_canonical_json_sha256 === known.row && body.independent_selection_raw_canonical_json_sha256 === known.peer && body.independent_selection_public_canonical_json_sha256 === known.publicPeer && canonicalHash(body.independent_selection) === known.publicPeer, 'Raw/private versus public peer projection changed');
  check(body.provider_metadata_raw_html_sha256 === known.metadata && body.provider_metadata_full_captured_json_file_sha256 === known.parsedFile && body.provider_metadata_full_captured_json_canonical_sha256 === known.fullCanonical && body.historical_standalone_captured_json_file_sha256 === null, 'Distinct raw HTML/private parsed file/canonical provenance changed');
  check(body.provider_metadata_identity_projection_sha256 === known.identity && canonicalHash(body.provider_metadata_identity_projection) === known.identity && body.source_signature_sha256 === known.source && canonicalHash(body.source_signature) === known.source, 'Safe source identity projection changed');
  check(body.actual_pixel_signature_sha256 === known.actual && body.pixel_observations_raw_canonical_json_sha256 === known.observations && body.pixel_observations_public_canonical_json_sha256 === known.publicObservations && canonicalHash(body.pixel_observations) === known.publicObservations, 'Full actual/source/reference signature changed');
  validateActual(body.actual_pixel_signature, known);
  return known;
}

export function projectQueueControls(raw) {
  const known = knownSource(raw.printingId); validateActual(raw.acceptedActualPixelSignature, known);
  return {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: true, name_number_and_symbol_readable: false, name_and_set_symbol_readable: true, full_native_nonpokemon_body_verified: true, exact_art_reference_verified: true },
    identity_controls: { canonical_alias: raw.canonicalCollectorAlias, canonical_alias_is_internal_only: true, canonical_alias_is_not_printed_national_dex: true, printed_collector_number: null, printed_national_dex: null, pokemon_identity_asserted: false },
    source_qa: { actual_japanese_full_front_verified: true, actual_japanese_unnumbered_trainer_front_verified: known.category === 'Trainer', actual_japanese_unnumbered_energy_front_verified: known.category === 'Energy', original_sha256: known.original, actual_pixel_signature_sha256: known.actual, printed_number_and_national_dex_absent_verified: true },
  };
}
