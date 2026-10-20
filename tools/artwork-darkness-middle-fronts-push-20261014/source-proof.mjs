// Exact approved mixed Neo4 cohort. Historical and accepted witnesses are distinct.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expectedRows = {
  "052": {
    "printing_id": "462672f2-f544-435e-92f5-3a4388934462",
    "variant_id": "8d5ebbab-8389-4c25-bb86-310212e96744",
    "provider_id": "neo4_ja-52",
    "projection_row_sha256": "8d9dfd37faaaceb3dbbd6a1d925dadd7d0383b87a6c10af00440b7a181867472",
    "original_sha256": "e861f73981f12bb733db2ddd10c94175771930e931133639e640707826535fe3",
    "metadata_sha256": "0621b1c38bd5017e5812e65cf1b3d73eb18246bddea7603e234b0c0bd713b69f",
    "actual_sha256": "12358ab50aaf02f146c8e78aeddf2290cab6f1d7f309f049f67a1ea4db592c45"
  },
  "053": {
    "printing_id": "8e16b941-5157-4938-954e-208ccc12e12f",
    "variant_id": "d0ac6500-55bc-4ab8-9fe4-84c294b59437",
    "provider_id": "neo4_ja-53",
    "projection_row_sha256": "4d09ca3cffb4a06b86a0c8c107ab2587080ae81137f500c787c53dcef6dda0ed",
    "original_sha256": "b6fac23ad1ae83874f21afb0e856b83cb1e7f6f7ac1e260385e50cf22403186b",
    "metadata_sha256": "f9d5b922a3dcf293c416d95193631234825502d2470b823c314793c7f4ce1a12",
    "actual_sha256": "28e81815aec165e16c9a5f2e83341bd83a7b2c3191cac590b896e08c96d5f17f"
  },
  "054": {
    "printing_id": "2e75b01c-95b8-4af7-8047-b592f8f60c82",
    "variant_id": "e5b2d5c4-a86c-4c2d-bfbf-b2bebd075069",
    "provider_id": "neo4_ja-54",
    "projection_row_sha256": "cd677667333a6a84d729e72905761d589aaa7bdd78bd2af3ce22f3486acfd91f",
    "original_sha256": "30def4b80a37ef33ad671ed1e699539752c133b52ae807a59bb5f80a323a43df",
    "metadata_sha256": "dafff06398091f7669bb8c679bc3b574d85144f4e87a0ab1c817f40341eca34a",
    "actual_sha256": "3f02819327616171527787c27a16583565876db1b01205b713d2dc3d87735611"
  },
  "055": {
    "printing_id": "3ee006fb-4dec-4375-a63f-26dca95cfc91",
    "variant_id": "345b67fa-a8a4-4b10-9187-ee0bf91f02b3",
    "provider_id": "neo4_ja-55",
    "projection_row_sha256": "82ff0adda1caa6ff43684fc49427d69f2018daf70534650ef87a1a8bc05c083e",
    "original_sha256": "a9138f49295cd7b4593ccb3450d126dc9e22919149051e132f174de3691b1286",
    "metadata_sha256": "401fb363cacb7df1e520e41e9e1e05248e2fb64dfe5b3451bb627459003f7e73",
    "actual_sha256": "a2bb2a36e51973a42ad09db0b427078e48ab4c1310bf89a8608ebe4aba85a7e4"
  },
  "056": {
    "printing_id": "7f16590a-c0f2-4a2c-a507-7d9a16c48c18",
    "variant_id": "9f157f40-75fa-404e-9dcc-97be9284e56f",
    "provider_id": "neo4_ja-56",
    "projection_row_sha256": "7ca42843a29593fef7ee280b74cfea3cad9824e3bb010e4684c9c1af821539a6",
    "original_sha256": "021b407016bd73953df3d5246aebc93041c8bdad319db6f85eb6382b7efa4ec1",
    "metadata_sha256": "92cc0916dce3c1217b70a7e51e9d5a2e8b4821ee55983ba3267dc609197b3fb8",
    "actual_sha256": "84e79e368bf4ec19f3c8e5ba277fae99c1fd48d4a0c096e4e4752011501b8ffd"
  },
  "057": {
    "printing_id": "adb670cf-5d1c-49a0-8670-f2e374da9c01",
    "variant_id": "90da4d3a-57dc-43a1-8608-3037d29c78e5",
    "provider_id": "neo4_ja-57",
    "projection_row_sha256": "319475defeb6ce6e83193084d38c1a734f55d07bd918c27048beb42bf7e78591",
    "original_sha256": "5f9a26f7e55fb3aecf72213b62d33b37142e0db61c3341b7e71ed0abd5b6ccab",
    "metadata_sha256": "f73b348b110ff4ae0737a10d700f3c4c8dc1b4b43bf7993351c1ba372acdef51",
    "actual_sha256": "4dca086b20769e3e32cd81404220492dfe6015c1763a2241d0afa9626492dc09"
  },
  "058": {
    "printing_id": "35a270e9-9ac6-46bf-96cd-a48269efae97",
    "variant_id": "71416caa-0dad-4246-8594-ea150492f260",
    "provider_id": "neo4_ja-58",
    "projection_row_sha256": "04437eb4a72f0375ce09260357759d13e98a73083ddb31b4010fb6c4b9a6b22c",
    "original_sha256": "8fe80c1b6f060f35adcd9e915143e4b86f07ab263b987fbd76e3c74d6e462277",
    "metadata_sha256": "3c4fc9a8bdf13417f46e6386f81b12bd15e30ae20d6e8193e8bfdd1bd5f11630",
    "actual_sha256": "792e38961852d4b9cb3af61dbbee9c7689e28ac7c44017c958c6a294234356cc"
  },
  "059": {
    "printing_id": "9cb82cff-8a30-4d1f-abc0-090c5d827cf7",
    "variant_id": "c61bde9e-ca1c-46ee-9b2f-734da330ca77",
    "provider_id": "neo4_ja-59",
    "projection_row_sha256": "605ae75d1ab8abe84cfa459a0a7d92e0e81b14b9d9240966a8ba6bebdf74f182",
    "original_sha256": "ab6dec1c7bf79a21c32ea009193470f4a71b0910c35260c6ceff0b4eec721b1e",
    "metadata_sha256": "cc9a871fa418ac3763300e4245b94570395346c59c35a677444cbe2eaee5e713",
    "actual_sha256": "588bce9d30fe53fc9023d7d34b8952e40ed03f9de227de49a99201a6f650c05c"
  },
  "060": {
    "printing_id": "5d68e873-c3f1-4a4a-a500-3662e662ffb1",
    "variant_id": "9a8f7d32-e652-425f-9db2-398e50d3809f",
    "provider_id": "neo4_ja-60",
    "projection_row_sha256": "d86bd018bb05d8b94be88bc214a4e5e1858149bf7d299fe951c0400df3fa1aee",
    "original_sha256": "56a6f93555ba045d7d1b987ceabc5c4a6c5cfe9618b1faf553e684585ca39c4f",
    "metadata_sha256": "894212d8df2d1290160847944946b0d2225c127eb294b01e48445b1b24bb9dd1",
    "actual_sha256": "43757e15da711ddfa552161028e0904180543bd3ae101dc08e7f99690b248df5"
  },
  "061": {
    "printing_id": "80c5425c-2fa0-4a3c-b840-a073aa1ac76d",
    "variant_id": "90780bee-bd54-4f84-9329-af1924992890",
    "provider_id": "neo4_ja-61",
    "projection_row_sha256": "ece5c66db74190a547e7e4d0432cafaaf82ed9f1fd38b8ade285dfd2e76becbc",
    "original_sha256": "f06194912881c260f417e78883b58b30625871612e2b2519a57fe61f0810e072",
    "metadata_sha256": "52db76fdf0ec5930393fdf80993b4e024a10917591612605b0894261782e3618",
    "actual_sha256": "0a92c7f33f916a77fcb5924eec10b3e22aa02f90b89f9e48bc512bf41949a262"
  },
  "062": {
    "printing_id": "f51a919b-a2c8-4036-b22e-b7f33e951eef",
    "variant_id": "a842e390-788f-47b7-b8ce-c16982154506",
    "provider_id": "neo4_ja-62",
    "projection_row_sha256": "6d175b2d2b4f091d0941a13aaa149c36fd8c433e7b06261466d5f17ee579a260",
    "original_sha256": "edf362add148c5ea8b489580ce02f571ba4e488d3a6cdd7b61830daef1939c77",
    "metadata_sha256": "b2db2e1896c24378f15ca68f5cc79fd116778ada66007c14945fb5eba08204f2",
    "actual_sha256": "a6f75658f75c917b7919193a00462c94416e1372559a4c47fd5f88d1310dda8b"
  },
  "063": {
    "printing_id": "f1dbdd12-b561-46f9-a172-e3c61dde8ede",
    "variant_id": "c6faa1ac-6218-4f21-a462-4aba2a584b4a",
    "provider_id": "neo4_ja-63",
    "projection_row_sha256": "d432fde3a50617c502fdfed2e90d5a8479f3d9df1c5a38732e3ad5021ac6b3bb",
    "original_sha256": "d462537f45fbbc0811640502750eb0c6bb6c694ff49bddd01a846f8600400877",
    "metadata_sha256": "2a98618211d79e19bbd4a93385fc9225fe77ebacf6b53668b9396fdca0242bd1",
    "actual_sha256": "16b999387266ca38fbac49051074eaf1d34d1b095fd28676dfe40ab2c0f14bf1"
  },
  "064": {
    "printing_id": "a71aa134-7cee-475f-863c-54c0c37ed5b9",
    "variant_id": "236da421-5566-4094-b1c8-1e0e7873bceb",
    "provider_id": "neo4_ja-64",
    "projection_row_sha256": "8f594fd42c954191c3f80943905590e9f16af9c952124150f8eea386e4cb2f1b",
    "original_sha256": "d33bcddca45fb80a3febff687fcb146b9cf990da69c90dd8ed82b33a54cd5a96",
    "metadata_sha256": "170b042f97c8ef42226bbe4793eb7110ec4a3106428b0719d9592afc4536b0e1",
    "actual_sha256": "eda84fe86ff9917de61ea90114f0ea81ef623a4c94dcaaa8c35230b6eba47371"
  },
  "065": {
    "printing_id": "fd2bf54f-9150-4b44-a00a-bdd132c7c710",
    "variant_id": "77f384e8-4406-4336-aa8c-9e2136c906ce",
    "provider_id": "neo4_ja-65",
    "projection_row_sha256": "c81337925612f64fe41882047fba1f3de28f0239cc43a17a3ed69dc3bd94afe5",
    "original_sha256": "8131b99c17686b3dff52a01a89d2418acf0bebd7e953135a4d708f43bb0e8515",
    "metadata_sha256": "36a3e0bd30d2cfffbf2242b2b6d1f462c1a3a603962828a6a536239146a6d548",
    "actual_sha256": "324a4b6254b329efc442892cfb54f9436822c327d4da0bbd767af60dd72892be"
  },
  "066": {
    "printing_id": "1beb4bf9-9cde-4851-9804-ed9cce9f152e",
    "variant_id": "d2a21eed-92f3-4b40-ab4c-e61cb248d1b3",
    "provider_id": "neo4_ja-66",
    "projection_row_sha256": "f9e9bf2fc7c13dcf8d26ee21e6e300f5d4e3e895d60162c4ce03243c1fafbd0a",
    "original_sha256": "4503ecd70959c5bd4a54033788984881040d20d1baa2ded251daef9faff71602",
    "metadata_sha256": "91430103da5be4116fe45962f7fdff0c759a1dce879d38f0db94703c6830c0c6",
    "actual_sha256": "1b49df8d6be6d986d609d290a2e65e0850f18ff44973d659228a1d934737ef9f"
  },
  "067": {
    "printing_id": "e84ab0ae-ceb0-4211-8787-dc2708296a8f",
    "variant_id": "c7eaae14-3908-41b1-9d03-334eecbe3d2e",
    "provider_id": "neo4_ja-67",
    "projection_row_sha256": "ee4474f58f3e6fabae9f5e66820d799db6b546b12cd027d60ad8770c381c7388",
    "original_sha256": "b7bca750729d5805ba2589a5bee4faaab26b4e9785a773a8b3709d72724dfeb5",
    "metadata_sha256": "d4a73d5d89086ce4a22ba39ef3fa0da60030e1cfef90391351cfe8f0ef850764",
    "actual_sha256": "64defae15356977678cb998325d22d55243aaaaa3afce04f2ea34b5c6bc2a106"
  },
  "069": {
    "printing_id": "5f91ad11-0be9-46c2-b448-26e9d40c1f0c",
    "variant_id": "00180499-760f-4ca6-8fd9-e039393a0fe2",
    "provider_id": "neo4_ja-69",
    "projection_row_sha256": "50c77b2f0c68c2381975d0da6617a105512c057d82d072bc810287da454c167c",
    "original_sha256": "b93a7b0337a57369de564f8027a77a657fa5e52d5e6ec4461ce64b78aba55522",
    "metadata_sha256": "ced64f80f5f2fe6d7dba827ee2d4cbee24781326dc7aa7c5c72923328ec4f67b",
    "actual_sha256": "6664bb0390d4b6966812e08c38dfcfbf2812ce37262816eb90e8731c0283568e"
  },
  "070": {
    "printing_id": "c06efa9c-8b60-44b4-81cc-7ccff4497ece",
    "variant_id": "52a895a6-db10-412b-a085-50fffbe5e6fc",
    "provider_id": "neo4_ja-70",
    "projection_row_sha256": "7617c1b7d2ddd56286a7d485e56cfb783ba66ee7f4a5cea141095806ba55da88",
    "original_sha256": "2b05cffc84d0cad6e7d1129e906058737e6dbcb00881aa3a000707602ae7179e",
    "metadata_sha256": "7fd6c426201ed05d9718e62aca130ea9a3b4871acf08a912595c3dcc9a43d71d",
    "actual_sha256": "1b8d4ff3f817e2952101ab49659ce4aa2735712bd008acf80266fe53ac88d44f"
  },
  "071": {
    "printing_id": "02ff0c1f-868f-4d7a-9070-af28c644806c",
    "variant_id": "4170cbfb-c1ef-4ab3-a9a8-747850917fde",
    "provider_id": "neo4_ja-71",
    "projection_row_sha256": "be9a81910b8f9d965eaea5fa0c1bc32e319b7c8a227a9f026e392ea7c24068b1",
    "original_sha256": "31346923aa855c5358bc52b0b02266fc09349d9af003110261753eb48bc5568b",
    "metadata_sha256": "6b467f1270ab6c839dafc6d8f4d2adb2f7c614be581873b0c2dfff88a255e1d7",
    "actual_sha256": "3c36f20f1070b27a9614dcd6680e7d3d25c2782d746c0cdbf26503bd34b63e16"
  },
  "072": {
    "printing_id": "16db09e5-a45f-475e-808a-d6c6b9ee7ca0",
    "variant_id": "b233079d-dede-45b0-bc02-66846efd5d0f",
    "provider_id": "neo4_ja-72",
    "projection_row_sha256": "2f08ef440e412e9c57a56eae223266eeceb2a095ced2484ddc0986cae8c73187",
    "original_sha256": "f32fadca66db25631422d76792dc5261f9924e442978bc4eb049035716b253d3",
    "metadata_sha256": "8c0d8b0d50b9ebb6aa2a529ea875fa60818de58abcfbe814900b19deb564f42e",
    "actual_sha256": "92cdf62b5f72b6132a9713a8d4490e9b2e1e0abdfb5655db3395e4f96d323a10"
  },
  "073": {
    "printing_id": "3bf1dc02-e1af-4273-83e0-850640e41aef",
    "variant_id": "4ba023d7-8518-40c4-b661-6d8f3099dd7a",
    "provider_id": "neo4_ja-73",
    "projection_row_sha256": "f4627501f490fc38fd4fe46c74dc93567f67bec766458a4cc149184c6f179b81",
    "original_sha256": "db6c66643198c112b2508c578c11b1e182d51c484ee17e9626e2d7b2d54467a3",
    "metadata_sha256": "7c45b9166e0c5fdc6cd72673f8f1409d8603c71992cfde24d2247f6ec99b15ba",
    "actual_sha256": "59d5c9832668192d8f10a14affa172c2595e017b963420a24ad3f0cf93c54390"
  },
  "074": {
    "printing_id": "cb737d1c-773a-46d6-8c14-63d635ff66c2",
    "variant_id": "4705016b-3f1b-4cf5-a922-41ade8296b7a",
    "provider_id": "neo4_ja-74",
    "projection_row_sha256": "58d7058dab6b67098883ad581627f7674364f4cb7bdf98f0b70cce791275dc61",
    "original_sha256": "2efb9e2117750eb99053de35a303ddc9c26b5a147cf5ca687d70a73e1b5abc1c",
    "metadata_sha256": "8859c9376c7186e1bd44b22c70f1f44046857d4336438ebc9bfe884cb2797af8",
    "actual_sha256": "4c869791c0ad0dbd76ae4a8e155b28bab2b579711f4f2680279de2d9f31527e7"
  },
  "075": {
    "printing_id": "1f911717-7151-4f6e-8847-226e14168741",
    "variant_id": "d6a71723-dfd2-4de9-a7ad-07380a94c15e",
    "provider_id": "neo4_ja-75",
    "projection_row_sha256": "1bd17aba03d7041acf448834825123771e8be1a35fd507445d04a6b8770acbe8",
    "original_sha256": "3ae06e7def6ea1644cd995635b190cc616c9f484730930bf31295345b589bc9f",
    "metadata_sha256": "597a14436706d1eb7e65ba9b191e51dc164ea41fbeddc37b198459b19b6615aa",
    "actual_sha256": "f4d162e5dc6348fa8acee28eb7f3dae2e44b2671e2c60492f6a1b03540f13a55"
  },
  "076": {
    "printing_id": "98fbaf55-8394-46ed-8aa8-d45f53282ff8",
    "variant_id": "3d930c37-3bd4-4c31-bdb4-c62b691402a2",
    "provider_id": "neo4_ja-76",
    "projection_row_sha256": "3dc36207d9bcd9586bbea73f4c2b8046b6b2d6248f332cca09ae896a9ec0fc0d",
    "original_sha256": "44f50d911e94dde5503cd98d594cd70ca44ee31d088ec43dcca4b6940e25e372",
    "metadata_sha256": "e6b42269387aee8c53e40fcfdcd650b070e8a28f1dd2c94a4d168f910f4d53df",
    "actual_sha256": "b9c555de2577e21a7bccd975e2640f8933cb6d2778bf10a9d06772b6d1f39f6d"
  },
  "077": {
    "printing_id": "d4723085-ec9c-44af-ae8a-072d3ad18a73",
    "variant_id": "96c7d65e-5383-4120-ba08-7f31d19c7e00",
    "provider_id": "neo4_ja-77",
    "projection_row_sha256": "8a114a7a34dd802bfea104097dfabfb63d0f2ee6b0324f68f96a5cde5abea464",
    "original_sha256": "ceec12a398a7d0f39007034b07686c0d30192d2de910d20b7c5b33338f632355",
    "metadata_sha256": "c052a56bf94ba17cf33fa4d468d824d8cbae8ab1287472afbb00ddcc87ac316a",
    "actual_sha256": "00e1ec7f414832bee23135175c24257c48e472e865cd4feb9b0aea8da195d147"
  },
  "078": {
    "printing_id": "3e5331dd-6de8-4a88-8311-cad5b9c2fb98",
    "variant_id": "b5cf1c6f-1ee1-42b3-8171-a380285993f2",
    "provider_id": "neo4_ja-78",
    "projection_row_sha256": "05a95daed6c675c163ea765f485ae043d2ad822f81ec3938f6032d8024b777b4",
    "original_sha256": "480e4737229f4529fd742f7d4bd05eaebc60d8ebbb2b8c7f0d7754812245cd16",
    "metadata_sha256": "074088ba5725d811e06abe6a38bbb1cd3ffe97b3900a5ed3454460c96bd3b8da",
    "actual_sha256": "3706baf15530c7ed6db7e844a51e9e8f39204b5a0a77294b85f1cb1cc48efea9"
  },
  "079": {
    "printing_id": "6b4eb085-272d-49b1-9637-23902f4db60d",
    "variant_id": "d2dae672-59c0-44e6-b61a-32a7a3512a2d",
    "provider_id": "neo4_ja-79",
    "projection_row_sha256": "f8513ce39a14eebc28d31059e93faf4fb923d8ba44044dada35dee42d832ee58",
    "original_sha256": "e689a994b6d7dd65889e49c1501cd65ff374192c4d1b9dbfca3cf2e714a6d544",
    "metadata_sha256": "8ab3c8e4ba3a1a2fd7fe598463d953fc701eb7f55366d949b8147a029c7b8684",
    "actual_sha256": "c3447df58edecea53a0c03c06e885eca72753f8e66e2f6230c4cb4108f21c8ff"
  },
  "081": {
    "printing_id": "5601f9cb-980a-4d76-bbbd-88ff23ee8ec9",
    "variant_id": "4917e3d9-9122-4a07-89dc-6819409dffa1",
    "provider_id": "neo4_ja-81",
    "projection_row_sha256": "ccc296dac182f2663d17d6d50bc934c13836bc377688787ac38a7ad65990b89d",
    "original_sha256": "da738baa2e863109e866568296a1f96646fc1edecd830cc7b8108653c34b3de0",
    "metadata_sha256": "ed61a16e6e5cafaf1fa103aa5e74205b787882ae428746492d31005502cecd72",
    "actual_sha256": "0c96180f6a5221819dc08e1f77c579f0113cf5ac931db640145cc3fd528f4bd8"
  },
  "083": {
    "printing_id": "235190f9-9e87-4f98-8e23-078f57627b5a",
    "variant_id": "42a45bf9-6bfe-4c54-8965-566b8ead6ba8",
    "provider_id": "neo4_ja-83",
    "projection_row_sha256": "b8782fca831824baedadef8b4b44902299e6093632b7732bca5f40a5908d033b",
    "original_sha256": "67e553b2e59c77b662b9115456dd75e635eb14c676004d8f86d132d9910a33ae",
    "metadata_sha256": "1d87f4f34664aed4fbd408a0a9ed6835b2055897d7167cd34a33bae3d34f3e1f",
    "actual_sha256": "718a5e8542820c0346f737e30d2ba72c879f22a0603d3fae61205ee9d6970497"
  },
  "085": {
    "printing_id": "f2978a3c-ad67-4e5b-bea9-a3546887e5c9",
    "variant_id": "b44cd1f9-fcff-4f6e-adc2-286e78e2dd70",
    "provider_id": "neo4_ja-85",
    "projection_row_sha256": "69fa1dedc546ee89487fe32c8afc4f80b478c092463e848fc822a5f561c3bcf0",
    "original_sha256": "880c790371fef0863d0572f59335d7532b41dc8b0ffb21f709c8cf45e017e3e9",
    "metadata_sha256": "38f70e9720df417f9fc5ddf231dd29cc3f1aadb8dc5e07e501bb6e4e1e7820fa",
    "actual_sha256": "56b42a92899b31e456923f1bfc8156e13f10bc3a9aa27a0ed75c09db2b8fffba"
  },
  "086": {
    "printing_id": "8e35f2a3-1a90-45c3-8766-bca908ce7bdb",
    "variant_id": "8785a065-b4d4-479b-9aa1-d85a9128ed02",
    "provider_id": "neo4_ja-86",
    "projection_row_sha256": "bc8d84a7e0c0358f83cdb8d5b83e9f4a750945eddabf18c26eb527ee706a20cf",
    "original_sha256": "83ece69a8003fda16d7df5ef8b2c18323370f65ca734ca189721181d96f90d7b",
    "metadata_sha256": "a0d46b1cb5141715ba75b3aa65e0cc9759acb779c2c653814708fcb7a8783108",
    "actual_sha256": "feb2a61e7f8404819fc2526e5d72ae9c9e987c1891c3818625fa8b42157336d0"
  },
  "087": {
    "printing_id": "d04781e7-5e12-47cd-b670-795c18aa2ad4",
    "variant_id": "13302cdb-7485-4096-8224-8f3c770d8734",
    "provider_id": "neo4_ja-87",
    "projection_row_sha256": "0b8b8e1a3a351a8b403e77044531415964e203c42d28b697771b697fad962549",
    "original_sha256": "92def39c0b2d349e48edb7dfae33108bf222fa0287b7aec1d6056eb73e60505c",
    "metadata_sha256": "c5708d658a6b070e8d9d4750bccbc5875cc92dcb34075da0a44bdcc6f606b742",
    "actual_sha256": "9c2de939a946c07bfc216db97e26d1b027ac67c6179fa855db3b9f6a5116fa1c"
  },
  "088": {
    "printing_id": "cb5b2bca-d81e-4dd3-bb77-7485089c0366",
    "variant_id": "c0b75584-75a6-45f2-b761-348414b112e3",
    "provider_id": "neo4_ja-88",
    "projection_row_sha256": "afe00d9280e531401ff72fec7651e781138aee5d275387e4691961b69740d8df",
    "original_sha256": "2d84064f0bc7d7ce0fa967b23f1e5789c062bbcadb5bc8b731cc3e0a6a4a3ee7",
    "metadata_sha256": "aeb7ed60f53275b690b78b4439f225b9639fbe319395698c2bad5185e5a96126",
    "actual_sha256": "e39406c52c194de3a1e6a33fe0c7945a4d61b93af02757f9bf36efeea29995cc"
  },
  "089": {
    "printing_id": "f10aea3f-8848-4d1d-8ca4-9b442cff54d5",
    "variant_id": "c0b5ca3e-bbeb-491a-a58e-f6e98604feba",
    "provider_id": "neo4_ja-89",
    "projection_row_sha256": "6288068bfb1065a38d79ddf0a939553fea7671a877d70e4ade933b9ef2facafb",
    "original_sha256": "d54fb2ea2092917a941d06b2f67a3f05ad4e3a5191199984d659abbc2622cbcb",
    "metadata_sha256": "38415f7ca52bcadca2c8e322e902cb85d4c84077e0a4a3c0fdfd8b8a9889fca9",
    "actual_sha256": "9dc59ed76c6d5565b3541bdeaee66549b8759ff30b4bfe8b3bdfe393814b57b4"
  },
  "090": {
    "printing_id": "e09b03e5-6d2c-434f-9d1c-02349802641e",
    "variant_id": "d72085c4-6c4a-42f2-b306-f55fee035366",
    "provider_id": "neo4_ja-90",
    "projection_row_sha256": "c85adaf3d4f8fde4c642ce9190d9d1af05ab2edd414467451f041eab9d2d95d3",
    "original_sha256": "1dc72e140856aefacc6ae022eadfc39d3b1a53801b8cd557c1da8e859b3e0240",
    "metadata_sha256": "ee3058b732950d4368fb412f7d3dbbfc480522ed2e6d60de028b937c19790bf3",
    "actual_sha256": "73220c81c81b91f4bcee34516da9753031335d5d1e2230bcebca83eeebf798e4"
  },
  "091": {
    "printing_id": "b0e3b4a4-d025-4c7e-a849-97a107ee24f9",
    "variant_id": "10607154-e5f7-479d-aa00-ebda9176c42c",
    "provider_id": "neo4_ja-91",
    "projection_row_sha256": "0550037891d93f86756b5303117bc1527dd22278bc616a5eed7a77d04d0096d9",
    "original_sha256": "d59f811729976610a8739f5e0582525c403ed0780c95103a4b25fc9a47cb2a16",
    "metadata_sha256": "0bd34968835d875932686e136013f1ed534e65b5eb8335f68e30efaa9017aee7",
    "actual_sha256": "c87bc236f46caabe5ff5b70ae24cc81ff2c5075ac2e881ebb3268fa9529123d5"
  },
  "092": {
    "printing_id": "ec558d10-fab4-4d34-922c-3635a8e97e09",
    "variant_id": "3312f218-21b4-4576-8974-6ef266f5a55b",
    "provider_id": "neo4_ja-92",
    "projection_row_sha256": "1a177e1111fd8bf9a4aa4d977488cfd911bb282e4a7e9bacad9625864983cca1",
    "original_sha256": "4eef57a9904d2c47a1de9779866ae29e92a4a2017b2a0f107eff72670f9cde99",
    "metadata_sha256": "ae5c4a2837a7fa9ccaddae7f265293809fde7ee12affcec4e2ad9194c51b9ef0",
    "actual_sha256": "2a1d58d70d74a466abb3bcc6457de20d917f5e0ea4a19c66b27d7ab11f0e7f1f"
  },
  "093": {
    "printing_id": "9b9cb940-c924-44e8-9757-464904ccb4d1",
    "variant_id": "82884367-3e30-4120-8a28-dc02312191e1",
    "provider_id": "neo4_ja-93",
    "projection_row_sha256": "3cae76a18491b2a0144678887293544c460bd97c8b558d62bb0fac1626881805",
    "original_sha256": "0902de4526b3dd0814ecd037b6276ad2c04f31aa469bbe5beb3667bdabad1d25",
    "metadata_sha256": "2573613d2889b72c36c18e2fd352b294c5bfc31eaf558811ec1938240c158596",
    "actual_sha256": "7f7750cbf431e9e91bcf643527d9b0a3d8e125559fb4075659e3223ee84c2d0f"
  },
  "094": {
    "printing_id": "322a894a-2bde-4d8e-9af7-39328fd39108",
    "variant_id": "4c79fb2b-1c6d-48de-a63f-a91a181831ca",
    "provider_id": "neo4_ja-94",
    "projection_row_sha256": "8ee23c86008230c85edbe031fd979c8d2c7736ef638be27ef78444c9a2234b22",
    "original_sha256": "d488d13fe6c98b4371997824dde1312058ca4e86418bd6b6f12219699c41b2f8",
    "metadata_sha256": "f28e822879840a5f8ba56ac50448d564fe2f5db2660869e39be39c74efbf3004",
    "actual_sha256": "2258be436a5849bb5eda8046914c4b41cf3d661e86d9ccbb769419d7542781e4"
  },
  "095": {
    "printing_id": "66c78deb-b48f-4c38-b3fe-3caa693b220a",
    "variant_id": "4a897634-8e36-412c-aece-65f30da9168e",
    "provider_id": "neo4_ja-95",
    "projection_row_sha256": "8140e5d33f0600c5d47555712829a86aa0528e0c7db5023ee6b4be2e01599fc6",
    "original_sha256": "f4960f1ac03936eba0e4d1a3adc179b544484de3a1447949d8d954a63fc02510",
    "metadata_sha256": "7a8921ba2155298dd7736cf5c3beca75ab3e5137537dbd645b5a0381923a5a56",
    "actual_sha256": "c82b55fa49d78b3fbb14708a04859b22a1fe5f54521f0c9a7c331476a7be3546"
  },
  "096": {
    "printing_id": "33b1aa83-3fd7-44b4-ab6c-c27cdba89c2a",
    "variant_id": "139a9d0d-426c-4767-b168-018490c426c9",
    "provider_id": "neo4_ja-96",
    "projection_row_sha256": "4e4991ed3f9ddf99d8129606297737feca0ea5b87b981b4df7c9018bd2dee163",
    "original_sha256": "a2b1366ae45385180300e9317247da3b5686f0443e2af92d4149ad2e0399f5bd",
    "metadata_sha256": "bf3e579ad7f2bd36e3a2fcd973caba3abd976af77703076e576933a871074240",
    "actual_sha256": "f7f7cd6d32f48901b113ea1b1e9ffd3d48e5a6657f15c67bad39e7747c34b4a1"
  },
  "097": {
    "printing_id": "77d7edf5-3e6f-492f-8983-484fbc1be9b1",
    "variant_id": "8ad946af-9506-4646-a2e6-fbd4098e460d",
    "provider_id": "neo4_ja-97",
    "projection_row_sha256": "1dbe2f6c9c30f92f81943ca0398d31f13230195bd27793eaf69ff591d83329df",
    "original_sha256": "5abb62645e3ca7c42f9047c02e7da5a1dbf98f9030608c3a32b100e986a0d4a7",
    "metadata_sha256": "fc158a4dcb2ee201563230ce8b5150c0644008a46ddfb23cdd952f940b278d0e",
    "actual_sha256": "488808986f17b6d16b51da002494e7747629c78c517cf744d75974d80dfeae45"
  },
  "099": {
    "printing_id": "da4fefcb-00d3-465f-965d-325e0bc98d25",
    "variant_id": "0f76dacb-a82d-4876-b6c9-93cb53425f82",
    "provider_id": "neo4_ja-99",
    "projection_row_sha256": "06ebe284c0101020e2313ee7b88902a123cbc6621ba2dd6aa8114d71904a5ed5",
    "original_sha256": "a15ad4f1342048977818e72a83f2c17ea65803736908fde8162196f5acf7777a",
    "metadata_sha256": "19bd853ab7c56e782a8024b29eac226ea061522e05442ba0e687ec88c0e27166",
    "actual_sha256": "a33a004c009b5b6ebaa40c24eeeca013f7207192aec414c9bca739b9a9c5e285"
  },
  "100": {
    "printing_id": "c5413601-e5a9-4724-bcdd-aabaae49d0e6",
    "variant_id": "d3a1aaf5-6da9-4e42-91a1-8bec10862bc5",
    "provider_id": "neo4_ja-100",
    "projection_row_sha256": "6b25b90445fb9128ffb3f3074aab230ab2f3726cafea43c13536cb35031474dc",
    "original_sha256": "3ffb30dc5b80957615c167ac46fda81c4654c6faf029be70bfdf888df85b8437",
    "metadata_sha256": "6f99969dce68d87d94c32cec64200b2285ce8be9d73d248139ef6834a97640da",
    "actual_sha256": "bc1e9f2f2ba659ac1e3b9c5d5eac1ad2223d047989a71a5d1f45bd9124aa36fc"
  },
  "101": {
    "printing_id": "1445e2ba-a0e9-4e39-ae07-4a4326ba4ccd",
    "variant_id": "904a1dc6-3e3f-4ed0-9476-a105fb5bdda0",
    "provider_id": "neo4_ja-101",
    "projection_row_sha256": "f0d6ed4d6d6201f969ed44b38d368519a9aca4002b50faba7c32019083eba3e5",
    "original_sha256": "6d1700d12fb736f07a0b9350821fbc222d3b594cfb69a3a1e0420f85911dbc85",
    "metadata_sha256": "d68acfed00a713deb262841168efd2046f9c0424b308ce90fa982e575027df67",
    "actual_sha256": "e3e0ae18571dac74813f9c99c2b1e07062a0c24b7a247dc97ed9eeb37484f4c6"
  }
};
const trainers = ['099', '100', '101'];
const comparisons = ['057', '058', '063', '065', '085', '088', '095'];

export function publicProjection(value) {
  const visit = (item, location = '') => Array.isArray(item) ? item.map((entry, i) => visit(entry, `${location}[${i}]`)) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).filter(([key, entry]) => {
    if (['path', 'absolutePath'].includes(key) && typeof entry === 'string' && /^[A-Za-z]:[\\/]/u.test(entry)) return false;
    if (key === 'pricing') {
      check(location.endsWith('.tcgdexMetadataCapture.data') && same(entry, { cardmarket: null, tcgplayer: null }), 'Unexpected commercial reference data');
      return false;
    }
    return true;
  }).map(([key, entry]) => [key, visit(entry, `${location}.${key}`)])) : item;
  const projected = visit(value);
  check(!/"[A-Za-z]:[\\/]/u.test(JSON.stringify(projected)), 'Private local path in public mixed-cohort evidence');
  check(!/"(?:prices|marketplaces|pop_reports|pricing|provider_metadata)"\s*:/u.test(JSON.stringify(projected)), 'Commercial raw metadata must remain offline');
  return projected;
}

function validateAccepted(raw) {
  const alias = raw.canonicalCollectorAlias, actual = raw.actualPixelSignature, pixels = raw.pixelObservations;
  const selection = raw.independentSelection;
  if (trainers.includes(alias)) {
    check(raw.acceptedCategory === 'Trainer' && actual.actualLanguageCode === 'ja' && actual.header === 'TRAINER' && actual.printedNumberIsNationalDex === false && actual.printedCollectorNumber === null && actual.printedDexNumber === null && actual.nationalDex === null && actual.hp === null && actual.stage === null && actual.retreatSymbols === null, 'Trainer must use the accepted number-free signature');
    check(actual.orderedAttackNames.length === 0 && actual.orderedAttackCosts.length === 0 && actual.orderedAttackDamage.length === 0 && actual.nativeRulesText.length > 20 && actual.artistReadCertain === true && actual.fullCardFrontVisible === true && actual.allFourOuterEdgesVisible === true && actual.setSymbolObserved === true, 'Complete unnumbered Trainer rules/frame/artist required');
    check(actual.nativeName === pixels.nativeTitle && actual.printedSubtype === pixels.subtype && actual.artist === pixels.artist && actual.nativeRulesText === pixels.body && pixels.language === 'ja' && pixels.fullFrame === true && pixels.printedNumberIsNationalDex === false && pixels.printedCollectorNumber === null && pixels.printedDexNumber === null && pixels.hp === null && pixels.pokemonStage === null && pixels.retreat === null && pixels.attacks.length === 0, 'Accepted Trainer observations diverged');
    const ref = selection.referenceEvidence, direct = selection.independentDirectObservation;
    check(ref.role === 'Identity comparison evidence only; not a production image source' && ref.completeNativeRules === actual.nativeRulesText && ref.actualJapaneseTitle === actual.nativeName && ref.actualArtist === actual.artist && ref.actualSubtype === actual.printedSubtype && ref.fullCardFrame === true && ref.setMarkVisible === true && direct.sourceReferenceExactWholeFrontMatch === true && direct.sourceSha256 === raw.original.sha256 && direct.referenceSha256 === ref.original.sha256, 'Exact independent Trainer body/art/reference bridge required');
    check(raw.historicalSelectedSourceCardId === null && raw.historicalActualPixelSignature.printedNumberIsNationalDex === true && actual.printedNumberIsNationalDex === false && selection.signatureCorrectionAccepted === true, 'Historical Trainer flag error must remain separate from accepted witness');
    if (alias === '101') check(actual.artist === 'Hideki Kazama', 'Exact actual101 artist required');
  } else {
    check(raw.acceptedCategory === 'Pokemon' && actual.actualLanguage === 'ja' && actual.printedNumberIsNationalDex === true && actual.canonicalCollectorAliasIsNotPrintedNumber === true && Number.isInteger(actual.nationalDex) && actual.nationalDex > 0 && actual.hp === pixels.hpObserved && actual.nativeName === pixels.printedJapaneseNameObserved && actual.nationalDex === pixels.printedNationalDexNumberObserved && actual.retreat === pixels.retreatSymbolsObserved && same(actual.abilities, pixels.abilitiesObserved) && same(actual.rules, pixels.rulesObserved), 'Accepted Pokemon identity/body witness changed');
    check(same(actual.orderedAttacks.map(attack => attack.cost), raw.sourceSignature.orderedAttacks.map(attack => attack.normalisedCosts)) && same(actual.orderedAttacks.map(attack => attack.damage), raw.sourceSignature.orderedAttacks.map(attack => attack.sourceDamage)) && same(actual.orderedAttacks.map(attack => attack.effect), pixels.bodyEffectFactsObserved), 'Ordered Pokemon cost/damage/body bridge changed');
    check(actual.fullCardFrameVisible === true && actual.allFourOuterEdgesVisible === true && actual.setSymbolVisible === true && pixels.wholeOriginalInspected === true && pixels.rulesOrAttackTextVisible === true, 'Complete actual Pokemon front required');
    if (alias === '086') check(actual.artist === null && actual.artistReadCertain === false && pixels.artistObserved === null && pixels.artistReadCertain === false && actual.sourceRecordedArtist === 'Hiromichi Sugiyama' && raw.actualArtistOpticalOverride.visiblePrintedCreditSuffix === 'CR CG gangs' && raw.actualArtistOpticalOverride.allOtherRowsMayRelax === false, 'Only exact086 may retain its qualified null artist');
    else check(actual.artist !== null && pixels.artistReadCertain === true && raw.actualArtistOpticalOverride === null, 'No unbound artist relaxation');
    if (actual.nationalDex === 201) check(actual.form && actual.form !== 'ordinary' && pixels.unownLetterObserved === actual.form && actual.abilities.length > 0 && actual.rules.some(rule => rule.includes('4枚')), 'Whole Unown glyph, distinct power and four-card header required');
    if (comparisons.includes(alias)) check(raw.historicalCaptureMode === 'quarantine_comparison_only' && selection.comparisonResolution, 'Semantic comparison requires exact independent acceptance');
  }
}

export function validateSourceRow(raw, historical) {
  const known = expectedRows[raw.canonicalCollectorAlias];
  check(known && canonicalHash(raw) === known.projection_row_sha256 && raw.printingId === known.printing_id && raw.variantId === known.variant_id && raw.selectedSourceCardId === known.provider_id && raw.approvedSourceCardId === known.provider_id, 'Outside exact approved mixed45 projection');
  check(raw.sourceIndependentlyAccepted === true && raw.eligibleSourceOriginal === true && raw.identityMatch.sourceIndependentlyAccepted === true && raw.holds.length === 0 && raw.canonicalSetCode === 'neo4' && raw.canonicalLanguageCode === 'ja' && raw.currentNativeLabelRetained === true && raw.currentNativeLabelUsedForMatch === false, 'Accepted source/current identity required');
  check(historical && canonicalHash(historical) === raw.historicalSourceHandoffRowCanonicalJsonSha256 && same(historical.actualPixelSignature, raw.historicalActualPixelSignature) && canonicalHash(raw.historicalActualPixelSignature) === raw.historicalActualPixelSignatureSha256 && same(historical.pixelObservations, raw.historicalPixelObservations) && historical.selectedSourceCardId === raw.historicalSelectedSourceCardId, 'Historical row must hash the original handoff record, not the new projection');
  check(canonicalHash(raw.sourceSignature) === raw.sourceSignatureSha256 && same(raw.sourceSignature, historical.sourceSignature) && canonicalHash(raw.sourceMetadataCapture.data.attacks) === raw.sourceAttackArraySha256 && canonicalHash(raw.actualPixelSignature) === known.actual_sha256 && raw.actualPixelSignatureSha256 === known.actual_sha256 && canonicalHash(raw.pixelObservations) === raw.acceptedPixelObservationsCanonicalJsonSha256 && canonicalHash(raw.independentSelection) === raw.independentSelectionRowCanonicalJsonSha256, 'Raw/source/accepted signature or selection changed');
  check(raw.original.sha256 === known.original_sha256 && raw.original.sha256 === historical.original.sha256 && raw.sourceMetadataHash === known.metadata_sha256 && raw.sourceMetadataCapture.sha256 === known.metadata_sha256 && raw.original.fullPILDecodePassed === true && raw.original.fullSharpDecodePassed === true && raw.original.sourceImageUnmodified === true && raw.original.generatedOrUpscaled === false && raw.original.minimumReadableSize === true && raw.original.hdThreshold720x1008 === false, 'Unmodified readable source bytes required');
  check(raw.sourceVariantSupport.currentFinishCode === raw.currentFinish && raw.sourceVariantSupport.supportsCurrentMetadataVariant === true && raw.sourceVariantSupport.physicalFinishVerified === false, 'Current metadata finish is not physical proof');
  for (const field of ['sourceLicenseIndependentlyVerified', 'sourceWideApproval', 'vendorLicenceVerified', 'physicalEditionVerified', 'physicalFinishVerified']) check(raw[field] === false, `Unsupported source claim: ${field}`);
  validateAccepted(raw);
  return raw;
}

export function projectQueueControls(raw) {
  const actual = raw.actualPixelSignature, pixels = raw.pixelObservations, trainer = raw.acceptedCategory === 'Trainer';
  const common = { canonical_alias: raw.canonicalCollectorAlias, current_native_label: raw.currentNativeLabel, verified_printed_native_name: actual.nativeName, current_native_label_not_used_for_match: true, accepted_category: raw.acceptedCategory };
  return trainer ? {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: pixels.fullFrame, name_and_set_symbol_readable: true, artist_read_certain: true, full_japanese_trainer_rules_read: true, printed_collector_number: null, printed_national_dex: null, printed_number_is_national_dex: false, physical_finish_verified: false, copyright_year_inferred: false },
    identity_controls: { ...common, canonical_alias_is_not_printed_number: true, printed_collector_number: null, printed_national_dex: null, printed_number_is_national_dex: false, pokemon_identity_asserted: false, trainer_full_body_art_reference_bridge_verified: true },
    source_qa: { actual_japanese_unnumbered_trainer_front_verified: true, complete_native_trainer_body_verified: true, independent_named_reference_and_source_front_match: true, reference_image_comparison_only: true, printed_number_and_national_dex_absent_verified: true, original_sha256: raw.original.sha256, source_metadata_sha256: raw.sourceMetadataHash, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256, independent_reference_sha256: raw.independentSelection.referenceEvidence.original.sha256, physical_finish_verified: false },
  } : {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: pixels.fullCardFrameVisible, name_number_and_symbol_readable: pixels.nameNumberAndSymbolReadable, artist_read_certain: pixels.artistReadCertain, artist_optical_qualification: raw.actualArtistOpticalOverride, copyright_or_date_line_visible: false, copyright_year_inferred: false, physical_finish_verified: false },
    identity_controls: { ...common, canonical_alias_is_not_printed_national_dex: true, printed_national_dex: actual.nationalDex, form_letter: pixels.unownLetterObserved },
    source_qa: { actual_japanese_full_front_verified: true, ordered_costs_and_damage_verified: true, all_provider_discrepancies_pixel_resolved: true, original_sha256: raw.original.sha256, source_metadata_sha256: raw.sourceMetadataHash, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256, physical_finish_verified: false },
  };
}

export function projectSourceBody(raw, historical, fullProvider) {
  validateSourceRow(raw, historical);
  check(same({ ...fullProvider, variants: fullProvider.variants.map(({ name, images }) => ({ name, images })) }, raw.sourceMetadataCapture.data), 'Complete captured provider identity projection changed');
  const selection = publicProjection(raw.independentSelection), pixels = publicProjection(raw.pixelObservations);
  return {
    accepted_category: raw.acceptedCategory,
    provider_metadata_identity_projection: raw.sourceMetadataCapture.data,
    provider_metadata_identity_projection_sha256: canonicalHash(raw.sourceMetadataCapture.data),
    provider_metadata_projection_contract: 'Unchanged derived identity projection from the pinned metadata50 packet; full provider JSON including commercial fields remains offline only.',
    provider_metadata_raw_html_sha256: raw.sourceMetadataHash,
    provider_metadata_full_captured_json_sha256: canonicalHash(fullProvider),
    source_signature: raw.sourceSignature, source_signature_sha256: raw.sourceSignatureSha256,
    source_attack_array_sha256: raw.sourceAttackArraySha256,
    actual_pixel_signature: raw.actualPixelSignature, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    actual_pixel_observations: pixels, accepted_observations_raw_canonical_json_sha256: canonicalHash(raw.pixelObservations),
    accepted_observations_public_canonical_json_sha256: canonicalHash(pixels),
    historical_source_handoff_row_canonical_json_sha256: canonicalHash(historical),
    approved_projection_row_canonical_json_sha256: canonicalHash(raw),
    historical_actual_pixel_signature: raw.historicalActualPixelSignature,
    historical_actual_pixel_signature_sha256: raw.historicalActualPixelSignatureSha256,
    historical_pixel_observations: publicProjection(raw.historicalPixelObservations),
    historical_association: { selected_source_card_id: raw.historicalSelectedSourceCardId, capture_mode: raw.historicalCaptureMode, holds: raw.historicalHolds, identity_match: raw.historicalIdentityMatch },
    historical_provider_metadata_discrepancies: historical.providerMetadataDiscrepancies,
    accepted_provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    independent_selection: selection,
    independent_selection_raw_canonical_json_sha256: canonicalHash(raw.independentSelection),
    independent_selection_public_canonical_json_sha256: canonicalHash(selection),
    public_projection_contract: 'Remove named local path fields and the three null tcgdexMetadataCapture.data.pricing fields from Trainer selections; raw/private and public projection hashes remain distinct.',
    current_acceptance: { source_card_id: raw.selectedSourceCardId, independently_accepted: true, category: raw.acceptedCategory },
    source_variant_support: raw.sourceVariantSupport, artist_optical_qualification: raw.actualArtistOpticalOverride,
    physical_edition_verified: false, physical_finish_verified: false, generic_other_rows_may_relax: false,
    queue_controls: projectQueueControls(raw),
  };
}

export const publicationBody = body => publicProjection(body);

export function validatePublishedWitness(body, row) {
  publicationBody(body);
  check(canonicalHash(body.actual_pixel_signature) === body.actual_pixel_signature_sha256 && canonicalHash(body.source_signature) === body.source_signature_sha256 && canonicalHash(body.historical_actual_pixel_signature) === body.historical_actual_pixel_signature_sha256, 'Accepted and historical signatures must retain distinct truthful hashes');
  check(canonicalHash(body.independent_selection) === body.independent_selection_public_canonical_json_sha256 && same(body.actual_pixel_signature, body.independent_selection.acceptedActualPixelSignature), 'Accepted public selection witness changed');
  const raw = {
    canonicalCollectorAlias: row.collector_number, currentNativeLabel: row.card_native_name,
    acceptedCategory: body.accepted_category, actualPixelSignature: body.actual_pixel_signature,
    actualPixelSignatureSha256: body.actual_pixel_signature_sha256,
    pixelObservations: body.actual_pixel_observations, sourceSignature: body.source_signature,
    sourceMetadataHash: row.evidence.source_metadata_sha256, original: { sha256: row.objects[0].sha256 },
    independentSelection: body.independent_selection, actualArtistOpticalOverride: body.artist_optical_qualification,
    historicalSelectedSourceCardId: body.historical_association.selected_source_card_id,
    historicalActualPixelSignature: body.historical_actual_pixel_signature,
    historicalCaptureMode: body.historical_association.capture_mode,
  };
  validateAccepted(raw);
  check(same(projectQueueControls(raw), body.queue_controls), 'Category-specific top-level queue controls changed');
  return body;
}
